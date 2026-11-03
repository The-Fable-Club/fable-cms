-- 0014: let the media table describe files hosted on ImageKit as well as Supabase storage.
-- Additive only: existing rows become provider 'supabase', kind 'image', which is what they are.
-- Nothing here changes the site or the current photo flow; it is the groundwork for the ImageKit
-- feature (CMS upload straight to ImageKit, media rows as the source of truth). See fable-cms#1.

alter table public.media
  add column if not exists provider text not null default 'supabase',
  add column if not exists file_id  text,            -- ImageKit fileId, for transforms and deletion
  add column if not exists kind     text not null default 'image',
  add column if not exists duration numeric;          -- seconds, for short loop videos

-- provider: where the bytes live. kind: picture or short silent clip.
alter table public.media drop constraint if exists media_provider_check;
alter table public.media add constraint media_provider_check check (provider in ('supabase', 'imagekit'));
alter table public.media drop constraint if exists media_kind_check;
alter table public.media add constraint media_kind_check check (kind in ('image', 'video'));
-- an ImageKit row must carry the fileId its transforms and clean-up need
alter table public.media drop constraint if exists media_imagekit_has_file_id;
alter table public.media add constraint media_imagekit_has_file_id check (provider <> 'imagekit' or file_id is not null);

comment on column public.media.provider is 'supabase | imagekit — where the file is hosted';
comment on column public.media.file_id is 'ImageKit fileId (null for Supabase storage rows)';
comment on column public.media.kind is 'image | video (short silent loop)';
comment on column public.media.duration is 'clip length in seconds, for video rows';
