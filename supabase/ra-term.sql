-- RA term and Liberty RA — run once in the SQL editor (schema.sql
-- already has this). Safe to re-run. Then reload the app.
--
--   liberty-ra       a fourth product type: PCR = annual premium x 5
--                    (its term is always 5); RA Liberty becomes one.
--   cases.term       RA Builder cases record their term (years); PCR =
--                    annual premium x term, capped at 15 (none = 15).
--   open_case() / amend_case()   take the term
--   leaderboard()    RA Builder's PCR by term

alter table products drop constraint if exists products_type_check;
alter table products add constraint products_type_check
  check (type in ('risk', 'ra-builder', 'liberty-ra', 'investment'));
alter table cases drop constraint if exists cases_product_type_check;
alter table cases add constraint cases_product_type_check
  check (product_type in ('risk', 'ra-builder', 'liberty-ra', 'investment'));

alter table cases add column if not exists term int;
alter table cases drop constraint if exists cases_term_check;
alter table cases add constraint cases_term_check check (term is null or term between 1 and 60);

-- RA Liberty is a Liberty RA (its open cases follow — the product trigger).
update products set type = 'liberty-ra' where name = 'RA Liberty' and type <> 'liberty-ra';

create or replace function _closed_case_amounts_fixed() returns trigger as $$
begin
  if old.stage in ('accepted', 'not-taken-up')
     and (new.lump_sum, new.monthly, new.advice_fee_percent, new.term)
         is distinct from (old.lump_sum, old.monthly, old.advice_fee_percent, old.term) then
    raise exception 'This case is closed, so its amounts can''t be changed.';
  end if;
  return new;
end;
$$ language plpgsql set search_path = '';

drop function if exists public.open_case(uuid, text, numeric, numeric, numeric, date);
drop function if exists public.open_case(uuid, uuid, numeric, numeric, numeric, date);
create or replace function public.open_case(
  p_client_id uuid, p_product_id uuid, p_lump_sum numeric, p_monthly numeric,
  p_advice_fee_percent numeric, p_date date, p_term int default null)
returns jsonb
language plpgsql security invoker set search_path = ''
as $$
declare c public.cases; a public.activities; v_fa uuid; p public.products;
begin
  select fa_id into v_fa from public.clients where id = p_client_id;
  if v_fa is null or not public.can_act_as(v_fa) then
    raise exception 'Client not found.';
  end if;
  select * into p from public.products where id = p_product_id;
  if not found then
    raise exception 'That product no longer exists.';
  end if;
  insert into public.cases (client_id, fa_id, product_id, product_type, case_type, stage, opened_at,
                            lump_sum, monthly, advice_fee_percent, term)
  values (p_client_id, v_fa, p.id, p.type, p.name, 'opened', p_date,
          p_lump_sum, p_monthly, p_advice_fee_percent, case when p.type = 'ra-builder' then p_term end)
  returning * into c;
  insert into public.activities (fa_id, client_id, case_id, type, date, details)
  values (v_fa, p_client_id, c.id, 'case', p_date, jsonb_build_object('event', 'opened'))
  returning * into a;
  return jsonb_build_object('case', to_jsonb(c), 'activity', to_jsonb(a));
end;
$$;

drop function if exists public.amend_case(uuid, numeric, numeric, numeric, date);
create or replace function public.amend_case(
  p_case_id uuid, p_lump_sum numeric, p_monthly numeric, p_advice_fee_percent numeric, p_date date,
  p_term int default null)
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
  update public.cases set lump_sum = p_lump_sum, monthly = p_monthly, advice_fee_percent = p_advice_fee_percent,
    term = case when was.product_type = 'ra-builder' then p_term else term end
  where id = p_case_id
  returning * into c;
  insert into public.activities (fa_id, client_id, case_id, type, date, details)
  values (c.fa_id, c.client_id, c.id, 'case', p_date, jsonb_build_object(
    'event', 'amended',
    'from', jsonb_build_object('lumpSum', was.lump_sum, 'monthly', was.monthly, 'adviceFeePercent', was.advice_fee_percent, 'term', was.term),
    'to',   jsonb_build_object('lumpSum', c.lump_sum, 'monthly', c.monthly, 'adviceFeePercent', c.advice_fee_percent, 'term', c.term)))
  returning * into a;
  return jsonb_build_object('case', to_jsonb(c), 'activity', to_jsonb(a));
end;
$$;

revoke execute on function public.amend_case(uuid, numeric, numeric, numeric, date, int) from public, anon;
grant execute on function public.amend_case(uuid, numeric, numeric, numeric, date, int) to authenticated;

revoke execute on function public.open_case(uuid, uuid, numeric, numeric, numeric, date, int) from public, anon;
grant execute on function public.open_case(uuid, uuid, numeric, numeric, numeric, date, int) to authenticated;

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
          'productType', x.product_type, 'term', x.term, 'submitted', x.submitted,
          'submittedLumpSum', x.submitted_lump_sum, 'submittedMonthly', x.submitted_monthly,
          'acceptedLumpSum', x.accepted_lump_sum, 'acceptedMonthly', x.accepted_monthly,
          'acceptedFinalPcr', x.accepted_final_pcr,
          'openLumpSum', x.open_lump_sum, 'openMonthly', x.open_monthly)), '[]'::jsonb)
        from (
          -- Grouped by product type — and, for RA Builder, by the term its
          -- PCR goes by (capped at 15; none = 15), so each group's PCR is
          -- worked out from its sums.
          select c.product_type,
            case when c.product_type = 'ra-builder' then least(coalesce(c.term, 15), 15) end as term,
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
            coalesce(sum(c.monthly)  filter (where c.stage = 'accepted' and c.accepted_at = any(p_dates) and c.final_pcr is null), 0) as accepted_monthly,
            -- Open case PCR's: cases opened but not yet submitted, right
            -- now (not tied to the days asked for).
            coalesce(sum(c.lump_sum) filter (where c.stage = 'opened'), 0) as open_lump_sum,
            coalesce(sum(c.monthly)  filter (where c.stage = 'opened'), 0) as open_monthly
          from public.cases c where c.fa_id = u.id
          group by 1, 2
        ) x) as cases,
      -- Did they do anything on p_checkout_date (the last weekday — the
      -- ✓ / ✗ beside their name)? Anything logged for that day counts —
      -- a contact, note, meeting, case change, prospects contacted… —
      -- except the Review itself (a 'checkout' row).
      case when p_checkout_date is null then null
        else exists (select 1 from public.activities a
          where a.fa_id = u.id and a.type <> 'checkout' and a.date = p_checkout_date)
      end as "hadActivity"
    from public.users u
    where u.is_active and u.on_leaderboard and (coalesce(u.branch, '') <> 'Test group' or u.id = p_include)
  ) t;
$$;

revoke execute on function public.leaderboard(date[], date, uuid) from public, anon;
grant execute on function public.leaderboard(date[], date, uuid) to authenticated;
