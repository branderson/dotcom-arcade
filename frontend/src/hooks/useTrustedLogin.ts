import { useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { authApi } from '@/lib/api';
import { logger } from '@/lib/logger';
import { SKIP_TRUSTED_LOGIN_KEY } from '@/lib/trustedLogin';
import { useAuthStore } from '@/store/auth';

const AUTH_PAGES = ['/login', '/register', '/setup'];

/**
 * A signed-out visitor may be vouched for by an authenticating reverse proxy.
 * Asks once on load, before guest mode or a login redirect takes over, and
 * returns whether that check is done.
 */
export function useTrustedLogin(): boolean {
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const [checked, setChecked] = useState(
    () =>
      useAuthStore.getState().isAuthenticated ||
      sessionStorage.getItem(SKIP_TRUSTED_LOGIN_KEY) !== null
  );

  useEffect(() => {
    if (checked) return;
    let cancelled = false;
    authApi
      .trustedLogin()
      .then((result) => {
        if (cancelled) return;
        useAuthStore.getState().setAuth(result.user, true);
        queryClient.invalidateQueries({ queryKey: ['setupStatus'] });
        if (AUTH_PAGES.includes(location.pathname)) {
          navigate('/', { replace: true });
        }
      })
      .catch(() => {
        logger.debug('[useTrustedLogin] No trusted proxy identity; continuing signed out');
      })
      .finally(() => {
        if (!cancelled) setChecked(true);
      });
    return () => {
      cancelled = true;
    };
    // Runs once on load; later navigation must not repeat it
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return checked;
}
