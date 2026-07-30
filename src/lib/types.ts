// Shared contracts between Track A (product surface) and Track B (bot pipeline).
// FROZEN after Phase 0 — changing anything here requires both agents to agree.

export type Profile = {
  id: string;
  auth0_user_id: string;
  email: string;
  full_name: string | null;
  jira_account_id: string | null;
  created_at: string;
};

export type MeetingStatus = 'scheduled' | 'in_call' | 'completed';

/** A owns the caller (dashboard), B owns the handler (/api/bot/dispatch). */
export type DispatchRequest = { meeting_url: string };
export type DispatchResponse = { bot_id: string; meeting_id: string };

/** B writes the rows, A polls GET /api/meetings/[id] and renders this. */
export type MeetingState = {
  status: MeetingStatus;
  duration_minutes: number;
  tickets: {
    jira_ticket_key: string;
    summary: string;
    priority: string;
    created_at: string;
  }[];
};

/**
 * OpenAI structured-output shape. Every field is required because
 * `strict: true` rejects schemas with optional properties — the model must
 * return "" for unknowns rather than omitting the key.
 */
export type ExtractedBlocker = {
  blocker_found: boolean;
  summary: string;
  description: string;
  reported_by: string;
  suggested_assignee: string;
  priority: 'Highest' | 'High' | 'Medium' | 'Low';
};
