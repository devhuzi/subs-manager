import type { AppData, FxRates } from '../../../shared/types';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@renderer/components/ui/card';
import { sumInto } from '@renderer/lib/money';
import { Money } from '@renderer/components/ui/money';

interface Props {
  data: AppData;
  rates: FxRates | null;
  displayCurrency: string;
}

export const CancellationSavings = ({
  data,
  rates,
  displayCurrency,
}: Props): JSX.Element | null => {
  if (data.cancellationLog.length === 0) return null;
  const annualized = data.cancellationLog.map((e) => ({
    amount: e.monthlyEquivalent * 12,
    currency: e.currency,
  }));
  const { total } = sumInto(annualized, displayCurrency, rates);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Cancellation savings</CardTitle>
        <CardDescription>
          Annualized savings from inactive subscriptions (monthly equivalent × 12). Reactivate one
          to remove its savings.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Money
          amount={total}
          currency={displayCurrency}
          size="stat"
          className="text-3xl font-semibold tracking-tight text-success-ink"
        />
        <p className="mt-2 text-sm text-muted-foreground">
          per year, from {data.cancellationLog.length}{' '}
          {data.cancellationLog.length === 1 ? 'cancelled subscription' : 'cancelled subscriptions'}
          .
        </p>
      </CardContent>
    </Card>
  );
};
