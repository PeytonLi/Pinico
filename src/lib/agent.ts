import { getDb } from './supabase';
import { getPersona } from './persona';
import { runAgentTurn, extractBlocker } from './llm';
import { textToSpeech } from './elevenlabs';
import { outputAudio, sendChatMessage } from './recall';
import { createJiraBlockerTicket } from './jira';
import { dedupeKey } from './buffer';
import { loadHistory, appendHistory } from './history';
import type { AgentAction, ConversationTurn, ExtractedBlocker } from './types';

/**
 * Core agent loop. Owned by Track B per HANDOFF-V2.md §5/B4.
 *
 * Called from the recall webhook when the transcript buffer flushes.
 * Persona + history + transcript → LLM → (voice | chat | ticket).
 */

// Conversation history lives in ./history so it stays unit-testable under
// `node --test` (see the comment at the top of that file).
export { loadHistory, appendHistory } from './history';

// ---- processTranscript ----

/**
 * Full agent pipeline: lookup persona → LLM → voice + chat + ticket.
 * Falls back to raw extractBlocker() if no persona is configured.
 */
export async function processTranscript(
  meetingId: string,
  botId: string,
  text: string,
): Promise<void> {
  const db = getDb();

  // Look up the meeting to find who dispatched this bot
  const { data: meeting } = await db
    .from('meetings')
    .select('user_id')
    .eq('id', meetingId)
    .single();

  const userId = meeting?.user_id as string | undefined;

  // Try persona-driven agent turn first
  let persona = null;
  if (userId) {
    try {
      persona = await getPersona(userId);
    } catch (err) {
      console.error('[agent] persona lookup failed, falling back to raw extraction:', err);
    }
  }

  if (persona) {
    // ---- Agent mode: LLM decides speak + blockers together ----
    const history = loadHistory(meetingId);

    let action: AgentAction;
    try {
      action = await runAgentTurn(persona, history, text);
    } catch (err) {
      console.error('[agent] runAgentTurn failed:', err);
      // Fall through: log the transcript, don't lose data
      appendHistory(meetingId, {
        speaker: 'Transcript',
        text,
        timestamp: new Date().toISOString(),
      });
      return;
    }

    // Log the agent's thinking for debugging
    if (action.thinking) {
      console.log(`[agent] thinking: ${action.thinking}`);
    }

    // ---- Speak (voice + chat) ----
    if (action.should_speak && action.message.trim()) {
      // Voice output
      try {
        const mp3 = await textToSpeech(action.message);
        if (mp3) {
          await outputAudio(botId, mp3);
        }
      } catch (err) {
        console.error('[agent] voice output failed:', err);
      }

      // Text chat fallback (always, even if voice succeeded — for muted
      // participants and as a record)
      try {
        await sendChatMessage(botId, action.message);
      } catch (err) {
        console.error('[agent] chat fallback failed:', err);
      }

      appendHistory(meetingId, {
        speaker: 'Agent',
        text: action.message,
        timestamp: new Date().toISOString(),
      });
    }

    // ---- Blocker → Jira ticket ----
    if (action.blocker.found && action.blocker.summary.trim()) {
      await createTicketFromBlocker(meetingId, botId, {
        blocker_found: true,
        summary: action.blocker.summary,
        description: action.blocker.description,
        reported_by: '',
        suggested_assignee: '',
        priority: action.blocker.priority,
      });
    }

    // Always log the incoming transcript to history
    appendHistory(meetingId, {
      speaker: 'Transcript',
      text,
      timestamp: new Date().toISOString(),
    });
  } else {
    // ---- Fallback: raw blocker extraction (no persona configured) ----
    const blocker = await extractBlocker(text, '');
    if (blocker.blocker_found && blocker.summary.trim()) {
      await createTicketFromBlocker(meetingId, botId, blocker);
    }
  }
}

// ---- ticket pipeline (shared between agent and fallback paths) ----

async function createTicketFromBlocker(
  meetingId: string,
  botId: string,
  blocker: ExtractedBlocker,
): Promise<void> {
  const db = getDb();
  const key = dedupeKey(blocker.summary);

  // Claim the dedupe key before calling Jira. The unique index on
  // (meeting_id, dedupe_key) prevents duplicate tickets for the same
  // spoken blocker.
  const { error: claimErr } = await db
    .from('tickets')
    .insert({
      meeting_id: meetingId,
      jira_ticket_key: '',
      summary: blocker.summary,
      description: blocker.description,
      priority: blocker.priority,
      dedupe_key: key,
    })
    .select('id')
    .single();

  if (claimErr) {
    if (claimErr.code === '23505') {
      console.log(`[agent] duplicate blocker suppressed: ${key}`);
    } else {
      console.error('[agent] ticket claim failed:', claimErr);
    }
    return;
  }

  let ticket: { key: string };
  try {
    ticket = await createJiraBlockerTicket({
      summary: blocker.summary,
      description: blocker.description,
      priority: blocker.priority,
    });
  } catch (err) {
    // Release the claim so a later mention of the same blocker can retry.
    await db.from('tickets').delete().eq('meeting_id', meetingId).eq('dedupe_key', key);
    console.error('[agent] jira create failed:', err);
    return;
  }

  await db
    .from('tickets')
    .update({ jira_ticket_key: ticket.key })
    .eq('meeting_id', meetingId)
    .eq('dedupe_key', key);

  const url = `https://${process.env.JIRA_HOST_NAME}/browse/${ticket.key}`;
  try {
    await sendChatMessage(
      botId,
      `Pinico Alert: Technical blocker detected. Created Jira ticket ${ticket.key} — ${url}`,
    );
  } catch (err) {
    console.error('[agent] blocker chat message failed:', err);
  }
}
