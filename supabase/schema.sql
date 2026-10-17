-- The Fable Club CMS: database schema (DRAFT, not yet run).
-- Run in the Supabase SQL editor once the project exists. Review before running.
-- Authorisation is by GitHub username (Supabase GitHub provider).

-- ---------------------------------------------------------------- helpers
create or replace function set_updated_at() returns trigger
language plpgsql as $$ begin new.updated_at = now(); return new; end $$;

-- ---------------------------------------------------------------- admins
create table admins (
  github_username text primary key check (github_username = lower(github_username)),
  role            text not null check (role in ('owner', 'editor')),
  added_by        text,
  added_at        timestamptz not null default now()
);

-- Reads the GitHub username from auth.identities (server-controlled), NOT from
-- user_metadata, which a signed-in user is able to edit themselves.
create or replace function is_admin() returns boolean
language sql stable security definer set search_path = public, auth as $$
  select exists (
    select 1
    from auth.identities i
    join public.admins a on a.github_username = lower(i.identity_data ->> 'user_name')
    where i.user_id = auth.uid() and i.provider = 'github'
  );
$$;

create or replace function is_owner() returns boolean
language sql stable security definer set search_path = public, auth as $$
  select exists (
    select 1
    from auth.identities i
    join public.admins a on a.github_username = lower(i.identity_data ->> 'user_name')
    where i.user_id = auth.uid() and i.provider = 'github' and a.role = 'owner'
  );
$$;

insert into admins (github_username, role, added_by) values ('haise-727', 'owner', 'bootstrap');

-- ---------------------------------------------------------------- content
create table club_settings (
  id          int primary key default 1 check (id = 1),   -- single row
  data        jsonb not null,                              -- tagline, about, contact, socials, stats, phases
  updated_at  timestamptz not null default now()
);

create table aims (
  id          bigint generated always as identity primary key,
  position    int not null,
  title       text not null,
  body        text not null default '',
  model       text not null default 'pages' check (model in ('pages','book','blocks','steps','network')),
  updated_at  timestamptz not null default now()
);

create table events (
  id              bigint generated always as identity primary key,
  slug            text not null unique,
  title           text not null,
  kind            text not null default '',
  phase           smallint not null default 1 check (phase between 0 and 4),
  status_override text check (status_override in ('active','upcoming','past')),
  start_date      date not null,
  end_date        date,
  time_text       text not null default '',
  venue           text not null default '',
  summary         text not null default '',
  description     text not null default '',
  highlights      text[] not null default '{}',
  art             text not null default 'sprouts',
  photo_path      text,
  apply_url       text,
  seats           text,
  hub             jsonb not null default '[]',             -- participant-hub posts (published as content)
  archived        boolean not null default false,
  updated_at      timestamptz not null default now()
);

create table members (
  id          bigint generated always as identity primary key,
  slug        text not null unique,
  name        text not null,
  role        text not null,                               -- the category / portfolio
  "group"     text not null default 'Board' check ("group" in ('Faculty','Board','Leads')),
  position    int not null default 100,
  department  text not null default '',
  year        text not null default '',
  bio         text not null default '',
  focus       text[] not null default '{}',
  email       text not null default '',
  linkedin    text,
  github      text,
  art         text not null default 'sprouts',
  photo_path  text,
  archived    boolean not null default false,
  updated_at  timestamptz not null default now()
);

create table media (
  id           bigint generated always as identity primary key,
  path         text not null unique,                       -- path inside the 'media' bucket
  width        int,
  height       int,
  alt          text not null default '',
  uploaded_by  text,
  uploaded_at  timestamptz not null default now()
);

create trigger t_club_settings before update on club_settings for each row execute function set_updated_at();
create trigger t_aims          before update on aims          for each row execute function set_updated_at();
create trigger t_events        before update on events        for each row execute function set_updated_at();
create trigger t_members       before update on members       for each row execute function set_updated_at();

