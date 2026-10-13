import { useMemo, useState } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import { formatDistanceToNow } from 'date-fns';
import {
  BookOpen,
  Building2,
  CalendarDays,
  Gamepad2,
  Heart,
  Languages,
  ListPlus,
  Users,
  Wrench,
  type LucideIcon,
} from 'lucide-react';
import { toast } from 'sonner';
import { GameRatingSection } from '@/components/game/GameRatingSection';
import { AddToPlaylistModal } from '@/components/playlist/AddToPlaylistModal';
import { GameTile } from '@/components/portal/GameTile';
import { PortalBox } from '@/components/portal/PortalBox';
import { GameStage } from '@/components/portal/game/GameStage';
import { Skeleton } from '@/components/ui/skeleton';
import { useFavoriteGameIds, useToggleFavorite } from '@/hooks/useFavorites';
import { useFeatureFlags } from '@/hooks/useFeatureFlags';
import { useGame, useRelatedGames } from '@/hooks/useGames';
import { useGameStats } from '@/hooks/usePlayTracking';
import { formatDuration } from '@/lib/cron-utils';
import { buildFilterSearchParams, type FilterUrlParams } from '@/lib/filterUrlCompression';
import { useAuthStore } from '@/store/auth';
import { getErrorMessage } from '@/types/api-error';
import type { BreadcrumbContext } from '@/components/common/Breadcrumbs';

function browseLink(params: FilterUrlParams): string {
  return `/browse?${buildFilterSearchParams(params).toString()}`;
}

interface MetaRowProps {
  icon: LucideIcon;
  label: string;
  value?: string;
  href?: string;
}

function MetaRow({ icon: Icon, label, value, href }: MetaRowProps) {
  if (!value) return null;
  return (
    <div className="portal-meta-row normal-case">
      <Icon size={15} aria-hidden="true" />
      <span className="w-24 flex-none uppercase text-[color:var(--p-meta)]">{label}</span>
      {href ? (
        <Link to={href} className="truncate hover:underline">
          {value}
        </Link>
      ) : (
        <span className="truncate">{value}</span>
      )}
    </div>
  );
}

/** A game's page: the game itself, what it is, and where to go next */
export function GamePage({ autoPlay = false }: { autoPlay?: boolean }) {
  const { id = '' } = useParams<{ id: string }>();
  const location = useLocation();
  const from = (location.state as { breadcrumbContext?: BreadcrumbContext } | null)
    ?.breadcrumbContext;
  const { data: game, isLoading, error } = useGame(id);
  const { data: related } = useRelatedGames(id, 7);

  if (isLoading) {
    return (
      <div className="space-y-[18px]">
        <Skeleton className="h-10 w-96" />
        <Skeleton className="h-[600px] w-full" />
      </div>
    );
  }

  if (error || !game) {
    return (
      <PortalBox title="Game not found">
        <p>
          This game isn&apos;t in the archive. <Link to="/">Back to the homepage</Link>
        </p>
      </PortalBox>
    );
  }

  const tags = (game.tagsStr ?? '')
    .split(';')
    .map((tag) => tag.trim())
    .filter(Boolean);

  return (
    <div className="space-y-[18px]">
      <div className="flex items-end justify-between gap-6">
        <div className="min-w-0">
          {from ? (
            <Link
              to={from.href}
              className="text-xs uppercase tracking-wider text-[color:var(--p-meta)] hover:underline"
            >
              ← {from.label}
            </Link>
          ) : null}
          <h1 className="portal-display truncate text-[32px] font-semibold leading-tight">
            {game.title}
          </h1>
          {game.developer ? (
            <p className="text-[color:var(--p-meta)]">by {game.developer}</p>
          ) : null}
        </div>
        <GameActions gameId={game.id} title={game.title} />
      </div>

      <PortalBox>
        <GameStage key={game.id} game={game} autoPlay={autoPlay} />
      </PortalBox>

      <div className="grid grid-cols-[minmax(0,1fr)_360px] gap-[18px]">
        <PortalBox title="About this game">
          {game.originalDescription ? (
            <p className="mb-3 whitespace-pre-line leading-relaxed">{game.originalDescription}</p>
          ) : null}
          {game.notes ? (
            <p className="mb-3 whitespace-pre-line text-[color:var(--p-meta)]">{game.notes}</p>
          ) : null}
          <div className="grid grid-cols-[minmax(0,1fr)] gap-1.5">
            <MetaRow icon={CalendarDays} label="Released" value={game.releaseDate} />
            <MetaRow
              icon={Wrench}
              label="Developer"
              value={game.developer}
              href={browseLink({ developers: game.developer, fo: 'Developer' })}
            />
            <MetaRow
              icon={Building2}
              label="Publisher"
              value={game.publisher}
              href={browseLink({ publishers: game.publisher, fo: 'Publisher' })}
            />
            <MetaRow
              icon={BookOpen}
              label="Series"
              value={game.series}
              href={browseLink({ series: game.series, fo: 'Series' })}
            />
            <MetaRow icon={Gamepad2} label="Platform" value={game.platformName} />
            <MetaRow icon={Users} label="Play mode" value={game.playMode} />
            <MetaRow icon={Languages} label="Language" value={game.language} />
          </div>
        </PortalBox>

        <div className="space-y-[18px]">
          <YourPlays gameId={game.id} />
          <RatingBox gameId={game.id} />
          {tags.length > 0 ? (
            <PortalBox title="Tags">
              <div className="flex flex-wrap gap-1.5">
                {tags.map((tag) => (
                  <Link
                    key={tag}
                    to={browseLink({ tags: tag, fo: 'Tag' })}
                    className="portal-capsule portal-capsule-sm"
                  >
                    {tag}
                  </Link>
                ))}
              </div>
            </PortalBox>
          ) : null}
        </div>
      </div>

      {related && related.length > 0 ? (
        <PortalBox title="More like this">
          <div className="portal-tiles">
            {related.map((relatedGame) => (
              <GameTile key={relatedGame.id} id={relatedGame.id} title={relatedGame.title} />
            ))}
          </div>
        </PortalBox>
      ) : null}
    </div>
  );
}

