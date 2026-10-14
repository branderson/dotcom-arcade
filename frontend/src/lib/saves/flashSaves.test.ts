import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  addStreamSavesToRuffle,
  flashSaveContext,
  flashToRuffle,
  mirrorToRuffle,
  ruffleToFlash,
  withRuffleSaves,
} from './flashSaves';

const syncState = vi.hoisted(() => ({ keys: [] as string[] }));
const streamSaves = vi.hoisted(() => ({ files: {} as Record<string, string> }));
vi.mock('@/lib/streamSaves', () => ({ loadSaves: async () => streamSaves.files }));
vi.mock('./gameSaves', () => ({
  loadSyncState: async (gameId: string) => ({
    gameId,
    keys: syncState.keys,
    databases: [],
    syncedHash: null,
    savedAt: null,
  }),
}));

// Written by Ruffle for SharedObject.getLocal('pathsave') and getLocal('rootsave', '/')
// in a SWF loaded from /game-proxy/http://savetest.example/dir/test.swf
const PATH_KEY = 'arcade.example.com/game-proxy/http://savetest.example/dir/test.swf/pathsave';
const ROOT_KEY = 'arcade.example.com//rootsave';
const PATH_SOL = 'AL8AAAApVENTTwAEAAAAAAAIcGF0aHNhdmUAAAAAAAVzY29yZQBARQAAAAAAAAA=';
const ROOT_SOL = 'AL8AAAApVENTTwAEAAAAAAAIcm9vdHNhdmUAAAAAAAVzY29yZQBARQAAAAAAAAA=';
const PATH_FILE = 'Flash_Player/#SharedObjects/ABCD1234/savetest.example/dir/test.swf/pathsave.sol';
const ROOT_FILE = 'Flash_Player/#SharedObjects/ABCD1234/savetest.example/rootsave.sol';

const context = flashSaveContext(
  '/game-proxy/http://savetest.example/dir/test.swf',
  'arcade.example.com'
);
if (!context) throw new Error('expected a context');

beforeEach(() => {
  localStorage.clear();
  syncState.keys = [];
  streamSaves.files = {};
});

describe('flash save names', () => {
  it('reads the naming context from a proxied SWF URL only', () => {
    expect(context).toEqual({
      siteHost: 'arcade.example.com',
      proxyRoot: '/game-proxy/http://savetest.example',
      swfHost: 'savetest.example',
    });
    expect(flashSaveContext('/game-zip/abc/test.swf', 'arcade.example.com')).toBeNull();
  });

  it("maps Ruffle's saves to Flash Player files, root saves only when the game made them", () => {
    const entries = { [PATH_KEY]: PATH_SOL, [ROOT_KEY]: ROOT_SOL, 'other-game': 'not a save' };
    expect(ruffleToFlash(entries, context, new Set(), 'ABCD1234')).toEqual({
      [PATH_FILE]: PATH_SOL,
    });
    expect(ruffleToFlash(entries, context, new Set([ROOT_KEY]), 'ABCD1234')).toEqual({
      [PATH_FILE]: PATH_SOL,
      [ROOT_FILE]: ROOT_SOL,
    });
  });

  it("maps Flash Player files back to Ruffle's keys, ignoring other sites and files", () => {
    const files = {
      [PATH_FILE]: PATH_SOL,
      [ROOT_FILE]: ROOT_SOL,
      'Flash_Player/#SharedObjects/ABCD1234/elsewhere.example/x.sol': PATH_SOL,
      'Prefs/data.txt': 'eA==',
    };
    expect(flashToRuffle(files, context)).toEqual({ [PATH_KEY]: PATH_SOL, [ROOT_KEY]: ROOT_SOL });
  });
});

describe('carrying saves between players', () => {
  it("starts the stream with Ruffle's saves, in the stream's own folder", async () => {
    localStorage.setItem(PATH_KEY, PATH_SOL);
    const files = await withRuffleSaves('game', { 'Prefs/x': 'eA==' }, context);
    expect(files).toEqual({
      'Prefs/x': 'eA==',
      'Flash_Player/#SharedObjects/DOTCOMAR/savetest.example/dir/test.swf/pathsave.sol': PATH_SOL,
    });
  });

  it("replaces the stream's copy of a save with Ruffle's, in the stream's folder", async () => {
    localStorage.setItem(PATH_KEY, PATH_SOL);
    const streamCopy = { [PATH_FILE]: 'AL8stalecopy', [ROOT_FILE]: ROOT_SOL };
    expect(await withRuffleSaves('game', streamCopy, context)).toEqual({
      [PATH_FILE]: PATH_SOL,
      [ROOT_FILE]: ROOT_SOL,
    });
  });

  it("copies the stream's saves into Ruffle's storage", () => {
    mirrorToRuffle({ [PATH_FILE]: PATH_SOL, [ROOT_FILE]: ROOT_SOL }, context);
    expect(localStorage.getItem(PATH_KEY)).toBe(PATH_SOL);
    expect(localStorage.getItem(ROOT_KEY)).toBe(ROOT_SOL);
  });

  it('gives Ruffle the stream-only saves before it starts, keeping its own', async () => {
    window.history.replaceState(null, '', '/browse/game');
    const host = window.location.hostname;
    streamSaves.files = { [PATH_FILE]: PATH_SOL, [ROOT_FILE]: ROOT_SOL };
    localStorage.setItem(`${host}//rootsave`, 'AL8ruffleprogress');

    await addStreamSavesToRuffle('game', '/game-proxy/http://savetest.example/dir/test.swf');

    expect(
      localStorage.getItem(`${host}/game-proxy/http://savetest.example/dir/test.swf/pathsave`)
    ).toBe(PATH_SOL);
    expect(localStorage.getItem(`${host}//rootsave`)).toBe('AL8ruffleprogress');
  });
});
