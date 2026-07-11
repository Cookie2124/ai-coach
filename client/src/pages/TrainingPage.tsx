import { useEffect, useState } from 'react';
import { Plus } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { api } from '../services/api';
import { StatCard, LoadingSpinner } from '../components/ui';

export default function TrainingPage() {
  const [training, setTraining] = useState<Record<string, unknown> | null>(null);
  const [workouts, setWorkouts] = useState<Record<string, unknown>[]>([]);
  const [strength, setStrength] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ activity_type: 'gym', duration_minutes: 60, strain: 10, notes: '' });

  const load = () => {
    Promise.all([api.training(), api.data.getWorkouts(), api.strength()])
      .then(([t, w, s]) => { setTraining(t); setWorkouts(w as Record<string, unknown>[]); setStrength(s); })
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const logWorkout = async (e: React.FormEvent) => {
    e.preventDefault();
    await api.data.logWorkout(form);
    setShowForm(false);
    load();
  };

  if (loading) return <LoadingSpinner />;

  const byType = training?.weeklyByType as Record<string, number> ?? {};
  const chartData = Object.entries(byType).map(([type, load]) => ({ type, load }));

  const strengthData = strength?.byExercise as Record<string, { latest: number; best: number; trend: string; relativeStrength: number }> ?? {};

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold">Training</h1>
        <button onClick={() => setShowForm(!showForm)} className="btn-primary flex items-center gap-2">
          <Plus className="w-4 h-4" /> Log Workout
        </button>
      </div>

      {showForm && (
        <form onSubmit={logWorkout} className="card p-4 grid sm:grid-cols-2 gap-3">
          <select className="input" value={form.activity_type} onChange={e => setForm({ ...form, activity_type: e.target.value })}>
            {['running', 'rugby', 'gym', 'strength_trainer', 'weightlifting', 'walking', 'cycling', 'swimming'].map(t =>
              <option key={t} value={t}>{t.replace('_', ' ')}</option>)}
          </select>
          <input className="input" type="number" placeholder="Duration (min)" value={form.duration_minutes}
            onChange={e => setForm({ ...form, duration_minutes: +e.target.value })} />
          <input className="input" type="number" placeholder="Strain (0-21)" value={form.strain}
            onChange={e => setForm({ ...form, strain: +e.target.value })} />
          <input className="input" placeholder="Notes" value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} />
          <button type="submit" className="btn-primary sm:col-span-2">Save Workout</button>
        </form>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard title="Weekly Sessions" value={Number(training?.weeklySessions ?? 0)} />
        <StatCard title="Acute Load" value={Number(training?.acuteLoad ?? 0)} subtitle="7-day avg strain" />
        <StatCard title="Chronic Load" value={Number(training?.chronicLoad ?? 0)} subtitle="28-day avg strain" />
        <StatCard title="ACWR" value={Number(training?.acwr ?? 0)} subtitle={training?.overtrainingRisk === 'high' ? '⚠ Overtraining risk' : 'Training balance'} />
      </div>

      {chartData.length > 0 && (
        <div className="card p-4">
          <h3 className="font-semibold mb-4">Weekly Load by Activity</h3>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={chartData}>
              <XAxis dataKey="type" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip />
              <Bar dataKey="load" fill="#0ea5e9" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {Object.keys(strengthData).length > 0 && (
        <div className="card p-4">
          <h3 className="font-semibold mb-3">Strength Progress</h3>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {Object.entries(strengthData).map(([ex, data]) => (
              <div key={ex} className="p-3 rounded-xl bg-gray-50 dark:bg-gray-800">
                <div className="font-medium capitalize">{ex.replace('_', ' ')}</div>
                <div className="text-2xl font-bold mt-1">{data.latest}kg</div>
                <div className="text-xs text-gray-500 mt-1">
                  Best: {data.best}kg | {data.relativeStrength}x BW | {data.trend}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="card p-4">
        <h3 className="font-semibold mb-3">Recent Workouts</h3>
        {workouts.length === 0 ? (
          <p className="text-gray-500 text-sm">No workouts logged yet.</p>
        ) : (
          <div className="space-y-2">
            {workouts.slice(0, 15).map(w => (
              <div key={w.id as string} className="flex justify-between py-2 border-b border-gray-100 dark:border-gray-800 last:border-0">
                <div>
                  <span className="font-medium capitalize">{(w.activity_type as string).replace('_', ' ')}</span>
                  <span className="text-xs text-gray-500 ml-2">{w.date as string}</span>
                </div>
                <div className="text-sm text-gray-500">
                  {w.duration_minutes as number}min | Strain: {w.strain as number ?? '--'}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
