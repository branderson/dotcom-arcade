import { memo, useState } from 'react';
import { Link } from 'react-router-dom';
import { getGameLogoUrl } from '@/utils/gameUtils';

interface GameTileProps {
  id: string;
  title: string;
}

/** A glossy logo tile linking to a game */
export const GameTile = memo(function GameTile({ id, title }: GameTileProps) {
  const [broken, setBroken] = useState(false);
  return (
    <Link to={`/browse/${id}`} className="portal-tile" title={title}>
      <span className="portal-tile-art">
        {broken ? (
          <span className="portal-tile-blank" aria-hidden="true" />
        ) : (
          <img src={getGameLogoUrl(id)} alt="" loading="lazy" onError={() => setBroken(true)} />
        )}
      </span>
      <span className="portal-tile-title">{title}</span>
    </Link>
  );
});

GameTile.displayName = 'GameTile';
