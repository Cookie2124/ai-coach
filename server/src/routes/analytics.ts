import { Router } from 'express';
import { db } from '../db/database.js';
import { generateId, daysAgo, today, estimate1RM } from '../types/index.js';
import { authMiddleware, type AuthRequest } from '../middleware/auth.js';
import { getIntegration } from '../services/integrations/base.js';
import { buildUnifiedContext, getNutritionAnalytics, getRecoveryAnalytics, getTrainingLoad, getStrengthAnalytics, getWeightTrend } from '../services/analytics/index.js';
import { getDashboardSummary } from '../services/analytics/summary.js';
import { sanitizeRecoveryEntry, sanitizeSleepEntry } from '../utils/format.js';
import { autoSyncIfStale, syncWhoopOnAppOpen } from '../services/integrations/auto-sync.js';
import { runLearningCycle } from '../services/learning/index.js';
import { runCorrelationEngine, generateInsightsFromCorrelations } from '../services/correlation/index.js';
import { runAllPredictions } from '../services/predictions/index.js';

const router = Router();
router.use(authMiddleware);

router.get('/dashboard', async (req: AuthRequest, res) => {
  const userId = req.userId!;
  const tz = req.timezone!;

  // WHOOP sync every app open + full background sync if stale
  syncWhoopOnAppOpen(userId).catch(err => console.warn('WHOOP open-sync:', err.message));
  autoSyncIfStale(userId).catch(err => console.warn('Auto-sync:', err.message));

  runCorrelationEngine(userId);
  generateInsightsFromCorrelations(userId);
  const learning = runLearningCycle(userId);
  const context = buildUnifiedContext(userId, tz);
  const predictions = runAllPredictions(userId);
  const nutritionAnalytics = getNutritionAnalytics(userId, undefined, tz);
  const dataAvailability = {
    hasRecovery: context.recovery.length > 0,
    hasSleep: context.sleep.length > 0,
    hasNutrition: context.nutrition.today.mealCount > 0,
    hasWorkouts: context.workouts.length > 0,
    hasWeight: !!context.latestWeight,
    hasScores: Object.keys(context.scores).length > 0,
  };
  const summary = getDashboardSummary(userId, tz);
  const whoopIntegration = getIntegration(userId, 'whoop');
  const whoopConfig = whoopIntegration?.config ? JSON.parse(whoopIntegration.config) : {};

  const recovery = context.recovery.map(r => sanitizeRecoveryEntry(r as unknown as Record<string, unknown>));
  const sleep = context.sleep.map(s => sanitizeSleepEntry(s as unknown as Record<string, unknown>));

  res.json({
    ...context,
    recovery,
    sleep,
    predictions,
    nutritionAnalytics,
    targets: nutritionAnalytics.targets,
    dataAvailability,
    summary,
    learning,
    whoopSync: {
      status: whoopIntegration?.sync_status ?? null,
      lastSync: whoopIntegration?.last_sync ?? null,
      lastError: whoopConfig.last_sync_error ?? null,
      lastImported: whoopConfig.last_sync_imported ?? null,
    },
  });
});

router.get('/nutrition', (req: AuthRequest, res) => {
  const date = typeof req.query.date === 'string' ? req.query.date : undefined;
  res.json(getNutritionAnalytics(req.userId!, date, req.timezone));
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
