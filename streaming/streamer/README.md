# Flashpoint streamer (prototype)

Runs a Flashpoint game natively on the server and streams it to the browser with
[Selkies](https://github.com/selkies-project/selkies), for platforms that cannot
run in a browser. One container plays one game, set by `GAME_ID`. It launches
games the way Flashpoint's Linux launcher does, so Java applets, Shockwave,
Flash and Windows games installed under `LocalGames/` (see
[local-games](../local-games/README.md)) all run.

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

Other games go through `fp-command`, which applies the launcher's rules: it maps
the application path through `Data/execs.json`, swaps `.bat` for `.sh`, and runs
`.exe` files under Flashpoint's bundled Wine. Windows programs run from a
writable mirror of the install, since they write beside themselves; a
Director projector's `Prefs`, where it saves, is linked into `/config/saves`, as
is Flash Player's save directory, so the session manager syncs both to the
player's browser. OldCPUSimulator hangs under Wine, so its target runs under
`cpulimit` at the same share of the CPU. Flash projectors switch to full screen,
which hides their menu bar and scales the movie to the display, and Flashpoint
Navigator's toolbars are hidden.
