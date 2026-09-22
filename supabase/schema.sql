-- Cadence — schema v3. Four tables, on purpose:
--
-- users       one row per person (FA or admin). Identity, role, PCR target.
-- clients     one row per client card. Belongs to the user who owns them
--             (fa_id) — this is what changes on a handover.
-- activities  meetings, FNAs, quotes, wills leads, statuses, prospect
--             contacts, AND daily checkout confirmations — all in one
--             table via `type` + a `details` jsonb column for whatever's
--             specific to that type. Real rows, not JSON embedded on
--             clients — every dashboard/leaderboard number is "sum
--             activities where fa_id = X", one indexed table, no client
--             row ever needs touching to compute it.
--             client_id is nullable: every type needs one EXCEPT
--             prospect_contact (most prospects contacted never become
--             client records — call 50, 3 book a meeting, nothing to
--             attach the other 47 to) and checkout (a day being reviewed
--             isn't about any one client).
--             case_id is nullable too: a status entry can belong to a
--             specific case (case_id set — this is how "Case Accepted"
--             closes a case out) or to the client generally (case_id
--             null — the day-to-day relationship note).
--             fa_id here is who actually did the work, and it never
--             changes — if a client is handed to a new FA, their history
--             stays attributed to whoever really did it. Compare cases,
--             below.
-- cases       its own table, not folded into activities, because it's
--             the one place real money math runs (lump sum, monthly,
--             advice fee) and needs typed columns, not a details blob.
--             fa_id here means CURRENT servicing FA — unlike activities,
--             this DOES change on a handover (see the trigger below),
--             since the case and its commission genuinely transfer to
--             whoever now services the client. Its own status history
--             lives on the row too (case_statuses), separate from
--             activities, since "Case Accepted" is a case-scoped event.
--
-- No separate checkouts table, and no compliance/admin dashboard yet —
-- deferred until the admin dashboard actually gets built. A checkout
-- being confirmed is just an activities row (type = 'checkout'); a day's
-- "flag-worthy" state is purely "zero activities rows (any type) for
-- that FA on that date" — doesn't reference checkout confirmation at all,
-- by design (team's small enough that even an honestly-confirmed quiet
-- day is worth the team lead following up on).
--
-- The scenario that settled the activities-vs-embedded-JSON question: an
-- FA leaves, their clients get reassigned. The new FA should inherit the
-- cases (the money), not the activity history (someone else's meetings).
-- That's only possible if activities and cases are separate rows whose
-- fa_id can move independently — clients.fa_id and cases.fa_id update on
-- handover, activities.fa_id never does.

-- ---------------------------------------------------------------------
-- users: one row per person, keyed to their Supabase Auth user.
-- ---------------------------------------------------------------------
create table users (
  id          uuid primary key references auth.users(id) on delete cascade,
  name        text not null,
  surname     text not null,
  email       text not null,
  phone       text,
  pcr_target  int,
  is_admin    boolean not null default false, -- sees everyone's data, not just their own
  is_active   boolean not null default true,  -- false = "left", data retained
  created_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- clients
-- ---------------------------------------------------------------------
create table clients (
  id          uuid primary key default gen_random_uuid(),
  fa_id       uuid not null references users(id) on delete cascade,
  first_name  text not null,
  last_name   text not null,
  email       text,
  phone       text,
  tab         text not null default 'prospects'
                check (tab in ('prospects', 'business', 'clients', 'not-moved')),
  referrals   int not null default 0,
  created_at  timestamptz not null default now()
);
create index clients_fa_id_idx on clients(fa_id);

-- ---------------------------------------------------------------------
-- cases: the app's 22-product case-type list (see CASE_TYPES in
-- components/client-cases.js). Its own status history (case_statuses)
-- carries the day-to-day case-specific updates; "Case Accepted" is one
-- of those status values, and applying it is what flips `status` and
-- sets `accepted_at` on this same row.
-- ---------------------------------------------------------------------
create table cases (
  id                  uuid primary key default gen_random_uuid(),
  client_id           uuid not null references clients(id) on delete cascade,
  fa_id               uuid not null references users(id) on delete cascade, -- current servicing FA; moves on handover
  case_type           text not null,
  status              text not null default 'in-progress'
                        check (status in ('in-progress', 'accepted')),
  initiated_date      date not null,
  accepted_at         date,
  lump_sum            numeric,
  monthly             numeric,
  advice_fee_percent  numeric,
  case_statuses       jsonb not null default '[]'::jsonb, -- [{date, text}], newest first
  created_at          timestamptz not null default now()
);
create index cases_fa_id_idx on cases(fa_id);
create index cases_client_id_idx on cases(client_id);
create index cases_status_idx on cases(status);

-- ---------------------------------------------------------------------
-- activities: meetings / fnas / quotes / wills_leads / statuses /
-- prospect_contacts / checkout confirmations, one table, `type` +
-- `details` for whatever's type-specific:
--   meeting          {meetingType: factFinder|relational|closing, joint: bool}
--   fna              {}
--   quote            {risk: bool, investment: bool}
--   wills_lead       {}
--   status           {text: string} — client_id required; case_id set
--                    only when this status belongs to one specific case
--   prospect_contact {channel: phoned|emailed|messaged|linkedin|other} —
--                    client_id left null (see header note)
--   checkout         {} — client_id left null; this date has been
--                    reviewed and confirmed by this FA. At most one per
--                    (fa_id, date) — see the unique index below.
-- ---------------------------------------------------------------------
create table activities (
  id          uuid primary key default gen_random_uuid(),
  fa_id       uuid not null references users(id) on delete cascade, -- who actually did it; never changes on handover
  client_id   uuid references clients(id) on delete cascade,        -- null only for prospect_contact / checkout
  case_id     uuid references cases(id) on delete cascade,          -- set only for a case-scoped status
  type        text not null
                check (type in ('meeting', 'fna', 'quote', 'wills_lead', 'status', 'prospect_contact', 'checkout')),
  date        date not null,
  details     jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now(),
  constraint activities_client_required
    check (type in ('prospect_contact', 'checkout') or client_id is not null)
);
create index activities_fa_id_idx on activities(fa_id);
create index activities_client_id_idx on activities(client_id);
create index activities_type_date_idx on activities(fa_id, type, date);
create unique index activities_one_checkout_per_day
  on activities(fa_id, date) where type = 'checkout';

-- ---------------------------------------------------------------------
-- Handover: reassigning a client to a new FA also reassigns their cases
-- (the money moves with the client) but never touches activities (the
-- history stays attributed to whoever actually did the work).
-- ---------------------------------------------------------------------
create or replace function _cascade_client_fa_to_cases() returns trigger as $$
begin
  if new.fa_id is distinct from old.fa_id then
    update cases set fa_id = new.fa_id where client_id = new.id;
  end if;
  return new;
end;
$$ language plpgsql security definer;

create trigger client_fa_change_cascades_to_cases
  after update of fa_id on clients
  for each row execute function _cascade_client_fa_to_cases();

-- ---------------------------------------------------------------------
-- Row Level Security: an FA sees only their own rows; an admin
-- (is_admin = true) sees everyone's.
-- ---------------------------------------------------------------------
alter table users enable row level security;
alter table clients enable row level security;
alter table cases enable row level security;
alter table activities enable row level security;

create or replace function is_admin() returns boolean as $$
  select coalesce((select is_admin from users where id = auth.uid()), false);
$$ language sql security definer stable;

create policy "users read own or all if admin" on users
  for select using (id = auth.uid() or is_admin());
create policy "users update own" on users
  for update using (id = auth.uid());

do $$
declare t text;
begin
  foreach t in array array['clients','cases','activities']
  loop
    execute format('create policy "%1$s read own or all if admin" on %1$s for select using (fa_id = auth.uid() or is_admin());', t);
    execute format('create policy "%1$s insert own" on %1$s for insert with check (fa_id = auth.uid());', t);
    execute format('create policy "%1$s update own" on %1$s for update using (fa_id = auth.uid());', t);
    execute format('create policy "%1$s delete own" on %1$s for delete using (fa_id = auth.uid());', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- Table-level grants: with "Automatically expose new tables" turned off
-- at project creation, nothing is reachable via the API until granted
-- explicitly. Everything here goes to `authenticated` only — never
-- `anon` — since the whole app sits behind login; RLS above then further
-- narrows each authenticated request to that FA's own rows (or every
-- FA's, if is_admin()).
-- ---------------------------------------------------------------------
grant usage on schema public to authenticated;
grant select, insert, update, delete on
  users, clients, cases, activities
  to authenticated;
