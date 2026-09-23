import { useEffect } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { oneTimePurchaseInputSchema, type OneTimePurchaseInput } from '../../../shared/schemas';
import type { Category, OneTimePurchase } from '../../../shared/types';
import { todayLocalIso } from '../../../shared/dates';
import { Button } from '@renderer/components/ui/button';
import { DialogStickyFooter } from '@renderer/components/ui/dialog';
import { FieldError, fieldA11y } from '@renderer/components/ui/field-error';
import { CurrencySelect } from '@renderer/components/currency-select';
import { Input } from '@renderer/components/ui/input';
import { Label } from '@renderer/components/ui/label';
import { CategorySelect } from '../categories/CategorySelect';

interface Props {
  initial?: OneTimePurchase;
  categories: Category[];
  defaultCurrency: string;
  paymentMethods: string[];
  onSubmit: (input: OneTimePurchaseInput) => Promise<void> | void;
  onCancel: () => void;
}

const today = (): string => todayLocalIso();

const defaultValues = (
  initial: OneTimePurchase | undefined,
  defaultCurrency: string,
): OneTimePurchaseInput => ({
  name: initial?.name ?? '',
  cost: initial?.cost ?? 0,
  currency: initial?.currency ?? defaultCurrency,
  purchaseDate: initial?.purchaseDate ?? today(),
  categoryId: initial?.categoryId,
  website: initial?.website,
  notes: initial?.notes,
  warrantyEndsAt: initial?.warrantyEndsAt,
  supportEndsAt: initial?.supportEndsAt,
  expectedLifespanMonths: initial?.expectedLifespanMonths,
  paymentMethod: initial?.paymentMethod,
  brandColor: initial?.brandColor,
});

export const PurchaseForm = ({
  initial,
  categories,
  defaultCurrency,
  paymentMethods,
  onSubmit,
  onCancel,
}: Props): JSX.Element => {
  const {
    register,
    control,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<OneTimePurchaseInput>({
    resolver: zodResolver(oneTimePurchaseInputSchema),
    defaultValues: defaultValues(initial, defaultCurrency),
  });

  useEffect(() => {
    reset(defaultValues(initial, defaultCurrency));
  }, [initial, defaultCurrency, reset]);

  const submit = handleSubmit(async (values) => {
    await onSubmit(values);
  });

  return (
    <form onSubmit={submit} className="grid gap-4" noValidate>
      <div className="grid gap-2">
        <Label htmlFor="p-name">Name</Label>
        <Input
          placeholder="Sublime Text license"
          {...fieldA11y('p-name', errors.name)}
          {...register('name')}
        />
        <FieldError id="p-name-error" message={errors.name?.message} />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="grid gap-2">
          <Label htmlFor="p-cost">Cost</Label>
          <Input
            type="number"
            step="0.01"
            inputMode="decimal"
            {...fieldA11y('p-cost', errors.cost)}
            {...register('cost')}
          />
          <FieldError id="p-cost-error" message={errors.cost?.message} />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="p-currency">Currency</Label>
          <Controller
            control={control}
            name="currency"
            render={({ field }) => (
              <CurrencySelect
                {...fieldA11y('p-currency', errors.currency)}
                value={field.value}
                onChange={field.onChange}
              />
            )}
          />
          <FieldError id="p-currency-error" message={errors.currency?.message} />
        </div>
      </div>

      <div className="grid gap-2">
        <Label htmlFor="p-date">Purchase date</Label>
        <Input
          type="date"
          {...fieldA11y('p-date', errors.purchaseDate)}
          {...register('purchaseDate')}
        />
        <FieldError id="p-date-error" message={errors.purchaseDate?.message} />
      </div>

      <div className="grid gap-2">
        <Label htmlFor="p-category">Category</Label>
        <Controller
          control={control}
          name="categoryId"
          render={({ field }) => (
            <CategorySelect
              id="p-category"
              categories={categories}
              value={field.value}
              onChange={field.onChange}
            />
          )}
        />
      </div>

      <div className="grid gap-2">
        <Label htmlFor="p-website">Website (optional)</Label>
        <Input
          placeholder="sublimetext.com"
          {...fieldA11y('p-website', errors.website)}
          {...register('website')}
        />
        <FieldError id="p-website-error" message={errors.website?.message} />
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="grid gap-2">
          <Label htmlFor="p-warranty">Warranty ends (optional)</Label>
          <Input id="p-warranty" type="date" {...register('warrantyEndsAt')} />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="p-support">Support ends (optional)</Label>
          <Input id="p-support" type="date" {...register('supportEndsAt')} />
        </div>
      </div>

      <div className="grid gap-2 md:max-w-xs">
        <Label htmlFor="p-lifespan">Expected lifespan (months)</Label>
        <Input
          type="number"
          min={1}
          max={600}
          placeholder="36"
          {...fieldA11y('p-lifespan', errors.expectedLifespanMonths)}
          {...register('expectedLifespanMonths')}
        />
        <FieldError id="p-lifespan-error" message={errors.expectedLifespanMonths?.message} />
        <p className="text-xs text-muted-foreground">
          Used to amortize the cost into a comparable monthly figure. Defaults to 36 if unset.
        </p>
      </div>

      <div className="grid gap-2">
        <Label htmlFor="p-payment">Payment method (optional)</Label>
        <Input
          id="p-payment"
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

      <div className="grid gap-2">
        <Label htmlFor="p-notes">Notes (optional)</Label>
        <Input id="p-notes" placeholder="Anything to remember" {...register('notes')} />
      </div>

      <DialogStickyFooter>
        <Button type="button" variant="outline" onClick={onCancel} disabled={isSubmitting}>
          Cancel
        </Button>
        <Button type="submit" disabled={isSubmitting}>
          {initial ? 'Save changes' : 'Add purchase'}
        </Button>
      </DialogStickyFooter>
    </form>
  );
};
