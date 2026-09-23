begin;
create table if not exists private.activity_audit (
 id bigint generated always as identity primary key,
 created_at timestamptz not null default now(), actor_id uuid, actor_name text not null,
 action text not null, target_id text not null, details jsonb not null default '{}'::jsonb
);
create index if not exists activity_audit_action_id on private.activity_audit(action,id desc);
alter table private.activity_audit enable row level security;
revoke all on private.activity_audit from public,anon,authenticated;

-- Trigger-only writer: records a minimal allowlist, never raw rows or photos.
create or replace function private.capture_activity() returns trigger language plpgsql security definer set search_path='' as $$
declare r jsonb; prev jsonb; actor uuid:=auth.uid(); event text; target text; extra jsonb:='{}'; nickname text;
begin
 r:=case when TG_OP='DELETE' then to_jsonb(old) else to_jsonb(new) end;
 prev:=case when TG_OP='UPDATE' then to_jsonb(old) else '{}'::jsonb end;
 case TG_TABLE_NAME
 when 'profiles' then
  actor:=coalesce(actor,(r->>'user_id')::uuid);target:=r->>'user_id';
  if TG_OP='INSERT' then event:='profile.created';
  elsif TG_OP='UPDATE' and r->>'nickname' is distinct from prev->>'nickname' then event:='profile.nickname_changed';extra:=jsonb_build_object('before',prev->>'nickname','after',r->>'nickname');
  else return null; end if;
 when 'posts' then
  target:=r->>'id';extra:=jsonb_build_object('status',r->>'status');
  if TG_OP='INSERT' then event:='post.submitted';
  elsif TG_OP='DELETE' then event:='post.deleted';
  elsif r->>'status' is distinct from prev->>'status' then event:='post.'||(r->>'status');extra:=extra||jsonb_build_object('before',prev->>'status');
  elsif r->>'image_path' is distinct from prev->>'image_path' then event:='post.photo_changed';extra:=jsonb_build_object('attached',r->>'image_path' is not null);
  elsif r->>'message' is distinct from prev->>'message' then event:='post.edited';
  else return null;end if;
 when 'post_likes' then
  target:=r->>'post_id';event:=case when TG_OP='INSERT' then 'post.liked' else 'post.unliked' end;
  if pg_trigger_depth()>1 then event:='post.like_cleanup';end if;
 when 'dataset_exclusions' then target:=r->>'item_id';event:=case when TG_OP='INSERT' then 'dataset.hidden' else 'dataset.restored' end;
 when 'role_audit' then actor:=(r->>'actor')::uuid;target:=r->>'target';event:='user.role_changed';extra:=jsonb_build_object('role',r->>'role');
 else return null;
 end case;
 select p.nickname into nickname from public.profiles p where p.user_id=actor;
 insert into private.activity_audit(actor_id,actor_name,action,target_id,details) values(actor,coalesce(nickname,case when actor is null then '시스템' else '사용자' end),event,target,extra);
 return null;
end;$$;
revoke all on function private.capture_activity() from public,anon,authenticated;
create or replace trigger audit_profile after insert or update on public.profiles for each row execute function private.capture_activity();
create or replace trigger audit_post after insert or update or delete on public.posts for each row execute function private.capture_activity();
create or replace trigger audit_like after insert or delete on public.post_likes for each row execute function private.capture_activity();
create or replace trigger audit_dataset after insert or delete on public.dataset_exclusions for each row execute function private.capture_activity();
create or replace trigger audit_role after insert on private.role_audit for each row execute function private.capture_activity();

create or replace function private.read_activity(before_id bigint default null, action_prefix text default '', search_text text default '') returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
 if auth.uid() is null or public.my_admin_role()<>'owner' then raise exception 'owner required' using errcode='42501';end if;
 if length(action_prefix)>40 or length(search_text)>100 then raise exception 'invalid filter';end if;
 select coalesce(jsonb_agg(to_jsonb(t) order by t.cursor desc),'[]'::jsonb) into result from (
  select id as cursor,id::text as id,created_at,actor_id,actor_name,action,target_id,details,'success'::text as outcome
  from private.activity_audit where (before_id is null or id<before_id)
   and starts_with(action,coalesce(action_prefix,''))
   and (coalesce(search_text,'')='' or position(lower(search_text) in lower(actor_name||' '||target_id||' '||coalesce(actor_id::text,'')))>0)
  order by id desc limit 51
 ) t;
 return result;
end;$$;
create or replace function public.owner_activity_logs(before_id bigint default null, action_prefix text default '', search_text text default '') returns jsonb language sql security invoker set search_path='' as $$select private.read_activity(before_id,action_prefix,search_text);$$;
grant usage on schema private to authenticated;
revoke all on function private.read_activity(bigint,text,text), public.owner_activity_logs(bigint,text,text) from public,anon,authenticated;
grant execute on function private.read_activity(bigint,text,text), public.owner_activity_logs(bigint,text,text) to authenticated;

-- Preserve the verified caller through moderation instead of writing as service_role.
create or replace function private.moderate_post(target_post uuid, next_status text default null, note text default '') returns jsonb language plpgsql security definer set search_path='' as $$
declare p public.posts;
begin
 if auth.uid() is null or public.my_admin_role() not in ('owner','moderator') then raise exception 'admin required' using errcode='42501';end if;
 if next_status is null then delete from public.posts where id=target_post returning * into p;
 else
  if next_status not in ('approved','changes','rejected','hidden') or (next_status<>'approved' and length(trim(coalesce(note,'')))=0) then raise exception 'invalid status or note';end if;
  update public.posts set status=next_status,moderation_note=case when next_status='approved' then null else left(note,500) end,approved_at=case when next_status='approved' then now() else null end,updated_at=now() where id=target_post returning * into p;
 end if;
 if p.id is null then raise exception 'post not found';end if;
 return to_jsonb(p);
end;$$;
create or replace function public.admin_audited_post_action(target_post uuid, next_status text default null, note text default '') returns jsonb language sql security invoker set search_path='' as $$select private.moderate_post(target_post,next_status,note);$$;
revoke all on function private.moderate_post(uuid,text,text),public.admin_audited_post_action(uuid,text,text) from public,anon,authenticated;
grant execute on function private.moderate_post(uuid,text,text),public.admin_audited_post_action(uuid,text,text) to authenticated;
commit;
