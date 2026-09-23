import {
  addMonths,
  addYears,
  differenceInCalendarDays,
  format,
  parseISO,
  formatISO,
} from 'date-fns';
import type { BillingCycle, Renewal, Subscription } from '../../../shared/types';
import { isoLocal } from '../../../shared/dates';
import { addCycles, firstCycleOnOrAfter, renewalAnchor } from '../../../shared/renewal-core';

export { isoLocal, todayLocalIso } from '../../../shared/dates';
export { rollForwardRenewal } from '../../../shared/renewal-core';

/**
 * Pure renewal-history logic, extracted from useAppData so it can be unit
 * tested without React. All date-dependent functions accept an explicit
 * `today` for determinism.
 */

/** Calendar days from `today` to an ISO date (negative when it has passed). */
export const daysUntil = (iso: string, today: Date): number =>
  differenceInCalendarDays(parseISO(iso), today);

/**
 * How loudly a renewal (or trial end) `days` away should be shown:
 * overdue (passed), imminent (0–2 days), soon (3–7 days), later (8+).
 * Overdue and imminent render red, soon amber, later neutral.
 */
export type RenewalUrgency = 'overdue' | 'imminent' | 'soon' | 'later';

export const renewalUrgency = (days: number): RenewalUrgency => {
  if (days < 0) return 'overdue';
  if (days <= 2) return 'imminent';
  if (days <= 7) return 'soon';
  return 'later';
};

/**
 * The one wording for "when" across the app: "Today", "Tomorrow",
 * "In 5 days · Sep 28" (within a month), "Oct 30, 2026" (further out), and
 * "Overdue · Sep 20" once passed (`pastWord` swaps "Overdue", e.g. "Ended"
 * for a trial).
 */
export const renewalLabel = (days: number, iso: string, pastWord = 'Overdue'): string => {
  const d = parseISO(iso);
  if (days < 0) return `${pastWord} · ${format(d, 'MMM d')}`;
  if (days === 0) return 'Today';
  if (days === 1) return 'Tomorrow';
  if (days <= 30) return `In ${days} days · ${format(d, 'MMM d')}`;
  return format(d, 'MMM d, yyyy');
};

/**
 * The first charge after `todayIso` on a schedule starting `startIso`: the
 * start itself is a payment already made, so it's never returned. Used to
 * pre-fill "Next renewal" in the add form. Custom cycles have no schedule
 * and return `todayIso`.
 */
export const nextRenewalFromStart = (
  startIso: string,
  cycle: BillingCycle,
  todayIso: string,
): string => {
  if (cycle === 'custom') return todayIso;
  const n = Math.max(1, firstCycleOnOrAfter(startIso, cycle, todayIso));
  const candidate = addCycles(startIso, cycle, n);
  return candidate > todayIso ? candidate : addCycles(startIso, cycle, n + 1);
};

export const advanceDate = (d: Date, cycle: BillingCycle): Date => {
  switch (cycle) {
    case 'monthly':
      return addMonths(d, 1);
    case 'quarterly':
      return addMonths(d, 3);
    case 'yearly':
      return addYears(d, 1);
    default:
      return d;
  }
};

export const advanceRenewal = (fromDate: string, cycle: BillingCycle): string =>
  formatISO(advanceDate(parseISO(fromDate), cycle), { representation: 'date' });

export const periodKey = (date: string, cycle: BillingCycle): string => {
  const d = parseISO(date);
  const y = d.getFullYear();
  const m = d.getMonth();
  switch (cycle) {
    case 'monthly':
      return `${y}-${m}`;
    case 'quarterly':
      return `${y}-Q${Math.floor(m / 3)}`;
    case 'yearly':
      return `${y}`;
    default:
      return date;
  }
};

/**
 * Drop renewals that fall outside the legitimate window:
 *   - before `subscribedSince` (user corrected start date later),
 *   - on/after `renewalDate` (renewals must be historical, not the next-due),
 *   - in the future (renewals must have already happened).
 */
export const trimRenewalsToWindow = (
  s: Subscription,
  today: Date = new Date(),
): Subscription => {
  if (s.billingCycle === 'custom') return s;
  const todayStr = isoLocal(today);
  const filtered = s.renewals.filter(
    (r) => r.date >= s.subscribedSince && r.date < s.renewalDate && r.date <= todayStr,
  );
  if (filtered.length === s.renewals.length) return s;
  return { ...s, renewals: filtered };
};

export const fillHistoricalRenewals = (s: Subscription): Subscription => {
  if (s.billingCycle === 'custom') return s;
  const existing = new Set(s.renewals.map((r) => periodKey(r.date, s.billingCycle)));
  const added: Renewal[] = [];
  // Each date is anchor + n cycles (not previous + 1) so month-ends don't drift.
  for (let n = 0; n < 2000; n++) {
    const dateStr = addCycles(s.subscribedSince, s.billingCycle, n);
    if (dateStr >= s.renewalDate) break;
    const key = periodKey(dateStr, s.billingCycle);
    if (!existing.has(key)) {
      added.push({
        id: crypto.randomUUID(),
        date: dateStr,
        cost: s.cost,
        currency: s.currency,
        enabled: true,
      });
      existing.add(key);
    }
  }
  if (added.length === 0) return s;
  return { ...s, renewals: [...s.renewals, ...added] };
};

export const extendForward = (s: Subscription, today: Date): Subscription => {
  if (s.status !== 'active' || s.billingCycle === 'custom') return s;
  const todayStr = isoLocal(today);
  if (s.renewalDate > todayStr) return s;
  // Step from a fixed anchor (not the previous, possibly clamped, date) so
  // month-ends don't drift.
  const anchor = renewalAnchor(s);
  let n = firstCycleOnOrAfter(anchor, s.billingCycle, s.renewalDate);
  if (n < 0) return s;
  const existing = new Set(s.renewals.map((r) => periodKey(r.date, s.billingCycle)));
  const added: Renewal[] = [];
  let dateStr = addCycles(anchor, s.billingCycle, n);
  let safety = 200;
  while (dateStr <= todayStr && safety > 0) {
    const key = periodKey(dateStr, s.billingCycle);
    if (!existing.has(key)) {
      added.push({
        id: crypto.randomUUID(),
        date: dateStr,
        cost: s.cost,
        currency: s.currency,
        enabled: true,
      });
      existing.add(key);
    }
    n++;
    dateStr = addCycles(anchor, s.billingCycle, n);
    safety--;
  }
  return { ...s, renewals: [...s.renewals, ...added], renewalDate: dateStr };
};

/**
 * Trim out-of-window/future renewals, then backfill missing historical ones,
 * extend forward past today, and backfill once more. Idempotent.
 */
export const autoFillSub = (s: Subscription, today: Date = new Date()): Subscription =>
  fillHistoricalRenewals(
    extendForward(fillHistoricalRenewals(trimRenewalsToWindow(s, today)), today),
  );
