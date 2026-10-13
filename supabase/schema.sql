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
--             case_id is set only on `case` entries (a case being
--             opened, submitted, accepted or not taken up), linking
--             the timeline entry to that case. Every other entry
--             belongs to the client alone.
--             fa_id here is who actually did the work, and it never
--             changes — if a client is handed to a new FA, their history
--             stays attributed to whoever really did it. Compare cases,
--             below.
-- products    the New Case dropdown (+ product_checklist_items): each
--             product's type and checklist. Admins edit
--             them; open cases follow, closed ones keep a snapshot.
-- cases       its own table, not folded into activities, because it's
--             the one place real money math runs (lump sum, monthly,
--             advice fee) and needs typed columns, not a details blob.
--             fa_id here means CURRENT servicing FA — unlike activities,
--             this DOES change on a handover (see the trigger below),
--             since the case and its commission genuinely transfer to
--             whoever now services the client. What happens to a case
--             is on the client's timeline (activities of type `case`).
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
  is_super_admin boolean not null default false, -- an admin who can view Admin mode as any other admin
  is_active   boolean not null default true,  -- false = "left", data retained
  on_leaderboard boolean not null default true, -- false for a manager who doesn't
                                                -- sell (Ameeth): left off the
                                                -- leaderboard and team figures
  branch      text,                           -- open-ended, not a fixed list — the
                                                -- office (e.g. "Bryanston").
  academy     boolean not null default false, -- part of the Academy (yes / no)
  manager_id  uuid references users(id) on delete set null, -- the admin whose FA list
                                                -- they're on (team.js). That admin
                                                -- accepts their cases and can edit
                                                -- them or move them to Resigned.
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
-- products: the New Case dropdown, kept by admins (the Products tab).
-- type is the hard-coded part — it decides what a case records and how
-- commission and PCR are worked out (PRODUCT_TYPES in constants.js):
--   risk         monthly premium only
--   ra-builder   lump sum, monthly premium, advice fee, term
--   liberty-ra   lump sum, monthly premium, advice fee (term always 5)
--   investment   lump sum, monthly premium, advice fee
-- Every case has the same stages whatever its product (see cases).
-- product_checklist_items: its checklist, what has to be ticked before
-- submitting; key is what a case's checklist ticks are stored
-- under, so the standard 7 keep their keys (id, bankProof, …).
-- Everyone signed in reads these; only admins write (policies below).
-- ---------------------------------------------------------------------
create table products (
  id          uuid primary key default gen_random_uuid(),
  name        text not null unique,
  type        text not null check (type in ('risk', 'ra-builder', 'liberty-ra', 'investment')),
  sort_order  int not null default 0,
  created_at  timestamptz not null default now()
);

create table product_checklist_items (
  id          uuid primary key default gen_random_uuid(),
  product_id  uuid not null references products(id) on delete cascade,
  key         text not null,
  label       text not null,
  sort_order  int not null default 0,
  unique (product_id, key)
);
create index product_checklist_items_product_idx on product_checklist_items(product_id);

