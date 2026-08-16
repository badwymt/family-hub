// Transport + save-path regressions.
//
// On 2026-08-15 a New Event save from a phone died with "TypeError: Load failed".
// The Supabase edge and Postgres logs show the POST never arrived, while GETs a minute
// either side succeeded: iOS had suspended the page's network under it, and the fetch
// rejected before the request left the device. The app retried nothing and printed the
// raw TypeError into the form. Nothing in the suite covered the transport, because the
// stub replaces the whole client — so this file opts into `window.__NET_PROBE`, which
// makes the stub issue a real request through the app's own fetch first.
//
// It also covers the countdown checkbox, which read the form and then dropped the two
// fields on the floor: every "Count down to this" tick since W6 was a no-op.
import { chromium } from "playwright";
import http from "http"; import fs from "fs"; import path from "path";

const WEB = path.resolve("web"), TEST = path.resolve("test");
const MIME = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".webmanifest": "application/json" };
const srv = http.createServer((req, res) => {
  let p = decodeURI(req.url.split("?")[0]);
  if (p.startsWith("/__net/")) { res.writeHead(200, { "Content-Type": "application/json" }); return res.end("{}"); }
  if (p === "/") p = "/index.html";
  const f = path.join(WEB, p);
  if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end("nf"); }
  res.writeHead(200, { "Content-Type": MIME[path.extname(f)] || "text/plain", "Cache-Control": "no-store" });
  res.end(fs.readFileSync(f));
});
await new Promise((r) => srv.listen(8784, r));

const R = [];
const ok = (name, cond, extra = "") => R.push({ name, pass: !!cond, extra });
const SUZY = { id: "m-suzy", name: "Suzy 👩", color: "red", is_child: false, avatar_url: null };
const PHONE = { width: 390, height: 844 };

const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });

async function open(hash = "/home", viewport = PHONE) {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  await page.route("**/@supabase/supabase-js@2*", (r) =>
    r.fulfill({ contentType: "text/javascript", body: fs.readFileSync(path.join(TEST, "stub-supabase.js"), "utf8") }));
  await page.route("**/rrule@2.8.1*", (r) =>
    r.fulfill({ contentType: "text/javascript", body: fs.readFileSync(path.join(TEST, "rrule.bundle.js"), "utf8") }));
  await page.route("**/sw.js", (r) => r.fulfill({ contentType: "text/javascript", body: "" }));
  const errs = [];
  page.on("pageerror", (e) => errs.push(e.message));
  await page.addInitScript((m) => {
    localStorage.setItem("fh_current_member", JSON.stringify(m));
    window.__NET_PROBE = true;                       // exercise the real transport
  }, SUZY);
  await page.goto(`http://localhost:8784/#${hash}`, { waitUntil: "networkidle" });
  await page.waitForTimeout(450);
  return { page, ctx, errs };
}

// Open New Event and fill it the way a person does.
async function newEvent(page, { title = "Swimming lesson", countdown = false } = {}) {
  await page.click("#addEvent");
  await page.waitForSelector("#evForm", { timeout: 4000 });
  await page.fill("#f_title", title);
  if (countdown) await page.check("#f_cd");
  return () => page.click("#evSave");
}
const eventsNamed = (page, title) =>
  page.evaluate((t) => window.__DB.events.filter((e) => e.title === t), title);

// ── 1. a single dropped request must not cost the form ───────────────────────
{
  const { page, ctx, errs } = await open();
  let attempts = 0;
  await page.route("**/__net/events", (route) => {
    attempts++;
    if (route.request().method() !== "GET" && attempts <= 1) return route.abort("failed");
    return route.fulfill({ status: 200, contentType: "application/json", body: "{}" });
  });
  const save = await newEvent(page, { title: "Swimming lesson" });
  await save();
  await page.waitForTimeout(2500);                 // 300ms backoff + slack
  const rows = await eventsNamed(page, "Swimming lesson");
  ok("the event survives one dropped request", rows.length === 1, `rows=${rows.length} attempts=${attempts}`);
  ok("…and saves exactly once, never twice", rows.length <= 1, `rows=${rows.length}`);
  ok("…and the form closes on success", !(await page.locator("#evForm").count()));
  ok("no page errors", errs.length === 0, errs.join(" | "));
  await ctx.close();
}

