import { getCredentials, setSyncStatus } from './base.js';
import { db } from '../../db/database.js';
import { generateId } from '../../types/index.js';

export async function syncGarmin(userId: string) {
  setSyncStatus(userId, 'garmin', 'syncing');
  try {
    const creds = getCredentials(userId, 'garmin');
    if (!creds.access_token) throw new Error('Garmin not connected');

    const end = Date.now();
    const start = end - 30 * 86400000;
    const url = `https://apis.garmin.com/wellness-api/rest/activities?uploadStartTimeInSeconds=${Math.floor(start / 1000)}&uploadEndTimeInSeconds=${Math.floor(end / 1000)}`;

    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${creds.access_token}`,
      },
    });

    if (!response.ok) {
      // Fallback: try Garmin Connect activity list endpoint
      const altUrl = `https://connectapi.garmin.com/activitylist-service/activities/search/activities?start=0&limit=50`;
      const altResponse = await fetch(altUrl, {
        headers: { Authorization: `Bearer ${creds.access_token}`, 'DI-Backend': 'connectapi.garmin.com' },
      });

      if (!altResponse.ok) throw new Error(`Garmin API error: ${response.status}. Ensure your access token is valid.`);

      const altData = await altResponse.json() as { activityList?: { activityId: number; activityName: string; startTimeLocal: string; duration: number; distance: number; averageHR?: number; maxHR?: number; activityType?: { typeKey: string } }[] };
      return importGarminActivities(userId, altData.activityList ?? []);
    }

    const data = await response.json() as { activities?: { activityId: number; activityName: string; startTimeInSeconds: number; durationInSeconds: number; distanceInMeters: number; averageHeartRateInBeatsPerMinute?: number; maxHeartRateInBeatsPerMinute?: number; activityType?: string }[] };
    const activities = (data.activities ?? []).map(a => ({
      activityId: a.activityId,
      activityName: a.activityName,
      startTimeLocal: new Date(a.startTimeInSeconds * 1000).toISOString(),
      duration: a.durationInSeconds * 1000,
      distance: a.distanceInMeters,
      averageHR: a.averageHeartRateInBeatsPerMinute,
      maxHR: a.maxHeartRateInBeatsPerMinute,
      activityType: { typeKey: a.activityType ?? 'other' },
    }));

    const result = await importGarminActivities(userId, activities);
    setSyncStatus(userId, 'garmin', 'success');
    return result;
  } catch (e) {
    setSyncStatus(userId, 'garmin', 'error');
    throw e;
  }
}

async function importGarminActivities(userId: string, activities: { activityId: number; activityName: string; startTimeLocal: string; duration: number; distance: number; averageHR?: number; maxHR?: number; activityType?: { typeKey: string } }[]) {
  let imported = 0;
  for (const act of activities) {
    const date = act.startTimeLocal.split('T')[0];
    const existing = db.prepare(`SELECT id FROM workouts WHERE user_id = ? AND source = 'garmin' AND raw_data LIKE ?`).get(userId, `%"activityId":${act.activityId}%`);
    if (existing) continue;

    const typeKey = act.activityType?.typeKey ?? 'other';
    db.prepare(`
      INSERT INTO workouts (id, user_id, date, activity_type, duration_minutes, distance_km, avg_hr, max_hr, notes, source, raw_data)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'garmin', ?)
    `).run(
      generateId(), userId, date, typeKey.replace('_activity', ''),
      Math.round(act.duration / 60000),
      act.distance ? act.distance / 1000 : null,
      act.averageHR, act.maxHR,
      act.activityName, JSON.stringify(act),
    );
    imported++;
  }
  setSyncStatus(userId, 'garmin', 'success');
  return { activities: imported };
}
