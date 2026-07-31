// Blocker duplicate detection. Leaf module (no value imports) so it stays
// unit-testable under `node --test`.
//
// Why this exists: the tickets unique index is (meeting_id, dedupe_key), which
// only suppresses repeats *within one meeting*, and it matches exact strings.
// So the same spoken blocker filed a fresh Jira ticket on every run, and even
// inside one meeting "duration limit unknown" vs "duration limits unknown" both
// got through. Real blockers get restated in slightly different words every
// standup — exact matching cannot handle that.

/** Filler words that carry no signal for comparing two blocker summaries. */
const STOPWORDS = new Set([
  'a', 'an', 'the', 'is', 'are', 'was', 'were', 'be', 'being', 'been',
  'on', 'in', 'at', 'to', 'for', 'of', 'with', 'and', 'or', 'but',
  'i', 'we', 'my', 'our', 'it', 'its', 'this', 'that', 'still', 'unknown',
  'blocked', 'blocker', 'issue', 'problem', 'currently',
]);

/** Crude suffix strip so "limits" matches "limit" and "returning" matches "return". */
function stem(word: string): string {
  return word
    .replace(/(ing|ed|es|s)$/, '')
    .replace(/(.)\1$/, '$1'); // collapse a doubled final letter left behind
}

/**
 * Content words of a summary, normalized for comparison: lowercased,
 * punctuation stripped, stopwords dropped, crudely stemmed.
 */
export function contentTokens(summary: string): Set<string> {
  return new Set(
    summary
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length > 1 && !STOPWORDS.has(w))
      .map(stem)
      .filter((w) => w.length > 1)
  );
}

/**
 * Jaccard overlap of content words, 0..1.
 *
 * ponytail: bag-of-words overlap, no embeddings. It cannot tell "Auth0 webhook
 * is down" from "Auth0 webhook is fixed", and it will not match two wordings
 * that share no vocabulary. Upgrade to embedding cosine similarity if either
 * shows up in practice.
 */
export function similarity(a: string, b: string): number {
  const ta = contentTokens(a);
  const tb = contentTokens(b);
  if (ta.size === 0 || tb.size === 0) return 0;
  let shared = 0;
  for (const t of ta) if (tb.has(t)) shared++;
  return shared / (ta.size + tb.size - shared);
}

/** Above this, two summaries are treated as the same blocker. */
export const DUPLICATE_THRESHOLD = 0.5;

/**
 * The already-filed summary this blocker duplicates, or null if it's genuinely
 * new. Callers pass existing ticket summaries (across meetings, not just this
 * one) so a standing blocker isn't refiled every standup.
 */
export function findDuplicate(summary: string, existing: string[]): string | null {
  let best: string | null = null;
  let bestScore = 0;
  for (const candidate of existing) {
    const score = similarity(summary, candidate);
    if (score >= DUPLICATE_THRESHOLD && score > bestScore) {
      best = candidate;
      bestScore = score;
    }
  }
  return best;
}
