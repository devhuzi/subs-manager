import { forwardRef, type ButtonHTMLAttributes, type HTMLAttributes } from 'react';
import { cn } from '@renderer/lib/utils';

/** Desktop (lg+) navigation column. Below lg the bottom tab bar takes over. */
export const Sidebar = forwardRef<HTMLElement, HTMLAttributes<HTMLElement>>(
  ({ className, ...props }, ref) => (
    <aside
      ref={ref}
      className={cn(
        'hidden h-dvh w-60 shrink-0 flex-col border-r bg-sidebar text-sidebar-foreground lg:flex',
        className,
      )}
      {...props}
    />
  ),
);
Sidebar.displayName = 'Sidebar';

export const SidebarHeader = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn('px-5 pb-3 pt-6', className)} {...props} />
  ),
);
SidebarHeader.displayName = 'SidebarHeader';

export const SidebarNav = forwardRef<HTMLElement, HTMLAttributes<HTMLElement>>(
  ({ className, ...props }, ref) => (
    <nav
      ref={ref}
      className={cn('flex flex-1 flex-col gap-0.5 overflow-y-auto px-3 py-2', className)}
      {...props}
    />
  ),
);
SidebarNav.displayName = 'SidebarNav';

export const SidebarFooter = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn('mt-auto px-3 pb-4 pt-2', className)} {...props} />
  ),
);
SidebarFooter.displayName = 'SidebarFooter';

interface SidebarItemProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  active?: boolean;
}

export const SidebarItem = forwardRef<HTMLButtonElement, SidebarItemProps>(
  ({ active, className, children, ...props }, ref) => (
    <button
      ref={ref}
      type="button"
      aria-current={active ? 'page' : undefined}
      className={cn(
        'group flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        '[&_svg]:size-4 [&_svg]:shrink-0 [&_svg]:opacity-70',
        active
          ? 'bg-sidebar-accent text-foreground [&_svg]:opacity-100'
          : 'text-muted-foreground hover:bg-sidebar-accent/60 hover:text-foreground',
        className,
      )}
      {...props}
    >
      {children}
    </button>
  ),
);
SidebarItem.displayName = 'SidebarItem';
