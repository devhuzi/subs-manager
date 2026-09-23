import { useState, type ReactNode } from 'react';
import { MoreHorizontal, Plus } from 'lucide-react';
import { Button } from '@renderer/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
} from '@renderer/components/ui/card';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@renderer/components/ui/dropdown-menu';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@renderer/components/ui/table';
import { cn } from '@renderer/lib/utils';

export interface ListColumn<T> {
  header: ReactNode;
  cell: (item: T) => ReactNode;
  className?: string;
}

interface ListViewProps<T extends { id: string; name: string }> {
  /** One line under the page title, beside the add button. */
  description: string;
  addLabel: string;
  onAdd: () => void;
  /** Stat tiles above the list. */
  stats: ReactNode;
  /** Every item (drives the empty state) and the filtered, sorted subset shown. */
  items: T[];
  visible: T[];
  emptyText: string;
  noMatchText: string;
  /** Search + filters (a ListToolbar). */
  toolbar: ReactNode;
  /** Leading visual (avatar) beside the name, in both layouts. */
  renderAvatar: (item: T) => ReactNode;
  /** Secondary line under the name, in both layouts. */
  renderSubtitle?: (item: T) => ReactNode;
  /** Desktop table columns after Name (and before the actions menu). */
  columns: Array<ListColumn<T>>;
  /** Mobile card body, below the card's name row. */
  renderCard: (item: T) => ReactNode;
  /** DropdownMenuItems for the row's overflow menu. */
  rowActions: (item: T) => ReactNode;
  /** Opens the item (details or edit): the name button, or a click anywhere on the row. */
  onOpen: (item: T) => void;
  dimmed?: (item: T) => boolean;
  /** Bulk actions for the current selection; call `clear` once done. */
  bulkActions: (ids: string[], clear: () => void) => ReactNode;
}

/** Clicks on controls inside a row must not also open the row. */
const stop = { onClick: (e: { stopPropagation: () => void }) => e.stopPropagation() };

const SelectBox = ({
  checked,
  onChange,
  label,
}: {
  checked: boolean | 'mixed';
  onChange: (next: boolean) => void;
  label: string;
}): JSX.Element => (
  // The label is the 44px hit area; the native checkbox inside stays small.
  <label
    className="-m-3 inline-flex size-11 shrink-0 cursor-pointer items-center justify-center"
    {...stop}
  >
    <input
      type="checkbox"
      className="size-4 cursor-pointer accent-[hsl(var(--primary))]"
      checked={checked === true}
      ref={(el) => {
        if (el) el.indeterminate = checked === 'mixed';
      }}
      onChange={(e) => onChange(e.target.checked)}
      aria-label={label}
    />
  </label>
);

/**
 * The shared scaffold for the Subscriptions and Purchases screens: stat row,
 * a card with title + add button, toolbar, bulk-action bar, a card list on
 * narrow screens and a table on wide ones. Rows open on click (keyboard: the
 * name is a button); secondary actions live in an overflow menu.
 */
