import { calendarDaysBetween, todayLocalIso, zonedParts } from './dates';
import type { AppData, NotifyPrefs, Subscription } from './types';

/**
 * Runtime-neutral renewal/trial alert logic shared by the desktop scheduler
 * (`src/main/notifications.ts`) and the web push cron (a Supabase Edge
 * Function). This file must NOT import Electron, Node, or browser APIs — only
 * pure date math, so it runs unchanged in Electron's main process and in Deno.
 *
 * The side effect (showing an OS notification / sending a Web Push) lives in
 * the caller. `computeDueAlerts` returns WHICH alerts should fire plus the
 * subscriptions with their `firedAlerts` set updated for dedupe.
 *
 * Date math is in calendar days of `timeZone` (IANA name; omitted → the
 * runtime's local zone). The Deno cron runs in UTC, so it must pass the user's.
 */

/** Drop fired-alert keys whose date is older than this (days). */
export const PRUNE_FIRED_AFTER_DAYS = 45;

export const daysUntil = (iso: string, now: Date, timeZone?: string): number =>
  calendarDaysBetween(todayLocalIso(now, timeZone), iso);

const parseHm = (s: string): { h: number; m: number } | null => {
  const m = /^(\d{1,2}):(\d{2})$/.exec(s);
  if (!m) return null;
  return { h: Number(m[1]), m: Number(m[2]) };
};

export const inQuietHours = (
  prefs: Pick<NotifyPrefs, 'quietHours'>,
  now: Date,
  timeZone?: string,
): boolean => {
  if (!prefs.quietHours) return false;
  const start = parseHm(prefs.quietHours[0]);
  const end = parseHm(prefs.quietHours[1]);
  if (!start || !end) return false;
  const { hour, minute } = zonedParts(now, timeZone);
  const nowMins = hour * 60 + minute;
  const startMins = start.h * 60 + start.m;
  const endMins = end.h * 60 + end.m;
  if (startMins === endMins) return false;
  return startMins < endMins
    ? nowMins >= startMins && nowMins < endMins
    : nowMins >= startMins || nowMins < endMins; // wraps midnight
};

const whenLabel = (days: number): string => {
  if (days === 0) return 'today';
  if (days === 1) return 'tomorrow';
  return `in ${days} days`;
};

/** A single notification to display — title + body, transport-agnostic. */
export interface FireSpec {
  title: string;
  body: string;
}

export const renewalSpec = (s: Subscription, days: number): FireSpec => ({
  title: `${s.name} renews ${whenLabel(days)}`,
  body: `${s.currency} ${s.cost.toFixed(2)} on ${s.renewalDate}`,
});

export const trialSpec = (s: Subscription, days: number): FireSpec => {
  const converts = s.trial?.convertsToCost;
  const body = converts
    ? `Auto-converts to ${s.currency} ${converts.toFixed(2)}`
    : `Trial ends on ${s.trial?.endsAt}`;
  return { title: `${s.name} trial ends ${whenLabel(days)}`, body };
};

const thresholdsFor = (s: Subscription, prefs: NotifyPrefs): number[] =>
  s.alertConfig?.daysBefore ?? prefs.globalDaysBefore;

/**
 * Marks every threshold already crossed (`days <= threshold`) for `keyPrefix`
 * as fired in one pass. Returns true if any was new — the caller then emits a
 * single notification worded from the actual days left. Firing one threshold
 * per tick instead would replay stale alerts after downtime (an app off for a
 * week would say "renews today" three ticks in a row).
 */
const markCrossed = (
  firedSet: Set<string>,
  keyPrefix: string,
  days: number,
  thresholds: number[],
): boolean => {
  let isNew = false;
  for (const d of thresholds) {
    if (days > d) continue;
    const key = `${keyPrefix}:${d}`;
    if (firedSet.has(key)) continue;
    firedSet.add(key);
    isNew = true;
  }
  return isNew;
};

export interface DueAlertsResult {
  /** Count of notifications emitted (one per subscription renewal/trial at
   * most, even when several thresholds were crossed at once). */
  fired: number;
  /** Subscriptions with `firedAlerts` updated + pruned. */
  subscriptions: Subscription[];
  /** Specs that should actually be shown now. */
  toFire: FireSpec[];
}

/**
 * Pure: computes which renewal/trial alerts are due, updates each
 * subscription's `firedAlerts` dedupe set (with pruning), and returns the
 * specs to display. During quiet hours nothing is emitted AND nothing is
 * marked fired, so the alerts go out on the first check after quiet hours end.
 */
export const computeDueAlerts = (
  data: AppData,
  now: Date = new Date(),
  timeZone?: string,
): DueAlertsResult => {
  const prefs = data.preferences.notify;
  if (!prefs.enabled || inQuietHours(prefs, now, timeZone)) {
    return { fired: 0, subscriptions: data.subscriptions, toFire: [] };
  }
  const toFire: FireSpec[] = [];
  let count = 0;
  const next = data.subscriptions.map((s) => {
    if (s.status !== 'active') return s;
    const thresholds = thresholdsFor(s, prefs);
    const firedSet = new Set(s.firedAlerts ?? []);
    let touched = false;

    // Renewal-date alerts
    const renewalDays = daysUntil(s.renewalDate, now, timeZone);
    if (renewalDays >= 0 && markCrossed(firedSet, s.renewalDate, renewalDays, thresholds)) {
      toFire.push(renewalSpec(s, renewalDays));
      touched = true;
      count++;
    }

    // Trial-end alerts
    if (s.trial) {
      const trialDays = daysUntil(s.trial.endsAt, now, timeZone);
      const trialKey = `trial:${s.trial.endsAt}`;
      if (trialDays >= 0 && markCrossed(firedSet, trialKey, trialDays, thresholds)) {
        toFire.push(trialSpec(s, trialDays));
        touched = true;
        count++;
      }
    }

    if (!touched) return s;
    // Prune fired-alert keys whose embedded date is well in the past so the
    // set doesn't grow unbounded across years of renewals.
    const pruned = [...firedSet].filter((key) => {
      const m = /(\d{4}-\d{2}-\d{2})/.exec(key);
      return !m || daysUntil(m[1], now, timeZone) >= -PRUNE_FIRED_AFTER_DAYS;
    });
    return { ...s, firedAlerts: pruned };
  });

  return { fired: count, subscriptions: next, toFire };
};
