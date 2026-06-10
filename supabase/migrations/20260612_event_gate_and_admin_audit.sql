-- P1 hardening.
--
-- 1) Only APPROVED clubs may create events. events_insert_own previously
--    allowed any club the caller owns regardless of status, so a pending or
--    denied club could publish publicly-readable events before review.
-- 2) Admin action audit log so approvals/denials are attributable after the
--    fact (the admin-club-action edge function writes to it via service role).

drop policy if exists events_insert_own on public.events;
create policy events_insert_own
  on public.events
  for insert
  to authenticated
  with check (
    club_id in (
      select id from public.clubs
      where user_id = auth.uid() and status = 'approved'
    )
  );

create table if not exists public.admin_actions (
  id uuid primary key default gen_random_uuid(),
  action text not null check (action in ('approve', 'reject')),
  club_id uuid,
  reason text,
  created_at timestamptz not null default now()
);

create index if not exists admin_actions_created_at_idx on public.admin_actions (created_at desc);

alter table public.admin_actions enable row level security;
-- No policies: only the service role (admin-club-action edge function) may
-- read or write the audit log; it is never exposed to anon/authenticated.
