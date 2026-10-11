import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../utils/logger', () => ({
  logger: { info: vi.fn(), error: vi.fn(), debug: vi.fn(), warn: vi.fn() },
}));

const config = vi.hoisted(() => ({
  streamingApiUrl: 'http://manager:8080' as string | null,
  streamingApiToken: 'secret' as string | null,
}));
vi.mock('../config', () => ({ config }));

import { StreamingService } from './StreamingService';

const GAME_ID = '11111111-2222-4333-8444-555555555555';
const fetchMock = vi.fn();

function respond(status: number, body: unknown = {}): void {
  fetchMock.mockResolvedValue(new Response(JSON.stringify(body), { status }));
}

describe('StreamingService', () => {
  beforeEach(() => {
    config.streamingApiUrl = 'http://manager:8080';
    config.streamingApiToken = 'secret';
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('is disabled unless both the URL and token are set', async () => {
    config.streamingApiToken = null;

    expect(StreamingService.isEnabled()).toBe(false);
    expect(await StreamingService.isStreamable(GAME_ID)).toBe(false);
    await expect(StreamingService.createSession(GAME_ID)).rejects.toMatchObject({
      statusCode: 404,
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('asks the session manager whether a game is streamable', async () => {
    respond(200, { width: 472, height: 354 });
    expect(await StreamingService.isStreamable(GAME_ID)).toBe(true);
    expect(fetchMock).toHaveBeenCalledWith(
      `http://manager:8080/games/${GAME_ID}`,
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: 'Bearer secret' }),
      })
    );

    respond(422);
    expect(await StreamingService.isStreamable(GAME_ID)).toBe(false);

    fetchMock.mockRejectedValue(new Error('ECONNREFUSED'));
    expect(await StreamingService.isStreamable(GAME_ID)).toBe(false);
  });

  it('creates sessions and maps session manager errors', async () => {
    respond(201, { id: 'abc', path: '/stream/abc/', width: 472, height: 354 });
    expect(await StreamingService.createSession(GAME_ID)).toEqual({
      path: '/stream/abc/',
      width: 472,
      height: 354,
    });
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ gameId: GAME_ID });

    respond(422);
    await expect(StreamingService.createSession(GAME_ID)).rejects.toMatchObject({
      statusCode: 422,
    });
    respond(503);
    await expect(StreamingService.createSession(GAME_ID)).rejects.toMatchObject({
      statusCode: 503,
    });
    respond(500);
    await expect(StreamingService.createSession(GAME_ID)).rejects.toMatchObject({
      statusCode: 502,
    });
    fetchMock.mockRejectedValue(new Error('ECONNREFUSED'));
    await expect(StreamingService.createSession(GAME_ID)).rejects.toMatchObject({
      statusCode: 502,
    });
  });
});
