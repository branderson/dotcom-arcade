import { apiClient } from './client';
import type { Game } from '@/types/game';

export interface DailyPick {
  date: string;
  game: Game;
  playlist?: { id: string; title: string };
}

export interface PlaylistShelf {
  id: string;
  title: string;
  total: number;
  games: Game[];
}

export const discoveryApi = {
  getDaily: async (date: string, showExtreme: boolean): Promise<DailyPick> => {
    const { data } = await apiClient.get<DailyPick>('/discovery/daily', {
      params: { date, showExtreme },
    });
    return data;
  },

  getPlaylistShelves: async (params: {
    count: number;
    perShelf: number;
    seed: number;
    showExtreme: boolean;
  }): Promise<PlaylistShelf[]> => {
    const { data } = await apiClient.get<PlaylistShelf[]>('/discovery/playlists', { params });
    return data;
  },
};
