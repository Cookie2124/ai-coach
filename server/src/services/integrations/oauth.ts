import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { db } from '../../db/database.js';
import { env, OAUTH_CALLBACK, resolveOAuthUrls } from '../../config/env.js';

export interface OAuthContext {
  userId: string;
  provider: string;
  redirectUri: string;
  clientUrl: string;
}

function pruneExpiredOAuthStates() {
  db.prepare(`DELETE FROM oauth_pending_states WHERE expires_at < datetime('now')`).run();
}

function saveOAuthState(state: string, ctx: OAuthContext) {
  pruneExpiredOAuthStates();
  db.prepare(`
    INSERT INTO oauth_pending_states (state, user_id, provider, redirect_uri, client_url, expires_at)
    VALUES (?, ?, ?, ?, ?, datetime('now', '+10 minutes'))
  `).run(state, ctx.userId, ctx.provider, ctx.redirectUri, ctx.clientUrl);
}

function loadOAuthState(state: string): OAuthContext | null {
  pruneExpiredOAuthStates();
  const row = db.prepare(`
    SELECT user_id, provider, redirect_uri, client_url FROM oauth_pending_states
    WHERE state = ? AND expires_at >= datetime('now')
  `).get(state) as { user_id: string; provider: string; redirect_uri: string; client_url: string } | undefined;
  if (!row) return null;
  db.prepare(`DELETE FROM oauth_pending_states WHERE state = ?`).run(state);
  return {
    userId: row.user_id,
    provider: row.provider,
    redirectUri: row.redirect_uri,
    clientUrl: row.client_url,
  };
}

function oauthStateExists(state: string): boolean {
  return !!db.prepare(`SELECT 1 FROM oauth_pending_states WHERE state = ?`).get(state);
}

function createWhoopState(ctx: OAuthContext): string {
  let state = crypto.randomBytes(4).toString('hex');
  while (oauthStateExists(state)) {
    state = crypto.randomBytes(4).toString('hex');
  }
  saveOAuthState(state, ctx);
  return state;
}

function verifyWhoopState(state: string): OAuthContext {
  const ctx = loadOAuthState(state);
  if (!ctx) throw new Error('Invalid or expired OAuth state — try Connect WHOOP again');
  return ctx;
}

export interface OAuthProviderConfig {
  provider: string;
  authUrl: string;
  tokenUrl: string;
  scopes: string[];
  clientId: string;
  clientSecret: string;
  extraAuthParams?: Record<string, string>;
  useBasicAuth?: boolean;
}

export const OAUTH_PROVIDERS: Record<string, () => OAuthProviderConfig> = {
  whoop: () => ({
    provider: 'whoop',
    authUrl: 'https://api.prod.whoop.com/oauth/oauth2/auth',
    tokenUrl: 'https://api.prod.whoop.com/oauth/oauth2/token',
    scopes: ['offline', 'read:recovery', 'read:cycles', 'read:sleep', 'read:workout', 'read:profile', 'read:body_measurement'],
    clientId: env.WHOOP_CLIENT_ID,
    clientSecret: env.WHOOP_CLIENT_SECRET,
  }),
  google: () => ({
    provider: 'google',
    authUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenUrl: 'https://oauth2.googleapis.com/token',
    scopes: [
      'https://www.googleapis.com/auth/calendar.readonly',
      'https://www.googleapis.com/auth/gmail.readonly',
      'https://www.googleapis.com/auth/userinfo.email',
    ],
    clientId: env.GOOGLE_CLIENT_ID,
    clientSecret: env.GOOGLE_CLIENT_SECRET,
    extraAuthParams: { access_type: 'offline', prompt: 'consent' },
  }),
  google_calendar: () => ({
    provider: 'google_calendar',
    authUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenUrl: 'https://oauth2.googleapis.com/token',
    scopes: ['https://www.googleapis.com/auth/calendar.readonly'],
    clientId: env.GOOGLE_CLIENT_ID,
    clientSecret: env.GOOGLE_CLIENT_SECRET,
    extraAuthParams: { access_type: 'offline', prompt: 'consent' },
  }),
  gmail: () => ({
    provider: 'gmail',
    authUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenUrl: 'https://oauth2.googleapis.com/token',
    scopes: ['https://www.googleapis.com/auth/gmail.readonly'],
    clientId: env.GOOGLE_CLIENT_ID,
    clientSecret: env.GOOGLE_CLIENT_SECRET,
    extraAuthParams: { access_type: 'offline', prompt: 'consent' },
  }),
  outlook_calendar: () => ({
    provider: 'outlook_calendar',
    authUrl: 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize',
    tokenUrl: 'https://login.microsoftonline.com/common/oauth2/v2.0/token',
    scopes: ['Calendars.Read', 'offline_access'],
    clientId: env.MICROSOFT_CLIENT_ID,
    clientSecret: env.MICROSOFT_CLIENT_SECRET,
  }),
  outlook_email: () => ({
    provider: 'outlook_email',
    authUrl: 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize',
    tokenUrl: 'https://login.microsoftonline.com/common/oauth2/v2.0/token',
    scopes: ['Mail.Read', 'offline_access'],
    clientId: env.MICROSOFT_CLIENT_ID,
    clientSecret: env.MICROSOFT_CLIENT_SECRET,
  }),
  strava: () => ({
    provider: 'strava',
    authUrl: 'https://www.strava.com/oauth/authorize',
    tokenUrl: 'https://www.strava.com/oauth/token',
    scopes: ['read,activity:read_all,profile:read_all'],
    clientId: env.STRAVA_CLIENT_ID,
    clientSecret: env.STRAVA_CLIENT_SECRET,
    extraAuthParams: { approval_prompt: 'auto' },
  }),
  garmin: () => ({
    provider: 'garmin',
    authUrl: 'https://connect.garmin.com/oauthConfirm',
    tokenUrl: 'https://connectapi.garmin.com/oauth-service/oauth/access_token',
    scopes: [],
    clientId: env.GARMIN_CLIENT_ID,
    clientSecret: env.GARMIN_CLIENT_SECRET,
  }),
};

