# Family Hub — Skylight-style Wall UI

**Full proposal & build spec · v1.0 · 9 August 2026**

Target device: Dell ST2220TC 22″ touch panel @ **1280×720 landscape**, driven by a Wyse 5070 in Chromium kiosk.
Secondary target: phones (existing layout, unchanged).
Constraint: **$0/mo** — static hosting + Supabase free tier, no paid APIs.

---

## 0. Decisions locked

| Question | Decision |
|---|---|
| Default view on the wall | **Schedule**, starting on **today** |
| Rail contents | **4 items** — Calendar · Chores · Meals · Lists (+ Sleep, Settings pinned bottom) |
| Money module | **Phone only.** Not on the rail. |
| Rewards | **Folded into Chores** as a top strip. Not a rail item. |
| Weather | **Out of scope.** No weather anywhere. |
| Countdowns | **In scope.** |

Everything below follows from these.

---

## 1. What Skylight actually is

I went through Skylight's own support documentation and the 2026 review coverage. Three things that look obvious in product photography are wrong, and each would have led us somewhere bad:

**"Schedule ⌄" is not a dropdown menu — it's the view switcher, labelled with whatever view is currently active.** Their views are Day · Week · Month · **Schedule**. And the weekly-columns layout you pointed at is **Schedule**, not Week — 1–7 day columns, count set by a slider, two-finger pinch to zoom the hour span. Their actual Week view is the weaker screen: a 7-day grid capped at **4 events per cell**, with the rest hidden behind an in-cell swipe.

**"Magic Import ⌄" is not a button.** It's the Add menu with four input modes — Type / Photo / Talk / Email. Photo and Talk display a **QR code** you scan with your phone, because the display has no camera and no microphone. Every AI feature on that device is a phone handoff wearing a trench coat.

**The progress bars on the avatar chips are chore completion for today, not stars.** "2/4" means two of four chores done. Stars live on a separate Rewards tab. This matters — we were about to build the wrong metric.

### The rest of their system, verified

- **Sidebar** — left in landscape, bottom in portrait, **icon + text label, never collapses**: Calendar · Tasks · Rewards · Meals · Photos · Lists · Sleep · Settings.
- **Density tokens** — `Cozy` / `Snug` / `Roomy` plus text size `Small` / `Medium` / `Large`. That's how they cope with not knowing your viewing distance.
- **Color** — everything inherits the person's profile color. Accent is **orange** (today dot, now-line); selection is blue. Light mode only; there is no dark mode on the device.
- **Depth cues over chrome** — shaded weekends, dimmed past events, rounded pastel event pills.
- **Gestures** — swipe L/R = dates, swipe U/D = time, two-finger pinch = hour zoom, long-press + drag = reorder. Their L/R direction is **inverted** vs. every other calendar app; don't copy that.
- **No drag-to-reschedule.** Tap → edit form → change the time field. I found no evidence it exists on any Skylight surface.
- **Chore completion** = tap a white circle → fills with a check → emoji burst when a whole checklist clears.
- **"Up for grabs"** — a left-most column of unassigned household chores anyone can claim; the profile is assigned at completion.
- **Parental lock** = 4-digit PIN scoped to *add* / *modify* / *both*, with a 1–10 min unlock window.
- **Screensaver** after 1–10 min idle, optional clock overlay, countdown strip — **suppressed while a recipe is on screen**, which is a genuinely thoughtful detail.
- **Countdowns** are a property of an event, surfaced in a rotating strip and on the screensaver, with an auto-suggested emoji.

### What reviewers hate — the anti-spec

- **Month view is their worst screen** — 3 events max per day, then "+ More". Reviewers call it cramped and unreadable for a busy family.
- **Week view hides events** behind a weak in-cell swipe affordance.
- **Tasks are a separate destination** that competes with the calendar. Their "preview bar" exists to patch this — the patch is evidence of the mistake.
- **Basically useless without Wi-Fi.** No offline mode at all. *You already win here — service worker + offline write queue.*
- **$79/yr paywall** on meals, photos, rewards, and all AI, on top of $250–630 hardware. *You win here too.*
- **No notification when someone adds an event.** *You have web push already.*

