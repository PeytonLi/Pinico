import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getOrCreateProfile } from '@/lib/profile';

// PHASE 0 STUB — owned by Track A (§4/A2).
// Auth guard and validation are real; the insert is the TODO.
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

  // TODO(Track A): insert into async_updates keyed to profile.id
  return NextResponse.json({ ok: true });
}
