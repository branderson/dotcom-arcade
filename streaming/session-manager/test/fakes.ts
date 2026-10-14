import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { WebSocketServer } from 'ws';
import type { Driver } from '../src/docker.ts';
import type { Size } from '../src/games.ts';
import type { SaveFiles } from '../src/saves.ts';

/** Driver whose "containers" share one local HTTP and WebSocket server. */
export class FakeDriver implements Driver {
  readonly containers = new Map<string, { gameId: string; size: Size; saves: SaveFiles; started: boolean }>();
  readonly removed: string[] = [];
  /** Makes start() fail with this error, as a crashing streamer would */
  failStart?: Error;
  private server?: http.Server;

  async listen(): Promise<void> {
    this.server = http.createServer((req, res) => res.end(`upstream ${req.url}`));
    new WebSocketServer({ server: this.server }).on('connection', (ws) => ws.on('message', (m) => ws.send(`echo ${m}`)));
    await new Promise<void>((resolve) => this.server!.listen(0, resolve));
  }

  close(): void {
    this.server?.closeAllConnections();
    this.server?.close();
  }

  async create(id: string, gameId: string, size: Size): Promise<void> {
    this.containers.set(id, { gameId, size, saves: {}, started: false });
  }

  async start(id: string, saves: SaveFiles): Promise<void> {
    if (this.failStart) {
      throw this.failStart;
    }
    Object.assign(this.containers.get(id)!, { saves: { ...saves }, started: true });
  }

  async getSaves(id: string): Promise<SaveFiles> {
    return { ...this.containers.get(id)!.saves };
  }

  async remove(id: string): Promise<void> {
    this.containers.delete(id);
    this.removed.push(id);
  }

  async removeAll(): Promise<void> {}

  url(): string {
    return `http://127.0.0.1:${(this.server!.address() as AddressInfo).port}`;
  }
}

export const catalog = {
  async streamSize(gameId: string): Promise<Size | null> {
    return gameId === 'java' || gameId === '247a4c93-c252-49c8-8bc9-fb43d5c039df' ? { width: 472, height: 354 } : null;
  },
};

/** Collects log lines instead of printing them */
export class MemoryLog {
  readonly lines: string[] = [];
  log = (...args: unknown[]) => void this.lines.push(args.join(' '));
  error = (...args: unknown[]) => void this.lines.push(args.join(' '));
}

export const fastTimings = { connectTimeoutMs: 300, idleGraceMs: 100, savesPollMs: 20 };

export const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
