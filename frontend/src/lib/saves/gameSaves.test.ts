import { describe, it, expect, beforeEach } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import {
  SaveChangeTracker,
  applySave,
  collectSave,
  loadSyncState,
  saveHash,
  storeSyncState,
} from './gameSaves';
import { loadSaves, storeSaves } from '@/lib/streamSaves';

const GAME = '247a4c93-c252-49c8-8bc9-fb43d5c039df';

async function writeDatabase(name: string, value: string): Promise<void> {
  const open = indexedDB.open(name, 1);
  open.onupgradeneeded = () => open.result.createObjectStore('state');
  const db = await new Promise<IDBDatabase>(
    (resolve) => (open.onsuccess = () => resolve(open.result))
  );
  const tx = db.transaction('state', 'readwrite');
  tx.objectStore('state').put(value, 'save');
  await new Promise((resolve) => (tx.oncomplete = resolve));
  db.close();
}

describe('game saves in the browser', () => {
  beforeEach(() => {
    globalThis.indexedDB = new IDBFactory();
    localStorage.clear();
  });

  it('attributes storage that changes while a game runs, ignoring the app and untouched storage', async () => {
    localStorage.setItem('other-game/save', 'unchanged');
    await writeDatabase('other-game-db', 'unchanged');
    const tracker = await SaveChangeTracker.start(GAME);
    let state = await loadSyncState(GAME);

    expect((await tracker.check(state)).changed).toBe(false);

    localStorage.setItem('games.example/game-proxy/http:/example.com/game.swf/save', 'AMF');
    localStorage.setItem('flashpoint-theme-settings', '{}');
    await writeDatabase('wildlife-rescue:/scope/', 'level 3');
    await storeSaves(GAME, { 'cookies.txt': 'YQ==' });

    const result = await tracker.check(state);
    expect(result.changed).toBe(true);
    state = result.state;
    expect(state.keys).toEqual(['games.example/game-proxy/http:/example.com/game.swf/save']);
    expect(state.databases).toEqual(['wildlife-rescue:/scope/']);

    const save = await collectSave(state);
    expect(save.localStorage).toEqual({
      'games.example/game-proxy/http:/example.com/game.swf/save': 'AMF',
    });
    expect(save.stream).toEqual({ 'cookies.txt': 'YQ==' });
    expect(save.indexedDB?.map((db) => db.name)).toEqual(['wildlife-rescue:/scope/']);
    expect(saveHash(save)).not.toBeNull();
    expect(saveHash({})).toBeNull();
  });

  it('applies a save into a fresh browser, replacing what the game kept before', async () => {
    localStorage.setItem('key-a', 'old');
    const tracker = await SaveChangeTracker.start(GAME);
    localStorage.setItem('key-a', 'mine');
    await writeDatabase('game-db', 'mine');
    await storeSaves(GAME, { 'cookies.txt': 'YQ==' });
    const { state } = await tracker.check(await loadSyncState(GAME));
    const save = JSON.parse(JSON.stringify(await collectSave(state)));
    await storeSyncState(state);

    globalThis.indexedDB = new IDBFactory();
    localStorage.clear();
    localStorage.setItem('key-a', 'stale');
    const applied = await applySave(await loadSyncState(GAME), save);

    expect(localStorage.getItem('key-a')).toBe('mine');
    expect(await loadSaves(GAME)).toEqual({ 'cookies.txt': 'YQ==' });
    expect(saveHash(await collectSave(applied))).toBe(saveHash(save));

    // Applying a save without a key removes the key the game had
    await applySave(applied, { indexedDB: save.indexedDB });
    expect(localStorage.getItem('key-a')).toBeNull();
    expect(await loadSaves(GAME)).toEqual({});
  });
});
