revoke all on function public.create_profile_for_new_user() from public, anon, authenticated;

create table private.admin_login_attempts (
  client_hash text primary key,
  failures integer not null default 0,
  blocked_until timestamptz,
  updated_at timestamptz not null default now()
);

create or replace function public.admin_login_state(p_client_hash text)
returns jsonb
language sql security definer set search_path = private
as $$
  select jsonb_build_object(
    'salt_b64', c.salt_b64,
    'hash_b64', c.hash_b64,
    'iterations', c.iterations,
    'blocked_until', a.blocked_until
  )
  from private.admin_credentials c
  left join private.admin_login_attempts a on a.client_hash = p_client_hash
  where c.id = true
$$;

create or replace function public.record_admin_login_attempt(p_client_hash text, p_success boolean)
returns void
language plpgsql security definer set search_path = private
as $$
begin
  if p_success then
    delete from private.admin_login_attempts where client_hash = p_client_hash;
  else
    insert into private.admin_login_attempts(client_hash, failures, blocked_until, updated_at)
    values (p_client_hash, 1, null, now())
    on conflict (client_hash) do update set
      failures = case when private.admin_login_attempts.updated_at < now() - interval '30 minutes' then 1 else private.admin_login_attempts.failures + 1 end,
      blocked_until = case when private.admin_login_attempts.failures + 1 >= 5 then now() + interval '15 minutes' else private.admin_login_attempts.blocked_until end,
      updated_at = now();
  end if;
end;
$$;

create or replace function public.admin_queue(p_token_hash text)
returns jsonb
language plpgsql security definer set search_path = public, private
as $$
declare payload jsonb;
begin
  if not public.admin_session_valid(p_token_hash) then raise exception 'unauthorized'; end if;
  select coalesce(jsonb_agg(to_jsonb(q) order by q.created_at asc), '[]'::jsonb) into payload
  from (
    select p.id, p.user_id, pr.nickname, p.result_name, p.result_category, p.result_score,
      p.message, p.status, p.moderation_note, p.created_at, p.updated_at, p.approved_at
    from public.posts p join public.profiles pr on pr.user_id = p.user_id
    order by p.created_at asc
  ) q;
  return payload;
end;
$$;

create or replace function public.admin_moderate_post(p_token_hash text, p_post_id uuid, p_action text, p_note text default null)
returns jsonb
language plpgsql security definer set search_path = public, private
as $$
declare updated public.posts;
begin
  if not public.admin_session_valid(p_token_hash) then raise exception 'unauthorized'; end if;
  if p_action not in ('approved','changes','rejected','hidden') then raise exception 'invalid action'; end if;
  if p_action in ('changes','rejected','hidden') and coalesce(char_length(trim(p_note)), 0) = 0 then raise exception 'note required'; end if;
  update public.posts set
    status = p_action,
    moderation_note = case when p_action = 'approved' then null else left(trim(p_note), 500) end,
    approved_at = case when p_action = 'approved' then now() else null end,
    updated_at = now()
  where id = p_post_id returning * into updated;
  if updated.id is null then raise exception 'post not found'; end if;
  insert into private.moderation_audit(post_id, action, note) values (p_post_id, p_action, left(trim(p_note), 500));
  return to_jsonb(updated);
end;
$$;

revoke all on function public.admin_login_state(text) from public, anon, authenticated;
revoke all on function public.record_admin_login_attempt(text, boolean) from public, anon, authenticated;
revoke all on function public.admin_queue(text) from public, anon, authenticated;
revoke all on function public.admin_moderate_post(text, uuid, text, text) from public, anon, authenticated;
grant execute on function public.admin_login_state(text) to service_role;
grant execute on function public.record_admin_login_attempt(text, boolean) to service_role;
grant execute on function public.admin_queue(text) to service_role;
grant execute on function public.admin_moderate_post(text, uuid, text, text) to service_role;
