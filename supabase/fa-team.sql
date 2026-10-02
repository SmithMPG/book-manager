-- FA lists — run once in the SQL editor (schema.sql already has all of
-- this; this brings the live database up to date). Safe to re-run.
--
--   users.manager_id  the admin whose FA list each person is on
--   manages()         is the caller that FA's manager?
--   can_act_as()      now also false for anyone resigned
--   set_case_stage()  accepting a case is the manager's alone, and moves
--                     the client to Clients when it's their last open case
--   update_fa()       a manager editing an FA / moving them to Resigned
--
-- Adding FAs from the app is the add-fa Edge Function
-- (supabase/functions/add-fa) — deploy that separately.

alter table users add column if not exists manager_id uuid references users(id) on delete set null;

create or replace function can_act_as(p_fa uuid) returns boolean as $$
  select exists (select 1 from public.users where id = auth.uid() and is_active)
     and (p_fa = auth.uid()
      or (exists (select 1 from public.users where id = auth.uid() and is_super_admin)
          and exists (select 1 from public.users where id = p_fa and branch = 'Test group')));
$$ language sql security definer stable set search_path = '';

create or replace function manages(p_fa uuid) returns boolean as $$
  select exists (select 1 from public.users me where me.id = auth.uid() and me.is_admin and me.is_active)
     and (exists (select 1 from public.users where id = p_fa and manager_id = auth.uid())
          or (exists (select 1 from public.users where id = auth.uid() and is_super_admin)
              and exists (select 1 from public.users where id = p_fa and branch = 'Test group')));
$$ language sql security definer stable set search_path = '';

create or replace function public.set_case_stage(p_case_id uuid, p_stage text, p_date date)
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

  update public.cases set
    stage        = p_stage,
    submitted_at = case when p_stage = 'submitted' then p_date else submitted_at end,
    accepted_at  = case when p_stage = 'accepted' then p_date else accepted_at end
  where id = p_case_id
  returning * into c;
  v_details := jsonb_build_object('event', p_stage);
  if p_stage = 'accepted' then
    v_details := v_details || jsonb_build_object('acceptedBy', auth.uid());
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

-- Everyone on the team reports to Ameeth; the Test Book is on Matthew's
-- list (the super admin), so accepting can be tried there.
update users set manager_id = (select id from users where email = 'ameeth.maharaj@liblink.co.za')
  where email <> 'ameeth.maharaj@liblink.co.za' and coalesce(branch, '') <> 'Test group' and manager_id is null;
update users set manager_id = (select id from users where email = 'matthew.smith@liblink.co.za')
  where branch = 'Test group';

-- Check:
--   select u.name, u.surname, m.name as manager from users u left join users m on m.id = u.manager_id order by u.surname;
