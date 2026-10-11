import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { test } from 'node:test';
import { fromTar, parseSaveFiles, toTar } from '../src/saves.ts';

test('parseSaveFiles rejects paths outside the saves directory', () => {
  for (const path of ['/etc/passwd', '../x', 'a/../../x', 'a//b', './x', '']) {
    assert.throws(() => parseSaveFiles({ [path]: '' }), /invalid save path/);
  }
  assert.throws(() => parseSaveFiles({ a: 1 }), /invalid save data/);
  assert.throws(() => parseSaveFiles([]), /must be an object/);
  assert.deepEqual(parseSaveFiles({ 'a/b.sol': 'AA==' }), { 'a/b.sol': 'AA==' });
});

test('save files survive a tar round trip', async () => {
  const files = {
    'cookies.txt': Buffer.from('INSANIQUARIUM=abc\n').toString('base64'),
    'nested/dir/data.bin': Buffer.from([0, 255, 128, 10]).toString('base64'),
  };
  const tar = await toTar(files, 1000, 1000);
  assert.deepEqual(await fromTar(Readable.from([tar])), files);
});
