-- The Calendar — run once in the SQL editor (schema.sql already has
-- this). Safe to re-run.
--
-- months holds each month's close-off date and the team's weekly
-- submission target, set by admins under ☰ → Calendar. The month bar
-- and every "this month" figure read from it, instead of the close-off
-- dates written into the app (constants.js) — loaded in below.
--
-- Run it, then reload the app: the new app reads its months from here.

create table if not exists months (
  month           date primary key check (extract(day from month) = 1),
  close_off_date  date unique,
  weekly_target   bigint check (weekly_target is null or weekly_target >= 0),
  updated_at      timestamptz not null default now()
);

create or replace function _months_in_order() returns trigger as $$
begin
  new.updated_at := now();
  if new.close_off_date is null then return new; end if;
  if exists (select 1 from public.months where month < new.month and close_off_date >= new.close_off_date) then
    raise exception 'The close-off date has to be after the previous month''s.';
  end if;
  if exists (select 1 from public.months where month > new.month and close_off_date <= new.close_off_date) then
    raise exception 'The close-off date has to be before the next month''s.';
  end if;
  return new;
end;
$$ language plpgsql set search_path = '';

drop trigger if exists months_in_order on months;
create trigger months_in_order before insert or update on months
  for each row execute function _months_in_order();

alter table months enable row level security;
drop policy if exists "months read" on months;
drop policy if exists "months admin insert" on months;
drop policy if exists "months admin update" on months;
drop policy if exists "months admin delete" on months;
create policy "months read" on months for select to authenticated using (true);
create policy "months admin insert" on months for insert with check (is_admin());
create policy "months admin update" on months for update using (is_admin());
create policy "months admin delete" on months for delete using (is_admin());
grant select, insert, update, delete on months to authenticated, service_role;

-- The close-off dates the app had written in. December 2025's only marks
-- where January 2026 starts.
insert into months (month, close_off_date) values
  ('2025-12-01', '2026-01-09'),
  ('2026-01-01', '2026-02-06'),
  ('2026-02-01', '2026-03-06'),
  ('2026-03-01', '2026-04-10'),
  ('2026-04-01', '2026-05-08'),
  ('2026-05-01', '2026-06-05'),
  ('2026-06-01', '2026-07-03'),
  ('2026-07-01', '2026-08-07'),
  ('2026-08-01', '2026-09-04'),
  ('2026-09-01', '2026-10-02'),
  ('2026-10-01', '2026-11-06'),
  ('2026-11-01', '2026-12-04'),
  ('2026-12-01', '2027-01-08'),
  ('2027-01-01', '2027-02-05')
on conflict (month) do nothing;

-- Check:
--   select month, close_off_date, weekly_target from months order by month;
