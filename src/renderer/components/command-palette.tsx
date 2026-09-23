import { useEffect } from 'react';
import { Command } from 'cmdk';
import {
  LayoutDashboard,
  Receipt,
  Repeat,
  Search,
  Settings as SettingsIcon,
  Tags,
} from 'lucide-react';
import type { AppData } from '../../shared/types';
import { Dialog, DialogContent, DialogTitle } from '@renderer/components/ui/dialog';
import { ServiceAvatar } from '@renderer/components/ui/service-avatar';
import { formatCurrency } from '@renderer/lib/money';
import { cn } from '@renderer/lib/utils';

interface View {
  id: 'dashboard' | 'subscriptions' | 'purchases' | 'categories' | 'settings';
  label: string;
  icon: JSX.Element;
}

const NAV: View[] = [
  { id: 'dashboard', label: 'Dashboard', icon: <LayoutDashboard /> },
  { id: 'subscriptions', label: 'Subscriptions', icon: <Repeat /> },
  { id: 'purchases', label: 'Purchases', icon: <Receipt /> },
  { id: 'categories', label: 'Categories', icon: <Tags /> },
  { id: 'settings', label: 'Settings', icon: <SettingsIcon /> },
];

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  data: AppData | null;
  onNavigate: (view: View['id']) => void;
}

const itemClass =
  'flex items-center gap-3 rounded-md px-3 py-2 text-sm cursor-pointer aria-selected:bg-accent aria-selected:text-accent-foreground [&_svg]:size-4 [&_svg]:shrink-0 [&_svg]:text-muted-foreground aria-selected:[&_svg]:text-foreground';

const groupClass = '[&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wide [&_[cmdk-group-heading]]:text-muted-foreground';

export const CommandPalette = ({
  open,
  onOpenChange,
  data,
  onNavigate,
}: Props): JSX.Element => {
  // Global Cmd/Ctrl+K binding
  useEffect(() => {
    const handler = (e: KeyboardEvent): void => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        onOpenChange(!open);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onOpenChange]);

  const fire = (id: View['id']): void => {
    onNavigate(id);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="overflow-hidden p-0">
        <DialogTitle className="sr-only">Command palette</DialogTitle>
        <Command className={cn('flex flex-col', groupClass)} loop>
          <div className="flex items-center gap-2 border-b px-3">
            <Search className="size-4 shrink-0 text-muted-foreground" />
            <Command.Input
              placeholder="Search or jump to…"
              className="flex h-12 w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            />
          </div>
          <Command.List className="max-h-80 overflow-y-auto p-2">
            <Command.Empty className="py-6 text-center text-sm text-muted-foreground">
              Nothing matched that.
            </Command.Empty>
            <Command.Group heading="Navigate">
              {NAV.map((n) => (
                <Command.Item
                  key={n.id}
                  className={itemClass}
                  onSelect={() => fire(n.id)}
                  value={`nav ${n.label}`}
                >
                  {n.icon}
                  <span>{n.label}</span>
                </Command.Item>
              ))}
            </Command.Group>
            {data && data.subscriptions.length > 0 && (
              <Command.Group heading="Subscriptions">
                {data.subscriptions.map((s) => (
                  <Command.Item
                    key={s.id}
                    className={itemClass}
                    onSelect={() => fire('subscriptions')}
                    value={`sub ${s.name} ${s.notes ?? ''} ${s.id}`}
                  >
                    <ServiceAvatar
                      name={s.name}
                      logoUrl={s.logoUrl}
                      brandColor={s.brandColor}
                      size="sm"
                    />
                    <span className="flex-1">{s.name}</span>
                    <span className="text-xs text-muted-foreground tabular-nums">
                      {formatCurrency(s.cost, s.currency)}
                    </span>
                  </Command.Item>
                ))}
              </Command.Group>
            )}
            {data && data.oneTimePurchases.length > 0 && (
              <Command.Group heading="Purchases">
                {data.oneTimePurchases.map((p) => (
                  <Command.Item
                    key={p.id}
                    className={itemClass}
                    onSelect={() => fire('purchases')}
                    value={`purchase ${p.name} ${p.notes ?? ''} ${p.id}`}
                  >
                    <ServiceAvatar
                      name={p.name}
                      logoUrl={p.logoUrl}
                      brandColor={p.brandColor}
                      size="sm"
                    />
                    <span className="flex-1">{p.name}</span>
                    <span className="text-xs text-muted-foreground tabular-nums">
                      {formatCurrency(p.cost, p.currency)}
                    </span>
                  </Command.Item>
                ))}
              </Command.Group>
            )}
          </Command.List>
          <div className="border-t px-3 py-2 text-xs text-muted-foreground">
            <kbd className="rounded border bg-muted px-1.5 py-0.5 font-mono">↵</kbd> to jump ·
            <kbd className="ml-1 rounded border bg-muted px-1.5 py-0.5 font-mono">Esc</kbd> to close
          </div>
        </Command>
      </DialogContent>
    </Dialog>
  );
};
