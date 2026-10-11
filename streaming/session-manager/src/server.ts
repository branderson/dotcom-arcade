import http from 'node:http';
import { text } from 'node:stream/consumers';
import { timingSafeEqual } from 'node:crypto';
import httpProxy from 'http-proxy';
import { streamPath, type Driver } from './docker.ts';
import { parseSaveFiles } from './saves.ts';
import { SessionError, type SessionManager } from './sessions.ts';

const STREAM_URL = /^\/stream\/([0-9a-f]{32})(\/.*)$/;
const HEARTBEAT_MS = 25_000;
const MAX_BODY_BYTES = 16 * 1024 * 1024;

/** Internal API for flashpoint-web's backend: creates sessions. */
export function createApiServer(sessions: SessionManager, token: string): http.Server {
  return http.createServer((req, res) => {
    handle(res, async () => {
      if (req.method !== 'POST' || req.url !== '/sessions') {
        throw new SessionError(404, 'not found');
      }
      if (!tokenMatches(req.headers.authorization, token)) {
        throw new SessionError(401, 'unauthorized');
      }
      const { gameId } = await readJson(req);
      if (typeof gameId !== 'string') {
        throw new SessionError(400, 'gameId is required');
      }
      const { id, size } = await sessions.create(gameId);
      sendJson(res, 201, { id, path: streamPath(id), ...size });
    });
  });
}

/** Public server: starts sessions, streams their saves, and proxies Selkies. */
export function createStreamServer(sessions: SessionManager, driver: Driver): http.Server {
  const proxy = httpProxy.createProxyServer({ ws: true });
  proxy.on('error', (err, _req, res) => {
    if (res instanceof http.ServerResponse && !res.headersSent) {
      res.writeHead(502).end();
    } else {
      res.destroy();
    }
  });

  const server = http.createServer((req, res) => {
    handle(res, async () => {
      const [, id, rest] = req.url?.match(STREAM_URL) ?? [];
      if (!id || !sessions.has(id)) {
        throw new SessionError(404, 'no such session');
      }
      if (rest === '/_fp/start' && req.method === 'POST') {
        const { files } = await readJson(req);
        let saves;
        try {
          saves = parseSaveFiles(files ?? {});
        } catch (err) {
          throw new SessionError(400, (err as Error).message);
        }
        await sessions.start(id, saves);
        res.writeHead(204).end();
      } else if (rest === '/_fp/saves' && req.method === 'GET') {
        streamSaves(sessions, id, req, res);
      } else {
        proxy.web(req, res, { target: driver.url(id) });
      }
    });
  });

  server.on('upgrade', (req, socket, head) => {
    const [, id] = req.url?.match(STREAM_URL) ?? [];
    if (!id || !sessions.has(id)) {
      socket.destroy();
      return;
    }
    sessions.socketOpened(id);
    socket.on('close', () => sessions.socketClosed(id));
    proxy.ws(req, socket, head, { target: driver.url(id) });
  });

  return server;
}

function streamSaves(sessions: SessionManager, id: string, req: http.IncomingMessage, res: http.ServerResponse): void {
  res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'X-Accel-Buffering': 'no' });
  const heartbeat = setInterval(() => res.write(':\n\n'), HEARTBEAT_MS);
  const stop = sessions.watchSaves(id, (files) => {
    if (files) {
      res.write(`data: ${JSON.stringify({ files })}\n\n`);
    } else {
      res.end('event: end\ndata:\n\n');
    }
  });
  req.on('close', () => {
    clearInterval(heartbeat);
    stop();
  });
}

async function handle(res: http.ServerResponse, fn: () => Promise<void>): Promise<void> {
  try {
    await fn();
  } catch (err) {
    const status = err instanceof SessionError ? err.status : 500;
    if (status === 500) {
      console.error(err);
    }
    if (!res.headersSent) {
      sendJson(res, status, { error: err instanceof SessionError ? err.message : 'internal error' });
    }
  }
}

async function readJson(req: http.IncomingMessage): Promise<Record<string, unknown>> {
  if (Number(req.headers['content-length']) > MAX_BODY_BYTES) {
    throw new SessionError(413, 'body too large');
  }
  const body = await text(req);
  try {
    const value = body ? JSON.parse(body) : {};
    if (typeof value === 'object' && value !== null) {
      return value;
    }
  } catch {
    // Fall through to the error below.
  }
  throw new SessionError(400, 'invalid JSON body');
}

function sendJson(res: http.ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json' }).end(JSON.stringify(body));
}

function tokenMatches(header: string | undefined, token: string): boolean {
  const given = Buffer.from(header ?? '');
  const expected = Buffer.from(`Bearer ${token}`);
  return given.length === expected.length && timingSafeEqual(given, expected);
}
