// W15.1 — the icon field, end to end.
//
// The three broken values in the live data each failed a different way: a share link
// (HTML, not an image), a stock-photo product page (same), and a real data URL cut to
// 400 chars by a maxlength on the field itself. So this walks all three routes in and
// asserts the two things that were missing: a photo route at all, and a link route
// that tells you when the link is not an image instead of saving it silently.
import { chromium } from "playwright";
import http from "http"; import fs from "fs"; import path from "path";

const WEB = path.resolve("web"), TEST = path.resolve("test");
const MIME = { ".html":"text/html", ".js":"text/javascript", ".css":"text/css", ".webmanifest":"application/json" };
const srv = http.createServer((q, r) => {
  let p = decodeURI(q.url.split("?")[0]); if (p === "/") p = "/index.html";
  const f = path.join(WEB, p);
  if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); return r.end("nf"); }
  r.writeHead(200, { "Content-Type": MIME[path.extname(f)] || "text/plain" }); r.end(fs.readFileSync(f));
});
await new Promise((r) => srv.listen(8804, r));

const R = []; const ok = (n, c, x = "") => R.push({ n, pass: !!c, x });
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const ctx = await b.newContext({ viewport:{ width:1280, height:720 } });
const page = await ctx.newPage(); const errs = [];
await page.route("**/@supabase/supabase-js@2*", (r) =>
  r.fulfill({ contentType:"text/javascript", body: fs.readFileSync(path.join(TEST,"stub-supabase.js"),"utf8") }));
await page.route("**/rrule@2.8.1*", (r) =>
  r.fulfill({ contentType:"text/javascript", body: fs.readFileSync(path.join(TEST,"rrule.bundle.js"),"utf8") }));
await page.route("**/sw.js", (r) => r.fulfill({ contentType:"text/javascript", body:"" }));
// a URL that answers with HTML — exactly what share.google and a stock-photo page do
await page.route("**/share.example/**", (r) => r.fulfill({ contentType:"text/html", body:"<html>nope</html>" }));
// a URL that answers with a real image
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64");
await page.route("**/real.example/**", (r) => r.fulfill({ contentType:"image/png", body: PNG }));
page.on("pageerror", (e) => errs.push(e.message));
await page.addInitScript((m) => localStorage.setItem("fh_current_member", JSON.stringify(m)),
  { id:"m-suzy", name:"Suzy 👩", color:"red", is_child:false, avatar_url:null });
await page.goto("http://localhost:8804/#/tasks", { waitUntil:"networkidle" });
await page.waitForTimeout(700);

// ---- the form has a picture field with three ways in ------------------------
await page.locator(".cedit").first().click();
await page.waitForTimeout(500);
ok("the chore form opens", await page.locator("#taskForm").isVisible());
ok("W15.1 there is a PHOTO route — the thing that never existed",
   (await page.locator(".iconfield .ip-file").count()) === 1);
ok("W15.1 …and an emoji grid", (await page.locator(".iconfield .ipe").count()) >= 20);
ok("W15.1 …and a link field", (await page.locator(".iconfield .ip-link").count()) === 1);
ok("W15.1 the 400-char maxlength that truncated the data URL is gone",
   (await page.locator("#t_icon").getAttribute("maxlength")) === null);
ok("W15.1 a live preview shows what the child will see",
   await page.locator(".iconfield .ippreview").isVisible());

// ---- emoji route ------------------------------------------------------------
await page.locator(".iconfield .ip-emojit").click(); await page.waitForTimeout(200);
await page.locator(".iconfield .ipe").first().click(); await page.waitForTimeout(200);
ok("W15.1 picking an emoji sets the value",
   (await page.locator("#t_icon").inputValue()).length > 0, await page.locator("#t_icon").inputValue());
ok("W15.1 …and previews it", (await page.locator(".iconfield .ipemo").count()) === 1);

