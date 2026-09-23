import { describe, expect, it } from 'vitest';
import type { OneTimePurchase, Subscription } from '../../shared/types';
import {
  csvCell,
  mergePreferences,
  normalizeBillingCycle,
  parseBackupJson,
  parseCost,
  parseIsoDate,
  parsePurchaseCsv,
  parseSubscriptionCsv,
  summarizeCsvImport,
} from './importData';

describe('parseCost', () => {
  it.each([
    ['12', 12],
    ['12.50', 12.5],
    ['$12.50', 12.5],
    ['USD 1,234.56', 1234.56],
    ['1,234', 1234],
    ['1.234,56', 1234.56],
    ['12,5', 12.5],
    ['€ 9,99', 9.99],
    ['1.234.567', 1234567],
    ['0', 0],
  ])('%s → %s', (raw, expected) => {
    expect(parseCost(raw)).toBe(expected);
  });

  it.each(['', 'abc', '1,2345', '0,123', '1.2.3', '1,2,3'])('rejects %j', (raw) => {
    expect(parseCost(raw)).toBeNull();
  });

  it('keeps the sign so validation can reject negatives', () => {
    expect(parseCost('-5')).toBe(-5);
  });
});

describe('parseIsoDate', () => {
  it('accepts ISO dates, with or without a time part', () => {
    expect(parseIsoDate('2026-03-15')).toBe('2026-03-15');
    expect(parseIsoDate('2026-03-15T10:00:00Z')).toBe('2026-03-15');
  });
  it('rejects ambiguous and impossible dates', () => {
    expect(parseIsoDate('03/15/2026')).toBeNull();
    expect(parseIsoDate('15/03/2026')).toBeNull();
    expect(parseIsoDate('2026-02-30')).toBeNull();
    expect(parseIsoDate('2026-13-01')).toBeNull();
  });
});

describe('csvCell / normalizeBillingCycle', () => {
  it('strips the formula-guard quote added by export', () => {
    expect(csvCell("'=SUM(A1)")).toBe('=SUM(A1)');
    expect(csvCell("'-5")).toBe('-5');
    expect(csvCell("O'Reilly")).toBe("O'Reilly");
    expect(csvCell("'plain")).toBe("'plain");
  });
  it('normalizes cycle names', () => {
    expect(normalizeBillingCycle('Monthly')).toBe('monthly');
    expect(normalizeBillingCycle('ANNUAL')).toBe('yearly');
    expect(normalizeBillingCycle('annually')).toBe('yearly');
    expect(normalizeBillingCycle('Yearly')).toBe('yearly');
    expect(normalizeBillingCycle('')).toBe('monthly');
    expect(normalizeBillingCycle('weekly')).toBe('weekly');
  });
});

const ctx = { defaultCurrency: 'AUD', today: '2026-05-01' };

const existingSub = {
  id: 'x',
  name: 'Netflix',
  cost: 15.99,
  currency: 'USD',
  billingCycle: 'monthly',
  renewalDate: '2026-06-01',
  subscribedSince: '2026-01-01',
  renewals: [],
  status: 'active',
  createdAt: '',
  updatedAt: '',
} as Subscription;

describe('parseSubscriptionCsv', () => {
  it('imports valid rows and reports per-row skips', () => {
    const rows = [
      { name: 'Spotify', cost: '$11.99', currency: '', billingCycle: 'Monthly', renewalDate: '2026-06-10', category: 'Music' },
      { name: 'Figma', cost: '144', currency: 'usd', billingCycle: 'annual', renewalDate: '2026-09-01', status: 'Inactive' },
      { name: 'Bad date', cost: '5', renewalDate: '06/10/2026' },
      { name: 'Bad cost', cost: 'free' },
      { name: '', cost: '5' },
      { name: 'Negative', cost: '-5' },
      { name: 'netflix', cost: '15.99', renewalDate: '2026-06-01' },
      { name: 'Weekly', cost: '1', billingCycle: 'weekly' },
    ];
    const r = parseSubscriptionCsv(rows, { ...ctx, existing: [existingSub] });
    expect(r.items.map((i) => i.input.name)).toEqual(['Spotify', 'Figma']);
    expect(r.items[0]).toMatchObject({
      categoryName: 'Music',
      input: { cost: 11.99, currency: 'AUD', billingCycle: 'monthly', subscribedSince: '2026-06-10', status: 'active' },
    });
    expect(r.items[1].input).toMatchObject({ currency: 'USD', billingCycle: 'yearly', status: 'inactive' });
    expect(r.skipped.map((s) => s.line)).toEqual([4, 5, 6, 7, 8, 9]);
    expect(r.skipped[0].reason).toMatch(/renewalDate/);
    expect(r.skipped[1].reason).toMatch(/not a number/);
    expect(r.skipped[2].reason).toBe('missing name');
    expect(r.skipped[3].reason).toMatch(/cost/);
    expect(r.skipped[4].reason).toMatch(/duplicate/);
    expect(r.skipped[5].reason).toMatch(/billingCycle/);
  });

  it('defaults an empty renewal date to today and dedupes within the file', () => {
    const rows = [
      { name: 'A', cost: '1' },
      { name: 'A', cost: '1.00' },
    ];
    const r = parseSubscriptionCsv(rows, { ...ctx, existing: [] });
    expect(r.items).toHaveLength(1);
    expect(r.items[0].input.renewalDate).toBe('2026-05-01');
    expect(r.skipped).toHaveLength(1);
  });

  it('round-trips export output (formula-guarded cells)', () => {
    const rows = [{ name: "'=Evil", cost: '10', notes: "'+note", renewalDate: '2026-06-01' }];
    const r = parseSubscriptionCsv(rows, { ...ctx, existing: [] });
    expect(r.items[0].input.name).toBe('=Evil');
    expect(r.items[0].input.notes).toBe('+note');
  });
});

