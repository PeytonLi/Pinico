import { NextResponse } from 'next/server';
import { getOrCreateProfile } from '@/lib/profile';
import { getTodayEvents } from '@/lib/google';
import { getDb } from '@/lib/supabase';

export async function GET() {
  const profile = await getOrCreateProfile();
  if (!profile) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  // Check if calendar is connected
  const { data: token } = await getDb()
    .from('calendar_tokens')
    .select('id')
    .eq('user_id', profile.id)
    .maybeSingle();

  if (!token) {
    return NextResponse.json({ connected: false, events: [] });
  }

  try {
    const events = await getTodayEvents(profile.id);
    return NextResponse.json({ connected: true, events });
  } catch {
    return NextResponse.json({ connected: false, events: [], error: 'Failed to fetch calendar' });
  }
}
