import { db } from '../../db/database.js';

export interface EffectiveTargets {
  weightKg: number | null;
  calories: number | null;
  protein: number | null;
  carbs: number | null;
  fat: number | null;
  water_ml: number;
  configured: boolean;
}

export function getEffectiveTargets(userId: string): EffectiveTargets {
  const profile = db.prepare(`SELECT * FROM user_profile WHERE user_id = ?`).get(userId) as Record<string, number> | undefined;
  const weightRow = db.prepare(`SELECT weight_kg FROM weight_entries WHERE user_id = ? ORDER BY recorded_at DESC LIMIT 1`).get(userId) as { weight_kg: number } | undefined;
  const weightKg = weightRow?.weight_kg ?? profile?.target_weight_kg ?? null;

  if (!weightKg) {
    return {
      weightKg: null,
      calories: profile?.target_calories ?? null,
      protein: profile?.target_protein_g ?? null,
      carbs: profile?.target_carbs_g ?? null,
      fat: profile?.target_fat_g ?? null,
      water_ml: profile?.target_water_ml ?? 3000,
      configured: !!(profile?.target_calories && profile?.target_protein_g),
    };
  }

  return {
    weightKg,
    calories: profile?.target_calories ?? Math.round(weightKg * 33),
    protein: profile?.target_protein_g ?? Math.round(weightKg * 2),
    carbs: profile?.target_carbs_g ?? Math.round(weightKg * 4),
    fat: profile?.target_fat_g ?? Math.round(weightKg * 1),
    water_ml: profile?.target_water_ml ?? 3000,
    configured: true,
  };
}

export function applyDefaultProfileTargets(userId: string, weightKg: number) {
  const profile = db.prepare(`SELECT target_calories, target_protein_g FROM user_profile WHERE user_id = ?`).get(userId) as Record<string, number> | undefined;
  if (!profile?.target_calories || !profile?.target_protein_g) {
    db.prepare(`
      UPDATE user_profile SET
        target_calories = COALESCE(target_calories, ?),
        target_protein_g = COALESCE(target_protein_g, ?),
        target_carbs_g = COALESCE(target_carbs_g, ?),
        target_fat_g = COALESCE(target_fat_g, ?),
        target_weight_kg = COALESCE(target_weight_kg, ?),
        updated_at = datetime('now')
      WHERE user_id = ?
    `).run(
      Math.round(weightKg * 33),
      Math.round(weightKg * 2),
      Math.round(weightKg * 4),
      Math.round(weightKg * 1),
      weightKg,
      userId,
    );
  }
}

export function parseProfileRow(row: Record<string, unknown> | undefined) {
  if (!row) return null;
  return {
    ...row,
    dietary_restrictions: JSON.parse((row.dietary_restrictions as string) || '[]'),
    favorite_foods: JSON.parse((row.favorite_foods as string) || '[]'),
    preferences: JSON.parse((row.preferences as string) || '{}'),
  };
}
