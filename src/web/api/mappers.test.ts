import { describe, expect, it } from 'vitest';
import type {
  CancellationLogEntry,
  Category,
  OneTimePurchase,
  Preferences,
  Subscription,
} from '@shared/types';
import { defaultPreferences } from '@shared/types';
import {
  cancellationToRow,
  categoryToRow,
  diffById,
  flattenRenewals,
  prefsToRow,
  purchaseToRow,
  renewalToRow,
  rowsToAppData,
  subScalar,
  subToRow,
  type LoadedRows,
} from './mappers';

const UID = 'user-1';

const sub = (over: Partial<Subscription> = {}): Subscription => ({
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

const emptyRows = (): LoadedRows => ({
  categories: [],
  subscriptions: [],
  renewals: [],
  purchases: [],
  cancellations: [],
  preferences: null,
});

describe('rowsToAppData', () => {
  it('returns an empty AppData with default preferences when there are no rows', () => {
    const data = rowsToAppData(emptyRows());
    expect(data.subscriptions).toEqual([]);
    expect(data.oneTimePurchases).toEqual([]);
    expect(data.categories).toEqual([]);
    expect(data.cancellationLog).toEqual([]);
    expect(data.preferences).toEqual(defaultPreferences());
    expect(data.version).toBe(1);
  });

  it('coerces numeric columns from strings (PostgREST returns numeric as text)', () => {
    const data = rowsToAppData({
      ...emptyRows(),
      subscriptions: [{ ...subToRow(UID, sub()), cost: '15.99' }],
      renewals: [{ ...renewalToRow(UID, 's1', { id: 'r1', date: '2026-05-10', cost: 15.99, currency: 'USD' }), cost: '15.99' }],
    });
    expect(data.subscriptions[0].cost).toBe(15.99);
    expect(typeof data.subscriptions[0].cost).toBe('number');
    expect(data.subscriptions[0].renewals[0].cost).toBe(15.99);
  });

  it('groups renewals under their subscription, sorted by date ascending', () => {
    const data = rowsToAppData({
      ...emptyRows(),
      subscriptions: [subToRow(UID, sub())],
      renewals: [
        renewalToRow(UID, 's1', { id: 'r2', date: '2026-05-10', cost: 15.99, currency: 'USD' }),
        renewalToRow(UID, 's1', { id: 'r1', date: '2026-04-10', cost: 15.99, currency: 'USD' }),
      ],
    });
    expect(data.subscriptions[0].renewals.map((r) => r.date)).toEqual([
      '2026-04-10',
      '2026-05-10',
    ]);
  });

  it('round-trips a subscription with all optional fields (except server-managed firedAlerts)', () => {
    const full = sub({
      categoryId: 'c1',
      website: 'netflix.com',
      notes: 'family plan',
      cancellationUrl: 'https://netflix.com/cancel',
      paymentMethod: 'Amex …1234',
      brandColor: '#E50914',
      trial: { endsAt: '2026-02-01', convertsToCost: 15.99 },
      alertConfig: { daysBefore: [7, 1] },
      priceHistory: [{ changedAt: '2026-03-01T00:00:00.000Z', cost: 9.99, currency: 'USD' }],
      firedAlerts: ['2026-06-10:7'],
    });
    const data = rowsToAppData({ ...emptyRows(), subscriptions: [subToRow(UID, full)] });
    const out = data.subscriptions[0];
    expect(out.categoryId).toBe('c1');
    expect(out.paymentMethod).toBe('Amex …1234');
    expect(out.trial).toEqual({ endsAt: '2026-02-01', convertsToCost: 15.99 });
    expect(out.alertConfig).toEqual({ daysBefore: [7, 1] });
    expect(out.priceHistory).toEqual([
      { changedAt: '2026-03-01T00:00:00.000Z', cost: 9.99, currency: 'USD' },
    ]);
    // firedAlerts is server-managed and deliberately not round-tripped to the client.
    expect(out.firedAlerts).toBeUndefined();
  });

  it('omits absent optional fields rather than inventing them', () => {
    const data = rowsToAppData({ ...emptyRows(), subscriptions: [subToRow(UID, sub())] });
    const out = data.subscriptions[0];
    expect('categoryId' in out).toBe(false);
    expect('paymentMethod' in out).toBe(false);
    expect('trial' in out).toBe(false);
  });

  it('round-trips a one-time purchase', () => {
    const purchase: OneTimePurchase = {
      id: 'p1',
      name: 'Affinity Photo',
      cost: 70,
      currency: 'USD',
      purchaseDate: '2026-01-01',
      categoryId: 'c2',
      expectedLifespanMonths: 24,
      paymentMethod: 'Visa …9012',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    };
    const data = rowsToAppData({ ...emptyRows(), purchases: [purchaseToRow(UID, purchase)] });
    expect(data.oneTimePurchases[0]).toMatchObject({
      id: 'p1',
      cost: 70,
      expectedLifespanMonths: 24,
      paymentMethod: 'Visa …9012',
      categoryId: 'c2',
    });
  });

  it('round-trips categories (incl. monthlyBudget) and cancellation log', () => {
    const cat: Category = { id: 'c1', name: 'SaaS', color: '#6366F1', monthlyBudget: 50 };
    const cancel: CancellationLogEntry = {
      id: 'x1',
      subscriptionId: 's9',
      subscriptionName: 'Old App',
      cancelledAt: '2026-04-01T00:00:00.000Z',
      monthlyEquivalent: 12.5,
      currency: 'USD',
    };
    const data = rowsToAppData({
      ...emptyRows(),
      categories: [categoryToRow(UID, cat)],
      cancellations: [cancellationToRow(UID, cancel)],
    });
    expect(data.categories[0]).toEqual(cat);
    expect(data.cancellationLog[0]).toEqual(cancel);
  });

  it('round-trips preferences, spreading over defaults', () => {
    const prefs: Preferences = {
      ...defaultPreferences(),
      defaultCurrency: 'EUR',
      layoutTheme: 'glass',
      brandColor: '#1DB954',
      timezone: 'Australia/Sydney',
      notify: { enabled: true, globalDaysBefore: [3], minimizeToTray: false },
      aiAssistant: { enabled: true, model: 'google/gemma-4-26b-a4b-it', hasKey: true },
    };
    const data = rowsToAppData({ ...emptyRows(), preferences: prefsToRow(UID, prefs) });
    expect(data.preferences.defaultCurrency).toBe('EUR');
    expect(data.preferences.layoutTheme).toBe('glass');
    expect(data.preferences.brandColor).toBe('#1DB954');
    expect(data.preferences.timezone).toBe('Australia/Sydney');
    expect(data.preferences.notify.globalDaysBefore).toEqual([3]);
    expect(data.preferences.aiAssistant.model).toBe('google/gemma-4-26b-a4b-it');
  });
});

describe('diffById', () => {
  it('upserts new items', () => {
    const r = diffById([], [{ id: 'a', v: 1 }]);
    expect(r.upserts).toEqual([{ id: 'a', v: 1 }]);
    expect(r.deleteIds).toEqual([]);
  });

  it('upserts only changed items, leaving unchanged ones out', () => {
    const prev = [
      { id: 'a', v: 1 },
      { id: 'b', v: 2 },
    ];
    const next = [
      { id: 'a', v: 1 }, // unchanged
      { id: 'b', v: 99 }, // changed
    ];
    const r = diffById(prev, next);
    expect(r.upserts).toEqual([{ id: 'b', v: 99 }]);
    expect(r.deleteIds).toEqual([]);
  });

  it('deletes ONLY the removed id — never the survivors (data-loss guard)', () => {
    const prev = [
      { id: 'a', v: 1 },
      { id: 'b', v: 2 },
      { id: 'c', v: 3 },
    ];
    const next = [
      { id: 'a', v: 1 },
      { id: 'c', v: 3 },
    ];
    const r = diffById(prev, next);
    expect(r.deleteIds).toEqual(['b']);
    expect(r.upserts).toEqual([]); // a and c unchanged → no needless writes
  });

  it('clearing the list deletes every prior id and upserts nothing', () => {
    const prev = [
      { id: 'a', v: 1 },
      { id: 'b', v: 2 },
    ];
    const r = diffById(prev, []);
    expect(r.deleteIds.sort()).toEqual(['a', 'b']);
    expect(r.upserts).toEqual([]);
  });

  it('detects a deep (nested) change via JSON equality', () => {
    const prev = [{ id: 'a', nested: { x: [1, 2] } }];
    const next = [{ id: 'a', nested: { x: [1, 3] } }];
    expect(diffById(prev, next).upserts).toHaveLength(1);
  });
});

describe('flattenRenewals', () => {
  it('flattens renewals across subscriptions, tagging each with its subId', () => {
    const flat = flattenRenewals([
      sub({
        id: 's1',
        renewals: [
          { id: 'r1', date: '2026-04-10', cost: 10, currency: 'USD', enabled: true },
          { id: 'r2', date: '2026-05-10', cost: 10, currency: 'USD' },
        ],
      }),
      sub({ id: 's2', renewals: [{ id: 'r3', date: '2026-06-01', cost: 5, currency: 'USD' }] }),
    ]);
    expect(flat.map((r) => [r.id, r.subId])).toEqual([
      ['r1', 's1'],
      ['r2', 's1'],
      ['r3', 's2'],
    ]);
    // enabled defaults to true when the renewal omits it.
    expect(flat.find((r) => r.id === 'r2')?.enabled).toBe(true);
  });

  it('subScalar drops renewals and firedAlerts so renewal edits do not re-upsert the parent', () => {
    const scalar = subScalar(
      sub({ renewals: [{ id: 'r1', date: '2026-04-10', cost: 10, currency: 'USD' }], firedAlerts: ['x'] }),
    );
    expect('renewals' in scalar).toBe(false);
    expect('firedAlerts' in scalar).toBe(false);
    expect(scalar.name).toBe('Netflix');
  });
});
