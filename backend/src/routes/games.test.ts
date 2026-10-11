import { describe, it, expect, vi, beforeEach } from 'vitest';
import express, { Express } from 'express';
import request from 'supertest';

vi.mock('../utils/logger', () => ({
  logger: { info: vi.fn(), error: vi.fn(), debug: vi.fn(), warn: vi.fn() },
}));

const passThrough = vi.hoisted(() => (_req: unknown, _res: unknown, next: () => void) => next());
vi.mock('../middleware/rateLimiter', () => ({
  rateLimitStandard: passThrough,
}));
vi.mock('../middleware/activityLogger', () => ({
  logActivity: () => passThrough,
}));

// Auth and RBAC run for real; only token verification and settings are stubbed.
vi.mock('../services/AuthService');

const getGameById = vi.hoisted(() => vi.fn());
vi.mock('../services/GameService', () => ({
  GameService: vi.fn().mockImplementation(() => ({
    getGameById,
    getGameDataPath: vi.fn().mockResolvedValue(null),
  })),
}));
vi.mock('../services/GameSearchCache', () => ({
  GameSearchCache: {},
}));
const mountGameZip = vi.hoisted(() => vi.fn());
vi.mock('../services/GameDataService', () => ({
  gameDataService: { mountGameZip },
}));

const isStreamable = vi.hoisted(() => vi.fn());
const createSession = vi.hoisted(() => vi.fn());
vi.mock('../services/StreamingService', () => ({
  StreamingService: { isStreamable, createSession },
}));

import gamesRouter from './games';
import { errorHandler } from '../middleware/errorHandler';
import { AuthService } from '../services/AuthService';

const GAME_ID = '11111111-2222-4333-8444-555555555555';

function createApp(): Express {
  const app = express();
  app.use('/api/games', gamesRouter);
  app.use(errorHandler);
  return app;
}

function signInAs(permissions: string[]): void {
  vi.mocked(AuthService.prototype.verifyAccessToken).mockResolvedValue({
    id: 42,
    username: 'player',
    email: 'player@example.com',
    role: 'user',
    permissions,
  });
}

describe('GET /api/games/:id/launch', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getGameById.mockResolvedValue({
      id: GAME_ID,
      title: 'Test Game',
      platformName: 'Flash',
      launchCommand: 'http://example.com/game.swf',
      source: 'http://example.com',
    });
    mountGameZip.mockResolvedValue({ mounted: true, downloading: false });
  });

  it('rejects users without games.play before mounting anything', async () => {
    signInAs(['games.read']);

    const response = await request(createApp())
      .get(`/api/games/${GAME_ID}/launch`)
      .set('Authorization', 'Bearer token');

    expect(response.status).toBe(403);
    expect(mountGameZip).not.toHaveBeenCalled();
  });

  it('launches for users with games.play', async () => {
    signInAs(['games.read', 'games.play']);

    const response = await request(createApp())
      .get(`/api/games/${GAME_ID}/launch`)
      .set('Authorization', 'Bearer token');

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ gameId: GAME_ID, canPlayInBrowser: true });
    expect(mountGameZip).toHaveBeenCalledWith(GAME_ID, { allowRecovery: true });
  });

  it('launches for guests when guest access is enabled', async () => {
    vi.mocked(AuthService.prototype.isGuestAccessEnabled).mockReturnValue(true);

    const response = await request(createApp()).get(`/api/games/${GAME_ID}/launch`);

    expect(response.status).toBe(200);
    expect(mountGameZip).toHaveBeenCalledOnce();
  });
});

describe('streaming games that cannot run in a browser', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getGameById.mockResolvedValue({
      id: GAME_ID,
      title: 'Java Game',
      platformName: 'Java',
      launchCommand: 'http://example.com/index.html',
    });
    mountGameZip.mockResolvedValue({ mounted: true, downloading: false });
    isStreamable.mockResolvedValue(true);
    createSession.mockResolvedValue({ path: '/stream/abc/', width: 472, height: 354 });
  });

  it('reports a streamable game on its details and launch data', async () => {
    signInAs(['games.read', 'games.play']);

    const details = await request(createApp())
      .get(`/api/games/${GAME_ID}`)
      .set('Authorization', 'Bearer token');
    const launch = await request(createApp())
      .get(`/api/games/${GAME_ID}/launch`)
      .set('Authorization', 'Bearer token');

    expect(details.body).toMatchObject({ id: GAME_ID, streamable: true });
    expect(launch.body).toMatchObject({ canPlayInBrowser: false, streamable: true });
  });

  it('does not ask the session manager about browser-playable games', async () => {
    signInAs(['games.read', 'games.play']);
    getGameById.mockResolvedValue({
      id: GAME_ID,
      platformName: 'Flash',
      launchCommand: 'http://a/b.swf',
    });

    const details = await request(createApp())
      .get(`/api/games/${GAME_ID}`)
      .set('Authorization', 'Bearer token');

    expect(details.body.streamable).toBe(false);
    expect(isStreamable).not.toHaveBeenCalled();
  });

  it('creates a session for users with games.play', async () => {
    signInAs(['games.read', 'games.play']);

    const response = await request(createApp())
      .post(`/api/games/${GAME_ID}/stream-session`)
      .set('Authorization', 'Bearer token');

    expect(response.status).toBe(201);
    expect(response.body).toEqual({ path: '/stream/abc/', width: 472, height: 354 });
    expect(createSession).toHaveBeenCalledWith(GAME_ID);
  });

  it('rejects session creation without games.play', async () => {
    signInAs(['games.read']);

    const response = await request(createApp())
      .post(`/api/games/${GAME_ID}/stream-session`)
      .set('Authorization', 'Bearer token');

    expect(response.status).toBe(403);
    expect(createSession).not.toHaveBeenCalled();
  });
});
