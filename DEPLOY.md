# Family Hub — Deploy & Free-Tier Hardening (M8)

Everything is prepared. The steps below are the ones **you** run, because they need your
GitHub/Cloudflare login and your Supabase DB password. Each step says exactly what to click and
what to paste. Total time ~15 min. Target cost: **$0/month**.

Repo layout (already in this folder):
```
web/                     ← the app (this is what gets hosted)
02-migration.sql         ← full schema (already applied to the live project)
.github/workflows/
  keepalive.yml          ← daily Supabase keep-alive (no secret needed)
  backup.yml             ← weekly pg_dump (needs 1 secret: SUPABASE_DB_URL)
  pages.yml              ← optional GitHub Pages deploy
M7b-manual-test.md       ← offline/PWA manual test script
```

---

## 1. Put the project on GitHub

1. Create a new repository at <https://github.com/new>. Name it e.g. `family-hub`.
   **Recommended: Private** (keeps the source private; the app still only ever ships the public
   anon key, so this is just tidiness). Don't add a README/license (we already have files).
2. From this folder (`family calendar/`), push it:
   ```bash
   cd "family calendar"
   git init -b main
   git add .
   git commit -m "Family Hub M1–M8"
   git remote add origin https://github.com/<your-username>/family-hub.git
   git push -u origin main
   ```

---

## 2. Deploy the app (pick ONE)

### Option A — Cloudflare Pages  ✅ recommended (free, works with a PRIVATE repo, custom domains)
1. Go to <https://dash.cloudflare.com> → **Workers & Pages** → **Create** → **Pages** →
   **Connect to Git**. Authorize Cloudflare to access your GitHub and pick `family-hub`.
2. Build settings:
   - **Framework preset:** `None`
   - **Build command:** *(leave empty)*
   - **Build output directory:** `web`
3. **Save and Deploy.** In ~30s you get a live URL like `https://family-hub.pages.dev`.
   That's the public URL — open it, log in with the shared account, install to home screen.
4. (Optional) **Custom domain:** Pages → your project → **Custom domains** → add a domain you own.

### Option B — GitHub Pages (free, but the repo must be PUBLIC on a free plan)
1. The `pages.yml` workflow is already included. Repo → **Settings → Pages** →
   **Build and deployment → Source: GitHub Actions**.
2. Push to `main` (or run the "Deploy to GitHub Pages" workflow from the **Actions** tab).
3. Your URL will be `https://<your-username>.github.io/family-hub/`.
   - If you use this, the repo must be public; that only exposes the app code + the public anon
     key (never the shared password), which is acceptable. If you want it private, use Option A.

---

## 3. Turn on the scheduled Actions

1. Repo → **Actions** tab → if prompted, click **"I understand my workflows, enable them."**
2. You'll see **Supabase keep-alive**, **Weekly DB backup**, and (optionally) **Deploy to GitHub
   Pages**.

### 3a. Keep-alive — no secret required
Open **Supabase keep-alive** → **Run workflow** (manual test). It should go green and log
`ping -> HTTP 200, body: "ok"`. After that it runs automatically every day at 07:17 UTC and
prevents the 7-day inactivity pause.

### 3b. Weekly backup — create ONE secret, then test
1. Get the connection string: Supabase dashboard → your project → **Project Settings → Database**
   → **Connection string** → choose the **Session pooler** tab → **URI**. It looks like:
   ```
   postgresql://postgres.shnbrpvuzbkcqvxvvxlr:[YOUR-PASSWORD]@aws-0-<region>.pooler.supabase.com:5432/postgres
   ```
   Make sure `[YOUR-PASSWORD]` is the real database password (reveal/reset it on that page if
   needed). Use the **Session pooler** (port `5432`), *not* the Transaction pooler (`6543`).
2. Add it as a secret: repo → **Settings → Secrets and variables → Actions → New repository
   secret**.
   - **Name:** `SUPABASE_DB_URL`   *(exactly this)*
   - **Secret:** paste the full URI from step 1.
3. Test it: **Actions → Weekly DB backup → Run workflow.** It installs the PG17 client, writes
   `backups/familyhub-YYYY-MM-DD.dump`, commits it, and uploads it as an artifact. After it's
   green, you have a **restorable** dump (restore with `pg_restore -d "<db-url>" backups/<file>.dump`).
   It then runs every Sunday 05:30 UTC.

> Only this one secret (`SUPABASE_DB_URL`) is needed, and only for the backup job. The keep-alive
> and the app itself need no secrets.

---

## 4. $0/month confirmation
- **Hosting:** Cloudflare Pages / GitHub Pages free tier — static files, no cost.
- **Database/Auth/Realtime:** Supabase free tier; one shared login = 1 MAU; the RRULE-not-expanded
  design keeps the DB tiny (well under 500 MB).
- **Cron + backups:** GitHub Actions free minutes (these jobs run seconds/week).
- **Keep-alive** prevents the only thing that would otherwise need a paid plan (the pause).

Nothing here bills. If Supabase ever emails about a pause, check the keep-alive Action is green.

---

## 5. Security recap (already verified)
- `web/config.js` contains only the **publishable anon key** (`sb_publishable_…`) — safe in client
  code; **no service-role key** anywhere in the app.
- **RLS audited:** all 11 tables have RLS enabled with a family-scoped policy; a two-family
  isolation test confirmed neither family can see any of the other's rows in **any** table.
- The shared family password is never stored in the repo — it's typed at login.

Before going live, run **`M7b-manual-test.md`** once in a browser to confirm install + offline +
replay behave on your device.
