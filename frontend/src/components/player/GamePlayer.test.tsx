import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { GamePlayer } from './GamePlayer';

vi.mock('./RufflePlayer', () => ({ RufflePlayer: () => <div>ruffle</div> }));
vi.mock('./StreamPlayer', () => ({ StreamPlayer: () => <div>stream</div> }));

const flashGame = {
  gameId: '247a4c93-c252-49c8-8bc9-fb43d5c039df',
  title: 'Superman',
  platform: 'Flash',
  contentUrl: '/game-proxy/http://example.com/game.swf',
  canPlayInBrowser: true,
};

describe('GamePlayer player choice', () => {
  it('switches a streamable Flash game between Ruffle and the original Flash Player', async () => {
    render(<GamePlayer {...flashGame} streamable />);
    expect(screen.getByText('ruffle')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Use original Flash Player' }));
    expect(screen.getByText('stream')).toBeInTheDocument();
    expect(screen.queryByText('ruffle')).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Use Ruffle' }));
    expect(screen.getByText('ruffle')).toBeInTheDocument();
  });

  it('offers no choice when the game cannot be streamed', () => {
    render(<GamePlayer {...flashGame} streamable={false} />);
    expect(
      screen.queryByRole('button', { name: 'Use original Flash Player' })
    ).not.toBeInTheDocument();
  });

  it('streams a Flash game that cannot play in the browser', () => {
    render(
      <GamePlayer
        {...flashGame}
        contentUrl="/game-proxy/http://example.com/game.html"
        canPlayInBrowser={false}
        streamable
      />
    );
    expect(screen.getByText('stream')).toBeInTheDocument();
  });
});
