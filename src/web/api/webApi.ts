import {
  FunctionsFetchError,
  FunctionsHttpError,
  FunctionsRelayError,
  type SupabaseClient,
} from '@supabase/supabase-js';
import {
  defaultPreferences,
  type AppData,
  type AiStreamChunk,
  type FileFilter,
  type FxRates,
  type ImportedFile,
  type IpcApi,
  type Subscription,
} from '@shared/types';
import { parseOpenRouterStream } from '@shared/ai-stream';
import { normalizeExternalUrl } from '@shared/url';
import { disablePush, enablePush, pushEnabled, pushSupported } from '../pwa/push';
import {
  categoryToRow,
  cancellationToRow,
  diffById,
  flattenRenewals,
  prefsToRow,
  purchaseToRow,
  renewalToRow,
  rowsToAppData,
  subScalar,
  subToRow,
} from './mappers';

/**
 * Web implementation of the IpcApi seam. The renderer is identical to the
 * desktop build; only this object differs from the Electron preload. It's
 * installed on `window.api` in main.tsx BEFORE React mounts.
 *
 * Data CRUD runs against normalized Supabase tables (RLS-scoped per user).
 * FX/export/import/external links work directly in-browser; logos, AI (key in
 * Vault) and reminders go through Edge Functions; push via the service worker.
 * Only the desktop-only features (data dir, local backups) are stubbed.
 */

const emptyAppData = (): AppData => ({
  version: 1,
  subscriptions: [],
  oneTimePurchases: [],
  categories: [],
  preferences: defaultPreferences(),
  cancellationLog: [],
});

/** Base currency for FX, kept in sync with the user's saved preference. */
let fxBase = 'USD';
/** Snapshot of the last-synced state so saveData only writes deltas. */
let lastSaved: AppData | null = null;
/** Tail of the save queue. Saves run one at a time: each diffs against
 * `lastSaved`, so overlapping saves would diff against a stale snapshot and
 * re-upsert rows another save just deleted. */
let saveQueue: Promise<void> = Promise.resolve();

const FUNCTIONS_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1`;
const ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;
/** Live subscribers to streamed AI content deltas (the chat panel uses one). */
const chunkListeners = new Set<(chunk: AiStreamChunk) => void>();
const emitChunk = (chunk: AiStreamChunk): void => {
  for (const cb of chunkListeners) cb(chunk);
};

export const setFxBase = (base: string): void => {
  fxBase = base;
};

// ── FX / files (browser-native) ─────────────────────────────────────────────
const fetchFrankfurter = async (base: string): Promise<FxRates | null> => {
  try {
    // frankfurter.dev is the current domain and sends CORS headers; the old
    // .app domain only 301-redirects, which the browser blocks under CORS.
    const res = await fetch(`https://api.frankfurter.dev/v1/latest?base=${base}`);
    if (!res.ok) return null;
    const json = (await res.json()) as { base: string; rates: Record<string, number> };
    return {
      base: json.base,
      fetchedAt: new Date().toISOString(),
      rates: { ...json.rates, [json.base]: 1 },
    };
  } catch {
    return null;
  }
};

const downloadText = (name: string, content: string): void => {
  const blob = new Blob([content], { type: 'application/octet-stream' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
};

const pickFile = (filters: FileFilter[]): Promise<ImportedFile | null> =>
  new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    const exts = filters.flatMap((f) => f.extensions.map((e) => `.${e}`));
    if (exts.length) input.accept = exts.join(',');
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) return resolve(null);
      const reader = new FileReader();
      reader.onload = () => resolve({ path: file.name, content: reader.result as string });
      reader.onerror = () => resolve(null);
      reader.readAsText(file);
    };
    input.click();
  });

/** The `{ error }` message an Edge Function returned, else a generic fallback. */
const functionErrorMessage = async (error: unknown): Promise<string> => {
  if (error instanceof FunctionsHttpError) {
    const body = (await (error.context as Response).json().catch(() => null)) as {
      error?: string;
    } | null;
    if (body?.error) return body.error;
  }
  if (error instanceof FunctionsFetchError || error instanceof FunctionsRelayError) {
    return "Couldn't reach the server. Check your connection and try again.";
  }
  return 'Something went wrong. Please try again.';
};

