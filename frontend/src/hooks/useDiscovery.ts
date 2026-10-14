import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { discoveryApi, gamesApi, playTrackingApi } from '@/lib/api';
import { useAuthStore } from '@/store/auth';
import { useMatureStore } from '@/store/mature';

export function useGameOfTheDay(date: string) {
  const showExtreme = useMatureStore((state) => state.showMature);
  return useQuery({
    queryKey: ['discovery', 'daily', date, showExtreme],
    queryFn: () => discoveryApi.getDaily(date, showExtreme),
    staleTime: Infinity,
  });
}

export function usePlaylistShelves(seed: number, count = 3, perShelf = 7) {
  const showExtreme = useMatureStore((state) => state.showMature);
  return useQuery({
    queryKey: ['discovery', 'playlists', seed, count, perShelf, showExtreme],
    queryFn: () => discoveryApi.getPlaylistShelves({ count, perShelf, seed, showExtreme }),
    staleTime: Infinity,
    placeholderData: keepPreviousData,
  });
}

/** A shuffled sample of the games released between two ISO dates, inclusive */
export function useReleasedBetween(from: string, to: string, limit: number) {
  const showExtreme = useMatureStore((state) => state.showMature);
  return useQuery({
    queryKey: ['discovery', 'released', from, to, limit, showExtreme],
    queryFn: () =>
      gamesApi.search({
        releasedFrom: from,
        releasedTo: to,
        sortBy: 'random',
        seed: 0,
        limit,
        page: 1,
        showExtreme,
      }),
    staleTime: Infinity,
    placeholderData: keepPreviousData,
  });
}

export function useRecentlyPlayed(limit: number) {
  const signedIn = useAuthStore((state) => state.isAuthenticated && !state.isGuest);
  return useQuery({
    queryKey: ['discovery', 'recently-played', limit],
    queryFn: async () => (await playTrackingApi.getGameStats(limit)).data,
    enabled: signedIn,
  });
}
