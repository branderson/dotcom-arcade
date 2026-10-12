import express, { Router } from 'express';
import { z } from 'zod';
import { authenticate } from '../middleware/auth';
import { requirePermission } from '../middleware/rbac';
import { AppError } from '../middleware/errorHandler';
import { asyncHandler } from '../middleware/asyncHandler';
import { GameSaveService } from '../services/GameSaveService';

const router = Router();
const gameSaveService = new GameSaveService();

/** Saves can outgrow the app's 1 MB JSON limit; server.ts leaves parsing to this router. */
export const GAME_SAVE_BODY_LIMIT = '10mb';

const gameIdSchema = z.string().uuid('Invalid game ID format');

const saveSchema = z.object({
  data: z.record(z.unknown()),
  hash: z.string().min(1).max(64),
  savedAt: z.string().datetime(),
});

router.use(express.json({ limit: GAME_SAVE_BODY_LIMIT }));
router.use(authenticate, requirePermission('games.play'));

function userId(req: express.Request): number {
  if (!req.user) {
    throw new AppError(401, 'Authentication required');
  }
  return req.user.id;
}

// The current save with its data, and every kept snapshot's metadata
router.get(
  '/:gameId',
  asyncHandler(async (req, res) => {
    const gameId = gameIdSchema.parse(req.params.gameId);
    const id = userId(req);
    res.json({
      latest: gameSaveService.get(id, gameId),
      snapshots: gameSaveService.list(id, gameId),
    });
  })
);

router.get(
  '/:gameId/:snapshotId',
  asyncHandler(async (req, res) => {
    const gameId = gameIdSchema.parse(req.params.gameId);
    const snapshotId = parseInt(req.params.snapshotId, 10);
    if (isNaN(snapshotId)) {
      throw new AppError(400, 'Invalid snapshot ID');
    }
    const snapshot = gameSaveService.get(userId(req), gameId, snapshotId);
    if (!snapshot) {
      throw new AppError(404, 'Save not found');
    }
    res.json(snapshot);
  })
);

router.post(
  '/:gameId',
  asyncHandler(async (req, res) => {
    const gameId = gameIdSchema.parse(req.params.gameId);
    const body = saveSchema.parse(req.body);
    // A browser's clock can run ahead; a save can't be from the future
    const savedAt = new Date(Math.min(Date.parse(body.savedAt), Date.now())).toISOString();
    const result = gameSaveService.save(userId(req), gameId, body.data, body.hash, savedAt);
    res.status(result.created ? 201 : 200).json(result.snapshot);
  })
);

export default router;