-- ---------------------------------------------------------------------
-- months: the Calendar (☰ → Calendar, calendar.js). One row per month:
-- its close-off date (the business month's last day) and the team's
-- weekly submission target (PCR to submit in each week of it). A month
-- runs from the day after the previous month's close-off to its own;
-- the earliest row only marks where the first month starts. The month
-- bar and every "this month" figure come from here.
-- month: the first of the calendar month it's named for (2026-10-01 =
-- October 2026). close_off_date can be blank for a month that's only had
-- its target set; close-off dates run in month order
-- (_months_in_order). Everyone reads; admins write.
-- ---------------------------------------------------------------------
create table months (
  month           date primary key check (extract(day from month) = 1),
  close_off_date  date unique,
  weekly_target   bigint check (weekly_target is null or weekly_target >= 0),
  updated_at      timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- cases: one per product sold to a client. Every case has the same
-- stages: opened → submitted → accepted, or not taken up (any time while
-- open). Accepted is the FA's manager's alone; not taken up the FA's
-- (set_case_stage). Open = not yet accepted or not taken up.
-- Each stage change is also a `case` entry on the client's timeline;
-- open_case() and set_case_stage() (below) do both in one statement.
-- checklist: which of its checklist items are ticked, by key, e.g.
-- {"id": true, "bankProof": true}.
-- While open, case_type (the product's name) and product_type follow
-- the product (_product_change_follows_open_cases). On closing they're
-- frozen, so editing or deleting the product afterwards never changes a
-- closed case — which keeps just that: its product, its premiums and
-- its PCRs (the one worked out from the premiums, and final_pcr).
-- final_pcr: set by the manager when accepting — what the case was
-- actually accepted at, which can differ from the PCR worked out from
-- its premiums (casePcr in constants.js). Accepted PCR counts this.
-- ---------------------------------------------------------------------
create table cases (
  id                  uuid primary key default gen_random_uuid(),
  client_id           uuid not null references clients(id) on delete cascade,
  fa_id               uuid not null references users(id) on delete cascade, -- current servicing FA; moves on handover
  product_id          uuid references products(id) on delete set null, -- null once the product's deleted
  product_type        text not null check (product_type in ('risk', 'ra-builder', 'liberty-ra', 'investment')),
  case_type           text not null,
  stage               text not null default 'opened'
                        check (stage in ('opened', 'submitted', 'accepted', 'not-taken-up')),
  opened_at           date not null,
  submitted_at        date,
  accepted_at         date,
  lump_sum            numeric,
  monthly             numeric,
  advice_fee_percent  numeric,
  term                int check (term is null or term between 1 and 60), -- RA Builder: years (PCR caps it at 15)
  checklist           jsonb not null default '{}'::jsonb,
  final_pcr           numeric check (final_pcr is null or final_pcr >= 0),
  created_at          timestamptz not null default now()
);
create index cases_fa_id_idx on cases(fa_id);
create index cases_product_id_idx on cases(product_id);
create index cases_client_id_idx on cases(client_id);
create index cases_stage_idx on cases(stage);

-- ---------------------------------------------------------------------
-- activities: each client's timeline — contacts, notes, meetings,
-- FNAs, quotes, wills leads, referrals and case events — plus the FA's
-- own per-day records (prospects contacted, checkout). One table, `type`
-- + `details` for whatever's type-specific. A timeline reads newest
-- first by `date`, then `created_at`.
--   contact          {method: phone|email|message|linkedin|inPerson,
--                    outcome: text — a standard outcome or the FA's own}
--   note             {text}
--   meeting          {meetingType: factFinder|relational|closing, joint: bool,
--                    referrals: int, willsLead: bool}
--   fna              {}
--   quote            {risk: bool, investment: bool}
--   wills_lead       {}
--   prospect_contact {channel: phoned|emailed|messaged|linkedin|other,
--                    count: int} — one row per channel per checkout;
--                    client_id left null (see header note)
--   referral         {} — the client gave a referral
--   case             {event: opened|submitted|accepted|not-taken-up} —
--                    case_id set; written by open_case / set_case_stage.
--                    {event: amended, from, to} — an open case's amounts
--                    changed, before and after ({lumpSum, monthly,
--                    adviceFeePercent}); written by amend_case
--   checkout         {noActivity: bool} — client_id left null; this date
--                    has been reviewed (the Review) by this FA — noActivity
--                    when nothing at all was logged. At most one per
--                    (fa_id, date) — see the unique index below.
-- ---------------------------------------------------------------------
create table activities (
  id          uuid primary key default gen_random_uuid(),
  fa_id       uuid not null references users(id) on delete cascade, -- who actually did it; never changes on handover
  client_id   uuid references clients(id) on delete cascade,        -- null only for prospect_contact / checkout
  case_id     uuid references cases(id) on delete cascade,          -- set only on `case` entries
  type        text not null
                check (type in ('contact', 'note', 'meeting', 'fna', 'quote', 'wills_lead', 'referral', 'case',
                                'date_change', 'prospect_contact', 'checkout')),
  date        date not null,
  details     jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now(),
  constraint activities_client_required
    check (type in ('prospect_contact', 'checkout') or client_id is not null),
  constraint activities_case_entry_has_case
    check (type <> 'case' or case_id is not null)
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
-- An open case's amounts can be changed (the client changes their mind)
-- — amend_case, below, which also records the change on the timeline;
-- once it's accepted or not taken up they're fixed.
-- ---------------------------------------------------------------------
create or replace function _closed_case_amounts_fixed() returns trigger as $$
begin
  if old.stage in ('accepted', 'not-taken-up')
     and (new.lump_sum, new.monthly, new.advice_fee_percent, new.term)
         is distinct from (old.lump_sum, old.monthly, old.advice_fee_percent, old.term) then
    raise exception 'This case is closed, so its amounts can''t be changed.';
  end if;
  return new;
end;
$$ language plpgsql set search_path = '';

create trigger closed_case_amounts_fixed before update on cases
  for each row execute function _closed_case_amounts_fixed();

-- ---------------------------------------------------------------------
-- Products and open cases: open cases follow their product (a rename or
-- a new type reaches them); closed ones don't (they're frozen — see
-- cases). A product can't be deleted while an open case uses it.
-- ---------------------------------------------------------------------
create or replace function _product_change_follows_open_cases() returns trigger as $$
begin
  update public.cases set case_type = new.name, product_type = new.type
  where product_id = new.id and stage in ('opened', 'submitted');
  return new;
end;
$$ language plpgsql security definer set search_path = '';

create trigger product_change_follows_open_cases
  after update of name, type on products
  for each row execute function _product_change_follows_open_cases();

create or replace function _product_in_use_check() returns trigger as $$
declare n int;
begin
  select count(*) into n from public.cases where product_id = old.id and stage in ('opened', 'submitted');
  if n > 0 then
    raise exception '% has % open case%. Close them before deleting it.', old.name, n, case when n = 1 then '' else 's' end;
  end if;
  return old;
end;
$$ language plpgsql security definer set search_path = '';

create trigger product_in_use before delete on products
  for each row execute function _product_in_use_check();

-- ---------------------------------------------------------------------
-- Close-off dates run in month order: each after the previous month's
-- and before the next month's.
-- ---------------------------------------------------------------------
create or replace function _months_in_order() returns trigger as $$
begin
  new.updated_at := now();
  if new.close_off_date is null then return new; end if;
  if exists (select 1 from public.months where month < new.month and close_off_date >= new.close_off_date) then
    raise exception 'The close-off date has to be after the previous month''s.';
  end if;
  if exists (select 1 from public.months where month > new.month and close_off_date <= new.close_off_date) then
    raise exception 'The close-off date has to be before the next month''s.';
  end if;
  return new;
end;
$$ language plpgsql set search_path = '';

create trigger months_in_order before insert or update on months
  for each row execute function _months_in_order();

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

-- Who may write a row for FA p_fa: that FA themselves. Nobody who's
-- resigned (is_active = false) writes anything, even with a session left
-- over.
create or replace function can_act_as(p_fa uuid) returns boolean as $$
  select exists (select 1 from public.users where id = auth.uid() and is_active)
     and p_fa = auth.uid();
$$ language sql security definer stable set search_path = '';

-- Whether the caller manages FA p_fa: an admin with p_fa on their FA
-- list (users.manager_id). Only a manager accepts a case, edits an FA or
-- moves them to Resigned.
create or replace function manages(p_fa uuid) returns boolean as $$
  select exists (select 1 from public.users me where me.id = auth.uid() and me.is_admin and me.is_active)
     and exists (select 1 from public.users where id = p_fa and manager_id = auth.uid());
$$ language sql security definer stable set search_path = '';

-- Products and the Calendar: everyone signed in reads them (the New
-- Case dropdown, a case's checklist, the month bar); only
-- admins change them.
alter table products enable row level security;
alter table product_checklist_items enable row level security;
alter table months enable row level security;
do $$
declare t text;
begin
  foreach t in array array['products','product_checklist_items','months']
  loop
    execute format('create policy "%1$s read" on %1$s for select to authenticated using (true);', t);
    execute format('create policy "%1$s admin insert" on %1$s for insert with check (is_admin());', t);
    execute format('create policy "%1$s admin update" on %1$s for update using (is_admin());', t);
    execute format('create policy "%1$s admin delete" on %1$s for delete using (is_admin());', t);
  end loop;
end $$;

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
    execute format('create policy "%1$s insert own" on %1$s for insert with check (can_act_as(fa_id));', t);
    execute format('create policy "%1$s update own" on %1$s for update using (can_act_as(fa_id));', t);
    execute format('create policy "%1$s delete own" on %1$s for delete using (can_act_as(fa_id));', t);
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
  users, clients, cases, activities, products, product_checklist_items, months
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
-- out in the app (casePcr in constants.js) from the per-product-type
-- sums, so its rules live in one place. hadActivity: did they log
-- anything on p_checkout_date (null when not asked)?
-- ---------------------------------------------------------------------
drop function if exists public.leaderboard(date, date);
drop function if exists public.leaderboard(date[], date, uuid);
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
      -- Referrals and wills leads are recorded on meetings ({referrals: n,
      -- willsLead: bool}); separate referral / wills_lead entries (from
      -- the checkout) count too.
      (select coalesce(sum(case when a.type = 'meeting' then coalesce((a.details->>'referrals')::int, 0) else 1 end), 0)
        from public.activities a
        where a.fa_id = u.id and a.type in ('meeting', 'referral') and a.date = any(p_dates)) as referrals,
      (select count(*) from public.activities a
        where a.fa_id = u.id and a.date = any(p_dates)
          and (a.type = 'wills_lead' or (a.type = 'meeting' and (a.details->>'willsLead')::boolean))) as "willsLeads",
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
          'productType', x.product_type, 'term', x.term, 'submitted', x.submitted,
          'acceptedLumpSum', x.accepted_lump_sum, 'acceptedMonthly', x.accepted_monthly,
          'acceptedFinalPcr', x.accepted_final_pcr, 'acceptedCount', x.accepted_count,
          'openedLumpSum', x.opened_lump_sum, 'openedMonthly', x.opened_monthly, 'openedCount', x.opened_count,
          'stillSubmittedLumpSum', x.still_submitted_lump_sum, 'stillSubmittedMonthly', x.still_submitted_monthly,
          'stillSubmittedCount', x.still_submitted_count)), '[]'::jsonb)
        from (
          -- Grouped by product type — and, for RA Builder, by the term its
          -- PCR goes by (capped at 15; none = 15), so each group's PCR is
          -- worked out from its sums.
          select c.product_type,
            case when c.product_type = 'ra-builder' then least(coalesce(c.term, 15), 15) end as term,
            -- Cases submitted on these days, whatever has happened since
            -- (the funnel).
            count(*) filter (where c.submitted_at = any(p_dates)) as submitted,
            -- Accepted PCR: the final PCR where the manager set one; the
            -- premiums (PCR worked out in the app) for cases accepted
            -- before there was one.
            coalesce(sum(c.final_pcr) filter (where c.stage = 'accepted' and c.accepted_at = any(p_dates)), 0) as accepted_final_pcr,
            coalesce(sum(c.lump_sum) filter (where c.stage = 'accepted' and c.accepted_at = any(p_dates) and c.final_pcr is null), 0) as accepted_lump_sum,
            coalesce(sum(c.monthly)  filter (where c.stage = 'accepted' and c.accepted_at = any(p_dates) and c.final_pcr is null), 0) as accepted_monthly,
            count(*) filter (where c.stage = 'accepted' and c.accepted_at = any(p_dates)) as accepted_count,
            -- The leaderboard's month view counts each case once, where it
            -- is now: opened on these days and still open; submitted on
            -- these days and still awaiting acceptance (accepted: above).
            coalesce(sum(c.lump_sum) filter (where c.stage = 'opened' and c.opened_at = any(p_dates)), 0) as opened_lump_sum,
            coalesce(sum(c.monthly)  filter (where c.stage = 'opened' and c.opened_at = any(p_dates)), 0) as opened_monthly,
            count(*) filter (where c.stage = 'opened' and c.opened_at = any(p_dates)) as opened_count,
            coalesce(sum(c.lump_sum) filter (where c.stage = 'submitted' and c.submitted_at = any(p_dates)), 0) as still_submitted_lump_sum,
            coalesce(sum(c.monthly)  filter (where c.stage = 'submitted' and c.submitted_at = any(p_dates)), 0) as still_submitted_monthly,
            count(*) filter (where c.stage = 'submitted' and c.submitted_at = any(p_dates)) as still_submitted_count
          from public.cases c where c.fa_id = u.id
          group by 1, 2
        ) x) as cases,
      -- Did they do anything on p_checkout_date (the last weekday — the
      -- ✓ / ✗ beside their name)? Anything logged for that day counts —
      -- a contact, note, meeting, case change, prospects contacted… —
      -- except the Review itself (a 'checkout' row) and a date changed
      -- ('date_change').
      case when p_checkout_date is null then null
        else exists (select 1 from public.activities a
          where a.fa_id = u.id and a.type not in ('checkout', 'date_change') and a.date = p_checkout_date)
      end as "hadActivity"
    from public.users u
    where u.is_active and u.on_leaderboard
  ) t;
