// Applies the shared PERSONA to every profile (or one, by email), so a
// dashboard-dispatched bot has a usable brain without retyping the /context form.
//
//   node --env-file=.env.local scripts/seed-persona.mjs
//   node --env-file=.env.local scripts/seed-persona.mjs you@example.com

const { getDb } = await import('file:///C:/Users/lipey/Code/Pinico/src/lib/supabase.ts');
const { PERSONA, seedPersona } = await import('./persona.mjs');

const only = process.argv[2];
const db = getDb();

const { data: profiles, error } = await db.from('profiles').select('id, email, full_name');
if (error) throw new Error(error.message);

const targets = only ? profiles.filter((p) => p.email === only) : profiles;
if (!targets.length) {
  console.error(only ? `no profile with email ${only}` : 'no profiles found');
  process.exit(1);
}

for (const p of targets) {
  await seedPersona(db, p.id);
  console.log(`seeded ${p.full_name ?? p.email} (${p.id.slice(0, 8)})`);
}

// The two fields that silently ruin a demo when blank.
console.log('\ntopics_to_track:', PERSONA.topics_to_track);
console.log('active_blockers:', PERSONA.active_blockers.slice(0, 80) + '...');
