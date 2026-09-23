import { BrowserWindow, Notification } from 'electron';
import type { AppData, Subscription } from '../shared/types';
import { computeDueAlerts, type FireSpec } from '../shared/notifications-core';
import { todayLocalIso } from '../shared/dates';
import { rollForwardRenewal } from '../shared/renewal-core';

const focusMainWindow = (): void => {
  const win = BrowserWindow.getAllWindows()[0];
  if (!win) return;
  if (win.isMinimized()) win.restore();
  if (!win.isVisible()) win.show();
  win.focus();
};

const fire = (spec: FireSpec): void => {
  if (!Notification.isSupported()) return;
  const n = new Notification({ title: spec.title, body: spec.body });
  n.on('click', focusMainWindow);
  n.show();
};

export interface CheckResult {
  fired: number;
  subscriptions: Subscription[];
}

/**
 * Desktop entry point: computes due alerts (pure, shared) then shows each as an
 * OS notification. During quiet hours nothing is shown AND nothing is marked
 * fired, so the alerts go out on the first check after quiet hours end.
 */
export const checkAndNotify = (
  data: AppData,
  now: Date = new Date(),
): CheckResult => {
  const { fired, subscriptions, toFire } = computeDueAlerts(data, now);
  for (const spec of toFire) fire(spec);
  return { fired, subscriptions };
};

/** Load → mutate → save in one serialized step (see `updateData` in data.ts). */
export type UpdateData = (mutate: (data: AppData) => AppData | null) => Promise<void>;

const SIX_HOURS_MS = 6 * 60 * 60 * 1000;

/**
 * Advance overdue renewal dates of active subs to the next occurrence on or
 * after today, so a tray-resident app keeps alerting for the next cycle even if
 * the window is never reopened. Only `renewalDate` moves: the renderer's
 * `autoFillSub` backfills the skipped periods' renewal-history entries (it
 * fills every missing period between `subscribedSince` and `renewalDate`) on
 * its next load, so history stays consistent without duplicating that logic.
 */
const rollForwardOverdue = (subs: Subscription[], todayIso: string): Subscription[] | null => {
  let changed = false;
  const next = subs.map((s) => {
    if (s.status !== 'active' || s.renewalDate >= todayIso) return s;
    const renewalDate = rollForwardRenewal(s, todayIso);
    if (renewalDate === s.renewalDate) return s;
    changed = true;
    return { ...s, renewalDate };
  });
  return changed ? next : null;
};

export const runOnce = async (
  updateData: UpdateData,
  now: Date = new Date(),
): Promise<{ fired: number }> => {
  let fired = 0;
  await updateData((data) => {
    const rolled = rollForwardOverdue(data.subscriptions, todayLocalIso(now));
    const current = rolled ? { ...data, subscriptions: rolled } : data;
    const result = checkAndNotify(current, now);
    fired = result.fired;
    if (!rolled && result.fired === 0) return null; // nothing to persist
    return { ...current, subscriptions: result.subscriptions };
  });
  return { fired };
};

const FIRST_RUN_DELAY_MS = 15 * 1000;

export const startScheduler = (updateData: UpdateData): (() => void) => {
  const run = async (): Promise<void> => {
    try {
      await runOnce(updateData);
    } catch (err) {
      console.error('Reminder check failed', err);
    }
  };
  // Delay the first check so the app finishes booting (and the startup backup
  // settles) before any notification can fire — avoids a toast the instant the
  // window opens and a concurrent load at launch.
  const firstTick = setTimeout(() => void run(), FIRST_RUN_DELAY_MS);
  const handle = setInterval(() => void run(), SIX_HOURS_MS);
  return () => {
    clearTimeout(firstTick);
    clearInterval(handle);
  };
};
