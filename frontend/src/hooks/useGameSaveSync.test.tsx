import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { IDBFactory } from 'fake-indexeddb';
import { useGameSaveSync } from './useGameSaveSync';
import { saveHash, storeSyncState, type GameSaveData } from '@/lib/saves/gameSaves';

const api = vi.hoisted(() => ({
  get: vi.fn(),
  getSnapshot: vi.fn(),
  upload: vi.fn(),
  uploadOnUnload: vi.fn(),
}));
vi.mock('@/lib/api/gameSaves', () => ({ gameSavesApi: api }));

const GAME = '247a4c93-c252-49c8-8bc9-fb43d5c039df';
const save = (value: string): GameSaveData => ({ localStorage: { 'site//save': value } });

function snapshot(value: string, savedAt: string, id = 1) {
  const data = save(value);
  return { id, hash: saveHash(data) ?? '', size: 10, savedAt, createdAt: savedAt, data };
}

async function haveLocal(value: string, syncedHash: string | null, savedAt: string | null) {
  localStorage.setItem('site//save', value);
  await storeSyncState({ gameId: GAME, keys: ['site//save'], databases: [], syncedHash, savedAt });
}

async function render(enabled = true) {
  const hook = renderHook(() => useGameSaveSync(GAME, enabled));
  await waitFor(() => expect(hook.result.current.ready).toBe(true));
  return hook;
}

const uploadedValues = () =>
  api.upload.mock.calls.map(([, upload]) => upload.data.localStorage['site//save']);

describe('useGameSaveSync', () => {
  afterEach(async () => {
    // Unmounting saves what's left asynchronously; let it finish before the next test resets storage
    cleanup();
    await new Promise((resolve) => setTimeout(resolve, 100));
  });

  beforeEach(() => {
    vi.clearAllMocks();
    globalThis.indexedDB = new IDBFactory();
    localStorage.clear();
    api.upload.mockResolvedValue({});
  });

  it("loads the account's save into a browser that has none", async () => {
    api.get.mockResolvedValue({
      latest: snapshot('from account', '2026-10-12T10:00:00Z'),
      snapshots: [],
    });

    await render();

    expect(localStorage.getItem('site//save')).toBe('from account');
    expect(api.upload).not.toHaveBeenCalled();
  });

  it('uploads a save the account does not have yet', async () => {
    api.get.mockResolvedValue({ latest: null, snapshots: [] });
    await haveLocal('local only', null, '2026-10-12T10:00:00Z');

    await render();

    expect(uploadedValues()).toEqual(['local only']);
  });

  it('uploads a save changed here since the last sync', async () => {
    const account = snapshot('synced', '2026-10-12T09:00:00Z');
    api.get.mockResolvedValue({ latest: account, snapshots: [] });
    await haveLocal('played further', account.hash, '2026-10-12T10:00:00Z');

    await render();

    expect(localStorage.getItem('site//save')).toBe('played further');
    expect(uploadedValues()).toEqual(['played further']);
  });

  it("takes the account's save when only another browser changed it", async () => {
    const synced = saveHash(save('synced'));
    api.get.mockResolvedValue({
      latest: snapshot('elsewhere', '2026-10-12T11:00:00Z'),
      snapshots: [],
    });
    await haveLocal('synced', synced, '2026-10-12T09:00:00Z');

    await render();

    expect(localStorage.getItem('site//save')).toBe('elsewhere');
    expect(api.upload).not.toHaveBeenCalled();
  });

  it('keeps the newer save when both changed, backing up the other', async () => {
    api.get.mockResolvedValue({
      latest: snapshot('elsewhere', '2026-10-12T11:00:00Z'),
      snapshots: [],
    });
    await haveLocal('here', saveHash(save('long ago')), '2026-10-12T10:00:00Z');

    await render();

    expect(localStorage.getItem('site//save')).toBe('elsewhere');
    // This browser's save is uploaded first so it stays as a backup, then the winner again
    expect(uploadedValues()).toEqual(['here', 'elsewhere']);
  });

  it('restores a backup and remounts the game', async () => {
    api.get.mockResolvedValue({
      latest: snapshot('current', '2026-10-12T11:00:00Z'),
      snapshots: [],
    });
    api.getSnapshot.mockResolvedValue(snapshot('older', '2026-10-12T08:00:00Z', 2));
    const { result } = await render();
    const epoch = result.current.epoch;

    await act(() => result.current.restore(2));

    expect(localStorage.getItem('site//save')).toBe('older');
    expect(uploadedValues()).toContain('older');
    expect(result.current.epoch).toBe(epoch + 1);
  });

  it('does nothing for guests', async () => {
    await render(false);
    expect(api.get).not.toHaveBeenCalled();
  });
});
