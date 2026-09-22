// One-time script: creates a Supabase Auth user + matching `users` row for
// every person on your team. Run once after schema.sql, before Monday.
//
// Usage:
//   1. npm install @supabase/supabase-js
//   2. Fill in SUPABASE_URL and SERVICE_ROLE_KEY below (Project Settings ->
//      API — the *service role* key, never the anon one, and never commit
//      it or put it in the app itself; this script is run once, locally).
//   3. Fill in TEAM with your 15 people.
//   4. node supabase/seed-fas.js
//
// Each person gets a temp password printed to the console at the end —
// send those out however you'd send temp passwords, and everyone should
// change theirs after first login (Supabase Auth supports this out of the
// box; the app doesn't need to build anything extra for it).

const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://YOUR-PROJECT.supabase.co';
const SERVICE_ROLE_KEY = 'YOUR-SERVICE-ROLE-KEY';

const TEAM = [
  // { name: 'Robyn', surname: 'Hock', email: 'robyn@yourfirm.co.za', isAdmin: false, pcrTarget: 600000 },
  // ...all 15 here, one admin (you) with isAdmin: true.
];

function tempPassword() {
  return Math.random().toString(36).slice(2, 8) + Math.floor(Math.random() * 90 + 10);
}

async function main() {
  if (!TEAM.length) {
    console.error('TEAM is empty — fill in your 15 people first.');
    process.exit(1);
  }
  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
  const results = [];

  for (const person of TEAM) {
    const password = tempPassword();
    const { data, error } = await supabase.auth.admin.createUser({
      email: person.email,
      password,
      email_confirm: true, // skip email verification for the pilot
    });
    if (error) {
      console.error(`FAILED: ${person.email} — ${error.message}`);
      continue;
    }
    const { error: faError } = await supabase.from('users').insert({
      id: data.user.id,
      name: person.name,
      surname: person.surname,
      email: person.email,
      pcr_target: person.pcrTarget || null,
      is_admin: !!person.isAdmin,
    });
    if (faError) {
      console.error(`Auth user created but users row FAILED for ${person.email} — ${faError.message}`);
      continue;
    }
    results.push({ email: person.email, password });
  }

  console.log('\nDone. Temp passwords — send these out, then delete this output:\n');
  results.forEach(r => console.log(`${r.email}  ${r.password}`));
}

main();
