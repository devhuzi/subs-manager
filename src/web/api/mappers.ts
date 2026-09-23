import {
  defaultAiAssistantPrefs,
  defaultNotifyPrefs,
  defaultPreferences,
  type AppData,
  type BillingCycle,
  type CancellationLogEntry,
  type Category,
  type ItemStatus,
  type OneTimePurchase,
  type Preferences,
  type Renewal,
  type Subscription,
} from '@shared/types';

/**
 * Maps between the normalized Supabase rows and the `AppData` object the shared
 * renderer expects. Column names are snake_case; the app uses camelCase. Numeric
 * columns arrive as strings from PostgREST, so they're coerced with Number().
 *
 * `fired_alerts` is deliberately NOT round-tripped: it's server-managed by the
 * Phase 4 cron, so the client neither reads nor writes it (omitting it from the
 * upsert payload leaves the server's value untouched).
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
type Row = Record<string, any>;

const num = (v: unknown): number => Number(v);

// ── Category ────────────────────────────────────────────────────────────────
export const categoryToRow = (userId: string, c: Category): Row => ({
  user_id: userId,
  id: c.id,
  name: c.name,
  color: c.color ?? null,
  monthly_budget: c.monthlyBudget ?? null,
});

const rowToCategory = (r: Row): Category => ({
  id: r.id,
  name: r.name,
  ...(r.color != null ? { color: r.color } : {}),
  ...(r.monthly_budget != null ? { monthlyBudget: num(r.monthly_budget) } : {}),
});

// ── Renewal (child of subscription) ─────────────────────────────────────────
export const renewalToRow = (userId: string, subId: string, ren: Renewal): Row => ({
  user_id: userId,
  id: ren.id,
  subscription_id: subId,
  date: ren.date,
  cost: ren.cost,
  currency: ren.currency,
  enabled: ren.enabled ?? true,
});

const rowToRenewal = (r: Row): Renewal => ({
  id: r.id,
  date: r.date,
  cost: num(r.cost),
  currency: r.currency,
  enabled: r.enabled,
});

// ── Subscription (scalar columns; renewals + fired_alerts handled apart) ─────
export const subToRow = (userId: string, s: Subscription): Row => ({
  user_id: userId,
  id: s.id,
  name: s.name,
  cost: s.cost,
  currency: s.currency,
  billing_cycle: s.billingCycle,
  renewal_date: s.renewalDate,
  subscribed_since: s.subscribedSince,
  status: s.status,
  category_id: s.categoryId ?? null,
  website: s.website ?? null,
  notes: s.notes ?? null,
  cancellation_url: s.cancellationUrl ?? null,
  payment_method: s.paymentMethod ?? null,
  logo_url: s.logoUrl ?? null,
  brand_color: s.brandColor ?? null,
  trial: s.trial ?? null,
  alert_config: s.alertConfig ?? null,
  price_history: s.priceHistory ?? null,
  created_at: s.createdAt,
  updated_at: s.updatedAt,
  // fired_alerts intentionally omitted — server-managed.
});

const rowToSub = (r: Row): Omit<Subscription, 'renewals'> => ({
  id: r.id,
  name: r.name,
  cost: num(r.cost),
  currency: r.currency,
  billingCycle: r.billing_cycle as BillingCycle,
  renewalDate: r.renewal_date,
  subscribedSince: r.subscribed_since,
  status: r.status as ItemStatus,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
  ...(r.category_id != null ? { categoryId: r.category_id } : {}),
  ...(r.website != null ? { website: r.website } : {}),
  ...(r.notes != null ? { notes: r.notes } : {}),
  ...(r.cancellation_url != null ? { cancellationUrl: r.cancellation_url } : {}),
  ...(r.payment_method != null ? { paymentMethod: r.payment_method } : {}),
  ...(r.logo_url != null ? { logoUrl: r.logo_url } : {}),
  ...(r.brand_color != null ? { brandColor: r.brand_color } : {}),
  ...(r.trial != null ? { trial: r.trial } : {}),
  ...(r.alert_config != null ? { alertConfig: r.alert_config } : {}),
  ...(r.price_history != null ? { priceHistory: r.price_history } : {}),
});

// ── One-time purchase ───────────────────────────────────────────────────────
export const purchaseToRow = (userId: string, p: OneTimePurchase): Row => ({
  user_id: userId,
  id: p.id,
  name: p.name,
  cost: p.cost,
  currency: p.currency,
  purchase_date: p.purchaseDate,
  category_id: p.categoryId ?? null,
  website: p.website ?? null,
  notes: p.notes ?? null,
  warranty_ends_at: p.warrantyEndsAt ?? null,
  support_ends_at: p.supportEndsAt ?? null,
  expected_lifespan_months: p.expectedLifespanMonths ?? null,
  payment_method: p.paymentMethod ?? null,
  logo_url: p.logoUrl ?? null,
  brand_color: p.brandColor ?? null,
  created_at: p.createdAt,
  updated_at: p.updatedAt,
});

const rowToPurchase = (r: Row): OneTimePurchase => ({
  id: r.id,
  name: r.name,
  cost: num(r.cost),
  currency: r.currency,
  purchaseDate: r.purchase_date,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
  ...(r.category_id != null ? { categoryId: r.category_id } : {}),
  ...(r.website != null ? { website: r.website } : {}),
  ...(r.notes != null ? { notes: r.notes } : {}),
  ...(r.warranty_ends_at != null ? { warrantyEndsAt: r.warranty_ends_at } : {}),
  ...(r.support_ends_at != null ? { supportEndsAt: r.support_ends_at } : {}),
  ...(r.expected_lifespan_months != null
    ? { expectedLifespanMonths: num(r.expected_lifespan_months) }
    : {}),
  ...(r.payment_method != null ? { paymentMethod: r.payment_method } : {}),
  ...(r.logo_url != null ? { logoUrl: r.logo_url } : {}),
  ...(r.brand_color != null ? { brandColor: r.brand_color } : {}),
});

// ── Cancellation log ────────────────────────────────────────────────────────
export const cancellationToRow = (userId: string, c: CancellationLogEntry): Row => ({
  user_id: userId,
  id: c.id,
  subscription_id: c.subscriptionId ?? null,
  subscription_name: c.subscriptionName,
  cancelled_at: c.cancelledAt,
  monthly_equivalent: c.monthlyEquivalent,
  currency: c.currency,
});

const rowToCancellation = (r: Row): CancellationLogEntry => ({
  id: r.id,
  subscriptionName: r.subscription_name,
  cancelledAt: r.cancelled_at,
  monthlyEquivalent: num(r.monthly_equivalent),
  currency: r.currency,
  ...(r.subscription_id != null ? { subscriptionId: r.subscription_id } : {}),
});

// ── Preferences ─────────────────────────────────────────────────────────────
export const prefsToRow = (userId: string, p: Preferences): Row => ({
  user_id: userId,
  theme: p.theme,
  default_currency: p.defaultCurrency,
  reminder_days: p.reminderDays,
  fx_last_fetched_at: p.fxLastFetchedAt ?? null,
  enable_logo_fetch: p.enableLogoFetch,
  notify: p.notify,
  ai_assistant: p.aiAssistant,
  layout_theme: p.layoutTheme,
  brand_color: p.brandColor ?? null,
  // Only sent when set, so saves keep working against a DB that doesn't have
  // the timezone column yet (migration 20260923130000).
  ...(p.timezone ? { timezone: p.timezone } : {}),
});

const rowToPrefs = (r: Row): Preferences => ({
  ...defaultPreferences(),
  theme: r.theme,
  defaultCurrency: r.default_currency,
  reminderDays: num(r.reminder_days),
  enableLogoFetch: r.enable_logo_fetch,
  layoutTheme: r.layout_theme,
  notify: { ...defaultNotifyPrefs(), ...(r.notify ?? {}) },
  aiAssistant: { ...defaultAiAssistantPrefs(), ...(r.ai_assistant ?? {}) },
  ...(r.fx_last_fetched_at != null ? { fxLastFetchedAt: r.fx_last_fetched_at } : {}),
  ...(r.brand_color != null ? { brandColor: r.brand_color } : {}),
  ...(r.timezone != null ? { timezone: r.timezone } : {}),
});

// ── Assemble AppData from all the loaded rows ───────────────────────────────
export interface LoadedRows {
  categories: Row[];
  subscriptions: Row[];
  renewals: Row[];
  purchases: Row[];
  cancellations: Row[];
  preferences: Row | null;
}

// ── Sync diff helpers (used by saveData to write only deltas) ───────────────

interface HasId {
  id: string;
}

/** Compares two id-keyed lists. `upserts` = new or JSON-changed items; the rest
 * are unchanged. `deleteIds` = ids present before but gone now. */
