import { useMemo } from 'react';
import type { Category, FxRates, Subscription } from '../../../shared/types';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@renderer/components/ui/card';
import { CategoryBadge } from '../categories/CategoryBadge';
import { ServiceAvatar } from '@renderer/components/ui/service-avatar';
import { Money } from '@renderer/components/ui/money';
import { formatCurrency, sumInto } from '@renderer/lib/money';
import { useToday } from '@renderer/hooks/useToday';
import { daysUntil } from '../subscriptions/renewals';
import { RenewalWhen } from '../subscriptions/RenewalWhen';

interface Props {
  subscriptions: Subscription[];
  categories: Category[];
  displayCurrency: string;
  rates: FxRates | null;
}

interface Row {
  sub: Subscription;
  days: number;
}

export const UpcomingRenewalsWidget = ({
  subscriptions,
  categories,
  displayCurrency,
  rates,
}: Props): JSX.Element => {
  const today = useToday();
  const categoryById = useMemo(
    () => Object.fromEntries(categories.map((c) => [c.id, c] as const)),
    [categories],
  );

  // Everything due in the next 30 days, plus anything already overdue.
  const rows: Row[] = useMemo(
    () =>
      subscriptions
        .filter((s) => s.status === 'active')
        .map((s) => ({ sub: s, days: daysUntil(s.renewalDate, today) }))
        .filter((r) => r.days <= 30)
        .sort((a, b) => a.days - b.days),
    [subscriptions, today],
  );

  const bucket = (maxDays: number): { count: number; label: string } => {
    const list = rows.filter((r) => r.days <= maxDays);
    const { total, unconverted } = sumInto(
      list.map((r) => ({ amount: r.sub.cost, currency: r.sub.currency })),
      displayCurrency,
      rates,
    );
    const parts = [
      formatCurrency(total, displayCurrency),
      ...Object.entries(unconverted).map(([cur, n]) => formatCurrency(n, cur)),
    ];
    return { count: list.length, label: parts.join(' + ') };
  };
  const next7 = bucket(7);
  const next30 = bucket(30);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Upcoming renewals</CardTitle>
        <CardDescription>Due in the next 30 days, plus anything overdue.</CardDescription>
        <dl className="grid grid-cols-2 gap-4 pt-3 text-sm">
          {[
            { term: 'Next 7 days', b: next7 },
            { term: 'Next 30 days', b: next30 },
          ].map(({ term, b }) => (
            <div key={term}>
              <dt className="text-muted-foreground">{term}</dt>
              <dd className="mt-0.5 font-semibold tabular-nums">{b.label}</dd>
              <dd className="text-xs text-muted-foreground tabular-nums">
                {b.count} {b.count === 1 ? 'charge' : 'charges'}
              </dd>
            </div>
          ))}
        </dl>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <div className="rounded-md border border-dashed py-12 text-center text-sm text-muted-foreground">
            Nothing renewing in the next 30 days.
          </div>
        ) : (
          <ul className="divide-y">
            {rows.map(({ sub, days }) => (
              <li key={sub.id} className="flex items-center gap-3 py-3">
                <ServiceAvatar name={sub.name} logoUrl={sub.logoUrl} brandColor={sub.brandColor} />
                <div className="min-w-0 flex-1">
                  <div className="flex min-w-0 items-center gap-2">
                    <span className="truncate text-sm font-medium">{sub.name}</span>
                    {sub.categoryId && (
                      <span className="hidden sm:inline-flex">
                        <CategoryBadge category={categoryById[sub.categoryId]} />
                      </span>
                    )}
                  </div>
                  <RenewalWhen days={days} iso={sub.renewalDate} className="text-xs" />
                </div>
                <div className="text-right text-sm font-medium">
                  <Money
                    amount={sub.cost}
                    currency={sub.currency}
                    convertTo={displayCurrency}
                    rates={rates}
                    className="flex flex-col items-end"
                  />
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
};
