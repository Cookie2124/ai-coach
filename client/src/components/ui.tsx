import { ReactNode } from 'react';
import clsx from 'clsx';

interface ScoreRingProps {
  value?: number | null;
  max?: number;
  size?: number;
  label: string;
  color?: string;
  sublabel?: string;
}

export function ScoreRing({ value, max = 100, size = 120, label, color, sublabel }: ScoreRingProps) {
  const empty = value == null;
  const pct = empty ? 0 : Math.min(100, (value / max) * 100);
  const radius = (size - 12) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (pct / 100) * circumference;

  const strokeColor = empty ? '#9ca3af' : (color || (pct >= 67 ? '#22c55e' : pct >= 34 ? '#eab308' : '#ef4444'));

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="score-ring" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="-rotate-90">
          <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="currentColor" strokeWidth={6} className="text-gray-200 dark:text-gray-700" />
          <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke={strokeColor} strokeWidth={6}
            strokeDasharray={circumference} strokeDashoffset={offset} strokeLinecap="round" className="transition-all duration-700" />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-2xl font-bold">{empty ? '--' : Math.round(value)}</span>
          {sublabel && <span className="text-xs text-gray-500">{sublabel}</span>}
        </div>
      </div>
      <span className="text-sm font-medium text-gray-600 dark:text-gray-400 text-center">{label}</span>
    </div>
  );
}

interface StatCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon?: ReactNode;
  trend?: 'up' | 'down' | 'neutral';
  trendValue?: string;
  className?: string;
}

export function StatCard({ title, value, subtitle, icon, trend, trendValue, className }: StatCardProps) {
  return (
    <div className={clsx('card p-4 animate-fade-in', className)}>
      <div className="flex items-start justify-between mb-2">
        <span className="text-sm text-gray-500 dark:text-gray-400">{title}</span>
        {icon && <span className="text-brand-500">{icon}</span>}
      </div>
      <div className="text-2xl font-bold">{value}</div>
      {(subtitle || trendValue) && (
        <div className="flex items-center gap-2 mt-1">
          {trendValue && (
            <span className={clsx('text-xs font-medium',
              trend === 'up' ? 'text-green-500' : trend === 'down' ? 'text-red-500' : 'text-gray-500'
            )}>{trendValue}</span>
          )}
          {subtitle && <span className="text-xs text-gray-500">{subtitle}</span>}
        </div>
      )}
    </div>
  );
}

interface ProgressBarProps {
  value: number;
  max: number;
  label?: string;
  color?: string;
  showPct?: boolean;
}

export function ProgressBar({ value, max, label, color = 'bg-brand-500', showPct = true }: ProgressBarProps) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div>
      {(label || showPct) && (
        <div className="flex justify-between text-sm mb-1">
          {label && <span className="text-gray-600 dark:text-gray-400">{label}</span>}
          {showPct && <span className="font-medium">{Math.round(pct)}%</span>}
        </div>
      )}
      <div className="h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
        <div className={clsx('h-full rounded-full transition-all duration-500', color)} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

interface InsightCardProps {
  title: string;
  content: string;
  severity: string;
  onDismiss?: () => void;
}

export function InsightCard({ title, content, severity, onDismiss }: InsightCardProps) {
  const colors: Record<string, string> = {
    warning: 'border-yellow-500/50 bg-yellow-50 dark:bg-yellow-900/20',
    important: 'border-brand-500/50 bg-brand-50 dark:bg-brand-900/20',
    info: 'border-gray-300 dark:border-gray-600',
  };

  return (
    <div className={clsx('card p-4 border-l-4 animate-slide-up', colors[severity] || colors.info)}>
      <div className="flex justify-between items-start">
        <h4 className="font-semibold text-sm">{title}</h4>
        {onDismiss && (
          <button onClick={onDismiss} className="text-gray-400 hover:text-gray-600 text-xs">Dismiss</button>
        )}
      </div>
      <p className="text-sm text-gray-600 dark:text-gray-300 mt-1">{content}</p>
    </div>
  );
}

export function LoadingSpinner() {
  return (
    <div className="flex items-center justify-center p-8">
      <div className="w-8 h-8 border-3 border-brand-500 border-t-transparent rounded-full animate-spin" />
    </div>
  );
}

export function EmptyState({ message, action }: { message: string; action?: ReactNode }) {
  return (
    <div className="text-center py-12 text-gray-500">
      <p>{message}</p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
