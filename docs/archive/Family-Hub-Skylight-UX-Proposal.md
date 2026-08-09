# Family Hub → Skylight-style UI

**Proposal · 9 Aug 2026**
Target: Dell ST2220TC 22" touch wall screen @ 1280×720, plus phones.

---

## 1. What Skylight actually is (verified, not guessed)

I went through Skylight's own support docs and a stack of 2026 reviews. A few things in the Target photo you sent are not what they look like, and they matter:

| What it looks like | What it actually is |
|---|---|
| "Schedule ⌄" dropdown | The **view switcher**. Its label is always the *current* view. Views are **Day · Week · Month · Schedule**. |
| "Magic Import ⌄" | Not a real button. It's the **Add** menu with four input modes: Type / Photo / Talk / Email. Photo and Talk show a **QR code** you scan with your phone — the device has no camera or mic. |
| Person chips with progress bars | The **preview bar**. The bar is **chore completion for today** (2/4 = two of four chores done), *not* stars. Stars live on the Rewards tab. |
| "Chores" in the sidebar | It's called **Tasks** now. Chores + Routines (Morning/Afternoon/Evening) live inside it. |
| The weekly column layout you liked | That's their **Schedule view** — 1–7 day-columns, count set by a slider, pinch-to-zoom the hour span. Their *Week* view is a different, weaker thing (max 4 events per cell). |

**Sidebar (landscape) / bottom bar (portrait):** Calendar · Tasks · Rewards · Meals · Photos · Lists · Sleep · Settings. Icon **plus** text label, always visible, never collapses.

**The rest of their system, briefly:**

- **Density tokens** — `Cozy` / `Snug` / `Roomy`, and text size `Small` / `Medium` / `Large`. That's how they cope with unknown viewing distance.
- **Color** — everything inherits the person's **profile color**. Accent is **orange** (today dot, now-line). Selection is blue. Light mode only, no dark mode on device.
- **Depth cues instead of chrome** — shade weekends, dim past events, rounded pastel event pills.
- **Gestures** — swipe left/right = dates (inverted vs. every other calendar, a real learnability trap), swipe up/down = time, two-finger pinch = zoom hours, long-press + drag = reorder list/routine items.
- **No drag-to-reschedule.** Tap → edit form → change the time field. I found no evidence it exists.
- **Chore completion** = tap a white circle → fills with a check → emoji burst on completing a whole list.
- **Parental lock** = 4-digit PIN, scoped to *add* / *modify* / *both*, with a 1–10 min unlock window. No attempt limit — security theatre, but the ergonomics are right.
- **Screensaver** = photos after 1–10 min idle, optional clock overlay, countdown strip. **Suppressed while a recipe is on screen** (nice touch). **Sleep mode** blanks fully on a schedule.

### What reviewers hate — don't copy these

- **Month view is cramped** — 3 events max per day, then "+ More".
- **Week view hides events** behind an in-cell swipe with a weak affordance.
- **Tasks are a separate destination** and compete with the calendar for attention.
- **Useless without Wi-Fi.** No offline mode at all. *(You already beat this — you have a service worker and an offline write queue.)*
- **$79/yr paywall** on meals, photos, rewards, and all AI. *(You beat this too — $0/mo.)*
- **No push notification when someone adds an event.** *(You already have web push.)*

So: copy the **shell and the information density**, skip the **paywall, the month view, and the offline fragility**.

---

## 2. Where your app stands today

I audited `web/app.js` (145 KB) and `web/styles.css`.

**Already good, keep it:**

- Warm cream theme (`--bg #FBF7F0`, `--accent #FF7A45`) — closer to a living room than Skylight's clinical white. Keep it, it's a genuine differentiator.
- `fetchInstances(start, end, "combined")` — one recurrence pipeline (rrule → exdates → overrides) feeding every view. This is why the redesign is cheap.
- Day view already is a real hour time-grid with all-day strip + now-line + meals + tasks overlaid.
- Profiles with emoji avatars and 8 identity colors.
- Meals, stars/rewards, finance, push, offline.

**The three real gaps:**

1. **`.content { max-width: 560px }`** — the entire app is a phone column. The only breakpoint in 30 KB of CSS is `@media(min-width:560px)`, and it just re-centers a modal. **On the 1280×720 wall screen you are showing a 560px strip with 720px of cream on either side.** This is gap #1 by a mile.
2. **Navigation is a hub-and-spoke** — a `#/hub` screen with tiles and a floating 🏠 button; `navTabs()` is a no-op. On a wall display, every module is 2 taps away and there's no persistent sense of place. Skylight's rail is always-on for exactly this reason.
3. **Week view is 7 stacked chip lists** (`renderWeekBody`), not a time grid — no hour rows, no all-day strip, no now-line, no proportional blocks. It's the view you said you liked, and it's the one furthest from Skylight.

