import { useEffect, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { api } from '../services/api';
import { StatCard, ProgressBar, LoadingSpinner } from '../components/ui';
import { fmtGrams, fmtCalories } from '../utils/format';

type Meal = {
  id: string;
  description: string;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  meal_type: string;
  logged_at: string;
};

function formatDayHeader(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const dateStr = d.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
  if (d.toDateString() === today.toDateString()) return `Today — ${dateStr}`;
  if (d.toDateString() === yesterday.toDateString()) return `Yesterday — ${dateStr}`;
  return dateStr;
}

function groupMealsByDay(meals: Meal[]): { day: string; meals: Meal[]; totals: { calories: number; protein: number } }[] {
  const groups = new Map<string, Meal[]>();
  for (const meal of meals) {
    const day = meal.logged_at.split('T')[0];
    if (!groups.has(day)) groups.set(day, []);
    groups.get(day)!.push(meal);
  }
  return Array.from(groups.entries())
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([day, dayMeals]) => ({
      day,
      meals: dayMeals.sort((a, b) => new Date(b.logged_at).getTime() - new Date(a.logged_at).getTime()),
      totals: {
        calories: dayMeals.reduce((s, m) => s + m.calories, 0),
        protein: dayMeals.reduce((s, m) => s + m.protein_g, 0),
      },
    }));
}

export default function NutritionPage() {
  const [analytics, setAnalytics] = useState<Record<string, unknown> | null>(null);
  const [meals, setMeals] = useState<Meal[]>([]);
  const [description, setDescription] = useState('');
  const [loading, setLoading] = useState(true);

  const load = () => {
    Promise.all([api.nutrition(), api.data.getMeals()])
      .then(([a, m]) => { setAnalytics(a); setMeals(m as Meal[]); })
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

  const removeMeal = async (meal: Meal) => {
    if (!confirm(`Remove "${meal.description}" from ${new Date(meal.logged_at).toLocaleString()}?`)) return;
    await api.data.deleteMeal(meal.id);
    load();
  };

  if (loading) return <LoadingSpinner />;

  const today = analytics?.today as Record<string, number>;
  const targets = analytics?.targets as Record<string, number | null>;
  const configured = analytics?.configured as boolean;
  const perKg = analytics?.perKg as Record<string, number>;
  const weeklyAvg = analytics?.weeklyAvg as Record<string, number>;
  const grouped = groupMealsByDay(meals);

  const fmtTarget = (val: number | null | undefined, unit = '') =>
    val != null ? `${val}${unit}` : '—';

  return (
    <div className="space-y-6 animate-fade-in">
      <h1 className="text-2xl font-bold">Nutrition</h1>

      <form onSubmit={logMeal} className="card p-4 flex gap-2">
        <input className="input flex-1" value={description} onChange={e => setDescription(e.target.value)}
          placeholder='Log naturally: "I ate 250g chicken and rice" or use AI Coach' />
        <button type="submit" className="btn-primary flex items-center gap-2"><Plus className="w-4 h-4" /> Log</button>
      </form>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard title="Calories" value={Math.round(today?.calories ?? 0)} subtitle={configured ? `/ ${fmtTarget(targets?.calories)}` : 'Set weight for targets'} />
        <StatCard title="Protein" value={`${Math.round(today?.protein_g ?? 0)}g`} subtitle={configured ? `/ ${fmtTarget(targets?.protein, 'g')}` : undefined} />
        <StatCard title="Carbs" value={`${Math.round(today?.carbs_g ?? 0)}g`} subtitle={configured ? `/ ${fmtTarget(targets?.carbs, 'g')}` : undefined} />
        <StatCard title="Fat" value={`${Math.round(today?.fat_g ?? 0)}g`} subtitle={configured ? `/ ${fmtTarget(targets?.fat, 'g')}` : undefined} />
      </div>

      {configured && targets?.calories && (
      <div className="card p-4 md:p-6 space-y-4">
        <h3 className="font-semibold">Macro Adherence</h3>
        <ProgressBar value={today?.calories ?? 0} max={targets.calories} label="Calories" color="bg-orange-500" />
        {targets.protein && <ProgressBar value={today?.protein_g ?? 0} max={targets.protein} label="Protein" color="bg-red-500" />}
        {targets.carbs && <ProgressBar value={today?.carbs_g ?? 0} max={targets.carbs} label="Carbs" color="bg-yellow-500" />}
        {targets.fat && <ProgressBar value={today?.fat_g ?? 0} max={targets.fat} label="Fat" color="bg-purple-500" />}
      </div>
      )}

      {perKg && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard title="Protein/kg" value={`${perKg.protein?.toFixed(1)}g`} />
          <StatCard title="Weekly Avg Cal" value={Math.round(weeklyAvg?.calories ?? 0)} />
          <StatCard title="Weekly Avg Protein" value={`${Math.round(weeklyAvg?.protein ?? 0)}g`} />
        </div>
      )}

      <div className="card p-4 md:p-6">
        <h3 className="font-semibold mb-4">Meal History by Day</h3>
        {grouped.length === 0 ? (
          <p className="text-gray-500 text-sm">No meals logged yet. Use AI Coach ("Log: I ate...") or log above.</p>
        ) : (
          <div className="space-y-6">
            {grouped.map(group => (
              <div key={group.day}>
                <div className="flex justify-between items-center mb-2 pb-2 border-b border-gray-200 dark:border-gray-700">
                  <h4 className="font-medium text-sm">{formatDayHeader(group.meals[0].logged_at)}</h4>
                  <span className="text-xs text-gray-500">{fmtCalories(group.totals.calories)} · {fmtGrams(group.totals.protein)} protein</span>
                </div>
                <div className="space-y-2">
                  {group.meals.map(meal => (
                    <div key={meal.id} className="flex justify-between items-center gap-2 py-2 pl-2 border-l-2 border-brand-500/30 group">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium">{meal.description}</p>
                        <p className="text-xs text-gray-500">
                          {new Date(meal.logged_at).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}
                          {meal.meal_type !== 'other' && ` · ${meal.meal_type}`}
                        </p>
                      </div>
                      <div className="text-right text-sm shrink-0">
                        <div>{Math.round(meal.calories)} cal</div>
                        <div className="text-xs text-gray-500">P:{Math.round(meal.protein_g)}g C:{Math.round(meal.carbs_g)}g F:{Math.round(meal.fat_g)}g</div>
                      </div>
                      <button
                        onClick={() => removeMeal(meal)}
                        className="p-2 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 opacity-60 group-hover:opacity-100 transition-opacity shrink-0"
                        title="Remove meal"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
