import { loadSyncState } from './gameSaves';
import { loadSaves, type SaveFiles } from '@/lib/streamSaves';

/**
 * Ruffle and the original Flash Player (streamed) store SharedObjects in the
 * same .sol format, under different names:
 *
 * - Ruffle, in localStorage, base64-encoded, keyed by the site's host and the
 *   path it loaded the SWF from: `<site>/game-proxy/http://<host>/<path>/<name>`,
 *   or `<site>//<name>` for a localPath of "/".
 * - Flash Player, as files in the streamed game's saves directory:
 *   `Flash_Player/#SharedObjects/<folder>/<host>/<path>/<name>.sol`.
 *
 * A SWF loaded from memory, as by a MochiAds wrapper, saves under its loader's
 * path plus `[[DYNAMIC]]/<n>`, and a wrapper may do that in one player and not
 * the other: Bloons saves at `bloons.swf/[[DYNAMIC]]/1/` in Ruffle and at
 * `bloons.swf/` in Flash Player. Saves differing only by that step are
 * treated as one save.
 *
 * These helpers translate between the two so a game's saves follow it from one
 * player to the other.
 */

const SHARED_OBJECTS = 'Flash_Player/#SharedObjects/';
/** Flash Player names this folder randomly when it creates it; an existing one is reused */
const DEFAULT_FOLDER = 'DOTCOMAR';
/** Every .sol file starts with the bytes 00 BF 00, which base64-encode to "AL8" */
const SOL_PREFIX = 'AL8';

export interface FlashSaveContext {
  /** Host Ruffle keys saves by: the site's own */
  siteHost: string;
  /** Path Ruffle loads the game's SWF host under, e.g. /game-proxy/http://example.com */
  proxyRoot: string;
  /** Host Flash Player keys saves by: the SWF's own */
  swfHost: string;
}

/** The naming context for a SWF played through the game proxy, or null for any other URL. */
export function flashSaveContext(swfUrl: string, siteHost: string): FlashSaveContext | null {
  const match = swfUrl.match(/^(\/game-proxy\/https?:\/\/([^/]+))\//);
  return match ? { siteHost, proxyRoot: match[1], swfHost: match[2] } : null;
}

/**
 * A Ruffle key's save as a Flash Player path, `<host>/<path>/<name>.sol`, or
 * null if it isn't this game's. Root-path saves are shared by every game, so
 * only those in rootKeys count, unless rootKeys is null.
 */
function ruffleKeyToPath(
  key: string,
  context: FlashSaveContext,
  rootKeys: ReadonlySet<string> | null
): string | null {
  if (!key.startsWith(`${context.siteHost}/`)) return null;
  const rest = key.slice(context.siteHost.length);
  const slash = rest.lastIndexOf('/');
  const localPath = rest.slice(0, slash) || '/';
  const name = rest.slice(slash + 1);
  if (localPath === '/') {
    return rootKeys === null || rootKeys.has(key) ? `${context.swfHost}/${name}.sol` : null;
  }
  if (localPath.startsWith(`${context.proxyRoot}/`)) {
    return `${context.swfHost}${localPath.slice(context.proxyRoot.length)}/${name}.sol`;
  }
  return null;
}

/** The Ruffle key for a Flash Player path, `<host>/<path>/<name>.sol`, or null for another host's. */
function pathToRuffleKey(path: string, context: FlashSaveContext): string | null {
  const parts = path.split('/');
  if (parts.length < 2 || parts[0] !== context.swfHost || !path.endsWith('.sol')) return null;
  const name = parts[parts.length - 1].slice(0, -'.sol'.length);
  const dirs = parts.slice(1, -1);
  return dirs.length
    ? `${context.siteHost}${context.proxyRoot}/${dirs.join('/')}/${name}`
    : `${context.siteHost}//${name}`;
}

/** A save file's folder and path below it, or null for files that aren't SharedObjects. */
function splitSaveFile(file: string): { folder: string; path: string } | null {
  if (!file.startsWith(SHARED_OBJECTS) || !file.endsWith('.sol')) return null;
  const rest = file.slice(SHARED_OBJECTS.length);
  const slash = rest.indexOf('/');
  return slash > 0 ? { folder: rest.slice(0, slash), path: rest.slice(slash + 1) } : null;
}

/** A save's path without its [[DYNAMIC]]/<n> steps, which one player may add and the other not. */
function saveIdentity(path: string): string {
  return path.replace(/\/\[\[DYNAMIC\]\]\/\d+(?=\/)/g, '');
}

function isDynamic(path: string): boolean {
  return saveIdentity(path) !== path;
}

function sharedObjectsFolder(files: SaveFiles): string {
  for (const file of Object.keys(files)) {
    const split = splitSaveFile(file);
    if (split) return split.folder;
  }
  return DEFAULT_FOLDER;
}

/**
 * Flash Player save files for a game's Ruffle SharedObjects. Each save is
 * written to its own path and to every path the stream already has for it.
 * Where Ruffle has a save under both a [[DYNAMIC]] path and the plain one, the
 * dynamic copy is used: that's the game itself, the plain one its wrapper's.
 */
export function ruffleToFlash(
  entries: Record<string, string>,
  context: FlashSaveContext,
  rootKeys: ReadonlySet<string>,
  existing: SaveFiles = {}
): SaveFiles {
  const folder = sharedObjectsFolder(existing);
  const chosen = new Map<string, { value: string; dynamic: boolean }>();
  const targets = new Map<string, Set<string>>();
  const addTarget = (identity: string, file: string) =>
    targets.set(identity, (targets.get(identity) ?? new Set()).add(file));

  for (const [key, value] of Object.entries(entries)) {
    if (!value.startsWith(SOL_PREFIX)) continue;
    const path = ruffleKeyToPath(key, context, rootKeys);
    if (path === null) continue;
    const identity = saveIdentity(path);
    const current = chosen.get(identity);
    if (!current || (isDynamic(path) && !current.dynamic)) {
      chosen.set(identity, { value, dynamic: isDynamic(path) });
    }
    addTarget(identity, `${SHARED_OBJECTS}${folder}/${path}`);
  }
  for (const file of Object.keys(existing)) {
    const split = splitSaveFile(file);
    if (split && chosen.has(saveIdentity(split.path))) addTarget(saveIdentity(split.path), file);
  }

  const files: SaveFiles = {};
  for (const [identity, { value }] of chosen) {
    for (const file of targets.get(identity) ?? []) files[file] = value;
  }
  return files;
}

/** Ruffle localStorage entries for a game's Flash Player save files, path for path. */
export function flashToRuffle(files: SaveFiles, context: FlashSaveContext): Record<string, string> {
  const entries: Record<string, string> = {};
  for (const [file, value] of Object.entries(files)) {
    const split = splitSaveFile(file);
    const key = split && pathToRuffleKey(split.path, context);
    if (key) entries[key] = value;
  }
  return entries;
}

function readLocalStorage(): Record<string, string> {
  const entries: Record<string, string> = {};
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    const value = key === null ? null : localStorage.getItem(key);
    if (key !== null && value !== null) entries[key] = value;
  }
  return entries;
}

