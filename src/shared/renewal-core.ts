import { addMonthsIso } from './dates';
import type { BillingCycle } from './types';

/**
 * Pure, anchor-based renewal stepping shared by the renderer, the Electron main
 * process and (as a hand-kept Deno copy in
 * `supabase/functions/_shared/renewal-core.ts`) the push cron.
 *
 * Every occurrence is computed as `anchor + n * cycle` rather than by stepping
 * from the previous occurrence, so month-end anchors don't drift
 * (Jan 31 → Feb 28 → Mar 31, not Mar 28).
 */

export interface RenewalSchedule {
  billingCycle: BillingCycle;
  renewalDate: string;
  subscribedSince?: string;
}

const MONTHS_PER_CYCLE: Record<BillingCycle, number> = {
  monthly: 1,
  quarterly: 3,
  yearly: 12,
  custom: 0,
};

/** Upper bound on cycles walked — 2000 months is ~166 years. */
const MAX_STEPS = 2000;

/** The `n`th occurrence after `anchor` (n = 0 → anchor). Custom cycles never move. */
export const addCycles = (anchor: string, cycle: BillingCycle, n: number): string =>
  addMonthsIso(anchor, MONTHS_PER_CYCLE[cycle] * n);

/**
 * The date the schedule is stepped from: `subscribedSince` when `renewalDate`
 * lies on its schedule (restores the true day-of-month after a clamp, e.g.
 * since Jan 31 + renewal Feb 28 → anchor Jan 31), otherwise `renewalDate`
 * itself (the user set a renewal day unrelated to the start date).
 */
export const renewalAnchor = (s: RenewalSchedule): string => {
  const since = s.subscribedSince;
  if (!since || since > s.renewalDate || s.billingCycle === 'custom') return s.renewalDate;
  for (let n = 0; n <= MAX_STEPS; n++) {
    const occ = addCycles(since, s.billingCycle, n);
    if (occ === s.renewalDate) return since;
    if (occ > s.renewalDate) break;
  }
  return s.renewalDate;
};

/**
 * Index of the first occurrence of `anchor`'s schedule that is `>= minIso`
 * (0 if `anchor` itself qualifies), or -1 if none within the safety bound.
 */
export const firstCycleOnOrAfter = (
  anchor: string,
  cycle: BillingCycle,
  minIso: string,
): number => {
  for (let n = 0; n <= MAX_STEPS; n++) {
    if (addCycles(anchor, cycle, n) >= minIso) return n;
  }
  return -1;
};

/**
 * Next renewal date on or after `todayIso` (`YYYY-MM-DD`). A renewalDate that
 * is already today or later is returned unchanged; an overdue one is rolled
 * forward any number of cycles. Custom cycles are never rolled.
 */
export const rollForwardRenewal = (s: RenewalSchedule, todayIso: string): string => {
  if (s.billingCycle === 'custom' || s.renewalDate >= todayIso) return s.renewalDate;
  const anchor = renewalAnchor(s);
  const n = firstCycleOnOrAfter(anchor, s.billingCycle, todayIso);
  return n < 0 ? s.renewalDate : addCycles(anchor, s.billingCycle, n);
};