export const ListView = <T extends { id: string; name: string }>({
  description,
  addLabel,
  onAdd,
  stats,
  items,
  visible,
  emptyText,
  noMatchText,
  toolbar,
  renderAvatar,
  renderSubtitle,
  columns,
  renderCard,
  rowActions,
  onOpen,
  dimmed,
  bulkActions,
}: ListViewProps<T>): JSX.Element => {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  // Only rows on screen count, so a filter change can't act on hidden items.
  const selectedIds = visible.filter((i) => selected.has(i.id)).map((i) => i.id);
  const allSelected = visible.length > 0 && selectedIds.length === visible.length;
  const clear = (): void => setSelected(new Set());
  const toggle = (id: string, on: boolean): void =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });

  const menu = (item: T): JSX.Element => (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label={`More actions for ${item.name}`} {...stop}>
          <MoreHorizontal />
        </Button>
      </DropdownMenuTrigger>
      {/* Portaled, but React events still bubble to the row — stop them. */}
      <DropdownMenuContent {...stop}>{rowActions(item)}</DropdownMenuContent>
    </DropdownMenu>
  );

  const name = (item: T): JSX.Element => (
    <div className="min-w-0 flex-1">
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onOpen(item);
        }}
        className="block max-w-full truncate rounded-sm text-left font-medium text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {item.name}
      </button>
      {renderSubtitle && (
        <div className="truncate text-xs text-muted-foreground">{renderSubtitle(item)}</div>
      )}
    </div>
  );

  return (
    <div className="space-y-6">
      {stats}

      <Card>
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:space-y-0">
          <CardDescription>{description}</CardDescription>
          <Button className="self-start sm:self-auto" onClick={onAdd}>
            <Plus />
            {addLabel}
          </Button>
        </CardHeader>
        <CardContent>
          {items.length === 0 ? (
            <div className="rounded-md border border-dashed py-12 text-center text-sm text-muted-foreground">
              {emptyText}
            </div>
          ) : (
            <>
              {toolbar}

              {selectedIds.length > 0 && (
                <div
                  role="region"
                  aria-label="Bulk actions"
                  className="sticky top-2 z-10 mt-4 flex flex-wrap items-center gap-2 rounded-lg border bg-card p-2 shadow-sm"
                >
                  <span className="px-2 text-sm font-medium tabular-nums">
                    {selectedIds.length} selected
                  </span>
                  {!allSelected && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setSelected(new Set(visible.map((i) => i.id)))}
                    >
                      Select all {visible.length}
                    </Button>
                  )}
                  <div className="flex flex-wrap items-center gap-2 sm:ml-auto">
                    {bulkActions(selectedIds, clear)}
                    <Button variant="ghost" size="sm" onClick={clear}>
                      Clear
                    </Button>
                  </div>
                </div>
              )}

              {visible.length === 0 ? (
                <div className="mt-4 rounded-md border border-dashed py-10 text-center text-sm text-muted-foreground">
                  {noMatchText}
                </div>
              ) : (
                <>
                  {/* Narrow: one card per item. */}
                  <ul className="mt-4 space-y-3 lg:hidden">
                    {visible.map((item) => (
                      <li
                        key={item.id}
                        onClick={() => onOpen(item)}
                        className={cn(
                          'cursor-pointer rounded-[var(--radius-card)] border p-4 transition-colors hover:bg-muted/40',
                          selected.has(item.id) && 'border-primary/60 bg-primary/5',
                          dimmed?.(item) && 'text-muted-foreground',
                        )}
                      >
                        <div className="flex items-center gap-3">
                          <SelectBox
                            checked={selected.has(item.id)}
                            onChange={(on) => toggle(item.id, on)}
                            label={`Select ${item.name}`}
                          />
                          {renderAvatar(item)}
                          {name(item)}
                          {menu(item)}
                        </div>
                        {renderCard(item)}
                      </li>
                    ))}
                  </ul>

                  {/* Wide: a table. */}
                  <div className="mt-4 hidden lg:block">
                    <Table>
                      <TableHeader>
                        <TableRow className="hover:bg-transparent">
                          <TableHead className="w-12 pr-0">
                            <SelectBox
                              checked={
                                allSelected ? true : selectedIds.length > 0 ? 'mixed' : false
                              }
                              onChange={(on) =>
                                setSelected(on ? new Set(visible.map((i) => i.id)) : new Set())
                              }
                              label="Select all"
                            />
                          </TableHead>
                          <TableHead>Name</TableHead>
                          {columns.map((c, i) => (
                            <TableHead key={i} className={c.className}>
                              {c.header}
                            </TableHead>
                          ))}
                          <TableHead className="w-14">
                            <span className="sr-only">Actions</span>
                          </TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {visible.map((item) => (
                          <TableRow
                            key={item.id}
                            onClick={() => onOpen(item)}
                            data-state={selected.has(item.id) ? 'selected' : undefined}
                            className={cn(
                              'cursor-pointer',
                              dimmed?.(item) && 'text-muted-foreground',
                            )}
                          >
                            <TableCell className="pr-0">
                              <SelectBox
                                checked={selected.has(item.id)}
                                onChange={(on) => toggle(item.id, on)}
                                label={`Select ${item.name}`}
                              />
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-3">
                                {renderAvatar(item)}
                                {name(item)}
                              </div>
                            </TableCell>
                            {columns.map((c, i) => (
                              <TableCell key={i} className={c.className}>
                                {c.cell(item)}
                              </TableCell>
                            ))}
                            <TableCell className="text-right">{menu(item)}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
};
