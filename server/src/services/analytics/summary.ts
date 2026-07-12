import { db } from '../../db/database.js';
import { daysAgo, today } from '../../types/index.js';
import { getMealTotals, getWeightTrend, getTrainingLoad } from './index.js';
import { getEffectiveTargets } from './profile.js';
import { computeTrendDelta, fmtSleepHours, round, sanitizeRecoveryEntry, sanitizeSleepEntry } from '../../utils/format.js';

function avg(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

export function getDashboardSummary(userId: string) {
  const t = today();

  const recoveryRows = db.prepare(`
    SELECT * FROM recovery_entries WHERE user_id = ? AND date >= ? ORDER BY date ASC
  `).all(userId, daysAgo(90)) as Record<string, unknown>[];

  const sleepRows = db.prepare(`
    SELECT * FROM sleep_entries WHERE user_id = ? AND date >= ? ORDER BY date ASC
  `).all(userId, daysAgo(90)) as Record<string, unknown>[];

  const latestRecovery = sanitizeRecoveryEntry(recoveryRows[recoveryRows.length - 1] as Record<string, unknown> | undefined);
  const latestSleep = sanitizeSleepEntry(sleepRows[sleepRows.length - 1] as Record<string, unknown> | undefined);

  const recoveryScores = recoveryRows.map(r => r.recovery_score as number).filter(v => v != null);
  const hrvValues = recoveryRows.map(r => r.hrv_ms as number).filter(v => v != null);
  const sleepHours = sleepRows.map(s => s.duration_hours as number).filter(v => v != null);
  const strainValues = recoveryRows.map(r => r.strain as number).filter(v => v != null);

  const weightTrend = getWeightTrend(userId);
  const weightHistory = db.prepare(`
    SELECT weight_kg, recorded_at FROM weight_entries WHERE user_id = ? ORDER BY recorded_at DESC LIMIT 14
  `).all(userId) as { weight_kg: number; recorded_at: string }[];

  const nutritionToday = getMealTotals(userId, t, t);
  const nutritionWeek = getMealTotals(userId, daysAgo(7), t);
  const targets = getEffectiveTargets(userId);
  const training = getTrainingLoad(userId, 28);

  const workouts = db.prepare(`
    SELECT date, activity_type, duration_minutes, strain, notes, source FROM workouts
    WHERE user_id = ? AND date >= ? ORDER BY date DESC LIMIT 10
  `).all(userId, daysAgo(14)) as Record<string, unknown>[];

  return {
    recovery: latestRecovery ? {
      score: latestRecovery.recovery_score,
      hrv: latestRecovery.hrv_ms,
      strain: latestRecovery.strain,
      resting_hr: latestRecovery.resting_hr,
      label: latestRecovery.recovery_score != null
        ? (latestRecovery.recovery_score as number) >= 67 ? 'Green' : (latestRecovery.recovery_score as number) >= 34 ? 'Yellow' : 'Red'
        : null,
      trend: computeTrendDelta(recoveryScores),
    } : null,

    sleep: latestSleep ? {
      hours: latestSleep.duration_hours,
      display: latestSleep.duration_display,
      quality: latestSleep.performance_pct,
      efficiency: latestSleep.efficiency_pct,
      deep: latestSleep.deep_sleep_hours,
      rem: latestSleep.rem_sleep_hours,
      trend: computeTrendDelta(sleepHours),
      avg7d: sleepHours.length > 0 ? fmtSleepHours(avg(sleepRows.slice(-7).map(s => s.duration_hours as number).filter(Boolean))) : null,
    } : null,

    hrv: {
      latest: latestRecovery?.hrv_ms ?? null,
      avg7d: hrvValues.length > 0 ? round(avg(hrvValues.slice(-7)), 0) : null,
      trend: computeTrendDelta(hrvValues),
    },

    strain: {
      latest: latestRecovery?.strain ?? null,
      avg7d: strainValues.length > 0 ? round(avg(strainValues.slice(-7)), 1) : null,
    },

    weight: {
      current: weightTrend.current != null ? round(weightTrend.current, 1) : null,
      weeklyChange: weightTrend.weeklyChange,
      monthlyChange: weightTrend.monthlyChange,
      trend: weightTrend.trend,
    },

    nutrition: {
      today: {
        calories: Math.round(nutritionToday.calories),
        protein: round(nutritionToday.protein_g, 0),
        carbs: round(nutritionToday.carbs_g, 0),
        fat: round(nutritionToday.fat_g, 0),
      },
      weeklyAvg: {
        calories: Math.round(nutritionWeek.calories / 7),
        protein: round(nutritionWeek.protein_g / 7, 0),
      },
      targets,
    },

    training: {
      weeklySessions: training.weeklySessions,
      acwr: training.acwr,
      overtrainingRisk: training.overtrainingRisk,
    },

    charts: {
      recovery: recoveryRows.map(r => ({
        date: r.date as string,
        recovery: round(r.recovery_score as number, 0),
        strain: round(r.strain as number, 1),
        hrv: round(r.hrv_ms as number, 0),
      })),
      sleep: sleepRows.map(s => ({
        date: s.date as string,
        hours: round(s.duration_hours as number, 1),
        display: fmtSleepHours(s.duration_hours as number),
        quality: round(s.performance_pct as number, 0),
      })),
      weight: weightHistory.reverse().map(w => ({
        date: w.recorded_at.split('T')[0],
        kg: round(w.weight_kg, 1),
      })),
      nutrition: Array.from({ length: 7 }, (_, i) => {
        const d = daysAgo(6 - i);
        const totals = getMealTotals(userId, d, d);
        return { date: d, calories: Math.round(totals.calories), protein: Math.round(totals.protein_g) };
      }),
    },

    recentWorkouts: workouts.map(w => ({
      date: w.date,
      type: w.activity_type,
      duration: w.duration_minutes,
      strain: round(w.strain as number, 1),
      source: w.source,
      notes: w.notes,
    })),
  };
}
