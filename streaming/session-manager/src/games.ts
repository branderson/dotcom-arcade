import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { buffer } from 'node:stream/consumers';
import { constants as zlibConstants, inflateSync } from 'node:zlib';
import { DatabaseSync } from 'node:sqlite';
import yauzl from 'yauzl';

/** Java launch applications fp-launch can stream, lowercased. */
const JAVA_APPS = new Set(['fpsoftware\\startjava.bat', 'fpsoftware\\startjavainbrowser.bat']);

const DEFAULT_SIZE: Size = { width: 800, height: 600 };
const BROWSER_SIZE: Size = { width: 1024, height: 768 };

/** A page's default body margin around embedded content. */
const PAGE_MARGIN = 8;

export interface Size {
  width: number;
  height: number;
}

interface LaunchRow {
  platform: string;
  app: string;
  cmd: string;
  dateAdded: string | null;
}

/** Looks up streamable games in a Flashpoint install. */
export class GameCatalog {
  private readonly root: string;
  private readonly platforms: Set<string>;
  private readonly db: DatabaseSync;

  /** @param platforms Platforms to stream, such as Java, Shockwave and Flash. */
  constructor(root: string, platforms: string[]) {
    this.root = root;
    this.platforms = new Set(platforms.map((p) => p.toLowerCase()));
    this.db = new DatabaseSync(path.join(root, 'Data', 'flashpoint.sqlite'), { readOnly: true });
  }

