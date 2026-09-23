create extension if not exists pgcrypto;

create table public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  nickname text not null unique check (char_length(nickname) between 2 and 16),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.posts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(user_id) on delete cascade,
  result_name text not null check (char_length(result_name) between 1 and 60),
  result_category text not null check (result_category in ('human','character','animal')),
  result_score smallint not null check (result_score between 0 and 100),
  message text not null check (char_length(message) between 1 and 80),
  status text not null default 'pending' check (status in ('pending','approved','changes','rejected','hidden')),
  moderation_note text check (moderation_note is null or char_length(moderation_note) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  approved_at timestamptz
);

create index posts_public_feed_idx on public.posts (approved_at desc, id) where status = 'approved';
create index posts_owner_idx on public.posts (user_id, created_at desc);
create index posts_moderation_idx on public.posts (status, created_at asc);

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table private.admin_credentials (
  id boolean primary key default true check (id),
  salt_b64 text not null,
  hash_b64 text not null,
  iterations integer not null check (iterations >= 100000),
  updated_at timestamptz not null default now()
);

insert into private.admin_credentials (id, salt_b64, hash_b64, iterations)
values (true, '0E9k0Q0M7YBrRRm7LHLBXg==', 'r2/GTLEOvYt+6eGOcfB5by4k9zvolgAJ4ZM4LukdzhU=', 310000);

create table private.admin_sessions (
  token_hash text primary key,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create table private.moderation_audit (
  id bigint generated always as identity primary key,
  post_id uuid not null,
  action text not null,
  note text,
  created_at timestamptz not null default now()
);

create or replace function public.create_profile_for_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  adjectives text[] := array['반짝','구름','새벽','여름','푸른','노을','은하','포근','달빛','산뜻'];
  animals text[] := array['여우','수달','토끼','고양이','판다','펭귄','다람쥐','라쿤','코알라','알파카'];
  candidate text;
begin
  loop
    candidate := adjectives[1 + floor(random() * array_length(adjectives, 1))::int]
      || animals[1 + floor(random() * array_length(animals, 1))::int]
      || lpad(floor(random() * 1000)::int::text, 3, '0');
    begin
      insert into public.profiles(user_id, nickname) values (new.id, candidate);
      exit;
    exception when unique_violation then
      continue;
    end;
  end loop;
  return new;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.create_profile_for_new_user();

alter table public.profiles enable row level security;
alter table public.posts enable row level security;

revoke all on table public.profiles, public.posts from anon, authenticated;
grant select on table public.profiles to anon, authenticated;
grant update on table public.profiles to authenticated;
grant select on table public.posts to anon, authenticated;
grant insert, update, delete on table public.posts to authenticated;

create policy "public profiles are readable"
on public.profiles for select to anon, authenticated using (true);

create policy "owners update their profile"
on public.profiles for update to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy "approved posts are public and owners see their posts"
on public.posts for select to anon, authenticated
using (status = 'approved' or (select auth.uid()) = user_id);

create policy "users submit their own pending posts"
on public.posts for insert to authenticated
with check ((select auth.uid()) = user_id and status = 'pending' and approved_at is null and moderation_note is null);

create policy "users edit only their own pending posts"
on public.posts for update to authenticated
using ((select auth.uid()) = user_id and status in ('pending','changes'))
with check ((select auth.uid()) = user_id and status = 'pending' and approved_at is null and moderation_note is null);

create policy "users delete their own unpublished posts"
on public.posts for delete to authenticated
using ((select auth.uid()) = user_id and status <> 'approved');

create or replace function public.admin_credential_config()
returns table(salt_b64 text, hash_b64 text, iterations integer)
language sql security definer set search_path = private
as $$ select salt_b64, hash_b64, iterations from private.admin_credentials where id = true $$;

create or replace function public.create_admin_session(p_token_hash text)
returns timestamptz
language plpgsql security definer set search_path = private
as $$
declare expiry timestamptz := now() + interval '8 hours';
begin
  delete from private.admin_sessions where expires_at < now();
  insert into private.admin_sessions(token_hash, expires_at) values (p_token_hash, expiry);
  return expiry;
end;
$$;

create or replace function public.admin_session_valid(p_token_hash text)
returns boolean
language sql security definer set search_path = private
as $$ select exists(select 1 from private.admin_sessions where token_hash = p_token_hash and expires_at > now()) $$;

revoke all on function public.admin_credential_config() from public, anon, authenticated;
revoke all on function public.create_admin_session(text) from public, anon, authenticated;
revoke all on function public.admin_session_valid(text) from public, anon, authenticated;
grant execute on function public.admin_credential_config() to service_role;
grant execute on function public.create_admin_session(text) to service_role;
grant execute on function public.admin_session_valid(text) to service_role;

grant usage on schema public to anon, authenticated;
