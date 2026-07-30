// Pure transcript-buffering decisions. Deliberately a leaf module with zero
// imports, so `node --test` can load it directly without the extensionless
// relative imports elsewhere in src/lib tripping Node's TS resolver.

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
