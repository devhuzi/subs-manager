import { describe, expect, it } from 'vitest';
import { addMonthsIso, calendarDaysBetween, todayLocalIso } from './dates';

describe('calendarDaysBetween', () => {
  it('counts whole calendar days, independent of DST', () => {
    expect(calendarDaysBetween('2027-03-13', '2027-03-15')).toBe(2);
    expect(calendarDaysBetween('2027-11-06', '2027-11-08')).toBe(2);
    expect(calendarDaysBetween('2026-06-10', '2026-06-10')).toBe(0);
    expect(calendarDaysBetween('2026-06-10', '2026-06-01')).toBe(-9);
    expect(calendarDaysBetween('2024-02-28', '2024-03-01')).toBe(2);
  });
});

describe('todayLocalIso', () => {
  it('returns the day in the given zone, not the UTC day', () => {
    const now = new Date('2026-06-09T15:00:00Z');
    expect(todayLocalIso(now, 'UTC')).toBe('2026-06-09');
    expect(todayLocalIso(now, 'Australia/Sydney')).toBe('2026-06-10');
    expect(todayLocalIso(new Date('2026-06-10T02:00:00Z'), 'America/Los_Angeles')).toBe(
      '2026-06-09',
    );
  });

  it('defaults to the runtime local day', () => {
    const now = new Date(2026, 0, 5, 23, 30);
    expect(todayLocalIso(now)).toBe('2026-01-05');
  });
});

describe('addMonthsIso', () => {
  it('clamps to the end of shorter months', () => {
    expect(addMonthsIso('2026-01-31', 1)).toBe('2026-02-28');
    expect(addMonthsIso('2024-01-31', 1)).toBe('2024-02-29');
    expect(addMonthsIso('2026-01-31', 3)).toBe('2026-04-30');
  });

  it('crosses year boundaries in both directions', () => {
    expect(addMonthsIso('2026-11-15', 3)).toBe('2027-02-15');
    expect(addMonthsIso('2026-02-15', -3)).toBe('2025-11-15');
    expect(addMonthsIso('2024-02-29', 12)).toBe('2025-02-28');
  });
});
