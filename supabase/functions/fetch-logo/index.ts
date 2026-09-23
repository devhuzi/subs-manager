// Fetches a service's favicon server-side (the browser can't, due to CORS) and
// returns it as a data URL — matching the desktop's logo model. DuckDuckGo
// serves the icon directly; Google's favicon service is the fallback. Both work
// from a server (they only fail in the browser under CORS). Requires a signed-in
// caller and is rate-limited so it can't be used as an open fetch proxy.
import { encodeBase64 } from 'jsr:@std/encoding/base64';
import { corsHeaders, getUserId, json, rateAllow } from '../_shared/util.ts';

// Real favicons are a few KB; anything bigger isn't a logo we want to embed.
const MAX_LOGO_BYTES = 256 * 1024;

const fetchWithTimeout = async (url: string, ms: number): Promise<Response | null> => {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { signal: ctrl.signal });
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
};

/** Reduces user input to a bare hostname, or null if it isn't a plausible domain. */
const safeDomain = (input: string): string | null => {
  try {
    const withScheme = /^https?:\/\//i.test(input) ? input : `https://${input}`;
    const host = new URL(withScheme).hostname.replace(/^www\./, '').toLowerCase();
    if (!/^[a-z0-9.-]+$/.test(host) || !host.includes('.')) return null;
    return host;
  } catch {
    return null;
  }
};

Deno.serve(async (req) => {
  const cors = corsHeaders(req);
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ dataUrl: null, error: 'Method not allowed' }, 405, cors);

  const userId = await getUserId(req);
  if (!userId) return json({ dataUrl: null, error: 'Unauthorized' }, 401, cors);

  // Fail CLOSED: this makes outbound server-side fetches, so a DB error must not
  // turn it into an unthrottled fetch fan-out.
  if (!(await rateAllow(userId, 'fetch-logo', 60, 60, true)))
    return json({ dataUrl: null, error: 'Rate limit exceeded.' }, 429, cors);

  let website = '';
  try {
    const body = (await req.json()) as { website?: string };
    website = body.website ?? '';
  } catch {
    return json({ dataUrl: null }, 400, cors);
  }

  const domain = safeDomain(website);
  if (!domain) return json({ dataUrl: null }, 200, cors);

  const sources = [
    `https://icons.duckduckgo.com/ip3/${domain}.ico`,
    `https://www.google.com/s2/favicons?domain=${domain}&sz=64`,
  ];

  for (const url of sources) {
    const res = await fetchWithTimeout(url, 5000);
    if (!res || !res.ok) continue;
    // Only embed images — the value becomes a data: URL rendered by the app.
    const contentType = (res.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase();
    const declaredLength = Number(res.headers.get('content-length') ?? 0);
    if (!/^image\/[a-z0-9.+-]+$/.test(contentType) || declaredLength > MAX_LOGO_BYTES) {
      await res.body?.cancel();
      continue;
    }
    const bytes = new Uint8Array(await res.arrayBuffer());
    if (bytes.byteLength < 100) continue; // skip empty / 1px placeholders
    if (bytes.byteLength > MAX_LOGO_BYTES) continue;
    return json({ dataUrl: `data:${contentType};base64,${encodeBase64(bytes)}` }, 200, cors);
  }

  return json({ dataUrl: null }, 200, cors);
});
