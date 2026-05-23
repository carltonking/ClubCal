-- Atomic update + sequence increment for event edits.
-- Returns the full updated row so the client can use mapEvent() on it.

create or replace function public.update_event(
  event_id uuid,
  p_title text,
  p_date date,
  p_start_time time without time zone,
  p_end_time time without time zone,
  p_address text,
  p_room text default null,
  p_attire text default null,
  p_category text,
  p_description text default null,
  p_rsvp_url text default null,
  p_calendar_id uuid default null
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
    sequence = sequence + 1,
    updated_at = now()
  where id = event_id
  returning *;
$$;

-- Soft-delete: mark as cancelled and bump sequence so calendar
-- clients see STATUS:CANCELLED with a new SEQUENCE.

create or replace function public.cancel_event(event_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.events set
    cancelled = true,
    sequence = sequence + 1,
    updated_at = now()
  where id = event_id;
$$;

revoke all on function public.update_event(uuid, text, date, time, time, text, text, text, text, text, text, uuid) from public;
grant execute on function public.update_event(uuid, text, date, time, time, text, text, text, text, text, text, uuid) to anon, authenticated;
revoke all on function public.cancel_event(uuid) from public;
grant execute on function public.cancel_event(uuid) to anon, authenticated;
