# Family Hub — Wall UI + Kid-First Chores
**Merged build spec · v2.0 · 9 August 2026**

Supersedes *Skylight-style Wall UI v1.0* and *Chores Benchmark & Fixes*. This is the single source of truth.

**Device:** Dell ST2220TC 22″ touch panel @ **1280×720 landscape**, Wyse 5070, Chromium kiosk.
**Secondary:** phones (existing layout preserved byte-for-byte).
**Constraint:** $0/mo — static hosting + Supabase free tier.
**Family:** Daddy 🥸 (teal) · Suzy 👩 (red) · **Nono ⛹️ 8, reads** (blue) · **Doma ⛹️ 5, does NOT read** (green).

---

## 0. What this document merges

Two proposals landed independently:

- **v1.0 Wall UI** — a Skylight-derived shell: rail, info bar, people strip, Schedule/Week/Month, Chores destination, Meals, Lists, countdowns, ambient, sleep, PIN. Strong on *layout and system*.
- **Chores benchmark** — child-HCI research on pre-readers, plus a code-level audit that found five live defects. Strong on *the 5-year-old and correctness*.

They agree on more than they disagree: both want chores promoted to their own destination, rewards folded in, morning/afternoon/evening grouping, tap-to-toggle completion, and a PIN on redemption. **Section 1 lists the eleven places where they conflicted and how each was resolved.** Everything after Section 1 is merged and final.

---

## 1. Conflict resolutions and amendments to v1.0

