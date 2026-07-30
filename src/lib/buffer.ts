// Pure transcript-buffering decisions. Deliberately a leaf module with zero
// imports, so `node --test` can load it directly without the extensionless
// relative imports elsewhere in src/lib tripping Node's TS resolver.

const FLUSH_CHAR_THRESHOLD = 200;
const FLUSH_SILENCE_MS = 5000;
const MIN_UTTERANCE_CHARS = 15;

/**
 * True when the buffer is ready to go to the LLM.
 *
 * Recall's `transcript.data` events are FINALIZED utterances — interim results
 * arrive as `transcript.partial_data`, which the webhook ignores. So each event
 * is already a complete thought and there is nothing to wait for.
 *
 * This used to require 200 chars or 5s of silence, which deadlocked: the
 * function is only evaluated when a new chunk arrives, so a single short
 * utterance followed by silence buffered forever and the agent never spoke.
 * A silence rule needs a timer to fire on its own; there isn't one, and adding
 * one inside `after()` is not reliable. Flushing per finalized utterance
 * removes the need entirely.
 *
 * ponytail: one LLM call per utterance — more calls than batching, but the
 * agent decides `should_speak` so most are cheap no-ops, and responsiveness is
 * the whole product. Batch by speaker turn if cost becomes real.
 */
export function shouldFlush(buffer: string, lastChunkAt: Date | null, now: Date): boolean {
  const trimmed = buffer.trim();
  if (trimmed.length === 0) return false;
  // A finalized utterance long enough to mean something: act on it now.
  if (trimmed.length >= MIN_UTTERANCE_CHARS) return true;
  // Backstops for very short fragments ("yes", "no") that arrive in a stream.
  if (buffer.length >= FLUSH_CHAR_THRESHOLD) return true;
  if (!lastChunkAt) return false;
  return now.getTime() - lastChunkAt.getTime() >= FLUSH_SILENCE_MS;
}

/** Normalized key for the `tickets (meeting_id, dedupe_key)` unique index. */
export function dedupeKey(summary: string): string {
  return summary.toLowerCase().replace(/\s+/g, ' ').trim();
}
