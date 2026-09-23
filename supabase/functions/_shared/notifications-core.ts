// Deno copy of src/shared/notifications-core.ts (kept in sync by hand — Edge
// Functions can't import from the app's src tree). Computes which renewal/trial
// alerts are due and the updated firedAlerts dedupe set. Operates on a minimal
// subscription shape mapped from the DB rows. Deno runs in UTC, so pass the
// user's IANA `timeZone` for correct calendar days and quiet hours.
import { calendarDaysBetween, todayLocalIso, zonedParts } from './dates.ts';

export interface FireSpec {
  title: string;
  body: string;
}

interface Trial {
  endsAt: string;
  convertsToCost?: number;
}

export interface NotifySub {
  id: string;
  name: string;
  cost: number;
  currency: string;
  renewalDate: string;
  status: string;
  firedAlerts?: string[];
  trial?: Trial;
  alertConfig?: { daysBefore: number[] };
}

export interface NotifyPrefs {
  enabled: boolean;
  globalDaysBefore: number[];
  quietHours?: [string, string];
}

const PRUNE_FIRED_AFTER_DAYS = 45;

const daysUntil = (iso: string, now: Date, timeZone?: string): number =>
  calendarDaysBetween(todayLocalIso(now, timeZone), iso);

const parseHm = (s: string): { h: number; m: number } | null => {
  const m = /^(\d{1,2}):(\d{2})$/.exec(s);
  return m ? { h: Number(m[1]), m: Number(m[2]) } : null;
};

const inQuietHours = (prefs: NotifyPrefs, now: Date, timeZone?: string): boolean => {
  if (!prefs.quietHours) return false;
  const start = parseHm(prefs.quietHours[0]);
  const end = parseHm(prefs.quietHours[1]);
  if (!start || !end) return false;
  const { hour, minute } = zonedParts(now, timeZone);
  const nowMins = hour * 60 + minute;
  const s = start.h * 60 + start.m;
  const e = end.h * 60 + end.m;
  if (s === e) return false;
  return s < e ? nowMins >= s && nowMins < e : nowMins >= s || nowMins < e;
};

const whenLabel = (d: number): string => (d === 0 ? 'today' : d === 1 ? 'tomorrow' : `in ${d} days`);

const renewalSpec = (s: NotifySub, d: number): FireSpec => ({
  title: `${s.name} renews ${whenLabel(d)}`,
  body: `${s.currency} ${s.cost.toFixed(2)} on ${s.renewalDate}`,
});

const trialSpec = (s: NotifySub, d: number): FireSpec => ({
  title: `${s.name} trial ends ${whenLabel(d)}`,
  body: s.trial?.convertsToCost
    ? `Auto-converts to ${s.currency} ${s.trial.convertsToCost.toFixed(2)}`
    : `Trial ends on ${s.trial?.endsAt}`,
});

const thresholdsFor = (s: NotifySub, prefs: NotifyPrefs): number[] =>
  s.alertConfig?.daysBefore ?? prefs.globalDaysBefore;

// Marks every crossed threshold fired in one pass; true if any was new (the
// caller then emits ONE notification) — avoids replaying stale alerts after downtime.
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

// Quiet hours: emit nothing and mark nothing, so alerts go out after they end.
export const computeDueAlerts = (
  subs: NotifySub[],
  prefs: NotifyPrefs,
  now: Date,
  timeZone?: string,
): { toFire: FireSpec[]; subscriptions: NotifySub[] } => {
  if (inQuietHours(prefs, now, timeZone)) return { toFire: [], subscriptions: subs };
  const toFire: FireSpec[] = [];
  const subscriptions = subs.map((s) => {
    if (s.status !== 'active') return s;
    const thresholds = thresholdsFor(s, prefs);
    const firedSet = new Set(s.firedAlerts ?? []);
    let touched = false;

    const renewalDays = daysUntil(s.renewalDate, now, timeZone);
    if (renewalDays >= 0 && markCrossed(firedSet, s.renewalDate, renewalDays, thresholds)) {
      toFire.push(renewalSpec(s, renewalDays));
      touched = true;
    }

    if (s.trial) {
      const trialDays = daysUntil(s.trial.endsAt, now, timeZone);
      const trialKey = `trial:${s.trial.endsAt}`;
      if (trialDays >= 0 && markCrossed(firedSet, trialKey, trialDays, thresholds)) {
        toFire.push(trialSpec(s, trialDays));
        touched = true;
      }
    }

    if (!touched) return s;
    const pruned = [...firedSet].filter((key) => {
      const m = /(\d{4}-\d{2}-\d{2})/.exec(key);
      return !m || daysUntil(m[1], now, timeZone) >= -PRUNE_FIRED_AFTER_DAYS;
    });
    return { ...s, firedAlerts: pruned };
  });
  return { toFire, subscriptions };
};
