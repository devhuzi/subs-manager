import { useEffect } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { categoryInputSchema, type CategoryInput } from '../../../shared/schemas';
import type { Category } from '../../../shared/types';
import { Button } from '@renderer/components/ui/button';
import { Input } from '@renderer/components/ui/input';
import { FieldError, fieldA11y } from '@renderer/components/ui/field-error';
import { Label } from '@renderer/components/ui/label';
import { cn } from '@renderer/lib/utils';

const SWATCHES = [
  '#ef4444',
  '#f97316',
  '#eab308',
  '#22c55e',
  '#14b8a6',
  '#3b82f6',
  '#8b5cf6',
  '#ec4899',
  '#64748b',
];

interface Props {
  initial?: Category;
  defaultCurrency: string;
  onSubmit: (input: CategoryInput) => Promise<void> | void;
  onCancel: () => void;
}

const defaultValues = (initial?: Category): CategoryInput => ({
  name: initial?.name ?? '',
  color: initial?.color ?? SWATCHES[5],
  monthlyBudget: initial?.monthlyBudget,
});

export const CategoryForm = ({
  initial,
  defaultCurrency,
  onSubmit,
  onCancel,
}: Props): JSX.Element => {
  const {
    register,
    control,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<CategoryInput>({
    resolver: zodResolver(categoryInputSchema),
    defaultValues: defaultValues(initial),
  });

  useEffect(() => {
    reset(defaultValues(initial));
  }, [initial, reset]);

  const submit = handleSubmit(async (values) => {
    await onSubmit(values);
  });

  return (
    <form onSubmit={submit} className="grid gap-4">
      <div className="grid gap-2">
        <Label htmlFor="cat-name">Name</Label>
        <Input
          placeholder="AI tools"
          {...fieldA11y('cat-name', errors.name)}
          {...register('name')}
        />
        <FieldError id="cat-name-error" message={errors.name?.message} />
      </div>

      <div className="grid gap-2">
        <Label id="cat-color-label">Color</Label>
        <Controller
          control={control}
          name="color"
          render={({ field }) => (
            <div role="group" aria-labelledby="cat-color-label" className="flex flex-wrap gap-2">
              {SWATCHES.map((c) => (
                <button
                  key={c}
                  type="button"
                  aria-label={`Pick ${c}`}
                  aria-pressed={field.value === c}
                  className={cn(
                    'size-9 rounded-full border-2 transition-colors',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
                    field.value === c ? 'border-foreground' : 'border-transparent',
                  )}
                  style={{ backgroundColor: c }}
                  onClick={() => field.onChange(c)}
                />
              ))}
            </div>
          )}
        />
        <FieldError id="cat-color-error" message={errors.color?.message} />
      </div>

      <div className="grid gap-2 md:max-w-xs">
        <Label htmlFor="cat-budget">Monthly budget (optional)</Label>
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">{defaultCurrency}</span>
          <Input
            type="number"
            min={0}
            step="0.01"
            inputMode="decimal"
            placeholder="—"
            {...fieldA11y('cat-budget', errors.monthlyBudget)}
            {...register('monthlyBudget')}
          />
        </div>
        <FieldError id="cat-budget-error" message={errors.monthlyBudget?.message} />
        <p className="text-xs text-muted-foreground">
          The dashboard flags this category when its monthly spend exceeds the budget.
        </p>
      </div>

      <div className="flex justify-end gap-2 pt-2">
        <Button type="button" variant="outline" onClick={onCancel} disabled={isSubmitting}>
          Cancel
        </Button>
        <Button type="submit" disabled={isSubmitting}>
          {initial ? 'Save changes' : 'Add category'}
        </Button>
      </div>
    </form>
  );
};
