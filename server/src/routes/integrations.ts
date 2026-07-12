import { Router, Request, Response } from 'express';
import { authMiddleware, type AuthRequest } from '../middleware/auth.js';
import { env, resolveOAuthUrls } from '../config/env.js';
import {
  getAuthorizationUrl, exchangeCodeForTokens, verifyOAuthState,
  getOAuthAvailability, PROVIDER_INFO, isOAuthAvailable, getOAuthCallbackUrl,
} from '../services/integrations/oauth.js';
import {
  getIntegrationStatus, saveIntegration, disconnectIntegration, getIntegration,
} from '../services/integrations/base.js';
import { syncProvider, SYNC_PROVIDERS } from '../services/integrations/index.js';
import { configureWhoopToken, syncWhoopData } from '../services/integrations/whoop.js';
import { syncGoogleAll } from '../services/integrations/google.js';
import { mirrorGoogleCredentials } from '../services/integrations/auto-sync.js';
import { runLearningCycle } from '../services/learning/index.js';

const router = Router();

router.get('/oauth/callback', async (req: Request, res: Response) => {
  const fallbackClient = env.CLIENT_URL;
  try {
    const { code, state, error } = req.query;
    if (error) return res.redirect(`${fallbackClient}/integrations?error=${encodeURIComponent(String(error))}`);
    if (!code || !state) return res.redirect(`${fallbackClient}/integrations?error=missing_params`);

    const oauthCtx = verifyOAuthState(String(state));
    const { userId, provider, redirectUri, clientUrl } = oauthCtx;
    const tokens = await exchangeCodeForTokens(provider, String(code), redirectUri);

    const existing = getIntegration(userId, provider);
    const prevConfig = existing?.config ? JSON.parse(existing.config) : {};
    const oauthConfig = {
      ...prevConfig,
      oauth_redirect_uri: redirectUri,
      oauth_client_url: clientUrl,
    };

    if (provider === 'google') {
      mirrorGoogleCredentials(userId, tokens, oauthConfig);
    } else if (provider === 'google_calendar' || provider === 'gmail') {
      mirrorGoogleCredentials(userId, tokens, oauthConfig);
    } else {
      saveIntegration(userId, provider, tokens, oauthConfig);
    }

    if (provider === 'whoop') {
      try {
        const result = await syncWhoopData(userId, { fullHistory: true });
        runLearningCycle(userId);
        const stats = result.stats;
        const summary = `${result.recovery} recovery, ${result.sleep} sleep, ${result.workouts} workouts (${stats.recovery.earliest ?? '?'} → ${stats.recovery.latest ?? '?'})`;
        return res.redirect(`${clientUrl}/integrations?connected=${provider}&synced=${encodeURIComponent(summary)}`);
      } catch (syncErr) {
        return res.redirect(`${clientUrl}/integrations?connected=${provider}&error=${encodeURIComponent('Connected but initial sync failed: ' + (syncErr as Error).message)}`);
      }
    }

    if (provider === 'google') {
      try {
        const result = await syncGoogleAll(userId);
        runLearningCycle(userId);
        const summary = `${result.events ?? 0} events, ${result.emails ?? 0} emails`;
        return res.redirect(`${clientUrl}/integrations?connected=${provider}&synced=${encodeURIComponent(summary)}`);
      } catch (syncErr) {
        return res.redirect(`${clientUrl}/integrations?connected=${provider}&error=${encodeURIComponent('Connected but initial sync failed: ' + (syncErr as Error).message)}`);
      }
    }

    res.redirect(`${clientUrl}/integrations?connected=${provider}`);
  } catch (err) {
    res.redirect(`${fallbackClient}/integrations?error=${encodeURIComponent((err as Error).message)}`);
  }
});

router.use(authMiddleware);

