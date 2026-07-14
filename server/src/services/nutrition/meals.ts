import { db } from '../../db/database.js';
import { generateId } from '../../types/index.js';
import { todayInTz, addDaysToLocalDate, normalizeTimezone } from '../../utils/timezone.js';
import { logWeight as saveWeight } from '../body/weight.js';
import {
  estimateMealNutrition,
  parseMealDate,
  detectMealType,
  isMealLogIntent,
  extractMealDescription,
} from './food-db.js';

export { estimateMealNutrition, parseMealDate, detectMealType, isMealLogIntent, extractMealDescription };

export function logMeal(
  userId: string,
  description: string,
  options?: { logged_at?: string; meal_type?: string; calories?: number; protein_g?: number; carbs_g?: number; fat_g?: number; fibre_g?: number; timeZone?: string },
) {
  const cleanDesc = extractMealDescription(description);
  const estimated = estimateMealNutrition(cleanDesc);
  const id = generateId();
  const loggedAt = options?.logged_at ?? parseMealDate(description, options?.timeZone);

  db.prepare(`
    INSERT INTO meals (id, user_id, description, calories, protein_g, carbs_g, fat_g, fibre_g, meal_type, logged_at, ai_estimated)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
  `).run(
    id, userId, cleanDesc,
    options?.calories ?? estimated.calories,
    options?.protein_g ?? estimated.protein_g,
    options?.carbs_g ?? estimated.carbs_g,
    options?.fat_g ?? estimated.fat_g,
    options?.fibre_g ?? estimated.fibre_g,
    options?.meal_type ?? detectMealType(description),
    loggedAt,
  );

  return {
    id,
    description: cleanDesc,
    logged_at: loggedAt,
    meal_type: options?.meal_type ?? detectMealType(description),
    matchedFoods: estimated.matchedFoods,
    estimated: estimated.estimated,
    calories: options?.calories ?? estimated.calories,
    protein_g: options?.protein_g ?? estimated.protein_g,
    carbs_g: options?.carbs_g ?? estimated.carbs_g,
    fat_g: options?.fat_g ?? estimated.fat_g,
    fibre_g: options?.fibre_g ?? estimated.fibre_g,
  };
}

export function logWeightFromChat(userId: string, message: string, timeZone?: string): { logged: boolean; weight_kg?: number } {
  const match = message.match(/(\d+(?:\.\d+)?)\s*kg/i);
  if (!match) return { logged: false };
  const weight_kg = parseFloat(match[1]);
  const result = saveWeight(userId, weight_kg, {
    notes: 'Logged via AI Coach',
    recorded_at: parseMealDate(message, timeZone),
    timeZone,
  });
  return { logged: true, weight_kg: result.weight_kg };
}

export function isWeightLogIntent(message: string): boolean {
  const lower = message.toLowerCase();
  return (lower.includes('log') || lower.includes('weight')) && /\d+(?:\.\d+)?\s*kg/.test(lower);
}

export function isMealDeleteIntent(message: string): boolean {
  const lower = message.toLowerCase().trim();
  return /\b(unlog|remove|delete|undo|cancel)\b/.test(lower) &&
    /\b(meal|meals|breakfast|lunch|dinner|snack|log|logged|ate|had)\b/.test(lower);
}

export function deleteMealById(userId: string, mealId: string): boolean {
  const result = db.prepare(`DELETE FROM meals WHERE id = ? AND user_id = ?`).run(mealId, userId);
  return result.changes > 0;
}

/** Delete meals matching a chat command — returns deleted meal descriptions */
export function deleteMealsFromChat(userId: string, message: string, timeZone?: string): { deleted: { id: string; description: string; logged_at: string }[] } {
  const tz = normalizeTimezone(timeZone);
  const lower = message.toLowerCase();
  const deleted: { id: string; description: string; logged_at: string }[] = [];

  if (/\b(last|latest|recent)\s*meal\b/.test(lower) || lower.includes('last meal') || lower.includes('what i just logged')) {
    const meal = db.prepare(`SELECT id, description, logged_at FROM meals WHERE user_id = ? ORDER BY logged_at DESC LIMIT 1`).get(userId) as { id: string; description: string; logged_at: string } | undefined;
    if (meal && deleteMealById(userId, meal.id)) deleted.push(meal);
    return { deleted };
  }

  const today = todayInTz(tz);
  let mealType: string | null = null;
  if (lower.includes('breakfast')) mealType = 'breakfast';
  else if (lower.includes('lunch')) mealType = 'lunch';
  else if (lower.includes('dinner')) mealType = 'dinner';
  else if (lower.includes('snack')) mealType = 'snack';

  const dateFilter = lower.includes('yesterday')
    ? addDaysToLocalDate(today, -1)
    : lower.includes('today') || mealType ? today : null;

  // Match food keyword in message
  const foodKeywords = ['weet', 'bix', 'chicken', 'rice', 'egg', 'milk', 'protein', 'banana', 'bread', 'pasta', 'beef', 'salmon', 'oats'];
  const keyword = foodKeywords.find(k => lower.includes(k));

  let query = `SELECT id, description, logged_at FROM meals WHERE user_id = ?`;
  const params: unknown[] = [userId];

  if (dateFilter) {
    query += ` AND date(logged_at) = ?`;
    params.push(dateFilter);
  }
  if (mealType) {
    query += ` AND meal_type = ?`;
    params.push(mealType);
  }
  if (keyword) {
    query += ` AND LOWER(description) LIKE ?`;
    params.push(`%${keyword}%`);
  }

  query += ` ORDER BY logged_at DESC LIMIT 5`;
  const candidates = db.prepare(query).all(...params) as { id: string; description: string; logged_at: string }[];

  if (candidates.length === 0) {
    // Fallback: delete most recent meal if generic "remove meal"
    const latest = db.prepare(`SELECT id, description, logged_at FROM meals WHERE user_id = ? ORDER BY logged_at DESC LIMIT 1`).get(userId) as { id: string; description: string; logged_at: string } | undefined;
    if (latest && deleteMealById(userId, latest.id)) deleted.push(latest);
  } else {
    for (const meal of candidates) {
      if (deleteMealById(userId, meal.id)) deleted.push(meal);
      if (!keyword && !mealType) break; // generic delete only removes one
    }
  }

  return { deleted };
}
