import { createClient, type SupabaseClient } from '@supabase/supabase-js';

let client: SupabaseClient | null = null;

/**
 * Server-only DB handle. Uses the service role key, which bypasses RLS —
 * never import this into a client component.
 *
 * Lazy on purpose: Next collects route metadata at build time by importing
 * every route module, so constructing a client at module scope makes
 * `pnpm build` fail whenever credentials are absent. Same rule applies to the
 * OpenAI, Stripe and Recall clients — construct them inside a function.
 */
export function getDb(): SupabaseClient {
  if (client) return client;

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set');
  }

  client = createClient(url, key, { auth: { persistSession: false } });
  return client;
}
