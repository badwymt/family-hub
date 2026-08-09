# MEGA PROMPT — Family Hub wall UI + kid-first chores

> Paste everything below the line into a fresh Claude Code / Cowork session with the
> `family calendar` folder connected. It is self-contained: it carries the verified
> schema, the code map, the locked decisions, and per-phase acceptance criteria.
> `Family-Hub-Wall-UI-Merged-Spec-v2.md` sits in the repo root and holds the visual
> detail; this prompt holds everything needed to *execute*.

---

## ROLE

You are implementing a multi-phase redesign of **Family Hub**, a private family calendar / chores / meals PWA that runs on a wall-mounted touchscreen in a kitchen and on the family's phones. You are working directly in the user's local repo at `/Users/Suzy/Documents/Claude/Projects/family calendar`.

Work **phase by phase, in order**. After each phase: state what changed, list the acceptance criteria and whether each passes, commit with a clear message, and **stop for review before starting the next phase** unless the user has said to run straight through.

---

## THE FAMILY, AND WHY THIS DESIGN IS THE WAY IT IS

Four members, one shared auth account:

| | Colour | Role |
|---|---|---|
| Daddy 🥸 | teal | parent |
| Suzy 👩 | red | parent |
| **Nono ⛹️, 8** | blue | child — **reads** |
| **Doma ⛹️, 5** | green | child — **does NOT read** |

**Doma is the binding constraint on the entire chore UI.** Every design decision below that looks unusual is downstream of a 5-year-old who cannot read a single word on the screen, standing in front of a wall panel. Benchmarking found that every mainstream chore app which used one UI for both ages ended up unusable by the younger child (S'moresUp is rated 6+ because it "requires a basic set of reading skills"; Common Sense's Joon review states "pre-readers will need assistance"). Do not collapse the two chore UIs into one to save effort. If you find yourself tempted, re-read this paragraph.

The research-backed rules that must survive implementation:

- **Tap only.** Children 3–6 succeed at tap 98.7% of the time, double-tap 82.8%, single-touch drag 88.1% on a 10″ tablet and worse as the path lengthens (Vatavu et al., IJHCS 2015). Tap *duration* varies from ~5 s at age 3 to ~1.5 s at age 5, so **any hold-to-confirm threshold will misfire on one of the two kids.** No swipe-to-complete, no double-tap, no long-press-to-confirm anywhere in the chore flow.
- **Tap the whole row/card, never a small circle.** Children 5–10 miss 23–24% of targets, concentrated at the right and top edges and at targets with edge padding (Woodward et al., CHI 2016).
- **Undo, not confirm.** Over-used confirmation dialogs breed reflexive click-through (NN/g). A confirm is also a second small target made of text Doma cannot read. Completion toggles. **Redemption is the one exception** — irreversible and consequential, so it gets a PIN.
- **Celebrate every successful tap, briefly and locally.** Animated touch feedback cut children's uncertain repeat-taps from 238 to 21 in the CHI 2016 study — it is error prevention, not decoration. But heavy animation *slowed* 5–6 year-olds, so per-tap feedback is ~500 ms and card-local; the full-screen burst fires only when a whole group clears.
- **No dates or clock times for Doma.** Preschoolers grasp predictable daily patterns ("after breakfast"), not calendar time; specific dates only become meaningful at 6–8. Use routine bands.
- **Never encode state in colour alone.** Done = dimmed icon **+** filled ✓ **+** row/card recedes.

---

## HARD INVARIANTS — violating any of these fails the phase

1. **The phone layout must not change.** All wall work lives behind `@media (min-width:1000px) and (orientation:landscape)`. Below that breakpoint the rendered output must be byte-identical to today, except for the W0 hotfixes which are deliberate cross-cutting bug fixes.
2. **`fetchInstances(start, end, mode)` is the single recurrence pipeline** (RRULE expand → subtract exdates → apply `event_overrides`). Every calendar view consumes it. **Do not fork it.** This is why the redesign is cheap.
3. **`star_ledger` is the source of truth; `family_members.star_balance` is a cache.** Every star mutation goes through a SECURITY DEFINER RPC that writes both atomically under a `FOR UPDATE` lock on the member row. **Never write `star_balance` directly from the client.**
4. **RLS: one policy per table**, scoped via the non-recursive `current_family_id()` SECURITY DEFINER helper. Child tables carry a denormalized `family_id`. Match this pattern exactly for any new table.
5. **The offline write queue must keep working.** It persists to `localStorage` and replays through RPCs. Any new mutation a kid can trigger must be queueable.
6. **No new paid services, no new runtime dependencies.** Static hosting + Supabase free tier. Vanilla JS, no build step, ES modules from esm.sh only.
7. **Bump the service-worker cache version once per phase** (`web/sw.js`), starting at **v24** for W0 and incrementing to v32 at W8. A phase that ships without a cache bump will not reach the wall.
8. **Never regenerate schema from `02-migration.sql` — it is stale.** See "Verified schema" below.

