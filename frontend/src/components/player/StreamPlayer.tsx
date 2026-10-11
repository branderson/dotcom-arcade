import { useEffect, useState } from 'react';
import { AlertCircle, Loader2 } from 'lucide-react';
import { gamesApi } from '@/lib/api/games';
import { logger } from '@/lib/logger';
import { loadSaves, storeSaves } from '@/lib/streamSaves';
import { getErrorMessage } from '@/types/api-error';

export interface StreamPlayerProps {
  gameId: string;
  title: string;
}

type StreamState =
  | { status: 'starting' }
  | { status: 'running'; path: string }
  | { status: 'error'; message: string };

/**
 * Plays a game that can't run in a browser by streaming it from a server-side
 * container. Saves are kept in this browser and synced with the container.
 */
export function StreamPlayer({ gameId, title }: StreamPlayerProps) {
  const [state, setState] = useState<StreamState>({ status: 'starting' });

  useEffect(() => {
    let cancelled = false;
    let events: EventSource | undefined;

    (async () => {
      const session = await gamesApi.createStreamSession(gameId);
      const files = await loadSaves(gameId);
      const response = await fetch(`${session.path}_fp/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ files }),
      });
      if (!response.ok) {
        throw new Error(`The game failed to start (${response.status})`);
      }
      if (cancelled) return;

      events = new EventSource(`${session.path}_fp/saves`);
      events.onmessage = (event) => {
        storeSaves(gameId, JSON.parse(event.data).files).catch((error) =>
          logger.error('[StreamPlayer] Failed to store saves:', error)
        );
      };
      events.addEventListener('end', () => events?.close());
      setState({ status: 'running', path: session.path });
    })().catch((error) => {
      logger.error('[StreamPlayer] Failed to start stream:', error);
      if (!cancelled) setState({ status: 'error', message: getErrorMessage(error) });
    });

    return () => {
      cancelled = true;
      events?.close();
    };
  }, [gameId]);

  if (state.status === 'error') {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center max-w-md p-6">
          <AlertCircle size={48} className="text-red-500 mx-auto mb-4" />
          <h3 className="text-xl font-bold mb-2">Failed to Start Game</h3>
          <p className="text-muted-foreground">{state.message}</p>
        </div>
      </div>
    );
  }

  if (state.status === 'starting') {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <Loader2 size={48} className="animate-spin text-muted-foreground mx-auto mb-4" />
          <p>Starting {title}...</p>
        </div>
      </div>
    );
  }

  return (
    <iframe
      src={state.path}
      className="w-full h-full border-0"
      title={title}
      allow="autoplay; fullscreen; clipboard-read; clipboard-write; gamepad"
      onLoad={(event) => event.currentTarget.focus()}
    />
  );
}
