import { useEffect, useMemo, useState } from 'react';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import type { AppData, Category } from '../../../shared/types';
import type { CategoryInput } from '../../../shared/schemas';
import { Button } from '@renderer/components/ui/button';
import { IconTooltip } from '@renderer/components/ui/tooltip';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
} from '@renderer/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@renderer/components/ui/dialog';
import { ConfirmDialog } from '@renderer/components/ui/confirm-dialog';
import { CategoryForm } from './CategoryForm';
import { categoryColor } from './CategoryBadge';

interface Props {
  data: AppData;
  onAdd: (input: CategoryInput) => Promise<void>;
  onUpdate: (id: string, input: CategoryInput) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}

export const CategoriesView = ({ data, onAdd, onUpdate, onDelete }: Props): JSX.Element => {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Category | undefined>();

  const sorted = useMemo(
    () => [...data.categories].sort((a, b) => a.name.localeCompare(b.name)),
    [data.categories],
  );

  const usageById = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const s of data.subscriptions)
      if (s.categoryId) counts[s.categoryId] = (counts[s.categoryId] ?? 0) + 1;
    for (const p of data.oneTimePurchases)
      if (p.categoryId) counts[p.categoryId] = (counts[p.categoryId] ?? 0) + 1;
    return counts;
  }, [data.subscriptions, data.oneTimePurchases]);

  useEffect(() => {
    const openAdd = (): void => {
      setEditing(undefined);
      setDialogOpen(true);
    };
    window.addEventListener('app:add', openAdd);
    return () => window.removeEventListener('app:add', openAdd);
  }, []);

  const closeDialog = (): void => {
    setDialogOpen(false);
    setEditing(undefined);
  };

  const handleSubmit = async (input: CategoryInput): Promise<void> => {
    if (editing) await onUpdate(editing.id, input);
    else await onAdd(input);
    closeDialog();
  };

  // A category in use needs confirming: its items lose the link, and Undo
  // restores the category but not those links.
  const [pendingDelete, setPendingDelete] = useState<Category | null>(null);
  const requestDelete = (c: Category): void => {
    if ((usageById[c.id] ?? 0) > 0) setPendingDelete(c);
    else void onDelete(c.id);
  };
  const pendingUsage = pendingDelete ? (usageById[pendingDelete.id] ?? 0) : 0;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:space-y-0">
          <CardDescription>
            Group subscriptions and purchases by type (AI, hosting, design…).
          </CardDescription>
          <Button
            className="self-start sm:self-auto"
            onClick={() => {
              setEditing(undefined);
              setDialogOpen(true);
            }}
          >
            <Plus />
            Add category
          </Button>
        </CardHeader>
        <CardContent>
          {sorted.length === 0 ? (
            <div className="rounded-md border border-dashed py-12 text-center text-muted-foreground">
              No categories yet. Use <span className="font-medium">Add category</span> to create
              one.
            </div>
          ) : (
            <ul className="divide-y">
              {sorted.map((c) => {
                const used = usageById[c.id] ?? 0;
                return (
                  <li key={c.id} className="flex items-center gap-3 py-3">
                    <span
                      className="size-4 shrink-0 rounded-full"
                      style={{ backgroundColor: categoryColor(c) }}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-medium">{c.name}</div>
                      <div className="text-xs text-muted-foreground">
                        Used by {used} {used === 1 ? 'item' : 'items'}
                      </div>
                    </div>
                    <IconTooltip label="Edit">
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={`Edit ${c.name}`}
                        onClick={() => {
                          setEditing(c);
                          setDialogOpen(true);
                        }}
                      >
                        <Pencil />
                      </Button>
                    </IconTooltip>
                    <IconTooltip label="Delete">
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={`Delete ${c.name}`}
                        onClick={() => requestDelete(c)}
                      >
                        <Trash2 />
                      </Button>
                    </IconTooltip>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>

      <Dialog
        open={dialogOpen}
        onOpenChange={(open) => (open ? setDialogOpen(true) : closeDialog())}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? 'Edit category' : 'New category'}</DialogTitle>
            <DialogDescription>
              Name and color. Categories appear in subscription and purchase forms.
            </DialogDescription>
          </DialogHeader>
          <CategoryForm
            initial={editing}
            defaultCurrency={data.preferences.defaultCurrency}
            onSubmit={handleSubmit}
            onCancel={closeDialog}
          />
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={pendingDelete !== null}
        onOpenChange={(open) => !open && setPendingDelete(null)}
        title={`Delete “${pendingDelete?.name ?? ''}”?`}
        description={
          <p>
            It’s used by {pendingUsage} {pendingUsage === 1 ? 'item' : 'items'}. Those items will
            be left without a category, and undoing the delete won’t re-link them.
          </p>
        }
        confirmLabel="Delete category"
        destructive
        onConfirm={async () => {
          if (pendingDelete) await onDelete(pendingDelete.id);
        }}
      />
    </div>
  );
};
