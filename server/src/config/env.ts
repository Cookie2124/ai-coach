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
  /** Override OAuth callback if provider dashboard uses a fixed URI */
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

export function isTailscaleHostname(hostname: string): boolean {
  return hostname.endsWith('.ts.net');
}

export function isLocalOAuthHostname(hostname: string): boolean {
  return hostname === 'localhost' || hostname === '127.0.0.1';
}

export function isIpHostname(hostname: string): boolean {
  return /^(\d{1,3}\.){3}\d{1,3}$/.test(hostname);
}

/** OAuth providers accept localhost (http) or Tailscale MagicDNS (https). */
export function isDirectOAuthOrigin(url: URL): boolean {
  if (isLocalOAuthHostname(url.hostname)) return true;
  return isTailscaleHostname(url.hostname) && url.protocol === 'https:';
}

function buildOAuthUrlsFromOrigin(origin: URL) {
  const port = origin.port || (origin.protocol === 'https:' ? '443' : '80');
  const defaultPort = origin.protocol === 'https:' ? '443' : '80';
  const appUrl = port === defaultPort
    ? `${origin.protocol}//${origin.hostname}`
    : `${origin.protocol}//${origin.hostname}:${port}`;
  const redirectUri = env.OAUTH_REDIRECT_URI || `${appUrl}/api/integrations/oauth/callback`;
  return {
    clientUrl: origin.origin,
    appUrl,
    redirectUri,
  };
}

function parseConfiguredAppUrl(): URL | null {
  try {
    return new URL(env.APP_URL);
  } catch {
    return null;
  }
}

/** Prefer HTTPS Tailscale APP_URL when the browser origin cannot be used for OAuth. */
function configuredTailscaleOAuthUrls() {
  const app = parseConfiguredAppUrl();
  if (app && isTailscaleHostname(app.hostname) && app.protocol === 'https:') {
    return buildOAuthUrlsFromOrigin(app);
  }
  return null;
}

/** Resolve API + OAuth callback URLs from how the user opened the app. */
export function resolveOAuthUrls(clientUrl?: string) {
  const configuredApp = parseConfiguredAppUrl();
  const fallbackApp = configuredApp ?? new URL('http://localhost:3001');
  const fallback = buildOAuthUrlsFromOrigin(fallbackApp);

  if (!clientUrl) {
    return configuredTailscaleOAuthUrls() ?? fallback;
  }

  try {
    const client = new URL(clientUrl);
    if (!['http:', 'https:'].includes(client.protocol)) {
      throw new Error('invalid protocol');
    }

    if (isDirectOAuthOrigin(client)) {
      return buildOAuthUrlsFromOrigin(client);
    }

    const tailscaleFallback = configuredTailscaleOAuthUrls();
    if (tailscaleFallback) {
      return { ...tailscaleFallback, clientUrl: client.origin };
    }

    const apiPort = env.PORT || '3001';
    const appUrl = `${client.protocol}//${client.hostname}:${apiPort}`;
    return {
      clientUrl: client.origin,
      appUrl,
      redirectUri: env.OAUTH_REDIRECT_URI || `${appUrl}/api/integrations/oauth/callback`,
    };
  } catch {
    return configuredTailscaleOAuthUrls() ?? fallback;
  }
}

/** WHOOP accepts localhost (http) or https — including Tailscale MagicDNS. */
export function resolveWhoopOAuthUrls(clientUrl?: string) {
  const urls = resolveOAuthUrls(clientUrl);
  const port = env.PORT || '3001';

  try {
    const redirect = new URL(urls.redirectUri);
    if (redirect.protocol === 'https:' || isLocalOAuthHostname(redirect.hostname)) {
      return urls;
    }
  } catch { /* fall through */ }

  const localhostRedirect = env.OAUTH_REDIRECT_URI || `http://localhost:${port}/api/integrations/oauth/callback`;
  return { ...urls, redirectUri: localhostRedirect };
}