export const diffById = <T extends HasId>(
  prev: T[],
  next: T[],
): { upserts: T[]; deleteIds: string[] } => {
  const prevMap = new Map(prev.map((x) => [x.id, x]));
  const nextIds = new Set(next.map((x) => x.id));
  const upserts = next.filter((x) => {
    const p = prevMap.get(x.id);
    return !p || JSON.stringify(p) !== JSON.stringify(x);
  });
  const deleteIds = prev.filter((x) => !nextIds.has(x.id)).map((x) => x.id);
  return { upserts, deleteIds };
};

/** Subscription minus its child renewals (and the server-managed firedAlerts),
 * so renewal edits don't needlessly re-upsert the parent row. */
export const subScalar = (s: Subscription): Omit<Subscription, 'renewals' | 'firedAlerts'> => {
  const copy: Record<string, unknown> = { ...s };
  delete copy.renewals;
  delete copy.firedAlerts;
  return copy as Omit<Subscription, 'renewals' | 'firedAlerts'>;
};

export interface FlatRenewal {
  id: string;
  subId: string;
  date: string;
  cost: number;
  currency: string;
  enabled: boolean;
}

/** Flattens every subscription's renewals into one id-keyed list (with subId),
 * so renewals across all subs can be diffed in a single pass. */
export const flattenRenewals = (subs: Subscription[]): FlatRenewal[] =>
  subs.flatMap((s) =>
    (s.renewals ?? []).map((r) => ({
      id: r.id,
      subId: s.id,
      date: r.date,
      cost: r.cost,
      currency: r.currency,
      enabled: r.enabled ?? true,
    })),
  );

export const rowsToAppData = (rows: LoadedRows): AppData => {
  const renBySub = new Map<string, Renewal[]>();
  for (const r of rows.renewals) {
    const list = renBySub.get(r.subscription_id) ?? [];
    list.push(rowToRenewal(r));
    renBySub.set(r.subscription_id, list);
  }
  for (const list of renBySub.values()) {
    list.sort((a, b) => a.date.localeCompare(b.date));
  }

  const subscriptions: Subscription[] = rows.subscriptions.map((s) => ({
    ...rowToSub(s),
    renewals: renBySub.get(s.id) ?? [],
  }));

  return {
    version: 1,
    subscriptions,
    oneTimePurchases: rows.purchases.map(rowToPurchase),
    categories: rows.categories.map(rowToCategory),
    cancellationLog: rows.cancellations.map(rowToCancellation),
    preferences: rows.preferences ? rowToPrefs(rows.preferences) : defaultPreferences(),
  };
};
