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
        `SELKIES_MANUAL_WIDTH=${size.width}`,
        `SELKIES_MANUAL_HEIGHT=${size.height}`,
        'SELKIES_UI_SHOW_SIDEBAR=false',
        'HARDEN_DESKTOP=true',
        'RESTART_APP=true',
        'NO_DECOR=true',
      ],
      HostConfig: {
        Binds: [`${flashpointHostPath}:/flashpoint:ro`],
        NetworkMode: network,
        ShmSize: 1024 ** 3,
        AutoRemove: true,
      },
    });
  }

  async start(id: string, saves: SaveFiles): Promise<void> {
    const container = this.docker.getContainer(containerName(id));
    if (Object.keys(saves).length > 0) {
      await container.putArchive(await toTar(saves, this.options.uid, this.options.gid), { path: HOME });
    }
    await container.start();
    await waitForHttp(this.url(id) + streamPath(id), READY_TIMEOUT_MS);
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

async function waitForHttp(url: string, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const ok = await fetch(url).then((res) => res.ok, () => false);
    if (ok) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`timed out waiting for ${url}`);
}
