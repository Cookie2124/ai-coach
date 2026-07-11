import { db } from '../../db/database.js';
import { generateId } from '../../types/index.js';

const WHOOP_API = 'https://api.prod.whoop.com/developer/v1';

interface WhoopCredentials {
  access_token: string;
  refresh_token?: string;
}

async function whoopFetch(endpoint: string, token: string) {
  const response = await fetch(`${WHOOP_API}${endpoint}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) throw new Error(`WHOOP API error: ${response.status}`);
  return response.json();
}

function mapActivityType(sportName: string): string {
  const lower = sportName.toLowerCase();
  if (lower.includes('rugby')) return 'rugby';
  if (lower.includes('run')) return 'running';
  if (lower.includes('cycle') || lower.includes('bike')) return 'cycling';
  if (lower.includes('walk')) return 'walking';
  if (lower.includes('weight') || lower.includes('strength')) return 'weightlifting';
  if (lower.includes('swim')) return 'swimming';
  return 'other';
}

export async function syncWhoopData(userId: string) {
  const integration = db.prepare(`SELECT credentials FROM integrations WHERE user_id = ? AND provider = 'whoop'`).get(userId) as { credentials: string } | undefined;
  if (!integration) throw new Error('WHOOP not configured');

  const creds: WhoopCredentials = JSON.parse(integration.credentials);
  if (!creds.access_token) throw new Error('WHOOP access token missing');

  db.prepare(`UPDATE integrations SET sync_status = 'syncing' WHERE user_id = ? AND provider = 'whoop'`).run(userId);

  let imported = { recovery: 0, sleep: 0, workouts: 0 };

  try {
    const end = new Date().toISOString();
    const start = new Date(Date.now() - 30 * 86400000).toISOString();

    try {
      const cycles = await whoopFetch(`/cycle?start=${start}&end=${end}`, creds.access_token) as { records: Record<string, unknown>[] };
      for (const cycle of cycles.records ?? []) {
        const c = cycle as { id: number; start: string; score: { strain: number; kilojoule: number }; recovery: { score: { recovery_score: number; resting_heart_rate: number; hrv_rmssd_milli: number; spo2_percentage: number; skin_temp_celsius: number } } };
        const date = c.start?.split('T')[0];
        if (!date) continue;

        const id = generateId();
        db.prepare(`
          INSERT INTO recovery_entries (id, user_id, date, recovery_score, hrv_ms, resting_hr, strain, calories_burned, source, raw_data)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'whoop', ?)
          ON CONFLICT(user_id, date, source) DO UPDATE SET
            recovery_score=excluded.recovery_score, hrv_ms=excluded.hrv_ms,
            resting_hr=excluded.resting_hr, strain=excluded.strain,
            calories_burned=excluded.calories_burned, raw_data=excluded.raw_data
        `).run(id, userId, date,
          c.recovery?.score?.recovery_score,
          c.recovery?.score?.hrv_rmssd_milli,
          c.recovery?.score?.resting_heart_rate,
          c.score?.strain,
          c.score?.kilojoule ? Math.round(c.score.kilojoule / 4.184) : null,
          JSON.stringify(c));
        imported.recovery++;
      }
    } catch (e) { console.warn('WHOOP cycles sync partial:', e); }

    try {
      const sleep = await whoopFetch(`/activity/sleep?start=${start}&end=${end}`, creds.access_token) as { records: Record<string, unknown>[] };
      for (const s of sleep.records ?? []) {
        const sl = s as { start: string; score: { stage_summary: { total_in_bed_time_milli: number; total_awake_time_milli: number; total_light_sleep_time_milli: number; total_slow_wave_sleep_time_milli: number; total_rem_sleep_time_milli: number }; sleep_performance_percentage: number; sleep_consistency_percentage: number; sleep_efficiency_percentage: number } };
        const date = sl.start?.split('T')[0];
        if (!date) continue;

        const totalMs = sl.score?.stage_summary?.total_in_bed_time_milli ?? 0;
        const id = generateId();
        db.prepare(`
          INSERT INTO sleep_entries (id, user_id, date, duration_hours, performance_pct, consistency_pct, efficiency_pct,
            deep_sleep_hours, rem_sleep_hours, light_sleep_hours, awake_hours, source, raw_data)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'whoop', ?)
          ON CONFLICT(user_id, date, source) DO UPDATE SET
            duration_hours=excluded.duration_hours, performance_pct=excluded.performance_pct,
            consistency_pct=excluded.consistency_pct, efficiency_pct=excluded.efficiency_pct,
            deep_sleep_hours=excluded.deep_sleep_hours, rem_sleep_hours=excluded.rem_sleep_hours,
            light_sleep_hours=excluded.light_sleep_hours, awake_hours=excluded.awake_hours,
            raw_data=excluded.raw_data
        `).run(id, userId, date,
          totalMs / 3600000,
          sl.score?.sleep_performance_percentage,
          sl.score?.sleep_consistency_percentage,
          sl.score?.sleep_efficiency_percentage,
          (sl.score?.stage_summary?.total_slow_wave_sleep_time_milli ?? 0) / 3600000,
          (sl.score?.stage_summary?.total_rem_sleep_time_milli ?? 0) / 3600000,
          (sl.score?.stage_summary?.total_light_sleep_time_milli ?? 0) / 3600000,
          (sl.score?.stage_summary?.total_awake_time_milli ?? 0) / 3600000,
          JSON.stringify(sl));
        imported.sleep++;
      }
    } catch (e) { console.warn('WHOOP sleep sync partial:', e); }

    try {
      const workouts = await whoopFetch(`/activity/workout?start=${start}&end=${end}`, creds.access_token) as { records: Record<string, unknown>[] };
      for (const w of workouts.records ?? []) {
        const wo = w as { start: string; sport_name: string; score: { strain: number; average_heart_rate: number; max_heart_rate: number; kilojoule: number; distance_meter?: number }; end: string };
        const date = wo.start?.split('T')[0];
        if (!date) continue;

        const durationMin = wo.end && wo.start
          ? Math.round((new Date(wo.end).getTime() - new Date(wo.start).getTime()) / 60000)
          : null;

        const id = generateId();
        db.prepare(`
          INSERT INTO workouts (id, user_id, date, activity_type, duration_minutes, strain, calories, distance_km, avg_hr, max_hr, source, raw_data)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'whoop', ?)
        `).run(id, userId, date,
          mapActivityType(wo.sport_name ?? 'other'),
          durationMin,
          wo.score?.strain,
          wo.score?.kilojoule ? Math.round(wo.score.kilojoule / 4.184) : null,
          wo.score?.distance_meter ? wo.score.distance_meter / 1000 : null,
          wo.score?.average_heart_rate,
          wo.score?.max_heart_rate,
          JSON.stringify(wo));
        imported.workouts++;
      }
    } catch (e) { console.warn('WHOOP workouts sync partial:', e); }

    db.prepare(`UPDATE integrations SET sync_status = 'success', last_sync = datetime('now') WHERE user_id = ? AND provider = 'whoop'`).run(userId);
  } catch (error) {
    db.prepare(`UPDATE integrations SET sync_status = 'error' WHERE user_id = ? AND provider = 'whoop'`).run(userId);
    throw error;
  }

  return imported;
}

export function importWhoopManualData(userId: string, data: {
  recovery?: { date: string; recovery_score: number; hrv_ms?: number; resting_hr?: number; strain?: number }[];
  sleep?: { date: string; duration_hours: number; performance_pct?: number; efficiency_pct?: number }[];
  workouts?: { date: string; activity_type: string; duration_minutes?: number; strain?: number }[];
}) {
  let imported = { recovery: 0, sleep: 0, workouts: 0 };

  for (const r of data.recovery ?? []) {
    db.prepare(`
      INSERT INTO recovery_entries (id, user_id, date, recovery_score, hrv_ms, resting_hr, strain, source)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'whoop')
      ON CONFLICT(user_id, date, source) DO UPDATE SET recovery_score=excluded.recovery_score, hrv_ms=excluded.hrv_ms, resting_hr=excluded.resting_hr, strain=excluded.strain
    `).run(generateId(), userId, r.date, r.recovery_score, r.hrv_ms, r.resting_hr, r.strain);
    imported.recovery++;
  }

  for (const s of data.sleep ?? []) {
    db.prepare(`
      INSERT INTO sleep_entries (id, user_id, date, duration_hours, performance_pct, efficiency_pct, source)
      VALUES (?, ?, ?, ?, ?, ?, 'whoop')
      ON CONFLICT(user_id, date, source) DO UPDATE SET duration_hours=excluded.duration_hours, performance_pct=excluded.performance_pct
    `).run(generateId(), userId, s.date, s.duration_hours, s.performance_pct, s.efficiency_pct);
    imported.sleep++;
  }

  for (const w of data.workouts ?? []) {
    db.prepare(`
      INSERT INTO workouts (id, user_id, date, activity_type, duration_minutes, strain, source)
      VALUES (?, ?, ?, ?, ?, ?, 'whoop')
    `).run(generateId(), userId, w.date, w.activity_type, w.duration_minutes, w.strain);
    imported.workouts++;
  }

  return imported;
}

export function getIntegrationStatus(userId: string) {
  return db.prepare(`SELECT provider, enabled, last_sync, sync_status FROM integrations WHERE user_id = ?`).all(userId);
}

export function configureIntegration(userId: string, provider: string, credentials: Record<string, unknown>, enabled = true) {
  const id = generateId();
  db.prepare(`
    INSERT INTO integrations (id, user_id, provider, enabled, credentials)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(user_id, provider) DO UPDATE SET enabled=excluded.enabled, credentials=excluded.credentials
  `).run(id, userId, provider, enabled ? 1 : 0, JSON.stringify(credentials));
}
