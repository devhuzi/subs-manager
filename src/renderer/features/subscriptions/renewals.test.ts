import { describe, expect, it } from 'vitest';
import type { Renewal, Subscription } from '../../../shared/types';
import {
  advanceRenewal,
  autoFillSub,
  daysUntil,
  extendForward,
  fillHistoricalRenewals,
  nextRenewalFromStart,
  periodKey,
  renewalLabel,
  renewalUrgency,
  trimRenewalsToWindow,
} from './renewals';

const sub = (over: Partial<Subscription>): Subscription => ({
  id: 'sub-1',
  name: 'Test',
  cost: 10,
  currency: 'USD',
  billingCycle: 'monthly',
  renewalDate: '2026-06-03',
  subscribedSince: '2026-03-03',
  renewals: [],
  status: 'active',
  createdAt: '2026-03-03T00:00:00.000Z',
  updatedAt: '2026-03-03T00:00:00.000Z',
  ...over,
});

const renewal = (date: string): Renewal => ({
  id: crypto.randomUUID(),
  date,
  cost: 10,
  currency: 'USD',
  enabled: true,
});

describe('advanceRenewal', () => {
  it('advances by one month, preserving day', () => {
    expect(advanceRenewal('2026-05-03', 'monthly')).toBe('2026-06-03');
  });
  it('clamps to end of shorter month', () => {
    expect(advanceRenewal('2026-01-31', 'monthly')).toBe('2026-02-28');
  });
  it('advances yearly', () => {
    expect(advanceRenewal('2026-06-03', 'yearly')).toBe('2027-06-03');
  });
});

describe('periodKey', () => {
  it('buckets monthly by year-month', () => {
    expect(periodKey('2026-05-03', 'monthly')).toBe(periodKey('2026-05-20', 'monthly'));
    expect(periodKey('2026-05-03', 'monthly')).not.toBe(periodKey('2026-06-03', 'monthly'));
  });
});

describe('trimRenewalsToWindow', () => {
  const today = new Date('2026-05-27');

  it('drops a future-dated renewal (the reported bug)', () => {
    // renewalDate Jun 3, today May 27 — a Jun 2 renewal must not exist yet.
    const s = sub({
      renewalDate: '2026-06-03',
      renewals: [renewal('2026-03-03'), renewal('2026-04-03'), renewal('2026-05-03'), renewal('2026-06-02')],
    });
    const out = trimRenewalsToWindow(s, today);
    expect(out.renewals.map((r) => r.date)).toEqual(['2026-03-03', '2026-04-03', '2026-05-03']);
  });

  it('drops renewals before a corrected subscribedSince', () => {
    const s = sub({
      subscribedSince: '2026-03-03',
      renewals: [renewal('2026-01-03'), renewal('2026-02-03'), renewal('2026-03-03')],
    });
    const out = trimRenewalsToWindow(s, today);
    expect(out.renewals.map((r) => r.date)).toEqual(['2026-03-03']);
  });

  it('leaves custom-cycle subs untouched', () => {
    const s = sub({ billingCycle: 'custom', renewals: [renewal('2030-01-01')] });
    expect(trimRenewalsToWindow(s, today).renewals).toHaveLength(1);
  });
});

describe('fillHistoricalRenewals', () => {
  it('backfills missing months between subscribedSince and renewalDate', () => {
    const s = sub({ subscribedSince: '2026-03-03', renewalDate: '2026-06-03', renewals: [] });
    const out = fillHistoricalRenewals(s);
    // Mar, Apr, May (Jun is the next-due cap, exclusive)
    expect(out.renewals.map((r) => r.date)).toEqual(['2026-03-03', '2026-04-03', '2026-05-03']);
  });

  it('does not duplicate an already-logged month', () => {
    const s = sub({
      subscribedSince: '2026-03-03',
      renewalDate: '2026-05-03',
      renewals: [renewal('2026-03-03')],
    });
    const out = fillHistoricalRenewals(s);
    const marchCount = out.renewals.filter((r) => r.date.startsWith('2026-03')).length;
    expect(marchCount).toBe(1);
  });

  it('skips custom cycles', () => {
    const s = sub({ billingCycle: 'custom' });
    expect(fillHistoricalRenewals(s).renewals).toHaveLength(0);
  });
});

describe('autoFillSub', () => {
  it('is idempotent — running twice yields the same renewal dates', () => {
    const today = new Date('2026-05-27');
    const once = autoFillSub(sub({ renewals: [] }), today);
    const twice = autoFillSub(once, today);
    expect(twice.renewals.map((r) => r.date).sort()).toEqual(
      once.renewals.map((r) => r.date).sort(),
    );
  });

  it('never produces a renewal dated after today', () => {
    const today = new Date('2026-05-27');
    const out = autoFillSub(sub({ renewals: [] }), today);
    const todayStr = '2026-05-27';
    expect(out.renewals.every((r) => r.date <= todayStr)).toBe(true);
  });

  it('does not extend an inactive sub past its renewalDate', () => {
    const today = new Date('2026-05-27');
    // renewalDate is in the past, but the sub is inactive — must not advance.
    const out = autoFillSub(
      sub({ status: 'inactive', renewalDate: '2026-05-03', renewals: [] }),
      today,
    );
    expect(out.renewalDate).toBe('2026-05-03');
  });
});

