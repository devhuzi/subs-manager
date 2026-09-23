import type { FxRates } from '../../../shared/types';
import { convert, splitCurrency } from '@renderer/lib/money';
import { cn } from '@renderer/lib/utils';

interface MoneyProps {
  amount: number;
  currency: string;
  /** Visual weight. `stat` for big hero numbers, `body` for inline/table. */
  size?: 'stat' | 'body';
  /**
   * If set (and different from `currency`) and `rates` are available, the
   * converted value is shown in muted parentheses beside the original —
   * e.g. `AUD 20.00 (≈ USD 13.10)`. The original currency you paid in always
   * stays as the primary figure.
   */
  convertTo?: string;
  rates?: FxRates | null;
  className?: string;
}

/**
 * Renders a money value with the ISO currency code de-emphasized (smaller,
 * muted, uppercase) and the number prominent. Keeps multi-currency displays
 * unambiguous without the code visually competing with the figure.
 *
 * `USD 1,234.56` → small "USD" + bold "1,234.56".
 */
export const Money = ({
  amount,
  currency,
  size = 'body',
  convertTo,
  rates,
  className,
}: MoneyProps): JSX.Element => {
  const { code, number } = splitCurrency(amount, currency);

  const target = convertTo?.toUpperCase();
  const showConverted = Boolean(target && target !== currency.toUpperCase() && rates);
  const converted = showConverted ? convert(amount, currency, target!, rates ?? null) : null;
  const convertedParts = converted != null ? splitCurrency(converted, target!) : null;

  return (
    // The wrapper may wrap between the original and the converted figure; each
    // figure stays unbreakable so "USD 1,234.56" never splits across lines.
    <span className={cn('tabular-nums', className)}>
      <span className="whitespace-nowrap">
        <span
          className={cn(
            'mr-1 align-baseline font-medium uppercase tracking-wide text-muted-foreground',
            size === 'stat' ? 'text-[0.5em]' : 'text-[0.8em]',
          )}
        >
          {code}
        </span>
        {number}
      </span>
      {convertedParts && (
        <span className="ml-1.5 whitespace-nowrap text-[0.8em] font-normal text-muted-foreground">
          ≈ {convertedParts.code} {convertedParts.number}
        </span>
      )}
    </span>
  );
};
