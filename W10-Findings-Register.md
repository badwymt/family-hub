# W10 — Findings register, test matrix, and fix plan

**Raised by mo, 2026-08-09, after using the live wall at `family-hub-beta-six.vercel.app`.**
Every item below was reproduced in code or in the browser before being written down. Nothing here is speculative.

---

## 0. What I got wrong, plainly

Three failures of method, not just of code:

1. **I hid a shared CSS class without checking who used it.** `styles.css:535` sets `.viewseg { display:none }` in wall mode because the *calendar's* view switcher moved into the info bar. But `.viewseg` is also the section-tab class for **Meals** (`In the house / Need to buy / Meals`) and **Finance** (`Overview / Monthly review`). One line silently removed the navigation from two modules. I made exactly this mistake earlier with `.wd`, caught it, and then didn't generalise the lesson.

2. **I tested that things render, not that a person can complete a task.** My 174 assertions confirm a Redeem button exists in *some* state. None of them ever asked "can a child with 18 stars actually redeem the 15-star reward?" — which is false, and has been since W4.

3. **I treated the locked decisions as more important than the product.** "Money is phone-only" became "Finance is unreachable from the wall at all." "Rewards folded into Chores" became "you cannot edit a chore on the wall." I optimised for the spec I'd written instead of the thing being used.

---

## 1. Findings register

Severity: **S1** = feature is unusable · **S2** = feature is degraded · **S3** = quality/polish.

### F1 · S1 · Redeem is structurally unreachable
> *"how can redeem from existing stars"*

`renderChoreWall() → kidCard()`:
```js
const next  = rewards.filter(r => r.star_cost > bal).sort(...)[0] || <most expensive>;
const afford = next && bal >= next.star_cost;
```
`next` is **defined as a reward you cannot afford**, so `afford` is false by construction. The Redeem button only ever appears when the filter returns empty — i.e. when you can already afford *every* reward in the catalogue. That is why Nono (323M stars) showed "Redeem" and Doma (18 stars, 15-star reward) showed "32 to go".

**A child has never been able to redeem a reward on the wall.**

### F2 · S1 · The rewards strip ignores the active profile
> *"why i see doma and nono start while in the profile of doma"*

`renderChoreWall()` line ~2550: `${kids.map(kidCard).join("")}` — every child, always. W9 scoped the chore **columns** to the active member and I did not scope the **strip** next to them. So Doma's screen shows Nono's balance and Nono's goal.

### F3 · S1 · No way to edit or delete a chore on the wall
> *"how you edit how"*

`.taskedit` (the ✏️) exists only in `renderChoreMember()` — the **phone** view. The wall pane I wrote in W4 has exactly one interaction per row: tap to toggle. There is no edit, no delete, no way to change a star value, no way to reassign. The only `openTaskForm` reachable on the wall is the FAB, which always creates a **new** chore.

### F4 · S1 · Meals and Finance lost their section tabs
> *"list & meals seems lost many functionality"*

`.viewseg` hidden globally in wall mode (see §0.1). Consequences:
- **Meals**: `In the house` / `Need to buy` / `Meals` tabs gone. Only the first section renders. The 7-day plan and the buy list are unreachable.
- **Finance**: `Overview` / `Monthly review` tabs gone.

### F5 · S1 · Finance is unreachable from the wall
> *"I don't see fianace part anymore"*

Not in the rail (a locked decision), and W1 hid both `#/hub` and the floating 🏠 in wall mode — which were the only links to it. `#/finance` still routes if typed manually. Nothing on the wall links to it.

### F6 · S2 · Meals does not use the wall
One ~400 px card sits in a ~1400 px pane. I only wrote reflow CSS for `.planweek`, which is inside the tab I hid.

### F7 · S1 · Kid Mode is undiscoverable — the pre-reader work is effectively unshipped
> *"how kids who can't read will use it"*

Kid Mode is reachable **only** by a 600 ms long-press on a people-strip chip, or by tapping a kid's avatar inside the rewards strip. A 5-year-old will not discover a long-press. A parent would not guess it. The single most important thing in the whole project — the reason the benchmark research exists — ships behind a hidden gesture. This is the finding I'm most annoyed with myself about.

