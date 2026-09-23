import { useCallback, useEffect, useRef, useState } from 'react';
import Papa from 'papaparse';
import { toast } from 'sonner';
import {
  type AppData,
  type CancellationLogEntry,
  type Category,
  type FxRates,
  type OneTimePurchase,
  type Preferences,
  type Subscription,
} from '../../shared/types';
import type {
  CategoryInput,
  OneTimePurchaseInput,
  SubscriptionInput,
} from '../../shared/schemas';
import { isoLocal, todayLocalIso } from '../../shared/dates';
import { buildIcs } from '../lib/ics';
import {
  parseBackupJson,
  parsePurchaseCsv,
  parseSubscriptionCsv,
  summarizeCsvImport,
} from '../lib/importData';
import { autoFillSub } from '../features/subscriptions/renewals';
import { recordPriceChange } from '../features/subscriptions/pricing';
import { lifetimeSpend, renewalCount } from '../features/subscriptions/subscriptionMetrics';
import {
  applyStatusChangeToLog,
  type CancellationLogChange,
} from '../features/subscriptions/cancellationLog';
import { formatCurrency } from '../lib/money';
import { useToday } from './useToday';

const nowIso = (): string => new Date().toISOString();

/**
 * Rejection value of a failed save. The user has already been shown a toast,
 * so the global `unhandledrejection` handler skips errors marked `reported`.
 */
export class SaveError extends Error {
  readonly reported = true;
  constructor(cause: unknown) {
    super((cause as Error)?.message || String(cause));
    this.name = 'SaveError';
  }
}

/** Log entries in `log` that `before` didn't have (what a status change added). */
const addedEntries = (before: AppData, log: CancellationLogEntry[]): CancellationLogEntry[] =>
  log.filter((e) => !before.cancellationLog.includes(e));

const toastLogChange = (change: CancellationLogChange): void => {
  if (change === 'logged') toast.success('Logged to cancellation savings');
  else if (change === 'revoked') toast.success('Removed from cancellation savings');
};

/**
 * Neutralizes CSV formula injection: a cell beginning with =, +, -, @, or a
 * control char is treated as a formula by Excel/Sheets. Prefixing a single
 * quote forces it to render as text. Applied to every exported cell.
 */
const csvSafe = <T,>(value: T): T | string =>
  typeof value === 'string' && /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;

/** Maps each row's values through csvSafe before unparsing. */
const csvSafeRows = <T extends Record<string, unknown>>(rows: T[]): Record<string, unknown>[] =>
  rows.map((row) => Object.fromEntries(Object.entries(row).map(([k, v]) => [k, csvSafe(v)])));

export interface AppDataApi {
  data: AppData | null;
  dataDir: string;
  loading: boolean;
  /** Set when the initial load failed (e.g. offline / Supabase unreachable). */
  loadError: string | null;
  rates: FxRates | null;
  refresh: () => Promise<void>;
  refreshRates: () => Promise<void>;
  chooseDataDir: () => Promise<void>;
  addSubscription: (input: SubscriptionInput) => Promise<void>;
  updateSubscription: (id: string, input: SubscriptionInput) => Promise<void>;
  toggleSubscriptionStatus: (id: string) => Promise<void>;
  deactivateSubscriptions: (ids: string[]) => Promise<void>;
  deleteSubscription: (id: string) => Promise<void>;
  deleteSubscriptions: (ids: string[]) => Promise<void>;
  setRenewalEnabled: (subId: string, renewalId: string, enabled: boolean) => Promise<void>;
  addPurchase: (input: OneTimePurchaseInput) => Promise<void>;
  updatePurchase: (id: string, input: OneTimePurchaseInput) => Promise<void>;
  deletePurchase: (id: string) => Promise<void>;
  deletePurchases: (ids: string[]) => Promise<void>;
  setItemsCategory: (
    kind: 'subscriptions' | 'purchases',
    ids: string[],
    categoryId: string | undefined,
  ) => Promise<void>;
  addCategory: (input: CategoryInput) => Promise<void>;
  updateCategory: (id: string, input: CategoryInput) => Promise<void>;
  deleteCategory: (id: string) => Promise<void>;
  updatePreferences: (patch: PreferencesPatch) => Promise<void>;
  exportJson: () => Promise<void>;
  exportSubscriptionsCsv: () => Promise<void>;
  exportPurchasesCsv: () => Promise<void>;
  exportIcs: () => Promise<void>;
  importJson: () => Promise<void>;
  importSubscriptionsCsv: () => Promise<void>;
  importPurchasesCsv: () => Promise<void>;
  checkRemindersNow: () => Promise<void>;
  /* AI-friendly variants that resolve / create categories by name and apply
   * partial updates in a single persist. Mirror addSubscription/etc but take
   * shapes the LLM finds easier to produce. */
  addSubscriptionByName: (
    input: Omit<SubscriptionInput, 'categoryId'>,
    categoryName?: string,
  ) => Promise<Subscription>;
  addPurchaseByName: (
    input: Omit<OneTimePurchaseInput, 'categoryId'>,
    categoryName?: string,
  ) => Promise<OneTimePurchase>;
  updateSubscriptionPatch: (
    id: string,
    patch: SubscriptionPatch,
  ) => Promise<Subscription>;
  updatePurchasePatch: (
    id: string,
    patch: PurchasePatch,
  ) => Promise<OneTimePurchase>;
  /** Iterate every sub / purchase with a website but no logo and fetch one. */
  backfillLogos: () => Promise<{ found: number; fetched: number }>;
  /** Wipe subscriptions, purchases, categories, cancellation log, and AI chat
   * history. Preferences and the data directory are preserved. Export files
   * the user has saved separately are untouched. */
  resetAllData: () => Promise<void>;
}

