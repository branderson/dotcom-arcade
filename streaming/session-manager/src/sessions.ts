import { randomBytes } from 'node:crypto';
import type { Driver } from './docker.ts';
import type { GameCatalog, Size } from './games.ts';
import type { SaveFiles } from './saves.ts';

export interface SessionTimings {
  /** How long a new session may wait for its first connection. */
  connectTimeoutMs: number;
  /** How long a session survives with no connections, to allow reconnecting. */
  idleGraceMs: number;
  /** How often saves are read from a running session. */
  savesPollMs: number;
}

/** Where lifecycle events and failures are reported. */
export type Log = Pick<Console, 'log' | 'error'>;

export const DEFAULT_TIMINGS: SessionTimings = {
  connectTimeoutMs: 120_000,
  idleGraceMs: 30_000,
  savesPollMs: 2_000,
};

export class SessionError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

type SavesListener = (files: SaveFiles | null) => void;

interface Session {
  id: string;
  state: 'created' | 'starting' | 'running';
  sockets: number;
  teardownTimer?: NodeJS.Timeout;
  pollTimer?: NodeJS.Timeout;
  saves: string;
  listeners: Set<SavesListener>;
}

/** Tracks streamer sessions and tears each down once its player is gone. */
export class SessionManager {
  private readonly sessions = new Map<string, Session>();
  private readonly driver: Driver;
  private readonly catalog: Pick<GameCatalog, 'streamSize'>;
  private readonly maxSessions: number;
  private readonly timings: SessionTimings;
  private readonly log: Log;

  constructor(
    driver: Driver,
    catalog: Pick<GameCatalog, 'streamSize'>,
    maxSessions: number,
    timings: SessionTimings = DEFAULT_TIMINGS,
    log: Log = console,
  ) {
    this.driver = driver;
    this.catalog = catalog;
    this.maxSessions = maxSessions;
    this.timings = timings;
    this.log = log;
  }

  async create(gameId: string): Promise<{ id: string; size: Size }> {
    if (this.sessions.size >= this.maxSessions) {
      throw new SessionError(503, 'too many sessions');
    }
    const size = await this.catalog.streamSize(gameId);
    if (!size) {
      throw new SessionError(422, 'game is not streamable');
    }
    const id = randomBytes(16).toString('hex');
    const session: Session = { id, state: 'created', sockets: 0, saves: '{}', listeners: new Set() };
    this.sessions.set(id, session);
    try {
      await this.driver.create(id, gameId, size);
    } catch (err) {
      this.sessions.delete(id);
      throw err;
    }
    this.log.log(`Session ${id}: created for game ${gameId} at ${size.width}x${size.height}`);
    this.scheduleTeardown(session, this.timings.connectTimeoutMs, 'nobody connected');
    return { id, size };
  }

  has(id: string): boolean {
    return this.sessions.has(id);
  }

  /** Starts a session's container with the player's saves. */
  async start(id: string, saves: SaveFiles): Promise<void> {
    const session = this.get(id);
    if (session.state !== 'created') {
      throw new SessionError(409, 'session already started');
    }
    session.state = 'starting';
    session.saves = canonical(saves);
    const started = Date.now();
    try {
      await this.driver.start(id, saves);
    } catch (err) {
      this.log.error(`Session ${id}: failed to start: ${(err as Error).message}`);
      await this.teardown(id, 'failed to start');
      throw new SessionError(502, 'game failed to start');
    }
    session.state = 'running';
    this.log.log(`Session ${id}: ready in ${((Date.now() - started) / 1000).toFixed(1)}s`);
    this.startPolling(session);
  }

  socketOpened(id: string): void {
    const session = this.sessions.get(id);
    if (session) {
      session.sockets++;
      clearTimeout(session.teardownTimer);
    }
  }

  socketClosed(id: string): void {
    const session = this.sessions.get(id);
    if (session && --session.sockets === 0) {
      this.scheduleTeardown(session, this.timings.idleGraceMs, 'player left');
    }
  }

  /** Calls the listener with the current saves and whenever they change, then with null at teardown. */
  watchSaves(id: string, listener: SavesListener): () => void {
    const session = this.get(id);
    session.listeners.add(listener);
    listener(JSON.parse(session.saves));
    return () => session.listeners.delete(listener);
  }

  async teardown(id: string, reason = 'requested'): Promise<void> {
    const session = this.sessions.get(id);
    if (!session) {
      return;
    }
    this.log.log(`Session ${id}: removing (${reason})`);
    this.sessions.delete(id);
    clearTimeout(session.teardownTimer);
    clearInterval(session.pollTimer);
    if (session.state === 'running') {
      await this.pollSaves(session);
    }
    for (const listener of session.listeners) {
      listener(null);
    }
    await this.driver.remove(id);
  }

  async teardownAll(): Promise<void> {
    await Promise.all([...this.sessions.keys()].map((id) => this.teardown(id, 'shutting down')));
  }

  private get(id: string): Session {
    const session = this.sessions.get(id);
    if (!session) {
      throw new SessionError(404, 'no such session');
    }
    return session;
  }

  private scheduleTeardown(session: Session, delayMs: number, reason: string): void {
    clearTimeout(session.teardownTimer);
    session.teardownTimer = setTimeout(() => {
      this.teardown(session.id, reason).catch((err) => this.log.error(`Session ${session.id}: failed to remove:`, err));
    }, delayMs);
  }

  private startPolling(session: Session): void {
    session.pollTimer = setInterval(() => {
      this.pollSaves(session).catch((err) => this.log.error(`Session ${session.id}: failed to read saves:`, err));
    }, this.timings.savesPollMs);
  }

  private async pollSaves(session: Session): Promise<void> {
    const files = await this.driver.getSaves(session.id);
    const json = canonical(files);
    if (json === session.saves) {
      return;
    }
    session.saves = json;
    for (const listener of session.listeners) {
      listener(files);
    }
  }
}

function canonical(files: SaveFiles): string {
  return JSON.stringify(files, Object.keys(files).sort());
}
