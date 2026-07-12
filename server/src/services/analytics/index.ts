import { db } from '../../db/database.js';
import { daysAgo, today, type MealTotals, type DailyScores, type UnifiedContext } from '../../types/index.js';
import { getEffectiveTargets, parseProfileRow } from './profile.js';
import { fmtSleepHours, round, sanitizeRecoveryTrend } from '../../utils/format.js';

function avg(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function clamp(val: number, min = 0, max = 100): number {
  return Math.max(min, Math.min(max, val));
}

function workoutLoad(w: { strain?: number; duration_minutes?: number }): number {
  if (w.strain != null) return w.strain;
  if (w.duration_minutes) return w.duration_minutes / 10;
  return 0;
}

export function getMealTotals(userId: string, startDate: string, endDate: string): MealTotals {
  const row = db.prepare(`
    SELECT COALESCE(SUM(calories), 0) as calories, COALESCE(SUM(protein_g), 0) as protein_g,
           COALESCE(SUM(carbs_g), 0) as carbs_g, COALESCE(SUM(fat_g), 0) as fat_g,
           COALESCE(SUM(fibre_g), 0) as fibre_g, COUNT(*) as mealCount
    FROM meals WHERE user_id = ? AND date(logged_at) >= ? AND date(logged_at) <= ?
  `).get(userId, startDate, endDate) as MealTotals;
  return row;
}

export function getWeightTrend(userId: string) {
  const weights = db.prepare(`
    SELECT weight_kg, recorded_at FROM weight_entries
    WHERE user_id = ? ORDER BY recorded_at DESC LIMIT 60
  `).all(userId) as { weight_kg: number; recorded_at: string }[];

  if (weights.length < 2) {
    return { weeklyChange: 0, monthlyChange: 0, trend: 'stable', current: weights[0]?.weight_kg ?? null };
  }

  const now = new Date();
  const weekAgo = new Date(now); weekAgo.setDate(weekAgo.getDate() - 7);
  const monthAgo = new Date(now); monthAgo.setDate(monthAgo.getDate() - 30);

  const current = weights[0].weight_kg;
  const weekWeight = weights.find(w => new Date(w.recorded_at) <= weekAgo)?.weight_kg ?? weights[weights.length - 1].weight_kg;
  const monthWeight = weights.find(w => new Date(w.recorded_at) <= monthAgo)?.weight_kg ?? weights[weights.length - 1].weight_kg;

  const weeklyChange = Math.round((current - weekWeight) * 100) / 100;
  const monthlyChange = Math.round((current - monthWeight) * 100) / 100;
  const trend = weeklyChange > 0.2 ? 'gaining' : weeklyChange < -0.2 ? 'losing' : 'stable';

  return { weeklyChange, monthlyChange, trend, current };
}

export function getTrainingLoad(userId: string, days: number) {
  const start = daysAgo(days);
  const workouts = db.prepare(`
    SELECT date, strain, duration_minutes, activity_type FROM workouts
    WHERE user_id = ? AND date >= ? ORDER BY date
  `).all(userId, start) as { date: string; strain: number; duration_minutes: number; activity_type: string }[];

  const acuteLoad = avg(workouts.slice(-7).map(workoutLoad));
  const chronicLoad = avg(workouts.map(workoutLoad));
  const acwr = chronicLoad > 0 ? acuteLoad / chronicLoad : 1;

  const weeklyByType: Record<string, number> = {};
  for (const w of workouts.slice(-7)) {
    weeklyByType[w.activity_type] = (weeklyByType[w.activity_type] || 0) + workoutLoad(w);
  }

  return {
    acuteLoad: Math.round(acuteLoad * 10) / 10,
    chronicLoad: Math.round(chronicLoad * 10) / 10,
    acwr: Math.round(acwr * 100) / 100,
    overtrainingRisk: acwr > 1.5 ? 'high' : acwr > 1.3 ? 'moderate' : 'low',
    undertrainingRisk: acwr < 0.8 ? 'high' : acwr < 0.9 ? 'moderate' : 'low',
    weeklySessions: workouts.slice(-7).length,
    monthlySessions: workouts.length,
    weeklyByType,
    consistency: Math.round((workouts.slice(-7).length / 7) * 100),
  };
}

export function getAcademicWorkload(userId: string) {
  const items = db.prepare(`
    SELECT * FROM academic_items WHERE user_id = ? AND completed = 0
    ORDER BY due_date ASC
  `).all(userId) as { estimated_hours: number; stress_level: number; due_date: string; type: string }[];

  const upcomingExams = items.filter(i => i.type === 'exam' && i.due_date && i.due_date <= daysAgo(-14));
  const totalHours = items.reduce((s, i) => s + (i.estimated_hours || 2), 0);
  const avgStress = avg(items.map(i => i.stress_level || 5));

  const studyHours = db.prepare(`
    SELECT COALESCE(SUM(duration_minutes), 0) / 60.0 as hours FROM study_sessions
    WHERE user_id = ? AND date(recorded_at) >= ?
  `).get(userId, daysAgo(7)) as { hours: number };

  const workloadScore = clamp(totalHours * 8 + upcomingExams.length * 15 + avgStress * 5);
  const stressEstimate = clamp(avgStress * 10 + upcomingExams.length * 12);

  return { items, workloadScore, stressEstimate, studyHoursWeek: studyHours.hours, upcomingExams: upcomingExams.length };
}

export function computeDailyScores(userId: string, date: string): DailyScores {
  const recovery = (db.prepare(`SELECT * FROM recovery_entries WHERE user_id = ? AND date = ?`).get(userId, date)
    ?? db.prepare(`SELECT * FROM recovery_entries WHERE user_id = ? ORDER BY date DESC LIMIT 1`).get(userId)) as Record<string, number> | undefined;
  const sleep = (db.prepare(`SELECT * FROM sleep_entries WHERE user_id = ? AND date = ?`).get(userId, date)
    ?? db.prepare(`SELECT * FROM sleep_entries WHERE user_id = ? ORDER BY date DESC LIMIT 1`).get(userId)) as Record<string, number> | undefined;
  const lifestyle = db.prepare(`SELECT * FROM lifestyle_entries WHERE user_id = ? AND date = ?`).get(userId, date) as Record<string, number> | undefined;

  const nutritionToday = getMealTotals(userId, date, date);
  const targets = getEffectiveTargets(userId);
  const weightTrend = getWeightTrend(userId);
  const training = getTrainingLoad(userId, 28);
  const academic = getAcademicWorkload(userId);

  const hasRecovery = recovery?.recovery_score != null;
  const hasSleep = sleep?.performance_pct != null || sleep?.duration_hours != null;
  const hasNutrition = nutritionToday.mealCount > 0;

  if (!hasRecovery && !hasSleep && !hasNutrition && !weightTrend.current) {
    return {};
  }

  const recoveryScore = recovery?.recovery_score ?? null;
  const sleepScore = sleep?.performance_pct ?? (sleep?.duration_hours ? Math.min(100, (sleep.duration_hours / 8) * 100) : null);
  const strain = recovery?.strain ?? 0;

  const proteinTarget = targets.protein ?? 150;
  const calorieTarget = targets.calories ?? 2500;
  const proteinPct = proteinTarget > 0 ? (nutritionToday.protein_g / proteinTarget) * 100 : 0;
  const caloriePct = calorieTarget > 0 ? (nutritionToday.calories / calorieTarget) * 100 : 0;

  const rScore = recoveryScore ?? 50;
  const sScore = sleepScore ?? 50;

  const athleticReadiness = hasRecovery || hasSleep ? clamp(
    (recoveryScore ?? sScore) * 0.35 + (sleepScore ?? rScore) * 0.25 + proteinPct * 0.15 +
    (100 - Math.min(strain * 3, 80)) * 0.15 + (100 - training.acwr * 30) * 0.10
  ) : undefined;

  const growthScore = weightTrend.current ? clamp(
    (weightTrend.weeklyChange > 0 ? 60 : 30) + proteinPct * 0.2 + (recoveryScore ?? 50) * 0.2
  ) : undefined;

  const bulkQuality = targets.configured ? clamp(
    proteinPct * 0.35 + (caloriePct > 100 && caloriePct < 120 ? 80 : 50) * 0.25 +
    (weightTrend.weeklyChange >= 0.1 && weightTrend.weeklyChange <= 0.5 ? 80 : 40) * 0.25 +
    (recoveryScore ?? 50) * 0.15
  ) : undefined;

  const studentAthleteScore = clamp(
    (athleticReadiness ?? 50) * 0.3 + (100 - academic.workloadScore) * 0.2 +
    proteinPct * 0.15 + (sleepScore ?? 50) * 0.2 + training.consistency * 0.15
  );

  const fatigueScore = hasRecovery ? clamp(
    (100 - (recoveryScore ?? 50)) * 0.3 + strain * 2 + academic.stressEstimate * 0.25 +
    (sleep?.sleep_debt_hours ?? 0) * 10 + (lifestyle?.caffeine_mg ?? 0) / 5
  ) : undefined;

  const schoolLifeBalance = clamp(
    100 - Math.abs(training.weeklySessions * 10 - 50) - academic.workloadScore * 0.3 + (recoveryScore ?? 50) * 0.2
  );

  const hydrationScore = lifestyle?.water_ml ? clamp((lifestyle.water_ml / targets.water_ml) * 100) : undefined;

  const performancePotential = athleticReadiness != null ? clamp(
    athleticReadiness * 0.4 + studentAthleteScore * 0.3 + (100 - (fatigueScore ?? 50)) * 0.3
  ) : undefined;

  const readinessForecast = hasRecovery ? clamp((recoveryScore ?? 50) * 0.5 + (sleepScore ?? 50) * 0.3 + (100 - strain * 2) * 0.2) : undefined;

  return {
    athletic_readiness: athleticReadiness != null ? Math.round(athleticReadiness) : undefined,
    growth_score: growthScore != null ? Math.round(growthScore) : undefined,
    bulk_quality: bulkQuality != null ? Math.round(bulkQuality) : undefined,
    student_athlete_score: Math.round(studentAthleteScore),
    performance_potential: performancePotential != null ? Math.round(performancePotential) : undefined,
    fatigue_score: fatigueScore != null ? Math.round(fatigueScore) : undefined,
    academic_stress: Math.round(academic.stressEstimate),
    school_life_balance: Math.round(schoolLifeBalance),
    hydration_score: hydrationScore != null ? Math.round(hydrationScore) : undefined,
    readiness_forecast: readinessForecast != null ? Math.round(readinessForecast) : undefined,
  };
}

export function saveDailyScores(userId: string, date: string, scores: DailyScores) {
  const id = `${userId}-${date}`;
  db.prepare(`
    INSERT INTO daily_scores (id, user_id, date, athletic_readiness, growth_score, bulk_quality,
      student_athlete_score, performance_potential, fatigue_score, academic_stress,
      school_life_balance, hydration_score, readiness_forecast)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(user_id, date) DO UPDATE SET
      athletic_readiness=excluded.athletic_readiness, growth_score=excluded.growth_score,
      bulk_quality=excluded.bulk_quality, student_athlete_score=excluded.student_athlete_score,
      performance_potential=excluded.performance_potential, fatigue_score=excluded.fatigue_score,
      academic_stress=excluded.academic_stress, school_life_balance=excluded.school_life_balance,
      hydration_score=excluded.hydration_score, readiness_forecast=excluded.readiness_forecast,
      computed_at=datetime('now')
  `).run(id, userId, date, scores.athletic_readiness, scores.growth_score, scores.bulk_quality,
    scores.student_athlete_score, scores.performance_potential, scores.fatigue_score,
    scores.academic_stress, scores.school_life_balance, scores.hydration_score, scores.readiness_forecast);
}

export function buildUnifiedContext(userId: string): UnifiedContext {
  const profileRow = db.prepare(`SELECT * FROM user_profile WHERE user_id = ?`).get(userId) as Record<string, unknown> | undefined;
  const profile = parseProfileRow(profileRow) as UnifiedContext['profile'];

  const latestWeight = db.prepare(`SELECT * FROM weight_entries WHERE user_id = ? ORDER BY recorded_at DESC LIMIT 1`).get(userId) as UnifiedContext['latestWeight'];
  const weightTrend = getWeightTrend(userId);

  const recovery = db.prepare(`
    SELECT * FROM recovery_entries WHERE user_id = ? ORDER BY date DESC LIMIT 500
  `).all(userId) as UnifiedContext['recovery'];
  const sleep = db.prepare(`
    SELECT * FROM sleep_entries WHERE user_id = ? ORDER BY date DESC LIMIT 500
  `).all(userId) as UnifiedContext['sleep'];
  const workouts = db.prepare(`
    SELECT * FROM workouts WHERE user_id = ? ORDER BY date DESC LIMIT 500
  `).all(userId) as UnifiedContext['workouts'];
  const strength = db.prepare(`SELECT * FROM strength_entries WHERE user_id = ? ORDER BY recorded_at DESC LIMIT 30`).all(userId) as UnifiedContext['strength'];

  const t = today();
  const nutrition = {
    today: getMealTotals(userId, t, t),
    week: getMealTotals(userId, daysAgo(7), t),
    month: getMealTotals(userId, daysAgo(30), t),
  };

  const academic = getAcademicWorkload(userId);
  const lifestyle = db.prepare(`SELECT * FROM lifestyle_entries WHERE user_id = ? AND date >= ? ORDER BY date DESC LIMIT 14`).all(userId, daysAgo(14)) as UnifiedContext['lifestyle'];

  const upcoming = db.prepare(`
    SELECT * FROM calendar_events WHERE user_id = ? AND start_time >= datetime('now') ORDER BY start_time LIMIT 10
  `).all(userId);

  const hasMatchToday = db.prepare(`
    SELECT COUNT(*) as c FROM calendar_events WHERE user_id = ? AND date(start_time) = ? AND event_type = 'match'
  `).get(userId, t) as { c: number };

  const calendarExamsThisWeek = db.prepare(`
    SELECT COUNT(*) as c FROM calendar_events
    WHERE user_id = ? AND event_type = 'exam' AND start_time >= datetime('now') AND start_time <= datetime('now', '+7 days')
  `).get(userId) as { c: number };

  const hasExamThisWeek = academic.items.some(i => i.type === 'exam') || calendarExamsThisWeek.c > 0;

  const recentEmails = db.prepare(`
    SELECT title, description, start_time FROM calendar_events
    WHERE user_id = ? AND source = 'gmail' ORDER BY start_time DESC LIMIT 5
  `).all(userId) as { title: string; description?: string; start_time: string }[];

  const scores = computeDailyScores(userId, t);
  if (Object.keys(scores).length > 0) {
    saveDailyScores(userId, t, scores);
  }

  const correlations = db.prepare(`
    SELECT metric_a, metric_b, correlation, description FROM correlations
    WHERE user_id = ? ORDER BY ABS(correlation) DESC LIMIT 10
  `).all(userId) as UnifiedContext['correlations'];

  const insights = db.prepare(`
    SELECT title, content, severity FROM ai_insights
    WHERE user_id = ? AND dismissed = 0 ORDER BY created_at DESC LIMIT 5
  `).all(userId) as UnifiedContext['insights'];

  const predictions = db.prepare(`
    SELECT prediction_type as type, predicted_value as value, confidence, target_date as date
    FROM predictions WHERE user_id = ? AND target_date >= ? ORDER BY target_date LIMIT 10
  `).all(userId, t) as UnifiedContext['predictions'];

  return {
    profile,
    latestWeight,
    weightTrend,
    recovery,
    sleep,
    workouts,
    nutrition,
    strength,
    academic: { items: academic.items as UnifiedContext['academic']['items'], workloadScore: academic.workloadScore, stressEstimate: academic.stressEstimate },
    lifestyle,
    calendar: { upcoming, hasMatchToday: hasMatchToday.c > 0, hasExamThisWeek, recentEmails },
    scores,
    correlations,
    insights,
    predictions,
  };
}

export function getNutritionAnalytics(userId: string) {
  const targets = getEffectiveTargets(userId);
  const weightKg = targets.weightKg;

  const todayTotals = getMealTotals(userId, today(), today());
  const weekTotals = getMealTotals(userId, daysAgo(7), today());
  const monthTotals = getMealTotals(userId, daysAgo(30), today());

  const daysInWeek = 7;
  const daysInMonth = 30;

  return {
    today: todayTotals,
    week: weekTotals,
    month: monthTotals,
    perKg: {
      protein: weightKg ? Math.round((todayTotals.protein_g / weightKg) * 10) / 10 : 0,
      carbs: weightKg ? Math.round((todayTotals.carbs_g / weightKg) * 10) / 10 : 0,
      fat: weightKg ? Math.round((todayTotals.fat_g / weightKg) * 10) / 10 : 0,
      calories: weightKg ? Math.round((todayTotals.calories / weightKg) * 10) / 10 : 0,
    },
    targets: {
      calories: targets.calories,
      protein: targets.protein,
      carbs: targets.carbs,
      fat: targets.fat,
    },
    configured: targets.configured,
    adherence: {
      protein: targets.protein ? Math.round((todayTotals.protein_g / targets.protein) * 100) : 0,
      calories: targets.calories ? Math.round((todayTotals.calories / targets.calories) * 100) : 0,
    },
    weeklyAvg: {
      calories: Math.round(weekTotals.calories / daysInWeek),
      protein: Math.round(weekTotals.protein_g / daysInWeek),
      carbs: Math.round(weekTotals.carbs_g / daysInWeek),
      fat: Math.round(weekTotals.fat_g / daysInWeek),
    },
    monthlyAvg: {
      calories: Math.round(monthTotals.calories / daysInMonth),
      protein: Math.round(monthTotals.protein_g / daysInMonth),
    },
  };
}

export function getRecoveryAnalytics(userId: string) {
  const entries = db.prepare(`
    SELECT r.*, s.duration_hours, s.performance_pct, s.sleep_debt_hours
    FROM recovery_entries r
    LEFT JOIN sleep_entries s ON r.user_id = s.user_id AND r.date = s.date
    WHERE r.user_id = ? ORDER BY r.date DESC LIMIT 500
  `).all(userId) as Record<string, number>[];

  const recoveryValues = entries.map(e => e.recovery_score).filter(v => v != null && v > 0);
  const hrvValues = entries.map(e => e.hrv_ms).filter(v => v != null && v > 0);
  const sleepValues = entries.map(e => e.duration_hours).filter(v => v != null && v > 0);
  const strainValues = entries.map(e => e.strain).filter(v => v != null && v > 0);

  const hasData = recoveryValues.length > 0;
  const avgRecovery = hasData ? avg(recoveryValues) : null;
  const recoveryVolatility = recoveryValues.length > 1 && avgRecovery != null
    ? Math.round(Math.sqrt(recoveryValues.reduce((s, v) => s + (v - avgRecovery) ** 2, 0) / recoveryValues.length) * 10) / 10
    : 0;

  const totalSleepDebt = entries.reduce((s, e) => s + (e.sleep_debt_hours || 0), 0);
  const avgStrain = strainValues.length > 0 ? avg(strainValues) : null;

  const latestRecovery = recoveryValues[0] ?? null;
  const prevRecovery = recoveryValues[1] ?? latestRecovery;
  const momentum = latestRecovery != null && prevRecovery != null ? latestRecovery - prevRecovery : null;

  const burnoutRisk = !hasData ? 'unknown'
    : latestRecovery != null && latestRecovery < 33 && (avgStrain ?? 0) > 15 ? 'high'
    : latestRecovery != null && latestRecovery < 50 && (avgStrain ?? 0) > 12 ? 'moderate' : 'low';

  const avgSleepHours = sleepValues.length > 0 ? avg(sleepValues) : null;

  return {
    hasData,
    trends: sanitizeRecoveryTrend(entries.slice(0, 90).reverse() as Record<string, unknown>[]),
    avgRecovery: avgRecovery != null ? Math.round(avgRecovery) : null,
    avgHrv: hrvValues.length > 0 ? Math.round(avg(hrvValues)) : null,
    avgSleep: avgSleepHours != null ? round(avgSleepHours, 1) : null,
    avgSleepDisplay: avgSleepHours != null ? fmtSleepHours(avgSleepHours) : null,
    recoveryVolatility,
    sleepDebt: round(totalSleepDebt, 1),
    sleepDebtDisplay: fmtSleepHours(totalSleepDebt),
    recoveryMomentum: momentum != null ? Math.round(momentum) : null,
    recoveryToStrainRatio: avgRecovery != null && avgStrain != null && avgStrain > 0 ? round(avgRecovery / avgStrain, 1) : null,
    burnoutRisk,
    readinessScore: latestRecovery != null ? Math.round(latestRecovery * 0.6 + (100 - (avgStrain ?? 0) * 3) * 0.4) : null,
  };
}

export function getStrengthAnalytics(userId: string) {
  const entries = db.prepare(`
    SELECT exercise, weight_kg, reps, estimated_1rm, recorded_at
    FROM strength_entries WHERE user_id = ? ORDER BY recorded_at DESC
  `).all(userId) as { exercise: string; weight_kg: number; reps: number; estimated_1rm: number; recorded_at: string }[];

  const weight = db.prepare(`SELECT weight_kg FROM weight_entries WHERE user_id = ? ORDER BY recorded_at DESC LIMIT 1`).get(userId) as { weight_kg: number } | undefined;
  const bodyWeight = weight?.weight_kg ?? 75;

  const byExercise: Record<string, { latest: number; best: number; trend: string; relativeStrength: number }> = {};

  for (const ex of ['bench_press', 'squat', 'deadlift', 'pushups', 'pullups']) {
    const exEntries = entries.filter(e => e.exercise === ex);
    if (exEntries.length === 0) continue;

    const latest = exEntries[0].estimated_1rm || exEntries[0].weight_kg;
    const best = Math.max(...exEntries.map(e => e.estimated_1rm || e.weight_kg));
    const oldest = exEntries[exEntries.length - 1].estimated_1rm || exEntries[exEntries.length - 1].weight_kg;
    const trend = latest > oldest * 1.02 ? 'improving' : latest < oldest * 0.98 ? 'declining' : 'stable';

    byExercise[ex] = {
      latest,
      best,
      trend,
      relativeStrength: Math.round((latest / bodyWeight) * 100) / 100,
    };
  }

  return { byExercise, bodyWeight, totalEntries: entries.length };
}
