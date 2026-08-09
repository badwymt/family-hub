# Family Hub — Chores: Benchmark + What to Change (and Why)

**Context:** 22" Dell ST2220TC touchscreen, wall-mounted, always-on kiosk. Two kids: **Nono (8, reads)** and **Doma (5, does NOT read)**. Two parents. Vanilla-JS PWA on Supabase, one shared auth user + client-side profile picker.

**Date:** 2026-08-09

---

## Part 1 — Benchmark: what the good apps actually do

### 1.1 The headline finding

I looked at the whole mainstream category (Skylight, Skylight Buddy, Hearth, Greenlight, BusyKid, S'moresUp, Homey, OurHome, Cozi, Joon, Sweepy, Tipje, Brili) and the early-childhood / AAC visual-schedule world (Goally, Choiceworks, First-Then Visual Schedule, VizyPlan, Otsimo, Tiimo).

> **Across the entire mainstream chore-app category, essentially ONE shipped pre-reader affordance exists: an emoji or picture on the task card.** Everything richer — recorded audio per task, first-then pairing, one-step-at-a-time, a photo of the actual child — lives in the autism/visual-schedule world.

That's your opening. Copy the chore mechanics from Skylight; copy the **pre-reader** mechanics from Goally / Choiceworks / FTVS. Nobody has combined them well, which is exactly why Doma can't use anything off the shelf.

Two more datapoints that should shape the design:

- **S'moresUp is rated 6+ because it "requires a basic set of reading skills."** Common Sense's Joon review says flatly: *"using the app requires reading, so pre-readers will need assistance."* Every product that tried to serve both ages with **one UI** ended up excluding the younger child. **Do not build one chore screen for both kids.**
- **The category's universal failure mode is the week-two cliff.** Every 2026 roundup names it: *"kids lose interest within two to three weeks."* Forbes' Hearth reviewer's 9–10 year-olds "lost interest after several months." Skylight's *retention* stories are all about **scarcity and surprise** (bonus chores that appear, random emoji-rain), not about features.

### 1.2 Product comparison (pre-reader lens)

| Product | Pre-reader affordances actually shipped | Completion gesture | Reward model | Parent/kid split |
|---|---|---|---|---|
| **Goally** (kid tablet, 2–8) | **Pictograms instead of text**; parent-uploaded photo steps; per-step visual timer; one step on screen at a time | Tap "done" → auto-advances to next step | Points → parent rewards | Closed device; all config on parent's phone |
| **Skylight Buddy** (2026, 7" bedside) | **Emoji per task**; **parent-recorded audio nudges**; TTS voice; per-task timers | Tap the task | Stars → rewards; **emoji-rain celebration** | Parent phone app. **Cannot switch child profiles on one device** |
| **Choiceworks** (iPad) | Custom photos + **recorded audio per item**; schedule board, waiting board, feelings board | Checkmark per task | none | none |
| **First-Then Visual Schedule** | **Two images + arrow** (first→then); own photos; **record your own voice per image**; completed image **fades** | Checkmark | none | none |
| **Skylight Calendar** (15"/27" wall) | **Emoji on tasks** — their own docs say this is *"especially popular with customers who have children who cannot yet read"*; routines auto-bucketed morning/afternoon/evening with **other bands hidden by default** | **Tap to toggle** complete ↔ incomplete | Stars 5–10/habit, 100+/big chore; rewards 1–500 | **Device-local 4-digit PIN**, separately configurable for *add* vs *modify*, inactivity timeout up to 10 min. **No approval gate on redemption** |
| **Hearth** (27" wall, ~$700 + sub) | Routines with visual cues; colour per family member | Tap "done" → **confetti over screen** | Coins → parent rewards | no hard split |
| **Brili** | Images from photo roll/library; routine countdown | **Swipe card left** ← bad choice, see 1.3 | Stars, banks extra time | parent-configured |
| **Joon / S'moresUp / Homey** | none (all reading-required) | Tap; **parent approves**; Joon+Homey support photo proof | Coins/currency | real approval flows; **S'moresUp approval lag ~30 min is a top complaint** |
| **Greenlight / BusyKid** | none | Tap; parent approves payday | Real money | Separate kid login |
| **Cozi** | none | Check off | **no rewards at all** | none |
| **Tipje** | picture cards | Tap | "peanuts" → real-world rewards | **PIN-protected admin section** |
| **VizyPlan** | **AI puts the child's own face into every step image** — strongest personalisation idea found | step-based | points | — |

### 1.3 Touch gesture: the research is unambiguous

Vatavu, Cramariuc & Schipor (*Int. J. Human-Computer Studies*, 2015) tested children aged 3–6:

| Gesture | Success rate |
|---|---|
| **Tap** | **98.7%** |
| Double tap | 82.8% |
| Single-touch drag (10" tablet) | 88.1% |
| Bimanual multi-touch drag (10" tablet) | 27.4% |

Their explicit recommendations: avoid multi-touch at this age; **limit drag path length** (children did significantly worse on a 10.1" tablet than a 3.5" phone — your screen is 22"). Tap *duration* also varies enormously by age (up to 5 s at age 3 vs 1.5 s at 5), so **any hold-to-confirm threshold will misfire** on one of your two kids.

**Verdict: tap the whole card. No swipe, no double-tap, no long-press-to-confirm.**

Woodward et al. (CHI 2016), children 5–10: **23–24% miss rate** vs 15–17% for adults, concentrated at the **right side and top of the screen** and at **targets with edge padding**. The same study found that adding animated touch feedback cut **"holdovers"** (accidental repeat taps because the child isn't sure it registered) **from 238 to 21** — an order of magnitude. Celebration animation is an *error-prevention mechanism*, not decoration. But keep it short and local: the same paper found complex animation **slowed** 5–6 year-olds, "possibly due to distraction."

### 1.4 Sizing for a 22" screen

A 22" 16:9 panel = 48.7 × 27.4 cm. At 1920×1080 that's ≈100 ppi, so **1 mm ≈ 3.9 px**.

| Standard | Target size | On your screen |
|---|---|---|
| WCAG 2.2 AA (2.5.8) | 24 CSS px | ≈6 mm — far too small |
| WCAG AAA / Apple HIG | 44 px / 44 pt | ≈11 mm |
| Material | 48 dp ≈ 9 mm, 8 dp spacing | ≈35 px |
| Accessible **kiosk** practice | **≥20 mm**, ≥5 mm gaps, ≥5 mm from screen edge | **≈79 px** |
| Child-adjusted (5 y/o mean touch offset 3.4 mm; accept taps "slightly off the active limits") | | pad hit region ~5 mm past visual |

**Target for Doma's cards: ≥45 × 45 mm (≈180 × 180 px), 12 mm (≈47 px) gutters, hit region padded ~5 mm beyond the visual card, nothing tappable within 10 mm of the top or right edge.**

**Mounting:** a 50th-percentile 5-year-old is ~110 cm tall; classroom whiteboard practice puts the bottom edge at **71 cm for PreK–4th grade**. Your panel is 27.4 cm tall → **mount bottom edge at 75–80 cm, landscape**, top edge lands ~103–108 cm. Keep all child-tappable controls in the **lower 60%**; reserve the top strip for non-interactive status (clock, whose turn) — which conveniently is where kids miss most.

### 1.5 Time framing by age

Children use "yesterday/tomorrow" from 2–3 but initially only as "past" and "future" generally (Zhang & Hudson 2018). Preschoolers 3–5 reliably grasp **predictable daily patterns** (breakfast = morning). Specific *dates* only become meaningful around 6–8, and abstract time reasoning at 9–11 (Barton & Levstik 1996).

| | Doma (5) | Nono (8) |
|---|---|---|
| Time unit | **Current routine band only** (morning / after-school / bedtime). No dates, no week. | **Today**, full list. A week strip is fine and motivating (streaks). |
| Cards visible | **1–3.** Goally shows one; FTVS shows two (first-then). | 4–8 at a glance |
| Ordering | Fixed sequence | Free |
| "Tomorrow" | Don't show it — it's noise | Fine as preview |
| Progress | Physical metaphor: 3 empty slots that fill | "3 of 5" / bar |

Label by routine, not clock: **"after breakfast"**, not "8:00 AM".

### 1.6 Star economy

Clinical token-economy guidance: for **4–7 year-olds, exchange DAILY** — *"at the beginning, reward children immediately"*; extend to several-times-a-week/weekly only for older children once established. Track only **2–4 target behaviours**, positively framed, pitched **just slightly above observed baseline**. **Never introduce response-cost (taking stars away) in the initial design.**

Calibration from Skylight: 5–10 stars for daily habits, 100+ for big chores, rewards 1–500. For Doma keep the spread narrow — **all daily tasks worth 1 star**, so "3 stars = prize" is countable on fingers.

A 128-experiment meta-analysis found tangible rewards reduce intrinsic motivation **only when perceived as controlling** — not when tied to effort, signalling competence, or delivered unexpectedly. So: reward *completion* not quality, use informational language ("you did all three by yourself"), plan to **fade** the economy for Nono rather than escalate it.

### 1.7 Redemption + parent/kid separation

- **Skylight: no approval gate.** Kids redeem themselves on the wall device; only guard is that the button appears when they have enough stars. **This is the one real hole in the best-in-class product** — and Family Hub has copied it exactly.
- **BusyKid:** batched weekly payday, parent approves.
- **S'moresUp/Joon/Homey:** per-chore approval; approval *latency* (~30 min in S'moresUp) is a documented top complaint — it destroys the immediacy the whole reward loop depends on.
- Nielsen Norman Group on confirm dialogs: over-used confirmations breed reflexive click-through — *"the only sensible reaction is 'of course I want to do the thing I just told you to do'"*. **Undo should be the default; reserve a real confirm for the irreversible, consequential case.** Redemption is exactly that case. Completion is not.

**Convergent industry pattern (Skylight, Goally, Brili, Buddy all independently):** the kid device is a **read-and-toggle surface**; all authoring happens on a phone, behind a **device-local 4-digit PIN with an inactivity timeout**.

### 1.8 What parents complain about — avoid these

| Failure | Evidence |
|---|---|
| Setup burden | S'moresUp "20+ min to set up", "steep learning curve"; Greenlight "divvy out chores for 4 kids × 7 days… very time consuming" |
| Latency between doing and being credited | S'moresUp approval takes ~30 min to appear |
| Too many taps | Homey: "two to five screens for every action" |
| Reliability | Homey crashes; Chorsee freezes past 10 chores; Hearth early touch freezes |
| Reading requirement quietly excludes the younger kid | S'moresUp 6+; Joon "pre-readers will need assistance" |
| Features that silently break each other | **FTVS: turning on the checklist DISABLES audio.** Don't couple completion and audio. |
| Can't share one device | Skylight Buddy: "cannot toggle between child profiles on a single device" |
| No battery backup | Skylight: power cut = chart gone |

---

## Part 2 — What Family Hub should adjust, and why

Ranked by impact ÷ effort. Items marked ⚠️ are also in your feedback list (detailed diagnosis in Part 3).

### P0 — build first

**1. Split the chore UI by age. Give Doma a completely different screen, not a smaller version of Nono's.**
*Why:* every product that tried one UI for both ages ended up rated 6+ and unusable by the pre-reader (S'moresUp, Joon). Today `renderChoreMember()` renders one identical list for all four members.
*Shape:* `is_child && age_mode === 'prereader'` → a 2×2 grid of huge photo cards for the current routine band only. `is_child` → today's list with icons + star count. Parent → today + week + edit affordances.

**2. ⚠️ Show today only.** Currently `choreWindow()` spans **−14 to +28 days**, which is why Doma sees "clean up bed" repeated Aug 7 → Aug 13 → forever. A 5-year-old cannot parse that; an 8-year-old finds it demoralising. *Why:* Skylight hides non-current routine bands by default; Goally shows one step; preschoolers have no date concept.

**3. ⚠️ Tap the whole card to complete. Move edit to an explicit pencil button, parent-only.** Today the card body opens the **edit modal** and a small checkbox completes. That's backwards, and the checkbox is ~30 px — under half the WCAG AAA minimum and a quarter of the kiosk minimum. *Why:* tap succeeds 98.7% for 3–6 year-olds; children miss 23–24% of targets generally, worse at edges.

**4. ⚠️ Tap again to un-complete, and reverse the stars.** Currently completion is one-way (`if (r.isDone) return;`) and there is **no** star-reversal path at all. *Why:* NN/g — undo beats confirmation, especially when the confirm is a second small target *and* is made of text a 5-year-old can't read. Skylight already toggles.

**5. Every task carries a photo you took in your own house — not an emoji, not a glyph.**
*Why:* Otsimo's documented weakness is "icons… do not always correlate clearly to the word." Goally and Choiceworks both sell parent-photo steps; VizyPlan composites the child's own face. A photo of *your* bed in *your* room has zero ambiguity. Emoji (Skylight's approach) is the fallback tier, not the target. **Schema:** add `tasks.icon_url` (emoji string or data-URL/Storage URL), mirroring how `avatar_url` already works.

**6. ⚠️ Kid profiles get chores only.** Right now Doma's profile can reach Calendar, Finance, Meals, Manage family, **+ Chore**, **+ Create reward**, edit any task, and Sign out. *Why:* every reference product makes the kid surface read-and-toggle only. This is also your accidental-destruction risk on an always-on wall screen.

**7. ⚠️ Redemption needs a parent gate; completion must stay frictionless.** Today `redeem_reward` deducts stars instantly at `status='pending'` with only a `confirm()` (text — Doma can't read it, and it's a tiny target). There is no approve/deny UI and **no refund path if a parent denies**. *Why:* NN/g's carve-out — reserve confirms for irreversible consequential actions; and S'moresUp shows what approval latency does when applied to the *wrong* action (completion).

**8. ⚠️ Fix the profile→Suzy redirect.** Root cause found — see Part 3.

### P1 — the differentiators

**9. Record your own voice per task; play it on tapping the speaker icon.**
*Why:* Choiceworks and FTVS both ship recorded-audio-per-item as their core pre-reader feature; Skylight Buddy is the only mainstream chore device with it, and its parents call it the thing that works. **Keep audio completely independent of completion state** — FTVS's shipped bug is that enabling the checklist disables audio. Cheap fallback if recording is too much: `speechSynthesis.speak()` in the browser, zero backend.

**10. Card sizing + reach.** ≥180×180 px cards, 47 px gutters, hit region padded past the visual edge, nothing tappable in the top strip or right edge. Mount the panel landscape with the bottom edge at 75–80 cm and keep every kid control in the lower 60%.
*Why:* §1.4. This is the single change that makes the screen usable standing up by a 110 cm child.

**11. Keep the confetti, but make it card-local and ~500 ms.**
*Why:* animated feedback cut children's uncertain re-taps from 238 → 21; but heavy animation *slowed* 5–6 year-olds. Your current `celebrate()` sprays 26 emoji across the whole viewport for 1.9 s and fires only when the whole day is finished — invert it: **small burst on every tap**, big burst on day complete.

**12. Two economies, not two balances.** Doma redeems **daily** off a 3-slot board (all tasks = 1 star, prizes cost 3). Nono banks toward a larger goal over the week.
*Why:* clinical guidance is daily exchange for 4–7 year-olds; delayed gratification at 5 is asking for the thing 5-year-olds are famously bad at.

**13. Cap it at 2–4 chores per child.** Positively framed, pitched just above current baseline.
*Why:* standard token-economy design, and the direct antidote to the #1 category complaint (setup burden). It also fixes the visual problem in your screenshot — the wall of identical cards.

**14. Encode "done" with three redundant signals: photo dims/greys, big filled ✓, card recedes.** Never colour alone.
*Why:* WCAG 1.4.11 (3:1 non-text contrast); ~8% of boys have red/green colour deficiency; FTVS's fading-image is the proven pattern. Text at AAA 7:1 — a wall screen is viewed in ambient light and off-axis.

**15. Time-window gate + visible timestamps instead of photo proof.** A bedtime chore simply isn't tappable at 3 pm; a parent glancing at timestamps sees a 5-task sweep in 4 seconds instantly.
*Why:* photo proof (Joon, Homey) requires active consistent parent involvement, and Joon's own reviewers call the flow "awkward" for younger kids.

**16. PIN-locked parent route with an inactivity timeout.** Follow Skylight's split: separate PINs (or at least separate gates) for *add* vs *modify*. But don't repeat their mistake of making rewards editable **only** on the phone — keep a fast on-device escape hatch. *(This is the C3 "PIN lock on destructive actions" item already in the plan and still not started.)*

**17. Design for the week-two cliff explicitly.** Two evidence-backed levers: **surprise/scarcity** (a "bonus chore" that appears at random for extra stars — Skylight's reviewers describe kids who "rush to snag" them) and **effort-based informational praise** rather than controlling reward language. Plan to fade Nono's economy, not escalate it.

**18. Assume power loss and offline.** You already have the offline write queue — good, that's ahead of Skylight, which has no battery backup. Make sure the last-known day renders from cache with no network.

---

## Part 3 — Your feedback list: root cause + fix

All line numbers are `web/app.js` at the current HEAD unless noted.

### ① "Chores should only show today's list, not all"

**Root cause — `choreWindow()`, line ~1421:**
```js
const choreWindow = () => {
  const winStart = new Date(); winStart.setDate(winStart.getDate() - 14);
  const winEnd   = new Date(); winEnd.setDate(winEnd.getDate() + 28);
  return { winStart, winEnd };
};
```
`renderChoreMember()` (line 1487) expands every recurring task across that **42-day** window into one flat row per occurrence, then sorts undone-first by date. One daily chore = 42 rows. That's your screenshot exactly.

Note `renderChoreHome()` (line 1439) already does it right — it builds its own `ws`/`we` = today only.

**Fix:** give `renderChoreMember` a today window (`ws` → `ws+1d`) plus a separate, clearly-labelled **"Missed"** section for overdue occurrences from the last ~3 days (parent view only; don't show Doma a backlog). You already have `overdueCells()` at line 1269 doing exactly this for the calendar — reuse it. Add a Week/All toggle in the **parent** view only.

### ② "Clicking a chore should mark it complete, not edit it — add an edit button"

**Root cause — lines 1568 & 1571:**
```js
list.querySelectorAll(".check").forEach(b => b.onclick = () => { /* complete */ });
list.querySelectorAll(".taskmain").forEach(b => b.onclick = () => openTaskForm(rows[+b.dataset.i].task));
```
The 90%-of-the-card `.taskmain` button opens the edit modal; the ~30 px `.check` completes.

**Fix:** swap them. `.taskmain` → toggle completion. Add a `✏️` button at the trailing edge, rendered **only when `!state.member.is_child`**. Bump `.check` to a display-only status glyph (not a button) so there's exactly one tap target per card.

### ③ "When someone logs in they should see today's list"

**Root cause:** two hops. `viewPicker` → `#/hub` → tap Chores → `renderChoreHome` (all four avatars) → tap yourself → `renderChoreMember`. Three taps to reach your own chores, and the middle screen is a second person-picker that duplicates the first.

**Fix:** when `render()` enters `#/tasks`, default `state.choreMember = state.member.id` (see ⑥ — this is the same variable). For a kid profile, skip `renderChoreHome` entirely; the family grid becomes a parent-only view. Result: profile tap → chores, one hop.

### ④ "Allow pressing a completed chore to un-complete it, and delete the stars"

**Root cause — line 1570:**
```js
b.onclick = () => { const r = rows[+b.dataset.i]; if (r.isDone) return; ... }
```
One-way. `uncompleteOcc()` **exists at line 1392 but is never called anywhere.** And even if it were, it deletes the `task_completions` row **without touching `star_ledger` or `family_members.star_balance`** — so stars would be silently orphaned and the ledger (your source of truth) would drift from the cache.

**Fix — this needs a migration, not just JS.** Add a mirror of `complete_task`:

```sql
create or replace function uncomplete_task(
  p_task uuid, p_member uuid, p_occurrence_date date default null
) returns void
language plpgsql security definer set search_path = public as $$
declare v_family uuid; v_awarded integer; v_id uuid;
begin
  select family_id into v_family from family_members where id = p_member for update;
  if not found then raise exception 'member_not_found'; end if;

  select id, star_awarded into v_id, v_awarded
    from task_completions
   where task_id = p_task and member_id = p_member
     and occurrence_date is not distinct from p_occurrence_date
   for update;
  if not found then return; end if;               -- idempotent

  delete from task_completions where id = v_id;

  if coalesce(v_awarded,0) > 0 then
    insert into star_ledger(family_id, member_id, delta, reason)
      values (v_family, p_member, -v_awarded, 'chore_undo');
    update family_members set star_balance = star_balance - v_awarded where id = p_member;
  end if;
end $$;
grant execute on function uncomplete_task(uuid, uuid, date) to authenticated;
```

Three things to get right:
- **Reverse `star_awarded` from the completion row, not the task's *current* `star_reward`** — otherwise editing a chore's value retroactively corrupts the balance.
- **Add an `uncomplete_task` op type to the offline queue** (`enqueueCompletion` / `flushQueue`, lines 60–95), and have enqueueing an undo **cancel a still-pending complete** for the same cell rather than stacking both.
- Balance can go negative if stars were already spent. Either clamp at 0 and log the discrepancy, or allow negative and show it — I'd clamp, and only allow undo within the same day (which also limits the blast radius of a kid un-doing a week of chores).

**UI:** same tap toggles. Add a ~1.5 s cooldown on the card after a toggle so a rapid double-tap doesn't complete-then-uncomplete — this is also the anti-rampage rate limit from §1.3.

### ⑤ "Review the redeem process from a user-protective standpoint"

Current flow (lines 1591–1601 + `redeem_reward` in `02-migration.sql:310`):

| Risk | Current state | Recommended |
|---|---|---|
| **Kid redeems unsupervised** | Any profile can tap Redeem; only guard is a `confirm()` dialog. Doma can't read it and will tap OK. | **PIN prompt on redeem for `is_child` profiles.** This is NN/g's legitimate confirm case. |
| **Stars deducted before the parent honours it** | `redeem_reward` inserts `status='pending'` **and immediately debits** the balance and ledger. | Either debit only on approval, or keep the debit (it prevents double-spend) and add a **cancel/refund** RPC. |
| **No approve/deny path** | `redemptions.status` is written `'pending'` and **never updated anywhere in the app**. History shows the word "pending" forever. | Parent view: pending redemption list with **Fulfil / Cancel**. Cancel must write a `+cost` ledger row linked to the redemption and restore the balance. |
| **Kid can create/edit rewards** | `+ Create reward` and `edit` render on every member page for every profile. A kid can add "iPad = 1 star". | Parent-only. Gate on `!state.member.is_child` **and** RLS/PIN. |
| **Kid can edit chore star values** | `openTaskForm` reachable by tapping any card. | Parent-only (fixes ②'s edit button too). |
| **Accidental redeem is irreversible to the child** | none | Undo window (~60 s) on the card, plus the parent Cancel above. |
| **Text-only confirm** | `confirm("Redeem \"X\" for N stars?")` | For a kid, show the **reward's picture + the star cost as N star glyphs** before the PIN. |
| **No spend cap** | none | Optional: cap redemptions to 1/day so a rampage costs one prize, not the whole bank. |

The `redeem_reward` RPC itself is solid on the server side — `FOR UPDATE` lock, family check, `is_active` check, balance check, atomic ledger + cache update. **The gaps are all in the client and in the missing lifecycle (approve/cancel/refund).**

### ⑥ "Why does a kid entering their profile get directed to Suzy's profile?" — **found it**

**Root cause: `state.choreMember` is module-level in-memory state that is never reset when the active profile changes.**

```js
const state = { familyId: null, members: null, membersById: {}, member: null, ... };  // line 22
// state.choreMember is set at line 1483 and cleared ONLY by the Back button at 1533
document.getElementById("switch").onclick = () => { clearMember(); go("#/picker"); };  // lines 219, 1481
```

`clearMember()` (line 48) only removes the **localStorage** key. It does **not** touch `state.choreMember`.

**The reproduction:**
1. Suzy opens Chores, taps her own avatar → `state.choreMember = <Suzy's id>` (line 1483).
2. She uses `‹` / the picker to switch profiles. `clearMember()` wipes localStorage; `state.choreMember` is untouched.
3. Doma taps his own tile → `setMember(Doma)` → `#/hub` → shows "Hi Doma 👋" correctly.
4. Doma taps **Chores** → `viewTasks()` → `renderChores()` → `state.choreMember` is *still truthy* → `renderChoreMember()` renders **Suzy's** name, Suzy's avatar, Suzy's stars, Suzy's chores.

This is invisible on a phone (a reload clears memory) and **permanent on the wall screen**, which never reloads. That's why it only shows up on the kiosk.

**The guard at line 1415 doesn't help** — it only nulls `choreMember` when the id is missing from `membersById`, and Suzy is a valid member.

**Fix — three lines:**
```js
// 1. clear it whenever identity changes
const clearMember = () => { localStorage.removeItem(MEMBER_KEY); state.choreMember = null; };
// 2. and in setMember, so switching *between* profiles resets too
const setMember = (m) => { localStorage.setItem(MEMBER_KEY, JSON.stringify(m)); state.choreMember = m.id; };
// 3. in viewTasks(), default to self rather than trusting stale state
if (!state.choreMember) state.choreMember = state.member.id;   // ← also fixes feedback ③
```

**Second, related bug worth fixing at the same time:** `completeOcc` (line 1386) falls back to `task.assigned_to || state.member.id`, but `enqueueCompletion` is called with `mid` (`state.choreMember`). Once ⑥ is fixed these agree — but an unassigned ("Anyone") chore completed from another member's page will still credit the wrong person. Make the earner explicit and always `state.choreMember`.

**Third:** add an **idle timeout** on the kiosk — after ~25–30 s of no touch, return to the profile picker. Skylight Buddy's headline flaw is that it *can't* switch profiles on one device; your risk is the opposite — it silently stays on the last person's. An idle reset solves the shared-screen problem and makes ⑥ unable to recur.

---

## Part 4 — Suggested build order

| # | Change | Effort | Touches |
|---|---|---|---|
| 1 | ⑥ `choreMember` reset + default-to-self + idle→picker | **XS** | `app.js` 3 lines + a timer |
| 2 | ① today-only window + "Missed" section | S | `renderChoreMember` |
| 3 | ② tap-to-complete, edit → parent-only pencil | S | `renderChoreMember` |
| 4 | ⑥b kid-mode gating (hide Finance/Meals/Family/+Chore/+Reward/Sign out) | S | `viewHub`, `renderChoreMember` |
| 5 | ④ `uncomplete_task` RPC + queue op + toggle UI + cooldown | **M** | migration + `app.js` |
| 6 | ⑤ redeem PIN + parent Fulfil/Cancel + refund RPC | **M** | migration + `app.js` |
| 7 | Touch sizing: ≥180 px cards, 47 px gutters, top/right edge clear | S | `styles.css` |
| 8 | `tasks.icon_url` + photo/emoji on every card | M | migration + form + card |
| 9 | Pre-reader mode for Doma: routine bands, 2×3 photo grid, no dates | **L** | new view |
| 10 | Voice per task (`speechSynthesis` first, recorded audio later) | M | card + optional Storage |
| 11 | Card-local 500 ms celebration; big burst only on day-complete | S | `celebrate()`/`starBurst()` |
| 12 | Two economies (daily 3-slot for Doma, weekly bank for Nono) | M | rewards model |

Items 1–4 are half a day and fix everything in the screenshot. 5–6 are the correctness/safety work. 7–12 are what makes it better than Skylight for a 5-year-old.

---

## Sources

**Products & reviews**
- [Skylight Support — Using the Tasks Tab: Routines and Chores](https://skylight.zendesk.com/hc/en-us/articles/36846381293979-Using-the-Tasks-Tab-Routines-and-Chores)
- [Skylight Support — Stars, Tasks, and Rewards](https://skylight.zendesk.com/hc/en-us/articles/36846200077723-Stars-Tasks-and-Rewards)
- [Skylight Support — Using the Rewards Tab](https://skylight.zendesk.com/hc/en-us/articles/36846860676123-Using-the-Rewards-Tab)
- [Skylight Support — Parental Lock](https://skylight.zendesk.com/hc/en-us/articles/35089525796251-Parental-Lock)
- [Skylight Buddy](https://myskylight.com/products/buddy) · [Forbes Vetted — Skylight Buddy review (Aug 2026)](https://www.forbes.com/sites/forbes-personal-shopper/2026/08/04/skylight-buddy-review/)
- [Forbes Vetted — Hearth Display review](https://www.forbes.com/sites/forbes-personal-shopper/article/hearth-display-ode/)
- [Goally](https://www.getgoally.com/) · [The Autism Cafe — Goally review](https://theautismcafe.com/autism-meet-goally-the-electronic-visual-schedule-that-works/)
- [Choiceworks (App Store)](https://apps.apple.com/us/app/choiceworks/id486210964) · [First Then Visual Schedule (App Store)](https://apps.apple.com/us/app/first-then-visual-schedule/id355527801)
- [Autisable — VizyPlan vs Goally, Choiceworks and Tiimo](https://autisable.com/blog/vizyplan-vs-goally-choiceworks-and-tiimo-comparing-visual-schedule-apps-for-autism/)
- [Common Sense Media — Brili Routines](https://www.commonsensemedia.org/app-reviews/brili-routines) · [S'moresUp](https://www.commonsensemedia.org/app-reviews/smoresup-best-chores-app) · [Joon](https://www.commonsensemedia.org/app-reviews/joon-kids-chore-list-chart) · [Otsimo AAC](https://www.commonsensemedia.org/app-reviews/otsimo-special-education-aac)
- [Greenlight — Chores & allowance](https://greenlight.com/chores-and-allowance-app-for-kids) · [BusyKid FAQ](https://busykid.com/faq/) · [Cozi Chores](https://www.cozi.com/blog/cozi-chores/)
- [Homsy — Best chore chart apps 2026](https://gethomsy.com/blog/comparisons/best-chore-chart-apps-2026) · [PointWiseSystem — Best chore apps 2026](https://www.pointwisesystem.com/blog/best-chore-apps-for-kids-2026)

**Child HCI research**
- [Vatavu, Cramariuc & Schipor — Touch interaction for children aged 3 to 6 (IJHCS 2015, PDF)](https://mintviz.usv.ro/publications/ijhcs2015.pdf)
- [Woodward et al., CHI 2016 — How interface complexity affects children's touchscreen interactions](https://init.cise.ufl.edu/wp-content/uploads/sites/378/2017/05/Woodward-et-al-CHI2016-presentation-slides.pdf)
- [Soni et al. — TIDRC: Touchscreen Interaction Design Recommendations for Children (ACM IDC 2019)](https://dl.acm.org/doi/10.1145/3311927.3323149)

**Standards & ergonomics**
- [W3C — SC 2.5.8 Target Size (Minimum)](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html) · [SC 1.4.3 Contrast](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html) · [SC 2.3.3 Animation from Interactions](https://www.w3.org/WAI/WCAG21/Understanding/animation-from-interactions.html) · [C39 prefers-reduced-motion](https://www.w3.org/WAI/WCAG21/Techniques/css/C39)
- [Android — Touch target size (48dp)](https://support.google.com/accessibility/android/answer/7101858?hl=en) · [LogRocket — Accessible touch target sizes](https://blog.logrocket.com/ux-design/all-accessible-touch-target-sizes/)
- [Construkt — Accessible kiosk design (20 mm targets)](https://construkt.eu/accessible-kiosk-design/) · [EVERWhite — Classroom whiteboard mounting heights](https://everwhiteboards.com/best-mounting-heights-for-classroom-whiteboards/) · [CDC anthropometric reference data](https://www.cdc.gov/nchs/data/series/sr_11/sr11_252.pdf)
- [Nielsen Norman Group — Confirmation dialogs can prevent user errors (if not overused)](https://www.nngroup.com/articles/confirmation-dialog/)

**Development & behaviour**
- [Psychology Today — What kids know about time (Zhang & Hudson 2018; Barton & Levstik 1996)](https://www.psychologytoday.com/us/blog/the-baby-scientist/202301/what-kids-know-about-time)
- [Annabelle Psychology — Token economy for kids](https://www.annabellepsychology.com/parenting/token-economy) · [initiateHUB — What the research says about token economies](https://initiatehub.com/blog/token-economy-research/)
- [ASAT — Visual activity schedules (National Standards Project 2015)](https://asatonline.org/for-parents/learn-more-about-specific-treatments/activity-schedules/)
