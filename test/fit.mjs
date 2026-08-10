// W15.2 — THE FIT HARNESS.
//
// "no scrolling is required, all data has to be presented in the screen" is a promise
// that is easy to keep with five chores and easy to break with fourteen. This harness
// pushes chore counts up on every surface the family actually uses and fails if
// anything leaves the viewport, if a scrollbar appears, or if the cards shrink below
// what a 5-year-old can reliably hit.
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
await new Promise((r) => srv.listen(8802, r));

const R = []; const ok = (n, c, x = "") => R.push({ n, pass: !!c, x });
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });

const DOMA = { id:"m-doma", name:"Doma ⛹️‍♂️", color:"green", is_child:true, avatar_url:null };
const NONO = { id:"m-nono", name:"Nono ⛹️‍♂️", color:"blue",  is_child:true, avatar_url:null };

// the four real surfaces: the wall panel, a MacBook window, an iPhone, and that
// iPhone turned sideways — the case a landscape media query gets wrong
const SURFACES = [
  { label:"wall 1280x720",     vp:{width:1280,height:720} },
  { label:"macbook 1440x900",  vp:{width:1440,height:900} },
  { label:"iphone 390x844",    vp:{width:390,height:844} },
  { label:"iphone land 844x390", vp:{width:844,height:390} },
];
const LOADS = [1, 3, 5, 9, 14];

async function open_(vp, member, chores) {
  const ctx = await b.newContext({ viewport: vp });
  const page = await ctx.newPage(); const errs = [];
  await page.route("**/@supabase/supabase-js@2*", (r) =>
    r.fulfill({ contentType:"text/javascript", body: fs.readFileSync(path.join(TEST,"stub-supabase.js"),"utf8") }));
  await page.route("**/rrule@2.8.1*", (r) =>
    r.fulfill({ contentType:"text/javascript", body: fs.readFileSync(path.join(TEST,"rrule.bundle.js"),"utf8") }));
  await page.route("**/sw.js", (r) => r.fulfill({ contentType:"text/javascript", body:"" }));
  page.on("pageerror", (e) => errs.push(e.message));
  await page.addInitScript((m) => localStorage.setItem("fh_current_member", JSON.stringify(m)), member);
  await page.goto("http://localhost:8802/#/tasks", { waitUntil:"networkidle" });
  await page.waitForTimeout(500);
  // load the board up: spread across bands the way a real day is
  await page.evaluate(({ mid, n }) => {
    const bands = ["morning","afternoon","evening",null];
    const d = new Date();
    const key = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
    // drop the fixture's up-for-grabs chore so the count under test is exact
    window.__DB.tasks = window.__DB.tasks.filter((t) =>
      t.kind === "task" || (t.assigned_to && t.assigned_to !== mid));
    for (let i = 0; i < n; i++) window.__DB.tasks.push({
      id:"fit"+i, family_id:"fam1", assigned_to:mid,
      title:["Make the bed","Brush teeth and wear pyjamas","Put bag and books in the right place",
             "Eat lunch and put dishes in the sink","Read for ten minutes"][i % 5] + (i > 4 ? " " + (i+1) : ""),
      icon_url:["🛏️","🦷","🎒","🍽️","📚"][i % 5], time_band:bands[i % 4],
      star_reward:3, due_date:key, due_time:null, kind:"chore", rrule:null, exdates:[], is_active:true,
      created_at:new Date().toISOString(),
    });
  }, { mid: member.id, n: chores });
  await page.evaluate(() => { location.hash = "#/picker"; });
  await page.waitForTimeout(200);
  await page.evaluate((m) => { location.hash = "#/kid/" + m; }, member.id);
  await page.waitForTimeout(800);
  return { page, ctx, errs };
}

