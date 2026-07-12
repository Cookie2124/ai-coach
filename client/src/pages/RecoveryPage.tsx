import { useEffect, useState } from 'react';

import { Link } from 'react-router-dom';

import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from 'recharts';

import { AlertTriangle } from 'lucide-react';

import { api } from '../services/api';

import { ScoreRing, StatCard, LoadingSpinner } from '../components/ui';

import { fmtPct, fmtHrv, fmtStrain, fmtSleepHours, fmtDateChart, capitalize } from '../utils/format';



export default function RecoveryPage() {

  const [data, setData] = useState<Record<string, unknown> | null>(null);

  const [loading, setLoading] = useState(true);



  useEffect(() => {

    api.recovery().then(setData).finally(() => setLoading(false));

  }, []);



  if (loading) return <LoadingSpinner />;



  const trends = (data?.trends as Record<string, unknown>[]) ?? [];

  const hasData = data?.hasData as boolean;



  const chartTrends = trends.slice(-90);
  const chartData = chartTrends.map(t => ({
    date: fmtDateChart(t.date as string),
    Recovery: t.recovery_score as number,
    HRV: t.hrv_ms as number,
    Sleep: t.duration_hours as number,
    sleepDisplay: t.sleep_display as string,
    Strain: t.strain as number,
  }));



  return (

    <div className="space-y-6 animate-fade-in">

      <h1 className="text-2xl font-bold">Recovery Analytics</h1>



      {!hasData && (

        <div className="card p-4 flex items-start gap-3 border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30">

          <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />

          <div>

            <p className="font-medium">No recovery data</p>

            <p className="text-sm text-gray-500 mt-1">

              Connect WHOOP on the <Link to="/integrations" className="text-brand-500 underline">Integrations</Link> page, then use <strong>Import All History</strong> to pull every recovery, sleep, and workout from when you first got your band.

            </p>

          </div>

        </div>

      )}



      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">

        <div className="card p-4 flex justify-center">

          <ScoreRing value={data?.readinessScore as number | null} label="Readiness Score" />

        </div>

        <StatCard title="Avg Recovery" value={data?.avgRecovery != null ? fmtPct(data.avgRecovery as number) : '--'} />

        <StatCard title="Avg HRV" value={data?.avgHrv != null ? fmtHrv(data.avgHrv as number) : '--'} />

        <StatCard title="Avg Sleep" value={(data?.avgSleepDisplay as string) ?? (data?.avgSleep != null ? fmtSleepHours(data.avgSleep as number) : '--')} />

        <StatCard title="Sleep Debt" value={(data?.sleepDebtDisplay as string) ?? fmtSleepHours(data?.sleepDebt as number)} />

        <StatCard title="Recovery Momentum" value={data?.recoveryMomentum != null ? `${(data.recoveryMomentum as number) > 0 ? '+' : ''}${data.recoveryMomentum}%` : '--'}

          trend={data?.recoveryMomentum != null ? ((data.recoveryMomentum as number) > 0 ? 'up' : 'down') : undefined} />

        <StatCard title="Recovery:Strain" value={data?.recoveryToStrainRatio != null ? fmtStrain(data.recoveryToStrainRatio as number) : '--'} />

        <StatCard title="Burnout Risk" value={capitalize(String(data?.burnoutRisk ?? '--'))} />

      </div>



      {chartData.length > 1 && (

        <div className="card p-4 md:p-6">

          <h3 className="font-semibold mb-4">Recovery Trend ({Math.min(trends.length, 90)} days)</h3>

          <ResponsiveContainer width="100%" height={280}>

            <LineChart data={chartData}>

              <XAxis dataKey="date" tick={{ fontSize: 11 }} />

              <YAxis yAxisId="left" tick={{ fontSize: 11 }} />

              <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11 }} domain={[0, 12]} />

              <Tooltip formatter={(v: number, name: string) => {

                if (name === 'Sleep') return [fmtSleepHours(v), name];

                if (name === 'HRV') return [fmtHrv(v), name];

                if (name === 'Strain') return [fmtStrain(v), name];

                return [fmtPct(v), name];

              }} />

              <Legend />

              <Line yAxisId="left" type="monotone" dataKey="Recovery" stroke="#22c55e" strokeWidth={2} name="Recovery" />

              <Line yAxisId="left" type="monotone" dataKey="HRV" stroke="#6366f1" strokeWidth={2} name="HRV" />

              <Line yAxisId="right" type="monotone" dataKey="Sleep" stroke="#0ea5e9" strokeWidth={2} name="Sleep" />

              <Line yAxisId="left" type="monotone" dataKey="Strain" stroke="#ef4444" strokeWidth={2} name="Strain" strokeDasharray="4 4" />

            </LineChart>

          </ResponsiveContainer>

        </div>

      )}



      {hasData && (

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

      )}

    </div>

  );

}