  /** Returns the display size for a streamable game, or null if it can't be streamed. */
  async streamSize(gameId: string): Promise<Size | null> {
    const row = this.db
      .prepare(
        `select g.platformName as platform,
                coalesce(nullif(d.applicationPath, ''), g.applicationPath) as app,
                coalesce(nullif(d.launchCommand, ''), g.launchCommand) as cmd,
                d.dateAdded as dateAdded
         from game g left join game_data d on d.id = g.activeDataId
         where g.id = ?`,
      )
      .get(gameId) as unknown as LaunchRow | undefined;
    if (!row || !this.platforms.has((row.platform ?? '').toLowerCase())) {
      return null;
    }
    if (row.platform.toLowerCase() === 'java') {
      if (!JAVA_APPS.has(row.app.toLowerCase())) {
        return null;
      }
      const page = await this.readContent(gameId, row, row.cmd).catch(() => null);
      return even((page && appletSize(page.toString('latin1'))) ?? DEFAULT_SIZE);
    }
    const program = await this.launchProgram(row);
    if (!program) {
      return null;
    }
    const url = row.cmd.match(/https?:\/\/[^\s"']+/)?.[0];
    if (!url) {
      const exe = await readFile(program).catch(() => null);
      return even((exe && projectorStageSize(exe)) ?? DEFAULT_SIZE);
    }
    const content = await this.readContent(gameId, row, url).catch(() => null);
    const extension = path.extname(new URL(url).pathname).toLowerCase();
    if (['.dcr', '.dir', '.dxr', '.cct', '.cst'].includes(extension)) {
      return even((content && directorStageSize(content)) ?? DEFAULT_SIZE);
    }
    if (extension === '.swf') {
      // The exact stage: in full screen, games that set noScale keep their native size
      return even((content && swfStageSize(content)) ?? DEFAULT_SIZE);
    }
    const embed = content && embedSize(content.toString('latin1'));
    return even(embed ? { width: embed.width + 2 * PAGE_MARGIN, height: embed.height + 2 * PAGE_MARGIN } : BROWSER_SIZE);
  }

  /**
   * Resolves the program fp-command would run, mirroring its rules: execs.json
   * mappings, .bat to .sh, an .exe replaced by a same-named script, and
   * OldCPUSimulator's target. Returns null if it doesn't exist.
   */
  private async launchProgram(row: LaunchRow): Promise<string | null> {
    let relative = (await this.mappedApp(row.app)).replace(/\\/g, '/');
    if (/oldcpusimulator\/oldcpusimulator\.exe$/i.test(relative)) {
      const software = row.cmd.match(/(?:-sw|--software)\s+("[^"]+"|\S+)/)?.[1]?.replace(/"/g, '');
      if (!software) {
        return null;
      }
      relative = path.posix.join(path.posix.dirname(relative), software.replace(/\\/g, '/'));
    }
    if (/\.bat$/i.test(relative)) {
      relative = relative.slice(0, -4) + '.sh';
    }
    const program = await resolveCaseInsensitive(this.root, relative);
    if (program || !/\.exe$/i.test(relative)) {
      return program;
    }
    return resolveCaseInsensitive(this.root, relative.slice(0, -4) + '.sh');
  }

  private async mappedApp(app: string): Promise<string> {
    try {
      const { execs } = JSON.parse(await readFile(path.join(this.root, 'Data', 'execs.json'), 'utf8'));
      const mapping = execs.find((e: { win32: string; linux?: string }) => e.win32.toLowerCase() === app.toLowerCase());
      return mapping?.linux || app;
    } catch {
      return app;
    }
  }

  /** Reads a URL's file from the game's GameZIP, or from Legacy htdocs. */
  private async readContent(gameId: string, row: LaunchRow, launchUrl: string): Promise<Buffer | null> {
    const url = new URL(launchUrl);
    const page = url.pathname.endsWith('/') ? `${url.pathname}index.html` : url.pathname;
    const file = url.hostname + decodeURIComponent(page);
    if (row.dateAdded) {
      const zip = path.join(this.root, 'Data', 'Games', `${gameId}-${new Date(row.dateAdded).getTime()}.zip`);
      const entry = await readZipEntry(zip, `content/${file}`).catch(() => null);
      if (entry) {
        return entry;
      }
    }
    return readFile(path.join(this.root, 'Legacy', 'htdocs', file));
  }
}

/** Finds a path under root, matching each part case-insensitively as Windows would. */
async function resolveCaseInsensitive(root: string, relative: string): Promise<string | null> {
  let current = root;
  for (const part of relative.split('/').filter((p) => p && p !== '.')) {
    if (part === '..') {
      current = path.dirname(current);
      continue;
    }
    const names = await readdir(current).catch(() => [] as string[]);
    const match = names.find((n) => n === part) ?? names.find((n) => n.toLowerCase() === part.toLowerCase());
    if (!match) {
      return null;
    }
    current = path.join(current, match);
  }
  return (await stat(current).catch(() => null))?.isFile() ? current : null;
}

/** H.264 needs even dimensions. */
function even({ width, height }: Size): Size {
  return { width: width + (width % 2), height: height + (height % 2) };
}

/** Reads the stage size from a SWF header: a rect of twips after the 8-byte header. */
export function swfStageSize(swf: Buffer): Size | null {
  const signature = swf.toString('latin1', 0, 3);
  let body: Buffer;
  if (signature === 'FWS') {
    body = swf.subarray(8);
  } else if (signature === 'CWS') {
    try {
      body = inflateSync(swf.subarray(8), { finishFlush: zlibConstants.Z_SYNC_FLUSH });
    } catch {
      return null;
    }
  } else {
    return null;
  }
  const bits = body[0] >> 3;
  let value = 0n;
  for (const byte of body.subarray(0, Math.ceil((5 + 4 * bits) / 8))) {
    value = (value << 8n) | BigInt(byte);
  }
  const totalBits = BigInt(Math.ceil((5 + 4 * bits) / 8) * 8);
  const field = (i: number) =>
    Number((value >> (totalBits - 5n - BigInt((i + 1) * bits))) & ((1n << BigInt(bits)) - 1n));
  const width = Math.round((field(1) - field(0)) / 20);
  const height = Math.round((field(3) - field(2)) / 20);
  return width > 0 && height > 0 ? { width, height } : null;
}

/** Reads the size of the largest embed or object on a page, ignoring percentages. */
export function embedSize(html: string): Size | null {
  let best: Size | null = null;
  for (const tag of html.match(/<(?:embed|object)\b[^>]*>/gi) ?? []) {
    const attr = (name: string) => Number(tag.match(new RegExp(`\\b${name}\\s*=\\s*["']?(\\d+)(?![\\d%])`, 'i'))?.[1]);
    const width = attr('width');
    const height = attr('height');
    if (width > 0 && height > 0 && (!best || width * height > best.width * best.height)) {
      best = { width, height };
    }
  }
  return best;
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
 * chunk: DRCF (VWCF before Director 7), with the tag reversed in little-endian
 * movies. The chunk body starts with its own length, the file version, then the
 * stage rect as big-endian top, left, bottom, right.
 */
export function projectorStageSize(exe: Buffer): Size | null {
  const tags = [['FCRD', true], ['DRCF', false], ['FCWV', true], ['VWCF', false]] as const;
  for (const [tag, littleEndian] of tags) {
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

/**
 * Reads the stage size of a Director movie: .dir, .dxr, .cst, or a projector
 * embedding one, and Afterburner-compressed Shockwave (.dcr, .cct).
 */
export function directorStageSize(file: Buffer): Size | null {
  const codec = file.toString('latin1', 8, 12);
  if (['FGDC', 'FGDM', 'CDGF', 'MDGF'].includes(codec)) {
    try {
      return afterburnerStageSize(file);
    } catch {
      return null;
    }
  }
  return projectorStageSize(file);
}

/** Afterburner layout, after ProjectorRays' DirectorFile::readAfterburnerMap. */
function afterburnerStageSize(file: Buffer): Size | null {
  const littleEndian = file.toString('latin1', 0, 4) === 'XFIR';
  let pos = 12;
  const varInt = (buf: Buffer, at: { pos: number }) => {
    let value = 0;
    let byte;
    do {
      byte = buf[at.pos++];
      value = value * 128 + (byte & 0x7f);
    } while (byte & 0x80);
    return value;
  };
  const tag = (buf: Buffer, at: number) => {
    const text = buf.toString('latin1', at, at + 4);
    return littleEndian ? [...text].reverse().join('') : text;
  };
  const section = (name: string) => {
    if (tag(file, pos) !== name) {
      throw new Error(`expected ${name}`);
    }
    const at = { pos: pos + 4 };
    const length = varInt(file, at);
    return { start: at.pos, length };
  };

  for (const name of ['Fver', 'Fcdr']) {
    const { start, length } = section(name);
    pos = start + length;
  }
  const abmp = section('ABMP');
  const abmpAt = { pos: abmp.start };
  varInt(file, abmpAt); // compression type
  varInt(file, abmpAt); // uncompressed length
  const map = inflateSync(file.subarray(abmpAt.pos, abmp.start + abmp.length));
  const at = { pos: 0 };
  varInt(map, at);
  varInt(map, at);
  const resources = new Map<number, { offset: number; length: number; tag: string }>();
  for (let count = varInt(map, at); count > 0; count--) {
    const id = varInt(map, at);
    const offset = varInt(map, at);
    const length = varInt(map, at);
    varInt(map, at); // uncompressed length
    varInt(map, at); // compression type
    resources.set(id, { offset, length, tag: tag(map, at.pos) });
    at.pos += 4;
  }

  pos = abmp.start + abmp.length;
  if (tag(file, pos) !== 'FGEI') {
    throw new Error('expected FGEI');
  }
  const ilsAt = { pos: pos + 4 };
  varInt(file, ilsAt);
  const ilsBody = ilsAt.pos;
  const configId = [...resources].find(([, r]) => r.tag === 'DRCF' || r.tag === 'VWCF')?.[0];
  if (configId === undefined) {
    return null;
  }
  let config: Buffer | undefined;
  const ils = inflateSync(file.subarray(ilsBody, ilsBody + resources.get(2)!.length));
  for (const ilsAtPos = { pos: 0 }; ilsAtPos.pos < ils.length && !config; ) {
    const id = varInt(ils, ilsAtPos);
    const length = resources.get(id)?.length ?? 0;
    if (id === configId) {
      config = ils.subarray(ilsAtPos.pos, ilsAtPos.pos + length);
    }
    ilsAtPos.pos += length;
  }
  const { offset, length } = resources.get(configId)!;
  config ??= file.subarray(ilsBody + offset, ilsBody + offset + length);
  try {
    config = inflateSync(config);
  } catch {
    // Stored uncompressed
  }
  const [top, left, bottom, right] = [4, 6, 8, 10].map((o) => config.readInt16BE(o));
  return right > left && bottom > top ? { width: right - left, height: bottom - top } : null;
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