/** A plain partial, or a function of the latest preferences (for nested merges). */
export type PreferencesPatch =
  | Partial<Preferences>
  | ((current: Preferences) => Partial<Preferences>);

/** Patch shape accepted by the AI update tools. `categoryName` (when present)
 * is resolved to `categoryId` — pass `null` or `""` to clear the category. */
export type SubscriptionPatch = Partial<SubscriptionInput> & {
  categoryName?: string | null;
};
export type PurchasePatch = Partial<OneTimePurchaseInput> & {
  categoryName?: string | null;
};

export const useAppData = (): AppDataApi => {
  const [data, setData] = useState<AppData | null>(null);
  const [dataDir, setDataDir] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [rates, setRates] = useState<FxRates | null>(null);
  /**
   * Synchronous mirror of `data`. Mutators that may be invoked multiple times
   * within a single React render cycle (e.g. AI batch tool calls) must read
   * from this ref instead of the `data` closure variable — otherwise the
   * second call sees a pre-mutation snapshot and silently overwrites the
   * first call's persist.
   */
  const dataRef = useRef<AppData | null>(null);
  /** Tail of the save queue — saves run strictly in call order. */
  const saveChain = useRef<Promise<void>>(Promise.resolve());

  const refresh = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      // Let queued saves land first so the reload can't resurrect older data.
      await saveChain.current;
      const [dir, d] = await Promise.all([window.api.getDataDir(), window.api.loadData()]);
      setDataDir(dir);
      setData(d);
      dataRef.current = d;
    } catch (err) {
      // On web a network/Supabase failure throws here — surface it with a retry
      // instead of leaving the app stuck on a blank screen.
      setLoadError((err as Error).message || 'Could not load your data.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const loadRates = useCallback(async () => {
    const r = await window.api.getRates();
    setRates(r);
  }, []);

  // Rates always load — the default currency is the single conversion target
  // and is always set. Refetch whenever it changes.
  const defaultCurrency = data?.preferences.defaultCurrency;
  useEffect(() => {
    if (defaultCurrency) void loadRates();
    else setRates(null);
  }, [defaultCurrency, loadRates]);

  const refreshRatesPublic = useCallback(async () => {
    const r = await window.api.refreshRates();
    setRates(r);
    if (r) toast.success('Exchange rates refreshed');
    else
      toast.error('Could not refresh rates', {
        description: 'Couldn’t reach the exchange-rate service. Check your connection and try again.',
      });
  }, []);

  /** Bumped on every persist; lets a failed save know whether newer state exists. */
  const persistVersion = useRef(0);

  /**
   * Optimistically applies `next` (ref + state, synchronously, so the next
   * mutation builds on it) and enqueues the save behind any in-flight ones.
   * On failure: toast, then resync from disk unless a newer mutation has
   * already been queued (that save writes a full snapshot of the UI state).
   * The returned promise rejects with a `SaveError` so callers skip their
   * success feedback; the global rejection handler ignores `SaveError`.
   */
  const persist = useCallback((next: AppData): Promise<void> => {
    dataRef.current = next;
    setData(next);
    const version = ++persistVersion.current;
    const save = saveChain.current.then(() => window.api.saveData(next));
    saveChain.current = save.then(
      () => undefined,
      async (err: unknown) => {
        toast.error('Couldn’t save your changes', {
          description: (err as Error)?.message || String(err),
        });
        if (persistVersion.current !== version) return;
        try {
          const fresh = await window.api.loadData();
          if (persistVersion.current !== version) return;
          dataRef.current = fresh;
          setData(fresh);
        } catch {
          // Reload failed too — keep the optimistic state on screen.
        }
      },
    );
    return save.catch((err: unknown) => {
      throw new SaveError(err);
    });
  }, []);

  /** Persist a change derived from the latest state (never a stale closure). */
  const mutate = useCallback(
    (fn: (current: AppData) => AppData): Promise<void> => {
      const current = dataRef.current;
      if (!current) return Promise.resolve();
      return persist(fn(current));
    },
    [persist],
  );

  const chooseDataDir = useCallback(async () => {
    // Queued saves must land in the old directory before we switch.
    await saveChain.current;
    const chosen = await window.api.chooseDataDir();
    if (!chosen) return;
    setDataDir(chosen);
    const reloaded = await window.api.loadData();
    dataRef.current = reloaded;
    setData(reloaded);
    toast.success('Data directory updated', { description: chosen });
  }, []);

  const addSubscription = useCallback(
    async (input: SubscriptionInput) => {
      const current = dataRef.current;
      if (!current) return;
      const baseSub: Subscription = {
        id: crypto.randomUUID(),
        ...input,
        renewals: [],
        createdAt: nowIso(),
        updatedAt: nowIso(),
      };
      const sub = autoFillSub(baseSub, new Date());
      await persist({ ...current, subscriptions: [...current.subscriptions, sub] });
      toast.success('Subscription added', { description: sub.name });
      if (current.preferences.enableLogoFetch && sub.website && !sub.logoUrl) {
        const logoUrl = await window.api.fetchLogo(sub.website);
        if (logoUrl) {
          await mutate((latest) => ({
            ...latest,
            subscriptions: latest.subscriptions.map((s) =>
              s.id === sub.id ? { ...s, logoUrl } : s,
            ),
          }));
        }
      }
    },
    [persist, mutate],
  );

  const setRenewalEnabled = useCallback(
    async (subId: string, renewalId: string, enabled: boolean) => {
      const current = dataRef.current;
      if (!current) return;
      const next: AppData = {
        ...current,
        subscriptions: current.subscriptions.map((s) =>
          s.id === subId
            ? {
                ...s,
                renewals: s.renewals.map((r) => (r.id === renewalId ? { ...r, enabled } : r)),
                updatedAt: nowIso(),
              }
            : s,
        ),
      };
      await persist(next);
    },
    [persist],
  );

  /**
   * Cancellation-log update for a status flip on any path. Going inactive logs
   * the savings (the toast from `announceStatusChange` offers "Don't log");
   * reactivating revokes them.
   */
  const statusChangeLog = useCallback(
    (
      current: AppData,
      sub: Subscription,
      prevStatus: Subscription['status'],
    ): ReturnType<typeof applyStatusChangeToLog> =>
      applyStatusChangeToLog(current.cancellationLog, sub, prevStatus, true, nowIso()),
    [],
  );

  /**
   * Feedback after subscriptions change status. Deactivations get one toast
   * with Undo (restores the subscriptions and drops the savings entries the
   * change added) and "Don't log" (keeps them inactive, drops only those
   * entries). Reactivations just note that savings were removed.
   */
  const announceStatusChange = useCallback(
    (
      before: Subscription[],
      after: Subscription[],
      addedLog: CancellationLogEntry[],
      change: CancellationLogChange,
    ): void => {
      const afterById = new Map(after.map((s) => [s.id, s]));
      const deactivated = before.filter(
        (b) => b.status === 'active' && afterById.get(b.id)?.status === 'inactive',
      );
      if (deactivated.length === 0) {
        toastLogChange(change);
        return;
      }
      const addedIds = new Set(addedLog.map((e) => e.id));
      const dropAdded = (latest: AppData): AppData => ({
        ...latest,
        cancellationLog: latest.cancellationLog.filter((e) => !addedIds.has(e.id)),
      });
      const single = deactivated.length === 1 ? addedLog[0] : undefined;
      toast.success(
        deactivated.length === 1
          ? `${deactivated[0].name} marked inactive`
          : `${deactivated.length} subscriptions marked inactive`,
        {
          description:
            addedLog.length === 0
              ? undefined
              : single && single.monthlyEquivalent > 0
                ? `Logged ~${formatCurrency(single.monthlyEquivalent * 12, single.currency)}/yr to cancellation savings.`
                : 'Logged to cancellation savings.',
          action: {
            label: 'Undo',
            onClick: () => {
              const prevById = new Map(deactivated.map((s) => [s.id, s]));
              void mutate((latest) =>
                dropAdded({
                  ...latest,
                  subscriptions: latest.subscriptions.map((s) => prevById.get(s.id) ?? s),
                }),
              );
            },
          },
          cancel:
            addedLog.length > 0
              ? { label: 'Don’t log', onClick: () => void mutate(dropAdded) }
              : undefined,
          duration: 8000,
        },
      );
    },
    [mutate],
  );

  const updateSubscription = useCallback(
    async (id: string, input: SubscriptionInput) => {
      const current = dataRef.current;
      if (!current) return;
      const target = current.subscriptions.find((s) => s.id === id);
      if (!target) return;
      // autoFillSub = trim + backfill + roll forward past today, so an edit
      // that moves renewalDate into the past doesn't leave it stale.
      const updated = autoFillSub({
        ...target,
        ...input,
        priceHistory: recordPriceChange(target, input.cost, input.currency),
        updatedAt: nowIso(),
      });
      const { log, change } = statusChangeLog(current, updated, target.status);
      await persist({
        ...current,
        subscriptions: current.subscriptions.map((s) => (s.id === id ? updated : s)),
        cancellationLog: log,
      });
      if (updated.status === target.status) toast.success('Subscription updated');
      announceStatusChange([target], [updated], addedEntries(current, log), change);
    },
    [persist, statusChangeLog, announceStatusChange],
  );

  const toggleSubscriptionStatus = useCallback(
    async (id: string) => {
      const current = dataRef.current;
      if (!current) return;
      const target = current.subscriptions.find((s) => s.id === id);
      if (!target) return;
      const flipped: Subscription = {
        ...target,
        status: target.status === 'active' ? 'inactive' : 'active',
        updatedAt: nowIso(),
      };
      // Reactivating rolls a stale renewalDate forward past today.
      const updated = flipped.status === 'active' ? autoFillSub(flipped) : flipped;
      const { log, change } = statusChangeLog(current, updated, target.status);
      await persist({
        ...current,
        subscriptions: current.subscriptions.map((s) => (s.id === id ? updated : s)),
        cancellationLog: log,
      });
      announceStatusChange([target], [updated], addedEntries(current, log), change);
    },
    [persist, statusChangeLog, announceStatusChange],
  );

  const deactivateSubscriptions = useCallback(
    async (ids: string[]) => {
      const current = dataRef.current;
      if (!current) return;
      const targets = current.subscriptions.filter(
        (s) => ids.includes(s.id) && s.status === 'active',
      );
      if (targets.length === 0) return;
      let log = current.cancellationLog;
      const updatedById = new Map<string, Subscription>();
      for (const t of targets) {
        const updated: Subscription = { ...t, status: 'inactive', updatedAt: nowIso() };
        log = applyStatusChangeToLog(log, updated, t.status, true, nowIso()).log;
        updatedById.set(t.id, updated);
      }
      await persist({
        ...current,
        subscriptions: current.subscriptions.map((s) => updatedById.get(s.id) ?? s),
        cancellationLog: log,
      });
      announceStatusChange(targets, [...updatedById.values()], addedEntries(current, log), null);
    },
    [persist, announceStatusChange],
  );

  const deleteSubscriptions = useCallback(
    async (ids: string[]) => {
      const current = dataRef.current;
      if (!current) return;
      const removed = current.subscriptions.filter((s) => ids.includes(s.id));
      if (removed.length === 0) return;
      await persist({
        ...current,
        subscriptions: current.subscriptions.filter((s) => !ids.includes(s.id)),
      });
      toast.success(
        removed.length === 1 ? 'Subscription deleted' : `${removed.length} subscriptions deleted`,
        {
          description: removed.length === 1 ? removed[0].name : undefined,
          action: {
            label: 'Undo',
            onClick: () =>
              void mutate((latest) => ({
                ...latest,
                subscriptions: [...latest.subscriptions, ...removed],
              })),
          },
        },
      );
    },
    [persist, mutate],
  );

  const deleteSubscription = useCallback(
    (id: string) => deleteSubscriptions([id]),
    [deleteSubscriptions],
  );

  const addPurchase = useCallback(
    async (input: OneTimePurchaseInput) => {
      const current = dataRef.current;
      if (!current) return;
      const p: OneTimePurchase = {
        id: crypto.randomUUID(),
        ...input,
        createdAt: nowIso(),
        updatedAt: nowIso(),
      };
      await persist({ ...current, oneTimePurchases: [...current.oneTimePurchases, p] });
      toast.success('Purchase added', { description: p.name });
      if (current.preferences.enableLogoFetch && p.website && !p.logoUrl) {
        const logoUrl = await window.api.fetchLogo(p.website);
        if (logoUrl) {
          await mutate((latest) => ({
            ...latest,
            oneTimePurchases: latest.oneTimePurchases.map((q) =>
              q.id === p.id ? { ...q, logoUrl } : q,
            ),
          }));
        }
      }
    },
    [persist, mutate],
  );

  const updatePurchase = useCallback(
    async (id: string, input: OneTimePurchaseInput) => {
      const current = dataRef.current;
      if (!current) return;
      const next: AppData = {
        ...current,
        oneTimePurchases: current.oneTimePurchases.map((p) =>
          p.id === id ? { ...p, ...input, updatedAt: nowIso() } : p,
        ),
      };
      await persist(next);
      toast.success('Purchase updated');
    },
    [persist],
  );

  const deletePurchases = useCallback(
    async (ids: string[]) => {
      const current = dataRef.current;
      if (!current) return;
      const removed = current.oneTimePurchases.filter((p) => ids.includes(p.id));
      if (removed.length === 0) return;
      await persist({
        ...current,
        oneTimePurchases: current.oneTimePurchases.filter((p) => !ids.includes(p.id)),
      });
      toast.success(removed.length === 1 ? 'Purchase deleted' : `${removed.length} purchases deleted`, {
        description: removed.length === 1 ? removed[0].name : undefined,
        action: {
          label: 'Undo',
          onClick: () =>
            void mutate((latest) => ({
              ...latest,
              oneTimePurchases: [...latest.oneTimePurchases, ...removed],
            })),
        },
      });
    },
    [persist, mutate],
  );

  const deletePurchase = useCallback((id: string) => deletePurchases([id]), [deletePurchases]);

  /** Bulk re-categorize subscriptions or purchases, with Undo. */
  const setItemsCategory = useCallback(
    async (kind: 'subscriptions' | 'purchases', ids: string[], categoryId: string | undefined) => {
      const current = dataRef.current;
      if (!current) return;
      const items = kind === 'subscriptions' ? current.subscriptions : current.oneTimePurchases;
      const previous = new Map<string, string | undefined>(
        items.filter((i) => ids.includes(i.id)).map((i) => [i.id, i.categoryId]),
      );
      if (previous.size === 0) return;
      const recategorize = (data: AppData, pick: (id: string) => string | undefined): AppData => {
        const set = <T extends { id: string; categoryId?: string }>(list: T[]): T[] =>
          list.map((i) => (previous.has(i.id) ? { ...i, categoryId: pick(i.id) } : i));
        return kind === 'subscriptions'
          ? { ...data, subscriptions: set(data.subscriptions) }
          : { ...data, oneTimePurchases: set(data.oneTimePurchases) };
      };
      await persist(recategorize(current, () => categoryId));
      toast.success(
        previous.size === 1 ? 'Category updated' : `Category updated on ${previous.size} items`,
        {
          action: {
            label: 'Undo',
            onClick: () => void mutate((latest) => recategorize(latest, (id) => previous.get(id))),
          },
        },
      );
    },
    [persist, mutate],
  );

  const addCategory = useCallback(
    async (input: CategoryInput) => {
      const current = dataRef.current;
      if (!current) return;
      const c: Category = { id: crypto.randomUUID(), ...input };
      await persist({ ...current, categories: [...current.categories, c] });
      toast.success('Category added', { description: c.name });
    },
    [persist],
  );

  const updateCategory = useCallback(
    async (id: string, input: CategoryInput) => {
      const current = dataRef.current;
      if (!current) return;
      const next: AppData = {
        ...current,
        categories: current.categories.map((c) => (c.id === id ? { ...c, ...input } : c)),
      };
      await persist(next);
      toast.success('Category updated');
    },
    [persist],
  );

  const deleteCategory = useCallback(
    async (id: string) => {
      const current = dataRef.current;
      if (!current) return;
      const removed = current.categories.find((c) => c.id === id);
      const clear = <T extends { categoryId?: string }>(items: T[]): T[] =>
        items.map((i) => (i.categoryId === id ? { ...i, categoryId: undefined } : i));
      const next: AppData = {
        ...current,
        categories: current.categories.filter((c) => c.id !== id),
        subscriptions: clear(current.subscriptions),
        oneTimePurchases: clear(current.oneTimePurchases),
      };
      await persist(next);
      toast.success('Category deleted', {
        description: removed?.name,
        action: removed
          ? {
              label: 'Undo',
              onClick: () => {
                const latest = dataRef.current;
                if (!latest) return;
                // Restores the category; items previously tagged with it stay
                // untagged (their link was cleared on delete).
                void persist({
                  ...latest,
                  categories: [...latest.categories, removed],
                });
              },
            }
          : undefined,
      });
    },
    [persist],
  );

  const updatePreferences = useCallback(
    async (patch: PreferencesPatch) => {
      await mutate((current) => {
        // A function patch derives nested objects (notify, aiAssistant) from
        // the latest prefs, so rapid toggles can't undo each other.
        const resolved = typeof patch === 'function' ? patch(current.preferences) : patch;
        return { ...current, preferences: { ...current.preferences, ...resolved } };
      });
    },
    [mutate],
  );

  /**
   * Wipe all tracked entities (subscriptions, purchases, categories,
   * cancellation log) and clear the AI chat history. Preferences and the
   * data directory choice are preserved — that includes theme, currency,
   * notification settings, AI key reference, etc. Export files the user
   * created via the Export buttons are untouched (they live as separate
   * user files, not inside subs-manager.json).
   */
  const resetAllData = useCallback(async (): Promise<void> => {
    const current = dataRef.current;
    if (!current) return;
    // Snapshot the full pre-reset state so the toast can restore it.
    const snapshot = current;
    const emptied: AppData = {
      version: 1,
      subscriptions: [],
      oneTimePurchases: [],
      categories: [],
      preferences: current.preferences,
      cancellationLog: [],
    };
    await persist(emptied);
    toast.success('All tracked data has been reset', {
      description: 'Subscriptions, purchases, categories and chat cleared.',
      action: {
        label: 'Undo',
        onClick: () => void persist(snapshot),
      },
      duration: 10000,
    });
  }, [persist]);

  const exportJson = useCallback(async () => {
    if (!data) return;
    const content = JSON.stringify(data, null, 2);
    const stamp = todayLocalIso();
    const path = await window.api.saveFile(`subs-manager-${stamp}.json`, content, [
      { name: 'JSON', extensions: ['json'] },
    ]);
    if (path) toast.success('Exported', { description: path });
  }, [data]);

  const exportSubscriptionsCsv = useCallback(async () => {
    if (!data) return;
    const catName = (id?: string): string =>
      id ? data.categories.find((c) => c.id === id)?.name ?? '' : '';
    const rows = data.subscriptions.map((s) => ({
      name: s.name,
      cost: s.cost,
      currency: s.currency,
      billingCycle: s.billingCycle,
      renewalDate: s.renewalDate,
      subscribedSince: s.subscribedSince,
      status: s.status,
      category: catName(s.categoryId),
      website: s.website ?? '',
      notes: s.notes ?? '',
      // Same basis as the app's lifetime figures: enabled renewals only.
      renewals: renewalCount(s),
      lifetimePaid: lifetimeSpend(s).toFixed(2),
    }));
    const stamp = todayLocalIso();
    const path = await window.api.saveFile(
      `subscriptions-${stamp}.csv`,
      Papa.unparse(csvSafeRows(rows)),
      [{ name: 'CSV', extensions: ['csv'] }],
    );
    if (path) toast.success('Subscriptions exported', { description: path });
  }, [data]);

  const exportIcs = useCallback(async () => {
    if (!data) return;
    const content = buildIcs(data);
    const stamp = todayLocalIso();
    const path = await window.api.saveFile(`subs-manager-${stamp}.ics`, content, [
      { name: 'iCalendar', extensions: ['ics'] },
    ]);
    if (path) toast.success('Calendar exported', { description: path });
  }, [data]);

  const checkRemindersNow = useCallback(async () => {
    const result = await window.api.checkRemindersNow();
    toast.success(
      result.fired === 0
        ? 'No reminders due'
        : `Fired ${result.fired} reminder${result.fired === 1 ? '' : 's'}`,
    );
    await refresh();
  }, [refresh]);

  const exportPurchasesCsv = useCallback(async () => {
    if (!data) return;
    const catName = (id?: string): string =>
      id ? data.categories.find((c) => c.id === id)?.name ?? '' : '';
    const rows = data.oneTimePurchases.map((p) => ({
      name: p.name,
      cost: p.cost,
      currency: p.currency,
      purchaseDate: p.purchaseDate,
      category: catName(p.categoryId),
      website: p.website ?? '',
      notes: p.notes ?? '',
    }));
    const stamp = todayLocalIso();
    const path = await window.api.saveFile(
      `purchases-${stamp}.csv`,
      Papa.unparse(csvSafeRows(rows)),
      [{ name: 'CSV', extensions: ['csv'] }],
    );
    if (path) toast.success('Purchases exported', { description: path });
  }, [data]);

  // Replaces everything; the caller (Settings) confirms before calling.
  const importJson = useCallback(async () => {
    if (!dataRef.current) return;
    const file = await window.api.openFile([{ name: 'JSON', extensions: ['json'] }]);
    if (!file) return;
    const result = parseBackupJson(file.content);
    if (!result.ok) {
      toast.error('Import failed — nothing was imported', {
        description: result.errors.join('\n'),
      });
      return;
    }
    try {
      await persist(result.data);
      toast.success('Data imported', { description: file.path });
    } catch (err) {
      if (!(err instanceof SaveError)) {
        toast.error('Import failed', { description: (err as Error).message });
      }
    }
  }, [persist]);

  const findOrCreateCategoryByName = useCallback(
    (current: AppData, name: string): { data: AppData; id: string | undefined } => {
      const trimmed = name.trim();
      if (!trimmed) return { data: current, id: undefined };
      const existing = current.categories.find((c) => c.name.toLowerCase() === trimmed.toLowerCase());
      if (existing) return { data: current, id: existing.id };
      const created: Category = { id: crypto.randomUUID(), name: trimmed };
      return { data: { ...current, categories: [...current.categories, created] }, id: created.id };
    },
    [],
  );

  const importSubscriptionsCsv = useCallback(async () => {
    if (!dataRef.current) return;
    const file = await window.api.openFile([{ name: 'CSV', extensions: ['csv'] }]);
    if (!file) return;
    try {
      const parsed = Papa.parse<Record<string, string>>(file.content, {
        header: true,
        skipEmptyLines: true,
      });
      if (parsed.errors.length > 0) throw new Error(parsed.errors[0].message);
      let working = dataRef.current;
      if (!working) return;
      const result = parseSubscriptionCsv(parsed.data, {
        defaultCurrency: working.preferences.defaultCurrency,
        today: todayLocalIso(),
        existing: working.subscriptions,
      });
      const added: Subscription[] = [];
      for (const { input, categoryName } of result.items) {
        const { id: categoryId, data: nextData } = findOrCreateCategoryByName(working, categoryName);
        working = nextData;
        added.push(
          autoFillSub({
            id: crypto.randomUUID(),
            ...input,
            categoryId,
            renewals: [],
            createdAt: nowIso(),
            updatedAt: nowIso(),
          }),
        );
      }
      if (added.length > 0) {
        await persist({ ...working, subscriptions: [...working.subscriptions, ...added] });
      }
      const summary = summarizeCsvImport('subscription', added.length, result.skipped);
      if (result.skipped.length === 0) toast.success(summary.title);
      else toast.warning(summary.title, { description: summary.description });
    } catch (err) {
      if (!(err instanceof SaveError)) {
        toast.error('Import failed', { description: (err as Error).message });
      }
    }
  }, [persist, findOrCreateCategoryByName]);

  const importPurchasesCsv = useCallback(async () => {
    if (!dataRef.current) return;
    const file = await window.api.openFile([{ name: 'CSV', extensions: ['csv'] }]);
    if (!file) return;
    try {
      const parsed = Papa.parse<Record<string, string>>(file.content, {
        header: true,
        skipEmptyLines: true,
      });
      if (parsed.errors.length > 0) throw new Error(parsed.errors[0].message);
      let working = dataRef.current;
      if (!working) return;
      const result = parsePurchaseCsv(parsed.data, {
        defaultCurrency: working.preferences.defaultCurrency,
        today: todayLocalIso(),
        existing: working.oneTimePurchases,
      });
      const added: OneTimePurchase[] = [];
      for (const { input, categoryName } of result.items) {
        const { id: categoryId, data: nextData } = findOrCreateCategoryByName(working, categoryName);
        working = nextData;
        added.push({
          id: crypto.randomUUID(),
          ...input,
          categoryId,
          createdAt: nowIso(),
          updatedAt: nowIso(),
        });
      }
      if (added.length > 0) {
        await persist({ ...working, oneTimePurchases: [...working.oneTimePurchases, ...added] });
      }
      const summary = summarizeCsvImport('purchase', added.length, result.skipped);
      if (result.skipped.length === 0) toast.success(summary.title);
      else toast.warning(summary.title, { description: summary.description });
    } catch (err) {
      if (!(err instanceof SaveError)) {
        toast.error('Import failed', { description: (err as Error).message });
      }
    }
  }, [persist, findOrCreateCategoryByName]);

  // Fill historical gaps and roll renewals forward past today — on first load
  // and again whenever the local day changes (midnight, or focus after sleep).
  const todayIso = isoLocal(useToday());
  const autoFilledFor = useRef<string | null>(null);
  useEffect(() => {
    const current = dataRef.current;
    if (!data || !current || autoFilledFor.current === todayIso) return;
    autoFilledFor.current = todayIso;
    const today = new Date();
    const updated = current.subscriptions.map((s) => autoFillSub(s, today));
    const changed = updated.some((s, i) => s !== current.subscriptions[i]);
    // The web reminder cron runs in UTC; it needs the user's zone to compute
    // "today" and quiet hours correctly.
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const tzChanged = !!timezone && current.preferences.timezone !== timezone;
    if (changed || tzChanged) {
      void persist({
        ...current,
        subscriptions: updated,
        preferences: tzChanged ? { ...current.preferences, timezone } : current.preferences,
      });
    }
  }, [data, todayIso, persist]);

  /* ===== AI-friendly mutators (resolve category by name, apply patches) ===== */

  /**
   * Fire-and-forget logo fetch for a freshly-added item. Re-reads the latest
   * data via dataRef before re-persisting so it doesn't clobber concurrent
   * AI batch adds.
   */
  const fetchAndAttachLogoSubscription = useCallback(
    (subId: string, website: string): void => {
      void (async () => {
        const logoUrl = await window.api.fetchLogo(website);
        if (!logoUrl) return;
        const latest = dataRef.current;
        if (!latest) return;
        await persist({
          ...latest,
          subscriptions: latest.subscriptions.map((s) =>
            s.id === subId ? { ...s, logoUrl } : s,
          ),
        });
      })();
    },
    [persist],
  );

  const fetchAndAttachLogoPurchase = useCallback(
    (purchaseId: string, website: string): void => {
      void (async () => {
        const logoUrl = await window.api.fetchLogo(website);
        if (!logoUrl) return;
        const latest = dataRef.current;
        if (!latest) return;
        await persist({
          ...latest,
          oneTimePurchases: latest.oneTimePurchases.map((p) =>
            p.id === purchaseId ? { ...p, logoUrl } : p,
          ),
        });
      })();
    },
    [persist],
  );

  const addSubscriptionByName = useCallback(
    async (
      input: Omit<SubscriptionInput, 'categoryId'>,
      categoryName?: string,
    ): Promise<Subscription> => {
      const current = dataRef.current;
      if (!current) throw new Error('Data not loaded');
      let working = current;
      let categoryId: string | undefined;
      if (categoryName && categoryName.trim()) {
        const found = findOrCreateCategoryByName(working, categoryName);
        working = found.data;
        categoryId = found.id;
      }
      const baseSub: Subscription = {
        id: crypto.randomUUID(),
        ...input,
        categoryId,
        renewals: [],
        createdAt: nowIso(),
        updatedAt: nowIso(),
      };
      const sub = autoFillSub(baseSub, new Date());
      await persist({ ...working, subscriptions: [...working.subscriptions, sub] });
      if (current.preferences.enableLogoFetch && sub.website && !sub.logoUrl) {
        fetchAndAttachLogoSubscription(sub.id, sub.website);
      }
      return sub;
    },
    [persist, findOrCreateCategoryByName, fetchAndAttachLogoSubscription],
  );

  const addPurchaseByName = useCallback(
    async (
      input: Omit<OneTimePurchaseInput, 'categoryId'>,
      categoryName?: string,
    ): Promise<OneTimePurchase> => {
      const current = dataRef.current;
      if (!current) throw new Error('Data not loaded');
      let working = current;
      let categoryId: string | undefined;
      if (categoryName && categoryName.trim()) {
        const found = findOrCreateCategoryByName(working, categoryName);
        working = found.data;
        categoryId = found.id;
      }
      const p: OneTimePurchase = {
        id: crypto.randomUUID(),
        ...input,
        categoryId,
        createdAt: nowIso(),
        updatedAt: nowIso(),
      };
      await persist({ ...working, oneTimePurchases: [...working.oneTimePurchases, p] });
      if (current.preferences.enableLogoFetch && p.website && !p.logoUrl) {
        fetchAndAttachLogoPurchase(p.id, p.website);
      }
      return p;
    },
    [persist, findOrCreateCategoryByName, fetchAndAttachLogoPurchase],
  );

  const updateSubscriptionPatch = useCallback(
    async (id: string, patch: SubscriptionPatch): Promise<Subscription> => {
      const current = dataRef.current;
      if (!current) throw new Error('Data not loaded');
      const target = current.subscriptions.find((s) => s.id === id);
      if (!target) throw new Error(`Subscription ${id} not found`);

      // Separate categoryName from the rest. It's not a Subscription field —
      // resolve it to a categoryId (creating the category if missing) so the
      // update actually takes effect.
      const { categoryName, ...rest } = patch;
      let working = current;
      let mergedPatch: Partial<SubscriptionInput> = rest;
      if (categoryName !== undefined) {
        const trimmed = (categoryName ?? '').trim();
        if (trimmed) {
          const found = findOrCreateCategoryByName(working, trimmed);
          working = found.data;
          mergedPatch = { ...mergedPatch, categoryId: found.id };
        } else {
          mergedPatch = { ...mergedPatch, categoryId: undefined };
        }
      }

      const next: Subscription = {
        ...target,
        ...mergedPatch,
        priceHistory: recordPriceChange(target, mergedPatch.cost, mergedPatch.currency),
        updatedAt: nowIso(),
      };
      // Same reconciliation as updateSubscription: trim orphaned renewals,
      // backfill, and roll a past renewalDate forward.
      const reconciled = autoFillSub(next);
      const { log, change } = statusChangeLog(working, reconciled, target.status);
      await persist({
        ...working,
        subscriptions: working.subscriptions.map((s) => (s.id === id ? reconciled : s)),
        cancellationLog: log,
      });
      announceStatusChange([target], [reconciled], addedEntries(working, log), change);
      return reconciled;
    },
    [persist, findOrCreateCategoryByName, statusChangeLog, announceStatusChange],
  );

  const backfillLogos = useCallback(async (): Promise<{ found: number; fetched: number }> => {
    const current = dataRef.current;
    if (!current) return { found: 0, fetched: 0 };
    const subsNeeded = current.subscriptions.filter((s) => s.website && !s.logoUrl);
    const purchasesNeeded = current.oneTimePurchases.filter((p) => p.website && !p.logoUrl);
    const found = subsNeeded.length + purchasesNeeded.length;
    if (found === 0) return { found, fetched: 0 };

    let fetched = 0;
    for (const sub of subsNeeded) {
      const logoUrl = await window.api.fetchLogo(sub.website!);
      if (!logoUrl) continue;
      const latest = dataRef.current;
      if (!latest) break;
      await persist({
        ...latest,
        subscriptions: latest.subscriptions.map((s) =>
          s.id === sub.id ? { ...s, logoUrl } : s,
        ),
      });
      fetched++;
    }
    for (const p of purchasesNeeded) {
      const logoUrl = await window.api.fetchLogo(p.website!);
      if (!logoUrl) continue;
      const latest = dataRef.current;
      if (!latest) break;
      await persist({
        ...latest,
        oneTimePurchases: latest.oneTimePurchases.map((q) =>
          q.id === p.id ? { ...q, logoUrl } : q,
        ),
      });
      fetched++;
    }
    return { found, fetched };
  }, [persist]);

  const updatePurchasePatch = useCallback(
    async (id: string, patch: PurchasePatch): Promise<OneTimePurchase> => {
      const current = dataRef.current;
      if (!current) throw new Error('Data not loaded');
      const target = current.oneTimePurchases.find((p) => p.id === id);
      if (!target) throw new Error(`Purchase ${id} not found`);

      const { categoryName, ...rest } = patch;
      let working = current;
      let mergedPatch: Partial<OneTimePurchaseInput> = rest;
      if (categoryName !== undefined) {
        const trimmed = (categoryName ?? '').trim();
        if (trimmed) {
          const found = findOrCreateCategoryByName(working, trimmed);
          working = found.data;
          mergedPatch = { ...mergedPatch, categoryId: found.id };
        } else {
          mergedPatch = { ...mergedPatch, categoryId: undefined };
        }
      }

      const next: OneTimePurchase = { ...target, ...mergedPatch, updatedAt: nowIso() };
      await persist({
        ...working,
        oneTimePurchases: working.oneTimePurchases.map((p) => (p.id === id ? next : p)),
      });
      return next;
    },
    [persist, findOrCreateCategoryByName],
  );

  return {
    data,
    dataDir,
    loading,
    loadError,
    rates,
    refresh,
    refreshRates: refreshRatesPublic,
    chooseDataDir,
    addSubscription,
    updateSubscription,
    toggleSubscriptionStatus,
    deactivateSubscriptions,
    deleteSubscription,
    deleteSubscriptions,
    setRenewalEnabled,
    addPurchase,
    updatePurchase,
    deletePurchase,
    deletePurchases,
    setItemsCategory,
    addCategory,
    updateCategory,
    deleteCategory,
    updatePreferences,
    exportJson,
    exportSubscriptionsCsv,
    exportPurchasesCsv,
    exportIcs,
    importJson,
    importSubscriptionsCsv,
    importPurchasesCsv,
    checkRemindersNow,
    addSubscriptionByName,
    addPurchaseByName,
    updateSubscriptionPatch,
    updatePurchasePatch,
    backfillLogos,
    resetAllData,
  };
};
