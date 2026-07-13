import { syncProvider, SYNC_PROVIDERS } from './index.js';
import { isGoogleConnected, syncGoogleAll } from './google.js';
import { isWhoopSyncInProgress } from './whoop.js';
import { getIntegrationStatus, saveIntegration, type IntegrationCredentials } from './base.js';
import { runLearningCycle } from '../learning/index.js';

const SYNC_INTERVAL_MS = 30 * 60 * 1000;
/** Min gap between WHOOP syncs triggered by opening the app */
const WHOOP_OPEN_SYNC_MS = 5 * 60 * 1000;

const lastSyncByUser = new Map<string, number>();
const lastWhoopOpenSyncByUser = new Map<string, number>();

/** Sync WHOOP when the user opens the app (debounced ~1 min). */
export async function syncWhoopOnAppOpen(userId: string) {
  const statuses = getIntegrationStatus(userId);
  const whoopConnected = statuses.some(s => s.provider === 'whoop' && s.connected);
  if (!whoopConnected) return { skipped: true, reason: 'whoop not connected' };

  const last = lastWhoopOpenSyncByUser.get(userId) ?? 0;
  if (Date.now() - last < WHOOP_OPEN_SYNC_MS) {
    return { skipped: true, reason: 'synced recently on open' };
  }
  if (isWhoopSyncInProgress(userId)) {
    return { skipped: true, reason: 'sync already in progress' };
  }

  try {
    const result = await syncProvider(userId, 'whoop', { days: 7 });
    lastWhoopOpenSyncByUser.set(userId, Date.now());
    runLearningCycle(userId);
    console.log(`[whoop] open-sync ok user=${userId}`, result);
    return { synced: true, result };
  } catch (e) {
    const message = (e as Error).message;
    console.error(`[whoop] open-sync failed user=${userId}:`, message);
    return { synced: false, error: message };
  }
}

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
    if (s.provider === 'whoop') continue; // handled by syncWhoopOnAppOpen
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
