import { db } from '../../db/database.js';
import { generateId, daysAgo, today } from '../../types/index.js';
import { buildStudyPlan, refreshAcademicEstimates, logStudyRecommendationMemory } from '../academic/planner.js';
import { getMealTotals, getTrainingLoad, getWeightTrend } from '../analytics/index.js';

/** Upsert an auto-learned memory (won't overwrite user-edited entries) */
export function upsertAutoMemory(userId: string, category: string, key: string, value: string) {
  const existing = db.prepare(`SELECT id, source FROM memories WHERE user_id = ? AND category = ? AND key = ?`)
    .get(userId, category, key) as { id: string; source: string } | undefined;

  if (existing?.source === 'user') return;

  if (existing) {
    db.prepare(`UPDATE memories SET value = ?, source = 'auto', updated_at = datetime('now') WHERE id = ?`)
      .run(value, existing.id);
  } else {
    db.prepare(`INSERT INTO memories (id, user_id, category, key, value, source) VALUES (?, ?, ?, ?, ?, 'auto')`)
      .run(generateId(), userId, category, key, value);
  }
}

/** Extract personal facts from chat messages using patterns */
export function learnFromChatMessage(userId: string, message: string) {
  const patterns: { regex: RegExp; category: string; key: string; group: number }[] = [
    { regex: /(?:i am|i'm|im)\s+allergic to\s+(.+)/i, category: 'health', key: 'allergy', group: 1 },
    { regex: /(?:my goal is|goal:)\s*(.+)/i, category: 'goals', key: 'primary_goal', group: 1 },
    { regex: /(?:i play|my sport is|sport:)\s*(.+)/i, category: 'sport', key: 'sport', group: 1 },
    { regex: /(?:i weigh|my weight is|weight:)\s*(\d+(?:\.\d+)?)\s*kg/i, category: 'body', key: 'stated_weight', group: 1 },
    { regex: /(?:i (?:don't|do not) eat|avoid)\s+(.+)/i, category: 'nutrition', key: 'avoid', group: 1 },
    { regex: /(?:i prefer|my favourite|favorite)\s+(.+)/i, category: 'preferences', key: 'preference', group: 1 },
    { regex: /(?:match|game) (?:is|on)\s+(.+)/i, category: 'schedule', key: 'upcoming_match', group: 1 },
    { regex: /(?:exam|test) (?:is|on)\s+(.+)/i, category: 'academic', key: 'upcoming_exam', group: 1 },
  ];

  for (const { regex, category, key, group } of patterns) {
    const match = message.match(regex);
    if (match?.[group]) {
      upsertAutoMemory(userId, category, key, match[group].trim().slice(0, 200));
    }
  }
}

/** Infer habits and preferences from logged behavior */
export function inferFromBehavior(userId: string) {
  const workouts = db.prepare(`
    SELECT activity_type, COUNT(*) as c FROM workouts WHERE user_id = ? AND date >= ? GROUP BY activity_type ORDER BY c DESC LIMIT 1
  `).get(userId, daysAgo(60)) as { activity_type: string; c: number } | undefined;

  if (workouts && workouts.c >= 3) {
    upsertAutoMemory(userId, 'sport', 'primary_activity', `${workouts.activity_type} (${workouts.c} sessions in 60d)`);
    const profile = db.prepare(`SELECT sport FROM user_profile WHERE user_id = ?`).get(userId) as { sport?: string } | undefined;
    if (!profile?.sport || profile.sport === 'rugby') {
      db.prepare(`UPDATE user_profile SET sport = ? WHERE user_id = ?`).run(workouts.activity_type, userId);
    }
  }

  const nutrition = getMealTotals(userId, daysAgo(7), today());
  if (nutrition.mealCount >= 5) {
    const avgProtein = Math.round(nutrition.protein_g / 7);
    upsertAutoMemory(userId, 'nutrition', 'weekly_protein_avg', `${avgProtein}g/day over last 7 days`);
  }

  const weight = getWeightTrend(userId);
  if (weight.current != null && weight.weeklyChange !== 0) {
    upsertAutoMemory(userId, 'body', 'weight_trend', `${weight.trend}, ${weight.weeklyChange > 0 ? '+' : ''}${weight.weeklyChange}kg/week`);
  }

  const training = getTrainingLoad(userId, 28);
  if (training.overtrainingRisk === 'high') {
    upsertAutoMemory(userId, 'training', 'load_warning', `ACWR ${training.acwr} — elevated overtraining risk detected`);
  }
}

/** Promote calendar exams/training to academic items and memories */
export function learnFromCalendar(userId: string) {
  const exams = db.prepare(`
    SELECT title, start_time, description FROM calendar_events
    WHERE user_id = ? AND event_type = 'exam' AND start_time >= datetime('now') ORDER BY start_time LIMIT 10
  `).all(userId) as { title: string; start_time: string; description?: string }[];

  for (const exam of exams) {
    const date = exam.start_time.split('T')[0];
    const exists = db.prepare(`SELECT id FROM academic_items WHERE user_id = ? AND title = ? AND due_date = ?`)
      .get(userId, exam.title, date);
    if (!exists) {
      db.prepare(`INSERT INTO academic_items (id, user_id, title, type, due_date, estimated_hours, stress_level, completed) VALUES (?, ?, ?, 'exam', ?, 3, 7, 0)`)
        .run(generateId(), userId, exam.title, date);
    }
  }

  if (exams.length > 0) {
    upsertAutoMemory(userId, 'academic', 'upcoming_exams', `${exams.length} exam(s) from calendar/email: ${exams.slice(0, 3).map(e => e.title).join(', ')}`);
  }

  const matches = db.prepare(`
    SELECT title, start_time FROM calendar_events
    WHERE user_id = ? AND event_type = 'match' AND start_time >= datetime('now') ORDER BY start_time LIMIT 3
  `).all(userId) as { title: string; start_time: string }[];

  if (matches.length > 0) {
    upsertAutoMemory(userId, 'schedule', 'upcoming_matches', matches.map(m => `${m.title} (${m.start_time.split('T')[0]})`).join('; '));
  }

  const emailExams = db.prepare(`
    SELECT title FROM calendar_events WHERE user_id = ? AND source = 'gmail' AND event_type = 'exam' ORDER BY start_time DESC LIMIT 5
  `).all(userId) as { title: string }[];

  if (emailExams.length > 0) {
    upsertAutoMemory(userId, 'academic', 'email_deadlines', emailExams.map(e => e.title).join('; '));
  }
}

/** Generate study-plan insights from due dates and logged study time */
export function learnFromAcademicPlan(userId: string) {
  refreshAcademicEstimates(userId);
  const studyPlan = buildStudyPlan(userId);
  logStudyRecommendationMemory(userId);

  if (studyPlan.plan.length === 0) return;

  const critical = studyPlan.plan.filter(p => p.urgency === 'critical' || p.urgency === 'high');
  if (critical.length > 0) {
    upsertAutoMemory(
      userId,
      'academic',
      'study_priorities',
      critical.slice(0, 4).map(p => `${p.title} due ${p.due_date} (${p.recommendedHoursToday}h today)`).join('; '),
    );
  }

  if (studyPlan.hoursGapWeek > 2) {
    const exists = db.prepare(`SELECT id FROM ai_insights WHERE user_id = ? AND title = ? AND dismissed = 0`)
      .get(userId, 'Study hours behind schedule');
    if (!exists) {
      db.prepare(`INSERT INTO ai_insights (id, user_id, title, content, severity, category) VALUES (?, ?, ?, ?, ?, 'learning')`)
        .run(
          generateId(),
          userId,
          'Study hours behind schedule',
          `You need ~${studyPlan.totalRecommendedWeek}h this week for upcoming work but logged ${studyPlan.studyHoursLoggedWeek}h. Focus ${studyPlan.totalRecommendedToday}h today on: ${studyPlan.plan.slice(0, 2).map(p => p.title).join(', ')}.`,
          'warning',
        );
    }
  }

  const nextExam = studyPlan.nextExam;
  if (nextExam && nextExam.daysUntil <= 7) {
    upsertAutoMemory(
      userId,
      'academic',
      'exam_countdown',
      `${nextExam.title} in ${nextExam.daysUntil} day(s) — aim ${nextExam.recommendedHoursToday}h study today`,
    );
  }
}

/** Generate learning insights stored in ai_insights */
export function generateLearningInsights(userId: string) {
  const insights: { title: string; content: string; severity: string }[] = [];

  const eventCount = (db.prepare(`
    SELECT COUNT(*) as c FROM calendar_events WHERE user_id = ? AND start_time >= datetime('now') AND start_time <= datetime('now', '+7 days')
  `).get(userId) as { c: number }).c;

  if (eventCount >= 5) {
    insights.push({
      title: 'Busy week ahead',
      content: `You have ${eventCount} calendar events in the next 7 days. Plan recovery and meal prep accordingly.`,
      severity: 'warning',
    });
  }

  const autoMemories = db.prepare(`SELECT COUNT(*) as c FROM memories WHERE user_id = ? AND source = 'auto'`).get(userId) as { c: number };
  if (autoMemories.c >= 3) {
    const recent = db.prepare(`SELECT category, key, value FROM memories WHERE user_id = ? AND source = 'auto' ORDER BY updated_at DESC LIMIT 3`)
      .all(userId) as { category: string; key: string; value: string }[];
    insights.push({
      title: 'AiCoach is learning about you',
      content: `Auto-discovered: ${recent.map(m => `${m.key}: ${m.value}`).join('; ')}`,
      severity: 'info',
    });
  }

  const recoveryDrop = db.prepare(`
    SELECT AVG(r.recovery_score) as avg_recovery, COUNT(*) as event_days
    FROM recovery_entries r
    JOIN calendar_events c ON r.user_id = c.user_id AND date(c.start_time) = r.date
    WHERE r.user_id = ? AND r.date >= ? AND c.event_type IN ('exam', 'match', 'training')
  `).get(userId, daysAgo(30)) as { avg_recovery: number; event_days: number } | undefined;

  const baseline = db.prepare(`SELECT AVG(recovery_score) as avg FROM recovery_entries WHERE user_id = ? AND date >= ?`)
    .get(userId, daysAgo(30)) as { avg: number } | undefined;

  if (recoveryDrop && recoveryDrop.event_days >= 3 && baseline?.avg && recoveryDrop.avg_recovery < baseline.avg - 5) {
    insights.push({
      title: 'Schedule affects recovery',
      content: `Recovery averages ${Math.round(recoveryDrop.avg_recovery)}% on event days vs ${Math.round(baseline.avg)}% baseline. Consider lighter training before big days.`,
      severity: 'important',
    });
  }

  for (const ins of insights) {
    const exists = db.prepare(`SELECT id FROM ai_insights WHERE user_id = ? AND title = ? AND dismissed = 0`).get(userId, ins.title);
    if (!exists) {
      db.prepare(`INSERT INTO ai_insights (id, user_id, title, content, severity, category) VALUES (?, ?, ?, ?, ?, 'learning')`)
        .run(generateId(), userId, ins.title, ins.content, ins.severity);
    }
  }

  return insights;
}

/** Full autonomous learning cycle — run after sync, chat, dashboard load */
export function runLearningCycle(userId: string) {
  inferFromBehavior(userId);
  learnFromCalendar(userId);
  learnFromAcademicPlan(userId);
  const insights = generateLearningInsights(userId);

  const autoMemoryCount = (db.prepare(`SELECT COUNT(*) as c FROM memories WHERE user_id = ? AND source = 'auto'`).get(userId) as { c: number }).c;

  return {
    autoMemories: autoMemoryCount,
    newInsights: insights.length,
    lastRun: new Date().toISOString(),
  };
}

export function getLearningStatus(userId: string) {
  const autoMemories = db.prepare(`SELECT category, key, value, updated_at FROM memories WHERE user_id = ? AND source = 'auto' ORDER BY updated_at DESC LIMIT 20`).all(userId);
  const learningInsights = db.prepare(`SELECT title, content, severity, created_at FROM ai_insights WHERE user_id = ? AND category = 'learning' AND dismissed = 0 ORDER BY created_at DESC LIMIT 10`).all(userId);
  return {
    autoMemories,
    learningInsights,
    totalAutoMemories: (db.prepare(`SELECT COUNT(*) as c FROM memories WHERE user_id = ? AND source = 'auto'`).get(userId) as { c: number }).c,
  };
}