function GameActions({ gameId, title }: { gameId: string; title: string }) {
  const signedIn = useAuthStore((state) => state.isAuthenticated && !state.isGuest);
  const { enableFavorites, enablePlaylists } = useFeatureFlags();
  const { data: favoriteIds } = useFavoriteGameIds();
  const toggleFavorite = useToggleFavorite();
  const [addingToPlaylist, setAddingToPlaylist] = useState(false);
  const isFavorite = useMemo(() => favoriteIds?.includes(gameId) ?? false, [favoriteIds, gameId]);

  if (!signedIn) return null;

  const handleFavorite = () => {
    toggleFavorite.mutate(gameId, {
      onError: (error: unknown) => {
        toast.error(getErrorMessage(error) || 'Could not update favorites');
      },
    });
  };

  return (
    <div className="flex flex-none gap-2">
      {enableFavorites ? (
        <button
          type="button"
          className="portal-capsule portal-capsule-sm"
          aria-pressed={isFavorite}
          onClick={handleFavorite}
          disabled={toggleFavorite.isPending}
        >
          <Heart size={14} fill={isFavorite ? 'currentColor' : 'none'} aria-hidden="true" />
          {isFavorite ? 'Favorited' : 'Favorite'}
        </button>
      ) : null}
      {enablePlaylists ? (
        <>
          <button
            type="button"
            className="portal-capsule portal-capsule-sm"
            onClick={() => setAddingToPlaylist(true)}
          >
            <ListPlus size={14} aria-hidden="true" />
            Add to playlist
          </button>
          <AddToPlaylistModal
            isOpen={addingToPlaylist}
            onClose={() => setAddingToPlaylist(false)}
            gameId={gameId}
            gameTitle={title}
          />
        </>
      ) : null}
    </div>
  );
}

function YourPlays({ gameId }: { gameId: string }) {
  const { data } = useGameStats();
  const stats = data?.data.find((entry) => entry.gameId === gameId);
  if (!stats) return null;

  return (
    <PortalBox title="Your plays">
      <p>
        Played {stats.totalPlays} {stats.totalPlays === 1 ? 'time' : 'times'}
        {stats.totalPlaytimeSeconds > 0
          ? `, ${formatDuration(stats.totalPlaytimeSeconds)} in all`
          : ''}
      </p>
      <p className="text-[color:var(--p-meta)]">
        Last played {formatDistanceToNow(new Date(stats.lastPlayedAt), { addSuffix: true })}
      </p>
    </PortalBox>
  );
}

function RatingBox({ gameId }: { gameId: string }) {
  const { enableRatings } = useFeatureFlags();
  if (!enableRatings) return null;
  return (
    <PortalBox title="Rating">
      <GameRatingSection gameId={gameId} className="mt-0 sm:flex-col sm:items-start sm:gap-2" />
    </PortalBox>
  );
}
