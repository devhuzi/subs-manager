import { useEffect, useRef, useState, type ChangeEvent, type KeyboardEvent } from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { FileText, ImageIcon, MessageSquare, Paperclip, Send, Trash2, X } from 'lucide-react';
import type { AppData, FxRates, Preferences } from '../../../shared/types';
import { Button } from '@renderer/components/ui/button';
import { ChatMessage } from './ChatMessage';
import { ToolConfirmCard } from './ToolConfirmCard';
import { useAiChat, type AttachedFile } from './useAiChat';
import type { ToolActions } from './tools';
import { modelSupportsVision } from './models';
import { cn } from '@renderer/lib/utils';

const ACCEPT = 'image/*,.csv,.json,.txt';
const MAX_FILE_BYTES = 5 * 1024 * 1024; // 5MB per file

const readFile = (file: File): Promise<AttachedFile> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    const isImage = file.type.startsWith('image/');
    reader.onerror = () => reject(reader.error);
    if (isImage) {
      reader.onload = () =>
        resolve({
          name: file.name,
          mime: file.type,
          kind: 'image',
          dataUrl: reader.result as string,
        });
      reader.readAsDataURL(file);
    } else {
      reader.onload = () =>
        resolve({
          name: file.name,
          mime: file.type || 'text/plain',
          kind: 'text',
          textContent: reader.result as string,
        });
      reader.readAsText(file);
    }
  });

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  data: AppData | null;
  rates: FxRates | null;
  preferences: Preferences | undefined;
  actions: ToolActions;
  /** Bumped when the user resets all data — clears the live chat transcript. */
  resetSignal: number;
}

