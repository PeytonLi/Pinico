import { NextResponse } from 'next/server';
import { getOrCreateProfile } from '@/lib/profile';
import { getAuthUrl } from '@/lib/google';

export async function GET() {
  const profile = await getOrCreateProfile();
  if (!profile) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  try {
    const url = getAuthUrl();
    return NextResponse.redirect(url);
  } catch (err) {
    return NextResponse.json(
      { error: 'Google Calendar not configured — set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET' },
      { status: 500 },
    );
  }
}
