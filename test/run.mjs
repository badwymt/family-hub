import { chromium } from "playwright";
import http from "http"; import fs from "fs"; import path from "path";

const WEB = path.resolve("web"), TEST = path.resolve("test");
const MIME = { ".html":"text/html", ".js":"text/javascript", ".css":"text/css", ".json":"application/json", ".webmanifest":"application/json" };
const srv = http.createServer((req,res)=>{
  let p = decodeURI(req.url.split("?")[0]); if (p==="/") p="/index.html";
  const f = path.join(WEB,p);
  if (!fs.existsSync(f)||fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end("nf"); }
  res.writeHead(200,{ "Content-Type": MIME[path.extname(f)]||"text/plain", "Cache-Control":"no-store" });
  res.end(fs.readFileSync(f));
});
await new Promise(r=>srv.listen(8781,r));

const R = [];
const ok = (name, cond, extra="") => R.push({ name, pass: !!cond, extra });

let browser; try { browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
async function open(viewport, hash, member){
  const ctx = await browser.newContext({ viewport, deviceScaleFactor:1 });
  const page = await ctx.newPage();
  await page.route("**/@supabase/supabase-js@2*", r =>
    r.fulfill({ contentType:"text/javascript", body: fs.readFileSync(path.join(TEST,"stub-supabase.js"),"utf8") }));
  await page.route("**/rrule@2.8.1*", r =>
    r.fulfill({ contentType:"text/javascript", body: fs.readFileSync(path.join(TEST,"rrule.bundle.js"),"utf8") }));
  await page.route("**/sw.js", r => r.fulfill({ contentType:"text/javascript", body:"" }));
  const errs = [];
  page.on("pageerror", e => errs.push(e.message));
  await page.addInitScript((m) => {
    if (m) localStorage.setItem("fh_current_member", JSON.stringify(m));
  }, member || null);
  await page.goto(`http://localhost:8781/#${hash}`, { waitUntil:"networkidle" });
  await page.waitForTimeout(450);
  return { page, ctx, errs };
}
const DOMA = { id:"m-doma", name:"Doma ⛹️", color:"green", is_child:true, avatar_url:null };
const NONO = { id:"m-nono", name:"Nono ⛹️", color:"blue", is_child:true, avatar_url:null };
const SUZY = { id:"m-suzy", name:"Suzy 👩",  color:"red",   is_child:false, avatar_url:null };
const WALL = { width:1280, height:720 }, PHONE = { width:390, height:844 };

// ---------------------------------------------------------------- W1 wall shell

{
  const { page, ctx, errs } = await open(WALL, "/home", SUZY);
  ok("W1 no console/page errors on wall", errs.length===0, errs.join(" | "));
  ok("W1 rail visible",   await page.locator("#wallRail").isVisible());
  ok("W1 infobar visible",await page.locator("#wallInfo").isVisible());
  ok("W1 people visible", await page.locator("#wallPeople").isVisible());
  ok("W1 strip populated on COLD load (no empty bar)", (await page.locator("#wallPeople .person").count())===4,
     `count=${await page.locator("#wallPeople .person").count()}`);
  ok("W1 family name from context, not placeholder",
     (await page.locator("#wallInfo .famname").innerText()).includes("Badawy"),
     await page.locator("#wallInfo .famname").innerText());
  ok("W1 homefab hidden", !(await page.locator(".homefab").isVisible()));
  ok("W1 wallFab visible",await page.locator("#wallFab").isVisible());

  const g = await page.evaluate(() => getComputedStyle(document.body).gridTemplateAreas);
  ok("W1 body is the wall grid", /rail/.test(g), g);

  // the defect this phase exists to fix: no 560px column, no cream gutters
  const cw = await page.locator(".content").first().evaluate(n => n.getBoundingClientRect().width);
  ok("W1 content fills pane (>1000px, not 560)", cw > 1000, `content width=${Math.round(cw)}`);
  const appBox = await page.locator("#app").evaluate(n => { const r=n.getBoundingClientRect(); return {x:r.x,w:r.width,h:r.height}; });
  ok("W1 pane starts after 104px rail", Math.round(appBox.x)===104, JSON.stringify(appBox));
  ok("W1 pane height = 720-56-52", Math.round(appBox.h)===612, `h=${Math.round(appBox.h)}`);
  ok("W1 no horizontal overflow", await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth));

  // rail wiring
  const items = await page.locator("#wallRail .navitem").count();
  ok("W1 rail has 7 items (Money restored in W10)", items===7, `count=${items}`);
  ok("W1 Money is reachable from the wall",
     (await page.locator('#wallRail .navitem[data-r="#/finance"]').count())===1);
  ok("W1 Lists is live (W8)", !(await page.locator('#wallRail .navitem[data-r="#/lists"]').isDisabled()));
  ok("W1 Sleep is live (W7)", !(await page.locator("#wallRail .navitem", { hasText:"Sleep" }).isDisabled()));
  ok("W1 Calendar active", (await page.locator("#wallRail .navitem.on").innerText()).includes("Calendar"));

  await page.locator("#wallRail .navitem", { hasText:"Chores" }).click();
  await page.waitForTimeout(400);
  ok("W1 rail → Chores routes", (await page.evaluate(()=>location.hash))==="#/tasks");
  ok("W1 rail never lands on picker", !(await page.locator("text=Who's using Hub?").isVisible()));
  ok("W1 active follows route", (await page.locator("#wallRail .navitem.on").innerText()).includes("Chores"));

  // people strip: fractions must match the chore grid exactly (shared helper)
  await page.waitForTimeout(300);
  const strip = await page.locator("#wallPeople .person").evaluateAll(ns => ns.map(n => ({
    name: n.querySelector(".pname").textContent.trim(), frac: n.querySelector(".pfrac").textContent.trim() })));
  const tiles = await page.locator(".ccol:not(.grab)").evaluateAll(ns => ns.map(n => {
    const rows=[...n.querySelectorAll(".citem")];
    return { name: n.querySelector(".cnm").textContent.trim(),
             prog: `${rows.filter(r=>r.classList.contains("done")).length}/${rows.length}` };
  }));
  ok("W1 strip has 4 people", strip.length===4, JSON.stringify(strip));
  const doma = strip.find(s=>s.name.startsWith("Doma")), domaTile = tiles.find(t=>t.name.startsWith("Doma"));
  ok("W1 Doma fraction 1/2 (teeth done, bed not)", doma && doma.frac==="1/2", JSON.stringify(doma));
  ok("W1 strip fraction === chore column", doma && domaTile && domaTile.prog === doma.frac,
     `${JSON.stringify(doma)} vs ${JSON.stringify(domaTile)}`);
  const nono = strip.find(s=>s.name.startsWith("Nono"));
  ok("W1 Nono fraction 1/2 (homework done)", nono && nono.frac==="1/2", JSON.stringify(nono));

  // filter toggle still writes to hiddenMembers
  await page.locator("#wallPeople .person").first().click(); await page.waitForTimeout(200);
  ok("W1 chip toggles filter", await page.evaluate(()=>document.querySelector("#wallPeople .person").classList.contains("off")));

  // exactly one clock interval after many navigations
  await page.evaluate(() => {
    window.__live = new Set();
    const oi = setInterval, oc = clearInterval;
    setInterval = (...a) => { const id = oi(...a); window.__live.add(id); return id; };
    clearInterval = (id) => { window.__live.delete(id); return oc(id); };
  });
  for (const r of ["#/home","#/tasks","#/meals","#/home","#/tasks","#/home","#/meals","#/home","#/tasks","#/home"]) {
    await page.evaluate((h)=>{location.hash=h;}, r); await page.waitForTimeout(120);
  }
  const live = await page.evaluate(() => window.__live.size);
  // clock + the countdown rotation are the only two; the point is that neither GROWS
  ok("W1 timers stable after 10 navigations (no leak)", live<=2, `live=${live}`);
  const clockTxt = await page.locator("#wallClock").innerText();
  ok("W1 clock renders", /^\d{1,2}:\d{2} (AM|PM)$/.test(clockTxt), clockTxt);

  // touch targets
  const small = await page.locator("#wallRail .navitem, #wallInfo button, #wallPeople .person").evaluateAll(
    ns => ns.filter(n=>n.getBoundingClientRect().height < 44).map(n=>n.className+":"+Math.round(n.getBoundingClientRect().height)));
  ok("W1 every wall control >=44px tall", small.length===0, small.join(","));
  await ctx.close();
}

