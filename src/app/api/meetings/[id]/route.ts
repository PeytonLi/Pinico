import { NextResponse } from 'next/server';
import { getOrCreateProfile } from '@/lib/profile';
import type { MeetingState } from '@/lib/types';

// PHASE 0 STUB — owned by Track A (§4/A3).
// The dashboard polls this every 2s while a bot is in a call.
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params; // Next 16: params is async
  const profile = await getOrCreateProfile();
  if (!profile) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  // TODO(Track A): select the meeting + its tickets by id
  void id;
  const stub: MeetingState = { status: 'in_call', duration_minutes: 0, tickets: [] };
  return NextResponse.json(stub);
}