$$;

revoke execute on function public.leaderboard(date[], date) from public, anon;
grant execute on function public.leaderboard(date[], date) to authenticated;

-- ---------------------------------------------------------------------
-- Opening a case, and moving it to its next stage. Each writes the case
-- and its `case` timeline entry in one statement, so they can't
-- disagree. open_case runs as the calling user (security invoker), for
-- the client's own FA — only if can_act_as allows it (their own book).
-- p_date is the FA's local
-- today (or the day being reviewed). Both return {case, activity}.
-- Stage changes allowed: opened → submitted | not-taken-up,
-- submitted → accepted | not-taken-up.
-- Accepting is the FA's manager's alone (manages(), from their FA list),
-- never the FA's own; submitting the FA's or their manager's (noted on
-- the line: submittedBy, submittedByName); not taken up the FA's alone
-- (can_act_as).
-- set_case_stage runs as definer so a manager can do that for an FA whose
-- rows RLS won't let them write — it checks who may do what itself.
-- Accepting takes the final PCR (p_final_pcr — the app offers the PCR
-- worked out from the premiums, which the manager can change) and the
-- client's last open case also moves them to Clients, the only place an
-- accepted client goes. The timeline entry stays the FA's (fa_id), with
-- who accepted it and the final PCR in details (acceptedBy, finalPcr).
-- ---------------------------------------------------------------------
drop function if exists public.open_case(uuid, text, numeric, numeric, numeric, date);
drop function if exists public.open_case(uuid, uuid, numeric, numeric, numeric, date);
create or replace function public.open_case(
  p_client_id uuid, p_product_id uuid, p_lump_sum numeric, p_monthly numeric,
  p_advice_fee_percent numeric, p_date date, p_term int default null)
