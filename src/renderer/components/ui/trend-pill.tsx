import { Minus, TrendingDown, TrendingUp } from 'lucide-react';
import { cn } from '@renderer/lib/utils';

interface TrendPillProps {
  /** Signed percentage change in spending, e.g. 6.9 or -1.9. */
  value: number;
  className?: string;
}

/**
 * Spending trend chip. Spending up reads as bad (destructive ink), down as
 * good (success ink), and a change under half a percent as flat (neutral).
 * The arrow and sign carry the meaning without color.
 */
export const TrendPill = ({ value, className }: TrendPillProps): JSX.Element => {
  const dir = value > 0.5 ? 'up' : value < -0.5 ? 'down' : 'flat';
  const Icon = dir === 'up' ? TrendingUp : dir === 'down' ? TrendingDown : Minus;
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium tabular-nums',
        dir === 'up' && 'bg-destructive/10 text-destructive-ink',
        dir === 'down' && 'bg-success/10 text-success-ink',
        dir === 'flat' && 'bg-muted text-muted-foreground',
        className,
      )}
    >
      <Icon className="size-3" aria-hidden />
      {dir === 'flat' ? 'No change' : `${value > 0 ? '+' : ''}${value.toFixed(1)}%`}
    </span>
  );
};