Plus, not started at all: **ambient/idle screen, sleep schedule, PIN lock, density & text-size settings** (the C3 work).

---

## 3. Proposal

### 3.1 The shell — one layout change, everything benefits

Introduce a **wall mode** at `@media (min-width:1000px) and (orientation:landscape)`. Everything below that breakpoint keeps today's phone layout untouched.

```
┌──────┬──────────────────────────────────────────────────────┐
│ rail │ info bar:  Badawy Family · 7:50 PM · ☀ 61°   [Day|Week|Month|Schedule] [Filter] [Today]
│ 104  ├──────────────────────────────────────────────────────┤
│  px  │ people strip:  🥸 Daddy 1/5 · 👩 Suzy 2/4 · ⛹ Nono 3/4 · ⛹ Doma 1/3
│      ├──────────────────────────────────────────────────────┤
│      │                                                      │
│      │                    active pane                       │
│      │                                                 (＋) │
└──────┴──────────────────────────────────────────────────────┘
   56px info bar + 52px people strip + 612px pane = 720
```

**Rail (104 px, icon + label, no collapse):**
Calendar · Chores · Meals · Lists · Money · Rewards — spacer — Sleep · Settings.

I'd keep **"Chores"** rather than Skylight's "Tasks" — your kids already use that word, and "Tasks" collides with the chore-`tasks` table naming in your schema.

The `#/hub` screen and the floating 🏠 stay, but only on phone widths. On the wall the rail replaces them.

**People strip** = the filter chips you already have (`.mchip`, toggling `state.hiddenMembers`), upgraded with a completion bar. The fraction is *today's* chores done / assigned — you already compute this in `taskCells()` + `fetchDoneMap()`, so it's a reduce, not new data.

### 3.2 Views