So: copy the **shell, the density, and the chore ergonomics**. Skip the **month view investment, the inverted swipes, the paywall, and the offline fragility**.

---

## 2. Where Family Hub stands today

Audited `web/app.js` (145 KB) and `web/styles.css` (31 KB) at SW cache v23.

**Strong, keep it:**

- **Warm cream theme** (`--bg #FBF7F0`, `--accent #FF7A45`). This reads as a living room; Skylight's white reads as an appliance. Genuine differentiator — keep it.
- **`fetchInstances(start, end, "combined")`** — one recurrence pipeline (RRULE expand → subtract exdates → apply `event_overrides`) feeds every view. This is why the whole redesign is cheap: no view forks the data path.
- **`renderDayBody`** is already a real hour time-grid with all-day strip, now-line, and meals + tasks overlaid.
- Profiles with emoji avatars, 8 identity colors, `avatarHTML` / `colorFor` helpers.
- Meals, stars/rewards (ledger-backed with atomic `complete_task` / `redeem_reward` RPCs), finance, web push, realtime, offline queue.

**The three real gaps:**

1. **`.content { max-width: 560px }`.** The only breakpoint in 31 KB of CSS is `@media(min-width:560px)`, and all it does is re-center a modal. **On the 1280×720 panel the app renders a 560 px phone column with ~360 px of empty cream on each side.** This is the whole problem, and it's the cheapest to fix.
2. **Navigation is hub-and-spoke.** `#/hub` tiles + a floating 🏠 button; `navTabs()` is a no-op. Every module is two taps from every other, and there's no persistent sense of place — exactly what a wall display needs most.
3. **`renderWeekBody` is seven stacked chip lists.** No hour rows, no all-day strip, no now-line, no proportional blocks. It's the view you liked and it's the one furthest from the reference.

**Not started at all (the C3 work):** ambient/idle screen, sleep schedule, PIN lock, density and text-size settings.

---

## 3. Design system

### 3.1 Identity colors — ink + tint

Skylight publishes no palette. This one is derived from your existing 8 `COLORS` entries, each split into an **ink** (3 px left edge, avatar fill, badge) and a **tint** (pill background). The split is what keeps a dense grid legible from four metres away — solid saturated blocks turn into mud at that distance, tint-with-edge doesn't.

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

Existing `--bg`, `--panel`, `--line`, `--accent`, `--star` stay as they are. `colorFor(m.color)` gains a sibling `tintFor(m.color)`.

### 3.2 Event pill

```
background: var(--{c}-t)
border-left: 3px solid var(--{c})
border-radius: 8px
title: 12px/700, single line, ellipsis
time:  10.5px/600 at 72% opacity
badge: 16px ink circle, member initial, top-right (schedule) / bottom-right (grid)
```

**Chores use the identical pill with a dashed 1 px border** instead of a fill. That one difference is enough to tell "thing that happens" from "thing someone must do" at a glance, without a legend.

### 3.3 Density & text size

Two `<html>` attributes driving custom properties — about 25 lines of CSS total:

```css
html[data-density="cozy"] { --row-h:56px; --pad:10px; --gap:6px; }
html[data-density="snug"] { --row-h:44px; --pad:7px;  --gap:4px; }
html[data-text="s"] { --fs-body:12px; --fs-title:12px; --fs-head:17px; }
html[data-text="m"] { --fs-body:13px; --fs-title:12.5px; --fs-head:19px; }
html[data-text="l"] { --fs-body:15px; --fs-title:14px; --fs-head:22px; }
```

Both are **device-local** (`localStorage`) — the wall wants Cozy/Large, a phone wants Snug/Medium, and they should not fight each other over the network.

### 3.4 Touch targets

Minimum **44×44** for anything tappable; **56×56** for anything Nono or Doma taps. Current `button{padding:11px 16px}` yields ~40 px — bump it inside wall mode only.

---

## 4. The shell

One breakpoint. **`@media (min-width:1000px) and (orientation:landscape)`** activates wall mode. Everything narrower keeps today's phone layout byte-for-byte.

