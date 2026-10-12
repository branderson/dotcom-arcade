import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { buffer } from 'node:stream/consumers';
import { DatabaseSync } from 'node:sqlite';
import yauzl from 'yauzl';

/** Java launch applications fp-launch can stream, lowercased. */
const JAVA_APPS = new Set(['fpsoftware\\startjava.bat', 'fpsoftware\\startjavainbrowser.bat']);

/** Windows games installed under LocalGames, which fp-launch runs under Wine. */
const LOCAL_EXE = /^localgames\\.+\.exe$/i;

const DEFAULT_SIZE: Size = { width: 800, height: 600 };

export interface Size {
  width: number;
  height: number;
}

interface LaunchRow {
  app: string;
  cmd: string;
  dateAdded: string | null;
}

/** Looks up streamable games in a Flashpoint install. */
export class GameCatalog {
  private readonly root: string;
  private readonly db: DatabaseSync;

  constructor(root: string) {
    this.root = root;
    this.db = new DatabaseSync(path.join(root, 'Data', 'flashpoint.sqlite'), { readOnly: true });
  }

  /** Returns the display size for a streamable game, or null if it can't be streamed. */
  async streamSize(gameId: string): Promise<Size | null> {
    const row = this.db
      .prepare(
        `select coalesce(nullif(d.applicationPath, ''), g.applicationPath) as app,
                coalesce(nullif(d.launchCommand, ''), g.launchCommand) as cmd,
                d.dateAdded as dateAdded
         from game g left join game_data d on d.id = g.activeDataId
         where g.id = ?`,
      )
      .get(gameId) as unknown as LaunchRow | undefined;
    if (row && LOCAL_EXE.test(row.app)) {
      const exe = await readFile(path.join(this.root, ...row.app.split('\\'))).catch(() => null);
      return exe && (projectorStageSize(exe) ?? DEFAULT_SIZE);
    }
    if (!row || !JAVA_APPS.has(row.app.toLowerCase())) {
      return null;
    }
    const page = await this.readLaunchPage(gameId, row).catch(() => null);
    return (page && appletSize(page.toString('latin1'))) ?? DEFAULT_SIZE;
  }

  private async readLaunchPage(gameId: string, row: LaunchRow): Promise<Buffer | null> {
    const url = new URL(row.cmd);
    const page = url.pathname.endsWith('/') ? `${url.pathname}index.html` : url.pathname;
    const file = url.hostname + decodeURIComponent(page);
    if (row.dateAdded) {
      const zip = path.join(this.root, 'Data', 'Games', `${gameId}-${new Date(row.dateAdded).getTime()}.zip`);
      return readZipEntry(zip, `content/${file}`);
    }
    return readFile(path.join(this.root, 'Legacy', 'htdocs', file));
  }
}

/** Reads the width and height of the first applet on a page. */
export function appletSize(html: string): Size | null {
  const tag = html.match(/<applet\b[^>]*>/i)?.[0];
  if (!tag) {
    return null;
  }
  const attr = (name: string) => Number(tag.match(new RegExp(`\\b${name}\\s*=\\s*["']?(\\d+)(?![\\d%])`, 'i'))?.[1]);
  const width = attr('width');
  const height = attr('height');
  return width > 0 && height > 0 ? { width, height } : null;
}

/**
 * Reads the stage size of the movie in a Director projector from its config
 * chunk: DRCF in big-endian movies, FCRD in little-endian ones. The chunk body
 * starts with its own length, the file version, then the stage rect as
 * big-endian top, left, bottom, right.
 */
export function projectorStageSize(exe: Buffer): Size | null {
  for (const [tag, littleEndian] of [['FCRD', true], ['DRCF', false]] as const) {
    for (let i = exe.indexOf(tag); i >= 0 && i + 8 <= exe.length; i = exe.indexOf(tag, i + 1)) {
      const size = littleEndian ? exe.readUInt32LE(i + 4) : exe.readUInt32BE(i + 4);
      const body = i + 8;
      if (size < 12 || body + size > exe.length || exe.readUInt16BE(body) !== size) {
        continue;
      }
      const [top, left, bottom, right] = [4, 6, 8, 10].map((offset) => exe.readInt16BE(body + offset));
      const width = right - left;
      const height = bottom - top;
      if (width > 0 && height > 0 && width <= 4096 && height <= 4096) {
        return { width, height };
      }
    }
  }
  return null;
}

/** Reads one entry from a zip, matching its name case-insensitively. */
function readZipEntry(zipPath: string, name: string): Promise<Buffer | null> {
  const wanted = name.toLowerCase();
  return new Promise((resolve, reject) => {
    yauzl.open(zipPath, { lazyEntries: true }, (err, zip) => {
      if (err) {
        return reject(err);
      }
      zip.on('error', reject);
      zip.on('end', () => resolve(null));
      zip.on('entry', (entry: yauzl.Entry) => {
        if (entry.fileName.toLowerCase() !== wanted) {
          return zip.readEntry();
        }
        zip.openReadStream(entry, (err, stream) => {
          if (err) {
            return reject(err);
          }
          buffer(stream).then(resolve, reject).finally(() => zip.close());
        });
      });
      zip.readEntry();
    });
  });
}
