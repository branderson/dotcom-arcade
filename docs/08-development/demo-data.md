# Demo data

`scripts/demo/build-demo-data.mjs` builds a small Flashpoint install of made-up
games, for developing without a 2.3 TB download and for taking the README's
screenshots. Everything in it is invented:

- about 50 games with fake titles, studios and descriptions;
- generated tile art and screenshots;
- four curated playlists;
- **Pixel Penguin Panic**, a tiny HTML5 game written for the demo, which is
  the only one that plays.

The database uses Flashpoint 14's schema (`scripts/demo/flashpoint-schema.sql`,
from [FPA-Rust](https://github.com/FlashpointProject/FPA-Rust), MIT).

## Using it

```sh
npm run install:all
node scripts/demo/build-demo-data.mjs /tmp/demo-flashpoint
```

Then point the app at it, with `FLASHPOINT_PATH=/tmp/demo-flashpoint` in
`backend/.env` for development, or `FLASHPOINT_HOST_PATH` in `.env` for Docker.

## Screenshots

The README's screenshots in `docs/images` come from the demo data, so they show
no real games. To retake them after a UI change:

1. Build the frontend (`npm run build`), then run the app on the demo data with
   a fresh user database, serving the built frontend (`SERVE_FRONTEND=true`).
2. Install Playwright: `npm install --no-save playwright && npx playwright install chromium`.
3. Run `node scripts/demo/take-screenshots.mjs http://localhost:3100`.

The script creates the first account, plays a few games for "Jump back in",
moves the Time Machine to the week the demo fills, and writes `home.png`,
`game.png` and `playing.png`.
