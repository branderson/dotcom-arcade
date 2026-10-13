import { useState } from 'react';
import { Link } from 'react-router-dom';
import { format, subDays } from 'date-fns';
import { CalendarDays, Gamepad2, Tag, Wrench } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { useGameOfTheDay } from '@/hooks/useDiscovery';
import { getGameScreenshotUrl } from '@/utils/gameUtils';
import { PortalBox } from '../PortalBox';
import { primaryGenre } from '../genres';

export function GameOfTheDay() {
  const [daysAgo, setDaysAgo] = useState(0);
  const date = format(subDays(new Date(), daysAgo), 'yyyy-MM-dd');
  const { data, isLoading, isError } = useGameOfTheDay(date);
  const game = data?.game;

  const action =
    daysAgo === 0 ? (
      <button type="button" onClick={() => setDaysAgo(1)}>
        Yesterday&apos;s pick →
      </button>
    ) : (
      <button type="button" onClick={() => setDaysAgo(0)}>
        ← Today&apos;s pick
      </button>
    );

  const credits = [game?.developer, game?.publisher]
    .filter((name, i, all): name is string => Boolean(name) && all.indexOf(name) === i)
    .join(' / ');
  const genre = primaryGenre(game?.tagsStr);

  return (
    <PortalBox title="Game of the Day" action={action}>
      {isError ? (
        <p className="text-[color:var(--p-meta)]">No pick today. Check back tomorrow.</p>
      ) : (
        <div className="grid grid-cols-[minmax(0,1fr)_230px] items-start gap-3.5">
          <div>
            <div className="aspect-[4/3] overflow-hidden border-2 border-[color:var(--p-box)] bg-black">
              {game ? (
                <img
                  src={getGameScreenshotUrl(game.id)}
                  alt={`Screenshot of ${game.title}`}
                  className="h-full w-full object-cover"
                />
              ) : null}
            </div>
            {game?.originalDescription ? (
              <p className="mt-3 line-clamp-4 whitespace-pre-line text-[color:var(--p-meta)]">
                {game.originalDescription}
              </p>
            ) : null}
          </div>
          {isLoading || !game ? (
            <div className="space-y-3">
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-24 w-full" />
            </div>
          ) : (
            <div className="flex min-w-0 flex-col self-stretch">
              <h3 className="portal-display text-[26px] font-semibold leading-tight">
                <Link to={`/browse/${game.id}`}>{game.title}</Link>
              </h3>
              {data.playlist ? (
                <p className="text-[color:var(--p-meta)] mt-1">From {data.playlist.title}</p>
              ) : null}
              <div className="grid grid-cols-[minmax(0,1fr)] gap-1.5 my-3">
                {game.releaseDate ? (
                  <div className="portal-meta-row">
                    <CalendarDays size={15} aria-label="Released" />
                    {game.releaseDate}
                  </div>
                ) : null}
                {credits ? (
                  <div className="portal-meta-row">
                    <Wrench size={15} aria-label="Made by" />
                    <span className="truncate">{credits}</span>
                  </div>
                ) : null}
                {genre ? (
                  <div className="portal-meta-row">
                    <Tag size={15} aria-label="Genre" />
                    {genre}
                  </div>
                ) : null}
                {game.platformName ? (
                  <div className="portal-meta-row">
                    <Gamepad2 size={15} aria-label="Platform" />
                    {game.platformName}
                  </div>
                ) : null}
              </div>
              <Link to={`/browse/${game.id}/play`} className="portal-play mt-auto">
                PLAY
              </Link>
            </div>
          )}
        </div>
      )}
    </PortalBox>
  );
}
