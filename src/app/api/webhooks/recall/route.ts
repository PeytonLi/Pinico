import { NextResponse } from 'next/server';
import { after } from 'next/server';
import { getDb } from '@/lib/supabase';
import { ingestChunk, dedupeKey } from '@/lib/extract';
import { createJiraBlockerTicket } from '@/lib/jira';
import { sendChatMessage, getBotDuration } from '@/lib/recall';
import { reportMeetingUsage } from '@/lib/stripe';

// Track B join point (§B6). Recall.ai posts here for every transcript fragment
// and every bot lifecycle transition.
//
// Two rules drive the shape of this file:
//  1. Answer 200 immediately. Recall retries non-2xx, and a retry storm
//     mid-demo is worse than a dropped fragment. All slow work (OpenAI, Jira,
//     chat) runs in `after()`, which Next runs once the response is sent.
//  2. Nothing in here may throw past the handler. One failed extraction must
//     never kill the bot session.

/**
 * Recall's realtime payload shape is the least-verified thing in this file —
 * no credentials existed to observe a real one (see docs/api-notes-recall.md).
 * So: log the raw body once per event, and pull fields defensively from the
 * documented candidates rather than trusting one nesting. The first real
 * webhook will show the true shape in the logs immediately.
 */
function readBotId(payload: Record<string, unknown>): string | null {
  const data = (payload.data ?? {}) as Record<string, unknown>;
  const bot = (data.bot ?? {}) as Record<string, unknown>;
  return (
    (typeof bot.id === 'string' ? bot.id : null) ??
    (typeof data.bot_id === 'string' ? data.bot_id : null) ??
    (typeof payload.bot_id === 'string' ? payload.bot_id : null)
  );
}

function readTranscriptText(payload: Record<string, unknown>): string {
  const data = (payload.data ?? {}) as Record<string, unknown>;
  // Documented realtime shape nests the actual payload one level deeper.
  const inner = (data.data ?? data) as Record<string, unknown>;
  const words = inner.words;
  if (Array.isArray(words)) {
    return words
      .map((w) => (w && typeof w === 'object' ? (w as { text?: unknown }).text : undefined))
      .filter((t): t is string => typeof t === 'string')
      .join(' ');
  }
  if (typeof inner.text === 'string') return inner.text;
  return '';
}

async function handleTranscript(payload: Record<string, unknown>) {
  const botId = readBotId(payload);
  const text = readTranscriptText(payload).trim();
  if (!botId || !text) return;

  const db = getDb();
  const { data: meeting } = await db
    .from('meetings')
    .select('id')
    .eq('recall_bot_id', botId)
    .single();
  if (!meeting) return;

  const blocker = await ingestChunk(meeting.id as string, ` ${text}`);
  if (!blocker?.blocker_found) return;

  const key = dedupeKey(blocker.summary);

  // Claim the dedupe key BEFORE calling Jira. The unique index on
  // (meeting_id, dedupe_key) is what makes this the guard: if two flushes race
  // on the same spoken blocker, the loser gets 23505 and stops here instead of
  // filing a second ticket.
  const { error: claimErr } = await db
    .from('tickets')
    .insert({
      meeting_id: meeting.id,
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
      console.log(`[recall] duplicate blocker suppressed: ${key}`);
    } else {
      console.error('[recall] ticket claim failed:', claimErr);
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
    await db.from('tickets').delete().eq('meeting_id', meeting.id).eq('dedupe_key', key);
    console.error('[recall] jira create failed:', err);
    return;
  }

  await db
    .from('tickets')
    .update({ jira_ticket_key: ticket.key })
    .eq('meeting_id', meeting.id)
    .eq('dedupe_key', key);

  const url = `https://${process.env.JIRA_HOST_NAME}/browse/${ticket.key}`;
  try {
    await sendChatMessage(
      botId,
      `Pinico Alert: Technical blocker detected. Created Jira ticket ${ticket.key} — ${url}`
    );
  } catch (err) {
    // The ticket exists and the dashboard will show it; the chat message is
    // the demo flourish, not the deliverable.
    console.error('[recall] chat message failed:', err);
  }
}

async function handleBotDone(payload: Record<string, unknown>) {
  const botId = readBotId(payload);
  if (!botId) return;

  const db = getDb();
  const { data: meeting } = await db
    .from('meetings')
    .select('id, stripe_customer_id')
    .eq('recall_bot_id', botId)
    .single();
  if (!meeting) return;

  let minutes = 0;
  try {
    minutes = await getBotDuration(botId);
  } catch (err) {
    console.error('[recall] duration lookup failed, metering 0:', err);
  }

  await db
    .from('meetings')
    .update({ status: 'completed', duration_minutes: minutes, transcript_buffer: '' })
    .eq('id', meeting.id);

  await reportMeetingUsage((meeting.stripe_customer_id as string) ?? '', minutes);
}

export async function POST(request: Request) {
  // Fail closed when the secret is unset, or an empty ?secret= would pass.
  // This endpoint files Jira tickets from its input — keep it shut.
  const expected = process.env.RECALL_WEBHOOK_SECRET;
  const url = new URL(request.url);
  if (!expected || url.searchParams.get('secret') !== expected) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  const raw = await request.text();
  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    console.error('[recall] unparseable body:', raw.slice(0, 500));
    return NextResponse.json({ ok: true }); // still 200: retrying won't help
  }

  const event = typeof payload.event === 'string' ? payload.event : '';
  console.log(`[recall] ${event || '<no event>'} ${raw.slice(0, 1000)}`);

  after(async () => {
    try {
      // `transcript.partial_data` is deliberately ignored — partials repeat the
      // same words as they firm up, so acting on them would multiply both
      // OpenAI calls and duplicate tickets.
      if (event === 'transcript.data') {
        await handleTranscript(payload);
      } else if (event.includes('done') || event.includes('call_ended')) {
        // Recall uses per-transition names (bot.done, bot.call_ended), not one
        // generic status event — match loosely so a rename doesn't drop billing.
        await handleBotDone(payload);
      }
    } catch (err) {
      console.error(`[recall] handler for ${event} failed:`, err);
    }
  });

  return NextResponse.json({ ok: true });
}