returns jsonb
language plpgsql security invoker set search_path = ''
as $$
declare c public.cases; a public.activities; v_fa uuid; p public.products;
begin
  select fa_id into v_fa from public.clients where id = p_client_id;
  if v_fa is null or not public.can_act_as(v_fa) then
    raise exception 'Client not found.';
  end if;
  select * into p from public.products where id = p_product_id;
  if not found then
    raise exception 'That product no longer exists.';
  end if;
  insert into public.cases (client_id, fa_id, product_id, product_type, case_type, stage, opened_at,
                            lump_sum, monthly, advice_fee_percent, term)
  values (p_client_id, v_fa, p.id, p.type, p.name, 'opened', p_date,
          p_lump_sum, p_monthly, p_advice_fee_percent, case when p.type = 'ra-builder' then p_term end)
  returning * into c;
  insert into public.activities (fa_id, client_id, case_id, type, date, details)
  values (v_fa, p_client_id, c.id, 'case', p_date, jsonb_build_object('event', 'opened'))
  returning * into a;
  return jsonb_build_object('case', to_jsonb(c), 'activity', to_jsonb(a));
end;
$$;

drop function if exists public.set_case_stage(uuid, text, date);
create or replace function public.set_case_stage(p_case_id uuid, p_stage text, p_date date, p_final_pcr numeric default null)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare c public.cases; a public.activities; v_details jsonb;
begin
  select * into c from public.cases where id = p_case_id for update;
  if not found then
    raise exception 'Case not found.';
  end if;
  if p_stage = 'accepted' then
    if not public.manages(c.fa_id) then
      raise exception 'Only the FA''s manager can accept a case.';
    end if;
  elsif p_stage = 'submitted' then
    if not (public.can_act_as(c.fa_id) or public.manages(c.fa_id)) then
      raise exception 'Case not found.';
    end if;
  elsif not public.can_act_as(c.fa_id) then
    raise exception 'Case not found.';
  end if;
  if not ((c.stage = 'opened' and p_stage in ('submitted', 'not-taken-up'))
       or (c.stage = 'submitted' and p_stage in ('accepted', 'not-taken-up'))) then
    raise exception 'A case that is % can''t be marked %.', c.stage, p_stage;
  end if;
  if p_stage = 'accepted' and (p_final_pcr is null or p_final_pcr < 0) then
    raise exception 'Accepting a case needs its final PCR.';
  end if;

  update public.cases set
    stage        = p_stage,
    submitted_at = case when p_stage = 'submitted' then p_date else submitted_at end,
    accepted_at  = case when p_stage = 'accepted' then p_date else accepted_at end,
    final_pcr    = case when p_stage = 'accepted' then p_final_pcr else final_pcr end
  where id = p_case_id
  returning * into c;
  v_details := jsonb_build_object('event', p_stage);
  if p_stage = 'submitted' and auth.uid() <> c.fa_id then
    v_details := v_details || jsonb_build_object('submittedBy', auth.uid(),
      'submittedByName', (select name || ' ' || surname from public.users where id = auth.uid()));
  end if;
  if p_stage = 'accepted' then
    v_details := v_details || jsonb_build_object('acceptedBy', auth.uid(), 'finalPcr', p_final_pcr);
    if not exists (select 1 from public.cases
                   where client_id = c.client_id and stage in ('opened', 'submitted')) then
      update public.clients set tab = 'clients' where id = c.client_id;
    end if;
  end if;
  insert into public.activities (fa_id, client_id, case_id, type, date, details)
  values (c.fa_id, c.client_id, c.id, 'case', p_date, v_details)
  returning * into a;
  return jsonb_build_object('case', to_jsonb(c), 'activity', to_jsonb(a));
