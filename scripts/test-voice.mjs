// Isolated live test for the one thing that can't be verified headlessly:
// the bot actually speaking aloud in a meeting (HANDOFF-V2 §B2, outputAudio).
//
// Deliberately does NOT need a tunnel, the database, or the dashboard.
// outputAudio is an outbound call to Recall, so localhost is fine — transcript
// webhooks just won't be delivered, which this test doesn't care about.
//
//   node --env-file=.env.local scripts/test-voice.mjs "<meeting-url>" ["what to say"]
//
// Then ADMIT THE BOT from the waiting room, and listen.

const meetingUrl = process.argv[2];
const phrase =
  process.argv[3] ??
  "Hi, this is Peyton's Pinico agent. I'm blocked on the Auth0 staging webhook, which is returning a 500 on every login test.";

if (!meetingUrl) {
  console.error('usage: node --env-file=.env.local scripts/test-voice.mjs "<meeting-url>" ["phrase"]');
  process.exit(1);
}

const lib = new URL('../src/lib/', import.meta.url).href;
const { createBot, outputAudio, sendChatMessage } = await import(lib + 'recall.ts');
const { textToSpeech } = await import(lib + 'elevenlabs.ts');

const base = process.env.RECALL_API_BASE.replace(/\/+$/, '');
const key = process.env.RECALL_API_KEY;
const auth = { Authorization: `Token ${key}`, Accept: 'application/json' };

// 1. TTS first — cheaper to fail here than after a bot has joined a call.
console.log('1. ElevenLabs TTS...');
const mp3 = await textToSpeech(phrase);
if (!mp3) {
  console.error('   TTS returned empty. Fix ELEVENLABS_API_KEY before continuing.');
  process.exit(1);
}
console.log(`   ok, ${Math.round((mp3.length * 3) / 4 / 1024)}KB of mp3`);

// 2. Send the bot in.
console.log('2. dispatching bot...');
const { bot_id } = await createBot(meetingUrl);
console.log(`   bot ${bot_id} — ADMIT IT from the waiting room now`);

// 3. Wait until it is actually in the call. Speaking before that is a silent no-op.
console.log('3. waiting for bot to join (admit it!)...');
let joined = false;
for (let i = 0; i < 60; i++) {
  const bot = await fetch(`${base}/bot/${bot_id}/`, { headers: auth }).then((r) => r.json());
  const codes = (bot.status_changes ?? []).map((c) => c.code);
  const last = codes[codes.length - 1] ?? '(none)';
  if (codes.some((c) => c.includes('in_call'))) {
    console.log(`   in call after ~${i * 5}s (states: ${codes.join(' -> ')})`);
    joined = true;
    break;
  }
  if (codes.some((c) => c.includes('fatal') || c.includes('done'))) {
    console.error(`   bot left/failed: ${codes.join(' -> ')}`);
    console.error(`   ${JSON.stringify(bot.status_changes?.slice(-2) ?? bot).slice(0, 500)}`);
    process.exit(1);
  }
  process.stdout.write(`   ...${last}\r`);
  await new Promise((r) => setTimeout(r, 5000));
}
if (!joined) {
  console.error('   never joined within 5min — was the bot admitted?');
  process.exit(1);
}

// 4. The actual thing under test.
console.log('4. speaking via outputAudio... LISTEN NOW');
try {
  const t0 = Date.now();
  await outputAudio(bot_id, mp3);
  console.log(`   POST accepted in ${Date.now() - t0}ms`);
} catch (err) {
  console.error('   outputAudio FAILED:', err.message?.slice(0, 800));
  process.exit(1);
}

// 5. Chat fallback, so you can compare what it *should* have said.
await sendChatMessage(bot_id, `[voice test] ${phrase}`).catch(() => {});

console.log('');
console.log('Did you HEAR it?');
console.log('  yes -> outputAudio works, voice path is done');
console.log('  no  -> audio failed silently; check the chat message arrived (proves auth/bot are fine)');
console.log('');
console.log(`Remove the bot when finished:`);
console.log(
  `  curl -X POST "${base}/bot/${bot_id}/leave_call/" -H "Authorization: Token $RECALL_API_KEY"`
);
