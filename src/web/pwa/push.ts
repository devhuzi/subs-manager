import { supabase } from '../supabase';

const VAPID_PUBLIC = import.meta.env.VITE_VAPID_PUBLIC_KEY;

const urlBase64ToUint8Array = (base64: string): Uint8Array => {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(b64);
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) arr[i] = raw.charCodeAt(i);
  return arr;
};

export const pushSupported = (): boolean =>
  'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

const currentSubscription = async (): Promise<PushSubscription | null> => {
  if (!pushSupported()) return null;
  const reg = await navigator.serviceWorker.ready;
  return reg.pushManager.getSubscription();
};

export const pushEnabled = async (): Promise<boolean> => {
  return (await currentSubscription()) != null;
};

/** Requests permission, subscribes via the SW, and stores the subscription. */
export const enablePush = async (): Promise<{ ok: boolean; error?: string }> => {
  if (!pushSupported()) {
    return { ok: false, error: 'Push notifications aren’t supported in this browser.' };
  }
  if (!VAPID_PUBLIC) return { ok: false, error: 'Push is not configured (missing VAPID key).' };

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') {
    return { ok: false, error: 'Notification permission was denied.' };
  }

  const reg = await navigator.serviceWorker.ready;
  // Always start from a fresh endpoint. A leftover subscription may still be
  // registered under ANOTHER account (e.g. a session that ended without sign-out),
  // and RLS hides that row from us — reusing the endpoint would keep delivering
  // that account's reminders to this browser. Unsubscribing kills the old
  // endpoint; the server prunes its row on the next 404/410.
  const existing = await reg.pushManager.getSubscription();
  if (existing) await existing.unsubscribe().catch(() => undefined);
  const sub = await reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC) as BufferSource,
  });

  const json = sub.toJSON();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || !json.endpoint || !json.keys) {
    return { ok: false, error: 'Could not register the subscription.' };
  }

  const { error } = await supabase.from('push_subscriptions').upsert(
    {
      user_id: user.id,
      endpoint: json.endpoint,
      p256dh: json.keys.p256dh,
      auth: json.keys.auth,
    },
    { onConflict: 'user_id,endpoint' },
  );
  return error ? { ok: false, error: error.message } : { ok: true };
};

/** Unsubscribes this browser and removes the stored subscription. */
export const disablePush = async (): Promise<void> => {
  const sub = await currentSubscription();
  if (!sub) return;
  const endpoint = sub.endpoint;
  await sub.unsubscribe().catch(() => undefined);
  await supabase.from('push_subscriptions').delete().eq('endpoint', endpoint);
};
