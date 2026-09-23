import { AlertCircle } from 'lucide-react';
import { cn } from '@renderer/lib/utils';
import { renewalLabel, renewalUrgency, type RenewalUrgency } from './renewals';

const DOT: Record<RenewalUrgency, string> = {
  overdue: '',
  imminent: 'bg-destructive',
  soon: 'bg-warning',
  later: 'bg-muted-foreground/40',
};

const TEXT: Record<RenewalUrgency, string> = {
  overdue: 'text-destructive-ink',
  imminent: 'text-destructive-ink',
  soon: 'text-warning-ink',
  later: 'text-muted-foreground',
};

interface Props {
  /** Calendar days until `iso` (see `daysUntil`). */
  days: number;
  iso: string;
  /** Replaces "Overdue" for passed dates (e.g. "Ended" for trials). */
  pastWord?: string;
  className?: string;
}

/**
 * Urgency dot (an alert icon once overdue) + the shared renewal wording.
 * The words carry the meaning, so it holds up without color.
 */
export const RenewalWhen = ({ days, iso, pastWord, className }: Props): JSX.Element => {
  const urgency = renewalUrgency(days);
  return (
    <span className={cn('inline-flex items-center gap-1.5 whitespace-nowrap tabular-nums', TEXT[urgency], className)}>
      {urgency === 'overdue' ? (
        <AlertCircle className="size-3.5 shrink-0" aria-hidden />
      ) : (
        <span className={cn('size-2 shrink-0 rounded-full', DOT[urgency])} aria-hidden />
      )}
      {renewalLabel(days, iso, pastWord)}
    </span>
  );
};
