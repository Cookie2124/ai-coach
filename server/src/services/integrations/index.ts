import { syncWhoopData, type WhoopSyncOptions } from './whoop.js';
import { syncGoogleCalendar, syncGmail, syncGoogleAll } from './google.js';
import { syncOutlookCalendar, syncOutlookEmail } from './microsoft.js';
import { syncStrava } from './strava.js';
import { syncGarmin } from './garmin.js';
import { importAppleHealth } from './apple-health.js';

export async function syncProvider(userId: string, provider: string, importData?: unknown) {
  switch (provider) {
    case 'whoop': return syncWhoopData(userId, importData as WhoopSyncOptions | undefined);
    case 'google': return syncGoogleAll(userId);
    case 'google_calendar': return syncGoogleCalendar(userId);
    case 'gmail': return syncGmail(userId);
    case 'outlook_calendar': return syncOutlookCalendar(userId);
    case 'outlook_email': return syncOutlookEmail(userId);
    case 'strava': return syncStrava(userId);
    case 'garmin': return syncGarmin(userId);
    case 'apple_health': return importAppleHealth(userId, importData);
    default: throw new Error(`Unknown provider: ${provider}`);
  }
}

export const SYNC_PROVIDERS = ['whoop', 'google', 'google_calendar', 'gmail', 'outlook_calendar', 'outlook_email', 'strava', 'garmin'];
