import { useEffect, useRef, useState } from 'react';
import { Outlet, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import '@fontsource-variable/fredoka';
import { MaintenanceGuard } from '@/components/common/MaintenanceGuard';
import { useMatureSync } from '@/hooks/useMatureSync';
import { gamesApi } from '@/lib/api';
import { logger } from '@/lib/logger';
import { useMatureStore } from '@/store/mature';
import { CategoryNav } from './CategoryNav';
import { PortalHeader } from './PortalHeader';
import { applyPortalScheme } from './schemes';
import './portal.css';

function isTyping(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))
  );
}

/** The arcade portal shell: framed page, wordmark and search, categories and key hints */
export function PortalLayout() {
  const navigate = useNavigate();
  const searchRef = useRef<HTMLInputElement>(null);
  const [rolling, setRolling] = useState(false);

  useEffect(() => applyPortalScheme('chilled'), []);
  useMatureSync();

  const playRandom = async () => {
    setRolling(true);
    try {
      const game = await gamesApi.getRandom(
        undefined,
        undefined,
        useMatureStore.getState().showMature
      );
      navigate(`/browse/${game.id}`);
    } catch (error) {
      logger.error('Failed to fetch random game:', error);
      toast.error('Could not pick a random game. Please try again.');
    } finally {
      setRolling(false);
    }
  };
  const playRandomRef = useRef(playRandom);
  playRandomRef.current = playRandom;

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.ctrlKey || event.metaKey || event.altKey || isTyping(event.target)) return;
      if (event.key === '/') {
        event.preventDefault();
        searchRef.current?.focus();
      } else if (event.key === 'r' || event.key === 'R') {
        event.preventDefault();
        playRandomRef.current().catch(() => undefined);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  return (
    <MaintenanceGuard>
      <div className="portal-screen">
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:bg-primary focus:text-primary-foreground focus:px-4 focus:py-2"
        >
          Skip to main content
        </a>
        <PortalHeader ref={searchRef} />
        <CategoryNav />
        <main id="main-content">
          <Outlet />
        </main>
        <footer className="portal-footer portal-display flex justify-end gap-5 mt-4 text-xs uppercase tracking-wider text-[color:var(--p-meta)]">
          <button type="button" onClick={() => searchRef.current?.focus()}>
            <kbd>/</kbd>Search
          </button>
          <button type="button" onClick={() => playRandom()} disabled={rolling}>
            <kbd>R</kbd>Random game
          </button>
        </footer>
      </div>
    </MaintenanceGuard>
  );
}
