import { getDb } from './supabase';
import { extractBlocker } from './openai';
import { shouldFlush } from './buffer';
import type { ExtractedBlocker } from './types';

// shouldFlush/dedupeKey live in ./buffer so they stay unit-testable under
// `node --test` (see the comment at the top of that file).
export { shouldFlush, dedupeKey } from './buffer';

type AsyncUpdateRow = {
  status_text: string;
  blockers_text: string | null;
  profiles: { full_name: string | null; email: string } | { full_name: string | null; email: string }[] | null;
};

function formatUpdateRow(row: AsyncUpdateRow): string {
  const profile = Array.isArray(row.profiles) ? row.profiles[0] : row.profiles;
  const name = profile?.full_name || profile?.email || 'unknown';
  const blocker = row.blockers_text ? ` (blocker: ${row.blockers_text})` : '';
  return `${name}: ${row.status_text}${blocker}`;
}

/**
 * Appends a transcript fragment to the meeting's buffer. Flushes (calls
 * OpenAI) and clears the buffer once shouldFlush() says so; otherwise just
 * persists the growing buffer and returns null. This is what stands between
 * Recall's continuous stream and hundreds of redundant OpenAI calls.
 */
export async function ingestChunk(meetingId: string, text: string): Promise<ExtractedBlocker | null> {
  const db = getDb();
  const now = new Date();

  const { data: meeting, error } = await db
    .from('meetings')
    .select('transcript_buffer, last_chunk_at')
    .eq('id', meetingId)
    .single();
  if (error || !meeting) {
    throw new Error(`meeting ${meetingId} not found: ${error?.message ?? 'no row'}`);
  }

  const buffer = (meeting.transcript_buffer ?? '') + text;
  const priorChunkAt = meeting.last_chunk_at ? new Date(meeting.last_chunk_at) : null;

  if (!shouldFlush(buffer, priorChunkAt, now)) {
    await db
      .from('meetings')
      .update({ transcript_buffer: buffer, last_chunk_at: now.toISOString() })
      .eq('id', meetingId);
    return null;
  }

  await db
    .from('meetings')
    .update({ transcript_buffer: '', last_chunk_at: now.toISOString() })
    .eq('id', meetingId);

  const today = now.toISOString().slice(0, 10);
  const { data: updates } = await db
    .from('async_updates')
    .select('status_text, blockers_text, profiles:user_id(full_name, email)')
    .eq('date', today);

  const context = ((updates ?? []) as AsyncUpdateRow[]).map(formatUpdateRow).join('\n');

  return extractBlocker(buffer, context);
}
