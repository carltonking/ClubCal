-- Initial Club Cal schema.
-- This migration reconstructs the base tables (`clubs`, `events`) that
-- previously existed only in the Supabase dashboard. It is idempotent
-- so it can safely run against a project that already has them.
--
-- Later migrations in this directory layer on top of this one:
--   20260406_add_event_sequence_and_cancelled.sql
--   20260413_add_club_verification_status.sql
--   20260416_add_calendars.sql
--   20260416_add_download_count_rpc.sql

-- ── clubs ──────────────────────────────────────────────────────────
create table if not exists public.clubs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  club_name text not null,
  school text not null,
  email text not null,
  created_at timestamptz not null default now()
);

create index if not exists clubs_user_id_idx on public.clubs (user_id);
create index if not exists clubs_school_idx on public.clubs (school);
create unique index if not exists clubs_email_unique on public.clubs (lower(email));

-- ── events ─────────────────────────────────────────────────────────
create table if not exists public.events (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs(id) on delete cascade,
  title text not null,
  date date not null,
  start_time time not null,
  end_time time not null,
  address text,
  room text,
  attire text,
  category text not null,
  description text,
  rsvp_url text,
  download_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists events_club_id_idx on public.events (club_id);
create index if not exists events_date_idx on public.events (date);

-- keep updated_at current on every row change
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists events_set_updated_at on public.events;
create trigger events_set_updated_at
  before update on public.events
  for each row execute function public.set_updated_at();

-- ── RLS policies for events ────────────────────────────────────────
-- (RLS for `clubs` is configured in 20260413_add_club_verification_status.sql.)
alter table public.events enable row level security;

drop policy if exists events_select_public on public.events;
create policy events_select_public
  on public.events
  for select
  using (true);

drop policy if exists events_insert_own on public.events;
create policy events_insert_own
  on public.events
  for insert
  to authenticated
  with check (
    club_id in (select id from public.clubs where user_id = auth.uid())
  );

drop policy if exists events_update_own on public.events;
create policy events_update_own
  on public.events
  for update
  to authenticated
  using (club_id in (select id from public.clubs where user_id = auth.uid()))
  with check (club_id in (select id from public.clubs where user_id = auth.uid()));

drop policy if exists events_delete_own on public.events;
create policy events_delete_own
  on public.events
  for delete
  to authenticated
  using (club_id in (select id from public.clubs where user_id = auth.uid()));