---

## VERIFIED FACTS — do not re-derive these, they were checked against the live DB and repo on 2026-08-09

### Stack
- `web/` — vanilla JS PWA, no build step: `index.html`, `app.js` (145 KB, hash router), `config.js`, `styles.css`, `sw.js` (cache **v23**).
- Supabase project **`shnbrpvuzbkcqvxvvxlr`** (`https://shnbrpvuzbkcqvxvvxlr.supabase.co`). One shared auth user; a client-side profile picker writes the selected member to `localStorage` under `fh_current_member` — **identity, not auth**.
- Deploy is the **user's** step (see `DEPLOY.md`). Do not attempt to deploy.
- **`02-migration.sql` is out of date.** `tasks.kind`, `tasks.due_time`, `tasks.reminder_minutes`, `events.reminder_minutes`, `families.tz`, and all the meals tables were added later and are missing from it.

### Live schema (public), verified
```
families(id, auth_user_id, name, created_at, tz)
family_members(id, family_id, name, color, avatar_url, is_child, star_balance, sort_order, created_at)
events(id, family_id, member_id, title, location, starts_at, ends_at, all_day, rrule, exdates, created_at, reminder_minutes)
event_overrides(id, family_id, event_id, occurrence_date, is_cancelled, new_starts_at, new_ends_at, new_title, new_location, created_at)
event_notes(id, family_id, event_id, author_member_id, body, created_at)
tasks(id, family_id, assigned_to, title, star_reward, due_date, rrule, exdates, is_active,
      created_at, description, kind DEFAULT 'chore', due_time, reminder_minutes)
task_completions(id, family_id, task_id, member_id, occurrence_date, star_awarded, completed_at)
rewards(id, family_id, title, emoji, star_cost, is_active, created_at)
redemptions(id, family_id, reward_id, member_id, star_cost,
            status DEFAULT 'pending' CHECK IN ('pending','approved','rejected','fulfilled'), created_at)
star_ledger(id, family_id, member_id, delta, reason, redemption_id, created_at)
recurring_expenses, pantry_items, stores, shopping_items, meals, push_subscriptions, reminders_log
```
Notes that matter:
- `tasks.assigned_to` (NOT `member_id`). `family_members.name` (NOT `display_name`).
- `tasks.kind` is `'chore'` by default; `kind = 'task'` means a calendar to-do. Chore views filter `kind !== 'task'`.
- **`redemptions.status` already accepts the full lifecycle** — the app just never writes anything but `'pending'`.
- **There is no `tasks.icon_url`, no `tasks.time_band`, no `family_members.chore_mode`, no `family_settings`, and no lists tables.** W4/W5/W8 add them.
- `families.tz` exists — use it for countdown day math.
- Emoji live in `family_members.name` in production data (e.g. name = "Doma ⛹️‍♂️", `avatar_url` NULL). `avatarHTML` falls back to the first character of `name`. This is real user data, not seed data.

### Code map (`web/app.js`, current line numbers)
```
22    const state = {familyId, members, membersById, member, viewMonth, selectedKey}
47-48 setMember / clearMember          ← W0 bug #1 lives here
49    go(route)
57-95 offline queue: loadPending, enqueueCompletion, flushQueue
157   render()  — hash router; needMember() guards
183   ensureHomeFab()
198   viewHub()          — the 4 tiles + Manage family + Sign out
263   viewPicker()
305   viewFamily()       — member CRUD
502   fetchInstances(winStart, winEnd, mode)   ← THE pipeline, do not fork
592   viewCalendar / 610 renderCalendar  (state.calView: day|week|month|tasks)
723   renderDayBody()    ← real hour grid; W3 reuses this geometry
821   renderWeekBody()   ← seven stacked chip lists; W3 rewrites this
857   renderMonthBody()
881   renderTasksView()
1020  openEventForm()    — modal; W8 replaces with a side panel
1254  taskCells() / 1269 overdueCells()
1288  openTaskItemForm()
1368  fetchTasks()
1375  fetchDoneMap()
1386  completeOcc()      ← earner fallback bug (A10)
1392  uncompleteOcc()    ← DEFINED BUT NEVER CALLED, and orphans stars
1398  taskOccurrences()
1413  viewTasks() / 1419 renderChores()
1421  choreWindow()      ← W0 bug #2: -14 to +28 days
1428  celebrate()        — 26 emoji across the viewport, 1.9 s
1439  renderChoreHome()  — member avatar grid (this one is correctly today-only)
1487  renderChoreMember()  ← handlers at 1568 (.check) and 1571 (.taskmain)
1599  openTaskForm()
1671-1684 fetchLeaderboard / fetchRewards / fetchRedemptions
1699  starBurst() / 1714 countUp()
1725  viewStars() / 1788 viewRewards()   ← W4 folds both into the rewards strip
2178  viewMeals()
```
`web/styles.css`: the **only** layout breakpoint is `@media(min-width:560px)` (re-centres a modal). `.content { max-width:560px }` at line 30 is why the app renders a 560 px phone column with ~360 px of empty cream on each side of the 1280 px panel. There are `prefers-reduced-motion` guards on `.starburst` (line 252) and `.confetti` (line 373) — preserve them.

