import type { Category } from '../../../shared/types';

/** A category's dot color; uncolored categories use the neutral chart tone. */
export const categoryColor = (category: Category): string =>
  category.color ?? 'hsl(var(--chart-4))';

interface Props {
  category?: Category;
}

export const CategoryBadge = ({ category }: Props): JSX.Element => {
  if (!category) return <span className="text-xs text-muted-foreground">—</span>;
  return (
    <span className="inline-flex max-w-full items-center gap-1.5 rounded-full border bg-background px-2 py-0.5 text-xs">
      <span
        className="size-2 shrink-0 rounded-full"
        style={{ backgroundColor: categoryColor(category) }}
        aria-hidden
      />
      <span className="truncate">{category.name}</span>
    </span>
  );
};
