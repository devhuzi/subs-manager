import { randomUUID } from 'node:crypto';
import {
  defaultAiAssistantPrefs,
  defaultNotifyPrefs,
  defaultPreferences,
  normalizeLayoutTheme,
  type AppData,
  type Renewal,
  type Subscription,
} from '../shared/types';

/**
 * Forward-compatible upgrade pass run on every load. Back-fills fields added in
 * later versions so an older `subs-manager.json` opens cleanly: missing
 * `subscribedSince`, renewal ids/`enabled`, `cancellationLog`, and any new
 * preference keys all get sensible defaults without dropping existing data.
 *
 * Pure (no Electron / filesystem) so it can be unit-tested. All optional schema
 * fields added this cycle (paymentMethod, monthlyBudget, priceHistory,
 * layoutTheme, brandColor, alertConfig, …) need nothing beyond the default
 * spread — they're simply preserved when present and absent otherwise.
 */
export const migrate = (data: AppData): AppData => {
  const incomingPrefs = (data.preferences ?? {}) as Partial<AppData['preferences']>;
  // Hand-edited or truncated files may lack whole collections; default them
  // rather than throwing so the app still opens.
  const arr = <T>(v: T[] | undefined): T[] => (Array.isArray(v) ? v : []);
  return {
    ...data,
    version: data.version ?? 1,
    subscriptions: arr(data.subscriptions).map(
      (s): Subscription => ({
        ...s,
        subscribedSince: s.subscribedSince ?? s.renewalDate,
        // Spread so fields added to Renewal later survive the round-trip.
        renewals: arr(s.renewals).map(
          (r): Renewal => ({
            ...r,
            id: r.id ?? randomUUID(),
            enabled: r.enabled ?? true,
          }),
        ),
      }),
    ),
    oneTimePurchases: arr(data.oneTimePurchases),
    categories: arr(data.categories),
    cancellationLog: arr(data.cancellationLog),
    preferences: {
      ...defaultPreferences(),
      ...incomingPrefs,
      // Retired layouts ('glass', 'notion') fall back to the default.
      layoutTheme: normalizeLayoutTheme(incomingPrefs.layoutTheme),
      notify: { ...defaultNotifyPrefs(), ...(incomingPrefs.notify ?? {}) },
      aiAssistant: {
        ...defaultAiAssistantPrefs(),
        ...(incomingPrefs.aiAssistant ?? {}),
      },
    },
  };
};
