import { config } from '../config';
import { AppError } from '../middleware/errorHandler';
import { logger } from '../utils/logger';

export interface StreamSession {
  /** Same-origin path the stream is served under, ending in a slash */
  path: string;
  width: number;
  height: number;
}

const LOOKUP_TIMEOUT_MS = 2000;
const CREATE_TIMEOUT_MS = 15000;

/** Client for the session manager that streams games which can't run in a browser. */
export class StreamingService {
  static isEnabled(): boolean {
    return Boolean(config.streamingApiUrl && config.streamingApiToken);
  }

  /** Whether the session manager can stream a game. False when streaming is off or unreachable. */
  static async isStreamable(gameId: string): Promise<boolean> {
    if (!this.isEnabled()) return false;
    try {
      const res = await this.request(`/games/${gameId}`, { method: 'GET' }, LOOKUP_TIMEOUT_MS);
      return res.ok;
    } catch (error) {
      logger.warn('[Streaming] Session manager unreachable:', error);
      return false;
    }
  }

  static async createSession(gameId: string): Promise<StreamSession> {
    if (!this.isEnabled()) {
      throw new AppError(404, 'Streaming is not enabled');
    }
    let res: Response;
    try {
      res = await this.request(
        '/sessions',
        { method: 'POST', body: JSON.stringify({ gameId }) },
        CREATE_TIMEOUT_MS
      );
    } catch (error) {
      logger.error('[Streaming] Session manager unreachable:', error);
      throw new AppError(502, 'Failed to start a streaming session');
    }
    if (res.status === 422) {
      throw new AppError(422, 'This game cannot be streamed');
    }
    if (res.status === 503) {
      throw new AppError(503, 'All streaming slots are in use. Try again later.');
    }
    if (!res.ok) {
      logger.error(`[Streaming] Session manager returned ${res.status}`);
      throw new AppError(502, 'Failed to start a streaming session');
    }
    const { path, width, height } = (await res.json()) as StreamSession;
    return { path, width, height };
  }

  private static request(
    pathname: string,
    init: RequestInit,
    timeoutMs: number
  ): Promise<Response> {
    return fetch(`${config.streamingApiUrl}${pathname}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${config.streamingApiToken}`,
        'Content-Type': 'application/json',
      },
      signal: AbortSignal.timeout(timeoutMs),
    });
  }
}