### Physical geometry — the 22″ panel at 1280×720
487 × 274 mm ⇒ **2.63 px/mm (66.8 ppi)**. Pixels are ~1.5× physically larger than at 1080p.

| px | mm | meaning |
|---|---|---|
| 24 | 9.1 | below every standard — **never a tap target** |
| 44 | 16.7 | Apple HIG / WCAG AAA — OK for adults |
| 56 | 21.3 | clears the 20 mm accessible-kiosk floor — **minimum for anything a kid taps** |
| 120 | 45.6 | Kid Mode card minimum |
| 180 | 68.4 | Kid Mode card target |
| 26 | 10 | keep-out margin from the top and right edges |

---

## LOCKED DECISIONS — do not relitigate

| | |
|---|---|
| Wall default view | **Schedule**, starting on today |
| Rail | 4 destinations: Calendar · Chores · Meals · Lists (+ Sleep, Settings pinned bottom) |
| Money | **Phone only.** Never on the rail. |
| Rewards | Folded into Chores as a top strip. Not a rail item. |
| Weather | **Out of scope.** None anywhere. |
| Countdowns | In scope |
| Wall identity | **None** — no login, no picker on the wall. PIN gates destructive + value-bearing actions. |
| Kid Mode | A full-screen **takeover**, launched from a kid's avatar. Not a login. |
| Completion | Tap the whole row/card. **Toggles.** |
| Adding things | **Never PIN-gated.** The kids adding things is the point. |
| Theme | Warm cream `--bg #FBF7F0`, orange `--accent #FF7A45`. Light only, no dark mode. |
| Breakpoint | Exactly one: `@media (min-width:1000px) and (orientation:landscape)` |

Also out of scope: photo slideshow, drag-to-reschedule, pinch-to-zoom, AI import, external calendar sync, response-cost star docking, photo-proof verification.

---

# THE WORK

## W0 — Hotfix (do this first; it is independent of everything else)

Four live defects. No new UI. Ship it before touching the shell.

**W0.1 — Profile switch leaks the previous person's chores.**
`state.choreMember` is module-level in-memory state that is never reset when identity changes. `clearMember()` (app.js:48) only removes the `localStorage` key. Reproduction: Suzy opens Chores and taps her avatar → `state.choreMember = <Suzy>`. She switches profile. Doma taps his tile → hub greets "Hi Doma" correctly → he taps Chores → `state.choreMember` is still truthy → **Suzy's page renders**. Invisible on a phone (reload clears memory) and permanent on the wall, which never reloads. The guard at line 1415 doesn't help — it only nulls the value when the id is missing from `membersById`, and Suzy is a valid member.

Fix:
```js
const setMember   = (m) => { localStorage.setItem(MEMBER_KEY, JSON.stringify(m)); state.choreMember = m.id; };
const clearMember = () => { localStorage.removeItem(MEMBER_KEY); state.choreMember = null; };
// in viewTasks(), after the membersById guard:
if (!state.choreMember) state.choreMember = state.member.id;
```
Also add a **kiosk idle timeout**: after 30 s of no `pointerdown`, return to the profile picker (phone) — this makes the class of bug unable to recur. (On the wall after W1 this becomes "return to Calendar" instead.)

