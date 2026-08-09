# W1 Work Order — The wall shell

**Prereq:** W0 committed (`76c0421`, SW v24). **Ships:** SW **v25**.
**Reference:** `MEGA-PROMPT-Family-Hub-Wall-Build.md` §W1 · `Family-Hub-Wall-UI-Merged-Spec-v2.md` §3–4.

**Goal:** at 1280×720 the app fills the screen with a rail, info bar and people strip. **No view logic moves in this phase.** Existing views render unchanged inside the pane.

**The one invariant that matters:** a phone-width render must be pixel-identical to W0. Everything below is designed so that's true *by construction*, not by inspection.

---

## 1. Architecture decision — build the shell as siblings, not a wrapper

`web/index.html` has a single mount point:
```html
<body><main id="app" class="app"></main></body>
```
Every view writes `<header class="topbar">…</header><section class="content">…</section>` into it.

**Do not** rewrite views to render into a shell, and **do not** move `#app` inside a new wrapper element. Instead follow the existing `ensureHomeFab()` pattern (app.js:183): a new **`ensureWallShell()`** creates three chrome elements **once**, appends them to `<body>` as siblings of `#app`, and CSS Grid positions all four. Below the breakpoint the three are `display:none` and `body` is normal flow again.

```
body (grid, wall mode only)
├── #wallRail    grid-area: rail
├── #wallInfo    grid-area: infobar
├── #wallPeople  grid-area: people
└── #app         grid-area: app      ← untouched, still the router's mount point
```

This is why the invariant holds: **no view's HTML changes at all in W1.**

---

## 2. CSS — `web/styles.css`

### 2.1 Colour tokens
`:root` currently defines only 4 identity colours (`--blue --green --amber --pink`, line 6–7) while the JS `COLORS` map has 8. Bring CSS into line and add the tint half of each pair:

```css
--teal:#2E9C8E;   --teal-t:#DCF1EE;
--red:#D4646B;    --red-t:#FBE4E5;
--blue:#4A86C8;   --blue-t:#E1EDF9;
--green:#4FA35F;  --green-t:#E3F2E5;
--amber:#D9932F;  --amber-t:#FBEEDA;
--purple:#8C6BC8; --purple-t:#EBE4F8;
--pink:#CF6FA4;   --pink-t:#F9E3EE;
--slate:#7A8794;  --slate-t:#E9EDF1;
--indigo:#7C83DB; --indigo-t:#E6E8FA;
--rail:#F6EFE4;
```
⚠️ These **change existing hex values** (`--blue` moves `#3D8BCD → #4A86C8`). That's intended — the ink/tint pairs are tuned together — but it shifts avatar and chip colours on the phone too. Screenshot-diff will flag it; **accept the diff for colour only** and note it in the commit. If you'd rather keep the phone untouched, scope the new values inside the wall media query and leave `:root` alone.

Add `tintFor(c)` in app.js next to `colorFor(c)` (line 10).

### 2.2 Density / text custom properties
Add the three-level block from the spec (`roomy` / `cozy` / `snug`) plus `data-text` s/m/l. Set defaults in JS on boot: wall → `roomy` + `l`, phone → `snug` + `m`, both read from `localStorage` with those fallbacks. **The Settings UI lands in W7** — W1 only needs the properties to exist and be applied.

### 2.3 The single breakpoint
```css
@media (min-width:1000px) and (orientation:landscape){
  body{
    display:grid; height:100dvh; overflow:hidden;
    grid-template-columns:104px 1fr;
    grid-template-rows:56px 52px 1fr;
    grid-template-areas:"rail infobar" "rail people" "rail app";
  }
  #wallRail{grid-area:rail} #wallInfo{grid-area:infobar} #wallPeople{grid-area:people}
  #app{grid-area:app; min-height:0; overflow:auto;}
  .app{min-height:0;}                    /* neutralise min-height:100dvh (line 17) */
  .content{max-width:none; padding:16px;} /* the 560px column is the whole problem */
  .homefab{display:none !important;}      /* the rail replaces it */
  .topbar{position:static; background:none; border-bottom:0; padding:8px 16px; backdrop-filter:none;}
  .topbar h1, .topbar > .iconbtn:first-child{display:none;}  /* rail + info bar replace these */
}
```

**Four specific traps in that block:**
- `.app` carries `min-height:100dvh` (line 17). Left alone it forces the pane taller than the viewport and the grid scrolls as a whole.
- `.content{max-width:560px}` (line 30) is *the* defect this phase exists to fix.
- `.topbar` is `position:sticky` with `env(safe-area-inset-top)` padding — harmless on the wall but it must stop being sticky or it double-bars against the info bar.
- Hiding `.topbar h1` and the leading `.iconbtn` (back / switch-profile) keeps each view's **right-hand action button** (`+ Chore`, `+ Add`) visible. Those migrate to the FAB and info bar in W2/W4; don't move them now.

---

## 3. `ensureWallShell()` — `web/app.js`

Model it on `ensureHomeFab()` (line 183). Called from the same place, at the end of `render()`.

```js
const WALL = () => window.matchMedia("(min-width:1000px) and (orientation:landscape)").matches;
```

