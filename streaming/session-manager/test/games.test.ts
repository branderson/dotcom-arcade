import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, writeFileSync, createWriteStream } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { finished } from 'node:stream/promises';
import { test } from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import yazl from 'yazl';
import { appletSize, GameCatalog, projectorStageSize } from '../src/games.ts';

/** A fake projector holding a Director config chunk with the given stage rect. */
function projector(tag: 'FCRD' | 'DRCF', rect: [number, number, number, number]): Buffer {
  const body = Buffer.alloc(84);
  body.writeUInt16BE(84, 0);
  body.writeUInt16BE(0x163c, 2);
  rect.forEach((value, i) => body.writeInt16BE(value, 4 + i * 2));
  const header = Buffer.alloc(8);
  header.write(tag, 0, 'latin1');
  if (tag === 'FCRD') header.writeUInt32LE(84, 4);
  else header.writeUInt32BE(84, 4);
  // A stray tag with a nonsense size must be skipped
  return Buffer.concat([Buffer.from('MZ junk FCRD\xff\xff\xff\xff junk', 'latin1'), header, body]);
}

test('appletSize reads the first applet tag', () => {
  assert.deepEqual(appletSize('<APPLET code="a.class" WIDTH=472 height="354" mayscript>'), { width: 472, height: 354 });
  assert.deepEqual(appletSize(`<applet width='640' height='480'><applet width=1 height=1>`), { width: 640, height: 480 });
  assert.equal(appletSize('<applet width="100%" height="400">'), null);
  assert.equal(appletSize('<embed src="game.swf" width="550" height="400">'), null);
});

test('projectorStageSize reads the stage rect from either byte order', () => {
  assert.deepEqual(projectorStageSize(projector('FCRD', [108, 112, 708, 912])), { width: 800, height: 600 });
  assert.deepEqual(projectorStageSize(projector('DRCF', [0, 0, 480, 640])), { width: 640, height: 480 });
  assert.equal(projectorStageSize(Buffer.from('MZ no config here')), null);
  assert.equal(projectorStageSize(Buffer.from('MZ truncated FCRD\x54')), null);
});

test('GameCatalog sizes streamable games from their GameZIP or htdocs', async () => {
  const root = mkdtempSync(path.join(tmpdir(), 'fp-'));
  mkdirSync(path.join(root, 'Data', 'Games'), { recursive: true });
  mkdirSync(path.join(root, 'Legacy', 'htdocs', 'example.com', 'my game'), { recursive: true });
  mkdirSync(path.join(root, 'LocalGames', 'aus'), { recursive: true });
  writeFileSync(path.join(root, 'LocalGames', 'aus', 'Game.exe'), projector('FCRD', [108, 112, 708, 912]));
  writeFileSync(path.join(root, 'Legacy', 'htdocs', 'example.com', 'my game', 'index.html'), '<applet width=300 height=200>');

  const zip = new yazl.ZipFile();
  zip.addBuffer(Buffer.from('<applet code="x" width="472" height="354">'), 'content/www.popcap.com/Insaniquarium/Java/index.html');
  zip.end();
  await finished(zip.outputStream.pipe(createWriteStream(path.join(root, 'Data', 'Games', 'zip-1690495544502.zip'))));

  const db = new DatabaseSync(path.join(root, 'Data', 'flashpoint.sqlite'));
  db.exec(`
    create table game (id, applicationPath, launchCommand, activeDataId);
    create table game_data (id integer primary key, applicationPath, launchCommand, dateAdded);
    insert into game values ('zip', 'FPSoftware\\startJavaInBrowser.bat', 'http://www.popcap.com/Insaniquarium/Java/INDEX.html', 1);
    insert into game_data values (1, '', '', '2023-07-27T22:05:44.502567Z');
    insert into game values ('legacy', 'FPSoftware\\startJava.bat', 'http://example.com/my%20game/', null);
    insert into game values ('missing', 'FPSoftware\\startJava.bat', 'http://example.com/none.html', null);
    insert into game values ('flash', 'FPSoftware\\Flash\\flashplayer_32_sa.exe', 'http://example.com/a.swf', null);
    insert into game values ('exe', 'LocalGames\\aus\\Game.exe', '', null);
    insert into game values ('missing-exe', 'LocalGames\\gone\\Game.exe', '', null);
  `);
  db.close();

  const catalog = new GameCatalog(root);
  assert.deepEqual(await catalog.streamSize('zip'), { width: 472, height: 354 });
  assert.deepEqual(await catalog.streamSize('legacy'), { width: 300, height: 200 });
  assert.deepEqual(await catalog.streamSize('missing'), { width: 800, height: 600 });
  assert.equal(await catalog.streamSize('flash'), null);
  assert.deepEqual(await catalog.streamSize('exe'), { width: 800, height: 600 });
  assert.equal(await catalog.streamSize('missing-exe'), null);
  assert.equal(await catalog.streamSize('unknown'), null);
});
