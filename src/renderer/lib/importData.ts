import type { ZodIssue } from 'zod';
import {
  appDataFileSchema,
  oneTimePurchaseInputSchema,
  subscriptionInputSchema,
  type AppDataFile,
  type OneTimePurchaseInput,
  type SubscriptionInput,
} from '../../shared/schemas';
import {
  defaultPreferences,
  type AppData,
  type BillingCycle,
  type OneTimePurchase,
  type Preferences,
  type Subscription,
} from '../../shared/types';
import { autoFillSub } from '../features/subscriptions/renewals';

/* =========================================================================
 *  Pure parsing / validation for JSON backups and CSV imports. No React, no
 *  window.api — useAppData wires these to file dialogs and persist().
 * ======================================================================= */

const MAX_REPORTED_ERRORS = 5;

const formatIssues = (issues: ZodIssue[]): string[] => {
  const lines = issues
    .slice(0, MAX_REPORTED_ERRORS)
    .map((i) => `${i.path.join('.') || '(file)'}: ${i.message}`);
  if (issues.length > MAX_REPORTED_ERRORS) {
    lines.push(`…and ${issues.length - MAX_REPORTED_ERRORS} more`);
  }
  return lines;
};

/** Drops keys whose value is undefined, so a spread can't erase a default. */
const defined = <T extends object>(o: T): Partial<T> =>
  Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as Partial<T>;

/** Imported preferences over defaults, merging nested notify / aiAssistant. */
export const mergePreferences = (incoming: AppDataFile['preferences']): Preferences => {
  const base = defaultPreferences();
  const p = incoming ?? {};
  return {
    ...base,
    ...(defined(p) as Partial<Preferences>),
    notify: { ...base.notify, ...(defined(p.notify ?? {}) as Partial<Preferences['notify']>) },
    aiAssistant: {
      ...base.aiAssistant,
      ...(defined(p.aiAssistant ?? {}) as Partial<Preferences['aiAssistant']>),
    },
  };
};

const duplicateIds = (label: string, items: Array<{ id: string }>): string[] => {
  const seen = new Set<string>();
  const dupes = new Set<string>();
  for (const { id } of items) {
    if (seen.has(id)) dupes.add(id);
    seen.add(id);
  }
  return [...dupes].map((id) => `Duplicate ${label} id "${id}"`);
};

export type BackupParseResult = { ok: true; data: AppData } | { ok: false; errors: string[] };

/**
 * Parses and validates a JSON backup. All-or-nothing: any schema error or
 * duplicate id rejects the whole file. On success, fills defaults (deep for
 * preferences) and runs the renewal autofill on every subscription.
 */
export const parseBackupJson = (text: string, now: Date = new Date()): BackupParseResult => {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (err) {
    return { ok: false, errors: [`Not valid JSON: ${(err as Error).message}`] };
  }
  const parsed = appDataFileSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, errors: formatIssues(parsed.error.issues) };
  const f = parsed.data;

  const dupes = [
    ...duplicateIds('subscription', f.subscriptions),
    ...duplicateIds('purchase', f.oneTimePurchases),
    ...duplicateIds('category', f.categories),
  ];
  if (dupes.length > 0) return { ok: false, errors: dupes.slice(0, MAX_REPORTED_ERRORS) };

  const stamp = now.toISOString();
  const subscriptions: Subscription[] = f.subscriptions.map((s) =>
    autoFillSub(
      {
        ...s,
        subscribedSince: s.subscribedSince ?? s.renewalDate,
        renewals: s.renewals ?? [],
        createdAt: s.createdAt ?? stamp,
        updatedAt: s.updatedAt ?? stamp,
      },
      now,
    ),
  );
  const oneTimePurchases: OneTimePurchase[] = f.oneTimePurchases.map((p) => ({
    ...p,
    createdAt: p.createdAt ?? stamp,
    updatedAt: p.updatedAt ?? stamp,
  }));

  return {
    ok: true,
    data: {
      version: 1,
      subscriptions,
      oneTimePurchases,
      categories: f.categories,
      preferences: mergePreferences(f.preferences),
      cancellationLog: f.cancellationLog ?? [],
    },
  };
};

/* ---- CSV ---- */

