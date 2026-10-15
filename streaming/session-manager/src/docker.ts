import Docker from 'dockerode';
import type { Size } from './games.ts';
import { fromTar, SAVES_DIR, toTar, type SaveFiles } from './saves.ts';

/** Manages the streamer container behind each session. */
export interface Driver {
  create(id: string, gameId: string, size: Size): Promise<void>;
  start(id: string, saves: SaveFiles): Promise<void>;
  getSaves(id: string): Promise<SaveFiles>;
  remove(id: string): Promise<void>;
  /** Removes containers left behind by a previous run. */
  removeAll(): Promise<void>;
  /** Base URL of the container's Selkies server. */
  url(id: string): string;
}

export interface DockerDriverOptions {
  image: string;
  network: string;
  flashpointHostPath: string;
  uid: number;
  gid: number;
}

const LABEL = 'flashpoint.stream-session';
const HOME = '/config';
const READY_TIMEOUT_MS = 60_000;
const LOG_LINES = 30;

export class DockerDriver implements Driver {
  private readonly docker = new Docker();
  private readonly options: DockerDriverOptions;

  constructor(options: DockerDriverOptions) {
    this.options = options;
  }

  async create(id: string, gameId: string, size: Size): Promise<void> {
    const { image, network, flashpointHostPath, uid, gid } = this.options;
    await this.docker.createContainer({
      name: containerName(id),
      Image: image,
      Labels: { [LABEL]: id },
      Env: [
        `GAME_ID=${gameId}`,
        `PUID=${uid}`,
        `PGID=${gid}`,
        `SUBFOLDER=${streamPath(id)}`,
        // The game's exact size, and the display's, rounded up to even for H.264
        `GAME_WIDTH=${size.width}`,
        `GAME_HEIGHT=${size.height}`,
        `SELKIES_MANUAL_WIDTH=${size.width + (size.width % 2)}`,
        `SELKIES_MANUAL_HEIGHT=${size.height + (size.height % 2)}`,
        'SELKIES_UI_SHOW_SIDEBAR=false',
        'HARDEN_DESKTOP=true',
        'RESTART_APP=true',
        'NO_DECOR=true',
      ],
      HostConfig: {
        Binds: [`${flashpointHostPath}:/flashpoint:ro`],
        NetworkMode: network,
        ShmSize: 1024 ** 3,
        // Not auto-removed, so a container that crashes keeps its output to
        // report; teardown removes it, and removeAll clears leftovers
      },
    });
  }

  async start(id: string, saves: SaveFiles): Promise<void> {
    const container = this.docker.getContainer(containerName(id));
    if (Object.keys(saves).length > 0) {
      await container.putArchive(await toTar(saves, this.options.uid, this.options.gid), { path: HOME });
    }
    await container.start();
    const url = this.url(id) + streamPath(id);
    try {
      await waitUntilReady(
        () => fetch(url).then((res) => res.ok, () => false),
        async () => {
          const { State } = await container.inspect();
          return State.Running ? null : State.ExitCode;
        },
        READY_TIMEOUT_MS,
      );
    } catch (err) {
      const output = await container
        .logs({ stdout: true, stderr: true, tail: LOG_LINES })
        .then((logs) => dockerLogText(logs as unknown as Buffer), () => '');
      throw new Error(`${(err as Error).message}${output ? `; last output:\n${output}` : ''}`);
    }
  }

  async getSaves(id: string): Promise<SaveFiles> {
    try {
      const archive = await this.docker.getContainer(containerName(id)).getArchive({ path: `${HOME}/${SAVES_DIR}` });
      return await fromTar(archive);
    } catch (err) {
      if ((err as { statusCode?: number }).statusCode === 404) {
        return {};
      }
      throw err;
    }
  }

  async remove(id: string): Promise<void> {
    await this.docker
      .getContainer(containerName(id))
      .remove({ force: true })
      .catch((err: { statusCode?: number }) => {
        if (err.statusCode !== 404 && err.statusCode !== 409) {
          throw err;
        }
      });
  }

  async removeAll(): Promise<void> {
    const containers = await this.docker.listContainers({ all: true, filters: { label: [LABEL] } });
    await Promise.all(containers.map((c) => this.remove(c.Labels[LABEL])));
  }

  url(id: string): string {
    return `http://${containerName(id)}:3000`;
  }
}

/** URL path prefix a session is served under, through the manager and inside its container. */
export function streamPath(id: string): string {
  return `/stream/${id}/`;
}

function containerName(id: string): string {
  return `fp-stream-${id}`;
}

/**
 * Polls until `ready` is true, failing early once `exitCode` reports that the
 * container has stopped (a number) rather than still running (null).
 */
export async function waitUntilReady(
  ready: () => Promise<boolean>,
  exitCode: () => Promise<number | null>,
  timeoutMs: number,
  intervalMs = 500,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await ready()) {
      return;
    }
    const code = await exitCode();
    if (code !== null) {
      throw new Error(`streamer exited with code ${code}`);
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  throw new Error(`streamer not ready after ${timeoutMs / 1000}s`);
}

/**
 * Turns Docker's log output into text. Without a TTY, each chunk is framed by
 * an 8-byte header: stream type, three zero bytes, then the big-endian length.
 */
export function dockerLogText(logs: Buffer): string {
  const framed = logs.length >= 8 && logs[0] <= 2 && logs[1] === 0 && logs[2] === 0 && logs[3] === 0;
  if (!framed) {
    return logs.toString('utf8').trimEnd();
  }
  const chunks: Buffer[] = [];
  for (let i = 0; i + 8 <= logs.length; ) {
    const length = logs.readUInt32BE(i + 4);
    chunks.push(logs.subarray(i + 8, i + 8 + length));
    i += 8 + length;
  }
  return Buffer.concat(chunks).toString('utf8').trimEnd();
}
