import { getCredentials, refreshTokenIfNeeded, setSyncStatus, upsertCalendarEvent, detectEventType } from './base.js';
import { refreshOAuthToken } from './oauth.js';
import { db } from '../../db/database.js';
import { generateId } from '../../types/index.js';

async function getMicrosoftToken(userId: string, provider: string): Promise<string> {
  return refreshTokenIfNeeded(userId, provider, (rt) => refreshOAuthToken(provider, rt));
}

export async function syncOutlookCalendar(userId: string) {
  setSyncStatus(userId, 'outlook_calendar', 'syncing');
  try {
    const token = await getMicrosoftToken(userId, 'outlook_calendar');
    const now = new Date();
    const future = new Date(now.getTime() + 60 * 86400000);

    const url = `https://graph.microsoft.com/v1.0/me/calendarView?startDateTime=${now.toISOString()}&endDateTime=${future.toISOString()}&$top=100&$orderby=start/dateTime`;

    const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!response.ok) throw new Error(`Outlook Calendar API error: ${response.status}`);

    const data = await response.json() as { value: { id: string; subject: string; bodyPreview?: string; start: { dateTime: string }; end: { dateTime: string } }[] };
    let imported = 0;

    for (const event of data.value ?? []) {
      if (!event.subject) continue;
      upsertCalendarEvent(userId, {
        title: event.subject,
        description: event.bodyPreview,
        start_time: event.start.dateTime,
        end_time: event.end.dateTime,
        event_type: detectEventType(event.subject, event.bodyPreview),
        source: 'outlook_calendar',
        external_id: event.id,
      });
      imported++;
    }

    setSyncStatus(userId, 'outlook_calendar', 'success');
    return { events: imported };
  } catch (e) {
    setSyncStatus(userId, 'outlook_calendar', 'error');
    throw e;
  }
}

export async function syncOutlookEmail(userId: string) {
  setSyncStatus(userId, 'outlook_email', 'syncing');
  try {
    const token = await getMicrosoftToken(userId, 'outlook_email');
    const url = 'https://graph.microsoft.com/v1.0/me/messages?$top=20&$orderby=receivedDateTime desc&$select=id,subject,bodyPreview,receivedDateTime';

    const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!response.ok) throw new Error(`Outlook Email API error: ${response.status}`);

    const data = await response.json() as { value: { id: string; subject: string; bodyPreview: string; receivedDateTime: string }[] };
    let imported = 0;

    for (const msg of data.value ?? []) {
      const existing = db.prepare(`SELECT id FROM calendar_events WHERE user_id = ? AND source = 'outlook_email' AND external_id = ?`).get(userId, msg.id);
      if (!existing) {
        db.prepare(`INSERT INTO calendar_events (id, user_id, title, description, start_time, event_type, source, external_id) VALUES (?, ?, ?, ?, ?, 'email', 'outlook_email', ?)`)
          .run(generateId(), userId, msg.subject, msg.bodyPreview, msg.receivedDateTime, msg.id);
        imported++;
      }
    }

    setSyncStatus(userId, 'outlook_email', 'success');
    return { emails: imported };
  } catch (e) {
    setSyncStatus(userId, 'outlook_email', 'error');
    throw e;
  }
}
