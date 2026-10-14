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

function sharedObjectsFolder(files: SaveFiles): string {
  const existing = Object.keys(files).find((path) => path.startsWith(SHARED_OBJECTS));
  return existing?.slice(SHARED_OBJECTS.length).split('/')[0] ?? DEFAULT_FOLDER;
}

/**
 * Flash Player save files for a game's Ruffle SharedObjects. Root-path saves
 * ("<site>//<name>") are shared by every game, so only those in rootKeys, the
 * keys seen changing while this game ran, are included.
 */
export function ruffleToFlash(
  entries: Record<string, string>,
  context: FlashSaveContext,
  rootKeys: ReadonlySet<string>,
  folder: string
): SaveFiles {
  const files: SaveFiles = {};
  for (const [key, value] of Object.entries(entries)) {
    if (!value.startsWith(SOL_PREFIX) || !key.startsWith(`${context.siteHost}/`)) continue;
    const rest = key.slice(context.siteHost.length);
    const slash = rest.lastIndexOf('/');
    const localPath = rest.slice(0, slash) || '/';
    const name = rest.slice(slash + 1);
    let dir: string;
    if (localPath === '/') {
      if (!rootKeys.has(key)) continue;
      dir = context.swfHost;
    } else if (localPath.startsWith(`${context.proxyRoot}/`)) {
      dir = context.swfHost + localPath.slice(context.proxyRoot.length);
    } else {
      continue;
    }
    files[`${SHARED_OBJECTS}${folder}/${dir}/${name}.sol`] = value;
  }
  return files;
}

/** Ruffle localStorage entries for a game's Flash Player save files. */
export function flashToRuffle(files: SaveFiles, context: FlashSaveContext): Record<string, string> {
  const entries: Record<string, string> = {};
  for (const [path, value] of Object.entries(files)) {
    if (!path.startsWith(SHARED_OBJECTS) || !path.endsWith('.sol')) continue;
    // folder, host, any directories, name.sol
    const parts = path.slice(SHARED_OBJECTS.length).split('/');
    if (parts.length < 3 || parts[1] !== context.swfHost) continue;
    const name = parts[parts.length - 1].slice(0, -'.sol'.length);
    const dirs = parts.slice(2, -1);
    const key = dirs.length
      ? `${context.siteHost}${context.proxyRoot}/${dirs.join('/')}/${name}`
      : `${context.siteHost}//${name}`;
    entries[key] = value;
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
  return {
    ...files,
    ...ruffleToFlash(readLocalStorage(), context, new Set(keys), sharedObjectsFolder(files)),
  };
}

/** Copies a streamed game's Flash Player saves into Ruffle's storage. */
export function mirrorToRuffle(files: SaveFiles, context: FlashSaveContext): void {
  for (const [key, value] of Object.entries(flashToRuffle(files, context))) {
    if (localStorage.getItem(key) !== value) {
      localStorage.setItem(key, value);
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
