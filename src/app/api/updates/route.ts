import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getOrCreateProfile } from '@/lib/profile';
import { getDb } from '@/lib/supabase';

const Body = z.object({
  status_text: z.string().min(1).max(5000),
  blockers_text: z.string().max(5000).optional(),
});

export async function POST(request: Request) {
  const profile = await getOrCreateProfile();
  if (!profile) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid body' }, { status: 400 });
  }

  const { error } = await getDb()
    .from('async_updates')
    .insert({
      user_id: profile.id,
      status_text: parsed.data.status_text,
      blockers_text: parsed.data.blockers_text ?? null,
      date: new Date().toISOString().split('T')[0],
    });
  if (error) {
    console.error('[updates] insert failed:', error);
    return NextResponse.json({ error: 'db error' }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

export async function GET() {
  const profile = await getOrCreateProfile();
  if (!profile) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const { data, error } = await getDb()
    .from('async_updates')
    .select('id, status_text, blockers_text, created_at, profiles!inner(full_name, email)')
    .eq('date', new Date().toISOString().split('T')[0])
    .order('created_at', { ascending: false });

  if (error) {
    console.error('[updates] select failed:', error);
    return NextResponse.json({ error: 'db error' }, { status: 500 });
  }

  return NextResponse.json(data ?? []);
}
