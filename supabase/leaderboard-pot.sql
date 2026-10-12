-- The leaderboard's Pot PCR and Month PCR views — run once in the SQL
-- editor (schema.sql already has this). Safe to re-run (also over an
-- earlier version of this file). leaderboard() also returns, per FA:
--   the pot right now      openCount; awaiting acceptance: pending*
--   the days asked for     where each case is now — opened* (opened in
--                          them, still open), stillSubmitted* (submitted
--                          in them, still awaiting acceptance),
--                          acceptedCount
--   accepted this year     ytd*

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
          'openLumpSum', x.open_lump_sum, 'openMonthly', x.open_monthly, 'openCount', x.open_count,
          'pendingLumpSum', x.pending_lump_sum, 'pendingMonthly', x.pending_monthly, 'pendingCount', x.pending_count,
          'acceptedCount', x.accepted_count,
          'openedLumpSum', x.opened_lump_sum, 'openedMonthly', x.opened_monthly, 'openedCount', x.opened_count,
          'stillSubmittedLumpSum', x.still_submitted_lump_sum, 'stillSubmittedMonthly', x.still_submitted_monthly,
          'stillSubmittedCount', x.still_submitted_count,
          'ytdFinalPcr', x.ytd_final_pcr, 'ytdLumpSum', x.ytd_lump_sum, 'ytdMonthly', x.ytd_monthly, 'ytdCount', x.ytd_count)), '[]'::jsonb)
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
            coalesce(sum(c.monthly)  filter (where c.stage = 'opened'), 0) as open_monthly,
            count(*) filter (where c.stage = 'opened') as open_count,
            -- Awaiting acceptance: submitted, not yet accepted — right now,
            -- from any month. With the open ones, the pot.
            coalesce(sum(c.lump_sum) filter (where c.stage = 'submitted'), 0) as pending_lump_sum,
            coalesce(sum(c.monthly)  filter (where c.stage = 'submitted'), 0) as pending_monthly,
            count(*) filter (where c.stage = 'submitted') as pending_count,
            count(*) filter (where c.stage = 'accepted' and c.accepted_at = any(p_dates)) as accepted_count,
            -- The leaderboard's month view counts each case once, where it
            -- is now: opened on these days and still open; submitted on
            -- these days and still awaiting acceptance (accepted: above).
            coalesce(sum(c.lump_sum) filter (where c.stage = 'opened' and c.opened_at = any(p_dates)), 0) as opened_lump_sum,
            coalesce(sum(c.monthly)  filter (where c.stage = 'opened' and c.opened_at = any(p_dates)), 0) as opened_monthly,
            count(*) filter (where c.stage = 'opened' and c.opened_at = any(p_dates)) as opened_count,
            coalesce(sum(c.lump_sum) filter (where c.stage = 'submitted' and c.submitted_at = any(p_dates)), 0) as still_submitted_lump_sum,
            coalesce(sum(c.monthly)  filter (where c.stage = 'submitted' and c.submitted_at = any(p_dates)), 0) as still_submitted_monthly,
            count(*) filter (where c.stage = 'submitted' and c.submitted_at = any(p_dates)) as still_submitted_count,
            -- Accepted this calendar year (from 1 January): as Accepted
            -- PCR above, for the Pot view.
            coalesce(sum(c.final_pcr) filter (where c.stage = 'accepted' and c.accepted_at >= date_trunc('year', current_date)::date), 0) as ytd_final_pcr,
            coalesce(sum(c.lump_sum) filter (where c.stage = 'accepted' and c.accepted_at >= date_trunc('year', current_date)::date and c.final_pcr is null), 0) as ytd_lump_sum,
            coalesce(sum(c.monthly)  filter (where c.stage = 'accepted' and c.accepted_at >= date_trunc('year', current_date)::date and c.final_pcr is null), 0) as ytd_monthly,
            count(*) filter (where c.stage = 'accepted' and c.accepted_at >= date_trunc('year', current_date)::date) as ytd_count
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
