import { getDb } from './supabase';
import { processTranscript } from './agent';
import { shouldFlush } from './buffer';

// shouldFlush/dedupeKey live in ./buffer so they stay unit-testable under
// `node --test` (see the comment at the top of that file).
export { shouldFlush, dedupeKey } from './buffer';

/**
 * Appends a transcript fragment to the meeting's buffer. Flushes (calls the
 * full agent pipeline: persona → LLM → voice + chat + ticket) and clears the
 * buffer once shouldFlush() says so; otherwise just persists the growing
 * buffer and returns.
 *
 * V2 change: at flush time, calls processTranscript() which handles speaking,
 * ticket creation, and dedupe — the webhook no longer does any of that itself.
 */
export async function ingestChunk(
  meetingId: string,
  botId: string,
  text: string,
): Promise<void> {
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
    return;
  }

  // Clear buffer before processing — agent pipeline is slow (LLM + TTS),
  // and concurrent chunks shouldn't duplicate the same buffered text.
  await db
    .from('meetings')
    .update({ transcript_buffer: '', last_chunk_at: now.toISOString() })
    .eq('id', meetingId);

  // Agent pipeline handles speaking + tickets + dedupe internally.
  // Wrap in try/catch — one failed turn must never kill the session.
  try {
    await processTranscript(meetingId, botId, buffer);
  } catch (err) {
    console.error('[extract] processTranscript failed:', err);
    // Buffer was already cleared; the transcript segment is lost, but the
    // bot session continues. This is the right trade-off for a demo.
  }
}
