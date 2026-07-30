import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getOrCreateProfile } from '@/lib/profile';
import type { DispatchResponse } from '@/lib/types';

// PHASE 0 STUB — owned by Track B (§5/B5).
// Returns a correctly-shaped fake so Track A can build the dashboard against
// it immediately. Do not change the response shape; it is a frozen contract.
const Body = z.object({ meeting_url: z.string().url() });

export async function POST(request: Request) {
  const profile = await getOrCreateProfile();
  if (!profile) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid meeting_url' }, { status: 400 });
  }

  // TODO(Track B): createBot() then insert the meetings row.
  const stub: DispatchResponse = {
    bot_id: 'stub-bot-1',
    meeting_id: 'stub-meeting-1',
  };
  return NextResponse.json(stub);
}