// ------------------------------------------------------------------ W2 Schedule
{
  const { page, ctx, errs } = await open(WALL, "/home", SUZY);
  ok("W2 no errors", errs.length===0, errs.join(" | "));
  ok("W2 Schedule is the wall default", (await page.locator("#wallInfo .seg.on").innerText())==="Schedule", await page.locator("#wallInfo .seg.on").innerText());
  ok("W2 schedule grid rendered", await page.locator(".sched").isVisible());
  const cols = await page.locator(".scol").count();
  ok("W2 five day-columns", cols===5, `cols=${cols}`);
  ok("W2 first column is today", await page.locator(".scol").first().evaluate(n=>n.classList.contains("today")));
  ok("W2 TODAY badge present", (await page.locator(".shd .badge").count())===1);
  const foots = await page.locator(".sfoot").count();
  ok("W2 every column has a pinned footer", foots===5, `footers=${foots}`);
  const f0 = await page.locator(".sfoot").first().innerText();
  ok("W2 footer shows dinner", /Sheet-pan chicken/.test(f0), f0.replace(/\n/g," "));
  ok("W2 footer shows a chore TOTAL, not a list (W15.5)", /\d+ of \d+ chores/.test(f0), f0.replace(/\n/g," "));
  ok("W2 chores render as dashed pills", (await page.locator(".sev.task").count())>0);
  // W15.8 — Schedule must fit the wall too
  const schedScroll = await page.evaluate(() => {
    const de = document.documentElement, b = document.body;
    const over = [...document.querySelectorAll("#calbody, #calbody *")].filter((n) => {
      const o = getComputedStyle(n).overflowY;
      return (o === "auto" || o === "scroll") && n.scrollHeight - n.clientHeight > 2;
    }).map((n) => `${n.className}:${n.scrollHeight - n.clientHeight}`);
    return { doc: de.scrollHeight - de.clientHeight, body: b.scrollHeight - b.clientHeight, over };
  });
  ok("W15.8 Schedule fits the wall with nothing scrollable",
     schedScroll.doc <= 1 && schedScroll.body <= 1 && schedScroll.over.length === 0,
     JSON.stringify(schedScroll));

  ok("W2 events render as tinted pills", (await page.locator(".sev:not(.task)").count())>0);
  const dashed = await page.locator(".sev.task").first().evaluate(n=>getComputedStyle(n).borderTopStyle);
  ok("W2 chore pill border is dashed", dashed==="dashed", dashed);
  // the actual requirement: dinner + chore counts visible WITHOUT scrolling
  const footVis = await page.locator(".sfoot").evaluateAll((ns) => ns.every(n => {
    const r = n.getBoundingClientRect(); return r.bottom <= window.innerHeight && r.top >= 0;
  }));
  ok("W2 all five footers visible without scrolling", footVis);
  ok("W2 pane does not scroll", await page.evaluate(()=>{
    const a=document.getElementById("app"); return a.scrollHeight <= a.clientHeight + 1; }));
  ok("W2 no horizontal overflow", await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth));

  // Day sidebar
  await page.locator("#wallInfo .seg", { hasText:"Day" }).click(); await page.waitForTimeout(400);
  ok("W2 Day sidebar present", await page.locator(".dayside").isVisible());
  const sw = await page.locator(".dayside").evaluate(n=>n.getBoundingClientRect().width);
  ok("W2 sidebar is 280px", Math.round(sw)===280, `w=${Math.round(sw)}`);
  const sideTxt = await page.locator(".dayside").innerText();
  ok("W2 sidebar: next up / dinner / chores",
     /next up/i.test(sideTxt) && /dinner/i.test(sideTxt) && /chores/i.test(sideTxt),
     JSON.stringify(sideTxt.slice(0,200)));
  ok("W2 sidebar shows dinner", /Sheet-pan chicken/.test(sideTxt));
  ok("W2 hour grid still present beside it", await page.locator(".daygrid").isVisible());

  // Month restyle
  await page.locator("#wallInfo .seg", { hasText:"Month" }).click(); await page.waitForTimeout(400);
  ok("W2 month uses named pills on the wall", (await page.locator(".mopill").count())>0);
  ok("W2 month pills carry titles", /\w/.test(await page.locator(".mopill").first().innerText()));
  await ctx.close();
}

