import { db } from '../../db/database.js';
import { generateId, daysAgo, today } from '../../types/index.js';
import { buildUnifiedContext, getNutritionAnalytics, getRecoveryAnalytics, getTrainingLoad, getStrengthAnalytics, getWeightTrend } from '../analytics/index.js';
import { generateRecommendations } from '../predictions/index.js';

export function generateReport(userId: string, type: 'daily' | 'weekly' | 'monthly') {
  const end = today();
  const start = type === 'daily' ? end : type === 'weekly' ? daysAgo(7) : daysAgo(30);
  const context = buildUnifiedContext(userId);
  const nutrition = getNutritionAnalytics(userId);
  const recovery = getRecoveryAnalytics(userId);
  const training = getTrainingLoad(userId, type === 'monthly' ? 30 : 7);
  const strength = getStrengthAnalytics(userId);
  const weight = getWeightTrend(userId);
  const recs = generateRecommendations(userId);

  const report = {
    type,
    period: { start, end },
    generatedAt: new Date().toISOString(),
    summary: {
      athleticReadiness: context.scores.athletic_readiness,
      studentAthleteScore: context.scores.student_athlete_score,
      performancePotential: context.scores.performance_potential,
      fatigueScore: context.scores.fatigue_score,
    },
    recovery: {
      avgRecovery: recovery.avgRecovery,
      avgHrv: recovery.avgHrv,
      avgSleep: recovery.avgSleep,
      sleepDebt: recovery.sleepDebt,
      burnoutRisk: recovery.burnoutRisk,
      readinessScore: recovery.readinessScore,
      trend: recovery.trends,
    },
    nutrition: {
      avgCalories: type === 'daily' ? nutrition.today.calories : nutrition.weeklyAvg.calories,
      avgProtein: type === 'daily' ? nutrition.today.protein_g : nutrition.weeklyAvg.protein,
      adherence: nutrition.adherence,
      perKg: nutrition.perKg,
    },
    training: {
      sessions: training.weeklySessions,
      acuteLoad: training.acuteLoad,
      chronicLoad: training.chronicLoad,
      acwr: training.acwr,
      overtrainingRisk: training.overtrainingRisk,
      consistency: training.consistency,
      byType: training.weeklyByType,
    },
    weight: {
      current: weight.current,
      weeklyChange: weight.weeklyChange,
      monthlyChange: weight.monthlyChange,
      trend: weight.trend,
    },
    strength: strength.byExercise,
    academic: {
      workloadScore: context.academic.workloadScore,
      stressEstimate: context.academic.stressEstimate,
      pendingItems: context.academic.items.length,
    },
    scores: context.scores,
    correlations: context.correlations.slice(0, 5),
    insights: context.insights,
    recommendations: recs,
    predictions: context.predictions,
  };

  const id = generateId();
  db.prepare(`
    INSERT INTO reports (id, user_id, report_type, period_start, period_end, content)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(id, userId, type, start, end, JSON.stringify(report));

  return report;
}

export function getReports(userId: string, limit = 20) {
  return db.prepare(`
    SELECT id, report_type, period_start, period_end, generated_at FROM reports
    WHERE user_id = ? ORDER BY generated_at DESC LIMIT ?
  `).all(userId, limit);
}

export function getReport(id: string) {
  const row = db.prepare(`SELECT * FROM reports WHERE id = ?`).get(id) as { content: string } | undefined;
  return row ? JSON.parse(row.content) : null;
}
