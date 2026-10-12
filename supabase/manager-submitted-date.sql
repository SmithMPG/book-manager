-- A manager moving a submitted date before the opened date moves the
-- opened date back with it — run once in the SQL editor (schema.sql
-- already has this). Safe to re-run. (Builds on date-changes.sql, already run.)

-- A case line, and the case's own date with it: an "opened" line moves
-- opened_at, a "submitted" line submitted_at, an "accepted" line
-- accepted_at (the amended / not-taken-up lines are only the line). The
-- dates stay in order — opened, then submitted, then accepted, the
-- other lines no earlier than opened. The FA (their own case) or their
-- manager; an accepted line only the manager (as accepting is). When the
-- manager moves a submitted date before the opened date, the opened date
-- moves back to it too (its line as well, noted the same way) — an FA
-- is told no instead. Returns {case, activity, log}.
drop function if exists public.set_case_event_date(uuid, date);
create or replace function public.set_case_event_date(p_activity_id uuid, p_date date, p_today date)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare a public.activities; c public.cases; v_event text; v_from date; v_log public.activities;
        v_manager boolean; v_opened public.activities;
begin
  select * into a from public.activities where id = p_activity_id and type = 'case' for update;
  if not found then
    raise exception 'Entry not found.';
  end if;
  select * into c from public.cases where id = a.case_id for update;
  v_event := a.details->>'event';
  if v_event = 'accepted' then
    if not public.manages(c.fa_id) then
      raise exception 'Only the FA''s manager can change when a case was accepted.';
    end if;
  elsif not (public.can_act_as(c.fa_id) or public.manages(c.fa_id)) then
    raise exception 'Entry not found.';
  end if;
  perform public._check_new_date(p_date, p_today);
  if p_date = a.date then
    return jsonb_build_object('case', to_jsonb(c), 'activity', to_jsonb(a), 'log', null);
  end if;
  -- The manager (not the FA themselves) moving submitted before opened:
  -- opened moves back with it.
  v_manager := public.manages(c.fa_id) and not public.can_act_as(c.fa_id);
  if v_event = 'submitted' and v_manager and p_date < c.opened_at then
    select * into v_opened from public.activities
    where case_id = c.id and type = 'case' and details->>'event' = 'opened'
    order by created_at desc limit 1 for update;
    if found then
      v_from := v_opened.date;
      update public.activities set date = p_date where id = v_opened.id returning * into v_opened;
      perform public._log_date_change(v_opened, v_from, p_date, p_today, c.case_type);
    end if;
    update public.cases set opened_at = p_date where id = c.id returning * into c;
  end if;
  if v_event = 'opened' and (p_date > c.submitted_at or p_date > c.accepted_at) then
    raise exception 'A case can''t be opened after it was submitted or accepted.';
  elsif v_event = 'submitted' and (p_date < c.opened_at or p_date > c.accepted_at) then
    raise exception 'A case is submitted after it''s opened and before it''s accepted.';
  elsif v_event = 'accepted' and p_date < coalesce(c.submitted_at, c.opened_at) then
    raise exception 'A case can''t be accepted before it was submitted.';
  elsif v_event not in ('opened', 'submitted', 'accepted') and p_date < c.opened_at then
    raise exception 'That''s before the case was opened.';
  end if;

  v_from := a.date;
  update public.cases set
    opened_at    = case when v_event = 'opened' then p_date else opened_at end,
    submitted_at = case when v_event = 'submitted' then p_date else submitted_at end,
    accepted_at  = case when v_event = 'accepted' then p_date else accepted_at end
  where id = c.id
  returning * into c;
  update public.activities set date = p_date where id = a.id returning * into a;
  v_log := public._log_date_change(a, v_from, p_date, p_today, c.case_type);
  return jsonb_build_object('case', to_jsonb(c), 'activity', to_jsonb(a), 'log', to_jsonb(v_log));
end;
$$;

revoke execute on function public.set_case_event_date(uuid, date, date) from public, anon;
grant execute on function public.set_case_event_date(uuid, date, date) to authenticated;
