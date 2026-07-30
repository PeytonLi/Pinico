import { getDb } from './supabase';
import { extractBlocker } from './openai';
import type { ExtractedBlocker } from './types';

const FLUSH_CHAR_THRESHOLD = 200;
const FLUSH_SILENCE_MS = 5000;

/**
 * True when the buffer is ready to be sent to OpenAI: either it's grown long
 * enough, or enough silence has passed since the last chunk that whoever was
 * speaking has finished.
 *
 * ponytail: char/time heuristic, ceiling is ~200 chars or 5s silence — it can
 * flush mid-sentence on a long pause, or merge two distinct blockers spoken
 * back-to-back with no pause between them. Upgrade to speaker-turn
 * segmentation + embedding similarity dedupe if that misfires in testing.
 */
export function shouldFlush(buffer: string, lastChunkAt: Date | null, now: Date): boolean {
  if (buffer.length >= FLUSH_CHAR_THRESHOLD) return true;
  if (buffer.length === 0) return false;
  if (!lastChunkAt) return false;
  return now.getTime() - lastChunkAt.getTime() >= FLUSH_SILENCE_MS;
}

/** Normalized key for the `tickets (meeting_id, dedupe_key)` unique index. */
export function dedupeKey(summary: string): string {
  return summary.toLowerCase().replace(/\s+/g, ' ').trim();
}

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
