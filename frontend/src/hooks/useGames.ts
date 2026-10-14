import { useQuery } from '@tanstack/react-query';
import { gamesApi } from '@/lib/api';
import { useMatureStore } from '@/store/mature';
import { GameFilters } from '@/types/game';

export function useGames(filters: GameFilters, options?: { enabled?: boolean }) {
  const showExtreme = useMatureStore((state) => state.showMature);
  const withMature = { ...filters, showExtreme };
  return useQuery({
    queryKey: ['games', withMature],
    queryFn: ({ signal }) => gamesApi.search(withMature, signal),
    enabled: options?.enabled !== false,
    staleTime: 1000 * 60 * 5,
    gcTime: 1000 * 60 * 30,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
  });
}

export function useGame(id: string, options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: ['game', id],
    queryFn: () => gamesApi.getById(id),
    enabled: !!id && options?.enabled !== false,
  });
}

export function useRelatedGames(id: string, limit = 10) {
  const showExtreme = useMatureStore((state) => state.showMature);
  return useQuery({
    queryKey: ['games', id, 'related', limit, showExtreme],
    queryFn: () => gamesApi.getRelated(id, limit, showExtreme),
    enabled: !!id,
  });
}

export function useRandomGame(library?: string, platforms?: string[]) {
  const showExtreme = useMatureStore((state) => state.showMature);
  return useQuery({
    queryKey: ['games', 'random', library, platforms, showExtreme],
    queryFn: () => gamesApi.getRandom(library, platforms, showExtreme),
  });
}

export function useGameLaunchData(id: string) {
  return useQuery({
    queryKey: ['game', id, 'launch'],
    queryFn: () => gamesApi.getLaunchData(id),
    enabled: !!id,
    // Auto-poll every 2s while the game ZIP is being downloaded
    refetchInterval: (query) => (query.state.data?.downloading ? 2000 : false),
  });
}
