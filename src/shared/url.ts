/**
 * Normalizes a user-entered link for opening in a browser. Bare domains
 * ("example.com") get `https://`; only http(s) survives — `javascript:`,
 * `data:`, `file:` and custom URI handlers return null. Same rules as the
 * desktop `system:openExternal` handler in src/main/data.ts.
 */
export const normalizeExternalUrl = (raw: string): string | null => {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const normalized = /^[a-z]+:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  let protocol: string;
  try {
    protocol = new URL(normalized).protocol;
  } catch {
    return null;
  }
  return protocol === 'https:' || protocol === 'http:' ? normalized : null;
};
