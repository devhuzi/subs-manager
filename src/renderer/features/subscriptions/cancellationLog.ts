import type { CancellationLogEntry, ItemStatus, Subscription } from '../../../shared/types';
import { monthlyEquivalent } from '../dashboard/spendMetrics';

export type CancellationLogChange = 'logged' | 'revoked' | null;

/**
 * Cancellation-log update for a status change, shared by every path that can
 * flip a subscription active↔inactive (toggle, edit form, AI patch).
 *
 * - active → inactive: appends an entry when `logIt` (the user agreed).
 *   Custom cycles log a monthly equivalent of 0 (no savings claimed).
 * - inactive → active: removes this sub's entries. Entries without a
 *   `subscriptionId` (pre-feature history) are left alone.
 * - no status change: log untouched.
 */
export const applyStatusChangeToLog = (
  log: CancellationLogEntry[],
  /** The subscription after the change (its name/cost are what gets logged). */
  sub: Subscription,
  prevStatus: ItemStatus,
  logIt: boolean,
  now: string,
): { log: CancellationLogEntry[]; change: CancellationLogChange } => {
  if (sub.status === prevStatus) return { log, change: null };
  if (sub.status === 'inactive') {
    if (!logIt) return { log, change: null };
    return {
      log: [
        ...log,
        {
          id: crypto.randomUUID(),
          subscriptionId: sub.id,
          subscriptionName: sub.name,
          cancelledAt: now,
          monthlyEquivalent: monthlyEquivalent(sub),
          currency: sub.currency,
        },
      ],
      change: 'logged',
    };
  }
  const filtered = log.filter((e) => e.subscriptionId !== sub.id);
  return filtered.length === log.length
    ? { log, change: null }
    : { log: filtered, change: 'revoked' };
};
