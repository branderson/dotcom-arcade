# flashpoint-ultimate-server

Streams Flashpoint games that can't run in a browser, such as Java applets,
from a Linux server to [flashpoint-web](https://github.com/darkraise/flashpoint-web).
Each player gets their own container, which is removed when they disconnect.
Saves are kept in the player's browser.

- `streamer/`: the container image that runs one game and streams it with Selkies
- `session-manager/`: starts and removes streamer containers, proxies their
  streams, and syncs saves to the browser

## Setup

The Flashpoint install needs Infinity's Linux software (see
[streamer/README.md](streamer/README.md#requirements)).

```sh
docker build -t flashpoint-streamer streamer
FLASHPOINT_HOST_PATH=/path/to/flashpoint API_TOKEN=$(openssl rand -hex 32) \
  docker compose up -d --build
```

Give flashpoint-web the same `API_TOKEN` and the internal API URL
`http://flashpoint-session-manager:8080`, and attach it to the `flashpoint`
network. Then route `/stream/` on flashpoint-web's site to the session manager,
for example with nginx:

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

Streaming needs HTTPS, since browsers only allow the video decoder Selkies uses
in secure contexts.

## Session manager

| Endpoint | Caller | Purpose |
|---|---|---|
| `GET :8080/games/<id>` | flashpoint-web backend, `Authorization: Bearer <API_TOKEN>` | Returns the game's `{width, height}`, or 422 if it can't be streamed |
| `POST :8080/sessions {gameId}` | flashpoint-web backend, `Authorization: Bearer <API_TOKEN>` | Creates a session; returns `{id, path, width, height}`, or 422 if the game can't be streamed |
| `POST /stream/<id>/_fp/start {files}` | browser | Starts the container with the player's saves |
| `GET /stream/<id>/_fp/saves` | browser | Server-sent events carrying `{files}` whenever saves change, then `end` |
| `/stream/<id>/*` | browser | Proxied to the session's Selkies, including WebSockets |

Saves are `{relative path: base64 contents}` for the files under the
container's `/config/saves`. A session is removed if nothing connects within
2 minutes or 30 seconds after its last WebSocket closes. At most `MAX_SESSIONS`
run at once.
