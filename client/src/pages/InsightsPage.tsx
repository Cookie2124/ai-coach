import { useEffect, useState } from 'react';
import { api } from '../services/api';
import { InsightCard, LoadingSpinner } from '../components/ui';

export default function InsightsPage() {
  const [correlations, setCorrelations] = useState<Record<string, unknown>[]>([]);
  const [insights, setInsights] = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([api.correlations(), api.insights()])
      .then(([c, i]) => { setCorrelations(c as Record<string, unknown>[]); setInsights(i as Record<string, unknown>[]); })
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <LoadingSpinner />;

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold">AI Insights & Correlations</h1>
        <p className="text-gray-500 mt-1">Automatically discovered relationships across all your data</p>
      </div>

      {insights.length > 0 && (
        <div className="space-y-3">
          <h2 className="font-semibold text-lg">Active Insights</h2>
          {insights.map((ins, i) => (
            <InsightCard key={i} title={ins.title as string} content={ins.content as string} severity={ins.severity as string} />
          ))}
        </div>
      )}

      <div className="space-y-3">
        <h2 className="font-semibold text-lg">Discovered Correlations</h2>
        {correlations.length === 0 ? (
          <div className="card p-8 text-center text-gray-500">
            <p>Not enough data yet to discover correlations.</p>
            <p className="text-sm mt-2">Keep logging recovery, sleep, nutrition, and training data for at least 2 weeks.</p>
          </div>
        ) : (
          correlations.map((corr, i) => (
            <div key={i} className="card p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium capitalize">
                  {(corr.metric_a as string).replace(/_/g, ' ')} ↔ {(corr.metric_b as string).replace(/_/g, ' ')}
                </span>
                <span className={`text-sm font-bold px-2 py-1 rounded-full ${
                  Math.abs(corr.correlation as number) > 0.6 ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' :
                  Math.abs(corr.correlation as number) > 0.4 ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400' :
                  'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400'
                }`}>
                  r = {corr.correlation as number}
                </span>
              </div>
              <p className="text-sm text-gray-600 dark:text-gray-300">{corr.description as string}</p>
              <p className="text-xs text-gray-400 mt-1">Sample size: {corr.sample_size as number} days</p>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
