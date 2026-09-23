import { addMonths, endOfMonth, format, parseISO, startOfMonth } from 'date-fns';
import type {
  AppData,
  FxRates,
  OneTimePurchase,
  Subscription,
} from '../../../shared/types';
import { sumInto } from '@renderer/lib/money';

/**
 * Per-month cost projection for a subscription.
 *
 * Returns 0 for `custom` cycles — we don't know the cadence, so claiming
 * `cost` is monthly would wildly overstate a $300/half-year sub. Custom
 * subs are excluded from every projection that uses this helper:
 * dashboard monthly/annual stats, TopExpenses, CategorySplit's
 * subscription side, ForecastCard runrate, currentMonthProjection.
 * Their actual logged renewals still show up in SpendOverTime.
 */
export const monthlyEquivalent = (s: Subscription): number => {
  switch (s.billingCycle) {
    case 'monthly':
      return s.cost;
    case 'quarterly':
      return s.cost / 3;
    case 'yearly':
      return s.cost / 12;
    case 'custom':
    default:
      return 0;
  }
};

/**
 * Stable "what your active subs will cost you this month" number — the
 * sum of every active sub's monthly-equivalent, converted to `target`.
 * Doesn't drift through the month like a partial-spend total would.
 */
export const currentMonthProjection = (
  data: AppData,
  target: string,
  rates: FxRates | null,
): { total: number; unconverted: Record<string, number> } => {
  const items = data.subscriptions
    .filter((s) => s.status === 'active')
    .map((s) => ({ amount: monthlyEquivalent(s), currency: s.currency }))
    .filter((it) => it.amount > 0);
  return sumInto(items, target, rates);
};

export interface SpendPoint {
  month: string;
  monthLabel: string;
  subscriptions: number;
  purchases: number;
  total: number;
}

const monthKey = (d: Date): string => format(d, 'yyyy-MM');

/**
 * Last `months` calendar months (oldest → newest) with renewal + purchase
 * spend converted into `target` currency. Items in unconvertible currencies
 * are dropped from the line (acceptable for trend visualization).
 */
export const historicalSpendByMonth = (
  data: AppData,
  target: string,
  rates: FxRates | null,
  months = 12,
  now: Date = new Date(),
): SpendPoint[] => {
  const points: SpendPoint[] = [];
  const start = startOfMonth(addMonths(now, -(months - 1)));
  for (let i = 0; i < months; i++) {
    const cursor = addMonths(start, i);
    const key = monthKey(cursor);
    const renewalsThisMonth = data.subscriptions.flatMap((s) =>
      s.renewals
        .filter((r) => r.enabled !== false && monthKey(parseISO(r.date)) === key)
        .map((r) => ({ amount: r.cost, currency: r.currency })),
    );
    const purchasesThisMonth = data.oneTimePurchases
      .filter((p) => monthKey(parseISO(p.purchaseDate)) === key)
      .map((p) => ({ amount: p.cost, currency: p.currency }));
    const subs = sumInto(renewalsThisMonth, target, rates).total;
    const purchases = sumInto(purchasesThisMonth, target, rates).total;
    points.push({
      month: key,
      monthLabel: format(cursor, 'MMM'),
      subscriptions: Number(subs.toFixed(2)),
      purchases: Number(purchases.toFixed(2)),
      total: Number((subs + purchases).toFixed(2)),
    });
  }
  return points;
};

export interface ExpenseRow {
  id: string;
  name: string;
  monthlyEquivalent: number;
  category?: string;
  brandColor?: string;
}

export const topMonthlyExpenses = (
  subscriptions: Subscription[],
  target: string,
  rates: FxRates | null,
  limit = 5,
): ExpenseRow[] => {
  const active = subscriptions.filter((s) => s.status === 'active');
  const rows = active
    .map((s) => {
      const conv = sumInto(
        [{ amount: monthlyEquivalent(s), currency: s.currency }],
        target,
        rates,
      );
      return {
        id: s.id,
        name: s.name,
        monthlyEquivalent: conv.total,
        brandColor: s.brandColor,
      } as ExpenseRow;
    })
    .filter((r) => r.monthlyEquivalent > 0)
    .sort((a, b) => b.monthlyEquivalent - a.monthlyEquivalent)
    .slice(0, limit);
  return rows;
};

