import { describe, expect, it } from 'vitest';
import type { FxRates } from '../../shared/types';
import { comparableAmount, convert, formatCurrency, splitCurrency, sumInto } from './money';

const rates: FxRates = {
  base: 'USD',
  fetchedAt: '2026-05-01T00:00:00.000Z',
  rates: { USD: 1, EUR: 0.9, AUD: 1.5 },
};

describe('convert', () => {
  it('returns the amount unchanged for same currency', () => {
    expect(convert(100, 'USD', 'USD', rates)).toBe(100);
    expect(convert(100, 'usd', 'USD', null)).toBe(100);
  });

  it('converts from base to a quote currency', () => {
    expect(convert(100, 'USD', 'EUR', rates)).toBeCloseTo(90);
  });

  it('converts from a quote currency back to base', () => {
    expect(convert(90, 'EUR', 'USD', rates)).toBeCloseTo(100);
  });

  it('cross-converts between two non-base currencies', () => {
    // 100 EUR -> USD (÷0.9) -> AUD (×1.5)
    expect(convert(100, 'EUR', 'AUD', rates)).toBeCloseTo((100 / 0.9) * 1.5);
  });

  it('returns null when a currency is missing from the rate table', () => {
    expect(convert(100, 'USD', 'JPY', rates)).toBeNull();
  });

  it('returns null when no rates are available', () => {
    expect(convert(100, 'USD', 'EUR', null)).toBeNull();
  });
});

describe('sumInto', () => {
  it('sums convertible amounts into the target currency', () => {
    const { total, unconverted } = sumInto(
      [
        { amount: 100, currency: 'USD' },
        { amount: 90, currency: 'EUR' },
      ],
      'USD',
      rates,
    );
    expect(total).toBeCloseTo(200);
    expect(unconverted).toEqual({});
  });

  it('collects unconvertible amounts separately', () => {
    const { total, unconverted } = sumInto(
      [
        { amount: 100, currency: 'USD' },
        { amount: 5000, currency: 'JPY' },
      ],
      'USD',
      rates,
    );
    expect(total).toBeCloseTo(100);
    expect(unconverted.JPY).toBe(5000);
  });

  it('puts everything in unconverted when rates are missing', () => {
    const { total, unconverted } = sumInto(
      [{ amount: 90, currency: 'EUR' }],
      'USD',
      null,
    );
    expect(total).toBe(0);
    expect(unconverted.EUR).toBe(90);
  });
});

describe('splitCurrency', () => {
  it('separates the ISO code from the formatted number', () => {
    expect(splitCurrency(1234.56, 'USD')).toEqual({ code: 'USD', number: '1,234.56' });
  });
});

describe('formatCurrency', () => {
  it('prefixes the ISO code', () => {
    expect(formatCurrency(9.99, 'USD')).toBe('USD 9.99');
  });

  it('falls back gracefully for a malformed currency code', () => {
    // 'ZZ' is not a valid 3-letter ISO code → Intl throws → fallback path.
    expect(formatCurrency(10, 'ZZ')).toBe('ZZ 10.00');
  });
});

describe('comparableAmount', () => {
  it('orders mixed currencies by converted value', () => {
    // AUD 30 = USD 20, which is more than USD 15 despite the smaller raw number.
    expect(comparableAmount(30, 'AUD', 'USD', rates)).toBeCloseTo(20);
    expect(comparableAmount(30, 'AUD', 'USD', rates)).toBeGreaterThan(
      comparableAmount(15, 'USD', 'USD', rates),
    );
  });

  it('falls back to the raw amount without rates', () => {
    expect(comparableAmount(30, 'AUD', 'USD', null)).toBe(30);
  });
});
