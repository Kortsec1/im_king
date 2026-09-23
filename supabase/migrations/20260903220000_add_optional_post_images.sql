alter table public.posts
  add column if not exists image_path text
  check (image_path is null or image_path ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\\.(jpg|png|webp)$');

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'community-posts',
  'community-posts',
  false,
  3145728,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy "owners upload community post images"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'community-posts'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

create policy "owners and approved feed read community post images"
on storage.objects for select to anon, authenticated
using (
  bucket_id = 'community-posts'
  and (
    (storage.foldername(name))[1] = (select auth.uid())::text
    or exists (
      select 1 from public.posts p
      where p.image_path = storage.objects.name and p.status = 'approved'
    )
  )
);

create policy "owners delete community post images"
on storage.objects for delete to authenticated
using (
  bucket_id = 'community-posts'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

drop policy if exists "users delete their own unpublished posts" on public.posts;
create policy "users delete their own posts"
on public.posts for delete to authenticated
using ((select auth.uid()) = user_id);

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
      p.message, p.image_path, p.status, p.moderation_note, p.created_at, p.updated_at, p.approved_at
    from public.posts p join public.profiles pr on pr.user_id = p.user_id
    order by p.created_at asc
  ) q;
  return payload;
end;
$$;

revoke all on function public.admin_queue(text) from public, anon, authenticated;
grant execute on function public.admin_queue(text) to service_role;
