#!/usr/bin/env node
// Builds a small, made-up Flashpoint install for trying the app and taking the
// README's screenshots: invented games with generated art, curated playlists,
// and one playable HTML5 game. Nothing in it comes from real games.
//
//   node scripts/demo/build-demo-data.mjs <dir>
//
// Needs the backend's dependencies (npm run install:all). Replaces <dir>'s
// database, images and playlists if they exist.
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { deflateSync } from 'node:zlib';

const here = dirname(new URL(import.meta.url).pathname);
const require = createRequire(join(here, '../../backend/package.json'));
const Database = require('better-sqlite3');

const out = process.argv[2];
if (!out) {
  console.error('usage: node scripts/demo/build-demo-data.mjs <dir>');
  process.exit(2);
}

// --- Images ------------------------------------------------------------------

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buf) {
  let c = 0xffffffff;
  for (const byte of buf) c = crcTable[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const head = Buffer.alloc(8);
  head.writeUInt32BE(data.length, 0);
  head.write(type, 4, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), data])), 0);
  return Buffer.concat([head, data, crc]);
}

class Canvas {
  constructor(width, height) {
    this.width = width;
    this.height = height;
    this.px = Buffer.alloc(width * height * 3);
  }
  set(x, y, [r, g, b], alpha = 1) {
    if (x < 0 || y < 0 || x >= this.width || y >= this.height) return;
    const i = (y * this.width + x) * 3;
    this.px[i] = this.px[i] * (1 - alpha) + r * alpha;
    this.px[i + 1] = this.px[i + 1] * (1 - alpha) + g * alpha;
    this.px[i + 2] = this.px[i + 2] * (1 - alpha) + b * alpha;
  }
  gradient(top, bottom) {
    for (let y = 0; y < this.height; y++) {
      const t = y / (this.height - 1);
      const color = top.map((c, i) => c + (bottom[i] - c) * t);
      for (let x = 0; x < this.width; x++) this.set(x, y, color);
    }
  }
  rect(x0, y0, w, h, color, alpha = 1) {
    [x0, y0, w, h] = [x0, y0, w, h].map(Math.round);
    for (let y = Math.max(0, y0); y < Math.min(this.height, y0 + h); y++)
      for (let x = Math.max(0, x0); x < Math.min(this.width, x0 + w); x++)
        this.set(x, y, color, alpha);
  }
  /** Fills the pixels inside(x, y) accepts, within a bounding box */
  shape(x0, y0, x1, y1, color, inside, alpha = 1) {
    for (let y = Math.floor(y0); y <= y1; y++)
      for (let x = Math.floor(x0); x <= x1; x++)
        if (inside(x + 0.5, y + 0.5)) this.set(x, y, color, alpha);
  }
  circle(cx, cy, r, color, alpha = 1) {
    this.shape(
      cx - r,
      cy - r,
      cx + r,
      cy + r,
      color,
      (x, y) => (x - cx) ** 2 + (y - cy) ** 2 <= r * r,
      alpha
    );
  }
  polygon(points, color, alpha = 1) {
    const xs = points.map((p) => p[0]);
    const ys = points.map((p) => p[1]);
    this.shape(
      Math.min(...xs),
      Math.min(...ys),
      Math.max(...xs),
      Math.max(...ys),
      color,
      (x, y) => {
        let inside = false;
        for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
          const [xi, yi] = points[i];
          const [xj, yj] = points[j];
          if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
        }
        return inside;
      },
      alpha
    );
  }
  png() {
    const raw = Buffer.alloc((this.width * 3 + 1) * this.height);
    for (let y = 0; y < this.height; y++) {
      this.px.copy(raw, y * (this.width * 3 + 1) + 1, y * this.width * 3, (y + 1) * this.width * 3);
    }
    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(this.width, 0);
    ihdr.writeUInt32BE(this.height, 4);
    ihdr[8] = 8; // bit depth
    ihdr[9] = 2; // truecolor
    return Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      chunk('IHDR', ihdr),
      chunk('IDAT', deflateSync(raw, { level: 9 })),
      chunk('IEND', Buffer.alloc(0)),
    ]);
  }
}

