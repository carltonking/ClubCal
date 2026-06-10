-- Best-effort download de-duplication (Risk 6).
--
-- increment_event_download_count() is granted to anon with no throttle, so
-- download_count was trivially inflatable and Insights untrustworthy.
-- record_event_download() counts at most one download per (event, client_token),
-- where client_token is a per-browser id the client sends. Still forgeable by
-- rotating the token, so Insights remains best-effort — but this stops casual
-- and accidental multi-counting from a single browser.

create table if not exists public.event_download_tokens (
  event_id uuid not null references public.events(id) on delete cascade,
  client_token text not null,
  created_at timestamptz not null default now(),
  primary key (event_id, client_token)
);

alter table public.event_download_tokens enable row level security;
-- No policies on purpose: only the SECURITY DEFINER function below may write,
-- and no one may read the tokens directly.

create or replace function public.record_event_download(event_id uuid, client_token text)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  inserted_count integer;
  new_count integer;
begin
  if client_token is null or length(client_token) = 0 then
    -- No token supplied: fall back to a plain increment (legacy behavior).
    update public.events set download_count = coalesce(download_count, 0) + 1
      where id = event_id
      returning download_count into new_count;
    return coalesce(new_count, 0);
  end if;

  insert into public.event_download_tokens(event_id, client_token)
    values (event_id, client_token)
    on conflict do nothing;
  get diagnostics inserted_count = row_count;

  if inserted_count > 0 then
    update public.events set download_count = coalesce(download_count, 0) + 1
      where id = event_id
      returning download_count into new_count;
  else
    select coalesce(download_count, 0) into new_count
      from public.events
      where id = event_id;
  end if;

  return coalesce(new_count, 0);
end;
$$;

revoke all on function public.record_event_download(uuid, text) from public;
grant execute on function public.record_event_download(uuid, text) to anon, authenticated;

-- Close the old un-throttled path: the client now uses record_event_download,
-- so revoke anon's ability to call the bare increment (which had no dedup).
revoke all on function public.increment_event_download_count(uuid) from public, anon;
