import { describe, expect, it } from 'vitest';
import {
  appDataFileSchema,
  hasUnsafeScheme,
  oneTimePurchaseInputSchema,
  subscriptionInputSchema,
} from './schemas';

const baseSub = {
  name: 'Netflix',
  cost: 10,
  currency: 'USD',
  billingCycle: 'monthly',
  renewalDate: '2026-06-01',
  subscribedSince: '2026-01-01',
  status: 'active',
};

describe('cost validation', () => {
  it('accepts numbers and numeric strings', () => {
    expect(subscriptionInputSchema.parse({ ...baseSub, cost: 9.99 }).cost).toBe(9.99);
    expect(subscriptionInputSchema.parse({ ...baseSub, cost: '12.5' }).cost).toBe(12.5);
    expect(subscriptionInputSchema.parse({ ...baseSub, cost: 0 }).cost).toBe(0);
  });

  it('rejects an empty string instead of coercing it to 0', () => {
    const r = subscriptionInputSchema.safeParse({ ...baseSub, cost: '' });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues[0].message).toBe('Cost is required');
  });

  it('rejects negatives, non-finite, non-numeric and absurd values', () => {
    for (const cost of [-1, '-5', Infinity, 'Infinity', NaN, 'abc', 1e9 + 1]) {
      expect(subscriptionInputSchema.safeParse({ ...baseSub, cost }).success).toBe(false);
    }
  });

  it('applies to purchases too', () => {
    const p = {
      name: 'Laptop',
      cost: '',
      currency: 'USD',
      purchaseDate: '2026-01-01',
    };
    expect(oneTimePurchaseInputSchema.safeParse(p).success).toBe(false);
  });

  it('treats an empty trial convertsToCost as unset', () => {
    const r = subscriptionInputSchema.parse({
      ...baseSub,
      trial: { endsAt: '2026-02-01', convertsToCost: '' },
    });
    expect(r.trial?.convertsToCost).toBeUndefined();
  });
});

describe('link validation', () => {
  it('flags non-http(s) schemes', () => {
    expect(hasUnsafeScheme('javascript:alert(1)')).toBe(true);
    expect(hasUnsafeScheme('JavaScript:alert(1)')).toBe(true);
    expect(hasUnsafeScheme('java\tscript:alert(1).com')).toBe(true);
    expect(hasUnsafeScheme('data:text/html,<b>x</b>.com')).toBe(true);
    expect(hasUnsafeScheme('file:///etc/passwd.txt')).toBe(true);
  });

  it('allows http(s), bare domains and host:port', () => {
    expect(hasUnsafeScheme('https://netflix.com')).toBe(false);
    expect(hasUnsafeScheme('http://netflix.com')).toBe(false);
    expect(hasUnsafeScheme('netflix.com')).toBe(false);
    expect(hasUnsafeScheme('netflix.com:8080/account')).toBe(false);
  });

  it('rejects unsafe website / cancellationUrl, accepts bare domains', () => {
    expect(
      subscriptionInputSchema.safeParse({ ...baseSub, website: 'javascript:alert(1)//x.com' })
        .success,
    ).toBe(false);
    expect(
      subscriptionInputSchema.safeParse({ ...baseSub, cancellationUrl: 'data:text/html,x.y' })
        .success,
    ).toBe(false);
    expect(subscriptionInputSchema.safeParse({ ...baseSub, website: 'netflix.com' }).success).toBe(
      true,
    );
    expect(
      subscriptionInputSchema.safeParse({
        ...baseSub,
        cancellationUrl: 'https://netflix.com/cancel',
      }).success,
    ).toBe(true);
  });
});

describe('appDataFileSchema', () => {
  const file = {
    version: 1,
    subscriptions: [
      {
        ...baseSub,
        id: 's1',
        renewals: [{ id: 'r1', date: '2026-05-01', cost: 10, currency: 'USD', enabled: true }],
        notes: null,
      },
    ],
    oneTimePurchases: [],
    categories: [{ id: 'c1', name: 'Video' }],
    preferences: { notify: { enabled: false } },
  };

  it('accepts a valid backup, tolerating null optionals', () => {
    const r = appDataFileSchema.safeParse(file);
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.subscriptions[0].notes).toBeUndefined();
  });

  it('rejects wrong types', () => {
    const bad = {
      ...file,
      subscriptions: [{ ...file.subscriptions[0], cost: '10' }],
    };
    expect(appDataFileSchema.safeParse(bad).success).toBe(false);
  });

  it('rejects a renewal with a bad date', () => {
    const bad = {
      ...file,
      subscriptions: [
        { ...file.subscriptions[0], renewals: [{ id: 'r', date: '05/01/2026', cost: 1, currency: 'USD' }] },
      ],
    };
    expect(appDataFileSchema.safeParse(bad).success).toBe(false);
  });

  it('rejects unsafe stored links', () => {
    const bad = {
      ...file,
      subscriptions: [{ ...file.subscriptions[0], website: 'javascript:alert(1)' }],
    };
    expect(appDataFileSchema.safeParse(bad).success).toBe(false);
  });
});
