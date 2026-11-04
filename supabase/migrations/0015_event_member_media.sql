-- 0015: events and members point at rows in `media` (ImageKit uploads, fable-cms#1).
-- An event carries up to three: one short silent loop video and two pictures (the order is the
-- display order: picture 1 = stage backdrop and video poster, picture 2 = strip thumbnail).
-- A member carries one photo. The old photo_path columns stay for Supabase-storage photos.
-- Additive: existing rows get no media.

alter table public.events
  add column if not exists media_ids bigint[] not null default '{}';
alter table public.events drop constraint if exists events_media_ids_max;
alter table public.events add constraint events_media_ids_max check (cardinality(media_ids) <= 3);

alter table public.members
  add column if not exists photo_id bigint references public.media (id) on delete set null;

-- the full delivery URL ImageKit returns, so nothing else needs the URL endpoint; only ImageKit's
-- host is accepted (the site's Content-Security-Policy allows nothing else for pictures and clips)
alter table public.media add column if not exists url text;
alter table public.media drop constraint if exists media_imagekit_url;
alter table public.media add constraint media_imagekit_url check (provider <> 'imagekit' or url like 'https://ik.imagekit.io/%');

-- the sweep and the publish builder look media up by id; ids are the primary key already.
-- uploaded_at drives the sweep's grace period for uploads not yet saved into a form.
alter table public.media alter column uploaded_at set default now();

comment on column public.events.media_ids is 'media.id list: at most 1 video + 2 images, in display order';
comment on column public.media.url is 'full ImageKit delivery URL (provider imagekit)';
comment on column public.members.photo_id is 'media.id of the member photo (ImageKit)';
