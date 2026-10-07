-- One set of stages for every case — run once in the SQL editor
-- (schema.sql already has this). Safe to re-run, whether or not
-- submitted-movable.sql was ever run.
--
-- Every case goes Opened → Submitted → Accepted (admins) or Not taken up
-- (FAs); products have just a checklist. This takes out the per-product
-- stages: the product_stages table (and the movable Submitted in it),
-- the stage a case was at (cases.stage_id), and the stages saved on
-- closed cases. Checklists, and the ticks on cases, are untouched.

drop trigger if exists product_gets_submitted on products;
drop function if exists _product_gets_submitted();
alter table cases drop column if exists stage_id;
drop table if exists product_stages cascade;   -- its triggers go with it
drop function if exists _standard_stage_guard();

-- A product can't be deleted while an open case uses it (no stages to
-- check any more).
create or replace function _product_in_use_check() returns trigger as $$
declare n int;
begin
  select count(*) into n from public.cases where product_id = old.id and stage in ('opened', 'submitted');
  if n > 0 then
    raise exception '% has % open case%. Close them before deleting it.', old.name, n, case when n = 1 then '' else 's' end;
  end if;
  return old;
end;
$$ language plpgsql security definer set search_path = '';

-- Closing a case saves its checklist (no stages).
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
    accepted_at  = case when p_stage = 'accepted' then p_date else accepted_at end,
    -- Closing: keep the product's checklist as it is now.
    closed_snapshot = case when p_stage in ('accepted', 'not-taken-up') then jsonb_build_object(
      'checklist', coalesce((select jsonb_agg(jsonb_build_object('key', i.key, 'label', i.label) order by i.sort_order)
                             from public.product_checklist_items i where i.product_id = c.product_id), '[]'::jsonb)
    ) else closed_snapshot end
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

update cases set closed_snapshot = closed_snapshot - 'stages' where closed_snapshot ? 'stages';

-- Check (should be no rows):
--   select table_name from information_schema.tables where table_name = 'product_stages';
