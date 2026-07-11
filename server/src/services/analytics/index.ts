import { db } from '../../db/database.js';
import { daysAgo, today, type MealTotals, type DailyScores, type UnifiedContext } from '../../types/index.js';

function avg(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function clamp(val: number, min = 0, max = 100): number {
  return Math.max(min, Math.min(max, val));
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

  const acuteLoad = avg(workouts.slice(-7).map(w => w.strain || w.duration_minutes / 10 || 5));
  const chronicLoad = avg(workouts.map(w => w.strain || w.duration_minutes / 10 || 5));
  const acwr = chronicLoad > 0 ? acuteLoad / chronicLoad : 1;

  const weeklyByType: Record<string, number> = {};
  for (const w of workouts.slice(-7)) {
    weeklyByType[w.activity_type] = (weeklyByType[w.activity_type] || 0) + (w.strain || 5);
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
  const recovery = db.prepare(`SELECT * FROM recovery_entries WHERE user_id = ? AND date = ?`).get(userId, date) as Record<string, number> | undefined;
  const sleep = db.prepare(`SELECT * FROM sleep_entries WHERE user_id = ? AND date = ?`).get(userId, date) as Record<string, number> | undefined;
  const lifestyle = db.prepare(`SELECT * FROM lifestyle_entries WHERE user_id = ? AND date = ?`).get(userId, date) as Record<string, number> | undefined;

  const nutritionToday = getMealTotals(userId, date, date);
  const profile = db.prepare(`SELECT * FROM user_profile WHERE user_id = ?`).get(userId) as Record<string, number> | undefined;
  const weightTrend = getWeightTrend(userId);
  const training = getTrainingLoad(userId, 28);
  const academic = getAcademicWorkload(userId);

  const recoveryScore = recovery?.recovery_score ?? 50;
  const sleepScore = sleep?.performance_pct ?? sleep?.duration_hours ? Math.min(100, (sleep.duration_hours / 8) * 100) : 50;
  const strain = recovery?.strain ?? 10;

  const proteinTarget = profile?.target_protein_g ?? 150;
  const calorieTarget = profile?.target_calories ?? 2500;
  const proteinPct = proteinTarget > 0 ? (nutritionToday.protein_g / proteinTarget) * 100 : 50;
  const caloriePct = calorieTarget > 0 ? (nutritionToday.calories / calorieTarget) * 100 : 50;

  const athleticReadiness = clamp(
    recoveryScore * 0.35 + sleepScore * 0.25 + proteinPct * 0.15 +
    (100 - Math.min(strain * 3, 80)) * 0.15 + (100 - training.acwr * 30) * 0.10
  );

  const growthScore = clamp(
    (weightTrend.weeklyChange > 0 ? 60 : 30) + proteinPct * 0.2 + recoveryScore * 0.2
  );

  const bulkQuality = clamp(
    proteinPct * 0.35 + (caloriePct > 100 && caloriePct < 120 ? 80 : 50) * 0.25 +
    (weightTrend.weeklyChange >= 0.1 && weightTrend.weeklyChange <= 0.5 ? 80 : 40) * 0.25 +
    recoveryScore * 0.15
  );

  const studentAthleteScore = clamp(
    athleticReadiness * 0.3 + (100 - academic.workloadScore) * 0.2 +
    proteinPct * 0.15 + sleepScore * 0.2 + training.consistency * 0.15
  );

  const fatigueScore = clamp(
    (100 - recoveryScore) * 0.3 + strain * 2 + academic.stressEstimate * 0.25 +
    (sleep?.sleep_debt_hours ?? 0) * 10 + (lifestyle?.caffeine_mg ?? 0) / 5
  );

  const schoolLifeBalance = clamp(
    100 - Math.abs(training.weeklySessions * 10 - 50) - academic.workloadScore * 0.3 + recoveryScore * 0.2
  );

  const hydrationScore = clamp(((lifestyle?.water_ml ?? 0) / (profile?.target_water_ml ?? 3000)) * 100);

  const performancePotential = clamp(
    athleticReadiness * 0.4 + studentAthleteScore * 0.3 + (100 - fatigueScore) * 0.3
  );

  const readinessForecast = clamp(recoveryScore * 0.5 + sleepScore * 0.3 + (100 - strain * 2) * 0.2);

  return {
    athletic_readiness: Math.round(athleticReadiness),
    growth_score: Math.round(growthScore),
    bulk_quality: Math.round(bulkQuality),
    student_athlete_score: Math.round(studentAthleteScore),
    performance_potential: Math.round(performancePotential),
    fatigue_score: Math.round(fatigueScore),
    academic_stress: Math.round(academic.stressEstimate),
    school_life_balance: Math.round(schoolLifeBalance),
    hydration_score: Math.round(hydrationScore),
    readiness_forecast: Math.round(readinessForecast),
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
  const profile = profileRow ? {
    ...profileRow,
    dietary_restrictions: JSON.parse((profileRow.dietary_restrictions as string) || '[]'),
    favorite_foods: JSON.parse((profileRow.favorite_foods as string) || '[]'),
    preferences: JSON.parse((profileRow.preferences as string) || '{}'),
  } : null;

  const latestWeight = db.prepare(`SELECT * FROM weight_entries WHERE user_id = ? ORDER BY recorded_at DESC LIMIT 1`).get(userId) as UnifiedContext['latestWeight'];
  const weightTrend = getWeightTrend(userId);

  const recovery = db.prepare(`SELECT * FROM recovery_entries WHERE user_id = ? AND date >= ? ORDER BY date DESC LIMIT 30`).all(userId, daysAgo(30)) as UnifiedContext['recovery'];
  const sleep = db.prepare(`SELECT * FROM sleep_entries WHERE user_id = ? AND date >= ? ORDER BY date DESC LIMIT 30`).all(userId, daysAgo(30)) as UnifiedContext['sleep'];
  const workouts = db.prepare(`SELECT * FROM workouts WHERE user_id = ? AND date >= ? ORDER BY date DESC LIMIT 50`).all(userId, daysAgo(30)) as UnifiedContext['workouts'];
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

  const hasExamThisWeek = academic.items.some(i => i.type === 'exam');

  const scores = computeDailyScores(userId, t);
  saveDailyScores(userId, t, scores);

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
    profile: profile as UnifiedContext['profile'],
    latestWeight,
    weightTrend,
    recovery,
    sleep,
    workouts,
    nutrition,
    strength,
    academic: { items: academic.items as UnifiedContext['academic']['items'], workloadScore: academic.workloadScore, stressEstimate: academic.stressEstimate },
    lifestyle,
    calendar: { upcoming, hasMatchToday: hasMatchToday.c > 0, hasExamThisWeek },
    scores,
    correlations,
    insights,
    predictions,
  };
}

export function getNutritionAnalytics(userId: string) {
  const profile = db.prepare(`SELECT * FROM user_profile WHERE user_id = ?`).get(userId) as Record<string, number> | undefined;
  const weight = db.prepare(`SELECT weight_kg FROM weight_entries WHERE user_id = ? ORDER BY recorded_at DESC LIMIT 1`).get(userId) as { weight_kg: number } | undefined;
  const weightKg = weight?.weight_kg ?? 75;

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
      protein: weightKg > 0 ? Math.round((todayTotals.protein_g / weightKg) * 10) / 10 : 0,
      carbs: weightKg > 0 ? Math.round((todayTotals.carbs_g / weightKg) * 10) / 10 : 0,
      fat: weightKg > 0 ? Math.round((todayTotals.fat_g / weightKg) * 10) / 10 : 0,
      calories: weightKg > 0 ? Math.round((todayTotals.calories / weightKg) * 10) / 10 : 0,
    },
    targets: {
      calories: profile?.target_calories ?? 2500,
      protein: profile?.target_protein_g ?? Math.round(weightKg * 2),
      carbs: profile?.target_carbs_g ?? Math.round(weightKg * 4),
      fat: profile?.target_fat_g ?? Math.round(weightKg * 1),
    },
    adherence: {
      protein: profile?.target_protein_g ? Math.round((todayTotals.protein_g / profile.target_protein_g) * 100) : 0,
      calories: profile?.target_calories ? Math.round((todayTotals.calories / profile.target_calories) * 100) : 0,
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
    WHERE r.user_id = ? AND r.date >= ? ORDER BY r.date DESC LIMIT 30
  `).all(userId, daysAgo(30)) as Record<string, number>[];

  const recoveryValues = entries.map(e => e.recovery_score).filter(Boolean);
  const hrvValues = entries.map(e => e.hrv_ms).filter(Boolean);
  const sleepValues = entries.map(e => e.duration_hours).filter(Boolean);

  const avgRecovery = avg(recoveryValues);
  const recoveryVolatility = recoveryValues.length > 1
    ? Math.round(Math.sqrt(recoveryValues.reduce((s, v) => s + (v - avgRecovery) ** 2, 0) / recoveryValues.length) * 10) / 10
    : 0;

  const totalSleepDebt = entries.reduce((s, e) => s + (e.sleep_debt_hours || 0), 0);
  const avgStrain = avg(entries.map(e => e.strain).filter(Boolean));

  const latestRecovery = recoveryValues[0] ?? 50;
  const prevRecovery = recoveryValues[1] ?? latestRecovery;
  const momentum = latestRecovery - prevRecovery;

  const burnoutRisk = latestRecovery < 33 && avgStrain > 15 ? 'high'
    : latestRecovery < 50 && avgStrain > 12 ? 'moderate' : 'low';

  return {
    trends: entries.slice(0, 14).reverse(),
    avgRecovery: Math.round(avgRecovery),
    avgHrv: Math.round(avg(hrvValues)),
    avgSleep: Math.round(avg(sleepValues) * 10) / 10,
    recoveryVolatility,
    sleepDebt: Math.round(totalSleepDebt * 10) / 10,
    recoveryMomentum: Math.round(momentum),
    recoveryToStrainRatio: avgStrain > 0 ? Math.round((avgRecovery / avgStrain) * 10) / 10 : 0,
    burnoutRisk,
    readinessScore: Math.round(latestRecovery * 0.6 + (100 - avgStrain * 3) * 0.4),
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
