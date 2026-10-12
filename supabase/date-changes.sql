-- Date changes noted on the timeline — run once in the SQL editor
-- (schema.sql already has this). Safe to re-run, whether or not
-- case-event-date.sql was ever run. Then reload the app.
--
--   activities.type   gains 'date_change': a date changed, noted on the
--                     client's timeline the day it was done
--   set_activity_date()                       an entry's date, noted
--   set_case_event_date() / set_case_date()   a case's dates, noted
--   leaderboard()     a date change isn't activity (the ✓ / ✗)

alter table activities drop constraint if exists activities_type_check;
alter table activities add constraint activities_type_check
  check (type in ('contact', 'note', 'meeting', 'fna', 'quote', 'wills_lead', 'referral', 'case',
                  'date_change', 'prospect_contact', 'checkout'));

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
-- manager; an accepted line only the manager (as accepting is). Returns
-- {case, activity, log}.
drop function if exists public.set_case_event_date(uuid, date);
create or replace function public.set_case_event_date(p_activity_id uuid, p_date date, p_today date)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare a public.activities; c public.cases; v_event text; v_from date; v_log public.activities;
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
