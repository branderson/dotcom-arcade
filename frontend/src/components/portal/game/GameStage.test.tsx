import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { GameStage } from './GameStage';
import type { Game } from '@/types/game';

vi.mock('@/components/player', () => ({
  GamePlayer: ({ title }: { title: string }) => <div>playing {title}</div>,
}));
vi.mock('@/hooks/usePlayTracking', () => ({ usePlaySession: vi.fn() }));
vi.mock('@/hooks/useGames', () => ({
  useGameLaunchData: () => ({
    data: { platform: 'Flash', contentUrl: '/game.swf', canPlayInBrowser: true },
    isLoading: false,
    error: null,
  }),
}));

const game = {
  id: '1443f6b9-6bec-47cb-873e-72b9aedefccb',
  title: '3D Logic',
  developer: 'Alex Mateev',
  publisher: 'Microgames',
  platformName: 'Flash',
  library: 'arcade',
  orderTitle: '3d logic',
} satisfies Game;

describe('GameStage', () => {
  it('waits for Play before loading the game', async () => {
    render(<GameStage game={game} autoPlay={false} />);
    expect(screen.queryByText('playing 3D Logic')).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'PLAY' }));
    expect(screen.getByText('playing 3D Logic')).toBeInTheDocument();
  });

  it('starts on Enter, and right away from a play link', async () => {
    const { unmount } = render(<GameStage game={game} autoPlay={false} />);
    await userEvent.keyboard('{Enter}');
    expect(screen.getByText('playing 3D Logic')).toBeInTheDocument();
    unmount();

    render(<GameStage game={game} autoPlay />);
    expect(screen.getByText('playing 3D Logic')).toBeInTheDocument();
  });

  it('points launcher-only games to the Flashpoint Launcher', () => {
    render(<GameStage game={{ ...game, platformName: 'Unity' }} autoPlay />);
    expect(screen.queryByRole('button', { name: 'PLAY' })).not.toBeInTheDocument();
    expect(screen.getByText(/only be played in the Flashpoint Launcher/)).toBeInTheDocument();
  });
});
