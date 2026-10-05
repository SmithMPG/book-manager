-- Submitted fixed after Opened — run once in the SQL editor (schema.sql
-- already has this). Safe to re-run.
--
-- Every case goes Opened → Submitted → (its product's own stages) →
-- Accepted / Not taken up, so Submitted no longer needs a movable row in
-- each product's stage list. This takes out what product-submitted.sql
-- added: the Submitted rows, the column marking them, and the two
-- triggers that kept them in place. The products' own stages stay.

drop trigger if exists standard_stage_guard on product_stages;
drop function if exists _standard_stage_guard();
drop trigger if exists product_gets_submitted on products;
drop function if exists _product_gets_submitted();

delete from product_stages where standard = 'submitted';
drop index if exists product_stages_one_submitted;
alter table product_stages drop column if exists standard;

-- Check (every product should show 0 unless an admin has added stages):
--   select p.name, count(s.*) from products p
--     left join product_stages s on s.product_id = p.id group by p.name order by p.name;
