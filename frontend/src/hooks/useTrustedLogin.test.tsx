import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { useTrustedLogin } from './useTrustedLogin';
import { useAuthStore } from '@/store/auth';
import { SKIP_TRUSTED_LOGIN_KEY } from '@/lib/trustedLogin';

const trustedLogin = vi.hoisted(() => vi.fn());
vi.mock('@/lib/api', () => ({ authApi: { trustedLogin } }));
vi.mock('@/store/theme', () => ({
  useThemeStore: { getState: () => ({ loadThemeFromServer: () => Promise.resolve() }) },
}));

const user = {
  id: 7,
  username: 'brad',
  email: 'brad@example.com',
  role: 'user',
  permissions: ['games.read'],
};

function render(path: string) {
  const queryClient = new QueryClient();
  const wrapper = ({ children }: { children: ReactNode }) => (
    <MemoryRouter initialEntries={[path]}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </MemoryRouter>
  );
  return renderHook(() => ({ checked: useTrustedLogin(), location: useLocation() }), { wrapper });
}

describe('useTrustedLogin', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
    useAuthStore.getState().clearAuth();
  });

  it('signs in the user the proxy vouches for and leaves the login page', async () => {
    trustedLogin.mockResolvedValue({ user, tokens: { expiresIn: 3600 } });

    const { result } = render('/login');
    expect(result.current.checked).toBe(false);

    await waitFor(() => expect(result.current.checked).toBe(true));
    expect(useAuthStore.getState()).toMatchObject({
      user,
      isAuthenticated: true,
      isTrustedSession: true,
    });
    expect(result.current.location.pathname).toBe('/');
  });

  it('continues signed out when there is no trusted identity', async () => {
    trustedLogin.mockRejectedValue(new Error('403'));

    const { result } = render('/games/abc');

    await waitFor(() => expect(result.current.checked).toBe(true));
    expect(useAuthStore.getState().isAuthenticated).toBe(false);
    expect(result.current.location.pathname).toBe('/games/abc');
  });

  it('does not ask after an explicit logout or when already signed in', () => {
    sessionStorage.setItem(SKIP_TRUSTED_LOGIN_KEY, '1');
    expect(render('/').result.current.checked).toBe(true);

    sessionStorage.clear();
    useAuthStore.getState().setAuth(user);
    expect(render('/').result.current.checked).toBe(true);

    expect(trustedLogin).not.toHaveBeenCalled();
  });
});
