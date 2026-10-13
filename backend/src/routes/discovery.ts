import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../middleware/asyncHandler';
import { sharedAccessAuth } from '../middleware/auth';
import { AppError } from '../middleware/errorHandler';
import { rateLimitStandard } from '../middleware/rateLimiter';
import { GameService } from '../services/GameService';
import { MatureContentService } from '../services/MatureContentService';
import { PlaylistService, type Playlist } from '../services/PlaylistService';

const router = Router();
const gameService = new GameService();
const playlistService = new PlaylistService();

router.use(rateLimitStandard);
router.use(sharedAccessAuth);

const showExtremeSchema = z
  .enum(['true', 'false'])
  .optional()
  .transform((value) => value === 'true');

/** mulberry32: a small seeded generator, so a seed always gives the same picks */
function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffled<T>(items: readonly T[], seed: number): T[] {
  const random = seededRandom(seed);
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

function hashString(text: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash = Math.imul(hash ^ text.charCodeAt(i), 0x01000193);
  }
  return hash >>> 0;
}

/** Flashpoint's curated arcade playlists, with their games narrowed to what may be shown. */
async function curatedPlaylists(
  showExtreme: boolean
): Promise<Required<Pick<Playlist, 'id' | 'title' | 'gameIds'>>[]> {
  const playlists = await playlistService.getAllPlaylists();
  return playlists
    .filter((playlist) => (playlist.library ?? 'arcade') === 'arcade')
    .map((playlist) => ({
      id: playlist.id,
      title: playlist.title.trim(),
      gameIds: (playlist.gameIds ?? []).filter(
        (id) => showExtreme || !MatureContentService.isMature(id)
      ),
    }))
    .filter((playlist) => playlist.gameIds.length > 0);
}

// The same pick for everyone on a given day, from Flashpoint's curated playlists
router.get(
  '/daily',
  asyncHandler(async (req, res) => {
    const date =
      z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/)
        .optional()
        .parse(req.query.date) ?? new Date().toISOString().slice(0, 10);
    const showExtreme = showExtremeSchema.parse(req.query.showExtreme);

    const playlists = await curatedPlaylists(showExtreme);
    const pool = [...new Set(playlists.flatMap((playlist) => playlist.gameIds))].sort();
    if (pool.length === 0) {
      throw new AppError(404, 'No curated games found');
    }

    // Skip games missing from this install, trying the following ones in a fixed order
    const start = hashString(date) % pool.length;
    for (let i = 0; i < Math.min(pool.length, 20); i++) {
      const gameId = pool[(start + i) % pool.length];
      const game = await gameService.getGameById(gameId);
      if (game) {
        const playlist = playlists.find((p) => p.gameIds.includes(gameId));
        res.json({ date, game, playlist: playlist && { id: playlist.id, title: playlist.title } });
        return;
      }
    }
    throw new AppError(404, 'No curated games found');
  })
);

// A few curated playlists, each with a sample of its games, shuffled by seed
router.get(
  '/playlists',
  asyncHandler(async (req, res) => {
    const query = z
      .object({
        count: z.coerce.number().int().min(1).max(10).default(3),
        perShelf: z.coerce.number().int().min(1).max(30).default(7),
        seed: z.coerce.number().int().min(0).max(2147483647).default(0),
      })
      .parse(req.query);
    const showExtreme = showExtremeSchema.parse(req.query.showExtreme);

    const playlists = shuffled(await curatedPlaylists(showExtreme), query.seed).slice(
      0,
      query.count
    );
    const shelves = await Promise.all(
      playlists.map(async (playlist) => {
        const sample = shuffled(playlist.gameIds, query.seed + hashString(playlist.id)).slice(
          0,
          query.perShelf
        );
        const games = await gameService.getGamesByIds(sample);
        const byId = new Map(games.map((game) => [game.id, game]));
        return {
          id: playlist.id,
          title: playlist.title,
          total: playlist.gameIds.length,
          games: sample.flatMap((id) => byId.get(id) ?? []),
        };
      })
    );
    res.json(shelves);
  })
);

export default router;