end;
$$;

-- ---------------------------------------------------------------------
-- A manager editing an FA on their list: name, Validation target, and
-- whether they're still with the team (is_active = false: Resigned —
-- they can't sign in and drop off the leaderboard, their data stays).
-- Definer, because FAs (and so admins) may only update their own phone
-- and password_set (the column grants above).
-- ---------------------------------------------------------------------
create or replace function public.update_fa(
  p_fa uuid, p_name text, p_surname text, p_pcr_target int, p_active boolean)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare u public.users;
begin
  if not public.manages(p_fa) then
    raise exception 'That FA isn''t on your list.';
  end if;
  if coalesce(trim(p_name), '') = '' or coalesce(trim(p_surname), '') = '' then
    raise exception 'Name and surname are required.';
  end if;
  update public.users set
    name = trim(p_name), surname = trim(p_surname),
    pcr_target = p_pcr_target, is_active = p_active
  where id = p_fa
  returning * into u;
  return to_jsonb(u);
end;
$$;

revoke execute on function public.update_fa(uuid, text, text, int, boolean) from public, anon;
grant execute on function public.update_fa(uuid, text, text, int, boolean) to authenticated;

-- Changing an open case's amounts, and its "amended" timeline entry
-- with the before and after, in one statement. The FA's own case.
-- Returns {case, activity}.
drop function if exists public.amend_case(uuid, numeric, numeric, numeric, date);
create or replace function public.amend_case(
  p_case_id uuid, p_lump_sum numeric, p_monthly numeric, p_advice_fee_percent numeric, p_date date,
  p_term int default null)
