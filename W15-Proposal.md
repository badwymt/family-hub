# W15 — Proposal for review

**Nothing below is built yet.** Verified in code and against your live data on 2026-08-09.

---

## 1 · Chore pictures don't work

### What I found — three separate failures, all in your real data

Your five chores carry three different broken icon values:

| Chore | `icon_url` | Why it fails |
|---|---|---|
| Make bed | `https://share.google/0oQcICMJKJyFz0ZMh` | A Google **share link**. Returns an HTML page, not an image. `<img src>` gets HTML and shows nothing. |
| put bag and books… | `https://www.pixtastock.com/illustration/96564901` | A stock-photo **product page**, same problem. |
| Make bed (2nd) | `data:image/jpeg;base64,/9j/4AAQSkZJRgABAQ…` | A genuine data URL — **truncated at 400 characters**. |

The third is my fault outright. I put `maxlength="400"` on the icon field while the placeholder invited a data URL. A base64 JPEG is 20,000–200,000 characters; the browser silently cut yours at 400, so it was corrupt before it ever reached the database.

**And the root cause behind all three: there is no file picker.** No `<input type="file">`, no upload path, anywhere in the app. Pasting a URL is the only route in, which is exactly why you reached for share links. For a parent standing in a bedroom wanting a photo of *that* bed, that is not a usable feature.

**Also spotted:** you have **10 chores where 5 are intended** — `brush teeth and waer pj` / `…wear pj`, `Make bed` ×2, `put bag and book…` ×2, `reading for 15 minutes` / `Read for 10 minutes`. It looks like editing was done by re-creating. Worth a cleanup pass.

### Proposed UX

**Three ways in, in order of how often they'll be used:**

1. **📷 Take / choose a photo** — the primary button. Opens the phone camera roll or camera. The image is **downscaled in the browser to 256×256 and re-encoded as JPEG at ~0.7 quality**, giving a ~15–25 KB data URL that goes straight into `icon_url`. No storage bucket, no cost, works offline, and it's the photo of *your* bed that the research says beats any generic glyph.
2. **Pick an emoji** — a grid of ~40 chore-relevant emoji (🛏️ 🦷 👕 📚 🧸 🚮 🍽️ 🚿 …). One tap. This is the fast path for a parent adding five chores in a sitting.
3. **Paste a link** — kept, but **validated**: on blur it attempts to load the image and shows either a live preview or *"That link isn't an image — try 📷 instead."* No more silent breakage.

**In the form**, a live preview tile sits above the field showing exactly what the child will see. `maxlength` removed.

**For the 4 chores already broken**, a one-time cleanup: clear the three bad values so they fall back to the neutral dot rather than rendering as a broken image.

---

## 2 · Kids shouldn't have to tap Morning / Afternoon / Evening

### What I found
Kid Mode shows one band at a time behind three tab buttons. A 5-year-old has to understand that *the other chores exist but are hidden behind a word he cannot read*. That's the opposite of what the design was for.

### Proposed UX — one scrolling day, no tapping

```
┌──────────────────────────────────────────┐
│  D  Doma        ⭐⭐⭐☆☆        🔥3   🏠 │
├──────────────────────────────────────────┤
│  ☀️ MORNING                    2 of 2 ✓ │  ← done: header collapses,
│  ┌────┐ ┌────┐                          │     cards shrink to 90px
│  │ 🛏️✓│ │ 🦷✓│                          │
│  └────┘ └────┘                          │
├──────────────────────────────────────────┤
│  🌤️ AFTERNOON              ← NOW    0/2 │  ← current band: full-size
│  ┌────────┐ ┌────────┐                  │     cards, warm tint, an
│  │  📷    │ │  📷    │                  │     orange "NOW" marker
│  │ 🔊     │ │ 🔊     │                  │
│  └────────┘ └────────┘                  │
├──────────────────────────────────────────┤
│  🌙 EVENING                         0/1 │  ← later: full size, slightly
│  ┌────────┐                             │     dimmed until its time
│  │  📷    │                             │
│  └────────┘                             │
└──────────────────────────────────────────┘
```

- **Everything for today is on one page.** The child scrolls; they never choose.
- **The band that's happening now is visually loudest** — full-size cards, a warm tint, an orange `← NOW` marker — and the page **auto-scrolls to it on open**. So the default state answers "what do I do *now*" without a tap, which was the point of bands in the first place.
- **Finished bands collapse** to a compact row of small ticked cards with `2 of 2 ✓`. Visible progress, not clutter.
- **Later bands stay full size but sit at 70% opacity** — a 5-year-old sees what's coming without being confused about what's current.
- Sun/cloud/moon icons carry the meaning; the words are decoration for the 8-year-old.
- The 3 × 200 px card grid stays (2-up on a phone).

