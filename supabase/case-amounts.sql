-- Changing an open case's amounts — run once in the SQL editor
-- (schema.sql already has this). Safe to re-run.
--
--   amend_case()   changes an open case's amounts and adds an "Amended"
--                  line to the client's timeline (before → after)
--   trigger        stops anyone changing a closed (accepted or not taken
--                  up) case's lump sum, monthly premium or advice fee

create or replace function _closed_case_amounts_fixed() returns trigger as $$
begin
  if old.stage in ('accepted', 'not-taken-up')
     and (new.lump_sum, new.monthly, new.advice_fee_percent)
         is distinct from (old.lump_sum, old.monthly, old.advice_fee_percent) then
    raise exception 'This case is closed, so its amounts can''t be changed.';
  end if;
  return new;
end;
$$ language plpgsql set search_path = '';

drop trigger if exists closed_case_amounts_fixed on cases;
create trigger closed_case_amounts_fixed before update on cases
  for each row execute function _closed_case_amounts_fixed();

-- Changing an open case's amounts, and its "amended" timeline entry
-- with the before and after, in one statement. The FA's own case (or the
-- super admin's, in the Test Book). Returns {case, activity}.
create or replace function public.amend_case(
  p_case_id uuid, p_lump_sum numeric, p_monthly numeric, p_advice_fee_percent numeric, p_date date)
returns jsonb
language plpgsql security invoker set search_path = ''
as $$
declare was public.cases; c public.cases; a public.activities;
begin
  select * into was from public.cases where id = p_case_id for update;
  if not found or not public.can_act_as(was.fa_id) then
    raise exception 'Case not found.';
  end if;
  if was.stage not in ('opened', 'submitted') then
    raise exception 'This case is closed, so its amounts can''t be changed.';
  end if;
  update public.cases set lump_sum = p_lump_sum, monthly = p_monthly, advice_fee_percent = p_advice_fee_percent
  where id = p_case_id
  returning * into c;
  insert into public.activities (fa_id, client_id, case_id, type, date, details)
  values (c.fa_id, c.client_id, c.id, 'case', p_date, jsonb_build_object(
    'event', 'amended',
    'from', jsonb_build_object('lumpSum', was.lump_sum, 'monthly', was.monthly, 'adviceFeePercent', was.advice_fee_percent),
    'to',   jsonb_build_object('lumpSum', c.lump_sum, 'monthly', c.monthly, 'adviceFeePercent', c.advice_fee_percent)))
  returning * into a;
  return jsonb_build_object('case', to_jsonb(c), 'activity', to_jsonb(a));
end;
$$;

revoke execute on function public.amend_case(uuid, numeric, numeric, numeric, date) from public, anon;
grant execute on function public.amend_case(uuid, numeric, numeric, numeric, date) to authenticated;
