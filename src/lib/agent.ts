import type { AgentAction, ConversationTurn, Persona } from './types';

/**
 * Core agent loop. Owned by Track B per HANDOFF-V2.md §5.
 *
 * Called from the recall webhook when the transcript buffer flushes.
 * Builds context, calls the LLM, and returns the agent's decision.
 */

// ---- conversation history (in-memory, last-10 sliding window) ----
// ponytail: in-memory sliding window. Upgrade to DB table if persistence is needed.
const historyByMeeting = new Map<string, ConversationTurn[]>();
const MAX_HISTORY = 10;

function loadHistory(meetingId: string): ConversationTurn[] {
  return historyByMeeting.get(meetingId) ?? [];
}

function appendHistory(meetingId: string, turn: ConversationTurn): void {
  const current = loadHistory(meetingId);
  current.push(turn);
  if (current.length > MAX_HISTORY) current.shift();
  historyByMeeting.set(meetingId, current);
}

// ---- processTranscript ----

/**
 * PHASE 2 STUB — returns a no-op action. Track B replaces with the real
 * agent pipeline (persona + history + LLM) in Phase 2.
 */
export async function processTranscript(
  meetingId: string,
  _botId: string,
  _text: string,
): Promise<AgentAction> {
  appendHistory(meetingId, {
    speaker: 'System',
    text: _text,
    timestamp: new Date().toISOString(),
  });

  return {
    should_speak: false,
    message: '',
    thinking: 'Phase 2 stub — no agent logic wired yet',
    blocker: { found: false, summary: '', description: '', priority: 'Medium' },
  };
}

// Re-export for extract.ts to use at flush time
export { loadHistory, appendHistory };
