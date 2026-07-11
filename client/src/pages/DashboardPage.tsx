import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Heart, Moon, Dumbbell, Utensils, Scale, Brain, TrendingUp, AlertTriangle, MessageSquare } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { api } from '../services/api';
import { ScoreRing, StatCard, ProgressBar, InsightCard, LoadingSpinner } from '../components/ui';

export default function DashboardPage() {
  const [data, setData] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.dashboard().then(setData).catch(console.error).finally(() => setLoading(false));
  }, []);

  if (loading) return <LoadingSpinner />;
  if (!data) return <div className="text-center py-12">Failed to load dashboard</div>;

  const scores = data.scores as Record<string, number>;
  const recovery = (data.recovery as Record<string, unknown>[])?.[0] as Record<string, number> | undefined;
  const sleep = (data.sleep as Record<string, unknown>[])?.[0] as Record<string, number> | undefined;
  const nutrition = data.nutrition as { today: Record<string, number> };
  const weight = data.weightTrend as Record<string, unknown>;
  const predictions = data.predictions as { recommendations?: { category: string; priority: string; message: string }[] };
  const insights = data.insights as { title: string; content: string; severity: string }[];

  const recoveryTrend = (data.recovery as Record<string, unknown>[])?.slice(0, 14).reverse().map(r => ({
    date: (r.date as string)?.slice(5),
    recovery: r.recovery_score as number,
    strain: r.strain as number,
  })) ?? [];

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

      {/* Composite Scores */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
        <div className="card p-4 flex justify-center col-span-2 sm:col-span-1">
          <ScoreRing value={scores?.athletic_readiness ?? 0} label="Athletic Readiness" />
        </div>
        <div className="card p-4 flex justify-center">
          <ScoreRing value={scores?.student_athlete_score ?? 0} label="Student Athlete" size={100} />
        </div>
        <div className="card p-4 flex justify-center">
          <ScoreRing value={scores?.performance_potential ?? 0} label="Performance Potential" size={100} />
        </div>
        <div className="card p-4 flex justify-center">
          <ScoreRing value={100 - (scores?.fatigue_score ?? 50)} label="Energy Level" size={100} sublabel="inv. fatigue" />
        </div>
        <div className="card p-4 flex justify-center">
          <ScoreRing value={scores?.school_life_balance ?? 0} label="School-Life Balance" size={100} />
        </div>
      </div>

      {/* Key Metrics */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard title="Recovery" value={`${recovery?.recovery_score ?? '--'}%`} icon={<Heart className="w-5 h-5" />}
          trend={recovery?.recovery_score && recovery.recovery_score >= 67 ? 'up' : 'down'} />
        <StatCard title="Sleep" value={sleep?.duration_hours ? `${sleep.duration_hours}h` : '--'} icon={<Moon className="w-5 h-5" />}
          subtitle={sleep?.performance_pct ? `${sleep.performance_pct}% quality` : undefined} />
        <StatCard title="Protein" value={`${Math.round(nutrition?.today?.protein_g ?? 0)}g`} icon={<Utensils className="w-5 h-5" />} />
        <StatCard title="Weight" value={weight?.current ? `${weight.current}kg` : '--'} icon={<Scale className="w-5 h-5" />}
          trendValue={weight?.weeklyChange ? `${(weight.weeklyChange as number) > 0 ? '+' : ''}${weight.weeklyChange}kg/wk` : undefined}
          trend={(weight?.weeklyChange as number) > 0 ? 'up' : (weight?.weeklyChange as number) < 0 ? 'down' : 'neutral'} />
      </div>

      {/* Recovery Trend Chart */}
      {recoveryTrend.length > 1 && (
        <div className="card p-4 md:p-6">
          <h3 className="font-semibold mb-4">Recovery & Strain Trend</h3>
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={recoveryTrend}>
              <XAxis dataKey="date" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} />
              <Tooltip />
              <Line type="monotone" dataKey="recovery" stroke="#22c55e" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="strain" stroke="#ef4444" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Nutrition Progress */}
      <div className="card p-4 md:p-6 space-y-4">
        <h3 className="font-semibold">Today's Nutrition</h3>
        <ProgressBar value={nutrition?.today?.calories ?? 0} max={2500} label="Calories" color="bg-orange-500" />
        <ProgressBar value={nutrition?.today?.protein_g ?? 0} max={150} label="Protein (g)" color="bg-red-500" />
        <ProgressBar value={nutrition?.today?.carbs_g ?? 0} max={300} label="Carbs (g)" color="bg-yellow-500" />
        <ProgressBar value={nutrition?.today?.fat_g ?? 0} max={80} label="Fat (g)" color="bg-purple-500" />
      </div>

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
