# Family Hub — Redesign Audit & Benchmarked Plan

*Senior product-design audit · June 2026 · prepared for a build session*

You've built a feature-complete private family PWA (calendar + chores/stars + finance, with meal-planning as a future module). It works, but the UI reads "industrial dashboard": flat factory-blue, no warmth, no per-person identity, no avatars, and several core interactions — especially the calendar — are underbaked. This document benchmarks four app categories, then converts the findings into a concrete visual language and a prioritized functionality plan you can hand straight to a build session.

The single biggest theme across every best-in-class family app: **one color = one human, everywhere.** Color is tied to a *person* (with a name and a face), not to a category or a module. That one decision is what separates "warm family app" from "corporate dashboard," and it threads through all three of your existing modules.

---

## Part 1 — Benchmark findings

### 1. Family calendar / scheduling

**Skylight — the editable hourly day grid (this is your blueprint).** Skylight's core is a vertical, hour-by-hour grid where timed events render as colored blocks owned by a person, with all-day/untimed items listed separately below. View modes (Schedule / Day / Week / Month) are switched from a single button whose label *is* the current state — no extra dropdown chrome. "Now" is shown with an orange current-time bar plus an orange dot on today; that one accent color is reserved exclusively for "now." A Filter control toggles which people are visible, so the same grid collapses from whole-family to one kid instantly. This is almost exactly the detailed, editable day-as-default view you asked for.

**Cozi — per-person color + frictionless assignment.** Each member is a name + color; the month shows colored *dots* per person per day (not bars), so density stays legible, and tapping a day opens a half-screen sheet listing that day's events — a gentle drill-down that feels like peeking, not navigating away. Assignment is the standout: SmartAdd lets you type the event and tag people inline with `@FirstName`; tag no one and it goes to everyone. Color identity carries all the way into the agenda/list view.

**TimeTree — softer visual language than Google Calendar**, and events that double as tiny shared threads (comments + photos). Useful as a warmth reference, but the per-event chat is overkill for four people.

**Warm-not-corporate cues:** color = person everywhere; round avatars/initials beside events; a single reserved accent for "now"; conversational copy ("Who's going?" not "Attendees"); drill-down via soft sheets rather than full page loads; direct-manipulation gestures (swipe days, pinch hours) over button chrome.

**Adopt vs. bloat (4-person private app):**
- Editable hourly **day view as default** with colored blocks + untimed list — *essential, top priority.*
- **Per-person filter toggles** (default all-on) — *valuable, cheap.*
- **Avatar chips for "who's this for?"** (multi-select, defaults to all) — *valuable;* simpler than parsing `@name`.
- Event-level **chat/photos** — *bloat for four people; a single notes field covers the real need.*
- A separate **"Today" landing screen** — *skip;* fold "now" emphasis (current-time bar, auto-scroll) into the day view instead.

### 2. Meal planning *(new module — all v2)*

**Plan to Eat — drag-a-recipe-onto-a-day + auto-aggregating grocery list.** The week is a grid of day columns; drop a recipe and the shopping list auto-populates from its ingredients. The aggregation logic is the part to copy: merge lines only when *title AND unit match* (two "2 cups flour" → "4 cups flour"); same-title/different-unit items stay separate but grouped adjacent; everything sorts into editable store-aisle categories with a check-off for "already have it."

**Paprika — the recipe URL clipper.** Paste a URL, parse title/ingredients/steps into structured fields (prefer schema.org/JSON-LD metadata), and — critically — **always offer a manual paste fallback** when parsing misses, rather than failing.

**Mealime — zero-friction onboarding** into a small default plan (a few 30-minute dinners), not an intimidating blank 21-slot week. Lesson: constrain the default surface.

**Warm cues:** name the collection a shared "Family Recipe Box" (not "My Recipes"); per-person color stripe on each meal ("who's cooking Thursday"); human language ("Taco Tuesday," "Friday leftovers") over "Meal Slot 1"; small defaults instead of empty grids.

**Adopt vs. bloat:** the value loop is *shared recipe box (clipper + manual fallback) → tap-to-place weekly **dinner** plan → auto-aggregated, aisle-sorted, check-off grocery list*, plus a cheap "who's cooking" tag. **Skip** pantry inventory with expiry, nutrition/macros, AI auto-plans, and multi-store lists — all enterprise bloat for four people.

