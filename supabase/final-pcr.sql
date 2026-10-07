-- Final PCR on accepting — run once in the SQL editor (schema.sql
-- already has this). Safe to re-run. Then reload the app.
--
--   cases.final_pcr   what the manager accepted the case at (the app
--                     offers the PCR worked out from its premiums, which
--                     they can change). Accepted PCR counts this.
--   set_case_stage()  accepting now takes the final PCR
--   leaderboard()     Accepted PCR's use it
--   closed_snapshot   goes: a closed case keeps just its product, its
--                     premiums and its PCRs (all on the case itself)

alter table cases add column if not exists final_pcr numeric;
alter table cases drop constraint if exists cases_final_pcr_check;
alter table cases add constraint cases_final_pcr_check check (final_pcr is null or final_pcr >= 0);
alter table cases drop column if exists closed_snapshot;

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

revoke execute on function public.set_case_stage(uuid, text, date, numeric) from public, anon;
grant execute on function public.set_case_stage(uuid, text, date, numeric) to authenticated;

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
          'acceptedLumpSum', x.accepted_lump_sum, 'acceptedMonthly', x.accepted_monthly,
          'acceptedFinalPcr', x.accepted_final_pcr)), '[]'::jsonb)
        from (
          select c.product_type,
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
            coalesce(sum(c.monthly)  filter (where c.stage = 'accepted' and c.accepted_at = any(p_dates) and c.final_pcr is null), 0) as accepted_monthly
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
