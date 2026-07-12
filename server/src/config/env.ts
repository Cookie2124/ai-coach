import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '../../../.env') });
dotenv.config({ path: path.join(__dirname, '../../.env') });

export const env = {
  PORT: process.env.PORT || '3001',
  JWT_SECRET: process.env.JWT_SECRET || 'aicoach-local-dev-secret',
  APP_URL: process.env.APP_URL || 'http://localhost:3001',
  CLIENT_URL: process.env.CLIENT_URL || 'http://localhost:5173',
  /** Override OAuth callback if WHOOP dashboard uses a different URI than APP_URL */
  OAUTH_REDIRECT_URI: process.env.OAUTH_REDIRECT_URI || '',

  OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY || '',
  OPENROUTER_MODEL: process.env.OPENROUTER_MODEL || 'openai/gpt-5.6-luna',

  WHOOP_CLIENT_ID: process.env.WHOOP_CLIENT_ID || '',
  WHOOP_CLIENT_SECRET: process.env.WHOOP_CLIENT_SECRET || '',

  GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID || '',
  GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET || '',

  MICROSOFT_CLIENT_ID: process.env.MICROSOFT_CLIENT_ID || '',
  MICROSOFT_CLIENT_SECRET: process.env.MICROSOFT_CLIENT_SECRET || '',

  STRAVA_CLIENT_ID: process.env.STRAVA_CLIENT_ID || '',
  STRAVA_CLIENT_SECRET: process.env.STRAVA_CLIENT_SECRET || '',

  GARMIN_CLIENT_ID: process.env.GARMIN_CLIENT_ID || '',
  GARMIN_CLIENT_SECRET: process.env.GARMIN_CLIENT_SECRET || '',
};

export const OAUTH_CALLBACK = env.OAUTH_REDIRECT_URI || `${env.APP_URL.replace(/\/$/, '')}/api/integrations/oauth/callback`;

/** Resolve API + OAuth callback URLs from where the user opened the app (e.g. phone on Tailscale). */
export function resolveOAuthUrls(clientUrl?: string) {
  const fallbackClient = env.CLIENT_URL.replace(/\/$/, '');
  const fallbackApp = env.APP_URL.replace(/\/$/, '');
  const fallbackRedirect = env.OAUTH_REDIRECT_URI || `${fallbackApp}/api/integrations/oauth/callback`;

  if (!clientUrl) {
    return { clientUrl: fallbackClient, appUrl: fallbackApp, redirectUri: fallbackRedirect };
  }

  try {
    const client = new URL(clientUrl);
    if (!['http:', 'https:'].includes(client.protocol)) {
      throw new Error('invalid protocol');
    }
    const apiPort = env.PORT || '3001';
    const appUrl = `${client.protocol}//${client.hostname}:${apiPort}`;
    const redirectUri = env.OAUTH_REDIRECT_URI || `${appUrl}/api/integrations/oauth/callback`;
    return {
      clientUrl: client.origin,
      appUrl,
      redirectUri,
    };
  } catch {
    return { clientUrl: fallbackClient, appUrl: fallbackApp, redirectUri: fallbackRedirect };
  }
}
