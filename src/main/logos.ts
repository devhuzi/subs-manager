const FETCH_TIMEOUT_MS = 5_000;
const MAX_LOGO_BYTES = 256 * 1024;

const safeDomain = (input: string): string | null => {
  try {
    const withScheme = /^https?:\/\//i.test(input) ? input : `https://${input}`;
    const url = new URL(withScheme);
    const host = url.hostname.replace(/^www\./, '').toLowerCase();
    if (!/^[a-z0-9.-]+$/.test(host) || !host.includes('.')) return null;
    return host;
  } catch {
    return null;
  }
};

/**
 * Fetch one image. The abort timer stays armed until the body is fully read, so
 * a server that sends headers and then stalls can't hang the call. Bodies over
 * MAX_LOGO_BYTES or with a non-image content-type are rejected. Never throws.
 */
const fetchImage = async (url: string): Promise<{ buf: Buffer; mime: string } | null> => {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    if (!res.ok || !res.body) return null;
    const mime = (res.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase();
    if (!mime.startsWith('image/')) return null;
    const chunks: Uint8Array[] = [];
    let total = 0;
    const reader = res.body.getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_LOGO_BYTES) {
        ctrl.abort();
        return null;
      }
      chunks.push(value);
    }
    return { buf: Buffer.concat(chunks), mime };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
};

const fetchLogoBytes = async (
  domain: string,
): Promise<{ buf: Buffer; mime: string } | null> => {
  // Same order as the web `fetch-logo` Edge Function. (Clearbit's free logo
  // API was discontinued, so it's no longer tried.)
  const sources = [
    `https://icons.duckduckgo.com/ip3/${domain}.ico`,
    `https://www.google.com/s2/favicons?domain=${domain}&sz=128`,
  ];
  for (const url of sources) {
    const result = await fetchImage(url);
    if (!result || result.buf.byteLength < 200) continue; // skip placeholder fallbacks
    return result;
  }
  return null;
};

/**
 * Fetch a logo for the given website and return a data URL, or null on
 * failure. Never throws.
 */
export const fetchLogoDataUrl = async (website: string | undefined): Promise<string | null> => {
  if (!website) return null;
  const domain = safeDomain(website);
  if (!domain) return null;
  const result = await fetchLogoBytes(domain);
  if (!result) return null;
  return `data:${result.mime};base64,${result.buf.toString('base64')}`;
};
