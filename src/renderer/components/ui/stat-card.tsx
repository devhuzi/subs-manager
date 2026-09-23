import { Card } from '@renderer/components/ui/card';
import { Money } from '@renderer/components/ui/money';
import { cn } from '@renderer/lib/utils';

interface StatCardProps {
  label: string;
  value: number;
  /** ISO currency code. Omit for a plain count (e.g. "12 active"). */
  currency?: string;
  hint?: string;
  className?: string;
}

/** One metric tile: a quiet label over a tabular figure, with an optional hint. */
export const StatCard = ({
  label,
  value,
  currency,
  hint,
  className,
}: StatCardProps): JSX.Element => (
  <Card className={cn('p-4 sm:p-5', className)}>
    <p className="text-sm text-muted-foreground">{label}</p>
    <p className="mt-2 text-2xl font-semibold leading-none tracking-tight tabular-nums sm:text-3xl">
      {currency ? (
        <Money amount={value} currency={currency} size="stat" />
      ) : (
        value.toLocaleString('en-US')
      )}
    </p>
    {hint && <p className="mt-2 truncate text-xs text-muted-foreground">{hint}</p>}
  </Card>
);
