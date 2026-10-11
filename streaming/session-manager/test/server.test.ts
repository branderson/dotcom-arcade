import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { after, before, test } from 'node:test';
import WebSocket from 'ws';
import { createApiServer, createStreamServer } from '../src/server.ts';
import { SessionManager } from '../src/sessions.ts';
import { catalog, FakeDriver, fastTimings, sleep } from './fakes.ts';

const driver = new FakeDriver();
const sessions = new SessionManager(driver, catalog, 4, fastTimings);
const api = createApiServer(sessions, 'secret');
const stream = createStreamServer(sessions, driver);
let apiUrl: string;
let streamUrl: string;

before(async () => {
  await driver.listen();
  await new Promise<void>((resolve) => api.listen(0, resolve));
  await new Promise<void>((resolve) => stream.listen(0, resolve));
  apiUrl = `http://127.0.0.1:${(api.address() as AddressInfo).port}`;
  streamUrl = `http://127.0.0.1:${(stream.address() as AddressInfo).port}`;
});

after(async () => {
  await sessions.teardownAll();
  api.close();
  stream.closeAllConnections();
  stream.close();
  driver.close();
});

function createSession(gameId: string, token = 'secret') {
  return fetch(`${apiUrl}/sessions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({ gameId }),
  });
}

test('the API requires the token and reports unstreamable games', async () => {
  assert.equal((await createSession('java', 'wrong')).status, 401);
  assert.equal((await createSession('flash')).status, 422);
  const res = await createSession('java');
  assert.equal(res.status, 201);
  const body = await res.json();
  assert.match(body.path, /^\/stream\/[0-9a-f]{32}\/$/);
  assert.equal(body.width, 472);
  await sessions.teardown(body.id);
});

test('a session starts with saves, proxies HTTP and WebSocket, streams saves, and ends on disconnect', async () => {
  const { id, path } = await (await createSession('java')).json();
  assert.equal((await fetch(`${streamUrl}/stream/${'0'.repeat(32)}/`)).status, 404);
  assert.equal(
    (await fetch(`${streamUrl}${path}_fp/start`, { method: 'POST', body: JSON.stringify({ files: { '../x': '' } }) })).status,
    400,
  );
  const start = await fetch(`${streamUrl}${path}_fp/start`, {
    method: 'POST',
    body: JSON.stringify({ files: { 'cookies.txt': 'YQ==' } }),
  });
  assert.equal(start.status, 204);
  assert.deepEqual(driver.containers.get(id)!.saves, { 'cookies.txt': 'YQ==' });

  assert.equal(await (await fetch(`${streamUrl}${path}index.html`)).text(), `upstream ${path}index.html`);

  const ws = new WebSocket(`${streamUrl.replace('http', 'ws')}${path}websocket`);
  const reply = await new Promise((resolve, reject) => {
    ws.on('open', () => ws.send('hi'));
    ws.on('message', (m) => resolve(m.toString()));
    ws.on('error', reject);
  });
  assert.equal(reply, 'echo hi');

  const events = await fetch(`${streamUrl}${path}_fp/saves`);
  const reader = events.body!.pipeThrough(new TextDecoderStream()).getReader();
  assert.equal((await reader.read()).value, `data: ${JSON.stringify({ files: { 'cookies.txt': 'YQ==' } })}\n\n`);
  driver.containers.get(id)!.saves['cookies.txt'] = 'Yg==';
  assert.equal((await reader.read()).value, `data: ${JSON.stringify({ files: { 'cookies.txt': 'Yg==' } })}\n\n`);

  await sleep(400);
  assert.equal(sessions.has(id), true, 'kept alive while the WebSocket is open');
  ws.close();
  assert.equal((await reader.read()).value, 'event: end\ndata:\n\n');
  assert.equal(sessions.has(id), false);
  assert.ok(driver.removed.includes(id));
});
