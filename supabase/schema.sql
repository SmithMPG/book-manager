-- Cadence — schema v3. Four tables, on purpose:
--
-- users       one row per person (FA or admin). Identity, role, PCR target.
-- clients     one row per client card. Belongs to the user who owns them
--             (fa_id) — this is what changes on a handover.
-- activities  meetings, FNAs, quotes, wills leads, referrals, prospect
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
--             case_id is unused for now (statuses live on cases —
--             see case_statuses below).
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
--             lives on the row too (case_statuses) — there are no
--             client-level statuses.
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
  branch      text,                           -- open-ended, not a fixed list — real
                                                -- branches/offices over time (e.g.
                                                -- "Bryanston Academy"), plus "Test
                                                -- group" for QA-only data. Drives the
                                                -- leaderboard's group filter.
  password_set boolean not null default false, -- flips true once they finish the
                                                -- set-password screen after their
                                                -- invite — see components/auth.js.
                                                -- Needed because Supabase's invite
                                                -- links grant a real session before
                                                -- a password exists; this is what
                                                -- stops that counting as "in".
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
-- components/client-cases.js). Its status history (case_statuses,
-- newest first — the first entry is the current status) carries the
-- day-to-day updates, several a day if need be. The "Accepted" and "Not
-- taken up" presets end the case; any other status on a closed case
-- reopens it. add_case_status() (below) writes an entry and
-- sets `status` / `accepted_at` to match, in one statement.
-- ---------------------------------------------------------------------
create table cases (
  id                  uuid primary key default gen_random_uuid(),
  client_id           uuid not null references clients(id) on delete cascade,
  fa_id               uuid not null references users(id) on delete cascade, -- current servicing FA; moves on handover
  case_type           text not null,
  status              text not null default 'in-progress'
                        check (status in ('in-progress', 'accepted', 'not-taken-up')),
  initiated_date      date not null,
  accepted_at         date,
  lump_sum            numeric,
  monthly             numeric,
  advice_fee_percent  numeric,
  case_statuses       jsonb not null default '[]'::jsonb, -- [{at, text, ending}], newest first
  created_at          timestamptz not null default now()
);
create index cases_fa_id_idx on cases(fa_id);
create index cases_client_id_idx on cases(client_id);
create index cases_status_idx on cases(status);

-- ---------------------------------------------------------------------
-- activities: meetings / fnas / quotes / wills_leads / referrals /
-- prospect_contacts / checkout confirmations, one table, `type` +
-- `details` for whatever's type-specific:
--   meeting          {meetingType: factFinder|relational|closing, joint: bool}
--   fna              {}
--   quote            {risk: bool, investment: bool}
--   wills_lead       {}
--   prospect_contact {channel: phoned|emailed|messaged|linkedin|other,
--                    count: int} — one row per channel per checkout;
--                    client_id left null (see header note)
--   referral         {} — logged alongside each +1 to clients.referrals,
--                    so referrals can be counted per month
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
                check (type in ('meeting', 'fna', 'quote', 'wills_lead', 'prospect_contact', 'checkout', 'referral')),
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
-- explicitly. `authenticated` is what the logged-in app itself uses —
-- RLS above then narrows each request to that FA's own rows (or every
-- FA's, if is_admin()). `service_role` (the secret key, used only by the
-- dashboard and any admin scripts, never the app) bypasses RLS's row filtering, but
-- bypassing RLS and having baseline permission to touch a table at all
-- are two separate things in Postgres — it still needs its own grant.
-- Neither role gets `anon` access — the whole app sits behind login.
-- ---------------------------------------------------------------------
grant usage on schema public to authenticated, service_role;
grant select, insert, update, delete on
  users, clients, cases, activities
  to authenticated, service_role;

-- Column-level update rights on users: RLS picks the rows, this picks the
-- columns. Without it "users update own" would let anyone change any
-- column of their own row — including is_admin, i.e. any FA could make
-- themselves an admin. Everything else is set from the dashboard.
revoke update on users from authenticated;
grant update (phone, password_set) on users to authenticated;

