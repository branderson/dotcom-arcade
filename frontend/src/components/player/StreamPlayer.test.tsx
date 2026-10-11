import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { StreamPlayer } from './StreamPlayer';

const createStreamSession = vi.hoisted(() => vi.fn());
vi.mock('@/lib/api/games', () => ({ gamesApi: { createStreamSession } }));

const loadSaves = vi.hoisted(() => vi.fn());
const storeSaves = vi.hoisted(() => vi.fn());
vi.mock('@/lib/streamSaves', () => ({ loadSaves, storeSaves }));

class FakeEventSource {
  static instances: FakeEventSource[] = [];
  onmessage: ((event: MessageEvent) => void) | null = null;
  listeners: Record<string, () => void> = {};
  closed = false;

  constructor(public url: string) {
    FakeEventSource.instances.push(this);
  }

  addEventListener(type: string, listener: () => void): void {
    this.listeners[type] = listener;
  }

  close(): void {
    this.closed = true;
  }
}

const GAME_ID = '247a4c93-c252-49c8-8bc9-fb43d5c039df';
const fetchMock = vi.fn();

describe('StreamPlayer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    FakeEventSource.instances = [];
    vi.stubGlobal('EventSource', FakeEventSource);
    vi.stubGlobal('fetch', fetchMock);
    createStreamSession.mockResolvedValue({ path: '/stream/abc/', width: 472, height: 354 });
    loadSaves.mockResolvedValue({ 'cookies.txt': 'YQ==' });
    storeSaves.mockResolvedValue(undefined);
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('starts the session with stored saves, shows the stream, and stores pushed saves', async () => {
    const { unmount } = render(<StreamPlayer gameId={GAME_ID} title="Insaniquarium!" />);
    expect(screen.getByText('Starting Insaniquarium!...')).toBeInTheDocument();

    const iframe = await screen.findByTitle('Insaniquarium!');
    expect(iframe.getAttribute('src')).toBe('/stream/abc/');
    expect(fetchMock).toHaveBeenCalledWith('/stream/abc/_fp/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ files: { 'cookies.txt': 'YQ==' } }),
    });

    const events = FakeEventSource.instances[0];
    expect(events.url).toBe('/stream/abc/_fp/saves');
    events.onmessage?.(
      new MessageEvent('message', { data: JSON.stringify({ files: { 'cookies.txt': 'Yg==' } }) })
    );
    expect(storeSaves).toHaveBeenCalledWith(GAME_ID, { 'cookies.txt': 'Yg==' });

    unmount();
    expect(events.closed).toBe(true);
  });

  it('shows an error when the session cannot start', async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 502 }));

    render(<StreamPlayer gameId={GAME_ID} title="Insaniquarium!" />);

    await waitFor(() => expect(screen.getByText('Failed to Start Game')).toBeInTheDocument());
    expect(screen.getByText('The game failed to start (502)')).toBeInTheDocument();
    expect(FakeEventSource.instances).toHaveLength(0);
  });
});