**W0.2 — 42 days of chore rows.**
`choreWindow()` (1421) spans **−14 to +28 days**, and `renderChoreMember()` expands every recurring task across it into one row per occurrence. One daily chore = 42 rows. `renderChoreHome()` (1439) already does this correctly with a today-only window — copy that. Add a separate collapsed **"Missed"** section for overdue occurrences from the last 3 days, using the existing `overdueCells()` (1269), and render it **only for non-child members**. Never show a 5-year-old a backlog.

**W0.3 — Tapping a chore opens the edit modal.**
Handlers at 1568/1571 are backwards: the ~30 px `.check` completes, the 90%-of-card `.taskmain` opens `openTaskForm`. Swap them. `.taskmain` toggles completion; add a trailing `✏️` button rendered **only when `!state.member.is_child`**; make `.check` a presentational glyph with `pointer-events:none` so there is exactly one tap target per row.

**W0.4 — Kid profiles can reach everything.**
When `state.member.is_child`: in `viewHub` hide the Calendar/Finance/Meals tiles, "Manage family" and "Sign out" (leave Chores); in `renderChoreMember` hide `+ Chore`, `+ Create reward`, the reward `edit` links and the new `✏️`; block `#/finance`, `#/meals`, `#/family` in the router by redirecting to `#/tasks`. This is a UI gate, not a security boundary — that's fine, it's a kitchen wall, and W4 adds the PIN.

**Acceptance:** Doma taps his profile → sees only his chores, only today, with no edit/add/settings affordances anywhere. Tapping a chore completes it. Switching from Suzy to Doma and back never shows the wrong person's list. Bump SW to **v24**.

---

## W1 — The wall shell

Add exactly one breakpoint. Inside it: the 104 px rail, the 56 px info bar, the 52 px people strip, and a 612 px pane. Existing views render unchanged inside the pane — **this phase moves no view logic.**

- `.content { max-width:560px }` must be neutralised in wall mode only.
- `navTabs()` (currently a no-op returning `""`) becomes the real rail in wall mode, `""` on phone.
- Rail: 🗓️ Calendar (default) · ✅ Chores · 🍽️ Meals · 📝 Lists · spacer · 🌙 Sleep · ⚙️ Settings. Icon + label, never collapses.
- Info bar: family name (19/800) · clock on a 30 s `setInterval` (17/600) · countdown chip slot (empty until W6) · spacer · view switcher (calendar panes only) · Filter · Today.
- People strip: upgrade the existing `.mchip` filter chips to carry a completion bar and an `n/m` fraction = today's chores done / assigned. Compute with a reduce over `taskCells()` + `fetchDoneMap()` output — **no new query.** Tap still toggles `state.hiddenMembers`.
- **FAB: 62 px, bottom-right, 20 px inset, above every pane, context-aware** — Calendar → new event, Chores → new chore, Meals → plan a meal, Lists → new item. Wall mode only; the phone keeps its existing big `+`.
- `#/hub` and the floating 🏠 survive, but render only below the breakpoint.
- Add the ink/tint colour tokens and `tintFor()` alongside `colorFor()`. Add the `data-density` / `data-text` custom-property blocks (the Settings UI for them lands in W7; default the wall to roomy/large via `localStorage`).

**Acceptance:** at 1280×720 the app fills the screen with no cream gutters; all four rail destinations are one tap away; the people strip shows correct `n/m` fractions; **a phone-width screenshot is pixel-identical to before this phase.** SW **v25**.

---

## W2 — Schedule view (the wall default)

New `renderScheduleBody()`. Five day-columns starting **today** (count configurable 3–7). Each column: header / scrollable body / **pinned footer**.

- Header: weekday small-caps, `MMM D` large, today gets an orange `TODAY` badge, a 3 px orange top rule and a faintly warmer background.
- Body: all-day + countdown chips, then timed events as ink/tint pills in time order, then that day's chores as the **same pill with a dashed 1 px border and no fill**.
- **Footer: that night's dinner + `Chores n of m done`.** This footer is the entire argument for the view — a kitchen asks *what's happening*, *what's for dinner*, *are the kids done*, and nothing else answers all three without a tap.
- Consumes `fetchInstances`, the meals fetch and `taskCells` — no new data layer.
- Register `schedule` in `state.calView` and make it the wall default. On phone the columns stack into a scrolling day-sectioned agenda.

