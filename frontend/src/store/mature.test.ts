import { describe, it, expect, beforeEach, vi } from 'vitest';
import { usersApi } from '@/lib/api';
import { useAuthStore } from './auth';
import { useMatureStore } from './mature';

vi.mock('./theme', () => ({
  useThemeStore: { getState: () => ({ loadThemeFromServer: () => Promise.resolve() }) },
}));

describe('mature content preference', () => {
  beforeEach(() => {
    localStorage.clear();
    useMatureStore.setState({ showMature: false });
    useAuthStore.getState().clearAuth();
    vi.restoreAllMocks();
  });

  it('is off by default and kept in the browser for guests', () => {
    const update = vi.spyOn(usersApi, 'updateSettings').mockResolvedValue({});
    useAuthStore.getState().setGuestMode();

    expect(useMatureStore.getState().showMature).toBe(false);
    useMatureStore.getState().setShowMature(true);

    expect(useMatureStore.getState().showMature).toBe(true);
    expect(JSON.parse(localStorage.getItem('flashpoint-mature-content') ?? '{}').state).toEqual({
      showMature: true,
    });
    expect(update).not.toHaveBeenCalled();
  });

  it('is saved to the account of a signed-in user', () => {
    const update = vi.spyOn(usersApi, 'updateSettings').mockResolvedValue({});
    useAuthStore.getState().setAuth({
      id: 7,
      username: 'player',
      email: 'player@example.com',
      role: 'user',
      permissions: ['games.read', 'games.play'],
    });

    useMatureStore.getState().setShowMature(true);
    expect(update).toHaveBeenCalledWith({ show_mature: '1' });
  });
});