```
┌──────┬──────────────────────────────────────────────────────────────┐
│      │ Badawy Family · 7:50 PM · [🏖️ Trip to Alex · 12 days]        │ 56
│ rail │                    [Schedule|Day|Week|Month] [Filter] [Today] │
│ 104  ├──────────────────────────────────────────────────────────────┤
│  px  │ 🥸 Daddy 1/3 · 👩 Suzy 2/4 · ⛹️ Nono 3/4 · ⛹️ Doma 1/3        │ 52
│      ├──────────────────────────────────────────────────────────────┤
│      │                                                              │
│      │                        active pane                       (＋)│ 612
└──────┴──────────────────────────────────────────────────────────────┘
```

### 4.1 Rail — 104 px, icon + label, never collapses

```
🗓️ Calendar   ← default
✅ Chores      (chore columns + rewards strip)
🍽️ Meals
📝 Lists
      ⋮ spacer
🌙 Sleep       (sleep now / schedule)
⚙️ Settings
```

Four working destinations plus two utilities. **"Chores", not Skylight's "Tasks"** — your kids already use that word, and "Tasks" collides with the `tasks` table naming in your schema.

`#/hub` and the floating 🏠 **stay, but only below the breakpoint**. `navTabs()` gets a real implementation that returns the rail in wall mode and nothing on phone.

Money is reachable at `#/finance` and from the phone hub. It stays out of the rail because nobody audits a budget standing in the kitchen.

### 4.2 Info bar — 56 px

`Badawy Family` (19/800) · `7:50 PM` (17/600) · **countdown chip** · spacer · **view switcher** · Filter · Today.

The view switcher only renders on calendar panes. The countdown chip occupies the slot where weather would have gone — with one countdown it's static, with several it rotates every 8 s; tapping it opens the countdowns pane.

### 4.3 People strip — 52 px

Your existing `.mchip` filter chips (toggling `state.hiddenMembers`) upgraded to carry a completion bar and an `n/m` fraction. **Two jobs in one control**: tap to filter the calendar, glance to see who still owes chores today.

The fraction is *today's* chores completed / assigned. You already compute both halves in `taskCells()` and `fetchDoneMap()` — this is a reduce over data you're fetching anyway, not a new query.

### 4.4 FAB

62 px, bottom-right, 20 px inset, above every pane. Context-aware: on calendar → new event; on Chores → new chore; on Meals → plan a meal; on Lists → new list.

---

## 5. View specs

### 5.1 Schedule — the default, the hero

**Five day-columns starting on today.** Column count is a setting (3–7); 5 is right for 1176 px of pane.

Each column is header / scrollable body / **pinned footer**:

- **Header** — weekday in small caps, `MMM D` big, today gets an orange `TODAY` badge and a 3 px orange top rule plus a faintly warmer column background.
- **Body** — all-day and countdown chips first, then timed events as pills in time order, then that day's chores as dashed pills.
- **Footer** — that night's **dinner** and a **`Chores n of m done`** line.

That footer is the argument for this view. The three questions actually asked in a kitchen are *what's happening*, *what's for dinner*, and *are the kids done* — and this is the only layout that answers all three without a tap. Week view can't; it has nowhere to put dinner.

It also degrades honestly: on a phone the same columns stack into a scrolling day-sectioned list, which is a normal agenda view.

### 5.2 Week — the full time grid

The rewrite. 7 columns × hour rows, all-day strip pinned above the scroller, orange now-line, events absolutely positioned by start/duration.

Reuse `renderDayBody`'s positioning math seven times over — the geometry is `top = (startHour - VIEW_START) * ROW_H`, `height = max(duration * ROW_H - 3, 26)`. Default window 7 AM–9 PM, scrolled to 8 AM on load, scrollable to the full 24 h.

Weekends get `--panel2`-ish shading. Past events dim to 55%. Chores render as dashed pills inline.

**Explicitly not doing:** Skylight's 4-events-per-cell cap. A time grid doesn't need one — overlapping events split the column width instead. Two overlaps side by side, three or more collapse to a `+N` chip at the right edge.

### 5.3 Day

Already correct. Widen it to fill the pane and add a 280 px left sidebar: next three items, tonight's dinner, and the chore fractions. No other change.

