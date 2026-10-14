import { buffer } from 'node:stream/consumers';
import tar from 'tar-stream';

/** Save files by path relative to the saves directory, contents base64-encoded. */
export type SaveFiles = Record<string, string>;

/** Name of the saves directory under the streamer's home, and of its entry in archives. */
export const SAVES_DIR = 'saves';

const MAX_BYTES = 10 * 1024 * 1024;

/** Validates untrusted save files from a browser, rejecting paths outside the saves directory. */
export function parseSaveFiles(value: unknown): SaveFiles {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('files must be an object');
  }
  let total = 0;
  for (const [path, data] of Object.entries(value)) {
    const parts = path.split('/');
    if (path.startsWith('/') || parts.some((p) => p === '' || p === '.' || p === '..')) {
      throw new Error(`invalid save path: ${path}`);
    }
    if (typeof data !== 'string') {
      throw new Error(`invalid save data: ${path}`);
    }
    total += data.length;
  }
  if (total > MAX_BYTES) {
    throw new Error('saves too large');
  }
  return value as SaveFiles;
}

/** Packs save files into a tar whose entries sit under the saves directory. */
export async function toTar(files: SaveFiles, uid: number, gid: number): Promise<Buffer> {
  const pack = tar.pack();
  const dirs = new Set<string>([SAVES_DIR]);
  for (const path of Object.keys(files)) {
    const parts = path.split('/');
    for (let i = 1; i < parts.length; i++) {
      dirs.add(`${SAVES_DIR}/${parts.slice(0, i).join('/')}`);
    }
  }
  for (const dir of dirs) {
    pack.entry({ name: dir, type: 'directory', mode: 0o755, uid, gid });
  }
  for (const [path, data] of Object.entries(files)) {
    pack.entry({ name: `${SAVES_DIR}/${path}`, mode: 0o644, uid, gid }, Buffer.from(data, 'base64'));
  }
  pack.finalize();
  const chunks: Buffer[] = [];
  for await (const chunk of pack) {
    chunks.push(chunk as Buffer);
  }
  return Buffer.concat(chunks);
}

/** Reads the regular files from a tar of the saves directory. */
export async function fromTar(stream: NodeJS.ReadableStream): Promise<SaveFiles> {
  const files: SaveFiles = {};
  const extract = tar.extract();
  stream.pipe(extract);
  for await (const entry of extract) {
    const { name, type } = entry.header;
    if (type === 'file' && name.startsWith(`${SAVES_DIR}/`)) {
      files[name.slice(SAVES_DIR.length + 1)] = (await buffer(entry)).toString('base64');
    } else {
      entry.resume();
    }
  }
  return files;
}