**W2.2 — Day, Month and Meals reflow.** The other three panes must not look abandoned next to Schedule:
- **Day** — `renderDayBody` is already correct. Widen it to fill the pane and add a **280 px left sidebar**: next three items, tonight's dinner, and the per-member chore fractions. No other change to the hour grid.
- **Month** — keep `renderMonthBody` as-is structurally; **restyle only** to the new ink/tint pill tokens so it doesn't look like a different app. Then stop. Skylight's month view is their most-criticised screen and there is no version that works at 235 px per cell. It is a "when is the school trip" reference view used monthly, not daily. **Do not invest further** and do not add a "+N more" affordance beyond what exists.
- **Meals** — reflow the existing `#/meals` into the pane as 7 columns × up to 4 meal rows; tap a cell to plan or edit, `＋` on empties. Data layer untouched. (The meal→grocery push lands in W8.)

**Acceptance:** opening the wall shows 5 columns from today with tonight's dinner and chore counts visible without scrolling; Day, Month and Meals each fill the pane and share the pill tokens. SW **v26**.

---

## W3 — Week time grid

Rewrite `renderWeekBody` (currently seven stacked chip lists). 7 columns × hour rows, all-day strip pinned above the scroller, orange now-line, events absolutely positioned. Reuse `renderDayBody`'s geometry seven times: `top = (startHour - VIEW_START) * ROW_H`, `height = max(duration * ROW_H - 3, 26)`. Window 7 AM–9 PM, scrolled to 8 AM on load, scrollable to 24 h. Weekends shaded, past events at 55% opacity, chores as dashed pills inline.

**Do not copy Skylight's 4-events-per-cell cap** — it is their most-criticised behaviour. Two overlapping events split the column width; three or more collapse to a `+N` chip at the right edge.

**Acceptance:** a day with 4 overlapping events renders all 4 legibly with nothing hidden behind a swipe. SW **v27**.

---

## W4 — Chores destination + stars correctness + PIN

The biggest phase. Promote chores off the calendar switcher onto the rail (drop `"tasks"` from `state.calView`), and fix the star economy's correctness holes.

### W4.1 Migration `03-wall-ui.sql`
```sql
alter table tasks add column if not exists icon_url  text;   -- emoji OR http(s)/data: URL
alter table tasks add column if not exists time_band text
  check (time_band in ('morning','afternoon','evening'));
alter table family_members add column if not exists chore_mode text
  check (chore_mode in ('prereader','reader','adult'));
update tasks set time_band =
  case when due_time < '12:00' then 'morning'
       when due_time < '17:00' then 'afternoon' else 'evening' end
 where time_band is null and due_time is not null and kind = 'chore';
```
No new RLS policies — these tables are already scoped by `current_family_id()`.

### W4.2 `uncomplete_task` RPC
`uncompleteOcc()` at app.js:1392 exists, is never called, and deletes the completion row **without touching `star_ledger` or `star_balance`** — stars would orphan and the ledger would drift from the cache. Add a proper mirror of `complete_task`:
```sql
create or replace function uncomplete_task(
  p_task uuid, p_member uuid, p_occurrence_date date default null
) returns void
language plpgsql security definer set search_path = public as $$
declare v_family uuid; v_awarded integer; v_id uuid; v_bal integer;
begin
  select family_id, star_balance into v_family, v_bal
    from family_members where id = p_member for update;
  if not found then raise exception 'member_not_found'; end if;

  select id, star_awarded into v_id, v_awarded
    from task_completions
   where task_id = p_task and member_id = p_member
     and occurrence_date is not distinct from p_occurrence_date
   for update;
  if not found then return; end if;                    -- idempotent replay

  delete from task_completions where id = v_id;

  if coalesce(v_awarded,0) > 0 then
    insert into star_ledger(family_id, member_id, delta, reason)
      values (v_family, p_member, -least(v_awarded, v_bal), 'chore_undo');
    update family_members set star_balance = greatest(0, star_balance - v_awarded)
     where id = p_member;
  end if;
end $$;
grant execute on function uncomplete_task(uuid, uuid, date) to authenticated;
```
**Three things you must get right:**
- Reverse `task_completions.star_awarded`, **never** the task's current `star_reward` — otherwise editing a chore's value retroactively corrupts every past balance.
- Add an `uncomplete_task` op type to the offline queue (`enqueueCompletion` / `flushQueue`, lines 57–95). Enqueueing an undo must **cancel a still-pending complete** for the same `task|occurrence` cell rather than stacking both ops.
- Balance clamps at 0 (stars may already be spent) and the ledger records the *clamped* delta so cache and ledger stay consistent. Surface any clamp in the parent view rather than hiding it.

Restrict undo to **same-day** completions in the client.

