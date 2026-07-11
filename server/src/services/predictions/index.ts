import { db } from '../../db/database.js';
import { generateId, daysAgo, today } from '../../types/index.js';
import { getWeightTrend, getMealTotals, getTrainingLoad } from '../analytics/index.js';

function avg(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function linearForecast(values: number[], daysAhead: number): { value: number; confidence: number } {
  if (values.length < 3) {
    return { value: values[values.length - 1] ?? 50, confidence: 0.3 };
  }

  const n = values.length;
  const xs = values.map((_, i) => i);
  const xMean = avg(xs);
  const yMean = avg(values);

  let num = 0, den = 0;
  for (let i = 0; i < n; i++) {
    num += (xs[i] - xMean) * (values[i] - yMean);
    den += (xs[i] - xMean) ** 2;
  }

  const slope = den !== 0 ? num / den : 0;
  const intercept = yMean - slope * xMean;
  const predicted = intercept + slope * (n - 1 + daysAhead);

  const residuals = values.map((v, i) => v - (intercept + slope * i));
  const rmse = Math.sqrt(avg(residuals.map(r => r ** 2)));
  const confidence = Math.max(0.2, Math.min(0.95, 1 - rmse / (yMean || 1)));

  return { value: Math.round(Math.max(0, Math.min(100, predicted)) * 10) / 10, confidence: Math.round(confidence * 100) / 100 };
}

export function predictRecovery(userId: string, daysAhead = 1) {
  const history = db.prepare(`
    SELECT recovery_score, strain, date FROM recovery_entries
    WHERE user_id = ? AND recovery_score IS NOT NULL ORDER BY date DESC LIMIT 14
  `).all(userId) as { recovery_score: number; strain: number; date: string }[];

  const sleep = db.prepare(`SELECT duration_hours FROM sleep_entries WHERE user_id = ? ORDER BY date DESC LIMIT 1`).get(userId) as { duration_hours: number } | undefined;
  const todayStrain = db.prepare(`SELECT strain FROM recovery_entries WHERE user_id = ? ORDER BY date DESC LIMIT 1`).get(userId) as { strain: number } | undefined;
  const academic = db.prepare(`SELECT COUNT(*) as c FROM academic_items WHERE user_id = ? AND completed = 0 AND due_date <= date('now', '+3 days')`).get(userId) as { c: number };

  const recoveryValues = history.map(h => h.recovery_score).reverse();
  const base = linearForecast(recoveryValues, daysAhead);

  let adjustment = 0;
  if (sleep?.duration_hours && sleep.duration_hours < 6) adjustment -= 8;
  if (sleep?.duration_hours && sleep.duration_hours >= 8) adjustment += 5;
  if (todayStrain?.strain && todayStrain.strain > 15) adjustment -= 10;
  if (academic.c > 0) adjustment -= 5;

  const predicted = Math.max(0, Math.min(100, base.value + adjustment));
  const targetDate = daysAgo(-daysAhead);

  const factors = [];
  if (sleep?.duration_hours) factors.push({ factor: 'sleep', impact: sleep.duration_hours >= 7 ? 'positive' : 'negative', value: sleep.duration_hours });
  if (todayStrain?.strain) factors.push({ factor: 'strain', impact: todayStrain.strain > 12 ? 'negative' : 'neutral', value: todayStrain.strain });
  if (academic.c > 0) factors.push({ factor: 'academic_stress', impact: 'negative', value: academic.c });

  const id = generateId();
  db.prepare(`
    INSERT INTO predictions (id, user_id, prediction_type, target_date, predicted_value, confidence, factors)
    VALUES (?, ?, 'recovery', ?, ?, ?, ?)
  `).run(id, userId, targetDate, predicted, base.confidence, JSON.stringify(factors));

  return { type: 'recovery', date: targetDate, value: predicted, confidence: base.confidence, factors };
}

export function predictWeight(userId: string, daysAhead = 7) {
  const weights = db.prepare(`
    SELECT weight_kg, recorded_at FROM weight_entries WHERE user_id = ? ORDER BY recorded_at DESC LIMIT 30
  `).all(userId) as { weight_kg: number; recorded_at: string }[];

  if (weights.length < 2) return null;

  const values = weights.map(w => w.weight_kg).reverse();
  const forecast = linearForecast(values, Math.ceil(daysAhead / 7));

  const profile = db.prepare(`SELECT target_weight_kg FROM user_profile WHERE user_id = ?`).get(userId) as { target_weight_kg: number } | undefined;
  const targetDate = daysAgo(-daysAhead);

  const id = generateId();
  db.prepare(`
    INSERT INTO predictions (id, user_id, prediction_type, target_date, predicted_value, confidence, factors)
    VALUES (?, ?, 'weight', ?, ?, ?, ?)
  `).run(id, userId, targetDate, forecast.value, forecast.confidence, JSON.stringify([{ target: profile?.target_weight_kg }]));

  const trend = getWeightTrend(userId);
  let goalDate: string | null = null;
  if (profile?.target_weight_kg && trend.weeklyChange !== 0) {
    const remaining = profile.target_weight_kg - (weights[0].weight_kg);
    const weeksNeeded = Math.abs(remaining / trend.weeklyChange);
    if (weeksNeeded > 0 && weeksNeeded < 104) {
      const d = new Date();
      d.setDate(d.getDate() + weeksNeeded * 7);
      goalDate = d.toISOString().split('T')[0];
    }
  }

  return { type: 'weight', date: targetDate, value: forecast.value, confidence: forecast.confidence, goalCompletionDate: goalDate, weeklyChange: trend.weeklyChange };
}

export function generateRecommendations(userId: string) {
  const context = {
    recovery: db.prepare(`SELECT recovery_score, strain, hrv_ms FROM recovery_entries WHERE user_id = ? ORDER BY date DESC LIMIT 1`).get(userId) as Record<string, number> | undefined,
    sleep: db.prepare(`SELECT duration_hours, performance_pct FROM sleep_entries WHERE user_id = ? ORDER BY date DESC LIMIT 1`).get(userId) as Record<string, number> | undefined,
    nutrition: getMealTotals(userId, today(), today()),
    profile: db.prepare(`SELECT * FROM user_profile WHERE user_id = ?`).get(userId) as Record<string, unknown> | undefined,
    training: getTrainingLoad(userId, 28),
    weight: getWeightTrend(userId),
    academic: db.prepare(`SELECT COUNT(*) as c FROM academic_items WHERE user_id = ? AND completed = 0 AND due_date <= date('now', '+7 days')`).get(userId) as { c: number },
    match: db.prepare(`SELECT COUNT(*) as c FROM calendar_events WHERE user_id = ? AND event_type = 'match' AND date(start_time) BETWEEN date('now') AND date('now', '+2 days')`).get(userId) as { c: number },
  };

  const recs: { category: string; priority: string; message: string }[] = [];

  const recovery = context.recovery?.recovery_score ?? 50;
  const protein = context.nutrition.protein_g;
  const proteinTarget = (context.profile?.target_protein_g as number) ?? 150;
  const calories = context.nutrition.calories;
  const calorieTarget = (context.profile?.target_calories as number) ?? 2500;

  if (recovery < 40) {
    recs.push({ category: 'training', priority: 'high', message: 'Recovery is critically low. Skip high-intensity training today. Focus on mobility, walking, or complete rest.' });
    recs.push({ category: 'nutrition', priority: 'high', message: 'Increase protein to support recovery. Aim for 40g+ at your next meal with anti-inflammatory foods.' });
    recs.push({ category: 'sleep', priority: 'high', message: 'Prioritize 8+ hours of sleep tonight. Avoid screens 1 hour before bed and limit caffeine after 2pm.' });
  } else if (recovery < 60) {
    recs.push({ category: 'training', priority: 'medium', message: 'Moderate recovery. Keep training below 70% intensity. Good day for technique work or moderate cardio.' });
  } else {
    recs.push({ category: 'training', priority: 'low', message: 'Strong recovery. Good day for high-intensity training or heavy gym session.' });
  }

  if (protein < proteinTarget * 0.7) {
    recs.push({ category: 'nutrition', priority: 'high', message: `Protein intake is at ${Math.round(protein)}g (${Math.round(protein / proteinTarget * 100)}% of target). Add a protein shake or lean meat serving.` });
  }

  if (context.sleep?.duration_hours && context.sleep.duration_hours < 7) {
    recs.push({ category: 'sleep', priority: 'medium', message: `Only ${context.sleep.duration_hours}h sleep last night. Sleep debt affects recovery, strength, and academic performance. Target 8h tonight.` });
  }

  if (context.academic.c > 2) {
    recs.push({ category: 'training', priority: 'medium', message: `${context.academic.c} deadlines this week. Reduce training volume by 20-30% to manage fatigue and maintain academic performance.` });
  }

  if (context.match.c > 0) {
    recs.push({ category: 'nutrition', priority: 'high', message: 'Match within 48h. Increase carbohydrates to 5-7g/kg body weight. Hydrate with 500ml electrolytes.' });
    recs.push({ category: 'training', priority: 'high', message: 'Taper gym sessions before match. Focus on activation, mobility, and rest.' });
  }

  if (context.training.overtrainingRisk === 'high') {
    recs.push({ category: 'training', priority: 'high', message: 'Acute:Chronic workload ratio indicates overtraining risk. Schedule a deload week with 40% reduced volume.' });
  }

  if (context.weight.trend === 'losing' && context.profile?.goal_type === 'bulking') {
    recs.push({ category: 'nutrition', priority: 'high', message: 'Weight trending down during bulk phase. Increase calories by 300-500 and ensure protein is at 2g/kg.' });
  }

  if (calories < calorieTarget * 0.8) {
    recs.push({ category: 'nutrition', priority: 'medium', message: `Calorie intake (${Math.round(calories)}) is well below target (${calorieTarget}). Add calorie-dense snacks between meals.` });
  }

  return recs.sort((a, b) => {
    const priority = { high: 0, medium: 1, low: 2 };
    return (priority[a.priority as keyof typeof priority] ?? 2) - (priority[b.priority as keyof typeof priority] ?? 2);
  });
}

export function runAllPredictions(userId: string) {
  return {
    recovery: predictRecovery(userId, 1),
    recoveryWeek: predictRecovery(userId, 7),
    weight: predictWeight(userId, 7),
    recommendations: generateRecommendations(userId),
  };
}