### 3.1 Rail — 104 px, icon + label, never collapses
| | route | W1 state |
|---|---|---|
| 🗓️ Calendar | `#/home` | live, **default** |
| ✅ Chores | `#/tasks` | live |
| 🍽️ Meals | `#/meals` | live |
| 📝 Lists | `#/lists` | **disabled** — render it so the layout is final, enable in W8 |
| *(spacer)* | | |
| 🌙 Sleep | — | **disabled**, W7 |
| ⚙️ Settings | `#/family` | live |

Active state derives from `location.hash`. **`#/lists` does not exist** — the router's fallback (app.js:174) would drop to `viewPicker()`, so guard it: either don't wire a click handler on disabled items, or add an explicit `#/lists` → no-op branch. Do not let a rail tap land on the profile picker.

### 3.2 Info bar — 56 px
`Badawy Family` (19/800) · clock (17/600) · **countdown chip slot** (empty until W6) · spacer · view switcher · `⚲ Filter` · `Today`.

- Clock on a **30 s `setInterval`**. Store the handle on `state._clockTimer` and clear it before creating a new one — `ensureWallShell()` runs on every navigation and will otherwise leak a timer per route change.
- The view switcher renders **only on calendar routes** (`#/home`). It reads and writes `state.calView`. In W1 it offers Day / Week / Month (the existing three); `schedule` is added in W2.
- `Today` resets `state.viewMonth` / `state.selectedKey` and re-renders. `Filter` is a no-op placeholder in W1 — the people strip already does the filtering.

### 3.3 People strip — 52 px
Upgrade of the existing `.mchip` row (app.js:722). Each chip: avatar · name · progress bar · `n/m` fraction. Tap toggles `state.hiddenMembers` and re-renders the calendar — **identical behaviour to today**, just relocated and enriched.

Three things to get right:

1. **Extract a shared `todayChoreCounts()` helper.** `renderChoreHome()` (line ~1439) already computes exactly `{done, total}` per member for today. Pull that out into one function and call it from both places. Do **not** write a second implementation — they will diverge, and the strip is the number Suzy trusts at a glance.
2. **Initialise `state.hiddenMembers` in the strip too.** It's lazily created inside `renderCalendar` (line 644). The strip renders outside `#app` and may run first, so it must not assume the Set exists.
3. **The strip lives outside `#app`, so `render()` will not refresh it.** Call `renderPeopleStrip()` explicitly after each `render()`, and again from the realtime `onChange` for `task_completions` / `tasks` / `family_members`. Otherwise a chore completed on a phone won't move the wall's bars.

Suppress the in-calendar `.mchip` row in wall mode (CSS) so there aren't two filter rows.

### 3.4 FAB — 62 px, bottom-right, 20 px inset
Context-aware by route: Calendar → new event · Chores → new chore · Meals → plan a meal · Lists → new item. Wall mode only; the phone's existing affordances are untouched. `z-index` above the pane.

### 3.5 Retarget the kiosk idle timer
W0 added `KIOSK_IDLE_MS = 30000` (line 207) returning to the **profile picker**. **There is no picker on the wall** — the wall has no identity. In wall mode the idle action becomes `go("#/home")` (Calendar). Keep the picker behaviour below the breakpoint.

While you're there: **raise the constant to 120 s.** 30 s bounces you mid-read on a phone. W7 makes it configurable (1–15 min) and hands the long timeout to ambient.

---

## 4. Acceptance criteria

| # | Check |
|---|---|
| 1 | At 1280×720 the pane fills the screen — **no cream gutters**, no horizontal scroll, no double top bar. |
| 2 | All four rail destinations reachable in one tap; Lists and Sleep visibly disabled; Settings opens `#/family`. |
| 3 | A rail tap never lands on the profile picker. |
| 4 | People strip shows correct `n/m` per member, matching the Chores avatar-grid numbers **exactly** (same helper). |
| 5 | Tapping a chip filters the calendar exactly as the old `.mchip` did. |
| 6 | Completing a chore on a phone moves the wall's progress bar within a few seconds (realtime → strip re-render). |
| 7 | Clock ticks and **only one interval exists** after 10 navigations (assert `state._clockTimer` identity / count). |
| 8 | **390×844 screenshot-diff vs the W0 baseline is empty**, except the deliberate identity-colour shift if you applied §2.1 globally. |
| 9 | 1280×720 and 390×844 both render with no console errors. |
| 10 | SW cache bumped to **v25**. |

---

## 5. Open questions to settle before starting

**Q1 — iPad lands in wall mode.** `min-width:1000px` + landscape catches iPad landscape (1024×768). Wall mode on a 10″ tablet is probably *good* — but it's a decision, not an accident. Raise the breakpoint to **1100 px** if you want the wall to mean only the wall; the Dell is 1280 so there's plenty of headroom either way.

**Q2 — identity colours: globally or wall-only?** §2.1 changes existing hex values. Global = one consistent palette everywhere, at the cost of a visible (harmless) shift on phones. Wall-only = phone stays frozen, at the cost of two palettes to maintain. **Recommend global** — two palettes will drift.

**Q3 — still open from W0:** hold toggle-to-uncomplete until W4.2 (**recommended** — an undo before the RPC exists drifts `star_ledger` from `star_balance`, which the verification protocol treats as stop-and-fix), and raise `KIOSK_IDLE_MS` to 120 s (**recommended**, folded into §3.5 above).

---

## 6. Then W2

Schedule view + Day sidebar + Month restyle + Meals reflow. That's the release that changes the wall — W1 makes the app *fit* the screen, W2 makes it *worth looking at*.
