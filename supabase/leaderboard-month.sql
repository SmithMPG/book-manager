-- The leaderboard as one month table — run once in the SQL editor
-- (schema.sql already has this). Safe to re-run, whether or not
-- leaderboard-pot.sql was run. For the days asked for, per FA, each case
-- once where it is now: opened* (opened in them, still open),
-- stillSubmitted* (submitted in them, still awaiting acceptance),
-- accepted* (accepted in them); and submitted (cases submitted in them,
-- for the funnel). The pot (whatever the month) is the Cases tab's.

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
