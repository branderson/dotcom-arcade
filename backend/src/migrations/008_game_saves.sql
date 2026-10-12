-- ===================================
-- Migration 008: Game saves
-- ===================================
-- Copies of the saves games keep in a player's browser, so a fresh browser can
-- restore them. Each row is one snapshot; the newest few per user and game are
-- kept as backups.

CREATE TABLE IF NOT EXISTS game_save_snapshots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  game_id TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  data TEXT NOT NULL,
  size INTEGER NOT NULL,
  saved_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_game_save_snapshots_user_game
  ON game_save_snapshots(user_id, game_id, id DESC);
