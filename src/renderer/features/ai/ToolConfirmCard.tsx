import { useState } from 'react';
import { AlertTriangle, Check, ListPlus, Plus, Trash2, X } from 'lucide-react';
import { Button } from '@renderer/components/ui/button';
import type { ConfirmResolution } from './tools';
import type { ConfirmMessage } from './useAiChat';
import { cn } from '@renderer/lib/utils';

interface Props {
  message: ConfirmMessage;
  onDecide: (callId: string, resolution: ConfirmResolution) => void;
}

const Icon = ({
  kind,
  destructive,
}: {
  kind: ConfirmMessage['proposal']['kind'];
  destructive?: boolean;
}): JSX.Element => {
  if (destructive) return <Trash2 className="size-4 text-destructive" />;
  if (kind === 'add') return <Plus className="size-4 text-success" />;
  if (kind === 'bulk-add') return <ListPlus className="size-4 text-success" />;
  return <AlertTriangle className="size-4 text-warning" />;
};

export const ToolConfirmCard = ({ message, onDecide }: Props): JSX.Element => {
  const { proposal, decision, callId } = message;
  const bulk = proposal.bulkItems ?? [];
  // All rows selected by default.
  const [selected, setSelected] = useState<Set<number>>(
    () => new Set(bulk.map((_, i) => i)),
  );

  if (decision !== 'pending') {
    const approved = decision.approved;
    return (
      <div
        className={cn(
          'flex items-center gap-2 rounded-md border bg-muted/40 px-3 py-1.5 text-xs',
          approved ? 'text-success' : 'text-muted-foreground',
        )}
      >
        {approved ? <Check className="size-3.5" /> : <X className="size-3.5" />}
        <span>
          {approved ? 'Approved' : 'Rejected'} — {proposal.summary}
        </span>
      </div>
    );
  }

  const isBulk = proposal.kind === 'bulk-add' && bulk.length > 0;
  const toggle = (i: number): void =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });

  const approveLabel = proposal.destructive
    ? 'Delete'
    : isBulk
      ? `Add ${selected.size} selected`
      : 'Approve';

  return (
    <div
      className={cn(
        'rounded-lg border p-3',
        proposal.destructive
          ? 'border-destructive/40 bg-destructive/5'
          : 'border-primary/30 bg-primary/5',
      )}
    >
      <div className="flex items-center gap-2 text-sm font-medium">
        <Icon kind={proposal.kind} destructive={proposal.destructive} />
        <span className="truncate">{proposal.summary}</span>
      </div>

      {proposal.details.length > 0 && (
        <dl className="mt-2 grid grid-cols-[max-content_1fr] gap-x-3 gap-y-1 text-xs">
          {proposal.details.map((d, i) => (
            <div key={i} className="contents">
              <dt className="text-muted-foreground">{d.label}</dt>
              <dd className="break-words">
                {d.was != null && d.was !== d.value && (
                  <>
                    <span className="text-muted-foreground line-through">{d.was}</span>
                    <span className="mx-1 text-muted-foreground">→</span>
                  </>
                )}
                <span className="font-medium">{d.value}</span>
              </dd>
            </div>
          ))}
        </dl>
      )}

      {isBulk && (
        <ul className="mt-2 max-h-56 divide-y overflow-y-auto rounded-md border bg-background/50 text-xs">
          {bulk.map((it, i) => (
            <li key={i} className="flex items-start gap-2 px-2.5 py-1.5">
              <input
                type="checkbox"
                checked={selected.has(i)}
                onChange={() => toggle(i)}
                className="mt-0.5 size-3.5 shrink-0 accent-primary"
                aria-label={`Include ${it.name}`}
              />
              <div className="min-w-0">
                <div className="font-medium">{it.name}</div>
                <div className="text-muted-foreground">{it.subtitle}</div>
              </div>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-3 flex gap-2">
        <Button
          size="sm"
          variant={proposal.destructive ? 'destructive' : 'default'}
          disabled={isBulk && selected.size === 0}
          onClick={() =>
            onDecide(callId, {
              approved: true,
              selectedIndices: isBulk ? [...selected].sort((a, b) => a - b) : undefined,
            })
          }
        >
          <Check />
          {approveLabel}
        </Button>
        <Button size="sm" variant="outline" onClick={() => onDecide(callId, { approved: false })}>
          <X />
          Reject
        </Button>
      </div>
    </div>
  );
};
