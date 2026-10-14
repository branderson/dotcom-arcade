# Docker Deployment

Deploy Dotcom Arcade with Docker Compose. The [README](../../README.md#getting-started)
walks through a first install; this page covers the details.

## Prerequisites

- **Docker:** Engine 24+ with the Compose plugin.
- **Storage:** more than 2.3 TB for Flashpoint Ultimate 14, or 4.6 TB to keep
  the downloaded archives.
- **CPU and memory:** 2 cores and 4 GB of RAM for the site. Streaming adds
  roughly 1 to 2 CPU cores and 1 GB of RAM per player streaming at once, since
  each player's container runs the game and encodes its video on the CPU.
- **A Flashpoint install** at `FLASHPOINT_HOST_PATH`, with
  `Data/flashpoint.sqlite`, `Data/Games/`, `Data/Images/`, `Data/Playlists/`
  and `Legacy/htdocs/`. `scripts/setup-flashpoint.sh` produces one from the
  Flashpoint Ultimate torrent.

## Services

| Service           | Image                          | Profile     | Purpose                                                  |
| ----------------- | ------------------------------ | ----------- | -------------------------------------------------------- |
| `app`             | `dotcom-arcade`                | (always)    | UI, API and game content on port 3100                    |
| `session-manager` | `dotcom-arcade-session-manager` | `streaming` | Starts streamer containers and serves their streams, through the app |
| `streamer`        | `dotcom-arcade-streamer`       | `streaming` | Built only; the session manager runs one per player      |

All three are built from this repository by `docker compose up -d --build`.

### Prebuilt images

To pull published images instead of building, set `IMAGE_PREFIX` in `.env` to
the registry path they live under, ending in `/`, and optionally `IMAGE_TAG`:

```sh
IMAGE_PREFIX=registry.example.com/owner/
IMAGE_TAG=latest
```

Then run `docker compose pull && docker compose up -d`.

### Publishing images

`.gitea/workflows/images.yml` builds all three images on Gitea Actions and
pushes them to the Gitea instance's container registry, under the repository's
owner. Pushes to `main` publish a `main` tag; `v1.2.3` tags publish `1.2.3`,
`1.2` and `latest`. Its jobs run docker builds, so they need a runner labelled
`dejima-privileged`; jobs that don't build images should use `dejima-confined`.
It also needs two repository secrets:

- `REGISTRY_USERNAME`: a user;
- `REGISTRY_TOKEN`: an access token of theirs with package write access.

## Volumes

| Host                    | Container          | Purpose                                                              |
| ----------------------- | ------------------ | -------------------------------------------------------------------- |
| `FLASHPOINT_HOST_PATH`  | `/data/flashpoint` | The Flashpoint install. Read-write: downloaded game data and download state are recorded there |
| `DATA_PATH` (`./data`)  | `/app/data`        | `user.db` and the installed Ruffle. Back this up                     |
| `LOGS_PATH` (`./logs`)  | `/app/logs`        | Log files                                                            |

The session manager mounts the Flashpoint install read-only and the Docker
socket, and passes `FLASHPOINT_HOST_PATH` on to the streamer containers.

## Ports and networks

- **App:** listens on `WEB_PORT` (default 80) on the host.
- **Session manager:** publishes no ports. The app proxies `/stream/` to it.
- **`dotcom-arcade` network:** the app and the session manager share it.
- **`dotcom-arcade-streams` network:** holds the streamer containers. It's
  internal, so they have no internet access and only the session manager can
  reach them.

Put a reverse proxy with HTTPS in front of the app. Streaming needs HTTPS, and
the proxy must pass WebSocket upgrades (see
[Streaming](../10-features/13-streaming.md#reverse-proxy)).

## Health checks

The app reports `starting` at `/health` until its database copy and cache
pre-warm finish, which can take minutes on network storage. The compose file
allows 5 minutes before counting failures.

```sh
docker compose ps
docker inspect dotcom-arcade --format '{{json .State.Health}}'
```

## Logs

```sh
docker compose logs -f app
docker compose logs -f session-manager
```

## Troubleshooting

- **"Source database not found":** `FLASHPOINT_HOST_PATH` doesn't point at a
  folder with `Data/flashpoint.sqlite`. Check with
  `docker compose exec app ls /data/flashpoint/Data`.
- **Missing playlists or settings:** `Data/Playlists` or `preferences.json` is
  missing. Re-run `scripts/setup-flashpoint.sh`, which takes them from
  `Base_1.zip`, or pass `--infinity`.
- **Permission errors on `./data` or `./logs`:** set `PUID`/`PGID` to the owner
  of those folders.

## Next steps

- [Environment Variables](./environment-variables.md)
- [Security Considerations](./security-considerations.md)
- [Upgrade Guide](./upgrade-guide.md)
