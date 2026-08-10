-- ============================================================================
-- W15 — pictures for chores and rewards, and the data repair that goes with it.
--
-- ALREADY APPLIED to project shnbrpvuzbkcqvxvvxlr on 2026-08-09. Kept here so the
-- schema is reproducible from the repo alone.
-- ============================================================================

-- ---------------------------------------------------------------- 1. Storage
-- Public READ: the wall renders these with a plain <img> that carries no auth
-- header, and the contents are photographs of a bed and a toothbrush. Writes stay
-- behind the family's single authenticated session. 2 MB ceiling and an explicit
-- MIME allowlist so a mis-picked file is refused by the bucket, not by the UI.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('family-icons', 'family-icons', true, 2097152,
        array['image/jpeg','image/png','image/webp','image/gif'])
on conflict (id) do update
  set public = true,
      file_size_limit = 2097152,
      allowed_mime_types = array['image/jpeg','image/png','image/webp','image/gif'];

drop policy if exists "family icons are readable" on storage.objects;
create policy "family icons are readable"
  on storage.objects for select
  using (bucket_id = 'family-icons');

drop policy if exists "family icons are writable by the family" on storage.objects;
create policy "family icons are writable by the family"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'family-icons');

drop policy if exists "family icons are replaceable by the family" on storage.objects;
create policy "family icons are replaceable by the family"
  on storage.objects for update to authenticated
  using (bucket_id = 'family-icons');

drop policy if exists "family icons are removable by the family" on storage.objects;
create policy "family icons are removable by the family"
  on storage.objects for delete to authenticated
  using (bucket_id = 'family-icons');

-- ------------------------------------------------------- 2. A prize you can see
-- The kids' board fills toward ONE named prize. A picture of the actual ice cream
-- is worth more to a 5-year-old than the word, so rewards get the same field
-- chores have.
alter table rewards add column if not exists icon_url text;

-- --------------------------------------------------------- 3. Repair the icons
-- Three values in the live data, three different ways of being unrenderable:
--   share.google/…      a share LINK — returns HTML, so <img> shows nothing
--   pixtastock.com/…    a stock-photo product PAGE — same
--   data:image/jpeg;… truncated at 400 chars by a maxlength on the form field
-- Cleared so they fall back to the neutral dot instead of a broken-image icon.
update tasks set icon_url = null
 where icon_url is not null
   and (icon_url like 'https://share.google/%'
     or icon_url like 'https://www.pixtastock.com/%'
     or (icon_url like 'data:%' and length(icon_url) < 1000));

-- ------------------------------------------------------------- 4. The typo
-- NOTE: the ten chores are NOT duplicates. They are five chores x two children —
-- one row each for Doma and Nono, which is how per-child assignment works. The
-- only thing wrong was a spelling slip on Doma's copy.
update tasks set title = 'brush teeth and wear pj'
 where title = 'brush teeth and waer pj';
