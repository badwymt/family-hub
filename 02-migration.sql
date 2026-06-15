-- ============================================================================
-- Family Hub — Completed Migration  (02-migration.sql)
-- ----------------------------------------------------------------------------
-- Schema RECONSTRUCTED from 00-architecture.md / 01-product-brief.md /
-- 03-wireframes.md (the original tables-only file was not available), then the
-- 7 required corrections applied on top:
--   (1) family_id on every child table (event_overrides, event_notes,
--       task_completions, star_ledger, redemptions) so RLS never recurses.
--   (2) `stock` column dropped from rewards (never created).
--   (3) current_family_id() SECURITY DEFINER helper that reads `families` by
--       auth_user_id = auth.uid() directly (bypasses RLS -> no recursion).
--   (4) RLS policies on every table, scoping rows to the single owned family.
--   (5) complete_task() + redeem_reward() RPCs — SECURITY DEFINER, lock the
--       member row FOR UPDATE, write ledger + cached balance atomically.
--       complete_task skips the ledger write when star_reward = 0. Double-claims
--       blocked by unique(task_id, occurrence_date) + a partial unique index for
--       one-off tasks (occurrence_date IS NULL).
--   (6) FK star_ledger.redemption_id -> redemptions(id) ON DELETE SET NULL.
--   (7) Idempotent seed: one `families` row bound to the shared auth user, plus
--       4 family_members (Parent1 blue, Parent2 green, Child1 amber, Child2 pink).
--
-- Idempotent: safe to re-run. DDL uses IF NOT EXISTS; policies are dropped then
-- recreated; seed uses ON CONFLICT DO NOTHING.
-- NOTE: run AFTER the single shared auth user exists, so the seed binds to it.
-- ============================================================================

create extension if not exists pgcrypto;   -- gen_random_uuid()

