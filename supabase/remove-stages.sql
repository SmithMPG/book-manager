-- One set of stages for every case — run once in the SQL editor
-- (schema.sql already has this). Safe to re-run, whether or not
-- submitted-movable.sql was ever run.
--
-- Every case goes Opened → Submitted → Accepted (admins) or Not taken up
-- (FAs); products have just a checklist. This takes out the per-product
-- stages: the product_stages table (and the movable Submitted in it),
-- and the stage a case was at (cases.stage_id). Checklists, and the
-- ticks on cases, are untouched.
--
-- Run final-pcr.sql straight after: it replaces set_case_stage, which
-- still mentions the stages until then.

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

-- Check (should be no rows):
--   select table_name from information_schema.tables where table_name = 'product_stages';