describe('month-end anchoring (no Jan 31 → Feb 28 → Mar 28 drift)', () => {
  const MONTH_ENDS_2026 = [
    '2026-01-31',
    '2026-02-28',
    '2026-03-31',
    '2026-04-30',
    '2026-05-31',
    '2026-06-30',
    '2026-07-31',
    '2026-08-31',
    '2026-09-30',
    '2026-10-31',
    '2026-11-30',
    '2026-12-31',
  ];

  it('fillHistoricalRenewals steps each month from subscribedSince', () => {
    const s = sub({ subscribedSince: '2026-01-31', renewalDate: '2027-01-31', renewals: [] });
    expect(fillHistoricalRenewals(s).renewals.map((r) => r.date)).toEqual(MONTH_ENDS_2026);
  });

  it('extendForward keeps the anchor day across 12 months', () => {
    const s = sub({ subscribedSince: '2026-01-31', renewalDate: '2026-01-31', renewals: [] });
    const out = extendForward(s, new Date(2027, 0, 15));
    expect(out.renewals.map((r) => r.date)).toEqual(MONTH_ENDS_2026);
    expect(out.renewalDate).toBe('2027-01-31');
  });

  it('extendForward recovers the anchor day after an already-clamped renewalDate', () => {
    const s = sub({ subscribedSince: '2026-01-31', renewalDate: '2026-02-28', renewals: [] });
    expect(extendForward(s, new Date(2026, 2, 1)).renewalDate).toBe('2026-03-31');
  });

  it('extendForward steps from renewalDate when it is off the subscribedSince schedule', () => {
    const s = sub({ subscribedSince: '2026-01-15', renewalDate: '2026-05-03', renewals: [] });
    const out = extendForward(s, new Date(2026, 4, 27));
    expect(out.renewalDate).toBe('2026-06-03');
    expect(out.renewals.map((r) => r.date)).toEqual(['2026-05-03']);
  });

  it('autoFillSub produces anchored dates for a month-end subscription', () => {
    const out = autoFillSub(
      sub({ subscribedSince: '2026-01-31', renewalDate: '2026-02-28', renewals: [] }),
      new Date(2026, 4, 1),
    );
    expect(out.renewals.map((r) => r.date).sort()).toEqual(
      MONTH_ENDS_2026.slice(0, 3).concat('2026-04-30'),
    );
    expect(out.renewalDate).toBe('2026-05-31');
  });
});

describe('nextRenewalFromStart', () => {
  it('is one cycle after a start of today', () => {
    expect(nextRenewalFromStart('2026-09-23', 'monthly', '2026-09-23')).toBe('2026-10-23');
    expect(nextRenewalFromStart('2026-09-23', 'yearly', '2026-09-23')).toBe('2027-09-23');
  });
  it('rolls a past start forward to the first date after today', () => {
    expect(nextRenewalFromStart('2026-01-15', 'monthly', '2026-09-23')).toBe('2026-10-15');
    expect(nextRenewalFromStart('2026-01-15', 'quarterly', '2026-09-23')).toBe('2026-10-15');
    // A charge falling exactly today has happened; the next one is a cycle on.
    expect(nextRenewalFromStart('2026-01-23', 'monthly', '2026-09-23')).toBe('2026-10-23');
  });
  it('keeps month-end anchors from drifting', () => {
    expect(nextRenewalFromStart('2026-01-31', 'monthly', '2026-04-10')).toBe('2026-04-30');
  });
  it('returns today for custom cycles', () => {
    expect(nextRenewalFromStart('2026-01-15', 'custom', '2026-09-23')).toBe('2026-09-23');
  });
});

describe('daysUntil', () => {
  const today = new Date(2026, 8, 23, 18, 30); // late in the day, local time
  it('counts calendar days, ignoring the time of day', () => {
    expect(daysUntil('2026-09-23', today)).toBe(0);
    expect(daysUntil('2026-09-24', today)).toBe(1);
    expect(daysUntil('2026-09-20', today)).toBe(-3);
  });
});

describe('renewalUrgency', () => {
  it('buckets by the DESIGN.md thresholds', () => {
    expect(renewalUrgency(-1)).toBe('overdue');
    expect(renewalUrgency(0)).toBe('imminent');
    expect(renewalUrgency(2)).toBe('imminent');
    expect(renewalUrgency(3)).toBe('soon');
    expect(renewalUrgency(7)).toBe('soon');
    expect(renewalUrgency(8)).toBe('later');
  });
});

describe('renewalLabel', () => {
  it('names today and tomorrow', () => {
    expect(renewalLabel(0, '2026-09-23')).toBe('Today');
    expect(renewalLabel(1, '2026-09-24')).toBe('Tomorrow');
  });
  it('shows a countdown plus the date within a month', () => {
    expect(renewalLabel(5, '2026-09-28')).toBe('In 5 days · Sep 28');
    expect(renewalLabel(30, '2026-10-23')).toBe('In 30 days · Oct 23');
  });
  it('shows the full date further out', () => {
    expect(renewalLabel(45, '2026-11-07')).toBe('Nov 7, 2026');
  });
  it('marks passed dates, with a custom word for trials', () => {
    expect(renewalLabel(-3, '2026-09-20')).toBe('Overdue · Sep 20');
    expect(renewalLabel(-3, '2026-09-20', 'Ended')).toBe('Ended · Sep 20');
  });
});
