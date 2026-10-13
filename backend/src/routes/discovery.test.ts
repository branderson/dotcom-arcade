import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';

vi.mock('../utils/logger', () => ({
  logger: { info: vi.fn(), error: vi.fn(), debug: vi.fn(), warn: vi.fn() },
}));
const passThrough = vi.hoisted(() => (_req: unknown, _res: unknown, next: () => void) => next());
vi.mock('../middleware/rateLimiter', () => ({ rateLimitStandard: passThrough }));
vi.mock('../middleware/auth', () => ({ sharedAccessAuth: passThrough }));

const playlists = vi.hoisted(() => [
  { id: 'hof', title: ' Hall of Fame ', library: 'arcade', gameIds: ['g1', 'g2', 'g3', 'g4'] },
  { id: 'food', title: 'Flash Food', library: 'arcade', gameIds: ['g3', 'g5'] },
  { id: 'anim', title: 'Animations', library: 'theatre', gameIds: ['g6'] },
  { id: 'empty', title: 'Favorites', library: 'arcade', gameIds: [] },
]);
vi.mock('../services/PlaylistService', () => ({
  PlaylistService: vi.fn().mockImplementation(() => ({ getAllPlaylists: async () => playlists })),
}));
vi.mock('../services/GameService', () => ({
  GameService: vi.fn().mockImplementation(() => ({
    getGameById: async (id: string) => ({ id, title: `Game ${id}` }),
    getGamesByIds: async (ids: string[]) => ids.map((id) => ({ id, title: `Game ${id}` })),
  })),
}));
vi.mock('../services/MatureContentService', () => ({
  MatureContentService: { isMature: (id: string) => id === 'g2' },
}));

import discoveryRouter from './discovery';
import { errorHandler } from '../middleware/errorHandler';

const app = express();
app.use('/api/discovery', discoveryRouter);
app.use(errorHandler);

describe('discovery', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('picks the same curated game for everyone on a day, never a mature one by default', async () => {
    const days = await Promise.all(
      Array.from({ length: 30 }, (_, i) =>
        request(app).get(`/api/discovery/daily?date=2026-10-${String(i + 1).padStart(2, '0')}`)
      )
    );
    const picks = days.map((res) => res.body.game.id);
    expect(new Set(picks).size).toBeGreaterThan(1);
    expect(picks).not.toContain('g2');
    expect(picks).not.toContain('g6');

    const again = await request(app).get('/api/discovery/daily?date=2026-10-01');
    expect(again.body.game.id).toBe(picks[0]);
    expect(again.body.playlist.title).toMatch(/Hall of Fame|Flash Food/);
  });

  it('returns shelves of curated arcade playlists, reproducible by seed', async () => {
    const first = await request(app).get('/api/discovery/playlists?count=5&perShelf=3&seed=42');
    expect(first.status).toBe(200);
    expect(first.body.map((shelf: { id: string }) => shelf.id).sort()).toEqual(['food', 'hof']);
    const hof = first.body.find((shelf: { id: string }) => shelf.id === 'hof');
    expect(hof).toMatchObject({ title: 'Hall of Fame', total: 3 });
    expect(hof.games).toHaveLength(3);
    expect(hof.games.map((g: { id: string }) => g.id)).not.toContain('g2');

    const again = await request(app).get('/api/discovery/playlists?count=5&perShelf=3&seed=42');
    expect(again.body).toEqual(first.body);
  });

  it('includes mature games when asked', async () => {
    const res = await request(app).get(
      '/api/discovery/playlists?count=5&perShelf=10&seed=1&showExtreme=true'
    );
    const hof = res.body.find((shelf: { id: string }) => shelf.id === 'hof');
    expect(hof.total).toBe(4);
  });
});
