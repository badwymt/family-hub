# W15 — what was wrong, what changed, and how it was proved

Built from the approved `W15-Proposal.md`, with the amendment you added:
**nothing scrolls — the whole day is on the screen, laid out by proportion.**

Suite: **188 assertions · 134 journeys · 260 fit checks · 21 icon checks · palette valid.**
Service worker **v39**.

---

## A correction I owe you

The proposal said you had *"10 chores where 5 are intended"* and offered a cleanup
query. **That was wrong, and I should have checked the assignee column before saying
it.** The ten rows are five chores × two children — one row each for Doma and Nono,
which is exactly how per-child assignment works:

| Chore | Doma | Nono |
|---|---|---|
| Make bed | ✔ | ✔ |
| put bag and book(s) … | ✔ | ✔ |
| eat lunch & put dishes in the sink | ✔ | ✔ |
| brush teeth and wear pj | ✔ | ✔ |
| Read for 10 min / reading for 15 min | ✔ (10) | ✔ (15) |

The reading times differ deliberately by age. The only real defect was a spelling
slip on Doma's row — `waer pj` — which is fixed. **No chores were deleted.**

---

## 1 · Chore pictures

**Three failures, three causes.** `share.google/…` is a share *link* and
`pixtastock.com/…` is a product *page* — both return HTML, so `<img>` renders
nothing. The third was a genuine base64 JPEG **truncated at 400 characters by a
`maxlength="400"` I put on the field myself** while the placeholder invited a data
URL. Underneath all three: there was **no file picker anywhere in the app**.

**Now** the picture field offers three routes, in order of how often they'll be used:

- **📷 Take / choose a photo** — opens the camera roll. The image is downscaled in
  the browser to 512 px, re-encoded as JPEG, and uploaded to a new **`family-icons`**
  Supabase Storage bucket (public read, family-only write, 2 MB ceiling, MIME
  allowlist). The row stores a short URL, never twenty thousand characters of base64.
- **🙂 Pick an emoji** — a 40-glyph grid of chore-relevant emoji, one tap.
- **🔗 Paste a link** — kept, but **probed on blur**. A share link or product page now
  gets *"That link isn't an image — try 📷 instead"* rather than being saved silently.

A live preview tile shows exactly what the child will see. `maxlength` is gone.
Rewards get the same field, so the prize strip can show a photo of the actual prize.

The three broken values were cleared in the live database.

---

## 2 · Kid Mode: one screen, no tabs, no scrolling

The old board hid two thirds of the day behind three tab buttons. Asking a 5-year-old
to tap *"Afternoon"* is asking him to read a word he cannot read in order to discover
chores he doesn't know exist. Bands were meant to answer *"what do I do now"*; a tab
made him ask it.

Every chore for today is now on one screen, grouped by routine band:

- **The band happening now is the loudest thing there** — warm tint, orange border,
  `← NOW` marker.
- **Finished bands collapse** to a ticked strip of thumbnails, still tappable to undo.
- **Later bands sit back at 70 %** — visible, not competing. A *missed* morning is
  never dimmed; it is the most urgent thing on the screen.
- **Nothing scrolls.** `.kidwrap` is `100dvh` with `overflow:hidden`, and `kidFit()`
  measures the laid-out board and solves for one card height shared by every band,
  trading rows for columns until every card clears the **56 px kid floor**. The
  result is published to CSS as `--kh`, and the photo, glyph and label scale from it.
- Below 560 px of viewport height (a phone on its side) the band labels move *beside*
  their cards and the prize strip moves up beside the name — that recovers the ~110 px
  that was the difference between a 56 px card and a 47 px one.
- Up-for-grabs chores still appear, so a child hasn't quietly lost the ability to
  claim one.

**`test/fit.mjs`** proves it: 4 surfaces × 5 chore loads (1→14) × both children, and
it fails on any scrollbar, anything outside the viewport, any card under 56 px, or
any chore not on screen.

---

## 3 · A kid profile is a one-way door

- **The wall rail never filtered on `is_child`** — the phone tab bar always did, so a
  child on the wall saw all seven icons and got a toast for six of them. Both chromes
  now read the same array through the same test.
- **The gate moved into the router.** A child identity cannot resolve *any* route
  except their own board and the profile picker. Not "the other views toast at you" —
  there are no other views, so no screen added later can leak by forgetting a gate.
- **Every kid lands on their board**, reader or pre-reader. Nono used to meet the
  family grid; there is no version of it a child should be looking at.
- **⇄ is the way out**, and it means different things by role: a *child* leaving hands
  the screen back to the picker; a *parent* previewing a child's board keeps their own
  identity and returns to Chores.
- **The ambient screensaver fired on top of Kid Mode** — I hit this live. The guard
  ran, then four network fetches were awaited, then the overlay painted regardless of
  what had happened in between. It now re-checks *after* the awaits, never arms while
  Kid Mode is open, and is hidden outright under `html.kidmode`. *State read before an
  await is not state at the time you act on it.*

---

## 4 · What the stars are for

A balance is an abstraction. The board now fills toward **one named, pictured prize**,
pinned where it cannot scroll away:

- **Pre-reader** — the prize picture, its name, and up to five countable star glyphs.
  When affordable the strip turns gold, the button reads **Get it!** and pulses once.
- **Reader** — the same strip with *"3 more to go"*, plus a **Ready now** row of
  anything else affordable, each with its own button, so redeeming is never a guess
  about which reward the button means.
- On a narrow phone the header star board stands down — it was duplicating the prize
  strip and squeezing the child's own name to `D…`.
- The prize strip never prints a raw balance. One real balance here is 323,811,241.

---

## 5 · The calendar shows totals, not lists

Chores were rendering as dashed pills in Schedule, Week **and** Day, while the
Schedule footer counted them as well — the same information twice, crowding out the
events the calendar exists for.

- **Schedule** — pills gone. The footer gets a progress bar and
  `2 of 6 chores · D 1/2 · N 1/2 · 🙋 0/1`, and tapping it opens Chores.
- **Week** — pills gone from the time grid. Each day header carries `✅ 2/6`.
- **Day** — keeps the full list, as you asked, grouped by routine band with a tick
  box per chore and the same progress bar. The per-person split stays in the sidebar
  rather than being repeated in the strip.

---

## 6 · Redeem history

Removed from both places it appeared. The parent queue — *"N waiting for a
grown-up"* — stays, because that is actionable; a log of what was already handed over
is not, and it was pushing the rewards bank below the fold.

**The rows are not deleted.** `star_ledger` references `redemptions`, so deleting them
would break the audit trail that makes *"where did 40 stars go"* answerable. Nothing
displays them and nothing fetches them any more.

---

## Two bugs found while building this

- **`renderChores()` crashed on load for a reader kid on the phone.** It is reachable
  from outside the router — `flushQueue()`'s `finally` and `wakeAmbient()` both call
  it — so it cannot assume `viewTasks` ran first. An offline write flushing during
  startup, while the hash was still `#/tasks`, hit `state.members === null`.
- **Container query units silently fell back.** `34cqmin` needs size containment;
  where that isn't supported the `@supports` fallback quietly put a 50 px glyph on a
  220 px card. Replaced with the card height `kidFit()` already knows.

---

## Still to do

- Nothing blocking. The untouched P3 polish from `W10-Findings-Register.md` (parent
  chore rows still read spreadsheet-like on the wall) is unchanged.
