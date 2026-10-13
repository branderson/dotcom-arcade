import { useEffect, useRef, useState } from 'react';
import { History, Loader2, Maximize2, MonitorPlay } from 'lucide-react';
import { GamePlayer, type PlayerControls } from '@/components/player';
import { useGameLaunchData } from '@/hooks/useGames';
import { usePlaySession } from '@/hooks/usePlayTracking';
import { getGameLogoUrl, getGameScreenshotUrl } from '@/utils/gameUtils';
import type { Game } from '@/types/game';

const STAGE_HEIGHT = 'min(690px, calc(100vh - 140px))';

function canPlay(game: Game): boolean {
  return game.platformName === 'Flash' || game.platformName === 'HTML5' || Boolean(game.streamable);
}

function howItPlays(game: Game): string {
  if (game.platformName === 'Flash') return 'Plays in your browser with Ruffle';
  if (game.platformName === 'HTML5') return 'Plays in your browser';
  return `${game.platformName ?? 'This game'} streams from the server`;
}

function isTyping(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable ||
      ['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON', 'A'].includes(target.tagName))
  );
}

interface GameStageProps {
  game: Game;
  autoPlay: boolean;
}

/** The game's screenshot with a Play button, replaced by the game itself once started */
export function GameStage({ game, autoPlay }: GameStageProps) {
  const playable = canPlay(game);
  const [playing, setPlaying] = useState(autoPlay && playable);

  // Enter starts the game, as on the portals of old
  const playingRef = useRef(playing);
  useEffect(() => {
    playingRef.current = playing;
  }, [playing]);
  useEffect(() => {
    if (!playable) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Enter' || playingRef.current || isTyping(event.target)) return;
      event.preventDefault();
      setPlaying(true);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [playable]);

  if (!playing) {
    return (
      <div className="portal-stage" style={{ height: STAGE_HEIGHT }}>
        <img
          src={getGameScreenshotUrl(game.id)}
          alt=""
          className="portal-stage-backdrop"
          onError={(event) => event.currentTarget.remove()}
        />
        <div className="portal-stage-splash">
          <span className="portal-tile-art">
            <img
              src={getGameLogoUrl(game.id)}
              alt=""
              onError={(event) => event.currentTarget.removeAttribute('src')}
            />
          </span>
          {playable ? (
            <>
              <button type="button" className="portal-play w-64" onClick={() => setPlaying(true)}>
                PLAY
              </button>
              <p className="text-[color:var(--p-meta)]">
                {howItPlays(game)} · or press <kbd className="portal-kbd">Enter</kbd>
              </p>
            </>
          ) : (
            <p className="portal-display max-w-md text-center text-lg">
              {game.platformName ?? 'This game'} games can only be played in the Flashpoint
              Launcher.
            </p>
          )}
        </div>
      </div>
    );
  }

  return <PlayingStage game={game} />;
}

function PlayingStage({ game }: { game: Game }) {
  const { data: launchData, isLoading, error } = useGameLaunchData(game.id);
  usePlaySession(game.id, game.title);

  if (isLoading || launchData?.downloading) {
    return (
      <div className="portal-stage" style={{ height: STAGE_HEIGHT }}>
        <div className="portal-stage-splash">
          <Loader2 size={32} className="animate-spin" aria-hidden="true" />
          <p className="portal-display text-lg">
            {launchData?.downloading ? 'Fetching the game...' : 'Loading...'}
          </p>
        </div>
      </div>
    );
  }

  if (error || !launchData) {
    return (
      <div className="portal-stage" style={{ height: STAGE_HEIGHT }}>
        <div className="portal-stage-splash">
          <p className="portal-display text-lg">This game failed to load.</p>
          <p className="text-[color:var(--p-meta)]">{error?.message}</p>
        </div>
      </div>
    );
  }

  return (
    <GamePlayer
      gameId={game.id}
      title={game.title}
      platform={launchData.platform ?? game.platformName ?? ''}
      contentUrl={launchData.contentUrl}
      launchCommand={launchData.launchCommand}
      canPlayInBrowser={launchData.canPlayInBrowser}
      streamable={launchData.streamable ?? false}
      logoUrl={getGameLogoUrl(game.id)}
      developer={game.developer}
      height={STAGE_HEIGHT}
      className="portal-stage-player"
      renderControls={(controls) => <StageToolbar {...controls} />}
    />
  );
}

function StageToolbar({ toggleFullscreen, preferStream, togglePlayer, openSaves }: PlayerControls) {
  return (
    <div className="flex justify-end gap-2 pt-2.5">
      {openSaves ? (
        <button
          type="button"
          className="portal-capsule portal-capsule-sm"
          onClick={openSaves}
          title="Saves kept on your account"
        >
          <History size={14} aria-hidden="true" />
          Saves
        </button>
      ) : null}
      {togglePlayer ? (
        <button
          type="button"
          className="portal-capsule portal-capsule-sm"
          onClick={togglePlayer}
          title={
            preferStream
              ? 'Play in the browser with Ruffle'
              : 'Play with the original Flash Player, streamed from the server'
          }
        >
          <MonitorPlay size={14} aria-hidden="true" />
          {preferStream ? 'Use Ruffle' : 'Original Flash Player'}
        </button>
      ) : null}
      <button type="button" className="portal-capsule portal-capsule-sm" onClick={toggleFullscreen}>
        <Maximize2 size={14} aria-hidden="true" />
        Fullscreen
      </button>
    </div>
  );
}