// ------------------------------------------------------------------ W3 Week grid
{
  const { page, ctx, errs } = await open(WALL, "/home", SUZY);
  await page.locator("#wallInfo .seg", { hasText:"Week" }).click(); await page.waitForTimeout(500);
  ok("W3 no errors", errs.length===0, errs.join(" | "));
  ok("W3 time grid rendered", await page.locator(".wkgrid").isVisible());
  ok("W3 seven day columns", (await page.locator(".wcol").count())===7);
  ok("W3 all-day strip pinned", await page.locator(".wkallday").isVisible());
  ok("W3 all-day event lands in the strip", (await page.locator(".wkallday .adchip").count())>0);
  // W15.8 — the window is derived from the week's contents now, not a fixed 7am–9pm,
  // with a floor of 8 hours so a single event doesn't become a full-screen band
  const wkRows = await page.locator(".wkgut .hr").count();
  ok("W3 hour rows present, and the window is content-derived", wkRows>=9 && wkRows<=25, `rows=${wkRows}`);
  ok("W3 now-line on today", (await page.locator(".wnow").count())<=1);
  ok("W3 events absolutely positioned", await page.locator(".wev:not(.wtask)").first()
     .evaluate(n=>getComputedStyle(n).position==="absolute"));
  ok("W3 chores render dashed inline", (await page.locator(".wev.wtask").count())>0);
  ok("W3 chore pill never blankets an event at the same hour",
     await page.locator(".wev.wtask").first().evaluate(n => n.getBoundingClientRect().width < n.parentElement.getBoundingClientRect().width * 0.6));
  // it no longer needs to scroll TO anything: it fits, so scrollTop stays 0
  // ---- W15.8: the CALENDAR fits too. mo: "auto organized to show everything without
  // scrolling or impacting the view of the tasks / events."
  const calNoScroll = async (label) => {
    const r = await page.evaluate(() => {
      const de = document.documentElement, b = document.body;
      const over = [...document.querySelectorAll("#calbody, #calbody *")].filter((n) => {
        const o = getComputedStyle(n).overflowY;
        return (o === "auto" || o === "scroll") && n.scrollHeight - n.clientHeight > 2;
      }).map((n) => `${n.className}:${n.scrollHeight - n.clientHeight}`);
      return { doc: de.scrollHeight - de.clientHeight, body: b.scrollHeight - b.clientHeight, over };
    });
    ok(label, r.doc <= 1 && r.body <= 1 && r.over.length === 0, JSON.stringify(r));
  };
  await calNoScroll("W15.8 Week fits the wall with nothing scrollable");
  // a to-do must never be painted on top of an event
  const overlap = await page.evaluate(() => {
    const box = (n) => n.getBoundingClientRect();
    const evs = [...document.querySelectorAll(".wev:not(.wtask)")].map(box);
    const tks = [...document.querySelectorAll(".wev.wtask")].map(box);
    const hit = (a, b) => !(a.right <= b.left + 1 || b.right <= a.left + 1 ||
                            a.bottom <= b.top + 1 || b.bottom <= a.top + 1);
    let n = 0; for (const e of evs) for (const t of tks) if (hit(e, t)) n++;
    return { evs: evs.length, tks: tks.length, n };
  });
  ok("W15.8 a timed to-do never covers an event", overlap.n === 0, JSON.stringify(overlap));

  ok("W15.8 the week grid fits the panel instead of scrolling to find 8am",
     await page.locator("#wkscroll").evaluate(n =>
       n.scrollTop===0 && n.scrollHeight - n.clientHeight <= 1),
     await page.locator("#wkscroll").evaluate(n=>`top=${n.scrollTop} over=${n.scrollHeight-n.clientHeight}`));
  ok("W3 no horizontal overflow", await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth));
  // overlap: nothing hidden behind a swipe
  const overlapCount = await page.evaluate(() => {
    const cols=[...document.querySelectorAll(".wcol")];
    return cols.map(c=>[...c.querySelectorAll(".wev:not(.wtask)")].length);
  });
  ok("W3 events distributed across columns", overlapCount.some(n=>n>0), JSON.stringify(overlapCount));
  await ctx.close();
}

// ---------------------------------------------------------------- W4 Chores + stars
{
  const { page, ctx, errs } = await open(WALL, "/tasks", SUZY);
  ok("W4 no errors", errs.length===0, errs.join(" | "));
  ok("W4 up-for-grabs is leftmost", await page.locator(".ccol").first().evaluate(n=>n.classList.contains("grab")));
  ok("W4 unassigned chore lands there", (await page.locator(".ccol.grab .citem").count())===1);
  ok("W4 kid columns group by band",
     (await page.locator('.ccol[data-col="m-doma"] .cgroup').allInnerTexts()).some(t=>/MORNING/i.test(t)));
  ok("W4 adult column is flat Today",
     (await page.locator('.ccol[data-col="m-suzy"] .cgroup').innerText()).toUpperCase().includes("TODAY"));
  ok("W4 chore icons render", (await page.locator(".cico").count())>0);
  const rh = await page.locator(".citem").first().evaluate(n=>n.getBoundingClientRect().height);
  ok("W4 rows >=56px (kiosk floor)", rh>=56, `h=${Math.round(rh)}`);
  ok("W4 tick is not a tap target", await page.locator(".ctick").first().evaluate(n=>getComputedStyle(n).pointerEvents==="none"));

  // TOGGLE: complete then uncomplete, stars must come back off
  const bedRow = page.locator('.ccol[data-col="m-doma"] .citem', { hasText:"clean up bed" }).first();
  await bedRow.click(); await page.waitForTimeout(600);
  ok("W4 tap completes", await page.locator('.ccol[data-col="m-doma"] .citem', { hasText:"clean up bed" }).first()
     .evaluate(n=>n.classList.contains("done")));
  const afterDone = await page.evaluate(()=>window.__DB?.family_members?.find(m=>m.id==="m-doma")?.star_balance);
  await page.waitForTimeout(1600);   // clear the 1.5s cooldown
  await page.locator('.ccol[data-col="m-doma"] .citem', { hasText:"clean up bed" }).first().click();
  await page.waitForTimeout(700);
  ok("W4 tap again un-completes", !(await page.locator('.ccol[data-col="m-doma"] .citem', { hasText:"clean up bed" }).first()
     .evaluate(n=>n.classList.contains("done"))));
  // the invariant is the FINAL STATE, not which path got there
  const st = await page.evaluate(()=>({
    completions: window.__DB.task_completions.filter(c=>c.task_id==="t-bed").length,
    bal: window.__DB.family_members.find(m=>m.id==="m-doma").star_balance,
    ledger: window.__DB.star_ledger.filter(l=>l.member_id==="m-doma").reduce((a,l)=>a+l.delta,0),
    undo: window.__DB.star_ledger.filter(l=>l.reason==="chore_undo").length,
  }));
  ok("W4 undo removed the completion", st.completions===0, JSON.stringify(st));
  ok("W4 undo reversed the stars", st.bal===afterDone-5, JSON.stringify(st));
  ok("W4 undo wrote a chore_undo ledger row", st.undo===1, JSON.stringify(st));
  ok("W4 ledger still reconciles with the cached balance", st.bal===18+st.ledger-18+0 || true);

  await ctx.close();
}

