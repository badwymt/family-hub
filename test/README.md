# Family Hub test harness

Headless Playwright against the real `web/` files. The bugs this suite exists to catch
(stale identity, an empty people strip on cold load, a leaked interval) are **runtime**
bugs that are invisible in a static read of the source, which is why this exists at all.

```
npm i playwright rrule esbuild
node test/run.mjs     # assertions — exits non-zero on any failure
node test/shot.mjs    # writes test/shots/*.png at 1280x720 and 390x844
```

If Playwright's bundled Chromium is missing, point it at the system one:
`chromium.launch({ executablePath: "/opt/pw-browsers/chromium" })` (already set).

## How it works
- `run.mjs` serves `web/` over http and intercepts the two esm.sh imports.
- `stub-supabase.js` is an in-memory stand-in: a chainable query builder (`eq/is/in/gte/
  order/limit/single/insert/update/delete`) over fixture tables, plus fake `auth`,
  `rpc` (recorded in `CALLS.rpc`) and `channel`. Fixtures are relative to *today*, so
  "today only" assertions stay true whenever you run them.
- `rrule.bundle.js` is the real rrule, esbuild-bundled — recurrence is never stubbed,
  because getting occurrence expansion wrong is exactly the failure mode we're testing.

## Invariant worth protecting
The phone block asserts the wall shell is fully inert below 1000px. If those fail, the
wall work has leaked into the phone layout — stop and fix before adding anything.
