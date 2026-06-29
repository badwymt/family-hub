import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { RRule } from "https://esm.sh/rrule@2.8.1";
import { SUPABASE_URL, SUPABASE_ANON_KEY, SHARED_EMAIL, VAPID_PUBLIC_KEY } from "./config.js";

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
const MEMBER_KEY = "fh_current_member";

const COLORS = { blue: "#3D8BCD", green: "#3FA796", amber: "#E8A23D", pink: "#D4709B", red: "#E8595B", purple: "#C77DD8", teal: "#2FA6B0", indigo: "#7C83DB" };
const ALL_COLOR = "#B0A48F"; // whole-family events (warm taupe)
const colorFor = (c) => COLORS[c] || "#8A8178";
// avatar = emoji/initial stored in avatar_url (falls back to first letter of name)
const avatarHTML = (m, cls = "avatar") => {
  const a = m.avatar_url;
  const inner = a
    ? (/^https?:\/\//.test(a) ? `<img src="${esc(a)}" alt="" style="width:100%;height:100%;border-radius:50%;object-fit:cover" />` : esc(a))
    : esc(m.name?.[0] ?? "?");
  return `<span class="${cls}" style="background:${colorFor(m.color)}">${inner}</span>`;
};
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
  <a href="#/finance" class="${active === "finance" ? "on" : ""}">Finance</a>
  <a href="#/meals" class="${active === "meals" ? "on" : ""}">Meals</a>
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
    if (h.startsWith("#/tasks")) renderChores();
    else if (h.startsWith("#/stars")) renderStars(false);
  }
}
window.addEventListener("online", flushQueue);

// ---- web-push reminders (subscribe this device) ----------------------------
function urlB64ToUint8Array(b64) {
  const pad = "=".repeat((4 - (b64.length % 4)) % 4);
  const s = (b64 + pad).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(s); const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr;
}
async function enableReminders() {
  try {
    if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
      alert("This browser can't do reminders. On iPhone, add Hub to your Home Screen first (Share → Add to Home Screen), then try again.");
      return;
    }
    const perm = await Notification.requestPermission();
    if (perm !== "granted") { alert("Reminders weren't allowed. On iPhone, add Hub to your Home Screen, then enable notifications."); return; }
    await loadContext();
    const reg = await navigator.serviceWorker.ready;
    let sub = await reg.pushManager.getSubscription();
    if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlB64ToUint8Array(VAPID_PUBLIC_KEY) });
    const j = sub.toJSON();
    const { error } = await supabase.from("push_subscriptions").upsert(
      { family_id: state.familyId, member_id: (state.member && state.member.id) || null, endpoint: j.endpoint, p256dh: j.keys.p256dh, auth: j.keys.auth },
      { onConflict: "endpoint" }
    );
    if (error) { alert("Couldn't save the subscription: " + error.message); return; }
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (state.familyId && tz) await supabase.from("families").update({ tz }).eq("id", state.familyId);
    localStorage.setItem("fh_notif", "1");
    alert("🔔 Reminders are on for this device.");
    render();
  } catch (e) { alert("Couldn't enable reminders: " + (e.message || e)); }
}
// "Follow the active profile": re-point this device's subscription to whoever is now selected.
async function syncSubscriptionMember() {
  try {
    if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) return;
    if (Notification.permission !== "granted") return;
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    if (!sub) return;
    const m = getMember();
    if (!m) return;
    await loadContext();
    if (!state.familyId) return;
    const j = sub.toJSON();
    await supabase.from("push_subscriptions").upsert(
      { family_id: state.familyId, member_id: m.id, endpoint: j.endpoint, p256dh: j.keys.p256dh, auth: j.keys.auth },
      { onConflict: "endpoint" }
    );
  } catch (_) { /* best-effort */ }
}
if ("serviceWorker" in navigator) navigator.serviceWorker.addEventListener("message", (e) => {
  if (e.data && e.data.type === "navigate" && e.data.url) { const h = e.data.url.indexOf("#"); if (h >= 0) location.hash = e.data.url.slice(h); }
});

// ---- router ----------------------------------------------------------------
let rendering = false;
async function render() {
  if (rendering) return;
  rendering = true;
  try {
    teardownRealtime(); // drop any live subscription when navigating
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return viewLogin();
    if (!state._subSynced && getMember()) { state._subSynced = true; syncSubscriptionMember(); }

    const route = location.hash || "#/";
    const needMember = (fn) => { const m = getMember(); if (!m) return go("#/picker"); state.member = m; return fn(); };
    if (route.startsWith("#/home")) return needMember(viewCalendar);
    if (route.startsWith("#/tasks")) return needMember(viewTasks);
    if (route.startsWith("#/stars") || route.startsWith("#/rewards")) return go("#/tasks");
    if (route.startsWith("#/finance")) return needMember(viewFinance);
    if (route.startsWith("#/meals")) return needMember(viewMeals);
    if (route.startsWith("#/family")) return viewFamily();
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
        <div style="text-align:center;margin-top:18px;display:flex;gap:14px;justify-content:center">
          <button class="link" id="manage">⚙ Manage family</button>
          <button class="link" id="signout">Sign out</button>
        </div>
      </div>
    </div>`;
  document.getElementById("signout").onclick = signOut;
  document.getElementById("manage").onclick = () => go("#/family");

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
      ${avatarHTML(m)}
      <span>${esc(m.name)}</span>
      <span class="role">${m.is_child ? "Kid" : "Parent"}</span>`;
    b.onclick = () => { setMember({ id: m.id, name: m.name, color: m.color, is_child: m.is_child, avatar_url: m.avatar_url }); syncSubscriptionMember(); go("#/home"); };
    tiles.appendChild(b);
  }
}

// ---- view: family / member management (edit names, colors, avatars) --------
const updateMember = (id, p) => supabase.from("family_members").update(p).eq("id", id).select().single();
const createMember = (p) => supabase.from("family_members").insert({ family_id: state.familyId, star_balance: 0, ...p }).select().single();

async function viewFamily() {
  await loadContext();
  el.innerHTML = `
    <header class="topbar">
      <button class="iconbtn" id="back" title="Back">‹</button>
      <h1>Family members</h1>
      <button id="addMember">+ Add</button>
    </header>
    <section class="content">
      <p class="sub" style="text-align:left;margin:0 0 16px">Edit names, colours and avatars. Changes show up everywhere.</p>
      <div id="memlist"></div>
      <div class="row"><button class="link" id="toPicker">← Back to profiles</button></div>
    </section>`;
  document.getElementById("back").onclick = () => go("#/picker");
  document.getElementById("toPicker").onclick = () => go("#/picker");
  document.getElementById("addMember").onclick = () => openMemberForm(null);

  const list = document.getElementById("memlist");
  list.innerHTML = state.members.map((m) => `
    <div class="memrow">
      ${avatarHTML(m, "avatar sm")}
      <div class="meminfo">
        <div class="mn">${esc(m.name)}</div>
        <div class="mr">${m.is_child ? "Kid" : "Parent"} · <span class="dot" style="background:${colorFor(m.color)};width:9px;height:9px"></span> ${esc(m.color)}</div>
      </div>
      <button class="ghost meminfo-edit" data-id="${m.id}">Edit</button>
    </div>`).join("") || `<p class="sub">No members yet.</p>`;
  list.querySelectorAll(".meminfo-edit").forEach((b) => {
    b.onclick = () => openMemberForm(state.members.find((m) => m.id === b.dataset.id));
  });
}

function openMemberForm(member) {
  const isEdit = !!member;
  const cur = member || { name: "", color: "blue", is_child: false, avatar_url: "" };
  const swatches = Object.entries(COLORS).map(([name, hex]) =>
    `<button type="button" class="swatch${name === cur.color ? " sel" : ""}" data-c="${name}" style="background:${hex}" title="${name}"></button>`).join("");

  const overlay = document.createElement("div");
  overlay.className = "modal-overlay";
  overlay.innerHTML = `
    <form class="modal" id="memForm">
      <div class="modal-top">
        <button type="button" class="iconbtn" id="mClose">✕</button>
        <strong>${isEdit ? "Edit member" : "New member"}</strong>
        <button type="submit" id="mSave">Save</button>
      </div>
      <div class="modal-body">
        <div style="display:flex;justify-content:center;margin:6px 0 4px" id="mPreview">${avatarHTML(cur, "avatar")}</div>
        <label>Name</label>
        <input id="m_name" required value="${esc(cur.name)}" placeholder="Sam" />
        <label>Colour</label>
        <div class="swatchrow" id="m_colors">${swatches}</div>
        <label>Avatar (emoji or a single letter)</label>
        <input id="m_avatar" maxlength="8" value="${esc(cur.avatar_url || "")}" placeholder="🙂 (leave blank for initials)" />
        <label class="inline"><input type="checkbox" id="m_child" ${cur.is_child ? "checked" : ""} /> This member is a kid</label>
        <div class="err" id="mErr"></div>
      </div>
    </form>`;
  document.body.appendChild(overlay);
  const close = () => overlay.remove();
  overlay.addEventListener("click", (e) => { if (e.target === overlay) close(); });
  document.getElementById("mClose").onclick = close;

  let chosen = cur.color;
  const preview = () => { document.getElementById("mPreview").innerHTML = avatarHTML({ color: chosen, avatar_url: document.getElementById("m_avatar").value, name: document.getElementById("m_name").value }, "avatar"); };
  overlay.querySelectorAll(".swatch").forEach((s) => {
    s.onclick = () => { chosen = s.dataset.c; overlay.querySelectorAll(".swatch").forEach((x) => x.classList.toggle("sel", x === s)); preview(); };
  });
  document.getElementById("m_avatar").addEventListener("input", preview);
  document.getElementById("m_name").addEventListener("input", preview);

  document.getElementById("memForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const err = document.getElementById("mErr"); err.textContent = "";
    const name = document.getElementById("m_name").value.trim();
    if (!name) { err.textContent = "Name is required."; return; }
    const payload = {
      name, color: chosen, is_child: document.getElementById("m_child").checked,
      avatar_url: document.getElementById("m_avatar").value.trim() || null,
    };
    const save = document.getElementById("mSave"); save.disabled = true; save.textContent = "Saving…";
    let res;
    if (isEdit) res = await updateMember(member.id, payload);
    else res = await createMember({ ...payload, sort_order: state.members.length });
    if (res.error) { err.textContent = res.error.message; save.disabled = false; save.textContent = "Save"; return; }
    // if the edited member is the one we're acting as, refresh the cached identity
    const cm = getMember();
    if (cm && isEdit && cm.id === member.id) setMember({ ...cm, name: payload.name, color: payload.color, is_child: payload.is_child, avatar_url: payload.avatar_url });
    state.members = null; // bust context cache so avatars/colours reload
    close();
    viewFamily();
  });
}

