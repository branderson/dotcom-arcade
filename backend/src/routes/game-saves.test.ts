import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import express, { Express } from 'express';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import fs from 'fs';

vi.mock('../utils/logger', () => ({
  logger: { info: vi.fn(), error: vi.fn(), debug: vi.fn(), warn: vi.fn() },
}));

// UserDatabaseService creates the directory
const tempDir = vi.hoisted(
  () => `${process.env.TMPDIR ?? '/tmp'}/game-saves-${process.pid}-${Date.now()}`
);

vi.mock('../config', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../config')>();
  return { config: { ...actual.config, userDbPath: `${tempDir}/user.db` } };
});

import gameSavesRouter from './game-saves';
import { errorHandler } from '../middleware/errorHandler';
import { UserDatabaseService } from '../services/UserDatabaseService';
import { AuthService } from '../services/AuthService';

const GAME_ID = '247a4c93-c252-49c8-8bc9-fb43d5c039df';

describe('game saves API', () => {
  let app: Express;
  let alice: string;
  let bob: string;

  beforeAll(async () => {
    await UserDatabaseService.initialize();
    const authService = new AuthService();
    alice = (await authService.trustedLogin('alice', null)).tokens.accessToken;
    bob = (await authService.trustedLogin('bobby', null)).tokens.accessToken;
    app = express();
    app.use(cookieParser());
    app.use('/api/game-saves', gameSavesRouter);
    app.use(errorHandler);
  });

  afterAll(() => {
    UserDatabaseService.close();
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  const save = (token: string, hash: string, data: object = { localStorage: { k: hash } }) =>
    request(app)
      .post(`/api/game-saves/${GAME_ID}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ data, hash, savedAt: '2026-10-12T10:00:00.000Z' });

  const fetchSaves = (token: string) =>
    request(app).get(`/api/game-saves/${GAME_ID}`).set('Authorization', `Bearer ${token}`);

  it('starts empty and requires a signed-in user', async () => {
    expect((await request(app).get(`/api/game-saves/${GAME_ID}`)).status).toBe(401);
    expect((await fetchSaves(alice)).body).toEqual({ latest: null, snapshots: [] });
  });

  it('stores saves, skipping one identical to the current save', async () => {
    const first = await save(alice, 'h1');
    expect(first.status).toBe(201);
    expect((await save(alice, 'h1')).status).toBe(200);
    expect((await save(alice, 'h2')).status).toBe(201);

    const { body } = await fetchSaves(alice);
    expect(body.latest).toMatchObject({ hash: 'h2', data: { localStorage: { k: 'h2' } } });
    expect(body.snapshots.map((s: { hash: string }) => s.hash)).toEqual(['h2', 'h1']);

    const older = await request(app)
      .get(`/api/game-saves/${GAME_ID}/${first.body.id}`)
      .set('Authorization', `Bearer ${alice}`);
    expect(older.body).toMatchObject({ hash: 'h1', data: { localStorage: { k: 'h1' } } });
  });

  it('keeps only the newest 10 saves', async () => {
    for (let i = 3; i <= 14; i++) {
      await save(alice, `h${i}`);
    }
    const { body } = await fetchSaves(alice);
    expect(body.snapshots).toHaveLength(10);
    expect(body.snapshots[0].hash).toBe('h14');
    expect(body.snapshots[9].hash).toBe('h5');
  });

  it("keeps each user's saves separate", async () => {
    expect((await fetchSaves(bob)).body.latest).toBeNull();
    const aliceSnapshot = (await fetchSaves(alice)).body.latest.id;
    const res = await request(app)
      .get(`/api/game-saves/${GAME_ID}/${aliceSnapshot}`)
      .set('Authorization', `Bearer ${bob}`);
    expect(res.status).toBe(404);
  });

  it('accepts saves over the app-wide 1 MB body limit, and clamps future timestamps', async () => {
    const big = { indexedDB: 'x'.repeat(2 * 1024 * 1024) };
    const res = await request(app)
      .post(`/api/game-saves/${GAME_ID}`)
      .set('Authorization', `Bearer ${bob}`)
      .send({ data: big, hash: 'big', savedAt: '2999-01-01T00:00:00.000Z' });
    expect(res.status).toBe(201);
    expect(res.body.size).toBeGreaterThan(2 * 1024 * 1024);
    expect(Date.parse(res.body.savedAt)).toBeLessThanOrEqual(Date.now());
  });

  it('rejects invalid input', async () => {
    const bad = await request(app)
      .post('/api/game-saves/not-a-game')
      .set('Authorization', `Bearer ${alice}`)
      .send({ data: {}, hash: 'x', savedAt: '2026-10-12T10:00:00.000Z' });
    expect(bad.status).toBe(400);
    const noHash = await request(app)
      .post(`/api/game-saves/${GAME_ID}`)
      .set('Authorization', `Bearer ${alice}`)
      .send({ data: {}, savedAt: '2026-10-12T10:00:00.000Z' });
    expect(noHash.status).toBe(400);
  });
});
