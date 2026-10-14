import { useEffect } from 'react';
import { usersApi } from '@/lib/api';
import { logger } from '@/lib/logger';
import { useAuthStore } from '@/store/auth';
import { SHOW_MATURE_SETTING, useMatureStore } from '@/store/mature';

/** Adopts the signed-in account's mature content preference, or saves this browser's to it. */
export function useMatureSync(): void {
  const userId = useAuthStore((state) =>
    state.isAuthenticated && !state.isGuest ? state.user?.id : undefined
  );

  useEffect(() => {
    if (userId === undefined) return;
    let cancelled = false;
    usersApi
      .getAllSettings()
      .then((settings) => {
        if (cancelled) return;
        const saved = settings[SHOW_MATURE_SETTING];
        if (saved === undefined) {
          if (useMatureStore.getState().showMature) useMatureStore.getState().setShowMature(true);
          return;
        }
        useMatureStore.setState({ showMature: saved === '1' });
      })
      .catch((error) => logger.debug('Failed to load mature preference:', error));
    return () => {
      cancelled = true;
    };
  }, [userId]);
}
