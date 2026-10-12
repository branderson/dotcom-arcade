import { loadSaves, storeSaves, type SaveFiles } from '@/lib/streamSaves';
import { hashSave } from './hash';
import {
  deleteDatabase,
  exportDatabase,
  importDatabase,
  listDatabases,
  type SerializedDatabase,
} from './indexedDb';

/** Everything a game keeps in this browser, in the form stored on the account. */
export interface GameSaveData {
  /** Files a streamed game keeps in its saves directory */
  stream?: SaveFiles;
  /** Ruffle SharedObjects and HTML5 localStorage entries */
  localStorage?: Record<string, string>;
  /** Databases HTML5 games save in, such as Unity WebGL's /idbfs */
  indexedDB?: SerializedDatabase[];
}

/** What this browser knows about a game's save. */
export interface SaveSyncState {
  gameId: string;
  /** localStorage keys and IndexedDB databases seen changing while the game ran */
  keys: string[];
  databases: string[];
  /** Hash of the save last uploaded or downloaded */
  syncedHash: string | null;
  /** When the game last changed its save here */
  savedAt: string | null;
}

const STATE_DB = 'flashpoint-save-sync';
const STATE_STORE = 'games';

/** flashpoint-web's own storage, never part of a game's save */
const APP_DATABASES = new Set(['flashpoint-stream-saves', STATE_DB]);
// Unity WebGL's asset cache: large and re-downloadable, not a save
const IGNORED_DATABASES = new Set(['UnityCache']);

function isAppKey(key: string): boolean {
  return key.startsWith('flashpoint-') || key === 'activityDashboardCollapsed';
}

function isGameDatabase(name: string): boolean {
  return !APP_DATABASES.has(name) && !IGNORED_DATABASES.has(name);
}

function openStateDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(STATE_DB, 1);
    request.onupgradeneeded = () =>
      request.result.createObjectStore(STATE_STORE, { keyPath: 'gameId' });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function withStateStore<T>(
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore) => IDBRequest<T>
): Promise<T> {
  const db = await openStateDb();
  try {
    return await new Promise<T>((resolve, reject) => {
      const request = fn(db.transaction(STATE_STORE, mode).objectStore(STATE_STORE));
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  } finally {
    db.close();
  }
}

export async function loadSyncState(gameId: string): Promise<SaveSyncState> {
  const stored = await withStateStore<SaveSyncState | undefined>('readonly', (s) => s.get(gameId));
  return stored ?? { gameId, keys: [], databases: [], syncedHash: null, savedAt: null };
}

export async function storeSyncState(state: SaveSyncState): Promise<void> {
  await withStateStore('readwrite', (s) => s.put(state));
}

export function isEmptySave(data: GameSaveData): boolean {
  return !data.stream && !data.localStorage && !data.indexedDB;
}

/** Hash of a save, or null when there is nothing to save. */
export function saveHash(data: GameSaveData): string | null {
  return isEmptySave(data) ? null : hashSave(data);
}

/** Gathers a game's save from this browser. */
export async function collectSave(state: SaveSyncState): Promise<GameSaveData> {
  const data: GameSaveData = {};

  const stream = await loadSaves(state.gameId);
  if (Object.keys(stream).length > 0) data.stream = stream;

  const entries = state.keys
    .map((key) => [key, localStorage.getItem(key)] as const)
    .filter((entry): entry is readonly [string, string] => entry[1] !== null);
  if (entries.length > 0) data.localStorage = Object.fromEntries(entries);

  const databases = (await Promise.all(state.databases.map(exportDatabase))).filter(
    (db): db is SerializedDatabase => db !== null
  );
  if (databases.length > 0) data.indexedDB = databases;

  return data;
}

/** Makes this browser hold exactly the given save, and returns the updated state. */
export async function applySave(state: SaveSyncState, data: GameSaveData): Promise<SaveSyncState> {
  if (data.stream || Object.keys(await loadSaves(state.gameId)).length > 0) {
    await storeSaves(state.gameId, data.stream ?? {});
  }

  const keys = Object.keys(data.localStorage ?? {});
  for (const key of state.keys.filter((k) => !keys.includes(k))) {
    localStorage.removeItem(key);
  }
  for (const [key, value] of Object.entries(data.localStorage ?? {})) {
    localStorage.setItem(key, value);
  }

  const databases = (data.indexedDB ?? []).map((db) => db.name);
  for (const name of state.databases.filter((n) => !databases.includes(n))) {
    await deleteDatabase(name);
  }
  for (const db of data.indexedDB ?? []) {
    await importDatabase(db);
  }

  return { ...state, keys, databases };
}

function gameStorage(): Map<string, string> {
  const values = new Map<string, string>();
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key !== null && !isAppKey(key)) {
      values.set(key, localStorage.getItem(key) ?? '');
    }
  }
  return values;
}

async function gameDatabaseHashes(): Promise<Map<string, string>> {
  const hashes = new Map<string, string>();
  const names = (await listDatabases().catch(() => [] as string[])).filter(isGameDatabase);
  for (const name of names) {
    const db = await exportDatabase(name).catch(() => null);
    if (db) hashes.set(name, hashSave(db));
  }
  return hashes;
}

/**
 * Notices what a running game changes. Games share flashpoint-web's origin and
 * Ruffle saves may use a site-wide path, so storage that changes while a game
 * runs is attributed to it rather than guessed from names.
 */
export class SaveChangeTracker {
  private storage: Map<string, string>;
  private databases: Map<string, string>;
  private streamHash: string | null;

  private constructor(
    storage: Map<string, string>,
    databases: Map<string, string>,
    streamHash: string | null
  ) {
    this.storage = storage;
    this.databases = databases;
    this.streamHash = streamHash;
  }

  static async start(gameId: string): Promise<SaveChangeTracker> {
    return new SaveChangeTracker(
      gameStorage(),
      await gameDatabaseHashes(),
      hashSave(await loadSaves(gameId))
    );
  }

  /** Attributes storage changed since the last check to the game; returns whether anything changed. */
  async check(state: SaveSyncState): Promise<{ state: SaveSyncState; changed: boolean }> {
    let changed = false;
    const keys = new Set(state.keys);
    const databases = new Set(state.databases);

    const storage = gameStorage();
    for (const [key, value] of storage) {
      if (this.storage.get(key) !== value) {
        keys.add(key);
        changed = true;
      }
    }
    for (const key of this.storage.keys()) {
      if (!storage.has(key) && keys.has(key)) changed = true;
    }
    this.storage = storage;

    const hashes = await gameDatabaseHashes();
    for (const [name, hash] of hashes) {
      if (this.databases.get(name) !== hash) {
        databases.add(name);
        changed = true;
      }
    }
    this.databases = hashes;

    const streamHash = hashSave(await loadSaves(state.gameId));
    if (streamHash !== this.streamHash) {
      this.streamHash = streamHash;
      changed = true;
    }

    return { state: { ...state, keys: [...keys], databases: [...databases] }, changed };
  }
}
