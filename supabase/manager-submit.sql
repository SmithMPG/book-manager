-- Managers can mark their FAs' cases submitted (the Cases tab) — run
-- once in the SQL editor (schema.sql already has this). Safe to re-run.
-- The submitted line notes who did it when it wasn't the FA
-- (submittedBy, submittedByName).

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
  elsif p_stage = 'submitted' then
    if not (public.can_act_as(c.fa_id) or public.manages(c.fa_id)) then
      raise exception 'Case not found.';
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
  if p_stage = 'submitted' and auth.uid() <> c.fa_id then
    v_details := v_details || jsonb_build_object('submittedBy', auth.uid(),
      'submittedByName', (select name || ' ' || surname from public.users where id = auth.uid()));
  end if;
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
