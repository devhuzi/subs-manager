import { describe, expect, it } from 'vitest';
import type { Subscription } from '../../../shared/types';
import { recordPriceChange } from './pricing';

const sub = (over: Partial<Subscription>): Subscription => ({
  id: 's1',
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

const NOW = '2026-05-20T00:00:00.000Z';

describe('recordPriceChange', () => {
  it('records the old cost when cost changes', () => {
    const out = recordPriceChange(sub({ cost: 10 }), 12, undefined, NOW);
    expect(out).toEqual([{ changedAt: NOW, cost: 10, currency: 'USD' }]);
  });

  it('records the old currency when currency changes', () => {
    const out = recordPriceChange(sub({ cost: 10, currency: 'USD' }), undefined, 'EUR', NOW);
    expect(out).toEqual([{ changedAt: NOW, cost: 10, currency: 'USD' }]);
  });

  it('appends to existing history, newest last', () => {
    const prior = { changedAt: '2026-01-01T00:00:00.000Z', cost: 8, currency: 'USD' };
    const out = recordPriceChange(sub({ cost: 10, priceHistory: [prior] }), 15, undefined, NOW);
    expect(out).toEqual([prior, { changedAt: NOW, cost: 10, currency: 'USD' }]);
  });

  it('returns the existing history untouched when nothing changed', () => {
    const prior = [{ changedAt: NOW, cost: 8, currency: 'USD' }];
    const s = sub({ cost: 10, currency: 'USD', priceHistory: prior });
    // same cost + same currency → no new entry
    expect(recordPriceChange(s, 10, 'USD', NOW)).toBe(prior);
  });

  it('does not record when the patch omits cost and currency', () => {
    const s = sub({ cost: 10 });
    expect(recordPriceChange(s, undefined, undefined, NOW)).toBeUndefined();
  });
});
