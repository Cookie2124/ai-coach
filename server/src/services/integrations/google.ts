import { getCredentials, refreshTokenIfNeeded, setSyncStatus, upsertCalendarEvent, detectEventType, saveIntegration } from './base.js';
import { refreshOAuthToken } from './oauth.js';
import { db } from '../../db/database.js';
import { generateId } from '../../types/index.js';

async function getGoogleToken(userId: string): Promise<string> {
  for (const provider of ['google', 'google_calendar', 'gmail']) {
    const creds = getCredentials(userId, provider);
    if (creds.access_token) {
      return refreshTokenIfNeeded(userId, provider, (rt) => refreshOAuthToken('google', rt, rt));
    }
  }
  throw new Error('Google not connected — use Connect Google on Integrations');
}

export async function fetchGoogleProfile(userId: string): Promise<{ email?: string }> {
  try {
    const token = await getGoogleToken(userId);
    const res = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return {};
    return await res.json() as { email?: string };
  } catch {
    return {};
  }
}

export async function syncGoogleCalendar(userId: string) {
  setSyncStatus(userId, 'google_calendar', 'syncing');
  try {
    const token = await getGoogleToken(userId);
    const now = new Date();
    const past = new Date(now.getTime() - 7 * 86400000);
    const future = new Date(now.getTime() + 60 * 86400000);

    const url = new URL('https://www.googleapis.com/calendar/v3/calendars/primary/events');
    url.searchParams.set('timeMin', past.toISOString());
    url.searchParams.set('timeMax', future.toISOString());
    url.searchParams.set('singleEvents', 'true');
    url.searchParams.set('orderBy', 'startTime');
    url.searchParams.set('maxResults', '150');

    const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!response.ok) throw new Error(`Google Calendar API error: ${response.status}`);

    const data = await response.json() as { items: { id: string; summary: string; description?: string; start: { dateTime?: string; date?: string }; end: { dateTime?: string; date?: string } }[] };
    let imported = 0;

    for (const event of data.items ?? []) {
      const startTime = event.start.dateTime ?? event.start.date;
      if (!startTime || !event.summary) continue;

      upsertCalendarEvent(userId, {
        title: event.summary,
        description: event.description,
        start_time: startTime,
        end_time: event.end.dateTime ?? event.end.date,
        event_type: detectEventType(event.summary, event.description),
        source: 'google_calendar',
        external_id: event.id,
      });
      imported++;
    }

    setSyncStatus(userId, 'google_calendar', 'success');
    return { events: imported };
  } catch (e) {
    setSyncStatus(userId, 'google_calendar', 'error');
    throw e;
  }
}

export async function syncGmail(userId: string) {
  setSyncStatus(userId, 'gmail', 'syncing');
  try {
    const token = await getGoogleToken(userId);
    const url = 'https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=50&q=newer_than:14d';

    const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!response.ok) throw new Error(`Gmail API error: ${response.status}`);

    const data = await response.json() as { messages: { id: string }[] };
    let imported = 0;

    for (const msg of data.messages ?? []) {
      const detail = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${msg.id}?format=metadata&metadataHeaders=Subject&metadataHeaders=From`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!detail.ok) continue;

      const msgData = await detail.json() as { id: string; snippet: string; internalDate: string; payload: { headers: { name: string; value: string }[] } };
      const subject = msgData.payload.headers.find(h => h.name === 'Subject')?.value ?? 'No subject';
      const from = msgData.payload.headers.find(h => h.name === 'From')?.value ?? '';
      const date = new Date(parseInt(msgData.internalDate)).toISOString();
      const eventType = detectEmailType(subject, msgData.snippet);

      const existing = db.prepare(`SELECT id FROM calendar_events WHERE user_id = ? AND source = 'gmail' AND external_id = ?`).get(userId, msg.id);
      if (existing) {
        db.prepare(`UPDATE calendar_events SET title=?, description=?, start_time=?, event_type=? WHERE id=?`)
          .run(subject, `${from}\n${msgData.snippet}`, date, eventType, (existing as { id: string }).id);
      } else {
        db.prepare(`INSERT INTO calendar_events (id, user_id, title, description, start_time, event_type, source, external_id) VALUES (?, ?, ?, ?, ?, ?, 'gmail', ?)`)
          .run(generateId(), userId, subject, `${from}\n${msgData.snippet}`, date, eventType, msg.id);
        imported++;
      }
    }

    setSyncStatus(userId, 'gmail', 'success');
    return { emails: imported };
  } catch (e) {
    setSyncStatus(userId, 'gmail', 'error');
    throw e;
  }
}

function detectEmailType(subject: string, snippet: string): string {
  const text = `${subject} ${snippet}`.toLowerCase();
  if (/exam|assignment due|deadline|midterm|final|homework/.test(text)) return 'exam';
  if (/match|fixture|game|rugby|training/.test(text)) return 'training';
  return 'email';
}

/** Sync calendar + gmail in one step using unified Google token */
export async function syncGoogleAll(userId: string) {
  setSyncStatus(userId, 'google', 'syncing');
  try {
    const calendar = await syncGoogleCalendar(userId);
    const gmail = await syncGmail(userId);
    const profile = await fetchGoogleProfile(userId);
    if (profile.email) {
      const creds = getCredentials(userId, 'google');
      saveIntegration(userId, 'google', creds, { email: profile.email }, true);
    }
    setSyncStatus(userId, 'google', 'success');
    return { ...calendar, ...gmail, email: profile.email };
  } catch (e) {
    setSyncStatus(userId, 'google', 'error');
    throw e;
  }
}

export function isGoogleConnected(userId: string): boolean {
  return ['google', 'google_calendar', 'gmail'].some(p => !!getCredentials(userId, p).access_token);
}
