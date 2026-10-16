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
  '?': ['01110', '10001', '00001', '00010', '00100', '00000', '00100'],
  '>': ['01000', '00100', '00010', '00001', '00010', '00100', '01000'],
  '\\': ['10000', '10000', '01000', '00100', '00010', '00001', '00001'],
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

function ellipse(c, cx, cy, rx, ry, color, alpha = 1) {
  c.shape(
    cx - rx,
    cy - ry,
    cx + rx,
    cy + ry,
    color,
    (x, y) => ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1,
    alpha
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

// --- Genre scenes, drawn at any size. p is the game's palette, r its random source.

function pick(r, items) {
  return items[Math.floor(r() * items.length)];
}

function palette(r) {
  const hue = Math.floor(r() * 360);
  return {
    hue,
    sky: [hsl(hue, 0.65, 0.72), hsl((hue + 25) % 360, 0.6, 0.5)],
    ground: hsl((hue + 110) % 360, 0.45, 0.42),
    accent: hsl((hue + 180) % 360, 0.85, 0.58),
    accent2: hsl((hue + 300) % 360, 0.8, 0.6),
    dark: hsl(hue, 0.4, 0.18),
  };
}

const WHITE = [255, 255, 255];
const BLACK = [15, 15, 25];
const GOLD = [255, 214, 64];

function hero(c, x, y, s, color) {
  c.rect(x - 8 * s, y - 22 * s, 16 * s, 18 * s, color);
  c.rect(x - 5 * s, y - 18 * s, 4 * s, 4 * s, WHITE);
  c.rect(x + 2 * s, y - 18 * s, 4 * s, 4 * s, WHITE);
  c.rect(x - 4 * s, y - 17 * s, 2 * s, 3 * s, BLACK);
  c.rect(x + 3 * s, y - 17 * s, 2 * s, 3 * s, BLACK);
  c.rect(x - 8 * s, y - 4 * s, 6 * s, 4 * s, BLACK);
  c.rect(x + 2 * s, y - 4 * s, 6 * s, 4 * s, BLACK);
}

function person(c, x, y, s, shirt, skin = [241, 194, 150]) {
  c.rect(x - 6 * s, y - 22 * s, 12 * s, 14 * s, shirt);
  c.rect(x - 5 * s, y - 8 * s, 4 * s, 8 * s, BLACK);
  c.rect(x + 1 * s, y - 8 * s, 4 * s, 8 * s, BLACK);
  c.circle(x, y - 28 * s, 6 * s, skin);
}

function tree(c, x, y, s, leaf) {
  c.rect(x - 2 * s, y - 14 * s, 4 * s, 14 * s, [110, 70, 40]);
  c.circle(x, y - 20 * s, 10 * s, leaf);
}

function bubble(c, x, y, s, text) {
  const scale = Math.max(1, Math.round(2 * s));
  ellipse(c, x, y, Math.max(26 * s, textWidth(text, scale) / 2 + 12 * s), 14 * s, WHITE);
  c.polygon(
    [
      [x - 10 * s, y + 10 * s],
      [x - 18 * s, y + 22 * s],
      [x - 2 * s, y + 12 * s],
    ],
    WHITE
  );
  drawText(
    c,
    text,
    Math.round(x - textWidth(text, scale) / 2),
    Math.round(y - 3.5 * scale),
    scale,
    BLACK,
    null
  );
}

function starfield(c, r, count, maxY = c.height) {
  for (let i = 0; i < count; i++) c.rect(r() * c.width, r() * maxY, 2, 2, WHITE, 0.4 + r() * 0.6);
}

const SCENES = {
  Action(c, r, p, s, g) {
    const { width: W, height: H } = c;
    const variant = ['city', 'sky', 'dojo'][g.variant % 3];
    if (variant === 'sky') {
      c.gradient([125, 190, 255], [200, 235, 255]);
      for (let i = 0; i < 4; i++) {
        const x = r() * W;
        const y = H * (0.1 + r() * 0.4);
        for (const dx of [-14, 0, 14]) c.circle(x + dx * s, y, 11 * s, WHITE, 0.9);
      }
      for (let i = 0; i < 3; i++) {
        const x = W * (0.2 + i * 0.3);
        const y = H * (0.25 + r() * 0.3);
        const color = [p.accent, p.accent2, GOLD][i];
        c.polygon(
          [
            [x, y - 22 * s],
            [x + 16 * s, y],
            [x, y + 22 * s],
            [x - 16 * s, y],
          ],
          color
        );
        for (let j = 1; j < 6; j++)
          c.rect(x - 1 * s + Math.sin(j) * 4 * s, y + (20 + j * 8) * s, 3 * s, 5 * s, color);
      }
      c.rect(0, H * 0.82, W, H * 0.18, [120, 90, 70]);
      hero(c, W * 0.5, H * 0.82, s * 1.6, p.accent);
      return;
    }
    if (variant === 'dojo') {
      c.gradient([180, 130, 80], [130, 85, 50]);
      for (let x = 0; x < W; x += 40 * s) c.rect(x, 0, 4 * s, H * 0.75, [90, 55, 30]);
      for (let i = 0; i < 3; i++) {
        const x = W * (0.2 + i * 0.3);
        ellipse(c, x, H * 0.18, 10 * s, 14 * s, [220, 38, 38]);
        c.rect(x - 1 * s, H * 0.06, 2 * s, 8 * s, BLACK);
      }
      c.rect(0, H * 0.75, W, H * 0.25, [210, 180, 120]);
      for (let x = 0; x < W; x += 30 * s) c.rect(x, H * 0.75, 2, H * 0.25, BLACK, 0.15);
    } else {
      c.gradient(hsl(p.hue, 0.55, 0.35), hsl((p.hue + 20) % 360, 0.6, 0.7));
      for (let i = 0; i < 7; i++) {
        const w = (24 + r() * 30) * s;
        const h = H * (0.25 + r() * 0.4);
        const x = (i / 7) * W + r() * 10 * s;
        c.rect(x, H * 0.8 - h, w, h, p.dark, 0.85);
        for (let wy = H * 0.8 - h + 6 * s; wy < H * 0.75; wy += 12 * s)
          if (r() < 0.6) c.rect(x + 6 * s, wy, 5 * s, 5 * s, GOLD, 0.7);
      }
      c.rect(0, H * 0.8, W, H * 0.2, [60, 60, 70]);
    }
    const floor = variant === 'dojo' ? H * 0.82 : H * 0.86;
    const hx = W * (0.3 + r() * 0.15);
    for (let i = 0; i < 4; i++)
      c.rect(
        hx - (40 + i * 10) * s,
        floor - 18 * s + i * 6 * s,
        (24 - i * 4) * s,
        2 * s,
        WHITE,
        0.7
      );
    hero(c, hx, floor, s * 1.6, p.accent);
    for (let i = 0; i < 2; i++) hero(c, W * (0.68 + i * 0.16), floor, s * 1.3, p.accent2);
    const bx = W * 0.52;
    c.polygon(star(bx, floor - 50 * s, 30 * s, 15 * s, 10), GOLD);
    const scale = Math.max(1, Math.round(2 * s));
    const word = pick(r, ['POW', 'BAM', 'WHAM']);
    drawText(
      c,
      word,
      Math.round(bx - textWidth(word, scale) / 2),
      Math.round(floor - 50 * s - 3.5 * scale),
      scale,
      [220, 38, 38],
      null
    );
  },

  Adventure(c, r, p, s, g) {
    const { width: W, height: H } = c;
    const variant = g.tags.includes('Pirates')
      ? 'beach'
      : g.tags.includes('Space')
        ? 'space'
        : g.tags.includes('Mystery')
          ? 'spooky'
          : g.tags.includes('Computers')
            ? 'computer'
            : g.title.includes('Garden')
              ? 'garden'
              : 'village';
    const px = W * (0.25 + r() * 0.15);
    const say = pick(r, ['HELLO?', 'HMM...', 'A KEY!', 'WHO?']);
    if (variant === 'space') {
      c.gradient([10, 10, 40], [40, 20, 80]);
      starfield(c, r, 70);
      c.circle(W * 0.75, H * 0.3, 40 * s, p.accent2);
      ellipse(c, W * 0.75, H * 0.3, 60 * s, 8 * s, WHITE, 0.5);
      ellipse(c, W * 0.5, H * 1.05, W * 0.8, H * 0.3, [148, 163, 184]);
      for (let i = 0; i < 4; i++)
        ellipse(c, r() * W, H * (0.85 + r() * 0.1), 12 * s, 4 * s, [100, 116, 139]);
      c.rect(W * 0.6, H * 0.62, 20 * s, 30 * s, [226, 232, 240]);
      c.polygon(
        [
          [W * 0.6, H * 0.62],
          [W * 0.6 + 10 * s, H * 0.62 - 18 * s],
          [W * 0.6 + 20 * s, H * 0.62],
        ],
        [239, 68, 68]
      );
      c.rect(W * 0.6 + 4 * s, H * 0.62 + 8 * s, 12 * s, 8 * s, [125, 211, 252]);
      person(c, px, H * 0.86, s * 1.2, p.accent);
      c.rect(px - 9 * s, H * 0.86 - 34 * s * 1.2, 18 * s * 1.2, 4 * s, WHITE, 0.6);
      bubble(c, px + 32 * s, H * 0.86 - 64 * s, s, 'MAIL!');
      return;
    }
    if (variant === 'computer') {
      c.gradient([203, 213, 225], [148, 163, 184]);
      c.rect(W * 0.62, H * 0.12, 70 * s, 50 * s, [120, 80, 40]);
      c.rect(W * 0.62 + 5 * s, H * 0.12 + 5 * s, 60 * s, 40 * s, p.sky[0]);
      c.rect(0, H * 0.62, W, 8 * s, [120, 80, 40]);
      c.rect(W * 0.08, H * 0.62 + 8 * s, 6 * s, H * 0.4, [120, 80, 40]);
      c.rect(W * 0.86, H * 0.62 + 8 * s, 6 * s, H * 0.4, [120, 80, 40]);
      const mx = W * 0.2;
      c.rect(mx, H * 0.62 - 70 * s, 84 * s, 66 * s, [226, 220, 200]);
      c.rect(mx + 8 * s, H * 0.62 - 62 * s, 68 * s, 46 * s, [30, 64, 175]);
      const scale = Math.max(1, Math.round(1.5 * s));
      drawText(
        c,
        'A:\\>',
        Math.round(mx + 12 * s),
        Math.round(H * 0.62 - 56 * s),
        scale,
        WHITE,
        null
      );
      c.rect(mx + 30 * s, H * 0.62 - 4 * s, 24 * s, 4 * s, [180, 175, 160]);
      c.rect(mx - 6 * s, H * 0.62 - 2 * s, 96 * s, 2 * s, [180, 175, 160]);
      for (let i = 0; i < 3; i++) {
        const fx = W * (0.55 + i * 0.12);
        const fy = H * (0.84 + r() * 0.08);
        const color = pick(r, [p.accent, p.accent2, BLACK, [59, 130, 246]]);
        c.rect(fx, fy, 22 * s, 22 * s, color);
        c.rect(fx + 5 * s, fy, 12 * s, 7 * s, [203, 213, 225]);
        c.rect(fx + 4 * s, fy + 12 * s, 14 * s, 10 * s, WHITE);
      }
      person(c, px + W * 0.35, H * 0.9, s * 1.2, p.accent);
      bubble(c, px + W * 0.35 + 32 * s, H * 0.9 - 64 * s, s, 'DISK 2?');
      return;
    }
    if (variant === 'beach') {
      c.gradient([125, 211, 252], [186, 230, 253]);
      c.circle(W * 0.8, H * 0.15, 16 * s, [254, 240, 138]);
      c.rect(0, H * 0.5, W, H * 0.25, [14, 116, 144]);
      for (let i = 0; i < 6; i++)
        c.rect(r() * W, H * (0.52 + r() * 0.2), 14 * s, 2 * s, WHITE, 0.6);
      ellipse(c, W * 0.5, H * 0.95, W * 0.7, H * 0.25, [253, 224, 160]);
      const bx = W * 0.7;
      c.polygon(
        [
          [bx - 34 * s, H * 0.55],
          [bx + 34 * s, H * 0.55],
          [bx + 24 * s, H * 0.63],
          [bx - 24 * s, H * 0.63],
        ],
        [120, 70, 40]
      );
      c.rect(bx - 1 * s, H * 0.3, 3 * s, H * 0.25, [90, 55, 30]);
      c.polygon(
        [
          [bx + 2 * s, H * 0.31],
          [bx + 26 * s, H * 0.42],
          [bx + 2 * s, H * 0.52],
        ],
        WHITE
      );
      c.rect(bx - 1 * s, H * 0.28, 12 * s, 7 * s, BLACK);
      c.rect(W * 0.12, H * 0.55, 4 * s, H * 0.25, [140, 95, 60]);
      for (const a of [-1, -0.4, 0.4, 1])
        ellipse(c, W * 0.12 + a * 14 * s, H * 0.55, 16 * s, 5 * s, [34, 140, 60]);
      person(c, px + 20 * s, H * 0.9, s * 1.2, [220, 38, 38]);
      bubble(c, px + 52 * s, H * 0.9 - 64 * s, s, 'ARR!');
      return;
    }
    if (variant === 'spooky') {
      c.gradient([20, 20, 50], [70, 50, 110]);
      starfield(c, r, 30, H * 0.5);
      c.circle(W * 0.2, H * 0.18, 18 * s, [254, 249, 195]);
      c.rect(0, H * 0.78, W, H * 0.22, [40, 50, 40]);
      const hx = W * 0.5;
      c.rect(hx, H * 0.78 - 90 * s, 80 * s, 90 * s, [60, 50, 70]);
      c.polygon(
        [
          [hx - 10 * s, H * 0.78 - 90 * s],
          [hx + 40 * s, H * 0.78 - 130 * s],
          [hx + 90 * s, H * 0.78 - 90 * s],
        ],
        [40, 30, 50]
      );
      for (const [wx, wy] of [
        [10, 70],
        [50, 70],
        [10, 40],
        [50, 40],
      ])
        c.rect(hx + wx * s, H * 0.78 - wy * s, 18 * s, 14 * s, r() < 0.6 ? GOLD : BLACK);
      c.rect(hx + 32 * s, H * 0.78 - 24 * s, 16 * s, 24 * s, BLACK);
      ellipse(c, W * 0.85, H * 0.45, 12 * s, 16 * s, WHITE, 0.7);
      c.circle(W * 0.85 - 4 * s, H * 0.43, 2 * s, BLACK);
      c.circle(W * 0.85 + 4 * s, H * 0.43, 2 * s, BLACK);
      person(c, px - 20 * s, H * 0.9, s * 1.2, p.accent);
      bubble(c, px + 12 * s, H * 0.9 - 64 * s, s, 'WHO?');
      return;
    }
    c.gradient(...p.sky);
    c.circle(W * (0.1 + r() * 0.8), H * 0.18, 18 * s, [254, 240, 138]);
    for (let i = 0; i < 2; i++) {
      const y = H * (0.6 + i * 0.1);
      c.shape(
        0,
        y - 40 * s,
        W - 1,
        H - 1,
        hsl((p.hue + 110) % 360, 0.4, 0.45 - i * 0.1),
        (x, py) => py > y + Math.sin(x / (40 * s) + i * 2) * 12 * s
      );
    }
    if (variant === 'garden') {
      for (let i = 0; i < 6; i++)
        tree(
          c,
          W * (0.05 + i * 0.18),
          H * (0.75 + (i % 2) * 0.05),
          s * (1.2 + r() * 0.6),
          hsl((p.hue + 120) % 360, 0.5, 0.25 + r() * 0.1)
        );
      for (let i = 0; i < 8; i++)
        c.circle(r() * W, H * (0.85 + r() * 0.12), 4 * s, pick(r, [p.accent, p.accent2, GOLD]));
      const gx = W * 0.7;
      c.polygon(
        [
          [gx, H * 0.88 - 34 * s],
          [gx - 10 * s, H * 0.88 - 16 * s],
          [gx + 10 * s, H * 0.88 - 16 * s],
        ],
        [220, 38, 38]
      );
      c.circle(gx, H * 0.88 - 12 * s, 7 * s, [241, 194, 150]);
      c.rect(gx - 8 * s, H * 0.88 - 6 * s, 16 * s, 6 * s, [59, 130, 246]);
    } else {
      const hx = W * (0.55 + r() * 0.2);
      const hy = H * 0.72;
      c.rect(hx, hy - 50 * s, 60 * s, 50 * s, [226, 196, 150]);
      c.polygon(
        [
          [hx - 8 * s, hy - 50 * s],
          [hx + 30 * s, hy - 80 * s],
          [hx + 68 * s, hy - 50 * s],
        ],
        p.accent2
      );
      c.rect(hx + 24 * s, hy - 26 * s, 14 * s, 26 * s, [120, 80, 40]);
      c.rect(hx + 6 * s, hy - 40 * s, 12 * s, 10 * s, [186, 230, 253]);
      tree(c, W * 0.12, H * 0.8, s * 1.5, hsl((p.hue + 120) % 360, 0.5, 0.3));
    }
    person(c, px, H * 0.88, s * 1.2, p.accent);
    bubble(c, px + 32 * s, H * 0.88 - 64 * s, s, say);
  },

  Platformer(c, r, p, s, g) {
    const { width: W, height: H } = c;
    const variant = ['day', 'castle', 'night', 'jelly'][g.variant % 4];
    if (variant === 'castle') {
      c.gradient([60, 50, 70], [30, 25, 40]);
      for (let y = 0; y < H; y += 16 * s)
        for (let x = (y / (16 * s)) % 2 ? -12 * s : 0; x < W; x += 24 * s)
          c.rect(x + 1, y + 1, 24 * s - 2, 16 * s - 2, [80, 70, 90]);
      for (let i = 0; i < 2; i++) {
        const tx = W * (0.25 + i * 0.5);
        c.rect(tx - 2 * s, H * 0.3, 4 * s, 12 * s, [120, 80, 40]);
        c.circle(tx, H * 0.3 - 4 * s, 6 * s, [251, 146, 60]);
        c.circle(tx, H * 0.3 - 4 * s, 18 * s, [251, 146, 60], 0.2);
      }
    } else if (variant === 'night') {
      c.gradient([15, 23, 60], [60, 60, 120]);
      starfield(c, r, 40, H * 0.6);
      c.circle(W * 0.8, H * 0.15, 14 * s, [254, 249, 195]);
    } else if (variant === 'jelly') {
      c.gradient([253, 186, 216], [196, 181, 253]);
      for (let i = 0; i < 6; i++) c.circle(r() * W, r() * H * 0.6, (6 + r() * 10) * s, WHITE, 0.4);
    } else {
      c.gradient(...p.sky);
      for (let i = 0; i < 3; i++) {
        const x = r() * W;
        const y = H * (0.1 + r() * 0.25);
        for (const dx of [-14, 0, 14])
          c.circle(x + dx * s, y + (dx ? 4 * s : 0), 10 * s, WHITE, 0.85);
      }
    }
    const ground = H * 0.82;
    const groundColor =
      variant === 'castle' ? [70, 60, 80] : variant === 'jelly' ? [236, 72, 153] : p.ground;
    for (let x = 0; x < W; x += 60 * s)
      if (x === 0 || r() > 0.25) c.rect(x, ground, 48 * s, H - ground, groundColor);
    if (variant !== 'castle') c.rect(0, ground, W, 4 * s, hsl((p.hue + 110) % 360, 0.6, 0.6), 0.8);
    const platforms = Array.from({ length: 3 }, (_, i) => [
      W * (0.08 + i * 0.3 + r() * 0.08),
      H * (0.32 + r() * 0.35),
    ]);
    for (const [x, y] of platforms) {
      if (variant === 'jelly') ellipse(c, x + 28 * s, y + 4 * s, 30 * s, 8 * s, [52, 211, 153]);
      else c.rect(x, y, 56 * s, 9 * s, variant === 'castle' ? [120, 113, 108] : p.dark);
      for (let j = 0; j < 3; j++) c.circle(x + (12 + j * 16) * s, y - 10 * s, 4 * s, GOLD);
    }
    const [hx, hy] = pick(r, platforms);
    hero(c, hx + 28 * s, hy - 22 * s, s, p.accent);
    c.circle(W * (0.55 + r() * 0.35), ground - 8 * s, 8 * s, p.accent2);
  },

  Shooter(c, r, p, s, g) {
    const { width: W, height: H } = c;
    if (g.title.includes('Paint')) {
      c.gradient(p.sky[0], p.sky[1]);
      c.rect(0, H * 0.55, W, H * 0.45, [101, 163, 13]);
      const splat = (x, y, k, color) => {
        c.circle(x, y, 9 * k, color);
        for (let i = 0; i < 6; i++)
          c.circle(x + Math.cos(i) * 12 * k, y + Math.sin(i * 1.7) * 10 * k, 3 * k, color);
      };
      for (let i = 0; i < 4; i++) {
        const bx = W * (0.08 + i * 0.24);
        const by = H * (0.5 + (i % 2) * 0.18);
        c.rect(bx, by, 40 * s, 30 * s, [146, 98, 56]);
        c.rect(bx, by + 13 * s, 40 * s, 3 * s, [110, 70, 40]);
        splat(bx + 20 * s, by + 10 * s, s, pick(r, [p.accent, p.accent2, GOLD, [239, 68, 68]]));
      }
      for (let i = 0; i < 3; i++)
        splat(r() * W, H * (0.1 + r() * 0.3), s * 0.8, pick(r, [p.accent2, GOLD, [239, 68, 68]]));
      penguin(c, W * 0.25, H * 0.95, s * 0.9);
      penguin(c, W * 0.78, H * 0.95, s * 0.8);
      for (let i = 0; i < 3; i++)
        c.circle(W * (0.38 + i * 0.1), H * (0.72 - i * 0.03), 3.5 * s, [239, 68, 68]);
      return;
    }
    if (g.tags.includes('Winter')) {
      c.gradient([186, 230, 253], [224, 242, 254]);
      for (let i = 0; i < 40; i++) c.circle(r() * W, r() * H, 1.5 * s, WHITE);
      c.rect(0, H * 0.7, W, H * 0.3, WHITE);
      for (let i = 0; i < 3; i++) {
        const x = W * (0.55 + i * 0.15);
        const y = H * (0.68 - r() * 0.08);
        ellipse(c, x, y, 20 * s, 8 * s, [226, 232, 240]);
        c.rect(x - 14 * s, y - 14 * s, 28 * s, 14 * s, [203, 213, 225]);
        person(c, x, y - 8 * s, s * 0.9, i % 2 ? p.accent2 : [220, 38, 38]);
      }
      c.rect(W * 0.08, H * 0.6, 40 * s, 24 * s, [203, 213, 225]);
      person(c, W * 0.18, H * 0.75, s * 1.3, p.accent);
      for (let i = 0; i < 4; i++)
        c.circle(
          W * (0.28 + i * 0.07),
          H * (0.55 - Math.sin(i / 1.5) * 0.08),
          4 * s,
          g.title.includes('Paint') ? pick(r, [p.accent2, GOLD, [239, 68, 68]]) : WHITE
        );
      return;
    }
    c.gradient(hsl(p.hue, 0.6, 0.08), hsl((p.hue + 30) % 360, 0.55, 0.25));
    starfield(c, r, 60);
    c.circle(W * (0.15 + r() * 0.7), H * 0.25, 30 * s, p.accent2, 0.7);
    if (g.variant === 1) {
      // Side-scrolling: the ship flies right
      const sy = H * (0.4 + r() * 0.2);
      c.polygon(
        [
          [W * 0.22, sy],
          [W * 0.1, sy - 12 * s],
          [W * 0.1, sy + 12 * s],
        ],
        [226, 232, 240]
      );
      c.rect(W * 0.08, sy - 3 * s, 6 * s, 6 * s, [251, 146, 60]);
      for (let i = 1; i <= 4; i++)
        c.rect(W * 0.22 + i * 22 * s, sy - 1 * s, 12 * s, 3 * s, [250, 204, 21]);
      for (let i = 0; i < 6; i++) {
        const x = W * (0.6 + r() * 0.35);
        const y = H * (0.15 + r() * 0.7);
        c.circle(x, y, 8 * s, i % 2 ? p.accent : p.accent2);
        c.rect(x - 3 * s, y - 2 * s, 3 * s, 3 * s, WHITE);
      }
      c.polygon(star(W * 0.62, sy, 14 * s, 6 * s, 8), [251, 146, 60]);
      return;
    }
    const rows = 2 + Math.floor(r() * 2);
    for (let row = 0; row < rows; row++) {
      for (let i = 0; i < 5; i++) {
        if (r() < 0.2) continue;
        const x = W * (0.14 + i * 0.18);
        const y = H * (0.12 + row * 0.13);
        c.polygon(
          [
            [x - 10 * s, y - 6 * s],
            [x + 10 * s, y - 6 * s],
            [x, y + 8 * s],
          ],
          row % 2 ? p.accent : p.accent2
        );
        c.rect(x - 2 * s, y - 4 * s, 4 * s, 3 * s, WHITE);
      }
    }
    const sx = W * (0.3 + r() * 0.4);
    const sy = H * 0.86;
    c.polygon(
      [
        [sx, sy - 18 * s],
        [sx - 14 * s, sy + 6 * s],
        [sx + 14 * s, sy + 6 * s],
      ],
      [226, 232, 240]
    );
    c.rect(sx - 3 * s, sy - 6 * s, 6 * s, 6 * s, p.accent);
    for (let i = 1; i <= 3; i++)
      c.rect(sx - 1.5 * s, sy - (20 + i * 22) * s, 3 * s, 12 * s, [250, 204, 21]);
    c.polygon(star(W * (0.2 + r() * 0.6), H * 0.42, 14 * s, 6 * s, 8), [251, 146, 60]);
  },

  Driving(c, r, p, s, g) {
    const { width: W, height: H } = c;
    const car = (x, y, k, color) => {
      c.rect(x - 22 * k, y - 16 * k, 44 * k, 16 * k, color);
      c.rect(x - 15 * k, y - 26 * k, 30 * k, 11 * k, color);
      c.rect(x - 12 * k, y - 24 * k, 24 * k, 7 * k, [186, 230, 253]);
      c.rect(x - 24 * k, y - 4 * k, 9 * k, 8 * k, BLACK);
      c.rect(x + 15 * k, y - 4 * k, 9 * k, 8 * k, BLACK);
      c.rect(x - 18 * k, y - 12 * k, 6 * k, 3 * k, [239, 68, 68]);
      c.rect(x + 12 * k, y - 12 * k, 6 * k, 3 * k, [239, 68, 68]);
    };
    if (g.variant % 2) {
      // Top-down track
      c.rect(0, 0, W, H, p.ground);
      for (let i = 0; i < 12; i++)
        c.circle(r() * W, r() * H, 3 * s, hsl((p.hue + 110) % 360, 0.5, 0.3));
      ellipse(c, W / 2, H / 2, W * 0.44, H * 0.38, [70, 70, 80]);
      ellipse(c, W / 2, H / 2, W * 0.26, H * 0.2, p.ground);
      ellipse(c, W / 2, H / 2, W * 0.2, H * 0.14, hsl((p.hue + 100) % 360, 0.45, 0.5));
      for (let i = 0; i < 8; i++)
        c.rect(
          W * 0.08 + (i % 2) * 6 * s,
          H * 0.45 + Math.floor(i / 2) * 6 * s,
          6 * s,
          6 * s,
          i % 3 ? WHITE : BLACK
        );
      const kart = (a, color) => {
        const x = W / 2 + Math.cos(a) * W * 0.35;
        const y = H / 2 + Math.sin(a) * H * 0.29;
        c.rect(x - 9 * s, y - 6 * s, 18 * s, 12 * s, color);
        c.rect(x - 3 * s, y - 4 * s, 6 * s, 8 * s, BLACK, 0.5);
      };
      [p.accent, p.accent2, GOLD, [239, 68, 68]].forEach((color, i) =>
        kart(1.9 + i * 0.45 + r() * 0.2, color)
      );
      return;
    }
    const horizon = H * 0.38;
    c.gradient(p.sky[0], p.sky[1]);
    for (let i = 0; i < 4; i++) {
      const x = r() * W;
      c.polygon(
        [
          [x - 50 * s, horizon],
          [x, horizon - (20 + r() * 25) * s],
          [x + 50 * s, horizon],
        ],
        hsl((p.hue + 200) % 360, 0.25, 0.45)
      );
    }
    c.rect(0, horizon, W, H - horizon, p.ground);
    const cx = W * (0.45 + r() * 0.1);
    c.polygon(
      [
        [cx - 6 * s, horizon],
        [cx + 6 * s, horizon],
        [W * 0.95, H],
        [W * 0.05, H],
      ],
      [70, 70, 80]
    );
    for (let i = 0; i < 6; i++) {
      const t0 = (i * 2) / 12;
      const t1 = (i * 2 + 1) / 12;
      const y0 = horizon + (H - horizon) * t0 ** 1.6;
      const y1 = horizon + (H - horizon) * t1 ** 1.6;
      const w0 = (1 + 6 * t0) * s;
      const w1 = (1 + 6 * t1) * s;
      c.polygon(
        [
          [cx - w0, y0],
          [cx + w0, y0],
          [cx + w1, y1],
          [cx - w1, y1],
        ],
        WHITE
      );
    }
    for (let i = 0; i < 6; i++) {
      const t = 0.2 + r() * 0.8;
      const y = horizon + (H - horizon) * t;
      const side = i % 2 ? -1 : 1;
      tree(
        c,
        cx + side * (W * 0.47 * t + 20 * s * t),
        y,
        s * (0.4 + t),
        hsl((p.hue + 120) % 360, 0.5, 0.3)
      );
    }
    car(cx + W * (r() * 0.1 - 0.05), horizon + (H - horizon) * 0.35, s * 0.5, p.accent2);
    car(cx + W * (r() * 0.2 - 0.1), H * 0.93, s * 1.3, p.accent);
  },

  Puzzle(c, r, p, s, g) {
    const { width: W, height: H } = c;
    c.gradient(p.sky[1], p.dark);
    const variant = ['blocks', 'blocks', 'pipes', 'maze'][g.variant % 4];
    const n = variant === 'blocks' ? 6 + (g.variant % 2) : 6;
    const cell = Math.floor((Math.min(W, H) * 0.8) / n);
    const x0 = Math.round((W - cell * n) / 2);
    const y0 = Math.round((H - cell * n) / 2);
    c.rect(x0 - 6 * s, y0 - 6 * s, cell * n + 12 * s, cell * n + 12 * s, BLACK, 0.5);
    if (variant === 'pipes') {
      const pipe = [148, 163, 184];
      for (let row = 0; row < n; row++)
        for (let col = 0; col < n; col++) {
          const x = x0 + col * cell;
          const y = y0 + row * cell;
          c.rect(x + 1, y + 1, cell - 2, cell - 2, [30, 41, 59]);
          const t = cell * 0.3;
          const m = (cell - t) / 2;
          const kind = Math.floor(r() * 3);
          if (kind !== 1) c.rect(x, y + m, cell, t, pipe);
          if (kind !== 0) c.rect(x + m, y, t, cell, pipe);
        }
      for (let col = 0; col < Math.floor(n * 0.6); col++)
        c.rect(
          x0 + col * cell,
          y0 + Math.floor(n / 2) * cell + cell * 0.35,
          cell,
          cell * 0.3,
          [56, 189, 248]
        );
      return;
    }
    if (variant === 'maze') {
      for (let row = 0; row < n; row++)
        for (let col = 0; col < n; col++)
          if ((row % 2 && col % 2) || r() < 0.25)
            c.rect(x0 + col * cell + 2, y0 + row * cell + 2, cell - 4, cell - 4, [100, 116, 139]);
      hero(c, x0 + cell * 0.5, y0 + cell * 0.95, (cell / 30) * 1.1, p.accent);
      const mx = x0 + (n - 1) * cell;
      const my = y0 + (n - 1) * cell;
      c.rect(mx + cell * 0.2, my + cell * 0.2, cell * 0.2, cell * 0.6, [239, 68, 68]);
      c.rect(mx + cell * 0.6, my + cell * 0.2, cell * 0.2, cell * 0.6, [239, 68, 68]);
      c.rect(mx + cell * 0.2, my + cell * 0.6, cell * 0.6, cell * 0.2, [239, 68, 68]);
      c.rect(mx + cell * 0.2, my + cell * 0.2, cell * 0.2, cell * 0.15, WHITE);
      c.rect(mx + cell * 0.6, my + cell * 0.2, cell * 0.2, cell * 0.15, WHITE);
      return;
    }
    const colors = [p.accent, p.accent2, GOLD, [52, 211, 153], [96, 165, 250]];
    for (let row = 0; row < n; row++) {
      for (let col = 0; col < n; col++) {
        if (row < n * 0.3 && r() < 0.5) continue;
        const x = x0 + col * cell;
        const y = y0 + row * cell;
        c.rect(x + 1, y + 1, cell - 2, cell - 2, pick(r, colors));
        c.rect(x + 3, y + 3, cell - 6, Math.max(2, cell * 0.2), WHITE, 0.35);
      }
    }
    const cx = x0 + Math.floor(r() * n) * cell;
    const cy = y0 + Math.floor(n * 0.4 + r() * n * 0.6) * cell;
    for (const [x, y, w, h] of [
      [cx, cy, cell, 3],
      [cx, cy + cell - 3, cell, 3],
      [cx, cy, 3, cell],
      [cx + cell - 3, cy, 3, cell],
    ])
      c.rect(x, y, w, h, WHITE);
  },

  Sports(c, r, p, s, g) {
    const { width: W, height: H } = c;
    const kind = g.title.includes('Golf')
      ? 'golf'
      : g.title.includes('Hoops')
        ? 'court'
        : g.title.includes('Bowling')
          ? 'bowling'
          : g.title.includes('Skate')
            ? 'skate'
            : 'field';
    if (kind === 'bowling') {
      c.gradient([40, 30, 50], [20, 15, 30]);
      c.polygon(
        [
          [W * 0.42, H * 0.1],
          [W * 0.58, H * 0.1],
          [W * 0.85, H],
          [W * 0.15, H],
        ],
        [222, 184, 135]
      );
      for (let i = 0; i < 6; i++)
        c.rect(W * 0.15 + i * W * 0.12, H * 0.1 + i * H * 0.15, 1, H * 0.05, BLACK, 0.2);
      for (const [dx, dy] of [
        [0, 0],
        [-1, 1],
        [1, 1],
        [-2, 2],
        [0, 2],
        [2, 2],
      ]) {
        const x = W * 0.5 + dx * 6 * s;
        const y = H * 0.16 + dy * 6 * s;
        ellipse(c, x, y, 3 * s, 7 * s, WHITE);
        c.rect(x - 3 * s, y - 3 * s, 6 * s, 1.5 * s, [220, 38, 38]);
      }
      c.circle(W * (0.45 + r() * 0.1), H * 0.75, 16 * s, p.accent);
      c.circle(W * 0.48, H * 0.72, 3 * s, BLACK);
      return;
    }
    if (kind === 'skate') {
      c.gradient(...p.sky);
      c.rect(0, H * 0.8, W, H * 0.2, [148, 163, 184]);
      c.shape(
        0,
        H * 0.4,
        W * 0.35,
        H * 0.8,
        [100, 116, 139],
        (x, y) => y > H * 0.4 + (x / (W * 0.35)) ** 2 * H * 0.4
      );
      c.shape(
        W * 0.65,
        H * 0.4,
        W,
        H * 0.8,
        [100, 116, 139],
        (x, y) => y > H * 0.4 + ((W - x) / (W * 0.35)) ** 2 * H * 0.4
      );
      const sx = W * (0.4 + r() * 0.2);
      const sy = H * 0.45;
      person(c, sx, sy, s * 1.2, p.accent);
      c.rect(sx - 14 * s, sy + 1 * s, 28 * s, 3 * s, p.accent2);
      c.circle(sx - 9 * s, sy + 6 * s, 2.5 * s, BLACK);
      c.circle(sx + 9 * s, sy + 6 * s, 2.5 * s, BLACK);
      for (let i = 0; i < 3; i++)
        c.rect(sx - (30 + i * 8) * s, sy - (10 + i * 8) * s, 14 * s, 2 * s, WHITE, 0.7);
      return;
    }
    if (kind === 'court') {
      c.gradient([217, 140, 72], [180, 100, 50]);
      for (let x = 0; x < W; x += 18 * s) c.rect(x, 0, 1, H, BLACK, 0.15);
      c.circle(W * 0.5, H * 0.6, 30 * s, WHITE, 0.3);
      c.rect(W * 0.82, H * 0.2, 6 * s, 50 * s, WHITE);
      c.rect(W * 0.75, H * 0.2 + 30 * s, 22 * s, 3 * s, [239, 68, 68]);
      c.circle(W * (0.5 + r() * 0.2), H * 0.3, 9 * s, [234, 88, 12]);
      for (let i = 0; i < 2; i++) {
        const hx = W * (0.25 + i * 0.3);
        ellipse(c, hx, H * 0.8 - 14 * s, 14 * s, 14 * s, [214, 170, 120]);
        c.circle(hx - 9 * s, H * 0.8 - 26 * s, 5 * s, [214, 170, 120]);
        c.circle(hx + 9 * s, H * 0.8 - 26 * s, 5 * s, [214, 170, 120]);
        c.circle(hx - 4 * s, H * 0.8 - 16 * s, 2 * s, BLACK);
        c.circle(hx + 4 * s, H * 0.8 - 16 * s, 2 * s, BLACK);
        c.rect(hx - 10 * s, H * 0.8 - 6 * s, 20 * s, 8 * s, i ? p.accent : p.accent2);
      }
      return;
    }
    if (kind === 'golf') {
      c.gradient(p.sky[0], p.sky[1]);
      ellipse(c, W * 0.5, H * 0.75, W * 0.6, H * 0.35, [74, 160, 70]);
      ellipse(c, W * 0.7, H * 0.62, 40 * s, 14 * s, [120, 200, 100]);
      c.rect(W * 0.7, H * 0.38, 2 * s, 34 * s, WHITE);
      c.polygon(
        [
          [W * 0.7 + 2 * s, H * 0.38],
          [W * 0.7 + 18 * s, H * 0.38 + 6 * s],
          [W * 0.7 + 2 * s, H * 0.38 + 12 * s],
        ],
        p.accent
      );
      c.rect(W * 0.35, H * 0.5, 40 * s, 10 * s, [239, 68, 68]);
      c.circle(W * 0.35, H * 0.55, 8 * s, [250, 204, 21]);
      c.circle(W * 0.35 + 40 * s, H * 0.55, 8 * s, [250, 204, 21]);
      ellipse(c, W * 0.25, H * 0.8, 30 * s, 10 * s, [240, 220, 160]);
      person(c, W * 0.2, H * 0.85, s, p.accent);
      c.circle(W * 0.28, H * 0.86, 3 * s, WHITE);
      return;
    }
    for (let i = 0; i < 8; i++)
      c.rect(0, (i * H) / 8, W, H / 8, i % 2 ? [56, 142, 60] : [67, 160, 71]);
    c.rect(W / 2 - s, 0, 2 * s, H, WHITE, 0.8);
    c.circle(W / 2, H / 2, 26 * s, WHITE, 0.25);
    c.rect(W * 0.92, H * 0.35, 4 * s, H * 0.3, WHITE);
    c.circle(W * (0.4 + r() * 0.3), H * (0.4 + r() * 0.3), 7 * s, WHITE);
    for (let i = 0; i < 4; i++)
      person(
        c,
        W * (0.15 + i * 0.22),
        H * (0.55 + r() * 0.3),
        s * 0.9,
        i % 2 ? p.accent : p.accent2
      );
  },

  Strategy(c, r, p, s, g) {
    const { width: W, height: H } = c;
    const variant = ['towers', 'castle', 'shop', 'map'][g.variant % 4];
    if (variant === 'shop') {
      c.gradient(...p.sky);
      c.rect(0, H * 0.75, W, H * 0.25, [148, 163, 184]);
      const sx = W * 0.3;
      c.rect(sx, H * 0.5, 90 * s, 50 * s, [250, 204, 21]);
      for (let i = 0; i < 5; i++)
        c.rect(sx - 6 * s + i * 20 * s, H * 0.42, 20 * s, 12 * s, i % 2 ? WHITE : [239, 68, 68]);
      c.rect(sx + 4 * s, H * 0.42 + 12 * s, 3 * s, H * 0.08, [120, 80, 40]);
      c.rect(sx + 80 * s, H * 0.42 + 12 * s, 3 * s, H * 0.08, [120, 80, 40]);
      for (let i = 0; i < 3; i++)
        c.rect(sx + (14 + i * 22) * s, H * 0.5 - 14 * s, 10 * s, 14 * s, [253, 224, 71], 0.85);
      for (let i = 0; i < 4; i++)
        person(
          c,
          W * (0.68 + i * 0.08),
          H * 0.85,
          s * 0.9,
          pick(r, [p.accent, p.accent2, [52, 211, 153]])
        );
      c.rect(W * 0.06, H * 0.08, W * 0.3, H * 0.25, WHITE, 0.85);
      let gy = H * 0.3;
      for (let i = 0; i < 6; i++) {
        const ny = gy - r() * H * 0.04;
        c.rect(W * 0.08 + i * W * 0.045, ny, W * 0.04, H * 0.33 - ny, [52, 211, 153]);
        gy = ny;
      }
      return;
    }
    const tile = Math.round(24 * s);
    for (let y = 0; y < H; y += tile)
      for (let x = 0; x < W; x += tile)
        c.rect(x, y, tile, tile, hsl((p.hue + 100) % 360, 0.45, 0.38 + r() * 0.06));
    if (variant === 'map') {
      c.polygon(
        [
          [W * 0.55, H * 0.2],
          [W * 0.75, H * 0.65],
          [W * 0.35, H * 0.65],
        ],
        [120, 90, 80]
      );
      c.polygon(
        [
          [W * 0.5, H * 0.3],
          [W * 0.6, H * 0.3],
          [W * 0.55, H * 0.2],
        ],
        [239, 68, 68]
      );
      for (let i = 0; i < 5; i++)
        c.circle(
          W * (0.5 + r() * 0.1),
          H * (0.05 + r() * 0.12),
          (5 + r() * 6) * s,
          [148, 163, 184],
          0.7
        );
      c.shape(
        W * 0.55,
        H * 0.3,
        W * 0.8,
        H,
        [239, 68, 68],
        (x, y) => Math.abs(x - (W * 0.6 + Math.sin(y / (20 * s)) * 10 * s)) < 4 * s,
        0.9
      );
      for (let i = 0; i < 6; i++) {
        const hx = W * (0.08 + r() * 0.3);
        const hy = H * (0.4 + r() * 0.5);
        c.rect(hx, hy, 14 * s, 10 * s, [226, 196, 150]);
        c.polygon(
          [
            [hx - 2 * s, hy],
            [hx + 7 * s, hy - 8 * s],
            [hx + 16 * s, hy],
          ],
          [185, 28, 28]
        );
      }
      return;
    }
    let x = 0;
    let y = Math.floor((H / tile) * (0.2 + r() * 0.3)) * tile;
    const path = [];
    while (x < W) {
      path.push([x, y]);
      c.rect(x, y, tile, tile, [196, 164, 120]);
      if (r() < 0.3 && y + tile * 2 < H) y += tile;
      else x += tile;
    }
    for (let i = 0; i < 5; i++) {
      const [px, py] = pick(r, path);
      const tx = px + (r() < 0.5 ? tile : -tile);
      const ty = py + (r() < 0.5 ? -tile : tile);
      c.rect(tx + tile * 0.15, ty + tile * 0.15, tile * 0.7, tile * 0.7, [120, 113, 108]);
      c.circle(tx + tile / 2, ty + tile / 2, tile * 0.22, p.accent);
    }
    for (let i = 0; i < 6; i++) {
      const [px, py] = path[Math.floor(r() * path.length * 0.7)];
      c.circle(px + tile / 2, py + tile / 2, tile * 0.18, p.accent2);
    }
    const [ex, ey] = path[path.length - 1];
    if (variant === 'castle') {
      const cw = tile * 3;
      c.rect(ex - cw, ey - tile * 2, cw, tile * 3, [196, 164, 120]);
      for (let i = 0; i < 3; i++)
        c.rect(ex - cw + i * tile, ey - tile * 2.5, tile * 0.6, tile * 0.5, [196, 164, 120]);
      c.rect(ex - cw * 0.6, ey - tile * 0.2, tile, tile * 1.2, [120, 80, 40]);
    } else {
      c.rect(ex - tile, ey - tile, tile * 1.6, tile * 2, [148, 163, 184]);
      c.polygon(
        [
          [ex - tile, ey - tile],
          [ex - tile * 0.2, ey - tile * 1.8],
          [ex + tile * 0.6, ey - tile],
        ],
        p.accent
      );
    }
  },

  'Escape the Room'(c, r, p, s, g) {
    const { width: W, height: H } = c;
    const variant = ['bedroom', 'treehouse', 'laundromat'][g.variant % 3];
    const floor = H * 0.72;
    const wall =
      variant === 'treehouse'
        ? [150, 105, 65]
        : variant === 'laundromat'
          ? [180, 220, 210]
          : hsl(p.hue, 0.25, 0.55);
    c.gradient(
      wall,
      wall.map((v) => v * 0.8)
    );
    if (variant === 'treehouse')
      for (let y = 0; y < floor; y += 16 * s) c.rect(0, y, W, 2, BLACK, 0.25);
    else
      c.rect(
        0,
        floor - 30 * s,
        W,
        30 * s,
        wall.map((v) => v * 0.7)
      );
    c.rect(
      0,
      floor,
      W,
      H - floor,
      variant === 'laundromat' ? [226, 232, 240] : hsl((p.hue + 30) % 360, 0.35, 0.28)
    );
    if (variant === 'laundromat')
      for (let x = 0; x < W; x += 20 * s)
        for (let y = floor; y < H; y += 20 * s)
          if (((x + y) / (20 * s)) % 2 < 1) c.rect(x, y, 20 * s, 20 * s, [148, 163, 184]);
    const dx = W * 0.08;
    c.rect(dx - 4 * s, floor - 110 * s, 64 * s, 110 * s, [90, 60, 40]);
    c.rect(dx, floor - 106 * s, 56 * s, 106 * s, [140, 95, 60]);
    c.circle(dx + 46 * s, floor - 52 * s, 4 * s, GOLD);
    c.rect(dx + 40 * s, floor - 70 * s, 12 * s, 8 * s, [220, 38, 38]);
    if (variant === 'laundromat') {
      for (let i = 0; i < 3; i++) {
        const mx = W * 0.42 + i * 46 * s;
        c.rect(mx, floor - 50 * s, 40 * s, 50 * s, WHITE);
        c.circle(mx + 20 * s, floor - 22 * s, 13 * s, [100, 116, 139]);
        c.circle(mx + 20 * s, floor - 22 * s, 9 * s, [125, 211, 252]);
        c.rect(mx + 4 * s, floor - 46 * s, 20 * s, 5 * s, [148, 163, 184]);
      }
    } else if (variant === 'treehouse') {
      c.rect(W * 0.55, H * 0.12, 70 * s, 56 * s, [90, 60, 40]);
      c.rect(W * 0.55 + 5 * s, H * 0.12 + 5 * s, 60 * s, 46 * s, [125, 211, 252]);
      for (let i = 0; i < 4; i++)
        c.circle(W * 0.55 + (12 + i * 16) * s, H * 0.12 + 40 * s, 10 * s, [34, 140, 60]);
      c.rect(W * 0.7, floor - 60 * s, 8 * s, 60 * s, [120, 80, 40]);
      for (let y = floor - 54 * s; y < floor; y += 12 * s)
        c.rect(W * 0.7 - 8 * s, y, 24 * s, 3 * s, [120, 80, 40]);
    } else {
      const fx = W * 0.6;
      c.rect(fx, H * 0.15, 60 * s, 44 * s, [120, 80, 40]);
      c.rect(fx + 5 * s, H * 0.15 + 5 * s, 50 * s, 34 * s, p.sky[0]);
      c.rect(W * 0.55, floor - 46 * s, 80 * s, 46 * s, [160, 110, 70]);
      for (let i = 0; i < 3; i++) {
        c.rect(W * 0.55 + 4 * s, floor - (42 - i * 14) * s, 72 * s, 11 * s, [180, 130, 85]);
        c.rect(W * 0.55 + 36 * s, floor - (38 - i * 14) * s, 8 * s, 3 * s, GOLD);
      }
      c.rect(W * 0.55 + 70 * s, floor - 34 * s, 22 * s, 6 * s, pick(r, [p.accent, p.accent2]));
    }
    c.rect(W * (0.3 + r() * 0.1), floor + 18 * s, 12 * s, 3 * s, GOLD);
    c.circle(W * (0.3 + r() * 0.1), floor + 20 * s, 4 * s, GOLD);
  },

  'Dress Up'(c, r, p, s, g) {
    const { width: W, height: H } = c;
    c.gradient(hsl(p.hue, 0.7, 0.86), hsl((p.hue + 40) % 360, 0.6, 0.72));
    const x = W * 0.38;
    const y = H * 0.9;
    ellipse(c, x, y, 50 * s, 10 * s, WHITE, 0.6);
    if (g.tags.includes('Robots')) {
      c.rect(x - 22 * s, y - 100 * s, 44 * s, 56 * s, [148, 163, 184]);
      c.rect(x - 18 * s, y - 44 * s, 10 * s, 44 * s, [100, 116, 139]);
      c.rect(x + 8 * s, y - 44 * s, 10 * s, 44 * s, [100, 116, 139]);
      c.rect(x - 16 * s, y - 134 * s, 32 * s, 30 * s, [148, 163, 184]);
      c.rect(x - 10 * s, y - 126 * s, 7 * s, 7 * s, [56, 189, 248]);
      c.rect(x + 3 * s, y - 126 * s, 7 * s, 7 * s, [56, 189, 248]);
      c.rect(x - 1 * s, y - 146 * s, 2 * s, 12 * s, BLACK);
      c.circle(x, y - 148 * s, 4 * s, [239, 68, 68]);
      c.polygon(
        [
          [x - 26 * s, y - 100 * s],
          [x + 26 * s, y - 100 * s],
          [x + 34 * s, y - 50 * s],
          [x - 34 * s, y - 50 * s],
        ],
        p.accent,
        0.85
      );
      c.rect(x - 22 * s, y - 70 * s, 44 * s, 6 * s, GOLD);
    } else if (g.tags.includes('Animals')) {
      const green = [74, 180, 90];
      ellipse(c, x, y - 50 * s, 34 * s, 40 * s, green);
      c.polygon(
        [
          [x + 28 * s, y - 40 * s],
          [x + 70 * s, y - 10 * s],
          [x + 24 * s, y - 20 * s],
        ],
        green
      );
      ellipse(c, x - 10 * s, y - 110 * s, 22 * s, 18 * s, green);
      for (let i = 0; i < 4; i++)
        c.polygon(
          [
            [x + (6 - i * 2) * s, y - (124 - i * 22) * s],
            [x + (20 - i * 2) * s, y - (118 - i * 22) * s],
            [x + (8 - i * 2) * s, y - (108 - i * 22) * s],
          ],
          [250, 204, 21]
        );
      c.circle(x - 16 * s, y - 114 * s, 4 * s, WHITE);
      c.circle(x - 16 * s, y - 114 * s, 2 * s, BLACK);
      c.rect(x - 14 * s, y - 2 * s, 10 * s, 4 * s, green);
      c.rect(x + 6 * s, y - 2 * s, 10 * s, 4 * s, green);
      c.polygon(
        [
          [x - 30 * s, y - 70 * s],
          [x + 30 * s, y - 70 * s],
          [x + 36 * s, y - 20 * s],
          [x - 36 * s, y - 20 * s],
        ],
        p.accent,
        0.9
      );
      c.polygon(
        [
          [x - 26 * s, y - 128 * s],
          [x + 6 * s, y - 128 * s],
          [x - 10 * s, y - 150 * s],
        ],
        p.accent2
      );
    } else {
      c.polygon(
        [
          [x, y - 110 * s],
          [x - 34 * s, y - 20 * s],
          [x + 34 * s, y - 20 * s],
        ],
        p.accent
      );
      c.rect(x - 10 * s, y - 20 * s, 6 * s, 20 * s, [241, 194, 150]);
      c.rect(x + 4 * s, y - 20 * s, 6 * s, 20 * s, [241, 194, 150]);
      c.circle(x, y - 122 * s, 16 * s, [241, 194, 150]);
      ellipse(
        c,
        x,
        y - 132 * s,
        19 * s,
        10 * s,
        pick(r, [
          [90, 50, 30],
          [250, 220, 120],
          [30, 30, 30],
          [200, 80, 40],
        ])
      );
    }
    for (let i = 0; i < 6; i++) {
      const sx = W * 0.7 + (i % 2) * 34 * s;
      const sy = H * 0.12 + Math.floor(i / 2) * 40 * s;
      c.rect(sx, sy, 28 * s, 32 * s, WHITE, 0.7);
      c.polygon(
        [
          [sx + 14 * s, sy + 4 * s],
          [sx + 5 * s, sy + 28 * s],
          [sx + 23 * s, sy + 28 * s],
        ],
        hsl((p.hue + i * 60) % 360, 0.7, 0.6)
      );
    }
  },

  Arcade(c, r, p, s, g) {
    const { width: W, height: H } = c;
    const variant = ['penguin', 'moon', 'fishbowl', 'desert', 'bricks'][g.variant % 5];
    if (variant === 'moon') {
      c.gradient([5, 5, 20], [20, 20, 50]);
      starfield(c, r, 60);
      c.circle(W * 0.8, H * 0.2, 22 * s, [96, 165, 250]);
      c.circle(W * 0.77, H * 0.18, 8 * s, [52, 211, 153]);
      c.rect(0, H * 0.6, W, H * 0.4, [156, 163, 175]);
      for (let i = 0; i < 10; i++)
        ellipse(
          c,
          r() * W,
          H * (0.65 + r() * 0.3),
          (6 + r() * 10) * s,
          (2 + r() * 3) * s,
          [107, 114, 128]
        );
      for (let y = H * 0.62; y < H; y += 8 * s) c.rect(0, y, W * 0.4, 4 * s, [120, 200, 100], 0.8);
      const mx = W * 0.45;
      c.rect(mx, H * 0.7, 30 * s, 14 * s, [239, 68, 68]);
      c.rect(mx - 16 * s, H * 0.6, 3 * s, 16 * s, BLACK);
      c.circle(mx + 6 * s, H * 0.7 + 16 * s, 5 * s, BLACK);
      c.circle(mx + 24 * s, H * 0.7 + 16 * s, 5 * s, BLACK);
      return;
    }
    if (variant === 'fishbowl') {
      c.gradient([14, 116, 144], [8, 51, 68]);
      for (let i = 0; i < 12; i++) c.circle(r() * W, r() * H, (2 + r() * 4) * s, WHITE, 0.4);
      c.rect(0, H * 0.88, W, H * 0.12, [253, 224, 160]);
      for (let i = 0; i < 4; i++)
        c.shape(
          W * (0.1 + i * 0.25),
          H * 0.6,
          W * (0.1 + i * 0.25) + 6 * s,
          H * 0.88,
          [34, 140, 60],
          () => true
        );
      for (let i = 0; i < 6; i++) {
        const fx = r() * W * 0.9 + W * 0.05;
        const fy = H * (0.15 + r() * 0.6);
        const color = pick(r, [[251, 146, 60], GOLD, p.accent2, [239, 68, 68]]);
        ellipse(c, fx, fy, 10 * s, 6 * s, color);
        c.polygon(
          [
            [fx + 8 * s, fy],
            [fx + 16 * s, fy - 6 * s],
            [fx + 16 * s, fy + 6 * s],
          ],
          color
        );
        c.circle(fx - 5 * s, fy - 1 * s, 1.5 * s, BLACK);
      }
      return;
    }
    if (variant === 'desert') {
      c.gradient([251, 191, 36], [253, 230, 138]);
      c.circle(W * 0.5, H * 0.3, 30 * s, [254, 249, 195], 0.8);
      c.rect(0, H * 0.75, W, H * 0.25, [217, 160, 90]);
      for (let i = 0; i < 4; i++) {
        const cx = W * (0.1 + i * 0.27);
        c.rect(cx - 5 * s, H * 0.75 - 40 * s, 10 * s, 40 * s, [34, 140, 60]);
        c.rect(cx - 15 * s, H * 0.75 - 30 * s, 6 * s, 14 * s, [34, 140, 60]);
        c.rect(cx + 9 * s, H * 0.75 - 34 * s, 6 * s, 14 * s, [34, 140, 60]);
      }
      for (let i = 0; i < 6; i++)
        c.circle(
          r() * W,
          H * (0.1 + r() * 0.5),
          5 * s,
          pick(r, [[239, 68, 68], p.accent2, [52, 211, 153]])
        );
      c.rect(W * (0.35 + r() * 0.2), H * 0.82, 40 * s, 10 * s, [120, 80, 40]);
      return;
    }
    c.gradient(BLACK, hsl(p.hue, 0.6, 0.15));
    for (let x = 0; x < W; x += 20 * s) c.rect(x, 0, 1, H, p.accent, 0.15);
    for (let y = 0; y < H; y += 20 * s) c.rect(0, y, W, 1, p.accent, 0.15);
    const colors = [p.accent, p.accent2, GOLD, [52, 211, 153]];
    for (let row = 0; row < 4; row++)
      for (let i = 0; i < 8; i++)
        if (r() > 0.15)
          c.rect(W * (0.04 + i * 0.12), H * (0.1 + row * 0.07), W * 0.11, H * 0.05, colors[row]);
    c.circle(W * (0.3 + r() * 0.4), H * 0.6, 6 * s, WHITE);
    c.rect(W * (0.3 + r() * 0.3), H * 0.88, W * 0.22, 8 * s, WHITE);
  },

  Toy(c, r, p, s, g) {
    const { width: W, height: H } = c;
    c.gradient(hsl(p.hue, 0.8, 0.8), hsl((p.hue + 60) % 360, 0.7, 0.6));
    const variant = ['pads', 'bubbles', 'planes', 'globe'][g.variant % 4];
    if (variant === 'pads') {
      for (let row = 0; row < 3; row++)
        for (let i = 0; i < 4; i++)
          c.circle(
            W * (0.16 + i * 0.23),
            H * (0.22 + row * 0.25),
            22 * s,
            hsl((p.hue + (row * 4 + i) * 30) % 360, 0.75, 0.55)
          );
    } else if (variant === 'bubbles') {
      for (let i = 0; i < 18; i++) {
        const x = r() * W;
        const y = r() * H;
        const rad = (8 + r() * 22) * s;
        c.circle(x, y, rad, WHITE, 0.35);
        c.circle(x - rad * 0.35, y - rad * 0.35, rad * 0.2, WHITE, 0.8);
      }
    } else if (variant === 'planes') {
      for (let y = 0; y < H; y += 20 * s) c.rect(0, y, W, 1, [30, 64, 175], 0.3);
      for (let i = 0; i < 4; i++) {
        const x = W * (0.15 + r() * 0.65);
        const y = H * (0.15 + i * 0.2);
        c.polygon(
          [
            [x + 34 * s, y],
            [x - 20 * s, y - 12 * s],
            [x - 8 * s, y],
            [x - 20 * s, y + 10 * s],
          ],
          WHITE
        );
        c.polygon(
          [
            [x + 34 * s, y],
            [x - 8 * s, y],
            [x - 12 * s, y + 6 * s],
          ],
          [203, 213, 225]
        );
        for (let j = 1; j < 5; j++)
          c.rect(x - (20 + j * 12) * s, y + Math.sin(j) * 3 * s, 6 * s, 2 * s, [30, 64, 175], 0.5);
      }
    } else {
      c.circle(W * 0.5, H * 0.45, 70 * s, [224, 242, 254], 0.6);
      c.rect(W * 0.5 - 50 * s, H * 0.45 + 50 * s, 100 * s, 30 * s, [120, 80, 40]);
      tree(c, W * 0.5, H * 0.45 + 40 * s, s * 2, [34, 140, 60]);
      for (let i = 0; i < 30; i++) {
        const a = r() * Math.PI * 2;
        const d = r() * 64 * s;
        c.circle(W * 0.5 + Math.cos(a) * d, H * 0.45 + Math.sin(a) * d, 2 * s, WHITE);
      }
      c.circle(W * 0.5 - 30 * s, H * 0.45 - 40 * s, 12 * s, WHITE, 0.5);
    }
  },

  Animation(c, r, p, s, g) {
    const { width: W, height: H } = c;
    c.gradient(...p.sky);
    c.rect(0, H * 0.7, W, H * 0.3, p.ground);
    const blob = (x, y, k, color) => {
      ellipse(c, x, y, 22 * k, 26 * k, color);
      c.circle(x - 7 * k, y - 8 * k, 6 * k, WHITE);
      c.circle(x + 7 * k, y - 8 * k, 6 * k, WHITE);
      c.circle(x - 6 * k, y - 7 * k, 3 * k, BLACK);
      c.circle(x + 8 * k, y - 7 * k, 3 * k, BLACK);
      c.rect(x - 8 * k, y + 8 * k, 16 * k, 3 * k, BLACK);
    };
    const variant = g.variant % 4;
    if (variant === 1) {
      c.rect(W * 0.3, H * 0.5, W * 0.4, 10 * s, [120, 80, 40]);
      c.rect(W * 0.4, H * 0.42, W * 0.2, H * 0.08, [253, 224, 160]);
      c.rect(W * 0.4, H * 0.45, W * 0.2, H * 0.02, [34, 140, 60]);
    }
    if (variant === 2)
      for (let i = 0; i < 4; i++)
        person(c, W * (0.2 + i * 0.2), H * 0.85, s * (1 + (i % 2) * 0.3), [30, 30, 30]);
    else if (variant === 3) {
      c.rect(W * 0.3, H * 0.55, W * 0.4, 14 * s, [253, 224, 160]);
      c.rect(W * 0.3, H * 0.55 + 14 * s, W * 0.4, 6 * s, [34, 140, 60]);
      c.rect(W * 0.3, H * 0.55 + 20 * s, W * 0.4, 6 * s, [239, 68, 68]);
      c.rect(W * 0.3, H * 0.55 + 26 * s, W * 0.4, 14 * s, [253, 224, 160]);
      blob(W * 0.15, H * 0.7, s, p.accent);
    } else {
      blob(W * 0.32, H * 0.66, s * 1.2, p.accent);
      if (variant === 0) blob(W * 0.68, H * 0.68, s, p.accent2);
    }
    bubble(c, W * 0.5, H * 0.3, s * 1.2, pick(r, ['HI!', 'UH OH', 'LUNCH?', 'WHAT']));
    const band = Math.max(8, Math.round(H * 0.08));
    c.rect(0, 0, W, band, BLACK);
    c.rect(0, H - band, W, band, BLACK);
    for (let x = 6 * s; x < W; x += 20 * s) {
      c.rect(x, band * 0.3, 8 * s, band * 0.4, WHITE, 0.8);
      c.rect(x, H - band * 0.7, 8 * s, band * 0.4, WHITE, 0.8);
    }
  },
};

const HUD = {
  Puzzle: 'LEVEL 12',
  Strategy: 'WAVE 7',
  Driving: 'LAP 2/3',
  'Escape the Room': 'ITEMS 3',
  Adventure: 'ITEMS 3',
  'Dress Up': 'LOOK 4',
};

function scene(game, width, height, seed) {
  const c = new Canvas(width, height);
  const r = random(game.title + seed);
  const p = palette(random(game.title));
  SCENES[game.tags[0]](c, r, p, Math.min(width, height) / 256, game);
  return c;
}

function logo(game) {
  if (game.title === 'Pixel Penguin Panic') {
    const c = new Canvas(256, 256);
    penguinScene(c, 200, 2);
    fish(c, 60, 60, 2);
    fish(c, 196, 96, 2);
    penguin(c, 128, 196, 2.6);
    c.rect(0, 206, 256, 50, [10, 10, 20], 0.45);
    drawText(c, 'PENGUIN', Math.round((256 - textWidth('PENGUIN', 4)) / 2), 216, 4, WHITE);
    return c.png();
  }
  const c = scene(game, 256, 256, ' logo');
  const lines = wrap(game.title, 13);
  const scale = 3;
  const top = 256 - lines.length * 8 * scale - 6;
  c.rect(0, top - 6, 256, 256 - top + 6, [10, 10, 20], 0.6);
  lines.forEach((line, i) => {
    drawText(
      c,
      line,
      Math.round((256 - textWidth(line, scale)) / 2),
      top + i * 8 * scale,
      scale,
      WHITE
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
    drawText(c, 'SCORE 00120', 16, 16, 3, WHITE, null);
    drawText(
      c,
      'PIXEL PENGUIN PANIC',
      Math.round((640 - textWidth('PIXEL PENGUIN PANIC', 4)) / 2),
      70,
      4,
      WHITE,
      null
    );
    return c.png();
  }
  const genre = game.tags[0];
  const c = scene(game, 640, 480, ' screenshot');
  if (genre === 'Toy' || genre === 'Animation') return c.png();
  const label = HUD[genre] ?? 'SCORE 004200';
  c.rect(0, 0, 640, 40, [10, 10, 20], 0.5);
  drawText(c, game.title, 14, 12, 2, WHITE);
  drawText(c, label, 640 - 14 - textWidth(label, 2), 12, 2, [255, 230, 120]);
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
  ['The Lost Floppy', 'Flash', 'Adventure', ['Computers'], null],
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
].map(([title, platform, genre, extra, date, library], i, all) => {
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
    // Which of its genre's scene layouts the art uses
    variant: all.slice(0, i).filter((other) => other[2] === genre).length,
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
