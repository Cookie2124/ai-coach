import { useEffect, useState, useCallback } from 'react';

import { Link } from 'react-router-dom';

import { Heart, Moon, Dumbbell, Utensils, Scale, Brain, TrendingUp, AlertTriangle, MessageSquare, Activity, Zap } from 'lucide-react';

import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from 'recharts';

import { api } from '../services/api';

import { ScoreRing, StatCard, ProgressBar, InsightCard, LoadingSpinner } from '../components/ui';

import {

  fmtPct, fmtSleepHours, fmtWeight, fmtHrv, fmtStrain, fmtGrams, fmtCalories,

  fmtChange, fmtTrendLabel, trendFromDelta, fmtDateChart, capitalize, recoveryLabel,

} from '../utils/format';



type Summary = {

  recovery?: { score: number; hrv: number; strain: number; resting_hr?: number; label?: string; trend?: number };

  sleep?: { hours: number; display: string; quality?: number; efficiency?: number; deep?: number; rem?: number; trend?: number; avg7d?: string };

  hrv?: { latest: number; avg7d: number; trend?: number };

  strain?: { latest: number; avg7d: number };

  weight?: { current: number; weeklyChange: number; monthlyChange: number; trend: string };

  nutrition?: { today: Record<string, number>; weeklyAvg: Record<string, number>; targets: Record<string, number | null> };

  training?: { weeklySessions: number; acwr: number; overtrainingRisk: string };

  charts?: {

    recovery: { date: string; recovery: number; strain: number; hrv: number }[];

    sleep: { date: string; hours: number; display: string; quality: number }[];

    weight: { date: string; kg: number }[];

    nutrition: { date: string; calories: number; protein: number }[];

  };

  recentWorkouts?: { date: string; type: string; duration: number; strain: number; source?: string }[];

};