describe('parsePurchaseCsv', () => {
  const existing = [
    { id: 'p', name: 'Laptop', cost: 1500, currency: 'USD', purchaseDate: '2026-01-10' } as OneTimePurchase,
  ];
  it('validates rows and skips duplicates', () => {
    const rows = [
      { name: 'Monitor', cost: '1.299,00', purchaseDate: '2026-02-01' },
      { name: 'Laptop', cost: '1,500', currency: 'USD', purchaseDate: '2026-01-10' },
      { name: 'Desk', cost: '300', purchaseDate: '2026/02/01' },
    ];
    const r = parsePurchaseCsv(rows, { ...ctx, existing });
    expect(r.items).toHaveLength(1);
    expect(r.items[0].input).toMatchObject({ name: 'Monitor', cost: 1299, currency: 'AUD' });
    expect(r.skipped.map((s) => s.line)).toEqual([3, 4]);
  });
});

describe('summarizeCsvImport', () => {
  it('pluralizes and lists the first few reasons', () => {
    expect(summarizeCsvImport('purchase', 1, [])).toEqual({ title: 'Imported 1 purchase' });
    const s = summarizeCsvImport('subscription', 2, [
      { line: 3, reason: 'a' },
      { line: 4, reason: 'b' },
      { line: 5, reason: 'c' },
      { line: 6, reason: 'd' },
    ]);
    expect(s.title).toBe('Imported 2 subscriptions, skipped 4');
    expect(s.description).toBe('Line 3: a; Line 4: b; Line 5: c; …and 1 more');
  });
});

describe('mergePreferences', () => {
  it('deep-merges nested notify / aiAssistant over defaults', () => {
    const p = mergePreferences({ defaultCurrency: 'EUR', notify: { enabled: false }, aiAssistant: { model: 'x/y' } });
    expect(p.defaultCurrency).toBe('EUR');
    expect(p.notify).toEqual({ enabled: false, globalDaysBefore: [7, 1, 0], minimizeToTray: true });
    expect(p.aiAssistant).toEqual({ enabled: false, model: 'x/y', hasKey: false });
    expect(p.theme).toBe('system');
  });
});

describe('parseBackupJson', () => {
  const backup = {
    version: 1,
    subscriptions: [
      {
        id: 's1',
        name: 'Netflix',
        cost: 10,
        currency: 'USD',
        billingCycle: 'monthly',
        renewalDate: '2026-03-01',
        subscribedSince: '2026-01-01',
        status: 'active',
      },
    ],
    oneTimePurchases: [
      { id: 'p1', name: 'Laptop', cost: 1000, currency: 'USD', purchaseDate: '2026-01-01' },
    ],
    categories: [],
    preferences: { notify: { enabled: false } },
  };
  const now = new Date(2026, 4, 15); // 15 May 2026, local

  it('accepts a valid file, fills defaults and autofills renewals', () => {
    const r = parseBackupJson(JSON.stringify(backup), now);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const s = r.data.subscriptions[0];
    expect(s.renewalDate).toBe('2026-06-01'); // rolled forward past today
    expect(s.renewals.map((x) => x.date)).toEqual([
      '2026-01-01',
      '2026-02-01',
      '2026-03-01',
      '2026-04-01',
      '2026-05-01',
    ]);
    expect(s.createdAt).toBeTruthy();
    expect(r.data.preferences.notify.globalDaysBefore).toEqual([7, 1, 0]);
    expect(r.data.preferences.notify.enabled).toBe(false);
    expect(r.data.cancellationLog).toEqual([]);
  });

  it('rejects invalid JSON', () => {
    const r = parseBackupJson('{nope', now);
    expect(r.ok).toBe(false);
  });

  it('rejects type errors with a path, importing nothing', () => {
    const bad = { ...backup, subscriptions: [{ ...backup.subscriptions[0], cost: 'ten' }] };
    const r = parseBackupJson(JSON.stringify(bad), now);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors[0]).toMatch(/^subscriptions\.0\.cost:/);
  });

  it('rejects duplicate ids', () => {
    const bad = { ...backup, subscriptions: [backup.subscriptions[0], backup.subscriptions[0]] };
    const r = parseBackupJson(JSON.stringify(bad), now);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors[0]).toMatch(/Duplicate subscription id "s1"/);
  });

  it('rejects a file that is not a backup', () => {
    expect(parseBackupJson('[]', now).ok).toBe(false);
    expect(parseBackupJson('{"foo":1}', now).ok).toBe(false);
  });
});
