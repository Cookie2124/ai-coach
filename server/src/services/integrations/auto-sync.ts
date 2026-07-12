import { syncProvider, SYNC_PROVIDERS } from './index.js';
import { isGoogleConnected, syncGoogleAll } from './google.js';
import { getIntegrationStatus, saveIntegration, type IntegrationCredentials } from './base.js';
import { runLearningCycle } from '../learning/index.js';

const SYNC_INTERVAL_MS = 30 * 60 * 1000;
const lastSyncByUser = new Map<string, number>();

export async function autoSyncIfStale(userId: string, force = false) {
  const last = lastSyncByUser.get(userId) ?? 0;
  if (!force && Date.now() - last < SYNC_INTERVAL_MS) {
    return { skipped: true, reason: 'synced recently' };
  }

  const statuses = getIntegrationStatus(userId);
  const results: Record<string, unknown> = {};

  if (isGoogleConnected(userId)) {
    try {
      results.google = await syncGoogleAll(userId);
    } catch (e) {
      results.google = { error: (e as Error).message };
    }
  }

  for (const s of statuses) {
    if (!s.connected || s.provider === 'google_calendar' || s.provider === 'gmail') continue;
    if (!SYNC_PROVIDERS.includes(s.provider)) continue;
    if (s.provider === 'google') continue;
    try {
      results[s.provider] = await syncProvider(userId, s.provider);
    } catch (e) {
      results[s.provider] = { error: (e as Error).message };
    }
  }

  lastSyncByUser.set(userId, Date.now());
  const learning = runLearningCycle(userId);

  return { synced: true, results, learning };
}

export function mirrorGoogleCredentials(userId: string, credentials: IntegrationCredentials, config: Record<string, unknown> = {}) {
  saveIntegration(userId, 'google', credentials, config, true);
  saveIntegration(userId, 'google_calendar', credentials, config, true);
  saveIntegration(userId, 'gmail', credentials, config, true);
}
