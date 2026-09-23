import { describe, expect, it } from 'vitest';
import type { AppData, FxRates, OneTimePurchase, Subscription } from '../../../shared/types';
import {
  categoryMonthlySplit,
  currentMonthProjection,
  forecastAnnual,
  historicalSpendByMonth,
  isPaidOff,
  monthlyEquivalent,
  monthlyRunrateAt,
  oneTimeAmortizedMonthly,
  periodCompare,
  runrateComparison,
  topMonthlyExpenses,
} from './spendMetrics';

const sub = (over: Partial<Subscription>): Subscription => ({
  id: crypto.randomUUID(),
  name: 'Test',
  cost: 10,
  currency: 'USD',
  billingCycle: 'monthly',
  renewalDate: '2026-06-01',
  subscribedSince: '2026-01-01',
  renewals: [],
  status: 'active',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  ...over,
});

const purchase = (over: Partial<OneTimePurchase>): OneTimePurchase => ({
  id: crypto.randomUUID(),
  name: 'License',
  cost: 360,
  currency: 'USD',
  purchaseDate: '2026-01-01',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  ...over,
});

describe('monthlyEquivalent', () => {
  it('returns cost for monthly', () => {
    expect(monthlyEquivalent(sub({ cost: 20, billingCycle: 'monthly' }))).toBe(20);
  });
  it('divides by 3 for quarterly', () => {
    expect(monthlyEquivalent(sub({ cost: 30, billingCycle: 'quarterly' }))).toBe(10);
  });
  it('divides by 12 for yearly', () => {
    expect(monthlyEquivalent(sub({ cost: 120, billingCycle: 'yearly' }))).toBe(10);
  });
  it('returns 0 for custom (excluded from projections)', () => {
    expect(monthlyEquivalent(sub({ cost: 300, billingCycle: 'custom' }))).toBe(0);
  });
});

describe('oneTimeAmortizedMonthly', () => {
  it('uses expectedLifespanMonths', () => {
    expect(oneTimeAmortizedMonthly(purchase({ cost: 240, expectedLifespanMonths: 24 }))).toBe(10);
  });
  it('defaults to 36 months when unset', () => {
    expect(oneTimeAmortizedMonthly(purchase({ cost: 360 }))).toBe(10);
  });
});

describe('isPaidOff', () => {
  const p = purchase({ purchaseDate: '2023-01-01', expectedLifespanMonths: 12 });
  it('is paid off once the lifespan has elapsed', () => {
    expect(isPaidOff(p, new Date('2026-01-01'))).toBe(true);
  });
  it('is not paid off before the lifespan elapses', () => {
    expect(isPaidOff(purchase({ purchaseDate: '2026-01-01', expectedLifespanMonths: 12 }), new Date('2026-06-01'))).toBe(false);
  });
});

describe('currentMonthProjection', () => {
  const data = {
    subscriptions: [
      sub({ cost: 20, currency: 'USD', billingCycle: 'monthly', status: 'active' }),
      sub({ cost: 120, currency: 'USD', billingCycle: 'yearly', status: 'active' }), // +10/mo
      sub({ cost: 300, currency: 'USD', billingCycle: 'custom', status: 'active' }), // excluded
      sub({ cost: 99, currency: 'USD', billingCycle: 'monthly', status: 'inactive' }), // excluded
    ],
    oneTimePurchases: [],
    categories: [],
    cancellationLog: [],
  } as unknown as AppData;

  it('sums active monthly-equivalents only, ignoring custom & inactive', () => {
    const { total } = currentMonthProjection(data, 'USD', null);
    expect(total).toBe(30);
  });
});

describe('periodCompare', () => {
  it('computes the delta between the last two months', () => {
    const points = [
      { month: '2026-04', monthLabel: 'Apr', subscriptions: 0, purchases: 0, total: 100 },
      { month: '2026-05', monthLabel: 'May', subscriptions: 0, purchases: 0, total: 120 },
    ];
    const r = periodCompare(points);
    expect(r.thisMonth).toBe(120);
    expect(r.lastMonth).toBe(100);
    expect(r.deltaPct).toBeCloseTo(20);
  });
});

const rates: FxRates = {
  base: 'USD',
  fetchedAt: '2026-05-01T00:00:00.000Z',
  rates: { USD: 1, EUR: 0.9, AUD: 1.5 },
};

const renewal = (date: string, cost: number, currency = 'USD') => ({
  id: crypto.randomUUID(),
  date,
  cost,
  currency,
  enabled: true,
});

