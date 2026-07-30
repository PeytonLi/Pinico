// Full-loop demo driver: seeds a persona, dispatches a bot, and wires the
// meetings row so the recall webhook can find it.
//
//   node --env-file=.env.local scripts/demo-run.mjs "<meet-url>"
//
// Requires `pnpm dev` running behind the tunnel in NEXT_PUBLIC_APP_URL.
// Seeds directly into the DB so you don't have to log in through the browser
// first; the /context page is the real user-facing path for this.

const meetingUrl = process.argv[2];
if (!meetingUrl) {
  console.error('usage: node --env-file=.env.local scripts/demo-run.mjs "<meet-url>"');
  process.exit(1);
}

const lib = new URL('../src/lib/', import.meta.url).href;
const { getDb } = await import(lib + 'supabase.ts');
const { createBot } = await import(lib + 'recall.ts');

const db = getDb();

// 1. Profile (normally created on Auth0 login).
const { data: profile, error: pErr } = await db
  .from('profiles')
  .upsert(
    {
      auth0_user_id: 'demo|peyton',
      email: process.env.JIRA_USER_EMAIL ?? 'demo@pinico.test',
      full_name: 'Peyton',
    },
    { onConflict: 'auth0_user_id' }
  )
  .select()
  .single();
if (pErr) throw new Error('profile upsert failed: ' + pErr.message);
console.log('1. profile:', profile.id, profile.full_name);

// 2. Persona — this is what makes the agent speak instead of silently extracting.
const { error: cErr } = await db.from('agent_context').upsert(
  {
    user_id: profile.id,
    current_work:
      'Shipping Pinico V2, the voice agent that joins standups. Finished the DeepSeek blocker extraction, automatic Jira ticket creation, and ElevenLabs voice output through Recall.',
    // Keep this TRUE. Whatever it says here gets spoken as fact and filed as a
    // Jira ticket, so a stale blocker means the demo lies and files junk tickets.
    // The old value ("unknown Output Audio duration limits") was measured and
    // resolved: the cap is a 1,835,008-char b64 payload, ~88s of speech.
    active_blockers:
      'Only real risk left is the ngrok tunnel: if it restarts the public URL changes, and bot dispatch then fails with a 403 until the environment is updated. Looking at a stable host for the demo.',
    recent_wins:
      'Got the bot speaking aloud in a live Google Meet, spoken blockers now file real Jira tickets, and I measured the Recall audio payload cap at about 88 seconds so replies can be sized safely.',
    communication_style: 'Direct and concise, friendly, no corporate filler.',
    delegation_instructions:
      'If asked about the frontend, Auth0, or the dashboard, say Peyton has not touched those today and will follow up.',
    topics_to_track: 'Recall.ai, ElevenLabs, Jira integration, Stripe billing, DeepSeek',
    questions_for_team: 'Does anyone have a stable host I can point the webhook at instead of a tunnel?',
    meeting_goal: 'Report V2 progress and flag the tunnel stability risk.',
    updated_at: new Date().toISOString(),
  },
  { onConflict: 'user_id' }
);
if (cErr) throw new Error('agent_context upsert failed: ' + cErr.message);
console.log('2. persona seeded');

// 3. Bot in, and a meetings row keyed to its id so the webhook resolves it.
const { bot_id } = await createBot(meetingUrl);
console.log('3. bot:', bot_id, '— ADMIT IT');

const { data: meeting, error: mErr } = await db
  .from('meetings')
  .insert({
    recall_bot_id: bot_id,
    meeting_url: meetingUrl,
    status: 'in_call',
    user_id: profile.id,
    stripe_customer_id: process.env.STRIPE_DEMO_CUSTOMER_ID ?? null,
  })
  .select('id')
  .single();
if (mErr) throw new Error('meetings insert failed: ' + mErr.message);
console.log('4. meeting row:', meeting.id);

console.log('');
console.log('Webhook target:', `${process.env.NEXT_PUBLIC_APP_URL}/api/webhooks/recall`);
console.log('Admit the bot, then say something like:');
console.log('   "Peyton, what are you working on?"');
console.log('   "Any blockers?"');
console.log('Pause ~5s after speaking — the buffer flushes on silence.');
console.log('');
console.log('Stop the bot when done:');
console.log(
  `  curl -X POST "${process.env.RECALL_API_BASE}/bot/${bot_id}/leave_call/" -H "Authorization: Token $RECALL_API_KEY"`
);