// ── 2. when it really is unreachable, say so in words ────────────────────────
{
  const { page, ctx } = await open();
  let posts = 0;
  await page.route("**/__net/events", (route) => {
    if (route.request().method() === "GET") return route.fulfill({ status: 200, body: "{}" });
    posts++; return route.abort("failed");
  });
  const save = await newEvent(page, { title: "Dentist" });
  await save();
  await page.waitForTimeout(3500);
  const msg = (await page.locator("#evErr").innerText()).trim();
  ok("a dropped save is retried, not surrendered on the first try", posts >= 3, `POST attempts=${posts}`);
  ok("the message is in English, not a stack-trace word",
     /couldn't reach|offline/i.test(msg) && !/TypeError|Load failed/i.test(msg), JSON.stringify(msg));
  ok("the form stays open so nothing typed is lost", await page.locator("#evForm").count() === 1);
  ok("…with the title still in it", (await page.inputValue("#f_title")) === "Dentist");
  ok("…and Save is usable again", !(await page.locator("#evSave").isDisabled()));
  ok("nothing was written", (await eventsNamed(page, "Dentist")).length === 0);
  await ctx.close();
}

// ── 3. offline gets its own wording ──────────────────────────────────────────
{
  const { page, ctx } = await open();
  await page.route("**/__net/events", (route) =>
    route.request().method() === "GET" ? route.fulfill({ status: 200, body: "{}" }) : route.abort("internetdisconnected"));
  const save = await newEvent(page, { title: "Haircut" });
  await page.context().setOffline(true);
  await save();
  await page.waitForTimeout(3500);
  const msg = (await page.locator("#evErr").innerText()).trim();
  ok("offline says you're offline and that nothing was lost",
     /offline/i.test(msg) && /nothing was lost/i.test(msg), JSON.stringify(msg));
  await page.context().setOffline(false);
  await ctx.close();
}

// ── 4. a retry that lands twice must not create two events ───────────────────
{
  const { page, ctx } = await open();
  const id = await page.evaluate(async () => {
    window.__DB.events.length = 0;
    return null;
  });
  await newEvent(page, { title: "Idempotent" }).then((s) => s());
  await page.waitForTimeout(1200);
  const row = (await eventsNamed(page, "Idempotent"))[0];
  ok("the client mints the row id, so a replayed write collides instead of duplicating",
     !!row && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(row.id), JSON.stringify(row && row.id));
  await ctx.close();
}

// ── 4b. a write that DID land, whose reply was lost, must not double up ──────
{
  const ctx = await browser.newContext({ viewport: PHONE });
  const page = await ctx.newPage();
  await page.route("**/@supabase/supabase-js@2*", (r) =>
    r.fulfill({ contentType: "text/javascript", body: fs.readFileSync(path.join(TEST, "stub-supabase.js"), "utf8") }));
  await page.route("**/rrule@2.8.1*", (r) =>
    r.fulfill({ contentType: "text/javascript", body: fs.readFileSync(path.join(TEST, "rrule.bundle.js"), "utf8") }));
  await page.route("**/sw.js", (r) => r.fulfill({ contentType: "text/javascript", body: "" }));
  const errs = []; page.on("pageerror", (e) => errs.push(e.message));
  const FIXED = "11111111-2222-4333-8444-555555555555";
  await page.addInitScript((m) => {
    localStorage.setItem("fh_current_member", JSON.stringify(m));
    crypto.randomUUID = () => "11111111-2222-4333-8444-555555555555";   // force the collision
  }, SUZY);
  await page.goto("http://localhost:8784/#/home", { waitUntil: "networkidle" });
  await page.waitForTimeout(450);
  // stand in for "the first attempt reached the server, the reply was lost"
  await page.evaluate((id) => window.__DB.events.push({ id, family_id: "fam1", member_id: "m-suzy",
    title: "Ghost write", starts_at: new Date().toISOString(), ends_at: null, all_day: false,
    rrule: null, exdates: [], reminder_minutes: null }), FIXED);
  const before = await page.evaluate(() => window.__DB.events.length);
  await newEvent(page, { title: "Ghost write" }).then((s) => s());
  await page.waitForTimeout(1500);
  const after = await page.evaluate(() => window.__DB.events.length);
  ok("a replayed write resolves against the existing row instead of duplicating it",
     after === before, `${before} -> ${after} events`);
  ok("…and the user sees a success, not a duplicate-key error",
     !(await page.locator("#evForm").count()), (await page.locator("#evErr").count()) ? await page.locator("#evErr").innerText() : "");
  ok("no page errors", errs.length === 0, errs.join(" | "));
  await ctx.close();
}

// ── 5. the countdown checkbox actually counts down ───────────────────────────
{
  const { page, ctx, errs } = await open();
  await newEvent(page, { title: "Trip to Sharm", countdown: true }).then((s) => s());
  await page.waitForTimeout(1200);
  const row = (await eventsNamed(page, "Trip to Sharm"))[0];
  ok("ticking 'Count down to this' reaches the database", !!row && row.countdown === true, JSON.stringify(row || null));
  ok("…and an emoji is suggested from the title rather than left null",
     !!row && !!row.countdown_emoji, JSON.stringify(row && row.countdown_emoji));
  ok("an unticked event is not a countdown", await page.evaluate(() =>
    (window.__DB.events.find((e) => e.title === "Swimming lesson") || {}).countdown !== true));
  ok("no page errors", errs.length === 0, errs.join(" | "));
  await ctx.close();
}

// ── 6. editing an existing event keeps the countdown flag ────────────────────
{
  const { page, ctx } = await open();
  await page.evaluate(() => { window.__DB.events.find((e) => e.id === "e4").countdown = true; });
  await page.goto("http://localhost:8784/#/countdowns", { waitUntil: "networkidle" });
  await page.waitForTimeout(500);
  const shown = await page.locator("#app").innerText();
  ok("a countdown event is listed on the countdowns pane", /Trip to Alex/.test(shown), JSON.stringify(shown.slice(0, 120)));
  await ctx.close();
}

await browser.close(); srv.close();
for (const r of R) console.log(`  ${r.pass ? "ok " : "FAIL"} ${r.name}${r.extra ? "  [" + r.extra + "]" : ""}`);
const bad = R.filter((r) => !r.pass).length;
console.log(`\n${R.length - bad}/${R.length} transport + save checks passed`);
process.exit(bad ? 1 : 0);
