import { useEffect, useRef, useState } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { ChevronDown } from 'lucide-react';
import { subscriptionInputSchema, type SubscriptionInput } from '../../../shared/schemas';
import type { Category, Subscription } from '../../../shared/types';
import { todayLocalIso } from '../../../shared/dates';
import { Button } from '@renderer/components/ui/button';
import { DialogStickyFooter } from '@renderer/components/ui/dialog';
import { FieldError, fieldA11y } from '@renderer/components/ui/field-error';
import { Input } from '@renderer/components/ui/input';
import { Label } from '@renderer/components/ui/label';
import { Switch } from '@renderer/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@renderer/components/ui/select';
import { CurrencySelect } from '@renderer/components/currency-select';
import { CategorySelect } from '../categories/CategorySelect';
import { nextRenewalFromStart } from './renewals';
import { cn } from '@renderer/lib/utils';

const ALERT_DAYS_SUGGESTIONS = [30, 14, 7, 3, 1, 0];

interface Props {
  initial?: Subscription;
  categories: Category[];
  defaultCurrency: string;
  /** Distinct existing payment methods for the datalist. */
  paymentMethods: string[];
  onSubmit: (input: SubscriptionInput) => Promise<void> | void;
  onCancel: () => void;
}

const today = (): string => todayLocalIso();

const defaultValues = (
  initial: Subscription | undefined,
  defaultCurrency: string,
): SubscriptionInput => ({
  name: initial?.name ?? '',
  cost: initial?.cost ?? 0,
  currency: initial?.currency ?? defaultCurrency,
  billingCycle: initial?.billingCycle ?? 'monthly',
  renewalDate: initial?.renewalDate ?? nextRenewalFromStart(today(), 'monthly', today()),
  subscribedSince: initial?.subscribedSince ?? today(),
  // Status isn't on the form (the list's switch owns it); an edit keeps it.
  status: initial?.status ?? 'active',
  categoryId: initial?.categoryId,
  website: initial?.website,
  notes: initial?.notes,
  cancellationUrl: initial?.cancellationUrl,
  paymentMethod: initial?.paymentMethod,
  brandColor: initial?.brandColor,
  trial: initial?.trial,
  alertConfig: initial?.alertConfig,
});

const chipClass = (on: boolean): string =>
  cn(
    'rounded-full border px-3 py-1.5 text-sm tabular-nums transition-colors',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
    on
      ? 'border-primary bg-primary text-primary-foreground'
      : 'border-input bg-background text-foreground hover:bg-accent',
  );

