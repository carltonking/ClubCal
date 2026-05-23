alter table public.clubs
  add column if not exists status text,
  add column if not exists denial_reason text;

update public.clubs
set status = 'approved'
where status = 'active';

update public.clubs
set status = 'pending'
where status is null;

alter table public.clubs
  alter column status set default 'pending';

alter table public.clubs
  drop constraint if exists clubs_status_check;

alter table public.clubs
  add constraint clubs_status_check
  check (status in ('pending', 'approved', 'denied'));

alter table public.clubs
  enable row level security;

do $$
declare
  policy_record record;
begin
  for policy_record in
    select policyname
    from pg_policies
    where schemaname = 'public'
      and tablename = 'clubs'
  loop
    execute format('drop policy if exists %I on public.clubs', policy_record.policyname);
  end loop;
end
$$;

create policy clubs_select_approved_or_own
  on public.clubs
  for select
  using (
    status = 'approved'
    or auth.uid() = user_id
  );

create policy clubs_insert_own_pending
  on public.clubs
  for insert
  to authenticated
  with check (
    auth.uid() = user_id
    and status = 'pending'
  );

create policy clubs_update_own
  on public.clubs
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
