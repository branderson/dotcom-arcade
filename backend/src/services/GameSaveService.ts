import { UserDatabaseService } from './UserDatabaseService';

/** Snapshots kept per user and game, the newest being the current save. */
export const SNAPSHOTS_KEPT = 10;

export interface GameSaveSnapshotMeta {
  id: number;
  hash: string;
  size: number;
  savedAt: string;
  createdAt: string;
}

export interface GameSaveSnapshot extends GameSaveSnapshotMeta {
  data: unknown;
}

interface SnapshotRow {
  id: number;
  content_hash: string;
  size: number;
  saved_at: string;
  created_at: string;
  data?: string;
}

function toMeta(row: SnapshotRow): GameSaveSnapshotMeta {
  return {
    id: row.id,
    hash: row.content_hash,
    size: row.size,
    savedAt: row.saved_at,
    createdAt: row.created_at,
  };
}

/** Stores copies of the saves games keep in a player's browser. */
export class GameSaveService {
  /** All snapshots for a game, newest first. */
  list(userId: number, gameId: string): GameSaveSnapshotMeta[] {
    return UserDatabaseService.all<SnapshotRow>(
      `SELECT id, content_hash, size, saved_at, created_at FROM game_save_snapshots
       WHERE user_id = ? AND game_id = ? ORDER BY id DESC`,
      [userId, gameId]
    ).map(toMeta);
  }

  get(userId: number, gameId: string, id?: number): GameSaveSnapshot | null {
    const row = UserDatabaseService.get<SnapshotRow>(
      `SELECT id, content_hash, size, saved_at, created_at, data FROM game_save_snapshots
       WHERE user_id = ? AND game_id = ? ${id === undefined ? '' : 'AND id = ?'}
       ORDER BY id DESC LIMIT 1`,
      id === undefined ? [userId, gameId] : [userId, gameId, id]
    );
    return row ? { ...toMeta(row), data: JSON.parse(row.data ?? 'null') } : null;
  }

  /**
   * Stores a snapshot as the game's current save, unless it matches the current
   * one, then drops snapshots beyond the newest SNAPSHOTS_KEPT.
   */
  save(
    userId: number,
    gameId: string,
    data: unknown,
    hash: string,
    savedAt: string
  ): { snapshot: GameSaveSnapshotMeta; created: boolean } {
    const json = JSON.stringify(data);
    const db = UserDatabaseService.getDatabase();
    return db.transaction(() => {
      const latest = db
        .prepare(
          `SELECT id, content_hash, size, saved_at, created_at FROM game_save_snapshots
           WHERE user_id = ? AND game_id = ? ORDER BY id DESC LIMIT 1`
        )
        .get(userId, gameId) as SnapshotRow | undefined;
      if (latest?.content_hash === hash) {
        return { snapshot: toMeta(latest), created: false };
      }

      const result = db
        .prepare(
          `INSERT INTO game_save_snapshots (user_id, game_id, content_hash, data, size, saved_at)
           VALUES (?, ?, ?, ?, ?, ?)`
        )
        .run(userId, gameId, hash, json, Buffer.byteLength(json), savedAt);
      db.prepare(
        `DELETE FROM game_save_snapshots WHERE user_id = ? AND game_id = ? AND id NOT IN (
           SELECT id FROM game_save_snapshots WHERE user_id = ? AND game_id = ?
           ORDER BY id DESC LIMIT ?)`
      ).run(userId, gameId, userId, gameId, SNAPSHOTS_KEPT);

      const row = db
        .prepare(
          `SELECT id, content_hash, size, saved_at, created_at FROM game_save_snapshots WHERE id = ?`
        )
        .get(result.lastInsertRowid) as SnapshotRow;
      return { snapshot: toMeta(row), created: true };
    })();
  }
}
