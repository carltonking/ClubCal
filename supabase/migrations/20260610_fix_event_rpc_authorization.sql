-- SECURITY FIX (Risk 1, Critical).
--
-- The previous definitions of update_event() and cancel_event()
-- (20260522_add_event_update_and_cancel_functions.sql) were SECURITY
-- DEFINER, granted to `anon, authenticated`, and updated rows by `event_id`
-- alone with NO ownership check. Because event ids are exposed to every
-- anonymous visitor (discovery loads `clubs.select("*, events(*)")` and the
-- iCal feed UID is `<id>@clubcal.app`), anyone holding the public anon key
-- could rewrite or cancel ANY event on the platform.
--
-- This migration re-creates both functions with an explicit ownership
-- predicate — the caller must own the club that owns the event — and
-- revokes EXECUTE from anon. SECURITY DEFINER is retained, but the in-body
-- `auth.uid()` check (which reads the request JWT, not the function owner)
-- now enforces the same boundary the events_update_own / events_delete_own
-- RLS policies express. A non-owner (or anon, whose auth.uid() is null)
-- matches zero rows.

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
    sequence = sequence + 1
  where id = event_id
    and club_id in (select id from public.clubs where user_id = auth.uid())
  returning *;
$$;

create or replace function public.cancel_event(event_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.events set
    cancelled = true,
    sequence = sequence + 1
  where id = event_id
    and club_id in (select id from public.clubs where user_id = auth.uid());
$$;

-- Authenticated club owners only — never anon.
revoke all on function public.update_event(uuid, text, date, time, time, text, text, text, text, text, text, uuid) from public, anon;
grant execute on function public.update_event(uuid, text, date, time, time, text, text, text, text, text, text, uuid) to authenticated;
revoke all on function public.cancel_event(uuid) from public, anon;
grant execute on function public.cancel_event(uuid) to authenticated;

-- Correctness fix (Risk 4): normalize existing club emails to lower case so
-- they match the lowercased Supabase Auth session email at sign-in. The
-- clubs_email_unique index is already on lower(email), so no case-only
-- duplicates can exist and this backfill cannot collide.
update public.clubs
  set email = lower(email)
  where email <> lower(email);