export const SubscriptionForm = ({
  initial,
  categories,
  defaultCurrency,
  paymentMethods,
  onSubmit,
  onCancel,
}: Props): JSX.Element => {
  const {
    register,
    handleSubmit,
    control,
    reset,
    setValue,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<SubscriptionInput>({
    resolver: zodResolver(subscriptionInputSchema),
    defaultValues: defaultValues(initial, defaultCurrency),
  });
  const [moreOpen, setMoreOpen] = useState(false);
  // Next renewal follows start date + cycle until the user sets it by hand
  // (or is editing an existing subscription, whose date is already real).
  const renewalTouched = useRef(Boolean(initial));

  useEffect(() => {
    reset(defaultValues(initial, defaultCurrency));
    renewalTouched.current = Boolean(initial);
    setMoreOpen(false);
  }, [initial, defaultCurrency, reset]);

  const subscribedSince = watch('subscribedSince');
  const billingCycle = watch('billingCycle');
  useEffect(() => {
    if (renewalTouched.current || !subscribedSince) return;
    setValue('renewalDate', nextRenewalFromStart(subscribedSince, billingCycle, today()));
  }, [subscribedSince, billingCycle, setValue]);

  const submit = handleSubmit(
    async (values) => {
      await onSubmit(values);
    },
    // A failing field may be hidden under "More options" — reveal it.
    () => setMoreOpen(true),
  );

  const renewalField = register('renewalDate', {
    onChange: () => {
      renewalTouched.current = true;
    },
  });

  return (
    <form onSubmit={submit} className="grid gap-4" noValidate>
      <div className="grid gap-2">
        <Label htmlFor="name">Name</Label>
        <Input placeholder="Claude Pro" {...fieldA11y('name', errors.name)} {...register('name')} />
        <FieldError id="name-error" message={errors.name?.message} />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="grid gap-2">
          <Label htmlFor="cost">Cost</Label>
          <Input
            type="number"
            step="0.01"
            inputMode="decimal"
            {...fieldA11y('cost', errors.cost)}
            {...register('cost')}
          />
          <FieldError id="cost-error" message={errors.cost?.message} />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="currency">Currency</Label>
          <Controller
            control={control}
            name="currency"
            render={({ field }) => (
              <CurrencySelect
                {...fieldA11y('currency', errors.currency)}
                value={field.value}
                onChange={field.onChange}
              />
            )}
          />
          <FieldError id="currency-error" message={errors.currency?.message} />
        </div>
      </div>

      <div className="grid gap-2">
        <Label htmlFor="billingCycle">Billing cycle</Label>
        <Controller
          control={control}
          name="billingCycle"
          render={({ field }) => (
            <>
              <Select value={field.value} onValueChange={field.onChange}>
                <SelectTrigger id="billingCycle">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="monthly">Monthly</SelectItem>
                  <SelectItem value="quarterly">Quarterly</SelectItem>
                  <SelectItem value="yearly">Yearly</SelectItem>
                  <SelectItem value="custom">Custom</SelectItem>
                </SelectContent>
              </Select>
              {field.value === 'custom' && (
                <p className="text-xs text-muted-foreground">
                  Custom cycles aren&apos;t included in monthly / annual projections — log renewals
                  manually instead.
                </p>
              )}
            </>
          )}
        />
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="grid gap-2">
          <Label htmlFor="subscribedSince">Subscribed since</Label>
          <Input
            type="date"
            {...fieldA11y('subscribedSince', errors.subscribedSince)}
            {...register('subscribedSince')}
          />
          <FieldError id="subscribedSince-error" message={errors.subscribedSince?.message} />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="renewalDate">Next renewal</Label>
          <Input
            type="date"
            {...fieldA11y('renewalDate', errors.renewalDate)}
            {...renewalField}
          />
          <FieldError id="renewalDate-error" message={errors.renewalDate?.message} />
        </div>
      </div>

      <button
        type="button"
        aria-expanded={moreOpen}
        aria-controls="subscription-more"
        onClick={() => setMoreOpen((o) => !o)}
        className="flex items-center justify-between rounded-md border px-3 py-2.5 text-left text-sm font-medium transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <span>
          More options
          <span className="block text-xs font-normal text-muted-foreground">
            Category, website, cancellation link, payment method, trial, notes, alerts
          </span>
        </span>
        <ChevronDown
          className={cn('size-4 shrink-0 transition-transform', moreOpen && 'rotate-180')}
          aria-hidden
        />
      </button>

      {moreOpen && (
        <div id="subscription-more" className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="categoryId">Category</Label>
            <Controller
              control={control}
              name="categoryId"
              render={({ field }) => (
                <CategorySelect
                  id="categoryId"
                  categories={categories}
                  value={field.value}
                  onChange={field.onChange}
                />
              )}
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="website">Website</Label>
            <Input
              placeholder="wsform.com"
              {...fieldA11y('website', errors.website)}
              {...register('website')}
            />
            <FieldError id="website-error" message={errors.website?.message} />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="cancellationUrl">Cancellation URL</Label>
            <Input
              placeholder="https://example.com/account/cancel"
              {...fieldA11y('cancellationUrl', errors.cancellationUrl)}
              aria-describedby={
                errors.cancellationUrl ? 'cancellationUrl-error' : 'cancellationUrl-hint'
              }
              {...register('cancellationUrl')}
            />
            <FieldError id="cancellationUrl-error" message={errors.cancellationUrl?.message} />
            <p id="cancellationUrl-hint" className="text-xs text-muted-foreground">
              Saves a minute of digging when you decide to cancel.
            </p>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="paymentMethod">Payment method</Label>
            <Input
              id="paymentMethod"
              list="payment-methods"
              placeholder="Amex …1234"
              {...register('paymentMethod')}
            />
            <datalist id="payment-methods">
              {paymentMethods.map((pm) => (
                <option key={pm} value={pm} />
              ))}
            </datalist>
          </div>

          <Controller
            control={control}
            name="trial"
            render={({ field }) => {
              const enabled = Boolean(field.value);
              return (
                <div className="grid gap-3 rounded-lg border p-4">
                  <div className="flex items-center justify-between gap-4">
                    <Label htmlFor="trial-on">This is a trial</Label>
                    <Switch
                      id="trial-on"
                      checked={enabled}
                      onCheckedChange={(on) =>
                        field.onChange(on ? { endsAt: todayLocalIso() } : undefined)
                      }
                    />
                  </div>
                  {enabled && (
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <div className="grid gap-1.5">
                        <Label htmlFor="trial-endsAt" className="text-xs">
                          Trial ends
                        </Label>
                        <Input
                          id="trial-endsAt"
                          type="date"
                          value={field.value?.endsAt ?? ''}
                          onChange={(e) =>
                            field.onChange({ ...(field.value ?? {}), endsAt: e.target.value })
                          }
                        />
                      </div>
                      <div className="grid gap-1.5">
                        <Label htmlFor="trial-cost" className="text-xs">
                          Converts to (optional)
                        </Label>
                        <Input
                          id="trial-cost"
                          type="number"
                          step="0.01"
                          inputMode="decimal"
                          value={field.value?.convertsToCost ?? ''}
                          onChange={(e) =>
                            field.onChange({
                              ...(field.value ?? { endsAt: '' }),
                              convertsToCost: e.target.value ? Number(e.target.value) : undefined,
                            })
                          }
                        />
                      </div>
                    </div>
                  )}
                </div>
              );
            }}
          />

          <div className="grid gap-2">
            <Label htmlFor="notes">Notes</Label>
            <Input id="notes" placeholder="Anything to remember" {...register('notes')} />
          </div>

          <div className="grid gap-2">
            <Label id="alerts-label">Alerts</Label>
            <p id="alerts-hint" className="-mt-1 text-xs text-muted-foreground">
              Override the global lead times for this subscription. Leave all off to use the
              global setting.
            </p>
            <Controller
              control={control}
              name="alertConfig"
              render={({ field }) => {
                const selected = new Set(field.value?.daysBefore ?? []);
                const toggle = (d: number): void => {
                  const next = new Set(selected);
                  if (next.has(d)) next.delete(d);
                  else next.add(d);
                  const arr = [...next].sort((a, b) => b - a);
                  field.onChange(arr.length ? { daysBefore: arr } : undefined);
                };
                return (
                  <div
                    role="group"
                    aria-labelledby="alerts-label"
                    aria-describedby="alerts-hint"
                    className="flex flex-wrap gap-2"
                  >
                    {ALERT_DAYS_SUGGESTIONS.map((d) => (
                      <button
                        key={d}
                        type="button"
                        aria-pressed={selected.has(d)}
                        onClick={() => toggle(d)}
                        className={chipClass(selected.has(d))}
                      >
                        {d === 0 ? 'Day of' : `${d}d before`}
                      </button>
                    ))}
                  </div>
                );
              }}
            />
          </div>
        </div>
      )}

      <DialogStickyFooter>
        <Button type="button" variant="outline" onClick={onCancel} disabled={isSubmitting}>
          Cancel
        </Button>
        <Button type="submit" disabled={isSubmitting}>
          {initial ? 'Save changes' : 'Add subscription'}
        </Button>
      </DialogStickyFooter>
    </form>
  );
};
