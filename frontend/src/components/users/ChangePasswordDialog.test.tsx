import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ChangePasswordDialog } from './ChangePasswordDialog';

const mutateAsync = vi.hoisted(() => vi.fn());
vi.mock('@/hooks/useUsers', () => ({
  useChangePassword: () => ({ mutateAsync, isError: false, isPending: false, error: null }),
}));

const user = { id: 7, username: 'brad' };

async function submit(newPassword: string) {
  await userEvent.type(screen.getByLabelText('New Password'), newPassword);
  await userEvent.type(screen.getByLabelText('Confirm New Password'), newPassword);
  await userEvent.click(screen.getByRole('button', { name: 'Change Password' }));
}

describe('ChangePasswordDialog', () => {
  beforeEach(() => {
    mutateAsync.mockReset().mockResolvedValue(undefined);
  });

  it('requires the current password by default', async () => {
    render(<ChangePasswordDialog isOpen user={user} onClose={vi.fn()} onSuccess={vi.fn()} />);

    await submit('new-password');

    expect(await screen.findByText('Current password is required')).toBeInTheDocument();
    expect(mutateAsync).not.toHaveBeenCalled();
  });

  it('lets a single sign-on session set a password without the current one', async () => {
    render(
      <ChangePasswordDialog
        isOpen
        user={user}
        currentPasswordOptional
        onClose={vi.fn()}
        onSuccess={vi.fn()}
      />
    );
    expect(screen.getByLabelText('Current Password (optional)')).toBeInTheDocument();

    await submit('new-password');

    await waitFor(() =>
      expect(mutateAsync).toHaveBeenCalledWith({
        id: 7,
        passwordData: { currentPassword: undefined, newPassword: 'new-password' },
      })
    );
  });
});
