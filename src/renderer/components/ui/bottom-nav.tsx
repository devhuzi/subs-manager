import { cn } from '@renderer/lib/utils';

export interface BottomNavItem<Id extends string> {
  id: Id;
  label: string;
  /** Visible tab caption when `label` is too long for a phone tab. */
  shortLabel?: string;
  icon: JSX.Element;
}

interface BottomNavProps<Id extends string> {
  items: Array<BottomNavItem<Id>>;
  active: Id;
  onNavigate: (id: Id) => void;
}

/**
 * Floating "island" bottom tab bar (mobile only): icon over a text label for
 * each view. Shape (radius / inset / flush-vs-floating) is driven by the
 * active layout variation's CSS tokens via the `.bottom-nav-bar` class.
 */
export const BottomNav = <Id extends string>({
  items,
  active,
  onNavigate,
}: BottomNavProps<Id>): JSX.Element => (
  <nav
    aria-label="Primary"
    className="bottom-nav-bar fixed inset-x-0 bottom-0 z-30 flex items-stretch justify-between border bg-card/95 px-1 py-1.5 shadow-lg backdrop-blur lg:hidden"
  >
    {items.map((item) => {
      const isActive = item.id === active;
      return (
        <button
          key={item.id}
          type="button"
          aria-label={item.label}
          aria-current={isActive ? 'page' : undefined}
          onClick={() => onNavigate(item.id)}
          className={cn(
            'flex min-h-11 min-w-0 flex-1 flex-col items-center justify-center gap-0.5 rounded-lg py-1 text-xs transition-colors',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
            isActive ? 'font-medium text-foreground' : 'text-muted-foreground hover:text-foreground',
          )}
        >
          <span
            className={cn(
              'flex h-7 w-12 items-center justify-center rounded-full transition-colors [&_svg]:size-5',
              isActive && 'bg-primary/15 text-primary',
            )}
            aria-hidden
          >
            {item.icon}
          </span>
          <span className="max-w-full truncate" aria-hidden>
            {item.shortLabel ?? item.label}
          </span>
        </button>
      );
    })}
  </nav>
);