describe('historicalSpendByMonth', () => {
  it('buckets renewals and purchases into the right calendar month', () => {
    const data = {
      subscriptions: [
        sub({
          currency: 'USD',
          renewals: [renewal('2026-04-10', 20), renewal('2026-05-10', 20)],
        }),
      ],
      oneTimePurchases: [purchase({ cost: 50, currency: 'USD', purchaseDate: '2026-05-15' })],
      categories: [],
      cancellationLog: [],
    } as unknown as AppData;
    const pts = historicalSpendByMonth(data, 'USD', rates, 2, new Date('2026-05-20'));
    expect(pts).toHaveLength(2);
    expect(pts[0].total).toBe(20); // April: one renewal
    expect(pts[1].total).toBe(70); // May: renewal 20 + purchase 50
  });

  it('converts mixed currencies into the target', () => {
    const data = {
      subscriptions: [
        sub({ currency: 'EUR', renewals: [renewal('2026-05-01', 90, 'EUR')] }),
      ],
      oneTimePurchases: [],
      categories: [],
      cancellationLog: [],
    } as unknown as AppData;
    const pts = historicalSpendByMonth(data, 'USD', rates, 1, new Date('2026-05-20'));
    expect(pts[0].total).toBeCloseTo(100); // 90 EUR / 0.9 = 100 USD
  });

  it('drops unconvertible spend (no rates) to zero', () => {
    const data = {
      subscriptions: [
        sub({ currency: 'EUR', renewals: [renewal('2026-05-01', 90, 'EUR')] }),
      ],
      oneTimePurchases: [],
      categories: [],
      cancellationLog: [],
    } as unknown as AppData;
    const pts = historicalSpendByMonth(data, 'USD', null, 1, new Date('2026-05-20'));
    expect(pts[0].total).toBe(0);
  });
});

describe('forecastAnnual', () => {
  const data = {
    subscriptions: [sub({ cost: 10, billingCycle: 'monthly', status: 'active', currency: 'USD' })],
    oneTimePurchases: [purchase({ cost: 120, currency: 'USD', purchaseDate: '2026-01-15' })],
    categories: [],
    cancellationLog: [],
  } as unknown as AppData;

  it('projects YTD actual plus runrate through year end (May)', () => {
    const f = forecastAnnual(data, 'USD', rates, new Date(2026, 4, 20));
    expect(f.monthlyRunrate).toBe(10);
    expect(f.ytdActual).toBe(120); // the Jan purchase
    // renewalDate 2026-06-01 is not due in May → nothing more this month.
    expect(f.dueThisMonth).toBe(0);
    // 7 months remaining (Jun–Dec) × 10 = 70, plus 120 YTD = 190
    expect(f.projectedYearEnd).toBe(190);
  });

  it('includes renewals still due later in the current month', () => {
    const d = {
      ...data,
      subscriptions: [
        sub({ cost: 10, billingCycle: 'monthly', renewalDate: '2026-05-25' }),
        sub({ cost: 120, billingCycle: 'yearly', renewalDate: '2026-05-28' }),
        sub({ cost: 99, billingCycle: 'monthly', renewalDate: '2026-05-26', status: 'inactive' }),
        sub({ cost: 50, billingCycle: 'custom', renewalDate: '2026-05-27' }),
      ],
    } as AppData;
    const f = forecastAnnual(d, 'USD', rates, new Date(2026, 4, 20));
    expect(f.dueThisMonth).toBe(130);
    // 120 YTD + 130 due in May + 7 × (10 + 10) runrate
    expect(f.projectedYearEnd).toBe(120 + 130 + 140);
  });

  it('adds only this month’s remaining renewals in December', () => {
    const d = {
      ...data,
      subscriptions: [sub({ cost: 10, billingCycle: 'monthly', renewalDate: '2026-12-20' })],
    } as AppData;
    const f = forecastAnnual(d, 'USD', rates, new Date(2026, 11, 15));
    expect(f.projectedYearEnd).toBe(f.ytdActual + 10);
  });
});

