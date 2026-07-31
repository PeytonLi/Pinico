// Removes Pinico bots from calls. The dashboard has no stop control, so without
// this a bot sits in the meeting billing Recall minutes after a demo run.
//
//   node --env-file=.env.local scripts/leave-call.mjs           # all live bots
//   node --env-file=.env.local scripts/leave-call.mjs <bot-id>  # just one
//
// Asks Recall which bots are live rather than trusting meetings.status, which
// only updates when the bot.done webhook is actually delivered.

const base = process.env.RECALL_API_BASE?.replace(/\/+$/, '');
const key = process.env.RECALL_API_KEY;
if (!base || !key) {
  console.error('RECALL_API_BASE and RECALL_API_KEY must be set');
  process.exit(1);
}
const auth = { Authorization: `Token ${key}`, Accept: 'application/json' };

const lastCode = (bot) => {
  const sc = bot.status_changes ?? [];
  return sc.length ? sc[sc.length - 1].code : '';
};

async function leave(id) {
  const res = await fetch(`${base}/bot/${id}/leave_call/`, { method: 'POST', headers: auth });
  // 400 usually means it already left — not worth treating as an error.
  console.log(`  ${id.slice(0, 8)} -> ${res.status}${res.status === 400 ? ' (already gone)' : ''}`);
}

const only = process.argv[2];
if (only) {
  await leave(only);
} else {
  const data = await fetch(`${base}/bot?limit=50`, { headers: auth }).then((r) => r.json());
  const live = (data.results ?? data ?? []).filter((b) => !/done|fatal/.test(lastCode(b)));
  if (!live.length) {
    console.log('no live bots');
  } else {
    console.log(`${live.length} live bot(s):`);
    for (const b of live) {
      console.log(`  ${b.id.slice(0, 8)} is ${lastCode(b)}`);
      await leave(b.id);
    }
  }
}
