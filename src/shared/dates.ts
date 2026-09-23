/**
 * Pure calendar-date helpers shared by the renderer, the Electron main process,
 * and (as a hand-kept Deno copy in `supabase/functions/_shared/dates.ts`) the
 * push cron. Dates are `YYYY-MM-DD` strings; no Electron/Node/browser APIs.
 */

const pad2 = (n: number): string => String(n).padStart(2, '0');

/** `YYYY-MM-DD` of a Date in the runtime's local zone. */
export const isoLocal = (d: Date): string =>
  `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;

export interface ZonedParts {
  year: number;
  /** 1-12 */
  month: number;
  day: number;
  hour: number;
  minute: number;
}

/**
 * Wall-clock parts of `now` in the IANA `timeZone` (e.g. 'Australia/Sydney').
 * Omitted → the runtime's local zone. Needed server-side, where Deno runs in UTC.
 */
export const zonedParts = (now: Date, timeZone?: string): ZonedParts => {
  if (!timeZone) {
    return {
      year: now.getFullYear(),
      month: now.getMonth() + 1,
      day: now.getDate(),
      hour: now.getHours(),
      minute: now.getMinutes(),
    };
  }
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    hourCycle: 'h23',
  }).formatToParts(now);
  const get = (type: string): number => Number(parts.find((p) => p.type === type)?.value);
  return {
    year: get('year'),
    month: get('month'),
    day: get('day'),
    // Some engines render midnight as "24" even with h23.
    hour: get('hour') % 24,
    minute: get('minute'),
  };
};

/** Today's `YYYY-MM-DD` in `timeZone` (default: runtime local), not the UTC day. */
export const todayLocalIso = (now: Date = new Date(), timeZone?: string): string => {
  const p = zonedParts(now, timeZone);
  return `${p.year}-${pad2(p.month)}-${pad2(p.day)}`;
};

const isoToUtcMs = (iso: string): number => {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  return Date.UTC(y, m - 1, d);
};

/**
 * Whole calendar days from `fromIso` to `toIso` (negative if `toIso` is
 * earlier). Computed in UTC so DST transitions can't shave off a day.
 */
export const calendarDaysBetween = (fromIso: string, toIso: string): number =>
  Math.round((isoToUtcMs(toIso) - isoToUtcMs(fromIso)) / 86_400_000);

const daysInMonth = (year: number, month0: number): number =>
  new Date(Date.UTC(year, month0 + 1, 0)).getUTCDate();

/**
 * Add `months` to a `YYYY-MM-DD`, clamping the day to the target month's
 * length (Jan 31 + 1 → Feb 28/29). Always step from a fixed anchor, never from
 * a previously clamped result, or the day drifts (Feb 28 → Mar 28).
 */
export const addMonthsIso = (iso: string, months: number): string => {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  const total = y * 12 + (m - 1) + months;
  const year = Math.floor(total / 12);
  const month0 = total - year * 12;
  const day = Math.min(d, daysInMonth(year, month0));
  return `${year}-${pad2(month0 + 1)}-${pad2(day)}`;
};