### 5.4 Month

Keep the existing `renderMonthBody`, restyle to the new pill tokens, and **stop there**. Skylight's month view is their most-criticised screen and there's no version of it that works well at this size. It's a "when is the school trip" reference view, used monthly, not daily. Do not invest.

### 5.5 Chores — its own destination, with Rewards folded in

Currently the 4th "view" inside the calendar switcher, which is confusing — it's not a calendar view. Promote it to the rail.

- **Rewards strip (60 px, top)** — one card per kid: avatar, star balance, next reward with a progress bar, and a **Redeem** button that shows `n to go` and is disabled until affordable. This is where the Rewards tab goes; it's more useful attached to the chores than on its own screen.
- **Columns below** — "🙋 Up for grabs" (unassigned, dashed borders, claimable) leftmost, then one column per member.
- Inside each: **Morning / Afternoon / Evening** groups for kids, flat "Today" for adults.
- **Rows are 44 px minimum with a 24 px tap circle.** Emoji leading, title, star value trailing.
- Tap the circle → fills green, strikes through, fires `complete_task`. Clearing a whole group → emoji burst (you already have `.starburst` and `.confetti` with `prefers-reduced-motion` guards — reuse them).

**Redemption requires a PIN** (see §7.3). Skylight lets a kid redeem unilaterally; that's a bug, not a feature.

### 5.6 Meals

Existing `#/meals` in the new shell: 7 columns × up to 4 meal rows, tap a cell to plan or edit, `＋` on empties. One addition: **"Add ingredients to Groceries"** on the meal editor, writing into the Lists module. That closes the meal→list loop Skylight charges for.

### 5.7 Lists

Three cards across at 1280 px. Add-item box at the top of each card (Skylight's ordering — it's right, you type at the top and read down). 40 px rows, 22 px checkboxes, completed items grey + struck through, filter to hide completed.

---

## 6. Countdowns

In scope, and cheap — it's a flag on an existing row.

### 6.1 Data

```sql
-- 03-countdowns.sql
alter table events add column countdown boolean not null default false;
alter table events add column countdown_emoji text;
create index events_countdown_idx on events (family_id, starts_at) where countdown;
```

No new table, no new RLS policy — `events` is already scoped by `current_family_id()`. Days remaining are computed client-side from `starts_at` in the family timezone; never store a day count.

### 6.2 Surfaces

1. **Info bar chip** — the nearest upcoming countdown. Multiple rotate every 8 s. Tap → countdowns pane.
2. **Countdowns pane** — card grid, emoji + name + date + big day number. Reached from the chip; not a rail item.
3. **Schedule / Week all-day rows** — countdown events render as an all-day chip on their date like any other.
4. **Ambient screen** — one of the four glance cards.

### 6.3 Editor

A **Countdown** toggle in the existing `openEventForm`, plus an emoji field that auto-suggests from the title (birthday → 🎂, trip/beach → 🏖️, school → 🎒, flight → ✈️). Suggestion is a ~20-entry keyword map, not a model call — this has to work offline.

`countdown` only makes sense on future-dated events; hide the toggle for past ones.

---

## 7. Ambient, sleep, and the PIN

### 7.1 Ambient screen

This is what the panel displays for most of its life, so it gets real design attention rather than being an afterthought.

After **N minutes idle** (setting, 1–15, default 5): dark warm gradient, `7:50` at 104 px/200 weight, the date beneath, then four glance cards — **Next up · Dinner tonight · Chores left · Countdown**. Tap anywhere to wake.

No photo slideshow in v1. Photos need storage and storage costs money; the glance cards are more useful anyway. Revisit later if you want it.

### 7.2 Sleep

Rail item → *Sleep now* or *Schedule*. Full black between the set hours — **blank, not dim**, matching Skylight. Tap to wake. Default 10 PM–6 AM. Device-local setting.

Pair it with the kiosk's own DPMS so the backlight genuinely powers down rather than rendering black pixels all night.

### 7.3 PIN

4-digit, gating **destructive and value-bearing actions only**: delete event, delete chore, edit another member's chore, **redeem a reward**, and Settings.

