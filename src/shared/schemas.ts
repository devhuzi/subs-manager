import { z } from 'zod';

export const billingCycleSchema = z.enum(['monthly', 'quarterly', 'yearly', 'custom']);

const dateString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD');

/** A date string OR an empty input — empty becomes `undefined`. Use for truly optional date fields. */
const optionalDateString = z.preprocess(
  (v) => (v === '' || v == null ? undefined : v),
  dateString.optional(),
);

/** A positive int OR empty input — empty becomes `undefined`. */
const optionalPositiveInt = z.preprocess(
  (v) => (v === '' || v == null ? undefined : v),
  z.coerce.number().int().positive().max(600).optional(),
);

/**
 * True when the value carries an explicit URL scheme other than http(s)
 * (`javascript:`, `data:`, `file:` …). Control chars/whitespace are stripped
 * first because browsers ignore them inside a scheme (`java\tscript:`).
 * `host:8080` is a port, not a scheme, so a digit after the colon is allowed.
 */
export const hasUnsafeScheme = (v: string): boolean => {
  // eslint-disable-next-line no-control-regex
  const probe = v.replace(/[\u0000-\u0020]/g, '');
  const m = /^([a-z][a-z0-9+.-]*):(?!\d)/i.exec(probe);
  return m !== null && !/^https?$/i.test(m[1]);
};

const websiteString = z
  .string()
  .trim()
  .max(500)
  .optional()
  .refine((v) => !v || !hasUnsafeScheme(v), { message: 'Only http(s) links are allowed' })
  .refine((v) => !v || /\./.test(v), { message: 'Add a domain, e.g. wsform.com' });

const urlString = z
  .string()
  .trim()
  .max(1000)
  .optional()
  .refine((v) => !v || !hasUnsafeScheme(v), { message: 'Only http(s) links are allowed' })
  .refine((v) => !v || /^https?:\/\//i.test(v) || /\./.test(v), {
    message: 'Add a URL, e.g. https://example.com/cancel',
  });

/** Blank / null input → undefined (so it fails "required" instead of becoming 0). */
const blankToUndefined = (v: unknown): unknown =>
  v == null || (typeof v === 'string' && v.trim() === '') ? undefined : v;

/** Numeric strings → numbers; anything else passes through for z.number() to judge. */
const toNumber = (v: unknown): unknown => {
  const b = blankToUndefined(v);
  return typeof b === 'string' ? Number(b.trim()) : b;
};

const MAX_COST = 1_000_000_000;

const amountNumber = z
  .number({ required_error: 'Cost is required', invalid_type_error: 'Cost must be a number' })
  .finite('Cost must be a number')
  .nonnegative('Cost must be 0 or more')
  .max(MAX_COST, 'Cost is too large');

/** Required cost: finite, 0..1e9. An empty input is an error, not 0. */
const costNumber = z.preprocess(toNumber, amountNumber);

/** Optional cost: empty → undefined, otherwise same bounds as costNumber. */
const optionalCostNumber = z.preprocess(toNumber, amountNumber.optional());

const hexColor = z
  .string()
  .regex(/^#[0-9a-fA-F]{6}$/, 'Use a hex color like #3b82f6')
  .optional();

const alertConfigSchema = z
  .object({
    daysBefore: z.array(z.coerce.number().int().min(0).max(365)).max(8),
  })
  .optional();

const trialSchema = z
  .object({
    endsAt: dateString,
    convertsToCost: optionalCostNumber,
  })
  .optional();

export const subscriptionInputSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(120),
  cost: costNumber,
  currency: z.string().trim().length(3, 'Use a 3-letter code, e.g. USD'),
  billingCycle: billingCycleSchema,
  renewalDate: dateString,
  subscribedSince: dateString,
  status: z.enum(['active', 'inactive']),
  categoryId: z.string().optional(),
  website: websiteString,
  notes: z.string().max(2000).optional(),
  cancellationUrl: urlString,
  paymentMethod: z.string().trim().max(60).optional(),
  brandColor: hexColor,
  trial: trialSchema,
  alertConfig: alertConfigSchema,
});

export type SubscriptionInput = z.infer<typeof subscriptionInputSchema>;

export const renewalInputSchema = z.object({
  date: dateString,
  cost: costNumber,
  currency: z.string().trim().length(3),
});

export type RenewalInputForm = z.infer<typeof renewalInputSchema>;

export const oneTimePurchaseInputSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(120),
  cost: costNumber,
  currency: z.string().trim().length(3, 'Use a 3-letter code, e.g. USD'),
  purchaseDate: dateString,
  categoryId: z.string().optional(),
  website: websiteString,
  notes: z.string().max(2000).optional(),
  warrantyEndsAt: optionalDateString,
  supportEndsAt: optionalDateString,
  expectedLifespanMonths: optionalPositiveInt,
  paymentMethod: z.string().trim().max(60).optional(),
  brandColor: hexColor,
});

export type OneTimePurchaseInput = z.infer<typeof oneTimePurchaseInputSchema>;

