import { useEffect, useState, useCallback, useRef } from 'react';
import { Plus, Trash2, ChevronLeft, ChevronRight, Calendar } from 'lucide-react';
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

function toDateInput(d: Date): string {
  return d.toISOString().split('T')[0];
}

function formatNotchDate(iso: string): string {
  const d = new Date(`${iso}T12:00:00`);
  const today = toDateInput(new Date());
  const yesterday = toDateInput(new Date(Date.now() - 86400000));
  const label = d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
  if (iso === today) return `Today · ${label}`;
  if (iso === yesterday) return `Yesterday · ${label}`;
  return label;
}

export default function NutritionPage() {
  const [selectedDate, setSelectedDate] = useState(toDateInput(new Date()));
  const [analytics, setAnalytics] = useState<Record<string, unknown> | null>(null);
  const [meals, setMeals] = useState<Meal[]>([]);
  const [mealIndex, setMealIndex] = useState(0);
  const [description, setDescription] = useState('');
  const [loading, setLoading] = useState(true);
  const dateInputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(() => {
    setLoading(true);
    Promise.all([api.nutrition(selectedDate), api.data.getMeals(selectedDate)])
      .then(([a, m]) => {
        setAnalytics(a);
        const sorted = (m as Meal[]).sort(
          (a, b) => new Date(a.logged_at).getTime() - new Date(b.logged_at).getTime(),
        );
        setMeals(sorted);
        setMealIndex(i => (sorted.length ? Math.min(i, sorted.length - 1) : 0));
      })
      .finally(() => setLoading(false));
  }, [selectedDate]);

  useEffect(() => { load(); }, [load]);

  const shiftDate = (delta: number) => {
    const d = new Date(`${selectedDate}T12:00:00`);
    d.setDate(d.getDate() + delta);
    setSelectedDate(toDateInput(d));
    setMealIndex(0);
  };

  const logMeal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!description.trim()) return;
    await api.data.logMeal({ description, logged_at: `${selectedDate}T12:00:00` });
    setDescription('');
    load();
  };

  const removeMeal = async (meal: Meal) => {
    if (!confirm(`Remove "${meal.description}"?`)) return;
    await api.data.deleteMeal(meal.id);
    load();
  };

  if (loading && !analytics) return <LoadingSpinner />;

  const day = analytics?.today as Record<string, number>;
  const targets = analytics?.targets as Record<string, number | null>;
  const configured = analytics?.configured as boolean;
  const perKg = analytics?.perKg as Record<string, number>;
  const weeklyAvg = analytics?.weeklyAvg as Record<string, number>;
  const remaining = analytics?.remaining as Record<string, number | null>;
  const macroSplit = analytics?.macroSplit as Record<string, number> | null;
  const adherence = analytics?.adherence as Record<string, number>;

  const currentMeal = meals[mealIndex];
  const fmtTarget = (val: number | null | undefined, unit = '') =>
    val != null ? `${val}${unit}` : '—';

  return (
    <div className="space-y-5 animate-fade-in pb-4">
      {/* Date notch */}
      <div className="sticky top-0 z-20 -mx-3 sm:-mx-4 md:-mx-6 px-3 sm:px-4 md:px-6 pt-1 pb-3 bg-gray-50/95 dark:bg-gray-950/95 backdrop-blur border-b border-gray-200/80 dark:border-gray-800/80">
        <div className="max-w-lg mx-auto">
          <div className="rounded-2xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 shadow-sm px-2 py-2 flex items-center gap-1">
            <button type="button" onClick={() => shiftDate(-1)} className="p-2 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-800 touch-target" aria-label="Previous day">
              <ChevronLeft className="w-5 h-5" />
            </button>
            <label className="flex-1 flex flex-col items-center cursor-pointer min-w-0">
              <span className="text-[10px] uppercase tracking-wider text-gray-400 font-medium">Nutrition</span>
              <span className="font-semibold text-sm truncate max-w-full">{formatNotchDate(selectedDate)}</span>
              <input
                ref={dateInputRef}
                type="date"
                value={selectedDate}
                onChange={e => { setSelectedDate(e.target.value); setMealIndex(0); }}
                className="sr-only"
              />
            </label>
            <button type="button" onClick={() => shiftDate(1)} className="p-2 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-800 touch-target" aria-label="Next day">
              <ChevronRight className="w-5 h-5" />
            </button>
            <button
              type="button"
              onClick={() => dateInputRef.current?.showPicker?.()}
              className="p-2 rounded-xl text-brand-600 hover:bg-brand-50 dark:hover:bg-brand-900/20 touch-target"
              aria-label="Pick date"
            >
              <Calendar className="w-5 h-5" />
            </button>
          </div>
        </div>
      </div>

      <form onSubmit={logMeal} className="card p-4 mobile-stack">
        <input className="input flex-1" value={description} onChange={e => setDescription(e.target.value)}
          placeholder={`Log meal for ${formatNotchDate(selectedDate).split(' · ')[0]}…`} />
        <button type="submit" className="btn-primary flex items-center justify-center gap-2 sm:shrink-0">
          <Plus className="w-4 h-4" /> Log Meal
        </button>
      </form>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard title="Calories" value={Math.round(day?.calories ?? 0)} subtitle={configured ? `/ ${fmtTarget(targets?.calories)}` : undefined} />
        <StatCard title="Protein" value={`${Math.round(day?.protein_g ?? 0)}g`} subtitle={configured ? `/ ${fmtTarget(targets?.protein, 'g')}` : undefined} />
        <StatCard title="Meals" value={day?.mealCount ?? meals.length} subtitle="logged today" />
        <StatCard title="Remaining" value={remaining?.calories != null ? `${remaining.calories} cal` : '—'} subtitle={remaining?.protein != null ? `${remaining.protein}g protein left` : undefined} />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard title="Carbs" value={`${Math.round(day?.carbs_g ?? 0)}g`} subtitle={configured ? `${adherence?.carbs ?? 0}% of target` : undefined} />
        <StatCard title="Fat" value={`${Math.round(day?.fat_g ?? 0)}g`} subtitle={configured ? `${adherence?.fat ?? 0}% of target` : undefined} />
        {perKg && <StatCard title="Protein/kg" value={`${perKg.protein?.toFixed(1)}g`} subtitle="body weight" />}
        {macroSplit && (
          <StatCard title="Macro split" value={`${macroSplit.proteinPct}/${macroSplit.carbsPct}/${macroSplit.fatPct}`} subtitle="P/C/F %" />
        )}
      </div>

      {configured && targets?.calories && (
        <div className="card p-4 space-y-3">
          <h3 className="font-semibold text-sm">Macro Adherence</h3>
          <ProgressBar value={day?.calories ?? 0} max={targets.calories} label="Calories" color="bg-orange-500" />
          {targets.protein && <ProgressBar value={day?.protein_g ?? 0} max={targets.protein} label="Protein" color="bg-red-500" />}
        </div>
      )}

      {weeklyAvg && (
        <p className="text-xs text-center text-gray-500">
          7-day avg: {Math.round(weeklyAvg.calories)} cal · {Math.round(weeklyAvg.protein)}g protein
        </p>
      )}

      {/* Single meal carousel */}
      <div className="card p-4 md:p-6 min-h-[200px] flex flex-col">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold">Meals</h3>
          {meals.length > 0 && (
            <span className="text-xs text-gray-500">{mealIndex + 1} / {meals.length}</span>
          )}
        </div>

        {meals.length === 0 ? (
          <p className="text-gray-500 text-sm flex-1 flex items-center justify-center text-center py-8">
            No meals on this day. Log above or ask AI Coach.
          </p>
        ) : currentMeal ? (
          <>
            <div className="flex-1 flex flex-col justify-center py-2">
              <p className="text-lg font-semibold">{currentMeal.description}</p>
              <p className="text-sm text-gray-500 mt-1">
                {new Date(currentMeal.logged_at).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}
                {currentMeal.meal_type !== 'other' && ` · ${currentMeal.meal_type}`}
              </p>
              <div className="grid grid-cols-4 gap-2 mt-4 text-center">
                <div className="p-2 rounded-xl bg-orange-50 dark:bg-orange-950/30">
                  <div className="text-lg font-bold">{Math.round(currentMeal.calories)}</div>
                  <div className="text-[10px] text-gray-500">cal</div>
                </div>
                <div className="p-2 rounded-xl bg-red-50 dark:bg-red-950/30">
                  <div className="text-lg font-bold">{Math.round(currentMeal.protein_g)}g</div>
                  <div className="text-[10px] text-gray-500">protein</div>
                </div>
                <div className="p-2 rounded-xl bg-yellow-50 dark:bg-yellow-950/30">
                  <div className="text-lg font-bold">{Math.round(currentMeal.carbs_g)}g</div>
                  <div className="text-[10px] text-gray-500">carbs</div>
                </div>
                <div className="p-2 rounded-xl bg-purple-50 dark:bg-purple-950/30">
                  <div className="text-lg font-bold">{Math.round(currentMeal.fat_g)}g</div>
                  <div className="text-[10px] text-gray-500">fat</div>
                </div>
              </div>
            </div>
            <div className="flex items-center justify-between gap-2 mt-4 pt-4 border-t border-gray-100 dark:border-gray-800">
              <button
                type="button"
                disabled={mealIndex <= 0}
                onClick={() => setMealIndex(i => i - 1)}
                className="btn-secondary flex items-center gap-1 disabled:opacity-40"
              >
                <ChevronLeft className="w-4 h-4" /> Prev meal
              </button>
              <button
                onClick={() => removeMeal(currentMeal)}
                className="p-2 rounded-lg text-gray-400 hover:text-red-500 touch-target"
                title="Remove meal"
              >
                <Trash2 className="w-4 h-4" />
              </button>
              <button
                type="button"
                disabled={mealIndex >= meals.length - 1}
                onClick={() => setMealIndex(i => i + 1)}
                className="btn-secondary flex items-center gap-1 disabled:opacity-40"
              >
                Next meal <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}
