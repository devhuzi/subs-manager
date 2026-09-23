import { parseISO, formatDistanceStrict } from 'date-fns';
import type { BillingCycle, Subscription } from '../../../shared/types';

export const enabledRenewals = (s: Subscription) =>
  s.renewals.filter((r) => r.enabled !== false);

export const lifetimeSpend = (s: Subscription): number =>
  enabledRenewals(s).reduce((sum, r) => sum + r.cost, 0);

export const renewalCount = (s: Subscription): number => enabledRenewals(s).length;

const periodIndex = (date: string, cycle: BillingCycle): number | null => {
  const d = parseISO(date);
  const y = d.getFullYear();
  const m = d.getMonth();
  switch (cycle) {
    case 'monthly':
      return y * 12 + m;
    case 'quarterly':
      return y * 4 + Math.floor(m / 3);
    case 'yearly':
      return y;
    default:
      return null;
  }
};

// Start of the most-recent contiguous run of enabled renewals.
// Falls back to subscribedSince if no renewals or custom cycle.
export const activeSinceDate = (s: Subscription): Date => {
  const subscribed = parseISO(s.subscribedSince);
  if (s.billingCycle === 'custom') return subscribed;
  const enabled = enabledRenewals(s)
    .slice()
    .sort((a, b) => a.date.localeCompare(b.date));
  if (enabled.length === 0) return subscribed;
  let startIdx = enabled.length - 1;
  for (let i = enabled.length - 1; i > 0; i--) {
    const cur = periodIndex(enabled[i].date, s.billingCycle);
    const prev = periodIndex(enabled[i - 1].date, s.billingCycle);
    if (cur !== null && prev !== null && cur - prev === 1) {
      startIdx = i - 1;
    } else {
      break;
    }
  }
  const streakDate = parseISO(enabled[startIdx].date);
  return streakDate < subscribed ? streakDate : subscribed < streakDate ? streakDate : subscribed;
};

export const activeDurationLabel = (s: Subscription): string => {
  const since = activeSinceDate(s);
  const now = new Date();
  if (since > now) return 'starts in future';
  return formatDistanceStrict(since, now);
};