const notImplemented = (what: string) => (): never => {
  throw new Error(`${what} is not available in the web app yet.`);
};

export const makeWebApi = (supabase: SupabaseClient): IpcApi => {
  const userId = async (): Promise<string> => {
    const { data } = await supabase.auth.getUser();
    if (!data.user) throw new Error('Not signed in');
    return data.user.id;
  };

  const check = (label: string, error: { message: string } | null): void => {
    if (error) throw new Error(`${label}: ${error.message}`);
  };

  const upsert = async (table: string, rows: object[], onConflict: string): Promise<void> => {
    if (rows.length === 0) return;
    const { error } = await supabase.from(table).upsert(rows, { onConflict });
    check(`upsert ${table}`, error);
  };

  const removeIds = async (table: string, ids: string[]): Promise<void> => {
    if (ids.length === 0) return;
    const { error } = await supabase.from(table).delete().in('id', ids);
    check(`delete ${table}`, error);
  };

  /** Writes the delta between `lastSaved` and `next`. Not transactional: on
   * failure `lastSaved` is left as-is, so the next save re-sends the same delta
   * (upserts and deletes are idempotent). */
  const writeDelta = async (next: AppData): Promise<void> => {
    const uid = await userId();
    const prev = lastSaved ?? emptyAppData();

    const catD = diffById(prev.categories, next.categories);
    const subD = diffById(prev.subscriptions.map(subScalar), next.subscriptions.map(subScalar));
    const renD = diffById(flattenRenewals(prev.subscriptions), flattenRenewals(next.subscriptions));
    const purD = diffById(prev.oneTimePurchases, next.oneTimePurchases);
    const canD = diffById(prev.cancellationLog, next.cancellationLog);

    // Upserts, parents before children (renewals reference subscriptions).
    await upsert('categories', catD.upserts.map((c) => categoryToRow(uid, c)), 'user_id,id');
    await upsert(
      'subscriptions',
      subD.upserts.map((s) => subToRow(uid, s as Subscription)),
      'user_id,id',
    );
    await upsert(
      'subscription_renewals',
      renD.upserts.map((r) => renewalToRow(uid, r.subId, r)),
      'user_id,id',
    );
    await upsert('one_time_purchases', purD.upserts.map((p) => purchaseToRow(uid, p)), 'user_id,id');
    await upsert('cancellation_log', canD.upserts.map((c) => cancellationToRow(uid, c)), 'user_id,id');
    // Preferences is a single small row — always upsert.
    await upsert('preferences', [prefsToRow(uid, next.preferences)], 'user_id');

    // Deletes, children before parents (a removed sub cascade-drops renewals).
    await removeIds('subscription_renewals', renD.deleteIds);
    await removeIds('subscriptions', subD.deleteIds);
    await removeIds('categories', catD.deleteIds);
    await removeIds('one_time_purchases', purD.deleteIds);
    await removeIds('cancellation_log', canD.deleteIds);

    fxBase = next.preferences.defaultCurrency;
    lastSaved = next;
  };

  return {
    // ── Data ────────────────────────────────────────────────────────────────
    loadData: async () => {
      const [cats, subs, rens, purchases, cancels, prefs, keyRes] = await Promise.all([
        supabase.from('categories').select('*'),
        supabase.from('subscriptions').select('*'),
        supabase.from('subscription_renewals').select('*'),
        supabase.from('one_time_purchases').select('*'),
        supabase.from('cancellation_log').select('*'),
        supabase.from('preferences').select('*').maybeSingle(),
        supabase.functions.invoke('ai-has-key', { body: {} }).catch(() => null),
      ]);
      check('load categories', cats.error);
      check('load subscriptions', subs.error);
      check('load renewals', rens.error);
      check('load purchases', purchases.error);
      check('load cancellations', cancels.error);
      check('load preferences', prefs.error);

      const data = rowsToAppData({
        categories: cats.data ?? [],
        subscriptions: subs.data ?? [],
        renewals: rens.data ?? [],
        purchases: purchases.data ?? [],
        cancellations: cancels.data ?? [],
        preferences: prefs.data ?? null,
      });
      // Reconcile the cached hasKey hint with Vault, like desktop does with the
      // keychain. Best-effort: on failure keep the stored value.
      if (keyRes && !keyRes.error) {
        data.preferences.aiAssistant.hasKey = Boolean(
          (keyRes.data as { hasKey?: boolean } | null)?.hasKey,
        );
      }
      fxBase = data.preferences.defaultCurrency;
      lastSaved = structuredClone(data);
      return data;
    },

    saveData: (data) => {
      // Snapshot now: the diff runs later, after any queued saves finish.
      const next = structuredClone(data);
      const run = saveQueue
        .then(() => writeDelta(next))
        .catch((err: unknown) => {
          throw new Error(`Couldn't save your changes to the server: ${(err as Error).message}`);
        });
      saveQueue = run.catch(() => undefined);
      return run;
    },

    // ── Data directory: desktop-only; UI hidden on web ───────────────────────
    getDataDir: async () => '',
    chooseDataDir: async () => null,

    // ── Export / import via the browser ──────────────────────────────────────
    saveFile: async (defaultName, content) => {
      downloadText(defaultName, content);
      return defaultName;
    },
    openFile: async (filters) => pickFile(filters),

    // ── External links ───────────────────────────────────────────────────────
    openExternal: async (url) => {
      const safe = normalizeExternalUrl(url);
      if (safe) window.open(safe, '_blank', 'noopener,noreferrer');
    },

    // ── Reminders: run the server-side check for THIS user now (sends push
    //    for anything due). The cron runs the same function for everyone. ──────
    checkRemindersNow: async () => {
      try {
        const { data } = await supabase.functions.invoke('scheduled-notify', { body: {} });
        return { fired: (data as { fired?: number })?.fired ?? 0 };
      } catch {
        return { fired: 0 };
      }
    },

    // ── FX rates (frankfurter is CORS-open) ──────────────────────────────────
    getRates: async () => fetchFrankfurter(fxBase),
    refreshRates: async () => fetchFrankfurter(fxBase),

    // ── Logos (proxied via Edge Function — browsers can't fetch favicons
    //    cross-origin, and Clearbit's free API is discontinued) ───────────────
    fetchLogo: async (website) => {
      try {
        const { data, error } = await supabase.functions.invoke('fetch-logo', {
          body: { website },
        });
        if (error) return null;
        return (data as { dataUrl: string | null })?.dataUrl ?? null;
      } catch {
        return null;
      }
    },

    // ── AI (Edge Function proxy + Vault) ─────────────────────────────────────
    aiChat: async (request) => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) return { ok: false as const, error: 'Not signed in' };
      try {
        const res = await fetch(`${FUNCTIONS_URL}/ai-chat`, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            authorization: `Bearer ${session.access_token}`,
            apikey: ANON_KEY,
          },
          body: JSON.stringify(request),
        });
        if (!res.ok || !res.body) {
          const j = (await res.json().catch(() => ({}))) as { error?: string };
          return { ok: false as const, error: j.error ?? `HTTP ${res.status}` };
        }
        return await parseOpenRouterStream(res.body, emitChunk);
      } catch (err) {
        return { ok: false as const, error: (err as Error).message };
      }
    },
    aiSetKey: async (key) => {
      if (!key.trim()) return { ok: false as const, reason: 'empty-key' as const };
      const { data, error } = await supabase.functions.invoke('ai-set-key', { body: { key } });
      if (error) {
        if (error instanceof FunctionsHttpError) {
          const status = (error.context as Response | undefined)?.status;
          return { ok: false as const, reason: status === 429 ? 'rate-limited' : 'server' };
        }
        if (error instanceof FunctionsFetchError || error instanceof FunctionsRelayError) {
          return { ok: false as const, reason: 'network' as const };
        }
        return { ok: false as const, reason: 'server' as const };
      }
      const res = data as { ok?: boolean; reason?: string } | null;
      if (res?.ok) return { ok: true as const };
      return { ok: false as const, reason: res?.reason === 'empty-key' ? 'empty-key' : 'server' };
    },
    aiClearKey: async () => {
      const { error } = await supabase.functions.invoke('ai-clear-key', { body: {} });
      if (error) throw new Error(await functionErrorMessage(error));
      return { ok: true as const };
    },
    aiHasKey: async () => {
      const { data, error } = await supabase.functions.invoke('ai-has-key', { body: {} });
      if (error) throw new Error(await functionErrorMessage(error));
      return { hasKey: Boolean((data as { hasKey?: boolean })?.hasKey) };
    },
    aiIsSecureStorageAvailable: async () => true, // server-custodied via Vault
    aiFetchModelPricing: async () => {
      // OpenRouter's public catalogue is CORS-open.
      try {
        const res = await fetch('https://openrouter.ai/api/v1/models');
        if (!res.ok) return {};
        const json = (await res.json()) as {
          data?: Array<{ id: string; pricing?: { prompt?: string; completion?: string } }>;
        };
        const out: Record<string, { promptPer1M: number; completionPer1M: number }> = {};
        for (const m of json.data ?? []) {
          const p = Number(m.pricing?.prompt);
          const c = Number(m.pricing?.completion);
          if (Number.isFinite(p) && Number.isFinite(c) && (p > 0 || c > 0)) {
            out[m.id] = { promptPer1M: p * 1_000_000, completionPer1M: c * 1_000_000 };
          }
        }
        return out;
      } catch {
        return {};
      }
    },
    onAiChunk: (cb) => {
      chunkListeners.add(cb);
      return () => chunkListeners.delete(cb);
    },

    // ── Backups (later phase) ────────────────────────────────────────────────
    backupNow: async () => ({ ok: false, path: null }),
    listBackups: async () => [],
    openBackupsFolder: notImplemented('Opening the backups folder'),

    // ── Account (web only) ───────────────────────────────────────────────────
    auth: {
      getEmail: async () => {
        const { data } = await supabase.auth.getUser();
        return data.user?.email ?? null;
      },
      signOut: async () => {
        // Stop this browser receiving the account's reminders once signed out
        // (must run while the session can still delete the row). Best-effort and
        // time-boxed: serviceWorker.ready never settles if no SW is registered.
        await Promise.race([
          disablePush().catch(() => undefined),
          new Promise((resolve) => setTimeout(resolve, 3000)),
        ]);
        await supabase.auth.signOut();
        // Clear the cached snapshot so a different account can't see stale data.
        lastSaved = null;
      },
      changePassword: async (currentPassword, newPassword) => {
        // Re-authenticate to confirm the current password before changing it
        // (Supabase's updateUser alone trusts the session and wouldn't verify it).
        const { data } = await supabase.auth.getUser();
        const email = data.user?.email;
        if (!email) return { ok: false as const, error: 'Not signed in' };
        const reauth = await supabase.auth.signInWithPassword({
          email,
          password: currentPassword,
        });
        if (reauth.error) return { ok: false as const, error: 'Current password is incorrect.' };
        const { error } = await supabase.auth.updateUser({ password: newPassword });
        return error ? { ok: false as const, error: error.message } : { ok: true as const };
      },
      deleteAccount: async () => {
        // Account deletion needs admin rights, so it runs in an Edge Function
        // (service-role) that verifies the caller's JWT and cascades the data.
        const { error } = await supabase.functions.invoke('delete-account');
        if (error) return { ok: false as const, error: error.message };
        await supabase.auth.signOut();
        lastSaved = null;
        return { ok: true as const };
      },
    },

    // ── Web Push (web only) ──────────────────────────────────────────────────
    push: {
      isSupported: pushSupported,
      getEnabled: pushEnabled,
      enable: enablePush,
      disable: disablePush,
    },
  };
};
