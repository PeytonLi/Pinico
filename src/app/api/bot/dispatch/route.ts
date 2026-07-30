import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getOrCreateProfile } from '@/lib/profile';
import { getDb } from '@/lib/supabase';
import { createBot } from '@/lib/recall';
import type { DispatchResponse } from '@/lib/types';

// Owned by Track B (§5/B5). Auth -> validate -> createBot -> insert meetings
// row -> return the frozen DispatchResponse shape.
const Body = z.object({ meeting_url: z.string().url() });

export async function POST(request: Request) {
  const profile = await getOrCreateProfile();
  if (!profile) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid meeting_url' }, { status: 400 });
  }
  const { meeting_url } = parsed.data;

  let bot: { bot_id: string };
  try {
    bot = await createBot(meeting_url);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: `failed to dispatch bot: ${message}` }, { status: 502 });
  }

  const { data, error } = await getDb()
    .from('meetings')
    .insert({
      recall_bot_id: bot.bot_id,
      meeting_url,
      status: 'in_call',
      stripe_customer_id: process.env.STRIPE_DEMO_CUSTOMER_ID ?? null,
    })
    .select('id')
    .single();

  if (error) {
    // Bot is already live in the call at this point but we have no row to
    // track it — surface as a 502 rather than silently losing the session.
    return NextResponse.json(
      { error: `bot dispatched but failed to save meeting: ${error.message}` },
      { status: 502 }
    );
  }

  const result: DispatchResponse = { bot_id: bot.bot_id, meeting_id: data.id as string };
  return NextResponse.json(result);
}