function getProviderConfig(provider: string): OAuthProviderConfig | undefined {
  return OAUTH_PROVIDERS[provider]?.();
}

export function isOAuthAvailable(provider: string): boolean {
  const config = getProviderConfig(provider);
  return !!(config?.clientId && config?.clientSecret);
}

function createJwtState(ctx: OAuthContext): string {
  return jwt.sign(
    { ...ctx, type: 'oauth' },
    env.JWT_SECRET,
    { expiresIn: '10m' },
  );
}

export function verifyOAuthState(state: string): OAuthContext {
  if (/^[a-f0-9]{8}$/.test(state)) {
    return verifyWhoopState(state);
  }
  const payload = jwt.verify(state, env.JWT_SECRET) as OAuthContext & { type: string };
  if (payload.type !== 'oauth') throw new Error('Invalid OAuth state');
  return {
    userId: payload.userId,
    provider: payload.provider,
    redirectUri: payload.redirectUri || OAUTH_CALLBACK,
    clientUrl: payload.clientUrl || env.CLIENT_URL,
  };
}

export function getAuthorizationUrl(provider: string, userId: string, clientUrl?: string): string {
  const config = getProviderConfig(provider);
  if (!config?.clientId) throw new Error(`OAuth not configured for ${provider}. Add client ID/secret to .env or use manual token.`);

  const urls = resolveOAuthUrls(clientUrl);
  const ctx: OAuthContext = {
    userId,
    provider,
    redirectUri: urls.redirectUri,
    clientUrl: urls.clientUrl,
  };

  const state = provider === 'whoop' ? createWhoopState(ctx) : createJwtState(ctx);
  const params = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: ctx.redirectUri,
    response_type: 'code',
    state,
    ...(config.scopes.length > 0 && { scope: config.scopes.join(config.provider === 'strava' ? ',' : ' ') }),
    ...config.extraAuthParams,
  });

  return `${config.authUrl}?${params}`;
}

