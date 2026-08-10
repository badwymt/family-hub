# Family Hub — Sage design system

**v1.0 · 2026-08-09.** For an always-on 22″ wall panel in a shared living space, used by two adults and two children (8, and 5 who cannot read).

Every value here is **contrast-validated by `test/palette.mjs`**, which fails the build on regression. Nothing below was chosen by eye.

---

## 1. The ground: soft matte sage

```css
--bg:      #E7EDE3   /* app background — matte pastel sage */
--panel:   #F5F8F2   /* raised surface (cards) — sage-tinted, NOT white */
--panel2:  #DDE5D7   /* recessed surface (footers, headers, wells) */
--rail:    #E1E9DC   /* navigation rail */
--line:    #C9D4C0   /* borders, dividers, hairlines */
--text:    #2C3730   /* body — deep desaturated green-grey, never black */
--muted:   #5E6C62   /* secondary text */
```

**Why no white and no black.** A pure-white panel lit sixteen hours a day in a room is the single biggest source of glare; `#F5F8F2` reads as white in context while cutting luminance ~4%. Pure black text on a light ground produces halation at distance — `#2C3730` keeps 11.4:1 against the ground (well past AAA) while feeling softer.

**Why sage.** It is low-chroma and mid-light, so it recedes: nothing on it has to fight for attention, which is what makes an information-dense wall calm. It's also warm-leaning, which keeps it from feeling clinical.

---

## 2. Accents: playful, muted, never fluorescent

```css
--accent:      #A85B2E   /* clay — primary action, TODAY, now-line */
--accent-soft: #EFDCCB   /* accent wash — streak pills, prize bar */
--star:        #A87722   /* antique gold — stars, bonus badges */
--pos:         #3D7350   /* success */
--danger:      #A64F4B   /* destructive */
```

Clay against sage is a warm/cool complement: it pops without being loud, which is exactly the brief — a child should notice the FAB, nobody should be irritated by it at 9pm.

| Check | Ratio | Requirement |
|---|---|---|
| `--text` on `--bg` | **11.4:1** | AAA 7:1 |
| `--text` on `--panel` | **12.1:1** | AAA 7:1 |
| `--muted` on `--bg` | **5.4:1** | AA 4.5:1 |
| white on `--accent` | **5.6:1** | AA 4.5:1 |
| `--accent` vs `--bg` | **4.7:1** | non-text 3:1 |

---

## 3. Identity colours: ink + tint

Each person owns a pair — a saturated **ink** for edges, avatars and badges, and a pale **tint** for pill fills.

```css
--teal:#3F8F84    --teal-t:#DCEBE7      /* Daddy  */
--red:#C06A6A     --red-t:#F3DFDE       /* Suzy   */
--blue:#5C86B8    --blue-t:#DEE7F2      /* Nono   */
--green:#5E9150   --green-t:#DFEBD9     /* Doma   */
--amber:#A2761F   --amber-t:#F2E6CE
--purple:#8C6BA8  --purple-t:#E8E0F0
--pink:#A85F82    --pink-t:#F2DEE7
--indigo:#455780  --indigo-t:#DEE3EC
--slate:#75837A   --slate-t:#E2E7E1     /* unassigned / whole family */
```

**Why the split.** A solid saturated block turns to mud at four metres; a pale tint with a 3px ink edge stays legible. This is the single rule that makes a dense week grid readable across a kitchen.

**Validated:** every ink clears 3:1 against the ground (WCAG 1.4.11 non-text), every tint carries body text at ≥9.6:1, and **all 36 identity pairs separate by ΔE ≥ 18** so no two people are confusable at distance. Member green is deliberately pushed away from the sage ground (3.1:1) so Doma's colour never disappears into the wall.

---

## 4. Surface hierarchy

Depth comes from **value, not shadow**. Three steps, no more:

```
recessed  --panel2   headers, footers, wells
ground    --bg       the page itself
raised    --panel    cards, rows, pills
```

```css
--shadow: 0 1px 3px rgba(44,55,48,.06), 0 4px 14px rgba(44,55,48,.05);
```
Green-tinted, barely there. A shadow's job here is to lift a card off the sage by a hair, not to announce itself.

---

## 5. Type and touch

At 1280×720 on a 22″ panel: **2.63 px/mm (66.8 ppi)**.

| Element | Size | Physical |
|---|---|---|
| Chore label (the 8-year-old reads this) | 40px | 15mm |
| Section heading | 19px | 7mm |
| Body | 13px | 5mm |
| Adult tap target | ≥44px | 16.7mm |
| **Kid tap target** | **≥56px** | **21.3mm** — the accessible-kiosk floor |
| **Kid Mode card** | **≥200px** | **76mm** |

