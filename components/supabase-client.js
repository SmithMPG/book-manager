// Supabase client: the one place the project URL + publishable key live.
// The publishable key (Supabase's new name for the "anon" key) is safe to
// ship in the browser — it identifies the project, nothing more. What
// actually keeps one FA's data from another's is the RLS policies in
// supabase/schema.sql. The *secret* key is never used here, and never
// should be — it bypasses those policies entirely; it only ever belongs
// in supabase/seed-fas.js, run locally.
//
// The CDN script (loaded in index.html before this file) declares a
// global `supabase` object — that's the SDK namespace, not a client.
// `supabaseClient` below is the actual client every other component uses.

const SUPABASE_URL = 'https://iwroziessfgoobrdxpoc.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_Ey5P5Oy9snO-T2hTq4m1cw_jytnj-Ql';

const { createClient } = window.supabase;
const supabaseClient = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
