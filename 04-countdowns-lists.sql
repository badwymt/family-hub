-- ============================================================================
-- 04-countdowns-lists.sql — W6 + W8 (applied to shnbrpvuzbkcqvxvvxlr 2026-08-09)
-- ============================================================================

-- ---- W6: countdowns --------------------------------------------------------
-- A flag on an existing row: no new table, no new policy (events is already scoped
-- by current_family_id()). Days remaining are computed client-side in families.tz
-- and NEVER stored.
alter table events add column if not exists countdown       boolean not null default false;
alter table events add column if not exists countdown_emoji text;
create index if not exists events_countdown_idx on events (family_id, starts_at) where countdown;

-- ---- W8: lists -------------------------------------------------------------
-- Groceries stays a VIRTUAL card over the existing shopping_items so the meal ->
-- grocery loop keeps working and there is never a second competing grocery list.
create table if not exists lists (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references families(id) on delete cascade,
  name text not null, color text not null default 'slate',
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);
create table if not exists list_items (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references families(id) on delete cascade,
  list_id uuid not null references lists(id) on delete cascade,
  text text not null, done boolean not null default false,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists list_items_list_idx on list_items (list_id, sort_order);

alter table lists enable row level security;
alter table list_items enable row level security;
do $$ begin
  create policy lists_family on lists for all
    using (family_id = current_family_id()) with check (family_id = current_family_id());
exception when duplicate_object then null; end $$;
do $$ begin
  create policy list_items_family on list_items for all
    using (family_id = current_family_id()) with check (family_id = current_family_id());
exception when duplicate_object then null; end $$;

alter publication supabase_realtime add table lists;
alter publication supabase_realtime add table list_items;
