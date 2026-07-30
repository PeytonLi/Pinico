import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getOrCreateProfile } from '@/lib/profile';
import { getDb } from '@/lib/supabase';

const ContextBody = z.object({
  current_work: z.string().min(1).max(5000),
  active_blockers: z.string().max(5000).optional(),
  recent_wins: z.string().max(5000).optional(),
  communication_style: z.string().max(500).optional(),
  delegation_instructions: z.string().max(5000).optional(),
  topics_to_track: z.string().max(1000).optional(),
  questions_for_team: z.string().max(5000).optional(),
  meeting_goal: z.string().max(1000).optional(),
});

export async function POST(request: Request) {
  const profile = await getOrCreateProfile();
  if (!profile) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const parsed = ContextBody.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid body', details: parsed.error.issues }, { status: 400 });
  }

  const { error } = await getDb()
    .from('agent_context')
    .upsert(
      {
        user_id: profile.id,
        ...parsed.data,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id' },
    );

  if (error) {
    console.error('[context] upsert failed', error);
    return NextResponse.json({ error: 'failed to save context' }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

export async function GET() {
  const profile = await getOrCreateProfile();
  if (!profile) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const { data, error } = await getDb()
    .from('agent_context')
    .select('*')
    .eq('user_id', profile.id)
    .maybeSingle();

  if (error) {
    console.error('[context] get failed', error);
    return NextResponse.json({ error: 'failed to load context' }, { status: 500 });
  }

  return NextResponse.json(data ?? null);
}