returns jsonb
language plpgsql security invoker set search_path = ''
as $$
declare was public.cases; c public.cases; a public.activities;
begin
  select * into was from public.cases where id = p_case_id for update;
  if not found or not public.can_act_as(was.fa_id) then
    raise exception 'Case not found.';
  end if;
  if was.stage not in ('opened', 'submitted') then
    raise exception 'This case is closed, so its amounts can''t be changed.';
  end if;
  update public.cases set lump_sum = p_lump_sum, monthly = p_monthly, advice_fee_percent = p_advice_fee_percent,
    term = case when was.product_type = 'ra-builder' then p_term else term end
  where id = p_case_id
  returning * into c;
  insert into public.activities (fa_id, client_id, case_id, type, date, details)
  values (c.fa_id, c.client_id, c.id, 'case', p_date, jsonb_build_object(
    'event', 'amended',
    'from', jsonb_build_object('lumpSum', was.lump_sum, 'monthly', was.monthly, 'adviceFeePercent', was.advice_fee_percent, 'term', was.term),
    'to',   jsonb_build_object('lumpSum', c.lump_sum, 'monthly', c.monthly, 'adviceFeePercent', c.advice_fee_percent, 'term', c.term)))
  returning * into a;
  return jsonb_build_object('case', to_jsonb(c), 'activity', to_jsonb(a));
