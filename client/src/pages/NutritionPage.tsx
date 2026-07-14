import { useEffect, useState, useCallback, useRef } from 'react';
import { Plus, Trash2, ChevronLeft, ChevronRight, Calendar, Sparkles } from 'lucide-react';
import { api } from '../services/api';
import { StatCard, ProgressBar, LoadingSpinner } from '../components/ui';
import { fmtGrams, fmtCalories } from '../utils/format';
import { toLocalDateInput, addDaysToLocalDate, formatNotchDate, formatLocalNow } from '../utils/date';

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

export default function NutritionPage() {
  const [selectedDate, setSelectedDate] = useState(toLocalDateInput());
  const [analytics, setAnalytics] = useState<Record<string, unknown> | null>(null);
  const [meals, setMeals] = useState<Meal[]>([]);
  const [mealIndex, setMealIndex] = useState(0);
  const [description, setDescription] = useState('');
  const [logging, setLogging] = useState(false);
  const [logMessage, setLogMessage] = useState<string | null>(null);
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
    setSelectedDate(addDaysToLocalDate(selectedDate, delta));
    setMealIndex(0);
  };

  const logMeal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!description.trim() || logging) return;
    setLogging(true);
    setLogMessage(null);
    try {
      const result = await api.data.aiLogMeal({ description: description.trim(), date: selectedDate });
      setDescription('');
      setLogMessage(
        `Logged: ${result.description} — ${Math.round(result.calories as number)} cal, ${Math.round(result.protein_g as number)}g protein` +
        (result.source === 'ai' ? ' (AI estimate)' : ''),
      );
      load();
      window.dispatchEvent(new CustomEvent('aicoach-data-updated'));
    } catch (err) {
      setLogMessage((err as Error).message);
    } finally {
      setLogging(false);
    }
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
  const localToday = (analytics?.localToday as string) ?? toLocalDateInput();

  const currentMeal = meals[mealIndex];
  const fmtTarget = (val: number | null | undefined, unit = '') =>
    val != null ? `${val}${unit}` : '—';

  return (
    <div className="space-y-5 animate-fade-in pb-4">
      {/* Date notch */}
      <div className="sticky top-0 z-20 -mx-3 sm:-mx-4 md:-mx-6 px-3 sm:px-4 md:px-6 pt-1 pb-3 bg-gray-50/95 dark:bg-gray-950/95 backdrop-blur border-b border-gray-200/80 dark:border-gray-800/80">
        <div className="max-w-lg mx-auto">
          <p className="text-center text-[10px] text-gray-400 mb-1">{formatLocalNow()}</p>
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
              onClick={() => setSelectedDate(localToday)}
              className="px-2 py-1 text-xs rounded-lg text-brand-600 hover:bg-brand-50 dark:hover:bg-brand-900/20"
            >
              Today
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

      <form onSubmit={logMeal} className="card p-4 space-y-3">
        <label className="text-sm font-medium flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-brand-500" />
          AI meal log — say what you ate in plain English
        </label>
        <textarea
          className="input w-full min-h-[88px] resize-y"
          value={description}
          onChange={e => setDescription(e.target.value)}
          placeholder={`e.g. "2 eggs on toast with avocado" or "protein shake after gym" for ${formatNotchDate(selectedDate).split(' · ')[0]}`}
        />
        <div className="flex flex-col sm:flex-row gap-2 sm:items-center sm:justify-between">
          <p className="text-xs text-gray-500">AI estimates calories & macros, then saves to this day.</p>
          <button type="submit" disabled={logging || !description.trim()} className="btn-primary flex items-center justify-center gap-2 sm:shrink-0 disabled:opacity-50">
            <Plus className="w-4 h-4" /> {logging ? 'Logging…' : 'Log with AI'}
          </button>
        </div>
        {logMessage && (
          <p className={`text-sm ${logMessage.startsWith('Logged') ? 'text-green-600 dark:text-green-400' : 'text-red-600'}`}>
            {logMessage}
          </p>
        )}
      </form>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard title="Calories" value={Math.round(day?.calories ?? 0)} subtitle={configured ? `/ ${fmtTarget(targets?.calories)}` : undefined} />
        <StatCard title="Protein" value={`${Math.round(day?.protein_g ?? 0)}g`} subtitle={configured ? `/ ${fmtTarget(targets?.protein, 'g')}` : undefined} />
        <StatCard title="Meals" value={day?.mealCount ?? meals.length} subtitle="logged this day" />
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
            No meals on this day. Describe what you ate above — AI will log it.
          </p>
        ) : currentMeal ? (
          <>
            <div className="flex-1 flex flex-col justify-center py-2">
              <p className="text-lg font-semibold">{currentMeal.description}</p>
              <p className="text-sm text-gray-500 mt-1">
                {new Date(currentMeal.logged_at.includes('T') ? currentMeal.logged_at : currentMeal.logged_at + 'T12:00:00').toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}
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