-- ---------------------------------------------------------------------
-- Leaderboard. RLS rightly stops an FA reading anyone else's rows, but
-- the leaderboard needs everyone's totals. This returns totals only —
-- counts and summed amounts per FA for a set of days, never an
-- individual client, case or activity. p_dates is any set of days (month
-- to date, or the days an admin picks on the month bar). PCR is worked
-- out in the app (casePcr in constants.js) from the per-case-type sums,
-- so its rules live in one place. checkedOut: did they check out for
-- p_checkout_date (null when not asked)?
-- ---------------------------------------------------------------------
drop function if exists public.leaderboard(date, date);
create or replace function public.leaderboard(p_dates date[], p_checkout_date date)
returns jsonb
language sql stable security definer set search_path = ''
as $$
  select coalesce(jsonb_agg(to_jsonb(t) order by t.name), '[]'::jsonb)
  from (
    select
      u.id,
      u.name || ' ' || u.surname as name,
      coalesce((select sum(coalesce((a.details->>'count')::int, 1)) from public.activities a
        where a.fa_id = u.id and a.type = 'prospect_contact' and a.date = any(p_dates)), 0) as prospects,
      (select count(*) from public.activities a
        where a.fa_id = u.id and a.type = 'referral' and a.date = any(p_dates)) as referrals,
      (select count(*) from public.activities a
        where a.fa_id = u.id and a.type = 'wills_lead' and a.date = any(p_dates)) as "willsLeads",
      (select count(*) from public.activities a
        where a.fa_id = u.id and a.type = 'fna' and a.date = any(p_dates)) as fnas,
      (select count(*) from public.activities a
        where a.fa_id = u.id and a.type = 'quote' and a.date = any(p_dates)) as quotes,
      (select jsonb_build_object(
          'factFinder', count(*) filter (where a.details->>'meetingType' = 'factFinder'),
          'closing',    count(*) filter (where a.details->>'meetingType' = 'closing'),
          'relational', count(*) filter (where a.details->>'meetingType' = 'relational'))
        from public.activities a
        where a.fa_id = u.id and a.type = 'meeting' and a.date = any(p_dates)) as meetings,
      (select coalesce(jsonb_agg(jsonb_build_object(
          'type', x.case_type, 'submitted', x.submitted,
          'acceptedLumpSum', x.accepted_lump_sum, 'acceptedMonthly', x.accepted_monthly)), '[]'::jsonb)
        from (
          select c.case_type,
            count(*) filter (where c.initiated_date = any(p_dates)) as submitted,
            coalesce(sum(c.lump_sum) filter (where c.status = 'accepted' and c.accepted_at = any(p_dates)), 0) as accepted_lump_sum,
            coalesce(sum(c.monthly)  filter (where c.status = 'accepted' and c.accepted_at = any(p_dates)), 0) as accepted_monthly
          from public.cases c where c.fa_id = u.id
          group by c.case_type
        ) x) as cases,
      case when p_checkout_date is null then null
        else exists (select 1 from public.activities a
          where a.fa_id = u.id and a.type = 'checkout' and a.date = p_checkout_date)
      end as "checkedOut"
    from public.users u
    where u.is_active and coalesce(u.branch, '') <> 'Test group'
  ) t;
$$;

revoke execute on function public.leaderboard(date[], date) from public, anon;
grant execute on function public.leaderboard(date[], date) to authenticated;

-- ---------------------------------------------------------------------
-- Adding a case status: one statement, so the log entry and the case's
-- open/closed state can never disagree. Entries are {at, text, ending}:
-- ending is 'accepted' | 'not-taken-up' (the two statuses that close a
-- case) or null — any other status on a closed case reopens it. Runs as
-- the calling user (security invoker), so RLS still limits it to their
-- own cases. p_date is the FA's local today, used as the accepted date.
-- ---------------------------------------------------------------------
create or replace function public.add_case_status(p_case_id uuid, p_text text, p_ending text, p_date date)
returns public.cases
language plpgsql security invoker set search_path = ''
as $$
declare result public.cases;
begin
  if p_ending is not null and p_ending not in ('accepted', 'not-taken-up') then
    raise exception 'Unknown ending status: %', p_ending;
  end if;
  if coalesce(trim(p_text), '') = '' then
    raise exception 'A status needs some text.';
  end if;

  update public.cases set
    case_statuses = jsonb_build_array(jsonb_build_object('at', now(), 'text', trim(p_text), 'ending', p_ending)) || case_statuses,
    status        = coalesce(p_ending, 'in-progress'),
    accepted_at   = case when p_ending = 'accepted' then p_date else null end
  where id = p_case_id
  returning * into result;

  if not found then
    raise exception 'Case not found.';
  end if;
  return result;
end;
$$;

revoke execute on function public.add_case_status(uuid, text, text, date) from public, anon;
grant execute on function public.add_case_status(uuid, text, text, date) to authenticated;
