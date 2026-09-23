import type { Subscription } from '../../../shared/types';

/**
 * If the cost or currency is changing, append the PREVIOUS value to the
 * subscription's price history. Returns the new history array (or the
 * existing one unchanged). Pure — `now` is injectable for tests.
 */
export const recordPriceChange = (
  prev: Subscription,
  nextCost: number | undefined,
  nextCurrency: string | undefined,
  now: string = new Date().toISOString(),
): Subscription['priceHistory'] => {
  const costChanged = nextCost !== undefined && nextCost !== prev.cost;
  const currencyChanged = nextCurrency !== undefined && nextCurrency !== prev.currency;
  if (!costChanged && !currencyChanged) return prev.priceHistory;
  return [
    ...(prev.priceHistory ?? []),
    { changedAt: now, cost: prev.cost, currency: prev.currency },
  ];
};
