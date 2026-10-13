# Discovery API

Homepage picks drawn from the Flashpoint curated playlists (`Data/Playlists`).
Only arcade playlists are used, and mature games are left out unless
`showExtreme=true` (see
[Mature Content](../10-features/12-discovery-portal.md#mature-content)).

## Get Game of the Day

`GET /api/discovery/daily?date=2026-10-12` - No auth required

Query params: `date` (YYYY-MM-DD, default: today in UTC), `showExtreme`
(default: false)

Picks the same game for everyone on a given date, from all curated playlists
combined. Games missing from the install are skipped.

```json
{
  "date": "2026-10-12",
  "game": { "id": "0a4ffe5c-...", "title": "The World's Hardest Game 4", ... },
  "playlist": { "id": "f45d2eb2-...", "title": "Rage for the Ages" }
}
```

Error: `404 Not Found` if no curated games exist

## Get Playlist Shelves

`GET /api/discovery/playlists?count=3&perShelf=7&seed=42` - No auth required

Query params: `count` (default: 3), `perShelf` (games per playlist, default: 7),
`seed` (0-2147483647, default: 0), `showExtreme` (default: false)

Returns `count` curated playlists, each with a sample of its games. The same
seed always returns the same playlists and games.

```json
[
  {
    "id": "f45d2eb2-...",
    "title": "Jingle Jollies",
    "total": 30,
    "games": [{ "id": "7de03fe2-...", "title": "Christmas Escape", ... }]
  }
]
```