### F8 · S2 · Lists is primitive
`renderLists()` uses `prompt()` for "add list" and "add item". That is a browser dialog on a touchscreen with no keyboard. It is meaningfully worse than the Meals grocery module it sits beside.

### F9 · S2 · Adding a chore can't target a person
The FAB calls `openTaskForm(null)`, whose assignee defaults to `state.choreMember || state.member.id`. `state.choreMember` is unused by the wall pane, so a new chore always defaults to whoever is active — you cannot add "Nono: tidy toys" from Nono's column.

### F10 · S3 · The orange is not restful
> *"the orange theme is not eye relaxing color"*

`--accent:#FF7A45` at full saturation, used for the FAB, active rail item, TODAY rule, now-line and every primary button, on a screen that is lit in a living space ~16 hours a day.

### F11 · S3 · It looks basic, especially for the kids
> *"UI looks very basic"* · *"where is your investigatoin about making this more attractive for kids"*

The benchmark research is real and is in `Family-Hub-Chores-Benchmark-and-Fixes.md`, but almost none of the *motivational* half reached the screen. Shipped: bands, icons, a burst. Not shipped: streaks, progress a child can feel, any sense of a character or collection, bonus/surprise chores (the one retention lever the research actually identified), or any visual reward for finishing a band beyond confetti.

---

## 2. Test matrix — every feature × every profile

The gap in my testing was **role coverage**. Each cell is a task a person completes end to end, not a render check.

Profiles: **P** = parent (Suzy) · **K8** = reader kid (Nono) · **K5** = pre-reader (Doma) · **—** = no profile picked.
Surfaces: **W** = wall 1280×720 · **M** = phone 390×844.

| # | Journey | P/W | K8/W | K5/W | P/M | K/M |
|---|---|---|---|---|---|---|
| T1 | See who I am; switch profile; land back where I was | ✓ | ✓ | ✓ | ✓ | ✓ |
| T2 | Complete a chore → stars rise | ✓ | ✓ | ✓ | ✓ | ✓ |
| T3 | Un-complete it → the same stars come back off | ✓ | ✓ | ✓ | ✓ | ✓ |
| T4 | **Redeem a reward I can afford** | ✓ | ✓ | ✓ | ✓ | ✓ |
| T5 | Cannot redeem one I can't afford | ✓ | ✓ | ✓ | ✓ | ✓ |
| T6 | **Edit a chore** (title, stars, assignee, icon, band) | ✓ | ✗ | ✗ | ✓ | ✗ |
| T7 | **Delete a chore** | ✓ | ✗ | ✗ | ✓ | ✗ |
| T8 | **Add a chore to a specific person** | ✓ | ✗ | ✗ | ✓ | ✗ |
| T9 | Create / edit a reward | ✓ | ✗ | ✗ | ✓ | ✗ |
| T10 | Fulfil / refund a pending redemption | ✓ | ✗ | ✗ | ✓ | ✗ |
| T11 | See only my own chores | n/a | ✓ | ✓ | n/a | ✓ |
| T12 | **Reach the pre-reader screen without a hidden gesture** | ✓ | ✓ | ✓ | ✓ | ✓ |
| T13 | Hear a chore read aloud | — | ✓ | ✓ | — | ✓ |
| T14 | Calendar: add / edit / delete an event | ✓ | ✗ | ✗ | ✓ | ✗ |
| T15 | Calendar: every view renders and switches | ✓ | ✓ | ✓ | ✓ | ✓ |
| T16 | **Meals: reach all three sections** | ✓ | ✗ | ✗ | ✓ | ✗ |
| T17 | Meals: plan a meal for a day | ✓ | ✗ | ✗ | ✓ | ✗ |
| T18 | Meals: move an item in-house → buy | ✓ | ✗ | ✗ | ✓ | ✗ |
| T19 | **Lists: add a list and an item without a keyboard dialog** | ✓ | ✗ | ✗ | ✓ | ✗ |
| T20 | **Finance: reachable; both tabs work** | ✓ | ✗ | ✗ | ✓ | ✗ |
| T21 | Countdowns: create one; it appears in the chip | ✓ | ✗ | ✗ | ✓ | ✗ |
| T22 | Settings: open; change density; set a PIN | ✓ | ✗ | ✗ | ✓ | ✗ |
| T23 | PIN blocks redeem / delete / star edits | ✓ | ✓ | ✓ | ✓ | ✓ |
| T24 | Sleep / ambient: trigger and wake | ✓ | ✓ | ✓ | n/a | n/a |
| T25 | Offline: complete, reload, reconnect, replay | ✓ | ✓ | ✓ | ✓ | ✓ |

