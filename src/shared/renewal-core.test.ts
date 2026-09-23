import { describe, expect, it } from 'vitest';
import { addCycles, renewalAnchor, rollForwardRenewal } from './renewal-core';

describe('addCycles', () => {
  it('steps month-end anchors without drift for 12 months', () => {
    const dates = Array.from({ length: 13 }, (_, n) => addCycles('2024-01-31', 'monthly', n));
    expect(dates).toEqual([
      '2024-01-31',
      '2024-02-29',
      '2024-03-31',
      '2024-04-30',
      '2024-05-31',
      '2024-06-30',
      '2024-07-31',
      '2024-08-31',
      '2024-09-30',
      '2024-10-31',
      '2024-11-30',
      '2024-12-31',
      '2025-01-31',
    ]);
  });

  it('handles quarterly, yearly and custom cycles', () => {
    expect(addCycles('2026-11-30', 'quarterly', 1)).toBe('2027-02-28');
    expect(addCycles('2026-11-30', 'quarterly', 2)).toBe('2027-05-30');
    expect(addCycles('2024-02-29', 'yearly', 1)).toBe('2025-02-28');
    expect(addCycles('2024-02-29', 'yearly', 4)).toBe('2028-02-29');
    expect(addCycles('2026-05-01', 'custom', 5)).toBe('2026-05-01');
  });
});

describe('renewalAnchor', () => {
  it('uses subscribedSince when renewalDate lies on its schedule', () => {
    expect(
      renewalAnchor({
        billingCycle: 'monthly',
        subscribedSince: '2026-01-31',
        renewalDate: '2026-02-28',
      }),
    ).toBe('2026-01-31');
  });

  it('falls back to renewalDate when it is off the subscribedSince schedule', () => {
    expect(
      renewalAnchor({
        billingCycle: 'monthly',
        subscribedSince: '2026-01-15',
        renewalDate: '2026-06-03',
      }),
    ).toBe('2026-06-03');
    expect(renewalAnchor({ billingCycle: 'monthly', renewalDate: '2026-06-03' })).toBe(
      '2026-06-03',
    );
  });
});

describe('rollForwardRenewal', () => {
  it('leaves a renewal that is today or later unchanged', () => {
    const s = { billingCycle: 'monthly' as const, renewalDate: '2026-06-10' };
    expect(rollForwardRenewal(s, '2026-06-10')).toBe('2026-06-10');
    expect(rollForwardRenewal(s, '2026-06-01')).toBe('2026-06-10');
  });

  it('rolls monthly/quarterly/yearly forward to the first date >= today', () => {
    expect(
      rollForwardRenewal({ billingCycle: 'monthly', renewalDate: '2026-05-10' }, '2026-06-11'),
    ).toBe('2026-07-10');
    expect(
      rollForwardRenewal({ billingCycle: 'quarterly', renewalDate: '2026-01-15' }, '2026-04-15'),
    ).toBe('2026-04-15');
    expect(
      rollForwardRenewal({ billingCycle: 'yearly', renewalDate: '2024-02-29' }, '2026-03-01'),
    ).toBe('2027-02-28');
  });

  it('rolls forward an overdue-by-many-cycles renewal from its month-end anchor', () => {
    expect(
      rollForwardRenewal(
        { billingCycle: 'monthly', subscribedSince: '2020-01-31', renewalDate: '2020-02-29' },
        '2026-04-01',
      ),
    ).toBe('2026-04-30');
    expect(
      rollForwardRenewal({ billingCycle: 'monthly', renewalDate: '2021-03-31' }, '2026-06-01'),
    ).toBe('2026-06-30');
  });

  it('never rolls a custom cycle', () => {
    expect(
      rollForwardRenewal({ billingCycle: 'custom', renewalDate: '2020-01-01' }, '2026-06-01'),
    ).toBe('2020-01-01');
  });
});