/**
 * The save files to start a streamed Flash game with: its stream saves, with
 * its Ruffle saves on top. Ruffle is where a game is usually played, and the
 * stream's own changes are copied back into Ruffle as they happen, so Ruffle's
 * copy is the latest.
 */
export async function withRuffleSaves(
  gameId: string,
  files: SaveFiles,
  context: FlashSaveContext
): Promise<SaveFiles> {
  const { keys } = await loadSyncState(gameId);
  return { ...files, ...ruffleToFlash(readLocalStorage(), context, new Set(keys), files) };
}

/**
 * Copies the saves a streamed game changed since `previous` into Ruffle's
 * storage: to the save's own key and to every key Ruffle already has for it.
 */
export function mirrorToRuffle(
  files: SaveFiles,
  previous: SaveFiles,
  context: FlashSaveContext
): void {
  const ruffleKeys = Object.keys(readLocalStorage());
  for (const [file, value] of Object.entries(files)) {
    if (previous[file] === value) continue;
    const split = splitSaveFile(file);
    const key = split && pathToRuffleKey(split.path, context);
    if (!split || !key) continue;
    const identity = saveIdentity(split.path);
    const aliases = ruffleKeys.filter((k) => {
      const path = ruffleKeyToPath(k, context, null);
      return path !== null && saveIdentity(path) === identity;
    });
    for (const target of new Set([key, ...aliases])) {
      if (localStorage.getItem(target) !== value) localStorage.setItem(target, value);
    }
  }
}

/**
 * Before Ruffle plays a game, gives it the streamed Flash Player's saves it
 * doesn't have yet, so progress made only in the stream isn't started over.
 * Saves Ruffle already has are left alone.
 */
export async function addStreamSavesToRuffle(gameId: string, swfUrl: string): Promise<void> {
  const context = flashSaveContext(swfUrl, window.location.hostname);
  if (!context) return;
  for (const [key, value] of Object.entries(flashToRuffle(await loadSaves(gameId), context))) {
    if (localStorage.getItem(key) === null) {
      localStorage.setItem(key, value);
    }
  }
}
