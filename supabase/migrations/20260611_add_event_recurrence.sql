-- Adds optional recurrence to events (a raw RFC 5545 RRULE string, built
-- server- and client-side from a constrained "Repeats" picker, never free
-- text) and re-creates update_event() with a p_recurrence parameter. The
-- ownership check added in 20260610 is preserved — this must not reopen the
-- Risk 1 authorization hole.
--
-- Recurrence model (v1): a single VEVENT carries an RRULE; calendar clients
-- expand the series. Editing or cancelling an event affects the whole series;
-- per-instance overrides/exceptions are intentionally out of scope.

alter table public.events
  add column if not exists recurrence text;

-- Drop the 12-arg version from 20260610 so PostgREST has no ambiguous overload.
drop function if exists public.update_event(uuid, text, date, time, time, text, text, text, text, text, text, uuid);

create or replace function public.update_event(
  event_id uuid,
  p_title text,
  p_date date,
  p_start_time time without time zone,
  p_end_time time without time zone,
  p_address text,
  p_room text default null,
  p_attire text default null,
  p_category text default null,
  p_description text default null,
  p_rsvp_url text default null,
  p_calendar_id uuid default null,
  p_recurrence text default null
) returns public.events
language sql
security definer
set search_path = public
as $$
  update public.events set
    title = p_title,
    date = p_date,
    start_time = p_start_time,
    end_time = p_end_time,
    address = p_address,
    room = p_room,
    attire = p_attire,
    category = p_category,
    description = p_description,
    rsvp_url = p_rsvp_url,
    calendar_id = p_calendar_id,
    recurrence = p_recurrence,
    sequence = sequence + 1
  where id = event_id
    and club_id in (select id from public.clubs where user_id = auth.uid())
  returning *;
$$;

revoke all on function public.update_event(uuid, text, date, time, time, text, text, text, text, text, text, uuid, text) from public, anon;
grant execute on function public.update_event(uuid, text, date, time, time, text, text, text, text, text, text, uuid, text) to authenticated;
