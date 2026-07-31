import { NextResponse } from 'next/server';
import { getDb } from '@/lib/supabase';
import { createBot, sendChatMessage } from '@/lib/recall';
import { getPersona } from '@/lib/persona';

/**
 * Auto-dispatch endpoint — called by the dashboard polling.
 * Checks for calendar events that should fire right now and dispatches bots.
 *
 * ponytail: client-side polling every 30s. Upgrade to cron/edge-function
 * if we need guaranteed dispatch regardless of dashboard being open.
 */
export async function GET() {
  const now = new Date();
  const windowStart = new Date(now.getTime() - 2 * 60 * 1000); // 2 min before
  const windowEnd = new Date(now.getTime() + 5 * 60 * 1000);   // up to 5 min after

  // Find events: auto_dispatch ON, not yet dispatched, meeting URL present,
  // start time within ±2 min window.
  const { data: events, error } = await getDb()
    .from('calendar_notes')
    .select('id, user_id, meeting_title, meeting_url, notes, start_time')
    .eq('auto_dispatch', true)
    .eq('dispatched', false)
    .not('meeting_url', 'is', null)
    .gte('start_time', windowStart.toISOString())
    .lte('start_time', windowEnd.toISOString());

  if (error || !events?.length) {
    return NextResponse.json({ dispatched: 0 });
  }

  const results: { event_id: string; bot_id?: string; error?: string }[] = [];

  for (const event of events) {
    try {
      // 1. Dispatch the bot
      const bot = await createBot(event.meeting_url!);

      // 2. Insert meetings row
      const { data: meeting } = await getDb()
        .from('meetings')
        .insert({
          recall_bot_id: bot.bot_id,
          meeting_url: event.meeting_url!,
          status: 'in_call',
          user_id: event.user_id,
          stripe_customer_id: process.env.STRIPE_DEMO_CUSTOMER_ID ?? null,
        })
        .select('id')
        .single();

      // 3. Build intro message — notes first, then fall back to persona context
      let intro: string | null = null;
      if (event.notes?.trim()) {
        intro = `[Auto-dispatched agent for ${event.meeting_title}]\n\n${event.notes}`;
      } else {
        const persona = await getPersona(event.user_id);
        if (persona) {
          intro = [
            `[Auto-dispatched agent for ${event.meeting_title}]`,
            `I'm standing in for ${persona.user_name}.`,
            persona.current_work ? `Working on: ${persona.current_work}` : '',
            persona.active_blockers ? `Blocked on: ${persona.active_blockers}` : '',
            persona.meeting_goal ? `Goal: ${persona.meeting_goal}` : '',
          ].filter(Boolean).join('\n');
        }
      }
      if (intro) {
        try {
          await sendChatMessage(bot.bot_id, intro);
        } catch {
          // Chat message is best-effort — don't fail the dispatch
        }
      }

      // 4. Mark as dispatched
      await getDb()
        .from('calendar_notes')
        .update({ dispatched: true, updated_at: now.toISOString() })
        .eq('id', event.id);

      results.push({
        event_id: event.id,
        bot_id: meeting?.id as string | undefined,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      results.push({ event_id: event.id, error: message });
    }
  }

  return NextResponse.json({ dispatched: results.length, results });
}
