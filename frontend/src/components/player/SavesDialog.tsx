import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { FormattedDate } from '@/components/common/FormattedDate';
import { useDialog } from '@/contexts/DialogContext';
import { gameSavesApi } from '@/lib/api/gameSaves';
import { getErrorMessage } from '@/types/api-error';

interface SavesDialogProps {
  gameId: string;
  isOpen: boolean;
  onClose: () => void;
  onRestore: (snapshotId: number) => Promise<void>;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/** Lists the saves kept on the player's account for a game, and restores one. */
export function SavesDialog({ gameId, isOpen, onClose, onRestore }: SavesDialogProps) {
  const queryClient = useQueryClient();
  const { showConfirm, showToast } = useDialog();
  const [restoringId, setRestoringId] = useState<number | null>(null);

  const { data, isLoading, error } = useQuery({
    queryKey: ['game-saves', gameId],
    queryFn: () => gameSavesApi.get(gameId),
    enabled: isOpen,
    staleTime: 0,
  });

  const restore = async (snapshotId: number) => {
    const confirmed = await showConfirm({
      title: 'Restore this save?',
      message: 'The game restarts from this save. Your current save is kept as a backup.',
      confirmText: 'Restore',
      variant: 'warning',
    });
    if (!confirmed) return;
    setRestoringId(snapshotId);
    try {
      await onRestore(snapshotId);
      await queryClient.invalidateQueries({ queryKey: ['game-saves', gameId] });
      showToast('Save restored', 'success');
      onClose();
    } catch (restoreError) {
      showToast(getErrorMessage(restoreError) || 'Failed to restore save', 'error');
    } finally {
      setRestoringId(null);
    }
  };

  const snapshots = data?.snapshots ?? [];

  return (
    <Dialog open={isOpen} onOpenChange={(open: boolean) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Saves</DialogTitle>
        </DialogHeader>
        <DialogBody>
          <p className="text-sm text-muted-foreground mb-4">
            Your saves for this game are kept on your account, so another browser picks up where you
            left off. The last 10 are kept.
          </p>
          {isLoading ? (
            <div className="flex justify-center py-6">
              <Loader2 className="animate-spin text-muted-foreground" aria-label="Loading saves" />
            </div>
          ) : error ? (
            <p className="text-sm text-destructive">{getErrorMessage(error)}</p>
          ) : snapshots.length === 0 ? (
            <p className="text-sm text-muted-foreground">No saves yet.</p>
          ) : (
            <ul className="divide-y divide-border">
              {snapshots.map((snapshot, index) => (
                <li key={snapshot.id} className="flex items-center justify-between py-3 gap-4">
                  <div className="text-sm">
                    <FormattedDate date={snapshot.savedAt} type="datetime" />
                    <div className="text-muted-foreground">
                      {formatSize(snapshot.size)}
                      {index === 0 ? ' · Current' : ''}
                    </div>
                  </div>
                  {index === 0 ? null : (
                    <Button
                      variant="secondary"
                      size="sm"
                      disabled={restoringId !== null}
                      onClick={() => void restore(snapshot.id)}
                    >
                      {restoringId === snapshot.id ? 'Restoring...' : 'Restore'}
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
}