-- ----------------------------------------------------------------------------
-- families  (one row per family; bound to the shared Supabase auth user)
-- ----------------------------------------------------------------------------
create table if not exists families (
  id            uuid primary key default gen_random_uuid(),
  auth_user_id  uuid not null unique references auth.users(id) on delete cascade,
  name          text not null default 'Our Family',
  created_at    timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- Correction #3 — non-recursive family resolver.
-- SECURITY DEFINER runs as the table owner, for whom RLS is not enforced, so
-- policies that call this never re-trigger RLS on `families` (no recursion).
-- ----------------------------------------------------------------------------
create or replace function current_family_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select id from public.families where auth_user_id = auth.uid() limit 1;
$$;

-- ----------------------------------------------------------------------------
-- family_members  (4 per family; star_balance is a CACHE of the ledger)
-- ----------------------------------------------------------------------------
create table if not exists family_members (
  id           uuid primary key default gen_random_uuid(),
  family_id    uuid not null references families(id) on delete cascade,
  name         text not null,
  color        text not null,                 -- blue / green / amber / pink
  avatar_url   text,
  is_child     boolean not null default false,
  star_balance integer not null default 0,
  sort_order   integer not null default 0,
  created_at   timestamptz not null default now(),
  unique (family_id, name)                     -- idempotent seed key
);

-- ----------------------------------------------------------------------------
-- events  (member_id NULL = whole-family event; rrule NULL = single occurrence)
-- ----------------------------------------------------------------------------
create table if not exists events (
  id         uuid primary key default gen_random_uuid(),
  family_id  uuid not null references families(id) on delete cascade,
  member_id  uuid references family_members(id) on delete set null,
  title      text not null,
  location   text,
  starts_at  timestamptz not null,
  ends_at    timestamptz,
  all_day    boolean not null default false,
  rrule      text,
  exdates    timestamptz[] not null default '{}',
  created_at timestamptz not null default now()
);

-- event_overrides — per-instance edits ("this only"). (1) family_id added.
create table if not exists event_overrides (
  id            uuid primary key default gen_random_uuid(),
  family_id     uuid not null references families(id) on delete cascade,
  event_id      uuid not null references events(id) on delete cascade,
  occurrence_date date not null,
  is_cancelled  boolean not null default false,
  new_starts_at timestamptz,
  new_ends_at   timestamptz,
  new_title     text,
  new_location  text,
  created_at    timestamptz not null default now(),
  unique (event_id, occurrence_date)
);

-- event_notes — per-event note thread. (1) family_id added.
create table if not exists event_notes (
  id               uuid primary key default gen_random_uuid(),
  family_id        uuid not null references families(id) on delete cascade,
  event_id         uuid not null references events(id) on delete cascade,
  author_member_id uuid references family_members(id) on delete set null,
  body             text not null,
  created_at       timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- tasks / chores  (star_reward 0 = non-star task; rrule NULL = one-off)
-- ----------------------------------------------------------------------------
create table if not exists tasks (
  id          uuid primary key default gen_random_uuid(),
  family_id   uuid not null references families(id) on delete cascade,
  assigned_to uuid references family_members(id) on delete set null,
  title       text not null,
  description text,
  star_reward integer not null default 0 check (star_reward >= 0),
  due_date    date,
  rrule       text,
  exdates     date[] not null default '{}',
  is_active   boolean not null default true,
  created_at  timestamptz not null default now()
);

-- task_completions — actual completed instances. (1) family_id added.
-- (5) double-claim guards: unique(task_id, occurrence_date) for recurring +
--     partial unique index for one-off tasks where occurrence_date IS NULL
--     (NULLs are otherwise considered distinct by a plain UNIQUE constraint).
create table if not exists task_completions (
  id              uuid primary key default gen_random_uuid(),
  family_id       uuid not null references families(id) on delete cascade,
  task_id         uuid not null references tasks(id) on delete cascade,
  member_id       uuid not null references family_members(id) on delete cascade,
  occurrence_date date,
  star_awarded    integer not null default 0,
  completed_at    timestamptz not null default now(),
  unique (task_id, occurrence_date)
);
create unique index if not exists task_completions_oneoff_uidx
  on task_completions (task_id) where occurrence_date is null;

-- ----------------------------------------------------------------------------
-- rewards  (2) NO `stock` column.
-- ----------------------------------------------------------------------------
create table if not exists rewards (
  id         uuid primary key default gen_random_uuid(),
  family_id  uuid not null references families(id) on delete cascade,
  title      text not null,
  emoji      text,
  star_cost  integer not null check (star_cost >= 0),
  is_active  boolean not null default true,
  created_at timestamptz not null default now()
);

-- redemptions — a spend request. (1) family_id added.
create table if not exists redemptions (
  id         uuid primary key default gen_random_uuid(),
  family_id  uuid not null references families(id) on delete cascade,
  reward_id  uuid not null references rewards(id) on delete cascade,
  member_id  uuid not null references family_members(id) on delete cascade,
  star_cost  integer not null,
  status     text not null default 'pending'
             check (status in ('pending','approved','rejected','fulfilled')),
  created_at timestamptz not null default now()
);

-- star_ledger — SOURCE OF TRUTH for stars. (1) family_id added.
-- (6) redemption_id FK -> redemptions(id) ON DELETE SET NULL.
create table if not exists star_ledger (
  id            uuid primary key default gen_random_uuid(),
  family_id     uuid not null references families(id) on delete cascade,
  member_id     uuid not null references family_members(id) on delete cascade,
  delta         integer not null,
  reason        text not null,                 -- 'chore' | 'reward' | 'adjustment'
  redemption_id uuid references redemptions(id) on delete set null,
  created_at    timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- recurring_expenses  (Finance Lite)
-- ----------------------------------------------------------------------------
create table if not exists recurring_expenses (
  id         uuid primary key default gen_random_uuid(),
  family_id  uuid not null references families(id) on delete cascade,
  name       text not null,
  amount     numeric(12,2) not null check (amount >= 0),
  currency   text not null default 'USD',
  category   text,
  rrule      text,                          -- billing cycle (FREQ=MONTHLY/YEARLY/...)
  next_due   date,
  paid_by    uuid references family_members(id) on delete set null,
  is_active  boolean not null default true,
  created_at timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- Helpful indexes (cheap; keep read pipeline fast on the free tier)
-- ----------------------------------------------------------------------------
create index if not exists events_family_starts_idx on events (family_id, starts_at);
create index if not exists events_family_rrule_idx  on events (family_id) where rrule is not null;
create index if not exists event_overrides_event_idx on event_overrides (event_id);
create index if not exists event_notes_event_idx     on event_notes (event_id);
create index if not exists tasks_family_idx          on tasks (family_id);
create index if not exists task_completions_task_idx on task_completions (task_id);
create index if not exists star_ledger_member_idx    on star_ledger (member_id);
create index if not exists redemptions_member_idx    on redemptions (member_id);
create index if not exists recurring_expenses_family_idx on recurring_expenses (family_id);

-- ============================================================================
-- (4) ROW LEVEL SECURITY — every row scoped to the single owned family.
-- families keys on auth.uid(); all child tables key on current_family_id().
-- Policies are dropped-then-created so this block is re-runnable.
-- ============================================================================
alter table families           enable row level security;
alter table family_members     enable row level security;
alter table events             enable row level security;
alter table event_overrides    enable row level security;
alter table event_notes        enable row level security;
alter table tasks              enable row level security;
alter table task_completions   enable row level security;
alter table rewards            enable row level security;
alter table redemptions        enable row level security;
alter table star_ledger        enable row level security;
alter table recurring_expenses enable row level security;

drop policy if exists fam_self on families;
create policy fam_self on families
  using (auth_user_id = auth.uid())
  with check (auth_user_id = auth.uid());

do $$
declare t text;
begin
  foreach t in array array[
    'family_members','events','event_overrides','event_notes','tasks',
    'task_completions','rewards','redemptions','star_ledger','recurring_expenses'
  ]
  loop
    execute format('drop policy if exists fam_scope on %I;', t);
    execute format(
      'create policy fam_scope on %I using (family_id = current_family_id()) with check (family_id = current_family_id());',
      t);
  end loop;
end $$;

-- Table privileges (RLS restricts ROWS; roles still need table grants).
grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant execute on function current_family_id() to anon, authenticated;

-- ============================================================================
-- (5) ATOMIC STAR RPCs — SECURITY DEFINER, lock member row FOR UPDATE.
-- ============================================================================

-- Earn: complete a chore. Writes the completion always; writes the ledger +
-- bumps the cached balance only when star_reward > 0. Double-claims are blocked
-- by the unique guards (surfaced as 'already_completed').
create or replace function complete_task(
  p_task            uuid,
  p_member          uuid,
  p_occurrence_date date default null
) returns task_completions
language plpgsql
security definer
set search_path = public
as $$
declare
  v_member_family uuid;
  v_task_family   uuid;
  v_reward        integer;
  v_completion    task_completions;
begin
  -- lock the member row so balance updates serialize
  select family_id into v_member_family
    from family_members where id = p_member for update;
  if not found then raise exception 'member_not_found'; end if;

  select family_id, star_reward into v_task_family, v_reward
    from tasks where id = p_task;
  if not found then raise exception 'task_not_found'; end if;
  if v_task_family <> v_member_family then
    raise exception 'cross_family_violation';
  end if;

  begin
    insert into task_completions(family_id, task_id, member_id, occurrence_date, star_awarded)
    values (v_member_family, p_task, p_member, p_occurrence_date, greatest(coalesce(v_reward,0),0))
    returning * into v_completion;
  exception when unique_violation then
    raise exception 'already_completed';
  end;

  -- skip the ledger write entirely when the task awards no stars
  if coalesce(v_reward,0) > 0 then
    insert into star_ledger(family_id, member_id, delta, reason)
    values (v_member_family, p_member, v_reward, 'chore');
    update family_members set star_balance = star_balance + v_reward
      where id = p_member;
  end if;

  return v_completion;
end $$;

-- Spend: redeem a reward. Checks balance, inserts redemption + negative ledger
-- row (linked via redemption_id), decrements the cached balance — all atomic.
create or replace function redeem_reward(
  p_member uuid,
  p_reward uuid
) returns redemptions
language plpgsql
security definer
set search_path = public
as $$
declare
  v_member_family uuid;
  v_balance       integer;
  v_reward_family uuid;
  v_cost          integer;
  v_active        boolean;
  v_red           redemptions;
begin
  select family_id, star_balance into v_member_family, v_balance
    from family_members where id = p_member for update;
  if not found then raise exception 'member_not_found'; end if;

  select family_id, star_cost, is_active into v_reward_family, v_cost, v_active
    from rewards where id = p_reward;
  if not found then raise exception 'reward_not_found'; end if;
  if v_reward_family <> v_member_family then raise exception 'cross_family_violation'; end if;
  if not v_active then raise exception 'reward_inactive'; end if;
  if v_balance < v_cost then raise exception 'insufficient_stars'; end if;

  insert into redemptions(family_id, reward_id, member_id, star_cost, status)
  values (v_member_family, p_reward, p_member, v_cost, 'pending')
  returning * into v_red;

  insert into star_ledger(family_id, member_id, delta, reason, redemption_id)
  values (v_member_family, p_member, -v_cost, 'reward', v_red.id);

  update family_members set star_balance = star_balance - v_cost
    where id = p_member;

  return v_red;
end $$;

grant execute on function complete_task(uuid, uuid, date) to authenticated;
grant execute on function redeem_reward(uuid, uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- Realtime (M5 + M7): stream changes to clients (live leaderboard, calendar,
-- chores across devices).
-- ----------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array[
    'family_members','star_ledger','events','event_overrides','event_notes',
    'tasks','task_completions','rewards','redemptions','recurring_expenses'
  ]
  loop
    if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename=t) then
      execute format('alter publication supabase_realtime add table %I', t);
    end if;
  end loop;
end $$;
alter table family_members replica identity full;

-- ----------------------------------------------------------------------------
-- Health check (M8): lightweight RPC the daily keep-alive cron hits to keep the
-- free-tier project from pausing after 7 days of inactivity.
-- ----------------------------------------------------------------------------
create or replace function ping()
returns text language sql security definer set search_path = public
as $$ select 'ok'::text $$;
grant execute on function ping() to anon, authenticated;

-- ============================================================================
-- (7) IDEMPOTENT SEED — bind the family to the single shared auth user, then
-- create the 4 members. Run AFTER the one shared auth user exists.
-- ============================================================================
insert into families (auth_user_id, name)
select id, 'Our Family'
from auth.users
order by created_at asc
limit 1
on conflict (auth_user_id) do nothing;

with fam as (select id from families order by created_at asc limit 1)
insert into family_members (family_id, name, color, is_child, sort_order)
select fam.id, m.name, m.color, m.is_child, m.sort_order
from fam,
(values
  ('Parent1', 'blue',  false, 1),
  ('Parent2', 'green', false, 2),
  ('Child1',  'amber', true,  3),
  ('Child2',  'pink',  true,  4)
) as m(name, color, is_child, sort_order)
on conflict (family_id, name) do nothing;
