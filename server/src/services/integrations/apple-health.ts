import { setSyncStatus } from './base.js';
import { db } from '../../db/database.js';
import { generateId } from '../../types/index.js';

interface AppleHealthRecord {
  type?: string;
  value?: number | string;
  unit?: string;
  startDate?: string;
  endDate?: string;
  sourceName?: string;
  metadata?: Record<string, unknown>;
}

export async function importAppleHealth(userId: string, data: unknown) {
  setSyncStatus(userId, 'apple_health', 'syncing');
  try {
    if (!data) throw new Error('No health data provided');

    let records: AppleHealthRecord[] = [];

    if (typeof data === 'string') {
      records = parseAppleHealthXML(data);
    } else if (Array.isArray(data)) {
      records = data as AppleHealthRecord[];
    } else if (typeof data === 'object' && data !== null) {
      const obj = data as { records?: AppleHealthRecord[]; data?: { metrics?: AppleHealthRecord[] } };
      records = obj.records ?? obj.data?.metrics ?? [];
    }

    let imported = { workouts: 0, sleep: 0, weight: 0, heartRate: 0 };

    for (const record of records) {
      const type = record.type ?? '';
      const date = record.startDate?.split('T')[0];
      if (!date) continue;

      if (type.includes('BodyMass') || type.includes('HKQuantityTypeIdentifierBodyMass')) {
        const weight = parseFloat(String(record.value));
        if (weight > 0) {
          db.prepare(`INSERT INTO weight_entries (id, user_id, weight_kg, recorded_at) VALUES (?, ?, ?, ?)`)
            .run(generateId(), userId, weight, record.startDate ?? date);
          imported.weight++;
        }
      }

      if (type.includes('HeartRate') || type.includes('RestingHeartRate')) {
        const hr = parseInt(String(record.value));
        if (hr > 0) {
          db.prepare(`
            INSERT INTO recovery_entries (id, user_id, date, resting_hr, source)
            VALUES (?, ?, ?, ?, 'apple_health')
            ON CONFLICT(user_id, date, source) DO UPDATE SET resting_hr=excluded.resting_hr
          `).run(generateId(), userId, date, hr);
          imported.heartRate++;
        }
      }

      if (type.includes('SleepAnalysis')) {
        const start = new Date(record.startDate!);
        const end = new Date(record.endDate ?? record.startDate!);
        const hours = (end.getTime() - start.getTime()) / 3600000;
        if (hours > 0) {
          db.prepare(`
            INSERT INTO sleep_entries (id, user_id, date, duration_hours, source)
            VALUES (?, ?, ?, ?, 'apple_health')
            ON CONFLICT(user_id, date, source) DO UPDATE SET duration_hours=excluded.duration_hours
          `).run(generateId(), userId, date, Math.round(hours * 10) / 10);
          imported.sleep++;
        }
      }

      if (type.includes('Workout') || type.includes('Running') || type.includes('Cycling')) {
        const start = new Date(record.startDate!);
        const end = new Date(record.endDate ?? record.startDate!);
        const durationMin = Math.round((end.getTime() - start.getTime()) / 60000);
        db.prepare(`
          INSERT INTO workouts (id, user_id, date, activity_type, duration_minutes, source, raw_data)
          VALUES (?, ?, ?, ?, ?, 'apple_health', ?)
        `).run(generateId(), userId, date, type.split('.').pop()?.replace('HKWorkoutActivityType', '').toLowerCase() ?? 'other', durationMin, JSON.stringify(record));
        imported.workouts++;
      }

      if (type.includes('StepCount') || type.includes('DistanceWalkingRunning')) {
        db.prepare(`
          INSERT INTO lifestyle_entries (id, user_id, date, notes)
          VALUES (?, ?, ?, ?)
          ON CONFLICT(user_id, date) DO UPDATE SET notes=excluded.notes
        `).run(generateId(), userId, date, `Apple Health: ${type} = ${record.value} ${record.unit ?? ''}`);
      }
    }

    setSyncStatus(userId, 'apple_health', 'success');
    return imported;
  } catch (e) {
    setSyncStatus(userId, 'apple_health', 'error');
    throw e;
  }
}

function parseAppleHealthXML(xml: string): AppleHealthRecord[] {
  const records: AppleHealthRecord[] = [];
  const recordRegex = /<Record\s([^>]+)\/?>/g;
  let match;

  while ((match = recordRegex.exec(xml)) !== null) {
    const attrs = match[1];
    const get = (name: string) => attrs.match(new RegExp(`${name}="([^"]*)"`))?.[1];
    records.push({
      type: get('type'),
      value: get('value'),
      unit: get('unit'),
      startDate: get('startDate'),
      endDate: get('endDate'),
      sourceName: get('sourceName'),
    });
  }

  const workoutRegex = /<Workout\s([^>]+)\/?>/g;
  while ((match = workoutRegex.exec(xml)) !== null) {
    const attrs = match[1];
    const get = (name: string) => attrs.match(new RegExp(`${name}="([^"]*)"`))?.[1];
    records.push({
      type: `Workout.${get('workoutActivityType')}`,
      startDate: get('startDate'),
      endDate: get('endDate'),
      sourceName: get('sourceName'),
    });
  }

  return records;
}
