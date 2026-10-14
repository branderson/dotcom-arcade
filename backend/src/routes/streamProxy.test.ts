import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import http, { type Server } from 'http';
import type { AddressInfo } from 'net';
import express from 'express';
import { mountStreamProxy } from './streamProxy';

vi.mock('../utils/logger', () => ({
  logger: { info: vi.fn(), error: vi.fn(), debug: vi.fn(), warn: vi.fn() },
}));

let upstream: Server;
let app: Server;
let base: string;

function listen(server: Server): Promise<number> {
  return new Promise((resolve) =>
    server.listen(0, '127.0.0.1', () => resolve((server.address() as AddressInfo).port))
  );
}

beforeAll(async () => {
  // A stand-in session manager: echoes the path, and accepts WebSocket upgrades
  upstream = http.createServer((req, res) => {
    res.setHeader('Content-Type', 'text/plain');
    res.end(`upstream saw ${req.method} ${req.url}`);
  });
  upstream.on('upgrade', (req, socket) => {
    socket.write(
      'HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n\r\n'
    );
    socket.write(`ws ${req.url}`);
    socket.end();
  });
  const upstreamPort = await listen(upstream);

  const expressApp = express();
  const attach = mountStreamProxy(expressApp, `http://127.0.0.1:${upstreamPort}`);
  expressApp.get('/other', (_req, res) => {
    res.send('app');
  });
  app = http.createServer(expressApp);
  attach(app);
  base = `http://127.0.0.1:${await listen(app)}`;
});

afterAll(() => {
  app.close();
  upstream.close();
});

describe('stream proxy', () => {
  it('forwards /stream/ requests with their full path', async () => {
    const res = await fetch(`${base}/stream/abc/_fp/start`, { method: 'POST' });
    expect(await res.text()).toBe('upstream saw POST /stream/abc/_fp/start');
  });

  it('leaves other routes to the app', async () => {
    expect(await (await fetch(`${base}/other`)).text()).toBe('app');
  });

  it('forwards WebSocket upgrades', async () => {
    const received = await new Promise<string>((resolve, reject) => {
      const req = http.request(`${base}/stream/abc/websocket`, {
        headers: { Connection: 'Upgrade', Upgrade: 'websocket' },
      });
      req.on('upgrade', (res, socket, head) => {
        expect(res.statusCode).toBe(101);
        let data = head.toString();
        socket.on('data', (chunk) => (data += chunk.toString()));
        socket.on('end', () => resolve(data));
      });
      req.on('error', reject);
      req.end();
    });
    expect(received).toBe('ws /stream/abc/websocket');
  });

  it('answers 502 when the session manager is down', async () => {
    const down = express();
    mountStreamProxy(down, 'http://127.0.0.1:9');
    const server = http.createServer(down);
    const port = await listen(server);
    const res = await fetch(`http://127.0.0.1:${port}/stream/abc/`);
    server.close();
    expect(res.status).toBe(502);
  });
});
