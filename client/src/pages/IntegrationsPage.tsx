import { useEffect, useState } from 'react';
import { RefreshCw, Check, X } from 'lucide-react';
import { api } from '../services/api';
import { LoadingSpinner } from '../components/ui';

const providers = [
  { id: 'whoop', name: 'WHOOP', description: 'Recovery, sleep, strain, workouts' },
  { id: 'google_calendar', name: 'Google Calendar', description: 'Events and schedule' },
  { id: 'outlook_calendar', name: 'Outlook Calendar', description: 'Events and schedule' },
  { id: 'gmail', name: 'Gmail', description: 'Email integration' },
  { id: 'outlook_email', name: 'Outlook Email', description: 'Email integration' },
  { id: 'apple_health', name: 'Apple Health', description: 'Health metrics (optional)' },
  { id: 'garmin', name: 'Garmin', description: 'Activity data (optional)' },
  { id: 'strava', name: 'Strava', description: 'Activity data (optional)' },
];

export default function IntegrationsPage() {
  const [integrations, setIntegrations] = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [whoopToken, setWhoopToken] = useState('');

  const load = () => {
    api.integrations.list().then(setIntegrations as (v: unknown[]) => void).finally(() => setLoading(false));
  };

  useEffect(load, []);

  const configureWhoop = async () => {
    await api.integrations.configure('whoop', { credentials: { access_token: whoopToken }, enabled: true });
    setWhoopToken('');
    load();
  };

  const syncWhoop = async () => {
    setSyncing(true);
    try {
      const result = await api.integrations.syncWhoop();
      alert(`Synced: ${result.recovery} recovery, ${result.sleep} sleep, ${result.workouts} workouts`);
    } catch (err) {
      alert(`Sync failed: ${(err as Error).message}`);
    } finally {
      setSyncing(false);
    }
  };

  if (loading) return <LoadingSpinner />;

  const getStatus = (provider: string) => {
    return integrations.find(i => i.provider === provider) as Record<string, unknown> | undefined;
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold">Integrations</h1>
        <p className="text-gray-500 mt-1">Connect external services — all data stored locally</p>
      </div>

      <div className="space-y-3">
        {providers.map(p => {
          const status = getStatus(p.id);
          const enabled = status?.enabled;
          return (
            <div key={p.id} className="card p-4 flex items-center justify-between">
              <div>
                <h3 className="font-semibold">{p.name}</h3>
                <p className="text-sm text-gray-500">{p.description}</p>
                {status?.last_sync ? (
                  <p className="text-xs text-gray-400 mt-1">Last sync: {String(status.last_sync)}</p>
                ) : null}
              </div>
              <div className="flex items-center gap-2">
                {enabled ? (
                  <>
                    <span className="flex items-center gap-1 text-green-500 text-sm"><Check className="w-4 h-4" /> Connected</span>
                    {p.id === 'whoop' && (
                      <button onClick={syncWhoop} disabled={syncing} className="btn-secondary flex items-center gap-1 text-sm">
                        <RefreshCw className={`w-4 h-4 ${syncing ? 'animate-spin' : ''}`} /> Sync
                      </button>
                    )}
                  </>
                ) : (
                  <span className="text-gray-400 text-sm flex items-center gap-1"><X className="w-4 h-4" /> Not connected</span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <div className="card p-4">
        <h3 className="font-semibold mb-3">Configure WHOOP</h3>
        <p className="text-sm text-gray-500 mb-3">Enter your WHOOP API access token. Get one from the WHOOP Developer Dashboard.</p>
        <div className="flex gap-2">
          <input className="input flex-1" type="password" placeholder="WHOOP access token" value={whoopToken} onChange={e => setWhoopToken(e.target.value)} />
          <button onClick={configureWhoop} disabled={!whoopToken} className="btn-primary">Connect</button>
        </div>
      </div>

      <div className="card p-4 bg-brand-50 dark:bg-brand-900/20 border-brand-200 dark:border-brand-800">
        <p className="text-sm">
          <strong>Note:</strong> AiCoach works fully without any integrations. Connect services to automatically import data.
          All imported data is stored permanently on your local machine.
        </p>
      </div>
    </div>
  );
}
