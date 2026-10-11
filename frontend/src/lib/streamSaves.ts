/** Save files from a streamed game, by path relative to its saves directory, base64-encoded. */
export type SaveFiles = Record<string, string>;

const DB_NAME = 'flashpoint-stream-saves';
const STORE = 'saves';

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function withStore<T>(
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore) => IDBRequest<T>
): Promise<T> {
  const db = await openDb();
  try {
    return await new Promise<T>((resolve, reject) => {
      const request = fn(db.transaction(STORE, mode).objectStore(STORE));
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  } finally {
    db.close();
  }
}

/** Saves this browser holds for a streamed game, kept per game ID. */
export async function loadSaves(gameId: string): Promise<SaveFiles> {
  return (await withStore<SaveFiles | undefined>('readonly', (store) => store.get(gameId))) ?? {};
}

export async function storeSaves(gameId: string, files: SaveFiles): Promise<void> {
  await withStore('readwrite', (store) => store.put(files, gameId));
}
