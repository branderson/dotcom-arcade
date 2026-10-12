import { useCallback, useEffect, useRef, useState } from 'react';
import { gameSavesApi, type GameSaveUpload } from '@/lib/api/gameSaves';
import { logger } from '@/lib/logger';
import {
  SaveChangeTracker,
  applySave,
  collectSave,
  loadSyncState,
  saveHash,
  storeSyncState,
  type SaveSyncState,
} from '@/lib/saves/gameSaves';

const CHECK_INTERVAL_MS = 5000;
const UPLOAD_DELAY_MS = 10000;

export interface GameSaveSync {
  /** False until this browser's save is reconciled with the account's */
  ready: boolean;
  /** Changes whenever a restore replaces the save, to remount the game */
  epoch: number;
  /** Replaces the save with an account snapshot, keeping the current one as a backup */
  restore: (snapshotId: number) => Promise<void>;
}

/**
 * Keeps a signed-in player's game save on their account. Before the game runs,
 * loads the account's save if this browser has nothing newer; while it runs,
 * uploads changes, the account keeping the last few as backups.
 */
export function useGameSaveSync(gameId: string | undefined, enabled: boolean): GameSaveSync {
  const active = enabled && Boolean(gameId);
  const [ready, setReady] = useState(!active);
  const [epoch, setEpoch] = useState(0);
  const stateRef = useRef<SaveSyncState | null>(null);
  const trackerRef = useRef<SaveChangeTracker | null>(null);
  const uploadTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingRef = useRef<GameSaveUpload | null>(null);

  const persist = useCallback(async (state: SaveSyncState) => {
    stateRef.current = state;
    await storeSyncState(state);
  }, []);

  const upload = useCallback(async () => {
    const state = stateRef.current;
    if (!state || !gameId) return;
    const data = await collectSave(state);
    const hash = saveHash(data);
    if (!hash || hash === state.syncedHash) return;
    const savedAt = state.savedAt ?? new Date().toISOString();
    pendingRef.current = { data, hash, savedAt };
    await gameSavesApi.upload(gameId, { data, hash, savedAt });
    pendingRef.current = null;
    await persist({ ...state, syncedHash: hash });
  }, [gameId, persist]);

  /** Checks for changes, and schedules an upload if there are any. */
  const check = useCallback(async () => {
    const tracker = trackerRef.current;
    const state = stateRef.current;
    if (!tracker || !state) return;
    const result = await tracker.check(state);
    if (!result.changed) return;
    const next = { ...result.state, savedAt: new Date().toISOString() };
    await persist(next);
    pendingRef.current = { data: await collectSave(next), hash: '', savedAt: next.savedAt };
    if (uploadTimerRef.current) clearTimeout(uploadTimerRef.current);
    uploadTimerRef.current = setTimeout(() => {
      upload().catch((error) => logger.error('[GameSaves] Upload failed:', error));
    }, UPLOAD_DELAY_MS);
  }, [persist, upload]);

  // Reconcile before the game starts
  useEffect(() => {
    if (!active || !gameId) return;
    let cancelled = false;
    setReady(false);

    (async () => {
      let state = await loadSyncState(gameId);
      const local = await collectSave(state);
      const localHash = saveHash(local);
      const { latest } = await gameSavesApi.get(gameId);

      if (!latest) {
        stateRef.current = state;
        if (localHash) await upload();
      } else if (latest.hash === localHash) {
        await persist({ ...state, syncedHash: latest.hash });
      } else if (!localHash || localHash === state.syncedHash) {
        // Unchanged here since the last sync: the account's save is newer
        state = await applySave(state, latest.data);
        await persist({ ...state, syncedHash: latest.hash, savedAt: latest.savedAt });
      } else {
        // Changed here; also changed elsewhere unless the account still holds what was synced
        const localIsNewer =
          latest.hash === state.syncedHash ||
          (state.savedAt !== null && Date.parse(state.savedAt) > Date.parse(latest.savedAt));
        stateRef.current = state;
        await upload();
        if (!localIsNewer) {
          // The account's save wins; the upload above keeps this one as a backup
          state = await applySave(stateRef.current ?? state, latest.data);
          await gameSavesApi.upload(gameId, {
            data: latest.data,
            hash: latest.hash,
            savedAt: latest.savedAt,
          });
          await persist({ ...state, syncedHash: latest.hash, savedAt: latest.savedAt });
        }
      }
    })()
      .catch((error) => logger.error('[GameSaves] Could not sync with the account:', error))
      .then(async () => {
        stateRef.current ??= await loadSyncState(gameId);
        trackerRef.current = await SaveChangeTracker.start(gameId);
      })
      .catch((error) => logger.error('[GameSaves] Could not start tracking saves:', error))
      .finally(() => {
        if (!cancelled) setReady(true);
      });

    return () => {
      cancelled = true;
    };
  }, [active, gameId, persist, upload, epoch]);

  // Watch for changes while the game runs, and save what's left when it stops
  useEffect(() => {
    if (!active || !ready || !gameId) return;
    const interval = setInterval(() => {
      check().catch((error) => logger.error('[GameSaves] Check failed:', error));
    }, CHECK_INTERVAL_MS);

    const onPageHide = () => {
      const pending = pendingRef.current;
      const state = stateRef.current;
      if (pending && state) {
        const hash = saveHash(pending.data);
        if (hash && hash !== state.syncedHash) {
          gameSavesApi.uploadOnUnload(gameId, { ...pending, hash });
        }
      }
    };
    window.addEventListener('pagehide', onPageHide);

    return () => {
      clearInterval(interval);
      window.removeEventListener('pagehide', onPageHide);
      if (uploadTimerRef.current) clearTimeout(uploadTimerRef.current);
      check()
        .then(upload)
        .catch((error) => logger.error('[GameSaves] Final upload failed:', error));
    };
  }, [active, ready, gameId, check, upload]);

  const restore = useCallback(
    async (snapshotId: number) => {
      if (!gameId) return;
      await check();
      await upload();
      const snapshot = await gameSavesApi.getSnapshot(gameId, snapshotId);
      const state = await applySave(
        stateRef.current ?? (await loadSyncState(gameId)),
        snapshot.data
      );
      const savedAt = new Date().toISOString();
      await gameSavesApi.upload(gameId, { data: snapshot.data, hash: snapshot.hash, savedAt });
      await persist({ ...state, syncedHash: snapshot.hash, savedAt });
      setEpoch((value) => value + 1);
    },
    [gameId, check, upload, persist]
  );

  return { ready: ready || !active, epoch, restore };
}
