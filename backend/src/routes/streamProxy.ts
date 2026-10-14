import { ServerResponse, type IncomingMessage, type Server } from 'http';
import type { Socket } from 'net';
import type { Express } from 'express';
import { createProxyMiddleware } from 'http-proxy-middleware';
import { logger } from '../utils/logger';

/**
 * Proxies /stream/ to the session manager, WebSockets included, so a reverse
 * proxy in front of the app needs no route of its own for streams. Returns a
 * function that wires WebSocket upgrades into the HTTP server once it exists.
 */
export function mountStreamProxy(app: Express, target: string): (server: Server) => void {
  const proxy = createProxyMiddleware('/stream/', {
    target,
    ws: true,
    logLevel: 'silent',
    // Save sync is a long-lived event stream; don't let the server's idle timeout cut it
    onProxyReq: (_proxyReq, req) => {
      req.socket.setTimeout(0);
    },
    onError: (error, req, res) => {
      logger.warn('[Streaming] Stream proxy error', { url: req.url, error: error.message });
      // A failed WebSocket upgrade hands over the raw socket instead of a response
      if (!(res instanceof ServerResponse)) {
        (res as Socket).destroy();
      } else if (!res.headersSent) {
        res.writeHead(502).end();
      }
    },
  });
  app.use(proxy);

  return (server) => {
    server.on('upgrade', (req: IncomingMessage, socket: Socket, head: Buffer) => {
      if (!req.url?.startsWith('/stream/')) return;
      socket.setTimeout(0);
      proxy.upgrade?.(req as Parameters<NonNullable<typeof proxy.upgrade>>[0], socket, head);
    });
  };
}
