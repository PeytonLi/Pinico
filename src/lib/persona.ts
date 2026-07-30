import { getDb } from './supabase';
import type { Persona } from './types';

/**
 * Builds the agent persona for a user by reading their saved context,
 * today's async update, and profile. Owned by Track A per HANDOFF-V2.md §4.
 *
 * Returns null when no context has been saved for the user — the caller
 * (Track B's agent) should handle this gracefully (skip the agent turn).
 */
export async function getPersona(userId: string): Promise<Persona | null> {
  const db = getDb();

  // Read agent_context, today's async update, and profile in parallel
  const [ctxRes, updateRes, profileRes] = await Promise.all([
    db.from('agent_context').select('*').eq('user_id', userId).maybeSingle(),
    db
      .from('async_updates')
      .select('status_text, blockers_text')
      .eq('user_id', userId)
      .eq('date', new Date().toISOString().slice(0, 10))
      .maybeSingle(),
    db.from('profiles').select('full_name').eq('id', userId).single(),
  ]);

  const ctx = ctxRes.data;
  const update = updateRes.data;
  const profile = profileRes.data;

  if (!ctx) return null;

  // Build raw_context from async update if available
  const rawContext = update
    ? `Async update: ${update.status_text}${update.blockers_text ? ` | Blockers: ${update.blockers_text}` : ''}`
    : '';

  return {
    user_name: profile?.full_name ?? 'Team Member',
    user_role: 'Engineer', // ponytail: hardcoded default. Add role field to profiles if needed.
    current_work: ctx.current_work ?? '',
    active_blockers: ctx.active_blockers ?? '',
    recent_wins: ctx.recent_wins ?? '',
    communication_style: ctx.communication_style ?? 'Direct and professional',
    delegation_instructions: ctx.delegation_instructions ?? '',
    topics_to_track: ctx.topics_to_track ?? '',
    questions_for_team: ctx.questions_for_team ?? '',
    meeting_goal: ctx.meeting_goal ?? '',
    raw_context: rawContext,
  };
}
