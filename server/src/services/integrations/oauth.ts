import jwt from 'jsonwebtoken';
import { env, OAUTH_CALLBACK } from '../../config/env.js';

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

export function createOAuthState(userId: string, provider: string): string {
  return jwt.sign({ userId, provider, type: 'oauth' }, env.JWT_SECRET, { expiresIn: '10m' });
}

export function verifyOAuthState(state: string): { userId: string; provider: string } {
  const payload = jwt.verify(state, env.JWT_SECRET) as { userId: string; provider: string; type: string };
  if (payload.type !== 'oauth') throw new Error('Invalid OAuth state');
  return { userId: payload.userId, provider: payload.provider };
}

export function getAuthorizationUrl(provider: string, userId: string): string {
  const config = getProviderConfig(provider);
  if (!config?.clientId) throw new Error(`OAuth not configured for ${provider}. Add client ID/secret to .env or use manual token.`);

  const state = createOAuthState(userId, provider);
  const params = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: OAUTH_CALLBACK,
    response_type: 'code',
    state,
    ...(config.scopes.length > 0 && { scope: config.scopes.join(config.provider === 'strava' ? ',' : ' ') }),
    ...config.extraAuthParams,
  });

  return `${config.authUrl}?${params}`;
}

export async function exchangeCodeForTokens(provider: string, code: string) {
  const config = getProviderConfig(provider);
  if (!config) throw new Error(`Unknown provider: ${provider}`);

  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: OAUTH_CALLBACK,
    client_id: config.clientId,
    client_secret: config.clientSecret,
  });

  const headers: Record<string, string> = { 'Content-Type': 'application/x-www-form-urlencoded' };

  const response = await fetch(config.tokenUrl, { method: 'POST', headers, body });
  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Token exchange failed: ${err}`);
  }

  const data = await response.json() as Record<string, unknown>;
  return normalizeTokens(data);
}

export async function refreshOAuthToken(provider: string, refreshToken: string, existingRefresh?: string) {
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

  // WHOOP (Auth0) requires redirect_uri on refresh
  if (provider === 'whoop') {
    bodyParams.scope = 'offline';
    bodyParams.redirect_uri = OAUTH_CALLBACK;
  }

  const body = new URLSearchParams(bodyParams);

  const response = await fetch(config.tokenUrl, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body });
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

export function getOAuthCallbackUrl() {
  return OAUTH_CALLBACK;
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
