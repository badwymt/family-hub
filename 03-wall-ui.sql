-- ============================================================================
-- 03-wall-ui.sql — W4 (applied to shnbrpvuzbkcqvxvvxlr 2026-08-09)
-- NOTE: 02-migration.sql is STALE. Trust the live schema, not that file.
-- ============================================================================

-- ---- columns ---------------------------------------------------------------
alter table tasks add column if not exists icon_url  text;   -- emoji OR http(s)/data: URL
alter table tasks add column if not exists time_band text;
do $$ begin alter table tasks add constraint tasks_time_band_chk
  check (time_band in ('morning','afternoon','evening'));
exception when duplicate_object then null; end $$;

alter table family_members add column if not exists chore_mode text;
do $$ begin alter table family_members add constraint fm_chore_mode_chk
  check (chore_mode in ('prereader','reader','adult'));
exception when duplicate_object then null; end $$;

update tasks set time_band =
  case when due_time < time '12:00' then 'morning'
       when due_time < time '17:00' then 'afternoon' else 'evening' end
 where time_band is null and due_time is not null and kind = 'chore';

-- ---- uncomplete_task -------------------------------------------------------
-- Reverses task_completions.star_awarded, NEVER the task's current star_reward:
-- otherwise editing a chore's value retroactively corrupts every past balance.
-- Clamps at 0 (stars may already be spent) and records the CLAMPED delta so the
-- ledger and the cached balance stay reconcilable.
create or replace function uncomplete_task(
  p_task uuid, p_member uuid, p_occurrence_date date default null
) returns void
language plpgsql security definer set search_path = public as $$
declare v_family uuid; v_awarded integer; v_id uuid; v_bal integer; v_delta integer;
begin
  select family_id, star_balance into v_family, v_bal
    from family_members where id = p_member for update;
  if not found then raise exception 'member_not_found'; end if;
  select id, star_awarded into v_id, v_awarded
    from task_completions
   where task_id = p_task and member_id = p_member
     and occurrence_date is not distinct from p_occurrence_date for update;
  if not found then return; end if;                    -- idempotent replay
  delete from task_completions where id = v_id;
  if coalesce(v_awarded, 0) > 0 then
    v_delta := least(v_awarded, greatest(v_bal, 0));
    if v_delta > 0 then
      insert into star_ledger(family_id, member_id, delta, reason)
        values (v_family, p_member, -v_delta, 'chore_undo');
      update family_members set star_balance = star_balance - v_delta where id = p_member;
    end if;
  end if;
end $$;
grant execute on function uncomplete_task(uuid, uuid, date) to authenticated;

-- ---- redemption lifecycle --------------------------------------------------
create or replace function set_redemption_status(p_redemption uuid, p_status text)
returns redemptions
language plpgsql security definer set search_path = public as $$
declare v_r redemptions; v_family uuid;
begin
  if p_status not in ('approved','rejected','fulfilled') then raise exception 'bad_status'; end if;
  select * into v_r from redemptions where id = p_redemption for update;
  if not found then raise exception 'redemption_not_found'; end if;
  if v_r.status = p_status then return v_r; end if;
  if v_r.status = 'rejected' then raise exception 'already_refunded'; end if;
  select family_id into v_family from family_members where id = v_r.member_id for update;
  if p_status = 'rejected' then
    insert into star_ledger(family_id, member_id, delta, reason, redemption_id)
      values (v_family, v_r.member_id, v_r.star_cost, 'reward_refund', v_r.id);
    update family_members set star_balance = star_balance + v_r.star_cost where id = v_r.member_id;
  end if;
  update redemptions set status = p_status where id = p_redemption returning * into v_r;
  return v_r;
end $$;
grant execute on function set_redemption_status(uuid, text) to authenticated;

-- ---- PIN -------------------------------------------------------------------
-- ONE shared auth user means a readable hash is brute-forceable offline in
-- milliseconds. family_settings therefore has RLS and NO POLICY AT ALL — access is
-- only ever through the SECURITY DEFINER functions below.
create table if not exists family_settings (
  family_id  uuid primary key references families(id) on delete cascade,
  pin_hash   text, pin_salt text,
  updated_at timestamptz not null default now()
);
alter table family_settings enable row level security;
revoke all on family_settings from anon, authenticated;

create or replace function set_family_pin(p_pin text)
returns void language plpgsql security definer set search_path = public, extensions as $$
declare v_family uuid; v_salt text;
begin
  v_family := current_family_id();
  if v_family is null then raise exception 'no_family'; end if;
  if p_pin is null or p_pin = '' then delete from family_settings where family_id = v_family; return; end if;
  if p_pin !~ '^[0-9]{4}$' then raise exception 'bad_pin'; end if;
  v_salt := encode(gen_random_bytes(16), 'hex');
  insert into family_settings(family_id, pin_hash, pin_salt)
  values (v_family, encode(digest(v_salt || p_pin, 'sha256'), 'hex'), v_salt)
  on conflict (family_id) do update
    set pin_hash = excluded.pin_hash, pin_salt = excluded.pin_salt, updated_at = now();
end $$;

create or replace function verify_family_pin(p_pin text)
returns boolean language plpgsql security definer set search_path = public, extensions as $$
declare v_family uuid; v_hash text; v_salt text;
begin
  v_family := current_family_id();
  if v_family is null then return false; end if;
  select pin_hash, pin_salt into v_hash, v_salt from family_settings where family_id = v_family;
  if v_hash is null then return true; end if;               -- no PIN set => unlocked
  return v_hash = encode(digest(v_salt || coalesce(p_pin,''), 'sha256'), 'hex');
end $$;

create or replace function has_family_pin()
returns boolean language sql security definer set search_path = public as $$
  select exists(select 1 from family_settings
                 where family_id = current_family_id() and pin_hash is not null);
$$;
grant execute on function set_family_pin(text), verify_family_pin(text), has_family_pin() to authenticated;
