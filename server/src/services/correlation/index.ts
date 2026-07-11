import * as ss from 'simple-statistics';
import { db } from '../../db/database.js';
import { generateId, daysAgo } from '../../types/index.js';

interface DataPoint {
  date: string;
  value: number;
}

const METRIC_QUERIES: Record<string, (userId: string, days: number) => DataPoint[]> = {
  recovery: (userId, days) => db.prepare(`
    SELECT date, recovery_score as value FROM recovery_entries
    WHERE user_id = ? AND date >= ? AND recovery_score IS NOT NULL ORDER BY date
  `).all(userId, daysAgo(days)) as DataPoint[],

  hrv: (userId, days) => db.prepare(`
    SELECT date, hrv_ms as value FROM recovery_entries
    WHERE user_id = ? AND date >= ? AND hrv_ms IS NOT NULL ORDER BY date
  `).all(userId, daysAgo(days)) as DataPoint[],

  sleep_duration: (userId, days) => db.prepare(`
    SELECT date, duration_hours as value FROM sleep_entries
    WHERE user_id = ? AND date >= ? AND duration_hours IS NOT NULL ORDER BY date
  `).all(userId, daysAgo(days)) as DataPoint[],

  sleep_performance: (userId, days) => db.prepare(`
    SELECT date, performance_pct as value FROM sleep_entries
    WHERE user_id = ? AND date >= ? AND performance_pct IS NOT NULL ORDER BY date
  `).all(userId, daysAgo(days)) as DataPoint[],

  strain: (userId, days) => db.prepare(`
    SELECT date, strain as value FROM recovery_entries
    WHERE user_id = ? AND date >= ? AND strain IS NOT NULL ORDER BY date
  `).all(userId, daysAgo(days)) as DataPoint[],

  daily_protein: (userId, days) => db.prepare(`
    SELECT date(logged_at) as date, SUM(protein_g) as value FROM meals
    WHERE user_id = ? AND date(logged_at) >= ? GROUP BY date(logged_at) ORDER BY date
  `).all(userId, daysAgo(days)) as DataPoint[],

  daily_calories: (userId, days) => db.prepare(`
    SELECT date(logged_at) as date, SUM(calories) as value FROM meals
    WHERE user_id = ? AND date(logged_at) >= ? GROUP BY date(logged_at) ORDER BY date
  `).all(userId, daysAgo(days)) as DataPoint[],

  weight: (userId, days) => db.prepare(`
    SELECT date(recorded_at) as date, weight_kg as value FROM weight_entries
    WHERE user_id = ? AND date(recorded_at) >= ? ORDER BY date(recorded_at)
  `).all(userId, daysAgo(days)) as DataPoint[],

  study_hours: (userId, days) => db.prepare(`
    SELECT date(recorded_at) as date, SUM(duration_minutes) / 60.0 as value FROM study_sessions
    WHERE user_id = ? AND date(recorded_at) >= ? GROUP BY date(recorded_at) ORDER BY date
  `).all(userId, daysAgo(days)) as DataPoint[],

  training_load: (userId, days) => db.prepare(`
    SELECT date, COALESCE(SUM(strain), SUM(duration_minutes) / 10.0, COUNT(*) * 5) as value
    FROM workouts WHERE user_id = ? AND date >= ? GROUP BY date ORDER BY date
  `).all(userId, daysAgo(days)) as DataPoint[],
};

function alignSeries(a: DataPoint[], b: DataPoint[]): { x: number[]; y: number[] } {
  const mapB = new Map(b.map(p => [p.date, p.value]));
  const x: number[] = [];
  const y: number[] = [];
  for (const p of a) {
    const bv = mapB.get(p.date);
    if (bv !== undefined && p.value !== null && bv !== null) {
      x.push(p.value);
      y.push(bv);
    }
  }
  return { x, y };
}

function pearsonCorrelation(x: number[], y: number[]): number | null {
  if (x.length < 5) return null;
  try {
    return Math.round(ss.sampleCorrelation(x, y) * 1000) / 1000;
  } catch {
    return null;
  }
}

function describeCorrelation(metricA: string, metricB: string, r: number): string {
  const strength = Math.abs(r) > 0.7 ? 'strong' : Math.abs(r) > 0.4 ? 'moderate' : 'weak';
  const direction = r > 0 ? 'positive' : 'negative';
  const labels: Record<string, string> = {
    recovery: 'recovery score', hrv: 'HRV', sleep_duration: 'sleep duration',
    sleep_performance: 'sleep quality', strain: 'training strain',
    daily_protein: 'daily protein intake', daily_calories: 'daily calories',
    weight: 'body weight', study_hours: 'study hours', training_load: 'training load',
  };
  const a = labels[metricA] || metricA;
  const b = labels[metricB] || metricB;

  if (metricA === 'recovery' && metricB === 'sleep_duration') {
    return r > 0.4 ? `Better sleep strongly predicts higher recovery (${strength} ${direction} correlation: ${r})` : `${strength} ${direction} link between sleep and recovery (${r})`;
  }
  if (metricA === 'recovery' && metricB === 'daily_protein') {
    return r > 0.3 ? `Higher protein intake correlates with better recovery (${r})` : `Protein intake shows ${strength} correlation with recovery (${r})`;
  }
  if (metricA === 'hrv' && metricB === 'study_hours') {
    return r < -0.3 ? `Heavy study days may be suppressing HRV (${r})` : `HRV and study hours show ${strength} ${direction} correlation (${r})`;
  }
  if (metricA === 'weight' && metricB === 'daily_calories') {
    return r > 0.3 ? `Calorie intake is driving weight changes as expected (${r})` : `Calorie-weight relationship: ${strength} ${direction} (${r})`;
  }
  if (metricA === 'strain' && metricB === 'recovery') {
    return r < -0.3 ? `Higher training strain consistently lowers next-day recovery (${r})` : `Strain-recovery relationship: ${strength} ${direction} (${r})`;
  }

  return `${strength.charAt(0).toUpperCase() + strength.slice(1)} ${direction} correlation between ${a} and ${b} (r=${r})`;
}

