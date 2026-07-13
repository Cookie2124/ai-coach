import { db } from '../../db/database.js';
import { generateId } from '../../types/index.js';
import { getCredentials, refreshTokenIfNeeded, setSyncStatus, saveIntegration, getIntegration } from './base.js';
import { refreshOAuthToken } from './oauth.js';
import { applyDefaultProfileTargets } from '../analytics/profile.js';

const WHOOP_API = 'https://api.prod.whoop.com/developer/v2';
/** WHOOP launched ~2015 — fetch everything from before membership could exist */
const WHOOP_HISTORY_START = '2014-01-01T00:00:00.000Z';
const INCREMENTAL_SYNC_DAYS = 30;
const FULL_SYNC_CHUNK_DAYS = 180;

export interface WhoopSyncOptions {
  /** Import all historical data from account creation to now */
  fullHistory?: boolean;
  /** Days back for incremental sync (default 30) */
  days?: number;
}

interface WhoopPage<T> {
  records?: T[];
  next_token?: string;
}

interface ImportCounts {
  recovery: number;
  sleep: number;
  workouts: number;
  weight: number;
  cycles: number;
}

async function getWhoopToken(userId: string, forceRefresh = false): Promise<string> {
  if (forceRefresh) {
    const creds = getCredentials(userId, 'whoop');
    if (!creds.refresh_token) {
      throw new Error('WHOOP access token expired — disconnect and reconnect on Integrations.');
    }
    const newCreds = await refreshOAuthToken('whoop', creds.refresh_token as string, creds.refresh_token as string);
    const merged = { ...creds, ...newCreds, refresh_token: newCreds.refresh_token ?? creds.refresh_token };
    const existing = getIntegration(userId, 'whoop');
    const prevConfig = existing?.config ? JSON.parse(existing.config) : {};
    saveIntegration(userId, 'whoop', merged, prevConfig, true);
    return merged.access_token as string;
  }
  return refreshTokenIfNeeded(userId, 'whoop', (rt) => refreshOAuthToken('whoop', rt, rt));
}

function saveWhoopSyncMeta(userId: string, meta: Record<string, unknown>) {
  const existing = getIntegration(userId, 'whoop');
  const creds = getCredentials(userId, 'whoop');
  const prevConfig = existing?.config ? JSON.parse(existing.config) : {};
  const nextConfig = { ...prevConfig, ...meta };
  if (meta.last_sync_error === null) {
    delete nextConfig.last_sync_error;
  }
  saveIntegration(userId, 'whoop', creds, nextConfig, true);
}

