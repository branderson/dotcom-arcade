# Streamer

Runs a Flashpoint game natively on the server and streams it to the browser with
[Selkies](https://github.com/selkies-project/selkies), for platforms that cannot
run in a browser. One container plays one game, set by `GAME_ID`. It launches
games the way Flashpoint's Linux launcher does, so Java applets, Shockwave and
Flash run, as do Windows games installed under `LocalGames/<name>/` with an
application path of `LocalGames\<name>\<game>.exe`.

## Requirements

A Linux Flashpoint install. The streamer uses the Infinity build's
`Server/FlashpointGameServer`, `FPSoftware/Java` and `FPSoftware/Wine`, which
Ultimate's archives only include for Windows.
`scripts/setup-flashpoint.sh --infinity` adds them without overwriting
anything.

## Running one by hand

The session manager normally starts these. To debug a game on its own:

```sh
docker build -t dotcom-arcade-streamer streaming/streamer
docker run --rm --shm-size 1g -p 3001:3001 \
  -v /path/to/flashpoint:/flashpoint:ro \
  -e GAME_ID=<game id> -e SELKIES_MANUAL_WIDTH=800 -e SELKIES_MANUAL_HEIGHT=600 \
  -e RESTART_APP=true -e NO_DECOR=true \
  dotcom-arcade-streamer
```

Open `https://<host>:3001` and accept the self-signed certificate. The launch
log is at `/config/fp-launch.log` inside the container.

## How it works

`fp-launch` follows the Flashpoint launcher's Linux launch sequence: it starts
the game server, mounts the game's zip through the server's `mountzip` API, and
runs the game's application with its HTTP proxy pointed at the game server.
Selkies restarts the game when it exits (`RESTART_APP`).

`appletviewer` lacks two things applets got from the browser's Java plugin, so
the image adds them: a `netscape.javascript.JSObject` stand-in whose window has
a `document.cookie` that persists to `/config/saves/cookies.txt`, and a policy
allowing HTTP requests through the game server's proxy. The same jar
(`applet-support/`) is loaded as a Java agent that removes appletviewer's menu
bar and status line.

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