// ---- data layer (all reads/writes go through RLS) --------------------------
async function loadContext() {
  if (state.familyId && state.members) return;
  const { data: fam } = await supabase.from("families").select("id").limit(1).maybeSingle();
  state.familyId = fam?.id ?? null;
  const { data: mem } = await supabase.from("family_members").select("id,name,color,is_child,avatar_url,sort_order").order("sort_order");
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
  if (ui.freq !== "custom") return assembleRule({ freq: ui.freq, interval: 1, byday: [] });
  const until = ui.endType === "until" && ui.until ? toRRuleUntil(ui.until) : null;
  const count = ui.endType === "count" && ui.count ? parseInt(ui.count, 10) : null;
  return assembleRule({ freq: ui.custFreq || "WEEKLY", interval: ui.interval, byday: ui.byday }, until, count);
};
function parseRuleToUI(ruleStr) {
  const ui = { freq: "none", custFreq: "WEEKLY", interval: 1, byday: [], endType: "never", until: "", count: "" };
  if (!ruleStr) return ui;
  const o = RRule.parseString(ruleStr);
  const fname = FREQ_NAME[o.freq] || "WEEKLY";
  const interval = o.interval || 1;
  const byday = o.byweekday ? [].concat(o.byweekday).map((w) => WEEKDAYS[typeof w === "number" ? w : w.weekday]) : [];
  let endType = "never", until = "", count = "";
  if (o.until) { endType = "until"; until = toDateInput(o.until.toISOString()); }
  else if (o.count) { endType = "count"; count = o.count; }
  // a simple every-1, no-byday, no-end rule maps to a preset; anything else is "custom"
  if (interval === 1 && byday.length === 0 && endType === "never") { ui.freq = fname; }
  else { ui.freq = "custom"; ui.custFreq = fname; ui.interval = interval; ui.byday = byday; ui.endType = endType; ui.until = until; ui.count = count; }
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
const EVENT_COLS = "id,title,location,member_id,starts_at,ends_at,all_day,rrule,exdates,reminder_minutes";
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
    reminder_minutes: form.reminder_minutes ?? null,
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

// ---- day/week view helpers (Phase 3) ---------------------------------------
const HOURPX = 56;
const hourFloat = (iso) => { const d = new Date(iso); return d.getHours() + d.getMinutes() / 60; };
const startOfWeek = (d) => { const x = new Date(d); x.setHours(0, 0, 0, 0); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return x; };

async function viewCalendar() {
  await loadContext();
  const now = new Date();
  if (!state.viewMonth) state.viewMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  if (!state.viewDay) state.viewDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (!state.calView) state.calView = "day";
  if (!state.calMode) state.calMode = "individual";
  if (!state.hiddenMembers) state.hiddenMembers = new Set();
  await renderCalendar();
  subscribeRealtime(["events", "event_overrides", "event_notes", "meals", "tasks", "task_completions"], () => renderCalendar());
}

function shiftCal(dir) {
  if (state.calView === "month") state.viewMonth = new Date(state.viewMonth.getFullYear(), state.viewMonth.getMonth() + dir, 1);
  else { const d = new Date(state.viewDay); d.setDate(d.getDate() + dir * (state.calView === "week" ? 7 : 1)); state.viewDay = d; }
  renderCalendar();
}

async function renderCalendar() {
  const member = state.member;
  const view = state.calView;
  const todayKey = dateKey(new Date());

  // window for the active view
  let winStart, winEnd, headerLabel, weeks = null;
  if (view === "month") {
    const vm = state.viewMonth;
    weeks = monthMatrix(vm.getFullYear(), vm.getMonth());
    winStart = weeks[0][0];
    winEnd = new Date(weeks[5][6]); winEnd.setDate(winEnd.getDate() + 1);
    headerLabel = `${MONTHS[vm.getMonth()]} ${vm.getFullYear()}`;
  } else if (view === "week") {
    const ws = startOfWeek(state.viewDay);
    winStart = new Date(ws);
    winEnd = new Date(ws); winEnd.setDate(winEnd.getDate() + 7);
    const we = new Date(ws); we.setDate(we.getDate() + 6);
    headerLabel = `${MONTHS[ws.getMonth()].slice(0, 3)} ${ws.getDate()} – ${MONTHS[we.getMonth()].slice(0, 3)} ${we.getDate()}`;
  } else {
    winStart = new Date(state.viewDay); winStart.setHours(0, 0, 0, 0);
    winEnd = new Date(winStart); winEnd.setDate(winEnd.getDate() + 1);
    headerLabel = fmtDayHeader(state.viewDay);
  }

  let instances = [], counts = {}, loadErr = "";
  try {
    instances = await fetchInstances(winStart, winEnd, "combined");
    counts = await fetchNoteCounts([...new Set(instances.map((e) => e.eventId))]);
  } catch (e) { loadErr = e.message || String(e); }

  if (state.hiddenMembers.size) {
    instances = instances.filter((i) => i.member_id == null || !state.hiddenMembers.has(i.member_id));
  }
  const byDay = {};
  for (const inst of instances) (byDay[inst.occKey] = byDay[inst.occKey] || []).push(inst);

  // meals overlaid on the calendar (same data the Meals tab manages)
  const mealsByDay = {};
  try {
    const lastDay = new Date(winEnd.getTime() - 86400000);
    const mr = await fetchMealsRange(dateKey(winStart), dateKey(lastDay));
    for (const m of (mr.data || [])) (mealsByDay[m.day] = mealsByDay[m.day] || []).push(m);
  } catch (e) {}

  // calendar tasks (kind='task') overlaid by due date; overdue rolled onto today
  let taskCellsByDay = {}, overdue = [];
  try {
    const tr = await fetchTasks();
    const allT = (tr.data || []).filter((t) => t.kind === "task");
    const dmap = await fetchDoneMap(allT.map((t) => t.id));
    for (const c of taskCells(allT, dmap, winStart, winEnd)) (taskCellsByDay[c.dueKey] = taskCellsByDay[c.dueKey] || []).push(c);
    overdue = overdueCells(allT, dmap, todayKey);
  } catch (e) {}
  if (view === "tasks") headerLabel = "Tasks";

  const vseg = (v, label) => `<button class="seg${view === v ? " on" : ""}" data-v="${v}">${label}</button>`;
  el.innerHTML = `
    <header class="topbar">
      <button class="iconbtn" id="switch" title="Switch profile">‹</button>
      <h1>Calendar</h1>
      <button id="addEvent">+ Event</button>
    </header>
    <section class="content">
      ${navTabs("home")}
      <div class="viewseg">${vseg("day", "Day")}${vseg("week", "Week")}${vseg("month", "Month")}${vseg("tasks", "Tasks")}</div>
      <div class="chips memberchips">${state.members.map((m) => `
        <button class="chip mchip${state.hiddenMembers.has(m.id) ? "" : " on"}" data-m="${m.id}">
          ${avatarHTML(m, "favatar")}${esc(m.name)}
        </button>`).join("")}</div>
      <div class="calnav">
        <button class="iconbtn" id="prev">‹</button>
        <strong>${esc(headerLabel)}</strong>
        <button class="iconbtn" id="next">›</button>
        <button class="link" id="today">Today</button>
      </div>
      ${loadErr ? `<p class="err">${esc(loadErr)}</p>` : ""}
      ${(typeof Notification !== "undefined" && Notification.permission !== "granted") ? `<button class="link" id="enableNotif" style="display:block;margin:0 auto 12px;color:var(--accent);font-weight:700">🔔 Turn on reminders on this device</button>` : ""}
      <div id="calbody"></div>
      ${view !== "month" ? `<button class="fab" id="fab" title="Add event">＋</button>` : ""}
      <div class="row"><button class="link" id="signout">Sign out</button></div>
    </section>`;

  document.getElementById("switch").onclick = () => { clearMember(); go("#/picker"); };
  document.getElementById("signout").onclick = signOut;
  document.getElementById("addEvent").onclick = () => view === "tasks" ? openTaskItemForm(null, null, dateKey(new Date())) : openEventForm(null, view === "month" ? null : dateKey(state.viewDay));
  const fab = document.getElementById("fab"); if (fab) fab.onclick = () => view === "tasks" ? openTaskItemForm(null, null, dateKey(new Date())) : openEventForm(null, dateKey(state.viewDay));
  el.querySelectorAll(".mchip").forEach((c) => {
    c.onclick = () => {
      const id = c.dataset.m;
      if (state.hiddenMembers.has(id)) state.hiddenMembers.delete(id); else state.hiddenMembers.add(id);
      renderCalendar();
    };
  });
  el.querySelectorAll(".viewseg .seg").forEach((b) => { b.onclick = () => { state.calView = b.dataset.v; renderCalendar(); }; });
  document.getElementById("prev").onclick = () => shiftCal(-1);
  document.getElementById("next").onclick = () => shiftCal(1);
  document.getElementById("today").onclick = () => {
    const n = new Date();
    state.viewDay = new Date(n.getFullYear(), n.getMonth(), n.getDate());
    state.viewMonth = new Date(n.getFullYear(), n.getMonth(), 1);
    renderCalendar();
  };
  const enBtn = document.getElementById("enableNotif"); if (enBtn) enBtn.onclick = enableReminders;

  const body = document.getElementById("calbody");
  if (view === "day") renderDayBody(body, byDay, instances, mealsByDay, taskCellsByDay, overdue);
  else if (view === "week") renderWeekBody(body, byDay, instances, mealsByDay, taskCellsByDay);
  else if (view === "tasks") renderTasksView(body);
  else renderMonthBody(body, weeks, byDay, todayKey, taskCellsByDay);
}

// ---- day view: events + tasks; window starts at first item or 9am ----------
function renderDayBody(body, byDay, instances, mealsByDay, taskCellsByDay, overdue) {
  const dayKey = dateKey(state.viewDay);
  const isToday = dayKey === dateKey(new Date());
  const dayInsts = (byDay[dayKey] || []);
  const timed = dayInsts.filter((i) => !i.all_day);
  const allday = dayInsts.filter((i) => i.all_day);
  const dayMeals = (mealsByDay && mealsByDay[dayKey]) || [];
  const dayTasks = (taskCellsByDay && taskCellsByDay[dayKey]) || [];
  const taskHour = (c) => { const p = c.due_time.split(":"); return (+p[0]) + ((+p[1]) || 0) / 60; };
  const timedTasks = dayTasks.filter((c) => c.due_time);
  const dateTasks = dayTasks.filter((c) => !c.due_time);
  const od = isToday ? (overdue || []) : [];

  // window: earlier of the first event/task or 9am; else 9am–11pm
  const allStarts = timed.map((i) => hourFloat(i.starts_at)).concat(timedTasks.map(taskHour));
  const allEnds = timed.map((i) => (i.ends_at ? hourFloat(i.ends_at) : hourFloat(i.starts_at) + 1)).concat(timedTasks.map((c) => taskHour(c) + 0.5));
  let startH, endH;
  if (allStarts.length) {
    startH = Math.max(0, Math.min(9, Math.floor(Math.min(...allStarts))));
    endH = Math.min(24, Math.max(23, Math.ceil(Math.max(...allEnds))));
  } else { startH = 9; endH = 23; }

  let rows = "";
  for (let h = startH; h < endH; h++) {
    const hr = (h % 12) || 12, ap = h < 12 ? "am" : "pm";
    rows += `<div class="hourrow"><span class="hourlbl">${hr} ${ap}</span><div class="hourslot" data-h="${h}"></div></div>`;
  }

  // lay overlapping events into side-by-side columns
  timed.forEach((e) => { e._s = hourFloat(e.starts_at); e._e = e.ends_at ? hourFloat(e.ends_at) : e._s + 1; });
  const layout = (cl) => {
    const colEnds = [];
    cl.forEach((e) => { let c = 0; for (; c < colEnds.length; c++) { if (e._s >= colEnds[c] - 0.0001) break; } e._col = c; colEnds[c] = e._e; });
    cl.forEach((e) => (e._cols = colEnds.length));
  };
  let cluster = [], clusterEnd = -1;
  timed.forEach((e) => { if (cluster.length && e._s >= clusterEnd - 0.0001) { layout(cluster); cluster = []; clusterEnd = -1; } cluster.push(e); clusterEnd = Math.max(clusterEnd, e._e); });
  if (cluster.length) layout(cluster);

  const blocks = timed.map((inst) => {
    const m = inst.member_id ? state.membersById[inst.member_id] : null;
    const col = m ? colorFor(m.color) : ALL_COLOR;
    const top = (inst._s - startH) * HOURPX + 2;
    const height = Math.max(22, (inst._e - inst._s) * HOURPX - 4);
    const cols = inst._cols || 1, ci = inst._col || 0;
    const leftPct = (ci / cols) * 100, widPct = (1 / cols) * 100;
    const rep = inst.isRecurring ? " 🔁" : "";
    const tm = `${fmtTime(inst.starts_at)}${inst.ends_at ? "–" + fmtTime(inst.ends_at) : ""}`;
    const glyph = m ? (m.avatar_url && !/^https?:\/\//.test(m.avatar_url) ? esc(m.avatar_url) : esc((m.name[0] || "?"))) : "";
    const badge = (m && cols < 2) ? `<span class="bav">${glyph}</span>` : "";
    return `<div class="evblock" data-iid="${esc(inst.iid)}" style="top:${top}px;height:${height}px;left:calc(${leftPct}% + 3px);width:calc(${widPct}% - 6px);background:${col}">
      <div class="bt">${esc(inst.title)}${rep}</div><div class="btime">${tm}</div>${badge}</div>`;
  }).join("");

  const taskBlocks = timedTasks.map((c) => {
    const m = c.task.assigned_to ? state.membersById[c.task.assigned_to] : null;
    const col = m ? colorFor(m.color) : "#8A8178";
    const top = (taskHour(c) - startH) * HOURPX + 2;
    return `<div class="evblock taskblock${c.done ? " done" : ""}" data-tid="${c.task.id}" data-occ="${c.occ ?? ""}" style="top:${top}px;border-left-color:${col}">
      <span class="tck" data-tid="${c.task.id}" data-occ="${c.occ ?? ""}">${c.done ? "✓" : ""}</span><span class="tbt">${esc(c.task.title)} · ${c.due_time.slice(0, 5)}</span></div>`;
  }).join("");

  let nowLine = "";
  if (isToday) {
    const nowH = hourFloat(new Date().toISOString());
    if (nowH >= startH && nowH <= endH) nowLine = `<div class="nowline" style="top:${(nowH - startH) * HOURPX}px"></div>`;
  }

  const taskChip = (c) => {
    const m = c.task.assigned_to ? state.membersById[c.task.assigned_to] : null;
    const col = m ? colorFor(m.color) : "#8A8178";
    return `<span class="taskchip${c.done ? " done" : ""}" data-tid="${c.task.id}" data-occ="${c.occ ?? ""}" style="border-left-color:${col}"><span class="tck" data-tid="${c.task.id}" data-occ="${c.occ ?? ""}">${c.done ? "✓" : ""}</span>${esc(c.task.title)}</span>`;
  };

  body.innerHTML = `
    ${(allday.length || dayMeals.length || dateTasks.length || od.length) ? `<div class="alldaystrip"><span class="lbl">All day · tasks</span>${
      od.length ? `<span class="overduechip" id="overdueChip">⚠ Overdue (${od.length})</span>` : ""
    }${dayMeals.map((m) => `<span class="mealchip" style="background:${MEAL_COLOR}">🍴 ${esc(m.meal_type)} — ${esc(m.title)}</span>`).join("")
    }${dateTasks.map(taskChip).join("")
    }${allday.map((i) => {
      const m = i.member_id ? state.membersById[i.member_id] : null; const col = m ? colorFor(m.color) : ALL_COLOR;
      return `<span class="adchip" data-iid="${esc(i.iid)}" style="background:${col}">${esc(i.title)}</span>`;
    }).join("")}</div>` : ""}
    <div class="dayscroll"><div class="daygrid">${rows}<div class="evlayer">${blocks}${taskBlocks}${nowLine}</div></div></div>`;

  body.querySelectorAll(".evblock:not(.taskblock),.adchip").forEach((b) => {
    b.onclick = () => { const inst = instances.find((e) => e.iid === b.dataset.iid); if (inst) openEventForm(inst); };
  });
  body.querySelectorAll(".mealchip").forEach((c) => { c.onclick = () => go("#/meals"); });
  const allCells = dayTasks.concat(od);
  const findCell = (id, occ) => allCells.find((c) => c.task.id === id && String(c.occ ?? "") === occ);
  body.querySelectorAll(".tck").forEach((b) => { b.onclick = (e) => { e.stopPropagation(); const c = findCell(b.dataset.tid, b.dataset.occ); if (c && !c.done) { completeTaskCell(c); renderCalendar(); } }; });
  body.querySelectorAll(".taskchip,.taskblock").forEach((b) => { b.onclick = () => { const c = findCell(b.dataset.tid, b.dataset.occ); if (c) openTaskItemForm(c.task, c.occ ?? null); }; });
  const oc = document.getElementById("overdueChip"); if (oc) oc.onclick = () => { state.calView = "tasks"; renderCalendar(); };
  body.querySelectorAll(".hourslot").forEach((s) => { s.onclick = () => openEventForm(null, dayKey); });
}

// ---- week view: 7 day columns with event chips -----------------------------
function renderWeekBody(body, byDay, instances, mealsByDay, taskCellsByDay) {
  const ws = startOfWeek(state.viewDay);
  const todayKey = dateKey(new Date());
  let cols = "";
  for (let i = 0; i < 7; i++) {
    const d = new Date(ws); d.setDate(d.getDate() + i);
    const k = dateKey(d);
    const evs = (byDay[k] || []).slice().sort((a, b) => (a.all_day === b.all_day ? a.starts_at.localeCompare(b.starts_at) : (a.all_day ? -1 : 1)));
    const chips = evs.map((inst) => {
      const m = inst.member_id ? state.membersById[inst.member_id] : null;
      const col = m ? colorFor(m.color) : ALL_COLOR;
      const t = inst.all_day ? "" : fmtTime(inst.starts_at) + " ";
      return `<div class="wkev" data-iid="${esc(inst.iid)}" style="background:${col}">${t}${esc(inst.title)}</div>`;
    }).join("");
    const mealChips = ((mealsByDay && mealsByDay[k]) || []).map((m) => `<div class="wkev mealwk" style="background:${MEAL_COLOR}">🍴 ${esc(m.title)}</div>`).join("");
    const taskChips = ((taskCellsByDay && taskCellsByDay[k]) || []).map((c) => {
      const m = c.task.assigned_to ? state.membersById[c.task.assigned_to] : null;
      const col = m ? colorFor(m.color) : "#8A8178";
      return `<div class="wkev wktask${c.done ? " done" : ""}" data-tid="${c.task.id}" data-occ="${c.occ ?? ""}" style="border-left-color:${col}">☑ ${esc(c.task.title)}</div>`;
    }).join("");
    cols += `<div class="weekcol"><h5 class="${k === todayKey ? "today" : ""}" data-k="${k}">${WD[i]} ${d.getDate()}</h5>${chips}${mealChips}${taskChips}</div>`;
  }
  body.innerHTML = `<div class="weekgrid">${cols}</div>`;
  body.querySelectorAll(".mealwk").forEach((b) => { b.onclick = (e) => { e.stopPropagation(); go("#/meals"); }; });
  const findTask = (id, occ) => { for (const k in (taskCellsByDay || {})) { const c = taskCellsByDay[k].find((x) => x.task.id === id && String(x.occ ?? "") === occ); if (c) return c; } return null; };
  body.querySelectorAll(".wktask").forEach((b) => { b.onclick = (e) => { e.stopPropagation(); const c = findTask(b.dataset.tid, b.dataset.occ); if (c) openTaskItemForm(c.task, c.occ ?? null); }; });
  body.querySelectorAll(".wkev:not(.mealwk):not(.wktask)").forEach((b) => {
    b.onclick = () => { const inst = instances.find((e) => e.iid === b.dataset.iid); if (inst) openEventForm(inst); };
  });
  body.querySelectorAll(".weekcol h5").forEach((h) => {
    h.onclick = () => { state.viewDay = new Date(h.dataset.k + "T00:00"); state.calView = "day"; renderCalendar(); };
  });
}

// ---- month view: grid of per-person dots; tap a day → day view -------------
function renderMonthBody(body, weeks, byDay, todayKey, taskCellsByDay) {
  body.innerHTML = `
    <div class="cal">
      <div class="cal-head">${WD.map((d) => `<span>${d}</span>`).join("")}</div>
      <div class="cal-grid">
        ${weeks.flat().map((d) => {
          const k = dateKey(d);
          const inMonth = d.getMonth() === state.viewMonth.getMonth();
          const dots = (byDay[k] || []).slice(0, 4).map((ev) => {
            const col = ev.member_id ? colorFor(state.membersById[ev.member_id]?.color) : ALL_COLOR;
            return `<i class="evdot" style="background:${col}"></i>`;
          }).join("");
          const hasTask = taskCellsByDay && taskCellsByDay[k] && taskCellsByDay[k].some((c) => !c.done);
          return `<button class="cal-cell${inMonth ? "" : " muted"}${k === todayKey ? " today" : ""}" data-key="${k}">
            <span class="cal-num">${d.getDate()}</span><span class="cal-dots">${dots}${hasTask ? `<i class="taskdot"></i>` : ""}</span></button>`;
        }).join("")}
      </div>
    </div>`;
  body.querySelectorAll(".cal-cell").forEach((c) => {
    c.onclick = () => { state.viewDay = new Date(c.dataset.key + "T00:00"); state.calView = "day"; renderCalendar(); };
  });
}

// ---- tasks list view: Overdue / Today / Upcoming / Done --------------------
async function renderTasksView(body) {
  const todayKey = dateKey(new Date());
  let all = [], dmap = new Set(), err = "";
  try { const tr = await fetchTasks(); all = (tr.data || []).filter((t) => t.kind === "task"); dmap = await fetchDoneMap(all.map((t) => t.id)); }
  catch (e) { err = e.message || String(e); }
  const winStart = new Date(); winStart.setHours(0, 0, 0, 0); winStart.setDate(winStart.getDate() - 60);
  const winEnd = new Date(); winEnd.setHours(0, 0, 0, 0); winEnd.setDate(winEnd.getDate() + 120);
  const cells = taskCells(all, dmap, winStart, winEnd);
  const open = cells.filter((c) => !c.done);
  const overdue = open.filter((c) => c.dueKey < todayKey).sort((a, b) => a.dueKey.localeCompare(b.dueKey));
  const todayT = open.filter((c) => c.dueKey === todayKey);
  const upcoming = open.filter((c) => c.dueKey > todayKey).sort((a, b) => a.dueKey.localeCompare(b.dueKey));
  const done = cells.filter((c) => c.done).sort((a, b) => b.dueKey.localeCompare(a.dueKey)).slice(0, 20);

  const row = (c) => {
    const m = c.task.assigned_to ? state.membersById[c.task.assigned_to] : null;
    const col = m ? colorFor(m.color) : "#8A8178";
    const who = m ? esc(m.name) : "Anyone";
    const tm = c.due_time ? ` · ${c.due_time.slice(0, 5)}` : "";
    return `<div class="trow${c.done ? " done" : ""}">
      <button class="ck${c.done ? " on" : ""}" data-tid="${c.task.id}" data-occ="${c.occ ?? ""}">${c.done ? "✓" : ""}</button>
      <button class="trmain" data-tid="${c.task.id}" data-occ="${c.occ ?? ""}">
        <span class="trtitle">${esc(c.task.title)}</span>
        <span class="trmeta" style="color:${col}">${who} · ${esc(fmtDue(c.dueKey))}${tm}</span>
      </button></div>`;
  };
  const section = (title, list, cls) => list.length ? `<h4 class="lbh ${cls || ""}">${title} (${list.length})</h4><div class="tasklist">${list.map(row).join("")}</div>` : "";

  body.innerHTML = `
    ${err ? `<p class="err">${esc(err)}</p>` : ""}
    ${section("⚠ Overdue", overdue, "overdueh")}
    ${section("Today", todayT)}
    ${section("Upcoming", upcoming)}
    ${section("Done", done)}
    ${(!open.length && !done.length) ? `<p class="sub" style="text-align:center;margin-top:20px">No tasks yet — tap ＋ to add one.</p>` : ""}`;

  const findCell = (id, occ) => cells.find((c) => c.task.id === id && String(c.occ ?? "") === occ);
  body.querySelectorAll(".trow .ck").forEach((b) => { b.onclick = () => { const c = findCell(b.dataset.tid, b.dataset.occ); if (c && !c.done) { completeTaskCell(c); renderCalendar(); } }; });
  body.querySelectorAll(".trmain").forEach((b) => { b.onclick = () => { const c = findCell(b.dataset.tid, b.dataset.occ); if (c) openTaskItemForm(c.task, c.occ ?? null); }; });
}

// ---- shared recurrence editor (used by event + task forms) -----------------
// reminder offset picker (returns minutes-before, or null = off)
function remindSelectHTML(id, val) {
  const v = (val === null || val === undefined) ? "" : String(val);
  const known = ["", "5", "15", "30", "60"];
  const isCustom = v !== "" && !known.includes(v);
  const opt = (ov, label) => `<option value="${ov}"${v === ov ? " selected" : ""}>${label}</option>`;
  return `<select id="${id}">
    ${opt("", "Off")}${opt("5", "5 min before")}${opt("15", "15 min before")}${opt("30", "30 min before")}${opt("60", "1 hour before")}
    <option value="custom"${isCustom ? " selected" : ""}>Custom…</option>
  </select>
  <input id="${id}_custom" type="number" min="1" placeholder="minutes before" value="${isCustom ? esc(v) : ""}" style="display:${isCustom ? "block" : "none"};margin-top:6px" />`;
}
function wireRemind(id) {
  const sel = document.getElementById(id), cust = document.getElementById(id + "_custom");
  if (!sel) return () => null;
  sel.onchange = () => { cust.style.display = sel.value === "custom" ? "block" : "none"; };
  return () => {
    if (sel.value === "") return null;
    if (sel.value === "custom") { const n = parseInt(cust.value, 10); return Number.isFinite(n) && n > 0 ? n : null; }
    return parseInt(sel.value, 10);
  };
}

function recurSectionHTML(rui) {
  const cf = rui.custFreq || "WEEKLY";
  const wdBtns = WEEKDAYS.map((d, i) => `<button type="button" class="wd${rui.byday.includes(d) ? " on" : ""}" data-d="${d}">${["M","T","W","T","F","S","S"][i]}</button>`).join("");
  const opt = (v, l) => `<option value="${v}"${rui.freq === v ? " selected" : ""}>${l}</option>`;
  const copt = (v, l) => `<option value="${v}"${cf === v ? " selected" : ""}>${l}</option>`;
  return `<div class="recur" id="recurBox">
    <label>Repeat</label>
    <select id="r_freq">
      ${opt("none", "Does not repeat")}${opt("DAILY", "Daily")}${opt("WEEKLY", "Weekly")}${opt("MONTHLY", "Monthly")}${opt("YEARLY", "Yearly")}${opt("custom", "Custom…")}
    </select>
    <div id="r_opts" style="${rui.freq === "custom" ? "" : "display:none"}">
      <label>Repeat every</label>
      <div class="r_row"><input id="r_interval" type="number" min="1" value="${rui.interval}" />
        <select id="r_custfreq">${copt("DAILY", "day(s)")}${copt("WEEKLY", "week(s)")}${copt("MONTHLY", "month(s)")}${copt("YEARLY", "year(s)")}</select></div>
      <div id="r_bydayrow" style="${rui.freq === "custom" && cf === "WEEKLY" ? "" : "display:none"}">
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
    custFreq: q("r_custfreq") ? q("r_custfreq").value : "WEEKLY",
    interval: Math.max(1, parseInt((q("r_interval") || {}).value || "1", 10)),
    byday: [...overlay.querySelectorAll("#r_byday .wd.on")].map((b) => b.dataset.d),
    endType: (overlay.querySelector('input[name="r_end"]:checked') || {}).value || "never",
    until: (q("r_until") || {}).value || "",
    count: (q("r_count") || {}).value || "",
  });
  const refresh = () => {
    const ui = read();
    q("r_opts").style.display = ui.freq === "custom" ? "" : "none";
    q("r_bydayrow").style.display = (ui.freq === "custom" && ui.custFreq === "WEEKLY") ? "" : "none";
    q("r_preview").textContent = buildRuleString(ui) || "Does not repeat";
  };
  q("r_freq").onchange = refresh;
  if (q("r_custfreq")) q("r_custfreq").onchange = refresh;
  overlay.querySelectorAll("#r_byday .wd").forEach((b) => { b.onclick = () => { b.classList.toggle("on"); refresh(); }; });
  ["r_interval", "r_until", "r_count"].forEach((id) => { const e = q(id); if (e) e.addEventListener("input", refresh); });
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
        ${!isEdit ? `<div class="endmode itemtype"><button type="button" id="evToEvent" class="on">Event</button><button type="button" id="evToTask">Task</button></div>` : ""}
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
          <label>Ends</label>
          <div class="endmode"><button type="button" id="endTimeBtn" class="on">At time</button><button type="button" id="endDurBtn">Duration</button></div>
          <div id="endTimeWrap"><input id="f_end" type="datetime-local" /></div>
          <div id="endDurWrap" style="display:none"><select id="f_dur">
            <option value="15">15 min</option><option value="30">30 min</option><option value="45">45 min</option>
            <option value="60" selected>1 hour</option><option value="90">1.5 hours</option><option value="120">2 hours</option>
            <option value="180">3 hours</option><option value="240">4 hours</option></select></div>
          <label>Remind</label>
          ${remindSelectHTML("ev_remind", isEdit ? base.reminder_minutes : 15)}
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
  const evToTask = document.getElementById("evToTask");
  if (evToTask) evToTask.onclick = () => { close(); openTaskItemForm(null, null, presetDayKey || dateKey(state.viewDay || new Date())); };

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

  // ----- end: pick an end time, or a duration -----
  let endMode = "time";
  const setEndMode = (m) => {
    endMode = m;
    $("endTimeBtn").classList.toggle("on", m === "time");
    $("endDurBtn").classList.toggle("on", m === "dur");
    $("endTimeWrap").style.display = m === "time" ? "" : "none";
    $("endDurWrap").style.display = m === "dur" ? "" : "none";
  };
  $("endTimeBtn").onclick = () => setEndMode("time");
  $("endDurBtn").onclick = () => setEndMode("dur");

  // ----- recurrence editor (shared helper) -----
  const recurBox = $("recurBox");
  const readRecur = wireRecur(overlay).read;
  const readEvRemind = wireRemind("ev_remind");

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
      if (endMode === "dur") {
        const mins = parseInt($("f_dur").value, 10) || 60;
        ends_at = new Date(new Date(sv).getTime() + mins * 60000).toISOString();
      } else {
        const evv = $("f_end").value;
        ends_at = evv ? new Date(evv).toISOString() : null;
        if (ends_at && ends_at < starts_at) return { err: "End is before start." };
      }
    }
    return { title, member_id, location, starts_at, ends_at, all_day: isAllDay };
  }

  $("evForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const err = $("evErr"); err.textContent = "";
    const f = readForm();
    if (f.err) { err.textContent = f.err; return; }
    const rule = buildRuleString(readRecur());
    const reminder_minutes = f.all_day ? null : readEvRemind();
    const scope = scopeSel ? scopeSel.value : null;
    const save = $("evSave"); save.disabled = true; save.textContent = "Saving…";

    let res;
    if (!isEdit) {
      res = await createEvent({ title: f.title, member_id: f.member_id, location: f.location, starts_at: f.starts_at, ends_at: f.ends_at, all_day: f.all_day, rrule: rule, reminder_minutes });
    } else if (!isRecurring) {
      res = await updateEvent(base.id, { title: f.title, member_id: f.member_id, location: f.location, starts_at: f.starts_at, ends_at: f.ends_at, all_day: f.all_day, rrule: rule, reminder_minutes });
    } else if (scope === "this") {
      res = await overrideOccurrence(base, inst.occKey, { starts_at: f.starts_at, ends_at: f.ends_at, title: f.title, location: f.location });
    } else if (scope === "future") {
      res = await splitSeries(base, new Date(inst.occISO), { title: f.title, member_id: f.member_id, location: f.location, starts_at: f.starts_at, ends_at: f.ends_at, all_day: f.all_day, rrule: rule, reminder_minutes });
    } else { // all
      res = await updateEvent(base.id, { title: f.title, member_id: f.member_id, location: f.location, starts_at: f.starts_at, ends_at: f.ends_at, all_day: f.all_day, rrule: rule, reminder_minutes });
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

// ---- calendar tasks (kind='task'): due-date items shown on the calendar -----
function taskCells(tasks, doneMap, winStart, winEnd) {
  const out = [];
  for (const t of tasks) {
    const occs = t.rrule ? taskOccurrences(t, winStart, winEnd) : (t.due_date ? [null] : []);
    for (const occ of occs) {
      const dueKey = occ ?? t.due_date;
      if (!dueKey) continue;
      const dt = new Date(dueKey + "T00:00");
      if (dt < winStart || dt >= winEnd) continue;
      const cell = `${t.id}|${occ ?? ""}`;
      out.push({ task: t, dueKey, occ, due_time: t.due_time, done: doneMap.has(cell) || (state.pending && state.pending.has(cell)) });
    }
  }
  return out;
}
function overdueCells(tasks, doneMap, todayKey) {
  const lookback = new Date(); lookback.setHours(0, 0, 0, 0); lookback.setDate(lookback.getDate() - 60);
  const today = new Date(todayKey + "T00:00");
  const out = [];
  for (const t of tasks) {
    const occs = t.rrule ? taskOccurrences(t, lookback, today) : (t.due_date && t.due_date < todayKey ? [null] : []);
    for (const occ of occs) {
      const dueKey = occ ?? t.due_date;
      if (!dueKey || dueKey >= todayKey) continue;
      const cell = `${t.id}|${occ ?? ""}`;
      if (doneMap.has(cell) || (state.pending && state.pending.has(cell))) continue;
      out.push({ task: t, dueKey, occ, due_time: t.due_time, done: false });
    }
  }
  return out;
}
const completeTaskCell = (c) => { enqueueCompletion(c.task, c.occ ?? null, c.task.assigned_to || state.member.id); flushQueue(); };

// Add / edit a calendar task (kind='task')
function openTaskItemForm(task, occKey, presetDayKey) {
  const isEdit = !!task;
  const dayKey = (task && task.due_date) || presetDayKey || dateKey(state.viewDay || new Date());
  const rui = parseRuleToUI(task ? task.rrule : null);
  const whoVal = task ? (task.assigned_to || "") : "";
  const memberOpts = `<option value="">Anyone</option>` +
    state.members.map((m) => `<option value="${m.id}"${whoVal === m.id ? " selected" : ""}>${esc(m.name)}</option>`).join("");
  const overlay = document.createElement("div");
  overlay.className = "modal-overlay";
  overlay.innerHTML = `
    <form class="modal" id="tiForm">
      <div class="modal-top">
        <button type="button" class="iconbtn" id="tiClose">✕</button>
        <strong>${isEdit ? "Edit Task" : "New Task"}</strong>
        <button type="submit" id="tiSave">Save</button>
      </div>
      <div class="modal-body">
        ${!isEdit ? `<div class="endmode itemtype"><button type="button" id="tiToEvent">Event</button><button type="button" id="tiToTask" class="on">Task</button></div>` : ""}
        <label>Title</label>
        <input id="ti_title" required value="${esc(task ? task.title : "")}" placeholder="Renew passport" />
        <label>Assign to</label>
        <select id="ti_who">${memberOpts}</select>
        <label>Due date</label>
        <input id="ti_date" type="date" value="${esc((task && task.due_date) || dayKey)}" />
        <label>Due time (optional)</label>
        <input id="ti_time" type="time" value="${esc(task && task.due_time ? task.due_time.slice(0, 5) : "")}" />
        <label>Remind</label>
        ${remindSelectHTML("ti_remind", isEdit ? task.reminder_minutes : 15)}
        <label>Notes</label>
        <textarea id="ti_desc" rows="2" placeholder="Optional">${esc(task ? (task.description || "") : "")}</textarea>
        ${recurSectionHTML(rui)}
        <div class="err" id="tiErr"></div>
      </div>
      ${isEdit ? `<div class="modal-foot"><button type="button" id="tiDone">✓ Mark done</button><button type="button" id="tiDelete" class="danger">Delete task</button></div>` : ""}
    </form>`;
  document.body.appendChild(overlay);
  const close = () => overlay.remove();
  overlay.addEventListener("click", (e) => { if (e.target === overlay) close(); });
  document.getElementById("tiClose").onclick = close;
  if (!isEdit) document.getElementById("tiToEvent").onclick = () => { close(); openEventForm(null, dayKey); };
  const readRecur = wireRecur(overlay).read;
  const readRemind = wireRemind("ti_remind");

  document.getElementById("tiForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const err = document.getElementById("tiErr"); err.textContent = "";
    const title = document.getElementById("ti_title").value.trim();
    if (!title) { err.textContent = "Title is required."; return; }
    const due_date = document.getElementById("ti_date").value || null;
    if (!due_date) { err.textContent = "Pick a due date."; return; }
    const payload = {
      title,
      assigned_to: document.getElementById("ti_who").value || null,
      description: document.getElementById("ti_desc").value.trim() || null,
      due_date,
      due_time: document.getElementById("ti_time").value || null,
      rrule: buildRuleString(readRecur()),
      reminder_minutes: readRemind(),
      kind: "task", star_reward: 0,
    };
    const save = document.getElementById("tiSave"); save.disabled = true; save.textContent = "Saving…";
    const res = isEdit ? await updateTask(task.id, payload) : await createTask(payload);
    if (res.error) { err.textContent = res.error.message; save.disabled = false; save.textContent = "Save"; return; }
    close(); renderCalendar();
  });
  if (isEdit) {
    document.getElementById("tiDone").onclick = () => {
      enqueueCompletion(task, occKey ?? null, task.assigned_to || state.member.id);
      close(); renderCalendar(); flushQueue();
    };
    document.getElementById("tiDelete").onclick = async () => {
      if (!confirm("Delete this task?")) return;
      const { error } = await deleteTask(task.id);
      if (error) { document.getElementById("tiErr").textContent = error.message; return; }
      close(); renderCalendar();
    };
  }
}

// ---- tasks / chores data layer (M3 one-off + M4 recurrence; no stars yet) --
const fetchTasks = () => supabase.from("tasks")
  .select("id,title,description,assigned_to,star_reward,due_date,due_time,kind,rrule,exdates,is_active")
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

// ---- view: chores — avatar home → member page (chores + rewards bank) ------
async function viewTasks() {
  await loadContext();
  if (state.choreMember && !state.membersById[state.choreMember]) state.choreMember = null;
  await renderChores();
  subscribeRealtime(["tasks", "task_completions", "family_members", "rewards", "redemptions", "star_ledger"], () => renderChores());
}
async function renderChores() { return state.choreMember ? renderChoreMember() : renderChoreHome(); }

const choreWindow = () => {
  const winStart = new Date(); winStart.setHours(0, 0, 0, 0); winStart.setDate(winStart.getDate() - 14);
  const winEnd = new Date(); winEnd.setHours(0, 0, 0, 0); winEnd.setDate(winEnd.getDate() + 28);
  return { winStart, winEnd };
};
const todaysOccs = (t, todayKey, ws, we) => (!t.rrule ? (t.due_date === todayKey ? [null] : []) : taskOccurrences(t, ws, we));

function celebrate() {
  const es = ["🎉", "⭐", "🎊", "🌟", "✨", "🥳"];
  for (let i = 0; i < 26; i++) {
    const s = document.createElement("div");
    s.className = "confetti"; s.textContent = es[i % es.length];
    s.style.left = Math.random() * 100 + "vw"; s.style.animationDelay = (Math.random() * 0.5) + "s";
    document.body.appendChild(s); setTimeout(() => s.remove(), 1900);
  }
}

// Chores home = family member avatars (star balance + today's progress)
async function renderChoreHome() {
  const todayKey = dateKey(new Date());
  const ws = new Date(); ws.setHours(0, 0, 0, 0); const we = new Date(ws); we.setDate(we.getDate() + 1);
  let tasks = [], doneMap = new Set(), board = [], err = "";
  try {
    const r = await fetchTasks(); if (r.error) throw r.error; tasks = (r.data || []).filter((t) => t.kind !== "task");
    doneMap = await fetchDoneMap(tasks.map((t) => t.id));
    const b = await fetchLeaderboard(); if (b.error) throw b.error; board = b.data || [];
  } catch (e) { err = e.message || String(e); }
  state.pending = state.pending || new Set();
  const balById = Object.fromEntries(board.map((m) => [m.id, m.star_balance]));
  const counts = {};
  for (const t of tasks) {
    if (!t.assigned_to) continue;
    for (const occ of todaysOccs(t, todayKey, ws, we)) {
      const c = counts[t.assigned_to] || (counts[t.assigned_to] = { done: 0, total: 0 });
      c.total++;
      if (doneMap.has(`${t.id}|${occ ?? ""}`) || state.pending.has(`${t.id}|${occ ?? ""}`)) c.done++;
    }
  }
  el.innerHTML = `
    <header class="topbar">
      <button class="iconbtn" id="switch" title="Switch profile">‹</button>
      <h1>Chores</h1><span style="width:36px"></span>
    </header>
    <section class="content">
      ${navTabs("tasks")}
      <p class="sub" style="text-align:left;margin:0 0 14px">Tap a member to see their chores and rewards.</p>
      ${err ? `<p class="err">${esc(err)}</p>` : ""}
      <div class="chorehome">
        ${state.members.map((m) => {
          const c = counts[m.id] || { done: 0, total: 0 };
          const prog = c.total ? `${c.done}/${c.total} done today` : "no chores today";
          return `<button class="choretile" data-m="${m.id}">
            ${avatarHTML(m, "avatar")}
            <span class="ctname">${esc(m.name)}</span>
            <span class="ctstars">⭐ ${balById[m.id] ?? 0}</span>
            <span class="ctprog">${prog}</span></button>`;
        }).join("")}
      </div>
      <div class="row"><button class="link" id="signout">Sign out</button></div>
    </section>`;
  document.getElementById("switch").onclick = () => { clearMember(); go("#/picker"); };
  document.getElementById("signout").onclick = signOut;
  el.querySelectorAll(".choretile").forEach((b) => { b.onclick = () => { state.choreMember = b.dataset.m; renderChores(); }; });
}

// Member page = their chores + Add chore + Rewards bank (create / redeem / history)
async function renderChoreMember() {
  const mid = state.choreMember;
  const m = state.membersById[mid];
  const todayKey = dateKey(new Date());
  const { winStart, winEnd } = choreWindow();

  let tasks = [], doneMap = new Set(), board = [], rewards = [], reds = [], err = "";
  try {
    const r = await fetchTasks(); if (r.error) throw r.error; tasks = (r.data || []).filter((t) => t.assigned_to === mid && t.kind !== "task");
    doneMap = await fetchDoneMap(tasks.map((t) => t.id));
    const [bd, rw, rd] = await Promise.all([fetchLeaderboard(), fetchRewards(), fetchRedemptions(mid)]);
    if (bd.error) throw bd.error; if (rw.error) throw rw.error; if (rd.error) throw rd.error;
    board = bd.data || []; rewards = rw.data || []; reds = rd.data || [];
  } catch (e) { err = e.message || String(e); }
  state.pending = state.pending || new Set();
  const bal = (board.find((x) => x.id === mid) || {}).star_balance || 0;
  const rewardsById = Object.fromEntries(rewards.map((r) => [r.id, r]));

  const rows = [];
  for (const t of tasks) {
    for (const occ of taskOccurrences(t, winStart, winEnd)) {
      const cell = `${t.id}|${occ ?? ""}`;
      const isDone = doneMap.has(cell) || state.pending.has(cell);
      rows.push({ task: t, occ, dueKey: occ ?? t.due_date ?? null, isDone, isPending: state.pending.has(cell) && !doneMap.has(cell) });
    }
  }
  rows.sort((a, b) => (a.isDone - b.isDone) || (a.dueKey || "9999").localeCompare(b.dueKey || "9999") || a.task.title.localeCompare(b.task.title));

  el.innerHTML = `
    <header class="topbar">
      <button class="iconbtn" id="back" title="Back">‹</button>
      <h1>${avatarHTML(m, "favatar")} ${esc(m.name)}</h1>
      <button id="addTask">+ Chore</button>
    </header>
    <section class="content">
      ${navTabs("tasks")}
      ${err ? `<p class="err">${esc(err)}</p>` : ""}
      <div class="balcard" style="padding:18px;margin-bottom:16px"><div class="balnum" style="font-size:44px">${bal}</div><div class="ballabel">⭐ ${esc(m.name)}'s stars</div></div>
      <h4 class="lbh">Chores</h4>
      <div class="tasklist" id="tasklist"></div>
      <h4 class="lbh" style="margin-top:20px">🎁 Rewards bank</h4>
      <div class="rewardbank" id="rewardbank"></div>
      <button class="ghost" id="addReward" style="margin-top:12px">+ Create reward</button>
      ${reds.length ? `<h4 class="lbh" style="margin-top:20px">History</h4><div class="redlist" id="redlist"></div>` : ""}
      <div class="row"><button class="link" id="signout">Sign out</button></div>
    </section>`;
  document.getElementById("back").onclick = () => { state.choreMember = null; renderChores(); };
  document.getElementById("signout").onclick = signOut;
  document.getElementById("addTask").onclick = () => openTaskForm(null);
  document.getElementById("addReward").onclick = () => openRewardForm(null);

  const list = document.getElementById("tasklist");
  if (!rows.length) list.innerHTML = `<p class="sub">No chores yet — add one.</p>`;
  else list.innerHTML = rows.map((r, i) => {
    const t = r.task;
    const star = t.star_reward > 0 ? `<span class="taskstar">⭐${t.star_reward}</span>` : "";
    const due = r.dueKey ? `<span class="taskdue">${esc(fmtDue(r.dueKey))}</span>` : "";
    const rep = t.rrule ? " 🔁" : "";
    const pend = r.isPending ? ` <span class="pendmark" title="Saved locally — will sync when online">⏳</span>` : "";
    return `<div class="task${r.isDone ? " done" : ""}">
      <button class="check${r.isDone ? " on" : ""}" data-i="${i}" aria-label="complete">${r.isDone ? "✓" : ""}</button>
      <button class="taskmain" data-i="${i}">
        <span class="tasktitle">${esc(t.title)}${rep}${pend}</span>
        <span class="taskmeta">${star}${due}</span>
      </button></div>`;
  }).join("");
  list.querySelectorAll(".check").forEach((b) => {
    b.onclick = () => {
      const r = rows[+b.dataset.i];
      if (r.isDone) return;
      enqueueCompletion(r.task, r.occ, mid);
      if (r.task.star_reward > 0) starBurst(r.task.star_reward);
      const todayRows = rows.filter((x) => x.dueKey === todayKey);
      if (todayRows.length && todayRows.every((x) => x.isDone || x === r)) celebrate();
      renderChores();
      flushQueue();
    };
  });
  list.querySelectorAll(".taskmain").forEach((b) => { b.onclick = () => openTaskForm(rows[+b.dataset.i].task); });

  const rb = document.getElementById("rewardbank");
  rb.innerHTML = rewards.length ? rewards.map((r) => {
    const ok = bal >= r.star_cost;
    const pct = Math.min(100, Math.round((bal / Math.max(1, r.star_cost)) * 100));
    return `<div class="rwbank${ok ? " ready" : ""}">
      <div class="rwbtop"><span>${esc(r.emoji || "🎁")} ${esc(r.title)}</span>${ok
        ? `<button class="pill-redeem" data-id="${r.id}">Redeem · −${r.star_cost}⭐</button>`
        : `<span class="rwcostmut">${r.star_cost}⭐</span>`}</div>
      <div class="lbbar"><i style="width:${pct}%;background:var(--star)"></i></div>
      <div class="rwbnote"><span>${ok ? "Ready to redeem 🎉" : (r.star_cost - bal) + " stars to go"}</span><button class="link rwedit" data-id="${r.id}">edit</button></div>
    </div>`;
  }).join("") : `<p class="sub">No rewards yet — create one below.</p>`;
  rb.querySelectorAll(".pill-redeem").forEach((b) => {
    b.onclick = async () => {
      const r = rewardsById[b.dataset.id];
      if (!confirm(`Redeem "${r.title}" for ${r.star_cost} stars?`)) return;
      b.disabled = true;
      const { error } = await supabase.rpc("redeem_reward", { p_member: mid, p_reward: r.id });
      if (error) { b.disabled = false; alert(/insufficient_stars/.test(error.message) ? "Not enough stars yet." : error.message); return; }
      celebrate(); renderChores();
    };
  });
  rb.querySelectorAll(".rwedit").forEach((b) => { b.onclick = () => openRewardForm(rewardsById[b.dataset.id]); });

  const rl = document.getElementById("redlist");
  if (rl) rl.innerHTML = reds.map((x) => {
    const rw = rewardsById[x.reward_id];
    return `<div class="redrow"><span>${rw ? esc(rw.title) : "Reward"}</span><span class="redcost">−${x.star_cost}⭐</span><span class="redstatus s-${esc(x.status)}">${esc(x.status)}</span></div>`;
  }).join("");
}

// ---- Add / Edit task form --------------------------------------------------
function openTaskForm(task) {
  const isEdit = !!task;
  const whoVal = task ? (task.assigned_to || "") : (state.choreMember || state.member.id);
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
        <p class="hint">Stars are awarded automatically when this chore is checked off.</p>
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
    renderChores();
  });

  if (isEdit) {
    document.getElementById("tDelete").onclick = async () => {
      if (!confirm("Delete this task?")) return;
      const { error } = await deleteTask(task.id);
      if (error) { document.getElementById("tErr").textContent = error.message; return; }
      close();
      renderChores();
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
    close(); render();
  });
  if (isEdit) document.getElementById("rwDelete").onclick = async () => {
    if (!confirm("Remove this reward from the catalog?")) return;
    const { error } = await deactivateReward(reward.id);
    if (error) { document.getElementById("rwErr").textContent = error.message; return; }
    close(); render();
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
  if (!state.finView) state.finView = "overview";
  await renderFinance();
}

const fmtUSD = (v) => fmtMoney(v, "USD");
const CATCOLORS = ["#7C83DB", "#3FA796", "#E8595B", "#3D8BCD", "#E8A23D", "#D4709B", "#2FA6B0", "#C77DD8"];
// this-month spend contribution: recurring → monthly-normalised; one-off → counts in its month
function monthSpend(e, ref) {
  const amt = Number(e.amount) || 0;
  if (e.rrule) return amt * monthlyFactor(e.rrule);
  if (!e.next_due) return 0;
  const d = new Date(e.next_due + "T00:00");
  return (d.getFullYear() === ref.getFullYear() && d.getMonth() === ref.getMonth()) ? amt : 0;
}

async function renderFinance() {
  let exps = [], err = "";
  try { const r = await fetchExpenses(); if (r.error) throw r.error; exps = r.data || []; }
  catch (e) { err = e.message || String(e); }
  const today = new Date();
  const monthName = MONTHS[today.getMonth()];
  const monthTotal = exps.reduce((s, e) => s + monthSpend(e, today), 0);
  const vseg = (v, label) => `<button class="seg${state.finView === v ? " on" : ""}" data-v="${v}">${label}</button>`;

  if (state.finView === "review") {
    return renderFinanceReview(exps, err, today, monthName, monthTotal, vseg);
  }

  // ----- Overview -----
  const upcoming = exps.map((e) => ({ e, due: expenseNextDue(e, today) }))
    .filter((x) => x.due).sort((a, b) => a.due.localeCompare(b.due));
  const whoName = (id) => { const m = id ? state.membersById[id] : null; return m ? esc(m.name) : "—"; };
  const whoCol = (id) => { const m = id ? state.membersById[id] : null; return m ? colorFor(m.color) : "#8A8178"; };
  const perPerson = {};
  for (const e of exps) { const v = monthSpend(e, today); if (v) perPerson[e.paid_by || "none"] = (perPerson[e.paid_by || "none"] || 0) + v; }

  el.innerHTML = `
    <header class="topbar">
      <button class="iconbtn" id="switch" title="Switch profile">‹</button>
      <h1>Finance</h1>
      <button id="addExpense">+ Expense</button>
    </header>
    <section class="content">
      ${navTabs("finance")}
      <div class="viewseg">${vseg("overview", "Overview")}${vseg("review", "Monthly review")}</div>
      ${err ? `<p class="err">${esc(err)}</p>` : ""}
      <div class="finhead"><div class="h">Spent in ${esc(monthName)}</div><div class="amt">${esc(fmtUSD(monthTotal))}</div></div>
      <div class="ppstrip">${state.members.map((m) => `<div class="pp">${avatarHTML(m, "avatar sm")}<div class="v">${esc(fmtUSD(perPerson[m.id] || 0))}</div></div>`).join("")}</div>
      <h4 class="lbh">Upcoming</h4>
      <div class="finlist" id="upcoming"></div>
      <h4 class="lbh" style="margin-top:18px">All expenses</h4>
      <div class="finlist" id="allrec"></div>
      <div class="row"><button class="link" id="signout">Sign out</button></div>
    </section>`;
  document.getElementById("switch").onclick = () => { clearMember(); go("#/picker"); };
  document.getElementById("signout").onclick = signOut;
  document.getElementById("addExpense").onclick = () => openExpenseForm(null);
  el.querySelectorAll(".viewseg .seg").forEach((b) => { b.onclick = () => { state.finView = b.dataset.v; renderFinance(); }; });

  const up = document.getElementById("upcoming");
  up.innerHTML = upcoming.length ? upcoming.map(({ e, due }) => `
    <div class="finrow">
      <span class="findue">${esc(fmtDue(due))}</span>
      <span class="finname">${esc(e.name)}</span>
      <span class="finpay" style="color:${whoCol(e.paid_by)}">${whoName(e.paid_by)}</span>
      <span class="finmoney">${esc(fmtUSD(e.amount))}</span>
    </div>`).join("") : `<p class="sub">No upcoming bills.</p>`;

  const all = document.getElementById("allrec");
  all.innerHTML = exps.length ? exps.map((e) => `
    <button class="finrow finedit" data-id="${e.id}">
      <span class="finname">${esc(e.name)}${e.category ? ` <em class="fincat">${esc(e.category)}</em>` : ""}</span>
      <span class="fincycle">${esc(cycleLabel(e.rrule))}</span>
      <span class="finmoney">${esc(fmtUSD(e.amount))}</span>
      <span class="finedithint">edit ›</span>
    </button>`).join("") : `<p class="sub">No expenses yet — add one.</p>`;
  all.querySelectorAll(".finedit").forEach((b) => { b.onclick = () => openExpenseForm(exps.find((x) => x.id === b.dataset.id)); });
}

// ----- Monthly review: by category, by person, fixed vs variable -----
function renderFinanceReview(exps, err, today, monthName, monthTotal, vseg) {
  const cats = {}; let fixed = 0, variable = 0;
  for (const e of exps) {
    const v = monthSpend(e, today); if (!v) continue;
    const c = e.category || "Uncategorised"; cats[c] = (cats[c] || 0) + v;
    if (e.rrule) fixed += v; else variable += v;
  }
  const catList = Object.entries(cats).sort((a, b) => b[1] - a[1]);
  const byPerson = state.members.map((m) => ({ m, v: exps.reduce((s, e) => s + (e.paid_by === m.id ? monthSpend(e, today) : 0), 0) }));
  const pMax = Math.max(1, ...byPerson.map((x) => x.v));
  const ft = fixed + variable;

  el.innerHTML = `
    <header class="topbar">
      <button class="iconbtn" id="switch" title="Switch profile">‹</button>
      <h1>Finance</h1>
      <button id="addExpense">+ Expense</button>
    </header>
    <section class="content">
      ${navTabs("finance")}
      <div class="viewseg">${vseg("overview", "Overview")}${vseg("review", "Monthly review")}</div>
      ${err ? `<p class="err">${esc(err)}</p>` : ""}
      <div class="finhead"><div class="h">${esc(monthName)} spending</div><div class="amt">${esc(fmtUSD(monthTotal))}</div></div>

      <h4 class="lbh">By category</h4>
      <div id="bycat">${catList.length ? catList.map(([c, v], i) => `
        <div class="catrow">
          <div class="ct"><span>${esc(c)}</span><span>${esc(fmtUSD(v))} · ${Math.round(v / monthTotal * 100) || 0}%</span></div>
          <div class="lbbar"><i style="width:${Math.round(v / Math.max(1, monthTotal) * 100)}%;background:${CATCOLORS[i % CATCOLORS.length]}"></i></div>
        </div>`).join("") : `<p class="sub">Nothing spent this month yet.</p>`}</div>

      <h4 class="lbh" style="margin-top:20px">By person</h4>
      <div id="byperson">${byPerson.map(({ m, v }) => `
        <div style="display:flex;align-items:center;gap:10px;margin-top:10px">
          ${avatarHTML(m, "avatar sm")}
          <div style="flex:1"><div class="lbbar"><i style="width:${Math.round(v / pMax * 100)}%;background:${colorFor(m.color)}"></i></div></div>
          <span class="finmoney">${esc(fmtUSD(v))}</span>
        </div>`).join("")}</div>

      <h4 class="lbh" style="margin-top:20px">Fixed vs variable</h4>
      <div class="fixedbar">
        <div style="width:${Math.round(fixed / Math.max(1, ft) * 100)}%;background:var(--meal)">Fixed ${esc(fmtUSD(fixed))}</div>
        <div style="flex:1;background:var(--star);color:#5A3D00">Variable ${esc(fmtUSD(variable))}</div>
      </div>
      <div class="row"><button class="link" id="signout">Sign out</button></div>
    </section>`;
  document.getElementById("switch").onclick = () => { clearMember(); go("#/picker"); };
  document.getElementById("signout").onclick = signOut;
  document.getElementById("addExpense").onclick = () => openExpenseForm(null);
  el.querySelectorAll(".viewseg .seg").forEach((b) => { b.onclick = () => { state.finView = b.dataset.v; renderFinance(); }; });
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

// ---- Phase 6: Meals & grocery (have / buy / plan) --------------------------
const MEAL_COLOR = "#7C83DB";
const fetchPantry = () => supabase.from("pantry_items").select("id,name,category,status,default_store_id").order("category").order("name");
const fetchStores = () => supabase.from("stores").select("id,name,sort_order").order("sort_order");
const fetchShopping = () => supabase.from("shopping_items").select("id,name,store_id,got,critical,need_by,source_pantry_id").order("created_at");
const fetchMealsRange = (startKey, endKey) => supabase.from("meals").select("id,title,meal_type,day").gte("day", startKey).lte("day", endKey).order("day");
const createPantry = (p) => supabase.from("pantry_items").insert({ family_id: state.familyId, ...p }).select().single();
const updatePantry = (id, p) => supabase.from("pantry_items").update(p).eq("id", id);
const delPantry = (id) => supabase.from("pantry_items").delete().eq("id", id);
const createStore = (name, ord) => supabase.from("stores").insert({ family_id: state.familyId, name, sort_order: ord }).select().single();
const createShopping = (p) => supabase.from("shopping_items").insert({ family_id: state.familyId, ...p }).select().single();
const updateShopping = (id, p) => supabase.from("shopping_items").update(p).eq("id", id);
const delShopping = (id) => supabase.from("shopping_items").delete().eq("id", id);
const createMeal = (p) => supabase.from("meals").insert({ family_id: state.familyId, ...p }).select().single();
const delMeal = (id) => supabase.from("meals").delete().eq("id", id);

async function viewMeals() {
  await loadContext();
  if (!state.mealView) state.mealView = "have";
  if (!state.buyStore) state.buyStore = localStorage.getItem("fh_buystore") || "all";
  if (!state.viewDay) state.viewDay = new Date();
  await renderMeals();
  subscribeRealtime(["pantry_items", "stores", "shopping_items", "meals"], () => renderMeals());
}

async function renderMeals() {
  let stores = [], err = "";
  try { const s = await fetchStores(); if (s.error) throw s.error; stores = s.data || []; } catch (e) { err = e.message || String(e); }
  state._stores = stores;
  const seg = (v, label) => `<button class="seg${state.mealView === v ? " on" : ""}" data-v="${v}">${label}</button>`;
  el.innerHTML = `
    <header class="topbar">
      <button class="iconbtn" id="switch" title="Switch profile">‹</button>
      <h1>Meals &amp; groceries</h1>
      <span style="width:36px"></span>
    </header>
    <section class="content">
      ${navTabs("meals")}
      <div class="viewseg">${seg("have", "In the house")}${seg("buy", "Need to buy")}${seg("plan", "Meals")}</div>
      ${err ? `<p class="err">${esc(err)}</p>` : ""}
      <div id="mealbody"></div>
      <div class="row"><button class="link" id="signout">Sign out</button></div>
    </section>`;
  document.getElementById("switch").onclick = () => { clearMember(); go("#/picker"); };
  document.getElementById("signout").onclick = signOut;
  el.querySelectorAll(".viewseg .seg").forEach((b) => { b.onclick = () => { state.mealView = b.dataset.v; renderMeals(); }; });
  const body = document.getElementById("mealbody");
  if (state.mealView === "have") renderHaveSection(body);
  else if (state.mealView === "buy") renderBuySection(body, stores);
  else renderPlanSection(body);
}

async function renderHaveSection(body) {
  let items = [];
  try { const r = await fetchPantry(); if (!r.error) items = r.data || []; } catch (e) {}
  const cats = [...new Set(items.map((i) => i.category))];
  const rowHtml = (i) => `<div class="mrow">
    <span style="flex:1;font-weight:600">${esc(i.name)}${i.status === "low" ? ` <span class="lowbadge">low · on list</span>` : ""}</span>
    ${i.status === "low" ? "" : `<button class="pill" data-buy="${i.id}">→ buy</button>`}
    <button class="xbtn" data-del="${i.id}">✕</button></div>`;
  body.innerHTML = `
    <div class="card" style="margin:0">
      <div class="mealhead"><strong>In the house</strong><button class="pill on" id="addHave">＋ Add</button></div>
      <p class="sub" style="text-align:left;margin:2px 0 10px">A quick glance before shopping. Tap “→ buy” when you need more.</p>
      ${items.length ? cats.map((cat) => `<div class="mut catlbl">${esc(cat)}</div>${items.filter((i) => i.category === cat).map(rowHtml).join("")}`).join("") : `<p class="sub">Nothing yet — add staples like milk, eggs.</p>`}
    </div>`;
  document.getElementById("addHave").onclick = () => mealForm("have");
  body.querySelectorAll("[data-buy]").forEach((b) => b.onclick = () => { const it = items.find((x) => x.id === b.dataset.buy); if (it) moveToBuy(it); });
  body.querySelectorAll("[data-del]").forEach((b) => b.onclick = async () => { await delPantry(b.dataset.del); renderMeals(); });
}

// move an in-house item onto the buy list: choose store, low-vs-out, critical, buy-by
function moveToBuy(item) {
  const stores = state._stores || [];
  const defStore = item.default_store_id || (state.buyStore !== "all" ? state.buyStore : "");
  const overlay = document.createElement("div"); overlay.className = "modal-overlay";
  overlay.innerHTML = `<form class="modal" id="mvForm">
    <div class="modal-top"><button type="button" class="iconbtn" id="mvClose">✕</button><strong>Add “${esc(item.name)}” to buy list</strong><button type="submit" id="mvSave">Save</button></div>
    <div class="modal-body">
      <label>Store</label>
      <select id="mv_store"><option value="">No store</option>${stores.map((s) => `<option value="${s.id}"${defStore === s.id ? " selected" : ""}>${esc(s.name)}</option>`).join("")}<option value="__new">+ New store…</option></select>
      <input id="mv_newstore" placeholder="New store name" style="display:none;margin-top:8px" />
      <label>Do we still have some?</label>
      <div class="endmode"><button type="button" id="mv_low" class="on">Running low</button><button type="button" id="mv_out">We're out</button></div>
      <label class="inline"><input type="checkbox" id="mv_crit" /> Critical</label>
      <label>Buy by (optional)</label><input id="mv_by" type="date" />
      <div class="err" id="mvErr"></div>
    </div></form>`;
  document.body.appendChild(overlay);
  const close = () => overlay.remove();
  overlay.addEventListener("click", (e) => { if (e.target === overlay) close(); });
  document.getElementById("mvClose").onclick = close;
  let stock = "low";
  const lowB = document.getElementById("mv_low"), outB = document.getElementById("mv_out");
  lowB.onclick = () => { stock = "low"; lowB.classList.add("on"); outB.classList.remove("on"); };
  outB.onclick = () => { stock = "out"; outB.classList.add("on"); lowB.classList.remove("on"); };
  const sel = document.getElementById("mv_store");
  sel.onchange = () => { document.getElementById("mv_newstore").style.display = sel.value === "__new" ? "block" : "none"; };
  document.getElementById("mvForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const err = document.getElementById("mvErr"); err.textContent = "";
    const save = document.getElementById("mvSave"); save.disabled = true; save.textContent = "Saving…";
    let store_id = sel.value || null;
    if (store_id === "__new") {
      const nm = (document.getElementById("mv_newstore").value || "").trim();
      if (!nm) { err.textContent = "Enter the new store name."; save.disabled = false; save.textContent = "Save"; return; }
      const sr = await createStore(nm, (state._stores || []).length);
      if (sr.error) { err.textContent = sr.error.message; save.disabled = false; save.textContent = "Save"; return; }
      store_id = sr.data.id;
    }
    const need_by = document.getElementById("mv_by").value || null;
    const critical = document.getElementById("mv_crit").checked;
    const res = await createShopping({ name: item.name, store_id, got: false, critical, need_by, source_pantry_id: item.id });
    if (res.error) { err.textContent = res.error.message; save.disabled = false; save.textContent = "Save"; return; }
    if (stock === "out") await delPantry(item.id);
    else await updatePantry(item.id, { status: "low", default_store_id: store_id });
    close(); state.mealView = "buy"; renderMeals();
  });
}

async function renderBuySection(body, stores) {
  let items = [];
  try { const r = await fetchShopping(); if (!r.error) items = r.data || []; } catch (e) {}
  const storeById = Object.fromEntries(stores.map((s) => [s.id, s]));
  const storeColor = (id) => { const idx = stores.findIndex((s) => s.id === id); return idx < 0 ? "#8A8178" : CATCOLORS[idx % CATCOLORS.length]; };
  const todayKey = dateKey(new Date());
  const filtered = state.buyStore === "all" ? items : items.filter((i) => i.store_id === state.buyStore);
  const active = filtered.filter((i) => !i.got).sort((a, b) => ((b.critical ? 1 : 0) - (a.critical ? 1 : 0)) || ((a.need_by || "9999-99-99").localeCompare(b.need_by || "9999-99-99")));
  const got = filtered.filter((i) => i.got);
  const countFor = (sid) => items.filter((i) => !i.got && (sid === "all" || i.store_id === sid)).length;
  const pill = (id, label) => { const n = countFor(id); return `<button class="spill${state.buyStore === id ? " on" : ""}" data-s="${id}">${esc(label)}${n ? ` · ${n}` : ""}</button>`; };
  const rowActive = (i) => {
    const overdue = i.need_by && i.need_by < todayKey;
    return `<div class="mrow${i.critical ? " crit" : ""}"><button class="ck" data-got="${i.id}"></button>
      <span style="flex:1;font-weight:600">${i.critical ? `<span class="critflag">⚠</span>` : ""}${esc(i.name)}${i.need_by ? ` <span class="byb${overdue ? " over" : ""}">by ${esc(fmtDue(i.need_by))}</span>` : ""}</span>
      ${i.store_id ? `<span class="tagchip" style="background:${storeColor(i.store_id)}">${esc((storeById[i.store_id] || {}).name || "")}</span>` : ""}
      <button class="xbtn" data-del="${i.id}">✕</button></div>`;
  };
  body.innerHTML = `
    <div class="spillrow">${pill("all", "All")}${stores.map((s) => pill(s.id, s.name)).join("")}</div>
    <div class="card" style="margin:0">
      <div class="mealhead"><strong>Need to buy</strong><button class="pill on" id="addBuy">＋ Add</button></div>
      ${state.buyStore !== "all" ? `<p class="sub" style="text-align:left;margin:2px 0 8px">New items here auto-tag ${esc((storeById[state.buyStore] || {}).name || "")}.</p>` : ""}
      <div id="buylist">${active.length ? active.map(rowActive).join("") : `<p class="sub">Nothing to buy.</p>`}
        ${got.length ? `<div class="mut catlbl">Got it (${got.length})</div>${got.map((i) => `
        <div class="mrow"><button class="ck on" data-got="${i.id}">✓</button><span style="flex:1;text-decoration:line-through;color:var(--muted)">${esc(i.name)}</span>
          <button class="xbtn" data-del="${i.id}">✕</button></div>`).join("")}` : ""}
      </div>
    </div>`;
  body.querySelectorAll(".spill").forEach((b) => b.onclick = () => { state.buyStore = b.dataset.s; localStorage.setItem("fh_buystore", state.buyStore); renderMeals(); });
  document.getElementById("addBuy").onclick = () => mealForm("buy");
  body.querySelectorAll("[data-got]").forEach((b) => b.onclick = async () => {
    const it = items.find((x) => x.id === b.dataset.got);
    const newGot = !it.got;
    await updateShopping(b.dataset.got, { got: newGot });
    if (newGot && it.source_pantry_id) await updatePantry(it.source_pantry_id, { status: "in" }); // restock the pantry when bought
    renderMeals();
  });
  body.querySelectorAll("[data-del]").forEach((b) => b.onclick = async () => {
    const it = items.find((x) => x.id === b.dataset.del);
    if (it && it.source_pantry_id) await updatePantry(it.source_pantry_id, { status: "in" });
    await delShopping(b.dataset.del); renderMeals();
  });
}

async function renderPlanSection(body) {
  const ws = startOfWeek(state.viewDay || new Date());
  const days = []; for (let i = 0; i < 7; i++) { const d = new Date(ws); d.setDate(d.getDate() + i); days.push(d); }
  let meals = [];
  try { const r = await fetchMealsRange(dateKey(days[0]), dateKey(days[6])); if (!r.error) meals = r.data || []; } catch (e) {}
  const byDay = {}; for (const m of meals) (byDay[m.day] = byDay[m.day] || []).push(m);
  const todayKey = dateKey(new Date());
  body.innerHTML = `
    <div class="card" style="margin:0">
      <div class="mealhead"><strong>This week's meals</strong><button class="pill on" id="addMeal">＋ Add meal</button></div>
      <p class="sub" style="text-align:left;margin:2px 0 10px">Meals show up on the family calendar for that day.</p>
      ${days.map((d, i) => { const k = dateKey(d); const dm = (byDay[k] || []);
        return `<div class="planday"><div class="plandh${k === todayKey ? " today" : ""}">${WD[i]} ${d.getDate()}</div>
          ${dm.length ? dm.map((m) => `<div class="mealrow"><span class="tagchip" style="background:${MEAL_COLOR}">🍴 ${esc(m.meal_type)}</span><span style="font-weight:600;flex:1">${esc(m.title)}</span><button class="xbtn" data-del="${m.id}">✕</button></div>`).join("") : `<span class="sub">— no meal</span>`}</div>`;
      }).join("")}
    </div>`;
  document.getElementById("addMeal").onclick = () => mealForm("plan");
  body.querySelectorAll("[data-del]").forEach((b) => b.onclick = async () => { await delMeal(b.dataset.del); renderMeals(); });
}

function mealForm(kind) {
  const stores = state._stores || [];
  let inner = "";
  if (kind === "have") inner = `<label>Item</label><input id="mf_name" placeholder="Milk" />
    <label>Where</label><select id="mf_cat"><option>Fridge</option><option>Pantry</option><option>Freezer</option></select>`;
  else if (kind === "buy") inner = `<label>Item</label><input id="mf_name" placeholder="Cheese" />
    <label>Store</label><select id="mf_store"><option value="">No store</option>${stores.map((s) => `<option value="${s.id}"${state.buyStore === s.id ? " selected" : ""}>${esc(s.name)}</option>`).join("")}<option value="__new">+ New store…</option></select>
    <input id="mf_newstore" placeholder="New store name" style="display:none;margin-top:8px" />
    <label class="inline"><input type="checkbox" id="mf_crit" /> Critical</label>
    <label>Buy by (optional)</label><input id="mf_by" type="date" />`;
  else inner = `<label>Meal</label><input id="mf_name" placeholder="Pasta night" />
    <label>Type</label><select id="mf_type"><option>Dinner</option><option>Lunch</option><option>Breakfast</option></select>
    <label>Day</label><input id="mf_day" type="date" value="${dateKey(state.viewDay || new Date())}" />
    <p class="hint">Saving adds it to that day on the family calendar.</p>`;
  const titles = { have: "Add to “in the house”", buy: "Add to buy list", plan: "Add meal" };
  const overlay = document.createElement("div"); overlay.className = "modal-overlay";
  overlay.innerHTML = `<form class="modal" id="mealForm2"><div class="modal-top"><button type="button" class="iconbtn" id="mfClose">✕</button><strong>${titles[kind]}</strong><button type="submit" id="mfSave">Save</button></div><div class="modal-body">${inner}<div class="err" id="mfErr"></div></div></form>`;
  document.body.appendChild(overlay);
  const close = () => overlay.remove();
  overlay.addEventListener("click", (e) => { if (e.target === overlay) close(); });
  document.getElementById("mfClose").onclick = close;
  if (kind === "buy") { const sel = document.getElementById("mf_store"); sel.onchange = () => { document.getElementById("mf_newstore").style.display = sel.value === "__new" ? "block" : "none"; }; }
  document.getElementById("mealForm2").addEventListener("submit", async (e) => {
    e.preventDefault();
    const err = document.getElementById("mfErr"); err.textContent = "";
    const name = (document.getElementById("mf_name").value || "").trim();
    if (!name) { err.textContent = "Required."; return; }
    const save = document.getElementById("mfSave"); save.disabled = true; save.textContent = "Saving…";
    let res;
    if (kind === "have") res = await createPantry({ name, category: document.getElementById("mf_cat").value });
    else if (kind === "buy") {
      let store_id = document.getElementById("mf_store").value || null;
      if (store_id === "__new") {
        const nm = (document.getElementById("mf_newstore").value || "").trim();
        if (!nm) { err.textContent = "Enter the new store name."; save.disabled = false; save.textContent = "Save"; return; }
        const sr = await createStore(nm, (state._stores || []).length);
        if (sr.error) { err.textContent = sr.error.message; save.disabled = false; save.textContent = "Save"; return; }
        store_id = sr.data.id;
      } else if (!store_id) store_id = state.buyStore !== "all" ? state.buyStore : null;
      res = await createShopping({ name, store_id, got: false, critical: document.getElementById("mf_crit").checked, need_by: document.getElementById("mf_by").value || null });
    } else res = await createMeal({ title: name, meal_type: document.getElementById("mf_type").value, day: document.getElementById("mf_day").value });
    if (res && res.error) { err.textContent = res.error.message; save.disabled = false; save.textContent = "Save"; return; }
    close(); renderMeals();
  });
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
