import { describe, expect, it } from 'vitest';
import type { AppData, NotifyPrefs, Subscription } from './types';
import { computeDueAlerts, daysUntil, inQuietHours } from './notifications-core';

const sub = (over: Partial<Subscription>): Subscription => ({
  id: 's1',
  name: 'Netflix',
  cost: 15.99,
  currency: 'USD',
  billingCycle: 'monthly',
  renewalDate: '2026-06-10',
  subscribedSince: '2026-01-10',
  renewals: [],
  status: 'active',
  createdAt: '2026-01-10T00:00:00.000Z',
  updatedAt: '2026-01-10T00:00:00.000Z',
  ...over,
});

const data = (subs: Subscription[], notify: Partial<NotifyPrefs> = {}): AppData =>
  ({
    version: 1,
    subscriptions: subs,
    oneTimePurchases: [],
    categories: [],
    cancellationLog: [],
    preferences: {
      theme: 'system',
      defaultCurrency: 'USD',
      reminderDays: 30,
      enableLogoFetch: false,
      layoutTheme: 'default',
      aiAssistant: { enabled: false, model: 'x', hasKey: false },
      notify: { enabled: true, globalDaysBefore: [7, 1, 0], minimizeToTray: true, ...notify },
    },
  }) as unknown as AppData;

// renewal Jun 10; "now" Jun 4 → 6 days out, crosses the 7-day threshold.
const NOW = new Date('2026-06-04T12:00:00');

describe('computeDueAlerts', () => {
  it('fires the largest crossed renewal threshold and marks it', () => {
    const r = computeDueAlerts(data([sub({})]), NOW);
    expect(r.fired).toBe(1);
    expect(r.toFire).toHaveLength(1);
    expect(r.toFire[0].title).toContain('Netflix renews');
    expect(r.subscriptions[0].firedAlerts).toContain('2026-06-10:7');
  });

  it('does not re-fire an already-fired alert', () => {
    const r = computeDueAlerts(data([sub({ firedAlerts: ['2026-06-10:7'] })]), NOW);
    expect(r.fired).toBe(0);
    expect(r.toFire).toHaveLength(0);
  });

  it('quiet hours defer alerts: nothing shown and nothing marked fired', () => {
    // 12:00 is inside 08:00–22:00 quiet window.
    const r = computeDueAlerts(data([sub({})], { quietHours: ['08:00', '22:00'] }), NOW);
    expect(r.fired).toBe(0);
    expect(r.toFire).toHaveLength(0);
    expect(r.subscriptions[0].firedAlerts ?? []).not.toContain('2026-06-10:7');
  });

  it('a deferred alert fires on the first check after quiet hours (window spans midnight)', () => {
    const d = data([sub({})], { quietHours: ['22:00', '08:00'] });
    for (const t of ['2026-06-04T22:00:00Z', '2026-06-04T23:30:00Z', '2026-06-05T07:59:00Z']) {
      const r = computeDueAlerts(d, new Date(t), 'UTC');
      expect(r.toFire).toHaveLength(0);
      expect(r.subscriptions[0].firedAlerts ?? []).toHaveLength(0);
    }
    const after = computeDueAlerts(d, new Date('2026-06-05T08:00:00Z'), 'UTC');
    expect(after.toFire).toHaveLength(1);
    expect(after.subscriptions[0].firedAlerts).toContain('2026-06-10:7');
  });

  it('skips inactive subscriptions', () => {
    const r = computeDueAlerts(data([sub({ status: 'inactive' })]), NOW);
    expect(r.fired).toBe(0);
  });

  it('returns nothing when notifications are disabled', () => {
    const r = computeDueAlerts(data([sub({})], { enabled: false }), NOW);
    expect(r.fired).toBe(0);
    expect(r.toFire).toHaveLength(0);
  });

  it('fires a trial-end alert', () => {
    const r = computeDueAlerts(
      data([sub({ renewalDate: '2026-12-01', trial: { endsAt: '2026-06-05' } })]),
      NOW,
    );
    expect(r.toFire.some((f) => f.title.includes('trial ends'))).toBe(true);
    // Every crossed threshold (trialDays=1 ≤ 7, ≤ 1) is marked in one pass.
    expect(r.subscriptions[0].firedAlerts).toContain('trial:2026-06-05:7');
    expect(r.subscriptions[0].firedAlerts).toContain('trial:2026-06-05:1');
    expect(r.toFire.filter((f) => f.title.includes('trial ends'))).toHaveLength(1);
  });

  it('prunes fired-alert keys older than the retention window', () => {
    // An ancient key + a fresh alert this run → the ancient key is dropped.
    const r = computeDueAlerts(data([sub({ firedAlerts: ['2020-01-01:7'] })]), NOW);
    expect(r.subscriptions[0].firedAlerts).not.toContain('2020-01-01:7');
    expect(r.subscriptions[0].firedAlerts).toContain('2026-06-10:7');
  });

  it('catch-up after downtime emits ONE alert and marks every crossed threshold', () => {
    // App was off all week; first check is on the renewal day itself.
    const d = data([sub({})]);
    const first = computeDueAlerts(d, new Date('2026-06-10T09:00:00'));
    expect(first.toFire).toHaveLength(1);
    expect(first.toFire[0].title).toBe('Netflix renews today');
    expect(first.subscriptions[0].firedAlerts).toEqual(
      expect.arrayContaining(['2026-06-10:7', '2026-06-10:1', '2026-06-10:0']),
    );
    // Later ticks the same day must not replay the 1- or 0-day alerts.
    const again = computeDueAlerts(
      { ...d, subscriptions: first.subscriptions },
      new Date('2026-06-10T15:00:00'),
    );
    expect(again.toFire).toHaveLength(0);
  });

  it('still fires once per threshold when checks run every day', () => {
    let subs = [sub({})];
    const titles: string[] = [];
    for (const day of ['04', '05', '06', '07', '08', '09', '10']) {
      const r = computeDueAlerts(data(subs), new Date(`2026-06-${day}T12:00:00`));
      titles.push(...r.toFire.map((f) => f.title));
      subs = r.subscriptions;
    }
    expect(titles).toEqual([
      'Netflix renews in 6 days',
      'Netflix renews tomorrow',
      'Netflix renews today',
    ]);
  });
});