### 3. Kids chores / rewards *(you already have stars)*

**Skylight — celebration + star-bank.** The screen erupts in an emoji burst only when a kid clears their *entire* list (payoff feels earned; everyday UI stays calm). Stars accumulate toward a *named, kid-specific* reward ("movie night") with a threshold, shown on a dedicated Rewards screen with everyone's progress side by side. Pre-readers get emoji-named chores.

**Greenlight — the approve-then-grant loop.** Kid marks a chore done → it enters a pending/approval state → parent approves → reward posts. An explicit gate between "kid says done" and "reward granted" prevents gaming and gives the parent an acknowledgment moment (which research flags as the real motivator, beyond animation).

**OurHome — points economy + independent kid view.** Each kid sees only their tasks and self-marks done; redeeming a reward *visibly debits* the points, so the wallet feels real.

**Warm-but-not-patronizing (two adults use this too):** color-as-identity over cartoon mascots; celebration as a gated *event*, not the default state; emoji as a readability tool (naming chores), not decoration; one shared "everyone's progress" screen that reads as a dashboard to adults and a scoreboard to kids. Avoid full avatar-builders and competitive leaderboards — that's where it tips into childish.

**Adopt vs. bloat:**
- **Star-bank → named per-kid reward with a threshold + visible redemption debit** — *highest-leverage add.*
- **Full-list completion celebration** (CSS/JS confetti, gated to clearing the list) — *valuable, cheap.*
- **Optional per-chore approval toggle** (small chores auto-grant; big ones need a tap) — *valuable, keep it optional to avoid friction.*
- **"Up for grabs" unassigned pool** — *situational;* marginal with two kids.
- **Badges / leaderboards / heavy gamification** — *mostly bloat;* at most a quiet per-person streak number.

### 4. Family finance *(your "industrial dashboard" complaint lives here)*

**Splitwise — three-box balance header + spatial settle-up.** A top row of three tappable boxes — *you owe / you're owed / settled* — filters the list when tapped; green = owed to you, red = you owe, used consistently. Settle-up maps money spatially: two avatars on opposite sides of an arrow so you *see* A → B without reading text.

**Honeydue — bills as assigned jobs.** A bill isn't just due; it's *someone's* — each bill has a due date and a designated person who gets the reminder. Pairs naturally with your calendar.

**Goodbudget — one green/red fill bar per category.** Glance and know "on track / overspent" without reading a number — visual primitive first, digits second.

**Warm cues (the fix for your complaint):** lead with one plain-language headline ("You're owed €40 this month" / "Everyone's settled up 🎉"), not a KPI grid; per-person avatar + fixed color tinting every row, chip, and arrow; warm palette with soft rounded cards and whitespace instead of hard-bordered table rows; green/red only for owe/owed (one meaning per color); progress bars and flow arrows over raw digits; a small celebratory zeroed-out state on settle-up.

**Adopt vs. bloat:**
- **Three-box balance header + avatar-colored per-person rows** — *build first; highest clarity/warmth payoff.*
- **Avatar → arrow → avatar settle-up with a "Settle all" + celebratory zero state** — *valuable.*
- **Bills with due date + assigned person** — *valuable;* ties into the calendar.
- **A few category fill-bars (cap ~4–6)** — *valuable if kept small;* full envelope system is bloat.
- **Debt-simplification algorithm** — *bloat;* pointless at four people.
- **Bank/Plaid auto-sync** — *bloat & scope creep;* it's the very thing that makes finance feel industrial. Keep manual quick-entry.

---

## Deliverable A — UI/UX redesign direction

A concrete visual language. Specific enough to build against.

### A1. Design principles

1. **One color = one human, everywhere.** Person color appears on calendar blocks, chore rows, star totals, and expense rows identically. This is the spine of the whole redesign.
2. **Warm, not childish.** Warm neutrals + saturated-but-grown-up person colors + rounded geometry + one playful moment per module (a celebration), never wall-to-wall whimsy. Two parents must feel at home.
3. **Show state with primitives, not digits.** Current-time bar, progress bars, flow arrows, fill bars — feel before number.
4. **Delight is earned, not ambient.** Celebrations are gated events (cleared chore list, settled balances), so daily use stays calm.

### A2. Color system

Move off the flat factory-blue to a warm neutral foundation with vivid per-person accents.

