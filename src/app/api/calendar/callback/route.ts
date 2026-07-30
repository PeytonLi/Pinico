import { NextResponse } from 'next/server';
import { getOrCreateProfile } from '@/lib/profile';
import { exchangeCode, storeTokens } from '@/lib/google';

export async function GET(request: Request) {
  const profile = await getOrCreateProfile();
  if (!profile) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const code = searchParams.get('code');
  const error = searchParams.get('error');

  if (error || !code) {
    return NextResponse.redirect(new URL('/dashboard?calendar=error', request.url));
  }

  try {
    const tokens = await exchangeCode(code);
    await storeTokens(profile.id, tokens);
    return NextResponse.redirect(new URL('/dashboard?calendar=connected', request.url));
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('Calendar callback error:', msg);
    const q = encodeURIComponent(msg.slice(0, 100));
    return NextResponse.redirect(new URL(`/dashboard?calendar=error&reason=${q}`, request.url));
  }
}