describe('daysUntil', () => {
  it('counts calendar days across DST start (America/New_York, Mar 14 2027)', () => {
    const now = new Date('2027-03-13T17:00:00Z'); // 12:00 EST
    expect(daysUntil('2027-03-15', now, 'America/New_York')).toBe(2);
    expect(daysUntil('2027-03-14', now, 'America/New_York')).toBe(1);
  });

  it('counts calendar days across DST end (America/New_York, Nov 7 2027)', () => {
    const now = new Date('2027-11-06T16:00:00Z'); // 12:00 EDT
    expect(daysUntil('2027-11-08', now, 'America/New_York')).toBe(2);
  });

  it('uses the given time zone to decide what "today" is', () => {
    // 15:00 UTC Jun 9 is already 01:00 Jun 10 in Sydney.
    const now = new Date('2026-06-09T15:00:00Z');
    expect(daysUntil('2026-06-10', now, 'Australia/Sydney')).toBe(0);
    expect(daysUntil('2026-06-10', now, 'UTC')).toBe(1);
  });
});

describe('inQuietHours', () => {
  const prefs = { quietHours: ['22:00', '08:00'] as [string, string] };
  it('handles windows that span midnight', () => {
    expect(inQuietHours(prefs, new Date('2026-06-04T21:59:00Z'), 'UTC')).toBe(false);
    expect(inQuietHours(prefs, new Date('2026-06-04T22:00:00Z'), 'UTC')).toBe(true);
    expect(inQuietHours(prefs, new Date('2026-06-05T00:00:00Z'), 'UTC')).toBe(true);
    expect(inQuietHours(prefs, new Date('2026-06-05T07:59:00Z'), 'UTC')).toBe(true);
    expect(inQuietHours(prefs, new Date('2026-06-05T08:00:00Z'), 'UTC')).toBe(false);
  });

  it('evaluates the window in the given time zone', () => {
    // 13:00 UTC = 23:00 in Sydney (AEST, UTC+10).
    const now = new Date('2026-06-04T13:00:00Z');
    expect(inQuietHours(prefs, now, 'UTC')).toBe(false);
    expect(inQuietHours(prefs, now, 'Australia/Sydney')).toBe(true);
  });
});
