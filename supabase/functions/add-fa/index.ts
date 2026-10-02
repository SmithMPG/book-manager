// add-fa: an admin adds a new FA to their team, from the FA list
// (components/team.js). Creating a login needs the secret key, which
// must never reach the browser — so it happens here, on Supabase.
//
// Same onboarding as supabase/fa-list.sql, no email sent: the login is
// created already confirmed, with a temporary password that comes back
// to the admin to hand over. users.password_set = false sends the new
// FA to the set-password screen on first sign-in (components/auth.js).
// The new FA is on the calling admin's list (manager_id) and in their
// branch.
//
// Body: {name, surname, email, phone?, pcrTarget?}
// Returns: {user, tempPassword}
//
// Deploy: Supabase dashboard → Edge Functions → Deploy a new function →
// name it "add-fa" and paste this file in. (Or `supabase functions
// deploy add-fa` with the CLI.) SUPABASE_URL, SUPABASE_ANON_KEY and
// SUPABASE_SERVICE_ROLE_KEY are provided by Supabase automatically.

import { createClient } from "jsr:@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function reply(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

// 12 characters, without look-alikes (0/O, 1/l/I), so it can be read out.
function tempPassword() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  return Array.from(bytes, (b) => chars[b % chars.length]).join("");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return reply({ error: "POST only." }, 405);

  const url = Deno.env.get("SUPABASE_URL")!;
  const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  // Who's asking: must be signed in, an admin, and still active.
  const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  const { data: { user: caller } } = await admin.auth.getUser(token);
  if (!caller) return reply({ error: "Not signed in." }, 401);
  const { data: me } = await admin.from("users")
    .select("id, is_admin, is_active, branch").eq("id", caller.id).single();
  if (!me?.is_admin || !me.is_active) return reply({ error: "Only admins can add FAs." }, 403);

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return reply({ error: "Bad request." }, 400);
  }
  const text = (v: unknown) => (typeof v === "string" ? v.trim() : "");
  const name = text(body.name);
  const surname = text(body.surname);
  const email = text(body.email).toLowerCase();
  const phone = text(body.phone) || null;
  const target = body.pcrTarget === null || body.pcrTarget === "" || body.pcrTarget === undefined
    ? null
    : Math.round(Number(body.pcrTarget));
  if (!name || !surname) return reply({ error: "Name and surname are required." }, 400);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return reply({ error: "That email doesn't look right." }, 400);
  if (target !== null && (!Number.isFinite(target) || target < 0)) {
    return reply({ error: "The Validation target must be a number." }, 400);
  }

  const password = tempPassword();
  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (createError || !created.user) {
    const taken = /already|registered|exists/i.test(createError?.message || "");
    return reply({ error: taken ? "There's already a login for that email." : createError?.message }, 400);
  }

  const { data: row, error: insertError } = await admin.from("users").insert({
    id: created.user.id,
    email,
    name,
    surname,
    phone,
    pcr_target: target,
    branch: me.branch,
    manager_id: me.id,
    password_set: false,
  }).select().single();
  if (insertError) {
    // Don't leave a login behind with no users row.
    await admin.auth.admin.deleteUser(created.user.id);
    return reply({ error: insertError.message }, 400);
  }

  return reply({ user: row, tempPassword: password });
});
