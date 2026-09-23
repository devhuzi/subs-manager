import { useEffect, useMemo, useRef, useState } from 'react';
import { format } from 'date-fns';
import { ExternalLink, Info, LogOut, Pencil, PowerOff, Trash2 } from 'lucide-react';
import { StatCard } from '@renderer/components/ui/stat-card';
import type { Category, FxRates, Subscription } from '../../../shared/types';
import type { SubscriptionInput } from '../../../shared/schemas';
import { CategoryBadge } from '../categories/CategoryBadge';
import { SetCategoryMenu } from '../categories/SetCategoryMenu';
import { ServiceAvatar } from '@renderer/components/ui/service-avatar';
import { SubscriptionDetailsDialog } from './SubscriptionDetailsDialog';
import { activeSinceDate, lifetimeSpend, renewalCount } from './subscriptionMetrics';
import { Money } from '@renderer/components/ui/money';
import { ListToolbar, FilterSelect, SegmentedPills } from '@renderer/components/ui/list-toolbar';
import { ListView } from '@renderer/components/list-view';
import { comparableAmount, formatCurrency, sumInto } from '@renderer/lib/money';
import { monthlyEquivalent } from '../dashboard/spendMetrics';
import { Button } from '@renderer/components/ui/button';
import { Switch } from '@renderer/components/ui/switch';
import {
  DropdownMenuItem,
  DropdownMenuSeparator,
} from '@renderer/components/ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@renderer/components/ui/dialog';
import { useToday } from '@renderer/hooks/useToday';
import { SubscriptionForm } from './SubscriptionForm';
import { daysUntil } from './renewals';
import { RenewalWhen } from './RenewalWhen';

interface Props {
  subscriptions: Subscription[];
  categories: Category[];
  defaultCurrency: string;
  rates: FxRates | null;
  /** When true, open the add dialog on arrival (dashboard first-run CTA). */
  autoOpenAdd?: boolean;
  onAutoOpenConsumed?: () => void;
  onAdd: (input: SubscriptionInput) => Promise<void>;
  onUpdate: (id: string, input: SubscriptionInput) => Promise<void>;
  onToggle: (id: string) => Promise<void>;
  onDeactivate: (ids: string[]) => Promise<void>;
  onDelete: (ids: string[]) => Promise<void>;
  onSetCategory: (ids: string[], categoryId: string | undefined) => Promise<void>;
  onSetRenewalEnabled: (subId: string, renewalId: string, enabled: boolean) => Promise<void>;
}

const cycleLabel: Record<Subscription['billingCycle'], string> = {
  monthly: 'Monthly',
  quarterly: 'Quarterly',
  yearly: 'Yearly',
  custom: 'Custom',
};

