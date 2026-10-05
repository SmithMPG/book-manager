-- Submitted movable among a product's stages — run once in the SQL
-- editor (schema.sql already has this). Safe to re-run, and safe whether
-- or not stages-after-submitted.sql was ever run.
--
-- Every product's stage list holds a Submitted row (standard =
-- 'submitted') that admins drag among the product's own stages, so a
-- stage can go before or after submission. Opened stays first and
-- Accepted / Not taken up last. Submitted can't be renamed or removed.

alter table product_stages add column if not exists standard text;
alter table product_stages drop constraint if exists product_stages_standard_check;
alter table product_stages add constraint product_stages_standard_check check (standard in ('submitted'));
create unique index if not exists product_stages_one_submitted
  on product_stages(product_id) where standard = 'submitted';

-- Any product without a Submitted gets one at the top of its list, so
-- stages it already has stay after submission (as they were).
insert into product_stages (product_id, label, standard, sort_order)
select p.id, 'Submitted', 'submitted',
       coalesce((select min(s.sort_order) from product_stages s where s.product_id = p.id), 1) - 1
from products p
where not exists (select 1 from product_stages s where s.product_id = p.id and s.standard = 'submitted');

create or replace function _product_gets_submitted() returns trigger as $$
begin
  insert into public.product_stages (product_id, label, standard, sort_order)
  values (new.id, 'Submitted', 'submitted', 0);
  return new;
end;
$$ language plpgsql security definer set search_path = '';

drop trigger if exists product_gets_submitted on products;
create trigger product_gets_submitted after insert on products
  for each row execute function _product_gets_submitted();

-- ...that can be moved but not renamed or removed (except along with its
-- product: by then the product row's already gone). An own stage can't
-- be turned into a standard one either.
create or replace function _standard_stage_guard() returns trigger as $$
begin
  if tg_op = 'DELETE' then
    if old.standard is not null and exists (select 1 from public.products where id = old.product_id) then
      raise exception 'Submitted is a standard stage, so it can''t be removed.';
    end if;
    return old;
  end if;
  if new.standard is distinct from old.standard
     or (old.standard is not null and new.label is distinct from old.label) then
    raise exception 'Submitted is a standard stage, so it can''t be renamed.';
  end if;
  return new;
end;
$$ language plpgsql security definer set search_path = '';

drop trigger if exists standard_stage_guard on product_stages;
create trigger standard_stage_guard before update or delete on product_stages
  for each row execute function _standard_stage_guard();

-- Check (every product should have exactly one):
--   select p.name, count(s.*) from products p
--     left join product_stages s on s.product_id = p.id and s.standard = 'submitted' group by p.name order by p.name;
