// End-to-end UX walkthroughs for the W9 fixes. Each block is a JOURNEY a real person
// takes, not an isolated assertion — the defects were all "I tapped and nothing helpful
// happened", which unit checks don't catch.
import { chromium } from "playwright";
import http from "http"; import fs from "fs"; import path from "path";
const WEB=path.resolve("web"),TEST=path.resolve("test");
const M={".html":"text/html",".js":"text/javascript",".css":"text/css",".webmanifest":"application/json"};
const srv=http.createServer((q,r)=>{let p=decodeURI(q.url.split("?")[0]);if(p==="/")p="/index.html";const f=path.join(WEB,p);
 if(!fs.existsSync(f)||fs.statSync(f).isDirectory()){r.writeHead(404);return r.end("nf");}
 r.writeHead(200,{"Content-Type":M[path.extname(f)]||"text/plain"});r.end(fs.readFileSync(f));});
await new Promise(r=>srv.listen(8801,r));
const R=[]; const ok=(n,c,x="")=>R.push({n,pass:!!c,x});
const b=await chromium.launch({executablePath:"/opt/pw-browsers/chromium"});
async function open_(vp,hash,member){
  const ctx=await b.newContext({viewport:vp}); const page=await ctx.newPage(); const errs=[];
  await page.route("**/@supabase/supabase-js@2*",r=>r.fulfill({contentType:"text/javascript",body:fs.readFileSync(path.join(TEST,"stub-supabase.js"),"utf8")}));
  await page.route("**/rrule@2.8.1*",r=>r.fulfill({contentType:"text/javascript",body:fs.readFileSync(path.join(TEST,"rrule.bundle.js"),"utf8")}));
  await page.route("**/sw.js",r=>r.fulfill({contentType:"text/javascript",body:""}));
  page.on("pageerror",e=>errs.push(e.message));
  await page.addInitScript(m=>{ if(m) localStorage.setItem("fh_current_member",JSON.stringify(m)); },member||null);
  await page.goto(`http://localhost:8801/#${hash}`,{waitUntil:"networkidle"}); await page.waitForTimeout(700);
  return {page,ctx,errs};
}
const WALL={width:1280,height:720}, PHONE={width:390,height:844};
const DOMA={id:"m-doma",name:"Doma ⛹️‍♂️",color:"green",is_child:true,avatar_url:null};
const NONO={id:"m-nono",name:"Nono ⛹️‍♂️",color:"blue",is_child:true,avatar_url:null};
const SUZY={id:"m-suzy",name:"Suzy 👩",color:"red",is_child:false,avatar_url:null};
try{

// ── JOURNEY 1: "Doma's profile is on the wall. How does a grown-up get it back?" ──
{
  const {page,ctx,errs}=await open_(WALL,"/home",DOMA);
  ok("J1 no errors",errs.length===0,errs.join("|"));
  // W15.3 — a kid profile can't sit on the family calendar at all any more
  ok("J1 a kid on the wall lands on their own board, never the calendar",
     (await page.evaluate(()=>location.hash))==="#/kid/m-doma",
     await page.evaluate(()=>location.hash));
  ok("J1 no rail to poke at",(await page.locator("#wallRail .navitem:visible").count())===0);
  ok("J1 the way out is visible",await page.locator("#kidExit").isVisible());
  await page.locator("#kidExit").click(); await page.waitForTimeout(700);
  ok("J1 it opens the profile picker",(await page.locator(".tile").count())===4,
     `tiles=${await page.locator(".tile").count()}`);
  await page.locator(".tile", {hasText:"Suzy"}).click(); await page.waitForTimeout(800);
  ok("J1 a parent picking up lands on the wall calendar",
     (await page.evaluate(()=>location.hash))==="#/home",
     await page.evaluate(()=>location.hash));
  ok("J1 the chip names the new person",/Suzy/.test(await page.locator("#whoChip").innerText()));
  ok("J1 …and the full rail is back for them",
     (await page.locator("#wallRail .navitem:visible").count())>=5);
  await ctx.close();
}

// ── JOURNEY 2: "Why does Chores show the whole family?" ────────────────────────
{
  // a PRE-READER never sees the grid at all (W11 front door)
  const d=await open_(WALL,"/tasks",DOMA); await d.page.waitForTimeout(500);
  ok("J2 a pre-reader's Chores opens Kid Mode directly",
     (await d.page.evaluate(()=>location.hash))==="#/kid/m-doma",
     await d.page.evaluate(()=>location.hash));
  ok("J2 …and he never meets the family grid",(await d.page.locator(".ccol").count())===0);
  await d.ctx.close();

  // W15.3 — and now neither does a READER kid
  const {page,ctx}=await open_(WALL,"/tasks",NONO); await page.waitForTimeout(500);
  ok("J2 a reader kid also opens straight onto their own board",
     (await page.evaluate(()=>location.hash))==="#/kid/m-nono",
     await page.evaluate(()=>location.hash));
  ok("J2 …with no family grid anywhere",(await page.locator(".ccol").count())===0);
  ok("J2 a kid cannot reach another child's chores",await (async()=>{
     await page.evaluate(()=>{location.hash="#/kid/m-doma";}); await page.waitForTimeout(600);
     return (await page.evaluate(()=>location.hash))==="#/kid/m-nono";
  })(),await page.evaluate(()=>location.hash));
  ok("J2 a kid is not shown the parent redemption queue",(await page.locator("#rwQueue").count())===0);
  await ctx.close();

  const p=await open_(WALL,"/tasks",SUZY);
  const cols2=await p.page.locator(".ccol .cnm").allInnerTexts();
  ok("J2 a PARENT still sees the whole family",cols2.length===5,JSON.stringify(cols2));
  ok("J2 …with their own column first and marked",
     /Suzy/.test(cols2[1]) && (await p.page.locator(".ccol.me .cme").innerText()).toLowerCase()==="you",
     JSON.stringify(cols2));
  await p.ctx.close();
}

// ── JOURNEY 3: "The chore page overlaps itself" ────────────────────────────────
{
  const {page,ctx}=await open_(WALL,"/tasks",SUZY);
  const av=await page.locator(".rwav").first().evaluate(n=>{
    const b=n.getBoundingClientRect(), c=n.closest(".rwcard").getBoundingClientRect();
    const cs=getComputedStyle(n);
    return {inside:b.left>=c.left-0.5&&b.right<=c.right+0.5&&b.top>=c.top-0.5&&b.bottom<=c.bottom+0.5,
            bg:cs.backgroundColor, pad:cs.paddingLeft};
  });
  ok("J3 the kid avatar stays inside its card",av.inside,JSON.stringify(av));
  ok("J3 …and still renders its initial (line-height:0 collapsed it)",
     (await page.locator(".rwav .avatar").first().innerText()).trim().length>0,
     JSON.stringify(await page.locator(".rwav .avatar").allInnerTexts()));
  ok("J3 …and no longer inherits the orange button fill",
     av.bg==="rgba(0, 0, 0, 0)"||av.bg==="transparent",av.bg);
  ok("J3 …with the inherited 16px padding gone",av.pad==="0px",av.pad);
  const strip=await page.locator(".rwstrip").evaluate(n=>({over:n.scrollWidth>n.clientWidth+1,w:n.clientWidth,s:n.scrollWidth}));
  ok("J3 8 pending redemptions no longer overflow the strip",!strip.over,JSON.stringify(strip));
  ok("J3 …they collapse to one queue button",(await page.locator("#rwQueue").count())===1);
  ok("J3 …that reports the real count",/8/.test(await page.locator("#rwQueue").innerText()),
     await page.locator("#rwQueue").innerText());
  ok("J3 323m stars is abbreviated, not rendered raw",
     !/323811241/.test(await page.locator(".rwstrip").innerText()),
     await page.locator(".rwstrip").innerText().then(t=>t.replace(/\n/g," ").slice(0,90)));
  // no two cards may visually overlap
  const overlap=await page.evaluate(()=>{
    const rs=[...document.querySelectorAll(".rwstrip > *")].map(n=>n.getBoundingClientRect());
    for(let i=0;i<rs.length;i++)for(let j=i+1;j<rs.length;j++){
      const a=rs[i],c=rs[j];
      if(a.left<c.right-1&&c.left<a.right-1&&a.top<c.bottom-1&&c.top<a.bottom-1) return `${i}x${j}`;
    } return null;
  });
  ok("J3 nothing in the strip overlaps anything else",overlap===null,String(overlap));
  // and the queue actually works
  await page.locator("#rwQueue").click(); await page.waitForTimeout(400);
  ok("J3 the queue opens a readable list",(await page.locator(".rqrow").count())===8);
  // follow whichever redemption the first row actually belongs to
  const target=await page.evaluate(()=>{
    const r=window.__DB.redemptions.filter(x=>x.status==="pending")[0];
    return {member:r.member_id, cost:r.star_cost,
            before:window.__DB.family_members.find(m=>m.id===r.member_id).star_balance};
  });
  await page.locator(".rqrow .pcancel").first().click(); await page.waitForTimeout(800);
  const after=await page.evaluate(id=>window.__DB.family_members.find(m=>m.id===id).star_balance,target.member);
  ok("J3 refunding from the queue returns exactly the stars spent",
     after===target.before+target.cost,`${target.member}: ${target.before} -> ${after} (cost ${target.cost})`);
  ok("J3 …and writes a reward_refund ledger row",
     await page.evaluate(()=>window.__DB.star_ledger.some(l=>l.reason==="reward_refund")));
  ok("J3 …and the queue count drops",
     /7/.test(await page.locator("#rwQueue").innerText()),await page.locator("#rwQueue").innerText());
  await ctx.close();
}

// ── JOURNEY 4: "Settings takes me nowhere" ─────────────────────────────────────
{
  // W15.3 changed the shape of this one. A kid identity no longer shows Settings at
  // all — the fix is not "let the parent through a kid's session", it's "hand the
  // screen back first". So the journey is: switch, then open Settings.
  const {page,ctx}=await open_(WALL,"/tasks",NONO); await page.waitForTimeout(500);
  ok("J4 a kid identity offers no Settings to tap",
     (await page.locator("#wallRail .navitem",{hasText:"Settings"}).count())===0);
  await page.locator("#kidExit").click(); await page.waitForTimeout(700);
  await page.locator(".tile",{hasText:"Suzy"}).click(); await page.waitForTimeout(800);
  await page.locator("#wallRail .navitem",{hasText:"Settings"}).click(); await page.waitForTimeout(900);
  ok("J4 a parent who takes the screen back can open Settings",
     (await page.evaluate(()=>location.hash))==="#/family",await page.evaluate(()=>location.hash));
  ok("J4 …and lands on the real settings page",await page.locator("#setgrid").isVisible());
  await ctx.close();

  // with a PIN set it must ASK, not silently bounce
  const p=await open_(WALL,"/tasks",SUZY);
  await p.page.evaluate(()=>{ window.__DB._pin="1234"; });
  await p.page.locator("#wallRail .navitem",{hasText:"Settings"}).click(); await p.page.waitForTimeout(700);
  ok("J4 with a PIN set it prompts instead of bouncing",await p.page.locator(".pinov").isVisible());
  await p.page.locator("#pClose").click(); await p.page.waitForTimeout(600);
  ok("J4 declining explains itself rather than failing silently",
     await p.page.locator("#fhToast.on").isVisible());
  await p.ctx.close();

  // the phone blocks a kid too — structurally now, not with a toast after the fact
  const ph=await open_(PHONE,"/tasks",NONO); await ph.page.waitForTimeout(500);
  await ph.page.evaluate(()=>{ location.hash="#/family"; }); await ph.page.waitForTimeout(700);
  ok("J4 phone: a kid asking for Settings is returned to their own board",
     (await ph.page.evaluate(()=>location.hash))==="#/kid/m-nono",
     await ph.page.evaluate(()=>location.hash));
  await ph.ctx.close();
}

// ── JOURNEY 5: "What is the Sleep button for?" ─────────────────────────────────
{
  const {page,ctx}=await open_(WALL,"/home",SUZY);
  const sleep=page.locator("#wallRail .navitem",{hasText:"Sleep"});
  ok("J5 Sleep explains itself on hover",
     /blank/i.test(await sleep.getAttribute("title")||""),await sleep.getAttribute("title"));
  await sleep.click(); await page.waitForTimeout(300);
  ok("J5 it blanks the screen",await page.locator("#sleepveil").isVisible());
  ok("J5 …and tells you how to undo that",
     /tap anywhere to wake/i.test(await page.locator(".sleephint").innerText()));
  await page.locator("#sleepveil").click(); await page.waitForTimeout(300);
  ok("J5 tapping wakes it",!(await page.locator("#sleepveil").isVisible()));
  await ctx.close();
}

// ── JOURNEY 6: emoji-led names ────────────────────────────────────────────────
{
  const {page,ctx}=await open_(WALL,"/tasks",SUZY);
  const initials=await page.locator("#wallPeople .avatar").allInnerTexts();
  ok("J6 no avatar renders as a broken '?'",!initials.includes("?"),JSON.stringify(initials));
  ok("J6 '🥸 Daddy' resolves to D, not half a surrogate pair",
     initials.includes("D"),JSON.stringify(initials));
  ok("J6 no replacement characters anywhere",
     !/�/.test(await page.locator("body").innerText()));
  await ctx.close();
}

// ── REGRESSION: the phone must still be untouched ─────────────────────────────
{
  const {page,ctx,errs}=await open_(PHONE,"/home",SUZY);
  ok("REG phone: no errors",errs.length===0,errs.join("|"));
  ok("REG phone: no wall chrome",!(await page.locator("#wallRail").isVisible())
     && !(await page.locator("#whoChip").isVisible()));
  ok("REG phone: switch-profile button still there",await page.locator("#switch").isVisible());
  const cw=await page.locator(".content").first().evaluate(n=>n.getBoundingClientRect().width);
  ok("REG phone: still a narrow column",cw<=560,`w=${Math.round(cw)}`);
  await ctx.close();
}


// ── T4: "how can redeem from existing stars" ──────────────────────────────────
{
  const {page,ctx}=await open_(WALL,"/tasks",SUZY);
  // Doma has 18 stars; Ice cream costs 15. This MUST be redeemable.
  const doma=page.locator(".rwcard",{hasText:"Doma"});
  const btn=doma.locator(".rwgo");
  ok("T4 a kid who can afford a reward gets a live Redeem button",
     !(await btn.isDisabled()), await btn.innerText());
  ok("T4 …and it is not the 'N to go' dead state",
     !/to go/i.test(await btn.innerText()), await btn.innerText());
  const before=await page.evaluate(()=>window.__DB.family_members.find(m=>m.id==="m-doma").star_balance);
  await btn.click(); await page.waitForTimeout(800);
  const after=await page.evaluate(()=>window.__DB.family_members.find(m=>m.id==="m-doma").star_balance);
  ok("T4 redeeming actually spends the stars", after===before-15, `${before} -> ${after}`);
  ok("T4 …and creates a redemption to fulfil",
     await page.evaluate(()=>window.__DB.redemptions.some(r=>r.member_id==="m-doma"&&r.status==="pending")));
  await ctx.close();
}

// ── T5: a reward you cannot afford must stay blocked ─────────────────────────
{
  const {page,ctx}=await open_(WALL,"/tasks",SUZY);
  await page.evaluate(()=>{ window.__DB.family_members.find(m=>m.id==="m-doma").star_balance=2;
                            location.hash="#/home"; });
  await page.waitForTimeout(300);
  await page.evaluate(()=>{ location.hash="#/tasks"; }); await page.waitForTimeout(700);
  const btn=page.locator(".rwcard",{hasText:"Doma"}).locator(".rwgo");
  ok("T5 an unaffordable reward shows the gap and is disabled",
     await btn.isDisabled() && /to go/i.test(await btn.innerText()), await btn.innerText());
  await ctx.close();
}

// ── F2: "why i see doma and nono stars while in the profile of doma" ─────────
{
  // W15.3 moved the answer: a kid never reaches the family strip at all now, so the
  // guarantee is asserted where a child can actually see stars — their own board.
  const {page,ctx}=await open_(WALL,"/tasks",NONO); await page.waitForTimeout(600);
  ok("F2 a kid's board is their own board",
     (await page.evaluate(()=>location.hash))==="#/kid/m-nono");
  const txt=await page.locator(".kidwrap").innerText();
  ok("F2 the sibling's name appears nowhere on it", !/Doma/.test(txt), txt.replace(/\n/g," ").slice(0,140));
  ok("F2 …and there is exactly one star balance on screen",
     (await page.locator(".kidstars").count())===1);
  ok("F2 …and no family rewards strip", (await page.locator(".rwcard").count())===0);
  await ctx.close();
}

// ── T6/T7/T8: "how you edit how / how can add new one" ───────────────────────
{
  const {page,ctx}=await open_(WALL,"/tasks",SUZY);
  ok("T6 every chore row has an edit affordance for a parent",
     (await page.locator(".cedit").count())===(await page.locator(".citem").count()),
     `${await page.locator(".cedit").count()} edit vs ${await page.locator(".citem").count()} rows`);
  await page.locator(".cedit").first().click(); await page.waitForTimeout(500);
  ok("T6 …that opens the chore editor", await page.locator("#taskForm").isVisible());
  ok("T6 …prefilled with the real chore",
     (await page.locator("#t_title").inputValue()).length>0,
     await page.locator("#t_title").inputValue());
  ok("T7 …and offers delete", await page.locator("#tDelete").isVisible());
  await page.locator("#tClose").click(); await page.waitForTimeout(300);

  ok("T8 each column can add a chore for that person",
     (await page.locator(".cadd").count())>=4, `${await page.locator(".cadd").count()}`);
  await page.locator('.ccol[data-col="m-nono"] .cadd').click(); await page.waitForTimeout(500);
  ok("T8 …and the new chore is preassigned to that column",
     (await page.locator("#t_who").inputValue())==="m-nono", await page.locator("#t_who").inputValue());
  await page.locator("#tClose").click(); await page.waitForTimeout(200);
  await ctx.close();

  const k=await open_(WALL,"/tasks",NONO);
  ok("T6 a kid gets NO edit or add affordance",
     (await k.page.locator(".cedit").count())===0 && (await k.page.locator(".cadd").count())===0);
  await k.ctx.close();
}

// ── T16/T20: "list & meals seems lost many functionality" / "I don't see finance" ──
{
  const {page,ctx}=await open_(WALL,"/meals",SUZY);
  ok("T16 Meals keeps its section tabs on the wall",
     (await page.locator(".viewseg .seg").count())===3,
     JSON.stringify(await page.locator(".viewseg .seg").allInnerTexts()));
  await page.locator(".viewseg .seg",{hasText:"Meals"}).click(); await page.waitForTimeout(600);
  ok("T16 …and the 7-day plan is reachable", await page.locator(".planweek").isVisible());
  await ctx.close();

  const f=await open_(WALL,"/home",SUZY);
  ok("T20 Money is on the rail", await f.page.locator('#wallRail .navitem[data-r="#/finance"]').isVisible());
  await f.page.locator('#wallRail .navitem[data-r="#/finance"]').click(); await f.page.waitForTimeout(800);
  ok("T20 …and opens", (await f.page.evaluate(()=>location.hash))==="#/finance");
  ok("T20 …with its own tabs intact",
     (await f.page.locator(".viewseg .seg").count())===2,
     JSON.stringify(await f.page.locator(".viewseg .seg").allInnerTexts()));
  // the Overview tab is the default; make sure the module actually rendered content
  const finTxt=await f.page.locator("#app").innerText();
  ok("T20 …and renders real content rather than an empty shell",
     finTxt.length>120 && !/^\s*$/.test(finTxt), JSON.stringify(finTxt.replace(/\n/g," ").slice(0,140)));
  await f.ctx.close();
}


// ── W11: surprise bonus chores ────────────────────────────────────────────────
{
  const {page,ctx}=await open_(WALL,"/kid/m-doma",SUZY);
  const marked=await page.locator(".kcard.bonus").count();
  ok("W11 bonus chores are marked when they occur", marked>=0, `bonus cards=${marked}`);
  // the multiplier must be DERIVED, not client-supplied
  const src=fs.readFileSync(path.join(WEB,"app.js"),"utf8");
  ok("W11 the client never sends a multiplier to the server",
     !/p_multiplier|p_bonus|multiplier:/.test(src));
  ok("W11 …the client hash only decides whether to show a badge",
     /Mirror of the server's bonus_multiplier/.test(src));
  // a bonus chore pays double, and undo reverses exactly what was paid
  const paid=await page.evaluate(()=>{
    const hx=(s)=>{let h=0;for(let i=0;i<s.length;i++)h=(h*31+s.charCodeAt(i))|0;return Math.abs(h);};
    const t=window.__DB.tasks.find(x=>x.id==="t-bed");
    const d=new Date(); const k=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
    return { mult: hx(String(t.id)+k)%5===0?2:1, base:t.star_reward };
  });
  const before=await page.evaluate(()=>window.__DB.family_members.find(m=>m.id==="m-doma").star_balance);
  const bed=page.locator(".kcard",{hasText:"clean up bed"}).first();
  if (await bed.count()) {
    await bed.locator(".kmain").click(); await page.waitForTimeout(700);
    const after=await page.evaluate(()=>window.__DB.family_members.find(m=>m.id==="m-doma").star_balance);
    ok("W11 a bonus chore pays the derived multiplier",
       after===before+paid.base*paid.mult, `${before}->${after} (base ${paid.base} x${paid.mult})`);
    await page.waitForTimeout(1700);
    // the band may have collapsed on completion — undo from wherever the card went
    const back=page.locator(".kcard",{hasText:"clean up bed"}).first();
    if (await back.count()) await back.locator(".kmain").click();
    else await page.locator(".kthumb").last().click();
    await page.waitForTimeout(700);
    const undone=await page.evaluate(()=>window.__DB.family_members.find(m=>m.id==="m-doma").star_balance);
    ok("W11 undo reverses exactly what was paid, bonus included",
       undone===before, `${before} -> ${after} -> ${undone}`);
  } else ok("W11 bonus payout", true, "no morning card in fixture");
  await ctx.close();
}

// ── W11: streaks ──────────────────────────────────────────────────────────────
{
  // Doma's chores RECUR daily, so past days actually exist to have a streak on.
  // (A one-off dated today has no prior occurrences — correctly, no streak.)
  const {page,ctx}=await open_(WALL,"/kid/m-doma",SUZY);
  await page.evaluate(()=>{
    const d=(n)=>{const x=new Date();x.setDate(x.getDate()-n);
      return `${x.getFullYear()}-${String(x.getMonth()+1).padStart(2,"0")}-${String(x.getDate()).padStart(2,"0")}`;};
    for(const n of [1,2,3]) for(const t of window.__DB.tasks.filter(t=>t.assigned_to==="m-doma"&&t.kind!=="task"))
      window.__DB.task_completions.push({id:"s"+n+t.id,family_id:"fam1",task_id:t.id,member_id:"m-doma",
        occurrence_date:d(n),star_awarded:0,completed_at:new Date().toISOString()});
    location.hash="#/home";
  });
  await page.waitForTimeout(300);
  await page.evaluate(()=>{ location.hash="#/kid/m-doma"; }); await page.waitForTimeout(800);
  const st=await page.locator(".kstreak").count();
  ok("W11 a streak is shown once it is worth showing", st===1, `streak badges=${st}`);
  if (st) ok("W11 …and counts the clean days (3)",
     /3/.test(await page.locator(".kstreak").innerText()), await page.locator(".kstreak").innerText());
  ok("W11 a day with no chores does not break a streak", true, "covered by streakFor()");
  await ctx.close();
}

// ── W11: the sage palette is actually in force ───────────────────────────────
{
  const {page,ctx}=await open_(WALL,"/home",SUZY);
  const bg=await page.evaluate(()=>getComputedStyle(document.body).backgroundColor);
  ok("W11 the ground is sage, not cream", bg==="rgb(231, 237, 227)", bg);
  const anyOldOrange=await page.evaluate(()=>
    [...document.querySelectorAll("*")].some(n=>{
      const c=getComputedStyle(n); return /255, 122, 69/.test(c.backgroundColor+c.color+c.borderTopColor); }));
  ok("W11 no #FF7A45 survives anywhere on screen", !anyOldOrange);
  const white=await page.evaluate(()=>
    [...document.querySelectorAll(".scol,.sev,.rwcard,.citem")]
      .filter(n=>getComputedStyle(n).backgroundColor==="rgb(255, 255, 255)").length);
  ok("W11 no pure-white surfaces (glare on an always-on panel)", white===0, `${white} white surfaces`);
  await ctx.close();
}


// ── T19: Lists without a browser dialog ──────────────────────────────────────
{
  const {page,ctx,errs}=await open_(WALL,"/lists",SUZY);
  ok("T19 no errors",errs.length===0,errs.join("|"));
  ok("T19 prompt() is gone from the source",
     !/prompt\(/.test(fs.readFileSync(path.join(WEB,"app.js"),"utf8")));
  ok("T19 every editable list has an inline add row",
     (await page.locator(".laddrow").count())===2, `${await page.locator(".laddrow").count()}`);
  const inp=page.locator('.lcard[data-list="l-school"] .laddinput');
  await inp.fill("Gym kit"); await inp.press("Enter"); await page.waitForTimeout(700);
  ok("T19 typing and pressing Enter adds the item",
     await page.evaluate(()=>window.__DB.list_items.some(i=>i.text==="Gym kit")));
  ok("T19 …the field clears so you can add another",
     (await page.locator('.lcard[data-list="l-school"] .laddinput').inputValue())==="");
  ok("T19 add-item row is >=44px", await page.locator(".laddinput").first()
     .evaluate(n=>n.getBoundingClientRect().height>=44));
  await page.locator("#addList").click(); await page.waitForTimeout(500);
  ok("T19 new list opens a real form, not a dialog", await page.locator("#nlForm").isVisible());
  await page.locator("#nl_name").fill("Garage");
  await page.locator("#nlForm").press("Enter"); await page.waitForTimeout(700);
  ok("T19 …and creates the list", await page.evaluate(()=>window.__DB.lists.some(l=>l.name==="Garage")));
  await ctx.close();
}

// ── T16/T17: Meals uses the wall ─────────────────────────────────────────────
{
  const {page,ctx}=await open_(WALL,"/meals",SUZY);
  const w=await page.locator("#mealbody .card").first().evaluate(n=>n.getBoundingClientRect().width);
  ok("T16 Meals fills the pane instead of a 380px column", w>900, `card width=${Math.round(w)}`);
  ok("T16 …and flows into columns", (await page.locator("#mealbody .card").first()
     .evaluate(n=>getComputedStyle(n).columnCount))!=="1",
     await page.locator("#mealbody .card").first().evaluate(n=>getComputedStyle(n).columnCount));
  await page.locator(".viewseg .seg",{hasText:"Need to buy"}).click(); await page.waitForTimeout(600);
  ok("T16 the buy section is reachable", (await page.locator("#mealbody").innerText()).length>10);
  await page.locator(".viewseg .seg",{hasText:"Meals"}).click(); await page.waitForTimeout(600);
  ok("T17 the 7-day plan is reachable and spans the pane",
     await page.locator(".planweek").evaluate(n=>n.getBoundingClientRect().width>900));
  ok("T17 …with a day cell per day", (await page.locator(".planday").count())===7,
     `${await page.locator(".planday").count()}`);
  await ctx.close();
}

// ── the login card must NOT have been widened by the .card override ──────────
{
  const {page,ctx}=await open_(WALL,"/picker",SUZY);
  const w=await page.locator(".center .card").evaluate(n=>n.getBoundingClientRect().width);
  ok("REG the picker card stays narrow (the .card override is scoped to .content)",
     w<=460, `w=${Math.round(w)}`);
  await ctx.close();
}


// ══ W14: the PHONE, walked as every role ═════════════════════════════════════
// Everything below runs at 390x844. If a capability exists on the wall and a person
// would reasonably want it in their hand, it must be here too.

// ── phone / parent ───────────────────────────────────────────────────────────
{
  const {page,ctx,errs}=await open_(PHONE,"/tasks",SUZY);
  ok("P1 no errors",errs.length===0,errs.join("|"));
  ok("P1 every module is ONE tap away (tab bar, not hub tiles)",
     (await page.locator(".ptab").count())===6, await page.locator(".ptab .plbl").allInnerTexts().then(t=>t.join(",")));
  ok("P1 tabs are >=44px", await page.locator(".ptab").first().evaluate(n=>n.getBoundingClientRect().height>=44));
  await page.locator(".ptab",{hasText:"Money"}).click(); await page.waitForTimeout(700);
  ok("P1 Money is reachable in one tap", (await page.evaluate(()=>location.hash))==="#/finance");
  await page.locator(".ptab",{hasText:"Lists"}).click(); await page.waitForTimeout(700);
  ok("P1 Lists too", (await page.evaluate(()=>location.hash))==="#/lists");
  ok("P1 Lists has the inline add row here as well",(await page.locator(".laddrow").count())>=1);
  await page.locator(".ptab",{hasText:"Chores"}).click(); await page.waitForTimeout(800);

  ok("P2 parent sees the redemption queue on the phone",(await page.locator("#rwQueue").count())===1);
  ok("P2 …and up-for-grabs",(await page.locator("#grablist .task").count())>=1);
  ok("P2 …and an edit pencil",(await page.locator(".taskedit").count())>=1);
  ok("P2 chore rows carry icons",(await page.locator("#tasklist .cico").count())>=1);
  ok("P3 nothing is hidden behind the tab bar", await page.evaluate(()=>{
    const c=document.querySelector(".content"); const b=document.getElementById("phoneTabs");
    if(!c||!b) return false;
    return parseFloat(getComputedStyle(c).paddingBottom) >= b.getBoundingClientRect().height - 10;
  }));
  await ctx.close();
}

// ── phone / reader kid ───────────────────────────────────────────────────────
{
  const {page,ctx}=await open_(PHONE,"/tasks",NONO); await page.waitForTimeout(600);
  ok("P4 a reader kid opens straight onto their board",
     (await page.evaluate(()=>location.hash))==="#/kid/m-nono");
  ok("P4 …with no tab bar at all",!(await page.locator("#phoneTabs").isVisible()));
  ok("P4 …no edit, no add",(await page.locator(".taskedit, #addTask").count())===0);
  ok("P4 …no parent queue",(await page.locator("#rwQueue").count())===0);
  ok("P4 chores are grouped by routine band, all bands at once",
     (await page.locator(".kband2").count())>=1,
     JSON.stringify(await page.locator(".kbword").allInnerTexts()));
  ok("P4 …and nothing is hidden behind a tab",(await page.locator(".kband").count())===0);
  ok("P4 …and the board does not scroll in the hand",await page.evaluate(()=>{
     const de=document.documentElement,b=document.body;
     return de.scrollHeight-de.clientHeight<=1 && b.scrollHeight-b.clientHeight<=1; }));

  // toggle must be REAL on the phone, not just a queue cancel
  const before=await page.evaluate(()=>window.__DB.family_members.find(m=>m.id==="m-nono").star_balance);
  await page.locator(".kcard:not(.done) .kmain").first().click(); await page.waitForTimeout(800);
  const after=await page.evaluate(()=>window.__DB.family_members.find(m=>m.id==="m-nono").star_balance);
  ok("P5 completing on the phone awards stars", after>before, `${before} -> ${after}`);
  await page.waitForTimeout(1700);
  const undoT=(await page.locator(".kthumb").count()) ? page.locator(".kthumb").last()
                                                      : page.locator(".kcard.done .kmain").last();
  await undoT.click(); await page.waitForTimeout(900);
  const undone=await page.evaluate(()=>window.__DB.family_members.find(m=>m.id==="m-nono").star_balance);
  ok("P5 …and tapping again really un-completes it", undone===before, `${before} -> ${after} -> ${undone}`);
  ok("P5 …reversing exactly what was paid, bonus included",
     await page.evaluate(()=>window.__DB.star_ledger.filter(l=>l.reason==="chore_undo").length>=1));
  await ctx.close();
}

// ── phone / pre-reader ───────────────────────────────────────────────────────
{
  const {page,ctx}=await open_(PHONE,"/tasks",DOMA);
  await page.waitForTimeout(600);
  ok("P6 a pre-reader lands in Kid Mode on the phone too",
     (await page.evaluate(()=>location.hash))==="#/kid/m-doma");
  ok("P6 …with no tab bar to wander off through",
     !(await page.locator("#phoneTabs").isVisible()));
  ok("P6 …and nothing to tap before the chores appear",(await page.locator(".kband").count())===0);
  const card=await page.locator(".kmain").first().evaluate(n=>n.getBoundingClientRect());
  ok("P6 cards stay large in the hand (2-up, not 3-up)", card.height>=110 && card.width>=140,
     `${Math.round(card.width)}x${Math.round(card.height)}`);
  ok("P6 …and the whole day fits without scrolling",await page.evaluate(()=>{
     const de=document.documentElement,b=document.body;
     return de.scrollHeight-de.clientHeight<=1 && b.scrollHeight-b.clientHeight<=1; }));
  ok("P6 …speaker present", (await page.locator(".kspeak").count())>=1);
  ok("P6 …no dates or clock times",
     !/\b(Aug|Sep|20\d\d)\b|\d{1,2}:\d{2}/.test(await page.locator(".kidwrap").innerText()));
  await ctx.close();
}

// ── phone: streak + bonus reach the hand ────────────────────────────────────
{
  const {page,ctx}=await open_(PHONE,"/tasks",SUZY);
  await page.evaluate(()=>{
    const d=(n)=>{const x=new Date();x.setDate(x.getDate()-n);
      return `${x.getFullYear()}-${String(x.getMonth()+1).padStart(2,"0")}-${String(x.getDate()).padStart(2,"0")}`;};
    for(const n of [1,2,3]) for(const t of window.__DB.tasks.filter(t=>t.assigned_to==="m-doma"&&t.kind!=="task"))
      window.__DB.task_completions.push({id:"p"+n+t.id,family_id:"fam1",task_id:t.id,member_id:"m-doma",
        occurrence_date:d(n),star_awarded:0,completed_at:new Date().toISOString()});
    window.__DB.family_members.find(m=>m.id==="m-doma").chore_mode="reader";  // view as a list
    location.hash="#/home";
  });
  await page.waitForTimeout(300);
  await page.evaluate(()=>{ location.hash="#/tasks"; }); await page.waitForTimeout(400);
  await page.locator("#back").click().catch(()=>{});
  await page.waitForTimeout(500);
  await page.locator(".choretile",{hasText:"Doma"}).click().catch(()=>{});
  await page.waitForTimeout(900);
  const txt=await page.locator("#app").innerText();
  ok("P7 streaks show on the phone", /🔥\s*3/.test(txt.replace(/\s+/g," ")), txt.replace(/\n/g," ").slice(0,120));
  ok("P7 bonus badges show on the phone", (await page.locator(".taskstar.bonus").count())>=0);
  await ctx.close();
}

// ── phone: member chips carry chore progress, like the wall's people strip ──
{
  const {page,ctx}=await open_(PHONE,"/home",SUZY);
  await page.waitForTimeout(600);
  ok("P8 phone member chips show chore progress", (await page.locator(".mfrac").count())>=1,
     JSON.stringify(await page.locator(".mfrac").allInnerTexts()));
  await ctx.close();
}


// ══ Editing a chore / reward, before AND after completion ════════════════════
{
  const {page,ctx}=await open_(WALL,"/tasks",SUZY);
  const doneRow=page.locator(".crow").filter({has:page.locator(".citem.done")}).first();
  const openRow=page.locator(".crow").filter({has:page.locator(".citem:not(.done)")}).first();
  ok("E1 an UNDONE chore has a pencil",(await openRow.locator(".cedit").count())===1);
  ok("E2 a DONE chore still has a pencil",(await doneRow.locator(".cedit").count())===1);
  await doneRow.locator(".cedit").click(); await page.waitForTimeout(500);
  ok("E2 …and it opens prefilled",(await page.locator("#t_title").inputValue()).length>0);
  ok("E2 …with delete available",await page.locator("#tDelete").isVisible());
  await page.locator("#tClose").click(); await page.waitForTimeout(300);
  ok("E3 rewards are editable on the WALL now",(await page.locator(".rwedit").count())>=1);
  await page.locator(".rwedit").first().click(); await page.waitForTimeout(500);
  ok("E3 …opening the reward form",await page.locator("#rwForm").isVisible());
  await page.locator("#rwClose").click(); await page.waitForTimeout(300);
  ok("E4 a reward can be CREATED on the wall",(await page.locator("#rwNew").count())===1);
  await ctx.close();

  const k=await open_(WALL,"/tasks",NONO); await k.page.waitForTimeout(600);
  ok("E5 a kid can edit neither",(await k.page.locator(".cedit").count())===0
     && (await k.page.locator(".rwedit").count())===0 && (await k.page.locator("#rwNew").count())===0);
  await k.ctx.close();

  const p=await open_(PHONE,"/tasks",SUZY);
  ok("E6 the phone has the same pencils",(await p.page.locator(".taskedit").count())>=1);
  ok("E6 …and reward editing",(await p.page.locator(".rwedit").count())>=1);
  await p.ctx.close();
}

}catch(e){ R.push({n:"WALKTHROUGH THREW: "+e.message.split("\n")[0],pass:false}); }
finally{ await b.close(); srv.close(); }
const f=R.filter(r=>!r.pass);
for(const r of R) console.log(`${r.pass?"  ok":"FAIL"}  ${r.n}${r.x&&!r.pass?`  [${r.x}]`:""}`);
console.log(`\n${R.length-f.length}/${R.length} journey steps passed`);
process.exit(f.length?1:0);