**Adding is never gated.** You want the kids adding things — that's the whole point of a family screen.

- 5-minute unlock window after a successful entry, then re-lock.
- Hash (SHA-256 + per-family salt) in a new one-row `family_settings` table, not localStorage — it's shared family state and must survive a device reflash.
- Everything else in Settings — density, text size, sleep hours, idle timeout, schedule column count — stays in `localStorage`, because it's per-device.

---

## 8. Interaction rules

| Gesture | Behaviour |
|---|---|
| Swipe left / right | Next / previous period. **Conventional direction** — left drags the calendar forward. Not Skylight's inverted mapping. |
| Swipe up / down (grid) | Scroll time |
| Tap event | Open the **side panel** editor (§9), not a modal |
| Tap chore circle | Complete / uncomplete, optimistic, queued offline |
| Long-press + drag | Reorder list items and chores |
| Two-finger pinch | *Deferred.* Nice, not necessary. |
| Drag-to-reschedule | **Not in v1.** Skylight doesn't have it, it's fiddly on this panel, and tap→edit is fine. |

---

## 9. Two places to beat the reference

**Inline editing instead of modals.** Every edit today goes through `openEventForm` as a centred modal. On a 1280 px canvas that's a dialog blotting out the thing you're editing in context. Tap an event → a **380 px right-hand panel** slides in, grid stays visible and stays interactive. Skylight uses full dialogs; there's no reason to inherit that.

**Chores genuinely on the calendar.** Skylight bolted on a "preview bar" because splitting tasks onto their own tab was a mistake. You already overlay `taskCells` onto calendar views — lean all the way in: chores appear as dashed pills in Schedule and Week, *and* as progress in the people strip, *and* as a footer count per day. The calendar becomes the one screen worth looking at, which is the entire premise of a wall display.

---

## 10. Code touchpoints

| Area | Files / functions |
|---|---|
| Shell | `styles.css` wall-mode block; new `renderShell(activePane)`; `navTabs()` becomes the rail |
| Info bar | new `renderInfoBar()`; clock on a 30 s `setInterval` |
| People strip | extend the existing `.mchip` block in `renderCalendar` |
| Schedule view | new `renderScheduleBody()` — reuses `fetchInstances`, `fetchMealsRange`, `taskCells` |
| Week view | rewrite `renderWeekBody` using `renderDayBody`'s geometry |
| Chores | promote `renderTasksView` to its own route; merge `viewStars` + `viewRewards` into the rewards strip; drop `"tasks"` from `state.calView` |
| Countdowns | `03-countdowns.sql`; toggle in `openEventForm`; `renderCountdowns()` |
| Ambient / sleep | new `ambient.js` module; idle timer on `pointerdown` / `visibilitychange` |
| PIN | `family_settings` table + `requirePin(action)` wrapper |
| Settings | extend `viewFamily` (`#/family`) with a Display section |
| SW | bump cache to **v24** on first ship, and again per phase |

`fetchInstances`, the RLS model, the RPCs, and the offline queue are untouched throughout. This is a presentation-layer project.

---

## 11. Phases

| # | Scope | Done when |
|---|---|---|
| **W1** | **Shell.** Wall breakpoint, rail, info bar, people strip with progress. Existing views render unchanged inside it. | At 1280×720 the app fills the screen; all four rail destinations reachable in one tap; phone layout provably unchanged. |
| **W2** | **Schedule view** + make it the wall default. Day columns, pinned dinner + chore footer, settings for column count. | Opening the wall app shows 5 columns starting today, with tonight's dinner and chore counts visible without scrolling. |
| **W3** | **Week time grid.** Rewrite `renderWeekBody`, all-day strip, now-line, ink/tint pills, overlap handling. | A day with 4 overlapping events renders all 4 legibly, nothing hidden behind a swipe. |
| **W4** | **Chores destination** + rewards strip, Up-for-grabs, Morning/Afternoon/Evening, 44 px rows, celebration. | Nono can complete a chore and redeem a reward from the wall, PIN-gated, offline-safe. |
| **W5** | **Countdowns.** Migration, event toggle + emoji suggest, info-bar chip, countdowns pane, all-day chips. | "Trip to Alex" shows `12 days` in the info bar and on its date in Schedule and Week. |
| **W6** | **Ambient + Sleep + PIN + density.** Idle screen, sleep schedule, PIN gate, density and text-size settings. | Screen idles to the ambient view in 5 min, blanks at 10 PM, wakes on tap; delete asks for a PIN. |
| **W7** | **Polish.** Side-panel editor replacing modals, meal→grocery push, past-event dimming. | — |