const METRIC_PAIRS = [
  ['recovery', 'sleep_duration'], ['recovery', 'sleep_performance'],
  ['recovery', 'daily_protein'], ['recovery', 'strain'],
  ['hrv', 'sleep_duration'], ['hrv', 'study_hours'], ['hrv', 'strain'],
  ['strain', 'recovery'], ['strain', 'training_load'],
  ['weight', 'daily_calories'], ['weight', 'daily_protein'],
  ['daily_protein', 'recovery'], ['daily_calories', 'weight'],
  ['sleep_duration', 'training_load'], ['study_hours', 'recovery'],
  ['training_load', 'recovery'],
];

export function runCorrelationEngine(userId: string, days = 60) {
  const discovered: { metric_a: string; metric_b: string; correlation: number; sample_size: number; description: string }[] = [];

  for (const [metricA, metricB] of METRIC_PAIRS) {
    const queryA = METRIC_QUERIES[metricA];
    const queryB = METRIC_QUERIES[metricB];
    if (!queryA || !queryB) continue;

    const seriesA = queryA(userId, days);
    const seriesB = queryB(userId, days);
    const { x, y } = alignSeries(seriesA, seriesB);
    const r = pearsonCorrelation(x, y);

    if (r === null || Math.abs(r) < 0.25) continue;

    const significance = Math.abs(r) > 0.6 ? 'high' : Math.abs(r) > 0.4 ? 'medium' : 'low';
    const description = describeCorrelation(metricA, metricB, r);

    discovered.push({ metric_a: metricA, metric_b: metricB, correlation: r, sample_size: x.length, description });

    const id = generateId();
    db.prepare(`
      INSERT INTO correlations (id, user_id, metric_a, metric_b, correlation, sample_size, significance, description)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO NOTHING
    `).run(id, userId, metricA, metricB, r, x.length, significance, description);
  }

  db.prepare(`DELETE FROM correlations WHERE user_id = ? AND rowid NOT IN (
    SELECT rowid FROM correlations WHERE user_id = ? ORDER BY ABS(correlation) DESC LIMIT 50
  )`).run(userId, userId);

  return discovered.sort((a, b) => Math.abs(b.correlation) - Math.abs(a.correlation));
}

export function generateInsightsFromCorrelations(userId: string) {
  const correlations = db.prepare(`
    SELECT * FROM correlations WHERE user_id = ? AND ABS(correlation) >= 0.4 ORDER BY ABS(correlation) DESC LIMIT 5
  `).all(userId) as { metric_a: string; metric_b: string; correlation: number; description: string }[];

  const context = db.prepare(`SELECT recovery_score, strain FROM recovery_entries WHERE user_id = ? ORDER BY date DESC LIMIT 1`).get(userId) as { recovery_score: number; strain: number } | undefined;
  const academic = db.prepare(`SELECT COUNT(*) as c FROM academic_items WHERE user_id = ? AND type = 'exam' AND completed = 0 AND due_date <= date('now', '+7 days')`).get(userId) as { c: number };
  const upcomingMatch = db.prepare(`SELECT COUNT(*) as c FROM calendar_events WHERE user_id = ? AND event_type = 'match' AND date(start_time) BETWEEN date('now') AND date('now', '+3 days')`).get(userId) as { c: number };

  const insights: { category: string; title: string; content: string; severity: string }[] = [];

  if (context?.recovery_score && context.recovery_score < 40) {
    insights.push({
      category: 'recovery',
      title: 'Low Recovery Alert',
      content: `Recovery is at ${context.recovery_score}%. Consider reducing training intensity, prioritizing sleep, and increasing protein intake today.`,
      severity: 'warning',
    });
  }

  if (academic.c > 0) {
    insights.push({
      category: 'academic',
      title: 'Exam Period Detected',
      content: `You have ${academic.c} exam(s) this week. Academic stress may impact recovery and sleep. Consider lighter training loads and meal prep for consistent nutrition.`,
      severity: 'info',
    });
  }

  if (upcomingMatch.c > 0) {
    insights.push({
      category: 'training',
      title: 'Match Coming Up',
      content: 'A rugby match is scheduled within 3 days. Focus on carbohydrate loading, hydration, and prioritize sleep. Reduce gym volume until after the match.',
      severity: 'info',
    });
  }

  for (const corr of correlations) {
    insights.push({
      category: 'correlation',
      title: `Pattern: ${corr.metric_a} ↔ ${corr.metric_b}`,
      content: corr.description,
      severity: Math.abs(corr.correlation) > 0.6 ? 'important' : 'info',
    });
  }

  for (const insight of insights) {
    const existing = db.prepare(`SELECT id FROM ai_insights WHERE user_id = ? AND title = ? AND dismissed = 0`).get(userId, insight.title);
    if (!existing) {
      db.prepare(`INSERT INTO ai_insights (id, user_id, category, title, content, severity) VALUES (?, ?, ?, ?, ?, ?)`)
        .run(generateId(), userId, insight.category, insight.title, insight.content, insight.severity);
    }
  }

  return insights;
}
