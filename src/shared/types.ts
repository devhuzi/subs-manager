export type BillingCycle = 'monthly' | 'quarterly' | 'yearly' | 'custom';

export type ItemStatus = 'active' | 'inactive';

export interface Category {
  id: string;
  name: string;
  color?: string;
  /** Optional monthly budget in the default currency. Drives the dashboard
   * over-budget indicator. */
  monthlyBudget?: number;
}

export interface Renewal {
  id: string;
  date: string;
  cost: number;
  currency: string;
  enabled?: boolean;
}

export interface TrialInfo {
  endsAt: string;
  convertsToCost?: number;
}

export interface AlertConfig {
  daysBefore: number[];
}

export interface PricePoint {
  /** When the price changed away from this value. */
  changedAt: string;
  cost: number;
  currency: string;
}

export interface Subscription {
  id: string;
  name: string;
  cost: number;
  currency: string;
  billingCycle: BillingCycle;
  renewalDate: string;
  subscribedSince: string;
  renewals: Renewal[];
  status: ItemStatus;
  categoryId?: string;
  website?: string;
  notes?: string;
  cancellationUrl?: string;
  /** Free-text payment method, e.g. "Amex …1234". */
  paymentMethod?: string;
  logoUrl?: string;
  brandColor?: string;
  trial?: TrialInfo;
  alertConfig?: AlertConfig;
  /** Prior cost/currency values, newest last. Appended when cost or currency changes. */
  priceHistory?: PricePoint[];
  /** Keys of already-fired alerts: `${renewalDate}:${daysBefore}` or `trial:${endsAt}:${daysBefore}`. */
  firedAlerts?: string[];
  createdAt: string;
  updatedAt: string;
}

export interface OneTimePurchase {
  id: string;
  name: string;
  cost: number;
  currency: string;
  purchaseDate: string;
  categoryId?: string;
  website?: string;
  notes?: string;
  warrantyEndsAt?: string;
  supportEndsAt?: string;
  /** Used to compute amortized monthly cost. Defaults to 36 if unset. */
  expectedLifespanMonths?: number;
  /** Free-text payment method, e.g. "Amex …1234". */
  paymentMethod?: string;
  logoUrl?: string;
  brandColor?: string;
  createdAt: string;
  updatedAt: string;
}

export type Theme = 'light' | 'dark' | 'system';

/**
 * 'glass' and 'notion' were retired; they stay valid so older data files
 * still parse, and are read back as 'default' (see normalizeLayoutTheme).
 */
export type LayoutTheme = 'default' | 'sharp' | 'glass' | 'notion';

/** The layouts the app still renders. */
export type ActiveLayoutTheme = 'default' | 'sharp';

export const normalizeLayoutTheme = (t: LayoutTheme | undefined): ActiveLayoutTheme =>
  t === 'sharp' ? 'sharp' : 'default';

export interface NotifyPrefs {
  enabled: boolean;
  globalDaysBefore: number[];
  /** ['22:00', '08:00'] — alerts suppressed during this window. */
  quietHours?: [string, string];
  /** If true, app stays in tray when window closes so scheduler keeps firing. */
  minimizeToTray: boolean;
}

export interface AiAssistantPrefs {
  enabled: boolean;
  /** OpenRouter model slug, e.g. "anthropic/claude-sonnet-4". */
  model: string;
  /**
   * Whether a key is currently stored. Cached in prefs for UI rendering; the
   * authoritative source is `aiCredentials.hasKey()` in the main process.
   * The plaintext key itself is NEVER persisted here — it lives only in
   * OS-keychain-encrypted form via Electron `safeStorage`.
   */
  hasKey: boolean;
}

export interface Preferences {
  theme: Theme;
  /**
   * The single home/display currency (3-letter ISO, defaults to USD). All
   * totals are converted into this currency at the live rate. Items keep the
   * currency they were entered in; the converted value is shown beside it.
   */
  defaultCurrency: string;
  reminderDays: number;
  fxLastFetchedAt?: string;
  enableLogoFetch: boolean;
  notify: NotifyPrefs;
  aiAssistant: AiAssistantPrefs;
  /** Visual style for surfaces (radius, shadows, fonts, tints). */
  layoutTheme: LayoutTheme;
  /** Hex like '#6366F1'. Undefined = use the CSS-defined default indigo. */
  brandColor?: string;
  /**
   * The user's IANA time zone (e.g. 'Europe/Berlin'), recorded by the renderer
   * so the web reminder cron computes calendar days and quiet hours in local
   * time instead of UTC. Undefined = server falls back to UTC.
   */
  timezone?: string;
}

export const defaultNotifyPrefs = (): NotifyPrefs => ({
  enabled: true,
  globalDaysBefore: [7, 1, 0],
  minimizeToTray: true,
});

export const defaultAiAssistantPrefs = (): AiAssistantPrefs => ({
  enabled: false,
  model: 'anthropic/claude-sonnet-4',
  hasKey: false,
});

export const defaultPreferences = (): Preferences => ({
  theme: 'system',
  defaultCurrency: 'USD',
  reminderDays: 30,
  enableLogoFetch: false,
  notify: defaultNotifyPrefs(),
  aiAssistant: defaultAiAssistantPrefs(),
  layoutTheme: 'default',
});

export interface CancellationLogEntry {
  id: string;
  /** Optional back-link to the source subscription. Used to revoke this entry
   * if the user later reactivates the sub. Older entries (pre-feature) may
   * lack this field — they stay in the log as frozen history. */
  subscriptionId?: string;
  subscriptionName: string;
  cancelledAt: string;
  monthlyEquivalent: number;
  currency: string;
}