---

## 3 · Switching to a kid profile should be a one-way door

### What I found
- **The phone tab bar already filters** — a kid sees only Chores. ✅
- **The wall rail does not.** `renderRail()` maps `RAIL_ITEMS` with no `is_child` check, so a child on the wall sees all seven icons. The routes are blocked, but they get a toast rather than nothing — the icons are still there to poke at.
- **Only a *pre-reader* is taken straight to chores.** Nono (a reader) still lands on the family grid.
- **A bug I hit live while testing this:** the **ambient screensaver fired on top of Kid Mode.** `ambientBlocked()` does check `state.kidMode`, but a timer armed on the *previous* route fires with stale state and covers the child's screen.

### Proposed UX
- **Wall rail filters exactly like the phone tab bar** — a kid sees one item, Chores. Same `is_child` check, same array, so they can't drift apart again.
- **Any kid profile lands directly on their chores** — Kid Mode for a pre-reader, their own single-column list for a reader. Neither ever meets the family grid.
- **The identity chip stays** — a parent must be able to switch back. Tapping it opens the picker; that's the door out.
- **Ambient never covers a child's screen:** re-arm the timer after the view has actually mounted, and re-check `ambientBlocked()` at fire time.

---

## 4 · Show kids what they can actually get

### What I found
A pre-reader sees `⭐⭐☆` glyphs; a reader sees a bare number. Neither says *what it's for* or *how close they are*.

### Proposed UX

**Pre-reader** — a prize strip pinned at the bottom, always visible:
```
  🍦  Ice cream      ⭐⭐⭐☆☆      [ Get it! ]
      ↑ picture of the actual prize, 2 more stars to go
```
- Star board fills toward **one named, pictured prize** — not an abstract balance.
- When affordable, `Get it!` turns solid and the prize card pulses once.
- When not, the empty stars are the message. No numbers.

**Reader** — one line under the balance:
```
  ⭐ 8    🍦 Ice cream in 2 more   ·   🎮 Game hour in 42
```
Plus a **"Ready now"** row listing anything affordable, each with its own Redeem — so redeeming is never a guess about which reward the button means.

---

## 5 · Calendar: counts, not chore lists

### What I found
Chores render as dashed pills in Schedule, Week and Day **and** the Schedule footer already counts them. Both, everywhere.

### Proposed UX
- **Remove chore pills from every calendar view.** The calendar becomes events + meals only.
- **Keep and strengthen the count.** Each Schedule day footer gets a compact per-person bar:
  ```
  🍽️ Sheet-pan chicken
  Chores  ▓▓▓▓▓░░░  5 of 8      N 3/4 · D 2/4
  ```
- Week and Day get the same line in the day header.
- **The people strip already carries per-person progress** — that stays and becomes the primary at-a-glance signal.
- Tapping the chore count jumps to Chores, so the detail is one tap away, never in the way.

---

## 6 · Delete redeem history

### What I found
`.redlist` renders the last 20 redemptions under the rewards bank on the phone chore page, and again in the legacy rewards view. You currently have a large backlog of `pending` rows.

### Proposed
- **Remove the History section entirely** from both places.
- The parent queue (`🎁 N waiting for a grown-up`) stays — that's actionable, history isn't.
- **Data:** I will *not* delete rows. `redemptions` is what `star_ledger` links to, and deleting them breaks the audit trail. I'll give you a query to mark old ones `fulfilled` so nothing is pending, and they simply stop being displayed.

---

## Decisions I need before building

1. **Photos** — is browser-side downscale-to-data-URL acceptable? It keeps you at $0/mo and works offline, at the cost of ~20 KB per chore in the database. The alternative is a Supabase Storage bucket (cleaner, still free at this scale, but adds a dependency and needs a bucket policy).
2. **Duplicate chores** — want me to include a cleanup query for the 5 near-duplicates?
3. **Calendar** — remove chore pills from *all three* views, or keep them on Day only (where there's room) and strip Schedule + Week?
4. **Anything above you want dropped or changed** before I start.

Reply with approvals or changes and I'll build it, then walk the full matrix as every role on both surfaces.
