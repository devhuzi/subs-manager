import { useMemo } from 'react';
import { format, parseISO } from 'date-fns';
import { ExternalLink, Pencil } from 'lucide-react';
import type { Category, FxRates, Subscription } from '../../../shared/types';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@renderer/components/ui/dialog';
import { Button } from '@renderer/components/ui/button';
import { Switch } from '@renderer/components/ui/switch';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@renderer/components/ui/table';
import { CategoryBadge } from '../categories/CategoryBadge';
import { Money } from '@renderer/components/ui/money';
import {
  activeDurationLabel,
  activeSinceDate,
  lifetimeSpend,
  renewalCount,
} from './subscriptionMetrics';

interface Props {
  subscription: Subscription | null;
  category?: Category;
  defaultCurrency: string;
  rates: FxRates | null;
  onSetRenewalEnabled: (subId: string, renewalId: string, enabled: boolean) => Promise<void>;
  onEdit: (subscription: Subscription) => void;
  onClose: () => void;
}

export const SubscriptionDetailsDialog = ({
  subscription,
  category,
  defaultCurrency,
  rates,
  onSetRenewalEnabled,
  onEdit,
  onClose,
}: Props): JSX.Element | null => {
  const sortedRenewals = useMemo(
    () =>
      subscription
        ? [...subscription.renewals].sort((a, b) => b.date.localeCompare(a.date))
        : [],
    [subscription],
  );

  if (!subscription) return null;

  const sinceLabel = format(activeSinceDate(subscription), 'MMM d, yyyy');
  const lifetime = lifetimeSpend(subscription);
  const renewals = renewalCount(subscription);
  const totalLogged = subscription.renewals.length;

  return (
    <Dialog open onOpenChange={(open) => (open ? null : onClose())}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{subscription.name}</DialogTitle>
          <DialogDescription>
            <span className="capitalize">{subscription.billingCycle}</span> ·{' '}
            <Money
              amount={subscription.cost}
              currency={subscription.currency}
              convertTo={defaultCurrency}
              rates={rates}
            />{' '}
            · {subscription.status === 'active' ? 'Active' : 'Inactive'}
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 gap-4 rounded-lg border p-4 text-sm sm:grid-cols-2">
          <div>
            <div className="text-muted-foreground">Active since</div>
            <div className="font-medium">
              {sinceLabel} · {activeDurationLabel(subscription)}
            </div>
          </div>
          <div>
            <div className="text-muted-foreground">Next renewal</div>
            <div className="font-medium">{format(parseISO(subscription.renewalDate), 'MMM d, yyyy')}</div>
          </div>
          <div>
            <div className="text-muted-foreground">Renewals counted</div>
            <div className="font-medium">
              {renewals}
              {renewals !== totalLogged && (
                <span className="text-muted-foreground"> (of {totalLogged} logged)</span>
              )}
            </div>
          </div>
          <div>
            <div className="text-muted-foreground">Lifetime paid</div>
            <div className="font-medium">
              <Money amount={lifetime} currency={subscription.currency} />
            </div>
          </div>
          <div>
            <div className="text-muted-foreground">Category</div>
            <div className="pt-1">
              <CategoryBadge category={category} />
            </div>
          </div>
          {subscription.paymentMethod && (
            <div>
              <div className="text-muted-foreground">Payment method</div>
              <div className="font-medium">{subscription.paymentMethod}</div>
            </div>
          )}
          {subscription.notes && (
            <div className="col-span-2">
              <div className="text-muted-foreground">Notes</div>
              <div>{subscription.notes}</div>
            </div>
          )}
          {subscription.priceHistory && subscription.priceHistory.length > 0 && (
            <div className="col-span-2">
              <div className="text-muted-foreground">Price history</div>
              <ul className="mt-1 space-y-0.5 text-xs text-muted-foreground">
                {[...subscription.priceHistory].reverse().map((p, i) => (
                  <li key={i}>
                    was <Money amount={p.cost} currency={p.currency} /> until{' '}
                    {format(parseISO(p.changedAt.slice(0, 10)), 'MMM d, yyyy')}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => onEdit(subscription)}>
            <Pencil />
            Edit
          </Button>
          {subscription.cancellationUrl && (
            <Button
              variant="outline"
              onClick={() => void window.api.openExternal(subscription.cancellationUrl!)}
            >
              <ExternalLink />
              Open cancellation page
            </Button>
          )}
        </div>

        <div>
          <h3 className="mb-2 text-sm font-medium">Renewal history</h3>
          {sortedRenewals.length === 0 ? (
            <div className="rounded-md border border-dashed py-8 text-center text-sm text-muted-foreground">
              No renewals logged yet. Use Mark renewed on the list to record one.
            </div>
          ) : (
            <div className="max-h-80 overflow-y-auto rounded-md border">
              <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead className="text-right">Counted</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedRenewals.map((r) => {
                  const enabled = r.enabled !== false;
                  return (
                    <TableRow key={r.id} className={enabled ? '' : 'opacity-50'}>
                      <TableCell>{format(parseISO(r.date), 'MMM d, yyyy')}</TableCell>
                      <TableCell>
                        <Money amount={r.cost} currency={r.currency} />
                      </TableCell>
                      <TableCell className="text-right">
                        <Switch
                          checked={enabled}
                          onCheckedChange={(v) => void onSetRenewalEnabled(subscription.id, r.id, v)}
                          aria-label={enabled ? 'Mark as not renewed' : 'Mark as renewed'}
                        />
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
              </Table>
            </div>
          )}
          <p className="mt-2 text-xs text-muted-foreground">
            Toggle a renewal off to say &ldquo;I didn&apos;t actually renew that{' '}
            {subscription.billingCycle === 'yearly'
              ? 'year'
              : subscription.billingCycle === 'monthly'
                ? 'month'
                : 'period'}
            &rdquo; — it stays in the log for history but stops counting toward lifetime spend and
            renewal counts.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
};
