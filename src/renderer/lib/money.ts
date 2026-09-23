import type { FxRates } from '../../shared/types';

/**
 * We display the ISO currency code (USD / AUD / CAD / EUR / ...) rather than
 * a symbol, because `$` is ambiguous across USD / AUD / CAD / etc. and
 * tracking subs across currencies is easy to misread otherwise.
 *
 * Locale is pinned to `en-US` so the format is consistent for every user
 * regardless of OS region — always code-first, period decimal, comma
 * thousand separator: `USD 1,234.56`.
 */
const formatters = new Map<string, Intl.NumberFormat>();

const getFormatter = (currency: string): Intl.NumberFormat => {
  const key = currency.toUpperCase();
  let f = formatters.get(key);
  if (!f) {
    f = new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: key,
      currencyDisplay: 'code',
    });
    formatters.set(key, f);
  }
  return f;
};

export const formatCurrency = (amount: number, currency: string): string => {
  try {
    return getFormatter(currency).format(amount);
  } catch {
    return `${currency.toUpperCase()} ${amount.toFixed(2)}`;
  }
};

/**
 * Splits a formatted currency value into its ISO code and numeric parts so
 * the UI can style them separately (small muted code + prominent number).
 * Falls back gracefully if the code can't be isolated.
 */
export const splitCurrency = (
  amount: number,
  currency: string,
): { code: string; number: string } => {
  const code = currency.toUpperCase();
  try {
    const parts = getFormatter(currency).formatToParts(amount);
    const number = parts
      .filter((p) => p.type !== 'currency' && p.type !== 'literal')
      .map((p) => p.value)
      .join('');
    return { code, number: number.trim() || amount.toFixed(2) };
  } catch {
    return { code, number: amount.toFixed(2) };
  }
};

/**
 * Returns the converted amount, or null when conversion is not possible
 * (no rates loaded, target currency unknown, or source currency missing).
 */
export const convert = (
  amount: number,
  from: string,
  to: string,
  rates: FxRates | null,
): number | null => {
  const f = from.toUpperCase();
  const t = to.toUpperCase();
  if (f === t) return amount;
  if (!rates) return null;
  const base = rates.base.toUpperCase();
  const r = rates.rates;
  if (f === base && r[t] != null) return amount * r[t];
  if (t === base && r[f] != null) return amount / r[f];
  if (r[f] != null && r[t] != null) return (amount / r[f]) * r[t];
  return null;
};

/**
 * Amount in `to` for ordering/comparison. Falls back to the raw amount when
 * it can't be converted (no rates yet) so sorting still works per-currency.
 */
export const comparableAmount = (
  amount: number,
  from: string,
  to: string,
  rates: FxRates | null,
): number => convert(amount, from, to, rates) ?? amount;

export interface AmountInCurrency {
  amount: number;
  currency: string;
}

/**
 * Sums a list of amounts into the target currency. Items in currencies that
 * can't be converted are returned in the `unconverted` map (so the UI can
 * surface them rather than silently drop).
 */
export const sumInto = (
  items: AmountInCurrency[],
  target: string,
  rates: FxRates | null,
): { total: number; unconverted: Record<string, number> } => {
  let total = 0;
  const unconverted: Record<string, number> = {};
  for (const item of items) {
    const c = convert(item.amount, item.currency, target, rates);
    if (c == null) {
      const k = item.currency.toUpperCase();
      unconverted[k] = (unconverted[k] ?? 0) + item.amount;
    } else {
      total += c;
    }
  }
  return { total, unconverted };
};
