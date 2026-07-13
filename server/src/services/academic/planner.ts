import { db } from '../../db/database.js';
import { generateId, today } from '../../types/index.js';

export type StudyUrgency = 'critical' | 'high' | 'medium' | 'low';

export interface StudyPlanItem {
  id: string;
  title: string;
  type: string;
  subject: string;
  due_date: string;
  daysUntil: number;
  estimated_hours: number;
  recommendedHoursToday: number;
  recommendedHoursThisWeek: number;
  urgency: StudyUrgency;
  stress_level: number;
}

function daysUntilDue(dueDate: string): number {
  const due = new Date(`${dueDate}T12:00:00`);
  const now = new Date(`${today()}T12:00:00`);
  return Math.max(0, Math.ceil((due.getTime() - now.getTime()) / 86400000));
}

function urgencyLevel(daysUntil: number, type: string): StudyUrgency {
  if (daysUntil <= 1) return 'critical';
  if (daysUntil <= 4 || (type === 'exam' && daysUntil <= 7)) return 'high';
  if (daysUntil <= 14) return 'medium';
  return 'low';
}

function adjustedWorkloadHours(item: {
  estimated_hours: number;
  type: string;
  stress_level: number;
}): number {
  const base = item.estimated_hours || 2;
  const typeMult = item.type === 'exam' ? 1.4 : item.type === 'project' ? 1.25 : 1;
  const stressMult = 1 + ((item.stress_level || 5) - 5) * 0.06;
  return base * typeMult * stressMult;
}

export function buildStudyPlan(userId: string) {
  const items = db.prepare(`
    SELECT * FROM academic_items WHERE user_id = ? AND completed = 0 ORDER BY due_date ASC
  `).all(userId) as {
    id: string;
    title: string;
    type: string;
    subject: string;
    due_date: string;
    estimated_hours: number;
    stress_level: number;
  }[];

  const studyHoursWeek = (db.prepare(`
    SELECT COALESCE(SUM(duration_minutes), 0) / 60.0 as hours FROM study_sessions
    WHERE user_id = ? AND date(recorded_at) >= date('now', '-7 days')
  `).get(userId) as { hours: number }).hours;

  const plan: StudyPlanItem[] = items
    .filter(i => i.due_date)
    .map(item => {
      const daysUntil = daysUntilDue(item.due_date);
      const adjusted = adjustedWorkloadHours(item);
      const spreadDays = Math.max(1, daysUntil || 1);
      const urgency = urgencyLevel(daysUntil, item.type);
      const urgencyBoost = urgency === 'critical' ? 1.6 : urgency === 'high' ? 1.25 : 1;
      const hoursPerDay = (adjusted / spreadDays) * urgencyBoost;
      const recommendedHoursToday = Math.round(Math.min(adjusted, hoursPerDay) * 10) / 10;
      const recommendedHoursThisWeek = Math.round(
        Math.min(adjusted, hoursPerDay * Math.min(spreadDays, 7)) * 10,
      ) / 10;

      return {
        id: item.id,
        title: item.title,
        type: item.type,
        subject: item.subject,
        due_date: item.due_date,
        daysUntil,
        estimated_hours: Math.round(adjusted * 10) / 10,
        recommendedHoursToday,
        recommendedHoursThisWeek,
        urgency,
        stress_level: item.stress_level || 5,
      };
    });

  const totalRecommendedToday = Math.round(plan.reduce((s, p) => s + p.recommendedHoursToday, 0) * 10) / 10;
  const totalRecommendedWeek = Math.round(plan.reduce((s, p) => s + p.recommendedHoursThisWeek, 0) * 10) / 10;
  const hoursGapWeek = Math.round(Math.max(0, totalRecommendedWeek - studyHoursWeek) * 10) / 10;

  const nextExam = plan.find(p => p.type === 'exam');
  const nextDue = plan[0] ?? null;

  return {
    plan,
    totalRecommendedToday,
    totalRecommendedWeek,
    studyHoursLoggedWeek: Math.round(studyHoursWeek * 10) / 10,
    hoursGapWeek,
    nextExam,
    nextDue,
    examCount: plan.filter(p => p.type === 'exam').length,
    criticalCount: plan.filter(p => p.urgency === 'critical' || p.urgency === 'high').length,
  };
}

/** Auto-adjust estimated hours when due date is close and user hasn't updated. */
export function refreshAcademicEstimates(userId: string) {
  const items = db.prepare(`
    SELECT id, type, due_date, estimated_hours, stress_level FROM academic_items
    WHERE user_id = ? AND completed = 0 AND due_date IS NOT NULL
  `).all(userId) as { id: string; type: string; due_date: string; estimated_hours: number; stress_level: number }[];

  for (const item of items) {
    const days = daysUntilDue(item.due_date);
    if (days > 21) continue;
    const minHours = item.type === 'exam' ? 4 : item.type === 'project' ? 6 : 2;
    const suggested = Math.max(minHours, Math.round((minHours + (21 - days) * 0.35) * 10) / 10);
    if ((item.estimated_hours || 0) < suggested) {
      db.prepare(`UPDATE academic_items SET estimated_hours = ?, updated_at = datetime('now') WHERE id = ?`)
        .run(suggested, item.id);
    }
  }
}

export function logStudyRecommendationMemory(userId: string) {
  const { plan, totalRecommendedToday, nextExam } = buildStudyPlan(userId);
  if (plan.length === 0) return;

  const top = plan.slice(0, 3).map(p =>
    `${p.title} (${p.daysUntil}d, ${p.recommendedHoursToday}h today)`,
  ).join('; ');

  const existing = db.prepare(`SELECT id FROM memories WHERE user_id = ? AND category = 'academic' AND key = 'study_plan_today'`)
    .get(userId) as { id: string } | undefined;

  const value = `Today ~${totalRecommendedToday}h study. Priority: ${top}${nextExam ? `. Next exam: ${nextExam.title} in ${nextExam.daysUntil}d` : ''}`;
  if (existing) {
    db.prepare(`UPDATE memories SET value = ?, updated_at = datetime('now') WHERE id = ?`).run(value, existing.id);
  } else {
    db.prepare(`INSERT INTO memories (id, user_id, category, key, value, source) VALUES (?, ?, 'academic', 'study_plan_today', ?, 'auto')`)
      .run(generateId(), userId, value);
  }
}
