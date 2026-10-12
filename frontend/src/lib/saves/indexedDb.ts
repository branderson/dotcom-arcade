/**
 * Exports and imports whole IndexedDB databases as JSON, so games that save in
 * IndexedDB (Unity WebGL's /idbfs, many HTML5 games) can have those saves copied.
 * Values are structured-clone data, so non-JSON types are tagged.
 */

type Encoded =
  | null
  | boolean
  | number
  | string
  | Encoded[]
  | { [key: string]: Encoded }
  | { $t: string; v: Encoded };

export interface SerializedIndex {
  name: string;
  keyPath: string | string[];
  unique: boolean;
  multiEntry: boolean;
}

export interface SerializedStore {
  name: string;
  keyPath: string | string[] | null;
  autoIncrement: boolean;
  indexes: SerializedIndex[];
  records: { key: Encoded; value: Encoded }[];
}

export interface SerializedDatabase {
  name: string;
  version: number;
  stores: SerializedStore[];
}

const TYPED_ARRAYS = {
  Int8Array,
  Uint8Array,
  Uint8ClampedArray,
  Int16Array,
  Uint16Array,
  Int32Array,
  Uint32Array,
  Float32Array,
  Float64Array,
} as const;

function toBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}

function fromBase64(text: string): Uint8Array<ArrayBuffer> {
  const binary = atob(text);
  const bytes = new Uint8Array(new ArrayBuffer(binary.length));
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

/**
 * Type tag that also works for values from another realm, such as a game's
 * iframe, where instanceof against this window's constructors fails.
 */
function typeOf(value: object): string {
  return Object.prototype.toString.call(value).slice(8, -1);
}

async function encode(value: unknown): Promise<Encoded> {
  if (value === null || typeof value === 'boolean' || typeof value === 'string') {
    return value;
  }
  if (value === undefined) return { $t: 'undefined', v: null };
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : { $t: 'number', v: String(value) };
  }
  if (typeof value === 'bigint') return { $t: 'bigint', v: value.toString() };
  if (typeof value !== 'object') {
    throw new Error(`Cannot save a value of type ${typeof value}`);
  }
  const type = typeOf(value);
  if (type === 'Date') return { $t: 'Date', v: (value as Date).getTime() };
  if (type === 'ArrayBuffer') {
    return { $t: 'ArrayBuffer', v: toBase64(new Uint8Array(value as ArrayBuffer)) };
  }
  if (ArrayBuffer.isView(value)) {
    const bytes = new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
    return { $t: type, v: toBase64(bytes) };
  }
  if (type === 'Blob' || type === 'File') {
    const blob = value as Blob;
    const bytes = new Uint8Array(await blob.arrayBuffer());
    return { $t: 'Blob', v: { type: blob.type, data: toBase64(bytes) } };
  }
  if (type === 'Map') {
    const entries = [...(value as Map<unknown, unknown>)];
    return {
      $t: 'Map',
      v: await Promise.all(entries.map(async ([k, v]) => [await encode(k), await encode(v)])),
    };
  }
  if (type === 'Set') {
    return { $t: 'Set', v: await Promise.all([...(value as Set<unknown>)].map(encode)) };
  }
  if (Array.isArray(value)) return Promise.all(value.map(encode));
  const entries = await Promise.all(
    Object.entries(value as Record<string, unknown>).map(
      async ([k, v]) => [k, await encode(v)] as const
    )
  );
  const object = Object.fromEntries(entries);
  // An object that happens to have a $t key must not be read back as a tagged value
  return '$t' in object ? { $t: 'Object', v: object } : object;
}

