import { getDb } from './supabase';
import type { Persona } from './types';

/**
 * Builds the agent persona for a user by reading their saved context,
 * today's async update, and profile. Owned by Track A per HANDOFF-V2.md §4.
 *
 * Returns null when no context has been saved for the user — the caller
 * (Track B's agent) should handle this gracefully (skip the agent turn).
 */

// PHASE 2 STUB — always returns the hardcoded demo persona below.
// Track A replaces this with a real DB read in Phase 3.
export async function getPersona(userId: string): Promise<Persona | null> {
  void userId; // suppress unused warning during stub phase
  return {
    user_name: 'Demo User',
    user_role: 'Backend Engineer',
    current_work: 'Building the payments integration for Pinico',
    active_blockers: 'Blocked on Auth0 staging webhook returning a 500 error',
    recent_wins: 'Shipped the dashboard yesterday',
    communication_style: 'Direct and technical',
    delegation_instructions:
      'If asked about the API, point them to the OpenAPI spec at /docs/api',
    topics_to_track: 'Auth0, staging, webhook, payments, Stripe',
    questions_for_team: 'Does anyone know when the staging environment will be fixed?',
    meeting_goal: 'Get an ETA on the staging fix and unblock the payments work',
    raw_context:
      'Async update: Working on payments integration. Blocked by Auth0 staging webhook 500.',
  };
}
