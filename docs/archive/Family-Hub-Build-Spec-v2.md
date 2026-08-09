# Family Hub — Build Spec v2 (feature-rich)

*Revised June 14, 2026 · based on your feedback + a second, deeper market benchmark of finance and grocery/meal apps. This is the build-ready functional spec. Pair it with the visual language in `Family-Hub-Redesign-Plan.md` (warm palette, per-person color + avatars).*

Guiding rule for every module: **match what the best apps actually do — not a basic version.** Each module below cites the specific app pattern it's copying.

---

## 1. Calendar

Answers to your three questions, now in the spec.

**Add-event button.** A round coral **＋ FAB** fixed bottom-right of the day/week views, **plus** tap any empty time slot on the day grid to create an event pre-filled at that hour. Both open the same event editor.

**Repeatable events.** The event editor gets a **Repeat** field: `Does not repeat · Daily · Weekly (pick days) · Every weekday · Monthly · Custom…`. A repeated event shows a small loop icon on its block. Edit/delete prompts "This event / This and following / All events" (standard recurrence handling). Stored as a rule (RRULE-style: freq + interval + by-day + until), expanded at render — don't store every instance.

**Meals on the calendar.** A meal planned in the Meal module (§4) lands on its day as a **meal card** (e.g. "Dinner — pasta night") in the all-day strip, tinted with a dedicated meal color and a fork icon. Meal and calendar are the *same data shown twice* (Cozi model) — editing the meal updates the calendar entry.

**Day view recap (default):** hourly grid, owner-colored blocks, coral current-time bar with auto-scroll to now, all-day/meal strip on top, inline-edit on tap, FAB + tap-slot to create, people-filter chips.

**Module priorities:** day view + ＋ FAB + tap-slot **[MVP-fix]** · repeatable events **[MVP-fix]** · meal cards from §4 **[MVP-fix]** · week/month per-person dots, people filter **[Nice]**.

---

## 2. Chores — redesigned to your flow

Structured exactly as you described, with mechanics borrowed from Skylight (celebration + star bank), Greenlight (approval), and OurHome (visible point debit).

### 2a. Home = family avatars
The chores home is a grid of **large member avatars** (color + avatar + name), each showing that person's **star balance** and a tiny "x/y done today" ring. Tap a member → their chore list. (This is your requested entry point and doubles as the at-a-glance family scoreboard.)

### 2b. Member chore list + Add Chore
Tapping a member opens their list: chore rows with a big check circle, title, star value, due chip, and a repeat icon if recurring.

