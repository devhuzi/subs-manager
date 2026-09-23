import { useEffect, useMemo, useRef, useState } from 'react';
import { format, parseISO } from 'date-fns';
import { ExternalLink, Pencil, Trash2 } from 'lucide-react';
import { StatCard } from '@renderer/components/ui/stat-card';
import type { Category, FxRates, OneTimePurchase } from '../../../shared/types';
import type { OneTimePurchaseInput } from '../../../shared/schemas';
import { CategoryBadge } from '../categories/CategoryBadge';
import { SetCategoryMenu } from '../categories/SetCategoryMenu';
import { Button } from '@renderer/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@renderer/components/ui/dialog';
import {
  DropdownMenuItem,
  DropdownMenuSeparator,
} from '@renderer/components/ui/dropdown-menu';
import { PurchaseForm } from './PurchaseForm';
import { ServiceAvatar } from '@renderer/components/ui/service-avatar';
import { Money } from '@renderer/components/ui/money';
import { ListToolbar, FilterSelect } from '@renderer/components/ui/list-toolbar';
import { ListView } from '@renderer/components/list-view';
import { comparableAmount, formatCurrency, sumInto } from '@renderer/lib/money';
import { isPaidOff, oneTimeAmortizedMonthly } from '../dashboard/spendMetrics';

interface Props {
  purchases: OneTimePurchase[];
  categories: Category[];
  defaultCurrency: string;
  rates: FxRates | null;
  onAdd: (input: OneTimePurchaseInput) => Promise<void>;
  onUpdate: (id: string, input: OneTimePurchaseInput) => Promise<void>;
  onDelete: (ids: string[]) => Promise<void>;
  onSetCategory: (ids: string[], categoryId: string | undefined) => Promise<void>;
}

const PaidOffBadge = (): JSX.Element => (
  <span className="rounded-full bg-success/10 px-2 py-0.5 text-xs font-medium text-success-ink">
    Paid off
  </span>
);

