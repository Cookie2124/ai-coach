import { useEffect, useState, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { RefreshCw, Check, X, Link2, Unlink, Upload, ChevronDown, ChevronUp, AlertCircle, Copy } from 'lucide-react';
import { api } from '../services/api';
import { LoadingSpinner } from '../components/ui';

interface ProviderInfo {
  name: string;
  description: string;
  supportsOAuth: boolean;
  supportsManual: boolean;
  supportsSync: boolean;
  supportsImport: boolean;
  hidden?: boolean;
}

interface IntegrationStatus {
  provider: string;
  enabled: number;
  connected: boolean;
  last_sync: string;
  sync_status: string;
}

export default function IntegrationsPage() {
  const [integrations, setIntegrations] = useState<IntegrationStatus[]>([]);
  const [providers, setProviders] = useState<Record<string, ProviderInfo>>({});
  const [oauthAvailable, setOauthAvailable] = useState<Record<string, boolean>>({});
  const [oauthCallbackUrl, setOauthCallbackUrl] = useState('');
  const [whoopRedirectUri, setWhoopRedirectUri] = useState('');
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [manualToken, setManualToken] = useState('');
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [whoopStats, setWhoopStats] = useState<Record<string, unknown> | null>(null);
  const [searchParams, setSearchParams] = useSearchParams();

  const [copiedRedirect, setCopiedRedirect] = useState(false);

  const copyRedirectUri = async () => {
    const uri = whoopRedirectUri || oauthCallbackUrl;
    if (!uri) return;
    await navigator.clipboard.writeText(uri);
    setCopiedRedirect(true);
    setTimeout(() => setCopiedRedirect(false), 2000);
  };

  const load = useCallback(() => {
    const clientOrigin = window.location.origin;
    Promise.all([api.integrations.list(), api.integrations.getProviders(clientOrigin)])
      .then(([list, meta]) => {
        setIntegrations(list as IntegrationStatus[]);
        setProviders(meta.providers as Record<string, ProviderInfo>);
        setOauthAvailable(meta.oauthAvailable as Record<string, boolean>);
        setOauthCallbackUrl((meta as { oauthCallbackUrl?: string }).oauthCallbackUrl ?? '');
        setWhoopRedirectUri((meta as { oauthSetup?: { whoop?: { redirectUri?: string } } }).oauthSetup?.whoop?.redirectUri ?? '');
        const whoopConnected = (list as IntegrationStatus[]).some(i => i.provider === 'whoop' && i.connected);
        if (whoopConnected) {
          api.integrations.whoopStatus().then(setWhoopStats).catch(() => setWhoopStats(null));
        } else {
          setWhoopStats(null);
        }
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
    const connected = searchParams.get('connected');
    const synced = searchParams.get('synced');
    const error = searchParams.get('error');
    if (connected) {
      setMessage({
        type: 'success',
        text: synced
          ? `Connected! Initial sync: ${decodeURIComponent(synced)}`
          : `Successfully connected ${connected.replace(/_/g, ' ')}!`,
      });
      setSearchParams({});
      load();
    }
    if (error) {
      setMessage({ type: 'error', text: decodeURIComponent(error) });
      setSearchParams({});
    }
  }, [load, searchParams, setSearchParams]);

  const getStatus = (provider: string) => integrations.find(i => i.provider === provider);

  const isGoogleConnected = () => ['google', 'google_calendar', 'gmail'].some(p => getStatus(p)?.connected);

  const isIpHostname = /^(\d{1,3}\.){3}\d{1,3}$/.test(window.location.hostname);
  const isTailscaleHost = window.location.hostname.endsWith('.ts.net');
  const isTailscaleHttps = isTailscaleHost && window.location.protocol === 'https:';
  const isTailscaleHttp = isTailscaleHost && window.location.protocol === 'http:';
  const appPort = window.location.port || '3001';
  const oauthRedirectUri = oauthCallbackUrl || `https://${window.location.hostname}:${appPort}/api/integrations/oauth/callback`;
  const googleLocalRedirect = `http://localhost:${appPort}/api/integrations/oauth/callback`;
  const google127Redirect = `http://127.0.0.1:${appPort}/api/integrations/oauth/callback`;

  const oauthBlockedMessage = (provider: string) => {
    if (isIpHostname) {
      return `${provider} does not accept IP addresses (like ${window.location.hostname}) as OAuth redirect URLs. `
        + `Open the app at your Tailscale HTTPS URL instead (e.g. https://pi.tailfa75f0.ts.net:${appPort}/integrations).`;
    }
    if (isTailscaleHttp) {
      return `${provider} OAuth requires HTTPS on Tailscale. `
        + `Use https://${window.location.hostname}:${appPort}/integrations instead of http.`;
    }
    return '';
  };

  const handleGoogleConnect = () => {
    const blocked = oauthBlockedMessage('Google');
    if (blocked) {
      setMessage({ type: 'error', text: blocked });
      return;
    }
    handleOAuthConnect('google');
  };

  const handleWhoopConnect = () => {
    const blocked = oauthBlockedMessage('WHOOP');
    if (blocked) {
      setMessage({ type: 'error', text: blocked });
      return;
    }
    handleOAuthConnect('whoop');
  };

  const handleOAuthConnect = async (provider: string) => {
    try {
      const { url } = await api.integrations.connect(provider, window.location.origin);
      window.location.href = url;
    } catch (err) {
      setMessage({ type: 'error', text: (err as Error).message });
    }
  };

  const handleManualConnect = async (provider: string) => {
    if (!manualToken.trim()) return;
    try {
      await api.integrations.configure(provider, {
        credentials: { access_token: manualToken },
        enabled: true,
      });
      setManualToken('');
      setExpanded(null);
      setMessage({ type: 'success', text: `${provider} connected with access token.` });
      load();
    } catch (err) {
      setMessage({ type: 'error', text: (err as Error).message });
    }
  };

  const handleSync = async (provider: string, options?: { fullHistory?: boolean }) => {
    setSyncing(options?.fullHistory ? `${provider}-full` : provider);
    try {
      const result = await api.integrations.sync(provider, options);
      const summary = Object.entries(result)
        .filter(([k]) => !['stats', 'errors', 'fullHistory'].includes(k))
        .map(([k, v]) => `${k}: ${v}`)
        .join(', ');
      const stats = result.stats as { recovery?: { earliest?: string; latest?: string; c?: number } } | undefined;
      const range = stats?.recovery?.earliest ? ` (${stats.recovery.earliest} → ${stats.recovery.latest}, ${stats.recovery.c} days)` : '';
      setMessage({
        type: 'success',
        text: options?.fullHistory
          ? `Full WHOOP history imported${range}. ${summary}`
          : `Synced ${provider} — ${summary}${range}`,
      });
      load();
    } catch (err) {
      setMessage({ type: 'error', text: `Sync failed: ${(err as Error).message}` });
    } finally {
      setSyncing(null);
    }
  };

  const handleDisconnect = async (provider: string) => {
    if (!confirm(`Disconnect ${provider}?`)) return;
    await api.integrations.disconnect(provider);
    setMessage({ type: 'success', text: `${provider} disconnected.` });
    load();
  };

  const handleSyncAll = async () => {
    setSyncing('all');
    try {
      const results = await api.integrations.syncAll();
      setMessage({ type: 'success', text: `Synced all: ${Object.keys(results).join(', ')}` });
      load();
    } catch (err) {
      setMessage({ type: 'error', text: (err as Error).message });
    } finally {
      setSyncing(null);
    }
  };

  const handleAppleHealthImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    try {
      let data: unknown;
      if (file.name.endsWith('.json')) {
        data = JSON.parse(text);
      } else {
        data = text;
      }
      const result = await api.integrations.importAppleHealth(data);
      setMessage({ type: 'success', text: `Imported: ${JSON.stringify(result)}` });
      load();
    } catch (err) {
      setMessage({ type: 'error', text: (err as Error).message });
    }
  };

  if (loading) return <LoadingSpinner />;

  const connectedCount = integrations.filter(i => i.connected).length;

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Integrations</h1>
          <p className="text-gray-500 mt-1">{connectedCount} connected — all data stored locally</p>
        </div>
        {connectedCount > 0 && (
          <button onClick={handleSyncAll} disabled={syncing === 'all'} className="btn-primary flex items-center gap-2 self-start">
            <RefreshCw className={`w-4 h-4 ${syncing === 'all' ? 'animate-spin' : ''}`} /> Sync All
          </button>
        )}
      </div>

      {message && (
        <div className={`p-4 rounded-xl flex items-start gap-3 ${message.type === 'success' ? 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400' : 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400'}`}>
          <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
          <p className="text-sm">{message.text}</p>
          <button onClick={() => setMessage(null)} className="ml-auto text-sm opacity-60 hover:opacity-100">Dismiss</button>
        </div>
      )}

      {oauthAvailable.google && (
        <div className="card p-4 md:p-6 border-2 border-blue-500/30 bg-blue-50/50 dark:bg-blue-900/10">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h3 className="font-semibold text-lg flex items-center gap-2">
                <svg className="w-5 h-5" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
                Connect Google
              </h3>
              <p className="text-sm text-gray-600 dark:text-gray-300 mt-1">
                One click connects <strong>Calendar + Gmail</strong>. Events, exams, matches, and emails sync automatically — AiCoach learns your schedule and personalizes advice.
              </p>
              {!isGoogleConnected() && (
                <div className="mt-3 space-y-2">
                  {(isIpHostname || isTailscaleHttp) && (
                    <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 text-xs text-amber-800 dark:text-amber-200">
                      <strong>{isIpHostname ? 'Google blocks IP redirect URLs' : 'Use HTTPS for OAuth'}</strong>
                      {isIpHostname && <> (including Tailscale <code>100.x.x.x</code>).</>}
                      {' '}Open the app at your Tailscale HTTPS URL, e.g.{' '}
                      <code>https://pi.tailfa75f0.ts.net:{appPort}/integrations</code>
                    </div>
                  )}
                  <details className="text-xs text-gray-500">
                    <summary className="cursor-pointer text-brand-500">Google Cloud setup (one-time)</summary>
                    <ol className="list-decimal list-inside mt-2 space-y-1">
                      <li>Go to <a href="https://console.cloud.google.com/apis/credentials" className="text-brand-500 underline" target="_blank" rel="noreferrer">Google Cloud Console</a></li>
                      <li>Create OAuth 2.0 credentials (Web application)</li>
                      <li>Enable <strong>Google Calendar API</strong> and <strong>Gmail API</strong></li>
                      <li>Add this redirect URI:
                        {isTailscaleHttps ? (
                          <code className="block mt-1 p-2 bg-white dark:bg-gray-800 rounded break-all">{oauthRedirectUri}</code>
                        ) : (
                          <>
                            <code className="block mt-1 p-2 bg-white dark:bg-gray-800 rounded break-all">{googleLocalRedirect}</code>
                            <code className="block mt-1 p-2 bg-white dark:bg-gray-800 rounded break-all">{google127Redirect}</code>
                            <span className="block mt-1 text-gray-400">Or your Tailscale HTTPS URL when using MagicDNS certificates.</span>
                          </>
                        )}
                      </li>
                      <li>Add <code>GOOGLE_CLIENT_ID</code> and <code>GOOGLE_CLIENT_SECRET</code> to your <code>.env</code></li>
                    </ol>
                  </details>
                </div>
              )}
            </div>
            {!isGoogleConnected() ? (
              <button onClick={handleGoogleConnect} className="btn-primary flex items-center gap-2 self-start px-6 py-3 text-base bg-blue-600 hover:bg-blue-700">
                <Link2 className="w-5 h-5" /> Connect Google Account
              </button>
            ) : (
              <div className="flex items-center gap-2">
                <span className="flex items-center gap-1 text-green-500 font-medium"><Check className="w-5 h-5" /> Connected</span>
                <button onClick={() => handleSync('google')} disabled={syncing === 'google'} className="btn-secondary flex items-center gap-1">
                  <RefreshCw className={`w-4 h-4 ${syncing === 'google' ? 'animate-spin' : ''}`} /> Sync Now
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {oauthAvailable.whoop && (
        <div className="card p-4 md:p-6 border-2 border-brand-500/30 bg-brand-50/50 dark:bg-brand-900/10">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h3 className="font-semibold text-lg">Connect WHOOP</h3>
              <p className="text-sm text-gray-600 dark:text-gray-300 mt-1">
                Connect once to import your <strong>full WHOOP history</strong> — every recovery, sleep, strain, and workout from when you first got your band until now.
              </p>
              {getStatus('whoop')?.connected && whoopStats && (
                <p className="text-xs text-gray-500 mt-2">
                  Stored locally: {(whoopStats.stats as { recovery?: { c: number; earliest: string; latest: string } })?.recovery?.c ?? 0} recovery days
                  {(whoopStats.stats as { recovery?: { earliest: string; latest: string } })?.recovery?.earliest && (
                    <> · {(whoopStats.stats as { recovery: { earliest: string; latest: string } }).recovery.earliest} → {(whoopStats.stats as { recovery: { earliest: string; latest: string } }).recovery.latest}</>
                  )}
                </p>
              )}
              {(whoopRedirectUri || oauthCallbackUrl) && (
                <div className="mt-3 p-3 rounded-xl bg-white dark:bg-gray-800 border border-brand-500/20">
                  <p className="text-xs font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Step 1 — Add this <strong>exact</strong> Redirect URI in the{' '}
                    <a href="https://developer-dashboard.whoop.com" className="text-brand-500 hover:underline" target="_blank" rel="noreferrer">WHOOP Developer Dashboard</a>:
                  </p>
                  <div className="flex gap-2 items-start">
                    <code className="flex-1 p-2 bg-gray-50 dark:bg-gray-900 rounded text-xs break-all">{whoopRedirectUri || oauthCallbackUrl}</code>
                    <button type="button" onClick={copyRedirectUri} className="btn-secondary text-xs px-3 shrink-0">
                      {copiedRedirect ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                    </button>
                  </div>
                  <ul className="mt-2 text-xs text-gray-500 space-y-1 list-disc pl-4">
                    {isTailscaleHttps ? (
                      <>
                        <li>Using Tailscale HTTPS — OAuth works directly from this URL</li>
                        <li>Register the URI above exactly in WHOOP (no trailing slash)</li>
                      </>
                    ) : (
                      <>
                        <li>Use <strong>https://your-pi.your-tailnet.ts.net:{appPort}</strong> with Tailscale HTTPS enabled</li>
                        <li>Raw IP addresses are not accepted — switch to your MagicDNS hostname</li>
                        <li>No trailing slash — restart server after .env changes, then Connect</li>
                      </>
                    )}
                  </ul>
                </div>
              )}
            </div>
            {!getStatus('whoop')?.connected ? (
              <button onClick={handleWhoopConnect} className="btn-primary flex items-center gap-2 self-start px-6 py-3 text-base">
                <Link2 className="w-5 h-5" /> Connect WHOOP
              </button>
            ) : (
              <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2">
                <span className="flex items-center gap-1 text-green-500 font-medium"><Check className="w-5 h-5" /> Connected</span>
                <button onClick={() => handleSync('whoop')} disabled={!!syncing} className="btn-secondary flex items-center gap-1 text-sm">
                  <RefreshCw className={`w-4 h-4 ${syncing === 'whoop' ? 'animate-spin' : ''}`} /> Sync Recent
                </button>
                <button
                  onClick={() => handleSync('whoop', { fullHistory: true })}
                  disabled={!!syncing}
                  className="btn-primary flex items-center gap-1 text-sm"
                >
                  <RefreshCw className={`w-4 h-4 ${syncing === 'whoop-full' ? 'animate-spin' : ''}`} /> Import All History
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      <div className="space-y-3">
        {Object.entries(providers).filter(([id, info]) => !info.hidden && id !== 'google').map(([id, info]) => {
          const status = getStatus(id);
          const connected = status?.connected;
          const isExpanded = expanded === id;
          const hasOAuth = oauthAvailable[id];

          return (
            <div key={id} className="card overflow-hidden">
              <div className="p-4 flex items-center justify-between">
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold">{info.name}</h3>
                  <p className="text-sm text-gray-500">{info.description}</p>
                  {status?.last_sync && (
                    <p className="text-xs text-gray-400 mt-1">
                      Last sync: {status.last_sync} {status.sync_status === 'error' && '(failed)'}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-2 flex-shrink-0 ml-4">
                  {connected ? (
                    <>
                      <span className="hidden sm:flex items-center gap-1 text-green-500 text-sm"><Check className="w-4 h-4" /> Connected</span>
                      {info.supportsSync && (
                        <button onClick={() => handleSync(id)} disabled={syncing === id} className="btn-secondary flex items-center gap-1 text-sm px-3 py-2">
                          <RefreshCw className={`w-4 h-4 ${syncing === id ? 'animate-spin' : ''}`} />
                          <span className="hidden sm:inline">Sync</span>
                        </button>
                      )}
                      <button onClick={() => handleDisconnect(id)} className="p-2 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 text-red-400" title="Disconnect">
                        <Unlink className="w-4 h-4" />
                      </button>
                    </>
                  ) : (
                    <>
                      {info.supportsOAuth && hasOAuth && (
                        <button onClick={() => handleOAuthConnect(id)} className="btn-primary flex items-center gap-1 text-sm px-3 py-2">
                          <Link2 className="w-4 h-4" /> Connect
                        </button>
                      )}
                      {(info.supportsManual || (!hasOAuth && id !== 'apple_health')) && (
                        <button onClick={() => setExpanded(isExpanded ? null : id)} className="btn-secondary flex items-center gap-1 text-sm px-3 py-2">
                          {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                          Token
                        </button>
                      )}
                      {info.supportsImport && (
                        <label className="btn-secondary flex items-center gap-1 text-sm px-3 py-2 cursor-pointer">
                          <Upload className="w-4 h-4" /> Import
                          <input type="file" accept=".xml,.json,.zip" className="hidden" onChange={handleAppleHealthImport} />
                        </label>
                      )}
                      {!connected && !hasOAuth && !info.supportsImport && (
                        <span className="text-gray-400 text-sm flex items-center gap-1"><X className="w-4 h-4" /> Not connected</span>
                      )}
                    </>
                  )}
                </div>
              </div>

              {isExpanded && !connected && (
                <div className="px-4 pb-4 border-t border-gray-100 dark:border-gray-800 pt-4">
                  <p className="text-sm text-gray-500 mb-3">
                    {hasOAuth
                      ? 'OAuth is configured in .env. You can also paste an access token manually:'
                      : 'Paste your API access token. Add OAuth credentials to .env for one-click connect.'}
                  </p>
                  <div className="flex gap-2">
                    <input className="input flex-1" type="password" placeholder="Access token" value={manualToken} onChange={e => setManualToken(e.target.value)} />
                    <button onClick={() => handleManualConnect(id)} disabled={!manualToken} className="btn-primary">Save</button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="card p-4 bg-brand-50 dark:bg-brand-900/20">
        <h3 className="font-semibold mb-2">Setup OAuth (optional)</h3>
        <p className="text-sm text-gray-600 dark:text-gray-300">
          For one-click connect, add OAuth client credentials to your <code className="text-xs bg-white dark:bg-gray-800 px-1 rounded">.env</code> file.
          Without them, use manual token entry. All imported data is stored permanently on your local machine.
        </p>
        <ul className="text-xs text-gray-500 mt-2 space-y-1 list-disc list-inside">
          <li>WHOOP: <a href="https://developer.whoop.com" className="text-brand-500 hover:underline" target="_blank" rel="noreferrer">developer.whoop.com</a></li>
          <li>Google: Enable Calendar + Gmail APIs, add redirect URI — see Connect Google card above</li>
          <li>Microsoft: <a href="https://portal.azure.com" className="text-brand-500 hover:underline" target="_blank" rel="noreferrer">Azure Portal</a></li>
          <li>Strava: <a href="https://developers.strava.com" className="text-brand-500 hover:underline" target="_blank" rel="noreferrer">developers.strava.com</a></li>
        </ul>
      </div>
    </div>
  );
}