### W4.3 Redemption lifecycle
`redemptions.status` already accepts `pending|approved|rejected|fulfilled`, but the app writes `'pending'` once and never updates it — and `redeem_reward` debits immediately, so a parent who says no has no way to return the stars.
```sql
create or replace function set_redemption_status(p_redemption uuid, p_status text)
returns redemptions
language plpgsql security definer set search_path = public as $$
declare v_r redemptions; v_family uuid;
begin
  if p_status not in ('approved','rejected','fulfilled') then raise exception 'bad_status'; end if;
  select * into v_r from redemptions where id = p_redemption for update;
  if not found then raise exception 'redemption_not_found'; end if;
  if v_r.status = p_status  then return v_r; end if;              -- idempotent
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
```

### W4.4 PIN
```sql
create extension if not exists pgcrypto with schema extensions;   -- verify first
create table if not exists family_settings (
  family_id uuid primary key references families(id) on delete cascade,
  pin_hash text, pin_salt text, updated_at timestamptz not null default now()
);
alter table family_settings enable row level security;
-- DELIBERATELY NO POLICY. All access via the SECURITY DEFINER functions below.
```
Plus `set_family_pin(p_pin text)` and `verify_family_pin(p_pin text) returns boolean` (SECURITY DEFINER, `search_path = public, extensions`, salted SHA-256, `p_pin !~ '^[0-9]{4}$'` rejected, **no PIN set ⇒ returns true / unlocked**). Full bodies are in §9.4 of the merged spec.

**Why not a plain table:** with one shared auth user, any client could `select` the hash and brute-force 10,000 combinations offline. No select policy + definer-only access closes that. The 5-minute unlock window stays client-side — it's a nuisance barrier for kids, not a security boundary, and treating it as one is the mistake.

Add a `requirePin(action)` wrapper. It gates: delete event, delete chore, edit another member's chore, **redeem**, **fulfil/cancel a redemption**, create/edit rewards, edit star values, Settings. **Adding is never gated.**

**Scope setting (from v1.0 §7.3):** store a device-local `pinScope` ∈ `modify | add+modify | off`. Default **`modify`** — which is the policy above. `add+modify` additionally gates creating events and chores, for families who want it; `off` disables the PIN entirely. The unlock window is device-local too, **default 5 min, configurable 1–10** in W7's Settings. Implement the setting now even though the default never exercises the `add+modify` branch — retrofitting a scope into a hardcoded gate later is worse.

### W4.5 The Chores pane
- **Rewards strip (60 px, top):** one card per kid — avatar, star balance, next reward with progress bar, **Redeem** button showing `n to go` and disabled until affordable. Plus a parent action row for every `pending` redemption: `🎁 Doma · Ice cream · [Fulfil] [Cancel]`, both PIN-gated; Cancel refunds. Fold `viewStars` (1725) and `viewRewards` (1788) in here and retire them.
- **Columns:** `🙋 Up for grabs` (unassigned, dashed) leftmost, then one per member. **Tapping an up-for-grabs chore opens a 4-avatar picker, then completes** — this also fixes a latent bug where `completeOcc` (1386) falls back to `task.assigned_to || state.member.id` and silently credits the wrong person.
- Kid columns group by `time_band` (Morning / Afternoon / Evening); adult columns are a flat "Today". **Today only.** Overdue goes in a collapsed "Missed" group in parent columns only.
- **Rows: 56 px minimum, the entire row is the tap target.** `.tick` is a 24 px presentational glyph, `pointer-events:none`. Layout: `icon_url · title · star value`.
- Tap toggles. **1.5 s cooldown** on the row after each toggle — prevents double-tap flip-flop and rate-limits a rampage.
- Card-local ~500 ms burst per tap; the existing full-screen `celebrate()` (1428) fires only when a whole group clears. Preserve the `prefers-reduced-motion` guards.
- Add an `icon_url` field to `openTaskForm` (emoji picker + "paste a photo URL") and a `time_band` selector.

**Acceptance:** Nono completes a chore and stars go up; taps again and the *same* number comes back off, with a matching `chore_undo` ledger row. Suzy cancels a pending redemption and the stars return with a `reward_refund` row. Redeem asks for a PIN; adding a chore does not. An up-for-grabs chore credits whoever the picker selected. Bump SW **v28**.

---

## W5 — Kid Mode (the pre-reader takeover)

**This is the phase that makes the app work for Doma.** Do not merge it into W4's grid.

**Entry:** long-press (600 ms) a kid's chip in the people strip, or tap their avatar in the rewards strip. On phone, an `is_child` profile lands here directly. **Exit:** a 🏠 button (free, no PIN) or **60 s idle** → back to the wall's Calendar.

`family_members.chore_mode` ∈ `prereader | reader | adult`; null derives from `is_child`. Add the selector to `viewFamily`.

