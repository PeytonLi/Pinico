import OpenAI from 'openai';
import { z } from 'zod';
import type { ExtractedBlocker } from './types';

// DeepSeek via the OpenAI-compatible endpoint. We keep the `openai` SDK — only
// baseURL, key and model change.
//
// IMPORTANT: DeepSeek does NOT support `response_format: {type:'json_schema',
// strict:true}` — it rejects it as "unavailable now". Only JSON mode
// (`{type:'json_object'}`) is available on the stable endpoint, and JSON mode
// guarantees *syntactically* valid JSON, nothing about fields or enums. There
// is a strict-schema beta, but it only constrains tool-call arguments and needs
// a separate beta base URL.
//
// So the schema guarantee moves client-side: JSON mode gets us parseable JSON,
// and the zod schema below is what actually enforces the contract. Without it a
// hallucinated priority or a missing summary would go straight into a Jira
// ticket. Docs: https://api-docs.deepseek.com/guides/json_mode
const DEFAULT_MODEL = 'deepseek-v4-flash';
const DEFAULT_BASE_URL = 'https://api.deepseek.com';

// Lazy on purpose — see src/lib/supabase.ts's getDb() comment. A top-level
// `new OpenAI(...)` would make `pnpm build` fail whenever credentials are
// absent, because Next 16 imports every route module at build time.
function getClient(): OpenAI {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) throw new Error('DEEPSEEK_API_KEY must be set');
  return new OpenAI({
    apiKey,
    baseURL: process.env.DEEPSEEK_BASE_URL || DEFAULT_BASE_URL,
  });
}

// JSON mode requires the word "json" in the prompt AND an example of the shape.
// Both are load-bearing per DeepSeek's docs — without them the call can return
// empty content.
const SYSTEM_PROMPT = `You are monitoring a live standup meeting transcript for spoken blockers.

Identify technical blockers, dependency issues, or outages that are actively preventing someone's work. Ignore small talk, status updates that describe progress, and anything already resolved. If nothing in the transcript segment is a genuine blocker, set blocker_found to false.

You are also given today's async standup updates from teammates who are NOT on this call. Use them to attribute the blocker correctly — e.g. if the transcript says "the payments staging environment is down" and an async update from someone mentions they own payments staging, that person is the right reported_by or suggested_assignee even though they never spoke. This attribution is the whole point: do not limit yourself to names mentioned in the transcript.

If reported_by or suggested_assignee cannot be grounded in the transcript or the async context, use "" for that field — never invent a name.

Reply with a single json object and nothing else. No markdown, no code fences, no commentary. It must match this json shape exactly:

{
  "blocker_found": true,
  "summary": "Auth0 staging webhook returning 500",
  "description": "The staging Auth0 webhook has been returning 500 errors, blocking end-to-end login tests.",
  "reported_by": "Priya",
  "suggested_assignee": "Devon",
  "priority": "High"
}

"priority" must be exactly one of: "Highest", "High", "Medium", "Low".
When blocker_found is false, use "" for the four string fields and "Low" for priority.`;

/**
 * The real contract enforcement, now that DeepSeek can't do it server-side.
 * `blocker_found` is required and strict — it's the field we branch on. The
 * rest are tolerant: a soft default beats discarding an otherwise good blocker.
 */
const BlockerSchema = z.object({
  blocker_found: z.boolean(),
  summary: z.string().catch(''),
  description: z.string().catch(''),
  reported_by: z.string().catch(''),
  suggested_assignee: z.string().catch(''),
  priority: z.enum(['Highest', 'High', 'Medium', 'Low']).catch('Medium'),
});

const NO_BLOCKER: ExtractedBlocker = {
  blocker_found: false,
  summary: '',
  description: '',
  reported_by: '',
  suggested_assignee: '',
  priority: 'Low',
};

/**
 * Parses and validates a model reply. Pure, so it's unit-testable without an
 * API key — this is the function that stands between a hallucinated response
 * and a bogus Jira ticket.
 *
 * Returns null when the reply can't be trusted at all; the caller treats that
 * as "no blocker" rather than filing something garbage.
 */
export function parseBlockerResponse(raw: string): ExtractedBlocker | null {
  if (!raw?.trim()) return null;

  // JSON mode shouldn't fence its output, but models do it anyway and one stray
  // ```json costs us the whole extraction.
  const cleaned = raw
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '')
    .trim();

  let candidate: unknown;
  try {
    candidate = JSON.parse(cleaned);
  } catch {
    return null;
  }

  const parsed = BlockerSchema.safeParse(candidate);
  if (!parsed.success) return null;
  if (!parsed.data.blocker_found) return NO_BLOCKER;

  // A blocker with no summary can't become a ticket — treat it as a miss
  // rather than filing "[AUTOMATED BLOCKER] " with an empty title.
  if (!parsed.data.summary.trim()) return NO_BLOCKER;

  return parsed.data;
}

/**
 * Extract a structured blocker from a flushed transcript segment.
 * `context` is today's async standup updates, joined into one string by the
 * caller (extract.ts) — it lets the model attribute a blocker to someone who
 * isn't in the room.
 */
export async function extractBlocker(transcript: string, context: string): Promise<ExtractedBlocker> {
  const client = getClient();

  const completion = await client.chat.completions.create({
    model: process.env.DEEPSEEK_MODEL || DEFAULT_MODEL,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      {
        role: 'user',
        content: `Today's async standup updates (context for attribution, may be empty):\n${context || '(none)'}\n\nMeeting transcript segment:\n${transcript}\n\nReturn the json object.`,
      },
    ],
    response_format: { type: 'json_object' },
    // DeepSeek's docs recommend bounding this so JSON mode can't truncate
    // mid-object, which would fail the parse.
    max_tokens: 1000,
  });

  const content = completion.choices[0]?.message?.content ?? '';
  const parsed = parseBlockerResponse(content);
  if (!parsed) {
    // Never throw: this runs inside the Recall webhook, where one bad
    // extraction must not kill the bot session.
    console.error('[llm] unusable blocker response:', content.slice(0, 500));
    return NO_BLOCKER;
  }
  return parsed;
}
