import { Router } from 'express';
import { db } from '../db/database.js';
import { generateId, daysAgo, today, estimate1RM } from '../types/index.js';
import { authMiddleware, type AuthRequest } from '../middleware/auth.js';
import { buildUnifiedContext, getNutritionAnalytics, getRecoveryAnalytics, getTrainingLoad, getStrengthAnalytics, getWeightTrend } from '../services/analytics/index.js';
import { runCorrelationEngine, generateInsightsFromCorrelations } from '../services/correlation/index.js';
import { runAllPredictions } from '../services/predictions/index.js';

const router = Router();
router.use(authMiddleware);

router.get('/dashboard', (req: AuthRequest, res) => {
  const userId = req.userId!;
  runCorrelationEngine(userId);
  generateInsightsFromCorrelations(userId);
  const context = buildUnifiedContext(userId);
  const predictions = runAllPredictions(userId);
  res.json({ ...context, predictions });
});

router.get('/nutrition', (req: AuthRequest, res) => {
  res.json(getNutritionAnalytics(req.userId!));
});

router.get('/recovery', (req: AuthRequest, res) => {
  res.json(getRecoveryAnalytics(req.userId!));
});

router.get('/training', (req: AuthRequest, res) => {
  const days = parseInt(req.query.days as string) || 28;
  res.json(getTrainingLoad(req.userId!, days));
});

router.get('/strength', (req: AuthRequest, res) => {
  res.json(getStrengthAnalytics(req.userId!));
});

router.get('/weight', (req: AuthRequest, res) => {
  const history = db.prepare(`SELECT * FROM weight_entries WHERE user_id = ? ORDER BY recorded_at DESC LIMIT 90`).all(req.userId!);
  res.json({ trend: getWeightTrend(req.userId!), history });
});

router.get('/correlations', (req: AuthRequest, res) => {
  const correlations = runCorrelationEngine(req.userId!);
  res.json(correlations);
});

router.get('/insights', (req: AuthRequest, res) => {
  const insights = db.prepare(`SELECT * FROM ai_insights WHERE user_id = ? AND dismissed = 0 ORDER BY created_at DESC`).all(req.userId!);
  res.json(insights);
});

router.post('/insights/:id/dismiss', (req: AuthRequest, res) => {
  db.prepare(`UPDATE ai_insights SET dismissed = 1 WHERE id = ? AND user_id = ?`).run(req.params.id, req.userId!);
  res.json({ success: true });
});

export default router;