end;
$$;

revoke execute on function public.amend_case(uuid, numeric, numeric, numeric, date, int) from public, anon;
grant execute on function public.amend_case(uuid, numeric, numeric, numeric, date, int) to authenticated;

-- ---------------------------------------------------------------------
-- Changing dates on the timeline. Every change is noted on the client's
-- timeline as a 'date_change' entry, dated the day it was done (p_today,
-- the changer's local today): what moved, from and to, and who did it
-- (details: entryType, event and caseType for a case line, from, to,
-- by, byManager). It's the FA's row (fa_id) whoever changed it, and it
-- doesn't count as activity (the leaderboard's ✓ / ✗, the Review).
-- ---------------------------------------------------------------------
create or replace function public._log_date_change(
  a public.activities, p_from date, p_to date, p_today date, p_case_type text)
returns public.activities
language plpgsql security definer set search_path = ''
as $$
declare v_log public.activities; v_by text;
begin
  select name || ' ' || surname into v_by from public.users where id = auth.uid();
  insert into public.activities (fa_id, client_id, type, date, details)
  values (a.fa_id, a.client_id, 'date_change', p_today, jsonb_build_object(
    'entryType', a.type, 'event', a.details->>'event', 'caseType', p_case_type,
    'from', p_from, 'to', p_to, 'by', v_by, 'byManager', auth.uid() <> a.fa_id))
  returning * into v_log;
  return v_log;
end;
$$;
revoke execute on function public._log_date_change(public.activities, date, date, date, text) from public, anon, authenticated;

-- p_today is the changer's local today: within a day of the server's.
create or replace function public._check_new_date(p_date date, p_today date) returns void
language plpgsql set search_path = ''
as $$
begin
  if p_today is null or abs(p_today - current_date) > 1 then
    raise exception 'Your device''s date looks wrong.';
  end if;
  if p_date is null or p_date > p_today then
    raise exception 'Pick a day no later than today.';
  end if;
end;
$$;

-- A contact, note, meeting, FNA, quote, wills lead or referral: the FA's
-- own. Returns {activity, log} (log null when nothing changed).
create or replace function public.set_activity_date(p_activity_id uuid, p_date date, p_today date)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare a public.activities; v_from date; v_log public.activities;
begin
  select * into a from public.activities where id = p_activity_id for update;
  if not found or a.type in ('case', 'date_change', 'checkout', 'prospect_contact')
     or not public.can_act_as(a.fa_id) then
    raise exception 'Entry not found.';
  end if;
  perform public._check_new_date(p_date, p_today);
  if p_date = a.date then
    return jsonb_build_object('activity', to_jsonb(a), 'log', null);
  end if;
  v_from := a.date;
  update public.activities set date = p_date where id = a.id returning * into a;
  v_log := public._log_date_change(a, v_from, p_date, p_today, null);
  return jsonb_build_object('activity', to_jsonb(a), 'log', to_jsonb(v_log));
end;
$$;

revoke execute on function public.set_activity_date(uuid, date, date) from public, anon;
grant execute on function public.set_activity_date(uuid, date, date) to authenticated;

-- A case line, and the case's own date with it: an "opened" line moves
-- opened_at, a "submitted" line submitted_at, an "accepted" line
-- accepted_at (the amended / not-taken-up lines are only the line). The
-- dates stay in order — opened, then submitted, then accepted, the
-- other lines no earlier than opened. The FA (their own case) or their
-- manager; an accepted line only the manager (as accepting is). When the
-- manager moves a submitted date before the opened date, the opened date
-- moves back to it too (its line as well, noted the same way) — an FA
-- is told no instead. Returns {case, activity, log}.
drop function if exists public.set_case_event_date(uuid, date);
create or replace function public.set_case_event_date(p_activity_id uuid, p_date date, p_today date)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare a public.activities; c public.cases; v_event text; v_from date; v_log public.activities;
        v_manager boolean; v_opened public.activities;
