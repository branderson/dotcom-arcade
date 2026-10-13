import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { usersApi } from '@/lib/api';
import { logger } from '@/lib/logger';
import { useAuthStore } from './auth';

/** User setting holding the preference for signed-in users */
export const SHOW_MATURE_SETTING = 'show_mature';

interface MatureState {
  showMature: boolean;
  setShowMature: (show: boolean) => void;
}

/**
 * Whether adult, gory and otherwise extreme games are shown. Off by default, kept in this
 * browser, and copied to the account of a signed-in user.
 */
export const useMatureStore = create<MatureState>()(
  persist(
    (set) => ({
      showMature: false,
      setShowMature: (showMature) => {
        set({ showMature });
        const { isAuthenticated, isGuest } = useAuthStore.getState();
        if (isAuthenticated && !isGuest) {
          usersApi
            .updateSettings({ [SHOW_MATURE_SETTING]: showMature ? '1' : '0' })
            .catch((error) => logger.debug('Mature preference sync failed:', error));
        }
      },
    }),
    { name: 'flashpoint-mature-content' }
  )
);
