import { useMemo } from 'react';
import type { AppData, FxRates } from '../../../shared/types';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@renderer/components/ui/card';
import { Money } from '@renderer/components/ui/money';
import { forecastAnnual } from './spendMetrics';

interface Props {
  data: AppData;
  rates: FxRates | null;
  displayCurrency: string;
}

export const ForecastCard = ({ data, rates, displayCurrency }: Props): JSX.Element => {
  const f = useMemo(
    () => forecastAnnual(data, displayCurrency, rates),
    [data, rates, displayCurrency],
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>Year-end forecast</CardTitle>
        <CardDescription>
          Year-to-date actual + renewals still due this month + monthly runrate through December.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Money
          amount={f.projectedYearEnd}
          currency={displayCurrency}
          size="stat"
          className="text-3xl font-semibold tracking-tight"
        />
        <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
          <div>
            <dt className="text-muted-foreground">Spent this year</dt>
            <dd className="mt-0.5 font-medium">
              <Money amount={f.ytdActual} currency={displayCurrency} />
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Monthly runrate</dt>
            <dd className="mt-0.5 font-medium">
              <Money amount={f.monthlyRunrate} currency={displayCurrency} />
            </dd>
          </div>
        </dl>
      </CardContent>
    </Card>
  );
};
