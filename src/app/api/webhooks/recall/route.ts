import { NextResponse } from 'next/server';

// PHASE 0 STUB — owned by Track B (§5/B6).
// Always 200, even on bad input: Recall retries non-2xx and a retry storm
// mid-demo is worse than a dropped chunk.
export async function POST(request: Request) {
  // This endpoint files Jira tickets from its input. Keep it shut.
  // Fail closed when the secret is unset, or an empty ?secret= would pass.
  const expected = process.env.RECALL_WEBHOOK_SECRET;
  const url = new URL(request.url);
  if (!expected || url.searchParams.get('secret') !== expected) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  const body = await request.text();
  console.log('[recall webhook]', body.slice(0, 2000));

  // TODO(Track B): buffer -> extract -> jira -> chat, plus bot-done metering.
  return NextResponse.json({ ok: true });
}
