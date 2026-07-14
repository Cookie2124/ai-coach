import { db } from '../../db/database.js';
import { generateId } from '../../types/index.js';
import { currentLocalLoggedAt, localLoggedAt, normalizeTimezone } from '../../utils/timezone.js';

export function resolveWeightRecordedAt(
  timeZone: string,
  options?: { recorded_at?: string; date?: string; time?: string },
): string {
  if (options?.recorded_at) return options.recorded_at;
  const tz = normalizeTimezone(timeZone);
  if (options?.date) {
    const parts = options.time?.match(/^(\d{1,2}):(\d{2})$/);
    const hour = parts ? parseInt(parts[1], 10) : 12;
    const minute = parts ? parseInt(parts[2], 10) : 0;
    return localLoggedAt(options.date, hour, minute);
  }
  return currentLocalLoggedAt(tz);
}

export function logWeight(
  userId: string,
  weight_kg: number,
  options?: {
    body_fat_pct?: number;
    notes?: string;
    recorded_at?: string;
    date?: string;
    time?: string;
    timeZone?: string;
  },
) {
  if (!weight_kg || weight_kg <= 0 || weight_kg > 500) {
    throw new Error('Enter a valid weight in kg');
  }

  const id = generateId();
  const recorded_at = resolveWeightRecordedAt(options?.timeZone ?? 'Australia/Sydney', options);
  const notes = options?.notes?.trim() || 'Logged in app';

  db.prepare(`
    INSERT INTO weight_entries (id, user_id, weight_kg, body_fat_pct, notes, recorded_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(id, userId, weight_kg, options?.body_fat_pct ?? null, notes, recorded_at);

  return { id, weight_kg, body_fat_pct: options?.body_fat_pct ?? null, notes, recorded_at };
}

export function getWeightHistory(userId: string, limit = 30) {
  return db.prepare(`
    SELECT id, weight_kg, body_fat_pct, notes, recorded_at
    FROM weight_entries WHERE user_id = ?
    ORDER BY recorded_at DESC LIMIT ?
  `).all(userId, limit) as {
    id: string;
    weight_kg: number;
    body_fat_pct: number | null;
    notes: string | null;
    recorded_at: string;
  }[];
}