**W1 + W2 is the release that changes your life.** Everything after is refinement.

---

## 12. Explicitly out of scope

- Weather (your call)
- Photo slideshow / screensaver images — costs storage
- Drag-to-reschedule
- Pinch-to-zoom hours
- Dark mode — the ambient screen covers the night case
- Any AI import (photo / voice / email parsing) — that's Skylight's paid tier and a whole separate project
- External calendar sync (Google/Apple/Outlook) — a real want, but a milestone of its own

---

## 13. Open risks

1. **1280×720 is tight.** 56 + 52 + 612 leaves the Schedule columns 235 px wide. It works (see the mockup), but long event titles will ellipsize. If it bites, the fallback is dropping to 4 columns at 294 px.
2. **Chromium kiosk emoji.** Emoji-first chores need a colour emoji font installed on the Wyse box — `fonts-noto-color-emoji` on Debian. Worth verifying before W4, since the entire kid-facing design leans on it.
3. **Realtime + ambient.** The idle screen must keep its subscription alive or wake with stale data. Re-fetch on wake regardless.
4. **Touch panel resolution.** The ST2220TC is a resistive-era optical panel — verify 24 px tap circles actually register reliably before committing to that size in W4.

---

*Sources: [Skylight — Navigation and Menus](https://skylight.zendesk.com/hc/en-us/articles/36824456433051-Navigation-and-Menus) · [Using the Calendar Tab](https://skylight.zendesk.com/hc/en-us/articles/36625171368987-Using-the-Calendar-Tab) · [Calendar Settings](https://skylight.zendesk.com/hc/en-us/articles/36835449004315-Calendar-Settings) · [Adjust the Display](https://skylight.zendesk.com/hc/en-us/articles/48784194278683-Adjust-the-Display) · [Tasks: Routines and Chores](https://skylight.zendesk.com/hc/en-us/articles/36846381293979-Using-the-Tasks-Tab-Routines-and-Chores) · [Up for Grabs Chores](https://skylight.zendesk.com/hc/en-us/articles/49525040352795--Feature-Up-for-Grabs-Chores) · [Stars, Tasks, and Rewards](https://skylight.zendesk.com/hc/en-us/articles/36846200077723-Stars-Tasks-and-Rewards) · [Using the Rewards Tab](https://skylight.zendesk.com/hc/en-us/articles/36846860676123-Using-the-Rewards-Tab) · [The Meals Tab](https://skylight.zendesk.com/hc/en-us/articles/41418036777371-The-Meals-Tab) · [Using Lists](https://skylight.zendesk.com/hc/en-us/articles/37275069922971-Using-Lists) · [Countdowns](https://skylight.zendesk.com/hc/en-us/articles/40459070511515-Countdowns) · [Photo Settings](https://skylight.zendesk.com/hc/en-us/articles/36835919949339-Photo-Settings) · [Using Sleep Mode](https://skylight.zendesk.com/hc/en-us/articles/37235485034779-Using-Sleep-Mode) · [Parental Lock](https://skylight.zendesk.com/hc/en-us/articles/35089525796251-Parental-Lock) · [Profiles and Labels](https://skylight.zendesk.com/hc/en-us/articles/44740240234139-Profiles) · [Reviewed — Calendar 2 review](https://www.reviewed.com/smarthome/content/skylight-calendar-2-review) · [Forbes Vetted — Calendar 2 review](https://www.forbes.com/sites/forbes-personal-shopper/article/skylight-calendar-2-review/) · [TechCrunch — Calendar 2](https://techcrunch.com/2026/01/07/skylight-debuts-calendar-2-to-keep-your-family-organized)*