// ---- link route: a share link / product page must be REFUSED, not saved ------
await page.locator(".iconfield .ip-linkt").click(); await page.waitForTimeout(150);
const before = await page.locator("#t_icon").inputValue();
await page.locator(".iconfield .ip-link").fill("https://share.example/0oQcICMJKJyFz0ZMh");
await page.locator("#t_title").click();                       // blur
await page.waitForTimeout(900);
ok("W15.1 an HTML share link is rejected, not silently stored",
   (await page.locator("#t_icon").inputValue()) === before,
   await page.locator("#t_icon").inputValue());
ok("W15.1 …and it says why, in words a parent can act on",
   /isn't an image|not an image|try 📷/i.test(await page.locator(".iconfield .iphint").innerText()),
   await page.locator(".iconfield .iphint").innerText());
ok("W15.1 …and the hint is marked as an error",
   await page.locator(".iconfield .iphint").evaluate((n) => n.classList.contains("bad")));

// a non-image address never even gets probed
await page.locator(".iconfield .ip-link").fill("not-a-url-at-all");
await page.locator("#t_title").click(); await page.waitForTimeout(400);
ok("W15.1 a non-address is refused up front",
   /doesn't look like an image address/i.test(await page.locator(".iconfield .iphint").innerText()),
   await page.locator(".iconfield .iphint").innerText());

// ---- link route: a real image is accepted -----------------------------------
await page.locator(".iconfield .ip-link").fill("https://real.example/bed.png");
await page.locator("#t_title").click(); await page.waitForTimeout(1200);
ok("W15.1 a real image link IS accepted",
   (await page.locator("#t_icon").inputValue()) === "https://real.example/bed.png",
   await page.locator("#t_icon").inputValue());
ok("W15.1 …and previews as a picture", (await page.locator(".iconfield .ippreview img").count()) === 1);

// ---- photo route: pick a file, watch it downscale and upload -----------------
const jpg = path.join(TEST, "_sample.png");
fs.writeFileSync(jpg, PNG);
await page.locator(".iconfield .ip-file").setInputFiles(jpg);
await page.waitForTimeout(1500);
const val = await page.locator("#t_icon").inputValue();
ok("W15.1 choosing a photo produces a stored URL, not a pasted string",
   /family-icons/.test(val), val.slice(0, 90));
ok("W15.1 …and the value is a URL, never a 200KB data blob in the row",
   val.length < 300 && !val.startsWith("data:"), `len=${val.length}`);
const up = await page.evaluate(() => (window.__DB._uploads || []).slice(-1)[0]);
ok("W15.1 …and it went to the family-icons bucket as a downscaled JPEG",
   !!up && up.bucket === "family-icons" && up.type === "image/jpeg", JSON.stringify(up));
fs.unlinkSync(jpg);

// ---- clear ------------------------------------------------------------------
await page.locator(".iconfield .ip-clear").click(); await page.waitForTimeout(200);
ok("W15.1 clear empties it", (await page.locator("#t_icon").inputValue()) === "");

// ---- a reward can carry a picture too, so the prize strip shows the real thing
await page.locator("#tClose").click(); await page.waitForTimeout(300);
await page.locator(".rwedit").first().click(); await page.waitForTimeout(500);
ok("W15.1 rewards have the same picture field",
   (await page.locator("#rwForm .iconfield .ip-file").count()) === 1);
await page.locator("#rw_cost").fill("0");
await page.locator("#rwSave").click(); await page.waitForTimeout(400);
// a 0-star reward is infinitely redeemable — it must not be creatable at all
const refused = (await page.locator("#rw_cost").evaluate((n) => n.checkValidity())) === false
             || /at least 1 star/i.test(await page.locator("#rwErr").innerText());
ok("W15.1 a 0-star reward is refused at the form, not just at the RPC", refused,
   await page.locator("#rwErr").innerText());

ok("no page errors throughout", errs.length === 0, errs.join(" | "));

await ctx.close(); await b.close(); srv.close();
const bad = R.filter((r) => !r.pass);
for (const r of R) console.log(`${r.pass ? "  ok " : "FAIL"}  ${r.n}${!r.pass && r.x ? "  [" + r.x + "]" : ""}`);
console.log(`\n${R.length - bad.length}/${R.length} icon checks passed`);
process.exit(bad.length ? 1 : 0);