**Foundation (neutrals — warm, not grey-blue):**
- `--bg` app background: `#FBF7F0` (warm cream)
- `--surface` cards: `#FFFFFF` with soft shadow `0 2px 8px rgba(60,40,20,0.06)`
- `--surface-sunken` (sheets, sunken rows): `#F4EDE2`
- `--border` hairlines: `#EBE2D4`
- `--text` primary: `#2E2A26` (warm near-black, not pure black)
- `--text-muted`: `#8A8178`

**Single shared accent — "now / primary action" (reserved, like Skylight's orange):**
- `--accent`: `#FF7A45` (warm coral-orange) — current-time bar, primary buttons, "today" dot. Used sparingly so it always means "act / now."

**Per-person palette (assign one per member; these are defaults, user-editable):**
- Parent 1: `#E8595B` (warm red)
- Parent 2: `#3D8BCD` (true blue — still allowed, just no longer the *whole UI*)
- Kid 1: `#3FA796` (teal-green)
- Kid 2: `#C77DD8` (orchid purple)
- Reserve pool for future members: `#E8A23D` (amber), `#7C83DB` (periwinkle), `#5BA85B` (leaf), `#E07AA0` (rose)

Each person color needs three tints in tokens: **`-solid`** (avatar fill, block fill at ~90% opacity), **`-soft`** (`solid` at 14% over surface — row backgrounds, chips), **`-text`** (a darkened version meeting 4.5:1 on white for labels). Generate the soft/text tints programmatically from the solid so editing a color updates all three.

**Semantic (finance + status, one meaning each):**
- `--pos` owed-to-you / on-track: `#2FA36B`
- `--neg` you-owe / overspent: `#E8595B` (shares the warm-red hue family)
- `--star`: `#F5B73D` (warm gold) — reserved for stars/rewards only.

### A3. Typography

Drop any default system-blue-dashboard feel with a warmer, rounded-but-legible pairing:
- **Display / headings:** *Fraunces* (soft serif) or, if you want sans, *Quicksand* / *Nunito* (rounded terminals = friendly without childish). Use for screen titles and the plain-language finance headline.
- **Body / UI:** *Inter* or *system-ui* for everything functional — clean and neutral so the warmth comes from color and shape, not a novelty font.
- **Scale (1.25 ratio):** 12 / 14 / 16 (base) / 20 / 25 / 31 / 39px. Headings 600–700 weight; body 400–500.
- **Numbers:** use tabular-figures (`font-variant-numeric: tabular-nums`) for times, stars, and money so columns align.
- **Roundness:** card radius `16px`, chips/avatars fully round, buttons `12px`. Generous line-height (1.5 body) and whitespace — the anti-dashboard move.

### A4. Avatars & member identity

- **Avatar = round, person color fill, with either a photo, an uploaded image, a single chosen emoji, or initials** (fallback). One emoji per person is the sweet spot: playful, instantly legible to a non-reader kid, tasteful for adults. *Avoid* full cartoon avatar-builders.
- Sizes: `24px` (inline on event blocks/rows), `32px` (chips, lists), `56px` (profile screens). Always a 2px white ring when overlapping colored backgrounds.
- Avatars appear: on calendar event blocks (corner), on chore rows, beside star totals, on finance expense rows and settle-up arrows. Same component everywhere.

### A5. Member-profile editing (the missing screen)

A new **Family / Members** settings screen:
- A list of member cards, each showing avatar + name + color swatch, with an "＋ Add member" button (and remove, with a confirm).
- Tapping a member opens an editor: **editable name field**, a **color picker** (the per-person palette as tappable swatches + a custom hex), and **avatar chooser** (upload photo / pick emoji / initials). Changing a color live-updates that person's blocks/rows everywhere (since soft/text tints derive from the solid).
- Optional per-member fields used by other modules: role (parent/kid — drives whether chore-approval and finance-settle controls show), and birthday (feeds calendar).
- Persist to your Supabase `members` table; everything else references `member_id` + reads color/avatar from here so identity is single-source.

### A6. The calendar redesign — day / week / month

**View switcher:** a single segmented control top-right, `Day · Week · Month`, with **Day as the default landing view**. Title area shows the focused date ("Sunday, June 14") with `‹ ›` arrows and a "Today" pill. A **people-filter row** of avatar chips sits under the header (all-on by default; tap to toggle a person in/out of the current view).

**DAY view (default, detailed, editable):**
- A vertical hourly grid (e.g. 6am–11pm, scrollable), hour lines as hairlines.
- Timed events render as **colored blocks** filled with the owner's color, positioned/sized by start+duration, showing title + time + a 20px owner avatar in the corner; multi-owner events stripe two colors.
- A horizontal **coral current-time bar** spans the grid at "now"; the view **auto-scrolls to now** on open.
- **Untimed / all-day items** list in a slim strip above the grid (chips, owner-colored).
- **Inline editing:** tap a block to expand it *in place* into an editable panel — title, start/end, owner avatar-chips (multi-select), location, notes, delete — without leaving the day. Tap empty grid space to create an event pre-filled at that time. This "detailed event with an inline editable section" is exactly your ask.
- **Create:** a `＋` FAB and tap-to-create on the grid; new-event form uses the avatar-chip "who's this for?" selector (defaults to everyone).

**WEEK view:** seven day-columns sharing the same hourly grid and colored blocks; people-filter still applies; tap a block → same inline edit; tap a day header → jump to Day.

**MONTH view:** keep it, but switch from blue bars to **per-person colored dots** under each date (legible at density). Tap a day → a **half-screen sheet** lists that day's events (owner-colored, tappable into edit) — Cozi's gentle drill-down — with a "open full day" link to the Day view.

### A7. Making it cheerful, not childish

- Warmth from **color + rounded shape + whitespace + friendly copy**, not from cartoons or rainbow gradients.
- **One celebration per module**, gated to a real achievement (chore list cleared → emoji burst; balances settled → confetti + "All settled 🎉"); silent the rest of the time.
- Emoji used **functionally** (an avatar, a chore label, a celebration) — never sprinkled as decoration.
- Friendly, plain microcopy: "Who's this for?", "Nothing planned — enjoy the quiet 🌿", "You're owed €40 this month." Avoid both corporate ("Attendees", "Transactions") and baby-talk.
- Restraint is the adult-safety valve: calm default state, vivid identity color, a single reserved action accent.

---

## Deliverable B — Functionality changes (prioritized)

Tags: **[MVP-fix]** = correctness/core-experience gap, do now · **[Nice]** = real value, second wave · **[v2]** = later / new module.

### Improve existing screens

**Calendar**
- Day view as default — editable hourly grid, colored blocks, untimed strip, current-time bar, auto-scroll to now. **[MVP-fix]**
- Day/Week/Month segmented switcher. **[MVP-fix]**
- Inline-editable event panel (expand block in place). **[MVP-fix]**
- Month: colored per-person dots + tap-day half-sheet drill-down (replace blue bars). **[MVP-fix]**
- People-filter avatar chips across all views. **[Nice]**
- Avatar-chip "who's this for?" multi-select on create/edit. **[Nice]**
- Tap-empty-grid-to-create + `＋` FAB. **[Nice]**
- Birthdays auto-surfaced from member profiles. **[Nice]**

**Chores / stars**
- Star-bank → named per-kid reward with threshold + progress bar + visible redemption debit. **[MVP-fix]** (closes the motivation loop)
- Per-person color + avatar on every chore row. **[MVP-fix]** (identity consistency)
- Full-list completion celebration (gated emoji burst). **[Nice]**
- Shared "everyone's progress" rewards screen. **[Nice]**
- Optional per-chore parent-approval toggle (big chores need a tap; small ones auto-grant). **[Nice]**
- Quiet per-person streak counter. **[Nice]** (skip badges/leaderboards)

**Finance**
- Three-box balance header (you owe / you're owed / settled) + plain-language headline. **[MVP-fix]** (kills the "industrial dashboard" feel)
- Per-person avatar + color tint on every expense row. **[MVP-fix]**
- Soft rounded cards + warm palette replacing dense bordered tables. **[MVP-fix]**
- Avatar → arrow → avatar settle-up with "Settle all" + celebratory zero state. **[Nice]**
- Bills with due date + assigned person who gets the reminder (ties to calendar). **[Nice]**
- 4–6 category fill-bars (green/red on-track/over). **[Nice]**
- *Explicitly not building:* debt-simplification algorithm, bank/Plaid sync. **[skip]**

**Global / design system**
- Member-profile editing screen (names, colors, avatars). **[MVP-fix]** (unblocks identity everywhere)
- Color-token system with derived soft/text tints; single-source member identity. **[MVP-fix]**
- Shared Avatar + person-color components reused across modules. **[MVP-fix]**
- Typography + warm-neutral theme swap. **[MVP-fix]**

### New module candidates — Meal planning (all **[v2]**)

- Shared "Family Recipe Box" (recipes referenced by all). **[v2]**
- Recipe URL clipper (JSON-LD parse) **with manual-paste fallback**. **[v2]**
- Tap-to-place weekly **dinner** plan (dinner-first; skip breakfast/lunch slots). **[v2]**
- Auto-aggregated, aisle-sorted grocery list with "already have it" check-off (merge on title+unit match). **[v2]**
- "Who's cooking" tag + per-person color stripe on meals. **[v2]**
- *Explicitly not building:* pantry/expiry inventory, nutrition/macros, AI auto-plans, multi-store lists. **[skip]**

---

## The 5 highest-impact changes to make first

1. **Build the member-identity foundation** — profile-editing screen (names, colors, avatars) + a color-token system with derived tints + reusable Avatar/person-color components. *Everything else depends on this; it's the single change that converts "corporate" to "ours."*
2. **Ship the editable day view as the calendar default** — hourly grid, owner-colored blocks, untimed strip, coral current-time bar, auto-scroll to now, inline-edit panel, with the Day/Week/Month switcher. *Your top stated gap.*
3. **Re-skin to the warm visual language** — cream/white surfaces, warm-neutral text, rounded cards, the typographic pairing, replacing flat factory-blue. *Fixes the cold tone in one pass across all modules.*
4. **Fix the finance screen with the three-box balance header + plain-language headline + avatar-colored rows.** *Directly kills your "industrial dashboard" complaint with low effort.*
5. **Close the chores loop with star-bank → named rewards (threshold, progress bar, visible redemption) + a gated completion celebration.** *Turns accumulating stars into real motivation and adds the first tasteful moment of delight.*

Meal planning stays entirely in v2 — don't let it pull focus from making the three existing modules warm and well-interacted first.

---

### Sources

Calendar: [Cozi calendar](https://www.cozi.com/calendar/), [Cozi SmartAdd](https://www.cozi.com/blog/cozi-smart-add/), [Cozi mobile month](https://www.cozi.com/blog/mobile-month-makeover/), [Skylight calendar tab](https://skylight.zendesk.com/hc/en-us/articles/36625171368987-Using-the-Calendar-Tab), [Skylight Calendar product](https://myskylight.com/products/skylight-calendar/), [TimeTree interface](https://support.timetreeapp.com/hc/en-us/articles/204263359-2-About-the-interface), [getsense best family calendars 2026](https://getsense.ai/blog/posts/best-family-calendar-apps-2026).
Meal: [Plan to Eat grocery list](https://www.plantoeat.com/tour/automated-grocery-list-maker/), [Plan to Eat sorting/combining](https://learn.plantoeat.com/help/sort-group-and-combine-items-on-your-shopping-list), [Paprika](https://www.paprikaapp.com/), [Mealime](https://www.mealime.com/), [Cozi meals](https://www.cozi.com/meals-and-recipe-box/).
Chores: [Skylight chores guide](https://myskylight.com/how-to-manage-chores-and-family-tasks-with-skylight-calendar/), [Skylight Rewards](https://myskylight.com/lp/rewards/), [Greenlight chores/allowance](https://greenlight.com/chores-and-allowance-app-for-kids), [OurHome review](https://www.littledayout.com/parent-review-ourhome-app-for-home-organisation-and-behaviour-management/), [gamification caution](https://gethomsy.com/blog/chores-and-household/chores-app-for-kids-rewards).
Finance: [Splitwise design critique](https://ixd.prattsi.org/2026/02/design-critique-splitwise-mobile-app/), [Splitwise redesign case study](https://www.snow.dog/blog/case-study-redesigning-the-splitwise-app-design-team-day), [Honeydue review](https://www.cnbc.com/select/honeydue-budgeting-app-review/), [Goodbudget](https://budgetingapps.org/apps/goodbudget/), [fintech UI/UX](https://design4users.com/ui-ux-design-finance-fintech-digital-products/).