export interface AppData {
  version: 1;
  subscriptions: Subscription[];
  oneTimePurchases: OneTimePurchase[];
  categories: Category[];
  preferences: Preferences;
  cancellationLog: CancellationLogEntry[];
}

export interface FxRates {
  base: string;
  fetchedAt: string;
  rates: Record<string, number>;
}

export interface FileFilter {
  name: string;
  extensions: string[];
}

export interface ImportedFile {
  path: string;
  content: string;
}

/* ===== AI chat message + tool shapes (OpenAI-compatible) ===== */

export interface AiToolCall {
  id: string;
  type: 'function';
  function: { name: string; arguments: string };
}

export interface AiTextContent {
  type: 'text';
  text: string;
}

export interface AiImageContent {
  type: 'image_url';
  image_url: { url: string };
}

export type AiChatMessage =
  | { role: 'system'; content: string }
  | { role: 'user'; content: string | Array<AiTextContent | AiImageContent> }
  | {
      role: 'assistant';
      content?: string | null;
      tool_calls?: AiToolCall[];
    }
  | { role: 'tool'; tool_call_id: string; content: string };

export interface AiToolDef {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

export interface AiChatUsage {
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
}

export type AiChatResult =
  | {
      ok: true;
      message: {
        role: 'assistant';
        content?: string | null;
        tool_calls?: AiToolCall[];
      };
      finish_reason: string;
      usage?: AiChatUsage;
    }
  | { ok: false; error: string };

export interface AiChatRequest {
  model: string;
  messages: AiChatMessage[];
  tools?: AiToolDef[];
}

/** One streaming event from the LLM response. Currently only content deltas
 * are streamed — tool-call deltas accumulate in the main process and arrive
 * only via the final `AiChatResult`. */
export interface AiStreamChunk {
  type: 'content';
  delta: string;
}

export type AiSetKeyResult =
  | { ok: true }
  | {
      ok: false;
      /** 'rate-limited' | 'network' | 'server' are web-only (Edge Function failures). */
      reason: 'no-secure-storage' | 'empty-key' | 'rate-limited' | 'network' | 'server';
    };

/** Web-only Web Push controls. Undefined on desktop (it has native OS notifs). */
export interface WebPushApi {
  isSupported: () => boolean;
  /** Whether this browser is currently subscribed to push. */
  getEnabled: () => Promise<boolean>;
  enable: () => Promise<{ ok: boolean; error?: string }>;
  disable: () => Promise<void>;
}

/** Web-only account/session surface. Undefined on desktop (local, no accounts). */
export interface WebAuthApi {
  getEmail: () => Promise<string | null>;
  signOut: () => Promise<void>;
  /** Verifies `currentPassword` by re-authenticating before changing it. */
  changePassword: (
    currentPassword: string,
    newPassword: string,
  ) => Promise<{ ok: true } | { ok: false; error: string }>;
  /** Permanently deletes the account and all its data (cascades on the server). */
  deleteAccount: () => Promise<{ ok: true } | { ok: false; error: string }>;
}

export interface IpcApi {
  getDataDir: () => Promise<string>;
  chooseDataDir: () => Promise<string | null>;
  loadData: () => Promise<AppData>;
  saveData: (data: AppData) => Promise<void>;
  saveFile: (defaultName: string, content: string, filters: FileFilter[]) => Promise<string | null>;
  openFile: (filters: FileFilter[]) => Promise<ImportedFile | null>;
  openExternal: (url: string) => Promise<void>;
  checkRemindersNow: () => Promise<{ fired: number }>;
  getRates: () => Promise<FxRates | null>;
  refreshRates: () => Promise<FxRates | null>;
  fetchLogo: (website: string) => Promise<string | null>;
  /* AI assistant — note the deliberate absence of any `aiGetKey`. */
  aiChat: (request: AiChatRequest) => Promise<AiChatResult>;
  aiSetKey: (key: string) => Promise<AiSetKeyResult>;
  aiClearKey: () => Promise<{ ok: true }>;
  aiHasKey: () => Promise<{ hasKey: boolean }>;
  aiIsSecureStorageAvailable: () => Promise<boolean>;
  backupNow: () => Promise<{ ok: boolean; path: string | null }>;
  listBackups: () => Promise<Array<{ fileName: string; modifiedAt: string }>>;
  openBackupsFolder: () => Promise<void>;
  /** Returns a per-1M-tokens USD pricing map from OpenRouter's public model catalogue. */
  aiFetchModelPricing: () => Promise<Record<string, { promptPer1M: number; completionPer1M: number }>>;
  /** Subscribe to per-chunk SSE deltas during an `aiChat` call. Returns an
   * unsubscribe function. */
  onAiChunk: (cb: (chunk: AiStreamChunk) => void) => () => void;
  /** Web build only — account session controls. Absent on desktop. */
  auth?: WebAuthApi;
  /** Web build only — Web Push subscription controls. Absent on desktop. */
  push?: WebPushApi;
}

export interface RenewalInput {
  date: string;
  cost: number;
  currency: string;
}

/** Which shell the renderer is running in. The Electron preload leaves this
 * unset (treated as 'desktop'); the web bootstrap sets `window.platform`. */
export type Platform = 'desktop' | 'web';

declare global {
  interface Window {
    api: IpcApi;
    platform?: Platform;
  }
}
