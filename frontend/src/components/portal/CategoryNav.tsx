import { Link, useLocation, useSearchParams } from 'react-router-dom';
import { parseFilterParams } from '@/lib/filterUrlCompression';
import { GENRES } from './genres';

export function CategoryNav() {
  const { pathname } = useLocation();
  const [searchParams] = useSearchParams();
  const activeTags = pathname === '/browse' ? parseFilterParams(searchParams).tags : undefined;
  const current = (active: boolean) => (active ? ('page' as const) : undefined);

  return (
    <nav id="navigation" aria-label="Categories" className="grid grid-cols-12 gap-2 my-4">
      <Link to="/" className="portal-capsule" aria-current={current(pathname === '/')}>
        Featured
      </Link>
      {GENRES.map(({ tag, label }) => (
        <Link
          key={tag}
          to={`/browse?tags=${encodeURIComponent(tag)}`}
          className="portal-capsule"
          aria-current={current(activeTags === tag)}
        >
          {label ?? tag}
        </Link>
      ))}
      <Link
        to="/animations"
        className="portal-capsule"
        aria-current={current(pathname === '/animations')}
      >
        Animations
      </Link>
    </nav>
  );
}
