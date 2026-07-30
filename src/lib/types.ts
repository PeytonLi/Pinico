// Shared contracts between Track A (product surface) and Track B (bot pipeline).
// Change process: propose in handoff, both agents agree, then edit.

// ---- V1 types (frozen) ----

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

// ---- V2 types (agreed per HANDOFF-V2.md §3) ----

/** Agent persona — built from user-submitted context before the meeting. */
export type Persona = {
  user_name: string;
  user_role: string;
  current_work: string;
  active_blockers: string;
  recent_wins: string;
  communication_style: string;
  delegation_instructions: string;
  topics_to_track: string;
  questions_for_team: string;
  meeting_goal: string;
  raw_context: string;
};

/** One turn in the meeting conversation. */
export type ConversationTurn = {
  speaker: string;
  text: string;
  timestamp: string;
};

/** Agent's decision after processing a transcript segment. */
export type AgentAction = {
  should_speak: boolean;
  message: string;
  thinking: string;
  blocker: {
    found: boolean;
    summary: string;
    description: string;
    priority: 'Highest' | 'High' | 'Medium' | 'Low';
  };
};

/** POST /api/context request body */
export type ContextRequest = {
  current_work: string;
  active_blockers?: string;
  recent_wins?: string;
  communication_style?: string;
  delegation_instructions?: string;
  topics_to_track?: string;
  questions_for_team?: string;
  meeting_goal?: string;
};
