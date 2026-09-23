import { Card } from '@renderer/components/ui/card';
import { Money } from '@renderer/components/ui/money';
import { TrendPill } from '@renderer/components/ui/trend-pill';
import { formatCurrency } from '@renderer/lib/money';

interface HeroCardProps {
  /** Monthly equivalent of every active subscription, in `currency`. */
  monthly: number;
  currency: string;
  /** Items that couldn't be converted (no rate), kept visible rather than dropped. */
  unconverted: Record<string, number>;
  /** Signed % vs last month's runrate; omitted when there's nothing to compare. */
  trend?: number;
  activeCount: number;
}

/**
 * The dashboard's first answer: what you pay. Monthly total, the annual
 * figure beneath it, and one like-for-like trend against last month.
 */
export const HeroCard = ({
  monthly,
  currency,
  unconverted,
  trend,
  activeCount,
}: HeroCardProps): JSX.Element => {
  const extras = Object.entries(unconverted)
    .map(([cur, n]) => formatCurrency(n, cur))
    .join(' + ');
  return (
    <Card className="p-6 sm:p-7">
      <p className="text-sm text-muted-foreground">Monthly cost</p>
      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-2">
        <span className="text-4xl font-semibold leading-none tracking-tight">
          <Money amount={monthly} currency={currency} size="stat" />
        </span>
        {trend !== undefined && (
          <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
            <TrendPill value={trend} />
            vs last month
          </span>
        )}
      </div>
      <p className="mt-3 text-sm text-muted-foreground">
        <Money amount={monthly * 12} currency={currency} className="font-medium text-foreground" />{' '}
        per year · {activeCount} active {activeCount === 1 ? 'subscription' : 'subscriptions'}
      </p>
      {extras && (
        <p className="mt-1 text-xs text-muted-foreground">
          Plus {extras} per month not converted (no exchange rate yet).
        </p>
      )}
    </Card>
  );
};