router.get('/providers', (req, res) => {
  const clientUrl = typeof req.query.client_url === 'string' ? req.query.client_url : undefined;
  const urls = resolveOAuthUrls(clientUrl);
  res.json({
    providers: PROVIDER_INFO,
    oauthAvailable: getOAuthAvailability(),
    oauthCallbackUrl: urls.redirectUri,
    oauthClientUrl: urls.clientUrl,
    oauthSetup: {
      whoop: {
        redirectUri: urls.redirectUri,
        dashboardUrl: 'https://developer-dashboard.whoop.com',
        hints: [
          'Register the redirect URI shown below — it updates based on how you open the app',
          'Phone/Tailscale: use your machine IP on port 3001, not 5173',
          'Example: http://100.96.108.122:3001/api/integrations/oauth/callback',
          'You can register multiple redirect URIs (localhost + phone IP) in WHOOP',
          'No trailing slash',
        ],
      },
    },
  });
});

router.get('/', (req: AuthRequest, res) => {
  res.json(getIntegrationStatus(req.userId!));
});

router.get('/:provider/connect', (req: AuthRequest, res) => {
  const provider = String(req.params.provider);
  try {
    if (!isOAuthAvailable(provider)) {
      return res.status(400).json({ error: `OAuth not configured for ${provider}. Use manual token or add credentials to .env` });
    }
    const clientUrl = typeof req.query.client_url === 'string' ? req.query.client_url : undefined;
    const url = getAuthorizationUrl(provider, req.userId!, clientUrl);
    res.json({ url, redirectUri: getOAuthCallbackUrl(clientUrl) });
  } catch (error) {
    res.status(400).json({ error: (error as Error).message });
  }
});

router.post('/:provider/configure', (req: AuthRequest, res) => {
  const provider = String(req.params.provider);
  const { credentials, enabled, config } = req.body;

  if (provider === 'whoop' && credentials?.access_token) {
    configureWhoopToken(req.userId!, credentials.access_token, credentials.refresh_token);
  } else {
    saveIntegration(req.userId!, provider, credentials ?? {}, config ?? {}, enabled !== false);
  }

  res.json({ success: true });
});

router.get('/whoop/status', async (req: AuthRequest, res) => {
  try {
    const { testWhoopConnection, getWhoopDataStats } = await import('../services/integrations/whoop.js');
    const result = await testWhoopConnection(req.userId!);
    const stats = getWhoopDataStats(req.userId!);
    res.json({ ...result, stats });
  } catch (error) {
    res.status(400).json({ connected: false, error: (error as Error).message });
  }
});

router.post('/:provider/sync', async (req: AuthRequest, res) => {
  const provider = String(req.params.provider);
  try {
    if (!SYNC_PROVIDERS.includes(provider) && provider !== 'apple_health') {
      return res.status(400).json({ error: `Sync not supported for ${provider}` });
    }
    const syncOptions = provider === 'apple_health' ? req.body?.data : req.body;
    const result = await syncProvider(req.userId!, provider, syncOptions);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

router.post('/apple_health/import', async (req: AuthRequest, res) => {
  try {
    const result = await syncProvider(req.userId!, 'apple_health', req.body);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

router.delete('/:provider', (req: AuthRequest, res) => {
  disconnectIntegration(req.userId!, String(req.params.provider));
  res.json({ success: true });
});

router.post('/sync-all', async (req: AuthRequest, res) => {
  const userId = req.userId!;
  const statuses = getIntegrationStatus(userId);
  const results: Record<string, unknown> = {};

  const googleConnected = statuses.some(s => s.connected && ['google', 'google_calendar', 'gmail'].includes(s.provider));
  if (googleConnected) {
    try {
      results.google = await syncGoogleAll(userId);
    } catch (e) {
      results.google = { error: (e as Error).message };
    }
  }

  for (const s of statuses) {
    if (!s.connected || !SYNC_PROVIDERS.includes(s.provider)) continue;
    if (['google', 'google_calendar', 'gmail'].includes(s.provider)) continue;
    try {
      results[s.provider] = await syncProvider(userId, s.provider);
    } catch (e) {
      results[s.provider] = { error: (e as Error).message };
    }
  }

  const learning = runLearningCycle(userId);
  res.json({ ...results, learning });
});

export default router;