const measure = (page) => page.evaluate(() => {
  const de = document.documentElement, bd = document.body;
  const wrap = document.querySelector(".kidwrap");
  const scrollable = [...document.querySelectorAll(".kidwrap, .kidwrap *")].filter((n) => {
    const o = getComputedStyle(n); const oy = o.overflowY, ox = o.overflowX;
    return ((oy === "auto" || oy === "scroll") && n.scrollHeight - n.clientHeight > 2)
        || ((ox === "auto" || ox === "scroll") && n.scrollWidth - n.clientWidth > 2);
  }).map((n) => n.className);
  const vw = window.innerWidth, vh = window.innerHeight;
  const outside = [];
  for (const n of document.querySelectorAll(".kcard,.kthumb,.kprize,.kidtop,.kband2")) {
    const r = n.getBoundingClientRect();
    if (r.bottom > vh + 1 || r.right > vw + 1 || r.top < -1 || r.left < -1)
      outside.push(`${n.className}@${Math.round(r.left)},${Math.round(r.top)} ${Math.round(r.width)}x${Math.round(r.height)}`);
  }
  const cards = [...document.querySelectorAll(".kmain")].map((n) => n.getBoundingClientRect());
  const thumbs = document.querySelectorAll(".kthumb").length;
  const speak = [...document.querySelectorAll(".kspeak")].map((n) => n.getBoundingClientRect().height);
  return {
    docScroll: de.scrollHeight - de.clientHeight, bodyScroll: bd.scrollHeight - bd.clientHeight,
    wrapScroll: wrap ? wrap.scrollHeight - wrap.clientHeight : -1,
    scrollable, outside, cards: cards.length, thumbs,
    minW: cards.length ? Math.min(...cards.map((c) => c.width)) : 0,
    minH: cards.length ? Math.min(...cards.map((c) => c.height)) : 0,
    minSpeak: speak.length ? Math.min(...speak) : 99,
    txt: (document.querySelector(".kidwrap") || {}).innerText || "",
  };
});

for (const who of [DOMA, NONO]) {
  for (const s of SURFACES) {
    for (const n of LOADS) {
      const { page, ctx, errs } = await open_(s.vp, who, n);
      const m = await measure(page);
      const tag = `${who.name.split(" ")[0]} · ${s.label} · ${n} chores`;
      ok(`${tag}: no page errors`, errs.length === 0, errs.join("|"));
      ok(`${tag}: nothing scrolls`,
         m.docScroll <= 1 && m.bodyScroll <= 1 && m.wrapScroll <= 1 && m.scrollable.length === 0,
         JSON.stringify({ doc:m.docScroll, body:m.bodyScroll, wrap:m.wrapScroll, scrollable:m.scrollable }));
      ok(`${tag}: nothing sits outside the viewport`, m.outside.length === 0, JSON.stringify(m.outside));
      ok(`${tag}: all ${n} chores are on screen`, m.cards + m.thumbs === n, `cards=${m.cards} thumbs=${m.thumbs}`);
      // 56px is the accessible-kiosk floor for a child; hold it even at 14 chores
      ok(`${tag}: cards stay >= 56px`, m.minW >= 56 && m.minH >= 56,
         `${Math.round(m.minW)}x${Math.round(m.minH)}`);
      ok(`${tag}: the speaker stays >= 44px`, m.minSpeak >= 44, String(Math.round(m.minSpeak)));
      if (who === DOMA) ok(`${tag}: no dates, no clock times`,
        !/\b(Aug|Sep|Oct|20\d\d|\d{1,2}\/\d{1,2}|\d{1,2}:\d{2})\b/.test(m.txt), m.txt.replace(/\n/g," ").slice(0,120));
      await ctx.close();
    }
  }
}

await b.close(); srv.close();
const bad = R.filter((r) => !r.pass);
for (const r of R) if (!r.pass) console.log(`FAIL  ${r.n}${r.x ? "  [" + r.x + "]" : ""}`);
console.log(`\n${R.length - bad.length}/${R.length} fit checks passed`);
process.exit(bad.length ? 1 : 0);
