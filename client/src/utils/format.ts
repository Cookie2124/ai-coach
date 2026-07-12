/** Human-friendly number formatting for the UI */

export function fmtNum(n: number | null | undefined, decimals = 0): string {
  if (n == null || Number.isNaN(n)) return '—';
  return n.toLocaleString(undefined, { maximumFractionDigits: decimals, minimumFractionDigits: decimals });
}

/** 8.956 → "8h 57m" */
export function fmtSleepHours(hours: number | null | undefined): string {
  if (hours == null || Number.isNaN(hours)) return '—';
  const h = Math.floor(hours);
  const m = Math.round((hours - h) * 60);
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

/** 82.456 → "82.5 kg" */
export function fmtWeight(kg: number | null | undefined): string {
  if (kg == null || Number.isNaN(kg)) return '—';
  return `${fmtNum(kg, 1)} kg`;
}

/** 72.4 → "72%" */
export function fmtPct(n: number | null | undefined, decimals = 0): string {
  if (n == null || Number.isNaN(n)) return '—';
  return `${fmtNum(n, decimals)}%`;
}

/** HRV ms */
export function fmtHrv(ms: number | null | undefined): string {
  if (ms == null || Number.isNaN(ms)) return '—';
  return `${Math.round(ms)} ms`;
}

/** Strain 0-21 */
export function fmtStrain(n: number | null | undefined): string {
  if (n == null || Number.isNaN(n)) return '—';
  return fmtNum(n, 1);
}

/** Grams macro */
export function fmtGrams(g: number | null | undefined): string {
  if (g == null || Number.isNaN(g)) return '—';
  return `${Math.round(g)}g`;
}

/** Calories */
export function fmtCalories(n: number | null | undefined): string {
  if (n == null || Number.isNaN(n)) return '—';
  return `${Math.round(n).toLocaleString()} cal`;
}

/** Signed change: +0.3 kg */
export function fmtChange(n: number | null | undefined, unit = '', decimals = 1): string {
  if (n == null || Number.isNaN(n)) return '';
  const sign = n > 0 ? '+' : '';
  return `${sign}${fmtNum(n, decimals)}${unit}`;
}

export type TrendDir = 'up' | 'down' | 'neutral';

export function trendFromDelta(delta: number | null | undefined, invert = false): TrendDir {
  if (delta == null || Math.abs(delta) < 0.05) return 'neutral';
  const positive = delta > 0;
  if (invert) return positive ? 'down' : 'up';
  return positive ? 'up' : 'down';
}

export function fmtTrendLabel(delta: number | null | undefined, unit: string, period = 'vs avg'): string {
  if (delta == null || Number.isNaN(delta)) return '';
  if (Math.abs(delta) < 0.05) return `Stable ${period}`;
  const sign = delta > 0 ? '+' : '';
  return `${sign}${fmtNum(delta, 1)}${unit} ${period}`;
}

export function fmtDateShort(iso: string): string {
  if (!iso) return '';
  const d = new Date(iso.includes('T') ? iso : iso + 'T12:00:00');
  return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
}

export function fmtDateChart(iso: string): string {
  if (!iso) return '';
  const parts = iso.split('T')[0].split('-');
  if (parts.length >= 3) return `${parts[1]}/${parts[2]}`;
  return iso.slice(5);
}

export function capitalize(s: string): string {
  return s.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

export function recoveryLabel(score: number | null | undefined): string {
  if (score == null) return 'No data';
  if (score >= 67) return 'Green — ready to perform';
  if (score >= 34) return 'Yellow — moderate';
  return 'Red — prioritize recovery';
}
