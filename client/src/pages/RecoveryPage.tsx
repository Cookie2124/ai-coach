import { useEffect, useState } from 'react';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { api } from '../services/api';
import { ScoreRing, StatCard, LoadingSpinner } from '../components/ui';

export default function RecoveryPage() {
  const [data, setData] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.recovery().then(setData).finally(() => setLoading(false));
  }, []);

  if (loading) return <LoadingSpinner />;

  const trends = (data?.trends as Record<string, number>[]) ?? [];

  return (
    <div className="space-y-6 animate-fade-in">
      <h1 className="text-2xl font-bold">Recovery Analytics</h1>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
        <div className="card p-4 flex justify-center">
          <ScoreRing value={data?.readinessScore as number ?? 0} label="Readiness Score" />
        </div>
        <StatCard title="Avg Recovery" value={`${data?.avgRecovery ?? '--'}%`} />
        <StatCard title="Avg HRV" value={`${data?.avgHrv ?? '--'}ms`} />
        <StatCard title="Avg Sleep" value={`${data?.avgSleep ?? '--'}h`} />
        <StatCard title="Sleep Debt" value={`${data?.sleepDebt ?? 0}h`} />
        <StatCard title="Recovery Momentum" value={data?.recoveryMomentum as number ?? 0}
          trend={(data?.recoveryMomentum as number) > 0 ? 'up' : 'down'} />
        <StatCard title="Recovery:Strain" value={data?.recoveryToStrainRatio as number ?? 0} />
        <StatCard title="Burnout Risk" value={data?.burnoutRisk as string ?? 'low'} />
      </div>

      {trends.length > 1 && (
        <div className="card p-4 md:p-6">
          <h3 className="font-semibold mb-4">14-Day Recovery Trend</h3>
          <ResponsiveContainer width="100%" height={250}>
            <LineChart data={trends}>
              <XAxis dataKey="date" tick={{ fontSize: 11 }} tickFormatter={d => d?.slice(5)} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip />
              <Line type="monotone" dataKey="recovery_score" stroke="#22c55e" strokeWidth={2} name="Recovery" />
              <Line type="monotone" dataKey="hrv_ms" stroke="#6366f1" strokeWidth={2} name="HRV" />
              <Line type="monotone" dataKey="duration_hours" stroke="#0ea5e9" strokeWidth={2} name="Sleep (h)" />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      <div className="card p-4">
        <h3 className="font-semibold mb-2">Recovery Volatility</h3>
        <p className="text-sm text-gray-500">
          {data?.recoveryVolatility as number ?? 0} — {
            (data?.recoveryVolatility as number) > 15 ? 'High volatility suggests inconsistent recovery patterns. Focus on sleep consistency and nutrition.' :
            (data?.recoveryVolatility as number) > 8 ? 'Moderate volatility. Monitor sleep and training load balance.' :
            'Stable recovery patterns. Good consistency.'
          }
        </p>
      </div>
    </div>
  );
}
