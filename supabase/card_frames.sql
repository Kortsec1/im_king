-- Card frame library: apply through the migration API to the existing project.
begin;
create table public.card_frames (
 id uuid primary key default gen_random_uuid(),
 name text not null check(length(btrim(name)) between 1 and 60),
 image_path text not null check(image_path ~ '^[a-f0-9-]+/[a-f0-9-]+\.webp$'),
 layout jsonb not null check(jsonb_typeof(layout)='object' and octet_length(layout::text)<10000),
 published boolean not null default false,
 revision integer not null default 1,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
alter table public.card_frames enable row level security;
revoke all on public.card_frames from public,anon,authenticated;
grant select on public.card_frames to anon,authenticated;
grant insert,update on public.card_frames to authenticated;
create policy frames_public_read on public.card_frames for select to anon,authenticated using(published);
create policy frames_admin_read on public.card_frames for select to authenticated using((select public.my_admin_role()) in ('owner','moderator'));
create policy frames_admin_insert on public.card_frames for insert to authenticated with check((select public.my_admin_role()) in ('owner','moderator'));
create policy frames_admin_update on public.card_frames for update to authenticated using((select public.my_admin_role()) in ('owner','moderator')) with check((select public.my_admin_role()) in ('owner','moderator'));

create function private.validate_card_frame() returns trigger language plpgsql set search_path='' as $$
declare k text; b jsonb;
begin
 if new.layout->>'fit' not in ('contain','cover') or new.layout->>'fit' is null then raise exception 'Invalid background fit'; end if;
 if not coalesce(new.layout->>'background' ~ '^#[0-9a-fA-F]{6}$',false) then raise exception 'Invalid background color'; end if;
 foreach k in array array['score','brand','copy','person'] loop
  b:=new.layout->k;
  if b is null or jsonb_typeof(b)<>'object' then raise exception 'Missing layout block'; end if;
  if not coalesce((b->>'x')::numeric between 0 and 600 and (b->>'y')::numeric between 0 and 900
   and (b->>'w')::numeric between 40 and 600 and (b->>'h')::numeric between 30 and 900
   and (b->>'x')::numeric+(b->>'w')::numeric<=600 and (b->>'y')::numeric+(b->>'h')::numeric<=900
   and (b->>'size')::numeric between 12 and 160 and b->>'color' ~ '^#[0-9a-fA-F]{6}$'
   and b->>'align' in ('left','center','right') and jsonb_typeof(b->'visible')='boolean',false) then raise exception 'Invalid layout block'; end if;
 end loop;
 if tg_op='UPDATE' then new.id:=old.id;new.created_at:=old.created_at;new.revision:=old.revision+1;else new.revision:=1; end if;
 new.updated_at:=now();return new;
end; $$;
create trigger validate_card_frame before insert or update on public.card_frames for each row execute function private.validate_card_frame();

create function private.audit_card_frame() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or public.my_admin_role() not in ('owner','moderator') then raise exception 'Admin required' using errcode='42501'; end if;
 insert into private.activity_audit(actor_id,actor_name,action,target_id,details)
 values(auth.uid(),(select nickname from public.profiles where user_id=auth.uid()),
 case when tg_op='INSERT' then 'frame.created' when old.published<>new.published then case when new.published then 'frame.published' else 'frame.unpublished' end else 'frame.updated' end,
 new.id::text,jsonb_build_object('name',new.name,'published',new.published,'revision',new.revision));
 return new;
end; $$;
revoke all on function private.validate_card_frame(),private.audit_card_frame() from public,anon,authenticated;
create trigger audit_card_frame after insert or update on public.card_frames for each row execute function private.audit_card_frame();

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
 values('card-frames','card-frames',false,8388608,array['image/webp']);
create policy frames_asset_public_read on storage.objects for select to anon,authenticated
 using(bucket_id='card-frames' and exists(select 1 from public.card_frames f where f.image_path=storage.objects.name and f.published));
create policy frames_asset_admin_read on storage.objects for select to authenticated
 using(bucket_id='card-frames' and (select public.my_admin_role()) in ('owner','moderator'));
create policy frames_asset_admin_insert on storage.objects for insert to authenticated
 with check(bucket_id='card-frames' and (select public.my_admin_role()) in ('owner','moderator'));
-- Immutable uploads: replacement images get a new path; old objects cannot overwrite live cards.
commit;
