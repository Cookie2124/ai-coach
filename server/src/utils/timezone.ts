const DEFAULT_TZ = 'Australia/Sydney';

export function isValidTimezone(tz: string): boolean {
  if (!tz || typeof tz !== 'string') return false;
  try {
    Intl.DateTimeFormat(undefined, { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

export function normalizeTimezone(tz?: string | null): string {
  if (tz && isValidTimezone(tz)) return tz;
  return DEFAULT_TZ;
}

/** YYYY-MM-DD in the given IANA timezone */
export function localDateString(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

export function todayInTz(timeZone: string): string {
  return localDateString(new Date(), timeZone);
}

export function addDaysToLocalDate(localDate: string, delta: number): string {
  const [y, m, d] = localDate.split('-').map(Number);
  const dt = new Date(y, m - 1, d + delta);
  const year = dt.getFullYear();
  const month = String(dt.getMonth() + 1).padStart(2, '0');
  const day = String(dt.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function daysAgoInTz(n: number, timeZone: string): string {
  return addDaysToLocalDate(todayInTz(timeZone), -n);
}

export function getLocalTimeParts(date: Date, timeZone: string) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone,
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    }).formatToParts(date)
      .filter(p => p.type !== 'literal')
      .map(p => [p.type, p.value]),
  );
  return {
    date: localDateString(date, timeZone),
    hour: parseInt(parts.hour ?? '12', 10),
    minute: parseInt(parts.minute ?? '0', 10),
    weekday: parts.weekday ?? '',
    month: parts.month ?? '',
    day: parseInt(parts.day ?? '1', 10),
    year: parseInt(parts.year ?? '2026', 10),
  };
}

export function formatNowContext(timeZone: string) {
  const now = new Date();
  const parts = getLocalTimeParts(now, timeZone);
  const timeLabel = new Intl.DateTimeFormat('en-AU', {
    timeZone,
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(now);
  return {
    timezone: timeZone,
    localDate: parts.date,
    localTime: timeLabel,
    weekday: parts.weekday,
    longDate: `${parts.weekday}, ${parts.day} ${parts.month} ${parts.year}`,
    yesterday: addDaysToLocalDate(parts.date, -1),
    tomorrow: addDaysToLocalDate(parts.date, 1),
  };
}

/** Store as local wall-clock string so SQLite date() buckets correctly for the user */
export function localLoggedAt(localDate: string, hour = 12, minute = 0): string {
  return `${localDate}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00`;
}

export function currentLocalLoggedAt(timeZone: string): string {
  const parts = getLocalTimeParts(new Date(), timeZone);
  return localLoggedAt(parts.date, parts.hour, parts.minute);
}

export function mealTimeForType(mealType: string, localDate: string, timeZone: string): string {
  const now = new Date();
  const today = todayInTz(timeZone);
  const defaults: Record<string, [number, number]> = {
    breakfast: [8, 0],
    lunch: [12, 30],
    dinner: [19, 0],
    snack: [15, 0],
    'pre-workout': [16, 0],
    'post-workout': [18, 0],
  };
  if (localDate === today) {
    const parts = getLocalTimeParts(now, timeZone);
    return localLoggedAt(localDate, parts.hour, parts.minute);
  }
  const [h, m] = defaults[mealType] ?? [12, 0];
  return localLoggedAt(localDate, h, m);
}
