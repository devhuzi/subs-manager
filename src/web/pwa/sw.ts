/// <reference lib="webworker" />
export {};

// Service worker for the PWA: precaches the app shell for offline use and
// handles Web Push (renewal/trial reminders sent by the scheduled-notify Edge
// Function even when the app is closed). Excluded from tsc (WebWorker lib
// conflicts with the DOM lib) — vite/esbuild compiles it. `self` is the
// ServiceWorkerGlobalScope at runtime.

const CACHE = 'tsm-precache-v1';
// vite-plugin-pwa injects the precache list at `self.__WB_MANIFEST`.
const assets = (self.__WB_MANIFEST as Array<{ url: string }>).map((e) => e.url);

self.addEventListener('install', (event: ExtendableEvent) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(assets))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event: ExtendableEvent) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
      await self.clients.claim();
    })(),
  );
});

// Network-first for same-origin GETs, falling back to cache (then the shell).
self.addEventListener('fetch', (event: FetchEvent) => {
  const req = event.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  event.respondWith(
    (async () => {
      try {
        return await fetch(req);
      } catch {
        const cached = await caches.match(req);
        return cached ?? (await caches.match('/index.html')) ?? Response.error();
      }
    })(),
  );
});

self.addEventListener('push', (event: PushEvent) => {
  let data: { title?: string; body?: string; url?: string } = {};
  try {
    data = event.data?.json() ?? {};
  } catch {
    data = { body: event.data?.text() };
  }
  event.waitUntil(
    self.registration.showNotification(data.title ?? 'Subscription reminder', {
      body: data.body ?? '',
      icon: '/pwa-icon.png',
      badge: '/pwa-icon.png',
      data: { url: data.url ?? '/' },
    }),
  );
});

self.addEventListener('notificationclick', (event: NotificationEvent) => {
  event.notification.close();
  const url = (event.notification.data as { url?: string })?.url ?? '/';
  event.waitUntil(
    (async () => {
      const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      for (const client of all) {
        if ('focus' in client) return client.focus();
      }
      return self.clients.openWindow(url);
    })(),
  );
});