function decode(value: Encoded): unknown {
  if (value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(decode);
  if (!('$t' in value)) {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, decode(v)]));
  }
  const { $t, v } = value as { $t: string; v: Encoded };
  switch ($t) {
    case 'undefined':
      return undefined;
    case 'number':
      return Number(v);
    case 'bigint':
      return BigInt(v as string);
    case 'Date':
      return new Date(v as number);
    case 'ArrayBuffer':
      return fromBase64(v as string).buffer;
    case 'Blob': {
      const { type, data } = v as { type: string; data: string };
      return new Blob([fromBase64(data)], { type });
    }
    case 'Map':
      return new Map((v as Encoded[][]).map(([k, val]) => [decode(k), decode(val)]));
    case 'Set':
      return new Set((v as Encoded[]).map(decode));
    case 'Object':
      return Object.fromEntries(
        Object.entries(v as Record<string, Encoded>).map(([k, x]) => [k, decode(x)])
      );
    case 'DataView': {
      const bytes = fromBase64(v as string);
      return new DataView(bytes.buffer);
    }
    default: {
      const TypedArray = TYPED_ARRAYS[$t as keyof typeof TYPED_ARRAYS];
      if (!TypedArray) throw new Error(`Unknown saved value type: ${$t}`);
      return new TypedArray(fromBase64(v as string).buffer);
    }
  }
}

function promised<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/** Names of the databases on this origin. */
export async function listDatabases(): Promise<string[]> {
  const databases = await indexedDB.databases();
  return databases.map((d) => d.name).filter((name): name is string => Boolean(name));
}

export async function exportDatabase(name: string): Promise<SerializedDatabase | null> {
  const known = await listDatabases();
  if (!known.includes(name)) return null;
  const db = await promised(indexedDB.open(name));
  try {
    const storeNames = [...db.objectStoreNames];
    if (storeNames.length === 0) {
      return { name, version: db.version, stores: [] };
    }
    // Read everything inside one transaction, then encode outside it: encoding
    // Blobs is asynchronous and would let the transaction close
    const tx = db.transaction(storeNames, 'readonly');
    const raw = await Promise.all(
      storeNames.map(async (storeName) => {
        const store = tx.objectStore(storeName);
        const [keys, values] = await Promise.all([
          promised(store.getAllKeys()),
          promised(store.getAll()),
        ]);
        return { store, keys, values };
      })
    );
    const stores = await Promise.all(
      raw.map(async ({ store, keys, values }) => ({
        name: store.name,
        keyPath: store.keyPath,
        autoIncrement: store.autoIncrement,
        indexes: [...store.indexNames].map((indexName) => {
          const index = store.index(indexName);
          return {
            name: index.name,
            keyPath: index.keyPath,
            unique: index.unique,
            multiEntry: index.multiEntry,
          };
        }),
        records: await Promise.all(
          keys.map(async (key, i) => ({ key: await encode(key), value: await encode(values[i]) }))
        ),
      }))
    );
    return { name, version: db.version, stores };
  } finally {
    db.close();
  }
}

/** Replaces a database with a serialized copy. */
export async function importDatabase(serialized: SerializedDatabase): Promise<void> {
  await promised(indexedDB.deleteDatabase(serialized.name));
  const request = indexedDB.open(serialized.name, serialized.version);
  request.onupgradeneeded = () => {
    const db = request.result;
    for (const store of serialized.stores) {
      const objectStore = db.createObjectStore(store.name, {
        keyPath: store.keyPath ?? undefined,
        autoIncrement: store.autoIncrement,
      });
      for (const index of store.indexes) {
        objectStore.createIndex(index.name, index.keyPath, {
          unique: index.unique,
          multiEntry: index.multiEntry,
        });
      }
    }
  };
  const db = await promised(request);
  try {
    if (serialized.stores.length === 0) return;
    const tx = db.transaction(
      serialized.stores.map((s) => s.name),
      'readwrite'
    );
    for (const store of serialized.stores) {
      const objectStore = tx.objectStore(store.name);
      for (const record of store.records) {
        if (store.keyPath === null) {
          objectStore.put(decode(record.value), decode(record.key) as IDBValidKey);
        } else {
          objectStore.put(decode(record.value));
        }
      }
    }
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

export async function deleteDatabase(name: string): Promise<void> {
  await promised(indexedDB.deleteDatabase(name));
}
