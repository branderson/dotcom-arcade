# Flashpoint streamer (prototype)

Runs a Flashpoint game natively on the server and streams it to the browser with
[Selkies](https://github.com/selkies-project/selkies), for platforms that cannot
run in a browser. One container plays one game, set by `GAME_ID`. It supports
Java applets, and Windows games installed under `LocalGames/` (see
[local-games](../local-games/README.md)).

## Requirements

A Linux Flashpoint install at `FLASHPOINT_HOST_PATH`. The streamer uses the
Infinity build's `Server/FlashpointGameServer`, `FPSoftware/Java` and
`FPSoftware/Wine`, which
Ultimate's packed zips do not include on Linux. To add them to an extracted
Ultimate without overwriting its data, copy an extracted
[Infinity for Linux](https://flashpointarchive.org/downloads) over it:

```sh
rsync -a --ignore-existing /path/to/infinity/ /path/to/flashpoint/
```

## Usage

```sh
FLASHPOINT_HOST_PATH=/path/to/flashpoint docker compose up -d --build
```

Open `https://<host>:3001` and accept the self-signed certificate. To play a
different game, set `GAME_ID`, plus `GAME_WIDTH` and `GAME_HEIGHT` to its
window size, and recreate the container. The launch log is at
`/config/fp-launch.log` inside the container.

## How it works

`fp-launch` follows the Flashpoint launcher's Linux launch sequence: it starts
the game server, mounts the game's zip through the server's `mountzip` API, and
runs the game's application with its HTTP proxy pointed at the game server.
Selkies restarts the game when it exits (`RESTART_APP`).

`appletviewer` lacks two things applets got from the browser's Java plugin, so
the image adds them: a `netscape.javascript.JSObject` stand-in whose window has
a `document.cookie` that persists to `/config/saves/cookies.txt`, and a policy
allowing HTTP requests through the game server's proxy. The same jar (`applet-support/`) is loaded as a Java agent
that removes appletviewer's menu bar and status line.

Windows games run under Flashpoint's bundled Wine from a writable copy of the
game's directory. Its `Prefs` directory, where Director projectors save, is
linked into `/config/saves`, so the session manager syncs it to the player's
browser. A player without a save starts from the `Prefs` the game ships with.
