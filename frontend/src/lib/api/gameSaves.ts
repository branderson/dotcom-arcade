import { apiClient } from './client';
import type { GameSaveData } from '@/lib/saves/gameSaves';

export interface GameSaveSnapshotMeta {
  id: number;
  hash: string;
  size: number;
  savedAt: string;
  createdAt: string;
}

export interface GameSaveSnapshot extends GameSaveSnapshotMeta {
  data: GameSaveData;
}

export interface GameSaves {
  latest: GameSaveSnapshot | null;
  snapshots: GameSaveSnapshotMeta[];
}

export interface GameSaveUpload {
  data: GameSaveData;
  hash: string;
  savedAt: string;
}

/** Keepalive requests outliving a closing page may carry at most 64 KiB. */
const KEEPALIVE_LIMIT = 60 * 1024;

export const gameSavesApi = {
  get: async (gameId: string): Promise<GameSaves> => {
    const { data } = await apiClient.get<GameSaves>(`/game-saves/${gameId}`);
    return data;
  },

  getSnapshot: async (gameId: string, snapshotId: number): Promise<GameSaveSnapshot> => {
    const { data } = await apiClient.get<GameSaveSnapshot>(`/game-saves/${gameId}/${snapshotId}`);
    return data;
  },

  upload: async (gameId: string, upload: GameSaveUpload): Promise<GameSaveSnapshotMeta> => {
    const { data } = await apiClient.post<GameSaveSnapshotMeta>(`/game-saves/${gameId}`, upload);
    return data;
  },

  /**
   * Uploads while the page is closing, when an axios request would be cancelled.
   * Returns false when the save is too large for a keepalive request.
   */
  uploadOnUnload: (gameId: string, upload: GameSaveUpload): boolean => {
    const body = JSON.stringify(upload);
    if (body.length > KEEPALIVE_LIMIT) return false;
    void fetch(`/api/game-saves/${gameId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      keepalive: true,
      body,
    }).catch(() => undefined);
    return true;
  },
};
