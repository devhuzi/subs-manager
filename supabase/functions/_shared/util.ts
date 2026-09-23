import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// Comma-separated allow-list of browser origins. Defaults to the local dev
// servers only, so production MUST set ALLOWED_ORIGINS (e.g. via
// `supabase secrets set ALLOWED_ORIGINS=https://your-app.example.com`) or the
// deployed app's requests are blocked by CORS. (CORS is not the auth boundary
// here — the JWT is, and credentials mode is off — so listing localhost does
// not weaken production.)
const DEFAULT_ORIGINS = [
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'http://localhost:3000',
  'http://127.0.0.1:3000',
].join(',');
const allowedOrigins = (Deno.env.get('ALLOWED_ORIGINS') ?? DEFAULT_ORIGINS)
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

/**
 * Per-request CORS headers. Reflects the request Origin only when it is on the
 * allow-list; otherwise falls back to the primary origin (so a disallowed
 * origin gets a non-matching ACAO and the browser blocks the response).
 */
export const corsHeaders = (req: Request): Record<string, string> => {
  const origin = req.headers.get('Origin') ?? '';
  const allow = allowedOrigins.includes(origin) ? origin : allowedOrigins[0];
  return {
    'Access-Control-Allow-Origin': allow,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    Vary: 'Origin',
  };
};

export const json = (
  body: unknown,
  status = 200,
  cors: Record<string, string> = {},
): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });

const url = Deno.env.get('SUPABASE_URL')!;
const anon = Deno.env.get('SUPABASE_ANON_KEY')!;
const serviceRole = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

/** Resolves the authenticated user's id from the request's JWT, or null. */
export const getUserId = async (req: Request): Promise<string | null> => {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return null;
  const client = createClient(url, anon, { global: { headers: { Authorization: authHeader } } });
  const { data, error } = await client.auth.getUser();
  return error || !data.user ? null : data.user.id;
};

/** Service-role client — can call the Vault/rate-limit RPC helpers. Never expose to clients. */
export const adminClient = () => createClient(url, serviceRole);

/**
 * Per-user fixed-window rate limit via the rate_take() SQL helper. Returns true
 * when the call is allowed. On infra error it fails OPEN by default so a
 * transient DB issue never bricks a feature — pass failClosed=true on costly,
 * abusable paths (e.g. the paid AI proxy) to deny instead.
 */
export const rateAllow = async (
  userId: string,
  bucket: string,
  limit: number,
  windowSecs: number,
  failClosed = false,
): Promise<boolean> => {
  const { data, error } = await adminClient().rpc('rate_take', {
    p_user: userId,
    p_bucket: bucket,
    p_limit: limit,
    p_window: `${windowSecs} seconds`,
  });
  if (error) return !failClosed;
  return data === true;
};

/**
 * Constant-time string comparison, so secret checks (e.g. the cron bearer) don't
 * leak length/prefix info through response timing. Returns early only on the
 * (non-secret) length mismatch.
 */
export const timingSafeEqual = (a: string, b: string): boolean => {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
};