export async function exchangeCodeForTokens(provider: string, code: string, redirectUri = OAUTH_CALLBACK) {
  const config = getProviderConfig(provider);
  if (!config) throw new Error(`Unknown provider: ${provider}`);

  const bodyParams: Record<string, string> = {
    grant_type: 'authorization_code',
    code,
    redirect_uri: redirectUri,
    client_id: config.clientId,
    client_secret: config.clientSecret,
  };

  if (provider === 'whoop') {
    bodyParams.scope = 'offline';
  }

  const response = await fetch(config.tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(bodyParams),
  });
  if (!response.ok) {
    const err = await response.text();
    let message = err;
    try {
      const parsed = JSON.parse(err) as { error?: string; error_description?: string };
      if (parsed.error === 'invalid_request' && parsed.error_description?.includes('redirect_uri')) {
        message = `WHOOP redirect URI mismatch. Register this exact URL in the WHOOP Developer Dashboard: ${redirectUri}`;
      } else if (parsed.error_description) {
        message = `${parsed.error}: ${parsed.error_description}`;
      }
    } catch { /* use raw err */ }
    throw new Error(`Token exchange failed: ${message}`);
  }

  const data = await response.json() as Record<string, unknown>;
  return normalizeTokens(data);
}

export async function refreshOAuthToken(
  provider: string,
  refreshToken: string,
  existingRefresh?: string,
  redirectUri = OAUTH_CALLBACK,
) {
  const config = getProviderConfig(provider);
  if (!config) throw new Error(`Unknown provider: ${provider}`);
  if (!config.clientId || !config.clientSecret) {
    throw new Error(`${provider} OAuth not configured — add client ID and secret to .env, then reconnect.`);
  }

  const bodyParams: Record<string, string> = {
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
    client_id: config.clientId,
    client_secret: config.clientSecret,
  };

  if (provider === 'whoop') {
    bodyParams.scope = 'offline';
    bodyParams.redirect_uri = redirectUri;
  }

  const response = await fetch(config.tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(bodyParams),
  });
  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Token refresh failed (${provider}): ${err}`);
  }
  const data = await response.json() as Record<string, unknown>;
  return normalizeTokens(data, existingRefresh ?? refreshToken);
}

function normalizeTokens(data: Record<string, unknown>, preserveRefresh?: string) {
  return {
    access_token: data.access_token as string,
    refresh_token: (data.refresh_token ?? data.refreshToken ?? preserveRefresh) as string | undefined,
    expires_at: data.expires_in ? Date.now() + (data.expires_in as number) * 1000 : undefined,
    token_type: data.token_type as string,
  };
}

export function getOAuthAvailability() {
  return Object.fromEntries(
    Object.keys(OAUTH_PROVIDERS).map(p => [p, isOAuthAvailable(p)]),
  );
}

export function getOAuthCallbackUrl(clientUrl?: string) {
  return resolveOAuthUrls(clientUrl).redirectUri;
}

export const MANUAL_TOKEN_PROVIDERS = [
  'whoop', 'google', 'google_calendar', 'gmail', 'outlook_calendar', 'outlook_email', 'strava', 'garmin', 'apple_health',
];

export const PROVIDER_INFO: Record<string, { name: string; description: string; supportsOAuth: boolean; supportsManual: boolean; supportsSync: boolean; supportsImport: boolean; hidden?: boolean }> = {
  whoop: { name: 'WHOOP', description: 'Recovery, HRV, sleep, strain, workouts', supportsOAuth: true, supportsManual: true, supportsSync: true, supportsImport: false },
  google: { name: 'Google', description: 'Calendar, Gmail & schedule — one connection for everything', supportsOAuth: true, supportsManual: true, supportsSync: true, supportsImport: false },
  google_calendar: { name: 'Google Calendar', description: 'Included with Google connection', supportsOAuth: true, supportsManual: true, supportsSync: true, supportsImport: false, hidden: true },
  outlook_calendar: { name: 'Outlook Calendar', description: 'Import events and schedule', supportsOAuth: true, supportsManual: true, supportsSync: true, supportsImport: false },
  gmail: { name: 'Gmail', description: 'Included with Google connection', supportsOAuth: true, supportsManual: true, supportsSync: true, supportsImport: false, hidden: true },
  outlook_email: { name: 'Outlook Email', description: 'Import email context for scheduling', supportsOAuth: true, supportsManual: true, supportsSync: true, supportsImport: false },
  strava: { name: 'Strava', description: 'Running, cycling, and activity data', supportsOAuth: true, supportsManual: true, supportsSync: true, supportsImport: false },
  garmin: { name: 'Garmin', description: 'Activity and health metrics', supportsOAuth: true, supportsManual: true, supportsSync: true, supportsImport: false },
  apple_health: { name: 'Apple Health', description: 'Import health export (XML/JSON)', supportsOAuth: false, supportsManual: false, supportsSync: false, supportsImport: true },
};