### A1 — The wall has no login. Kid Mode is a *takeover*, not a profile.
**Conflict:** v1.0 models the wall as a shared, identity-free family screen (Skylight's model). The chores feedback said "kid profiles should have access to chores only", which implies a per-person login.

**Resolution — three surfaces, not two:**

| Surface | Identity | Access |
|---|---|---|
| **Wall, shared** (≥1000px landscape) | none — no picker, no login | Everything on the rail. PIN gates destructive + value-bearing actions only. |
| **Kid Mode** (full-screen takeover, launched from a kid's avatar chip) | that one child | Their chores + their star board. No rail, no nav, no settings. Exits on 🏠 or 60 s idle. |
| **Phone** (<1000px) | existing profile picker | `is_child` profiles → chores only. Parents → everything. |

This is the right answer for both problems. A 5-year-old should never have to log in to tick a box, *and* he should never be one tap from the finance module. Identity-free shell + PIN + a dedicated takeover gets both.

### A2 — 1280×720 is 66.8 ppi. Redo the density math.
This resolution is **not** 1080p, and it changes every physical-size conclusion.

A 22″ 16:9 panel is **487 × 274 mm**. At 1280×720 that is **2.63 px/mm (66.8 ppi)** — pixels are ~1.5× physically larger than at 1920×1080.

| Element | px | mm | Verdict |
|---|---|---|---|
| WCAG 2.2 AA minimum (24 px CSS) | 24 | 9.1 | fails for this context |
| WCAG AAA / Apple HIG (44) | 44 | **16.7** | acceptable for adults |
| Accessible-kiosk floor | 53 | 20.0 | the real floor for a standing user |
| v1.0 chore row (44 px) | 44 | 16.7 | **OK for adults, raise to 56 px for kids** |
| **v1.0 tick circle (24 px)** | 24 | **9.1** | **fails — see A3** |
| Kid Mode card (target) | **120+** | **45.6+** | ✓ |
| v1.0 rail (104) / FAB (62) / person chip (176) | — | 39.5 / 23.6 / 66.9 | ✓ all fine |

**Verdict: v1.0's layout numbers survive almost intact at this resolution.** The single failure is the tap circle, which A3 removes anyway.

### A3 — Tap the whole row, never the circle.
**v1.0 §5.5:** *"Rows are 44 px minimum with a 24 px tap circle. Tap the circle → fills green."*

Vatavu, Cramariuc & Schipor (IJHCS 2015) measured 3–6 year-olds: **tap 98.7%**, double-tap 82.8%, single-touch drag 88.1% on a 10″ tablet and worse as path length grows. Woodward et al. (CHI 2016) found children 5–10 miss **23–24%** of targets, concentrated at the right and top edges and at targets with edge padding. A 9.1 mm circle inside a 16.7 mm row is a deliberate accuracy penalty for no benefit.

**Amendment:** the entire `.titem` row is the tap target. `.tick` becomes presentational (`pointer-events:none`). This also removes the need to think about the resistive panel's accuracy (v1.0 risk #4) — a 235×56 px row will register on anything.

### A4 — `uncomplete` needs a migration, not just a click handler.
**v1.0 §8** specifies *"Tap chore circle → Complete/uncomplete, optimistic, queued offline."* No such backend exists.

Today `uncompleteOcc()` (app.js:1392) is **defined and never called**, and it deletes the `task_completions` row **without touching `star_ledger` or `family_members.star_balance`** — so stars orphan and the ledger (the declared source of truth) drifts from the cache. Add the `uncomplete_task` RPC in §9.2.

**Critical detail:** reverse `task_completions.star_awarded`, *not* the task's current `star_reward`. Otherwise editing a chore's value retroactively corrupts every past balance.

### A5 — Redemption has no lifecycle.
`redemptions.status` already accepts `pending | approved | rejected | fulfilled` in the live schema — but the app writes `'pending'` once and **never updates it anywhere**. `redeem_reward` debits immediately, so a parent who says no has no way to give the stars back.

v1.0 §7.3 correctly PIN-gates the redeem button. That's necessary and not sufficient. Add `set_redemption_status` (§9.3) plus a parent queue in the rewards strip.

### A6 — Chores need an icon column.
The v1.0 mockup shows 🦷 🛏️ 📚 on every chore row, but `tasks` has **no emoji or icon column** in the live schema. Add `tasks.icon_url`, mirroring `family_members.avatar_url`: an emoji string, or an `http(s)`/`data:` URL.

Research ranks these: **parent-taken photograph > generic icon > emoji > text**. Otsimo's documented weakness is that "icons do not always correlate clearly to the word"; Goally and Choiceworks both sell parent-photo steps. Ship emoji first (zero cost), allow a photo URL from day one, and treat photos as the Kid Mode default.

### A7 — Chores need a routine band.
v1.0 §5.5 groups kid chores Morning/Afternoon/Evening but specifies no data for it. `tasks.due_time` exists but a clock time is the wrong abstraction for a 5-year-old — preschoolers grasp *predictable daily patterns*, not clock time (specific dates only become meaningful at 6–8). Add `tasks.time_band`, and derive a default from `due_time` where it's set.

### A8 — PIN storage: not `family_settings` as a plain table.
v1.0 §7.3 proposes a `family_settings` table holding a SHA-256 hash. With one shared auth user, any client can `select` that hash and brute-force 10,000 combinations offline in milliseconds.

**Amendment:** `family_settings` exists but has **no select policy**. Reads and writes happen only through `set_family_pin()` / `verify_family_pin()` SECURITY DEFINER RPCs (§9.4). The unlock window stays client-side — it's a nuisance barrier for kids, not a security boundary, and treating it as one is the mistake.

### A9 — "Lists" is the only rail item with no data model.
The live schema has `pantry_items`, `stores`, `shopping_items` (the Meals module's grocery flow) — and no general lists.

**Amendment:** add minimal `lists` + `list_items` tables, and render **Groceries as a pinned virtual card backed by the existing `shopping_items`**. This keeps v1.0 §5.6's meal→grocery push working with zero migration to the meals code, and avoids two competing grocery lists.

### A10 — "Up for grabs" must ask who.
v1.0 §5.5 adds unassigned chores claimable by anyone, "profile assigned at completion." On an identity-free wall there is nobody to assign.

**Amendment:** tapping an up-for-grabs chore opens a 4-avatar picker (one tap), then completes. This also fixes a latent bug: `completeOcc` (app.js:1386) currently falls back to `task.assigned_to || state.member.id`, which silently credits the wrong person for unassigned chores.

### A11 — Doma is not served by a 5-column text grid.
v1.0's Chores pane gives Doma a column of `emoji + title + star value` rows. Every product that shipped one UI for both ages ended up rated 6+ and unusable by the pre-reader — S'moresUp is rated 6+ because it "requires a basic set of reading skills"; Common Sense's Joon review says "pre-readers will need assistance."

**Amendment:** the 5-column grid is the **family/parent** view and stays exactly as specced. **Kid Mode (§7)** is added as a new phase — it is the reason this project exists for Doma.

---

## 2. Decisions locked

| Question | Decision |
|---|---|
| Default view on the wall | **Schedule**, starting on **today** |
| Rail | **4 destinations** — Calendar · Chores · Meals · Lists (+ Sleep, Settings pinned bottom) |
| Money | **Phone only.** Not on the rail. |
| Rewards | Folded into Chores as a top strip |
| Weather | **Out of scope** |
| Countdowns | **In scope** |
| Kid Mode | **In scope** — full-screen takeover for the pre-reader (A1, A11) |
| Wall identity | **None.** PIN gates destructive + value-bearing actions (A1, A8) |
| Completion gesture | **Tap the whole row/card. Toggles.** No swipe, double-tap, or hold (A3) |
| Confirmation | **Undo, not confirm** — except redemption, which is PIN-gated (A5) |

---

## 3. Design system

### 3.1 Identity colours — ink + tint
Derived from the existing 8 `COLORS`, split so dense grids stay legible from four metres. Solid saturated blocks turn to mud at that distance; tint-with-edge does not.

```css
--teal:#2E9C8E;   --teal-t:#DCF1EE;    /* Daddy 🥸 */
--red:#D4646B;    --red-t:#FBE4E5;     /* Suzy 👩  */
--blue:#4A86C8;   --blue-t:#E1EDF9;    /* Nono ⛹️  */
--green:#4FA35F;  --green-t:#E3F2E5;   /* Doma ⛹️  */
--amber:#D9932F;  --amber-t:#FBEEDA;
--purple:#8C6BC8; --purple-t:#EBE4F8;
--pink:#CF6FA4;   --pink-t:#F9E3EE;
--slate:#7A8794;  --slate-t:#E9EDF1;   /* unassigned / whole-family */
```
Existing `--bg #FBF7F0`, `--panel`, `--line`, `--accent #FF7A45`, `--star` unchanged. `colorFor()` gains a sibling `tintFor()`.

The warm cream theme is a genuine differentiator — it reads as a living room where Skylight's white reads as an appliance. Keep it. No dark mode; the ambient screen covers the night case.

### 3.2 Event pill
```
background: var(--{c}-t)
border-left: 3px solid var(--{c})
border-radius: 8px
title: 12px/700, single line, ellipsis
time:  10.5px/600 @ 72% opacity
badge: 16px ink circle, member initial — top-right (schedule) / bottom-right (grid)
```
**Chores use the identical pill with a dashed 1 px border instead of a fill.** That single difference separates "thing that happens" from "thing someone must do" with no legend.

### 3.3 Density & text size — device-local
```css
html[data-density="roomy"] { --row-h:68px; --pad:13px; --gap:8px; }   /* wall default */
html[data-density="cozy"]  { --row-h:56px; --pad:10px; --gap:6px; }
html[data-density="snug"]  { --row-h:44px; --pad:7px;  --gap:4px; }   /* phone default */
html[data-text="s"] { --fs-body:12px;   --fs-title:12px;   --fs-head:17px; }
html[data-text="m"] { --fs-body:13px;   --fs-title:12.5px; --fs-head:19px; }
html[data-text="l"] { --fs-body:15px;   --fs-title:14px;   --fs-head:22px; }
```
Both in `localStorage`. The wall wants Roomy/Large, a phone wants Snug/Medium, and they must not fight over the network.

**`snug` must never apply to a chore row or a Kid Mode card.** 44 px = 16.7 mm is fine for an adult on a phone and below the 20 mm kiosk floor for a child standing at the wall. Clamp kid-facing targets to ≥56 px regardless of density.

### 3.4 Touch targets (per A2)
- **44 px (16.7 mm)** minimum for anything an adult taps.
- **56 px (21.3 mm)** minimum for anything Nono or Doma taps — clears the 20 mm kiosk floor.
- **120 px (45.6 mm)** minimum for Kid Mode cards, with the hit region padded ~13 px (5 mm) beyond the visual edge.
- **Nothing tappable within 26 px (10 mm) of the top or right edge** — where children's misses concentrate.
- Never encode state in colour alone. "Done" = dimmed icon **+** filled ✓ **+** card recedes, at ≥3:1 non-text contrast (WCAG 1.4.11); text at AAA 7:1.

---

## 4. The shell

One breakpoint. **`@media (min-width:1000px) and (orientation:landscape)`** activates wall mode. Everything narrower keeps today's phone layout unchanged.

```
┌──────┬──────────────────────────────────────────────────────────────┐
│      │ Badawy Family · 7:50 PM · [🏖️ Trip to Alex · 12 days]        │ 56
│ rail │                    [Schedule|Day|Week|Month] [Filter] [Today] │
│ 104  ├──────────────────────────────────────────────────────────────┤
│  px  │ 🥸 Daddy 1/3 · 👩 Suzy 2/4 · ⛹️ Nono 3/4 · ⛹️ Doma 1/3        │ 52
│      ├──────────────────────────────────────────────────────────────┤
│      │                        active pane                       (＋)│ 612
└──────┴──────────────────────────────────────────────────────────────┘
```

**Rail — 104 px, icon + label, never collapses:** 🗓️ Calendar (default) · ✅ Chores · 🍽️ Meals · 📝 Lists · ⋮ · 🌙 Sleep · ⚙️ Settings. `#/hub` and the floating 🏠 stay, but only below the breakpoint. `navTabs()` gets a real implementation returning the rail in wall mode and nothing on phone.

**Info bar — 56 px:** family name (19/800) · clock (17/600) · **countdown chip** · spacer · view switcher (calendar panes only) · Filter · Today. The countdown chip sits where weather would have been; one countdown is static, several rotate every 8 s, tap opens the countdowns pane.

**People strip — 52 px:** the existing `.mchip` filter chips upgraded to carry a completion bar and an `n/m` fraction. Two jobs in one control — tap to filter the calendar, glance to see who still owes chores. The fraction is today's completed/assigned, a reduce over data already fetched by `taskCells()` and `fetchDoneMap()`, not a new query.

**New:** **long-press (600 ms) a kid's chip → Kid Mode** for that child (§7).

**FAB:** 62 px, bottom-right, 20 px inset. Context-aware — Calendar → new event, Chores → new chore, Meals → plan a meal, Lists → new item.

---

## 5. Calendar views

### 5.1 Schedule — the default, the hero
**Five day-columns starting on today** (count is a setting, 3–7; 5 suits 1176 px). Each column is header / scrollable body / **pinned footer**:

- **Header** — weekday small-caps, `MMM D` big, today gets an orange `TODAY` badge, a 3 px orange top rule, and a faintly warmer background.
- **Body** — all-day and countdown chips, then timed events as pills, then that day's chores as dashed pills.
- **Footer** — that night's **dinner** and a **`Chores n of m done`** line.

The footer is the argument for this view. The three questions actually asked in a kitchen are *what's happening*, *what's for dinner*, and *are the kids done* — this is the only layout that answers all three without a tap. It also degrades honestly: on a phone the columns stack into a scrolling day-sectioned agenda.

### 5.2 Week — the full time grid
The rewrite. 7 columns × hour rows, all-day strip pinned above the scroller, orange now-line, events absolutely positioned. Reuse `renderDayBody`'s geometry seven times: `top = (startHour - VIEW_START) * ROW_H`, `height = max(duration * ROW_H - 3, 26)`. Window 7 AM–9 PM, scrolled to 8 AM, scrollable to 24 h. Weekends shaded, past events at 55%, chores as dashed pills.

**Explicitly not doing Skylight's 4-events-per-cell cap.** A time grid doesn't need one — two overlaps split the column, three or more collapse to a `+N` chip at the right edge.

### 5.3 Day
Already correct. Widen to fill the pane, add a 280 px left sidebar: next three items, tonight's dinner, chore fractions. No other change.

### 5.4 Month
Keep `renderMonthBody`, restyle to the new pill tokens, **stop there.** Skylight's month view is their most-criticised screen and there is no version that works at this size. It's a "when is the school trip" reference view used monthly. Do not invest.

---

## 6. Chores — its own destination

### 6.1 Rewards strip (60 px, top)
One card per kid: avatar, star balance, next reward with a progress bar, and a **Redeem** button showing `n to go`, disabled until affordable.

**Plus (A5):** any `status='pending'` redemption renders as a parent action row — `🎁 Doma · Ice cream · [Fulfil] [Cancel]`. Fulfil → `fulfilled`. Cancel → `rejected` **and refunds the stars**. Both PIN-gated.

### 6.2 Columns
**"🙋 Up for grabs"** (unassigned, dashed borders) leftmost, then one column per member. Tapping an up-for-grabs chore opens a 4-avatar picker, then completes (A10).

Inside each column: **Morning / Afternoon / Evening** groups for kids (from `tasks.time_band`), flat "Today" for adults. **Today only** — no past, no future. Overdue from the last 3 days appears in a collapsed "Missed" group in **parent columns only**; never show a 5-year-old a backlog.

### 6.3 Rows
`icon · title · star value`, **56 px minimum, the entire row is the tap target** (A2, A3). `.tick` is a 24 px presentational glyph with `pointer-events:none`.

- Tap → complete. Optimistic, queued offline, `complete_task`.
- Tap again → **uncomplete**, via `uncomplete_task`, reversing the stars (A4). Same-day only.
- **1.5 s cooldown** on the row after each toggle — prevents double-tap flip-flop and rate-limits a rampage.
- Done state: icon dims, ✓ fills, title strikes, row recedes — three redundant signals.
- Card-local **~500 ms** burst on every tap; the full-screen `celebrate()` fires only when a whole group clears. Animated feedback cut children's uncertain re-taps from 238 → 21 in the CHI 2016 study, but heavy animation *slowed* 5–6 year-olds — so keep the per-tap one small and local.
- Reuse the existing `.starburst` / `.confetti` with their `prefers-reduced-motion` guards.

### 6.4 Economy guidance (configuration, not code)
- **2–4 tracked chores per child**, positively framed, pitched just above observed baseline. This is standard token-economy practice and the direct antidote to the category's #1 complaint (setup burden).
- **Doma redeems daily** — all his chores worth **1 star**, prizes cost 3, so the mapping is countable on fingers. Clinical guidance for 4–7 year-olds is daily exchange.
- **Nono banks weekly** toward a larger goal. Calibration: 5–10 stars per habit, 100+ for a big chore.
- **Never introduce response-cost** (docking stars for bad behaviour) in the initial design.
- Plan to **fade** Nono's economy rather than escalate it — rewards undermine intrinsic motivation only when perceived as controlling.

---

## 7. Kid Mode — the pre-reader takeover (NEW)

The reason this project matters for Doma. **Entry:** long-press a kid's chip in the people strip, or tap their avatar in the Chores rewards strip. On phone, an `is_child` profile lands here directly. **Exit:** 🏠 button (free, no PIN) or **60 s idle** → back to the wall's Calendar.

`family_members.chore_mode` ∈ `prereader | reader | adult`; null derives from `is_child`.

### 7.1 `prereader` layout (Doma)
```
┌────────────────────────────────────────────────────────┐
│  ⛹️  Doma            ⭐⭐☆   (glyphs, never a numeral)  │ 90
├────────────────────────────────────────────────────────┤
│   ☀️ Morning   │   🌤️ Afternoon   │   🌙 Evening       │ 76  ← auto-selects by clock
├────────────────────────────────────────────────────────┤
│   ┌────────┐   ┌────────┐   ┌────────┐                 │
│   │  📷    │   │  📷    │   │  📷    │   ← 180×180 px  │
│   │ 🔊     │   │ 🔊     │   │ 🔊     │      (68 mm)    │
│   └────────┘   └────────┘   └────────┘                 │ 
│      (max 6 cards, 2 rows of 3, 24 px gutters)      🏠 │
└────────────────────────────────────────────────────────┘
```
- **Photo or emoji fills the card.** Title text is present but small and secondary — he is not reading it.
- **🔊 button** speaks the title via `speechSynthesis` (zero backend, works offline once the voice is cached). Recorded parent audio is a later tier. **Audio must be independent of completion state** — First-Then Visual Schedule's shipped bug is that enabling its checklist disables audio.
- **Tap anywhere on the card** = toggle. Same rules as §6.3.
- **No dates, no clock times, no week, no "tomorrow."** Only the current band, others reachable but not default.
- Star board is **glyphs, not a number**: `⭐⭐☆` = 2 of 3. Filling all three shows the prize card; redeeming asks for the PIN.

### 7.2 `reader` layout (Nono)
Today's list, single column, 56 px rows, icons + numeric star count + a "3 of 5" progress bar. A 7-day streak strip is fine and motivating here. No edit affordances.

### 7.3 What Kid Mode cannot do
No rail, no Calendar/Meals/Lists/Finance, no Settings, no create/edit/delete of anything, no star-value editing, no reward creation. Redeem is available and PIN-gated.

---

## 8. Countdowns, ambient, sleep, PIN

### 8.1 Countdowns
A flag on an existing row (§9.5). Surfaces: **info-bar chip** (nearest; several rotate every 8 s) · **countdowns pane** (card grid, reached from the chip, not a rail item) · **all-day chips** in Schedule and Week on their date · **ambient glance card**.

Editor: a **Countdown** toggle in `openEventForm` plus an emoji field auto-suggested from the title by a ~20-entry keyword map (birthday → 🎂, trip/beach → 🏖️, school → 🎒, flight → ✈️). Not a model call — this has to work offline. Hide the toggle on past-dated events. **Compute days client-side from `starts_at` in `families.tz`; never store a day count.**

### 8.2 Ambient
After **N minutes idle** (setting, 1–15, default 5): dark warm gradient, `7:50` at 104 px/200, date beneath, then four glance cards — **Next up · Dinner tonight · Chores left · Countdown**. Tap anywhere to wake. **Re-fetch on wake regardless of realtime state.**

No photo slideshow in v1 — photos need storage, storage costs money, and the glance cards are more useful.

### 8.3 Sleep
Rail item → *Sleep now* or *Schedule*. Full **black, not dim**, between the set hours. Default 10 PM–6 AM. Device-local. Pair with the kiosk's DPMS so the backlight genuinely powers down.

### 8.4 PIN
4 digits, gating **destructive and value-bearing actions only**: delete event, delete chore, edit another member's chore, **redeem a reward**, **fulfil/cancel a redemption**, create/edit rewards, edit star values, and Settings.

**Adding is never gated.** You want the kids adding things — that is the whole point of a family screen.

5-minute unlock window, then re-lock. Storage per A8: `family_settings` with no select policy, accessed only through SECURITY DEFINER RPCs. Everything else in Settings (density, text size, sleep hours, idle timeout, schedule column count) stays in `localStorage` — it's per-device.

---

## 9. Migrations

Live schema verified against project `shnbrpvuzbkcqvxvvxlr` on 2026-08-09. `02-migration.sql` is **stale** — `tasks.kind`, `tasks.due_time`, `tasks.reminder_minutes`, `events.reminder_minutes`, `families.tz`, and the meals tables were added later and are not in that file. Trust the live schema.

### 9.1 `03-wall-ui.sql` — columns
```sql
-- chores: icon + routine band
alter table tasks add column if not exists icon_url  text;   -- emoji OR http(s)/data: URL, like family_members.avatar_url
alter table tasks add column if not exists time_band text
  check (time_band in ('morning','afternoon','evening'));

-- per-member chore UI mode; null => derive from is_child
alter table family_members add column if not exists chore_mode text
  check (chore_mode in ('prereader','reader','adult'));

-- countdowns (A/§8.1)
alter table events add column if not exists countdown       boolean not null default false;
alter table events add column if not exists countdown_emoji text;
create index if not exists events_countdown_idx on events (family_id, starts_at) where countdown;

-- backfill: derive band from due_time where present
update tasks set time_band =
  case when due_time <  '12:00' then 'morning'
       when due_time <  '17:00' then 'afternoon'
       else 'evening' end
 where time_band is null and due_time is not null and kind = 'chore';
```
No new RLS policies needed — `tasks`, `family_members` and `events` are already scoped by `current_family_id()`.

### 9.2 `uncomplete_task` (A4)
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
    update family_members
       set star_balance = greatest(0, star_balance - v_awarded)   -- clamp; stars may already be spent
     where id = p_member;
  end if;
end $$;
grant execute on function uncomplete_task(uuid, uuid, date) to authenticated;
```
Reverses `star_awarded` from the completion row, never the task's current `star_reward`. Clamps at 0 and logs the clamped delta so the ledger stays consistent with the cache.

### 9.3 `set_redemption_status` (A5)
```sql
create or replace function set_redemption_status(
  p_redemption uuid, p_status text
) returns redemptions
language plpgsql security definer set search_path = public as $$
declare v_r redemptions; v_family uuid;
begin
  if p_status not in ('approved','rejected','fulfilled') then
    raise exception 'bad_status'; end if;

  select * into v_r from redemptions where id = p_redemption for update;
  if not found then raise exception 'redemption_not_found'; end if;
  if v_r.status = p_status then return v_r; end if;                -- idempotent
  if v_r.status = 'rejected' then raise exception 'already_refunded'; end if;

  select family_id into v_family from family_members where id = v_r.member_id for update;

  if p_status = 'rejected' then                                    -- refund
    insert into star_ledger(family_id, member_id, delta, reason, redemption_id)
      values (v_family, v_r.member_id, v_r.star_cost, 'reward_refund', v_r.id);
    update family_members set star_balance = star_balance + v_r.star_cost
      where id = v_r.member_id;
  end if;

  update redemptions set status = p_status where id = p_redemption returning * into v_r;
  return v_r;
end $$;
grant execute on function set_redemption_status(uuid, text) to authenticated;
```

### 9.4 PIN (A8)
```sql
create table if not exists family_settings (
  family_id  uuid primary key references families(id) on delete cascade,
  pin_hash   text,
  pin_salt   text,
  updated_at timestamptz not null default now()
);
alter table family_settings enable row level security;
-- deliberately NO policy: no direct select/insert/update from clients.
-- All access goes through the SECURITY DEFINER functions below.

create or replace function set_family_pin(p_pin text)
returns void language plpgsql security definer set search_path = public, extensions as $$
declare v_family uuid; v_salt text;
begin
  v_family := current_family_id();
  if v_family is null then raise exception 'no_family'; end if;
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
  if v_hash is null then return true; end if;             -- no PIN set => unlocked
  return v_hash = encode(digest(v_salt || p_pin, 'sha256'), 'hex');
end $$;

grant execute on function set_family_pin(text), verify_family_pin(text) to authenticated;
```
Requires `pgcrypto` (`create extension if not exists pgcrypto with schema extensions;`). Verify it's enabled before running.

### 9.5 `04-lists.sql` (A9)
```sql
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
-- one policy each, matching the existing pattern exactly:
create policy lists_family      on lists      for all using (family_id = current_family_id()) with check (family_id = current_family_id());
create policy list_items_family on list_items for all using (family_id = current_family_id()) with check (family_id = current_family_id());
```
Groceries stays a **pinned virtual card** backed by `shopping_items` — do not migrate it.

---

## 10. Interaction rules

| Gesture | Behaviour |
|---|---|
| Swipe L/R | Next / previous period. **Conventional direction** — left drags the calendar forward. Not Skylight's inverted mapping. |
| Swipe U/D (grid) | Scroll time |
| Tap event | Open the **380 px right-hand side panel**, not a modal (§11) |
| **Tap chore row / Kid Mode card** | **Toggle** complete. Optimistic, queued offline, 1.5 s cooldown. |
| Long-press people-strip kid chip | Enter Kid Mode |
| Long-press + drag | Reorder list items and chores |
| Two-finger pinch | *Deferred* |
| Drag-to-reschedule | **Not in v1** |
| Double-tap, swipe-to-complete, hold-to-confirm | **Never** (A3) |

---

## 11. Two places to beat the reference

**Inline editing instead of modals.** Every edit today goes through `openEventForm` as a centred modal — on a 1280 px canvas that's a dialog blotting out the thing you're editing. Tap an event → a 380 px right-hand panel slides in, grid stays visible and interactive. Skylight uses full dialogs; there's no reason to inherit that.

**Chores genuinely on the calendar.** Skylight bolted on a "preview bar" because splitting tasks onto their own tab was a mistake. Lean all the way in: chores appear as dashed pills in Schedule and Week, *and* as progress in the people strip, *and* as a footer count per day. The calendar becomes the one screen worth looking at, which is the entire premise of a wall display.

---

## 12. Code touchpoints

| Area | Files / functions |
|---|---|
| **Hotfixes** | `clearMember`/`setMember` (app.js:47–48), `viewTasks` (1413), `choreWindow` (1421), `renderChoreMember` (1487, handlers 1568/1571), `completeOcc` (1386) |
| Shell | `styles.css` wall-mode block; new `renderShell(activePane)`; `navTabs()` → the rail |
| Info bar | new `renderInfoBar()`; clock on a 30 s `setInterval` |
| People strip | extend the `.mchip` block in `renderCalendar`; add long-press → Kid Mode |
| Schedule | new `renderScheduleBody()` — reuses `fetchInstances`, meals fetch, `taskCells` |
| Week | rewrite `renderWeekBody` on `renderDayBody` geometry |
| Chores | promote `renderTasksView` to its own route; merge `viewStars`+`viewRewards` into the rewards strip; drop `"tasks"` from `state.calView` |
| Kid Mode | new `viewKidMode(memberId)`; `speechSynthesis` wrapper |
| Countdowns | `03-wall-ui.sql`; toggle in `openEventForm`; `renderCountdowns()` |
| Ambient/sleep | new idle timer on `pointerdown`/`visibilitychange` |
| PIN | `family_settings` + `requirePin(action)` wrapper |
| Settings | extend `viewFamily` (`#/family`) with a Display section |
| SW | bump cache **v24 → v32**, one per phase |

`fetchInstances`, the RLS model, `complete_task`, `redeem_reward`, and the offline queue are **untouched** except where §9 adds to them.

---

## 13. Phases

| # | Scope | Done when |
|---|---|---|
| **W0** | **Hotfix.** `choreMember` reset + default-to-self + idle→picker; today-only phone chores; tap-row-to-complete + parent-only edit; kid gating on the hub. No new UI. | Doma taps his profile and sees *his* chores for *today*; tapping a chore completes it; Finance/Meals/Manage-family are invisible to him. |
| **W1** | **Shell.** Wall breakpoint, rail, info bar, people strip with progress. Existing views render unchanged inside it. | At 1280×720 the app fills the screen; all four rail destinations one tap away; phone layout provably unchanged. |
| **W2** | **Schedule view**, wall default. Columns, pinned dinner + chore footer, column-count setting. | Opening the wall shows 5 columns from today, with tonight's dinner and chore counts visible without scrolling. |
| **W3** | **Week time grid.** Rewrite, all-day strip, now-line, ink/tint pills, overlap handling. | A day with 4 overlapping events renders all 4 legibly, nothing hidden behind a swipe. |
| **W4** | **Chores destination.** Rewards strip, Up-for-grabs + avatar picker, bands, 56 px full-row targets, `icon_url`, `uncomplete_task`, redemption lifecycle, **PIN**. | Nono completes *and un-completes* a chore with stars reversing correctly; Suzy cancels a redemption and the stars come back; redeem asks for a PIN. |
| **W5** | **Kid Mode.** `chore_mode`, prereader + reader layouts, photo cards, `speechSynthesis`, glyph star board, idle exit. | Doma enters from his avatar, sees ≤6 photo cards for the current band, taps one to complete, hears the title read aloud, and is returned to the wall after 60 s. |
| **W6** | **Countdowns.** Migration, event toggle + emoji suggest, info-bar chip, pane, all-day chips. | "Trip to Alex" shows `12 days` in the info bar and on its date in Schedule and Week. |
| **W7** | **Ambient + Sleep + density.** Idle screen, sleep schedule, density and text-size settings. | Screen idles to ambient in 5 min, blanks at 10 PM, wakes on tap with fresh data. |
| **W8** | **Polish.** Side-panel editor replacing modals, Lists module, meal→grocery push, past-event dimming. | — |

**W0 ships today. W1 + W2 is the release that changes the wall.** Everything after is refinement.

---

## 14. Out of scope
Weather · photo slideshow · drag-to-reschedule · pinch-to-zoom hours · dark mode · AI import (photo/voice/email) · external calendar sync · response-cost star docking · photo-proof chore verification.

---

## 15. Risks

1. **1280×720 is tight.** 56 + 52 + 612 leaves Schedule columns 235 px. Works, but long titles ellipsize. Fallback: 4 columns at 294 px.
2. **Chromium kiosk emoji.** The entire kid-facing design leans on colour emoji — install `fonts-noto-color-emoji` on the Wyse box and **verify before W4**.
3. **`speechSynthesis` in kiosk Chromium.** Needs a voice package (`espeak-ng` or similar) on Debian and may require a user-gesture unlock. **Verify before W5**; fall back to silent if unavailable — never let a missing voice block completion.
4. **Realtime + ambient.** The idle screen must keep its subscription alive or wake stale. Re-fetch on wake regardless.
5. **Touch panel accuracy.** The ST2220TC is an optical panel. A3's full-row targets make this moot for chores, but verify the 44 px info-bar buttons register.
6. **Balance clamping.** `uncomplete_task` clamps at 0. If a child un-completes a chore whose stars are already spent, the ledger records the clamped delta — surface this in the parent view rather than hiding it.
7. **`02-migration.sql` is stale.** Never regenerate schema from it. Trust the live database.