### `prereader` (Doma)
```
┌────────────────────────────────────────────────────────┐
│  ⛹️  Doma                    ⭐⭐☆                      │ 90   ← glyphs, NEVER a numeral
├────────────────────────────────────────────────────────┤
│   ☀️ Morning  │  🌤️ Afternoon  │  🌙 Evening           │ 76   ← auto-selects by clock
├────────────────────────────────────────────────────────┤
│   ┌────────┐  ┌────────┐  ┌────────┐                   │
│   │  📷    │  │  📷    │  │  📷    │   180×180 px       │
│   │  🔊    │  │  🔊    │  │  🔊    │   (68 mm)          │
│   └────────┘  └────────┘  └────────┘                   │
│      max 6 cards · 2×3 · 24 px gutters             🏠  │
└────────────────────────────────────────────────────────┘
```
- **The photo or emoji fills the card.** Title text is present but small and secondary — he is not reading it. Card ≥180×180 px with the hit region padded ~13 px beyond the visual edge.
- **🔊 speaks the title via `speechSynthesis`.** Zero backend, works offline once the voice is cached. Recorded parent audio is a later tier. **Audio must be completely independent of completion state** — First-Then Visual Schedule's shipped bug is that enabling its checklist disables audio; do not repeat it.
- Tap anywhere on the card toggles. Same 1.5 s cooldown, same 500 ms local burst, same three-signal done state (photo greys + big ✓ + card recedes).
- **No dates, no clock times, no week, no "tomorrow."** Only the current band by default; the other two are reachable but not shown first.
- Star board is **glyphs**: `⭐⭐☆` = 2 of 3. All three filled reveals the prize card; redeeming asks for the PIN.
- Configure Doma's chores as **1 star each, prizes cost 3**, so the mapping is countable on fingers. Clinical guidance for 4–7 year-olds is *daily* redemption.

### `reader` (Nono)
Today's list, single column, 56 px rows, `icon · title · numeric stars`, a "3 of 5" progress bar, and a 7-day streak strip. No edit affordances.

### Cannot do in Kid Mode
No rail, no Calendar/Meals/Lists/Finance, no Settings, no create/edit/delete, no star-value editing, no reward creation. Redeem only, PIN-gated.

**Verify before starting:** `fonts-noto-color-emoji` and a `speechSynthesis` voice package are installed on the Wyse box. If no voice is available, **fall back to silent — never let a missing voice block completion.**

**Acceptance:** Doma enters from his avatar, sees ≤6 photo cards for the current band and nothing else, taps one to complete, hears the title read aloud, and is returned to the wall after 60 s idle. There is no path from Kid Mode to any other module. SW **v29**.

---

## W6 — Countdowns

```sql
alter table events add column if not exists countdown       boolean not null default false;
alter table events add column if not exists countdown_emoji text;
create index if not exists events_countdown_idx on events (family_id, starts_at) where countdown;
```
No new table, no new policy — `events` is already scoped.

Surfaces: **info-bar chip** (nearest upcoming; several rotate every 8 s; tap opens the pane) · **countdowns pane** (card grid, reached from the chip, *not* a rail item) · **all-day chips** on their date in Schedule and Week · **ambient glance card** (W7).

Editor: a **Countdown** toggle in `openEventForm` plus an emoji field auto-suggested from the title by a ~20-entry keyword map (birthday → 🎂, trip/beach → 🏖️, school → 🎒, flight → ✈️). **Not a model call — this has to work offline.** Hide the toggle on past-dated events.

**Compute days client-side from `starts_at` in `families.tz`. Never store a day count.**

**Acceptance:** "Trip to Alex" shows `12 days` in the info bar and as an all-day chip on its date in both Schedule and Week. SW **v30**.

---

## W7 — Ambient, sleep, density

**Ambient** — after N minutes idle (setting 1–15, default 5): dark warm gradient, `7:50` at 104 px/200 weight, date beneath, then four glance cards — **Next up · Dinner tonight · Chores left · Countdown**. Tap anywhere to wake. Idle timer on `pointerdown` + `visibilitychange`. **Re-fetch on wake regardless of realtime subscription state** — the subscription may have gone stale. No photo slideshow (storage costs money; the glance cards are more useful).

**Suppress ambient while a detail surface is open** — Skylight's one genuinely thoughtful detail is that their screensaver never fires while a recipe is on screen. Generalise it: ambient does not trigger while a modal, the side panel, a meal/recipe detail, or **Kid Mode** is open. Someone reading a recipe or a 5-year-old deciding which chore to tap is *using* the screen even with no touches.

