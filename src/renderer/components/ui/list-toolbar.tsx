import { forwardRef, type ReactNode } from 'react';
import { Search } from 'lucide-react';
import { Input } from '@renderer/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@renderer/components/ui/select';
import { cn } from '@renderer/lib/utils';

export interface SelectOption {
  value: string;
  label: string;
}

interface ListToolbarProps {
  search: string;
  onSearch: (v: string) => void;
  searchPlaceholder?: string;
  /** Filter dropdowns rendered between search and sort. */
  children?: ReactNode;
  className?: string;
}

/**
 * A search input (forwarded ref for `/`-to-focus) plus a slot for filter and
 * sort selects. Shared by the Subscriptions and Purchases lists.
 */
export const ListToolbar = forwardRef<HTMLInputElement, ListToolbarProps>(
  ({ search, onSearch, searchPlaceholder = 'Search…', children, className }, ref) => (
    <div className={cn('flex flex-wrap items-center gap-2', className)}>
      <div className="relative w-full min-w-0 sm:w-auto sm:flex-1 sm:max-w-xs">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          ref={ref}
          value={search}
          onChange={(e) => onSearch(e.target.value)}
          placeholder={searchPlaceholder}
          aria-label={searchPlaceholder.replace(/…$/, '')}
          className="pl-8"
        />
      </div>
      {children}
    </div>
  ),
);
ListToolbar.displayName = 'ListToolbar';

interface FilterSelectProps {
  value: string;
  onChange: (v: string) => void;
  options: SelectOption[];
  /**
   * Adds a leading "all" option (value "") with this label, e.g. "All
   * categories". Omit for a plain choice such as a sort order.
   */
  allLabel?: string;
  ariaLabel: string;
}

/** A compact filter / sort `<Select>`. */
export const FilterSelect = ({
  value,
  onChange,
  options,
  allLabel,
  ariaLabel,
}: FilterSelectProps): JSX.Element => (
  <Select
    value={allLabel ? value || '__all__' : value}
    onValueChange={(v) => onChange(v === '__all__' ? '' : v)}
  >
    <SelectTrigger className="h-10 w-auto min-w-[8rem] gap-1" aria-label={ariaLabel}>
      <SelectValue />
    </SelectTrigger>
    <SelectContent>
      {allLabel && <SelectItem value="__all__">{allLabel}</SelectItem>}
      {options.map((o) => (
        <SelectItem key={o.value} value={o.value}>
          {o.label}
        </SelectItem>
      ))}
    </SelectContent>
  </Select>
);

interface SegmentedPillsProps {
  value: string;
  onChange: (v: string) => void;
  /** Include the "all" choice as an option with value "". */
  options: SelectOption[];
  ariaLabel: string;
}

/**
 * Rounded pill toggle group for a small fixed set of filters; the active
 * pill fills with the brand color. For variable-length sets (categories,
 * payment methods) prefer `FilterSelect`.
 */
export const SegmentedPills = ({
  value,
  onChange,
  options,
  ariaLabel,
}: SegmentedPillsProps): JSX.Element => (
  <div role="group" aria-label={ariaLabel} className="flex flex-wrap items-center gap-1.5">
    {options.map((o) => {
      const active = value === o.value;
      return (
        <button
          key={o.value || '__all__'}
          type="button"
          aria-pressed={active}
          onClick={() => onChange(o.value)}
          className={cn(
            'rounded-full px-3 py-2 text-sm font-medium transition-colors',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
            active
              ? 'bg-primary text-primary-foreground'
              : 'bg-muted text-muted-foreground hover:text-foreground',
          )}
        >
          {o.label}
        </button>
      );
    })}
  </div>
);