export interface CategoryShare {
  categoryId: string | null;
  categoryName: string;
  color?: string;
  amount: number;
}

export const oneTimeAmortizedMonthly = (p: OneTimePurchase): number => {
  const months = p.expectedLifespanMonths ?? 36;
  return months > 0 ? p.cost / months : 0;
};

export const isPaidOff = (p: OneTimePurchase, now: Date = new Date()): boolean => {
  const months = p.expectedLifespanMonths ?? 36;
  // True only once the purchase reaches its lifespan anniversary (respects the
  // day-of-month, not just the month boundary).
  return addMonths(parseISO(p.purchaseDate), months) <= now;
};

export const categoryMonthlySplit = (
  data: AppData,
  target: string,
  rates: FxRates | null,
  now: Date = new Date(),
): CategoryShare[] => {
  const map = new Map<string | '__none__', number>();
  const bump = (id: string | undefined, items: { amount: number; currency: string }[]): void => {
    const key = id ?? '__none__';
    const conv = sumInto(items, target, rates).total;
    map.set(key, (map.get(key) ?? 0) + conv);
  };
  for (const s of data.subscriptions.filter((x) => x.status === 'active')) {
    bump(s.categoryId, [{ amount: monthlyEquivalent(s), currency: s.currency }]);
  }
  // A purchase stops counting once amortized over its lifespan — same
  // "paid off" rule the Purchases view shows.
  for (const p of data.oneTimePurchases.filter((x) => !isPaidOff(x, now))) {
    bump(p.categoryId, [{ amount: oneTimeAmortizedMonthly(p), currency: p.currency }]);
  }
  const cats = Object.fromEntries(data.categories.map((c) => [c.id, c] as const));
  const rows: CategoryShare[] = [];
  for (const [key, amount] of map) {
    if (amount <= 0) continue;
    if (key === '__none__') {
      rows.push({ categoryId: null, categoryName: 'Uncategorized', amount });
    } else {
      const cat = cats[key];
      rows.push({
        categoryId: key,
        categoryName: cat?.name ?? 'Unknown',
        color: cat?.color,
        amount,
      });
    }
  }
  return rows.sort((a, b) => b.amount - a.amount);
};

export interface Forecast {
  monthlyRunrate: number;
  ytdActual: number;
  /** Active-sub renewals still due from today to the end of this month. */
  dueThisMonth: number;
  projectedYearEnd: number;
}

export const forecastAnnual = (
  data: AppData,
  target: string,
  rates: FxRates | null,
  now: Date = new Date(),
): Forecast => {
  const activeMonthly = sumInto(
    data.subscriptions
      .filter((s) => s.status === 'active')
      .map((s) => ({ amount: monthlyEquivalent(s), currency: s.currency })),
    target,
    rates,
  ).total;

  const monthsElapsed = now.getMonth() + 1;
  const monthsRemaining = 12 - monthsElapsed;
  const startOfYear = `${now.getFullYear()}-01-01`;
  const ytdRenewals = data.subscriptions.flatMap((s) =>
    s.renewals
      .filter((r) => r.enabled !== false && r.date >= startOfYear && r.date <= format(now, 'yyyy-MM-dd'))
      .map((r) => ({ amount: r.cost, currency: r.currency })),
  );
  const ytdPurchases = data.oneTimePurchases
    .filter((p) => p.purchaseDate >= startOfYear && p.purchaseDate <= format(now, 'yyyy-MM-dd'))
    .map((p) => ({ amount: p.cost, currency: p.currency }));
  const ytdActual = sumInto([...ytdRenewals, ...ytdPurchases], target, rates).total;
  // The rest of the current month: renewals actually scheduled between today
  // and month end (renewalDate is the next unpaid one; today's is included
  // only if autofill hasn't logged it yet). Custom cycles stay excluded, as
  // in the runrate.
  const todayIso = format(now, 'yyyy-MM-dd');
  const monthEndIso = format(endOfMonth(now), 'yyyy-MM-dd');
  const dueThisMonth = sumInto(
    data.subscriptions
      .filter(
        (s) =>
          s.status === 'active' &&
          s.billingCycle !== 'custom' &&
          s.renewalDate >= todayIso &&
          s.renewalDate <= monthEndIso,
      )
      .map((s) => ({ amount: s.cost, currency: s.currency })),
    target,
    rates,
  ).total;
  return {
    monthlyRunrate: activeMonthly,
    ytdActual,
    dueThisMonth,
    projectedYearEnd: ytdActual + dueThisMonth + activeMonthly * monthsRemaining,
  };
};