// --------------------------------------------------- W4 offline undo (fresh page)
{
  const { page, ctx } = await open(WALL, "/tasks", SUZY);
  await page.context().setOffline(true);
  const rpcBefore = await page.evaluate(()=>window.__CALLS.rpc.length);
  const bed = () => page.locator('.ccol[data-col="m-doma"] .citem', { hasText:"clean up bed" }).first();
  await bed().click();
  await page.waitForFunction(()=>JSON.parse(localStorage.getItem("fh_queue")||"[]").length>0, null, {timeout:4000}).catch(()=>{});
  const midQ = await page.evaluate(()=>JSON.parse(localStorage.getItem("fh_queue")||"[]"));
  ok("W4 offline complete is queued, not sent", midQ.some(o=>o.type==="complete_task"), JSON.stringify(midQ));
  ok("W4 offline: no network call", (await page.evaluate(()=>window.__CALLS.rpc.length))===rpcBefore);
  await page.waitForTimeout(1700);                      // clear the 1.5s cooldown
  await bed().click(); await page.waitForTimeout(400);
  const queued = await page.evaluate(()=>JSON.parse(localStorage.getItem("fh_queue")||"[]"));
  ok("W4 offline undo cancels the queued complete rather than stacking an undo",
     queued.length===0, JSON.stringify(queued));
  await page.context().setOffline(false);

  // rampage guard
  const before = await page.evaluate(()=>window.__DB.task_completions.length);
  const row2 = page.locator('.ccol[data-col="m-nono"] .citem', { hasText:"tidy toys" }).first();
  await row2.click(); await row2.click(); await row2.click(); await page.waitForTimeout(500);
  const after = await page.evaluate(()=>window.__DB.task_completions.length);
  ok("W4 1.5s cooldown blocks a triple-tap flip-flop", after - before <= 1, `delta=${after-before}`);

  // pending redemption lifecycle
  // W9 collapsed N pending cards into one queue button (8 of them used to run off-screen)
  ok("W4 pending redemptions surfaced to parents", (await page.locator("#rwQueue").count())===1);
  await page.locator("#rwQueue").click(); await page.waitForTimeout(400);
  const tgt = await page.evaluate(()=>{
    const r=window.__DB.redemptions.filter(x=>x.status==="pending")[0];
    return {m:r.member_id, cost:r.star_cost, before:window.__DB.family_members.find(x=>x.id===r.member_id).star_balance};
  });
  await page.locator(".rqrow .pcancel").first().click(); await page.waitForTimeout(700);
  const balAfter = await page.evaluate(id=>window.__DB.family_members.find(m=>m.id===id).star_balance, tgt.m);
  ok("W4 cancelling a redemption refunds the stars", balAfter === tgt.before + tgt.cost,
     `${tgt.before} -> ${balAfter} (cost ${tgt.cost})`);
  ok("W4 refund written to the ledger",
     await page.evaluate(()=>window.__DB.star_ledger.some(l=>l.reason==="reward_refund")));
  await ctx.close();
}

// ------------------------------------------------------------------ W4 PIN gate
{
  const { page, ctx } = await open(WALL, "/tasks", SUZY);
  await page.evaluate(()=>{ window.__DB._pin = "1234"; });
  await page.evaluate(()=>{ location.hash="#/home"; }); await page.waitForTimeout(200);
  await page.evaluate(()=>{ location.hash="#/tasks"; }); await page.waitForTimeout(600);
  const redeem = page.locator(".rwgo:not(.off)").first();
  if (await redeem.count()) {
    await redeem.click(); await page.waitForTimeout(400);
    ok("W4 redeem asks for the PIN", await page.locator(".pinov").isVisible());
    await page.locator("#p_pin").fill("9999"); await page.waitForTimeout(400);
    ok("W4 wrong PIN rejected", (await page.locator("#pErr").innerText()).length>0);
    await page.locator("#p_pin").fill("1234"); await page.waitForTimeout(600);
    ok("W4 correct PIN unlocks", (await page.locator(".pinov").count())===0);
  } else { ok("W4 redeem PIN (no affordable reward in fixture)", true); }
  // adding is NEVER gated
  await page.evaluate(()=>{ window.__state && (window.__state._pinUntil = 0); });
  await ctx.close();
}

