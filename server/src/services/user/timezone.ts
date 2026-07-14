import { db } from '../../db/database.js';
import { normalizeTimezone, isValidTimezone } from '../../utils/timezone.js';
import { parseProfileRow } from '../analytics/profile.js';

export function getStoredUserTimezone(userId: string): string {
  const row = db.prepare(`SELECT preferences FROM user_profile WHERE user_id = ?`).get(userId) as { preferences?: string } | undefined;
  const profile = parseProfileRow(row as Record<string, unknown> | undefined);
  const tz = (profile?.preferences as { timezone?: string } | undefined)?.timezone;
  return normalizeTimezone(tz);
}

export function saveUserTimezone(userId: string, timezone: string) {
  if (!isValidTimezone(timezone)) return;
  const row = db.prepare(`SELECT preferences FROM user_profile WHERE user_id = ?`).get(userId) as { preferences?: string } | undefined;
  const profile = parseProfileRow(row as Record<string, unknown> | undefined);
  const prefs = { ...(profile?.preferences as Record<string, unknown> ?? {}), timezone };
  db.prepare(`UPDATE user_profile SET preferences = ?, updated_at = datetime('now') WHERE user_id = ?`)
    .run(JSON.stringify(prefs), userId);
}

/** Header timezone wins; persist when it changes */
export function resolveUserTimezone(userId: string, headerTz?: string | null): string {
  const fromHeader = headerTz && isValidTimezone(headerTz) ? headerTz : null;
  const stored = getStoredUserTimezone(userId);
  const resolved = fromHeader ?? stored;
  if (fromHeader && fromHeader !== stored) {
    saveUserTimezone(userId, fromHeader);
  }
  return resolved;
}
