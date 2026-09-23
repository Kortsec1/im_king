create table if not exists private.admin_roles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null check (role in ('owner','moderator')),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
revoke all on private.admin_roles from public, anon, authenticated;
create or replace function public.admin_users(p_token_hash text) returns jsonb language plpgsql security definer set search_path = public, private, auth as $$ declare payload jsonb; begin
 if not public.admin_session_valid(p_token_hash) then raise exception 'unauthorized'; end if;
 select coalesce(jsonb_agg(jsonb_build_object('user_id',u.id,'email',u.email,'nickname',p.nickname,'role',coalesce(ar.role,'user'),'created_at',u.created_at) order by u.created_at desc),'[]'::jsonb) into payload from auth.users u left join public.profiles p on p.user_id=u.id left join private.admin_roles ar on ar.user_id=u.id; return payload; end; $$;
create or replace function public.set_admin_role(p_token_hash text,p_user_id uuid,p_role text) returns jsonb language plpgsql security definer set search_path = public, private as $$ declare owner_count integer; begin
 if not public.admin_session_valid(p_token_hash) then raise exception 'unauthorized'; end if; if p_role not in ('user','moderator') then raise exception 'invalid role'; end if; select count(*) into owner_count from private.admin_roles where role='owner'; if owner_count=0 then raise exception 'owner is not configured'; end if;
 if p_role='moderator' then insert into private.admin_roles(user_id,role) values(p_user_id,'moderator') on conflict(user_id) do update set role='moderator',updated_at=now(); else delete from private.admin_roles where user_id=p_user_id and role<>'owner'; end if; return jsonb_build_object('ok',true,'user_id',p_user_id,'role',p_role); end; $$;
revoke all on function public.admin_users(text) from public, anon, authenticated; revoke all on function public.set_admin_role(text,uuid,text) from public, anon, authenticated; grant execute on function public.admin_users(text) to service_role; grant execute on function public.set_admin_role(text,uuid,text) to service_role;
create or replace function public.set_admin_owner(p_token_hash text,p_email text) returns jsonb language plpgsql security definer set search_path = public, private, auth as $$ declare owner_count integer; target uuid; begin
 if not public.admin_session_valid(p_token_hash) then raise exception 'unauthorized'; end if; select count(*) into owner_count from private.admin_roles where role='owner'; if owner_count>0 then raise exception 'owner already configured'; end if;
 select id into target from auth.users where lower(email)=lower(trim(p_email)); if target is null then raise exception 'user not found'; end if; insert into private.admin_roles(user_id,role) values(target,'owner'); return jsonb_build_object('ok',true,'user_id',target,'role','owner'); end; $$;
revoke all on function public.set_admin_owner(text,text) from public, anon, authenticated; grant execute on function public.set_admin_owner(text,text) to service_role;
create or replace function public.my_admin_role() returns text language sql stable security definer set search_path = public, private as $$ select coalesce((select role from private.admin_roles where user_id = auth.uid()), 'user') $$;
revoke all on function public.my_admin_role() from public, anon; grant execute on function public.my_admin_role() to authenticated;
