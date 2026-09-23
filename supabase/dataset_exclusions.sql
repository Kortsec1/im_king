create table if not exists public.dataset_exclusions(item_id text primary key check(char_length(item_id) between 1 and 120),created_at timestamptz not null default now());
alter table public.dataset_exclusions enable row level security;
revoke all on public.dataset_exclusions from public,anon,authenticated;
grant select on public.dataset_exclusions to anon,authenticated;
grant insert,delete on public.dataset_exclusions to authenticated;
create policy exclusions_read on public.dataset_exclusions for select to anon,authenticated using(true);
create policy exclusions_admin_insert on public.dataset_exclusions for insert to authenticated with check((select public.my_admin_role()) in ('owner','moderator'));
create policy exclusions_admin_delete on public.dataset_exclusions for delete to authenticated using((select public.my_admin_role()) in ('owner','moderator'));