✓ = must work · ✗ = must be blocked, **with an explanation, never a silent bounce**.

Two harnesses:
- `test/journeys.mjs` — all 25 × applicable profiles, headless, deterministic (in-memory Supabase stub).
- Chrome MCP — the same 25 against the live deployment with real data, because the stub cannot reproduce things like 8 pending redemptions or an Arabic pantry item.

---

## 3. Modification list

### P0 — functional breakage (nothing else matters until these are done)
1. **F1** `kidCard()`: pick the cheapest **affordable** reward when one exists; otherwise the cheapest unaffordable one as the goal. Show *both* — "you can get X now" and "Y is N stars away".
2. **F2** Scope the rewards strip to the active profile: a kid sees only their own card.
3. **F3** Restore edit/delete on the wall: a ✏️ on each chore row for parents, opening the existing `openTaskForm` (already PIN-gated for star changes and delete).
4. **F4** Replace the blanket `.viewseg` hide with a targeted one — hide only the calendar's, since only that moved to the info bar. Add `.viewseg--cal` rather than hiding the shared class.
5. **F5** Put **Finance** back on the wall: a rail item. The "phone only" decision was mine and it was wrong — a wall is where you glance at a bill that's due.
6. **F9** `openTaskForm(null, memberId)`: a `+` on each column header adds a chore for that person.

### P1 — the pre-reader work must actually be reachable
7. **F7** Kid Mode gets a real front door: each kid's card in the rewards strip becomes a large labelled **"Doma's screen"** button, and the people-strip chips get a visible ▶ for kids. Long-press stays as a shortcut, never as the only route.
8. **F7b** When a **pre-reader profile is active on the wall, Chores opens Kid Mode directly** — Doma should never see the family grid.
9. **F13** Kid Mode auto-reads the chore title on first render of a band (once, quietly), so a non-reader gets the labels without finding the 🔊.

### P2 — the modules I damaged
10. **F6** Meals: reflow all three sections for the wall, not just the plan.
11. **F8** Lists: replace `prompt()` with an inline input row.
12. **F16** Meals + Lists: one shared "Groceries" concept, not two competing ones.

### P3 — the things you actually reacted to
13. **F10** Retune the accent. `#FF7A45` → a softer terracotta (`#E8734A`) for large fills, keeping full-strength orange only for the now-line and TODAY marker where it must pop. Add a **warm/quiet toggle** in Settings so it's your call, not mine.
14. **F11** Kid motivation, drawn from the benchmark that's already written:
    - a **streak** ("3 days in a row") — the retention lever the research names
    - a **band-complete celebration** that means something (the board fills, not just confetti)
    - **bonus chores** that appear occasionally for extra stars — the one mechanic Skylight's reviewers describe kids actively chasing
    - progress a 5-year-old can *see*: the star board fills left-to-right toward a pictured prize
15. **F11b** Chore rows get real presence: bigger icons, the person's colour, less spreadsheet.

---

## 4. Order of work

1. P0 (1–6) — restores every broken function. Re-run the full matrix.
2. P1 (7–9) — makes the pre-reader work real. Re-run.
3. P2 (10–12) — repairs Meals and Lists. Re-run.
4. P3 (13–15) — theme and motivation, with your sign-off on direction before I build.

Steps 1–3 are corrections and I'll just do them. **Step 4 is taste, and I should not pick it for you** — §5 has the specific questions.

---

## 5. What I need from you before P3

- **Colour**: softer terracotta, a calmer green/teal, or keep the orange and just reduce where it's used?
- **Kid motivation**: streaks + bonus chores, or a collectible (each completed day earns a sticker on a board)? The research supports both; the second is more work and more delightful.
- **Finance on the wall**: full module, or a small "next bill due" card on the ambient screen only?
