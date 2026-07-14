/** Local calendar date YYYY-MM-DD (not UTC) */
export function toLocalDateInput(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function addDaysToLocalDate(iso: string, delta: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(y, m - 1, d + delta);
  return toLocalDateInput(dt);
}

export function getUserTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'Australia/Sydney';
  } catch {
    return 'Australia/Sydney';
  }
}

export function formatNotchDate(iso: string): string {
  const d = new Date(`${iso}T12:00:00`);
  const today = toLocalDateInput();
  const yesterday = addDaysToLocalDate(today, -1);
  const label = d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
  if (iso === today) return `Today · ${label}`;
  if (iso === yesterday) return `Yesterday · ${label}`;
  return label;
}

export function formatLocalNow(): string {
  return new Date().toLocaleString(undefined, {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}
