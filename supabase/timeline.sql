-- Stage 1 of the client timeline — run ONCE in the SQL editor, then
-- delete this file (schema.sql already describes the result).
--
-- Clears every case (test data only — nothing is converted), moves cases
-- to stages + a checklist, adds contact / note / case timeline entries,
-- and replaces add_case_status with open_case and set_case_stage.

-- 1. Cases: start clean, stages instead of status logs.
delete from cases;
drop function if exists public.add_case_status(uuid, text, text, date);
alter table cases drop column case_statuses;
alter table cases drop constraint cases_status_check;
alter table cases rename column status to stage;
alter table cases alter column stage set default 'opened';
alter table cases add constraint cases_stage_check
  check (stage in ('opened', 'submitted', 'accepted', 'not-taken-up'));
alter table cases rename column initiated_date to opened_at;
alter table cases add column submitted_at date;
alter table cases add column checklist jsonb not null default '{}'::jsonb;
alter index cases_status_idx rename to cases_stage_idx;

-- 2. Timeline entry types.
alter table activities drop constraint activities_type_check;
alter table activities add constraint activities_type_check
  check (type in ('contact', 'note', 'meeting', 'fna', 'quote', 'wills_lead', 'referral', 'case',
                  'prospect_contact', 'checkout'));
alter table activities add constraint activities_case_entry_has_case
  check (type <> 'case' or case_id is not null);

-- 3. Leaderboard: cases submitted / accepted come from the stages;
--    referrals and wills leads also from meetings.
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
          'type', x.case_type, 'submitted', x.submitted,
          'acceptedLumpSum', x.accepted_lump_sum, 'acceptedMonthly', x.accepted_monthly)), '[]'::jsonb)
        from (
          select c.case_type,
            count(*) filter (where c.submitted_at = any(p_dates)) as submitted,
            coalesce(sum(c.lump_sum) filter (where c.stage = 'accepted' and c.accepted_at = any(p_dates)), 0) as accepted_lump_sum,
            coalesce(sum(c.monthly)  filter (where c.stage = 'accepted' and c.accepted_at = any(p_dates)), 0) as accepted_monthly
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

-- 4. Opening a case and changing its stage.
create or replace function public.open_case(
  p_client_id uuid, p_case_type text, p_lump_sum numeric, p_monthly numeric,
  p_advice_fee_percent numeric, p_date date)
returns jsonb
language plpgsql security invoker set search_path = ''
as $$
declare c public.cases; a public.activities;
begin
  insert into public.cases (client_id, fa_id, case_type, stage, opened_at, lump_sum, monthly, advice_fee_percent)
  values (p_client_id, auth.uid(), p_case_type, 'opened', p_date, p_lump_sum, p_monthly, p_advice_fee_percent)
  returning * into c;
  insert into public.activities (fa_id, client_id, case_id, type, date, details)
  values (auth.uid(), p_client_id, c.id, 'case', p_date, jsonb_build_object('event', 'opened'))
  returning * into a;
  return jsonb_build_object('case', to_jsonb(c), 'activity', to_jsonb(a));
end;
$$;

create or replace function public.set_case_stage(p_case_id uuid, p_stage text, p_date date)
returns jsonb
language plpgsql security invoker set search_path = ''
as $$
declare c public.cases; a public.activities;
begin
  select * into c from public.cases where id = p_case_id and fa_id = auth.uid() for update;
  if not found then
    raise exception 'Case not found.';
  end if;
  if not ((c.stage = 'opened' and p_stage in ('submitted', 'not-taken-up'))
       or (c.stage = 'submitted' and p_stage in ('accepted', 'not-taken-up'))) then
    raise exception 'A case that is % can''t be marked %.', c.stage, p_stage;
  end if;

  update public.cases set
    stage        = p_stage,
    submitted_at = case when p_stage = 'submitted' then p_date else submitted_at end,
    accepted_at  = case when p_stage = 'accepted' then p_date else accepted_at end
  where id = p_case_id
  returning * into c;
  insert into public.activities (fa_id, client_id, case_id, type, date, details)
  values (auth.uid(), c.client_id, c.id, 'case', p_date, jsonb_build_object('event', p_stage))
  returning * into a;
  return jsonb_build_object('case', to_jsonb(c), 'activity', to_jsonb(a));
end;
$$;

revoke execute on function public.open_case(uuid, text, numeric, numeric, numeric, date) from public, anon;
grant execute on function public.open_case(uuid, text, numeric, numeric, numeric, date) to authenticated;
revoke execute on function public.set_case_stage(uuid, text, date) from public, anon;
grant execute on function public.set_case_stage(uuid, text, date) to authenticated;
