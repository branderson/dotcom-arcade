# Streaming

## Overview

Some Flashpoint games can't run in a browser at all: Java applets, Shockwave
and Director movies, and Flash games that need the real Flash Player. Dotcom
Arcade runs each one natively on the server and streams it into the game page.
Every player gets their own container, which is removed when they leave.

Streaming is optional and off by default. Without it, those games' pages say
they need the Flashpoint Launcher.

## How it works

- **The app** (`backend/`) asks the session manager whether each game can be
  streamed. It then offers Play, plus the Ruffle / original Flash Player switch
  for Flash games.
- **The session manager** (`streaming/session-manager`) starts one streamer
  container per session through the Docker socket, and proxies the browser's
  connection to it at `/stream/<id>/`.
- **The streamer** (`streaming/streamer`) launches the game the way
  Flashpoint's Linux launcher does, and streams the screen and sound with
  [Selkies](https://github.com/selkies-project/selkies). The display is sized to
  the game: a Director stage, a SWF's stage, or a page's applet or largest
  embed.

A session is removed if nothing connects within 2 minutes, or 30 seconds after
the player's last connection closes. At most `MAX_SESSIONS` run at once. Games
save to files inside the container; those are sent back to the player's browser
as they change, and restored at the start of the next session (see
[Game Saves](./15-game-saves.md)).

Implementation details are in [streaming/README.md](../../streaming/README.md)
and [streaming/streamer/README.md](../../streaming/streamer/README.md).

## Requirements

- **Infinity for Linux's software.** The streamer runs Flashpoint's Linux
  builds of the game server, Java, Wine and the Flash and Shockwave players.
  Ultimate's archives only include the Windows builds. Run
  `scripts/setup-flashpoint.sh --with-infinity`, which adds them without
  replacing anything.
- **HTTPS.** Browsers only allow the video decoder Selkies uses on secure
  pages.
- **A reverse proxy route** for `/stream/`, including WebSocket upgrades (see
  below).

## Enabling it

Add to `.env`:

```sh
COMPOSE_PROFILES=streaming
STREAMING_API_TOKEN=<output of: openssl rand -hex 32>
```

Then run `docker compose up -d --build`. This builds the session manager and
streamer images and starts the session manager. The app reaches the session
manager's internal API at `http://session-manager:8080`, which the compose file
sets up.

| Variable              | Default                       | Description                                                       |
| --------------------- | ----------------------------- | ----------------------------------------------------------------- |
| `STREAMING_API_TOKEN` | -                             | Shared secret between the app and the session manager; required   |
| `STREAMING_API_URL`   | `http://session-manager:8080` | Session manager's internal API                                    |
| `STREAM_PORT`         | `8081`                        | Host port the session manager serves `/stream/` on                |
| `MAX_SESSIONS`        | `4`                           | Most streams running at once                                      |
| `STREAM_PLATFORMS`    | `Java,Shockwave,Flash`        | Platforms offered for streaming                                   |

## Reverse proxy

Route `/stream/` to the session manager and everything else to the app. With
nginx:

```nginx
location /stream/ {
    proxy_pass http://127.0.0.1:8081;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host $host;
    proxy_buffering off;
    proxy_read_timeout 1h;
}
```

If another proxy sits in front of this one, it needs WebSocket support and
long timeouts as well. A stream that connects and then immediately fails with
HTTP 400 usually means a proxy in the chain doesn't pass the WebSocket upgrade.

## Security

The session manager holds the Docker socket, which is effectively root on the
host. Expose only its `/stream/` port, and only through your proxy. Streamer
containers run on an internal network with no internet access, reachable only
from the session manager.

## Troubleshooting

- **No "Original Flash Player" button, or "needs the Flashpoint Launcher" on
  Java and Shockwave games.** The session manager isn't running, the tokens
  don't match, or it can't resolve the game's launcher; check that Infinity's
  software is installed. Ask it directly from the app's container:

  ```sh
  docker compose exec app sh -c 'curl -s -o /dev/null -w "%{http_code}\n" \
    -H "Authorization: Bearer $STREAMING_API_TOKEN" \
    http://session-manager:8080/games/<game id>'
  ```

  `200` means the game can be streamed; `422` means it can't.
- **The stream stays black or disconnects at once.** Check that the page is on
  HTTPS, and that `/stream/` passes WebSocket upgrades.