**Add Chore button** (top-right ＋ on the member's list) opens an editor with:
- **Title** (e.g. "Homework")
- **Assignee** — avatar chips (defaults to the member whose list you're on; can reassign / assign to multiple)
- **Stars** — number stepper (the reward value)
- **When it's due** — date / "today" / day-of-week
- **Repeat** — `Once · Daily · Weekly (pick days) · Weekdays` (so recurring chores like "make bed" regenerate)

**Completing a chore:** tap the check circle → the chore's **stars are added to that member's balance immediately**, the row checks off, and a **small satisfying micro-animation** fires. When the member's **whole list for the day is cleared**, a **full-screen celebration** (confetti/emoji burst) plays — gated to full completion so it stays special (Skylight pattern). Optional per-chore **parent-approval toggle**: big chores enter a "pending ✓" state until a parent confirms, then stars post (Greenlight) — small chores auto-grant.

### 2c. Rewards bank (bottom of the chore/member page)
A **Rewards** section where you **create a reward**: name (e.g. "Ice-cream trip"), and **star cost** (how many stars it consumes). On the page you can always see:
- the member's **accumulated star count**,
- each reward as a card with a **progress bar** toward its cost,
- when the balance **meets or exceeds** a reward's cost, that reward becomes **Active / Redeemable** (visually lights up with a "Redeem" button),
- pressing **Redeem deducts** the stars from the balance (visible debit, OurHome pattern) and logs it to a small **reward history** ("Redeemed Ice-cream trip · −50 ★").

**Module priorities:** avatar home → member list **[MVP-fix]** · Add Chore (assignee, stars, due, repeat) **[MVP-fix]** · star increment on tap + reward bank create/redeem with deduct **[MVP-fix]** · full-list celebration **[MVP-fix]** · per-chore approval toggle, reward history **[Nice]** · streak counter **[Nice]** · leaderboards/badges **[skip]**.

---

## 3. Finance — rebuilt (was the weakest module)

Second benchmark drew from **Copilot Money** (warm "Month in Review" recap + Recurrings tab), **Rocket Money** (Upcoming/Calendar bill lenses), **Bobby** (per-item color identity), **Monarch** (recurring calendar + glance dashboard), **Zeta** (per-person tagging/splits). Currency: **USD `$1,234.56`** throughout. The 2026 anti-spreadsheet direction is warm neo-earth tones, big numbers, few gridlines.

### 3a. Finance home (the glance screen)
- Warm header card: large **"Spent in June — $2,418"** with a small **"vs. May −$120"** delta pill (green good / clay over).
- **Strip of 4 member avatars**, each with their month total beneath; tap → that person's expenses.
- **Upcoming (next 14 days)** agenda: small rows — category icon, bill name, amount, due date, owner color dot (Rocket "Upcoming" view).
- **Recent** expenses: cards tinted with the payer's color + category emoji + amount + relative date.
- Floating **＋** → Add flow.

### 3b. Add expense (amount-first, 3 taps) — two types from one button
- Top toggle: **One-off | Recurring**.
- Step 1: big numeric keypad, **$** amount front and center.
- Step 2: grid of big **category tiles** (emoji + label — Groceries, Rent, Utilities, Kids, Fun…).
- Step 3: **person chips** (who paid / who it's for); optional **Split** toggle to share across people (Zeta).
- If **Recurring**: reveal **cadence** (Monthly default; Weekly/Yearly) + **due day-of-month**, stored once and auto-projected each month. If one-off: date (defaults today).

### 3c. Monthly review (the "review by end of month" you asked for)
- Month selector + headline **"$X spent in June"** + delta vs. last month.
- **By category:** stack-ranked horizontal bars (emoji + name + $ + % of total) — YNAB-style breakdown.
- **By person:** 4 rows, avatar + color bar + total + their top category.
- **Fixed vs. variable:** one two-segment bar ("Fixed $1,600 · Variable $818") so you see committed vs. discretionary at a glance.
- **Recurring list** with each item's next-due date and a "mark paid this month" check (Monarch green check).

### 3d. Nice-to-have
- **"June recap"** swipeable story cards (Copilot): "You spent $X," "Top category: Groceries," "Biggest spender: Dad," "vs. May" — highest warmth-per-effort feature.
- Bill **calendar** lens (month grid of due dates); custom category emoji/color; due-date push reminders.

**Skip as bloat (4 people):** bank/Plaid auto-sync & auto-detected recurring, net-worth/investments/debt payoff, AI assistant, zero-based envelope budgets, multi-account reconciliation.

**Module priorities:** USD + one-off & recurring add + per-person tint **[MVP-fix]** · finance-home glance + Upcoming bills **[MVP-fix]** · monthly review (category + person + fixed/variable) **[MVP-fix]** · recurring list with mark-paid **[MVP-fix]** · month recap story, bill calendar, reminders **[Nice]** · bank sync etc **[skip]**.

---

## 4. Meal + Grocery — now a CORE module (not v2), built as 3 sections

Your three sections, with the strongest patterns from **AnyList** (store tagging + filters, meal→list), **Bring!** (visual tiles + activity/emoji reactions), **OurGroceries** (instant check-off + sync), **Cozi** (meal auto-appears on calendar), **Paprika** (pantry suppresses duplicates). Guiding rule: **the have-list and meals exist to reduce typing into the buy list — never bookkeeping.**

### Section 1 — "In the house" (have-list)
- A short, glanceable list of **staples**, lightly grouped (Fridge / Pantry / Freezer). Each row = item + a **have** state + a small **"→ buy"** button.
- **Add:** persistent text input ("Add what you have…"), type + enter (e.g. milk, eggs). Optional tap-tiles of common staples.
- **Key interaction:** running low → tap **"→ buy"** → item jumps to the Buy list (with its usual store pre-tagged if known).
- **Deliberately NOT** a quantity/expiry inventory — research shows those get abandoned in 1–2 weeks. Binary have/need only.

### Section 2 — "Need to buy" (multi-store, e.g. Costco)
- **One master list**, items grouped by aisle/category. Each row: check circle, item name, a **store chip** (e.g. "Costco").
- **Store filter pills** at top: `All · Costco · Supermarket · Pharmacy`. Tap a pill → list collapses to that store.
- **Store tagging (AnyList's killer mechanic):** either tap an item → pick its store, **or** tap the "Costco" filter first and **everything you add while that filter is active is auto-tagged Costco** — so you batch-build a Costco run fast.
- **Check-off (OurGroceries):** tap circle → strike through → drops to a collapsed **"Got it (n)"** section; tap to restore; not deleted until you clear the trip.
- **Add:** text input ("Add to buy list…") + optional frequent-item tiles (Bring!) for one-tap.
- *Nice-to-have:* an **activity line + emoji reaction** ("Mom added cheese" · tap ♥) — the warmth feature (Bring!).

### Section 3 — "Meals" → main calendar
- A **week strip** (Mon–Sun), each day with **Lunch** and **Dinner** slots; empty slots show "＋ Add meal."
- **Add meal:** tap a slot → sheet: meal title (free text, e.g. "pasta night"), type (Lunch/Dinner), day pre-filled. Save →
  - the meal shows in that day's slot, **and**
  - **appears on the main family calendar** as that day's meal card (same data, two views — Cozi).
- **Meal → buy list:** on a saved meal, **"Add ingredients to buy list"** opens an ingredient checklist; check what you need (skip what's in the house), optionally assign a store → adds to Section 2. *Phase 2:* items already in the have-list are auto-greyed (Paprika suppression); duplicate ingredients across the week consolidate.

**Module priorities:** have-list (binary + →buy) **[MVP]** · buy list with store tag + filter-auto-tag + check-off **[MVP]** · meals→calendar + add-ingredients-to-buy **[MVP]** · real-time shared sync **[MVP, table stakes]** · frequent-item tiles, activity/emoji reaction, pantry suppression, recurring staples, meal templates **[Nice]** · quantity/expiry inventory, barcode scan, nutrition, AI plans, online ordering **[skip]**.

---

## Updated "first 5" given the new scope

1. **Member-identity foundation** (profiles: names/colors/avatars + color tokens) — still first; every module reads from it.
2. **Calendar day view** with ＋ FAB / tap-slot **and repeatable events**.
3. **Chores rebuilt to the avatar-home → list → add-chore → reward-bank flow** (star increment, redeem-with-deduct, celebration).
4. **Finance rebuilt** (USD, one-off + recurring add, finance-home glance, monthly review).
5. **Meal + Grocery 3-section module** (have / buy-by-store / meals→calendar) — promoted to core.

---

### Sources (second benchmark)
Finance: [Copilot Month/Year in Review](https://help.copilot.money/en/articles/10310024-month-and-year-in-review), [Copilot Recurrings](https://help.copilot.money/en/articles/9778259-recurrings-tab-overview), [Rocket Money bills](https://help.rocketmoney.com/en/articles/3117398-where-can-i-view-my-subscriptions-and-bills), [Monarch recurring](https://www.monarch.com/blog/track-recurring-bills-and-subscriptions), [Zeta review](https://thecollegeinvestor.com/24184/zeta-review/), [Bobby tracker](https://resubs.app/resources/best-subscription-tracker-apps), [finance UX 2026](https://www.g-co.agency/insights/the-best-ux-design-practices-for-finance-apps).
Grocery/meal: [AnyList stores & filters](https://help.anylist.com/articles/anylist-feature-overview-stores-and-filters/), [AnyList create filter (auto-tag)](https://help.anylist.com/articles/create-filter/), [AnyList meal→list](https://help.anylist.com/articles/meal-planning-calendar-add-recipe-ingredients/), [Bring! experience](https://www.getbring.com/blog-posts/out-now-your-whole-new-shopping-experience-with-bring), [Out of Milk features](https://outofmilk.com/features/), [Cozi meal plan→calendar](https://www.cozi.com/blog/meal-plan-with-cozi/), [Paprika](https://www.paprikaapp.com/), [OurGroceries guide](https://www.ourgroceries.com/user-guide), [pantry abandonment](https://mealthinker.com/blog/meal-planning-app-pantry-tracking).
