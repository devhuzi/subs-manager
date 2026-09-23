import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  // Fail fast at startup rather than running with an empty config that breaks
  // cryptically (or insecurely) at request time.
  throw new Error(
    'Missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY — copy .env.example to .env and set them.',
  );
}

/**
 * The single Supabase client for the web app. `persistSession` keeps the user
 * logged in across reloads (stored in localStorage); the JWT is auto-attached
 * to every PostgREST/Edge-Function call and auto-refreshed.
 */
export const supabase = createClient(url, anonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});
