import { auth0 } from './auth0';
import { getDb } from './supabase';
import type { Profile } from './types';

/**
 * Resolves the current Auth0 session to a `profiles` row, creating it on
 * first login. Returns null when nobody is signed in — callers decide
 * whether that's a redirect or a 401.
 */
export async function getOrCreateProfile(): Promise<Profile | null> {
  const session = await auth0.getSession();
  if (!session) return null;

  const { user } = session;
  if (!user.email) {
    throw new Error(`Auth0 user ${user.sub} has no email claim`);
  }

  const { data, error } = await getDb()
    .from('profiles')
    .upsert(
      {
        auth0_user_id: user.sub,
        email: user.email,
        full_name: user.name ?? null,
      },
      { onConflict: 'auth0_user_id' }
    )
    .select()
    .single();

  if (error) throw error;
  return data as Profile;
}
