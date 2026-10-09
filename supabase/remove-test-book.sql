-- Remove the Test Book — run once in the SQL editor (schema.sql already
-- has this). Safe to re-run. Then reload the app.
--
-- 1. Deletes the Test Book: the test login (test@bookmanager.co.za) and
--    its users row in branch 'Test group', and with them (on delete
--    cascade) every client, case and activity logged in it. This can't be
--    undone — it's only ever been test data.
-- 2. can_act_as() / manages(): no more super-admin access to it.
-- 3. leaderboard(): no more p_include, nor leaving 'Test group' out.

-- 1. The Test Book and everything in it.
delete from auth.users
where id in (select id from public.users where branch = 'Test group');

-- 2. Writing and managing: your own book, your own FA list.
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

-- 3. The leaderboard, without the Test Book.
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
          'submittedLumpSum', x.submitted_lump_sum, 'submittedMonthly', x.submitted_monthly,
          'acceptedLumpSum', x.accepted_lump_sum, 'acceptedMonthly', x.accepted_monthly,
          'acceptedFinalPcr', x.accepted_final_pcr,
          'openLumpSum', x.open_lump_sum, 'openMonthly', x.open_monthly)), '[]'::jsonb)
        from (
          -- Grouped by product type — and, for RA Builder, by the term its
          -- PCR goes by (capped at 15; none = 15), so each group's PCR is
          -- worked out from its sums.
          select c.product_type,
            case when c.product_type = 'ra-builder' then least(coalesce(c.term, 15), 15) end as term,
            count(*) filter (where c.submitted_at = any(p_dates)) as submitted,
            -- Submitted PCR's: every case submitted on these days, whatever
            -- has happened to it since.
            coalesce(sum(c.lump_sum) filter (where c.submitted_at = any(p_dates)), 0) as submitted_lump_sum,
            coalesce(sum(c.monthly)  filter (where c.submitted_at = any(p_dates)), 0) as submitted_monthly,
            -- Accepted PCR: the final PCR where the manager set one; the
            -- premiums (PCR worked out in the app) for cases accepted
            -- before there was one.
            coalesce(sum(c.final_pcr) filter (where c.stage = 'accepted' and c.accepted_at = any(p_dates)), 0) as accepted_final_pcr,
            coalesce(sum(c.lump_sum) filter (where c.stage = 'accepted' and c.accepted_at = any(p_dates) and c.final_pcr is null), 0) as accepted_lump_sum,
            coalesce(sum(c.monthly)  filter (where c.stage = 'accepted' and c.accepted_at = any(p_dates) and c.final_pcr is null), 0) as accepted_monthly,
            -- Open case PCR's: cases opened but not yet submitted, right
            -- now (not tied to the days asked for).
            coalesce(sum(c.lump_sum) filter (where c.stage = 'opened'), 0) as open_lump_sum,
            coalesce(sum(c.monthly)  filter (where c.stage = 'opened'), 0) as open_monthly
          from public.cases c where c.fa_id = u.id
          group by 1, 2
        ) x) as cases,
      -- Did they do anything on p_checkout_date (the last weekday — the
      -- ✓ / ✗ beside their name)? Anything logged for that day counts —
      -- a contact, note, meeting, case change, prospects contacted… —
      -- except the Review itself (a 'checkout' row).
      case when p_checkout_date is null then null
        else exists (select 1 from public.activities a
          where a.fa_id = u.id and a.type <> 'checkout' and a.date = p_checkout_date)
      end as "hadActivity"
    from public.users u
    where u.is_active and u.on_leaderboard
  ) t;
$$;

revoke execute on function public.leaderboard(date[], date) from public, anon;
grant execute on function public.leaderboard(date[], date) to authenticated;

-- Check (should return no rows):
--   select id, name, surname from users where branch = 'Test group';
