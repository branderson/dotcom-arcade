import { useState } from 'react';
import { Link } from 'react-router-dom';
import { addDays, format } from 'date-fns';
import { Calendar } from '@/components/ui/calendar';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { useReleasedBetween } from '@/hooks/useDiscovery';
import { getGameLogoUrl } from '@/utils/gameUtils';
import { PortalBox } from '../PortalBox';
import { primaryGenre } from '../genres';

const ERA_START = new Date(2005, 0, 1).getTime();
const ERA_END = new Date(2014, 11, 31).getTime();
const EARLIEST = new Date(1990, 0, 1);

/** A random day in the heyday of Flash games */
function randomDay(): Date {
  const date = new Date(ERA_START + Math.random() * (ERA_END - ERA_START));
  date.setHours(0, 0, 0, 0);
  return date;
}

export function TimeMachine() {
  const [day, setDay] = useState(randomDay);
  const [picking, setPicking] = useState(false);
  const from = format(day, 'yyyy-MM-dd');
  const to = format(addDays(day, 6), 'yyyy-MM-dd');
  const { data, isLoading } = useReleasedBetween(from, to, 7);
  const games = data?.data ?? [];

  const seeAll = `/browse?releasedFrom=${from}&releasedTo=${to}&sortBy=releaseDate`;

  return (
    <PortalBox title="Time Machine">
      <div className="flex items-center gap-1.5 mb-2.5">
        <button
          type="button"
          className="portal-capsule portal-capsule-sm"
          onClick={() => setDay((current) => addDays(current, -7))}
          aria-label="Previous week"
        >
          ◀ Week
        </button>
        <button
          type="button"
          className="portal-display flex-1 text-center leading-tight hover:underline"
          onClick={() => setPicking(true)}
          title="Pick a date"
        >
          <span className="block text-[11px] uppercase tracking-wider text-[color:var(--p-meta)]">
            New the week of
          </span>
          <span className="text-base font-semibold">{format(day, 'MMMM d, yyyy')}</span>
        </button>
        <button
          type="button"
          className="portal-capsule portal-capsule-sm"
          onClick={() => setDay((current) => addDays(current, 7))}
          aria-label="Next week"
        >
          Week ▶
        </button>
      </div>

      {isLoading ? (
        <div className="grid gap-1.5">
          {Array.from({ length: 7 }, (_, i) => (
            <Skeleton key={i} className="h-[52px] w-full" />
          ))}
        </div>
      ) : games.length === 0 ? (
        <p className="py-8 text-center text-[color:var(--p-meta)]">
          Nothing archived from this week. Try another.
        </p>
      ) : (
        <ul className="grid grid-cols-[minmax(0,1fr)] gap-1.5">
          {games.map((game) => {
            const genre = primaryGenre(game.tagsStr);
            return (
              <li key={game.id}>
                <Link to={`/browse/${game.id}`} className="portal-list-item">
                  <img
                    src={getGameLogoUrl(game.id)}
                    alt=""
                    loading="lazy"
                    className="portal-thumb"
                    onError={(event) => event.currentTarget.removeAttribute('src')}
                  />
                  <span className="min-w-0">
                    <b className="portal-display block truncate text-sm font-semibold">
                      {game.title}
                    </b>
                    <small className="text-[11px]">
                      {[game.releaseDate, genre].filter(Boolean).join(' · ')}
                    </small>
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}

      <div className="flex items-center justify-between mt-2.5">
        <button
          type="button"
          className="portal-capsule portal-capsule-sm"
          onClick={() => setDay(randomDay())}
        >
          🎲 Random day
        </button>
        {data && data.total > 0 ? (
          <Link to={seeAll} className="portal-capsule portal-capsule-sm">
            See all {data.total.toLocaleString()} →
          </Link>
        ) : null}
      </div>

      <Dialog open={picking} onOpenChange={setPicking}>
        <DialogContent className="w-auto">
          <DialogHeader>
            <DialogTitle className="portal-display">Travel to a date</DialogTitle>
          </DialogHeader>
          <Calendar
            mode="single"
            captionLayout="dropdown"
            selected={day}
            defaultMonth={day}
            startMonth={EARLIEST}
            endMonth={new Date()}
            disabled={{ before: EARLIEST, after: new Date() }}
            onSelect={(selected) => {
              if (selected) {
                setDay(selected);
                setPicking(false);
              }
            }}
          />
        </DialogContent>
      </Dialog>
    </PortalBox>
  );
}
