import { forwardRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ChevronDown, Search } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useAuth } from '@/contexts/AuthContext';
import { useFeatureFlags } from '@/hooks/useFeatureFlags';
import { usePublicSettings } from '@/hooks/usePublicSettings';
import { logger } from '@/lib/logger';
import { cn } from '@/lib/utils';
import { useAuthStore } from '@/store/auth';
import { useMatureStore } from '@/store/mature';

export const PortalHeader = forwardRef<HTMLInputElement>(function PortalHeader(_props, searchRef) {
  const navigate = useNavigate();
  const { data: publicSettings } = usePublicSettings();
  const siteName = publicSettings?.app?.siteName ?? 'Flashpoint Archive';
  const tagline = publicSettings?.app?.tagline;
  const [query, setQuery] = useState('');

  const handleSearch = (event: React.FormEvent) => {
    event.preventDefault();
    if (query.trim()) {
      navigate(`/browse?search=${encodeURIComponent(query.trim())}`);
    }
  };

  return (
    <header className="flex items-center gap-6">
      <Link to="/" className="portal-brand" title={`${siteName} home`}>
        {siteName}
        {tagline ? <small>{tagline}</small> : null}
      </Link>
      <form role="search" onSubmit={handleSearch} className="portal-search">
        <Search size={16} aria-hidden="true" />
        <input
          ref={searchRef}
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search games..."
          aria-label="Search games"
        />
        <kbd className="portal-kbd" aria-hidden="true">
          /
        </kbd>
      </form>
      <UserMenu />
    </header>
  );
});

PortalHeader.displayName = 'PortalHeader';

function UserMenu() {
  const user = useAuthStore((state) => state.user);
  const isGuest = useAuthStore((state) => state.isGuest);
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const hasPermission = useAuthStore((state) => state.hasPermission);
  const showMature = useMatureStore((state) => state.showMature);
  const setShowMature = useMatureStore((state) => state.setShowMature);
  const { logout } = useAuth();
  const { data: publicSettings } = usePublicSettings();
  const {
    enableFavorites,
    enablePlaylists,
    enableStatistics,
    enableDownloadedPage,
    enableDownloadedPageForGuests,
  } = useFeatureFlags();
  const signedIn = isAuthenticated && !isGuest;

  const handleLogout = () => {
    logout().catch((error) => logger.error('Logout failed:', error));
  };

  const links = [
    signedIn && enableFavorites && { to: '/favorites', label: 'Favorites' },
    signedIn && enablePlaylists && { to: '/playlists', label: 'My Playlists' },
    signedIn && enablePlaylists && { to: '/flashpoint-playlists', label: 'Flashpoint Playlists' },
    enableDownloadedPage &&
      (signedIn || enableDownloadedPageForGuests) && { to: '/downloaded', label: 'Downloaded' },
    signedIn && enableStatistics && { to: '/dashboard', label: 'Dashboard' },
    signedIn && { to: '/settings', label: 'Settings' },
  ].filter((link): link is { to: string; label: string } => Boolean(link));

  const adminLinks = [
    hasPermission('users.read') && { to: '/users', label: 'Users' },
    hasPermission('roles.read') && { to: '/roles', label: 'Roles' },
    hasPermission('settings.update') && { to: '/jobs', label: 'Jobs' },
    hasPermission('activities.read') && { to: '/activities', label: 'Activity Logs' },
  ].filter((link): link is { to: string; label: string } => Boolean(link));

  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="portal-display flex items-center gap-1 text-[15px] font-semibold text-[color:var(--p-meta)] hover:text-[color:var(--p-text)]">
        {signedIn && user ? user.username : 'Guest'}
        <ChevronDown size={16} aria-hidden="true" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        {links.length > 0 ? (
          <>
            {links.map((link) => (
              <DropdownMenuItem key={link.to} asChild>
                <Link to={link.to}>{link.label}</Link>
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
          </>
        ) : null}
        <DropdownMenuItem
          role="menuitemcheckbox"
          aria-checked={showMature}
          onSelect={(event) => {
            event.preventDefault();
            setShowMature(!showMature);
          }}
          className="justify-between gap-3"
        >
          <span>Show mature games</span>
          <span
            aria-hidden="true"
            className={cn(
              'relative h-5 w-9 flex-none rounded-full border-2 border-transparent transition-colors',
              showMature ? 'bg-primary' : 'bg-input'
            )}
          >
            <span
              className={cn(
                'absolute top-0 left-0 h-4 w-4 rounded-full bg-background shadow transition-transform',
                showMature && 'translate-x-4'
              )}
            />
          </span>
        </DropdownMenuItem>
        {adminLinks.length > 0 ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuLabel>Admin</DropdownMenuLabel>
            {adminLinks.map((link) => (
              <DropdownMenuItem key={link.to} asChild>
                <Link to={link.to}>{link.label}</Link>
              </DropdownMenuItem>
            ))}
          </>
        ) : null}
        <DropdownMenuSeparator />
        {signedIn ? (
          <DropdownMenuItem onSelect={handleLogout}>Log out</DropdownMenuItem>
        ) : (
          <>
            <DropdownMenuItem asChild>
              <Link to="/login">Log in</Link>
            </DropdownMenuItem>
            {publicSettings?.auth?.userRegistrationEnabled ? (
              <DropdownMenuItem asChild>
                <Link to="/register">Register</Link>
              </DropdownMenuItem>
            ) : null}
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
