import type { ConversationTurn } from './types';

// In-memory conversation history for the agent. Deliberately a leaf module with
// no value imports, so `node --test` can load it without the extensionless
// relative imports in agent.ts tripping Node's TS resolver (same reason as
// buffer.ts).
//
// ponytail: in-memory sliding window — dies with the process and isn't shared
// across instances. Upgrade to a DB table if persistence is needed.
const historyByMeeting = new Map<string, ConversationTurn[]>();
const MAX_HISTORY = 10;

export function loadHistory(meetingId: string): ConversationTurn[] {
  return historyByMeeting.get(meetingId) ?? [];
}

export function appendHistory(meetingId: string, turn: ConversationTurn): void {
  const current = loadHistory(meetingId);
  current.push(turn);
  if (current.length > MAX_HISTORY) current.shift();
  historyByMeeting.set(meetingId, current);
}