// A 5x7 pixel font, for titles on the generated art
const FONT = {
  A: ['01110', '10001', '10001', '11111', '10001', '10001', '10001'],
  B: ['11110', '10001', '10001', '11110', '10001', '10001', '11110'],
  C: ['01110', '10001', '10000', '10000', '10000', '10001', '01110'],
  D: ['11110', '10001', '10001', '10001', '10001', '10001', '11110'],
  E: ['11111', '10000', '10000', '11110', '10000', '10000', '11111'],
  F: ['11111', '10000', '10000', '11110', '10000', '10000', '10000'],
  G: ['01110', '10001', '10000', '10111', '10001', '10001', '01111'],
  H: ['10001', '10001', '10001', '11111', '10001', '10001', '10001'],
  I: ['01110', '00100', '00100', '00100', '00100', '00100', '01110'],
  J: ['00111', '00010', '00010', '00010', '00010', '10010', '01100'],
  K: ['10001', '10010', '10100', '11000', '10100', '10010', '10001'],
  L: ['10000', '10000', '10000', '10000', '10000', '10000', '11111'],
  M: ['10001', '11011', '10101', '10101', '10001', '10001', '10001'],
  N: ['10001', '10001', '11001', '10101', '10011', '10001', '10001'],
  O: ['01110', '10001', '10001', '10001', '10001', '10001', '01110'],
  P: ['11110', '10001', '10001', '11110', '10000', '10000', '10000'],
  Q: ['01110', '10001', '10001', '10001', '10101', '10010', '01101'],
  R: ['11110', '10001', '10001', '11110', '10100', '10010', '10001'],
  S: ['01111', '10000', '10000', '01110', '00001', '00001', '11110'],
  T: ['11111', '00100', '00100', '00100', '00100', '00100', '00100'],
  U: ['10001', '10001', '10001', '10001', '10001', '10001', '01110'],
  V: ['10001', '10001', '10001', '10001', '10001', '01010', '00100'],
  W: ['10001', '10001', '10001', '10101', '10101', '10101', '01010'],
  X: ['10001', '10001', '01010', '00100', '01010', '10001', '10001'],
  Y: ['10001', '10001', '01010', '00100', '00100', '00100', '00100'],
  Z: ['11111', '00001', '00010', '00100', '01000', '10000', '11111'],
  0: ['01110', '10001', '10011', '10101', '11001', '10001', '01110'],
  1: ['00100', '01100', '00100', '00100', '00100', '00100', '01110'],
  2: ['01110', '10001', '00001', '00010', '00100', '01000', '11111'],
  3: ['11111', '00010', '00100', '00010', '00001', '10001', '01110'],
  4: ['00010', '00110', '01010', '10010', '11111', '00010', '00010'],
  5: ['11111', '10000', '11110', '00001', '00001', '10001', '01110'],
  6: ['00110', '01000', '10000', '11110', '10001', '10001', '01110'],
  7: ['11111', '00001', '00010', '00100', '01000', '01000', '01000'],
  8: ['01110', '10001', '10001', '01110', '10001', '10001', '01110'],
  9: ['01110', '10001', '10001', '01111', '00001', '00010', '01100'],
  '-': ['00000', '00000', '00000', '11111', '00000', '00000', '00000'],
  '!': ['00100', '00100', '00100', '00100', '00100', '00000', '00100'],
  "'": ['00100', '00100', '01000', '00000', '00000', '00000', '00000'],
  ':': ['00000', '00100', '00100', '00000', '00100', '00100', '00000'],
  '.': ['00000', '00000', '00000', '00000', '00000', '01100', '01100'],
  ' ': ['00000', '00000', '00000', '00000', '00000', '00000', '00000'],
};

