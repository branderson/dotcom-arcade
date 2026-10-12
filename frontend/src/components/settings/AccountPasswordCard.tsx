import { useState } from 'react';
import { KeyRound } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ChangePasswordDialog } from '@/components/users/ChangePasswordDialog';
import { useAuthStore } from '@/store/auth';

/** Lets a signed-in user change their password, or set one to sign in without single sign-on. */
export function AccountPasswordCard() {
  const user = useAuthStore((state) => state.user);
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const isTrustedSession = useAuthStore((state) => state.isTrustedSession);
  const [isOpen, setIsOpen] = useState(false);

  if (!user || !isAuthenticated) {
    return null;
  }

  return (
    <div className="bg-card rounded-lg p-6 border border-border shadow-md">
      <h2 className="text-xl font-semibold mb-2">Password</h2>
      <p className="text-sm text-muted-foreground mb-4">
        {isTrustedSession
          ? "You're signed in through single sign-on. Set a password to also sign in without it, such as on your local network."
          : 'Change the password you sign in with.'}
      </p>
      <Button onClick={() => setIsOpen(true)}>
        <KeyRound size={16} aria-hidden="true" />
        {isTrustedSession ? 'Set Password' : 'Change Password'}
      </Button>
      <ChangePasswordDialog
        isOpen={isOpen}
        user={user}
        currentPasswordOptional={isTrustedSession}
        onClose={() => setIsOpen(false)}
        onSuccess={() => setIsOpen(false)}
      />
    </div>
  );
}