/** Trimmed cell, with the `'` that export's csvSafe adds before =+-@ removed. */
export const csvCell = (v: string | undefined): string =>
  (v ?? '').trim().replace(/^'(?=[=+\-@\t\r])/, '').trim();

/**
 * Parses a money cell: tolerates currency symbols/codes, spaces, thousands
 * separators and a decimal comma when unambiguous. Returns null when the
 * value is empty, not a number, or ambiguous (e.g. "1,5,0").
 */
export const parseCost = (raw: string): number | null => {
  const s = raw.replace(/[^\d.,-]/g, '');
  if (!/\d/.test(s)) return null;
  let normalized: string;
  const lastComma = s.lastIndexOf(',');
  const lastDot = s.lastIndexOf('.');
  if (lastComma >= 0 && lastDot >= 0) {
    // Both present: whichever comes last is the decimal separator.
    normalized =
      lastDot > lastComma ? s.replace(/,/g, '') : s.replace(/\./g, '').replace(',', '.');
  } else if (lastComma >= 0) {
    if (/^-?[1-9]\d{0,2}(,\d{3})+$/.test(s)) normalized = s.replace(/,/g, '');
    else if (/^-?\d+,\d{1,2}$/.test(s)) normalized = s.replace(',', '.');
    else return null;
  } else if ((s.match(/\./g) ?? []).length > 1) {
    if (!/^-?[1-9]\d{0,2}(\.\d{3})+$/.test(s)) return null;
    normalized = s.replace(/\./g, '');
  } else {
    normalized = s;
  }
  if (!/^-?\d*\.?\d+$/.test(normalized)) return null;
  const n = Number(normalized);
  return Number.isFinite(n) ? n : null;
};

/**
 * `YYYY-MM-DD` (optionally followed by a time) that is a real calendar date.
 * Anything else — including MM/DD vs DD/MM forms — is rejected, not guessed.
 */
export const parseIsoDate = (raw: string): string | null => {
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:[T ].*)?$/.exec(raw);
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const dt = new Date(Date.UTC(y, mo - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) {
    return null;
  }
  return `${m[1]}-${m[2]}-${m[3]}`;
};

const CYCLE_ALIASES: Record<string, BillingCycle> = {
  '': 'monthly',
  month: 'monthly',
  monthly: 'monthly',
  quarter: 'quarterly',
  quarterly: 'quarterly',
  year: 'yearly',
  yearly: 'yearly',
  annual: 'yearly',
  annually: 'yearly',
  custom: 'custom',
};

/** Case-insensitive billing cycle; unknown values pass through for Zod to reject. */
export const normalizeBillingCycle = (raw: string): string =>
  CYCLE_ALIASES[raw.toLowerCase()] ?? raw;

export interface CsvSkip {
  /** 1-based line in the file (the header is line 1). */
  line: number;
  reason: string;
}

export interface CsvParseResult<T> {
  items: Array<{ input: T; categoryName: string }>;
  skipped: CsvSkip[];
}

interface CsvContext {
  defaultCurrency: string;
  /** Local `YYYY-MM-DD`, used when a date column is empty. */
  today: string;
}

type Row = Record<string, string | undefined>;

const costKey = (n: number): string => n.toFixed(2);

/** Shared per-row steps: required name, tolerant cost, ISO date, currency default. */
const parseCommon = (
  row: Row,
  ctx: CsvContext,
): { name: string; cost: number; currency: string } | string => {
  const name = csvCell(row.name);
  if (!name) return 'missing name';
  const costRaw = csvCell(row.cost);
  const cost = parseCost(costRaw);
  if (cost === null) return costRaw ? `cost "${costRaw}" is not a number` : 'missing cost';
  const currency = (csvCell(row.currency) || ctx.defaultCurrency).toUpperCase();
  return { name, cost, currency };
};

const dateCell = (row: Row, key: string, fallback: string): string | { error: string } => {
  const raw = csvCell(row[key]);
  if (!raw) return fallback;
  return parseIsoDate(raw) ?? { error: `${key} "${raw}" is not a YYYY-MM-DD date` };
};

const firstIssue = (issues: ZodIssue[]): string =>
  `${issues[0].path.join('.')}: ${issues[0].message}`;

export const parseSubscriptionCsv = (
  rows: Row[],
  ctx: CsvContext & { existing: Subscription[] },
): CsvParseResult<Omit<SubscriptionInput, 'categoryId'>> => {
  const result: CsvParseResult<Omit<SubscriptionInput, 'categoryId'>> = {
    items: [],
    skipped: [],
  };
  const seen = new Set(
    ctx.existing.map((s) => `${s.name.toLowerCase()}|${costKey(s.cost)}|${s.renewalDate}`),
  );
  rows.forEach((row, i) => {
    const line = i + 2;
    const skip = (reason: string): void => void result.skipped.push({ line, reason });
    const common = parseCommon(row, ctx);
    if (typeof common === 'string') return skip(common);
    const renewalDate = dateCell(row, 'renewalDate', ctx.today);
    if (typeof renewalDate !== 'string') return skip(renewalDate.error);
    const subscribedSince = dateCell(row, 'subscribedSince', renewalDate);
    if (typeof subscribedSince !== 'string') return skip(subscribedSince.error);

    const parsed = subscriptionInputSchema.safeParse({
      ...common,
      billingCycle: normalizeBillingCycle(csvCell(row.billingCycle)),
      renewalDate,
      subscribedSince,
      status: csvCell(row.status).toLowerCase() === 'inactive' ? 'inactive' : 'active',
      website: csvCell(row.website) || undefined,
      notes: csvCell(row.notes) || undefined,
    });
    if (!parsed.success) return skip(firstIssue(parsed.error.issues));

    const key = `${parsed.data.name.toLowerCase()}|${costKey(parsed.data.cost)}|${parsed.data.renewalDate}`;
    if (seen.has(key)) return skip('duplicate of an existing subscription');
    seen.add(key);
    // categoryId is resolved from categoryName by the caller.
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { categoryId, ...input } = parsed.data;
    result.items.push({ input, categoryName: csvCell(row.category) });
  });
  return result;
};

export const parsePurchaseCsv = (
  rows: Row[],
  ctx: CsvContext & { existing: OneTimePurchase[] },
): CsvParseResult<Omit<OneTimePurchaseInput, 'categoryId'>> => {
  const result: CsvParseResult<Omit<OneTimePurchaseInput, 'categoryId'>> = {
    items: [],
    skipped: [],
  };
  const seen = new Set(
    ctx.existing.map((p) => `${p.name.toLowerCase()}|${costKey(p.cost)}|${p.purchaseDate}`),
  );
  rows.forEach((row, i) => {
    const line = i + 2;
    const skip = (reason: string): void => void result.skipped.push({ line, reason });
    const common = parseCommon(row, ctx);
    if (typeof common === 'string') return skip(common);
    const purchaseDate = dateCell(row, 'purchaseDate', ctx.today);
    if (typeof purchaseDate !== 'string') return skip(purchaseDate.error);

    const parsed = oneTimePurchaseInputSchema.safeParse({
      ...common,
      purchaseDate,
      website: csvCell(row.website) || undefined,
      notes: csvCell(row.notes) || undefined,
    });
    if (!parsed.success) return skip(firstIssue(parsed.error.issues));

    const key = `${parsed.data.name.toLowerCase()}|${costKey(parsed.data.cost)}|${parsed.data.purchaseDate}`;
    if (seen.has(key)) return skip('duplicate of an existing purchase');
    seen.add(key);
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { categoryId, ...input } = parsed.data;
    result.items.push({ input, categoryName: csvCell(row.category) });
  });
  return result;
};

/** "Imported 3 subscriptions, skipped 2" + the first few skip reasons. */
export const summarizeCsvImport = (
  noun: string,
  imported: number,
  skipped: CsvSkip[],
): { title: string; description?: string } => {
  const plural = (n: number): string => `${n} ${noun}${n === 1 ? '' : 's'}`;
  if (skipped.length === 0) return { title: `Imported ${plural(imported)}` };
  const reasons = skipped
    .slice(0, 3)
    .map((s) => `Line ${s.line}: ${s.reason}`)
    .join('; ');
  const more = skipped.length > 3 ? `; …and ${skipped.length - 3} more` : '';
  return {
    title: `Imported ${plural(imported)}, skipped ${skipped.length}`,
    description: reasons + more,
  };
};
