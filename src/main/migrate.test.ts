import { describe, expect, it } from 'vitest';
import type { AppData } from '../shared/types';
import { migrate } from './migrate';

/**
 * These feed an OLD pre-upgrade `subs-manager.json` (built as loosely-typed
 * objects, since old files lack today's fields) through migrate() and assert it
 * upgrades cleanly — nothing dropped, nothing crashes, defaults back-filled.
 */

// A realistic early-version file: subs without subscribedSince, renewals
// without id/enabled, no cancellationLog, and a partial preferences object
// missing everything added since (layoutTheme, aiAssistant, parts of notify).
// It even carries a since-removed `homeCurrency` key to prove stale fields
// don't break the load.
const oldFile = (): AppData =>
  ({
    version: 1,
    subscriptions: [
      {
        id: 'sub-1',
        name: 'Netflix',
        cost: 15.99,
        currency: 'USD',
        billingCycle: 'monthly',
        renewalDate: '2026-06-10',
        // no subscribedSince
        renewals: [
          // no id, no enabled
          { date: '2026-04-10', cost: 15.99, currency: 'USD' },
          { date: '2026-05-10', cost: 15.99, currency: 'USD' },
        ],
        status: 'active',
        createdAt: '2026-04-10T00:00:00.000Z',
        updatedAt: '2026-04-10T00:00:00.000Z',
      },
    ],
    oneTimePurchases: [
      {
        id: 'p-1',
        name: 'Affinity Photo',
        cost: 70,
        currency: 'USD',
        purchaseDate: '2026-01-01',
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
    ],
    categories: [{ id: 'c-1', name: 'Entertainment' }],
    // no cancellationLog
    preferences: {
      theme: 'dark',
      defaultCurrency: 'AUD',
      homeCurrency: 'AUD', // legacy field, since removed
      reminderDays: 14,
      enableLogoFetch: true,
      notify: { enabled: true, globalDaysBefore: [3] }, // missing minimizeToTray
      // no aiAssistant, no layoutTheme
    },
  }) as unknown as AppData;

describe('migrate — old data file', () => {
  it('back-fills subscribedSince from renewalDate', () => {
    const out = migrate(oldFile());
    expect(out.subscriptions[0].subscribedSince).toBe('2026-06-10');
  });

  it('back-fills renewal id and enabled without dropping the renewal data', () => {
    const out = migrate(oldFile());
    const renewals = out.subscriptions[0].renewals;
    expect(renewals).toHaveLength(2);
    for (const r of renewals) {
      expect(typeof r.id).toBe('string');
      expect(r.id.length).toBeGreaterThan(0);
      expect(r.enabled).toBe(true);
    }
    // original dates/costs preserved
    expect(renewals.map((r) => r.date)).toEqual(['2026-04-10', '2026-05-10']);
  });

  it('defaults a missing cancellationLog to an empty array', () => {
    const out = migrate(oldFile());
    expect(out.cancellationLog).toEqual([]);
  });

  it('fills new preference keys while preserving existing user values', () => {
    const out = migrate(oldFile());
    // preserved
    expect(out.preferences.theme).toBe('dark');
    expect(out.preferences.defaultCurrency).toBe('AUD');
    expect(out.preferences.reminderDays).toBe(14);
    expect(out.preferences.enableLogoFetch).toBe(true);
    expect(out.preferences.notify.globalDaysBefore).toEqual([3]);
    // back-filled defaults
    expect(out.preferences.layoutTheme).toBe('default');
    expect(out.preferences.notify.minimizeToTray).toBe(true);
    expect(out.preferences.aiAssistant).toEqual({
      enabled: false,
      model: 'anthropic/claude-sonnet-4',
      hasKey: false,
    });
  });

  it('does not invent optional fields that were absent', () => {
    const out = migrate(oldFile());
    const sub = out.subscriptions[0];
    expect(sub.paymentMethod).toBeUndefined();
    expect(sub.priceHistory).toBeUndefined();
    expect(sub.trial).toBeUndefined();
    expect(sub.alertConfig).toBeUndefined();
    expect(out.oneTimePurchases[0].paymentMethod).toBeUndefined();
    expect(out.categories[0].monthlyBudget).toBeUndefined();
  });

  it('is idempotent — a second pass changes nothing', () => {
    const once = migrate(oldFile());
    const twice = migrate(once);
    expect(twice).toEqual(once);
  });
});

describe('migrate — current-shape file', () => {
  it('preserves all new optional fields on a round-trip', () => {
    const current = {
      version: 1,
      subscriptions: [
        {
          id: 'sub-1',
          name: 'Spotify',
          cost: 11.99,
          currency: 'EUR',
          billingCycle: 'monthly',
          renewalDate: '2026-06-01',
          subscribedSince: '2026-01-01',
          renewals: [{ id: 'r-1', date: '2026-05-01', cost: 11.99, currency: 'EUR', enabled: false }],
          status: 'active',
          categoryId: 'c-1',
          paymentMethod: 'Amex …1234',
          brandColor: '#1DB954',
          trial: { endsAt: '2026-02-01', convertsToCost: 11.99 },
          alertConfig: { daysBefore: [5, 1] },
          priceHistory: [{ changedAt: '2026-03-01T00:00:00.000Z', cost: 9.99, currency: 'EUR' }],
          firedAlerts: ['2026-06-01:7'],
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-05-01T00:00:00.000Z',
        },
      ],
      oneTimePurchases: [],
      categories: [{ id: 'c-1', name: 'Music', monthlyBudget: 20 }],
      cancellationLog: [],
      preferences: {
        theme: 'light',
        defaultCurrency: 'EUR',
        reminderDays: 30,
        enableLogoFetch: false,
        notify: { enabled: true, globalDaysBefore: [7, 1, 0], minimizeToTray: false },
        aiAssistant: { enabled: true, model: 'google/gemma-4-26b-a4b-it', hasKey: true },
        layoutTheme: 'sharp',
        brandColor: '#6366F1',
      },
    } as unknown as AppData;

    const out = migrate(current);
    const sub = out.subscriptions[0];
    expect(sub.paymentMethod).toBe('Amex …1234');
    expect(sub.trial).toEqual({ endsAt: '2026-02-01', convertsToCost: 11.99 });
    expect(sub.alertConfig).toEqual({ daysBefore: [5, 1] });
    expect(sub.priceHistory).toEqual([
      { changedAt: '2026-03-01T00:00:00.000Z', cost: 9.99, currency: 'EUR' },
    ]);
    expect(sub.firedAlerts).toEqual(['2026-06-01:7']);
    // an explicit enabled:false on a renewal must survive (not be coerced to true)
    expect(sub.renewals[0].enabled).toBe(false);
    expect(out.categories[0].monthlyBudget).toBe(20);
    expect(out.preferences.layoutTheme).toBe('sharp');
    expect(out.preferences.brandColor).toBe('#6366F1');
    expect(out.preferences.aiAssistant.model).toBe('google/gemma-4-26b-a4b-it');
  });

  it('reads the retired glass / notion layouts back as default', () => {
    for (const layoutTheme of ['glass', 'notion'] as const) {
      const out = migrate({
        preferences: { layoutTheme },
      } as unknown as AppData);
      expect(out.preferences.layoutTheme).toBe('default');
    }
  });
});

describe('migrate — damaged / partial file', () => {
  it('defaults missing top-level collections instead of throwing', () => {
    const out = migrate({ preferences: { defaultCurrency: 'USD' } } as unknown as AppData);
    expect(out.subscriptions).toEqual([]);
    expect(out.oneTimePurchases).toEqual([]);
    expect(out.categories).toEqual([]);
    expect(out.cancellationLog).toEqual([]);
    expect(out.version).toBe(1);
    expect(out.preferences.defaultCurrency).toBe('USD');
  });

  it('defaults a missing preferences object', () => {
    const out = migrate({ subscriptions: [] } as unknown as AppData);
    expect(out.preferences.notify.minimizeToTray).toBe(true);
  });

  it('keeps unknown renewal fields instead of whitelisting them away', () => {
    const out = migrate({
      subscriptions: [
        {
          id: 's',
          renewalDate: '2026-01-01',
          renewals: [{ id: 'r', date: '2025-12-01', cost: 1, currency: 'USD', note: 'x' }],
        },
      ],
    } as unknown as AppData);
    expect((out.subscriptions[0].renewals[0] as unknown as { note: string }).note).toBe('x');
  });
});
