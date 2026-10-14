import assert from 'node:assert/strict';
import { test } from 'node:test';
import { dockerLogText, waitUntilReady } from '../src/docker.ts';

test('waitUntilReady resolves once the streamer answers', async () => {
  let polls = 0;
  await waitUntilReady(async () => ++polls >= 3, async () => null, 1000, 1);
  assert.equal(polls, 3);
});

test('waitUntilReady fails as soon as the streamer exits', async () => {
  const started = Date.now();
  await assert.rejects(
    waitUntilReady(async () => false, async () => 139, 5000, 1),
    /exited with code 139/,
  );
  assert.ok(Date.now() - started < 1000);
});

test('waitUntilReady gives up after the timeout', async () => {
  await assert.rejects(waitUntilReady(async () => false, async () => null, 30, 1), /not ready after/);
});

test('dockerLogText reads framed and plain log output', () => {
  const frame = (stream: number, text: string) => {
    const header = Buffer.alloc(8);
    header[0] = stream;
    header.writeUInt32BE(Buffer.byteLength(text), 4);
    return Buffer.concat([header, Buffer.from(text)]);
  };
  assert.equal(dockerLogText(Buffer.concat([frame(1, 'starting\n'), frame(2, 'boom\n')])), 'starting\nboom');
  assert.equal(dockerLogText(Buffer.from('plain output\n')), 'plain output');
});