export const PurchasesView = ({
  purchases,
  categories,
  defaultCurrency,
  rates,
  onAdd,
  onUpdate,
  onDelete,
  onSetCategory,
}: Props): JSX.Element => {
  const categoryById = useMemo(
    () => Object.fromEntries(categories.map((c) => [c.id, c] as const)),
    [categories],
  );
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<OneTimePurchase | undefined>();

  const searchRef = useRef<HTMLInputElement>(null);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [paymentFilter, setPaymentFilter] = useState('');
  const [sortBy, setSortBy] = useState('date');

  const paymentMethods = useMemo(
    () =>
      [...new Set(purchases.map((p) => p.paymentMethod).filter((p): p is string => !!p))].sort(),
    [purchases],
  );

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    const filtered = purchases.filter((p) => {
      if (
        q &&
        ![p.name, p.notes, p.paymentMethod].some((field) => field?.toLowerCase().includes(q))
      )
        return false;
      if (categoryFilter && (p.categoryId ?? '') !== categoryFilter) return false;
      if (paymentFilter && (p.paymentMethod ?? '') !== paymentFilter) return false;
      return true;
    });
    return filtered.sort((a, b) => {
      switch (sortBy) {
        case 'name':
          return a.name.localeCompare(b.name);
        case 'cost':
          return (
            comparableAmount(b.cost, b.currency, defaultCurrency, rates) -
            comparableAmount(a.cost, a.currency, defaultCurrency, rates)
          );
        case 'date':
        default:
          return b.purchaseDate.localeCompare(a.purchaseDate);
      }
    });
  }, [purchases, search, categoryFilter, paymentFilter, sortBy, defaultCurrency, rates]);

  const spent = sumInto(
    purchases.map((p) => ({ amount: p.cost, currency: p.currency })),
    defaultCurrency,
    rates,
  );
  const unconvertedNote = Object.entries(spent.unconverted)
    .map(([cur, n]) => `+ ${formatCurrency(n, cur)}`)
    .join(' ');

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

  const openEdit = (p: OneTimePurchase): void => {
    setEditing(p);
    setDialogOpen(true);
  };

  const closeDialog = (): void => {
    setDialogOpen(false);
    setEditing(undefined);
  };

  const handleSubmit = async (input: OneTimePurchaseInput): Promise<void> => {
    if (editing) {
      await onUpdate(editing.id, input);
    } else {
      await onAdd(input);
    }
    closeDialog();
  };

  const purchased = (p: OneTimePurchase): string => format(parseISO(p.purchaseDate), 'MMM d, yyyy');

  return (
    <>
      <ListView
        description="Tools and licenses you paid for once."
        addLabel="Add purchase"
        onAdd={() => {
          setEditing(undefined);
          setDialogOpen(true);
        }}
        stats={
          <div className="grid grid-cols-2 gap-4">
            <StatCard label="Purchases" value={purchases.length} hint="tracked" />
            <StatCard
              label="Total spent"
              value={spent.total}
              currency={defaultCurrency}
              hint={unconvertedNote ? `${unconvertedNote} not converted` : undefined}
            />
          </div>
        }
        items={purchases}
        visible={visible}
        emptyText="No purchases yet. Use Add purchase to track your first one."
        noMatchText="No purchases match your filters."
        toolbar={
          <ListToolbar
            ref={searchRef}
            search={search}
            onSearch={setSearch}
            searchPlaceholder="Search purchases…"
          >
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
                { value: 'date', label: 'Sort: purchase date' },
                { value: 'name', label: 'Sort: name' },
                { value: 'cost', label: 'Sort: cost' },
              ]}
            />
          </ListToolbar>
        }
        renderAvatar={(p) => (
          <ServiceAvatar name={p.name} logoUrl={p.logoUrl} brandColor={p.brandColor} />
        )}
        renderSubtitle={(p) => `Purchased ${purchased(p)}`}
        columns={[
          {
            header: 'Cost',
            className: 'text-right',
            cell: (p) => (
              <Money amount={p.cost} currency={p.currency} convertTo={defaultCurrency} rates={rates} />
            ),
          },
          {
            header: 'Amortized / mo',
            className: 'text-right text-muted-foreground',
            cell: (p) => <Money amount={oneTimeAmortizedMonthly(p)} currency={p.currency} />,
          },
          {
            header: 'Category',
            cell: (p) => (
              <CategoryBadge category={p.categoryId ? categoryById[p.categoryId] : undefined} />
            ),
          },
          { header: 'Status', cell: (p) => (isPaidOff(p) ? <PaidOffBadge /> : null) },
        ]}
        renderCard={(p) => (
          <dl className="mt-3 grid grid-cols-[max-content_minmax(0,1fr)] gap-x-3 gap-y-1.5 text-sm">
            <dt className="text-muted-foreground">Cost</dt>
            <dd className="min-w-0">
              <Money amount={p.cost} currency={p.currency} convertTo={defaultCurrency} rates={rates} />
            </dd>
            <dt className="text-muted-foreground">Amortized</dt>
            <dd>
              <Money amount={oneTimeAmortizedMonthly(p)} currency={p.currency} /> / mo
              {isPaidOff(p) && (
                <span className="ml-2">
                  <PaidOffBadge />
                </span>
              )}
            </dd>
            <dt className="text-muted-foreground">Category</dt>
            <dd>
              <CategoryBadge category={p.categoryId ? categoryById[p.categoryId] : undefined} />
            </dd>
            {p.notes && (
              <>
                <dt className="text-muted-foreground">Notes</dt>
                <dd className="text-muted-foreground">{p.notes}</dd>
              </>
            )}
          </dl>
        )}
        rowActions={(p) => (
          <>
            <DropdownMenuItem onSelect={() => openEdit(p)}>
              <Pencil />
              Edit
            </DropdownMenuItem>
            {p.website && (
              <DropdownMenuItem onSelect={() => void window.api.openExternal(p.website!)}>
                <ExternalLink />
                Open website
              </DropdownMenuItem>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem destructive onSelect={() => void onDelete([p.id])}>
              <Trash2 />
              Delete
            </DropdownMenuItem>
          </>
        )}
        onOpen={openEdit}
        bulkActions={(ids, clear) => (
          <>
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
            <DialogTitle>{editing ? 'Edit purchase' : 'New purchase'}</DialogTitle>
            <DialogDescription>
              {editing
                ? 'Update the details and save.'
                : 'Track a one-time tool, license, or purchase.'}
            </DialogDescription>
          </DialogHeader>
          <PurchaseForm
            initial={editing}
            categories={categories}
            paymentMethods={paymentMethods}
            defaultCurrency={defaultCurrency}
            onSubmit={handleSubmit}
            onCancel={closeDialog}
          />
        </DialogContent>
      </Dialog>
    </>
  );
};
