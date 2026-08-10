import { chromium } from "playwright";
import http from "http"; import fs from "fs"; import path from "path";
const WEB=path.resolve("web"),TEST=path.resolve("test");
const MIME={".html":"text/html",".js":"text/javascript",".css":"text/css",".json":"application/json",".webmanifest":"application/json"};
const srv=http.createServer((q,r)=>{let p=decodeURI(q.url.split("?")[0]);if(p==="/")p="/index.html";const f=path.join(WEB,p);
 if(!fs.existsSync(f)||fs.statSync(f).isDirectory()){r.writeHead(404);return r.end("nf");}
 r.writeHead(200,{"Content-Type":MIME[path.extname(f)]||"text/plain"});r.end(fs.readFileSync(f));});
await new Promise(r=>srv.listen(8783,r));
const b=await chromium.launch({executablePath:"/opt/pw-browsers/chromium"});
for (const [name,vp,hash,mem] of [
  ["wall-calendar",{width:1280,height:720},"/home",{id:"m-suzy",name:"Suzy 👩",color:"red",is_child:false}],
  ["wall-chores",  {width:1280,height:720},"/tasks",{id:"m-suzy",name:"Suzy 👩",color:"red",is_child:false}],
  ["wall-week",    {width:1280,height:720},"/home?w",{id:"m-suzy",name:"Suzy 👩",color:"red",is_child:false}],
  ["wall-meals",   {width:1280,height:720},"/meals",{id:"m-suzy",name:"Suzy 👩",color:"red",is_child:false}],
  ["wall-lists",   {width:1280,height:720},"/lists",{id:"m-suzy",name:"Suzy 👩",color:"red",is_child:false}],
  ["kid-doma",     {width:1280,height:720},"/kid/m-doma",{id:"m-suzy",name:"Suzy 👩",color:"red",is_child:false}],
  ["kid-doma-phone",{width:390,height:844},"/kid/m-doma",{id:"m-suzy",name:"Suzy 👩",color:"red",is_child:false}],
  ["kid-nono",     {width:1280,height:720},"/kid/m-nono",{id:"m-suzy",name:"Suzy 👩",color:"red",is_child:false}],
  ["wall-day",     {width:1280,height:720},"/home?d",{id:"m-suzy",name:"Suzy 👩",color:"red",is_child:false}],
  ["phone-chores", {width:390,height:844},"/tasks",{id:"m-suzy",name:"Suzy 👩",color:"red",is_child:false}],
  ["phone-calendar",{width:390,height:844},"/home",{id:"m-suzy",name:"Suzy 👩",color:"red",is_child:false}],
]) {
  const ctx=await b.newContext({viewport:vp,deviceScaleFactor:1});const page=await ctx.newPage();
  await page.route("**/@supabase/supabase-js@2*",r=>r.fulfill({contentType:"text/javascript",body:fs.readFileSync(path.join(TEST,"stub-supabase.js"),"utf8")}));
  await page.route("**/rrule@2.8.1*",r=>r.fulfill({contentType:"text/javascript",body:fs.readFileSync(path.join(TEST,"rrule.bundle.js"),"utf8")}));
  await page.route("**/sw.js",r=>r.fulfill({contentType:"text/javascript",body:""}));
  await page.addInitScript(m=>localStorage.setItem("fh_current_member",JSON.stringify(m)),mem);
  await page.goto(`http://localhost:8783/#${hash}`,{waitUntil:"networkidle"});
  await page.waitForTimeout(700);

  if (name==="wall-day") { await page.locator("#wallInfo .seg", { hasText:"Day" }).click(); await page.waitForTimeout(600); }
  if (name==="wall-week") { await page.locator("#wallInfo .seg", { hasText:"Week" }).click(); await page.waitForTimeout(600); }
  await page.screenshot({path:`test/shots/${name}.png`});
  await ctx.close();
}
await b.close();srv.close();console.log("shots written");
