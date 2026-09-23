import { useEffect, useState, type ReactNode } from 'react';
import { Button } from '@renderer/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@renderer/components/ui/dialog';
import { Input } from '@renderer/components/ui/input';
import { Label } from '@renderer/components/ui/label';

interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: ReactNode;
  confirmLabel: string;
  /** Busy label while `onConfirm` runs, e.g. "Deleting…". */
  workingLabel?: string;
  /** Styles the confirm button as destructive. */
  destructive?: boolean;
  /** When set, the user must type this word before confirming. */
  confirmWord?: string;
  /** Closes the dialog on success; throw to keep it open. */
  onConfirm: () => Promise<void> | void;
}

/**
 * The one confirmation pattern for irreversible actions (replace-all import,
 * category delete, reset / account deletion). Reversible ones use an undo toast
 * instead.
 */
export const ConfirmDialog = ({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  workingLabel,
  destructive = false,
  confirmWord,
  onConfirm,
}: ConfirmDialogProps): JSX.Element => {
  const [typed, setTyped] = useState('');
  const [working, setWorking] = useState(false);

  useEffect(() => {
    if (!open) setTyped('');
  }, [open]);

  const ready = !confirmWord || typed === confirmWord;

  const confirm = async (): Promise<void> => {
    if (!ready || working) return;
    setWorking(true);
    try {
      await onConfirm();
      onOpenChange(false);
    } finally {
      setWorking(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !working && onOpenChange(o)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription asChild>
            <div className="space-y-2">{description}</div>
          </DialogDescription>
        </DialogHeader>
        {confirmWord && (
          <div className="grid gap-2">
            <Label htmlFor="confirm-word">
              Type <code className="rounded-sm bg-muted px-1.5 py-0.5 font-mono">{confirmWord}</code>{' '}
              to confirm
            </Label>
            <Input
              id="confirm-word"
              autoFocus
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void confirm();
              }}
              spellCheck={false}
              autoComplete="off"
            />
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={working}>
            Cancel
          </Button>
          <Button
            variant={destructive ? 'destructive' : 'default'}
            onClick={() => void confirm()}
            disabled={!ready || working}
          >
            {working && workingLabel ? workingLabel : confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