export const categoryInputSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(60),
  color: hexColor,
  monthlyBudget: z.preprocess(
    (v) => (v === '' || v == null ? undefined : v),
    z.coerce.number().nonnegative().max(1_000_000).optional(),
  ),
});

export type CategoryInput = z.infer<typeof categoryInputSchema>;

/* =========================================================================
 *  Stored-data schemas — validate a full JSON backup before import.
 *  Strict on the types of fields that are present; lenient on optional ones
 *  (missing or null → undefined). Unknown keys are stripped.
 * ======================================================================= */

/** Optional field that also tolerates an explicit `null`. */
const opt = <T extends z.ZodTypeAny>(schema: T) =>
  z.preprocess((v) => (v === null ? undefined : v), schema.optional());

const currencyCode = z.string().trim().length(3, 'Use a 3-letter code, e.g. USD');

const storedLinkString = z
  .string()
  .max(1000)
  .refine((v) => !hasUnsafeScheme(v.trim()), { message: 'Only http(s) links are allowed' });

const storedRenewalSchema = z.object({
  id: z.string().min(1),
  date: dateString,
  cost: amountNumber,
  currency: currencyCode,
  enabled: opt(z.boolean()),
});

export const storedSubscriptionSchema = z.object({
  id: z.string().min(1),
  name: z.string().trim().min(1, 'Name is required'),
  cost: amountNumber,
  currency: currencyCode,
  billingCycle: billingCycleSchema,
  renewalDate: dateString,
  subscribedSince: opt(dateString),
  renewals: opt(z.array(storedRenewalSchema)),
  status: z.enum(['active', 'inactive']),
  categoryId: opt(z.string()),
  website: opt(storedLinkString),
  notes: opt(z.string()),
  cancellationUrl: opt(storedLinkString),
  paymentMethod: opt(z.string()),
  logoUrl: opt(z.string()),
  brandColor: opt(z.string()),
  trial: opt(z.object({ endsAt: dateString, convertsToCost: opt(amountNumber) })),
  alertConfig: opt(z.object({ daysBefore: z.array(z.number().int().min(0).max(365)) })),
  priceHistory: opt(
    z.array(z.object({ changedAt: z.string(), cost: amountNumber, currency: currencyCode })),
  ),
  firedAlerts: opt(z.array(z.string())),
  createdAt: opt(z.string()),
  updatedAt: opt(z.string()),
});

export const storedPurchaseSchema = z.object({
  id: z.string().min(1),
  name: z.string().trim().min(1, 'Name is required'),
  cost: amountNumber,
  currency: currencyCode,
  purchaseDate: dateString,
  categoryId: opt(z.string()),
  website: opt(storedLinkString),
  notes: opt(z.string()),
  warrantyEndsAt: opt(dateString),
  supportEndsAt: opt(dateString),
  expectedLifespanMonths: opt(z.number().int().positive().max(600)),
  paymentMethod: opt(z.string()),
  logoUrl: opt(z.string()),
  brandColor: opt(z.string()),
  createdAt: opt(z.string()),
  updatedAt: opt(z.string()),
});

export const storedCategorySchema = z.object({
  id: z.string().min(1),
  name: z.string().trim().min(1, 'Name is required'),
  color: opt(z.string()),
  monthlyBudget: opt(z.number().finite().nonnegative()),
});

export const storedCancellationEntrySchema = z.object({
  id: z.string().min(1),
  subscriptionId: opt(z.string()),
  subscriptionName: z.string(),
  cancelledAt: z.string(),
  monthlyEquivalent: z.number().finite(),
  currency: currencyCode,
});

const hhmm = z.string().regex(/^\d{2}:\d{2}$/, 'Use HH:MM');

/** Every preference is optional here — missing ones are filled from defaults. */
export const storedPreferencesSchema = z.object({
  theme: opt(z.enum(['light', 'dark', 'system'])),
  defaultCurrency: opt(currencyCode),
  reminderDays: opt(z.number().int().nonnegative()),
  fxLastFetchedAt: opt(z.string()),
  enableLogoFetch: opt(z.boolean()),
  notify: opt(
    z.object({
      enabled: opt(z.boolean()),
      globalDaysBefore: opt(z.array(z.number().int().min(0).max(365))),
      quietHours: opt(z.tuple([hhmm, hhmm])),
      minimizeToTray: opt(z.boolean()),
    }),
  ),
  aiAssistant: opt(
    z.object({
      enabled: opt(z.boolean()),
      model: opt(z.string()),
      hasKey: opt(z.boolean()),
    }),
  ),
  layoutTheme: opt(z.enum(['default', 'sharp', 'glass', 'notion'])),
  brandColor: opt(z.string()),
  timezone: opt(z.string().max(64)),
});

export const appDataFileSchema = z.object({
  version: opt(z.literal(1)),
  subscriptions: z.array(storedSubscriptionSchema),
  oneTimePurchases: z.array(storedPurchaseSchema),
  categories: z.array(storedCategorySchema),
  preferences: opt(storedPreferencesSchema),
  cancellationLog: opt(z.array(storedCancellationEntrySchema)),
});

export type AppDataFile = z.infer<typeof appDataFileSchema>;