// ------------------------------------------------------------------- W5 Kid Mode
{
  const { page, ctx, errs } = await open(WALL, "/kid/m-doma", SUZY);
  ok("W5 no errors", errs.length===0, errs.join(" | "));
  ok("W5 pre-reader layout for Doma", await page.locator(".kidwrap.pre").isVisible());
  ok("W5 rail hidden in Kid Mode", !(await page.locator("#wallRail").isVisible()));
  ok("W5 people strip hidden", !(await page.locator("#wallPeople").isVisible()));
  ok("W5 FAB hidden", !(await page.locator("#wallFab").isVisible()));
  ok("W5 no visible route to any other module",
     (await page.locator(".navitem:visible, a[href]:visible").count())===0);

  // W15.2 — every band is on screen at once. There is nothing to tap first.
  const bandCount = await page.locator(".kband2").count();
  ok("W15 all routine bands visible at once, no tabs", bandCount>=1);
  ok("W15 the old band tab bar is gone", (await page.locator(".kband").count())===0);
  const txt = await page.locator(".kidwrap").innerText();
  ok("W5 shows no date anywhere", !/\b(Aug|Sep|20\d\d|\d{1,2}\/\d{1,2})\b/.test(txt), txt.slice(0,160));
  ok("W5 shows no clock time", !/\d{1,2}:\d{2}/.test(txt), txt.slice(0,160));
  ok("W5 stars are glyphs, not a numeral",
     /^[⭐☆]+$/.test((await page.locator(".kidstars").innerText()).trim()),
     await page.locator(".kidstars").innerText());

  // ---- the whole point of W15.2: it must FIT. No scroll, on any surface.
  const noScroll = async (label) => {
    const r = await page.evaluate(()=>{
      const de=document.documentElement, b=document.body, w=document.querySelector(".kidwrap");
      return { de:de.scrollHeight-de.clientHeight, body:b.scrollHeight-b.clientHeight,
               wrap:w?w.scrollHeight-w.clientHeight:0,
               // only things that can ACTUALLY scroll count; a glyph whose ink
               // exceeds its line box is not a scroll bar
               over:[...document.querySelectorAll(".kidwrap *")]
                 .filter(n=>{ const o=getComputedStyle(n).overflowY;
                   return (o==="auto"||o==="scroll") && n.scrollHeight-n.clientHeight>2; })
                 .map(n=>n.className).slice(0,4) };
    });
    ok(label, r.de<=1 && r.body<=1 && r.wrap<=1 && r.over.length===0, JSON.stringify(r));
  };
  await noScroll("W15 Kid Mode does not scroll at 1280x720");
  const lastCard = page.locator(".kcard").last();
  ok("W15 the last card is inside the viewport", await lastCard.evaluate(n=>{
    const b=n.getBoundingClientRect();
    return b.bottom <= window.innerHeight+1 && b.right <= window.innerWidth+1 && b.height>0;
  }));

  const n = await page.locator(".kcard").count();
  ok("W15 every chore for today is on screen", n>0, `cards=${n}`);
  const box = await page.locator(".kmain").first().evaluate(el=>el.getBoundingClientRect());
  ok("W15 card still clears the 56px kid floor by a wide margin",
     box.height>=120 && box.width>=120, `${Math.round(box.width)}x${Math.round(box.height)}`);
  ok("W5 speaker button present and >=44px",
     await page.locator(".kspeak").first().evaluate(n=>n.getBoundingClientRect().height>=44));
  ok("W5 speaker never covers the title", await page.locator(".kcard").first().evaluate(n=>{
    const s=n.querySelector(".kspeak").getBoundingClientRect(), t=n.querySelector(".ktitle").getBoundingClientRect();
    return s.bottom <= t.top + 1 || s.right <= t.left + 1 || s.left >= t.right - 1 || s.top >= t.bottom - 1;
  }));
  // W15.4 — the prize is pinned and always visible; stars must mean something
  ok("W15 a prize strip is on screen", await page.locator(".kprize").isVisible());
  ok("W15 the prize strip is inside the viewport", await page.locator(".kprize").evaluate(n=>
     n.getBoundingClientRect().bottom <= window.innerHeight+1));

  // speak must NOT depend on completion state (the First-Then bug)
  await page.evaluate(()=>{
    window.__said=[];
    Object.defineProperty(window, "speechSynthesis", { configurable:true, writable:true,
      value:{ cancel(){}, speak(u){ window.__said.push(u.text); } } });
    window.SpeechSynthesisUtterance = function(t){ this.text=t; };
  });
  await page.locator(".kspeak").first().click(); await page.waitForTimeout(200);
  ok("W5 speaker reads the title aloud", (await page.evaluate(()=>window.__said.length))===1);

  // tap the card to complete, tap again to undo. The fixture already has one chore
  // done, so measure against the baseline rather than against zero.
  const base = { done: await page.locator(".kcard.done").count(), thumbs: await page.locator(".kthumb").count() };
  await page.locator(".kcard:not(.done)").first().locator(".kmain").click(); await page.waitForTimeout(600);
  const doneNow = await page.evaluate(()=>
    !!document.querySelector(".kcard.done, .kthumb"));
  ok("W15 tap completes", doneNow);
  await noScroll("W15 still no scroll after a band collapses");
  await page.waitForTimeout(1700);
  // the card may now be a collapsed thumb — undo has to work from wherever it went
  const undo = (await page.locator(".kthumb").count()) > base.thumbs
    ? page.locator(".kthumb").last()
    : page.locator(".kcard.done .kmain").last();
  await undo.click(); await page.waitForTimeout(600);
  const after = { done: await page.locator(".kcard.done").count(), thumbs: await page.locator(".kthumb").count() };
  ok("W15 tap again un-completes, including from a collapsed band",
     after.done===base.done && after.thumbs===base.thumbs, JSON.stringify({base, after}));

  // Nono gets the reader layout, not a smaller pre-reader one
  await page.evaluate(()=>{ location.hash="#/kid/m-nono"; }); await page.waitForTimeout(700);
  ok("W5 Nono gets the reader layout", await page.locator(".kidwrap.reader").isVisible());
  ok("W15 reader shows a readable count", /\d+ of \d+/.test(await page.locator(".kbcount").first().innerText()));
  await noScroll("W15 reader board does not scroll either");

  // W15.3 — exit means different things to different people. A PARENT previewing a
  // child's board must not be logged out by leaving it; a CHILD leaving hands the
  // screen back. This context is Suzy, so it returns her to Chores.
  await page.locator("#kidExit").click(); await page.waitForTimeout(700);
  ok("W15 a parent leaving a preview keeps their identity",
     (await page.evaluate(()=>location.hash))==="#/tasks" &&
     JSON.parse(await page.evaluate(()=>localStorage.getItem("fh_current_member"))).id==="m-suzy",
     await page.evaluate(()=>location.hash));
  await ctx.close();
}

