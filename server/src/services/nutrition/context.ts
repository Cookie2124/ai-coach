import { db } from '../../db/database.js';
import { getMealTotals } from '../analytics/index.js';
import { daysAgoInTz, formatNowContext, todayInTz } from '../../utils/timezone.js';

export function getMealsForDate(userId: string, date: string) {
  return db.prepare(`
    SELECT description, calories, protein_g, carbs_g, fat_g, meal_type, logged_at
    FROM meals WHERE user_id = ? AND date(logged_at) = ?
    ORDER BY logged_at ASC
  `).all(userId, date) as {
    description: string;
    calories: number;
    protein_g: number;
    carbs_g: number;
    fat_g: number;
    meal_type: string;
    logged_at: string;
  }[];
}

export function buildNutritionContextForAI(userId: string, timeZone: string): string {
  const now = formatNowContext(timeZone);
  const today = now.localDate;
  const lines: string[] = [
    `Timezone: ${timeZone}`,
    `Now: ${now.longDate} at ${now.localTime}`,
    `Today (local): ${today}`,
    `Yesterday: ${now.yesterday}`,
  ];

  const todayMeals = getMealsForDate(userId, today);
  const todayTotals = getMealTotals(userId, today, today);
  lines.push(`\n### Today (${today}) — ${Math.round(todayTotals.calories)} cal, ${Math.round(todayTotals.protein_g)}g protein, ${todayMeals.length} meals`);
  if (todayMeals.length === 0) {
    lines.push('- No meals logged yet today');
  } else {
    for (const m of todayMeals) {
      const time = m.logged_at.includes('T') ? m.logged_at.split('T')[1]?.slice(0, 5) : '';
      lines.push(`- ${time ? time + ' ' : ''}${m.meal_type !== 'other' ? m.meal_type + ': ' : ''}${m.description} — ${Math.round(m.calories)} cal, ${Math.round(m.protein_g)}g P, ${Math.round(m.carbs_g)}g C, ${Math.round(m.fat_g)}g F`);
    }
  }

  const yesterdayMeals = getMealsForDate(userId, now.yesterday);
  const yesterdayTotals = getMealTotals(userId, now.yesterday, now.yesterday);
  lines.push(`\n### Yesterday (${now.yesterday}) — ${Math.round(yesterdayTotals.calories)} cal, ${Math.round(yesterdayTotals.protein_g)}g protein, ${yesterdayMeals.length} meals`);
  for (const m of yesterdayMeals.slice(0, 8)) {
    lines.push(`- ${m.meal_type !== 'other' ? m.meal_type + ': ' : ''}${m.description} — ${Math.round(m.calories)} cal`);
  }

  for (let i = 2; i <= 6; i++) {
    const d = daysAgoInTz(i, timeZone);
    const totals = getMealTotals(userId, d, d);
    if (totals.mealCount > 0) {
      lines.push(`- ${d}: ${Math.round(totals.calories)} cal, ${Math.round(totals.protein_g)}g protein (${totals.mealCount} meals)`);
    }
  }

  const weekStart = daysAgoInTz(6, timeZone);
  const weekTotals = getMealTotals(userId, weekStart, today);
  lines.push(`\n### 7-day totals (${weekStart} → ${today})`);
  lines.push(`- ${Math.round(weekTotals.calories)} cal, ${Math.round(weekTotals.protein_g)}g protein, ${weekTotals.mealCount} meals`);

  return lines.join('\n');
}
