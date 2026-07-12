import { db } from '../../db/database.js';
import { generateId } from '../../types/index.js';

export interface IntegrationCredentials {
  access_token?: string;
  refresh_token?: string;
  expires_at?: number;
  token_type?: string;
  [key: string]: unknown;
}

export function getIntegration(userId: string, provider: string) {
  return db.prepare(`SELECT * FROM integrations WHERE user_id = ? AND provider = ?`).get(userId, provider) as {
    id: string; provider: string; enabled: number; credentials: string; config: string;
    last_sync: string; sync_status: string;
  } | undefined;
}

export function getCredentials(userId: string, provider: string): IntegrationCredentials {
  const row = getIntegration(userId, provider);
  if (!row) return {};
  try { return JSON.parse(row.credentials); } catch { return {}; }
}

export function saveIntegration(
  userId: string,
  provider: string,
  credentials: IntegrationCredentials,
  config: Record<string, unknown> = {},
  enabled = true,
) {
  const id = generateId();
  db.prepare(`
    INSERT INTO integrations (id, user_id, provider, enabled, credentials, config)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(user_id, provider) DO UPDATE SET
      enabled=excluded.enabled, credentials=excluded.credentials, config=excluded.config
  `).run(id, userId, provider, enabled ? 1 : 0, JSON.stringify(credentials), JSON.stringify(config));
}

export function disconnectIntegration(userId: string, provider: string) {
  db.prepare(`DELETE FROM integrations WHERE user_id = ? AND provider = ?`).run(userId, provider);
}

export function setSyncStatus(userId: string, provider: string, status: string) {
  db.prepare(`UPDATE integrations SET sync_status = ?, last_sync = CASE WHEN ? = 'success' THEN datetime('now') ELSE last_sync END WHERE user_id = ? AND provider = ?`)
    .run(status, status, userId, provider);
}

export function getIntegrationStatus(userId: string) {
  const rows = db.prepare(`SELECT provider, enabled, last_sync, sync_status, config FROM integrations WHERE user_id = ?`).all(userId) as {
    provider: string; enabled: number; last_sync: string; sync_status: string; config: string;
  }[];

  return rows.map(r => ({
    provider: r.provider,
    enabled: r.enabled,
    last_sync: r.last_sync,
    sync_status: r.sync_status,
    config: r.config ? JSON.parse(r.config) : {},
    connected: r.enabled === 1,
  }));
}

export async function refreshTokenIfNeeded(
  userId: string,
  provider: string,
  refreshFn: (refreshToken: string) => Promise<IntegrationCredentials>,
): Promise<string> {
  const creds = getCredentials(userId, provider);
  if (!creds.access_token) throw new Error(`${provider} not connected`);

  if (creds.expires_at && creds.expires_at < Date.now() + 60000) {
    if (!creds.refresh_token) {
      throw new Error(`${provider} access token expired and no refresh token — disconnect and reconnect on Integrations.`);
    }
    const newCreds = await refreshFn(creds.refresh_token as string);
    const merged = { ...creds, ...newCreds, refresh_token: newCreds.refresh_token ?? creds.refresh_token };
    const existing = getIntegration(userId, provider);
    const prevConfig = existing?.config ? JSON.parse(existing.config) : {};
    saveIntegration(userId, provider, merged, prevConfig, true);
    // Keep unified Google tokens in sync
    if (['google', 'google_calendar', 'gmail'].includes(provider)) {
      for (const p of ['google', 'google_calendar', 'gmail']) {
        if (p !== provider) saveIntegration(userId, p, merged, {}, true);
      }
    }
    return merged.access_token as string;
  }

  return creds.access_token as string;
}

export function upsertCalendarEvent(userId: string, event: {
  title: string; description?: string; start_time: string; end_time?: string;
  event_type?: string; source: string; external_id: string;
}) {
  const existing = db.prepare(`SELECT id FROM calendar_events WHERE user_id = ? AND source = ? AND external_id = ?`)
    .get(userId, event.source, event.external_id) as { id: string } | undefined;

  if (existing) {
    db.prepare(`UPDATE calendar_events SET title=?, description=?, start_time=?, end_time=?, event_type=? WHERE id=?`)
      .run(event.title, event.description, event.start_time, event.end_time, event.event_type ?? 'general', existing.id);
    return existing.id;
  }

  const id = generateId();
  db.prepare(`INSERT INTO calendar_events (id, user_id, title, description, start_time, end_time, event_type, source, external_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(id, userId, event.title, event.description, event.start_time, event.end_time, event.event_type ?? 'general', event.source, event.external_id);
  return id;
}

function detectEventType(title: string, description?: string): string {
  const text = `${title} ${description ?? ''}`.toLowerCase();
  if (/rugby|match|game|vs\.|fixture/.test(text)) return 'match';
  if (/exam|test|midterm|final/.test(text)) return 'exam';
  if (/training|practice|gym|workout/.test(text)) return 'training';
  return 'general';
}

export { detectEventType };
