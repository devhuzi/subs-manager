import { z } from 'zod';
import type {
  AiToolDef,
  AppData,
  BillingCycle,
  FxRates,
} from '../../../shared/types';
import {
  categoryInputSchema,
  oneTimePurchaseInputSchema,
  subscriptionInputSchema,
  type OneTimePurchaseInput,
  type SubscriptionInput,
} from '../../../shared/schemas';
import type { PurchasePatch, SubscriptionPatch } from '@renderer/hooks/useAppData';
import { monthlyEquivalent, oneTimeAmortizedMonthly } from '../dashboard/spendMetrics';
import { formatCurrency, sumInto } from '@renderer/lib/money';
import { todayLocalIso } from '../../../shared/dates';

/* =========================================================================
 *  Tool definitions exposed to the LLM
 * ======================================================================= */

const BILLING_CYCLES: BillingCycle[] = ['monthly', 'quarterly', 'yearly', 'custom'];

const dateStringDesc = 'ISO date string YYYY-MM-DD';

export const readTools: AiToolDef[] = [
  {
    type: 'function',
    function: {
      name: 'read_summary',
      description:
        "Get a high-level snapshot of the user's spending: monthly cost, annual cost, total lifetime purchases, counts. Use this first when the user asks general questions about their spending.",
      parameters: { type: 'object', properties: {}, required: [] },
    },
  },
  {
    type: 'function',
    function: {
      name: 'read_subscriptions',
      description:
        'List all subscriptions with their key fields. Returns name, cost, currency, billing cycle, status, next renewal date, category name, monthly equivalent, AND the internal id needed for update / delete tools.',
      parameters: {
        type: 'object',
        properties: {
          statusFilter: {
            type: 'string',
            enum: ['active', 'inactive', 'all'],
            description: 'Defaults to "all" if omitted.',
          },
        },
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'read_purchases',
      description:
        'List all one-time purchases with their internal id (needed for update / delete), cost, currency, purchase date, category, amortized monthly cost.',
      parameters: { type: 'object', properties: {}, required: [] },
    },
  },
  {
    type: 'function',
    function: {
      name: 'read_categories',
      description: 'List all categories with their ids.',
      parameters: { type: 'object', properties: {}, required: [] },
    },
  },
];

const subscriptionFields = {
  name: { type: 'string' as const },
  cost: { type: 'number' as const, description: 'Cost per billing cycle' },
  currency: { type: 'string' as const, description: '3-letter ISO, e.g. USD' },
  billingCycle: { type: 'string' as const, enum: BILLING_CYCLES },
  renewalDate: { type: 'string' as const, description: `Next renewal — ${dateStringDesc}` },
  subscribedSince: {
    type: 'string' as const,
    description: `${dateStringDesc} — when the user started. Defaults to today if omitted.`,
  },
  status: { type: 'string' as const, enum: ['active', 'inactive'] },
  categoryName: {
    type: 'string' as const,
    description: 'Category by name (created if it does not exist).',
  },
  website: { type: 'string' as const, description: 'Domain like netflix.com' },
  notes: { type: 'string' as const },
  cancellationUrl: { type: 'string' as const },
  paymentMethod: { type: 'string' as const, description: 'e.g. "Amex …1234"' },
};

const purchaseFields = {
  name: { type: 'string' as const },
  cost: { type: 'number' as const },
  currency: { type: 'string' as const, description: '3-letter ISO' },
  purchaseDate: { type: 'string' as const, description: dateStringDesc },
  categoryName: { type: 'string' as const, description: 'Category by name; created if missing.' },
  website: { type: 'string' as const },
  notes: { type: 'string' as const },
  warrantyEndsAt: { type: 'string' as const, description: dateStringDesc },
  supportEndsAt: { type: 'string' as const, description: dateStringDesc },
  expectedLifespanMonths: {
    type: 'integer' as const,
    description: 'Used to amortize the cost. Defaults to 36 if unset.',
  },
  paymentMethod: { type: 'string' as const, description: 'e.g. "Amex …1234"' },
};

export const mutationTools: AiToolDef[] = [
  {
    type: 'function',
    function: {
      name: 'add_subscription',
      description:
        'Add a new subscription. Will pause for user Approve/Reject — DO NOT call this unless the user has clearly asked to add or track a subscription. Build the args from what the user said; ask for missing required fields rather than guessing.',
      parameters: {
        type: 'object',
        properties: subscriptionFields,
        required: ['name', 'cost', 'currency', 'billingCycle', 'renewalDate'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'add_purchase',
      description: 'Add a new one-time purchase. Pauses for Approve/Reject.',
      parameters: {
        type: 'object',
        properties: purchaseFields,
        required: ['name', 'cost', 'currency', 'purchaseDate'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'add_category',
      description: 'Create a category. Pauses for Approve/Reject.',
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          color: { type: 'string', description: 'Optional hex like #3b82f6' },
        },
        required: ['name'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'update_subscription',
      description:
        'Update an existing subscription. Include only the fields that change in `patch`. Pauses for Approve/Reject.',
      parameters: {
        type: 'object',
        properties: {
          id: { type: 'string', description: 'Subscription id from read_subscriptions' },
          patch: {
            type: 'object',
            properties: subscriptionFields,
          },
        },
        required: ['id', 'patch'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'update_purchase',
      description: 'Update an existing purchase. Only changed fields go in patch. Pauses for Approve/Reject.',
      parameters: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          patch: { type: 'object', properties: purchaseFields },
        },
        required: ['id', 'patch'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'delete_subscription',
      description: 'Permanently delete a subscription. Pauses for explicit Approve.',
      parameters: {
        type: 'object',
        properties: { id: { type: 'string' } },
        required: ['id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'delete_purchase',
      description: 'Permanently delete a one-time purchase. Pauses for explicit Approve.',
      parameters: {
        type: 'object',
        properties: { id: { type: 'string' } },
        required: ['id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'add_subscriptions_bulk',
      description:
        'Add many subscriptions in a single approval card. Use when the user provides a list, CSV, or screenshot of multiple subscriptions to add.',
      parameters: {
        type: 'object',
        properties: {
          items: {
            type: 'array',
            minItems: 1,
            items: {
              type: 'object',
              properties: subscriptionFields,
              required: ['name', 'cost', 'currency', 'billingCycle', 'renewalDate'],
            },
          },
        },
        required: ['items'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'add_purchases_bulk',
      description:
        'Add many one-time purchases in a single approval card. Use when the user provides a list, CSV, or screenshot of multiple purchases.',
      parameters: {
        type: 'object',
        properties: {
          items: {
            type: 'array',
            minItems: 1,
            items: {
              type: 'object',
              properties: purchaseFields,
              required: ['name', 'cost', 'currency', 'purchaseDate'],
            },
          },
        },
        required: ['items'],
      },
    },
  },
];

export const allTools: AiToolDef[] = [...readTools, ...mutationTools];

/* =========================================================================
 *  Dispatcher
 * ======================================================================= */

export interface ToolActions {
  addSubscriptionByName: (
    input: Omit<SubscriptionInput, 'categoryId'>,
    categoryName?: string,
  ) => Promise<{ id: string; name: string }>;
  addPurchaseByName: (
    input: Omit<OneTimePurchaseInput, 'categoryId'>,
    categoryName?: string,
  ) => Promise<{ id: string; name: string }>;
  addCategory: (input: { name: string; color?: string }) => Promise<void>;
  updateSubscriptionPatch: (
    id: string,
    patch: SubscriptionPatch,
  ) => Promise<{ name: string }>;
  updatePurchasePatch: (
    id: string,
    patch: PurchasePatch,
  ) => Promise<{ name: string }>;
  deleteSubscription: (id: string) => Promise<void>;
  deletePurchase: (id: string) => Promise<void>;
}

export interface ProposalDetail {
  label: string;
  value: string;
  was?: string;
}

export interface BulkItemPreview {
  name: string;
  subtitle: string;
}

export interface ConfirmProposal {
  kind: 'add' | 'update' | 'delete' | 'bulk-add';
  toolName: string;
  summary: string;
  details: ProposalDetail[];
  /** For `bulk-add`: a short row per item. */
  bulkItems?: BulkItemPreview[];
  destructive?: boolean;
}

export interface ConfirmResolution {
  approved: boolean;
  /** For bulk-add proposals: indices (into proposal.bulkItems) the user kept.
   * Undefined for non-bulk proposals or when all rows are kept. */
  selectedIndices?: number[];
}

export interface ToolContext {
  /** Latest app data — read per call, so later tool rounds see earlier writes. */
  getData: () => AppData;
  rates: FxRates | null;
  actions: ToolActions;
  requestConfirm: (callId: string, proposal: ConfirmProposal) => Promise<ConfirmResolution>;
}

type DispatchOk = { status: 'ok'; result: unknown };
type DispatchError = { status: 'error'; error: string };
export type DispatchResult = DispatchOk | DispatchError;

const categoryNameById = (data: AppData): Record<string, string> =>
  Object.fromEntries(data.categories.map((c) => [c.id, c.name]));

const today = (): string => todayLocalIso();

const isString = (v: unknown): v is string => typeof v === 'string';
const isNumber = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/* ---- Read tool handlers ---- */

const summarize = (ctx: ToolContext): unknown => {
  const data = ctx.getData();
  const { rates } = ctx;
  const home = data.preferences.defaultCurrency;
  const activeSubs = data.subscriptions.filter((s) => s.status === 'active');
  const monthly = sumInto(
    activeSubs.map((s) => ({ amount: monthlyEquivalent(s), currency: s.currency })),
    home,
    rates,
  );
  const lifetime = sumInto(
    data.oneTimePurchases.map((p) => ({ amount: p.cost, currency: p.currency })),
    home,
    rates,
  );
  return {
    displayCurrency: home,
    monthlyCost: Number(monthly.total.toFixed(2)),
    annualCost: Number((monthly.total * 12).toFixed(2)),
    lifetimePurchases: Number(lifetime.total.toFixed(2)),
    activeSubscriptionCount: activeSubs.length,
    totalSubscriptionCount: data.subscriptions.length,
    oneTimePurchaseCount: data.oneTimePurchases.length,
    categoryCount: data.categories.length,
    unconvertedMonthly: monthly.unconverted,
    unconvertedLifetime: lifetime.unconverted,
    today: today(),
  };
};

const listSubscriptions = (
  ctx: ToolContext,
  args: { statusFilter?: 'active' | 'inactive' | 'all' },
): unknown => {
  const data = ctx.getData();
  const status = args.statusFilter ?? 'all';
  const catName = categoryNameById(data);
  return data.subscriptions
    .filter((s) => status === 'all' || s.status === status)
    .map((s) => ({
      id: s.id,
      name: s.name,
      cost: s.cost,
      currency: s.currency,
      billingCycle: s.billingCycle,
      renewalDate: s.renewalDate,
      subscribedSince: s.subscribedSince,
      status: s.status,
      categoryName: s.categoryId ? catName[s.categoryId] : null,
      website: s.website ?? null,
      notes: s.notes ?? null,
      paymentMethod: s.paymentMethod ?? null,
      monthlyEquivalent: Number(monthlyEquivalent(s).toFixed(2)),
      countedRenewals: s.renewals.filter((r) => r.enabled !== false).length,
      trial: s.trial ?? null,
    }));
};

const listPurchases = (ctx: ToolContext): unknown => {
  const data = ctx.getData();
  const catName = categoryNameById(data);
  return data.oneTimePurchases.map((p) => ({
    id: p.id,
    name: p.name,
    cost: p.cost,
    currency: p.currency,
    purchaseDate: p.purchaseDate,
    categoryName: p.categoryId ? catName[p.categoryId] : null,
    website: p.website ?? null,
    notes: p.notes ?? null,
    paymentMethod: p.paymentMethod ?? null,
    expectedLifespanMonths: p.expectedLifespanMonths ?? 36,
    amortizedMonthly: Number(oneTimeAmortizedMonthly(p).toFixed(2)),
    warrantyEndsAt: p.warrantyEndsAt ?? null,
    supportEndsAt: p.supportEndsAt ?? null,
  }));
};

const listCategories = (ctx: ToolContext): unknown =>
  ctx.getData().categories.map((c) => ({ id: c.id, name: c.name, color: c.color ?? null }));

/* ---- Mutation tool handlers ---- */

const buildSubProposal = (
  kind: 'add' | 'update',
  args: Record<string, unknown>,
  before?: AppData['subscriptions'][number],
  categoryNameById?: Record<string, string>,
): ConfirmProposal => {
  const fields = (kind === 'add' ? args : (args.patch as Record<string, unknown>)) ?? {};
  const details: ProposalDetail[] = [];
  const fmt = (k: string, v: unknown): string => {
    if (v == null || v === '') return '';
    if (k === 'cost' && isNumber(v) && isString(fields.currency))
      return formatCurrency(v, fields.currency as string);
    return String(v);
  };
  const labelMap: Record<string, string> = {
    name: 'Name',
    cost: 'Cost',
    currency: 'Currency',
    billingCycle: 'Billing cycle',
    renewalDate: 'Next renewal',
    subscribedSince: 'Subscribed since',
    status: 'Status',
    categoryName: 'Category',
    website: 'Website',
    notes: 'Notes',
    cancellationUrl: 'Cancellation URL',
    paymentMethod: 'Payment method',
  };
  for (const [k, v] of Object.entries(fields)) {
    if (!(k in labelMap)) continue;
    const value = fmt(k, v);
    if (!value) continue;
    if (kind === 'update' && before) {
      let was: string | undefined;
      if (k === 'categoryName') {
        was = before.categoryId ? categoryNameById?.[before.categoryId] : '';
      } else {
        const wasRaw = (before as unknown as Record<string, unknown>)[k];
        was =
          wasRaw == null
            ? ''
            : k === 'cost' && isNumber(wasRaw)
              ? formatCurrency(wasRaw, before.currency)
              : String(wasRaw);
      }
      details.push({ label: labelMap[k], value, was });
    } else {
      details.push({ label: labelMap[k], value });
    }
  }
  return {
    kind,
    toolName: kind === 'add' ? 'add_subscription' : 'update_subscription',
    summary:
      kind === 'add'
        ? `Add subscription: ${(fields.name as string) ?? 'unnamed'}`
        : `Update subscription: ${before?.name ?? 'unknown'}`,
    details,
  };
};

const buildPurchaseProposal = (
  kind: 'add' | 'update',
  args: Record<string, unknown>,
  before?: AppData['oneTimePurchases'][number],
  categoryNameById?: Record<string, string>,
): ConfirmProposal => {
  const fields = (kind === 'add' ? args : (args.patch as Record<string, unknown>)) ?? {};
  const details: ProposalDetail[] = [];
  const fmt = (k: string, v: unknown): string => {
    if (v == null || v === '') return '';
    if (k === 'cost' && isNumber(v) && isString(fields.currency))
      return formatCurrency(v, fields.currency as string);
    return String(v);
  };
  const labelMap: Record<string, string> = {
    name: 'Name',
    cost: 'Cost',
    currency: 'Currency',
    purchaseDate: 'Purchase date',
    categoryName: 'Category',
    website: 'Website',
    notes: 'Notes',
    warrantyEndsAt: 'Warranty ends',
    supportEndsAt: 'Support ends',
    expectedLifespanMonths: 'Expected lifespan (mo)',
    paymentMethod: 'Payment method',
  };
  for (const [k, v] of Object.entries(fields)) {
    if (!(k in labelMap)) continue;
    const value = fmt(k, v);
    if (!value) continue;
    if (kind === 'update' && before) {
      let was: string | undefined;
      if (k === 'categoryName') {
        was = before.categoryId ? categoryNameById?.[before.categoryId] : '';
      } else {
        const wasRaw = (before as unknown as Record<string, unknown>)[k];
        was =
          wasRaw == null
            ? ''
            : k === 'cost' && isNumber(wasRaw)
              ? formatCurrency(wasRaw, before.currency)
              : String(wasRaw);
      }
      details.push({ label: labelMap[k], value, was });
    } else {
      details.push({ label: labelMap[k], value });
    }
  }
  return {
    kind,
    toolName: kind === 'add' ? 'add_purchase' : 'update_purchase',
    summary:
      kind === 'add'
        ? `Add purchase: ${(fields.name as string) ?? 'unnamed'}`
        : `Update purchase: ${before?.name ?? 'unknown'}`,
    details,
  };
};

/* ---- Argument validation ----
 * Every tool's args are parsed with Zod before anything is shown or written.
 * Adds reuse the form input schemas; updates only accept the fields the
 * confirm card can show, and reject anything else (id, renewals, …) so the
 * model gets an error it can correct instead of silently corrupting data. */

const categoryNameArg = z.string().trim().max(60);

const subShape = subscriptionInputSchema.shape;
const purchaseShape = oneTimePurchaseInputSchema.shape;

const subscriptionAddArgs = subscriptionInputSchema
  .pick({
    name: true,
    cost: true,
    currency: true,
    billingCycle: true,
    renewalDate: true,
    website: true,
    notes: true,
    cancellationUrl: true,
    paymentMethod: true,
  })
  .extend({
    subscribedSince: subShape.subscribedSince.optional(),
    status: subShape.status.optional(),
    categoryName: categoryNameArg.optional(),
  });

const purchaseAddArgs = oneTimePurchaseInputSchema
  .pick({
    name: true,
    cost: true,
    currency: true,
    purchaseDate: true,
    website: true,
    notes: true,
    warrantyEndsAt: true,
    supportEndsAt: true,
    expectedLifespanMonths: true,
    paymentMethod: true,
  })
  .extend({ categoryName: categoryNameArg.optional() });

const subscriptionPatchArgs = z
  .object({
    name: subShape.name,
    cost: subShape.cost,
    currency: subShape.currency,
    billingCycle: subShape.billingCycle,
    renewalDate: subShape.renewalDate,
    subscribedSince: subShape.subscribedSince,
    status: subShape.status,
    categoryName: categoryNameArg.nullable(),
    website: subShape.website,
    notes: subShape.notes,
    cancellationUrl: subShape.cancellationUrl,
    paymentMethod: subShape.paymentMethod,
  })
  .partial()
  .strict();

const purchasePatchArgs = z
  .object({
    name: purchaseShape.name,
    cost: purchaseShape.cost,
    currency: purchaseShape.currency,
    purchaseDate: purchaseShape.purchaseDate,
    categoryName: categoryNameArg.nullable(),
    website: purchaseShape.website,
    notes: purchaseShape.notes,
    warrantyEndsAt: purchaseShape.warrantyEndsAt,
    supportEndsAt: purchaseShape.supportEndsAt,
    expectedLifespanMonths: purchaseShape.expectedLifespanMonths,
    paymentMethod: purchaseShape.paymentMethod,
  })
  .partial()
  .strict();

const idArg = z.string().min(1);

export const toolArgSchemas = {
  read_subscriptions: z.object({
    statusFilter: z.enum(['active', 'inactive', 'all']).optional(),
  }),
  add_subscription: subscriptionAddArgs,
  add_purchase: purchaseAddArgs,
  add_category: categoryInputSchema.pick({ name: true, color: true }),
  update_subscription: z.object({ id: idArg, patch: subscriptionPatchArgs }),
  update_purchase: z.object({ id: idArg, patch: purchasePatchArgs }),
  delete_subscription: z.object({ id: idArg }),
  delete_purchase: z.object({ id: idArg }),
  add_subscriptions_bulk: z.object({ items: z.array(z.unknown()).min(1) }),
  add_purchases_bulk: z.object({ items: z.array(z.unknown()).min(1) }),
};

const describeIssues = (issues: z.ZodIssue[]): string =>
  issues
    .slice(0, 5)
    .map((i) => `${i.path.join('.') || 'args'}: ${i.message}`)
    .join('; ');

type Parsed<T> = { ok: true; data: T } | { ok: false; error: string };

const parseArgs = <S extends z.ZodTypeAny>(
  schema: S,
  value: unknown,
  tool: string,
): Parsed<z.infer<S>> => {
  const r = schema.safeParse(value);
  return r.success
    ? { ok: true, data: r.data }
    : { ok: false, error: `Invalid arguments for ${tool}: ${describeIssues(r.error.issues)}` };
};

/** Empty optional strings mean "not set". */
const orUndef = (v: string | undefined): string | undefined => v || undefined;

const toSubscriptionInput = (
  a: z.infer<typeof subscriptionAddArgs>,
): Omit<SubscriptionInput, 'categoryId'> => ({
  name: a.name,
  cost: a.cost,
  currency: a.currency.toUpperCase(),
  billingCycle: a.billingCycle,
  renewalDate: a.renewalDate,
  subscribedSince: a.subscribedSince ?? today(),
  status: a.status ?? 'active',
  website: orUndef(a.website),
  notes: orUndef(a.notes),
  cancellationUrl: orUndef(a.cancellationUrl),
  paymentMethod: orUndef(a.paymentMethod),
});

const toPurchaseInput = (
  a: z.infer<typeof purchaseAddArgs>,
): Omit<OneTimePurchaseInput, 'categoryId'> => ({
  name: a.name,
  cost: a.cost,
  currency: a.currency.toUpperCase(),
  purchaseDate: a.purchaseDate,
  website: orUndef(a.website),
  notes: orUndef(a.notes),
  warrantyEndsAt: a.warrantyEndsAt,
  supportEndsAt: a.supportEndsAt,
  expectedLifespanMonths: a.expectedLifespanMonths,
  paymentMethod: orUndef(a.paymentMethod),
});

/** Splits bulk items into validated ones and per-index errors for the model. */
const parseBulk = <S extends z.ZodTypeAny>(
  schema: S,
  items: unknown[],
): { valid: Array<z.infer<S>>; invalid: Array<{ index: number; error: string }> } => {
  const valid: Array<z.infer<S>> = [];
  const invalid: Array<{ index: number; error: string }> = [];
  items.forEach((it, index) => {
    const r = schema.safeParse(it);
    if (r.success) valid.push(r.data);
    else invalid.push({ index, error: describeIssues(r.error.issues) });
  });
  return { valid, invalid };
};

/** Tool-result character budget sent back to the model. */
export const TOOL_RESULT_BUDGET = 8000;

/**
 * Serializes a tool result within `budget` characters while keeping it valid
 * JSON: arrays are cut to the largest prefix that fits and wrapped as
 * `{ items, truncated: true, total }`. (Slicing the JSON string produced
 * invalid JSON the model then had to guess at.)
 */
export const serializeToolResult = (result: unknown, budget = TOOL_RESULT_BUDGET): string => {
  const full = JSON.stringify(result) ?? 'null';
  if (full.length <= budget) return full;
  if (Array.isArray(result)) {
    const wrap = (n: number): string =>
      JSON.stringify({ items: result.slice(0, n), truncated: true, total: result.length });
    let lo = 0;
    let hi = result.length;
    while (lo < hi) {
      const mid = Math.ceil((lo + hi) / 2);
      if (wrap(mid).length <= budget) lo = mid;
      else hi = mid - 1;
    }
    return wrap(lo);
  }
  return JSON.stringify({ truncated: true, error: 'Result too large to return' });
};

/* ---- Top-level dispatch ---- */

export const dispatchTool = async (
  ctx: ToolContext,
  name: string,
  argsJson: string,
  callId: string,
): Promise<DispatchResult> => {
  let rawArgs: unknown = {};
  try {
    rawArgs = argsJson ? JSON.parse(argsJson) : {};
  } catch {
    return { status: 'error', error: `Invalid JSON arguments for ${name}` };
  }
  const args = (typeof rawArgs === 'object' && rawArgs !== null ? rawArgs : {}) as Record<
    string,
    unknown
  >;

  try {
    switch (name) {
      case 'read_summary':
        return { status: 'ok', result: summarize(ctx) };
      case 'read_subscriptions': {
        const p = parseArgs(toolArgSchemas.read_subscriptions, args, name);
        if (!p.ok) return { status: 'error', error: p.error };
        return { status: 'ok', result: listSubscriptions(ctx, p.data) };
      }
      case 'read_purchases':
        return { status: 'ok', result: listPurchases(ctx) };
      case 'read_categories':
        return { status: 'ok', result: listCategories(ctx) };

      case 'add_subscription': {
        const p = parseArgs(toolArgSchemas.add_subscription, args, name);
        if (!p.ok) return { status: 'error', error: p.error };
        const proposal = buildSubProposal('add', p.data);
        const decision = await ctx.requestConfirm(callId, proposal);
        if (!decision.approved) return { status: 'ok', result: { rejected: true } };
        const sub = await ctx.actions.addSubscriptionByName(
          toSubscriptionInput(p.data),
          orUndef(p.data.categoryName),
        );
        return { status: 'ok', result: { added: true, id: sub.id, name: sub.name } };
      }

      case 'add_purchase': {
        const p = parseArgs(toolArgSchemas.add_purchase, args, name);
        if (!p.ok) return { status: 'error', error: p.error };
        const proposal = buildPurchaseProposal('add', p.data);
        const decision = await ctx.requestConfirm(callId, proposal);
        if (!decision.approved) return { status: 'ok', result: { rejected: true } };
        const created = await ctx.actions.addPurchaseByName(
          toPurchaseInput(p.data),
          orUndef(p.data.categoryName),
        );
        return { status: 'ok', result: { added: true, id: created.id, name: created.name } };
      }

      case 'add_category': {
        const p = parseArgs(toolArgSchemas.add_category, args, name);
        if (!p.ok) return { status: 'error', error: p.error };
        const proposal: ConfirmProposal = {
          kind: 'add',
          toolName: 'add_category',
          summary: `Add category: ${p.data.name}`,
          details: [
            { label: 'Name', value: p.data.name },
            ...(p.data.color ? [{ label: 'Color', value: p.data.color }] : []),
          ],
        };
        const decision = await ctx.requestConfirm(callId, proposal);
        if (!decision.approved) return { status: 'ok', result: { rejected: true } };
        await ctx.actions.addCategory({ name: p.data.name, color: orUndef(p.data.color) });
        return { status: 'ok', result: { added: true, name: p.data.name } };
      }

      case 'update_subscription': {
        const p = parseArgs(toolArgSchemas.update_subscription, args, name);
        if (!p.ok) return { status: 'error', error: p.error };
        const data = ctx.getData();
        const before = data.subscriptions.find((s) => s.id === p.data.id);
        if (!before) return { status: 'error', error: `Subscription ${p.data.id} not found` };
        const patch = p.data.patch;
        if (patch.currency) patch.currency = patch.currency.toUpperCase();
        const proposal = buildSubProposal('update', { patch }, before, categoryNameById(data));
        if (proposal.details.length === 0)
          return { status: 'error', error: 'Patch had no recognized changes' };
        const decision = await ctx.requestConfirm(callId, proposal);
        if (!decision.approved) return { status: 'ok', result: { rejected: true } };
        await ctx.actions.updateSubscriptionPatch(p.data.id, patch as SubscriptionPatch);
        return { status: 'ok', result: { updated: true, id: p.data.id, name: before.name } };
      }

      case 'update_purchase': {
        const p = parseArgs(toolArgSchemas.update_purchase, args, name);
        if (!p.ok) return { status: 'error', error: p.error };
        const data = ctx.getData();
        const before = data.oneTimePurchases.find((x) => x.id === p.data.id);
        if (!before) return { status: 'error', error: `Purchase ${p.data.id} not found` };
        const patch = p.data.patch;
        if (patch.currency) patch.currency = patch.currency.toUpperCase();
        const proposal = buildPurchaseProposal('update', { patch }, before, categoryNameById(data));
        if (proposal.details.length === 0)
          return { status: 'error', error: 'Patch had no recognized changes' };
        const decision = await ctx.requestConfirm(callId, proposal);
        if (!decision.approved) return { status: 'ok', result: { rejected: true } };
        await ctx.actions.updatePurchasePatch(p.data.id, patch as PurchasePatch);
        return { status: 'ok', result: { updated: true, id: p.data.id, name: before.name } };
      }

      case 'delete_subscription': {
        const p = parseArgs(toolArgSchemas.delete_subscription, args, name);
        if (!p.ok) return { status: 'error', error: p.error };
        const before = ctx.getData().subscriptions.find((s) => s.id === p.data.id);
        if (!before) return { status: 'error', error: 'Not found' };
        const proposal: ConfirmProposal = {
          kind: 'delete',
          toolName: 'delete_subscription',
          summary: `Delete subscription: ${before.name}`,
          destructive: true,
          details: [
            { label: 'Cost', value: formatCurrency(before.cost, before.currency) },
            { label: 'Billing cycle', value: before.billingCycle },
            { label: 'Counted renewals', value: String(before.renewals.filter((r) => r.enabled !== false).length) },
          ],
        };
        const decision = await ctx.requestConfirm(callId, proposal);
        if (!decision.approved) return { status: 'ok', result: { rejected: true } };
        await ctx.actions.deleteSubscription(p.data.id);
        return { status: 'ok', result: { deleted: true, name: before.name } };
      }

      case 'delete_purchase': {
        const p = parseArgs(toolArgSchemas.delete_purchase, args, name);
        if (!p.ok) return { status: 'error', error: p.error };
        const before = ctx.getData().oneTimePurchases.find((x) => x.id === p.data.id);
        if (!before) return { status: 'error', error: 'Not found' };
        const proposal: ConfirmProposal = {
          kind: 'delete',
          toolName: 'delete_purchase',
          summary: `Delete purchase: ${before.name}`,
          destructive: true,
          details: [
            { label: 'Cost', value: formatCurrency(before.cost, before.currency) },
            { label: 'Purchased', value: before.purchaseDate },
          ],
        };
        const decision = await ctx.requestConfirm(callId, proposal);
        if (!decision.approved) return { status: 'ok', result: { rejected: true } };
        await ctx.actions.deletePurchase(p.data.id);
        return { status: 'ok', result: { deleted: true, name: before.name } };
      }

      case 'add_subscriptions_bulk': {
        const p = parseArgs(toolArgSchemas.add_subscriptions_bulk, args, name);
        if (!p.ok) return { status: 'error', error: p.error };
        const { valid, invalid } = parseBulk(subscriptionAddArgs, p.data.items);
        if (valid.length === 0)
          return {
            status: 'error',
            error: `No valid subscription items in bulk add: ${invalid.map((x) => `items.${x.index}: ${x.error}`).join(' | ')}`,
          };
        const skipped = invalid.length;
        const proposal: ConfirmProposal = {
          kind: 'bulk-add',
          toolName: 'add_subscriptions_bulk',
          summary:
            `Add ${valid.length} subscription${valid.length === 1 ? '' : 's'}` +
            (skipped > 0 ? ` (${skipped} skipped — invalid fields)` : ''),
          details: [],
          bulkItems: valid.map((it) => ({
            name: it.name,
            subtitle: `${formatCurrency(it.cost, it.currency)} · ${it.billingCycle} · renews ${it.renewalDate}${it.categoryName ? ` · ${it.categoryName}` : ''}`,
          })),
        };
        const decision = await ctx.requestConfirm(callId, proposal);
        if (!decision.approved) return { status: 'ok', result: { rejected: true } };
        const chosen = decision.selectedIndices
          ? valid.filter((_, i) => decision.selectedIndices!.includes(i))
          : valid;
        if (chosen.length === 0) return { status: 'ok', result: { rejected: true } };
        const added: Array<{ id: string; name: string }> = [];
        const failed: Array<{ name: string; error: string }> = [];
        for (const it of chosen) {
          try {
            const sub = await ctx.actions.addSubscriptionByName(
              toSubscriptionInput(it),
              orUndef(it.categoryName),
            );
            added.push({ id: sub.id, name: sub.name });
          } catch (err) {
            failed.push({ name: it.name, error: (err as Error).message });
          }
        }
        return {
          status: 'ok',
          result: { added: added.length, skipped, invalid, failed, items: added },
        };
      }

      case 'add_purchases_bulk': {
        const p = parseArgs(toolArgSchemas.add_purchases_bulk, args, name);
        if (!p.ok) return { status: 'error', error: p.error };
        const { valid, invalid } = parseBulk(purchaseAddArgs, p.data.items);
        if (valid.length === 0)
          return {
            status: 'error',
            error: `No valid purchase items in bulk add: ${invalid.map((x) => `items.${x.index}: ${x.error}`).join(' | ')}`,
          };
        const skipped = invalid.length;
        const proposal: ConfirmProposal = {
          kind: 'bulk-add',
          toolName: 'add_purchases_bulk',
          summary:
            `Add ${valid.length} purchase${valid.length === 1 ? '' : 's'}` +
            (skipped > 0 ? ` (${skipped} skipped — invalid fields)` : ''),
          details: [],
          bulkItems: valid.map((it) => ({
            name: it.name,
            subtitle: `${formatCurrency(it.cost, it.currency)} · ${it.purchaseDate}${it.categoryName ? ` · ${it.categoryName}` : ''}`,
          })),
        };
        const decision = await ctx.requestConfirm(callId, proposal);
        if (!decision.approved) return { status: 'ok', result: { rejected: true } };
        const chosen = decision.selectedIndices
          ? valid.filter((_, i) => decision.selectedIndices!.includes(i))
          : valid;
        if (chosen.length === 0) return { status: 'ok', result: { rejected: true } };
        const added: Array<{ id: string; name: string }> = [];
        const failed: Array<{ name: string; error: string }> = [];
        for (const it of chosen) {
          try {
            const created = await ctx.actions.addPurchaseByName(
              toPurchaseInput(it),
              orUndef(it.categoryName),
            );
            added.push({ id: created.id, name: created.name });
          } catch (err) {
            failed.push({ name: it.name, error: (err as Error).message });
          }
        }
        return {
          status: 'ok',
          result: { added: added.length, skipped, invalid, failed, items: added },
        };
      }

      default:
        return { status: 'error', error: `Unknown tool: ${name}` };
    }
  } catch (err) {
    return { status: 'error', error: (err as Error).message };
  }
};
