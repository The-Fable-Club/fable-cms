-- 0002: room to grow while the details are still being decided.
-- NOT YET APPLIED. Paste into the Supabase SQL editor and run when you are happy with it.
--
-- Every content table gets an `extra` jsonb column. A field that has not been
-- finalised can live there first (the CMS reads and writes it like any other
-- field), and be promoted to a real column later with a small migration.
-- Safe to run more than once.

alter table aims    add column if not exists extra jsonb not null default '{}'::jsonb;
alter table events  add column if not exists extra jsonb not null default '{}'::jsonb;
alter table members add column if not exists extra jsonb not null default '{}'::jsonb;

-- Snapshots carry a version number so the public site and the CMS can change
-- independently: the site reads `snapshot.schema_version` and knows the shape.
alter table releases add column if not exists schema_version int not null default 1;
