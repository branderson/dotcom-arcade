import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request } from 'express';

vi.mock('./logger', () => ({
  logger: { info: vi.fn(), error: vi.fn(), debug: vi.fn(), warn: vi.fn() },
}));

const config = vi.hoisted(() => ({
  trustedHeaderUsername: 'X-authentik-username' as string | null,
  trustedHeaderEmail: 'X-authentik-email' as string | null,
  trustedProxies: ['192.0.2.10', '198.51.100.0/24', '2001:db8::/32'],
}));
vi.mock('../config', () => ({ config }));

function request(remoteAddress: string, headers: Record<string, string | string[]> = {}): Request {
  const headersDistinct = Object.fromEntries(
    Object.entries(headers).map(([name, value]) => [name, Array.isArray(value) ? value : [value]])
  );
  return { socket: { remoteAddress }, headersDistinct } as unknown as Request;
}

describe('trusted header identity', () => {
  beforeEach(() => {
    vi.resetModules();
    config.trustedHeaderUsername = 'X-authentik-username';
  });

  async function load() {
    return import('./trustedHeader');
  }

  it('believes the header only on connections from a trusted proxy', async () => {
    const { getTrustedIdentity } = await load();
    const headers = { 'x-authentik-username': 'brad', 'x-authentik-email': 'brad@example.com' };

    expect(getTrustedIdentity(request('192.0.2.10', headers))).toEqual({
      username: 'brad',
      email: 'brad@example.com',
    });
    expect(getTrustedIdentity(request('::ffff:198.51.100.7', headers))?.username).toBe('brad');
    expect(getTrustedIdentity(request('2001:db8::5', headers))?.username).toBe('brad');
    expect(getTrustedIdentity(request('192.0.2.11', headers))).toBeNull();
    expect(getTrustedIdentity(request('10.0.0.5', headers))).toBeNull();
  });

  it('needs a username, and makes the email optional', async () => {
    const { getTrustedIdentity } = await load();

    expect(getTrustedIdentity(request('192.0.2.10'))).toBeNull();
    expect(getTrustedIdentity(request('192.0.2.10', { 'x-authentik-username': '  ' }))).toBeNull();
    expect(getTrustedIdentity(request('192.0.2.10', { 'x-authentik-username': 'brad' }))).toEqual({
      username: 'brad',
      email: null,
    });
  });

  it('accepts a header repeated with the same value, and refuses conflicting repeats', async () => {
    const { getTrustedIdentity } = await load();

    expect(
      getTrustedIdentity(
        request('192.0.2.10', {
          'x-authentik-username': ['brad', 'brad'],
          'x-authentik-email': ['brad@example.com', 'brad@example.com'],
        })
      )
    ).toEqual({ username: 'brad', email: 'brad@example.com' });
    expect(
      getTrustedIdentity(request('192.0.2.10', { 'x-authentik-username': ['brad', 'mallory'] }))
    ).toBeNull();
  });

  it('is off without a header name', async () => {
    config.trustedHeaderUsername = null;
    const { getTrustedIdentity, isTrustedHeaderEnabled } = await load();

    expect(isTrustedHeaderEnabled()).toBe(false);
    expect(
      getTrustedIdentity(request('192.0.2.10', { 'x-authentik-username': 'brad' }))
    ).toBeNull();
  });

  it('skips invalid proxy entries', async () => {
    const { buildBlockList } = await load();
    const list = buildBlockList(['not-an-ip', '192.0.2.0/30']);

    expect(list.check('192.0.2.1', 'ipv4')).toBe(true);
    expect(list.check('192.0.2.9', 'ipv4')).toBe(false);
  });
});
