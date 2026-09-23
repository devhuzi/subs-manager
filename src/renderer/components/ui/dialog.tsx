import {
  forwardRef,
  useCallback,
  useEffect,
  useState,
  type ComponentPropsWithoutRef,
  type ElementRef,
  type HTMLAttributes,
  type MutableRefObject,
} from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { cn } from '@renderer/lib/utils';

export const Dialog = DialogPrimitive.Root;
export const DialogTrigger = DialogPrimitive.Trigger;
export const DialogPortal = DialogPrimitive.Portal;
export const DialogClose = DialogPrimitive.Close;

export const DialogOverlay = forwardRef<
  ElementRef<typeof DialogPrimitive.Overlay>,
  ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Overlay
    ref={ref}
    className={cn(
      'fixed inset-0 z-50 bg-black/60 backdrop-blur-sm data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0',
      className,
    )}
    {...props}
  />
));
DialogOverlay.displayName = DialogPrimitive.Overlay.displayName;

export const DialogContent = forwardRef<
  ElementRef<typeof DialogPrimitive.Content>,
  ComponentPropsWithoutRef<typeof DialogPrimitive.Content>
>(({ className, children, ...props }, ref) => {
  // Track the content node in STATE (not a ref) so the keyboard effect re-runs
  // the instant the sheet mounts. A ref read inside the effect is null on the
  // first pass, which silently skipped attaching the listener — the original bug.
  const [contentEl, setContentEl] =
    useState<ElementRef<typeof DialogPrimitive.Content> | null>(null);

  const setRefs = useCallback(
    (node: ElementRef<typeof DialogPrimitive.Content> | null): void => {
      setContentEl(node);
      if (typeof ref === 'function') ref(node);
      else if (ref) (ref as MutableRefObject<typeof node>).current = node;
    },
    [ref],
  );

  // Keep the mobile bottom-sheet above the on-screen keyboard. iOS Safari ignores
  // `interactive-widget=resizes-content`, so a short sheet pinned to bottom-0
  // (e.g. the category form) gets buried under the keyboard. Track the
  // VisualViewport and expose the covered height as --kb-inset; the mobile
  // `bottom` and `max-height` below consume it (desktop ignores it).
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv || !contentEl) return;
    const phone = window.matchMedia('(max-width: 639px)');
    const update = (): void => {
      const inset = phone.matches
        ? Math.max(0, window.innerHeight - vv.height - vv.offsetTop)
        : 0;
      contentEl.style.setProperty('--kb-inset', `${inset}px`);
    };
    update();
    vv.addEventListener('resize', update);
    vv.addEventListener('scroll', update);
    window.addEventListener('resize', update);
    return () => {
      vv.removeEventListener('resize', update);
      vv.removeEventListener('scroll', update);
      window.removeEventListener('resize', update);
    };
  }, [contentEl]);

  return (
  <DialogPortal>
    <DialogOverlay />
    <DialogPrimitive.Content
      ref={setRefs}
      className={cn(
        'fixed z-50 flex flex-col border bg-background shadow-lg duration-200',
        'data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=open]:fade-in-0 data-[state=closed]:fade-out-0',
        // Mobile: full-width bottom sheet that slides up. Use svh (not dvh) so the
        // sheet height stays stable when the iOS address bar shows/hides instead
        // of jumping ("shaky") as you scroll the form. --kb-inset (set above)
        // lifts the sheet above the on-screen keyboard and shrinks it to match.
        'inset-x-0 bottom-[var(--kb-inset,0px)] max-h-[calc(100svh-2rem-var(--kb-inset,0px))] rounded-t-[var(--radius-card)]',
        'max-sm:data-[state=open]:slide-in-from-bottom max-sm:data-[state=closed]:slide-out-to-bottom',
        // Desktop (sm+): centered modal. The from-left-1/2 / from-top-[48%]
        // pre-compensate the static -50% centering transform so the zoom
        // entrance doesn't slide in from off-center (the shadcn dialog trick).
        'sm:inset-x-auto sm:bottom-auto sm:left-1/2 sm:top-1/2 sm:max-h-[calc(100svh-2rem)] sm:w-[calc(100vw-2rem)] sm:max-w-lg sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-lg',
        'sm:data-[state=open]:zoom-in-95 sm:data-[state=closed]:zoom-out-95 sm:data-[state=open]:slide-in-from-left-1/2 sm:data-[state=open]:slide-in-from-top-[48%] sm:data-[state=closed]:slide-out-to-left-1/2 sm:data-[state=closed]:slide-out-to-top-[48%]',
        className,
      )}
      {...props}
    >
      {/* Grab handle — the sheet affordance on mobile. */}
      <div className="mx-auto mt-2.5 h-1.5 w-10 shrink-0 rounded-full bg-muted sm:hidden" />
      <div className="grid gap-4 overflow-y-auto overscroll-contain p-6 max-sm:pb-[calc(env(safe-area-inset-bottom)+1.5rem)] max-sm:pt-4">
        {children}
      </div>
      {/* 44px target; the icon stays small and sits where the old 16px close did. */}
      <DialogPrimitive.Close className="absolute right-1.5 top-1.5 inline-flex size-11 items-center justify-center rounded-md text-muted-foreground ring-offset-background transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none">
        <X className="size-4" />
        <span className="sr-only">Close</span>
      </DialogPrimitive.Close>
    </DialogPrimitive.Content>
  </DialogPortal>
  );
});
DialogContent.displayName = DialogPrimitive.Content.displayName;

export const DialogHeader = ({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>): JSX.Element => (
  <div className={cn('flex flex-col space-y-1.5 text-center sm:text-left', className)} {...props} />
);
DialogHeader.displayName = 'DialogHeader';

export const DialogFooter = ({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>): JSX.Element => (
  <div
    className={cn(
      'flex flex-col-reverse gap-2 sm:flex-row sm:justify-end sm:space-x-2 sm:gap-0',
      className,
    )}
    {...props}
  />
);
DialogFooter.displayName = 'DialogFooter';

/**
 * Form actions pinned to the bottom of a DialogContent while its body
 * scrolls, so Save/Cancel stay in reach on a tall bottom sheet. The negative
 * margins cancel DialogContent's padding so the bar spans the sheet edge to edge.
 */
export const DialogStickyFooter = ({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>): JSX.Element => (
  <div
    className={cn(
      'sticky bottom-0 z-10 -mx-6 flex justify-end gap-2 border-t bg-background px-6 py-3',
      '-mb-[calc(env(safe-area-inset-bottom)+1.5rem)] pb-[calc(env(safe-area-inset-bottom)+0.75rem)] sm:-mb-6 sm:pb-3',
      className,
    )}
    {...props}
  />
);
DialogStickyFooter.displayName = 'DialogStickyFooter';

export const DialogTitle = forwardRef<
  ElementRef<typeof DialogPrimitive.Title>,
  ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Title
    ref={ref}
    className={cn('text-lg font-semibold leading-none tracking-tight', className)}
    {...props}
  />
));
DialogTitle.displayName = DialogPrimitive.Title.displayName;

export const DialogDescription = forwardRef<
  ElementRef<typeof DialogPrimitive.Description>,
  ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Description
    ref={ref}
    className={cn('text-sm text-muted-foreground', className)}
    {...props}
  />
));
DialogDescription.displayName = DialogPrimitive.Description.displayName;
