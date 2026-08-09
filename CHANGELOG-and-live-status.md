# Family Hub — every change, and whether it's live

**Verified against `https://family-hub-beta-six.vercel.app` on 2026-08-09.**
Deployed SW is **v36** (v37 pending the next push). `origin/main` = local `6f8d4d3`, nothing unpushed.

---

## Read this first — why you're "not seeing all the changes"

**Roughly two-thirds of the redesign only exists above the wall breakpoint:**

```css
@media (min-width: 1000px) and (orientation: landscape)
```

| Device | What you get |
|---|---|
| **MacBook** (window ≥1000px wide *and* wider than tall) | **Everything.** Confirmed live in your browser. |
| **MacBook, narrow or tall window** | Phone layout. Widen the window. |
| **iPhone** (any orientation in practice) | **Phone layout by design** — no rail, no info bar, no identity chip, no people strip, no wall chore grid, no Money rail item, no week time-grid, no Day sidebar, no ambient/sleep. |

That was a deliberate call: a rail and a five-column chore grid are unusable at 390px. But it means **the iPhone will never show most of this**, and if that's where you've been checking, "nothing changed" is the correct observation.

**Second cause: the service worker caches app files cache-first.** A new version installs in the background and takes over on the *next* load. So the first visit after a deploy still shows the old app. Hard-reload twice (`Cmd+Shift+R` on the Mac). On iPhone Safari: Settings → Safari → Advanced → Website Data → remove the site, or delete and re-add the home-screen icon.

---

## Live status

✅ = verified in your browser just now · 📱 = phone too · 🖥 = wall/desktop only · ⏳ = needs the next push

### Chores
| Change | Status |
|---|---|
| Redeem picks the best **affordable** reward (was structurally unreachable) | ✅ 🖥 |
| Rewards strip scoped to the active profile | ✅ 🖥 |
| ✏️ edit on every chore row | ✅ 🖥 (phone already had one) |
| `+` per column adds a chore preassigned to that person | ✅ 🖥 |
| Kid sees only their own column | ✅ 🖥 |
| Pending redemptions collapse to one queue button | ✅ 🖥 — showing **52** |
| Tap toggles; 1.5s cooldown; three redundant done-signals | ✅ 📱🖥 |
| `uncomplete_task` reverses exactly what was paid | ✅ 📱🖥 |
| Today-only list (was 42 rows) | ✅ 📱🖥 |
| **Free-reward guard** (see below) | ⏳ |

### Kids
| Change | Status |
|---|---|
| Kid Mode: photo cards, routine bands, no dates | ✅ 📱🖥 |
| **Pre-reader's Chores opens Kid Mode directly** | ✅ 📱🖥 |
| 🔊 reads the title aloud | ✅ 📱🖥 |
| Star board as glyphs, capped at 5 | ✅ 📱🖥 |
| **Streaks** — `🔥3` visible on Nono | ✅ 📱🖥 |
| **Surprise bonus ×2** — `✨+10⭐` visible on Doma's chore | ✅ 📱🖥 |

### Look
| Change | Status |
|---|---|
| Sage ground `#E7EDE3`, clay accent, no white/black | ✅ 📱🖥 |
| Ink+tint identities, all 36 pairs ΔE ≥ 18 | ✅ 📱🖥 |
| Emoji-safe avatar initials (`🥸 Daddy` → `D`) | ✅ 📱🖥 |
| `fmtStars()` abbreviates huge balances | ✅ 📱🖥 |

### Shell & modules
| Change | Status |
|---|---|
| Rail, info bar, people strip, context FAB | ✅ 🖥 |
| **Identity chip** — `Daddy ⇄` opens the picker | ✅ 🖥 |
| **Money back on the rail** | ✅ 🖥 |
| Schedule (5 columns, pinned dinner + chore footer) | ✅ 🖥 / 📱 stacks as an agenda |
| Week time grid · Day sidebar · Month pills | ✅ 🖥 |
| Meals + Finance section tabs restored | ✅ 🖥 |
| Meals fills the pane, flows into columns | ⏳ 🖥 (v36 shipped it; verify after reload) |
| Lists inline add row, no `prompt()` | ⏳ 📱🖥 |
| Countdowns chip + pane | ✅ 🖥 |
| Ambient, sleep, Display settings, PIN | ✅ 🖥 |
| Side-panel editor instead of centred modal | ✅ 🖥 |
| Toasts — nothing fails silently | ✅ 📱🖥 |

---

## Two live problems

### 1. `clothes` is still worth 12,345,678 ⭐
You ran steps 1–2 of the reset (all four balances are 0, ledger drift 0) but **not step 3**. The chore that caused it is still armed:

```sql
update tasks set star_reward = 5 where kind <> 'task' and star_reward > 100;
```

### 2. A 0-star reward is infinitely redeemable — this is why you have 52 pending
"TV time" costs **0 stars**. `redeem_reward`'s only gate is `balance < cost`, and `0 < 0` is false, so it always succeeds. Making Redeem *reachable* in W10 exposed a hole that had always been there.

Fixed in v37: the RPC now rejects `cost < 1` (`reward_free`) and caps 3 pending of the same reward per child (`too_many_pending`); the UI shows *"⚠️ TV time costs 0⭐ — give it a price"* instead of offering Redeem.

Clear the backlog and price the reward:

```sql
begin;
update redemptions set status = 'fulfilled' where status = 'pending';
update rewards set star_cost = 10 where star_cost < 1 and is_active;
update tasks set star_reward = 5 where kind <> 'task' and star_reward > 100;
commit;
```

---

## Checking on each device

**MacBook** — window wider than tall and ≥1000px. `Cmd+Shift+R` twice. You should see the rail, the identity chip beside the clock, and Money above Sleep.

**iPhone** — you will *not* see the rail or the chore grid; that's by design. What you should see: sage background, the profile picker, today-only chores, tap-to-toggle, Kid Mode when you pick Doma, streaks and bonus badges, toasts, the Lists add row. To force an update: remove the site's data in Safari settings, or delete and re-add the home-screen icon.
