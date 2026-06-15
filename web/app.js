import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { RRule } from "https://esm.sh/rrule@2.8.1";
import { SUPABASE_URL, SUPABASE_ANON_KEY, SHARED_EMAIL } from "./config.js";

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
const MEMBER_KEY = "fh_current_member";

const COLORS = { blue: "#3D8BCD", green: "#3FA796", amber: "#E8A23D", pink: "#D4709B" };
const ALL_COLOR = "#B0A48F"; // whole-family events (warm taupe)
const colorFor = (c) => COLORS[c] || "#8A8178";
const el = document.getElementById("app");

// shared client-side state (loaded once per session)
const state = { familyId: null, members: null, membersById: {}, member: null, viewMonth: null, selectedKey: null };

// ---- utils -----------------------------------------------------------------
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const pad = (n) => String(n).padStart(2, "0");
const dateKey = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const toLocalInput = (iso) => { const d = new Date(iso); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`; };
const toDateInput = (iso) => { const d = new Date(iso); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
const fmtTime = (iso) => { const d = new Date(iso); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };
const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const WD = ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"];
const fmtDayHeader = (d) => `${WD[(d.getDay() + 6) % 7]} ${MONTHS[d.getMonth()].slice(0,3)} ${d.getDate()}`;
const navTabs = (active) => `<nav class="tabs">
  <a href="#/home" class="${active === "home" ? "on" : ""}">Calendar</a>
  <a href="#/tasks" class="${active === "tasks" ? "on" : ""}">Chores</a>
  <a href="#/stars" class="${active === "stars" ? "on" : ""}">Stars</a>
  <a href="#/finance" class="${active === "finance" ? "on" : ""}">Finance</a>
</nav>`;
const fmtDue = (d) => {
  if (!d) return "";
  const today = dateKey(new Date());
  if (d === today) return "Today";
  const dt = new Date(d + "T00:00");
  return `${MONTHS[dt.getMonth()].slice(0, 3)} ${dt.getDate()}`;
};

// ---- current member (localStorage = identity, not auth) --------------------
const getMember = () => { try { return JSON.parse(localStorage.getItem(MEMBER_KEY)); } catch { return null; } };
const setMember = (m) => localStorage.setItem(MEMBER_KEY, JSON.stringify(m));
const clearMember = () => localStorage.removeItem(MEMBER_KEY);
const go = (route) => { if (location.hash !== route) location.hash = route; else render(); };

// ---- offline write queue (optimistic UI; replays through RPCs on reconnect) -
// Persisted in localStorage so a queued chore completion survives reload/offline
// and replays via the complete_task RPC (never a direct balance write).
const QUEUE_KEY = "fh_queue";
const queueGet = () => { try { return JSON.parse(localStorage.getItem(QUEUE_KEY)) || []; } catch { return []; } };
const queueSet = (q) => localStorage.setItem(QUEUE_KEY, JSON.stringify(q));
function loadPending() {
  state.pending = new Set(queueGet().filter((o) => o.type === "complete_task").map((o) => `${o.task_id}|${o.occurrence_date ?? ""}`));
}
function enqueueCompletion(task, occ, earner) {
  const q = queueGet();
  q.push({ type: "complete_task", task_id: task.id, member_id: earner, occurrence_date: occ ?? null });
  queueSet(q);
  state.pending = state.pending || new Set();
  state.pending.add(`${task.id}|${occ ?? ""}`);
}
let flushing = false;
async function flushQueue() {
  if (flushing || !navigator.onLine) return;
  flushing = true;
  try {
    let q = queueGet();
    while (q.length) {
      const op = q[0];
      let drop = true;
      if (op.type === "complete_task") {
        try {
          const { error } = await supabase.rpc("complete_task", { p_task: op.task_id, p_member: op.member_id, p_occurrence_date: op.occurrence_date });
          // already_completed = the guard fired (idempotent replay) -> treat as done
          if (error && !/already_completed/.test(error.message)) {
            if (/fetch|network|failed|timeout/i.test(error.message)) drop = false; // transient: keep + retry
            // else permanent (e.g. task deleted): drop it
          }
        } catch (e) { drop = false; } // offline / network error: stop, keep for later
      }
      if (!drop) break;
      q.shift(); queueSet(q);
      state.pending?.delete(`${op.task_id}|${op.occurrence_date ?? ""}`);
    }
  } finally {
    flushing = false;
    const h = location.hash || "";
    if (h.startsWith("#/tasks")) renderTasks();
    else if (h.startsWith("#/stars")) renderStars(false);
  }
}
window.addEventListener("online", flushQueue);

// ---- router ----------------------------------------------------------------
let rendering = false;
async function render() {
  if (rendering) return;
  rendering = true;
  try {
    teardownRealtime(); // drop any live subscription when navigating
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return viewLogin();

    const route = location.hash || "#/";
    const needMember = (fn) => { const m = getMember(); if (!m) return go("#/picker"); state.member = m; return fn(); };
    if (route.startsWith("#/home")) return needMember(viewCalendar);
    if (route.startsWith("#/tasks")) return needMember(viewTasks);
    if (route.startsWith("#/stars")) return needMember(viewStars);
    if (route.startsWith("#/rewards")) return needMember(viewRewards);
    if (route.startsWith("#/finance")) return needMember(viewFinance);
    return viewPicker();
  } finally {
    rendering = false;
  }
}
window.addEventListener("hashchange", render);
supabase.auth.onAuthStateChange(() => render());

// ---- view: shared login ----------------------------------------------------
function viewLogin() {
  el.innerHTML = `
    <div class="center">
      <form class="card" id="loginForm">
        <h2>Family Hub</h2>
        <p class="sub">Sign in with the shared family account</p>
        <label for="email">Email</label>
        <input id="email" type="email" autocomplete="username" value="${esc(SHARED_EMAIL)}" required />
        <label for="password">Password</label>
        <input id="password" type="password" autocomplete="current-password" required />
        <button type="submit" id="loginBtn">Sign in</button>
        <div class="err" id="loginErr"></div>
      </form>
    </div>`;
  document.getElementById("loginForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const btn = document.getElementById("loginBtn");
    const err = document.getElementById("loginErr");
    err.textContent = "";
    btn.disabled = true; btn.textContent = "Signing in…";
    const { error } = await supabase.auth.signInWithPassword({
      email: document.getElementById("email").value.trim(),
      password: document.getElementById("password").value,
    });
    if (error) { err.textContent = error.message; btn.disabled = false; btn.textContent = "Sign in"; return; }
    clearMember();
    // reset cached context for the (re)authenticated session
    state.familyId = null; state.members = null;
    go("#/picker");
  });
}

// ---- view: profile picker (wireframe #1) -----------------------------------
async function viewPicker() {
  el.innerHTML = `
    <div class="center">
      <div class="card" style="max-width:440px">
        <h2>Who's using Hub?</h2>
        <p class="sub">Pick your profile</p>
        <div class="grid" id="tiles"><p class="sub">Loading…</p></div>
        <div style="text-align:center;margin-top:18px">
          <button class="link" id="signout">Sign out</button>
        </div>
      </div>
    </div>`;
  document.getElementById("signout").onclick = signOut;

  const { data, error } = await supabase
    .from("family_members")
    .select("id,name,color,is_child,avatar_url,sort_order")
    .order("sort_order", { ascending: true });

  const tiles = document.getElementById("tiles");
  if (error) { tiles.innerHTML = `<p class="err">${esc(error.message)}</p>`; return; }
  if (!data || data.length === 0) { tiles.innerHTML = `<p class="sub">No members found.</p>`; return; }

  tiles.innerHTML = "";
  for (const m of data) {
    const b = document.createElement("button");
    b.className = "tile";
    b.innerHTML = `
      <span class="avatar" style="background:${colorFor(m.color)}">${esc(m.name[0] ?? "?")}</span>
      <span>${esc(m.name)}</span>
      <span class="role">${m.is_child ? "Kid" : "Parent"} · ${esc(m.color)}</span>`;
    b.onclick = () => { setMember({ id: m.id, name: m.name, color: m.color, is_child: m.is_child }); go("#/home"); };
    tiles.appendChild(b);
  }
}

// ---- data layer (all reads/writes go through RLS) --------------------------
async function loadContext() {
  if (state.familyId && state.members) return;
  const { data: fam } = await supabase.from("families").select("id").limit(1).maybeSingle();
  state.familyId = fam?.id ?? null;
  const { data: mem } = await supabase.from("family_members").select("id,name,color,is_child").order("sort_order");
  state.members = mem || [];
  state.membersById = Object.fromEntries(state.members.map((m) => [m.id, m]));
}

// ---- recurrence helpers (rrule.js) -----------------------------------------
const WEEKDAYS = ["MO", "TU", "WE", "TH", "FR", "SA", "SU"];
const FREQ_NAME = { [RRule.DAILY]: "DAILY", [RRule.WEEKLY]: "WEEKLY", [RRule.MONTHLY]: "MONTHLY", [RRule.YEARLY]: "YEARLY" };
const FREQ_UNIT = { DAILY: "day(s)", WEEKLY: "week(s)", MONTHLY: "month(s)", YEARLY: "year(s)" };
const toRRuleUntil = (dateStr) => dateStr.replace(/-/g, "") + "T235959Z";            // 'YYYY-MM-DD' -> end-of-day Z
const dateToUntil = (d) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, ""); // Date -> YYYYMMDDTHHMMSSZ

function ruleParts(ruleStr) {
  const o = RRule.parseString(ruleStr);
  const byday = o.byweekday ? [].concat(o.byweekday).map((w) => WEEKDAYS[typeof w === "number" ? w : w.weekday]) : [];
  return { freq: FREQ_NAME[o.freq] || null, interval: o.interval || 1, byday };
}
function assembleRule({ freq, interval, byday }, untilStamp, count) {
  if (!freq) return null;
  const parts = [`FREQ=${freq}`];
  if (interval > 1) parts.push(`INTERVAL=${interval}`);
  if (freq === "WEEKLY" && byday && byday.length) parts.push(`BYDAY=${byday.join(",")}`);
  if (untilStamp) parts.push(`UNTIL=${untilStamp}`);
  else if (count) parts.push(`COUNT=${count}`);
  return parts.join(";");
}
const buildRuleString = (ui) => {
  if (ui.freq === "none") return null;
  const until = ui.endType === "until" && ui.until ? toRRuleUntil(ui.until) : null;
  const count = ui.endType === "count" && ui.count ? parseInt(ui.count, 10) : null;
  return assembleRule({ freq: ui.freq, interval: ui.interval, byday: ui.byday }, until, count);
};
function parseRuleToUI(ruleStr) {
  const ui = { freq: "none", interval: 1, byday: [], endType: "never", until: "", count: "" };
  if (!ruleStr) return ui;
  const o = RRule.parseString(ruleStr);
  ui.freq = FREQ_NAME[o.freq] || "none";
  ui.interval = o.interval || 1;
  if (o.byweekday) ui.byday = [].concat(o.byweekday).map((w) => WEEKDAYS[typeof w === "number" ? w : w.weekday]);
  if (o.until) { ui.endType = "until"; ui.until = toDateInput(o.until.toISOString()); }
  else if (o.count) { ui.endType = "count"; ui.count = o.count; }
  return ui;
}
const withUntil = (ruleStr, capDate) => assembleRule(ruleParts(ruleStr), dateToUntil(capDate));

// expand one recurring series across [winStart, winEnd): subtract exdates, apply overrides
function expandSeries(ev, ovr, winStart, winEnd) {
  const opts = RRule.parseString(ev.rrule);
  opts.dtstart = new Date(ev.starts_at);
  const rule = new RRule(opts);
  const durMs = ev.ends_at ? (new Date(ev.ends_at) - new Date(ev.starts_at)) : 0;
  const exSet = new Set((ev.exdates || []).map((s) => new Date(s).getTime()));
  const out = [];
  for (const occ of rule.between(winStart, winEnd, true)) {
    if (occ.getTime() >= winEnd.getTime()) continue;        // winEnd is exclusive
    if (exSet.has(occ.getTime())) continue;                 // cancelled instance (exdate)
    const key = dateKey(occ);
    const o = ovr ? ovr[key] : null;                        // per-instance override
    if (o && o.is_cancelled) continue;
    const start = o && o.new_starts_at ? new Date(o.new_starts_at) : occ;
    const end = ev.ends_at ? (o && o.new_ends_at ? new Date(o.new_ends_at) : new Date(start.getTime() + durMs)) : null;
    out.push({
      iid: `${ev.id}|${key}`, eventId: ev.id, base: ev, isRecurring: true,
      occISO: occ.toISOString(), occKey: key,
      starts_at: start.toISOString(), ends_at: end ? end.toISOString() : null, all_day: ev.all_day,
      title: o && o.new_title != null ? o.new_title : ev.title,
      location: o && o.new_location != null ? o.new_location : ev.location,
      member_id: ev.member_id,
    });
  }
  return out;
}

// Read pipeline: singles in window + ALL recurring rows (expanded client-side).
const EVENT_COLS = "id,title,location,member_id,starts_at,ends_at,all_day,rrule,exdates";
async function fetchInstances(winStart, winEnd, mode = "individual") {
  const me = state.member.id;
  // individual: this member + whole-family; combined: every member + whole-family
  let singlesQ = supabase.from("events").select(EVENT_COLS).is("rrule", null)
    .gte("starts_at", winStart.toISOString()).lt("starts_at", winEnd.toISOString());
  let recQ = supabase.from("events").select(EVENT_COLS).not("rrule", "is", null);
  if (mode === "individual") {
    singlesQ = singlesQ.or(`member_id.eq.${me},member_id.is.null`);
    recQ = recQ.or(`member_id.eq.${me},member_id.is.null`);
  }
  const [singlesR, recR] = await Promise.all([singlesQ, recQ]);
  if (singlesR.error) throw singlesR.error;
  if (recR.error) throw recR.error;

  const recs = recR.data || [];
  const overridesByEvent = {};
  if (recs.length) {
    const { data: ovs, error } = await supabase.from("event_overrides")
      .select("event_id,occurrence_date,is_cancelled,new_starts_at,new_ends_at,new_title,new_location")
      .in("event_id", recs.map((r) => r.id));
    if (error) throw error;
    for (const o of ovs || []) (overridesByEvent[o.event_id] ||= {})[o.occurrence_date] = o;
  }

  const instances = [];
  for (const ev of (singlesR.data || [])) instances.push({
    iid: ev.id, eventId: ev.id, base: ev, isRecurring: false,
    occISO: ev.starts_at, occKey: dateKey(new Date(ev.starts_at)),
    starts_at: ev.starts_at, ends_at: ev.ends_at, all_day: ev.all_day,
    title: ev.title, location: ev.location, member_id: ev.member_id,
  });
  for (const ev of recs) instances.push(...expandSeries(ev, overridesByEvent[ev.id], winStart, winEnd));
  return instances;
}

async function fetchNoteCounts(eventIds) {
  const counts = {};
  if (!eventIds.length) return counts;
  const { data, error } = await supabase.from("event_notes").select("event_id").in("event_id", eventIds);
  if (error) throw error;
  for (const r of data) counts[r.event_id] = (counts[r.event_id] || 0) + 1;
  return counts;
}

const createEvent = (p) => supabase.from("events").insert({ family_id: state.familyId, rrule: null, exdates: [], ...p }).select().single();
const updateEvent = (id, p) => supabase.from("events").update(p).eq("id", id).select().single();
const deleteEvent = (id) => supabase.from("events").delete().eq("id", id);

// recurrence scope ops
const overrideOccurrence = (base, occKey, vals) => supabase.from("event_overrides").upsert({
  family_id: state.familyId, event_id: base.id, occurrence_date: occKey, is_cancelled: false,
  new_starts_at: vals.starts_at, new_ends_at: vals.ends_at, new_title: vals.title, new_location: vals.location,
}, { onConflict: "event_id,occurrence_date" });
async function addExdate(base, occISO) {                      // "delete this instance"
  const ex = Array.isArray(base.exdates) ? base.exdates.slice() : [];
  if (!ex.some((s) => new Date(s).getTime() === new Date(occISO).getTime())) ex.push(occISO);
  return supabase.from("events").update({ exdates: ex }).eq("id", base.id);
}
const capSeries = (base, capDate) => supabase.from("events").update({ rrule: withUntil(base.rrule, capDate) }).eq("id", base.id);
async function splitSeries(base, occ, form) {                 // "this + future"
  const r1 = await capSeries(base, new Date(occ.getTime() - 1000)); // UNTIL just before this occurrence
  if (r1.error) return r1;
  return supabase.from("events").insert({
    family_id: state.familyId, member_id: form.member_id, title: form.title, location: form.location,
    starts_at: form.starts_at, ends_at: form.ends_at, all_day: form.all_day, rrule: form.rrule, exdates: [],
  }).select().single();
}
const fetchNotes = (eventId) => supabase.from("event_notes").select("id,body,author_member_id,created_at").eq("event_id", eventId).order("created_at", { ascending: true });
const addNote = (eventId, body) => supabase.from("event_notes").insert({ family_id: state.familyId, event_id: eventId, author_member_id: state.member.id, body });

// ---- view: individual calendar (wireframe #3) ------------------------------
function monthMatrix(year, month) {
  const first = new Date(year, month, 1);
  const startDow = (first.getDay() + 6) % 7; // Monday = 0
  const cur = new Date(year, month, 1 - startDow);
  const weeks = [];
  for (let w = 0; w < 6; w++) {
    const row = [];
    for (let d = 0; d < 7; d++) { row.push(new Date(cur)); cur.setDate(cur.getDate() + 1); }
    weeks.push(row);
  }
  return weeks;
}

async function viewCalendar() {
  await loadContext();
  if (!state.viewMonth) state.viewMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  if (!state.calMode) state.calMode = "individual";
  if (!state.hiddenMembers) state.hiddenMembers = new Set();
  await renderCalendar();
  subscribeRealtime(["events", "event_overrides", "event_notes"], () => renderCalendar());
}

async function renderCalendar() {
  const member = state.member;
  const vm = state.viewMonth;
  const weeks = monthMatrix(vm.getFullYear(), vm.getMonth());
  const winStart = weeks[0][0];
  const winEnd = new Date(weeks[5][6]); winEnd.setDate(winEnd.getDate() + 1);
  const todayKey = dateKey(new Date());

  let instances = [], counts = {};
  let loadErr = "";
  try {
    instances = await fetchInstances(winStart, winEnd, state.calMode);
    counts = await fetchNoteCounts([...new Set(instances.map((e) => e.eventId))]);
  } catch (e) { loadErr = e.message || String(e); }

  // combined view: hide members whose chip is toggled off (whole-family always shows)
  if (state.calMode === "combined" && state.hiddenMembers.size) {
    instances = instances.filter((i) => i.member_id == null || !state.hiddenMembers.has(i.member_id));
  }

  // group expanded instances by local day key
  const byDay = {};
  for (const inst of instances) { (byDay[inst.occKey] = byDay[inst.occKey] || []).push(inst); }

  el.innerHTML = `
    <header class="topbar">
      <button class="iconbtn" id="switch" title="Switch profile">‹</button>
      <h1>${state.calMode === "combined"
        ? `<span class="dot" style="background:${ALL_COLOR}"></span>Family Calendar`
        : `<span class="dot" style="background:${colorFor(member.color)}"></span>${esc(member.name)}'s Calendar`}</h1>
      <button id="addEvent">+ Event</button>
    </header>
    <section class="content">
      ${navTabs("home")}
      <div class="calmode">
        <button class="seg${state.calMode === "individual" ? " on" : ""}" id="modeMine">Mine</button>
        <button class="seg${state.calMode === "combined" ? " on" : ""}" id="modeAll">Combined</button>
      </div>
      ${state.calMode === "combined" ? `<div class="chips memberchips">${state.members.map((m) => `
        <button class="chip mchip${state.hiddenMembers.has(m.id) ? "" : " on"}" data-m="${m.id}">
          <span class="dot" style="background:${colorFor(m.color)}"></span>${esc(m.name)}
        </button>`).join("")}</div>` : ""}
      <div class="monthnav">
        <button class="iconbtn" id="prev">‹</button>
        <strong>${MONTHS[vm.getMonth()]} ${vm.getFullYear()}</strong>
        <button class="iconbtn" id="next">›</button>
        <button class="link" id="today">Today</button>
      </div>
      ${loadErr ? `<p class="err">${esc(loadErr)}</p>` : ""}
      <div class="cal">
        <div class="cal-head">${WD.map((d) => `<span>${d}</span>`).join("")}</div>
        <div class="cal-grid">
          ${weeks.flat().map((d) => {
            const k = dateKey(d);
            const inMonth = d.getMonth() === vm.getMonth();
            const dayEvents = byDay[k] || [];
            const dots = dayEvents.slice(0, 4).map((ev) => {
              const col = ev.member_id ? colorFor(state.membersById[ev.member_id]?.color) : ALL_COLOR;
              return `<i class="evdot" style="background:${col}"></i>`;
            }).join("");
            return `<button class="cal-cell${inMonth ? "" : " muted"}${k === todayKey ? " today" : ""}${k === state.selectedKey ? " sel" : ""}" data-key="${k}">
              <span class="cal-num">${d.getDate()}</span>
              <span class="cal-dots">${dots}</span>
            </button>`;
          }).join("")}
        </div>
      </div>
      <div class="daylist" id="daylist"></div>
      <div class="row"><button class="link" id="signout">Sign out</button></div>
    </section>`;

  document.getElementById("switch").onclick = () => { clearMember(); go("#/picker"); };
  document.getElementById("signout").onclick = signOut;
  document.getElementById("addEvent").onclick = () => openEventForm(null);
  document.getElementById("modeMine").onclick = () => { state.calMode = "individual"; state.selectedKey = null; renderCalendar(); };
  document.getElementById("modeAll").onclick = () => { state.calMode = "combined"; state.selectedKey = null; renderCalendar(); };
  el.querySelectorAll(".mchip").forEach((c) => {
    c.onclick = () => {
      const id = c.dataset.m;
      if (state.hiddenMembers.has(id)) state.hiddenMembers.delete(id); else state.hiddenMembers.add(id);
      renderCalendar();
    };
  });
  document.getElementById("prev").onclick = () => { state.viewMonth = new Date(vm.getFullYear(), vm.getMonth() - 1, 1); state.selectedKey = null; renderCalendar(); };
  document.getElementById("next").onclick = () => { state.viewMonth = new Date(vm.getFullYear(), vm.getMonth() + 1, 1); state.selectedKey = null; renderCalendar(); };
  document.getElementById("today").onclick = () => { state.viewMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1); state.selectedKey = todayKey; renderCalendar(); };
  el.querySelectorAll(".cal-cell").forEach((c) => {
    c.onclick = () => { const k = c.dataset.key; state.selectedKey = state.selectedKey === k ? null : k; renderCalendar(); };
  });

  // day list (filtered to selected day, else whole visible window)
  const dl = document.getElementById("daylist");
  const keys = Object.keys(byDay).sort();
  const showKeys = state.selectedKey ? (byDay[state.selectedKey] ? [state.selectedKey] : []) : keys;
  if (state.selectedKey && showKeys.length === 0) {
    dl.innerHTML = `<div class="daygroup"><h4>▾ ${esc(fmtDayHeader(new Date(state.selectedKey + "T00:00")))}</h4><p class="sub">No events. <button class="link" id="addHere">+ Add one</button></p></div>`;
    const a = document.getElementById("addHere"); if (a) a.onclick = () => openEventForm(null, state.selectedKey);
  } else if (showKeys.length === 0) {
    dl.innerHTML = `<p class="sub" style="text-align:center;margin-top:20px">No events this month.</p>`;
  } else {
    dl.innerHTML = showKeys.map((k) => {
      const items = byDay[k].slice().sort((a, b) => a.starts_at.localeCompare(b.starts_at)).map((inst) => {
        const m = inst.member_id ? state.membersById[inst.member_id] : null;
        const col = m ? colorFor(m.color) : ALL_COLOR;
        const who = m ? esc(m.name) : "All";
        const time = inst.all_day ? "All day" : fmtTime(inst.starts_at);
        const n = counts[inst.eventId] || 0;
        const rep = inst.isRecurring ? " 🔁" : "";
        return `<button class="ev" data-iid="${esc(inst.iid)}">
          <span class="evbar" style="background:${col}"></span>
          <span class="evtime">${time}</span>
          <span class="evtitle">${esc(inst.title)}${rep}</span>
          <span class="evwho" style="color:${col}">${who}${n ? ` · 📝${n}` : ""}</span>
        </button>`;
      }).join("");
      return `<div class="daygroup"><h4>▾ ${esc(fmtDayHeader(new Date(k + "T00:00")))}</h4>${items}</div>`;
    }).join("");
    dl.querySelectorAll(".ev").forEach((b) => {
      b.onclick = () => { const inst = instances.find((e) => e.iid === b.dataset.iid); openEventForm(inst); };
    });
  }
}

// ---- shared recurrence editor (used by event + task forms) -----------------
function recurSectionHTML(rui) {
  const wdBtns = WEEKDAYS.map((d, i) => `<button type="button" class="wd${rui.byday.includes(d) ? " on" : ""}" data-d="${d}">${["M","T","W","T","F","S","S"][i]}</button>`).join("");
  return `<div class="recur" id="recurBox">
    <label>Repeat</label>
    <select id="r_freq">
      <option value="none"${rui.freq === "none" ? " selected" : ""}>Does not repeat</option>
      <option value="DAILY"${rui.freq === "DAILY" ? " selected" : ""}>Daily</option>
      <option value="WEEKLY"${rui.freq === "WEEKLY" ? " selected" : ""}>Weekly</option>
      <option value="MONTHLY"${rui.freq === "MONTHLY" ? " selected" : ""}>Monthly</option>
      <option value="YEARLY"${rui.freq === "YEARLY" ? " selected" : ""}>Yearly</option>
    </select>
    <div id="r_opts" style="${rui.freq === "none" ? "display:none" : ""}">
      <label>Every</label>
      <div class="r_row"><input id="r_interval" type="number" min="1" value="${rui.interval}" /> <span id="r_unit">${FREQ_UNIT[rui.freq] || "week(s)"}</span></div>
      <div id="r_bydayrow" style="${rui.freq === "WEEKLY" ? "" : "display:none"}">
        <label>On</label><div class="wdrow" id="r_byday">${wdBtns}</div>
      </div>
      <label>Ends</label>
      <div class="r_end">
        <label class="inline"><input type="radio" name="r_end" value="never" ${rui.endType === "never" ? "checked" : ""}/> Never</label>
        <label class="inline"><input type="radio" name="r_end" value="until" ${rui.endType === "until" ? "checked" : ""}/> On <input id="r_until" type="date" value="${esc(rui.until)}"/></label>
        <label class="inline"><input type="radio" name="r_end" value="count" ${rui.endType === "count" ? "checked" : ""}/> After <input id="r_count" type="number" min="1" value="${esc(String(rui.count || ""))}"/> times</label>
      </div>
      <p class="rrule-preview">RRULE: <code id="r_preview">—</code></p>
    </div>
  </div>`;
}
function wireRecur(overlay) {
  const q = (id) => overlay.querySelector("#" + id);
  const read = () => ({
    freq: q("r_freq").value,
    interval: Math.max(1, parseInt(q("r_interval").value || "1", 10)),
    byday: [...overlay.querySelectorAll("#r_byday .wd.on")].map((b) => b.dataset.d),
    endType: (overlay.querySelector('input[name="r_end"]:checked') || {}).value || "never",
    until: q("r_until").value,
    count: q("r_count").value,
  });
  const refresh = () => {
    const ui = read();
    q("r_opts").style.display = ui.freq === "none" ? "none" : "";
    q("r_bydayrow").style.display = ui.freq === "WEEKLY" ? "" : "none";
    q("r_unit").textContent = FREQ_UNIT[ui.freq] || "";
    q("r_preview").textContent = buildRuleString(ui) || "Does not repeat";
  };
  q("r_freq").onchange = refresh;
  overlay.querySelectorAll("#r_byday .wd").forEach((b) => { b.onclick = () => { b.classList.toggle("on"); refresh(); }; });
  ["r_interval", "r_until", "r_count"].forEach((id) => q(id).addEventListener("input", refresh));
  overlay.querySelectorAll('input[name="r_end"]').forEach((r) => r.addEventListener("change", refresh));
  refresh();
  return { read, refresh };
}

// ---- Add / Edit event form + recurrence + notes (wireframe #4) -------------
function openEventForm(inst, presetDayKey) {
  const isEdit = !!inst;
  const base = inst ? inst.base : null;
  const isRecurring = !!(base && base.rrule);

  // default times for a new event
  let defStart, defEnd;
  if (presetDayKey) { defStart = new Date(presetDayKey + "T09:00"); defEnd = new Date(presetDayKey + "T10:00"); }
  else { defStart = new Date(); defStart.setMinutes(0, 0, 0); defStart.setHours(defStart.getHours() + 1); defEnd = new Date(defStart.getTime() + 60 * 60000); }
  const newSrc = { title: "", location: "", member_id: state.member.id, all_day: false, starts_at: defStart.toISOString(), ends_at: defEnd.toISOString() };

  const rui = parseRuleToUI(base ? base.rrule : null);
  const memberOpts = (sel) => `<option value="all"${sel === "all" || !sel ? " selected" : ""}>Whole family</option>` +
    state.members.map((m) => `<option value="${m.id}"${sel === m.id ? " selected" : ""}>${esc(m.name)}</option>`).join("");

  const overlay = document.createElement("div");
  overlay.className = "modal-overlay";
  overlay.innerHTML = `
    <form class="modal" id="evForm">
      <div class="modal-top">
        <button type="button" class="iconbtn" id="evClose">✕</button>
        <strong>${isEdit ? "Edit Event" : "New Event"}</strong>
        <button type="submit" id="evSave">Save</button>
      </div>
      <div class="modal-body">
        ${isEdit && isRecurring ? `<label>Apply to</label>
          <select id="ev_scope">
            <option value="this" selected>Only this occurrence</option>
            <option value="future">This and future</option>
            <option value="all">All occurrences</option>
          </select>` : ""}
        <label>Title</label>
        <input id="f_title" required placeholder="Dentist appointment" />
        <label>Who</label>
        <select id="f_who">${memberOpts(null)}</select>
        <label>Location</label>
        <input id="f_loc" placeholder="Optional" />
        <label class="inline"><input type="checkbox" id="f_allday" /> All day</label>
        <div id="timed">
          <label>Start</label><input id="f_start" type="datetime-local" />
          <label>End</label><input id="f_end" type="datetime-local" />
        </div>
        <div id="allday" style="display:none">
          <label>Date</label><input id="f_date" type="date" />
        </div>
        ${recurSectionHTML(rui)}
        <div class="err" id="evErr"></div>
        ${isEdit ? `<div class="notes">
          <label>📝 Notes (whole series)</label>
          <div id="noteList" class="notelist"><p class="sub">Loading…</p></div>
          <div class="noteadd"><input id="f_note" placeholder="Add note…" /><button type="button" id="noteBtn">↵</button></div>
        </div>` : ""}
      </div>
      ${isEdit ? `<div class="modal-foot">
        ${isRecurring ? `<button type="button" class="danger" id="evDelete">Delete…</button>
          <div id="delChoice" class="delchoice" style="display:none">
            <button type="button" id="delThis">This occurrence</button>
            <button type="button" id="delFuture">This &amp; future</button>
            <button type="button" class="danger" id="delAll">All events</button>
          </div>` : `<button type="button" class="danger" id="evDelete">Delete event</button>`}
      </div>` : ""}
    </form>`;
  document.body.appendChild(overlay);

  const close = () => overlay.remove();
  overlay.addEventListener("click", (e) => { if (e.target === overlay) close(); });
  document.getElementById("evClose").onclick = close;

  const $ = (id) => document.getElementById(id);
  const allDayCb = $("f_allday");

  // fill the editable fields from a source object {title,location,member_id,all_day,starts_at,ends_at}
  function fill(src) {
    $("f_title").value = src.title || "";
    $("f_loc").value = src.location || "";
    $("f_who").value = src.member_id || "all";
    const ad = !!src.all_day;
    allDayCb.checked = ad;
    $("timed").style.display = ad ? "none" : "";
    $("allday").style.display = ad ? "" : "none";
    if (ad) { $("f_date").value = toDateInput(src.starts_at); }
    else {
      $("f_start").value = toLocalInput(src.starts_at);
      $("f_end").value = src.ends_at ? toLocalInput(src.ends_at) : "";
    }
  }
  fill(isEdit ? inst : newSrc);

  allDayCb.onchange = () => {
    $("timed").style.display = allDayCb.checked ? "none" : "";
    $("allday").style.display = allDayCb.checked ? "" : "none";
  };

  // ----- recurrence editor (shared helper) -----
  const recurBox = $("recurBox");
  const readRecur = wireRecur(overlay).read;

  // ----- scope selector (recurring edit): re-prefill + show/hide recurrence -----
  const scopeSel = $("ev_scope");
  const setRecurVisible = (v) => { recurBox.style.display = v ? "" : "none"; };
  if (scopeSel) {
    setRecurVisible(false); // default scope = this occurrence
    scopeSel.onchange = () => {
      const s = scopeSel.value;
      fill(s === "all" ? base : inst);
      if (s !== "all") {} // recurrence pattern shown but dtstart only matters for all/future
      setRecurVisible(s !== "this");
    };
  }

  // read the editable time/title/who fields into a payload
  function readForm() {
    const title = $("f_title").value.trim();
    if (!title) return { err: "Title is required." };
    const whoSel = $("f_who").value;
    const member_id = whoSel === "all" ? null : whoSel;
    const location = $("f_loc").value.trim() || null;
    const isAllDay = allDayCb.checked;
    let starts_at, ends_at;
    if (isAllDay) {
      const dval = $("f_date").value;
      if (!dval) return { err: "Pick a date." };
      starts_at = new Date(dval + "T00:00").toISOString();
      ends_at = null;
    } else {
      const sv = $("f_start").value;
      if (!sv) return { err: "Pick a start time." };
      starts_at = new Date(sv).toISOString();
      const evv = $("f_end").value;
      ends_at = evv ? new Date(evv).toISOString() : null;
      if (ends_at && ends_at < starts_at) return { err: "End is before start." };
    }
    return { title, member_id, location, starts_at, ends_at, all_day: isAllDay };
  }

  $("evForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const err = $("evErr"); err.textContent = "";
    const f = readForm();
    if (f.err) { err.textContent = f.err; return; }
    const rule = buildRuleString(readRecur());
    const scope = scopeSel ? scopeSel.value : null;
    const save = $("evSave"); save.disabled = true; save.textContent = "Saving…";

    let res;
    if (!isEdit) {
      res = await createEvent({ title: f.title, member_id: f.member_id, location: f.location, starts_at: f.starts_at, ends_at: f.ends_at, all_day: f.all_day, rrule: rule });
    } else if (!isRecurring) {
      res = await updateEvent(base.id, { title: f.title, member_id: f.member_id, location: f.location, starts_at: f.starts_at, ends_at: f.ends_at, all_day: f.all_day, rrule: rule });
    } else if (scope === "this") {
      res = await overrideOccurrence(base, inst.occKey, { starts_at: f.starts_at, ends_at: f.ends_at, title: f.title, location: f.location });
    } else if (scope === "future") {
      res = await splitSeries(base, new Date(inst.occISO), { title: f.title, member_id: f.member_id, location: f.location, starts_at: f.starts_at, ends_at: f.ends_at, all_day: f.all_day, rrule: rule });
    } else { // all
      res = await updateEvent(base.id, { title: f.title, member_id: f.member_id, location: f.location, starts_at: f.starts_at, ends_at: f.ends_at, all_day: f.all_day, rrule: rule });
    }
    if (res && res.error) { err.textContent = res.error.message; save.disabled = false; save.textContent = "Save"; return; }
    close();
    renderCalendar();
  });

  if (isEdit) {
    const done = (r) => { if (r && r.error) { $("evErr").textContent = r.error.message; return; } close(); renderCalendar(); };
    if (isRecurring) {
      $("evDelete").onclick = () => { $("delChoice").style.display = "flex"; };
      $("delThis").onclick = async () => done(await addExdate(base, inst.occISO));
      $("delFuture").onclick = async () => done(await capSeries(base, new Date(new Date(inst.occISO).getTime() - 1000)));
      $("delAll").onclick = async () => { if (confirm("Delete the entire series?")) done(await deleteEvent(base.id)); };
    } else {
      $("evDelete").onclick = async () => { if (confirm("Delete this event?")) done(await deleteEvent(base.id)); };
    }

    loadNotes(base.id);
    const noteBtn = $("noteBtn"), noteInput = $("f_note");
    const submitNote = async () => {
      const body = noteInput.value.trim();
      if (!body) return;
      noteBtn.disabled = true;
      const { error } = await addNote(base.id, body);
      noteBtn.disabled = false;
      if (error) { $("evErr").textContent = error.message; return; }
      noteInput.value = "";
      loadNotes(base.id);
    };
    noteBtn.onclick = submitNote;
    noteInput.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); submitNote(); } });
  }
}

async function loadNotes(eventId) {
  const list = document.getElementById("noteList");
  if (!list) return;
  const { data, error } = await fetchNotes(eventId);
  if (error) { list.innerHTML = `<p class="err">${esc(error.message)}</p>`; return; }
  if (!data.length) { list.innerHTML = `<p class="sub">No notes yet.</p>`; return; }
  list.innerHTML = data.map((n) => {
    const a = state.membersById[n.author_member_id];
    const who = a ? esc(a.name) : "Someone";
    const col = a ? colorFor(a.color) : "#8A8178";
    return `<div class="note"><span class="noteauthor" style="color:${col}">${who}</span> ${esc(n.body)} <span class="notetime">${fmtTime(n.created_at)}</span></div>`;
  }).join("");
}

// ---- tasks / chores data layer (M3 one-off + M4 recurrence; no stars yet) --
const fetchTasks = () => supabase.from("tasks")
  .select("id,title,description,assigned_to,star_reward,due_date,rrule,exdates,is_active")
  .eq("is_active", true)
  .order("due_date", { ascending: true, nullsFirst: false })
  .order("created_at", { ascending: true });

// completed cells, keyed `${task_id}|${occurrence_date||''}` (one-off uses '')
async function fetchDoneMap(taskIds) {
  const set = new Set();
  if (!taskIds.length) return set;
  const { data, error } = await supabase.from("task_completions")
    .select("task_id,occurrence_date").in("task_id", taskIds);
  if (error) throw error;
  for (const r of data) set.add(`${r.task_id}|${r.occurrence_date ?? ""}`);
  return set;
}
const createTask = (p) => supabase.from("tasks").insert({ family_id: state.familyId, rrule: null, exdates: [], is_active: true, ...p }).select().single();
const updateTask = (id, p) => supabase.from("tasks").update(p).eq("id", id).select().single();
const deleteTask = (id) => supabase.from("tasks").delete().eq("id", id);
// completion records only — no star award (complete_task RPC is wired in M5).
const completeOcc = (task, occKey) => supabase.from("task_completions").insert({
  family_id: state.familyId, task_id: task.id,
  member_id: task.assigned_to || state.member.id, occurrence_date: occKey, star_awarded: 0,
});
const uncompleteOcc = (taskId, occKey) => {
  const q = supabase.from("task_completions").delete().eq("task_id", taskId);
  return occKey == null ? q.is("occurrence_date", null) : q.eq("occurrence_date", occKey);
};

// expand a task into due-occurrence date keys within [winStart, winEnd) (one-off -> [null])
function taskOccurrences(task, winStart, winEnd) {
  if (!task.rrule) return [null];
  const opts = RRule.parseString(task.rrule);
  opts.dtstart = task.due_date ? new Date(task.due_date + "T00:00:00Z") : winStart;
  const exSet = new Set((task.exdates || []).map((d) => (typeof d === "string" ? d.slice(0, 10) : dateKey(new Date(d)))));
  const keys = [];
  for (const occ of new RRule(opts).between(winStart, winEnd, true)) {
    if (occ.getTime() >= winEnd.getTime()) continue;        // winEnd is exclusive
    const k = dateKey(occ);
    if (!exSet.has(k)) keys.push(k);
  }
  return keys;
}

// ---- view: task / chore list (wireframe #5) --------------------------------
async function viewTasks() {
  await loadContext();
  if (!state.tasksFilter) state.tasksFilter = "all";
  await renderTasks();
  subscribeRealtime(["tasks", "task_completions"], () => renderTasks());
}

async function renderTasks() {
  const member = state.member;
  const winStart = new Date(); winStart.setHours(0, 0, 0, 0); winStart.setDate(winStart.getDate() - 14);
  const winEnd = new Date(); winEnd.setHours(0, 0, 0, 0); winEnd.setDate(winEnd.getDate() + 28);

  let tasks = [], doneMap = new Set(), loadErr = "";
  try {
    const { data, error } = await fetchTasks();
    if (error) throw error;
    tasks = data || [];
    doneMap = await fetchDoneMap(tasks.map((t) => t.id));
  } catch (e) { loadErr = e.message || String(e); }

  // one row per occurrence (one-off tasks have a single occ = null)
  state.pending = state.pending || new Set();
  const rows = [];
  for (const t of tasks) {
    for (const occ of taskOccurrences(t, winStart, winEnd)) {
      const cell = `${t.id}|${occ ?? ""}`;
      const serverDone = doneMap.has(cell);
      const pending = state.pending.has(cell);   // optimistic / queued, not yet synced
      rows.push({ task: t, occ, dueKey: occ ?? t.due_date ?? null, isDone: serverDone || pending, isPending: pending && !serverDone });
    }
  }
  rows.sort((a, b) => (a.dueKey || "9999-99-99").localeCompare(b.dueKey || "9999-99-99") || a.task.title.localeCompare(b.task.title));

  const filter = state.tasksFilter;
  const visible = rows.filter((r) => {
    if (filter === "mine") return r.task.assigned_to === member.id;
    if (filter === "open") return !r.isDone;
    if (filter === "done") return r.isDone;
    return true;
  });
  const chip = (key, label) => `<button class="chip${filter === key ? " on" : ""}" data-f="${key}">${label}</button>`;

  el.innerHTML = `
    <header class="topbar">
      <button class="iconbtn" id="switch" title="Switch profile">‹</button>
      <h1><span class="dot" style="background:${colorFor(member.color)}"></span>Chores</h1>
      <button id="addTask">+ Task</button>
    </header>
    <section class="content">
      ${navTabs("tasks")}
      <div class="chips">${chip("all", "All")}${chip("mine", "Mine")}${chip("open", "Open")}${chip("done", "Done")}</div>
      ${loadErr ? `<p class="err">${esc(loadErr)}</p>` : ""}
      <div class="tasklist" id="tasklist"></div>
      <div class="row"><button class="link" id="signout">Sign out</button></div>
    </section>`;

  document.getElementById("switch").onclick = () => { clearMember(); go("#/picker"); };
  document.getElementById("signout").onclick = signOut;
  document.getElementById("addTask").onclick = () => openTaskForm(null);
  el.querySelectorAll(".chip").forEach((c) => { c.onclick = () => { state.tasksFilter = c.dataset.f; renderTasks(); }; });

  const list = document.getElementById("tasklist");
  if (!visible.length) {
    list.innerHTML = `<p class="sub" style="text-align:center;margin-top:24px">No ${filter === "all" ? "" : esc(filter) + " "}tasks yet.</p>`;
    return;
  }
  list.innerHTML = visible.map((r, i) => {
    const t = r.task;
    const who = t.assigned_to ? state.membersById[t.assigned_to] : null;
    const whoName = who ? esc(who.name) : "Anyone";
    const whoCol = who ? colorFor(who.color) : "#8A8178";
    const star = t.star_reward > 0 ? `<span class="taskstar">⭐${t.star_reward}</span>` : "";
    const due = r.dueKey ? `<span class="taskdue">${esc(fmtDue(r.dueKey))}</span>` : "";
    const rep = t.rrule ? " 🔁" : "";
    const pend = r.isPending ? ` <span class="pendmark" title="Saved locally — will sync when online">⏳</span>` : "";
    return `<div class="task${r.isDone ? " done" : ""}">
      <button class="check${r.isDone ? " on" : ""}" data-i="${i}" aria-label="toggle complete">${r.isDone ? "✓" : ""}</button>
      <button class="taskmain" data-i="${i}">
        <span class="tasktitle">${esc(t.title)}${rep}${pend}</span>
        <span class="taskmeta"><span class="taskwho" style="color:${whoCol}">${whoName}</span>${star}${due}</span>
      </button>
    </div>`;
  }).join("");

  list.querySelectorAll(".check").forEach((b) => {
    b.onclick = () => {
      const r = visible[+b.dataset.i];
      if (r.isDone) return; // completion is final — stars are awarded, no un-earn
      const earner = r.task.assigned_to || state.member.id; // assignee earns; fall back to current
      // optimistic: queue locally (survives offline), reflect done immediately, then sync.
      // replay always goes through complete_task RPC — never a direct balance write.
      enqueueCompletion(r.task, r.occ, earner);
      if (r.task.star_reward > 0) starBurst(r.task.star_reward);
      renderTasks();
      flushQueue();
    };
  });
  list.querySelectorAll(".taskmain").forEach((b) => {
    b.onclick = () => { openTaskForm(visible[+b.dataset.i].task); };
  });
}

// ---- Add / Edit task form --------------------------------------------------
function openTaskForm(task) {
  const isEdit = !!task;
  const whoVal = task ? (task.assigned_to || "") : state.member.id;
  const rui = parseRuleToUI(task ? task.rrule : null);
  const memberOpts = `<option value=""${!whoVal ? " selected" : ""}>Anyone</option>` +
    state.members.map((m) => `<option value="${m.id}"${whoVal === m.id ? " selected" : ""}>${esc(m.name)}</option>`).join("");

  const overlay = document.createElement("div");
  overlay.className = "modal-overlay";
  overlay.innerHTML = `
    <form class="modal" id="taskForm">
      <div class="modal-top">
        <button type="button" class="iconbtn" id="tClose">✕</button>
        <strong>${isEdit ? "Edit Task" : "New Task"}</strong>
        <button type="submit" id="tSave">Save</button>
      </div>
      <div class="modal-body">
        <label>Title</label>
        <input id="t_title" required value="${esc(task?.title || "")}" placeholder="Take out trash" />
        <label>Description</label>
        <textarea id="t_desc" rows="2" placeholder="Optional details">${esc(task?.description || "")}</textarea>
        <label>Assignee</label>
        <select id="t_who">${memberOpts}</select>
        <label>Due date${rui.freq !== "none" ? " (first occurrence)" : ""}</label>
        <input id="t_due" type="date" value="${esc(task?.due_date || "")}" />
        <label>Star reward</label>
        <input id="t_star" type="number" min="0" step="1" value="${Number.isFinite(task?.star_reward) ? task.star_reward : 0}" />
        <p class="hint">Stars are awarded in a later milestone — this only sets the value.</p>
        ${recurSectionHTML(rui)}
        <div class="err" id="tErr"></div>
      </div>
      ${isEdit ? `<div class="modal-foot"><button type="button" class="danger" id="tDelete">Delete task</button></div>` : ""}
    </form>`;
  document.body.appendChild(overlay);
  const close = () => overlay.remove();
  overlay.addEventListener("click", (e) => { if (e.target === overlay) close(); });
  document.getElementById("tClose").onclick = close;
  const readRecur = wireRecur(overlay).read;

  document.getElementById("taskForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const err = document.getElementById("tErr"); err.textContent = "";
    const title = document.getElementById("t_title").value.trim();
    if (!title) { err.textContent = "Title is required."; return; }
    const assigned_to = document.getElementById("t_who").value || null;
    const description = document.getElementById("t_desc").value.trim() || null;
    const due_date = document.getElementById("t_due").value || null;
    let star_reward = parseInt(document.getElementById("t_star").value, 10);
    if (!Number.isFinite(star_reward) || star_reward < 0) star_reward = 0;
    const rrule = buildRuleString(readRecur());
    if (rrule && !due_date) { err.textContent = "Recurring tasks need a due date (first occurrence)."; return; }

    const save = document.getElementById("tSave"); save.disabled = true; save.textContent = "Saving…";
    const payload = { title, description, assigned_to, due_date, star_reward, rrule };
    const res = isEdit ? await updateTask(task.id, payload) : await createTask(payload);
    if (res.error) { err.textContent = res.error.message; save.disabled = false; save.textContent = "Save"; return; }
    close();
    renderTasks();
  });

  if (isEdit) {
    document.getElementById("tDelete").onclick = async () => {
      if (!confirm("Delete this task?")) return;
      const { error } = await deleteTask(task.id);
      if (error) { document.getElementById("tErr").textContent = error.message; return; }
      close();
      renderTasks();
    };
  }
}

// ---- M5: stars + rewards data layer ----------------------------------------
const fetchLeaderboard = () => supabase.from("family_members")
  .select("id,name,color,is_child,star_balance")
  .order("star_balance", { ascending: false }).order("sort_order", { ascending: true });
const fetchRewards = () => supabase.from("rewards")
  .select("id,title,emoji,star_cost,is_active").eq("is_active", true)
  .order("star_cost", { ascending: true });
const createReward = (p) => supabase.from("rewards").insert({ family_id: state.familyId, is_active: true, ...p }).select().single();
const updateReward = (id, p) => supabase.from("rewards").update(p).eq("id", id).select().single();
const deactivateReward = (id) => supabase.from("rewards").update({ is_active: false }).eq("id", id);
const fetchRedemptions = (memberId) => supabase.from("redemptions")
  .select("id,reward_id,star_cost,status,created_at").eq("member_id", memberId)
  .order("created_at", { ascending: false }).limit(20);

// ---- Realtime (live leaderboard / balance across devices) ------------------
function teardownRealtime() {
  if (state.channel) { supabase.removeChannel(state.channel); state.channel = null; }
}
async function subscribeRealtime(tables, onChange) {
  teardownRealtime();
  // RLS-filtered postgres_changes need the auth token on the realtime socket
  const { data: { session } } = await supabase.auth.getSession();
  if (session) supabase.realtime.setAuth(session.access_token);
  let ch = supabase.channel("fh-" + Math.random().toString(36).slice(2));
  for (const t of tables) ch = ch.on("postgres_changes", { event: "*", schema: "public", table: t }, onChange);
  state.channel = ch.subscribe();
}

// ---- animations ------------------------------------------------------------
function starBurst(amount) {
  const b = document.createElement("div");
  b.className = "starburst";
  b.textContent = `+${amount} ⭐`;
  for (let i = 0; i < 12; i++) {
    const s = document.createElement("span");
    s.className = "spark"; s.textContent = "⭐";
    s.style.setProperty("--dx", (Math.random() * 180 - 90) + "px");
    s.style.setProperty("--dy", (-Math.random() * 150 - 50) + "px");
    s.style.setProperty("--r", (Math.random() * 360) + "deg");
    b.appendChild(s);
  }
  document.body.appendChild(b);
  setTimeout(() => b.remove(), 1300);
}
function countUp(node, from, to, ms = 700) {
  from = +from || 0;
  const start = performance.now();
  (function step(t) {
    const p = Math.min(1, (t - start) / ms);
    node.textContent = Math.round(from + (to - from) * (1 - Math.pow(1 - p, 3)));
    if (p < 1) requestAnimationFrame(step);
  })(start);
}

// ---- view: Star Zone (wireframe #6) ----------------------------------------
async function viewStars() {
  await loadContext();
  await renderStars(true);
  subscribeRealtime(["family_members", "star_ledger"], () => renderStars(false));
}

async function renderStars(full) {
  const member = state.member;
  let board = [], err = "";
  try { const r = await fetchLeaderboard(); if (r.error) throw r.error; board = r.data || []; }
  catch (e) { err = e.message || String(e); }
  const me = board.find((m) => m.id === member.id) || { star_balance: 0 };
  const max = Math.max(1, ...board.map((m) => m.star_balance));

  if (full || !document.getElementById("balanceNum")) {
    el.innerHTML = `
      <header class="topbar">
        <button class="iconbtn" id="switch" title="Switch profile">‹</button>
        <h1><span class="dot" style="background:${colorFor(member.color)}"></span>${esc(member.name)}'s Stars</h1>
        <span style="width:36px"></span>
      </header>
      <section class="content">
        ${navTabs("stars")}
        ${err ? `<p class="err">${esc(err)}</p>` : ""}
        <div class="balcard">
          <div class="balnum"><span id="balanceNum">0</span></div>
          <div class="ballabel">⭐ stars</div>
        </div>
        <h4 class="lbh">🏆 Leaderboard</h4>
        <div class="leaderboard" id="leaderboard"></div>
        <button id="toRewards" class="big-cta">✨ Spend my stars → Rewards</button>
        <div class="row"><button class="link" id="signout">Sign out</button></div>
      </section>`;
    document.getElementById("switch").onclick = () => { clearMember(); go("#/picker"); };
    document.getElementById("signout").onclick = signOut;
    document.getElementById("toRewards").onclick = () => go("#/rewards");
    countUp(document.getElementById("balanceNum"), 0, me.star_balance);
    state._lastBalance = me.star_balance;
  } else {
    const node = document.getElementById("balanceNum");
    const prev = state._lastBalance ?? 0;
    if (me.star_balance !== prev) {
      countUp(node, prev, me.star_balance);
      if (me.star_balance > prev) starBurst(me.star_balance - prev);
      state._lastBalance = me.star_balance;
    }
  }

  const lb = document.getElementById("leaderboard");
  if (lb) lb.innerHTML = board.map((m, i) => {
    const col = colorFor(m.color);
    const pct = Math.round((m.star_balance / max) * 100);
    return `<div class="lbrow${m.id === member.id ? " meRow" : ""}">
      <span class="lbrank">${i + 1}.</span>
      <span class="lbname" style="color:${col}">${esc(m.name)}</span>
      <span class="lbkid">${m.is_child ? "kid" : "parent"}</span>
      <span class="lbbar"><i style="width:${pct}%;background:${col}"></i></span>
      <span class="lbval">⭐${m.star_balance}</span>
    </div>`;
  }).join("");
}

// ---- view: Rewards catalog + redeem (wireframe #7) -------------------------
async function viewRewards() {
  await loadContext();
  await renderRewards();
  subscribeRealtime(["family_members", "redemptions", "rewards"], () => renderRewards()); // gating + pending live
}

async function renderRewards() {
  const member = state.member;
  let rewards = [], board = [], reds = [], err = "";
  try {
    const [rw, bd, rd] = await Promise.all([fetchRewards(), fetchLeaderboard(), fetchRedemptions(member.id)]);
    if (rw.error) throw rw.error; if (bd.error) throw bd.error; if (rd.error) throw rd.error;
    rewards = rw.data || []; board = bd.data || []; reds = rd.data || [];
  } catch (e) { err = e.message || String(e); }
  const me = board.find((m) => m.id === member.id) || { star_balance: 0 };
  const bal = me.star_balance;
  const rewardsById = Object.fromEntries(rewards.map((r) => [r.id, r]));

  el.innerHTML = `
    <header class="topbar">
      <button class="iconbtn" id="back" title="Back to Stars">‹</button>
      <h1>Rewards</h1>
      <span class="who">⭐${bal}</span>
    </header>
    <section class="content">
      ${navTabs("stars")}
      ${err ? `<p class="err">${esc(err)}</p>` : ""}
      <div class="rewardgrid" id="rewardgrid"></div>
      <button class="ghost" id="addReward" style="margin-top:14px">+ Add reward</button>
      <h4 class="lbh">Your redemptions</h4>
      <div class="redlist" id="redlist"></div>
      <div class="row"><button class="link" id="signout">Sign out</button></div>
    </section>`;
  document.getElementById("back").onclick = () => go("#/stars");
  document.getElementById("signout").onclick = signOut;
  document.getElementById("addReward").onclick = () => openRewardForm(null);

  const grid = document.getElementById("rewardgrid");
  if (!rewards.length) grid.innerHTML = `<p class="sub">No rewards yet — add one below.</p>`;
  else grid.innerHTML = rewards.map((r) => {
    const afford = bal >= r.star_cost;
    return `<div class="rewardcard">
      <div class="rwemoji">${esc(r.emoji || "🎁")}</div>
      <div class="rwtitle">${esc(r.title)}</div>
      <div class="rwcost">⭐${r.star_cost}</div>
      <button class="rwbtn${afford ? "" : " locked"}" data-id="${r.id}" ${afford ? "" : "disabled"}>${afford ? "Redeem" : "Locked"}</button>
      <button class="link rwedit" data-id="${r.id}">edit</button>
    </div>`;
  }).join("");

  grid.querySelectorAll(".rwbtn").forEach((b) => {
    if (b.disabled) return;
    b.onclick = async () => {
      const r = rewardsById[b.dataset.id];
      if (!confirm(`Redeem "${r.title}" for ${r.star_cost} stars?`)) return;
      b.disabled = true;
      // atomic: checks balance >= cost under FOR UPDATE, inserts redemption + -ledger, decrements
      const { error } = await supabase.rpc("redeem_reward", { p_member: member.id, p_reward: r.id });
      if (error) {
        b.disabled = false;
        alert(/insufficient_stars/.test(error.message) ? "Not enough stars yet." : error.message);
        return;
      }
      renderRewards();
    };
  });
  grid.querySelectorAll(".rwedit").forEach((b) => { b.onclick = () => openRewardForm(rewardsById[b.dataset.id]); });

  const rl = document.getElementById("redlist");
  rl.innerHTML = reds.length ? reds.map((x) => {
    const rw = rewardsById[x.reward_id];
    return `<div class="redrow"><span>${rw ? esc(rw.title) : "Reward"}</span><span class="redcost">⭐${x.star_cost}</span><span class="redstatus s-${esc(x.status)}">${esc(x.status)}</span></div>`;
  }).join("") : `<p class="sub">No redemptions yet.</p>`;
}

function openRewardForm(reward) {
  const isEdit = !!reward;
  const overlay = document.createElement("div");
  overlay.className = "modal-overlay";
  overlay.innerHTML = `
    <form class="modal" id="rwForm">
      <div class="modal-top">
        <button type="button" class="iconbtn" id="rwClose">✕</button>
        <strong>${isEdit ? "Edit Reward" : "New Reward"}</strong>
        <button type="submit" id="rwSave">Save</button>
      </div>
      <div class="modal-body">
        <label>Emoji</label>
        <input id="rw_emoji" maxlength="4" value="${esc(reward?.emoji || "🎁")}" />
        <label>Title</label>
        <input id="rw_title" required value="${esc(reward?.title || "")}" placeholder="Game hour" />
        <label>Star cost</label>
        <input id="rw_cost" type="number" min="0" step="1" value="${Number.isFinite(reward?.star_cost) ? reward.star_cost : 10}" />
        <div class="err" id="rwErr"></div>
      </div>
      ${isEdit ? `<div class="modal-foot"><button type="button" class="danger" id="rwDelete">Remove reward</button></div>` : ""}
    </form>`;
  document.body.appendChild(overlay);
  const close = () => overlay.remove();
  overlay.addEventListener("click", (e) => { if (e.target === overlay) close(); });
  document.getElementById("rwClose").onclick = close;

  document.getElementById("rwForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const err = document.getElementById("rwErr"); err.textContent = "";
    const title = document.getElementById("rw_title").value.trim();
    if (!title) { err.textContent = "Title is required."; return; }
    let star_cost = parseInt(document.getElementById("rw_cost").value, 10);
    if (!Number.isFinite(star_cost) || star_cost < 0) star_cost = 0;
    const emoji = document.getElementById("rw_emoji").value.trim() || null;
    const save = document.getElementById("rwSave"); save.disabled = true; save.textContent = "Saving…";
    const payload = { title, emoji, star_cost };
    const res = isEdit ? await updateReward(reward.id, payload) : await createReward(payload);
    if (res.error) { err.textContent = res.error.message; save.disabled = false; save.textContent = "Save"; return; }
    close(); renderRewards();
  });
  if (isEdit) document.getElementById("rwDelete").onclick = async () => {
    if (!confirm("Remove this reward from the catalog?")) return;
    const { error } = await deactivateReward(reward.id);
    if (error) { document.getElementById("rwErr").textContent = error.message; return; }
    close(); renderRewards();
  };
}

// ---- M6: Finance Lite (wireframe #8) ---------------------------------------
const fetchExpenses = () => supabase.from("recurring_expenses")
  .select("id,name,amount,currency,category,rrule,next_due,paid_by,is_active")
  .eq("is_active", true).order("next_due", { ascending: true, nullsFirst: false });
const createExpense = (p) => supabase.from("recurring_expenses").insert({ family_id: state.familyId, is_active: true, ...p }).select().single();
const updateExpense = (id, p) => supabase.from("recurring_expenses").update(p).eq("id", id).select().single();
const deactivateExpense = (id) => supabase.from("recurring_expenses").update({ is_active: false }).eq("id", id);

const fmtMoney = (amt, cur) => {
  try { return new Intl.NumberFormat(undefined, { style: "currency", currency: cur || "USD" }).format(Number(amt) || 0); }
  catch { return `${cur || "USD"} ${(Number(amt) || 0).toFixed(2)}`; }
};
// normalise one expense's amount to a per-month figure (yearly ÷ 12, weekly × 4.348, …)
function monthlyFactor(rrule) {
  if (!rrule) return 0;                 // one-time expense: not part of the monthly recurring total
  const { freq, interval } = ruleParts(rrule);
  const n = interval || 1;
  if (freq === "DAILY") return 30.4375 / n;
  if (freq === "WEEKLY") return 4.348125 / n;
  if (freq === "MONTHLY") return 1 / n;
  if (freq === "YEARLY") return 1 / (12 * n);
  return 0;
}
// next due date on/after today (roll the rrule forward from next_due; one-off uses next_due as-is)
function expenseNextDue(exp, today) {
  if (!exp.next_due) return null;
  if (!exp.rrule) return exp.next_due;
  const opts = RRule.parseString(exp.rrule);
  opts.dtstart = new Date(exp.next_due + "T00:00:00Z");
  const occ = new RRule(opts).after(new Date(dateKey(today) + "T00:00:00Z"), true);
  return occ ? dateKey(occ) : null;
}
function cycleLabel(rrule) {
  if (!rrule) return "one-time";
  const { freq, interval } = ruleParts(rrule);
  if (interval === 1) return { DAILY: "daily", WEEKLY: "weekly", MONTHLY: "monthly", YEARLY: "yearly" }[freq] || "—";
  const unit = { DAILY: "day", WEEKLY: "week", MONTHLY: "month", YEARLY: "year" }[freq] || "?";
  return `every ${interval} ${unit}s`;
}

async function viewFinance() {
  await loadContext();
  await renderFinance();
}

async function renderFinance() {
  let exps = [], err = "";
  try { const r = await fetchExpenses(); if (r.error) throw r.error; exps = r.data || []; }
  catch (e) { err = e.message || String(e); }
  const today = new Date();

  // monthly total, grouped by currency (so mixed-currency families still make sense)
  const totals = {};
  for (const e of exps) {
    const cur = e.currency || "USD";
    totals[cur] = (totals[cur] || 0) + Number(e.amount) * monthlyFactor(e.rrule);
  }
  const totalStr = Object.keys(totals).length
    ? Object.entries(totals).map(([c, v]) => fmtMoney(v, c)).join("  +  ")
    : fmtMoney(0, "USD");

  // upcoming bills: next due per expense, sorted ascending
  const upcoming = exps.map((e) => ({ e, due: expenseNextDue(e, today) }))
    .filter((x) => x.due).sort((a, b) => a.due.localeCompare(b.due));

  const whoName = (id) => { const m = id ? state.membersById[id] : null; return m ? esc(m.name) : "—"; };
  const whoCol = (id) => { const m = id ? state.membersById[id] : null; return m ? colorFor(m.color) : "#8A8178"; };

  el.innerHTML = `
    <header class="topbar">
      <button class="iconbtn" id="switch" title="Switch profile">‹</button>
      <h1>Finance</h1>
      <button id="addExpense">+ Expense</button>
    </header>
    <section class="content">
      ${navTabs("finance")}
      ${err ? `<p class="err">${esc(err)}</p>` : ""}
      <div class="fintotal"><span class="finlabel">Monthly total</span><span class="finamt">${esc(totalStr)}</span></div>

      <h4 class="lbh">▾ Upcoming</h4>
      <div class="finlist" id="upcoming"></div>

      <h4 class="lbh">▾ All recurring</h4>
      <div class="finlist" id="allrec"></div>

      <div class="row"><button class="link" id="signout">Sign out</button></div>
    </section>`;
  document.getElementById("switch").onclick = () => { clearMember(); go("#/picker"); };
  document.getElementById("signout").onclick = signOut;
  document.getElementById("addExpense").onclick = () => openExpenseForm(null);

  const up = document.getElementById("upcoming");
  up.innerHTML = upcoming.length ? upcoming.map(({ e, due }) => `
    <div class="finrow">
      <span class="findue">${esc(fmtDue(due))}</span>
      <span class="finname">${esc(e.name)}</span>
      <span class="finpay" style="color:${whoCol(e.paid_by)}">${whoName(e.paid_by)}</span>
      <span class="finmoney">${esc(fmtMoney(e.amount, e.currency))}</span>
    </div>`).join("") : `<p class="sub">No upcoming bills.</p>`;

  const all = document.getElementById("allrec");
  all.innerHTML = exps.length ? exps.map((e) => `
    <button class="finrow finedit" data-id="${e.id}">
      <span class="finname">${esc(e.name)}${e.category ? ` <em class="fincat">${esc(e.category)}</em>` : ""}</span>
      <span class="fincycle">${esc(cycleLabel(e.rrule))}</span>
      <span class="finmoney">${esc(fmtMoney(e.amount, e.currency))}</span>
      <span class="finedithint">edit ›</span>
    </button>`).join("") : `<p class="sub">No expenses yet — add one.</p>`;
  all.querySelectorAll(".finedit").forEach((b) => { b.onclick = () => openExpenseForm(exps.find((x) => x.id === b.dataset.id)); });
}

function openExpenseForm(exp) {
  const isEdit = !!exp;
  const rui = isEdit ? parseRuleToUI(exp.rrule) : { freq: "MONTHLY", interval: 1, byday: [], endType: "never", until: "", count: "" };
  const CURRENCIES = ["USD", "EUR", "GBP", "EGP", "CAD", "AUD"];
  const curVal = exp?.currency || "USD";
  const curOpts = CURRENCIES.map((c) => `<option value="${c}"${c === curVal ? " selected" : ""}>${c}</option>`).join("");
  const payVal = exp?.paid_by || "";
  const payOpts = `<option value=""${!payVal ? " selected" : ""}>—</option>` +
    state.members.map((m) => `<option value="${m.id}"${payVal === m.id ? " selected" : ""}>${esc(m.name)}</option>`).join("");

  const overlay = document.createElement("div");
  overlay.className = "modal-overlay";
  overlay.innerHTML = `
    <form class="modal" id="expForm">
      <div class="modal-top">
        <button type="button" class="iconbtn" id="xClose">✕</button>
        <strong>${isEdit ? "Edit Expense" : "New Expense"}</strong>
        <button type="submit" id="xSave">Save</button>
      </div>
      <div class="modal-body">
        <label>Name</label>
        <input id="x_name" required value="${esc(exp?.name || "")}" placeholder="Rent" />
        <div class="r_row">
          <div style="flex:1"><label>Amount</label><input id="x_amount" type="number" min="0" step="0.01" required value="${esc(exp?.amount ?? "")}" placeholder="0.00" /></div>
          <div style="width:110px"><label>Currency</label><select id="x_cur">${curOpts}</select></div>
        </div>
        <label>Category</label>
        <input id="x_cat" value="${esc(exp?.category || "")}" placeholder="Housing, Utilities…" />
        <label>Paid by</label>
        <select id="x_pay">${payOpts}</select>
        <label>Next due</label>
        <input id="x_due" type="date" value="${esc(exp?.next_due || "")}" />
        ${recurSectionHTML(rui)}
        <div class="err" id="xErr"></div>
      </div>
      ${isEdit ? `<div class="modal-foot"><button type="button" class="danger" id="xDelete">Remove expense</button></div>` : ""}
    </form>`;
  document.body.appendChild(overlay);
  const close = () => overlay.remove();
  overlay.addEventListener("click", (e) => { if (e.target === overlay) close(); });
  document.getElementById("xClose").onclick = close;
  const readRecur = wireRecur(overlay).read;

  document.getElementById("expForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const err = document.getElementById("xErr"); err.textContent = "";
    const name = document.getElementById("x_name").value.trim();
    if (!name) { err.textContent = "Name is required."; return; }
    const amount = parseFloat(document.getElementById("x_amount").value);
    if (!Number.isFinite(amount) || amount < 0) { err.textContent = "Enter a valid amount."; return; }
    const currency = document.getElementById("x_cur").value;
    const category = document.getElementById("x_cat").value.trim() || null;
    const paid_by = document.getElementById("x_pay").value || null;
    const next_due = document.getElementById("x_due").value || null;
    const rrule = buildRuleString(readRecur());
    if (rrule && !next_due) { err.textContent = "Recurring expenses need a next-due date."; return; }

    const save = document.getElementById("xSave"); save.disabled = true; save.textContent = "Saving…";
    const payload = { name, amount, currency, category, paid_by, next_due, rrule };
    const res = isEdit ? await updateExpense(exp.id, payload) : await createExpense(payload);
    if (res.error) { err.textContent = res.error.message; save.disabled = false; save.textContent = "Save"; return; }
    close();
    renderFinance();
  });
  if (isEdit) document.getElementById("xDelete").onclick = async () => {
    if (!confirm("Remove this expense?")) return;
    const { error } = await deactivateExpense(exp.id);
    if (error) { document.getElementById("xErr").textContent = error.message; return; }
    close();
    renderFinance();
  };
}

async function signOut() {
  teardownRealtime();
  clearMember();
  state.familyId = null; state.members = null;
  await supabase.auth.signOut();
  go("#/");
}

// lightweight offline indicator (the ⏳ markers show which writes are queued)
function updateOnlineBanner() {
  let banner = document.getElementById("offlineBanner");
  if (!navigator.onLine) {
    if (!banner) {
      banner = document.createElement("div");
      banner.id = "offlineBanner"; banner.className = "offline-banner";
      banner.textContent = "Offline — changes are saved and will sync when you reconnect";
      document.body.prepend(banner);
    }
  } else if (banner) { banner.remove(); }
}
window.addEventListener("online", updateOnlineBanner);
window.addEventListener("offline", updateOnlineBanner);
updateOnlineBanner();

loadPending();   // restore any unsynced completions from a previous offline session
render();
flushQueue();    // replay the queue if we're online
