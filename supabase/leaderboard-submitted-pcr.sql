-- Submitted PCR's on the leaderboard — run once in the SQL editor
-- (schema.sql already has this). Safe to re-run. The leaderboard now
-- also sums each FA's cases by the day they were submitted, so the app
-- can show Submitted PCR's next to Accepted PCR's.

drop function if exists public.leaderboard(date, date);
drop function if exists public.leaderboard(date[], date);
create or replace function public.leaderboard(p_dates date[], p_checkout_date date, p_include uuid default null)
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
          'productType', x.product_type, 'submitted', x.submitted,
          'submittedLumpSum', x.submitted_lump_sum, 'submittedMonthly', x.submitted_monthly,
          'acceptedLumpSum', x.accepted_lump_sum, 'acceptedMonthly', x.accepted_monthly)), '[]'::jsonb)
        from (
          select c.product_type,
            count(*) filter (where c.submitted_at = any(p_dates)) as submitted,
            -- Submitted PCR's: every case submitted on these days, whatever
            -- has happened to it since.
            coalesce(sum(c.lump_sum) filter (where c.submitted_at = any(p_dates)), 0) as submitted_lump_sum,
            coalesce(sum(c.monthly)  filter (where c.submitted_at = any(p_dates)), 0) as submitted_monthly,
            coalesce(sum(c.lump_sum) filter (where c.stage = 'accepted' and c.accepted_at = any(p_dates)), 0) as accepted_lump_sum,
            coalesce(sum(c.monthly)  filter (where c.stage = 'accepted' and c.accepted_at = any(p_dates)), 0) as accepted_monthly
          from public.cases c where c.fa_id = u.id
          group by c.product_type
        ) x) as cases,
      case when p_checkout_date is null then null
        else exists (select 1 from public.activities a
          where a.fa_id = u.id and a.type = 'checkout' and a.date = p_checkout_date)
      end as "checkedOut",
      -- Reviewed that day, but with nothing at all logged.
      coalesce((select (a.details->>'noActivity')::boolean from public.activities a
        where a.fa_id = u.id and a.type = 'checkout' and a.date = p_checkout_date), false) as "noActivity"
    from public.users u
    where u.is_active and (coalesce(u.branch, '') <> 'Test group' or u.id = p_include)
  ) t;
$$;

revoke execute on function public.leaderboard(date[], date, uuid) from public, anon;
grant execute on function public.leaderboard(date[], date, uuid) to authenticated;
