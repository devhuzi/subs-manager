import { useMemo } from 'react';
import type { FxRates, Subscription } from '../../../shared/types';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@renderer/components/ui/card';
import { Money } from '@renderer/components/ui/money';
import { useToday } from '@renderer/hooks/useToday';
import { daysUntil } from '../subscriptions/renewals';
import { RenewalWhen } from '../subscriptions/RenewalWhen';

interface Props {
  subscriptions: Subscription[];
  displayCurrency: string;
  rates: FxRates | null;
}

interface Row {
  sub: Subscription;
  daysLeft: number;
}

export const TrialsExpiringSoon = ({
  subscriptions,
  displayCurrency,
  rates,
}: Props): JSX.Element | null => {
  const today = useToday();
  const rows: Row[] = useMemo(
    () =>
      subscriptions
        .filter((s) => s.trial && s.status === 'active')
        .map((s) => ({ sub: s, daysLeft: daysUntil(s.trial!.endsAt, today) }))
        .filter((r) => r.daysLeft <= 14 && r.daysLeft >= -3)
        .sort((a, b) => a.daysLeft - b.daysLeft),
    [subscriptions, today],
  );

  if (rows.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Trials ending soon</CardTitle>
        <CardDescription>
          Decide before these convert to paid. The cancellation URL is on each subscription if
          set.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ul className="divide-y">
          {rows.map(({ sub, daysLeft }) => (
            <li key={sub.id} className="flex items-center gap-3 py-3">
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium">{sub.name}</div>
                <RenewalWhen
                  days={daysLeft}
                  iso={sub.trial!.endsAt}
                  pastWord="Ended"
                  className="text-xs"
                />
              </div>
              {sub.trial?.convertsToCost != null && (
                <div className="text-right">
                  <div className="text-xs text-muted-foreground">Converts to</div>
                  <div className="text-sm font-medium">
                    <Money
                      amount={sub.trial.convertsToCost}
                      currency={sub.currency}
                      convertTo={displayCurrency}
                      rates={rates}
                    />
                  </div>
                </div>
              )}
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
};
