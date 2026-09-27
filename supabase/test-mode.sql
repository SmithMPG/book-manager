-- Test mode — run ONCE in the SQL editor, then delete this file
-- (schema.sql already describes the result).
--
-- Only the super admin (users.is_super_admin — Matthew) gets Test mode;
-- admins get My book / Admin, FAs no toggle.
--
-- Before running: in Authentication -> Users, Add user -> Create new
-- user: test@bookmanager.co.za, any password, Auto Confirm ticked.
-- Nobody signs in with it; it just owns the Test Book.

-- 1. The Test Book: a users row in 'Test group' (left out of the
--    leaderboard and team figures).
insert into users (id, email, name, surname, is_admin, branch, pcr_target, password_set)
select id, 'test@bookmanager.co.za', 'Test', 'Book', false, 'Test group', 400000, true
from auth.users where email = 'test@bookmanager.co.za'
on conflict (id) do update set branch = 'Test group', name = 'Test', surname = 'Book';

-- 2. The super admin, who alone may write to the Test Book (besides
--    everyone writing their own).
alter table users add column is_super_admin boolean not null default false;
update users set is_super_admin = true, is_admin = true where email = 'matthew.smith@liblink.co.za';

create or replace function can_act_as(p_fa uuid) returns boolean as $$
  select p_fa = auth.uid()
      or (exists (select 1 from public.users where id = auth.uid() and is_super_admin)
          and exists (select 1 from public.users where id = p_fa and branch = 'Test group'));
$$ language sql security definer stable set search_path = '';

do $$
declare t text;
begin
  foreach t in array array['clients','cases','activities']
  loop
    execute format('drop policy "%1$s insert own" on %1$s;', t);
    execute format('drop policy "%1$s update own" on %1$s;', t);
    execute format('drop policy "%1$s delete own" on %1$s;', t);
    execute format('create policy "%1$s insert own" on %1$s for insert with check (can_act_as(fa_id));', t);
    execute format('create policy "%1$s update own" on %1$s for update using (can_act_as(fa_id));', t);
    execute format('create policy "%1$s delete own" on %1$s for delete using (can_act_as(fa_id));', t);
  end loop;
end $$;

-- 3. Leaderboard: can include the Test Book's figures when asked.
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
    where u.is_active and (coalesce(u.branch, '') <> 'Test group' or u.id = p_include)
  ) t;
$$;

revoke execute on function public.leaderboard(date[], date, uuid) from public, anon;
grant execute on function public.leaderboard(date[], date, uuid) to authenticated;

-- 4. Opening a case / changing its stage: for the case's own FA.
create or replace function public.open_case(
  p_client_id uuid, p_case_type text, p_lump_sum numeric, p_monthly numeric,
  p_advice_fee_percent numeric, p_date date)
returns jsonb
language plpgsql security invoker set search_path = ''
as $$
declare c public.cases; a public.activities; v_fa uuid;
begin
  select fa_id into v_fa from public.clients where id = p_client_id;
  if v_fa is null or not public.can_act_as(v_fa) then
    raise exception 'Client not found.';
  end if;
  insert into public.cases (client_id, fa_id, case_type, stage, opened_at, lump_sum, monthly, advice_fee_percent)
  values (p_client_id, v_fa, p_case_type, 'opened', p_date, p_lump_sum, p_monthly, p_advice_fee_percent)
  returning * into c;
  insert into public.activities (fa_id, client_id, case_id, type, date, details)
  values (v_fa, p_client_id, c.id, 'case', p_date, jsonb_build_object('event', 'opened'))
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
  select * into c from public.cases where id = p_case_id for update;
  if not found or not public.can_act_as(c.fa_id) then
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
  values (c.fa_id, c.client_id, c.id, 'case', p_date, jsonb_build_object('event', p_stage))
  returning * into a;
  return jsonb_build_object('case', to_jsonb(c), 'activity', to_jsonb(a));
end;
$$;


-- Checks: one row, Test Book, branch 'Test group'; and you as super admin.
--   select name, surname, branch from users where branch = 'Test group';
--   select name, is_admin, is_super_admin from users where is_admin;
