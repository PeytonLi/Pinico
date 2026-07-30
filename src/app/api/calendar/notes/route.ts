import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getOrCreateProfile } from '@/lib/profile';
import { getDb } from '@/lib/supabase';

const NoteBody = z.object({
  event_id: z.string().min(1),
  meeting_title: z.string().min(1),
  meeting_url: z.string().optional().nullable(),
  start_time: z.string(),
  end_time: z.string().optional().nullable(),
  notes: z.string().max(10000).optional().nullable(),
  auto_dispatch: z.boolean().optional(),
});

export async function POST(request: Request) {
  const profile = await getOrCreateProfile();
  if (!profile) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const parsed = NoteBody.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid body' }, { status: 400 });
  }

  const { event_id, meeting_title, meeting_url, start_time, end_time, notes, auto_dispatch } = parsed.data;

  const { error } = await getDb()
    .from('calendar_notes')
    .upsert(
      {
        user_id: profile.id,
        event_id,
        meeting_title,
        meeting_url: meeting_url ?? null,
        start_time,
        end_time: end_time ?? null,
        notes: notes ?? '',
        auto_dispatch: auto_dispatch ?? false,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id,event_id' },
    );

  if (error) {
    console.error('Failed to save notes:', error);
    return NextResponse.json({ error: 'Failed to save notes' }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

export async function GET(request: Request) {
  const profile = await getOrCreateProfile();
  if (!profile) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const todayStart = searchParams.get('date')
    ? new Date(searchParams.get('date')!)
    : new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayEnd = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000);

  const { data, error } = await getDb()
    .from('calendar_notes')
    .select('*')
    .eq('user_id', profile.id)
    .gte('start_time', todayStart.toISOString())
    .lt('start_time', todayEnd.toISOString())
    .order('start_time', { ascending: true });

  if (error) {
    return NextResponse.json({ error: 'Failed to fetch notes' }, { status: 500 });
  }

  return NextResponse.json(data);
}
