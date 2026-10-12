import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, writeFileSync, createWriteStream } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { finished } from 'node:stream/promises';
import { test } from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { deflateSync } from 'node:zlib';
import yazl from 'yazl';
import {
  appletSize,
  directorStageSize,
  embedSize,
  GameCatalog,
  projectorStageSize,
  swfStageSize,
} from '../src/games.ts';

/** A Director config chunk body with the given stage rect. */
function config(rect: [number, number, number, number]): Buffer {
  const body = Buffer.alloc(84);
  body.writeUInt16BE(84, 0);
  body.writeUInt16BE(0x163c, 2);
  rect.forEach((value, i) => body.writeInt16BE(value, 4 + i * 2));
  return body;
}

/** A fake projector holding a Director config chunk with the given stage rect. */
function projector(tag: 'FCRD' | 'DRCF' | 'VWCF', rect: [number, number, number, number]): Buffer {
  const header = Buffer.alloc(8);
  header.write(tag, 0, 'latin1');
  if (tag === 'FCRD') header.writeUInt32LE(84, 4);
  else header.writeUInt32BE(84, 4);
  // A stray tag with a nonsense size must be skipped
  return Buffer.concat([Buffer.from('MZ junk FCRD\xff\xff\xff\xff junk', 'latin1'), header, config(rect)]);
}

function varInt(value: number): Buffer {
  const bytes = [value & 0x7f];
  for (value = Math.floor(value / 128); value > 0; value = Math.floor(value / 128)) {
    bytes.unshift((value & 0x7f) | 0x80);
  }
  return Buffer.from(bytes);
}

/** A big-endian Afterburner (.dcr) movie whose initial load segment holds a zlib-compressed config. */
function afterburner(configTag: 'DRCF' | 'VWCF', rect: [number, number, number, number]): Buffer {
  const compressed = deflateSync(config(rect));
  const resource = (id: number, length: number, tag: string) =>
    Buffer.concat([varInt(id), varInt(0xffffffff), varInt(length), varInt(length), varInt(0), Buffer.from(tag, 'latin1')]);
  const ils = Buffer.concat([varInt(3), compressed]);
  const ilsCompressed = deflateSync(ils);
  const map = deflateSync(
    Buffer.concat([
      varInt(0),
      varInt(0),
      varInt(2),
      resource(2, ilsCompressed.length, 'ILS '),
      resource(3, compressed.length, configTag),
    ]),
  );
  const section = (tag: string, body: Buffer) => Buffer.concat([Buffer.from(tag, 'latin1'), varInt(body.length), body]);
  return Buffer.concat([
    Buffer.from('RIFX\0\0\0\0FGDM', 'latin1'),
    section('Fver', varInt(0x400)),
    section('Fcdr', deflateSync(Buffer.alloc(2))),
    section('ABMP', Buffer.concat([varInt(0), varInt(0), map])),
    Buffer.from('FGEI', 'latin1'),
    varInt(0),
    ilsCompressed,
  ]);
}

/** A SWF header with the given stage size, uncompressed or zlib-compressed. */
function swf(signature: 'FWS' | 'CWS', width: number, height: number): Buffer {
  const bits = 16;
  const fields = [0, width * 20, 0, height * 20].map((v) => v.toString(2).padStart(bits, '0')).join('');
  const rectBits = (bits.toString(2).padStart(5, '0') + fields).padEnd(Math.ceil((5 + 4 * bits) / 8) * 8, '0');
  const rect = Buffer.from(rectBits.match(/.{8}/g)!.map((b) => parseInt(b, 2)));
  const body = Buffer.concat([rect, Buffer.alloc(32)]);
  const header = Buffer.from(`${signature}\x0a\0\0\0\0`, 'latin1');
  return Buffer.concat([header, signature === 'CWS' ? deflateSync(body) : body]);
}

