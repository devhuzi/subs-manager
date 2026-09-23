import { useMemo } from 'react';
import { ExternalLink } from 'lucide-react';
import type { FxRates, Subscription } from '../../../shared/types';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@renderer/components/ui/card';
import { Button } from '@renderer/components/ui/button';
import { Money } from '@renderer/components/ui/money';
import { ServiceAvatar } from '@renderer/components/ui/service-avatar';
import { comparableAmount } from '@renderer/lib/money';
import { monthlyEquivalent } from './spendMetrics';

interface Props {
  subscriptions: Subscription[];
  displayCurrency: string;
  rates: FxRates | null;
  /** Flips the subscription inactive (the toast offers undo). */
  onDeactivate: (id: string) => void;
}

/**
 * The dashboard's third answer: what could I cancel? The five largest active
 * subscriptions by monthly equivalent, each with a way out.
 */
export const ReviewCard = ({
  subscriptions,
  displayCurrency,
  rates,
  onDeactivate,
}: Props): JSX.Element | null => {
  const rows = useMemo(
    () =>
      subscriptions
        .filter((s) => s.status === 'active' && monthlyEquivalent(s) > 0)
        .map((s) => ({
          sub: s,
          monthly: monthlyEquivalent(s),
          sortKey: comparableAmount(monthlyEquivalent(s), s.currency, displayCurrency, rates),
        }))
        .sort((a, b) => b.sortKey - a.sortKey)
        .slice(0, 5),
    [subscriptions, displayCurrency, rates],
  );

  if (rows.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Worth a review</CardTitle>
        <CardDescription>Your largest subscriptions, per month.</CardDescription>
      </CardHeader>
      <CardContent>
        <ul className="divide-y">
          {rows.map(({ sub, monthly }) => (
            <li key={sub.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 py-3">
              <ServiceAvatar name={sub.name} logoUrl={sub.logoUrl} brandColor={sub.brandColor} />
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium">{sub.name}</div>
                <div className="text-xs text-muted-foreground">
                  <Money
                    amount={monthly}
                    currency={sub.currency}
                    convertTo={displayCurrency}
                    rates={rates}
                  />{' '}
                  / mo
                </div>
              </div>
              <div className="flex shrink-0 gap-1">
                {sub.cancellationUrl && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => void window.api.openExternal(sub.cancellationUrl!)}
                    aria-label={`Open cancellation page for ${sub.name}`}
                  >
                    <ExternalLink />
                    Cancel page
                  </Button>
                )}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => onDeactivate(sub.id)}
                  aria-label={`Deactivate ${sub.name}`}
                >
                  Deactivate
                </Button>
              </div>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
};
