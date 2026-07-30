import { NextResponse } from 'next/server';
import { getOrCreateProfile } from '@/lib/profile';
import { getDb } from '@/lib/supabase';
import type { MeetingState, MeetingStatus } from '@/lib/types';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const profile = await getOrCreateProfile();
  if (!profile) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const { data: meeting, error: meetingErr } = await getDb()
    .from('meetings')
    .select('*')
    .eq('id', id)
    .single();

  if (meetingErr || !meeting) {
    return NextResponse.json({ error: 'not found' }, { status: 404 });
  }

  const { data: tickets, error: ticketsErr } = await getDb()
    .from('tickets')
    .select('jira_ticket_key, summary, priority, created_at')
    .eq('meeting_id', id)
    .order('created_at', { ascending: false });

  if (ticketsErr) {
    console.error('[meetings] tickets query failed:', ticketsErr);
  }

  const result: MeetingState = {
    status: meeting.status as MeetingStatus,
    duration_minutes: meeting.duration_minutes ?? 0,
    tickets: tickets ?? [],
  };

  return NextResponse.json(result);
}
