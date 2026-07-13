export function round(n: number | null | undefined, decimals = 1): number | null {
  if (n == null || Number.isNaN(n)) return null;
  const f = 10 ** decimals;
  return Math.round(n * f) / f;
}

export function fmtSleepHours(hours: number | null | undefined): string {
  if (hours == null || Number.isNaN(hours)) return '—';
  const h = Math.floor(hours);
  const m = Math.round((hours - h) * 60);
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

export function sanitizeRecoveryTrend(entries: Record<string, unknown>[]) {
  return entries.map(e => ({
    date: e.date as string,
    recovery_score: round(e.recovery_score as number, 0),
    hrv_ms: round(e.hrv_ms as number, 0),
    strain: round(e.strain as number, 1),
    stress_score: round(e.stress_score as number, 0),
    duration_hours: round(e.duration_hours as number, 1),
    sleep_display: fmtSleepHours(e.duration_hours as number),
    performance_pct: round(e.performance_pct as number, 0),
  }));
}

export function sanitizeSleepEntry(s: Record<string, unknown> | undefined) {
  if (!s) return null;
  const hours = s.duration_hours as number | undefined;
  return {
    ...s,
    duration_hours: round(hours, 1),
    duration_display: fmtSleepHours(hours),
    performance_pct: round(s.performance_pct as number, 0),
    efficiency_pct: round(s.efficiency_pct as number, 0),
    deep_sleep_hours: round(s.deep_sleep_hours as number, 1),
    rem_sleep_hours: round(s.rem_sleep_hours as number, 1),
  };
}

export function sanitizeRecoveryEntry(r: Record<string, unknown> | undefined) {
  if (!r) return null;
  return {
    ...r,
    recovery_score: round(r.recovery_score as number, 0),
    hrv_ms: round(r.hrv_ms as number, 0),
    resting_hr: round(r.resting_hr as number, 0),
    strain: round(r.strain as number, 1),
    respiratory_rate: round(r.respiratory_rate as number, 1),
  };
}

export function computeTrendDelta(recent: number[], compareCount = 7): number | null {
  const valid = recent.filter(v => v != null && !Number.isNaN(v));
  if (valid.length < 2) return null;
  const latest = valid[valid.length - 1];
  const compareSlice = valid.slice(Math.max(0, valid.length - compareCount - 1), valid.length - 1);
  if (compareSlice.length === 0) return null;
  const avg = compareSlice.reduce((a, b) => a + b, 0) / compareSlice.length;
  return round(latest - avg, 1);
}
