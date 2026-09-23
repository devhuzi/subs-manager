import type { AppData } from '../shared/types';

/**
 * `firedAlerts` is owned by the main-process scheduler, but the renderer saves
 * whole AppData snapshots taken before the scheduler's last write. Saving that
 * snapshot as-is would erase the scheduler's dedupe keys and re-fire alerts.
 *
 * Pure: returns `incoming` with each subscription's `firedAlerts` unioned with
 * the on-disk copy for the same id. Subscriptions the renderer deleted are
 * simply absent from `incoming`, so their keys are dropped with them.
 */
export const mergeFiredAlerts = (incoming: AppData, onDisk: AppData | null): AppData => {
  if (!onDisk || !Array.isArray(onDisk.subscriptions)) return incoming;
  const diskFired = new Map<string, string[]>();
  for (const s of onDisk.subscriptions) {
    if (s.firedAlerts?.length) diskFired.set(s.id, s.firedAlerts);
  }
  if (diskFired.size === 0) return incoming;

  let changed = false;
  const subscriptions = incoming.subscriptions.map((s) => {
    const fromDisk = diskFired.get(s.id);
    if (!fromDisk) return s;
    const union = [...new Set([...(s.firedAlerts ?? []), ...fromDisk])];
    if (union.length === (s.firedAlerts?.length ?? 0)) return s;
    changed = true;
    return { ...s, firedAlerts: union };
  });
  return changed ? { ...incoming, subscriptions } : incoming;
};