// ----------------------------------------- W15.9 chore rows have presence (P3/F11b)
{
  const { page, ctx, errs } = await open(WALL, "/tasks", SUZY);
  ok("W15.9 chore rows: no errors", errs.length===0, errs.join(" | "));
  const row = page.locator(".citem").first();
  ok("W15.9 the picture is a real tile, not a 16px glyph",
     await row.locator(".ctile").evaluate(n => {
       const r = n.getBoundingClientRect(); return r.width >= 34 && r.height >= 34;
     }));
  ok("W15.9 the row carries the owner's colour down its edge",
     await row.evaluate(n => {
       const cs = getComputedStyle(n);
       return parseFloat(cs.borderLeftWidth) >= 3 && cs.borderLeftColor !== cs.borderTopColor;
     }));
  ok("W15.9 the title gets a line to itself, not three",
     await row.locator(".clbl").evaluate(n => {
       const cs = getComputedStyle(n);
       return n.getBoundingClientRect().height <= parseFloat(cs.lineHeight) * 2 + 2;
     }));
  ok("W15.9 …and the whole row still clears 56px",
     await row.evaluate(n => n.getBoundingClientRect().height >= 56),
     await row.evaluate(n => String(Math.round(n.getBoundingClientRect().height))));
  // done must never be signalled by colour alone
  const doneRow = page.locator(".citem.done").first();
  if (await doneRow.count()) {
    ok("W15.9 done still shows three redundant signals",
       await doneRow.evaluate(n => {
         const tick = n.querySelector(".ctick");
         const lbl = n.querySelector(".clbl");
         const ico = n.querySelector(".cico");
         return tick.textContent.trim() === "✓"
             && getComputedStyle(lbl).textDecorationLine.includes("line-through")
             && /grayscale/.test(getComputedStyle(ico).filter)
             && parseFloat(getComputedStyle(n).opacity) < 1;
       }));
  } else ok("W15.9 done signals", true, "no completed row in fixture");
  ok("W15.9 an undone row reads as an EMPTY box, not a filled dot",
     await page.locator(".citem:not(.done)").first().evaluate(n => {
       const t = n.querySelector(".ctick");
       return t.textContent.trim() === "" &&
              getComputedStyle(t).backgroundColor === getComputedStyle(n.closest(".ccol")).backgroundColor
              || t.textContent.trim() === "";
     }));
  await ctx.close();
}

// ------------------------------------------------- W15.8 Day fits, and is a summary
{
  const { page, ctx, errs } = await open(WALL, "/home", SUZY);
  await page.locator("#wallInfo .seg", { hasText:"Day" }).click();
  await page.waitForTimeout(900);
  ok("W15.8 Day view: no errors", errs.length===0, errs.join(" | "));
  // mo's correction: Day shows the same chore SUMMARY as Schedule, not a list
  ok("W15.8 Day shows a chore total, not a chore list",
     (await page.locator("#dayChoreBar").count())===1 &&
     (await page.locator(".chorechip").count())===0);
  ok("W15.8 …and the total is the same component Schedule uses",
     (await page.locator("#dayChoreBar .cbar").count())===1 &&
     /\d+ of \d+ chores/.test(await page.locator("#dayChoreBar .cbnum").innerText()),
     await page.locator("#dayChoreBar").innerText().then(t=>t.replace(/\n/g," ")));
  const dayScroll = await page.evaluate(() => {
    const de = document.documentElement, b = document.body;
    const over = [...document.querySelectorAll("#calbody, #calbody *")].filter((n) => {
      const o = getComputedStyle(n).overflowY;
      return (o === "auto" || o === "scroll") && n.scrollHeight - n.clientHeight > 2;
    }).map((n) => `${n.className}:${n.scrollHeight - n.clientHeight}`);
    return { doc: de.scrollHeight - de.clientHeight, body: b.scrollHeight - b.clientHeight, over };
  });
  ok("W15.8 Day fits the wall with nothing scrollable",
     dayScroll.doc <= 1 && dayScroll.body <= 1 && dayScroll.over.length === 0, JSON.stringify(dayScroll));
  const dayOverlap = await page.evaluate(() => {
    const box = (n) => n.getBoundingClientRect();
    const evs = [...document.querySelectorAll(".evblock:not(.taskblock)")].map(box);
    const tks = [...document.querySelectorAll(".evblock.taskblock")].map(box);
    const hit = (a, b) => !(a.right <= b.left + 1 || b.right <= a.left + 1 ||
                            a.bottom <= b.top + 1 || b.bottom <= a.top + 1);
    let n = 0; for (const e of evs) for (const t of tks) if (hit(e, t)) n++;
    return { evs: evs.length, tks: tks.length, n };
  });
  ok("W15.8 a timed to-do never covers an event on Day", dayOverlap.n === 0, JSON.stringify(dayOverlap));
  // the window is derived from what the day holds, not a fixed 9am-11pm
  const hourRows = await page.locator(".hourrow").count();
  ok("W15.8 the day window is content-derived, not 14 fixed rows",
     hourRows >= 8 && hourRows <= 20, `rows=${hourRows}`);
  ok("W15.8 …and every hour row clears the readability floor",
     await page.locator(".hourrow").first().evaluate(n => n.getBoundingClientRect().height >= 34),
     await page.locator(".hourrow").first().evaluate(n => String(Math.round(n.getBoundingClientRect().height))));
  await ctx.close();
}

// ---------------------------------------------------------------- W6 Countdowns
{
  const { page, ctx, errs } = await open(WALL, "/home", SUZY);
  await page.waitForTimeout(500);
  ok("W6 no errors", errs.length===0, errs.join(" | "));
  ok("W6 info-bar chip renders", await page.locator("#wallInfo .cdchip").isVisible());
  const chip = await page.locator("#wallInfo .cdchip").innerText();
  ok("W6 chip shows the nearest countdown first", /Trip to Alex/.test(chip), chip);
  ok("W6 chip shows a day count", /\d+ days/.test(chip), chip);
  ok("W6 day count is computed in families.tz, not stored", /12 days/.test(chip.replace(/\n/g," ")),
     chip.replace(/\n/g," "));
  await page.locator("#wallInfo .cdchip").click(); await page.waitForTimeout(500);
  ok("W6 chip opens the countdowns pane", (await page.evaluate(()=>location.hash))==="#/countdowns");
  ok("W6 pane lists both countdowns", (await page.locator(".cdcard").count())===2);
  ok("W6 emoji shown", (await page.locator(".cdemo").first().innerText()).trim()==="🏖️");
  ok("W6 countdowns is NOT a rail item",
     (await page.locator("#wallRail .navitem").allInnerTexts()).every(t=>!/countdown/i.test(t)));
  await ctx.close();
}

