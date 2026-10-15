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

## Ruffle and the original Flash Player

A Flash game's saves carry over when switching between Ruffle and the original
Flash Player (streamed). Both store SharedObjects in the same `.sol` format,
under different names:

- Ruffle keeps them in localStorage, keyed by the site's host and the path it
  loaded the SWF from.
- Flash Player keeps them as files under `Flash_Player/#SharedObjects/` in the
  streamed game's saves, keyed by the SWF's own host and path.

Starting the original Flash Player adds the game's Ruffle saves to the files the
stream starts with. While it plays, its saves are copied back into Ruffle's
storage as they change. Saves made with a `localPath` of `/` are shared by
every game in Ruffle, so only those seen changing while this game ran are
carried over.

Ruffle's copy of a save is kept up to date in both directions, so it's the one
the stream starts with:

- Before Ruffle starts a game, it's given any of the stream's saves it doesn't
  have yet, such as progress made only in the stream. The game then loads that
  progress instead of starting a fresh save, which would otherwise replace the
  stream's progress on the next switch. Saves Ruffle already has are left alone.
- While the stream plays, the saves it changes are copied into Ruffle.

Some games save under a different path in each player. A SWF that a wrapper
(such as MochiAds) loads from memory saves under its loader's path plus
`[[DYNAMIC]]/<n>`, and a wrapper may do that in Ruffle but not in the
standalone Flash Player. Bloons, for example, keeps its progress under
`bloons.swf/[[DYNAMIC]]/1/` in Ruffle and under `bloons.swf/` in Flash Player.
Saves that differ only by that step are treated as one save:

- When the stream starts, a save is written to every path the stream has for
  it. If Ruffle has both a dynamic and a plain copy, the dynamic one is used.
- A save the stream changes is copied to every key Ruffle has for it.

A stream save replaced this way is still in the account's backups.

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
