import { useState } from 'react';
import { FileText, Download } from 'lucide-react';
import { api } from '../services/api';
import { StatCard, InsightCard, LoadingSpinner } from '../components/ui';

export default function ReportsPage() {
  const [report, setReport] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(false);
  const [type, setType] = useState<string>('daily');

  const generate = async (reportType: string) => {
    setLoading(true);
    setType(reportType);
    try {
      const r = await api.ai.generateReport(reportType);
      setReport(r);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const summary = report?.summary as Record<string, number> | undefined;
  const recovery = report?.recovery as Record<string, unknown> | undefined;
  const nutrition = report?.nutrition as Record<string, unknown> | undefined;
  const training = report?.training as Record<string, unknown> | undefined;
  const recommendations = report?.recommendations as { category: string; priority: string; message: string }[] | undefined;

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold">Reports</h1>
        <p className="text-gray-500 mt-1">Interconnected summaries across all domains</p>
      </div>

      <div className="flex gap-2 flex-wrap">
        {['daily', 'weekly', 'monthly'].map(t => (
          <button key={t} onClick={() => generate(t)}
            className={`px-4 py-2 rounded-xl font-medium capitalize transition-all ${
              type === t && report ? 'bg-brand-500 text-white' : 'btn-secondary'
            }`}>
            {t} Report
          </button>
        ))}
      </div>

      {loading && <LoadingSpinner />}

      {report && !loading && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <StatCard title="Athletic Readiness" value={summary?.athleticReadiness ?? '--'} />
            <StatCard title="Student Athlete" value={summary?.studentAthleteScore ?? '--'} />
            <StatCard title="Performance Potential" value={summary?.performancePotential ?? '--'} />
            <StatCard title="Fatigue" value={summary?.fatigueScore ?? '--'} />
          </div>

          <div className="grid md:grid-cols-2 gap-4">
            <div className="card p-4">
              <h3 className="font-semibold mb-3">Recovery</h3>
              <div className="space-y-2 text-sm">
                <div>Avg Recovery: <strong>{recovery?.avgRecovery as number ?? '--'}%</strong></div>
                <div>Avg HRV: <strong>{recovery?.avgHrv as number ?? '--'}ms</strong></div>
                <div>Avg Sleep: <strong>{recovery?.avgSleep as number ?? '--'}h</strong></div>
                <div>Sleep Debt: <strong>{recovery?.sleepDebt as number ?? 0}h</strong></div>
                <div>Burnout Risk: <strong>{recovery?.burnoutRisk as string ?? 'low'}</strong></div>
              </div>
            </div>
            <div className="card p-4">
              <h3 className="font-semibold mb-3">Nutrition</h3>
              <div className="space-y-2 text-sm">
                <div>Avg Calories: <strong>{nutrition?.avgCalories as number ?? '--'}</strong></div>
                <div>Avg Protein: <strong>{nutrition?.avgProtein as number ?? '--'}g</strong></div>
                <div>Protein Adherence: <strong>{(nutrition?.adherence as Record<string, number>)?.protein ?? '--'}%</strong></div>
              </div>
            </div>
            <div className="card p-4">
              <h3 className="font-semibold mb-3">Training</h3>
              <div className="space-y-2 text-sm">
                <div>Sessions: <strong>{training?.sessions as number ?? 0}</strong></div>
                <div>Acute Load: <strong>{training?.acuteLoad as number ?? 0}</strong></div>
                <div>ACWR: <strong>{training?.acwr as number ?? 0}</strong></div>
                <div>Overtraining Risk: <strong>{training?.overtrainingRisk as string ?? 'low'}</strong></div>
              </div>
            </div>
            <div className="card p-4">
              <h3 className="font-semibold mb-3">Weight</h3>
              <div className="space-y-2 text-sm">
                <div>Current: <strong>{String((report.weight as Record<string, unknown>)?.current ?? '--')}kg</strong></div>
                <div>Weekly Change: <strong>{String((report.weight as Record<string, unknown>)?.weeklyChange ?? 0)}kg</strong></div>
                <div>Trend: <strong>{String((report.weight as Record<string, unknown>)?.trend ?? 'stable')}</strong></div>
              </div>
            </div>
          </div>

          {recommendations && recommendations.length > 0 && (
            <div className="space-y-3">
              <h3 className="font-semibold">Recommendations</h3>
              {recommendations.map((rec, i) => (
                <InsightCard key={i} title={`${rec.category} (${rec.priority})`} content={rec.message} severity={rec.priority === 'high' ? 'warning' : 'info'} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
