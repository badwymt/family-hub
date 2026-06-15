# Family Hub — M7b PWA Hardening: Manual Test Script

These flows (install, offline reads, offline write + replay, live sync) can't be proven by SDK
assertions, so run them by hand. ~10 minutes. You'll need the app served over HTTP and Chrome
(or any Chromium) with DevTools.

## 0. Serve the app
```
cd "family calendar/web"
python3 -m http.server 8000
```
Open <http://localhost:8000>. Sign in with the shared account, pick a profile.

> Note: a real install-to-home-screen and full service-worker behaviour need **HTTPS** (or
> `localhost`, which counts as a secure context). `localhost:8000` is fine for all steps below.
> On a phone you'd use the deployed HTTPS URL (that's M8).

---

## 1. Install to home screen
1. In Chrome, open DevTools → **Application** tab → **Manifest**. Confirm name "Family Hub",
   icons (192/512), `display: standalone`, theme color — no manifest errors.
2. Address bar should show an **install icon** (⊕ / "Install Family Hub"). Click it → the app
   opens in its own standalone window.
   - On iOS Safari: Share → **Add to Home Screen**; the custom icon + title appear.
3. **Pass:** the app installs and launches chrome-less from the home screen / app window.

## 2. Service worker is active + shell cached
1. DevTools → **Application → Service Workers**: status is **activated and running**, source
   `sw.js`, version `family-hub-shell-v9`.
2. **Application → Cache Storage**: you should see `family-hub-shell-v9`, `family-hub-libs-v9`
   (esm.sh modules: supabase-js, rrule), and after browsing a screen, `family-hub-data-v9`.
3. Browse the **Calendar**, **Chores**, and **Stars** tabs once while online so their data
   windows get cached.
4. **Pass:** all three caches exist and contain entries.

## 3. Offline reads work
1. DevTools → **Network** tab → set throttling to **Offline** (or **Application → Service
   Workers → Offline** checkbox).
2. Reload the app (Cmd/Ctrl-R). It should still **boot** (shell + libs from cache).
3. Navigate to the Calendar/Chores/Stars screens you visited in step 2. The previously loaded
   data should still render. An **"Offline — changes will sync…"** banner appears at the top.
4. **Pass:** the app loads and shows the last-fetched data with no network.

## 4. Offline write → optimistic UI
1. Still **offline**, go to **Chores**. (If there are no chores, do step 6 first while online to
   create one, then come back offline.)
2. Tap a chore's checkbox to complete it.
3. It should immediately show as **done** with a **⏳** marker next to the title (saved locally,
   not yet synced). The star burst animation may play (optimistic).
4. Optional: reload while still offline — the ⏳ completion **persists** (it's in `localStorage`,
   key `fh_queue`). DevTools → Application → Local Storage → confirm `fh_queue` has one entry.
5. **Pass:** the completion shows done+⏳ and survives a reload while offline.

## 5. Reconnect → replay + reconcile
1. Turn throttling back to **Online** (uncheck Offline).
2. Within a moment (or on the next render) the queue flushes: the ⏳ disappears and the chore is
   now **server-confirmed done**. The offline banner clears.
3. Go to **Stars**: the balance should reflect the awarded stars (count-up animation).
4. **Verify the ledger reconciles** (the important invariant). In the Supabase SQL editor
   (or ask me to run it), for the member who earned:
   ```sql
   select
     (select star_balance from family_members where id = '<member_id>') as cached_balance,
     (select coalesce(sum(delta),0) from star_ledger where member_id = '<member_id>') as ledger_sum;
   ```
   `cached_balance` must equal `ledger_sum`. Also confirm `fh_queue` in Local Storage is now
   **empty** `[]`.
5. **Pass:** the queued completion replayed through `complete_task` (not a direct balance write),
   stars were awarded exactly once, and balance == ledger sum.

### 5b. Idempotent replay (optional, belt-and-suspenders)
The replay is safe against duplicates: if a flush partially succeeds and retries, the second
`complete_task` for the same occurrence returns `already_completed` and the balance is **not**
credited twice. (This is covered by the automated SDK suite, but you can eyeball it by completing,
then refreshing — the balance never double-counts.)

## 6. Live sync across two sessions (Realtime)
1. Open the app in **two windows** (e.g. a normal window and an incognito window, both signed in;
   pick the same or different profiles).
2. In window A, go to **Stars**; in window B, go to **Chores** and complete a star chore.
3. Window A's **balance + leaderboard update live** (no refresh).
4. Repeat for the **Calendar**: add an event in B → it appears in A's calendar live. Same for a
   new **chore** in the Chores list.
5. **Pass:** events, chores, and stars all propagate across sessions without a manual refresh.

---

## What changed in M7b (for reference)
- `sw.js` (v9): cache-first app shell + esm.sh libs; network-first Supabase REST reads with cache
  fallback (offline reads of the last window). Writes and the realtime socket are never cached.
- Offline write queue in `localStorage` (`fh_queue`); completions are optimistic and replay through
  the `complete_task` RPC on reconnect — never a direct balance write.
- Realtime broadened from stars-only to `events`, `event_overrides`, `event_notes`, `tasks`,
  `task_completions`, `rewards`, `redemptions`.
- Manifest + Apple touch icon / web-app meta for install-to-home-screen.

If any step fails, tell me which one and what you saw, and I'll dig in.
