import OpenAI from 'openai';
import type { ExtractedBlocker } from './types';

// Lazy on purpose — see src/lib/supabase.ts's getDb() comment. A top-level
// `new OpenAI(...)` would make `pnpm build` fail whenever credentials are
// absent, because Next 16 imports every route module at build time.
function getOpenAI(): OpenAI {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('OPENAI_API_KEY must be set');
  return new OpenAI({ apiKey });
}

const SYSTEM_PROMPT = `You are monitoring a live standup meeting transcript for spoken blockers.

Identify technical blockers, dependency issues, or outages that are actively preventing someone's work. Ignore small talk, status updates that describe progress, and anything already resolved. If nothing in the transcript segment is a genuine blocker, return blocker_found: false.

You are also given today's async standup updates from teammates who are NOT on this call. Use them to attribute the blocker correctly — e.g. if the transcript says "the payments staging environment is down" and an async update from someone mentions they own payments staging, that person is the right reported_by or suggested_assignee even though they never spoke. This attribution is the whole point: do not limit yourself to names mentioned in the transcript.

If reported_by or suggested_assignee cannot be grounded in the transcript or the async context, return "" for that field — never invent a name. If blocker_found is false, still return "" for summary/description/reported_by/suggested_assignee and "Low" for priority.`;

// json_schema strict mode requires every property in `required` and
// `additionalProperties: false` — the PRD's 4-of-6 schema 400s. See
// docs/api-notes-ai.md for the confirmed request shape.
const RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    blocker_found: {
      type: 'boolean',
      description: 'True only if the transcript segment describes a real technical blocker, dependency issue, or outage.',
    },
    summary: {
      type: 'string',
      description: 'One-line summary of the blocker, suitable as a Jira ticket title. "" if blocker_found is false.',
    },
    description: {
      type: 'string',
      description: 'Fuller description of the blocker with any relevant detail from the transcript. "" if blocker_found is false.',
    },
    reported_by: {
      type: 'string',
      description: 'Best-guess name of whoever is affected by / reported the blocker, from the transcript or async context. "" if unknown.',
    },
    suggested_assignee: {
      type: 'string',
      description: 'Best-guess name of whoever should fix this, from the transcript or async context. "" if unknown.',
    },
    priority: {
      type: 'string',
      enum: ['Highest', 'High', 'Medium', 'Low'],
      description: 'Urgency of the blocker. "Low" if blocker_found is false.',
    },
  },
  required: ['blocker_found', 'summary', 'description', 'reported_by', 'suggested_assignee', 'priority'],
  additionalProperties: false,
};

/**
 * Extract a structured blocker from a flushed transcript segment.
 * `context` is today's async standup updates, joined into one string by the
 * caller (extract.ts) — it lets the model attribute a blocker to someone who
 * isn't in the room.
 */
export async function extractBlocker(transcript: string, context: string): Promise<ExtractedBlocker> {
  const client = getOpenAI();

  const completion = await client.chat.completions.create({
    model: 'gpt-4o',
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      {
        role: 'user',
        content: `Today's async standup updates (context for attribution, may be empty):\n${context || '(none)'}\n\nMeeting transcript segment:\n${transcript}`,
      },
    ],
    response_format: {
      type: 'json_schema',
      json_schema: {
        name: 'extracted_blocker',
        strict: true,
        schema: RESPONSE_SCHEMA,
      },
    },
  });

  const content = completion.choices[0]?.message?.content;
  if (!content) throw new Error('OpenAI returned no content for blocker extraction');
  return JSON.parse(content) as ExtractedBlocker;
}
