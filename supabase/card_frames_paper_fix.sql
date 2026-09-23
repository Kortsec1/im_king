create or replace function private.validate_card_frame() returns trigger language plpgsql set search_path='' as $$
declare k text; b jsonb; cw numeric:=600; ch numeric:=900;
begin
 if new.layout ? 'canvas' then
  if new.layout->'canvas' = '{"width":720,"height":850}'::jsonb then cw:=720;ch:=850;
  elsif new.layout->'canvas' <> '{"width":600,"height":900}'::jsonb then raise exception 'Invalid canvas size'; end if;
 end if;
 if new.layout->>'fit' not in ('contain','cover') or new.layout->>'fit' is null then raise exception 'Invalid background fit'; end if;
 if not coalesce(new.layout->>'background' ~ '^#[0-9a-fA-F]{6}$',false) then raise exception 'Invalid background color'; end if;
 foreach k in array array['score','brand','copy','person'] loop
  b:=new.layout->k;
  if b is null or jsonb_typeof(b)<>'object' then raise exception 'Missing layout block'; end if;
  if not coalesce((b->>'x')::numeric between 0 and cw and (b->>'y')::numeric between 0 and ch
   and (b->>'w')::numeric between 40 and cw and (b->>'h')::numeric between 30 and ch
   and (b->>'x')::numeric+(b->>'w')::numeric<=cw and (b->>'y')::numeric+(b->>'h')::numeric<=ch
   and (b->>'size')::numeric between 12 and 160 and b->>'color' ~ '^#[0-9a-fA-F]{6}$'
   and b->>'align' in ('left','center','right') and jsonb_typeof(b->'visible')='boolean',false) then raise exception 'Invalid layout block: %',k; end if;
 end loop;
 if tg_op='UPDATE' then new.id:=old.id;new.created_at:=old.created_at;new.revision:=old.revision+1;else new.revision:=1; end if;
 new.updated_at:=now();return new;
end; $$;