begin
  select * into a from public.activities where id = p_activity_id and type = 'case' for update;
  if not found then
    raise exception 'Entry not found.';
  end if;
  select * into c from public.cases where id = a.case_id for update;
  v_event := a.details->>'event';
  if v_event = 'accepted' then
    if not public.manages(c.fa_id) then
      raise exception 'Only the FA''s manager can change when a case was accepted.';
    end if;
  elsif not (public.can_act_as(c.fa_id) or public.manages(c.fa_id)) then
    raise exception 'Entry not found.';
  end if;
  perform public._check_new_date(p_date, p_today);
  if p_date = a.date then
    return jsonb_build_object('case', to_jsonb(c), 'activity', to_jsonb(a), 'log', null);
  end if;
  -- The manager (not the FA themselves) moving submitted before opened:
  -- opened moves back with it.
  v_manager := public.manages(c.fa_id) and not public.can_act_as(c.fa_id);
  if v_event = 'submitted' and v_manager and p_date < c.opened_at then
    select * into v_opened from public.activities
    where case_id = c.id and type = 'case' and details->>'event' = 'opened'
    order by created_at desc limit 1 for update;
    if found then
      v_from := v_opened.date;
      update public.activities set date = p_date where id = v_opened.id returning * into v_opened;
      perform public._log_date_change(v_opened, v_from, p_date, p_today, c.case_type);
    end if;
    update public.cases set opened_at = p_date where id = c.id returning * into c;
  end if;
  if v_event = 'opened' and (p_date > c.submitted_at or p_date > c.accepted_at) then
    raise exception 'A case can''t be opened after it was submitted or accepted.';
  elsif v_event = 'submitted' and (p_date < c.opened_at or p_date > c.accepted_at) then
    raise exception 'A case is submitted after it''s opened and before it''s accepted.';
  elsif v_event = 'accepted' and p_date < coalesce(c.submitted_at, c.opened_at) then
    raise exception 'A case can''t be accepted before it was submitted.';
  elsif v_event not in ('opened', 'submitted', 'accepted') and p_date < c.opened_at then
    raise exception 'That''s before the case was opened.';
  end if;

  v_from := a.date;
  update public.cases set
    opened_at    = case when v_event = 'opened' then p_date else opened_at end,
    submitted_at = case when v_event = 'submitted' then p_date else submitted_at end,
    accepted_at  = case when v_event = 'accepted' then p_date else accepted_at end
  where id = c.id
  returning * into c;
  update public.activities set date = p_date where id = a.id returning * into a;
  v_log := public._log_date_change(a, v_from, p_date, p_today, c.case_type);
  return jsonb_build_object('case', to_jsonb(c), 'activity', to_jsonb(a), 'log', to_jsonb(v_log));
end;
$$;

revoke execute on function public.set_case_event_date(uuid, date, date) from public, anon;
grant execute on function public.set_case_event_date(uuid, date, date) to authenticated;

-- The same from the case's side (the admin's Cases tab): its "opened",
-- "submitted" or "accepted" date (p_event) — the case's line for it moves
-- too. Returns {case, activity, log}.
drop function if exists public.set_case_date(uuid, text, date);
create or replace function public.set_case_date(p_case_id uuid, p_event text, p_date date, p_today date)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare v_id uuid;
begin
  if p_event not in ('opened', 'submitted', 'accepted') then
    raise exception 'A case has no % date.', p_event;
  end if;
  select id into v_id from public.activities
  where case_id = p_case_id and type = 'case' and details->>'event' = p_event
  order by created_at desc limit 1;
  if v_id is null then
    raise exception 'This case hasn''t been % yet.', p_event;
  end if;
  return public.set_case_event_date(v_id, p_date, p_today);
end;
$$;

revoke execute on function public.set_case_date(uuid, text, date, date) from public, anon;
grant execute on function public.set_case_date(uuid, text, date, date) to authenticated;

revoke execute on function public.open_case(uuid, uuid, numeric, numeric, numeric, date, int) from public, anon;
grant execute on function public.open_case(uuid, uuid, numeric, numeric, numeric, date, int) to authenticated;
revoke execute on function public.set_case_stage(uuid, text, date, numeric) from public, anon;
grant execute on function public.set_case_stage(uuid, text, date, numeric) to authenticated;