Also fold in W0's `KIOSK_IDLE_MS` — retarget it to the wall's Calendar (not the phone picker) and expose it as the same setting.

**Sleep** — rail item → *Sleep now* / *Schedule*. Full **black, not dim**, between the set hours. Default 10 PM–6 AM. Device-local. Pair with the kiosk's DPMS so the backlight actually powers down.

**Settings** — extend `viewFamily` (`#/family`) with a Display section: density (**roomy / cozy / snug** — three levels, per v1.0 §3.3), text size (s/m/l), sleep hours, idle timeout (1–15 min), PIN scope and unlock window (1–10 min), schedule column count (3–7). **All `localStorage`** — per-device, so the wall's roomy/large never fights a phone's snug/medium. Settings itself is PIN-gated.

```css
html[data-density="roomy"] { --row-h:68px; --pad:13px; --gap:8px; }   /* wall default */
html[data-density="cozy"]  { --row-h:56px; --pad:10px; --gap:6px; }
html[data-density="snug"]  { --row-h:44px; --pad:7px;  --gap:4px; }   /* phone default */
```
Note the interaction with the touch-target floor: **`snug` must never apply to a chore row or a Kid Mode card.** 44 px is 16.7 mm — fine for an adult on a phone, below the 20 mm kiosk floor for a child standing at the wall. Clamp kid-facing rows to ≥56 px regardless of density.

**Acceptance:** the screen idles to ambient in 5 minutes, blanks at 10 PM, wakes on tap with fresh (not stale) data; density and text size visibly change the wall and do not affect a phone. SW **v31**.

---

## W8 — Polish

- **Side-panel editor replacing modals.** Tap an event → a 380 px right-hand panel slides in; the grid stays visible and interactive. On a 1280 px canvas a centred modal blots out the thing being edited.
- **Lists module.** New `lists` + `list_items` tables with one RLS policy each matching the existing pattern (full SQL in §9.5 of the merged spec). Render **Groceries as a pinned virtual card backed by the existing `shopping_items`** so the meal→grocery loop keeps working with no migration to the meals code and there is never a second competing grocery list.
- **Meal → grocery push:** "Add ingredients to Groceries" on the meal editor.
- Past-event dimming to 55%; long-press + drag to reorder list items and chores.

SW **v32**.

---

## VERIFICATION PROTOCOL — run after every phase

1. **Phone regression.** Render at 390×844 and confirm the layout is unchanged from before the phase. This is the invariant most likely to break silently.
2. **Wall render.** Render at 1280×720 and confirm the pane fills the screen with no cream gutters.
3. **Offline.** Toggle offline, complete and un-complete a chore, reload, come back online, confirm the queue replays and the ledger matches the cached balance.
4. **Star arithmetic.** After any phase touching stars, run
   `select member_id, sum(delta) from star_ledger group by 1` and compare to `family_members.star_balance`. **They must match exactly.** If they diverge, stop and fix before proceeding.
5. **RLS.** After any migration, confirm every new table has exactly one policy scoped by `current_family_id()`, and that `family_settings` has **none**.
6. **Reduced motion.** Confirm `prefers-reduced-motion` still suppresses `.starburst` and `.confetti`.
7. **Kid gate.** Confirm no path exists from a child profile or Kid Mode to Finance, Meals, Manage family, or Settings.
8. **SW cache bumped**, and `DEPLOY.md` still accurate.

---

## ANTI-GOALS — do these and the phase is wrong

- Swipe-to-complete, double-tap, or hold-to-confirm anywhere in the chore flow.
- A tap target smaller than 44 px for adults or 56 px for kids.
- A confirmation dialog on chore completion.
- Showing Doma a date, a clock time, a week, or more than 6 cards at once.
- One chore UI shared between an 8-year-old and a 5-year-old.
- Writing `family_members.star_balance` from the client.
- Forking `fetchInstances`.
- Changing the phone layout.
- Reversing stars from `tasks.star_reward` instead of `task_completions.star_awarded`.
- A `select` policy on `family_settings`.
- Copying Skylight's inverted swipe direction, their 4-events-per-cell cap, or their 3-events-per-day month view.
- Investing in Month view.
- Adding weather.
- Deploying. That's the user's step.

---

## START HERE

Read `Family-Hub-Wall-UI-Merged-Spec-v2.md` in the repo root for the visual detail behind any decision above. Then confirm you can see `web/app.js`, `web/styles.css` and `web/sw.js`, state which phase you're starting, and begin with **W0**.
