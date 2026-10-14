import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Skeleton } from '@/components/ui/skeleton';
import { usePlaylistShelves, useRecentlyPlayed } from '@/hooks/useDiscovery';
import { GameTile } from '../GameTile';
import { PortalBox } from '../PortalBox';

const PER_SHELF = 7;

function TileRowSkeleton() {
  return (
    <div className="portal-tiles">
      {Array.from({ length: PER_SHELF }, (_, i) => (
        <Skeleton key={i} className="h-[156px] w-[132px] rounded-[22px]" />
      ))}
    </div>
  );
}

export function JumpBackIn() {
  const { data } = useRecentlyPlayed(PER_SHELF);
  if (!data?.length) return null;

  return (
    <PortalBox title="Jump back in" action={<Link to="/dashboard">Your history →</Link>}>
      <div className="portal-tiles">
        {data.map((stat) => (
          <GameTile key={stat.gameId} id={stat.gameId} title={stat.gameTitle} />
        ))}
      </div>
    </PortalBox>
  );
}

export function PlaylistShelves() {
  const [seed, setSeed] = useState(() => Math.floor(Math.random() * 2 ** 30));
  const { data, isLoading } = usePlaylistShelves(seed, 3, PER_SHELF);

  if (isLoading) {
    return (
      <PortalBox title="From the Flashpoint playlists">
        <TileRowSkeleton />
      </PortalBox>
    );
  }

  return (
    <>
      {data?.map((shelf, i) => (
        <PortalBox
          key={shelf.id}
          title={shelf.title}
          action={
            <span className="flex gap-3">
              {i === 0 ? (
                <button type="button" onClick={() => setSeed((current) => current + 1)}>
                  Different playlists
                </button>
              ) : null}
              <Link to={`/flashpoint-playlists/${shelf.id}`}>
                See all {shelf.total.toLocaleString()} →
              </Link>
            </span>
          }
        >
          <div className="portal-tiles">
            {shelf.games.map((game) => (
              <GameTile key={game.id} id={game.id} title={game.title} />
            ))}
          </div>
        </PortalBox>
      ))}
    </>
  );
}