-- ---------------------------------------------------------------- releases
create table releases (
  id            bigint generated always as identity primary key,
  snapshot      jsonb not null,                            -- everything the public site needs
  note          text,
  published_by  text not null,
  published_at  timestamptz not null default now(),
  deploy_state  text not null default 'triggered'
);

-- The ONLY thing the public site can read: the newest release, nothing else.
create view public_release as
  select id, snapshot, published_at from releases order by id desc limit 1;

-- ---------------------------------------------------------------- applications (live)
create table applications (
  id            bigint generated always as identity primary key,
  created_at    timestamptz not null default now(),
  name          text not null check (char_length(name) between 2 and 120),
  reg_no        text not null check (char_length(reg_no) between 5 and 20),
  email         text not null check (email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' and char_length(email) <= 200),
  department    text not null check (char_length(department) between 2 and 120),
  year          text not null check (char_length(year) <= 30),
  level         text not null check (level in ('beginner','everyday','builder')),
  tracks        text[] not null default '{}',
  why           text not null check (char_length(why) between 20 and 2000),
  status        text not null default 'new' check (status in ('new','reviewed','accepted','rejected')),
  notes         text
);

-- Basic abuse brake: at most 3 applications per email per hour.
create or replace function limit_applications() returns trigger
language plpgsql as $$
begin
  if (select count(*) from applications
      where lower(email) = lower(new.email) and created_at > now() - interval '1 hour') >= 3 then
    raise exception 'too many applications for this email';
  end if;
  return new;
end $$;
create trigger t_limit_applications before insert on applications for each row execute function limit_applications();

-- ---------------------------------------------------------------- audit log
create table audit_log (
  id        bigint generated always as identity primary key,
  at        timestamptz not null default now(),
  actor     text not null,
  entity    text not null,
  entity_id text,
  action    text not null,
  detail    jsonb
);

-- ---------------------------------------------------------------- row level security
alter table admins          enable row level security;
alter table club_settings   enable row level security;
alter table aims            enable row level security;
alter table events          enable row level security;
alter table members         enable row level security;
alter table media           enable row level security;
alter table releases        enable row level security;
alter table applications    enable row level security;
alter table audit_log       enable row level security;

-- Admins can do everything on content; nobody else can touch it.
create policy admin_all on club_settings for all to authenticated using (is_admin()) with check (is_admin());
create policy admin_all on aims          for all to authenticated using (is_admin()) with check (is_admin());
create policy admin_all on events        for all to authenticated using (is_admin()) with check (is_admin());
create policy admin_all on members       for all to authenticated using (is_admin()) with check (is_admin());
create policy admin_all on media         for all to authenticated using (is_admin()) with check (is_admin());

create policy admin_read   on releases   for select to authenticated using (is_admin());
create policy admin_insert on releases   for insert to authenticated with check (is_admin());

create policy admin_read   on audit_log  for select to authenticated using (is_admin());
create policy admin_insert on audit_log  for insert to authenticated with check (is_admin());

create policy admin_read   on admins     for select to authenticated using (is_admin());
create policy owner_write  on admins     for all    to authenticated using (is_owner()) with check (is_owner());

-- Applications: the public may only INSERT; admins read and triage.
create policy public_insert on applications for insert to anon, authenticated with check (status = 'new');
create policy admin_read    on applications for select to authenticated using (is_admin());
create policy admin_update  on applications for update to authenticated using (is_admin()) with check (is_admin());

-- The view is the public read path (runs with owner rights, exposes only the newest release).
revoke all on public_release from anon, authenticated;
grant select on public_release to anon;

-- ---------------------------------------------------------------- storage (media bucket)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('media', 'media', true, 5242880, array['image/webp','image/jpeg','image/png','image/svg+xml'])
on conflict (id) do nothing;

create policy media_admin_write on storage.objects for insert to authenticated
  with check (bucket_id = 'media' and is_admin());
create policy media_admin_update on storage.objects for update to authenticated
  using (bucket_id = 'media' and is_admin());
create policy media_admin_delete on storage.objects for delete to authenticated
  using (bucket_id = 'media' and is_admin());
-- Public read comes from the bucket being public (no select policy needed for CDN URLs).
