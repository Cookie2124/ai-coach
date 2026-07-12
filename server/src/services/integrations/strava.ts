import { refreshTokenIfNeeded, setSyncStatus } from './base.js';
import { refreshOAuthToken } from './oauth.js';
import { db } from '../../db/database.js';
import { generateId } from '../../types/index.js';

function mapStravaType(type: string): string {
  const map: Record<string, string> = {
    Run: 'running', Ride: 'cycling', Walk: 'walking', WeightTraining: 'weightlifting',
    Swim: 'swimming', Workout: 'gym', Rugby: 'rugby',
  };
  return map[type] ?? 'other';
}

export async function syncStrava(userId: string) {
  setSyncStatus(userId, 'strava', 'syncing');
  try {
    const token = await refreshTokenIfNeeded(userId, 'strava', (rt) => refreshOAuthToken('strava', rt));
    const after = Math.floor((Date.now() - 30 * 86400000) / 1000);
    const url = `https://www.strava.com/api/v3/athlete/activities?after=${after}&per_page=50`;

    const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!response.ok) throw new Error(`Strava API error: ${response.status}`);

    const activities = await response.json() as { id: number; name: string; type: string; start_date: string; elapsed_time: number; distance: number; average_heartrate?: number; max_heartrate?: number; kilojoules?: number }[];
    let imported = 0;

    for (const act of activities) {
      const date = act.start_date.split('T')[0];
      const existing = db.prepare(`SELECT id FROM workouts WHERE user_id = ? AND source = 'strava' AND raw_data LIKE ?`).get(userId, `%"id":${act.id}%`);
      if (existing) continue;

      db.prepare(`
        INSERT INTO workouts (id, user_id, date, activity_type, duration_minutes, calories, distance_km, avg_hr, max_hr, notes, source, raw_data)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'strava', ?)
      `).run(
        generateId(), userId, date, mapStravaType(act.type),
        Math.round(act.elapsed_time / 60),
        act.kilojoules ? Math.round(act.kilojoules / 4.184) : null,
        act.distance ? act.distance / 1000 : null,
        act.average_heartrate, act.max_heartrate,
        act.name, JSON.stringify(act),
      );
      imported++;
    }

    setSyncStatus(userId, 'strava', 'success');
    return { activities: imported };
  } catch (e) {
    setSyncStatus(userId, 'strava', 'error');
    throw e;
  }
}