describe('categoryMonthlySplit', () => {
  it('aggregates active subs + amortized purchases by category and sorts desc', () => {
    const data = {
      subscriptions: [
        sub({ cost: 30, billingCycle: 'monthly', status: 'active', currency: 'USD', categoryId: 'c1' }),
        sub({ cost: 99, billingCycle: 'monthly', status: 'inactive', currency: 'USD', categoryId: 'c1' }), // excluded
      ],
      oneTimePurchases: [
        purchase({ cost: 360, expectedLifespanMonths: 36, currency: 'USD', categoryId: 'c2' }), // 10/mo
      ],
      categories: [
        { id: 'c1', name: 'SaaS' },
        { id: 'c2', name: 'Hardware' },
      ],
      cancellationLog: [],
    } as unknown as AppData;
    const rows = categoryMonthlySplit(data, 'USD', rates, new Date(2026, 5, 1));
    expect(rows.map((r) => [r.categoryName, r.amount])).toEqual([
      ['SaaS', 30],
      ['Hardware', 10],
    ]);
  });
});

describe('categoryMonthlySplit paid-off purchases', () => {
  it('stops amortizing a purchase after its lifespan', () => {
    const data = {
      subscriptions: [],
      oneTimePurchases: [
        purchase({ cost: 120, expectedLifespanMonths: 12, purchaseDate: '2024-01-01', categoryId: 'c1' }),
        purchase({ cost: 120, expectedLifespanMonths: 12, purchaseDate: '2026-01-01', categoryId: 'c1' }),
      ],
      categories: [{ id: 'c1', name: 'Hardware' }],
      cancellationLog: [],
    } as unknown as AppData;
    const rows = categoryMonthlySplit(data, 'USD', rates, new Date(2026, 5, 1));
    expect(rows).toEqual([{ categoryId: 'c1', categoryName: 'Hardware', color: undefined, amount: 10 }]);
  });
});

describe('monthlyRunrateAt / runrateComparison', () => {
  const base = { oneTimePurchases: [], categories: [], cancellationLog: [] };

  it('only counts subs that had started by the date', () => {
    const data = {
      ...base,
      subscriptions: [
        sub({ cost: 10, subscribedSince: '2026-01-01' }),
        sub({ cost: 20, subscribedSince: '2026-05-10' }),
      ],
    } as unknown as AppData;
    expect(monthlyRunrateAt(data, 'USD', rates, '2026-04-30')).toBe(10);
    expect(monthlyRunrateAt(data, 'USD', rates, '2026-05-31')).toBe(30);
  });

  it('uses the price in effect on the date', () => {
    const data = {
      ...base,
      subscriptions: [
        sub({
          cost: 15,
          priceHistory: [{ changedAt: '2026-05-05T10:00:00.000Z', cost: 10, currency: 'USD' }],
        }),
      ],
    } as unknown as AppData;
    expect(monthlyRunrateAt(data, 'USD', rates, '2026-04-30')).toBe(10);
    expect(monthlyRunrateAt(data, 'USD', rates, '2026-05-31')).toBe(15);
  });

  it('counts a sub cancelled after the date as active then', () => {
    const cancelled = sub({ id: 'gone', cost: 40, status: 'inactive' });
    const data = {
      ...base,
      subscriptions: [sub({ cost: 10 }), cancelled],
      cancellationLog: [
        {
          id: 'l',
          subscriptionId: 'gone',
          subscriptionName: 'x',
          cancelledAt: '2026-05-10T00:00:00.000Z',
          monthlyEquivalent: 40,
          currency: 'USD',
        },
      ],
    } as unknown as AppData;
    const c = runrateComparison(data, 'USD', rates, new Date(2026, 4, 20));
    expect(c.lastMonth).toBe(50);
    expect(c.thisMonth).toBe(10);
    expect(c.deltaPct).toBeCloseTo(-80);
  });

  it('has no percentage when there was no runrate last month', () => {
    const data = {
      ...base,
      subscriptions: [sub({ cost: 10, subscribedSince: '2026-05-02' })],
    } as unknown as AppData;
    const c = runrateComparison(data, 'USD', rates, new Date(2026, 4, 20));
    expect(c.lastMonth).toBe(0);
    expect(c.deltaPct).toBeUndefined();
  });
});

describe('topMonthlyExpenses', () => {
  it('returns the largest active subs by monthly equivalent, capped at the limit', () => {
    const subs = [
      sub({ name: 'A', cost: 5, billingCycle: 'monthly', status: 'active', currency: 'USD' }),
      sub({ name: 'B', cost: 120, billingCycle: 'yearly', status: 'active', currency: 'USD' }), // 10/mo
      sub({ name: 'C', cost: 50, billingCycle: 'monthly', status: 'inactive', currency: 'USD' }), // excluded
    ];
    const rows = topMonthlyExpenses(subs, 'USD', rates, 5);
    expect(rows.map((r) => r.name)).toEqual(['B', 'A']);
    expect(rows[0].monthlyEquivalent).toBe(10);
  });
});
