import { AlertCircle, Search } from 'lucide-react';
import type { ConfirmMessage, RenderedMessage } from './useAiChat';
import { cn } from '@renderer/lib/utils';

interface Props {
  // Confirm messages are rendered by ToolConfirmCard, never here.
  message: Exclude<RenderedMessage, ConfirmMessage>;
}

const toolLabels: Record<string, string> = {
  read_summary: 'Checked totals',
  read_subscriptions: 'Read subscriptions',
  read_purchases: 'Read purchases',
  read_categories: 'Read categories',
  add_subscription: 'Proposing subscription add',
  add_purchase: 'Proposing purchase add',
  add_category: 'Proposing category add',
  update_subscription: 'Proposing subscription update',
  update_purchase: 'Proposing purchase update',
  delete_subscription: 'Proposing subscription delete',
  delete_purchase: 'Proposing purchase delete',
};

export const ChatMessage = ({ message }: Props): JSX.Element | null => {
  if (message.role === 'system' || message.role === 'tool') return null;

  if (message.role === 'error') {
    return (
      <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive-ink">
        <AlertCircle className="size-3.5 shrink-0" />
        <span className="break-words">{message.content}</span>
      </div>
    );
  }

  if (message.role === 'user') {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] whitespace-pre-wrap break-words rounded-lg bg-primary px-3 py-2 text-sm text-primary-foreground">
          {typeof message.content === 'string'
            ? message.content
            : message.content.map((p) => (p.type === 'text' ? p.text : '[image]')).join(' ')}
        </div>
      </div>
    );
  }

  // assistant — may have content and/or tool_calls
  const tools = message.tool_calls ?? [];
  return (
    <div className="space-y-1.5">
      {tools.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {tools.map((c) => (
            <span
              key={c.id}
              className={cn(
                'inline-flex items-center gap-1 rounded-full border bg-muted/50 px-2 py-0.5 text-xs',
                'text-muted-foreground',
              )}
            >
              <Search className="size-3" />
              {toolLabels[c.function.name] ?? c.function.name}
            </span>
          ))}
        </div>
      )}
      {message.content && (
        <div className="max-w-[90%] whitespace-pre-wrap break-words rounded-lg bg-muted/40 px-3 py-2 text-sm">
          {message.content}
        </div>
      )}
    </div>
  );
};
