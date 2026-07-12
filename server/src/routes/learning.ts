import { Router } from 'express';
import { authMiddleware, type AuthRequest } from '../middleware/auth.js';
import { runLearningCycle, getLearningStatus } from '../services/learning/index.js';
import { autoSyncIfStale } from '../services/integrations/auto-sync.js';

const router = Router();
router.use(authMiddleware);

router.get('/status', (req: AuthRequest, res) => {
  res.json(getLearningStatus(req.userId!));
});

router.post('/run', (req: AuthRequest, res) => {
  const result = runLearningCycle(req.userId!);
  res.json(result);
});

router.post('/sync-and-learn', async (req: AuthRequest, res) => {
  const sync = await autoSyncIfStale(req.userId!, true);
  const learning = runLearningCycle(req.userId!);
  res.json({ sync, learning });
});

export default router;
