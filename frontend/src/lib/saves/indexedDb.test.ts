import { describe, it, expect, beforeEach } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { exportDatabase, importDatabase, listDatabases } from './indexedDb';

function request<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function seed(): Promise<void> {
  const open = indexedDB.open('/idbfs', 21);
  open.onupgradeneeded = () => {
    const db = open.result;
    const files = db.createObjectStore('FILE_DATA');
    files.createIndex('timestamp', 'timestamp');
    db.createObjectStore('players', { keyPath: 'id', autoIncrement: true });
  };
  const db = await request(open);
  const tx = db.transaction(['FILE_DATA', 'players'], 'readwrite');
  tx.objectStore('FILE_DATA').put(
    {
      timestamp: new Date(1700000000000),
      mode: 33206,
      contents: new Uint8Array([0, 1, 254, 255]),
      floats: new Float32Array([1.5, -2]),
      buffer: new Uint8Array([9, 8]).buffer,
      tags: new Set(['a', 'b']),
      meta: new Map<string, unknown>([['level', 3]]),
      tricky: { $t: 'not a tag', v: 1 },
      missing: undefined,
      notANumber: NaN,
      big: 12345678901234567890n,
    },
    '/idbfs/save.dat'
  );
  tx.objectStore('players').put({ name: 'eliza', points: 10 });
  await new Promise((resolve) => (tx.oncomplete = resolve));
  db.close();
}

describe('IndexedDB export and import', () => {
  beforeEach(() => {
    globalThis.indexedDB = new IDBFactory();
  });

  it('round-trips a database, including non-JSON values, indexes and generated keys', async () => {
    await seed();
    const exported = await exportDatabase('/idbfs');
    expect(exported).not.toBeNull();
    // Survives being sent as JSON
    const copy = JSON.parse(JSON.stringify(exported));

    globalThis.indexedDB = new IDBFactory();
    await importDatabase(copy);
    expect(await listDatabases()).toEqual(['/idbfs']);

    const db = await request(indexedDB.open('/idbfs'));
    expect(db.version).toBe(21);
    const tx = db.transaction(['FILE_DATA', 'players']);
    const file = await request(tx.objectStore('FILE_DATA').get('/idbfs/save.dat'));
    expect(file.timestamp).toEqual(new Date(1700000000000));
    // Compared by content: fake-indexeddb clones into Node's realm, not jsdom's
    expect(Object.prototype.toString.call(file.contents)).toBe('[object Uint8Array]');
    expect(Array.from(file.contents)).toEqual([0, 1, 254, 255]);
    expect(Array.from(file.floats)).toEqual([1.5, -2]);
    expect(Array.from(new Uint8Array(file.buffer))).toEqual([9, 8]);
    expect(file.tags).toEqual(new Set(['a', 'b']));
    expect(file.meta).toEqual(new Map([['level', 3]]));
    expect(file.tricky).toEqual({ $t: 'not a tag', v: 1 });
    expect('missing' in file && file.missing === undefined).toBe(true);
    expect(file.notANumber).toBeNaN();
    expect(file.big).toBe(12345678901234567890n);
    expect([...tx.objectStore('FILE_DATA').indexNames]).toEqual(['timestamp']);
    expect(await request(tx.objectStore('players').get(1))).toEqual({
      id: 1,
      name: 'eliza',
      points: 10,
    });
    db.close();
  });

  it('exports nothing for a database that does not exist', async () => {
    expect(await exportDatabase('nope')).toBeNull();
    expect(await listDatabases()).toEqual([]);
  });
});
