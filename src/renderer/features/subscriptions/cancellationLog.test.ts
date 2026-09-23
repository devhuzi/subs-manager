import { describe, expect, it } from 'vitest';
import type { CancellationLogEntry, Subscription } from '../../../shared/types';
import { applyStatusChangeToLog } from './cancellationLog';

const sub = (over: Partial<Subscription>): Subscription => ({
  id: 's1',
  name: 'Netflix',
  cost: 120,
  currency: 'USD',
  billingCycle: 'yearly',
  renewalDate: '2026-06-01',
  subscribedSince: '2025-06-01',
  renewals: [],
  status: 'active',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  ...over,
});

const NOW = '2026-05-01T00:00:00.000Z';

describe('applyStatusChangeToLog', () => {
  it('logs the monthly equivalent when going inactive and the user agrees', () => {
    const r = applyStatusChangeToLog([], sub({ status: 'inactive' }), 'active', true, NOW);
    expect(r.change).toBe('logged');
    expect(r.log).toHaveLength(1);
    expect(r.log[0]).toMatchObject({
      subscriptionId: 's1',
      subscriptionName: 'Netflix',
      monthlyEquivalent: 10,
      currency: 'USD',
      cancelledAt: NOW,
    });
  });

  it('does not log when the user declines', () => {
    const r = applyStatusChangeToLog([], sub({ status: 'inactive' }), 'active', false, NOW);
    expect(r).toEqual({ log: [], change: null });
  });

  it('revokes only this sub’s entries on reactivation', () => {
    const log: CancellationLogEntry[] = [
      { id: 'a', subscriptionId: 's1', subscriptionName: 'Netflix', cancelledAt: NOW, monthlyEquivalent: 10, currency: 'USD' },
      { id: 'b', subscriptionId: 's2', subscriptionName: 'Other', cancelledAt: NOW, monthlyEquivalent: 5, currency: 'USD' },
      { id: 'c', subscriptionName: 'Legacy', cancelledAt: NOW, monthlyEquivalent: 5, currency: 'USD' },
    ];
    const r = applyStatusChangeToLog(log, sub({ status: 'active' }), 'inactive', false, NOW);
    expect(r.change).toBe('revoked');
    expect(r.log.map((e) => e.id)).toEqual(['b', 'c']);
  });

  it('leaves the log alone when status is unchanged', () => {
    const log: CancellationLogEntry[] = [];
    const r = applyStatusChangeToLog(log, sub({}), 'active', true, NOW);
    expect(r.log).toBe(log);
    expect(r.change).toBeNull();
  });
});