test('appletSize reads the first applet tag', () => {
  assert.deepEqual(appletSize('<APPLET code="a.class" WIDTH=472 height="354" mayscript>'), { width: 472, height: 354 });
  assert.deepEqual(appletSize(`<applet width='640' height='480'><applet width=1 height=1>`), { width: 640, height: 480 });
  assert.equal(appletSize('<applet width="100%" height="400">'), null);
  assert.equal(appletSize('<embed src="game.swf" width="550" height="400">'), null);
});

test('embedSize reads the largest embed or object', () => {
  assert.deepEqual(
    embedSize('<object width="640" height="480"><embed src="a.dcr" width=640 height=480></object><embed width=10 height=10>'),
    { width: 640, height: 480 },
  );
  assert.equal(embedSize('<embed src="a.swf" width="100%" height="100%">'), null);
});

test('projectorStageSize reads the stage rect from either byte order', () => {
  assert.deepEqual(projectorStageSize(projector('FCRD', [108, 112, 708, 912])), { width: 800, height: 600 });
  assert.deepEqual(projectorStageSize(projector('DRCF', [0, 0, 480, 640])), { width: 640, height: 480 });
  assert.deepEqual(projectorStageSize(projector('VWCF', [0, 0, 300, 400])), { width: 400, height: 300 });
  assert.equal(projectorStageSize(Buffer.from('MZ no config here')), null);
  assert.equal(projectorStageSize(Buffer.from('MZ truncated FCRD\x54')), null);
});

test('directorStageSize reads Afterburner-compressed Shockwave movies', () => {
  assert.deepEqual(directorStageSize(afterburner('DRCF', [0, 0, 425, 500])), { width: 500, height: 425 });
  assert.deepEqual(directorStageSize(afterburner('VWCF', [0, 0, 300, 400])), { width: 400, height: 300 });
  assert.equal(directorStageSize(Buffer.from('RIFX\0\0\0\0FGDMgarbage', 'latin1')), null);
});

test('swfStageSize reads uncompressed and zlib-compressed headers', () => {
  assert.deepEqual(swfStageSize(swf('FWS', 500, 375)), { width: 500, height: 375 });
  assert.deepEqual(swfStageSize(swf('CWS', 550, 400)), { width: 550, height: 400 });
  assert.equal(swfStageSize(Buffer.from('ZWS lzma')), null);
});

