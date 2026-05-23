-- Atomic increment for events.download_count.
-- Called from the client whenever a student downloads an .ics file for
-- an individual event. Using a SQL function prevents the read-modify-
-- write race that was present in the JS client.

create or replace function public.increment_event_download_count(event_id uuid)
returns integer
language sql
security definer
set search_path = public
as $$
  update public.events
    set download_count = coalesce(download_count, 0) + 1
    where id = event_id
    returning download_count;
$$;

-- Allow the anon role to call it. `security definer` combined with a
-- narrow signature limits what the caller can do to just incrementing
-- the counter on a specific event id.
revoke all on function public.increment_event_download_count(uuid) from public;
grant execute on function public.increment_event_download_count(uuid) to anon, authenticated;