/**
 * Cost of a subscription as it stood on `asOfIso`, from its price history
 * (each entry is a price that applied until `changedAt`).
 */
const costAsOf = (s: Subscription, asOfIso: string): { cost: number; currency: string } => {
  const later = (s.priceHistory ?? [])
    .filter((p) => p.changedAt.slice(0, 10) > asOfIso)
    .sort((a, b) => a.changedAt.localeCompare(b.changedAt));
  return later.length > 0 ? later[0] : { cost: s.cost, currency: s.currency };
};

/**
 * Monthly runrate as it stood at the end of `asOfIso`: the monthly
 * equivalent of every subscription that had started and was active then,
 * priced as it was then. Status history isn't stored, so "active then" is
 * approximated as: active now, or inactive now with a cancellation-log entry
 * dated after `asOfIso`. Custom cycles contribute 0, as elsewhere.
 */
export const monthlyRunrateAt = (
  data: AppData,
  target: string,
  rates: FxRates | null,
  asOfIso: string,
): number => {
  const cancelledAt = new Map(
    data.cancellationLog
      .filter((e) => e.subscriptionId)
      .map((e) => [e.subscriptionId as string, e.cancelledAt.slice(0, 10)] as const),
  );
  const items = data.subscriptions
    .filter((s) => s.subscribedSince <= asOfIso)
    .filter((s) => {
      if (s.status === 'active') return true;
      const at = cancelledAt.get(s.id);
      return at !== undefined && at > asOfIso;
    })
    .map((s) => {
      const { cost, currency } = costAsOf(s, asOfIso);
      return { amount: monthlyEquivalent({ ...s, cost }), currency };
    })
    .filter((it) => it.amount > 0);
  return sumInto(items, target, rates).total;
};

export interface RunrateComparison {
  thisMonth: number;
  lastMonth: number;
  /** Undefined when there is no prior runrate to compare against. */
  deltaPct?: number;
}

/**
 * Like-for-like month comparison for the hero trend and the "this month vs
 * last" card: today's monthly runrate vs the runrate at the end of last
 * month. (Comparing a runrate to last month's actual charges mixed an
 * amortized number with a lumpy one — a yearly renewal made it swing.)
 */
export const runrateComparison = (
  data: AppData,
  target: string,
  rates: FxRates | null,
  now: Date = new Date(),
): RunrateComparison => {
  // Current runrate = the dashboard's "Monthly cost" figure, so the hero and
  // the stat card never disagree.
  const thisMonth = currentMonthProjection(data, target, rates).total;
  const lastMonthEnd = format(endOfMonth(addMonths(now, -1)), 'yyyy-MM-dd');
  const lastMonth = monthlyRunrateAt(data, target, rates, lastMonthEnd);
  return {
    thisMonth,
    lastMonth,
    deltaPct: lastMonth > 0 ? ((thisMonth - lastMonth) / lastMonth) * 100 : undefined,
  };
};

export interface PeriodCompare {
  thisMonth: number;
  lastMonth: number;
  deltaPct: number;
}

export const periodCompare = (points: SpendPoint[]): PeriodCompare => {
  const len = points.length;
  if (len < 2) return { thisMonth: points[len - 1]?.total ?? 0, lastMonth: 0, deltaPct: 0 };
  const thisMonth = points[len - 1].total;
  const lastMonth = points[len - 2].total;
  const deltaPct = lastMonth > 0 ? ((thisMonth - lastMonth) / lastMonth) * 100 : 0;
  return { thisMonth, lastMonth, deltaPct };
};
