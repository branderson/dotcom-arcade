import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  flashSaveContext,
  flashToRuffle,
  mirrorToRuffle,
  ruffleToFlash,
  withRuffleSaves,
} from './flashSaves';

const syncState = vi.hoisted(() => ({ keys: [] as string[] }));
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

  it("keeps the stream's copy the first time, then prefers Ruffle's", async () => {
    localStorage.setItem(PATH_KEY, PATH_SOL);
    const streamCopy = { [PATH_FILE]: 'AL8streamcopy' };
    expect(await withRuffleSaves('game', streamCopy, context)).toEqual(streamCopy);
    expect(await withRuffleSaves('game', streamCopy, context)).toEqual({ [PATH_FILE]: PATH_SOL });
  });

  it("copies the stream's saves into Ruffle's storage", () => {
    mirrorToRuffle({ [PATH_FILE]: PATH_SOL, [ROOT_FILE]: ROOT_SOL }, context);
    expect(localStorage.getItem(PATH_KEY)).toBe(PATH_SOL);
    expect(localStorage.getItem(ROOT_KEY)).toBe(ROOT_SOL);
  });
});