function textWidth(text, scale) {
  return text.length * 6 * scale - scale;
}
function drawText(canvas, text, x, y, scale, color, shadow = [20, 20, 30]) {
  [...text.toUpperCase()].forEach((ch, i) => {
    const glyph = FONT[ch] ?? FONT[' '];
    glyph.forEach((row, gy) => {
      [...row].forEach((bit, gx) => {
        if (bit !== '1') return;
        const px = x + (i * 6 + gx) * scale;
        const py = y + gy * scale;
        if (shadow) canvas.rect(px + scale, py + scale, scale, scale, shadow, 0.6);
        canvas.rect(px, py, scale, scale, color);
      });
    });
  });
}
/** Splits text into lines of at most max characters, at spaces */
function wrap(text, max) {
  const lines = [];
  for (const word of text.toUpperCase().split(' ')) {
    const last = lines[lines.length - 1];
    if (last !== undefined && (last + ' ' + word).length <= max)
      lines[lines.length - 1] += ' ' + word;
    else lines.push(word);
  }
  return lines;
}

function hsl(h, s, l) {
  const a = s * Math.min(l, 1 - l);
  const f = (n) => {
    const k = (n + h / 30) % 12;
    return Math.round(255 * (l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1))));
  };
  return [f(0), f(8), f(4)];
}

