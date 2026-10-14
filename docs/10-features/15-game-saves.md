# Game Saves

## Overview

Games keep their saves in the player's browser. For signed-in players, Dotcom
Arcade also keeps them on their account, so a save made on one computer is
there on the next, and the last 10 distinct saves of each game can be restored.
Guests keep browser-only saves.

## What a save is

A save is a snapshot of up to three kinds of browser storage:

- **Streamed games' files:** what a streamed game wrote to its save directory.
  It's sent back from the streamer as it changes, and kept in the
  `flashpoint-stream-saves` IndexedDB database.
- **localStorage:** Ruffle's Flash SharedObjects, and HTML5 games' localStorage.
- **IndexedDB:** HTML5 games' databases, including Unity WebGL's `/idbfs`.

Games share the app's origin, so their keys can't tell which game wrote them.
The app works it out by watching instead: whatever changes while a game is
playing belongs to that game, and it remembers that for next time. The app's own
storage is never included.

## Sync

Before a game starts, the app compares the browser's save with the account's
latest:

- If they're the same, nothing happens.
- If only one side changed since this browser last synced, that side wins.
- If both changed, the newer one wins. The other is still kept as a backup.

While playing, changes are uploaded 10 seconds after they happen, when the
player leaves the game, and when the tab closes.

## Restoring

The **Saves** button under the game lists the account's backups with their
times and sizes. Restoring one applies it and restarts the game. The save it
replaced stays in the list.

## Limits

- **Size:** each snapshot is at most 10 MB.
- **History:** the 10 newest distinct snapshots per user and game are kept.
- **Not covered:** cookies set by HTML5 games.
- **No merging:** when two browsers both changed a save, the newer one wins
  whole. Saves aren't combined.

## API

Endpoints require a signed-in user with `games.play`:

| Endpoint                                    | Purpose                                                      |
| ------------------------------------------- | ------------------------------------------------------------ |
| `GET /api/game-saves/:gameId`               | Latest snapshot with its data, plus metadata for all backups |
| `GET /api/game-saves/:gameId/:id`           | One snapshot with its data                                   |
| `POST /api/game-saves/:gameId`              | Upload `{data, hash, savedAt}`; a duplicate of the latest is a no-op |
