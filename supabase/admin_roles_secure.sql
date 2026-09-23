begin;
alter table private.admin_roles enable row level security;
create unique index if not exists sole_admin_owner on private.admin_roles(role) where role='owner';
create or replace function public.my_admin_role() returns text language sql stable security definer set search_path='' as $$
 select coalesce((select r.role from private.admin_roles r join auth.users u on u.id=r.user_id where r.user_id=auth.uid() and (r.role='moderator' or (r.role='owner' and lower(u.email)='pcw0629@gmail.com'))),'user');
$$;
revoke all on function public.my_admin_role() from public,anon;
grant execute on function public.my_admin_role() to authenticated;
create or replace function public.owner_list_users() returns jsonb language plpgsql security definer set search_path='' as $$
begin
 if public.my_admin_role()<>'owner' then raise exception 'owner required' using errcode='42501'; end if;
 return (select coalesce(jsonb_agg(jsonb_build_object('user_id',u.id,'email',u.email,'nickname',p.nickname,'role',coalesce(r.role,'user')) order by u.created_at desc),'[]'::jsonb) from auth.users u left join public.profiles p on p.user_id=u.id left join private.admin_roles r on r.user_id=u.id);
end; $$;
create table if not exists private.role_audit(id bigint generated always as identity primary key, actor uuid not null, target uuid not null, role text not null, created_at timestamptz default now());
alter table private.role_audit enable row level security;
revoke all on private.role_audit from public,anon,authenticated;
create or replace function public.owner_set_role(target_user uuid,new_role text) returns void language plpgsql security definer set search_path='' as $$
begin
 if public.my_admin_role()<>'owner' then raise exception 'owner required' using errcode='42501'; end if;
 if new_role not in ('user','moderator') or new_role is null then raise exception 'invalid role'; end if;
 if target_user=auth.uid() or exists(select 1 from private.admin_roles where user_id=target_user and role='owner') then raise exception 'owner is locked'; end if;
 if not exists(select 1 from auth.users where id=target_user) then raise exception 'user not found'; end if;
 if new_role='user' then delete from private.admin_roles where user_id=target_user;
 else insert into private.admin_roles(user_id,role) values(target_user,'moderator') on conflict(user_id) do update set role=excluded.role,updated_at=now(); end if;
 insert into private.role_audit(actor,target,role) values(auth.uid(),target_user,new_role);
end; $$;
revoke all on function public.owner_list_users() from public,anon;
revoke all on function public.owner_set_role(uuid,text) from public,anon;
grant execute on function public.owner_list_users() to authenticated;
grant execute on function public.owner_set_role(uuid,text) to authenticated;
commit;