async function whoopFetch<T = unknown>(endpoint: string, token: string, userId?: string): Promise<T> {
  const response = await fetch(`${WHOOP_API}${endpoint}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (response.status === 401 && userId) {
    const freshToken = await getWhoopToken(userId, true);
    return whoopFetch<T>(endpoint, freshToken);
  }
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`WHOOP API ${response.status}: ${body}`);
  }
  return response.json() as Promise<T>;
}

async function whoopFetchAll<T>(path: string, token: string, params: Record<string, string>, userId: string): Promise<T[]> {
  const records: T[] = [];
  let nextToken: string | undefined;
  let activeToken = token;

  do {
    const qs = new URLSearchParams({ ...params, limit: '25', ...(nextToken ? { nextToken } : {}) });
    try {
      const page = await whoopFetch<WhoopPage<T>>(`${path}?${qs}`, activeToken, userId);
      records.push(...(page.records ?? []));
      nextToken = page.next_token;
    } catch (e) {
      if ((e as Error).message.includes('401') && userId) {
        activeToken = await getWhoopToken(userId, true);
        const page = await whoopFetch<WhoopPage<T>>(`${path}?${qs}`, activeToken, userId);
        records.push(...(page.records ?? []));
        nextToken = page.next_token;
      } else {
        throw e;
      }
    }
  } while (nextToken);

  return records;
}

function mapActivityType(sportName: string): string {
  const lower = (sportName ?? '').toLowerCase();
  if (lower.includes('rugby')) return 'rugby';
  if (lower.includes('run')) return 'running';
  if (lower.includes('cycle') || lower.includes('bike')) return 'cycling';
  if (lower.includes('walk')) return 'walking';
  if (lower.includes('weight') || lower.includes('strength')) return 'weightlifting';
  if (lower.includes('swim')) return 'swimming';
  return 'other';
}

function upsertWhoopRecovery(userId: string, date: string, fields: {
  recovery_score?: number | null;
  hrv_ms?: number | null;
  resting_hr?: number | null;
  respiratory_rate?: number | null;
  strain?: number | null;
  calories_burned?: number | null;
  stress_score?: number | null;
  spo2_pct?: number | null;
  skin_temp_c?: number | null;
  raw_data?: string;
}) {
  db.prepare(`
    INSERT INTO recovery_entries (id, user_id, date, recovery_score, hrv_ms, resting_hr, respiratory_rate, strain, calories_burned, stress_score, spo2_pct, skin_temp_c, source, raw_data)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'whoop', ?)
    ON CONFLICT(user_id, date, source) DO UPDATE SET
      recovery_score=COALESCE(excluded.recovery_score, recovery_score),
      hrv_ms=COALESCE(excluded.hrv_ms, hrv_ms),
      resting_hr=COALESCE(excluded.resting_hr, resting_hr),
      respiratory_rate=COALESCE(excluded.respiratory_rate, respiratory_rate),
      strain=COALESCE(excluded.strain, strain),
      calories_burned=COALESCE(excluded.calories_burned, calories_burned),
      stress_score=COALESCE(excluded.stress_score, stress_score),
      spo2_pct=COALESCE(excluded.spo2_pct, spo2_pct),
      skin_temp_c=COALESCE(excluded.skin_temp_c, skin_temp_c),
      raw_data=COALESCE(excluded.raw_data, raw_data)
  `).run(
    generateId(), userId, date,
    fields.recovery_score ?? null,
    fields.hrv_ms ?? null,
    fields.resting_hr ?? null,
    fields.respiratory_rate ?? null,
    fields.strain ?? null,
    fields.calories_burned ?? null,
    fields.stress_score ?? null,
    fields.spo2_pct ?? null,
    fields.skin_temp_c ?? null,
    fields.raw_data ?? '{}',
  );
}

/** WHOOP has no public stress API — estimate from recovery, strain, and HRV vs baseline. */
export function estimateWhoopStressScore(
  recovery: number | null,
  strain: number | null,
  hrv: number | null,
  avgHrv: number | null,
): number | null {
  if (recovery == null && strain == null) return null;
  let score = 0;
  let weight = 0;
  if (recovery != null) {
    score += (100 - recovery) * 0.45;
    weight += 0.45;
  }
  if (strain != null) {
    score += Math.min(100, strain * 7.5) * 0.35;
    weight += 0.35;
  }
  if (hrv != null && avgHrv != null && avgHrv > 0) {
    const ratio = hrv / avgHrv;
    score += Math.min(100, Math.max(0, (1.15 - ratio) * 80)) * 0.2;
    weight += 0.2;
  }
  return weight > 0 ? Math.round(Math.min(100, Math.max(0, score / weight))) : null;
}

function getUserAvgHrv(userId: string): number | null {
  const row = db.prepare(`
    SELECT AVG(hrv_ms) as avg FROM recovery_entries
    WHERE user_id = ? AND source = 'whoop' AND hrv_ms IS NOT NULL AND hrv_ms > 0
  `).get(userId) as { avg: number | null } | undefined;
  return row?.avg ?? null;
}

function upsertWhoopWorkout(userId: string, wo: {
  id: string;
  start: string;
  end: string;
  sport_name: string;
  score?: {
    strain: number;
    average_heart_rate: number;
    max_heart_rate: number;
    kilojoule: number;
    distance_meter?: number;
  };
}) {
  const date = wo.start?.split('T')[0];
  if (!date) return false;

  const durationMin = wo.end && wo.start
    ? Math.round((new Date(wo.end).getTime() - new Date(wo.start).getTime()) / 60000)
    : null;

  const existing = db.prepare(`
    SELECT id FROM workouts WHERE user_id = ? AND source = 'whoop'
    AND (raw_data LIKE ? OR raw_data LIKE ?)
  `).get(userId, `%"id":"${wo.id}"%`, `%"id": "${wo.id}"%`) as { id: string } | undefined;

  const payload = JSON.stringify(wo);

  if (existing) {
    db.prepare(`
      UPDATE workouts SET date=?, activity_type=?, duration_minutes=?, strain=?, calories=?, distance_km=?,
        avg_hr=?, max_hr=?, notes=?, raw_data=? WHERE id=?
    `).run(
      date, mapActivityType(wo.sport_name), durationMin,
      wo.score?.strain ?? null,
      wo.score?.kilojoule ? Math.round(wo.score.kilojoule / 4.184) : null,
      wo.score?.distance_meter ? wo.score.distance_meter / 1000 : null,
      wo.score?.average_heart_rate ?? null,
      wo.score?.max_heart_rate ?? null,
      wo.sport_name, payload, existing.id,
    );
    return false;
  }

  db.prepare(`
    INSERT INTO workouts (id, user_id, date, activity_type, duration_minutes, strain, calories, distance_km, avg_hr, max_hr, notes, source, raw_data)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'whoop', ?)
  `).run(
    generateId(), userId, date, mapActivityType(wo.sport_name), durationMin,
    wo.score?.strain ?? null,
    wo.score?.kilojoule ? Math.round(wo.score.kilojoule / 4.184) : null,
    wo.score?.distance_meter ? wo.score.distance_meter / 1000 : null,
    wo.score?.average_heart_rate ?? null,
    wo.score?.max_heart_rate ?? null,
    wo.sport_name, payload,
  );
  return true;
}

async function syncWhoopDateRange(
  userId: string,
  token: string,
  start: string,
  end: string,
  imported: ImportCounts,
  errors: string[],
  cycleDateMap: Map<number, string>,
) {
  const range = { start, end };
  const avgHrv = getUserAvgHrv(userId);

  try {
    const cycles = await whoopFetchAll<{ id: number; start: string; score?: { strain: number; kilojoule: number } }>(
      '/cycle', token, range, userId,
    );
    for (const c of cycles) {
      const date = c.start?.split('T')[0];
      if (!date) continue;
      cycleDateMap.set(c.id, date);
      upsertWhoopRecovery(userId, date, {
        strain: c.score?.strain ?? null,
        calories_burned: c.score?.kilojoule ? Math.round(c.score.kilojoule / 4.184) : null,
        raw_data: JSON.stringify(c),
      });
      // Recompute stress when strain arrives (recovery may have synced first)
      const row = db.prepare(`
        SELECT recovery_score, hrv_ms, strain FROM recovery_entries WHERE user_id = ? AND date = ? AND source = 'whoop'
      `).get(userId, date) as { recovery_score: number | null; hrv_ms: number | null; strain: number | null } | undefined;
      if (row?.recovery_score != null || c.score?.strain != null) {
        const stress = estimateWhoopStressScore(row?.recovery_score ?? null, c.score?.strain ?? null, row?.hrv_ms ?? null, avgHrv);
        if (stress != null) {
          db.prepare(`UPDATE recovery_entries SET stress_score = ? WHERE user_id = ? AND date = ? AND source = 'whoop'`)
            .run(stress, userId, date);
        }
      }
      imported.cycles++;
    }
  } catch (e) {
    errors.push(`cycles: ${(e as Error).message}`);
  }

  try {
    const recoveries = await whoopFetchAll<{
      cycle_id: number;
      created_at: string;
      score_state: string;
      score?: {
        recovery_score: number;
        resting_heart_rate: number;
        hrv_rmssd_milli: number;
        spo2_percentage?: number;
        skin_temp_celsius?: number;
      };
    }>('/recovery', token, range, userId);

    for (const rec of recoveries) {
      if (rec.score_state !== 'SCORED' || !rec.score) continue;
      const date = cycleDateMap.get(rec.cycle_id) ?? rec.created_at?.split('T')[0];
      if (!date) continue;

      const existing = db.prepare(`
        SELECT strain FROM recovery_entries WHERE user_id = ? AND date = ? AND source = 'whoop'
      `).get(userId, date) as { strain: number | null } | undefined;

      const strain = existing?.strain ?? null;
      const stress = estimateWhoopStressScore(
        rec.score.recovery_score,
        strain,
        rec.score.hrv_rmssd_milli,
        avgHrv,
      );

      upsertWhoopRecovery(userId, date, {
        recovery_score: rec.score.recovery_score,
        hrv_ms: rec.score.hrv_rmssd_milli,
        resting_hr: rec.score.resting_heart_rate,
        spo2_pct: rec.score.spo2_percentage ?? null,
        skin_temp_c: rec.score.skin_temp_celsius ?? null,
        stress_score: stress,
        raw_data: JSON.stringify(rec),
      });
      imported.recovery++;
    }
  } catch (e) {
    errors.push(`recovery: ${(e as Error).message}`);
  }

  try {
    const sleeps = await whoopFetchAll<{
      id: string;
      start: string;
      score_state: string;
      score?: {
        stage_summary: {
          total_in_bed_time_milli: number;
          total_awake_time_milli: number;
          total_light_sleep_time_milli: number;
          total_slow_wave_sleep_time_milli: number;
          total_rem_sleep_time_milli: number;
        };
        sleep_performance_percentage: number;
        sleep_consistency_percentage: number;
        sleep_efficiency_percentage: number;
        respiratory_rate?: number;
      };
    }>('/activity/sleep', token, range, userId);

    for (const sl of sleeps) {
      if (sl.score_state !== 'SCORED' || !sl.score) continue;
      const date = sl.start?.split('T')[0];
      if (!date) continue;

      const totalMs = sl.score.stage_summary?.total_in_bed_time_milli ?? 0;
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
      `).run(generateId(), userId, date,
        totalMs / 3600000,
        sl.score.sleep_performance_percentage,
        sl.score.sleep_consistency_percentage,
        sl.score.sleep_efficiency_percentage,
        (sl.score.stage_summary?.total_slow_wave_sleep_time_milli ?? 0) / 3600000,
        (sl.score.stage_summary?.total_rem_sleep_time_milli ?? 0) / 3600000,
        (sl.score.stage_summary?.total_light_sleep_time_milli ?? 0) / 3600000,
        (sl.score.stage_summary?.total_awake_time_milli ?? 0) / 3600000,
        JSON.stringify(sl));

      if (sl.score.respiratory_rate) {
        upsertWhoopRecovery(userId, date, { respiratory_rate: sl.score.respiratory_rate });
      }
      imported.sleep++;
    }
  } catch (e) {
    errors.push(`sleep: ${(e as Error).message}`);
  }

  try {
    const workouts = await whoopFetchAll<{
      id: string;
      start: string;
      end: string;
      sport_name: string;
      score_state: string;
      score?: {
        strain: number;
        average_heart_rate: number;
        max_heart_rate: number;
        kilojoule: number;
        distance_meter?: number;
      };
    }>('/activity/workout', token, range, userId);

    for (const wo of workouts) {
      if (wo.score_state !== 'SCORED') continue;
      if (upsertWhoopWorkout(userId, wo)) imported.workouts++;
    }
  } catch (e) {
    errors.push(`workouts: ${(e as Error).message}`);
  }
}

