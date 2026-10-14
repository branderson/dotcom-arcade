# Streaming

Streams Flashpoint games that can't run in a browser, such as Java applets and
Shockwave, from the server into Dotcom Arcade's game page. Each player gets
their own container, which is removed when they disconnect. Setup is covered in
[docs/10-features/13-streaming.md](../docs/10-features/13-streaming.md); this
page describes how it works.

- `streamer/`: the container image that runs one game and streams it with
  Selkies
- `session-manager/`: starts and removes streamer containers, proxies their
  streams, and syncs saves to the browser

Both are built by the root `docker-compose.yml` under the `streaming` profile.

## Session manager

| Endpoint | Caller | Purpose |
|---|---|---|
| `GET :8080/games/<id>` | app backend, `Authorization: Bearer <API_TOKEN>` | Returns the game's `{width, height}`, or 422 if it can't be streamed |
| `POST :8080/sessions {gameId}` | app backend, `Authorization: Bearer <API_TOKEN>` | Creates a session; returns `{id, path, width, height}`, or 422 if the game can't be streamed |
| `POST /stream/<id>/_fp/start {files}` | browser | Starts the container with the player's saves |
| `GET /stream/<id>/_fp/saves` | browser | Server-sent events carrying `{files}` whenever saves change, then `end` |
| `/stream/<id>/*` | browser | Proxied to the session's Selkies, including WebSockets |

A game is streamable when its platform is in `STREAM_PLATFORMS` (default
`Java,Shockwave,Flash`) and the streamer can resolve its launcher. The display
is sized from the content it launches: a Director movie's or projector's stage,
a SWF's stage, a page's applet or largest embed, with
fallbacks of 800x600, or 1024x768 for pages.

Saves are `{relative path: base64 contents}` for the files under the
container's `/config/saves`. A session is removed if nothing connects within
2 minutes or 30 seconds after its last WebSocket closes. At most `MAX_SESSIONS`
run at once.
