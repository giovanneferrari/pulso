create table public.pulso_boards (
  owner_id uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  snapshot jsonb not null check (jsonb_typeof(snapshot) = 'object'),
  revision bigint not null default 1 check (revision > 0)
);

alter table public.pulso_boards enable row level security;
revoke all on public.pulso_boards from anon, authenticated;
grant select, insert, update on public.pulso_boards to authenticated;

create policy "Read own Pulso board" on public.pulso_boards
  for select to authenticated using ((select auth.uid()) = owner_id);
create policy "Create own Pulso board" on public.pulso_boards
  for insert to authenticated with check ((select auth.uid()) = owner_id);
create policy "Update own Pulso board" on public.pulso_boards
  for update to authenticated using ((select auth.uid()) = owner_id)
  with check ((select auth.uid()) = owner_id);