/** A seeded generator, so each game's art is the same on every build */
function random(seed) {
  let state = createHash('sha256').update(seed).digest().readUInt32LE(0);
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function star(cx, cy, outer, inner, points = 5) {
  return Array.from({ length: points * 2 }, (_, i) => {
    const r = i % 2 ? inner : outer;
    const a = (Math.PI * i) / points - Math.PI / 2;
    return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
  });
}

function ellipse(c, cx, cy, rx, ry, color) {
  c.shape(
    cx - rx,
    cy - ry,
    cx + rx,
    cy + ry,
    color,
    (x, y) => ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1
  );
}

/** Pixel Penguin Panic's penguin, standing at (x, y), s pixels to the unit */
function penguin(c, x, y, s) {
  ellipse(c, x, y - 26 * s, 22 * s, 28 * s, [17, 24, 39]);
  ellipse(c, x, y - 22 * s, 14 * s, 20 * s, [248, 250, 252]);
  c.rect(x - 9 * s, y - 46 * s, 7 * s, 7 * s, [255, 255, 255]);
  c.rect(x + 3 * s, y - 46 * s, 7 * s, 7 * s, [255, 255, 255]);
  c.rect(x - 6 * s, y - 44 * s, 3 * s, 4 * s, [0, 0, 0]);
  c.rect(x + 6 * s, y - 44 * s, 3 * s, 4 * s, [0, 0, 0]);
  c.rect(x - 5 * s, y - 36 * s, 10 * s, 5 * s, [245, 158, 11]);
  c.rect(x - 16 * s, y - 2 * s, 12 * s, 4 * s, [245, 158, 11]);
  c.rect(x + 4 * s, y - 2 * s, 12 * s, 4 * s, [245, 158, 11]);
}

function fish(c, x, y, s) {
  ellipse(c, x, y, 14 * s, 8 * s, [56, 189, 248]);
  c.polygon(
    [
      [x + 12 * s, y],
      [x + 22 * s, y - 8 * s],
      [x + 22 * s, y + 8 * s],
    ],
    [56, 189, 248]
  );
  c.rect(x - 8 * s, y - 3 * s, 3 * s, 3 * s, [0, 0, 0]);
}

function penguinScene(c, ground, s) {
  c.gradient([30, 58, 138], [125, 211, 252]);
  c.rect(0, ground, c.width, c.height - ground, [224, 242, 254]);
  for (let i = 0; i < 40; i++)
    c.rect((i * 97) % c.width, (i * 53) % Math.round(ground * 0.6), 2, 2, [255, 255, 255], 0.8);
}

function logo(game) {
  if (game.title === 'Pixel Penguin Panic') {
    const c = new Canvas(256, 256);
    penguinScene(c, 200, 2);
    fish(c, 60, 60, 2);
    fish(c, 196, 96, 2);
    penguin(c, 128, 196, 2.6);
    c.rect(0, 206, 256, 50, [10, 10, 20], 0.45);
    drawText(
      c,
      'PENGUIN',
      Math.round((256 - textWidth('PENGUIN', 4)) / 2),
      216,
      4,
      [255, 255, 255]
    );
    return c.png();
  }
  const rand = random(game.title);
  const hue = Math.floor(rand() * 360);
  const c = new Canvas(256, 256);
  c.gradient(hsl(hue, 0.7, 0.62), hsl((hue + 40) % 360, 0.65, 0.32));
  const accent = hsl((hue + 180) % 360, 0.85, 0.6);
  const kind = Math.floor(rand() * 4);
  if (kind === 0) c.circle(128, 96, 64, accent);
  if (kind === 1) c.polygon(star(128, 98, 74, 32), accent);
  if (kind === 2)
    c.polygon(
      [
        [128, 26],
        [206, 104],
        [128, 182],
        [50, 104],
      ],
      accent
    );
  if (kind === 3)
    for (let i = 0; i < 5; i++) c.rect(40 + i * 36, 40 + (i % 2) * 24, 28, 110, accent, 0.85);
  c.circle(128 - 40, 60, 18, [255, 255, 255], 0.25);

  const lines = wrap(game.title, 10);
  const scale = lines.some((line) => line.length > 8) ? 3 : 4;
  const top = 250 - lines.length * 8 * scale - 10;
  c.rect(0, top - 8, 256, 256 - top + 8, [10, 10, 20], 0.45);
  lines.forEach((line, i) => {
    drawText(
      c,
      line,
      Math.round((256 - textWidth(line, scale)) / 2),
      top + i * 8 * scale,
      scale,
      [255, 255, 255]
    );
  });
  return c.png();
}

function screenshot(game) {
  if (game.title === 'Pixel Penguin Panic') {
    const c = new Canvas(640, 480);
    penguinScene(c, 420, 1);
    for (const [x, y] of [
      [180, 140],
      [430, 230],
      [300, 330],
    ])
      fish(c, x, y, 1);
    c.circle(520, 300, 13, [100, 116, 139]);
    penguin(c, 300, 420, 1);
    drawText(c, 'SCORE 00120', 16, 16, 3, [255, 255, 255], null);
    drawText(
      c,
      'PIXEL PENGUIN PANIC',
      Math.round((640 - textWidth('PIXEL PENGUIN PANIC', 4)) / 2),
      70,
      4,
      [255, 255, 255],
      null
    );
    return c.png();
  }
  const rand = random(game.title + ' screenshot');
  const hue = Math.floor(rand() * 360);
  const c = new Canvas(640, 480);
  c.gradient(hsl(hue, 0.6, 0.75), hsl((hue + 30) % 360, 0.55, 0.45));
  c.circle(520, 90, 46, hsl((hue + 60) % 360, 0.9, 0.8));
  for (let i = 0; i < 3; i++) {
    const y = 330 + i * 30;
    const color = hsl((hue + 120 + i * 15) % 360, 0.45, 0.45 - i * 0.08);
    c.shape(0, y - 60, 639, 479, color, (x, py) => py > y + Math.sin(x / (60 + i * 25) + i) * 22);
  }
  for (let i = 0; i < 4; i++) {
    const x = 40 + Math.floor(rand() * 520);
    const y = 140 + Math.floor(rand() * 150);
    c.rect(x, y, 90, 14, hsl((hue + 200) % 360, 0.4, 0.3));
    for (let j = 0; j < 3; j++) c.circle(x + 18 + j * 27, y - 16, 7, [255, 214, 64]);
  }
  c.rect(300, 300, 34, 34, hsl((hue + 180) % 360, 0.85, 0.55));
  c.rect(308, 308, 6, 6, [255, 255, 255]);
  c.rect(320, 308, 6, 6, [255, 255, 255]);
  c.rect(0, 0, 640, 40, [10, 10, 20], 0.5);
  drawText(c, game.title, 14, 12, 2, [255, 255, 255]);
  drawText(c, 'SCORE 004200', 640 - 14 - textWidth('SCORE 004200', 2), 12, 2, [255, 230, 120]);
  return c.png();
}

function platformLogo(name) {
  const c = new Canvas(64, 64);
  const hue = name === 'HTML5' ? 18 : 355;
  c.gradient(hsl(hue, 0.8, 0.55), hsl(hue, 0.8, 0.4));
  const label = name === 'HTML5' ? 'H5' : name[0];
  drawText(c, label, Math.round((64 - textWidth(label, 4)) / 2), 18, 4, [255, 255, 255]);
  return c.png();
}

// --- Games -------------------------------------------------------------------

const STUDIOS = [
  'Lunchbreak Labs',
  'Pixel Pals',
  'Dial-Up Dreams',
  'Recess Studios',
  'Paperclip Games',
  'Snack Attack Software',
  'Homework Later',
  'Screensaver Society',
];

// Every game here is made up: these describe games that don't exist
const BLURBS = {
  Action: (t) =>
    `Dodge, dash and button-mash your way through ${t}. Three difficulty settings, a high score table, and a secret boss for anyone who finds all twelve keys.`,
  Adventure: (t) =>
    `A point-and-click adventure. ${t} has you poking at everything, combining odd items, and talking to anyone who will listen, until the mystery finally makes sense.`,
  Puzzle: (t) =>
    `${t} starts easy and gets devious. Forty levels, a level editor for making your own, and a hint button that only works three times, so use it wisely.`,
  Shooter: (t) =>
    `Fill the screen with lasers in ${t}. Collect power-ups, keep your combo going, and save a few bombs for the last wave, because you will need them.`,
  Platformer: (t) =>
    `Run, jump and double-jump through ${t}. Six worlds of moving platforms and bottomless pits, and every star you grab brings the bonus world a little closer.`,
  Sports: (t) =>
    `Pick your team and play a full season of ${t}, or jump straight into a quick match. Unlock new courts, kits and trick shots as you climb the league.`,
  Strategy: (t) =>
    `Plan ahead in ${t}: build, upgrade and outsmart each wave before it reaches your base. Twenty maps, three difficulty settings, and an endless mode for the brave.`,
  Driving: (t) =>
    `Floor it in ${t}. Twelve tracks, unlockable rides, shortcuts for the curious, and a ghost of your best lap to beat.`,
  'Escape the Room': (t) =>
    `You're locked in. Search every corner, crack the codes and find your way out of ${t}. Click everything: the answer is usually somewhere you already looked.`,
  'Dress Up': (t) =>
    `Mix and match hundreds of outfits in ${t}: hats, shoes, capes and more. Save your favorite look, or press shuffle and see what happens.`,
  Arcade: (t) =>
    `${t} is easy to learn and hard to put down. Every round gets a little faster, and there's always one more high score to beat. How long can you last?`,
  Toy: (t) =>
    `No goals, no score: ${t} is just for messing around. Click everything, turn every knob, and see what happens when you do it all at once.`,
  Animation: (t) =>
    `${t}: a short cartoon, about three minutes long, with a catchy song you won't get out of your head.`,
};

// [title, platform, genre, extra tags, release date (YYYY-MM-DD) or null]
const ARCADE = [
  ['Pixel Penguin Panic', 'HTML5', 'Arcade', ['Animals'], '2008-06-18'],
  ['Turbo Teacup 2', 'Flash', 'Driving', ['Comedy'], '2008-06-16'],
  ['Laser Llama', 'Flash', 'Shooter', ['Animals', 'Space'], '2008-06-17'],
  ['Sock Drawer Escape', 'Flash', 'Escape the Room', [], '2008-06-19'],
  ['Cloud Hopper', 'Flash', 'Platformer', [], '2008-06-20'],
  ['Toaster Tactics', 'Flash', 'Strategy', ['Comedy'], '2008-06-21'],
  ['Hamster Hoops', 'Flash', 'Sports', ['Animals'], '2008-06-22'],
  ['Bubble Wrap Bandit', 'Flash', 'Action', ['Comedy'], null],
  ['Moon Mower', 'Flash', 'Arcade', ['Space'], null],
  ['Captain Crunchbyte', 'Flash', 'Platformer', ['Robots'], null],
  ['Rocket Radish', 'Flash', 'Shooter', ['Space'], null],
  ['Dial-Up Dash', 'Flash', 'Platformer', [], null],
  ['Cardboard Castle Defense', 'Flash', 'Strategy', [], null],
  ['Snowball Sniper', 'Flash', 'Shooter', ['Winter'], null],
  ['Jelly Jump', 'HTML5', 'Platformer', [], null],
  ['Lunchbox Legends', 'Flash', 'Adventure', [], null],
  ['Office Chair Grand Prix', 'Flash', 'Driving', ['Comedy'], null],
  ['Mini Golf Mayhem', 'Flash', 'Sports', [], null],
  ['Pocket Pirates', 'Flash', 'Adventure', ['Pirates'], null],
  ['Gumball Galaxy', 'Flash', 'Shooter', ['Space'], null],
  ['The Lost Floppy', 'Flash', 'Adventure', ['Mystery'], null],
  ['Block Party Puzzle', 'Flash', 'Puzzle', [], null],
  ['Tile Tumble', 'HTML5', 'Puzzle', [], null],
  ['Plumbing Puzzler', 'Flash', 'Puzzle', [], null],
  ['Kite Fighter', 'Flash', 'Action', [], null],
  ['Garden Gnome Rescue', 'Flash', 'Adventure', [], null],
  ['Scrapyard Racers', 'Flash', 'Driving', ['Robots'], null],
  ['Penguin Paintball', 'Flash', 'Shooter', ['Animals', 'Winter'], null],
  ['Escape the Treehouse', 'Flash', 'Escape the Room', [], null],
  ['Escape the Laundromat', 'Flash', 'Escape the Room', ['Mystery'], null],
  ['Dress Up Dino', 'Flash', 'Dress Up', ['Animals'], null],
  ['Robot Runway', 'Flash', 'Dress Up', ['Robots'], null],
  ['Lemonade Empire', 'Flash', 'Strategy', [], null],
  ['Bowling for Buttons', 'Flash', 'Sports', [], null],
  ['Skate Park Kid', 'Flash', 'Sports', [], null],
  ['Space Mail', 'Flash', 'Adventure', ['Space'], null],
  ['Haunted Homework', 'Flash', 'Adventure', ['Mystery'], null],
  ['Magnet Mike', 'Flash', 'Puzzle', ['Robots'], null],
  ['Crayon Kart', 'Flash', 'Driving', [], null],
  ['Ninja Noodle', 'Flash', 'Action', ['Comedy'], null],
  ['Fishbowl Frenzy', 'Flash', 'Arcade', ['Animals'], null],
  ['Cactus Catcher', 'Flash', 'Arcade', [], null],
  ['Brick Buster 3000', 'Flash', 'Arcade', [], null],
  ['Volcano Village', 'Flash', 'Strategy', [], null],
  ['Drum Doodle', 'Flash', 'Toy', ['Music'], null],
  ['Bubble Machine', 'Flash', 'Toy', [], null],
  ['Paper Plane Lab', 'Flash', 'Toy', [], null],
  ['Snow Globe Shaker', 'Flash', 'Toy', ['Winter'], null],
];
const THEATRE = [
  ['The Adventures of Blob', 'Flash', 'Animation', ['Comedy'], null],
  ['Lunch Break: Episode 1', 'Flash', 'Animation', ['Comedy'], null],
  ['Stick Figure Sunday', 'Flash', 'Animation', [], null],
  ['The Great Sandwich', 'Flash', 'Animation', [], null],
];

function uuid(text) {
  const hex = createHash('sha256').update(`dotcom-arcade-demo:${text}`).digest('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

function releaseDate(title, fixed) {
  if (fixed) return fixed;
  const rand = random(title + ' release');
  const start = Date.UTC(2005, 0, 1);
  const end = Date.UTC(2012, 11, 31);
  return new Date(start + rand() * (end - start)).toISOString().slice(0, 10);
}

const games = [
  ...ARCADE.map((g) => [...g, 'arcade']),
  ...THEATRE.map((g) => [...g, 'theatre']),
].map(([title, platform, genre, extra, date, library], i) => {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  const ext = platform === 'HTML5' ? 'index.html' : `${slug}.swf`;
  return {
    id: uuid(title),
    title,
    platform,
    library,
    tags: [genre, ...extra],
    developer: STUDIOS[i % STUDIOS.length],
    releaseDate: releaseDate(title, date),
    description: BLURBS[genre](title),
    launchCommand: `http://games.example/${slug}/${ext}`,
  };
});

const PLAYLISTS = [
  {
    title: 'Lunchtime Classics',
    description: 'Quick games for a short break.',
    games: [
      'Pixel Penguin Panic',
      'Moon Mower',
      'Fishbowl Frenzy',
      'Cactus Catcher',
      'Brick Buster 3000',
      'Jelly Jump',
      'Kite Fighter',
      'Ninja Noodle',
      'Hamster Hoops',
      'Mini Golf Mayhem',
    ],
  },
  {
    title: 'Toys to Enjoy',
    description: 'Nothing to win, plenty to click.',
    games: [
      'Drum Doodle',
      'Bubble Machine',
      'Paper Plane Lab',
      'Snow Globe Shaker',
      'Dress Up Dino',
      'Robot Runway',
      'Lemonade Empire',
    ],
  },
  {
    title: 'Computer Lab Favorites',
    description: 'Played on every school computer, until someone blocked the site.',
    games: [
      'Turbo Teacup 2',
      'Office Chair Grand Prix',
      'Crayon Kart',
      'Laser Llama',
      'Rocket Radish',
      'Gumball Galaxy',
      'Captain Crunchbyte',
      'Cloud Hopper',
      'Dial-Up Dash',
    ],
  },
  {
    title: 'Puzzles and Escapes',
    description: 'For when you want to think a little.',
    games: [
      'Block Party Puzzle',
      'Tile Tumble',
      'Plumbing Puzzler',
      'Magnet Mike',
      'Sock Drawer Escape',
      'Escape the Treehouse',
      'Escape the Laundromat',
      'The Lost Floppy',
      'Haunted Homework',
    ],
  },
];

// --- Write it ----------------------------------------------------------------

for (const sub of [
  'Data/flashpoint.sqlite',
  'Data/Images',
  'Data/Logos',
  'Data/Playlists',
  'Legacy/htdocs/games.example',
]) {
  rmSync(join(out, sub), { recursive: true, force: true });
}
for (const sub of [
  'Data/Images/Logos',
  'Data/Images/Screenshots',
  'Data/Logos',
  'Data/Playlists',
  'Data/Games',
  'Legacy/htdocs',
]) {
  mkdirSync(join(out, sub), { recursive: true });
}
writeFileSync(join(out, 'version.txt'), 'Flashpoint 14 Ultimate - Dotcom Arcade demo data\n');

const db = new Database(join(out, 'Data/flashpoint.sqlite'));
db.exec(readFileSync(join(here, 'flashpoint-schema.sql'), 'utf8'));

const now = '2026-01-01T00:00:00.000Z';
db.transaction(() => {
  db.prepare("INSERT INTO tag_category (id, name, color) VALUES (1, 'default', '#FFFFFF')").run();
  const tagIds = new Map();
  for (const name of [...new Set(games.flatMap((g) => g.tags))].sort()) {
    const id = tagIds.size + 1;
    db.prepare('INSERT INTO tag_alias (id, tagId, name) VALUES (?, ?, ?)').run(id, id, name);
    db.prepare('INSERT INTO tag (id, primaryAliasId, categoryId) VALUES (?, ?, 1)').run(id, id);
    tagIds.set(name, id);
  }
  const platformIds = new Map();
  for (const name of ['Flash', 'HTML5']) {
    const id = platformIds.size + 1;
    db.prepare('INSERT INTO platform_alias (id, platformId, name) VALUES (?, ?, ?)').run(
      id,
      id,
      name
    );
    db.prepare('INSERT INTO platform (id, primaryAliasId) VALUES (?, ?)').run(id, id);
    platformIds.set(name, id);
  }

  const insert = db.prepare(`
    INSERT INTO game (
      id, title, alternateTitles, series, developer, publisher, dateAdded, dateModified,
      broken, extreme, playMode, status, notes, source, applicationPath, launchCommand,
      releaseDate, version, originalDescription, language, library, orderTitle,
      tagsStr, platformsStr, platformId, platformName, archiveState
    ) VALUES (?, ?, '', '', ?, ?, ?, ?, 0, 0, 'Single Player', 'Playable', '', ?, ?, ?, ?, '', ?, 'en', ?, ?, ?, ?, ?, ?, 2)
  `);
  for (const g of games) {
    insert.run(
      g.id,
      g.title,
      g.developer,
      g.developer,
      now,
      now,
      g.launchCommand,
      g.platform === 'HTML5' ? ':browser-mode:' : 'FPSoftware\\Flash\\flashplayer_32_sa.exe',
      g.launchCommand,
      g.releaseDate,
      g.description,
      g.library,
      g.title.toLowerCase(),
      g.tags.join('; '),
      g.platform,
      platformIds.get(g.platform),
      g.platform
    );
    for (const tag of g.tags)
      db.prepare('INSERT INTO game_tags_tag (gameId, tagId) VALUES (?, ?)').run(
        g.id,
        tagIds.get(tag)
      );
    db.prepare('INSERT INTO game_platforms_platform (gameId, platformId) VALUES (?, ?)').run(
      g.id,
      platformIds.get(g.platform)
    );
  }
})();
db.close();

const shard = (id) => `${id.slice(0, 2)}/${id.slice(2, 4)}`;
for (const g of games) {
  for (const [dir, image] of [
    ['Logos', logo(g)],
    ['Screenshots', screenshot(g)],
  ]) {
    mkdirSync(join(out, 'Data/Images', dir, shard(g.id)), { recursive: true });
    writeFileSync(join(out, 'Data/Images', dir, shard(g.id), `${g.id}.png`), image);
  }
}
for (const name of ['Flash', 'HTML5'])
  writeFileSync(join(out, 'Data/Logos', `${name}.png`), platformLogo(name));

const byTitle = new Map(games.map((g) => [g.title, g]));
for (const p of PLAYLISTS) {
  const id = uuid(`playlist:${p.title}`);
  const playlist = {
    id,
    title: p.title,
    description: p.description,
    author: 'Dotcom Arcade demo',
    library: 'arcade',
    extreme: false,
    games: p.games.map((title, order) => {
      const game = byTitle.get(title);
      if (!game) throw new Error(`playlist ${p.title}: no game ${title}`);
      return { gameId: game.id, notes: '', order, playlistId: id };
    }),
  };
  writeFileSync(join(out, 'Data/Playlists', `${id}.json`), JSON.stringify(playlist, null, 2));
}

const penguinDir = join(out, 'Legacy/htdocs/games.example/pixel-penguin-panic');
mkdirSync(penguinDir, { recursive: true });
writeFileSync(join(penguinDir, 'index.html'), readFileSync(join(here, 'pixel-penguin-panic.html')));

console.log(
  `Demo Flashpoint data: ${games.length} games, ${PLAYLISTS.length} playlists, in ${out}`
);
