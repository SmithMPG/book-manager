-- Going live with real data — run once in the SQL editor, after schema.sql
-- and fa-list.sql.

-- ---------------------------------------------------------------------
-- 1. Purge test data. Fake FAs from the old seed-test-data.js script had
--    @test.invalid logins and branch 'Test group'; deleting the login
--    cascades to their users row and every client/case/activity under it.
-- ---------------------------------------------------------------------
delete from auth.users where email like '%@test.invalid';
delete from users where branch = 'Test group';

-- ---------------------------------------------------------------------
-- 2. Referrals as dated activities. clients.referrals is the running
--    count shown on the card; a 'referral' activity alongside each +1 is
--    what lets the dashboard count "referrals this month".
--    prospect_contact rows now carry a count — one row per channel per
--    checkout ({channel, count}), not one row per person contacted.
-- ---------------------------------------------------------------------
alter table activities drop constraint activities_type_check;
alter table activities add constraint activities_type_check
  check (type in ('meeting', 'fna', 'quote', 'wills_lead', 'status', 'prospect_contact', 'checkout', 'referral'));

-- ---------------------------------------------------------------------
-- 3. Leaderboard. RLS rightly stops an FA reading anyone else's rows, but
--    the leaderboard needs everyone's totals. This returns totals only —
--    counts and summed amounts per FA for one business month, never an
--    individual client, case or activity. PCR is worked out in the app
--    (casePcr in constants.js) from the per-case-type sums, so its rules
--    live in one place.
-- ---------------------------------------------------------------------
create or replace function public.leaderboard(p_start date, p_end date)
returns jsonb
language sql stable security definer set search_path = ''
as $$
  select coalesce(jsonb_agg(to_jsonb(t) order by t.name), '[]'::jsonb)
  from (
    select
      u.id,
      u.name || ' ' || u.surname as name,
      coalesce((select sum(coalesce((a.details->>'count')::int, 1)) from public.activities a
        where a.fa_id = u.id and a.type = 'prospect_contact' and a.date between p_start and p_end), 0) as prospects,
      (select count(*) from public.activities a
        where a.fa_id = u.id and a.type = 'referral' and a.date between p_start and p_end) as referrals,
      (select count(*) from public.activities a
        where a.fa_id = u.id and a.type = 'wills_lead' and a.date between p_start and p_end) as "willsLeads",
      (select count(*) from public.activities a
        where a.fa_id = u.id and a.type = 'fna' and a.date between p_start and p_end) as fnas,
      (select count(*) from public.activities a
        where a.fa_id = u.id and a.type = 'quote' and a.date between p_start and p_end) as quotes,
      (select jsonb_build_object(
          'factFinder', count(*) filter (where a.details->>'meetingType' = 'factFinder'),
          'closing',    count(*) filter (where a.details->>'meetingType' = 'closing'),
          'relational', count(*) filter (where a.details->>'meetingType' = 'relational'))
        from public.activities a
        where a.fa_id = u.id and a.type = 'meeting' and a.date between p_start and p_end) as meetings,
      (select coalesce(jsonb_agg(jsonb_build_object(
          'type', x.case_type, 'submitted', x.submitted,
          'acceptedLumpSum', x.accepted_lump_sum, 'acceptedMonthly', x.accepted_monthly)), '[]'::jsonb)
        from (
          select c.case_type,
            count(*) filter (where c.initiated_date between p_start and p_end) as submitted,
            coalesce(sum(c.lump_sum) filter (where c.status = 'accepted' and c.accepted_at between p_start and p_end), 0) as accepted_lump_sum,
            coalesce(sum(c.monthly)  filter (where c.status = 'accepted' and c.accepted_at between p_start and p_end), 0) as accepted_monthly
          from public.cases c where c.fa_id = u.id
          group by c.case_type
        ) x) as cases
    from public.users u
    where u.is_active and coalesce(u.branch, '') <> 'Test group'
  ) t;
$$;

revoke execute on function public.leaderboard(date, date) from public, anon;
grant execute on function public.leaderboard(date, date) to authenticated;

-- Check: should be 0 test users left, and your real FAs listed.
--   select count(*) from auth.users where email like '%@test.invalid';
--   select public.leaderboard('2026-09-01', '2026-09-30');
