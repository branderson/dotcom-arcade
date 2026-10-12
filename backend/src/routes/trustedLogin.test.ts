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
  () => `${process.env.TMPDIR ?? '/tmp'}/trusted-login-${process.pid}-${Date.now()}`
);

vi.mock('../config', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../config')>();
  return {
    config: {
      ...actual.config,
      userDbPath: `${tempDir}/user.db`,
      trustedHeaderUsername: 'X-authentik-username',
      trustedHeaderEmail: 'X-authentik-email',
      // supertest connects over loopback, standing in for the proxy
      trustedProxies: ['127.0.0.1', '::1'],
    },
  };
});

import authRouter from './auth';
import usersRouter from './users';
import { errorHandler } from '../middleware/errorHandler';
import { UserDatabaseService } from '../services/UserDatabaseService';
import { AuthService } from '../services/AuthService';

function createApp(): Express {
  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use('/api/auth', authRouter);
  app.use('/api/users', usersRouter);
  app.use(errorHandler);
  return app;
}

function trustedLogin(app: Express, username?: string, email?: string) {
  const req = request(app).post('/api/auth/trusted-login');
  if (username) req.set('X-authentik-username', username);
  if (email) req.set('X-authentik-email', email);
  return req;
}

function cookiesOf(res: request.Response): string[] {
  const header = res.headers['set-cookie'] as unknown as string[] | undefined;
  return (header ?? []).map((c) => c.split(';')[0]);
}

describe('trusted header login', () => {
  let app: Express;

  beforeAll(async () => {
    await UserDatabaseService.initialize();
    app = createApp();
  });

  afterAll(() => {
    UserDatabaseService.close();
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('creates the first trusted user as the administrator, then regular users', async () => {
    const first = await trustedLogin(app, 'brad', 'brad@example.com');
    expect(first.status).toBe(200);
    expect(first.body.user).toMatchObject({
      username: 'brad',
      email: 'brad@example.com',
      role: 'admin',
    });
    expect(cookiesOf(first).some((c) => c.startsWith('fp_refresh='))).toBe(true);

    const second = await trustedLogin(app, 'friend');
    expect(second.body.user).toMatchObject({
      username: 'friend',
      email: 'friend@trusted-header.invalid',
      role: 'user',
    });
  });

  it('signs an existing user back in, matching the username case-insensitively', async () => {
    const again = await trustedLogin(app, 'BRAD', 'someone-else@example.com');
    expect(again.status).toBe(200);
    expect(again.body.user).toMatchObject({
      username: 'brad',
      email: 'brad@example.com',
      role: 'admin',
    });
  });

  it('adopts an account created with a password', async () => {
    const authService = new AuthService();
    const db = UserDatabaseService.getDatabase();
    db.prepare(
      "INSERT INTO users (username, email, password_hash, role_id) VALUES ('local', 'local@example.com', 'x', 2)"
    ).run();
    const { user } = await authService.trustedLogin('local', null);
    expect(user).toMatchObject({ username: 'local', email: 'local@example.com' });
  });

  it('refuses disabled accounts, missing identities and bad usernames', async () => {
    UserDatabaseService.run("UPDATE users SET is_active = 0 WHERE username = 'friend'", []);
    expect((await trustedLogin(app, 'friend')).status).toBe(403);
    expect((await trustedLogin(app)).status).toBe(403);
    expect((await trustedLogin(app, 'ab')).status).toBe(400);
  });

  it('lets a trusted user set a password without the current one, then log in with it', async () => {
    const login = await trustedLogin(app, 'brad');
    const cookies = cookiesOf(login);

    const withoutProxy = await request(app)
      .post(`/api/users/${login.body.user.id}/change-password`)
      .set('Cookie', cookies)
      .send({ newPassword: 'lan-password' });
    expect(withoutProxy.status).toBe(400);

    const viaProxy = await request(app)
      .post(`/api/users/${login.body.user.id}/change-password`)
      .set('Cookie', cookies)
      .set('X-authentik-username', 'brad')
      .send({ newPassword: 'lan-password' });
    expect(viaProxy.status).toBe(200);

    const passwordLogin = await request(app)
      .post('/api/auth/login')
      .send({ username: 'brad', password: 'lan-password' });
    expect(passwordLogin.status).toBe(200);
  });

  it("can't set another user's password by naming yourself in the header", async () => {
    const friend = await trustedLogin(app, 'local');
    const res = await request(app)
      .post(`/api/users/1/change-password`)
      .set('Cookie', cookiesOf(friend))
      .set('X-authentik-username', 'local')
      .send({ newPassword: 'stolen-password' });
    expect(res.status).toBe(403);
  });
});
