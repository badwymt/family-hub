# Family Hub test harness

Headless Playwright against the real `web/` files. The bugs this suite exists to catch
(stale identity, an empty people strip on cold load, a leaked interval) are **runtime**
bugs that are invisible in a static read of the source, which is why this exists at all.

```
npm i playwright rrule esbuild

node test/run.mjs      # 205 assertions — exits non-zero on any failure
node test/ux.mjs       # 134 journey steps: every fix walked as a real person
node test/fit.mjs      # 260 fit checks: Kid Mode must never scroll, on any surface
node test/icon.mjs     # 21 checks on the chore/reward picture field
node test/net.mjs      # 20 transport checks: a dropped save must not cost the form
node test/palette.mjs  # contrast + identity separation; fails on regression
node test/shot.mjs     # writes test/shots/*.png at 1280x720 and 390x844
```

Run all six before pushing. They take a few minutes together.

If Playwright's bundled Chromium is missing, point it at the system one:
`chromium.launch({ executablePath: "/opt/pw-browsers/chromium" })` (already set).

## How it works
- `run.mjs` serves `web/` over http and intercepts the two esm.sh imports.
- `ux.mjs` drives whole JOURNEYS rather than isolated assertions, because the defects
  that reached the wall were all "I tapped and nothing helpful happened" — a shape unit
  checks don't have. It runs as every ROLE; no journey ever running *as a child* is why
  the unreachable Redeem, the profile leak and the kid gate all shipped.
- `fit.mjs` exists because "no scrolling, everything on screen" is easy to keep with
  five chores and easy to break with fourteen. It sweeps 4 surfaces x 5 chore loads x
  both children and fails on a scrollbar, anything outside the viewport, or a card under
  the 56px kid floor.
- `stub-supabase.js` is an in-memory stand-in: a chainable query builder (`eq/is/in/gte/
  order/limit/single/insert/update/delete`) over fixture tables, plus fake `auth`,
  `rpc` (recorded in `CALLS.rpc`) and `channel`. Fixtures are relative to *today*, so
  "today only" assertions stay true whenever you run them.
- `net.mjs` opts into `window.__NET_PROBE`, which makes the stub issue a REAL request
  through the app's own injected fetch before answering from memory. Without it the stub
  replaces the whole client and the transport is never exercised — which is precisely how
  a phone came to show a person `TypeError: Load failed` and lose a half-typed event.
- `rrule.bundle.js` is the real rrule, esbuild-bundled — recurrence is never stubbed,
  because getting occurrence expansion wrong is exactly the failure mode we're testing.

## Invariants worth protecting
The phone block asserts the wall shell is fully inert below 1000px. If those fail, the
wall work has leaked into the phone layout — stop and fix before adding anything.

Kid Mode and the wall calendar both promise to FIT. `fit.mjs` and the W15.8 checks in
`run.mjs` fail on any scrollbar under `.kidwrap` or `#calbody`. If you add a row to
either, the harness tells you immediately rather than the wall telling you in a month.

These harnesses used to be excluded by a blanket `*.mjs` in `.gitignore`, so this README
described files the repo did not contain. If you add one, check it is actually tracked.