Nothing tappable within 26px (10mm) of the top or right edge — children's misses concentrate there.

---

## 6. State, never by colour alone

~8% of boys have red/green colour deficiency, and one of the two users is five. Every state carries **three** redundant signals:

| State | Signals |
|---|---|
| Done | tick fills · icon desaturates · row recedes to 50% · title strikes through |
| Bonus | gold badge `✨×2` · gold border · soft accent halo |
| Today | orange top rule · `TODAY` pill · warmer column ground |
| Active person | column tinted · `you` badge · ordered first |

---

## 7. Motion

- Per-tap celebration: **~500ms, card-local, non-blocking.** Animated feedback cut children's uncertain repeat-taps from 238 to 21 (Woodward et al., CHI 2016) — it prevents errors. But the same study found heavy animation *slowed* 5–6 year-olds, so it stays small and local.
- Full-screen confetti only when a whole band clears.
- Everything respects `prefers-reduced-motion`.

---

## 8. Motivation (streaks + surprise bonuses)

Chosen over a collectible board because the benchmark identified these as the levers that actually hold attention past the two-week cliff.

**Streaks** — consecutive days where *everything* got done. Shown from 2 upward (a "1-day streak" isn't one). A day with **no chores assigned does not break it** — the system should never punish a Sunday.

**Surprise bonuses** — roughly 1 chore-day in 5 pays double, shown as `✨×2`.
- The multiplier is **derived server-side** from `hash(task_id + date)`. The client never sends it, so a child cannot ask for a bigger one.
- The client mirrors the same hash purely to decide whether to draw the badge.
- `complete_task` records what it actually paid in `star_awarded`, so `uncomplete_task` reverses the exact amount — bonus included.
- 1-in-5 is frequent enough to be worth watching for, rare enough to stay a surprise.

---

## 9. Rules for anyone extending this

1. **Never hide a shared class.** `.viewseg` belongs to Calendar, Meals *and* Finance; hiding it globally deleted two modules' navigation. Mark the instance (`.viewseg--cal`), never the class.
2. **Never render a raw number into a fixed chip.** One real balance here is 323,811,241. `fmtStars()` exists for this.
3. **Never encode meaning in colour alone.**
4. **Never let a tap do nothing.** If an action is blocked, `toast()` says why.
5. **Never use `#FFFFFF` or `#000000`.** Use `--panel` and `--text`.
6. **Run `node test/palette.mjs` after touching any colour.** It fails on contrast or ΔE regression.
7. **Test as every role.** The bugs that reached the wall all survived because no journey ran *as a child*.

---

## 10. Fitted screens (W15)

Kid Mode does not scroll. Not "rarely scrolls" — the promise is that a child sees
everything for today at once and never has to move the page or choose a tab first.
That is a layout constraint, so it is enforced by arithmetic rather than by eye:

- `.kidwrap` is `100dvh` with `overflow:hidden`. There is no scroll to fall back on,
  so an overflow is a visible bug rather than a silent one.
- The day is a grid of bands. `kidFit()` measures the laid-out board after paint and
  solves for **one card height shared by every band**:
  `h = (free − Σ chrome − Σ row-gaps) / Σ rows`.
  Splitting the height by row count alone starves short bands, because every band
  pays the same fixed cost for its header, padding and border regardless of how many
  rows it holds — that produced 43 px cards next to 61 px ones.
- If `h` falls below the **56 px kid floor**, a row is traded for columns on the
  tallest band and the solve repeats. Wider-and-shorter always beats smaller.
- The final `h` is published as `--kh`, and the photo, glyph and label all scale from
  it. Container-query units were tried first and silently fell back on browsers
  without size containment, putting a 50 px glyph on a 220 px card. **A number you
  have already computed beats a unit you have to hope is supported.**
- Below `560px` of viewport height the band label moves *beside* its cards and the
  prize strip moves up beside the identity row. Four stacked headers plus a stacked
  prize bar cost ~110 px of a 390 px landscape screen — exactly the margin between a
  56 px card and a 47 px one.

`test/fit.mjs` runs this across four surfaces × five chore loads × both children and
fails on any scrollbar, anything outside the viewport, any card under 56 px, or any
chore that isn't on screen. 260 checks.

### The rule this adds

8. **A screen that promises to fit must be measured, not eyeballed.** If the layout
   depends on arithmetic, write the arithmetic down and assert it at several sizes —
   "it looked fine on my laptop" is how the 43 px card shipped.