export default function DashboardPage() {

  const [data, setData] = useState<Record<string, unknown> | null>(null);

  const [loading, setLoading] = useState(true);



  const load = useCallback(() => {

    api.dashboard().then(setData).catch(console.error).finally(() => setLoading(false));

  }, []);



  useEffect(() => {

    load();

    window.addEventListener('focus', load);

    return () => window.removeEventListener('focus', load);

  }, [load]);



  if (loading) return <LoadingSpinner />;

  if (!data) return <div className="text-center py-12">Failed to load dashboard</div>;



  const scores = data.scores as Record<string, number | undefined>;

  const summary = data.summary as Summary | undefined;

  const nutrition = data.nutrition as { today: Record<string, number> };

  const targets = (summary?.nutrition?.targets ?? data.targets) as Record<string, number | null> | undefined;

  const predictions = data.predictions as { recommendations?: { category: string; priority: string; message: string }[] };

  const insights = data.insights as { title: string; content: string; severity: string }[];

  const availability = data.dataAvailability as Record<string, boolean> | undefined;
  const learning = data.learning as { autoMemories?: number; newInsights?: number } | undefined;



  const recoveryChart = summary?.charts?.recovery?.map(r => ({

    date: fmtDateChart(r.date),

    Recovery: r.recovery,

    Strain: r.strain,

    HRV: r.hrv,

  })) ?? [];



  const sleepChart = summary?.charts?.sleep?.map(s => ({

    date: fmtDateChart(s.date),

    hours: s.hours,

    display: s.display,

    quality: s.quality,

  })) ?? [];



  const weightChart = summary?.charts?.weight?.map(w => ({

    date: fmtDateChart(w.date),

    kg: w.kg,

  })) ?? [];



  const noData = !availability?.hasRecovery && !availability?.hasSleep && !availability?.hasNutrition && !availability?.hasWorkouts;



  const sleepTrendDir = trendFromDelta(summary?.sleep?.trend);

  const recoveryTrendDir = trendFromDelta(summary?.recovery?.trend);

  const hrvTrendDir = trendFromDelta(summary?.hrv?.trend);



  return (

    <div className="space-y-6 animate-fade-in">

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">

        <div>

          <h1 className="text-2xl md:text-3xl font-bold">Dashboard</h1>

          <p className="text-gray-500 mt-1">Your interconnected athlete intelligence</p>

        </div>

        <Link to="/chat" className="btn-primary inline-flex items-center gap-2 self-start">

          <MessageSquare className="w-4 h-4" /> Ask AI Coach

        </Link>

      </div>



      {learning && (learning.autoMemories ?? 0) > 0 && (
        <div className="card p-4 flex items-start gap-3 border-brand-500/30 bg-brand-50/50 dark:bg-brand-900/10">
          <Brain className="w-5 h-5 text-brand-500 shrink-0 mt-0.5" />
          <div>
            <p className="font-medium">AiCoach is learning about you</p>
            <p className="text-sm text-gray-500 mt-1">
              {learning.autoMemories} auto-discovered facts from your data, chat, and schedule. View in <Link to="/settings" className="text-brand-500 underline">Settings</Link> or ask the AI Coach.
            </p>
          </div>
        </div>
      )}

      {noData && (

        <div className="card p-4 flex items-start gap-3 border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30">

          <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />

          <div>

            <p className="font-medium">No data yet</p>

            <p className="text-sm text-gray-500 mt-1">

              Connect WHOOP on the <Link to="/integrations" className="text-brand-500 underline">Integrations</Link> page or log meals and workouts to see real metrics.

            </p>

          </div>

        </div>

      )}



      {/* Composite Scores */}

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">

        <div className="card p-4 flex justify-center col-span-2 sm:col-span-1">

          <ScoreRing value={scores?.athletic_readiness} label="Athletic Readiness" />

        </div>

        <div className="card p-4 flex justify-center">

          <ScoreRing value={scores?.student_athlete_score} label="Student Athlete" size={100} />

        </div>

        <div className="card p-4 flex justify-center">

          <ScoreRing value={scores?.performance_potential} label="Performance Potential" size={100} />

        </div>

        <div className="card p-4 flex justify-center">

          <ScoreRing value={scores?.fatigue_score != null ? 100 - scores.fatigue_score : null} label="Energy Level" size={100} sublabel="inv. fatigue" />

        </div>

        <div className="card p-4 flex justify-center">

          <ScoreRing value={scores?.school_life_balance} label="School-Life Balance" size={100} />

        </div>

      </div>



      {/* Key Metrics */}

      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">

        <StatCard

          title="Recovery"

          value={summary?.recovery?.score != null ? fmtPct(summary.recovery.score) : '--'}

          icon={<Heart className="w-5 h-5" />}

          subtitle={summary?.recovery?.label ? `${summary.recovery.label} zone` : recoveryLabel(summary?.recovery?.score)}

          trend={recoveryTrendDir === 'neutral' ? undefined : recoveryTrendDir}

          trendValue={summary?.recovery?.trend != null ? fmtTrendLabel(summary.recovery.trend, ' pts') : undefined}

        />

        <StatCard

          title="Sleep"

          value={summary?.sleep?.display ?? (data.sleep as Record<string, unknown>[])?.[0] ? fmtSleepHours((data.sleep as Record<string, number>[])[0].duration_hours) : '--'}

          icon={<Moon className="w-5 h-5" />}

          subtitle={summary?.sleep?.quality != null ? `${Math.round(summary.sleep.quality)}% quality` : undefined}

          trend={sleepTrendDir === 'neutral' ? undefined : sleepTrendDir}

          trendValue={summary?.sleep?.avg7d ? `7d avg ${summary.sleep.avg7d}` : undefined}

        />

        <StatCard

          title="HRV"

          value={summary?.hrv?.latest != null ? fmtHrv(summary.hrv.latest) : '--'}

          icon={<Activity className="w-5 h-5" />}

          subtitle={summary?.hrv?.avg7d != null ? `7d avg ${fmtHrv(summary.hrv.avg7d)}` : undefined}

          trend={hrvTrendDir === 'neutral' ? undefined : hrvTrendDir}

        />

        <StatCard

          title="Strain"

          value={summary?.strain?.latest != null ? fmtStrain(summary.strain.latest) : '--'}

          icon={<Zap className="w-5 h-5" />}

          subtitle={summary?.strain?.avg7d != null ? `7d avg ${fmtStrain(summary.strain.avg7d)}` : undefined}

        />

        <StatCard

          title="Protein"

          value={fmtGrams(summary?.nutrition?.today?.protein ?? nutrition?.today?.protein_g)}

          icon={<Utensils className="w-5 h-5" />}

          subtitle={targets?.protein ? `/ ${targets.protein}g target` : undefined}

        />

        <StatCard

          title="Weight"

          value={summary?.weight?.current != null ? fmtWeight(summary.weight.current) : '--'}

          icon={<Scale className="w-5 h-5" />}

          trendValue={summary?.weight?.weeklyChange != null ? fmtChange(summary.weight.weeklyChange, ' kg/wk') : undefined}

          trend={summary?.weight?.weeklyChange != null ? (summary.weight.weeklyChange > 0 ? 'up' : summary.weight.weeklyChange < 0 ? 'down' : 'neutral') : undefined}

          subtitle={summary?.weight?.trend ? capitalize(summary.weight.trend) : undefined}

        />

      </div>



      {/* Sleep detail row */}

      {summary?.sleep && (

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">

          <StatCard title="Sleep Efficiency" value={summary.sleep.efficiency != null ? fmtPct(summary.sleep.efficiency) : '—'} />

          <StatCard title="Deep Sleep" value={summary.sleep.deep != null ? fmtSleepHours(summary.sleep.deep) : '—'} />

          <StatCard title="REM Sleep" value={summary.sleep.rem != null ? fmtSleepHours(summary.sleep.rem) : '—'} />

          <StatCard title="Resting HR" value={summary.recovery?.resting_hr != null ? `${Math.round(summary.recovery.resting_hr)} bpm` : '—'} />

        </div>

      )}



      {/* Charts */}

      <div className="grid lg:grid-cols-2 gap-4">

        {recoveryChart.length > 1 && (

          <div className="card p-4 md:p-6">

            <h3 className="font-semibold mb-4">Recovery, Strain & HRV</h3>

            <ResponsiveContainer width="100%" height={220}>

              <LineChart data={recoveryChart}>

                <XAxis dataKey="date" tick={{ fontSize: 11 }} />

                <YAxis tick={{ fontSize: 11 }} />

                <Tooltip formatter={(v: number, name: string) => [name === 'HRV' ? fmtHrv(v) : name === 'Strain' ? fmtStrain(v) : fmtPct(v), name]} />

                <Legend />

                <Line type="monotone" dataKey="Recovery" stroke="#22c55e" strokeWidth={2} dot={false} />

                <Line type="monotone" dataKey="Strain" stroke="#ef4444" strokeWidth={2} dot={false} />

                <Line type="monotone" dataKey="HRV" stroke="#6366f1" strokeWidth={2} dot={false} />

              </LineChart>

            </ResponsiveContainer>

          </div>

        )}



        {sleepChart.length > 1 && (

          <div className="card p-4 md:p-6">

            <h3 className="font-semibold mb-4">Sleep Duration & Quality</h3>

            <ResponsiveContainer width="100%" height={220}>

              <LineChart data={sleepChart}>

                <XAxis dataKey="date" tick={{ fontSize: 11 }} />

                <YAxis yAxisId="left" tick={{ fontSize: 11 }} domain={[0, 12]} tickFormatter={h => `${h}h`} />

                <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11 }} domain={[0, 100]} />

                <Tooltip formatter={(v: number, name: string) => [name === 'hours' ? fmtSleepHours(v) : fmtPct(v), name === 'hours' ? 'Sleep' : 'Quality']} />

                <Legend />

                <Line yAxisId="left" type="monotone" dataKey="hours" stroke="#0ea5e9" strokeWidth={2} dot={false} name="Sleep" />

                <Line yAxisId="right" type="monotone" dataKey="quality" stroke="#a855f7" strokeWidth={2} dot={false} name="Quality" />

              </LineChart>

            </ResponsiveContainer>

          </div>

        )}



        {weightChart.length > 1 && (

          <div className="card p-4 md:p-6">

            <h3 className="font-semibold mb-4">Weight Trend</h3>

            <ResponsiveContainer width="100%" height={220}>

              <LineChart data={weightChart}>

                <XAxis dataKey="date" tick={{ fontSize: 11 }} />

                <YAxis tick={{ fontSize: 11 }} domain={['auto', 'auto']} tickFormatter={v => `${v} kg`} />

                <Tooltip formatter={(v: number) => [fmtWeight(v), 'Weight']} />

                <Line type="monotone" dataKey="kg" stroke="#f97316" strokeWidth={2} dot={{ r: 3 }} />

              </LineChart>

            </ResponsiveContainer>

          </div>

        )}



        {summary?.training && (

          <div className="card p-4 md:p-6">

            <h3 className="font-semibold mb-4 flex items-center gap-2"><Dumbbell className="w-4 h-4" /> Training Load</h3>

            <div className="grid grid-cols-2 gap-4">

              <StatCard title="Sessions This Week" value={summary.training.weeklySessions} />

              <StatCard title="ACWR" value={fmtStrain(summary.training.acwr)} subtitle={`Risk: ${capitalize(summary.training.overtrainingRisk)}`} />

            </div>

          </div>

        )}

      </div>



      {/* Nutrition Progress */}

      {targets?.calories && (

        <div className="card p-4 md:p-6 space-y-4">

          <h3 className="font-semibold">Today's Nutrition</h3>

          <ProgressBar value={nutrition?.today?.calories ?? 0} max={targets.calories} label={`Calories (${fmtCalories(nutrition?.today?.calories ?? 0)})`} color="bg-orange-500" />

          {targets.protein && <ProgressBar value={nutrition?.today?.protein_g ?? 0} max={targets.protein} label={`Protein (${fmtGrams(nutrition?.today?.protein_g)})`} color="bg-red-500" />}

          {targets.carbs && <ProgressBar value={nutrition?.today?.carbs_g ?? 0} max={targets.carbs} label={`Carbs (${fmtGrams(nutrition?.today?.carbs_g)})`} color="bg-yellow-500" />}

          {targets.fat && <ProgressBar value={nutrition?.today?.fat_g ?? 0} max={targets.fat} label={`Fat (${fmtGrams(nutrition?.today?.fat_g)})`} color="bg-purple-500" />}

          {summary?.nutrition?.weeklyAvg && (

            <p className="text-sm text-gray-500">

              7-day average: {fmtCalories(summary.nutrition.weeklyAvg.calories)}/day, {fmtGrams(summary.nutrition.weeklyAvg.protein)} protein

            </p>

          )}

        </div>

      )}



      {/* Recent Workouts */}

      {summary?.recentWorkouts && summary.recentWorkouts.length > 0 && (

        <div className="card p-4 md:p-6">

          <h3 className="font-semibold mb-3">Recent Workouts</h3>

          <div className="space-y-2">

            {summary.recentWorkouts.slice(0, 5).map((w, i) => (

              <div key={i} className="flex justify-between text-sm py-2 border-b border-gray-100 dark:border-gray-800 last:border-0">

                <span>{w.date} — {capitalize(String(w.type).replace('_', ' '))}</span>

                <span className="text-gray-500">{w.duration} min · strain {fmtStrain(w.strain)}</span>

              </div>

            ))}

          </div>

        </div>

      )}



      {/* AI Recommendations */}

      {predictions?.recommendations && predictions.recommendations.length > 0 && (

        <div className="space-y-3">

          <h3 className="font-semibold flex items-center gap-2"><Brain className="w-5 h-5 text-brand-500" /> AI Recommendations</h3>

          {predictions.recommendations.slice(0, 4).map((rec, i) => (

            <InsightCard key={i} title={`${rec.category} — ${rec.priority}`} content={rec.message} severity={rec.priority === 'high' ? 'warning' : 'info'} />

          ))}

        </div>

      )}



      {/* Insights */}

      {insights?.length > 0 && (

        <div className="space-y-3">

          <h3 className="font-semibold flex items-center gap-2"><TrendingUp className="w-5 h-5 text-brand-500" /> Discovered Patterns</h3>

          {insights.slice(0, 3).map((ins, i) => (

            <InsightCard key={i} title={ins.title} content={ins.content} severity={ins.severity} />

          ))}

        </div>

      )}

    </div>

  );

}


