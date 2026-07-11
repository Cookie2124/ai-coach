import { Router } from 'express';
import { authMiddleware, type AuthRequest } from '../middleware/auth.js';
import { syncWhoopData, importWhoopManualData, getIntegrationStatus, configureIntegration } from '../services/integrations/whoop.js';

const router = Router();
router.use(authMiddleware);

router.get('/', (req: AuthRequest, res) => {
  res.json(getIntegrationStatus(req.userId!));
});

router.post('/:provider/configure', (req: AuthRequest, res) => {
  const { credentials, enabled } = req.body;
  configureIntegration(req.userId!, String(req.params.provider), credentials, enabled);
  res.json({ success: true });
});

router.post('/whoop/sync', async (req: AuthRequest, res) => {
  try {
    const result = await syncWhoopData(req.userId!);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

router.post('/whoop/import', (req: AuthRequest, res) => {
  const result = importWhoopManualData(req.userId!, req.body);
  res.json(result);
});

export default router;
