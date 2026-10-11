import assert from 'node:assert/strict';
import { test } from 'node:test';
import { SessionError, SessionManager } from '../src/sessions.ts';
import { catalog, FakeDriver, fastTimings, sleep } from './fakes.ts';

test('rejects unstreamable games and enforces the session cap', async () => {
  const sessions = new SessionManager(new FakeDriver(), catalog, 1, fastTimings);
  await assert.rejects(sessions.create('flash'), (e: SessionError) => e.status === 422);
  const { id, size } = await sessions.create('java');
  assert.deepEqual(size, { width: 472, height: 354 });
  await assert.rejects(sessions.create('java'), (e: SessionError) => e.status === 503);
  await sessions.teardown(id);
  await sessions.create('java');
  await sessions.teardownAll();
});

test('removes a session that is never connected to', async () => {
  const driver = new FakeDriver();
  const sessions = new SessionManager(driver, catalog, 4, fastTimings);
  const { id } = await sessions.create('java');
  await sessions.start(id, {});
  await sleep(400);
  assert.equal(sessions.has(id), false);
  assert.deepEqual(driver.removed, [id]);
});

test('keeps a session while connected and survives a quick reconnect', async () => {
  const driver = new FakeDriver();
  const sessions = new SessionManager(driver, catalog, 4, fastTimings);
  const { id } = await sessions.create('java');
  await sessions.start(id, {});
  sessions.socketOpened(id);
  await sleep(400);
  assert.equal(sessions.has(id), true);
  sessions.socketClosed(id);
  await sleep(50);
  sessions.socketOpened(id);
  await sleep(200);
  assert.equal(sessions.has(id), true);
  sessions.socketClosed(id);
  await sleep(200);
  assert.equal(sessions.has(id), false);
});

test('starts with the given saves, pushes changes, and ends with a final push', async () => {
  const driver = new FakeDriver();
  const sessions = new SessionManager(driver, catalog, 4, fastTimings);
  const { id } = await sessions.create('java');
  await sessions.start(id, { 'cookies.txt': 'YQ==' });
  await assert.rejects(sessions.start(id, {}), (e: SessionError) => e.status === 409);
  assert.deepEqual(driver.containers.get(id)!.saves, { 'cookies.txt': 'YQ==' });

  const seen: unknown[] = [];
  sessions.watchSaves(id, (files) => seen.push(files));
  driver.containers.get(id)!.saves['cookies.txt'] = 'Yg==';
  await sleep(60);
  driver.containers.get(id)!.saves['cookies.txt'] = 'Yw==';
  await sessions.teardown(id);
  assert.deepEqual(seen, [{ 'cookies.txt': 'YQ==' }, { 'cookies.txt': 'Yg==' }, { 'cookies.txt': 'Yw==' }, null]);
});
