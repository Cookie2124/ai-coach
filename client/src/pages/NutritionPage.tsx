import { useEffect, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { api } from '../services/api';
import { StatCard, ProgressBar, LoadingSpinner } from '../components/ui';

export default function NutritionPage() {
  const [analytics, setAnalytics] = useState<Record<string, unknown> | null>(null);
  const [meals, setMeals] = useState<Record<string, unknown>[]>([]);
  const [description, setDescription] = useState('');
  const [loading, setLoading] = useState(true);

  const load = () => {
    Promise.all([api.nutrition(), api.data.getMeals()])
      .then(([a, m]) => { setAnalytics(a); setMeals(m as Record<string, unknown>[]); })
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const logMeal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!description.trim()) return;
    await api.data.logMeal({ description });
    setDescription('');
    load();
  };

  if (loading) return <LoadingSpinner />;

  const today = analytics?.today as Record<string, number>;
  const targets = analytics?.targets as Record<string, number>;
  const perKg = analytics?.perKg as Record<string, number>;
  const weeklyAvg = analytics?.weeklyAvg as Record<string, number>;

  return (
    <div className="space-y-6 animate-fade-in">
      <h1 className="text-2xl font-bold">Nutrition</h1>

      <form onSubmit={logMeal} className="card p-4 flex gap-2">
        <input className="input flex-1" value={description} onChange={e => setDescription(e.target.value)}
          placeholder='Log naturally: "I ate 250g chicken and rice"' />
        <button type="submit" className="btn-primary flex items-center gap-2"><Plus className="w-4 h-4" /> Log</button>
      </form>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard title="Calories" value={Math.round(today?.calories ?? 0)} subtitle={`/ ${targets?.calories ?? 2500}`} />
        <StatCard title="Protein" value={`${Math.round(today?.protein_g ?? 0)}g`} subtitle={`/ ${targets?.protein ?? 150}g`} />
        <StatCard title="Carbs" value={`${Math.round(today?.carbs_g ?? 0)}g`} subtitle={`/ ${targets?.carbs ?? 300}g`} />
        <StatCard title="Fat" value={`${Math.round(today?.fat_g ?? 0)}g`} subtitle={`/ ${targets?.fat ?? 80}g`} />
      </div>

      <div className="card p-4 md:p-6 space-y-4">
        <h3 className="font-semibold">Macro Adherence</h3>
        <ProgressBar value={today?.calories ?? 0} max={targets?.calories ?? 2500} label="Calories" color="bg-orange-500" />
        <ProgressBar value={today?.protein_g ?? 0} max={targets?.protein ?? 150} label="Protein" color="bg-red-500" />
        <ProgressBar value={today?.carbs_g ?? 0} max={targets?.carbs ?? 300} label="Carbs" color="bg-yellow-500" />
        <ProgressBar value={today?.fat_g ?? 0} max={targets?.fat ?? 80} label="Fat" color="bg-purple-500" />
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <div className="card p-4">
          <h3 className="font-semibold mb-3">Per kg Body Weight (Today)</h3>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>Protein: <strong>{perKg?.protein ?? 0}g/kg</strong></div>
            <div>Carbs: <strong>{perKg?.carbs ?? 0}g/kg</strong></div>
            <div>Fat: <strong>{perKg?.fat ?? 0}g/kg</strong></div>
            <div>Calories: <strong>{perKg?.calories ?? 0}/kg</strong></div>
          </div>
        </div>
        <div className="card p-4">
          <h3 className="font-semibold mb-3">Weekly Averages</h3>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>Calories: <strong>{weeklyAvg?.calories ?? 0}</strong></div>
            <div>Protein: <strong>{weeklyAvg?.protein ?? 0}g</strong></div>
            <div>Carbs: <strong>{weeklyAvg?.carbs ?? 0}g</strong></div>
            <div>Fat: <strong>{weeklyAvg?.fat ?? 0}g</strong></div>
          </div>
        </div>
      </div>

      <div className="card p-4">
        <h3 className="font-semibold mb-3">Recent Meals</h3>
        {meals.length === 0 ? (
          <p className="text-gray-500 text-sm">No meals logged yet. Try the AI chat or log above.</p>
        ) : (
          <div className="space-y-2">
            {meals.slice(0, 20).map((meal) => (
              <div key={meal.id as string} className="flex justify-between items-center py-2 border-b border-gray-100 dark:border-gray-800 last:border-0">
                <div>
                  <p className="text-sm font-medium">{meal.description as string}</p>
                  <p className="text-xs text-gray-500">{new Date(meal.logged_at as string).toLocaleString()}</p>
                </div>
                <div className="text-right text-sm">
                  <div>{Math.round(meal.calories as number)} cal</div>
                  <div className="text-xs text-gray-500">P:{Math.round(meal.protein_g as number)}g C:{Math.round(meal.carbs_g as number)}g</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