export const AiChatPanel = ({
  open,
  onOpenChange,
  data,
  rates,
  preferences,
  actions,
  resetSignal,
}: Props): JSX.Element => {
  const {
    messages,
    sending,
    streamingContent,
    send,
    clear,
    resolveConfirm,
    canSend,
    usage,
    estimatedCostUsd,
  } = useAiChat(data, rates, preferences, actions);
  const [input, setInput] = useState('');
  const [attachments, setAttachments] = useState<AttachedFile[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const model = preferences?.aiAssistant.model ?? '';
  const hasKey = preferences?.aiAssistant.hasKey ?? false;
  const enabled = preferences?.aiAssistant.enabled ?? false;

  // The selected model can't read images, but the user attached one. Block the
  // send and tell them to switch models rather than silently dropping it.
  const hasImageAttachment = attachments.some((f) => f.kind === 'image');
  const imageBlocked = hasImageAttachment && !modelSupportsVision(model);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, sending, streamingContent]);

  // Clear the live transcript when all data is reset. Skip the initial render
  // (the chat already starts empty on mount).
  const firstReset = useRef(true);
  useEffect(() => {
    if (firstReset.current) {
      firstReset.current = false;
      return;
    }
    clear();
  }, [resetSignal, clear]);

  const submit = async (): Promise<void> => {
    if (!canSend || imageBlocked) return;
    if (!input.trim() && attachments.length === 0) return;
    const text = input;
    const files = attachments;
    setInput('');
    setAttachments([]);
    await send(text, files);
  };

  const onFiles = async (e: ChangeEvent<HTMLInputElement>): Promise<void> => {
    const list = e.target.files;
    if (!list) return;
    const added: AttachedFile[] = [];
    for (const file of Array.from(list)) {
      if (file.size > MAX_FILE_BYTES) continue;
      try {
        added.push(await readFile(file));
      } catch {
        // ignore unreadable files
      }
    }
    setAttachments((prev) => [...prev, ...added]);
    if (fileRef.current) fileRef.current.value = '';
  };

  const removeAttachment = (idx: number): void =>
    setAttachments((prev) => prev.filter((_, i) => i !== idx));

  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>): void => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void submit();
    }
  };

  return (
    // A Radix dialog: Esc closes it, focus is trapped inside while open and
    // returned to the opener after, and it's announced as a modal dialog.
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-40 bg-black/40 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <DialogPrimitive.Content
          aria-describedby={undefined}
          onOpenAutoFocus={(e) => {
            e.preventDefault();
            inputRef.current?.focus();
          }}
          className={cn(
            'fixed inset-y-0 right-0 z-50 flex w-full max-w-md flex-col border-l bg-card text-card-foreground shadow-2xl duration-200 ease-out',
            'data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=open]:slide-in-from-right data-[state=closed]:slide-out-to-right',
          )}
        >
            <header className="flex items-center justify-between border-b px-4 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
              <div className="flex items-center gap-2 min-w-0">
                <MessageSquare className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                <div className="min-w-0">
                  <DialogPrimitive.Title className="text-sm font-semibold">
                    Assistant
                  </DialogPrimitive.Title>
                  <p className="truncate text-xs text-muted-foreground" title={model}>
                    {model}
                    {usage.promptTokens + usage.completionTokens > 0 && (
                      <span className="ml-1.5 tabular-nums">
                        {estimatedCostUsd != null
                          ? `· ≈ $${estimatedCostUsd.toFixed(4)}`
                          : `· ${(usage.promptTokens + usage.completionTokens).toLocaleString()} tok`}
                      </span>
                    )}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-1">
                {messages.length > 0 && (
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="Clear chat"
                    onClick={clear}
                  >
                    <Trash2 />
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Close"
                  onClick={() => onOpenChange(false)}
                >
                  <X />
                </Button>
              </div>
            </header>

            <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto p-4">
              {!enabled || !hasKey ? (
                <div className="rounded-md border border-dashed py-10 text-center text-sm text-muted-foreground">
                  {hasKey
                    ? 'Enable the assistant in Settings to start chatting.'
                    : 'Add your OpenRouter API key in Settings → AI Assistant to start.'}
                </div>
              ) : messages.length === 0 ? (
                <div className="space-y-3 text-sm text-muted-foreground">
                  <p>Ask about your spending. For example:</p>
                  <ul className="list-disc space-y-1 pl-5 text-xs">
                    <li>What&apos;s my total monthly cost?</li>
                    <li>Which subscription is my most expensive?</li>
                    <li>How much did I pay across all my SaaS tools this year?</li>
                    <li>What&apos;s renewing in the next week?</li>
                  </ul>
                </div>
              ) : (
                messages.map((m, i) =>
                  m.role === 'confirm' ? (
                    <ToolConfirmCard key={m.id} message={m} onDecide={resolveConfirm} />
                  ) : (
                    <ChatMessage key={'id' in m ? m.id : i} message={m} />
                  ),
                )
              )}
              {streamingContent && (
                <div className="max-w-[90%] whitespace-pre-wrap break-words rounded-lg bg-muted/40 px-3 py-2 text-sm">
                  {streamingContent}
                  <span className="ml-0.5 inline-block h-3.5 w-1 translate-y-0.5 animate-pulse bg-foreground/60" />
                </div>
              )}
              {sending && !streamingContent && (
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <span className="inline-block size-1.5 animate-pulse rounded-full bg-muted-foreground" />
                  <span className="inline-block size-1.5 animate-pulse rounded-full bg-muted-foreground [animation-delay:120ms]" />
                  <span className="inline-block size-1.5 animate-pulse rounded-full bg-muted-foreground [animation-delay:240ms]" />
                </div>
              )}
            </div>

            <footer className="border-t px-3 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
              {attachments.length > 0 && (
                <ul className="mb-2 flex flex-wrap gap-1.5">
                  {attachments.map((f, i) => (
                    <li
                      key={`${f.name}-${i}`}
                      className="inline-flex items-center gap-1.5 rounded-full border bg-muted/50 py-1 pl-2 pr-1 text-xs"
                    >
                      {f.kind === 'image' ? (
                        <ImageIcon className="size-3" />
                      ) : (
                        <FileText className="size-3" />
                      )}
                      <span className="max-w-[160px] truncate">{f.name}</span>
                      <button
                        type="button"
                        aria-label={`Remove ${f.name}`}
                        onClick={() => removeAttachment(i)}
                        className="ml-0.5 inline-flex size-4 items-center justify-center rounded-full text-muted-foreground hover:bg-accent hover:text-foreground"
                      >
                        <X className="size-3" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              {imageBlocked && (
                <p className="mb-2 rounded-md border border-warning/40 bg-warning/10 px-2.5 py-1.5 text-xs text-warning-ink">
                  This model doesn’t support images. Please select a model that supports
                  images (e.g. Gemma 4 26B in Settings) to send a screenshot.
                </p>
              )}
              <div className="flex items-end gap-2">
                <input
                  ref={fileRef}
                  type="file"
                  accept={ACCEPT}
                  className="hidden"
                  multiple
                  onChange={(e) => void onFiles(e)}
                />
                <Button
                  size="icon"
                  variant="ghost"
                  aria-label="Attach file"
                  onClick={() => fileRef.current?.click()}
                  disabled={!canSend}
                  title="Attach image, CSV, or text"
                >
                  <Paperclip />
                </Button>
                <textarea
                  ref={inputRef}
                  aria-label="Message"
                  className={cn(
                    // 16px on mobile so iOS doesn't zoom the viewport on focus.
                    'flex-1 resize-none rounded-md border border-input bg-background px-3 py-2 text-base sm:text-sm',
                    'placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                    'disabled:cursor-not-allowed disabled:opacity-50',
                  )}
                  rows={2}
                  placeholder={
                    canSend ? 'Ask anything about your data…' : 'Set up the assistant first'
                  }
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={onKey}
                  disabled={!canSend}
                />
                <Button
                  size="icon"
                  aria-label="Send"
                  onClick={() => void submit()}
                  disabled={
                    !canSend || imageBlocked || (!input.trim() && attachments.length === 0)
                  }
                >
                  <Send />
                </Button>
              </div>
              <p className="mt-1.5 text-xs text-muted-foreground">
                Enter to send · Shift+Enter for newline · attach images, CSV, or text
              </p>
            </footer>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
};
