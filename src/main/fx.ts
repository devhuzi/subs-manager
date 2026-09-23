import type { FxRates } from '../shared/types';
import { loadRates, saveRates } from './data';

// frankfurter.app moved to frankfurter.dev (the old domain only 301-redirects).
// Use the new canonical endpoint directly.
const ENDPOINT = (base: string): string =>
  `https://api.frankfurter.dev/v1/latest?base=${encodeURIComponent(base.toUpperCase())}`;

const FETCH_TIMEOUT_MS = 10_000;
const STALE_AFTER_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

interface FrankfurterResponse {
  base: string;
  date: string;
  rates: Record<string, number>;
}

const isValidResponse = (json: unknown): json is FrankfurterResponse => {
  if (!json || typeof json !== 'object') return false;
  const { base, rates } = json as Partial<FrankfurterResponse>;
  if (typeof base !== 'string' || !base) return false;
  if (!rates || typeof rates !== 'object' || Array.isArray(rates)) return false;
  return Object.values(rates).every((v) => typeof v === 'number' && Number.isFinite(v));
};

/** Cached rates, or null if the cache is missing or unreadable. */
const loadCachedRates = (): Promise<FxRates | null> =>
  loadRates().catch((err) => {
    console.error('FX rates cache unreadable', err);
    return null;
  });

const fetchRatesFromNetwork = async (base: string): Promise<FxRates> => {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(ENDPOINT(base), { signal: ctrl.signal });
    if (!res.ok) throw new Error(`Rates fetch returned HTTP ${res.status}`);
    const json: unknown = await res.json();
    // Validate before it reaches the cache — a bad payload would otherwise
    // poison every conversion until the next weekly refresh.
    if (!isValidResponse(json)) throw new Error('Rates response has an unexpected shape');
    return {
      base: json.base,
      fetchedAt: new Date().toISOString(),
      rates: { ...json.rates, [json.base]: 1 },
    };
  } finally {
    clearTimeout(timer);
  }
};

const isFresh = (rates: FxRates): boolean => {
  const fetched = Date.parse(rates.fetchedAt);
  if (!Number.isFinite(fetched)) return false;
  return Date.now() - fetched < STALE_AFTER_MS;
};

/**
 * Returns rates for the requested base. Never throws — on network failure
 * returns the stale cache or null. Refreshes silently when stale.
 */
export const getRates = async (
  base: string | undefined,
): Promise<FxRates | null> => {
  if (!base) return null;
  const cached = await loadCachedRates();
  if (cached && cached.base === base.toUpperCase() && isFresh(cached)) return cached;
  try {
    const fresh = await fetchRatesFromNetwork(base);
    await saveRates(fresh);
    return fresh;
  } catch (err) {
    console.error('FX rates fetch failed', err);
    return cached;
  }
};

/** Force a refresh regardless of cache freshness. */
export const refreshRates = async (base: string): Promise<FxRates | null> => {
  try {
    const fresh = await fetchRatesFromNetwork(base);
    await saveRates(fresh);
    return fresh;
  } catch (err) {
    console.error('FX rates refresh failed', err);
    return loadCachedRates();
  }
};
