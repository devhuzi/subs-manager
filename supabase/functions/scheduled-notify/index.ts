// Sends Web Push reminders for due renewals/trials. Two modes:
//   • cron  — Authorization: Bearer <CRON_SECRET> → process ALL users
//   • user  — a normal user JWT → process just that caller (the "Check now"
//             button), so a user can test push immediately.
// Reuses the shared alert logic and writes back fired_alerts to dedupe.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import webpush from 'npm:web-push@3.6.7';
import { corsHeaders, json, rateAllow, timingSafeEqual } from '../_shared/util.ts';
import { computeDueAlerts, type NotifySub } from '../_shared/notifications-core.ts';
import { rollForwardRenewal } from '../_shared/renewal-core.ts';
import { todayLocalIso } from '../_shared/dates.ts';

const url = Deno.env.get('SUPABASE_URL')!;
const anon = Deno.env.get('SUPABASE_ANON_KEY')!;
const serviceRole = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

webpush.setVapidDetails(
  Deno.env.get('VAPID_SUBJECT') ?? 'mailto:admin@example.com',
  Deno.env.get('VAPID_PUBLIC_KEY')!,
  Deno.env.get('VAPID_PRIVATE_KEY')!,
);

const admin = createClient(url, serviceRole);

/** The stored IANA zone if this runtime recognises it; else undefined (→ UTC). */
const validTimeZone = (tz: unknown): string | undefined => {
  if (typeof tz !== 'string' || !tz) return undefined;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return tz;
  } catch {
    return undefined;
  }
};

// A stored renewal_date only advances when the client next loads the app, so a
// past date is rolled forward to the next occurrence here (for alerting only —
// not written back) — otherwise reminders would stop for inactive-app users.
// deno-lint-ignore no-explicit-any
const rowToSub = (r: any, todayIso: string): NotifySub => ({
  id: r.id,
  name: r.name,
  cost: Number(r.cost),
  currency: r.currency,
  renewalDate: rollForwardRenewal(
    {
      billingCycle: r.billing_cycle,
      renewalDate: r.renewal_date,
      subscribedSince: r.subscribed_since ?? undefined,
    },
    todayIso,
  ),
  status: r.status,
  firedAlerts: r.fired_alerts ?? [],
  trial: r.trial ?? undefined,
  alertConfig: r.alert_config ?? undefined,
});

const processUser = async (userId: string, now: Date): Promise<number> => {
  const { data: prefRow, error: prefErr } = await admin
    .from('preferences')
    .select('notify, timezone')
    .eq('user_id', userId)
    .maybeSingle();
  // Don't fall back to the enabled-by-default prefs on a query error (e.g. the
  // timezone migration not applied yet) — that would ignore a user's opt-out.
  if (prefErr) throw prefErr;
  const notify = prefRow?.notify ?? { enabled: true, globalDaysBefore: [7, 1, 0] };
  if (!notify.enabled) return 0;
  const timeZone = validTimeZone(prefRow?.timezone) ?? 'UTC';

  const { data: subRows } = await admin.from('subscriptions').select('*').eq('user_id', userId);
  if (!subRows?.length) return 0;

  const todayIso = todayLocalIso(now, timeZone);
  const { toFire, subscriptions } = computeDueAlerts(
    subRows.map((r) => rowToSub(r, todayIso)),
    notify,
    now,
    timeZone,
  );
  if (toFire.length === 0) return 0;

  const { data: pushRows } = await admin
    .from('push_subscriptions')
    .select('*')
    .eq('user_id', userId);
  if (!pushRows?.length) return 0;

  for (const spec of toFire) {
    const payload = JSON.stringify({ title: spec.title, body: spec.body, url: '/' });
    for (const ps of pushRows) {
      try {
        await webpush.sendNotification(
          { endpoint: ps.endpoint, keys: { p256dh: ps.p256dh, auth: ps.auth } },
          payload,
        );
      } catch (err) {
        // deno-lint-ignore no-explicit-any
        const code = (err as any)?.statusCode;
        if (code === 404 || code === 410) {
          await admin.from('push_subscriptions').delete().eq('endpoint', ps.endpoint);
        }
      }
    }
  }

  // Persist updated dedupe sets.
  for (const s of subscriptions) {
    await admin
      .from('subscriptions')
      .update({ fired_alerts: s.firedAlerts ?? [] })
      .eq('user_id', userId)
      .eq('id', s.id);
  }
  return toFire.length;
};

Deno.serve(async (req) => {
  const cors = corsHeaders(req);
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  const auth = req.headers.get('Authorization') ?? '';

  // The cron job authenticates with a secret stored only in Vault (never in the
  // repo or env). A match → cron mode (all users); otherwise treat as a user JWT.
  const { data: cronSecret } = await admin.rpc('get_cron_secret');

  let userIds: string[];
  if (cronSecret && timingSafeEqual(auth, `Bearer ${cronSecret}`)) {
    const { data } = await admin.from('push_subscriptions').select('user_id');
    userIds = [...new Set((data ?? []).map((r) => r.user_id as string))];
  } else {
    const userClient = createClient(url, anon, { global: { headers: { Authorization: auth } } });
    const { data, error } = await userClient.auth.getUser();
    if (error || !data.user) return json({ error: 'Unauthorized' }, 401, cors);
    // Throttle the manual "Check now" button so it can't be spammed to send
    // push. Fail CLOSED so a DB error can't turn it into an unthrottled sender.
    if (!(await rateAllow(data.user.id, 'notify-now', 10, 60, true)))
      return json({ error: 'Rate limit exceeded. Please wait a moment.' }, 429, cors);
    userIds = [data.user.id];
  }

  const now = new Date();
  let fired = 0;
  for (const id of userIds) {
    try {
      fired += await processUser(id, now);
    } catch {
      /* skip a failing user, continue the batch */
    }
  }
  return json({ fired }, 200, cors);
});
