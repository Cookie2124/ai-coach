import { useCallback, useEffect, useState } from 'react';
import { Scale, Plus, Trash2 } from 'lucide-react';
import { api } from '../services/api';
import { fmtWeight } from '../utils/format';
import { toLocalDateInput } from '../utils/date';

type WeightEntry = {
  id: string;
  weight_kg: number;
  body_fat_pct?: number | null;
  notes?: string | null;
  recorded_at: string;
};

function toLocalTimeInput(d = new Date()): string {
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function formatWeightTimestamp(recorded_at: string): string {
  const iso = recorded_at.includes('T') ? recorded_at : `${recorded_at}T12:00:00`;
  return new Date(iso).toLocaleString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export default function WeightLogCard({ onLogged }: { onLogged?: () => void }) {
  const [weightKg, setWeightKg] = useState('');
  const [notes, setNotes] = useState('');
  const [date, setDate] = useState(toLocalDateInput());
  const [time, setTime] = useState(toLocalTimeInput());
  const [history, setHistory] = useState<WeightEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const loadHistory = useCallback(() => {
    api.data.getWeights().then(setHistory).catch(() => setHistory([]));
  }, []);

  useEffect(() => { loadHistory(); }, [loadHistory]);

  const setNow = () => {
    setDate(toLocalDateInput());
    setTime(toLocalTimeInput());
  };

  const logWeight = async (e: React.FormEvent) => {
    e.preventDefault();
    const kg = parseFloat(weightKg);
    if (!kg || kg <= 0) return;
    setLoading(true);
    setMessage(null);
    try {
      await api.data.logWeight({
        weight_kg: kg,
        notes: notes.trim() || undefined,
        date,
        time,
      });
      setWeightKg('');
      setNotes('');
      setNow();
      setMessage(`Logged ${kg} kg`);
      loadHistory();
      onLogged?.();
      window.dispatchEvent(new CustomEvent('aicoach-data-updated'));
    } catch (err) {
      setMessage((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const removeEntry = async (entry: WeightEntry) => {
    if (!confirm(`Remove ${entry.weight_kg} kg from ${formatWeightTimestamp(entry.recorded_at)}?`)) return;
    await api.data.deleteWeight(entry.id);
    loadHistory();
    onLogged?.();
    window.dispatchEvent(new CustomEvent('aicoach-data-updated'));
  };

  return (
    <div className="card p-4 md:p-6 space-y-4">
      <h3 className="font-semibold flex items-center gap-2">
        <Scale className="w-4 h-4" /> Log Weight
      </h3>
      <form onSubmit={logWeight} className="space-y-3">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="col-span-2 sm:col-span-1">
            <label className="text-xs text-gray-500 block mb-1">Weight (kg)</label>
            <input
              className="input w-full"
              type="number"
              step="0.1"
              min="1"
              max="500"
              placeholder="82.5"
              value={weightKg}
              onChange={e => setWeightKg(e.target.value)}
              required
            />
          </div>
          <div>
            <label className="text-xs text-gray-500 block mb-1">Date</label>
            <input className="input w-full" type="date" value={date} onChange={e => setDate(e.target.value)} required />
          </div>
          <div>
            <label className="text-xs text-gray-500 block mb-1">Time</label>
            <input className="input w-full" type="time" value={time} onChange={e => setTime(e.target.value)} required />
          </div>
        </div>
        <div>
          <label className="text-xs text-gray-500 block mb-1">Notes (optional)</label>
          <input
            className="input w-full"
            placeholder="e.g. morning, after workout"
            value={notes}
            onChange={e => setNotes(e.target.value)}
          />
        </div>
        <div className="flex flex-wrap gap-2 items-center">
          <button type="submit" disabled={loading || !weightKg} className="btn-primary flex items-center gap-2 disabled:opacity-50">
            <Plus className="w-4 h-4" /> {loading ? 'Saving…' : 'Log Weight'}
          </button>
          <button type="button" onClick={setNow} className="btn-secondary text-sm">Now</button>
          {message && (
            <span className={`text-sm ${message.startsWith('Logged') ? 'text-green-600 dark:text-green-400' : 'text-red-600'}`}>
              {message}
            </span>
          )}
        </div>
      </form>

      {history.length > 0 && (
        <div className="border-t border-gray-100 dark:border-gray-800 pt-4">
          <p className="text-xs font-medium text-gray-500 mb-2">Recent weigh-ins</p>
          <ul className="space-y-2 max-h-48 overflow-y-auto">
            {history.slice(0, 12).map(entry => (
              <li key={entry.id} className="flex items-center justify-between gap-2 text-sm py-1.5 px-2 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800/50">
                <div className="min-w-0">
                  <span className="font-semibold">{fmtWeight(entry.weight_kg)}</span>
                  <span className="text-gray-500 ml-2">{formatWeightTimestamp(entry.recorded_at)}</span>
                  {entry.notes && entry.notes !== 'Logged in app' && (
                    <span className="text-gray-400 ml-1">· {entry.notes}</span>
                  )}
                  {entry.notes?.includes('WHOOP') && (
                    <span className="text-[10px] ml-1 text-brand-500">WHOOP</span>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => removeEntry(entry)}
                  className="p-1.5 text-gray-400 hover:text-red-500 shrink-0"
                  title="Remove"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