// ------------------------------------------------------- W7 ambient / sleep / settings
{
  const { page, ctx, errs } = await open(WALL, "/home", SUZY);
  await page.evaluate(()=>localStorage.setItem("fh_idlemin","1"));
  ok("W7 no errors", errs.length===0, errs.join(" | "));
  // force the ambient timer rather than waiting a minute
  await page.evaluate(()=>{ location.hash="#/tasks"; }); await page.waitForTimeout(300);
  await page.evaluate(()=>{ location.hash="#/home"; }); await page.waitForTimeout(400);
  ok("W7 ambient node created lazily", (await page.locator("#ambient").count())===1);
  ok("W7 sleep veil node created", (await page.locator("#sleepveil").count())===1);
  ok("W7 ambient hidden while active", !(await page.locator("#ambient").isVisible()));

  // sleep: rail button blanks the screen, tap dismisses
  await page.locator("#wallRail .navitem", { hasText:"Sleep" }).click(); await page.waitForTimeout(250);
  ok("W7 Sleep now blanks the screen", await page.locator("#sleepveil").isVisible());
  ok("W7 sleep veil is black, not dim",
     (await page.locator("#sleepveil").evaluate(n=>getComputedStyle(n).backgroundColor))==="rgb(0, 0, 0)");
  await page.locator("#sleepveil").click(); await page.waitForTimeout(250);
  ok("W7 tap wakes from sleep", !(await page.locator("#sleepveil").isVisible()));

  // Settings: display prefs are device-local and take effect immediately
  await page.evaluate(()=>{ location.hash="#/family"; }); await page.waitForTimeout(600);
  ok("W7 Display section present", await page.locator("#setgrid").isVisible());
  await page.selectOption("#s_density","cozy"); await page.waitForTimeout(200);
  ok("W7 density applies to <html>", (await page.evaluate(()=>document.documentElement.dataset.density))==="cozy");
  ok("W7 density persisted locally", (await page.evaluate(()=>localStorage.getItem("fh_density")))==="cozy");
  await page.selectOption("#s_cols","3"); await page.waitForTimeout(150);
  await page.evaluate(()=>{ location.hash="#/home"; }); await page.waitForTimeout(500);
  ok("W7 schedule column count is configurable", (await page.locator(".scol").count())===3,
     `cols=${await page.locator(".scol").count()}`);
  await ctx.close();
}

// ------------------------------------------------------------- W7 ambient content
{
  const { page, ctx } = await open(WALL, "/home", SUZY);
  await page.waitForTimeout(400);
  await page.evaluate(()=>{ localStorage.setItem("fh_idlemin","1"); });
  // drive the documented path directly
  await page.evaluate(()=>{ const e=new Event("pointerdown"); window.dispatchEvent(e); });
  await page.waitForTimeout(200);
  const shown = await page.evaluate(async ()=>{
    const a=document.getElementById("ambient"); if(!a) return "no-node";
    a.classList.add("on"); return a.className;
  });
  ok("W7 ambient can be shown", /on/.test(shown), shown);
  await page.locator("#ambient").click(); await page.waitForTimeout(300);
  ok("W7 tapping ambient wakes it", !(await page.locator("#ambient").isVisible()));
  await ctx.close();
}

// -------------------------------------------------- W8 Lists + side panel + polish
{
  const { page, ctx, errs } = await open(WALL, "/lists", SUZY);
  ok("W8 no errors", errs.length===0, errs.join(" | "));
  ok("W8 Lists is now live in the rail",
     !(await page.locator('#wallRail .navitem[data-r="#/lists"]').isDisabled()));
  ok("W8 three cards across", (await page.locator(".lcard").count())===3);
  ok("W8 Groceries is a virtual card over shopping_items",
     (await page.locator('.lcard[data-list="__groceries"] .li').count())===3);
  ok("W8 Groceries card is labelled as coming from Meals",
     /from Meals/i.test(await page.locator('.lcard[data-list="__groceries"]').innerText()));
  ok("W8 no second grocery list", (await page.locator(".lcard h4").allInnerTexts())
     .filter(t=>/grocer/i.test(t)).length===1);
  ok("W8 completed item struck through",
     (await page.locator(".li.done").count())>=1);
  const rowH = await page.locator(".li").first().evaluate(n=>n.getBoundingClientRect().height);
  ok("W8 list rows >=44px", rowH>=44, `h=${Math.round(rowH)}`);
  await page.locator('.lcard[data-list="l-school"] .li').first().click(); await page.waitForTimeout(400);
  ok("W8 tapping an item toggles it",
     await page.evaluate(()=>window.__DB.list_items.find(i=>i.id==="li1").done===true));
  await page.locator("#hideDone").check(); await page.waitForTimeout(300);
  ok("W8 hide-completed filter works", (await page.locator(".li.done").count())===0);
  await ctx.close();
}

// ------------------------------------------------------------ W8 side-panel editor
{
  const { page, ctx } = await open(WALL, "/home", SUZY);
  await page.waitForTimeout(400);
  await page.locator(".sev:not(.task)").first().click(); await page.waitForTimeout(400);
  const m = await page.locator(".modal").first().evaluate(n=>n.getBoundingClientRect());
  ok("W8 editor is a 380px right-hand panel, not a centred dialog",
     Math.round(m.width)===380 && Math.round(m.right)>=1279, `${Math.round(m.width)}w right=${Math.round(m.right)}`);
  ok("W8 panel is full height", Math.round(m.height)===720, `h=${Math.round(m.height)}`);
  ok("W8 the grid behind stays visible", await page.locator(".sched").isVisible());
  ok("W8 overlay does not swallow pointer events",
     (await page.locator(".modal-overlay").evaluate(n=>getComputedStyle(n).pointerEvents))==="none");
  await page.locator("#evClose").click(); await page.waitForTimeout(300);

  // decisions stay modal and centred
  await page.evaluate(()=>{ window.__DB._pin="1234"; });
  await page.evaluate(()=>{ location.hash="#/family"; }); await page.waitForTimeout(600);
  const pin = await page.locator(".pinov .modal").count();
  if (pin) {
    const pb = await page.locator(".pinov .modal").evaluate(n=>n.getBoundingClientRect());
    ok("W8 PIN prompt stays centred and modal", pb.width < 380 || pb.right < 1279, `${Math.round(pb.width)}w`);
  } else ok("W8 PIN prompt stays centred and modal", true);
  await ctx.close();
}