test('GameCatalog streams allowed platforms whose launcher resolves, sized from their content', async () => {
  const root = mkdtempSync(path.join(tmpdir(), 'fp-'));
  const file = (relative: string, data: string | Buffer = '') => {
    mkdirSync(path.dirname(path.join(root, relative)), { recursive: true });
    writeFileSync(path.join(root, relative), data);
  };
  file('Data/execs.json', JSON.stringify({ execs: [{ win32: 'FPSoftware\\Flash\\flashplayer_32_sa.exe', linux: 'FPSoftware/Flash/flash32.sh' }] }));
  file('FPSoftware/Flash/flash32.sh');
  file('FPSoftware/Shockwave/PJ101/SPR.exe');
  file('FPSoftware/fpnavigator-portable/FPNavigator.exe');
  file('FPSoftware/OldCPUSimulator/OldCPUSimulator.exe');
  file('FPSoftware/FlashpointSecurePlayer.sh');
  file('FPSoftware/startUnity.sh');
  file('LocalGames/aus/Game.exe', projector('FCRD', [108, 112, 708, 912]));
  file('Legacy/htdocs/example.com/my game/index.html', '<applet width=300 height=200>');
  file('Legacy/htdocs/example.com/page.html', '<embed src="game.dcr" width="512" height="384">');
  file('Legacy/htdocs/example.com/game.dcr', afterburner('DRCF', [0, 0, 425, 500]));
  file('Legacy/htdocs/example.com/game.swf', swf('CWS', 500, 375));
  file('Legacy/htdocs/example.com/movie.dir', projector('DRCF', [0, 0, 480, 640]));

  const zip = new yazl.ZipFile();
  zip.addBuffer(Buffer.from('<applet code="x" width="472" height="354">'), 'content/www.popcap.com/Insaniquarium/Java/index.html');
  zip.end();
  mkdirSync(path.join(root, 'Data', 'Games'), { recursive: true });
  await finished(zip.outputStream.pipe(createWriteStream(path.join(root, 'Data', 'Games', 'zip-1690495544502.zip'))));

  const db = new DatabaseSync(path.join(root, 'Data', 'flashpoint.sqlite'));
  db.exec(`
    create table game (id, platformName, applicationPath, launchCommand, activeDataId);
    create table game_data (id integer primary key, applicationPath, launchCommand, dateAdded);
    insert into game values ('zip', 'Java', 'FPSoftware\\startJavaInBrowser.bat', 'http://www.popcap.com/Insaniquarium/Java/INDEX.html', 1);
    insert into game_data values (1, '', '', '2023-07-27T22:05:44.502567Z');
    insert into game values ('legacy', 'Java', 'FPSoftware\\startJava.bat', 'http://example.com/my%20game/', null);
    insert into game values ('missing', 'Java', 'FPSoftware\\startJava.bat', 'http://example.com/none.html', null);
    insert into game values ('webstart', 'Java', 'FPSoftware\\startJavaWebStart.bat', 'http://example.com/a.jnlp', null);
    insert into game values ('spr', 'Shockwave', 'FPSoftware\\Shockwave\\PJ101\\SPR.exe', 'http://example.com/game.dcr --setTheRunMode "Plugin"', null);
    insert into game values ('oldcpu', 'Shockwave', 'FPSoftware\\OldCPUSimulator\\OldCPUSimulator.exe', '-t 366 -sw ..\\Shockwave\\PJ101\\SPR.exe http://example.com/game.dcr', null);
    insert into game values ('secure', 'Shockwave', 'FPSoftware\\FlashpointSecurePlayer.exe', 'shockwave256color "http://example.com/movie.dir"', null);
    insert into game values ('navigator', 'Shockwave', 'FPSoftware\\fpnavigator-portable\\fpnavigator.exe', 'http://example.com/page.html', null);
    insert into game values ('flash', 'Flash', 'FPSoftware\\Flash\\flashplayer_32_sa.exe', 'http://example.com/game.swf', null);
    insert into game values ('unity', 'Unity', 'FPSoftware\\startUnity.bat', 'http://example.com/a.unity3d', null);
    insert into game values ('no-program', 'Shockwave', 'FPSoftware\\Shockwave\\PJ9\\SPR.exe', 'http://example.com/game.dcr', null);
    insert into game values ('exe', 'Shockwave', 'LocalGames\\aus\\Game.exe', '', null);
    insert into game values ('missing-exe', 'Shockwave', 'LocalGames\\gone\\Game.exe', '', null);
  `);
  db.close();

  const catalog = new GameCatalog(root, ['Java', 'Shockwave', 'Flash']);
  const sizes = Object.fromEntries(
    await Promise.all(
      ['zip', 'legacy', 'missing', 'webstart', 'spr', 'oldcpu', 'secure', 'navigator', 'flash', 'unity', 'no-program', 'exe', 'missing-exe', 'unknown'].map(
        async (id) => [id, await catalog.streamSize(id)],
      ),
    ),
  );
  assert.deepEqual(sizes, {
    zip: { width: 472, height: 354 },
    legacy: { width: 300, height: 200 },
    missing: { width: 800, height: 600 },
    webstart: null,
    spr: { width: 500, height: 426 },
    oldcpu: { width: 500, height: 426 },
    secure: { width: 640, height: 480 },
    navigator: { width: 528, height: 400 },
    flash: { width: 500, height: 376 },
    unity: null,
    'no-program': null,
    exe: { width: 800, height: 600 },
    'missing-exe': null,
    unknown: null,
  });
});