export const SubscriptionsView = ({
  subscriptions,
  categories,
  defaultCurrency,
  rates,
  autoOpenAdd,
  onAutoOpenConsumed,
  onAdd,
  onUpdate,
  onToggle,
  onDeactivate,
  onDelete,
  onSetCategory,
  onSetRenewalEnabled,
}: Props): JSX.Element => {
  const today = useToday();
  const categoryById = useMemo(
    () => Object.fromEntries(categories.map((c) => [c.id, c] as const)),
    [categories],
  );
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Subscription | undefined>();
  const [detailsSubId, setDetailsSubId] = useState<string | null>(null);
  const detailsSub = detailsSubId
    ? (subscriptions.find((s) => s.id === detailsSubId) ?? null)
    : null;

  const searchRef = useRef<HTMLInputElement>(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [paymentFilter, setPaymentFilter] = useState('');
  const [sortBy, setSortBy] = useState('renewal');

  const paymentMethods = useMemo(
    () =>
      [
        ...new Set(subscriptions.map((s) => s.paymentMethod).filter((p): p is string => !!p)),
      ].sort(),
    [subscriptions],
  );

  const active = subscriptions.filter((s) => s.status === 'active');
  const monthly = sumInto(
    active.map((s) => ({ amount: monthlyEquivalent(s), currency: s.currency })),
    defaultCurrency,
    rates,
  );
  const unconvertedNote = Object.entries(monthly.unconverted)
    .map(([cur, n]) => `+ ${formatCurrency(n, cur)}`)
    .join(' ');

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    const filtered = subscriptions.filter((s) => {
      if (
        q &&
        ![s.name, s.notes, s.paymentMethod].some((field) => field?.toLowerCase().includes(q))
      )
        return false;
      if (statusFilter && s.status !== statusFilter) return false;
      if (categoryFilter && (s.categoryId ?? '') !== categoryFilter) return false;
      if (paymentFilter && (s.paymentMethod ?? '') !== paymentFilter) return false;
      return true;
    });
    const sort = (a: Subscription, b: Subscription): number => {
      switch (sortBy) {
        case 'name':
          return a.name.localeCompare(b.name);
        case 'cost':
          return (
            comparableAmount(monthlyEquivalent(b), b.currency, defaultCurrency, rates) -
            comparableAmount(monthlyEquivalent(a), a.currency, defaultCurrency, rates)
          );
        case 'renewal':
        default:
          if (a.status !== b.status) return a.status === 'active' ? -1 : 1;
          return a.renewalDate.localeCompare(b.renewalDate);
      }
    };
    return filtered.sort(sort);
  }, [
    subscriptions,
    search,
    statusFilter,
    categoryFilter,
    paymentFilter,
    sortBy,
    defaultCurrency,
    rates,
  ]);

  const openAdd = (): void => {
    setEditing(undefined);
    setDialogOpen(true);
  };
  const openEdit = (s: Subscription): void => {
    setEditing(s);
    setDialogOpen(true);
  };

  useEffect(() => {
    const onAddEvent = (): void => {
      setEditing(undefined);
      setDialogOpen(true);
    };
    const focusSearch = (): void => searchRef.current?.focus();
    window.addEventListener('app:add', onAddEvent);
    window.addEventListener('app:focus-search', focusSearch);
    return () => {
      window.removeEventListener('app:add', onAddEvent);
      window.removeEventListener('app:focus-search', focusSearch);
    };
  }, []);

  // First-run CTA from the dashboard: open the add dialog once on arrival.
  useEffect(() => {
    if (autoOpenAdd) {
      setEditing(undefined);
      setDialogOpen(true);
      onAutoOpenConsumed?.();
    }
  }, [autoOpenAdd, onAutoOpenConsumed]);

  const closeDialog = (): void => {
    setDialogOpen(false);
    setEditing(undefined);
  };

  const handleSubmit = async (input: SubscriptionInput): Promise<void> => {
    if (editing) {
      await onUpdate(editing.id, input);
    } else {
      await onAdd(input);
    }
    closeDialog();
  };

  const nextRenewal = (s: Subscription): JSX.Element =>
    s.status === 'active' ? (
      <RenewalWhen days={daysUntil(s.renewalDate, today)} iso={s.renewalDate} />
    ) : (
      <span className="text-muted-foreground">Inactive</span>
    );

  const statusSwitch = (s: Subscription): JSX.Element => (
    <Switch
      checked={s.status === 'active'}
      onCheckedChange={() => void onToggle(s.id)}
      aria-label={`${s.name} active`}
    />
  );

  return (
    <>
      <ListView
        description="Active subscriptions are billed; inactive ones are kept for history."
        addLabel="Add subscription"
        onAdd={openAdd}
        stats={
          <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
            <StatCard
              className="col-span-2 md:col-span-1"
              label="Active"
              value={active.length}
              hint={`${subscriptions.length} tracked`}
            />
            <StatCard
              label="Monthly cost"
              value={monthly.total}
              currency={defaultCurrency}
              hint={unconvertedNote ? `${unconvertedNote} not converted` : undefined}
            />
            <StatCard label="Annual cost" value={monthly.total * 12} currency={defaultCurrency} />
          </div>
        }
        items={subscriptions}
        visible={visible}
        emptyText="No subscriptions yet. Use Add subscription to track your first one."
        noMatchText="No subscriptions match your filters."
        toolbar={
          <ListToolbar
            ref={searchRef}
            search={search}
            onSearch={setSearch}
            searchPlaceholder="Search subscriptions…"
          >
            <SegmentedPills
              value={statusFilter}
              onChange={setStatusFilter}
              ariaLabel="Filter by status"
              options={[
                { value: '', label: 'All' },
                { value: 'active', label: 'Active' },
                { value: 'inactive', label: 'Inactive' },
              ]}
            />
            <FilterSelect
              value={categoryFilter}
              onChange={setCategoryFilter}
              allLabel="All categories"
              ariaLabel="Filter by category"
              options={categories.map((c) => ({ value: c.id, label: c.name }))}
            />
            {paymentMethods.length > 0 && (
              <FilterSelect
                value={paymentFilter}
                onChange={setPaymentFilter}
                allLabel="All payment methods"
                ariaLabel="Filter by payment method"
                options={paymentMethods.map((p) => ({ value: p, label: p }))}
              />
            )}
            <FilterSelect
              value={sortBy}
              onChange={setSortBy}
              ariaLabel="Sort"
              options={[
                { value: 'renewal', label: 'Sort: renewal date' },
                { value: 'name', label: 'Sort: name' },
                { value: 'cost', label: 'Sort: monthly cost' },
              ]}
            />
          </ListToolbar>
        }
        renderAvatar={(s) => (
          <ServiceAvatar name={s.name} logoUrl={s.logoUrl} brandColor={s.brandColor} />
        )}
        renderSubtitle={(s) => {
          const renewals = renewalCount(s);
          return (
            <>
              Since {format(activeSinceDate(s), 'MMM d, yyyy')}
              {renewals > 0 && ` · renewed ${renewals} time${renewals === 1 ? '' : 's'}`}
            </>
          );
        }}
        columns={[
          {
            header: 'Cost',
            cell: (s) => (
              <>
                <div>
                  <Money
                    amount={s.cost}
                    currency={s.currency}
                    convertTo={defaultCurrency}
                    rates={rates}
                  />
                </div>
                {renewalCount(s) > 0 && (
                  <div className="text-xs text-muted-foreground">
                    <Money amount={lifetimeSpend(s)} currency={s.currency} /> paid
                  </div>
                )}
              </>
            ),
          },
          { header: 'Cycle', cell: (s) => cycleLabel[s.billingCycle] },
          { header: 'Next renewal', cell: nextRenewal },
          {
            header: 'Category',
            cell: (s) => (
              <CategoryBadge category={s.categoryId ? categoryById[s.categoryId] : undefined} />
            ),
          },
          {
            header: 'Active',
            // The switch must not open the row.
            cell: (s) => <div onClick={(e) => e.stopPropagation()}>{statusSwitch(s)}</div>,
          },
        ]}
        renderCard={(s) => (
          <dl className="mt-3 grid grid-cols-[max-content_minmax(0,1fr)] items-center gap-x-3 gap-y-1.5 text-sm">
            <dt className="text-muted-foreground">Active</dt>
            <dd onClick={(e) => e.stopPropagation()}>{statusSwitch(s)}</dd>
            <dt className="text-muted-foreground">Cost</dt>
            <dd className="min-w-0 text-foreground">
              <Money amount={s.cost} currency={s.currency} convertTo={defaultCurrency} rates={rates} />
              <span className="text-muted-foreground"> · {cycleLabel[s.billingCycle]}</span>
            </dd>
            <dt className="text-muted-foreground">Next renewal</dt>
            <dd>{nextRenewal(s)}</dd>
            <dt className="text-muted-foreground">Category</dt>
            <dd>
              <CategoryBadge category={s.categoryId ? categoryById[s.categoryId] : undefined} />
            </dd>
          </dl>
        )}
        rowActions={(s) => (
          <>
            <DropdownMenuItem onSelect={() => setDetailsSubId(s.id)}>
              <Info />
              Details
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => openEdit(s)}>
              <Pencil />
              Edit
            </DropdownMenuItem>
            {s.website && (
              <DropdownMenuItem onSelect={() => void window.api.openExternal(s.website!)}>
                <ExternalLink />
                Open website
              </DropdownMenuItem>
            )}
            {s.cancellationUrl && (
              <DropdownMenuItem onSelect={() => void window.api.openExternal(s.cancellationUrl!)}>
                <LogOut />
                Cancellation page
              </DropdownMenuItem>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem destructive onSelect={() => void onDelete([s.id])}>
              <Trash2 />
              Delete
            </DropdownMenuItem>
          </>
        )}
        onOpen={(s) => setDetailsSubId(s.id)}
        dimmed={(s) => s.status === 'inactive'}
        bulkActions={(ids, clear) => (
          <>
            <Button
              variant="outline"
              size="sm"
              onClick={() => void onDeactivate(ids).then(clear)}
            >
              <PowerOff />
              Deactivate
            </Button>
            <SetCategoryMenu
              categories={categories}
              onPick={(categoryId) => void onSetCategory(ids, categoryId).then(clear)}
            />
            <Button variant="outline" size="sm" onClick={() => void onDelete(ids).then(clear)}>
              <Trash2 />
              Delete
            </Button>
          </>
        )}
      />

      <Dialog
        open={dialogOpen}
        onOpenChange={(open) => (open ? setDialogOpen(true) : closeDialog())}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? 'Edit subscription' : 'New subscription'}</DialogTitle>
            <DialogDescription>
              {editing ? 'Update the details and save.' : 'Track a recurring tool or service.'}
            </DialogDescription>
          </DialogHeader>
          <SubscriptionForm
            initial={editing}
            categories={categories}
            defaultCurrency={defaultCurrency}
            paymentMethods={paymentMethods}
            onSubmit={handleSubmit}
            onCancel={closeDialog}
          />
        </DialogContent>
      </Dialog>

      <SubscriptionDetailsDialog
        subscription={detailsSub}
        category={detailsSub?.categoryId ? categoryById[detailsSub.categoryId] : undefined}
        defaultCurrency={defaultCurrency}
        rates={rates}
        onSetRenewalEnabled={onSetRenewalEnabled}
        onEdit={(s) => {
          setDetailsSubId(null);
          openEdit(s);
        }}
        onClose={() => setDetailsSubId(null)}
      />
    </>
  );
};
