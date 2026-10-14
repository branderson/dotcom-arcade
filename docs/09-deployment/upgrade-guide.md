# Upgrade Guide

## Updating

```sh
git pull
docker compose up -d --build
```

Database migrations for `user.db` run automatically when the app starts. Back
up `DATA_PATH` (default `./data`) first if you want a way back.

## Moving from flashpoint-web

Dotcom Arcade keeps flashpoint-web's data format, so an existing install can
switch without losing accounts, playlists, favorites or play history.

1. Stop the old stack in its own directory with `docker compose down`. If you
   ran flashpoint-ultimate-server's session manager, stop that too.
2. Copy the old `.env` next to Dotcom Arcade's `docker-compose.yml`. Then
   compare it with `.env.example` for the new streaming settings.
3. Point `DATA_PATH` at the old data directory, which holds `user.db` and the
   installed Ruffle.
4. Start with `docker compose up -d --build`.

What changes:

- **Container and network names.** The app container is now `dotcom-arcade`,
  and the network is `dotcom-arcade`. If your reverse proxy reached the old
  `flashpoint-web` container by name, update it.
- **Site name.** If your site name was still the default "Flashpoint Web", it
  becomes "Dotcom Arcade". A name you set yourself is kept.
- **Streaming config.** Streaming is now part of the same compose file. Replace
  the separate `API_TOKEN` and `STREAMING_API_URL` with `STREAMING_API_TOKEN`
  and `COMPOSE_PROFILES=streaming` (see [Streaming](../10-features/13-streaming.md)).
- **No separate `/stream/` route.** The app now proxies streams to the session
  manager itself, and the session manager no longer publishes port 8081.
  Remove any `location /stream/` block from your reverse proxy, or streams
  will time out with a 504. Move its WebSocket and timeout settings to the
  location that serves the app (see
  [Reverse proxy](../10-features/13-streaming.md#reverse-proxy)).