| View | What to do |
|---|---|
| **Week** | **Rewrite as a real time grid.** 7 columns × hour rows, all-day strip on top, orange now-line, events positioned/sized by duration, member-color left edge + pastel tint fill, initial badge bottom-right. This is the biggest visual win. |
| **Day** | Already right. Widen to fill the pane; add a left agenda sidebar (next 3 items + today's dinner) on the wall. |
| **Schedule** | **New — and I think this becomes your default on the wall.** 5 day-columns of upcoming events as cards, with the dinner plan pinned at the bottom of each column. It's the "what's coming up" glance that a wall screen actually gets used for, and it degrades gracefully to a phone list. Day count in settings (3–7). |
| **Month** | Keep as-is, but drop it to a secondary position. Skylight's month view is their worst screen; there's no reason to invest here. |
| **Chores** | Move out of the calendar view switcher (it's currently the 4th "view", which is confusing) and into its own rail destination. Per-person columns, Morning/Afternoon/Evening groups, an **"Up for grabs"** unassigned column on the left, tap-the-circle to complete, ★ value on the right, emoji-first for Nono and Doma. |

### 3.3 Event pill spec

Skylight publishes no palette, so here's one built from your existing 8 identity colors — each gets an **ink** (edge, avatar, text on white) and a **tint** (fill), so a busy grid stays legible from across a room:

```css
--teal:#2E9C8E;   --teal-t:#DCF1EE;     /* Daddy   */
--red:#D4646B;    --red-t:#FBE4E5;      /* Suzy    */
--blue:#4A86C8;   --blue-t:#E1EDF9;     /* Nono    */
--green:#4FA35F;  --green-t:#E3F2E5;    /* Doma    */
--amber:#D9932F;  --amber-t:#FBEEDA;
--purple:#8C6BC8; --purple-t:#EBE4F8;
--pink:#CF6FA4;   --pink-t:#F9E3EE;
--slate:#7A8794;  --slate-t:#E9EDF1;    /* unassigned / shared */
```

Pill = `background: tint`, `border-left: 3px solid ink`, `border-radius: 8px`, title 700 weight, time at 78% opacity, member initial in a 15px ink circle bottom-right. Tasks render as the same pill with a **dashed** border so chores read differently from events at a glance.

### 3.4 Touch & ambient (the C3 work)

- **Minimum 44×44 targets**, 56×56 for anything a kid taps. Your current `button{padding:11px 16px}` is too small for a wall.
- **Density**: `Cozy` / `Snug` and text size `S/M/L`, as CSS custom properties on `:root` — one `data-density` attribute on `<html>`, ~20 lines of CSS.
- **Ambient screen** after N minutes idle: big clock, date, weather, then four glance cards — Next up · Dinner tonight · Chores left · Countdown. Tap to wake. This is what the screen shows 90% of the day, so it deserves as much design attention as the calendar.
- **Sleep schedule**: blank fully between set hours. Full black, not dim.
- **PIN**: 4-digit, gate *delete* and *edit* only (not add — you want the kids adding things), 5-minute unlock window. Store the hash in `family_settings`, not localStorage.
- **Gestures**: swipe left/right for dates — but the **conventional** direction, not Skylight's inverted one. Swipe left = forward.
- **Skip drag-to-reschedule** for v1. Skylight doesn't have it, it's fiddly on a resistive-ish panel, and tap→edit is fine.

### 3.5 Two things to do *better* than Skylight

1. **Inline event editing.** Right now every edit is a modal (`openEventForm`). On a 1280px wall that's a huge dialog over a huge canvas. Tap an event → a **right-side panel** slides in, grid stays visible. Skylight uses full dialogs; you don't have to.
2. **Show chores on the calendar properly.** Skylight bolted on a "preview bar" because splitting tasks off was a mistake. You already overlay `taskCells` onto the calendar — lean into it: chores appear as dashed pills in the grid *and* as progress in the people strip, so the calendar is genuinely the one screen you look at.

---

## 4. Phased plan

| Phase | Work | Why first |
|---|---|---|
| **W1 — Shell** | Wall-mode breakpoint, left rail, info bar (family name / clock / weather), people strip with progress. Panes just render existing views inside it. | Unlocks everything. The 560px column is the single worst problem, and this is mostly CSS + a small render-shell refactor. |
| **W2 — Week grid** | Rewrite `renderWeekBody` as a time grid (reuse `renderDayBody`'s positioning math ×7). All-day strip, now-line, ink/tint pills. | The view you actually asked for. |
| **W3 — Schedule view** | New 5-column upcoming view + dinner row. Make it the wall default. | Highest day-to-day value on a wall screen. |
| **W4 — Chores** | Promote to a rail destination; per-person columns, Up-for-grabs, Morning/Afternoon/Evening, big tap circles, emoji-first. | Where the kids touch the screen. |
| **W5 — Ambient + Sleep + PIN + density** | The idle screen, sleep schedule, PIN on destructive actions, density/text-size settings. | Finishes C3. |
| **W6 — Polish** | Side-panel event editor replacing modals, completion celebration, countdowns strip. | Nice-to-have. |

W1 + W2 alone get you ~80% of the way to the screenshot.

---

## 5. Open questions

1. **Default wall view — Schedule or Week?** I've argued Schedule; Week is what you pointed at. Easy to make it a setting and decide by living with it.
2. **Rail contents.** I put Money and Rewards on the rail. Rewards could fold into Chores (where it is today), and Money is arguably a phone-only thing — nobody audits the budget standing in the kitchen. Cutting both gives a calmer 4-item rail.
3. **Weather** needs a source. Open-Meteo is free, no key, no attribution requirement — fits the $0/mo constraint.
4. **Countdowns** (🏖️ "Trip to Alex — in 12 days") are a Skylight feature you don't have. Cheap to add (a flag on an event) and kids love them. Want it in scope?

---

*Sources: [Skylight — Navigation and Menus](https://skylight.zendesk.com/hc/en-us/articles/36824456433051-Navigation-and-Menus) · [Using the Calendar Tab](https://skylight.zendesk.com/hc/en-us/articles/36625171368987-Using-the-Calendar-Tab) · [Calendar Settings](https://skylight.zendesk.com/hc/en-us/articles/36835449004315-Calendar-Settings) · [Tasks: Routines and Chores](https://skylight.zendesk.com/hc/en-us/articles/36846381293979-Using-the-Tasks-Tab-Routines-and-Chores) · [Up for Grabs Chores](https://skylight.zendesk.com/hc/en-us/articles/49525040352795--Feature-Up-for-Grabs-Chores) · [Stars, Tasks, and Rewards](https://skylight.zendesk.com/hc/en-us/articles/36846200077723-Stars-Tasks-and-Rewards) · [The Meals Tab](https://skylight.zendesk.com/hc/en-us/articles/41418036777371-The-Meals-Tab) · [Using Lists](https://skylight.zendesk.com/hc/en-us/articles/37275069922971-Using-Lists) · [Photo Settings](https://skylight.zendesk.com/hc/en-us/articles/36835919949339-Photo-Settings) · [Using Sleep Mode](https://skylight.zendesk.com/hc/en-us/articles/37235485034779-Using-Sleep-Mode) · [Parental Lock](https://skylight.zendesk.com/hc/en-us/articles/35089525796251-Parental-Lock) · [Countdowns](https://skylight.zendesk.com/hc/en-us/articles/40459070511515-Countdowns) · [Adjust the Display](https://skylight.zendesk.com/hc/en-us/articles/48784194278683-Adjust-the-Display) · [Skylight Calendar 2 Review — Reviewed](https://www.reviewed.com/smarthome/content/skylight-calendar-2-review) · [Forbes Vetted review](https://www.forbes.com/sites/forbes-personal-shopper/article/skylight-calendar-2-review/) · [TechCrunch — Calendar 2](https://techcrunch.com/2026/01/07/skylight-debuts-calendar-2-to-keep-your-family-organized)*
