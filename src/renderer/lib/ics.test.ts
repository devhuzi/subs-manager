import { describe, expect, it } from 'vitest';
import { defaultPreferences, type AppData, type Subscription } from '../../shared/types';
import { buildIcs, rruleFor } from './ics';

const sub = (over: Partial<Subscription>): Subscription => ({
  id: 's1',
  name: 'Netflix',
  cost: 10,
  currency: 'USD',
  billingCycle: 'monthly',
  renewalDate: '2026-06-15',
  subscribedSince: '2026-01-15',
  renewals: [],
  status: 'active',
  createdAt: '',
  updatedAt: '',
  ...over,
});

const data = (subs: Subscription[], globalDaysBefore = [7, 1, 0]): AppData => {
  const preferences = defaultPreferences();
  return {
    version: 1,
    subscriptions: subs,
    oneTimePurchases: [],
    categories: [],
    preferences: { ...preferences, notify: { ...preferences.notify, globalDaysBefore } },
    cancellationLog: [],
  };
};

const NOW = new Date(Date.UTC(2026, 4, 1));

describe('rruleFor', () => {
  it('keeps a plain rule for days up to 28', () => {
    expect(rruleFor(sub({}))).toBe('FREQ=MONTHLY');
    expect(rruleFor(sub({ billingCycle: 'quarterly' }))).toBe('FREQ=MONTHLY;INTERVAL=3');
    expect(rruleFor(sub({ billingCycle: 'yearly' }))).toBe('FREQ=YEARLY');
    expect(rruleFor(sub({ billingCycle: 'custom' }))).toBeNull();
  });

  it('uses the last day of the month for a 31st anchor (even after a clamp)', () => {
    // subscribedSince Jan 31 → the Feb 28 renewal is on-schedule; anchor is the 31st.
    const s = sub({ subscribedSince: '2026-01-31', renewalDate: '2026-02-28' });
    expect(rruleFor(s)).toBe('FREQ=MONTHLY;BYMONTHDAY=-1');
  });

  it('clamps 29th/30th anchors in shorter months instead of skipping them', () => {
    const s30 = sub({ subscribedSince: '2026-01-30', renewalDate: '2026-03-30' });
    expect(rruleFor(s30)).toBe('FREQ=MONTHLY;BYMONTHDAY=28,29,30;BYSETPOS=-1');
    const s29 = sub({ billingCycle: 'quarterly', subscribedSince: '2026-01-29', renewalDate: '2026-04-29' });
    expect(rruleFor(s29)).toBe('FREQ=MONTHLY;INTERVAL=3;BYMONTHDAY=28,29;BYSETPOS=-1');
  });

  it('falls back to Feb 28 for a Feb 29 yearly anchor', () => {
    const s = sub({ billingCycle: 'yearly', subscribedSince: '2024-02-29', renewalDate: '2027-02-28' });
    expect(rruleFor(s)).toBe('FREQ=YEARLY;BYMONTH=2;BYMONTHDAY=28,29;BYSETPOS=-1');
  });
});

describe('buildIcs reminders', () => {
  it('uses the largest global notify threshold', () => {
    const ics = buildIcs(data([sub({})], [3, 14, 1]), NOW);
    expect(ics).toContain('TRIGGER:-P14D');
  });

  it('prefers a per-subscription alert override', () => {
    const ics = buildIcs(data([sub({ alertConfig: { daysBefore: [2, 5] } })]), NOW);
    expect(ics).toContain('TRIGGER:-P5D');
  });

  it('omits the alarm when there are no thresholds', () => {
    const ics = buildIcs(data([sub({})], []), NOW);
    expect(ics).not.toContain('VALARM');
    expect(ics).toContain('END:VEVENT');
  });

  it('only exports active subscriptions', () => {
    const ics = buildIcs(data([sub({}), sub({ id: 's2', status: 'inactive' })]), NOW);
    expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(1);
  });
});