export function getWhoopDataStats(userId: string) {
  const recovery = db.prepare(`
    SELECT COUNT(*) as c, MIN(date) as earliest, MAX(date) as latest FROM recovery_entries WHERE user_id = ? AND source = 'whoop'
  `).get(userId) as { c: number; earliest: string; latest: string };
  const sleep = db.prepare(`
    SELECT COUNT(*) as c, MIN(date) as earliest, MAX(date) as latest FROM sleep_entries WHERE user_id = ? AND source = 'whoop'
  `).get(userId) as { c: number; earliest: string; latest: string };
  const workouts = db.prepare(`
    SELECT COUNT(*) as c, MIN(date) as earliest, MAX(date) as latest FROM workouts WHERE user_id = ? AND source = 'whoop'
  `).get(userId) as { c: number; earliest: string; latest: string };

  const integration = getIntegration(userId, 'whoop');
  const config = integration?.config ? JSON.parse(integration.config) : {};

  return { recovery, sleep, workouts, config };
}

export async function syncWhoopData(userId: string, options?: WhoopSyncOptions) {
  const creds = getCredentials(userId, 'whoop');
  if (!creds.access_token) throw new Error('WHOOP not connected. Click Connect on the Integrations page.');

  const fullHistory = options?.fullHistory ?? false;
  setSyncStatus(userId, 'whoop', fullHistory ? 'syncing-full' : 'syncing');

  const imported: ImportCounts = { recovery: 0, sleep: 0, workouts: 0, weight: 0, cycles: 0 };
  const errors: string[] = [];
  const cycleDateMap = new Map<number, string>();

  try {
    const token = await getWhoopToken(userId);
    const end = new Date().toISOString();

    if (fullHistory) {
      let cursor = new Date(WHOOP_HISTORY_START);
      const endDate = new Date();
      let chunkIndex = 0;

      while (cursor < endDate) {
        const chunkEnd = new Date(Math.min(
          cursor.getTime() + FULL_SYNC_CHUNK_DAYS * 86400000,
          endDate.getTime(),
        ));
        await syncWhoopDateRange(
          userId, token,
          cursor.toISOString(),
          chunkEnd.toISOString(),
          imported, errors, cycleDateMap,
        );
        cursor = chunkEnd;
        chunkIndex++;
        // Brief pause between chunks to stay under WHOOP rate limits (100/min)
        if (cursor < endDate) await new Promise(r => setTimeout(r, 300));
      }

      console.log(`WHOOP full history sync: ${chunkIndex} chunks for user ${userId}`);
    } else {
      const days = options?.days ?? INCREMENTAL_SYNC_DAYS;
      const start = new Date(Date.now() - days * 86400000).toISOString();
      await syncWhoopDateRange(userId, token, start, end, imported, errors, cycleDateMap);
    }

    // Profile + body measurements
    try {
      const profile = await whoopFetch<Record<string, unknown>>('/user/profile/basic', token, userId);
      const body = await whoopFetch<{ height_meter: number; weight_kilogram: number; max_heart_rate: number }>(
        '/user/measurement/body', token, userId,
      );
      if (body.weight_kilogram) {
        applyDefaultProfileTargets(userId, body.weight_kilogram);
      }

      const existing = getIntegration(userId, 'whoop');
      const prevConfig = existing?.config ? JSON.parse(existing.config) : {};
      saveIntegration(userId, 'whoop', getCredentials(userId, 'whoop'), {
        ...prevConfig,
        profile,
        body,
        ...(fullHistory && {
          full_history_synced_at: new Date().toISOString(),
          full_history_counts: imported,
        }),
        last_sync_mode: fullHistory ? 'full' : 'incremental',
      }, true);

      if (body.weight_kilogram) {
        const today = new Date().toISOString().split('T')[0];
        const weightRow = db.prepare(`SELECT id FROM weight_entries WHERE user_id = ? AND date(recorded_at) = ? AND notes LIKE '%WHOOP%'`).get(userId, today);
        if (!weightRow) {
          db.prepare(`INSERT INTO weight_entries (id, user_id, weight_kg, notes, recorded_at) VALUES (?, ?, ?, ?, ?)`)
            .run(generateId(), userId, body.weight_kilogram, 'WHOOP body measurement', new Date().toISOString());
          imported.weight++;
        }
      }
    } catch (e) {
      errors.push(`body: ${(e as Error).message}`);
    }

    if (imported.recovery + imported.sleep + imported.workouts === 0 && errors.length > 0) {
      throw new Error(`WHOOP sync failed: ${errors.join('; ')}`);
    }

    saveWhoopSyncMeta(userId, {
      last_sync_at: new Date().toISOString(),
      last_sync_errors: errors.length > 0 ? errors : null,
      last_sync_imported: imported,
      last_sync_error: null,
    });

    setSyncStatus(userId, 'whoop', errors.length > 0 ? 'partial' : 'success');
  } catch (error) {
    const message = (error as Error).message;
    saveWhoopSyncMeta(userId, { last_sync_error: message, last_sync_at: new Date().toISOString() });
    setSyncStatus(userId, 'whoop', 'error');
    throw error;
  }

  const stats = getWhoopDataStats(userId);
  return { ...imported, stats, errors: errors.length > 0 ? errors : undefined, fullHistory };
}

export function configureWhoopToken(userId: string, accessToken: string, refreshToken?: string, expiresAt?: number) {
  saveIntegration(userId, 'whoop', {
    access_token: accessToken,
    refresh_token: refreshToken,
    expires_at: expiresAt,
  });
}

export async function testWhoopConnection(userId: string) {
  const token = await getWhoopToken(userId);
  const profile = await whoopFetch('/user/profile/basic', token, userId);
  return { connected: true, profile };
}

export function workoutStrain(w: { strain?: number; duration_minutes?: number }): number {
  if (w.strain != null) return w.strain;
  if (w.duration_minutes) return w.duration_minutes / 10;
  return 0;
}