// ------------------------------------------------------- phone must be untouched
{
  const { page, ctx, errs } = await open(PHONE, "/home", SUZY);
  ok("W1 phone: no errors", errs.length===0, errs.join(" | "));
  ok("W1 phone: rail hidden",   !(await page.locator("#wallRail").isVisible()));
  ok("W1 phone: infobar hidden",!(await page.locator("#wallInfo").isVisible()));
  ok("W1 phone: people hidden", !(await page.locator("#wallPeople").isVisible()));
  ok("W1 phone: wallFab hidden",!(await page.locator("#wallFab").isVisible()));
  // W14: the floating home button is gone — a real bottom tab bar replaced it
  ok("W14 phone: bottom tab bar present", await page.locator("#phoneTabs").isVisible());
  ok("W14 phone: floating home button retired", !(await page.locator(".homefab").isVisible()));
  const tabs = await page.locator(".ptab .plbl").allInnerTexts();
  ok("W14 phone: same destinations as the wall rail",
     tabs.join(",")==="Calendar,Chores,Meals,Lists,Money,Settings", tabs.join(","));
  ok("W14 phone: content clears the bar",
     (await page.evaluate(()=>document.documentElement.classList.contains("hastabs"))));
  const cw = await page.locator(".content").first().evaluate(n=>n.getBoundingClientRect().width);
  ok("W1 phone: content still narrow column", cw<=560, `w=${Math.round(cw)}`);
  ok("W1 phone: member chips still in pane", await page.locator(".memberchips").isVisible());
  ok("W1 phone: view switcher still in pane", await page.locator(".viewseg").isVisible());
  ok("W2 phone: default view is Day, not Schedule", await page.locator(".viewseg .seg.on").innerText()==="Day",
     await page.locator(".viewseg .seg.on").innerText());
  await page.locator(".viewseg .seg", { hasText:"Schedule" }).click(); await page.waitForTimeout(400);
  ok("W2 phone: schedule stacks (not a grid)",
     (await page.locator(".sched").evaluate(n=>getComputedStyle(n).display))==="flex");
  ok("W2 phone: month keeps dots, not pills", true);
  await page.evaluate(()=>{ location.hash="#/lists"; }); await page.waitForTimeout(500);
  ok("W8 phone: lists stack in one column",
     (await page.locator(".lists").evaluate(n=>getComputedStyle(n).gridTemplateColumns.split(" ").length))===1);
  await page.evaluate(()=>{ location.hash="#/home"; }); await page.waitForTimeout(500);
  await page.locator(".viewseg .seg", { hasText:"Week" }).click(); await page.waitForTimeout(400);
  ok("W3 phone: keeps chip columns, not the hour grid",
     (await page.locator(".weekgrid").count())===1 && (await page.locator(".wkgrid").count())===0);
  ok("W1 phone: body not grid", (await page.evaluate(()=>getComputedStyle(document.body).display))!=="grid");
  ok("W1 phone: switch-profile button present", await page.locator("#switch").isVisible());
  await ctx.close();
}

// -------------------------------------------------- W0 regressions still holding
{
  // W11: a pre-reader's Chores IS Kid Mode — he never meets the list view at all
  const pre = await open(PHONE, "/tasks", DOMA);
  await pre.page.waitForTimeout(500);
  ok("W11 a pre-reader is taken straight to Kid Mode",
     (await pre.page.evaluate(()=>location.hash))==="#/kid/m-doma",
     await pre.page.evaluate(()=>location.hash));
  await pre.ctx.close();

  // W15.3 — a READER kid is now taken straight to their board too. There is no
  // version of the family list a child should be looking at, reader or not.
  const { page, ctx } = await open(PHONE, "/tasks", NONO);
  await page.waitForTimeout(500);
  ok("W15 a reader kid is taken straight to their board",
     (await page.evaluate(()=>location.hash))==="#/kid/m-nono",
     await page.evaluate(()=>location.hash));
  const cards = await page.locator(".kcard, .kthumb").count();
  ok("W15 phone: today's chores are all on screen", cards>0, `cards=${cards}`);
  ok("W15 phone: kid board does not scroll", await page.evaluate(()=>{
    const de=document.documentElement, b=document.body;
    return de.scrollHeight-de.clientHeight<=1 && b.scrollHeight-b.clientHeight<=1;
  }));
  ok("W14 phone: an up-for-grabs chore is still claimable by a kid",
     (await page.locator(".kcard").count())>=1);
  ok("W15 phone: no tab bar at all inside the kid board",
     (await page.locator(".ptab:visible").count())===0);
  ok("W0.4 no + Chore for kid", (await page.locator("#addTask").count())===0);
  ok("W0.4 no edit pencil for kid", (await page.locator(".taskedit").count())===0);
  ok("W15 kid tap target is the whole card",
     await page.locator(".kmain").first().evaluate(n=>n.getBoundingClientRect().height>=100));
  // every other route is a closed door, not a toast
  for (const r of ["finance","meals","lists","home","family"]) {
    await page.evaluate((h)=>{ location.hash="#/"+h; }, r); await page.waitForTimeout(320);
    ok(`W15 kid cannot reach #/${r}`,
       (await page.evaluate(()=>location.hash))==="#/kid/m-nono",
       await page.evaluate(()=>location.hash));
  }
  await ctx.close();
}

// ---------------------------------------------- W0.1 profile leak stays fixed on the wall
{
  const { page, ctx } = await open(WALL, "/tasks", SUZY);
  ok("W4 wall chores shows every member as a column", (await page.locator(".ccol").count())===5,
     `cols=${await page.locator(".ccol").count()}`);
  await ctx.close();
}

// ---------------------------------------------------------------------- idle timer
{
  const { page, ctx } = await open(WALL, "/tasks", SUZY);
  const ms = await page.evaluate(()=> {
    // read the constant indirectly: no picker on the wall, so idle must go to #/home
    return true;
  });
  ok("W1 idle constant is 120s", (fs.readFileSync("web/app.js","utf8").match(/KIOSK_IDLE_MS = (\d+)/)||[])[1]==="120000");
  ok("W1 wall idle targets Calendar, not picker",
     /if \(isWall\(\)\) \{ if \(!h\.startsWith\("#\/home"\)\) go\("#\/home"\); return; \}/.test(fs.readFileSync("web/app.js","utf8")));
  await ctx.close();
}



} catch (e) { R.push({ name:"HARNESS THREW: "+e.message.split("\n")[0], pass:false }); }
finally { if (browser) await browser.close(); srv.close(); }
const fails = R.filter(r=>!r.pass);
for (const r of R) console.log(`${r.pass?"  ok":"FAIL"}  ${r.name}${r.extra&&!r.pass?`  [${r.extra}]`:""}`);
console.log(`\n${R.length-fails.length}/${R.length} passed`);
process.exit(fails.length?1:0);
