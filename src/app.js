// ---------- config ----------
const SUPABASE_URL = "https://rcufmnidwyycbrtqgqga.supabase.co";
const SUPABASE_KEY = "sb_publishable_u2__PPq2nDZLyoNnLHxkVA_olltjpHc";
const sb = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
const DUE_DAYS = 45;
// Health-certificate websites: Riyadh city uses Amanat Al-Riyadh, everywhere else uses Balady
const BALADY = {
  riyadh: { url: "https://eservices.alriyadh.gov.sa/_layouts/RM_Pages/Medical/SearchAllCertificates.aspx", short: "Riyadh city", label: "Riyadh — Amanat Al-Riyadh" },
  other:  { url: "https://services.balady.gov.sa/health/inquiry/Certificate-Status", short: "Outside Riyadh", label: "Outside Riyadh — Balady" },
};
// Everyone sees both websites — no guessing from store cities
const baladyBtn = (cls = "btn tan") => ["riyadh", "other"].map(z => `<a class="${cls}" href="${BALADY[z].url}" target="_blank" rel="noopener">${BALADY[z].short} ↗</a>`).join("");
const NATIONALITIES = ["Saudi","Bangladeshi","Indian","Filipino","Pakistani","Nepali","Egyptian","Sudanese","Yemeni","Eritrean","Sri Lankan","Jordanian","Syrian","Other"];
const CARD_STATUSES = ["Needs medical exam","Medical scheduled","Training pending","Training done but card status not updated","Rescheduled for exam","Need to pay SAR 60","Needs Balady registration","Waiting for health-center visit","Renewal in process"];
const COLS = ["Iqama / National ID","Employee No","Name","Store / Department","Job Role","Nationality","Mobile","Expiry Date","Card Status","Remarks"];

// ---------- state ----------
const S = { me:null, emps:[], left:[], weeks:[], profiles:[], view:"dashboard", page:1, filters:{q:"",store:"",status:"",cs:"",am:"",rom:"",city:"",region:""}, sortBy:"expiry", groupBy:"store", map:{}, alias:{}, mapMeta:null, alertTab:"exp", vTab:"todo", vUnit:"", vq:"", depts:[], chat:[], channel:null, imp:null };

// ---------- helpers ----------
const $ = s => document.querySelector(s);
const esc = v => String(v ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const todayUTC = () => { const n = new Date(); return Date.UTC(n.getFullYear(), n.getMonth(), n.getDate()); };
const daysLeft = d => Math.round((Date.parse(d) - todayUTC()) / 86400000);
const statusOf = e => { if (!e.verified_at) return "unv"; if (!e.expiry) return "miss"; const n = daysLeft(e.expiry); return n < 0 ? "exp" : n <= DUE_DAYS ? "due" : "ok"; };
const STATUS_LABEL = { unv:"Not verified yet", exp:"Expired", due:`Due ≤ ${DUE_DAYS} days`, miss:"Date missing", ok:"OK" };
const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const fmtDate = d => { if(!d) return ""; const [y,m,dd] = d.split("-"); return `${dd} ${MONTHS[+m-1]} ${y}`; };
const relDays = d => { const n = daysLeft(d); return n < 0 ? `${-n} day${n===-1?"":"s"} ago` : n === 0 ? "today" : `in ${n} day${n===1?"":"s"}`; };
const pill = e => { if (e.left_at) return `<span class="pill p-left"><i></i>Left</span>`; const s = statusOf(e); return `<span class="pill p-${s}"><i></i>${STATUS_LABEL[s]}</span>`; };
const csChip = e => e.card_status ? `<span class="cs-chip" title="Card status">${esc(e.card_status)}</span>` : "";
const remarksCell = e => `${csChip(e)}${e.remarks ? `<span class="sub">${esc(e.remarks)}</span>` : ""}`;
// ---------- store → branch mapping (area manager, ROM, city, region) ----------
const SYN = [[/\bMEDINA\b|\bMADINA\b/g, "MADINAH"], [/\bJED\b/g, "JEDDAH"], [/\bRIY\b/g, "RIYADH"], [/\bJ ?WALK\b/g, "JWALK"], [/\bJ ?VIEW\b/g, "JVIEW"],
  [/\bAZIZIYAH\b/g, "AZIZIYA"], [/\bMUSHAIT\b/g, ""], [/\bHIJRAH\b|\bHIGRAH\b/g, "HIJRA"], [/\bWALY\b/g, "WALI"], [/\bAHD\b/g, "AHAD"],
  [/\bBOULEVARD\b/g, "BLVD"], [/\bJ ?VISION\b/g, "JEDDAH VISION"], [/\bSEVEN\b/g, "7"]];
// spelling-tolerant word key: keep the first letter, drop vowels, a final H and doubled letters ("SOUDAH" = "SOUDA", "SHOWQIA" = "SHAWQIYAH")
const wkey = w => /^\d+$/.test(w) ? w : (w[0] + w.slice(1).replace(/[AEIOUY]/g, "")).replace(/H$/, "").replace(/(.)\1+/g, "$1");
const STOP = new Set(["AL", "HM", "BR", "BRANCH", "STORE", "THE", "S"]);
function normStore(s){
  let t = String(s || "").toUpperCase().replace(/&/g, " AND ").replace(/[^A-Z0-9]+/g, " ");
  for (const [re, to] of SYN) t = t.replace(re, to);
  return t.split(" ").filter(w => w && !STOP.has(w)).map(wkey);
}
function matchStore(store){
  const key = String(store || "").trim().toUpperCase(); if (!key) return null;
  if (S.alias[key] && S.map[S.alias[key]]) return { ...S.map[S.alias[key]], how: "linked" };
  const code = (key.match(/\bB0*(\d{1,3})\b/) || [])[1];
  if (code) { const hit = Object.values(S.map).find(m => m.code.replace(/^B0*/, "B") === "B" + code); if (hit) return { ...hit, how: "auto" }; }
  const st = normStore(key), sset = new Set(st); if (!st.length) return null;
  const num = st.filter(w => /^\d+$/.test(w)).join(" ");
  let best = null, bestScore = 0, tie = false;
  for (const m of Object.values(S.map)) {
    const bt = normStore(m.branch); if (num !== bt.filter(w => /^\d+$/.test(w)).join(" ")) continue;   // "AL AHSA" is not "AL AHSA 2"
    const inter = bt.filter(w => sset.has(w)).length; if (!inter) continue;
    // full overlap scores highest; a shorter store name inside a longer branch name ("ATYAF MALL" → "ATYAF MALL KHOBAR") is fine,
    // but a store name with extra words is NOT matched to a shorter branch ("TAIF AL JAWAHRA" ≠ "AL TAIF")
    const jac = inter / new Set([...st, ...bt]).size, storeInside = st.every(w => bt.includes(w));
    const score = jac >= 0.6 ? jac + (storeInside ? 0.3 : 0) : storeInside && jac >= 0.5 ? jac + 0.3 : 0;
    if (!score) continue;
    if (score > bestScore + 1e-9) { best = m; bestScore = score; tie = false; } else if (Math.abs(score - bestScore) < 1e-9) tie = true;
  }
  return best && !tie && bestScore >= 0.6 ? { ...best, how: "auto" } : null;
}
let mapCache = new Map();
const mapOf = e => { if (e.unit_kind === "store") return S.map[e.unit] || null; if (e.unit_kind) return null; const k = e.store || ""; if (!mapCache.has(k)) mapCache.set(k, matchStore(k)); return mapCache.get(k); };
// where someone works: a branch name, a department name, or Unassigned
const placeOf = e => e.unit_kind === "unassigned" ? "Unassigned" : (e.store || e.unit || "Unassigned");
const isDept = e => e.unit_kind === "dept";
// departments have no area manager: they show under their own department name
const geo = (k, e) => { const m = mapOf(e); if (m) return m[k]; return isDept(e) ? e.unit : e.unit_kind === "unassigned" ? "Unassigned" : ""; };
const eid = e => e.employee_id || "";
const scopeKind = () => isAdmin() ? "all" : (S.me?.scope_kind || "all");
const scopeName = () => { const k = scopeKind(), v = S.me?.scope_value || ""; return k === "store" ? (S.map[v]?.branch || v) : k === "dept" || k === "am" ? v : ""; };
const placeLabel = (k, u) => k === "store" ? `${S.map[u]?.branch || u} (${u})` : k === "dept" ? u : "Unassigned";
const GROUPS = { store:["Store / department", placeOf], am:["Area manager", e => geo("area_manager", e)], rom:["ROM", e => geo("rom", e)], city:["City", e => geo("city", e)], region:["Region", e => geo("region", e)] };
const hasMap = () => Object.keys(S.map).length > 0;
const storeSub = e => { const m = mapOf(e); return m ? `<div class="sub">${esc(e.unit || m.code)} · ${esc(m.area_manager)}${m.city ? " · " + esc(m.city) : ""}</div>` : isDept(e) ? `<div class="sub">Department</div>` : ""; };
const findEmp = id => S.emps.find(x => x.id === id) || S.left.find(x => x.id === id);
function cardStatusList(){
  const c = {}; for (const e of S.emps) if (e.card_status) c[e.card_status] = (c[e.card_status] || 0) + 1;
  return Object.entries(c).sort((x, y) => { const ix = CARD_STATUSES.indexOf(x[0]), iy = CARD_STATUSES.indexOf(y[0]); return (ix < 0 ? 99 : ix) - (iy < 0 ? 99 : iy) || y[1] - x[1]; });
}
const dateCell = e => e.expiry ? `${fmtDate(e.expiry)}<div class="sub">${relDays(e.expiry)}</div>` : `<div class="sub">${esc(e.expiry_note || "No date")}</div>`;
const isAdmin = () => S.me?.role === "admin";
function toast(msg){ const t = document.createElement("div"); t.className = "toast"; t.textContent = msg; document.body.appendChild(t); setTimeout(() => t.remove(), 2600); }
function phoneIntl(m){ let d = String(m||"").replace(/\D/g,""); if (!d) return ""; if (d.startsWith("00")) d = d.slice(2); if (d.startsWith("0")) d = d.slice(1); if (d.length === 9 && d.startsWith("5")) d = "966" + d; return d; }
function waMsg(e){
  const s = statusOf(e), cs = e.card_status || "";
  const first = String(e.name || "").trim().split(/\s+/)[0] || "";
  const hi = first ? `Hi ${first[0].toUpperCase()}${first.slice(1).toLowerCase()},` : "Hi,";
  const n = e.expiry ? daysLeft(e.expiry) : 0;
  const when = s === "exp" ? ` Your card expired on ${fmtDate(e.expiry)}.` : s === "due" ? ` Your card expires on ${fmtDate(e.expiry)}.` : "";
  const BY_CARD = {
    "Training pending": `${hi} please complete your Baladiya health training as soon as possible.${when} Let your area manager know once it's done. Thank you.`,
    "Training done but card status not updated": `${hi} your Baladiya training is done, but your card isn't updated in the Baladiya system yet.${when} Please check it and send your area manager a photo of the updated card. Thank you.`,
    "Rescheduled for exam": `${hi} this is a reminder about your rescheduled Baladiya exam.${when} Please make sure you attend, and tell your area manager the result. Thank you.`,
    "Need to pay SAR 60": `${hi} please pay the SAR 60 Baladiya fee so your health card can be issued.${when} Send your area manager the receipt once it's paid. Thank you.`,
  };
  const msg = BY_CARD[cs] || (s === "exp" ? `${hi} your Baladiya card expired on ${fmtDate(e.expiry)}. Please renew it as soon as possible and share the new card with your area manager. Thank you.`
    : s === "due" ? `${hi} your Baladiya card expires on ${fmtDate(e.expiry)} (${n === 0 ? "today" : `in ${n} day${n === 1 ? "" : "s"}`}). Please book your renewal now. Thank you.`
    : s === "miss" ? `${hi} we don't have your Baladiya card expiry date. Please send a photo of your Baladiya card to your area manager. Thank you.` : "");
  return msg;
}
function waText(e){ const m = waMsg(e); return m ? "?text=" + encodeURIComponent(m) : ""; }
function contact(e){
  const p = phoneIntl(e.mobile); if (!p) return "";
  return `<span class="contact"><a href="tel:+${p}" title="Call" aria-label="Call">${ICON.phone}</a><a href="https://wa.me/${p}${waText(e)}" target="_blank" rel="noopener" onclick="${waText(e) ? `noteReminded('${e.id}')` : ""}" title="${waText(e) ? "WhatsApp — reminder ready to send" : "WhatsApp"}" aria-label="WhatsApp">${ICON.wa}</a></span>`;
}
const ICON = {
  dash:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/></svg>',
  users:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.8-3.6 3.4-5.5 6.5-5.5s5.7 1.9 6.5 5.5"/><path d="M16 4.5a3.5 3.5 0 0 1 0 7M18 14.8c1.9.7 3.1 2.5 3.5 5.2"/></svg>',
  up:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 15V4M7 9l5-5 5 5"/><path d="M4 15v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3"/></svg>',
  bell:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.9 1.9 0 0 0 3.4 0"/></svg>',
  spark:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/><path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z"/></svg>',
  shield:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/><path d="M9 12l2 2 4-4"/></svg>',
  edit:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 20h4L19 9l-4-4L4 16z"/></svg>',
  trash:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/></svg>',
  key:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" width="16" height="16"><circle cx="8" cy="15" r="4"/><path d="M10.8 12.2 20 3M16 7l3 3M14 9l2 2"/></svg>',
  phone:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2"/></svg>',
  check:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8.5 12.5l2.5 2.5 4.5-5"/></svg>',
  wa:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M3.5 20.5l1.3-4.2A8.5 8.5 0 1 1 8 19.6z"/><path d="M9 9.5c.3 2 2.2 4.1 4.5 4.8l1.2-1.2 1.8.9c-.3 1.2-1.3 1.9-2.4 1.8C10.8 15.4 8.5 13 8.2 10c-.1-1 .6-2 1.8-2.3l.9 1.8z"/></svg>',
};
const VIEWS = () => [
  ["dashboard","Dashboard",ICON.dash],["verify","Verify",ICON.check],["employees","Employees",ICON.users],
  ["alerts","Alerts",ICON.bell],
  ...(isAdmin() ? [["assistant","AI Assistant",ICON.spark],["import","Import",ICON.up],["logins","Users",ICON.shield]] : [])
];

// ---------- auth ----------
function loginError(err){
  const m = String(err?.message || err || ""), s = err?.status;
  if (/invalid login credentials/i.test(m)) return "Wrong email or password. Check for a typo, or ask your admin to reset your password.";
  if (/email not confirmed/i.test(m)) return "This login isn't activated yet. Ask your admin to add you again from the Users page.";
  if (s === 429 || /too many|rate limit/i.test(m)) return "Too many tries. Wait a minute, then try again.";
  if (!navigator.onLine || /failed to fetch|network|load failed|timeout/i.test(m)) return "No internet connection. Check your signal and try again.";
  return m || "Couldn't sign in. Please try again.";
}
$("#loginForm").addEventListener("submit", async e => {
  e.preventDefault(); const btn = $("#lbtn"); if (btn.disabled) return;
  $("#lerr").textContent = ""; btn.disabled = true; btn.textContent = "Signing in…";
  let error;
  try { ({ error } = await Promise.race([sb.auth.signInWithPassword({ email: $("#lemail").value.trim().toLowerCase(), password: $("#lpass").value }),
    new Promise(r => setTimeout(() => r({ error: { message: "timeout" } }), 20000))])); } catch (err) { error = err; }
  btn.disabled = false; btn.textContent = "Sign in";
  if (error) { $("#lerr").textContent = loginError(error); $("#lpass").select(); }
});
function clearLocalLogin(){ try { Object.keys(localStorage).filter(k => /^sb-.*-auth-token/.test(k)).forEach(k => localStorage.removeItem(k)); } catch (e) { /* storage blocked */ } }
let signingOut = false;
async function signOut(){
  if (signingOut) return; signingOut = true;
  document.querySelectorAll("button").forEach(b => { if (/sign out/i.test(b.textContent)) { b.disabled = true; b.textContent = "Signing out…"; } });
  try { if (S.channel) sb.removeChannel(S.channel); } catch (e) { /* ignore */ }
  // sign out on this device only; never wait more than 3 seconds for the server
  try { await Promise.race([sb.auth.signOut({ scope: "local" }), new Promise(r => setTimeout(r, 3000))]); } catch (e) { /* ignore */ }
  clearLocalLogin();
  location.replace(location.pathname + location.search);
}
sb.auth.onAuthStateChange((ev, session) => { setTimeout(() => { if (ev === "SIGNED_IN" && !S.me && !S.booting) boot(session); if (ev === "SIGNED_OUT" && !signingOut) { if (S.me) location.reload(); else show("login"); } }, 0); });
// signed out in another tab → this tab follows
window.addEventListener("storage", ev => { if (ev.key && /^sb-.*-auth-token/.test(ev.key) && !ev.newValue && S.me && !signingOut) location.replace(location.pathname + location.search); });
// phone or laptop woken up after a while → check the login is still valid and refresh the data
let hiddenAt = 0, rechecking = false;
document.addEventListener("visibilitychange", async () => {
  if (document.hidden) { hiddenAt = Date.now(); return; }
  if (!S.me || rechecking || Date.now() - hiddenAt < 60000) return;
  rechecking = true;
  try {
    const { data: u, error } = await sb.auth.getUser();
    if (error && error.status >= 400 && error.status < 500) { clearLocalLogin(); return location.replace(location.pathname + location.search); }
    if (u?.user) {
      const { data: me, error: pe } = await sb.from("trackit_profiles").select("*").eq("id", u.user.id).maybeSingle();
      if (!pe && !me) { S.me = null; return show("noaccess"); }          // login was removed by the admin
      if (me && (me.role !== S.me.role || me.scope_kind !== S.me.scope_kind || me.scope_value !== S.me.scope_value)) return location.reload();   // access changed
    }
    if (Date.now() - hiddenAt > 10 * 60000) { await loadAll(); render(true); }   // live updates cover shorter breaks
  } catch (e) { /* offline: the Live badge shows Reconnecting */ } finally { rechecking = false; }
});
function show(which){ ["login","noaccess","shell"].forEach(id => $("#"+id).classList.toggle("hidden", id !== which)); if (which !== "shell") hideSplash(); }
function hideSplash(){ const s = $("#splash"); if (!s || s.dataset.out) return; s.dataset.out = "1"; s.classList.add("out"); setTimeout(() => s.remove(), 400); }
setTimeout(hideSplash, 15000);
let xlsxP = null;
function needXLSX(){ if (window.XLSX) return Promise.resolve(); return xlsxP || (xlsxP = new Promise((ok, bad) => { const s = document.createElement("script"); s.src = "https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js"; s.onload = () => ok(); s.onerror = () => { xlsxP = null; s.remove(); bad(new Error("Couldn't load the Excel reader. Check your internet and try again.")); }; document.head.appendChild(s); })); }
async function boot(session){ if (S.booting || S.me) return; S.booting = true; try { await bootInner(session); } catch (e) { console.error(e); if (!S.me) showConnError(); } finally { S.booting = false; } }
async function bootInner(session){
  if (!session) { const { data } = await sb.auth.getSession(); session = data.session; }
  if (!session) return show("login");
  // check with the login server that this login is still active (it may have been ended on another device)
  const core = loadCore().catch(() => null);          // start the data download straight away
  const [{ error: uErr }, { data: me, error: meErr }] = await Promise.all([
    sb.auth.getUser().catch(err => ({ error: err })),
    sb.from("trackit_profiles").select("*").eq("id", session.user.id).maybeSingle(),
  ]);
  if (uErr && uErr.status >= 400 && uErr.status < 500) { try { await sb.auth.signOut({ scope: "local" }); } catch (e) { /* ignore */ } clearLocalLogin(); return show("login"); }
  if (meErr) { showConnError(); return; }
  if (!me) return show("noaccess");
  S.me = me;
  $("#meName").textContent = me.full_name || me.email;
  $("#meRole").textContent = isAdmin() ? "Admin" : scopeKind() === "all" ? "User" : ({ store:"Store", dept:"Department", am:"Area manager" }[scopeKind()]);
  show("shell");
  await Promise.all([core, loadAdmin()]); subscribe();
  go(location.hash.slice(1) || "dashboard");
  hideSplash();
}

function showConnError(){ hideSplash();
  const box = $("#noaccess .login-card");
  box.innerHTML = `<div class="brand"><img class="logo" src="icon.svg" alt="Trackit"><div><b>Trackit</b></div></div>
    <h1>Couldn't connect</h1><p>Trackit couldn't reach the server. Check your internet connection and try again.</p>
    <button class="btn" onclick="location.reload()">Try again</button>`;
  show("noaccess");
}

// ---------- data ----------
// pages of 1,000 rows, fetched 3 at a time in parallel (2,000+ staff arrive in one round trip)
async function pageAll(table, order){
  const rows = [], page = from => sb.from(table).select("*").order(order).order("id").range(from, from + 999);
  for (let from = 0; ; from += 3000) {
    const res = await Promise.all([page(from), page(from + 1000), page(from + 2000)]);
    for (const { data, error } of res) { if (error) { toast(error.message); return rows; } rows.push(...data); }
    if (res.some(r => (r.data || []).length < 1000)) return rows;
  }
}
// everything loads at the same time — one round trip instead of several in a row
async function loadAll(){ await Promise.all([loadCore(), loadAdmin()]); }
async function loadCore(){
  const [all, mp, al, mm, dp] = await Promise.all([pageAll("trackit_staff", "expiry"), sb.from("trackit_store_map").select("*").order("code"), sb.from("trackit_store_alias").select("store,code"), sb.from("trackit_map_meta").select("*").eq("id", 1).maybeSingle(), sb.from("trackit_departments").select("name").order("sort"), loadReqs()]);
  all.sort((a, b) => (a.expiry || "0000") < (b.expiry || "0000") ? -1 : 1);
  S.emps = all.filter(e => !e.left_at);                 // active staff: every count, list, alert and email uses these
  S.left = all.filter(e => e.left_at).sort((a, b) => a.left_at < b.left_at ? 1 : -1);
  if (!dp.error && Array.isArray(dp.data)) S.depts = dp.data.map(d => d.name);
  if (!mp.error && Array.isArray(mp.data)) { S.map = {}; for (const m of mp.data) S.map[m.code] = m; }
  if (!al.error && Array.isArray(al.data)) { S.alias = {}; for (const x of al.data) S.alias[x.store] = x.code; }
  if (!mm.error) S.mapMeta = mm.data || null;
  mapCache = new Map();
}
async function loadAdmin(){
  if (isAdmin()) {
    const [{ data }, { data: st }, { data: cr }, { data: bk }] = await Promise.all([sb.from("trackit_profiles").select("*").order("full_name"),
      sb.from("trackit_settings").select("email_enabled,recipients,sender_email,sender_name,frequency,weekday,send_hour,last_sent,last_result").eq("id", 1).maybeSingle(),
      sb.from("trackit_login_creds").select("profile_id,login,password"),
      sb.from("trackit_backup_status").select("ok,message,last_ok_at,checked_at,made_by").eq("id", 1).maybeSingle()]);
    S.profiles = data || []; S.settings = st; S.backup = bk || null;
    S.creds = {}; for (const c of cr || []) S.creds[c.profile_id] = c;
  }
}
// ---------- move requests between stores ----------
async function loadReqs(){
  const since = new Date(Date.now() - 7 * 86400000).toISOString();
  const { data, error } = await sb.from("trackit_move_requests").select("*").or(`status.eq.pending,decided_at.gte.${since}`).order("requested_at", { ascending: false }).limit(300);
  if (!error && Array.isArray(data)) S.reqs = data;
}
const canSeeUnit = (k, u) => { const sk = scopeKind(), v = S.me?.scope_value; if (sk === "all") return true; if (sk === "store") return k === "store" && u === v; if (sk === "dept") return k === "dept" && u === v; if (sk === "am") return k === "store" && S.map[u]?.area_manager === v; return false; };
const myApproval = r => r.status === "pending" && (isAdmin() || (r.needs === "from" ? canSeeUnit(r.from_kind, r.from_unit) : canSeeUnit(r.to_kind, r.to_unit)));
const reqLbl = (k, u) => k === "unassigned" ? "Unassigned" : placeLabel(k, u);
function reqPanel(){
  const all = S.reqs || [], mine = all.filter(myApproval), sent = all.filter(r => r.requested_by === S.me.id && !myApproval(r) && !r.dismissed);
  if (!mine.length && !sent.length) return "";
  const who = r => `<b>${esc(r.staff_name)}</b>${r.staff_emp ? ` <span class="sub" style="display:inline">No. ${esc(r.staff_emp)}</span>` : ""}`;
  const route = r => `${esc(reqLbl(r.from_kind, r.from_unit))} → ${esc(reqLbl(r.to_kind, r.to_unit))}`;
  return `<div class="card pad section req-card">
    ${mine.length ? `<h3>Waiting for your approval (${mine.length})</h3>
      ${mine.map(r => `<div class="req-row"><div>${who(r)}<div class="sub">${route(r)} · asked by ${esc(r.requested_by_name)} · ${fmtTS(r.requested_at)}</div><div class="sub">${r.needs === "from" ? "They want this person to move to their store." : "They're sending this person to you."}</div></div>
        <div class="req-btns"><button class="btn sm" onclick="decideReq('${r.id}','approve',this)">Approve</button><button class="btn sm ghost danger-t" onclick="decideReq('${r.id}','decline',this)">Decline</button></div></div>`).join("")}` : ""}
    ${sent.length ? `<h3 ${mine.length ? 'style="margin-top:14px"' : ""}>Your move requests</h3>
      ${sent.map(r => `<div class="req-row"><div>${who(r)}<div class="sub">${route(r)} · ${fmtTS(r.requested_at)}</div></div>
        <div class="req-btns">${r.status === "pending" ? `<span class="pill p-due"><i></i>Waiting</span><button class="btn sm ghost" onclick="decideReq('${r.id}','cancel',this)">Cancel</button>` : `<span class="pill ${r.status === "approved" ? "p-ok" : "p-exp"}"><i></i>${r.status === "approved" ? "Approved" : r.status === "declined" ? "Declined" : "Cancelled"}</span>${r.decided_by_name ? `<span class="sub">by ${esc(r.decided_by_name)}</span>` : ""}<button class="btn sm ghost" onclick="dismissReq('${r.id}',this)" title="Remove from my dashboard">Dismiss</button>`}</div></div>`).join("")}` : ""}
  </div>`;
}
async function dismissReq(id, btn){
  btn.disabled = true;
  const { error } = await sb.rpc("trackit_dismiss_move", { p_req: id });
  if (error) { btn.disabled = false; return toast(error.message); }
  const r = (S.reqs || []).find(x => x.id === id); if (r) r.dismissed = true; render();
}
async function decideReq(id, action, btn){
  btn.disabled = true;
  const r = (S.reqs || []).find(x => x.id === id);
  const { error } = await sb.rpc("trackit_decide_move", { p_req: id, p_action: action });
  if (error) { btn.disabled = false; toast(error.message); await loadReqs(); return render(); }
  toast(action === "approve" ? `Approved — ${r?.staff_name || "they"} moved to ${reqLbl(r?.to_kind, r?.to_unit)}` : action === "decline" ? "Declined" : "Request cancelled");
  await loadReqs(); if (r) await refreshOne(r.staff_id); render();
}

// ---------- live updates: only the changed person travels, never the whole list ----------
const byExpiry = (a, b) => (a.expiry || "0000") < (b.expiry || "0000") ? -1 : (a.expiry || "0000") > (b.expiry || "0000") ? 1 : 0;
function putRow(row, goneId){
  const id = row?.id || goneId;
  S.emps = S.emps.filter(e => e.id !== id); S.left = S.left.filter(e => e.id !== id);
  if (row) { if (row.left_at) { S.left.push(row); S.left.sort((a, b) => a.left_at < b.left_at ? 1 : -1); } else { S.emps.push(row); S.emps.sort(byExpiry); } }
}
function applyChange(p){
  if (p.eventType === "DELETE") putRow(null, p.old?.id);
  else if (p.new?.id) putRow(p.new);
}
// after my own save: fetch just that one person (they may have moved out of my list)
async function refreshOne(id){
  const { data, error } = await sb.from("trackit_staff").select("*").eq("id", id).maybeSingle();
  if (error) return loadAll();
  putRow(data || null, id);
}
let reloadT = null, pending = [];
function subscribe(){
  S.channel = sb.channel("trackit-staff")
    .on("postgres_changes", { event: "*", schema: "public", table: "trackit_staff" }, p => {
      pending.push(p);
      clearTimeout(reloadT); reloadT = setTimeout(() => { const ps = pending; pending = []; ps.forEach(applyChange); render(true); }, 400);
    })
    .on("postgres_changes", { event: "*", schema: "public", table: "trackit_move_requests" }, () => {
      clearTimeout(S.reqT); S.reqT = setTimeout(async () => { await loadReqs(); render(true); }, 400);
    }).subscribe(status => {
      const online = status === "SUBSCRIBED";
      document.body.classList.toggle("offline", !online);
      if (online && S.wasOffline) { S.wasOffline = false; loadAll().then(() => render(true)); }
      if (!online) S.wasOffline = true;
    });
}
const stores = () => [...new Set(S.emps.map(placeOf))].sort();

// ---------- routing ----------
function go(v){ if (!VIEWS().some(x => x[0] === v)) v = "dashboard"; S.view = v; S.page = 1; location.hash = v; render(); const m = $("#main"); if (m) m.scrollTop = 0; }
window.addEventListener("hashchange", () => { const v = location.hash.slice(1); if (S.me && v && v !== S.view) go(v); });
function renderNav(){
  $("#nav").innerHTML = VIEWS().map(([k,l,i]) => `<button class="${S.view===k?"on":""}" onclick="go('${k}')">${i}<span>${l}</span></button>`).join("");
  const short = { "AI Assistant":"Ask AI" };
  $("#bnav").innerHTML = VIEWS().filter(([k]) => k !== "import").map(([k,l,i]) => `<button class="${S.view===k?"on":""}" onclick="go('${k}')">${i}<span>${short[l]||l}</span></button>`).join("");
}
function render(fromLive){
  renderNav();
  if (fromLive && (S.view === "assistant" || (S.view === "import" && S.imp))) return;
  const f = { dashboard, verify: verifyView, employees, import: importView, alerts, assistant, logins: loginsView }[S.view];
  const keepFocus = document.activeElement?.id;
  $("#main").innerHTML = f();
  if (S.view === "assistant") afterChat();
  if (S.view === "import") bindDrop();
  if (keepFocus && document.getElementById(keepFocus)) { const el = document.getElementById(keepFocus); el.focus(); if (el.setSelectionRange && el.value) el.setSelectionRange(el.value.length, el.value.length); }
}
// run after typing pauses (search boxes), so the page isn't rebuilt on every letter
let laterT = null; const later = (fn, ms = 180) => { clearTimeout(laterT); laterT = setTimeout(fn, ms); };
const header = (t, p, extra="") => `<div class="top"><div><h2>${t}</h2><p>${p}</p></div><div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap"><span class="live" title="Updates appear automatically"><i></i><span class="on-txt">Live</span><span class="off-txt">Reconnecting…</span></span>${extra}</div></div>`;

// ---------- dashboard ----------
function counts(list){ const c = { unv:0, exp:0, due:0, miss:0, ok:0, total:list.length }; for (const e of list) c[statusOf(e)]++; return c; }
const oneUnit = () => scopeKind() === "store" || scopeKind() === "dept";   // a store or department login only ever sees its own people
function groupSwitch(){
  if (oneUnit()) return "";
  if (!hasMap()) return groupTable("By store / department", "Store / department", groupRows(placeOf), "store");
  const g = GROUPS[S.groupBy] || GROUPS.store;
  return `<div class="grp-seg" role="tablist" aria-label="Group by">${Object.entries(GROUPS).map(([k, [l]]) => `<button role="tab" class="${S.groupBy === k ? "on" : ""}" aria-selected="${S.groupBy === k}" onclick="S.groupBy='${k}';render()">${l}</button>`).join("")}</div>` +
    groupTable(`By ${g[0].toLowerCase()}`, g[0], groupRows(g[1]), S.groupBy);
}
function groupRows(keyFn){
  const g = {};
  for (const e of S.emps) { const k = keyFn(e) || "—"; g[k] ??= { total:0, unv:0, exp:0, due:0, miss:0, ok:0 }; g[k].total++; g[k][statusOf(e)]++; }
  return Object.entries(g).sort((a,b) => (b[1].exp*1e6 + b[1].due*1e3 + b[1].miss) - (a[1].exp*1e6 + a[1].due*1e3 + a[1].miss));
}
const pctTxt = (n, t) => t ? `${n} <span class="sub" style="display:inline">${Math.round(n / t * 100)}%</span>` : "0";
function groupTable(titleTxt, colName, rows, filterKey){
  if (!rows.length) return "";
  return `<div class="card"><div class="pad" style="padding-bottom:6px"><h3>${titleTxt}</h3></div><div class="tbl-wrap"><table><thead><tr><th>${colName}</th><th>Staff</th><th>Verified</th><th>Expired</th><th>Due</th><th class="hm">No date</th></tr></thead><tbody>
  ${rows.map(([k,v]) => `<tr style="cursor:pointer" onclick="openGroup('${filterKey}',this.dataset.k)" data-k="${esc(k === "—" ? "" : k)}"><td><b>${esc(k)}</b></td><td class="mono">${v.total}</td><td class="mono">${pctTxt(v.total - v.unv, v.total)}</td><td class="mono" style="color:${v.exp?"var(--red)":"var(--muted)"};font-weight:${v.exp?700:400}">${v.exp}</td><td class="mono" style="color:${v.due?"var(--amber)":"var(--muted)"};font-weight:${v.due?700:400}">${v.due}</td><td class="mono hm">${v.miss}</td></tr>`).join("")}
  </tbody></table></div></div>`;
}
function openGroup(key, val){ S.filters = { q:"", store:"", status:"", cs:"", am:"", rom:"", city:"", region:"" }; S.filters[key] = val === "" ? "__none" : val; go("employees"); }
function dashboard(){
  const c = counts(S.emps);
  const kpi = (st, lbl, v, sub, col) => `<div class="card kpi" onclick="quick('${st}')"><div class="l"><span class="dot" style="background:${col}"></span>${lbl}</div><div class="v mono" style="color:${col}">${v.toLocaleString()}</div><div class="s">${sub}</div></div>`;
  const next = S.emps.filter(e => ["exp","due"].includes(statusOf(e))).slice(0, 8);
  const csl = cardStatusList();
  const nStores = new Set(S.emps.filter(e => e.unit_kind === "store").map(e => e.unit)).size, nDept = new Set(S.emps.filter(isDept).map(e => e.unit)).size;
  const vDone = c.total - c.unv;
  return header("Dashboard", `${scopeName() ? esc(scopeName()) + " · " : ""}${c.total.toLocaleString()} employees${nStores > 1 ? ` · ${nStores} stores` : ""}${nDept > 1 ? ` · ${nDept} departments` : ""}${S.left.length ? ` · ${S.left.length} marked as left` : ""}`,
    S.emps.length ? `<button class="btn ghost" onclick="printReport()">PDF report</button>` : "") + `
  ${reqPanel()}
  <div class="card pad balady-card"><div><b>Check a health certificate</b><div class="sub" dir="rtl" lang="ar">الاستعلام عن الشهادة الصحية</div><p class="note" style="margin:4px 0 0">Store inside <b>Riyadh city</b> → Amanat Al-Riyadh. Store in <b>any other city</b> → Balady. Search with the employee's Iqama number, then confirm the expiry date on the Verify page.</p></div><div class="balady-btns">${baladyBtn()}</div></div>
  ${c.total ? `<div class="card pad vprog-card" onclick="go('verify')" style="cursor:pointer"><div class="vprog-top"><b>Balady verification</b><span class="mono">${vDone.toLocaleString()} of ${c.total.toLocaleString()} verified</span></div>
    <div class="vbar"><i style="width:${Math.round(vDone / c.total * 100)}%"></i></div><p class="note" style="margin:6px 0 0">${c.unv ? `${c.unv.toLocaleString()} still to check on the Balady website. Alerts only count verified people.` : "Everyone is verified. Alerts are based on confirmed dates."}</p></div>` : ""}
  <div class="kpis k5">
    ${kpi("unv", "Not verified", c.unv, "Check on Balady", "#7A6F62")}
    ${kpi("exp", "Expired", c.exp, "Renew now", "var(--red)")}
    ${kpi("due", STATUS_LABEL.due, c.due, "Book renewals", "var(--amber)")}
    ${kpi("miss", "Date missing", c.miss, "Check Baladiya system", "#6E655B")}
    ${kpi("ok", "OK", c.ok, `More than ${DUE_DAYS} days`, "var(--teal-d)")}
  </div>
  ${csl.length ? `<div class="card section"><div class="pad" style="padding-bottom:4px"><h3>Card status</h3><p class="note" style="margin:4px 0 0">Where people are in the renewal process. Tap one to see who.</p></div>
    <div class="cs-grid">${csl.map(([k, n]) => `<button class="cs-tile" onclick="openCs(this.dataset.k)" data-k="${esc(k)}"><b class="mono">${n}</b><span>${esc(k)}</span></button>`).join("")}</div></div>` : ""}
  ${groupSwitch()}
  <div class="card section"><div class="pad" style="padding-bottom:6px"><h3>Needs action soonest</h3></div>
    ${next.length ? `<div class="tbl-wrap"><table><thead><tr><th>Employee</th><th class="hm">Store</th><th>Expiry</th><th class="hm">Card status / remarks</th></tr></thead><tbody>
    ${next.map(e => `<tr onclick="editEmp('${e.id}')" style="cursor:pointer"><td><b>${esc(e.name)}</b><div class="sub mono">${esc(eid(e) || (e.iqama ? "ID …" + e.iqama.slice(-4) : ""))}<span class="sm-only"> · ${esc(placeOf(e))}</span></div></td><td class="hm">${esc(placeOf(e))}</td><td class="mono">${dateCell(e)}</td><td class="hm">${remarksCell(e)}</td></tr>`).join("")}
    </tbody></table></div><div class="pager"><span>The 8 most overdue</span><button class="btn sm ghost" onclick="go('alerts')">See all alerts</button></div>` : `<div class="empty">${S.emps.length ? `Nothing verified is expired or due in the next ${DUE_DAYS} days.` : (isAdmin() ? "No employees yet. Go to <a href='#import'>Import</a> to upload the staff file." : "No employees in your list yet.")}</div>`}
  </div>`;
}
function openCs(k){ S.filters = { q:"", store:"", status:"", cs:k, am:"", rom:"", city:"", region:"" }; go("employees"); }
function quick(st){ S.filters = { q:"", store:"", status:st, cs:"", am:"", rom:"", city:"", region:"" }; go("employees"); }

// ---------- verify on Balady ----------
const progOpen = () => S.progOpen ?? false;
function verifyView(){
  const k = scopeKind(), wide = k === "all" || k === "am";
  const all = S.emps, done = all.filter(e => e.verified_at).length;
  const base = S.vUnit ? all.filter(e => placeOf(e) === S.vUnit) : all;
  const ql = S.vq.trim().toLowerCase();
  const match = e => !ql || e.name.toLowerCase().includes(ql) || eid(e).toLowerCase().includes(ql) || String(e.iqama).includes(ql) || String(e.job_role || "").toLowerCase().includes(ql);
  const todo = base.filter(e => !e.verified_at && match(e)), ok = base.filter(e => e.verified_at && match(e)).sort((a, b) => a.verified_at < b.verified_at ? 1 : -1);
  const list = S.vTab === "done" ? ok : todo, per = 15, pages = Math.max(1, Math.ceil(list.length / per));
  S.page = Math.min(S.page, pages); const slice = list.slice((S.page - 1) * per, S.page * per);
  const pct = all.length ? Math.round(done / all.length * 100) : 0;
  const prog = wide && all.length ? groupRows(placeOf).map(([p, v]) => [p, v.total, v.total - v.unv]).sort((x, y) => (x[0] === "Unassigned" ? -1 : y[0] === "Unassigned" ? 1 : 0) || (x[2] / x[1]) - (y[2] / y[1]) || y[1] - x[1]) : [];
  const nUn = all.filter(e => e.unit_kind === "unassigned").length;
  return header("Verify on Balady", scopeName() ? esc(scopeName()) : "Check every person on the Balady website, then confirm", `<div class="v-acts${k !== "am" ? "" : " odd"}">${baladyBtn("btn tan")}<button class="btn ghost" onclick="findPerson()">Find a person</button>${k !== "am" ? `<button class="btn" onclick="editEmp()">+ Add new staff</button>` : ""}</div>`) + `
  <div class="card pad"><div class="vprog-top"><b>${done.toLocaleString()} of ${all.length.toLocaleString()} verified</b><span class="mono">${pct}%</span></div><div class="vbar"><i style="width:${pct}%"></i></div>
    <p class="note" style="margin:8px 0 0">Enter <b>Iqama</b> and <b>mobile</b> → check on Balady → enter the expiry (Gregorian or Hijri) → <b>Confirm</b>.${k === "store" || k === "dept" ? ` Missing someone? <b>Find a person</b>. Not working here? <b>Not here</b>.` : ""}</p></div>
  ${reqPanel()}
  ${wide && nUn ? `<div class="warnbox section" style="cursor:pointer" onclick="S.vUnit='Unassigned';S.page=1;render()"><b>${nUn.toLocaleString()} people have no store or department yet.</b> Their store can claim them with Find a person, or ${isAdmin() ? "you can" : "an admin can"} set it with Edit.</div>` : ""}
  ${prog.length ? `<details class="card section map-sec" ${progOpen() ? "open" : ""} ontoggle="if(this.open!==progOpen()){S.progOpen=this.open;render()}"><summary style="padding:14px 16px">Progress by store and department (${prog.length})</summary>${!progOpen() ? "" : `<div class="tbl-wrap"><table><thead><tr><th>Store / department</th><th>Staff</th><th>Verified</th><th class="hm">Left to check</th></tr></thead><tbody>
    ${prog.map(([p, t, v]) => `<tr style="cursor:pointer" data-p="${esc(p)}" onclick="S.vUnit=this.dataset.p;S.vTab='todo';S.page=1;render()"><td><b>${esc(p)}</b></td><td class="mono">${t}</td><td><div class="vbar sm"><i style="width:${Math.round(v / t * 100)}%"></i></div><span class="sub">${v} · ${Math.round(v / t * 100)}%</span></td><td class="mono hm">${t - v}</td></tr>`).join("")}
    </tbody></table></div>`}</details>` : ""}
  <div class="filters section">
    <input id="vq" type="search" placeholder="Search name, Employee No., Iqama or job…" value="${esc(S.vq)}" oninput="later(()=>{S.vq=this.value;S.page=1;render()})">
    ${wide || stores().length > 1 ? `<select aria-label="Store or department" onchange="S.vUnit=this.value;S.page=1;render()"><option value="">All stores & departments</option>${stores().map(p => `<option value="${esc(p)}" ${S.vUnit === p ? "selected" : ""}>${esc(p)}</option>`).join("")}</select>` : ""}
  </div>
  <div class="tabs">${[["todo", `To verify (${todo.length})`], ["done", `Verified (${ok.length})`]].map(([t, l]) => `<button class="${S.vTab === t ? "on" : ""}" onclick="S.vTab='${t}';S.page=1;render()">${l}</button>`).join("")}</div>
  <div class="vlist">${slice.length ? slice.map(S.vTab === "done" ? vDoneRow : vRow).join("") : `<div class="card empty">${S.vTab === "done" ? "Nobody verified yet." : base.length ? "Everyone here is verified. 🎉" : "Nobody here yet."}</div>`}</div>
  ${pages > 1 ? `<div class="pager card"><span>${list.length.toLocaleString()} people · page ${S.page} of ${pages}</span><span style="display:flex;gap:8px"><button class="btn sm ghost" ${S.page<=1?"disabled":""} onclick="S.page--;render();$('#main').scrollTop=0">Previous</button><button class="btn sm ghost" ${S.page>=pages?"disabled":""} onclick="S.page++;render();$('#main').scrollTop=0">Next</button></span></div>` : ""}`;
}
const whoLine = e => [eid(e) && `No. ${esc(eid(e))}`, e.job_role && esc(e.job_role), esc(placeOf(e))].filter(Boolean).join(" · ");
function vRow(e){
  const k = scopeKind();
  return `<div class="card vrow" data-id="${e.id}">
    <div class="vwho"><b>${esc(e.name)}</b><div class="sub">${whoLine(e)}</div>
      <div class="vid">${e.iqama ? `<span class="mono">${esc(e.iqama)}</span>` : ""}${checkLink(e)}</div>
      <div class="sub">In the file: ${e.expiry ? `<b>${fmtDate(e.expiry)}</b>` : `<b>${esc(e.expiry_note || "no date")}</b>`}${e.card_status ? ` · ${esc(e.card_status)}` : ""}</div>
      ${e.check_note ? `<div class="vcheck">${esc(e.check_note)}</div>` : ""}</div>
    <div class="vform">
      <div class="vin"><label>Iqama / National ID</label><input type="text" id="vi-${e.id}" inputmode="numeric" maxlength="10" value="${esc(dr(e, "vi", e.iqama))}" placeholder="10 digits" oninput="keep(this)"></div>
      <div class="vin"><label>Mobile</label><input type="text" id="vm-${e.id}" inputmode="tel" maxlength="14" value="${esc(dr(e, "vm", e.mobile))}" placeholder="5XXXXXXXX" oninput="keep(this)"></div>
      <div class="vin"><label>Expiry on Balady</label><input type="date" id="vd-${e.id}" value="${esc(dr(e, "vd", e.expiry))}" onchange="keep(this)"></div>
      <div class="vin"><label>or Hijri</label>${hijriBox(`vd-${e.id}`, `vh-${e.id}`, dr(e, "vh", ""))}</div>
      <div class="err" id="ve-${e.id}"></div>
      <div class="vbtns"><button class="btn" onclick="vConfirm('${e.id}', this)">Confirm</button>
        <button class="btn ghost sm" onclick="editEmp('${e.id}')">Edit</button>
        ${k === "store" || k === "dept" || (isAdmin() && e.unit_kind !== "unassigned") ? `<button class="btn ghost sm danger-t" onclick="vRelease('${e.id}', this)">Not here</button>` : ""}</div>
    </div></div>`;
}
const vDoneRow = e => `<div class="card vrow done"><div class="vwho"><b>${esc(e.name)}</b><div class="sub">${whoLine(e)}</div></div>
  <div class="vres">${pill(e)}<div class="mono">${e.expiry ? fmtDate(e.expiry) : esc(e.expiry_note || "No card")}</div><div class="sub">by ${esc(e.verified_by_name || "—")} · ${fmtTS(e.verified_at)}</div>
  <button class="btn ghost sm" onclick="editEmp('${e.id}')">Edit</button></div></div>`;
// "Check on Balady" for one person: copies their Iqama (typed or saved) and opens the right website
function checkLink(e){
  return ["riyadh", "other"].map(z => `<a class="linkbtn" href="${BALADY[z].url}" target="_blank" rel="noopener" onclick="copyIqama('${e.id}')">${BALADY[z].short} ↗</a>`).join(" · ");
}
function copyIqama(id){
  const v = ($(`#vi-${id}`)?.value || findEmp(id)?.iqama || "").replace(/\D/g, "");
  if (v) try { navigator.clipboard.writeText(v).then(() => toast("Iqama copied — paste it in the search box"), () => {}); } catch (e) { /* clipboard blocked */ }
}
function copyTxt(t){ try { navigator.clipboard.writeText(t).then(() => toast("ID copied — paste it on the Balady website"), () => toast(t)); } catch (e) { toast(t); } }
async function vConfirm(id, btn){
  const e = findEmp(id); if (!e || btn.disabled) return;
  const d = $(`#vd-${id}`).value, er = $(`#ve-${id}`); er.textContent = "";
  const iq = $(`#vi-${id}`).value.replace(/[٠-٩]/g, x => "٠١٢٣٤٥٦٧٨٩".indexOf(x)).replace(/\D/g, ""), mob = normMobile($(`#vm-${id}`).value.replace(/[٠-٩]/g, x => "٠١٢٣٤٥٦٧٨٩".indexOf(x)));
  if (!/^[12]\d{9}$/.test(iq)) { er.textContent = "Iqama / National ID must be 10 digits, starting with 1 or 2."; $(`#vi-${id}`).focus(); return; }
  if (!/^5\d{8}$/.test(mob)) { er.textContent = "Mobile must be 9 digits starting with 5 (e.g. 5XXXXXXXX)."; $(`#vm-${id}`).focus(); return; }
  if (!d) { er.textContent = "Enter the expiry date shown on the health-certificate website (Gregorian or Hijri)."; return; }
  if (d && (d < "2015-01-01" || d > "2040-12-31")) { er.textContent = "That date doesn't look right. Check the year."; return; }
  btn.disabled = true; btn.textContent = "Saving…";
  const row = { iqama: iq, mobile: mob, expiry: d, expiry_note: "", verified_at: new Date().toISOString() };
  let res; try { res = await sb.from("trackit_staff").update(row).eq("id", id).eq("updated_at", e.updated_at).select("id,updated_at"); } catch (err) { res = { error: { message: loginError(err) } }; }
  if (res.error || !res.data?.length) { btn.disabled = false; btn.textContent = "Confirm"; er.textContent = res.error?.code === "23505" ? "This Iqama number is already used by another employee in Trackit. Check the number." : res.error ? res.error.message : "Someone else just changed this person. Refresh the page and try again."; return; }
  Object.assign(e, row, { updated_at: res.data[0].updated_at, verified_by_name: S.me.full_name || S.me.email }); delete S.drafts[id];
  const card = btn.closest(".vrow"); card.classList.add("gone"); toast(`${e.name.split(" ")[0]} verified`);
  setTimeout(() => render(), 350);
}
async function vRelease(id, btn){
  if (!btn.dataset.sure) { btn.dataset.sure = "1"; btn.textContent = "Tap again — remove from my list"; setTimeout(() => { if (btn.isConnected) { delete btn.dataset.sure; btn.textContent = "Not here"; } }, 4000); return; }
  btn.disabled = true;
  const { error } = await sb.rpc("trackit_move_staff", { p_id: id, p_kind: "unassigned", p_unit: "" });
  if (error) { btn.disabled = false; return toast(error.message); }
  toast("Moved to Unassigned — their real store can claim them"); await refreshOne(id); render();
}
// ---------- find a person and bring them to my store ----------
function targets(){
  const k = scopeKind();
  if (k === "store" || k === "dept") return [[`${k}|${S.me.scope_value}`, placeLabel(k, S.me.scope_value)]];
  if (k === "am") return Object.values(S.map).filter(m => m.area_manager === S.me.scope_value).sort((x, y) => x.branch.localeCompare(y.branch)).map(m => [`store|${m.code}`, `${m.branch} (${m.code})`]);
  return [["unassigned|", "Unassigned"], ...S.depts.map(d => [`dept|${d}`, d]), ...Object.values(S.map).sort((x, y) => x.branch.localeCompare(y.branch)).map(m => [`store|${m.code}`, `${m.branch} (${m.code})`])];
}
function findPerson(){
  const t = targets();
  modal(`<h3>Find a person</h3><p class="note" style="margin-top:-6px">Search everyone in Trackit by name, Employee No. or full Iqama number, then move them to ${t.length === 1 ? `<b>${esc(t[0][1])}</b>` : "the right store"}.</p>
    <input type="search" id="fpq" placeholder="At least 3 letters or the full Iqama" autocomplete="off" oninput="clearTimeout(S.fpT);S.fpT=setTimeout(fpSearch,350)">
    ${t.length > 1 ? `<label>Move to</label><select id="fpTo">${t.map(([v, l]) => `<option value="${esc(v)}">${esc(l)}</option>`).join("")}</select>` : ""}
    <div id="fpOut" class="fp-out"></div>
    <div class="actions"><button class="btn ghost" onclick="closeModal()">Close</button></div>`, true);
  setTimeout(() => $("#fpq")?.focus(), 50);
}
async function fpSearch(){
  const q = $("#fpq")?.value.trim(), out = $("#fpOut"); if (!out) return;
  if (!q || q.length < 3) { out.innerHTML = ""; return; }
  out.innerHTML = `<p class="note">Searching…</p>`;
  const { data, error } = await sb.rpc("trackit_find_staff", { q });
  if ($("#fpq")?.value.trim() !== q) return;
  if (error) { out.innerHTML = `<div class="err">${esc(error.message)}</div>`; return; }
  out.innerHTML = data.length ? data.map(p => `<div class="fp-row"><div><b>${esc(p.name)}</b><div class="sub">${[p.employee_id && "No. " + esc(p.employee_id), p.id_last4 && "ID …" + esc(p.id_last4), p.job_role && esc(p.job_role)].filter(Boolean).join(" · ")}</div><div class="sub">Now: <b>${esc(p.place)}</b></div></div>
    ${!isAdmin() && scopeKind() !== "am" && p.unit_kind === scopeKind() && p.unit === S.me.scope_value ? `<span class="pill p-ok"><i></i>Already yours</span>` : `<button class="btn sm" onclick="fpMove('${p.id}', this)">${p.unit_kind === "unassigned" || isAdmin() ? "Move here" : "Request move"}</button>`}</div>`).join("") : `<p class="note">Nobody found. Check the spelling, or add them with <b>+ Add new staff</b>.</p>`;
}
async function fpMove(id, btn){
  const v = ($("#fpTo")?.value) || targets()[0][0], [k, u] = v.split("|");
  btn.disabled = true; btn.textContent = "Moving…";
  const label = btn.textContent;
  const { data, error } = await sb.rpc("trackit_request_move", { p_id: id, p_kind: k, p_unit: u || "" });
  if (error) { btn.disabled = false; btn.textContent = label; return toast(error.message === "Not allowed" ? "You can't move this person there" : error.message); }
  btn.textContent = data === "unchanged" ? "Already here" : data === "requested" ? "Requested ✓" : "Moved ✓";
  toast(data === "unchanged" ? "Already there" : data === "requested" ? "Request sent — their current store must approve it" : `Moved to ${placeLabel(k, u)} — verify them now`);
  if (data === "requested") await loadReqs(); else await refreshOne(id);
  if (S.view === "verify" || S.view === "employees" || S.view === "dashboard") render();
}

// ---------- employees ----------
function filtered(){
  const { q, store, status, cs, am, rom, city, region } = S.filters; const ql = q.trim().toLowerCase();
  const mf = (v, want) => !want || (want === "__none" ? !v : v === want);
  const base = status === "left" ? S.left : S.emps;
  return base.filter(e => (!ql || e.name.toLowerCase().includes(ql) || eid(e).toLowerCase().includes(ql) || String(e.job_role || "").toLowerCase().includes(ql) || String(e.iqama).includes(ql) || String(e.mobile).includes(ql)) &&
    (!store || placeOf(e) === store) && (!status || status === "left" || statusOf(e) === status) &&
    (!cs || (cs === "__none" ? !e.card_status : e.card_status === cs)) &&
    mf(GROUPS.am[1](e), am) && mf(GROUPS.rom[1](e), rom) && mf(GROUPS.city[1](e), city) && mf(GROUPS.region[1](e), region)).sort(sorter());
}
function sorter(){
  const k = S.sortBy;
  const ex = (a, b) => (a.expiry || "0000") < (b.expiry || "0000") ? -1 : (a.expiry || "0000") > (b.expiry || "0000") ? 1 : 0;
  if (k === "expiry" || !k) return ex;
  const val = k === "name" ? (e => e.name) : (GROUPS[k] ? GROUPS[k][1] : (e => e.store));
  return (a, b) => String(val(a) || "\uffff").localeCompare(String(val(b) || "\uffff")) || ex(a, b);
}
function filterBar(){
  const f = S.filters;
  const sts = stores();
  const sel = (key, all, opts) => `<select aria-label="${all}" onchange="S.filters.${key}=this.value;S.page=1;render()"><option value="">${all}</option>${opts.map(([v,l]) => `<option value="${esc(v)}" ${f[key]===v?"selected":""}>${esc(l)}</option>`).join("")}</select>`;
  const vals = k => { const s = new Set(); let none = false; for (const e of S.emps) { const v = GROUPS[k][1](e); if (v) s.add(v); else none = true; } return [...[...s].sort().map(v => [v, v]), ...(none ? [["__none", "Not mapped"]] : [])]; };
  return `<div class="filters">
    <input id="fq" type="search" placeholder="Search name, ID, Iqama or mobile…" value="${esc(f.q)}" oninput="later(()=>{S.filters.q=this.value;S.page=1;render()})">
    ${sts.length > 1 ? sel("store", "All stores & departments", sts.map(s => [s, s])) : ""}
    ${sel("status", "All statuses", [...Object.entries(STATUS_LABEL), ...(S.left.length ? [["left", `Left the company (${S.left.length})`]] : [])])}
    ${sel("cs", "All card statuses", [...new Set([...CARD_STATUSES, ...cardStatusList().map(x => x[0])])].map(s => [s, s]).concat([["__none", "No card status"]]))}
    ${hasMap() && !oneUnit() ? `<button type="button" class="btn sm ghost more-f-btn" onclick="S.moreF=!S.moreF;render()">${S.moreF ? "Fewer filters" : `More filters${["region","city","am","rom"].some(k => f[k]) || S.sortBy !== "expiry" ? " •" : ""}`}</button>
    <span class="xf ${S.moreF ? "open" : ""}">${sel("region", "All regions", vals("region"))}${sel("city", "All cities", vals("city"))}${sel("am", "All area managers", vals("am"))}${sel("rom", "All ROMs", vals("rom"))}
    <select aria-label="Sort by" onchange="S.sortBy=this.value;S.page=1;render()">${[["expiry","Sort: expiry date"],["name","Sort: name"],["store","Sort: store / department"],["am","Sort: area manager"],["rom","Sort: ROM"],["city","Sort: city"],["region","Sort: region"]].map(([v,l]) => `<option value="${v}" ${S.sortBy===v?"selected":""}>${l}</option>`).join("")}</select></span>` : ""}
    ${Object.entries(f).some(([k, v]) => v && k !== "q") ? `<button class="btn sm ghost" onclick="S.filters={q:S.filters.q,store:'',status:'',cs:'',am:'',rom:'',city:'',region:''};S.page=1;render()">Clear filters</button>` : ""}
  </div>`;
}
function employees(){
  const list = filtered(); const per = 50; const pages = Math.max(1, Math.ceil(list.length / per));
  S.page = Math.min(S.page, pages); const slice = list.slice((S.page-1)*per, S.page*per);
  return header("Employees", scopeName() ? esc(scopeName()) : "Search, filter and update expiry dates", `<button class="btn ghost" onclick="exportCSV()">Export list</button><button class="btn" onclick="editEmp()">+ Add employee</button>`) + filterBar() + `
  <div class="card">${slice.length ? `<div class="tbl-wrap"><table><thead><tr><th>Employee</th><th class="hm">Store</th><th class="hm">Nationality</th><th>Baladiya expiry</th><th class="hm">Status</th><th class="hm">Card status / remarks</th><th></th></tr></thead><tbody>
    ${slice.map(e => `<tr><td><b>${esc(e.name)}</b><div class="sub mono">${esc(eid(e) || (e.iqama ? "ID …" + e.iqama.slice(-4) : ""))}<span class="sm-only"> · ${esc(placeOf(e))}</span></div>${e.left_at || e.card_status ? `<div class="sm-only-b">${e.left_at ? pill(e) + " " : ""}${csChip(e)}</div>` : ""}</td><td class="hm">${esc(placeOf(e))}${storeSub(e)}</td><td class="hm">${esc(e.nationality)}</td><td class="mono">${dateCell(e)}</td><td class="hm">${pill(e)}</td><td class="hm" style="max-width:260px">${remarksCell(e)}</td>
    <td style="white-space:nowrap;text-align:right">${contact(e)}<button class="icon-btn" title="Edit" aria-label="Edit" onclick="editEmp('${e.id}')" style="display:inline-block">${ICON.edit}</button>${isAdmin() ? `<button class="icon-btn hm" title="Delete" aria-label="Delete" onclick="delEmp('${e.id}')" style="display:inline-block">${ICON.trash}</button>` : ""}</td></tr>`).join("")}
  </tbody></table></div>
  <div class="pager"><span>${list.length.toLocaleString()} employee${list.length===1?"":"s"} · page ${S.page} of ${pages}</span><span style="display:flex;gap:8px"><button class="btn sm ghost" ${S.page<=1?"disabled":""} onclick="S.page--;render()">Previous</button><button class="btn sm ghost" ${S.page>=pages?"disabled":""} onclick="S.page++;render()">Next</button></span></div>`
  : `<div class="empty">${S.emps.length ? "No employees match these filters." : "No employees yet. Use <a href='#import'>Import</a> to upload this week's file."}</div>`}</div>`;
}
// ---------- Hijri (Umm al-Qura) → Gregorian ----------
// Official Umm al-Qura calendar, built in so every phone and PC converts exactly the same way.
// One number per Hijri year from 1440: its 12 bits say which months have 30 days (first bit = Muharram).
const UQ_Y0 = 1440, UQ_START = Date.UTC(2018, 8, 11);   // 1 Muharram 1440 = 11 Sep 2018
const UQ = [1492, 2778, 1370, 2731, 1429, 1865, 1892, 2986, 1461, 694, 2646, 3370, 3733, 1834, 1877, 858, 2397, 1179, 2637, 3366, 3411];
const uqLen = (y, m) => 29 + ((UQ[y - UQ_Y0] >> (12 - m)) & 1);
function hijriParts(txt){
  const m = String(txt || "").trim().replace(/[٠-٩]/g, d => "٠١٢٣٤٥٦٧٨٩".indexOf(d)).replace(/[۰-۹]/g, d => "۰۱۲۳۴۵۶۷۸۹".indexOf(d)).match(/^(\d{1,4})\D+(\d{1,2})\D+(\d{1,4})$/);
  if (!m) return null;
  const a = +m[1], b = +m[2], c = +m[3];
  return a > 1000 ? [a, b, c] : c > 1000 ? [c, b, a] : null;
}
function hijriToG(txt){
  const p = hijriParts(txt); if (!p) return "";
  const [y, mo, d] = p;
  if (y < UQ_Y0 || y >= UQ_Y0 + UQ.length || mo < 1 || mo > 12 || d < 1 || d > uqLen(y, mo)) return "";
  let days = d - 1;
  for (let yy = UQ_Y0; yy < y; yy++) for (let mm = 1; mm <= 12; mm++) days += uqLen(yy, mm);
  for (let mm = 1; mm < mo; mm++) days += uqLen(y, mm);
  return new Date(UQ_START + days * 86400000).toISOString().slice(0, 10);
}
const HMONTHS = ["Muharram","Safar","Rabi al-Awwal","Rabi al-Thani","Jumada al-Ula","Jumada al-Akhirah","Rajab","Shaban","Ramadan","Shawwal","Dhul Qadah","Dhul Hijjah"];
const WDAYS = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
// typing a Hijri date fills the normal date box next to it
function hjText(v){ const g = hijriToG(v); if (!g) return ""; const [y, m, d] = hijriParts(v); return `${d} ${HMONTHS[m - 1]} ${y} = ${WDAYS[new Date(g).getUTCDay()]} ${fmtDate(g)}`; }
function hijriInput(inp, dateId){
  const out = inp.parentElement.querySelector(".hj-out"), v = inp.value.trim(), g = v ? hijriToG(v) : "";
  if (!v) { out.textContent = ""; return; }
  if (g) { const di = document.getElementById(dateId); if (di) { di.value = g; di.dispatchEvent(new Event("change", { bubbles: true })); }
    const [y, m, d] = hijriParts(v); out.textContent = `${d} ${HMONTHS[m - 1]} ${y} = ${WDAYS[new Date(g).getUTCDay()]} ${fmtDate(g)}`; out.className = "hj-out ok"; }
  else { const p = hijriParts(v); out.className = "hj-out bad";
    out.textContent = !p ? "Type it like 1447-09-15 or 15/09/1447" : p[0] < UQ_Y0 || p[0] >= UQ_Y0 + UQ.length ? `Only years ${UQ_Y0}–${UQ_Y0 + UQ.length - 1} — check the year` : p[1] < 1 || p[1] > 12 ? "Month must be 1–12" : `${HMONTHS[p[1] - 1]} ${p[0]} has only ${uqLen(p[0], p[1])} days`; }
}
const hijriBox = (dateId, id, val = "") => `<span class="hj"><input type="text" ${id ? `id="${id}"` : ""} class="in-sm" inputmode="numeric" placeholder="Hijri, e.g. 1447-09-15" aria-label="Hijri date" value="${esc(val)}" oninput="hijriInput(this,'${dateId}');if(this.id)keep(this)"><span class="hj-out ${val && hjText(val) ? "ok" : ""}">${val ? hjText(val) : ""}</span></span>`;
// unsaved typing on Verify cards, kept until Confirm
S.drafts = {};
function keep(el){ const [f, ...rest] = el.id.split("-"), id = rest.join("-"); (S.drafts[id] ??= {})[f] = el.type === "checkbox" ? (el.checked ? "1" : "") : el.value; }
const dr = (e, f, dflt) => { const d = S.drafts[e.id]; return d && f in d ? d[f] : (dflt || ""); };

// ---------- workplaces ----------
function placeOptions(curKind, curUnit){
  const sel = (k, u) => k === curKind && u === (curUnit || "") ? "selected" : "";
  const br = Object.values(S.map).sort((x, y) => x.branch.localeCompare(y.branch));
  return `<option value="unassigned|" ${sel("unassigned", "")}>Unassigned</option>
    ${S.depts.length ? `<optgroup label="Departments">${S.depts.map(d => `<option value="dept|${esc(d)}" ${sel("dept", d)}>${esc(d)}</option>`).join("")}</optgroup>` : ""}
    <optgroup label="Stores">${br.map(b => `<option value="store|${esc(b.code)}" ${sel("store", b.code)}>${esc(b.branch)} (${esc(b.code)})</option>`).join("")}</optgroup>`;
}
const myPlace = () => { const k = scopeKind(); return k === "store" || k === "dept" ? [k, S.me.scope_value] : ["unassigned", ""]; };

function editEmp(id){
  const [dk, du] = myPlace();
  const e = id ? findEmp(id) : { employee_id:"", name:"", store:"", iqama:"", nationality:"", mobile:"", expiry:"", expiry_note:"", remarks:"", card_status:"", card_photo:"", unit_kind:dk, unit:du, job_role:"", file_note:"", check_note:"", verified_at:null };
  if (!e) return toast("This employee is no longer in Trackit.");
  const opts = (list, cur) => [...new Set([...list, cur].filter(Boolean))].map(n => `<option ${n===cur?"selected":""}>${esc(n)}</option>`).join("");
  const cs = e.card_status || "", known = !cs || CARD_STATUSES.includes(cs);
  modal(`<h3>${id ? esc(e.name) : "Add employee"}</h3>${id ? `<p class="note" style="margin-top:-8px">${pill(e)} ${e.left_at ? "" : contact(e)}</p>` : ""}
    ${e.left_at ? `<div class="warnbox">Marked as left on ${fmtTS(e.left_at)}. Not counted anywhere until you bring them back.</div>` : ""}
    ${e.check_note || e.file_note ? `<div class="file-notes">${e.check_note ? `<div><b>Check:</b> ${esc(e.check_note)}</div>` : ""}${e.file_note ? `<div><b>From the Balady file:</b> ${esc(e.file_note)}</div>` : ""}</div>` : ""}
    <form id="ef">
      <div class="row2"><div><label>Expiry date (from Balady)</label><input type="date" id="efDate" name="expiry" value="${esc(e.expiry || "")}"></div>
      <div><label>…or type the Hijri date</label>${hijriBox("efDate")}</div></div>
      ${id ? `<div class="vid" style="margin-top:-4px">${checkLink(e)}</div>` : ""}
      <label class="chk"><input type="checkbox" name="verified" ${e.verified_at ? "checked" : ""}> I checked this on the Balady website${e.verified_at ? ` <span class="sub">— verified by ${esc(e.verified_by_name || "someone")} · ${fmtTS(e.verified_at)}</span>` : ""}</label>
      <div class="row2"><div><label>Card status</label>
        <select name="card_status_sel" id="csSel" onchange="$('#csCustomWrap').classList.toggle('hidden', this.value !== '__custom'); if (this.value === '__custom') $('#csCustom').focus()">
          <option value="">—</option>${CARD_STATUSES.map(s => `<option value="${esc(s)}" ${s === cs ? "selected" : ""}>${esc(s)}</option>`).join("")}
          <option value="__custom" ${known ? "" : "selected"}>Custom…</option></select></div>
        <div id="csCustomWrap" class="${known ? "hidden" : ""}"><label>Custom status</label><input type="text" id="csCustom" name="card_status_custom" maxlength="120" value="${known ? "" : esc(cs)}" placeholder="Type the card status"></div></div>
      <label>Remarks</label><input type="text" name="remarks" value="${esc(e.remarks)}" placeholder="e.g. medical booked for Sunday">
      ${!e.expiry && e.expiry_note ? `<p class="note">File said: <b>${esc(e.expiry_note)}</b>. Enter the real date when you have it.</p>` : ""}
      ${id ? `<label>Card photo</label><div id="photoArea">${photoArea(e)}</div>` : ""}
      <label>Works at</label><select name="place">${placeOptions(e.unit_kind || "unassigned", e.unit)}</select>
      ${id ? `<p class="note" style="margin-top:4px">Changing this sends a move request — the other store or department must accept it. They'll need to be verified again there.</p>` : ""}
      <div class="row2"><div><label>Name</label><input type="text" name="name" required value="${esc(e.name)}"></div>
      <div><label>Job role</label><input type="text" name="job_role" value="${esc(e.job_role)}"></div></div>
      <div class="row2"><div><label>Employee No. <span class="sub">(optional)</span></label><input type="text" name="employee_id" value="${esc(eid(e))}"></div>
      <div><label>Nationality</label><select name="nationality"><option value="">—</option>${opts(NATIONALITIES, e.nationality)}</select></div></div>
      <div class="row2"><div><label>Iqama / National ID</label><input type="text" name="iqama" inputmode="numeric" value="${esc(e.iqama)}"></div>
      <div><label>Mobile number</label><input type="text" name="mobile" inputmode="tel" value="${esc(e.mobile)}" placeholder="5XXXXXXXX"></div></div>
      <div class="err" id="eerr"></div>
      <div class="actions split">
        ${id ? `<button type="button" class="btn ghost ${e.left_at ? "" : "danger-t"}" id="leftBtn" onclick="setLeft('${e.id}', ${e.left_at ? "false" : "true"}, this)">${e.left_at ? "Bring back" : "Mark as left"}</button>` : "<span></span>"}
        <span style="display:flex;gap:10px"><button type="button" class="btn ghost" onclick="closeModal()">Cancel</button><button class="btn">${id ? "Save" : "Add employee"}</button></span>
      </div>
      ${id ? `<div class="hist-foot"><span class="sub">${e.updated_by_name ? `Last updated by <b>${esc(e.updated_by_name)}</b>` : "Last updated"}${e.updated_at ? ` · ${fmtTS(e.updated_at)}` : ""}</span>
        <button type="button" class="linkbtn" onclick="loadHistory('${e.id}', this)">Show history</button></div><div id="histArea"></div>` : ""}
    </form>`, true);
  $("#ef").onsubmit = async ev => {
    ev.preventDefault(); const fd = Object.fromEntries(new FormData(ev.target));
    const [pk, pu] = String(fd.place || "unassigned|").split("|");
    const row = { employee_id: fd.employee_id.trim() || null, name: fd.name.trim().replace(/\s+/g, " "), iqama: fd.iqama.replace(/\D/g, ""), nationality: fd.nationality,
      job_role: fd.job_role.trim(), mobile: fd.mobile.replace(/\D/g,""), expiry: fd.expiry || null, remarks: fd.remarks.trim(),
      card_status: fd.card_status_sel === "__custom" ? (fd.card_status_custom || "").trim() : (fd.card_status_sel || "") };
    if (fd.card_status_sel === "__custom" && !row.card_status) { $("#eerr").textContent = "Type the custom card status, or pick one from the list."; return; }
    if (row.expiry) row.expiry_note = "";
    if (!row.name) { $("#eerr").textContent = "Name can't be empty."; return; }
    const ver = !!fd.verified;
    if (ver && (!e.verified_at || row.expiry !== (e.expiry || null))) row.verified_at = new Date().toISOString();
    if (!ver && e.verified_at) row.verified_at = null;
    const moving = id && (pk !== (e.unit_kind || "unassigned") || (pu || "") !== (e.unit || ""));
    if (!id) Object.assign(row, { unit_kind: pk, unit: pu || "", store: pk === "store" ? (S.map[pu]?.branch || pu) : pk === "dept" ? pu : "" });
    const btn = ev.submitter || $("#ef .actions .btn:not(.ghost)"); if (btn.disabled) return;
    btn.disabled = true; const label = btn.textContent; btn.textContent = "Saving…";
    let res;
    try {
      // only save if nobody else changed this person since the pop-up was opened
      res = id ? await (e.updated_at ? sb.from("trackit_staff").update(row).eq("id", id).eq("updated_at", e.updated_at).select("id") : sb.from("trackit_staff").update(row).eq("id", id))
               : await sb.from("trackit_staff").insert(row);
    } catch (err) { res = { error: { message: loginError(err) } }; }
    let { error, data } = res || {};
    if (!error && id && Array.isArray(data) && data.length === 0) { btn.disabled = false; btn.textContent = label; $("#eerr").innerHTML = `Someone else just changed this person. <button type="button" class="linkbtn" onclick="closeModal();loadAll().then(()=>{render();editEmp('${e.id}')})">Open the latest version</button> and make your change again.`; return; }
    let moveRes = null;
    if (!error && moving) ({ data: moveRes, error } = await sb.rpc("trackit_request_move", { p_id: id, p_kind: pk, p_unit: pu || "" }));
    btn.disabled = false; btn.textContent = label;
    if (error) { $("#eerr").textContent = error.code === "23505" ? "That Employee No. or Iqama is already in Trackit — use Find a person on the Verify page to move them to you." : error.code === "42501" || /row-level security/i.test(error.message) ? "You can only add people to your own store or department." : /JWT|token/i.test(error.message) ? "Your login has expired. Sign in again." : error.message; return; }
    closeModal(); toast(moving ? (moveRes === "requested" ? `Saved — ${placeLabel(pk, pu)} must accept the move` : `Moved to ${placeLabel(pk, pu)}`) : id ? "Saved" : "Employee added");
    if (moveRes === "requested") await loadReqs(); if (id) await refreshOne(id); else await loadAll(); render();
  };
}
const fmtTS = ts => { const d = new Date(ts); return isNaN(d) ? "" : d.toLocaleString("en-GB", { day:"2-digit", month:"short", year:"numeric", hour:"2-digit", minute:"2-digit" }); };

// ---------- left the company ----------
async function setLeft(id, left, btn){
  if (left && btn && !btn.dataset.sure) { btn.dataset.sure = "1"; btn.textContent = "Tap again to confirm"; setTimeout(() => { if (btn.isConnected) { delete btn.dataset.sure; btn.textContent = "Mark as left"; } }, 4000); return; }
  if (btn) btn.disabled = true;
  const { error } = await sb.from("trackit_staff").update({ left_at: left ? new Date().toISOString() : null }).eq("id", id);
  if (error) { if (btn) btn.disabled = false; return toast(error.message); }
  closeModal(); toast(left ? "Marked as left — not counted any more" : "Brought back"); await refreshOne(id); render();
}

// ---------- card photo ----------
function photoArea(e){
  const pick = (txt) => `<label class="btn sm ghost photo-pick">${txt}<input type="file" accept="image/*" class="hidden" onchange="uploadPhoto('${e.id}', this)"></label>`;
  return e.card_photo
    ? `<div class="photo-row"><button type="button" class="btn sm ghost" onclick="viewPhoto('${e.id}', this)">View photo</button>${pick("Replace")}<button type="button" class="btn sm ghost danger-t" onclick="removePhoto('${e.id}', this)">Remove</button></div><div id="photoView"></div>`
    : `<div class="photo-row">${pick("Add a photo of the card")}<span class="sub">Proof of renewal. Taken on the phone or chosen from files.</span></div>`;
}
function shrinkImage(file){
  return new Promise((ok, bad) => {
    const img = new Image(), url = URL.createObjectURL(file);
    img.onload = () => {
      const max = 1600, k = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement("canvas"); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
      c.getContext("2d").drawImage(img, 0, 0, c.width, c.height); URL.revokeObjectURL(url);
      c.toBlob(b => b ? ok(b) : bad(new Error("Couldn't read that picture.")), "image/jpeg", 0.82);
    };
    img.onerror = () => { URL.revokeObjectURL(url); bad(new Error("That file isn't a picture Trackit can read. Use a JPG or PNG photo.")); };
    img.src = url;
  });
}
async function uploadPhoto(id, input){
  const e = findEmp(id), file = input.files && input.files[0]; if (!e || !file) return;
  const area = $("#photoArea"); area.innerHTML = `<p class="note">Uploading photo…</p>`;
  try {
    const blob = await shrinkImage(file);
    const path = `${e.id}/${Date.now()}.jpg`;
    const up = await sb.storage.from("trackit-cards").upload(path, blob, { contentType: "image/jpeg", upsert: false });
    if (up.error) throw up.error;
    const old = e.card_photo;
    const { data: upd, error } = await sb.from("trackit_staff").update({ card_photo: path }).eq("id", id).select("updated_at");
    if (error) { await sb.storage.from("trackit-cards").remove([path]); throw error; }
    if (Array.isArray(upd) && upd[0]?.updated_at) e.updated_at = upd[0].updated_at;
    if (old) sb.storage.from("trackit-cards").remove([old]);
    e.card_photo = path; area.innerHTML = photoArea(e); toast("Card photo saved");
  } catch (err) { area.innerHTML = photoArea(e) + `<div class="err">${esc(err.message || err)}</div>`; }
}
async function viewPhoto(id, btn){
  const e = findEmp(id), box = $("#photoView"); if (!e || !box) return;
  if (box.innerHTML) { box.innerHTML = ""; btn.textContent = "View photo"; return; }
  btn.disabled = true;
  const { data, error } = await sb.storage.from("trackit-cards").createSignedUrl(e.card_photo, 600);
  btn.disabled = false;
  if (error) return toast(error.message);
  box.innerHTML = `<a href="${esc(data.signedUrl)}" target="_blank" rel="noopener"><img class="card-photo" src="${esc(data.signedUrl)}" alt="Baladiya card photo"></a>`;
  btn.textContent = "Hide photo";
}
async function removePhoto(id, btn){
  if (!btn.dataset.sure) { btn.dataset.sure = "1"; btn.textContent = "Tap again to remove"; return; }
  const e = findEmp(id); btn.disabled = true;
  const { data: upd, error } = await sb.from("trackit_staff").update({ card_photo: "" }).eq("id", id).select("updated_at");
  if (error) { btn.disabled = false; return toast(error.message); }
  if (Array.isArray(upd) && upd[0]?.updated_at) e.updated_at = upd[0].updated_at;
  sb.storage.from("trackit-cards").remove([e.card_photo]);
  e.card_photo = ""; $("#photoArea").innerHTML = photoArea(e); toast("Photo removed");
}

// ---------- change history ----------
async function loadHistory(id, btn){
  const box = $("#histArea"); if (!box) return;
  if (box.innerHTML) { box.innerHTML = ""; btn.textContent = "Show history"; return; }
  box.innerHTML = `<p class="note">Loading…</p>`; btn.textContent = "Hide history";
  const { data, error } = await sb.from("trackit_staff_history").select("changed_at,changed_by_name,field,old_value,new_value").eq("staff_id", id).order("changed_at", { ascending: false }).limit(40);
  if (error) { box.innerHTML = `<div class="err">${esc(error.message)}</div>`; return; }
  const val = v => v == null || v === "" ? "—" : /^\d{4}-\d{2}-\d{2}$/.test(v) ? fmtDate(v) : v;
  box.innerHTML = data.length ? `<div class="hist">${data.map(h => `<div class="hist-row"><div><b>${esc(h.field)}</b>${h.old_value != null || h.new_value != null ? `: ${h.old_value != null ? `<span class="old">${esc(val(h.old_value))}</span> → ` : ""}${esc(val(h.new_value))}` : ""}</div>
    <div class="sub">${esc(h.changed_by_name || "Trackit")} · ${fmtTS(h.changed_at)}</div></div>`).join("")}</div>` : `<p class="note">No changes recorded yet. Changes are recorded from now on.</p>`;
}
function delEmp(id){
  const e = findEmp(id);
  modal(`<h3>Delete ${esc(e.name)}?</h3><p class="note">This removes ${esc(e.name)}${eid(e) ? ` (${esc(eid(e))})` : ""} and their history from Trackit. It can't be undone. If they left the company, use <b>Mark as left</b> instead — it keeps their record.</p>
  <div class="actions"><button class="btn ghost" onclick="closeModal()">Cancel</button><button class="btn danger" id="dbtn">Delete</button></div>`);
  $("#dbtn").onclick = async () => { const { error } = await sb.from("trackit_staff").delete().eq("id", id); if (error) return toast(error.message); closeModal(); toast("Deleted"); putRow(null, id); render(); };
}
const empRow = e => [e.iqama, eid(e), e.name, e.unit_kind === "unassigned" ? "" : e.unit, e.job_role || "", e.nationality, e.mobile, e.expiry || "", e.card_status || "", e.remarks || ""];
function exportCSV(){ downloadCSV(`trackit-export-${new Date().toISOString().slice(0,10)}.csv`, [[...COLS, "Workplace name", "Status", "Verified by", "Verified on", "Area manager", "ROM", "City", "Region"], ...filtered().map(e => [...empRow(e), placeOf(e), e.left_at ? "Left" : STATUS_LABEL[statusOf(e)], e.verified_by_name || "", e.verified_at ? e.verified_at.slice(0, 10) : "", ...["area_manager", "rom", "city", "region"].map(k => geo(k, e) || "")])]); }
function downloadCSV(name, rows){
  const csv = "﻿" + rows.map(r => r.map(v => { v = String(v ?? ""); if (/^[=+\-@\t\r]/.test(v) && !/^-?\d/.test(v)) v = "'" + v; return /[",\n]/.test(v) ? `"${v.replace(/"/g,'""')}"` : v; }).join(",")).join("\r\n");
  const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([csv], { type:"text/csv;charset=utf-8" })); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

// ---------- import: reading files ----------
const normHead = h => String(h||"").toLowerCase().replace(/\s+/g," ").trim();
const HEAD = {
  employee_id: ["employee id","employee number","employee no","employee no.","emp no","emp id","staff id"],
  name: ["name","employee name","full name"],
  store: ["store / department","store","branch","store name","branch name","department","workplace"],
  iqama: ["iqama / national id","iqama number","iqama","iqama no","national id","id number"],
  job_role: ["job role","job title","position"],
  card_status: ["card status"],
  file_note: ["notes","note"],
  check_note: ["check needed"],
  nationality: ["nationality"],
  expiry: ["expiry date","expire date","expired date","expiration date","expiry","expire"],
  mobile: ["mobile number","phone number","mobile","phone","mobile no"],
  remarks: ["am remarks","am- remarks","am-remarks","remarks","remark","reamrk"],
};
function colIndex(head){ const idx = {}; for (const [k, names] of Object.entries(HEAD)) { idx[k] = head.findIndex(h => names.includes(h)); if (idx[k] < 0) idx[k] = head.findIndex(h => names.some(n => h.startsWith(n))); } return idx; }
const MONTH_IX = { jan:1, feb:2, mar:3, apr:4, may:5, jun:6, jul:7, aug:8, sep:9, oct:10, nov:11, dec:12 };
function validYMD(y, m, d){ const dt = new Date(Date.UTC(y, m-1, d)); return dt.getUTCFullYear() === y && dt.getUTCMonth() === m-1 && dt.getUTCDate() === d; }
const ymd = (y, m, d) => `${y}-${String(m).padStart(2,"0")}-${String(d).padStart(2,"0")}`;
function readDate(v){
  if (v === null || v === undefined || String(v).trim() === "") return { date:"", note:"Blank in file", unclear:false };
  if (v instanceof Date && !isNaN(v)) return check(v.getFullYear(), v.getMonth()+1, v.getDate(), String(v));
  if (typeof v === "number") { const d = XLSX.SSF.parse_date_code(v); return d ? check(d.y, d.m, d.d, String(v)) : { date:"", note:String(v), unclear:true }; }
  const s = String(v).trim(), u = s.toUpperCase();
  if (/^0+[-/ ]+(JAN|0+)[-/ ]+0+$/i.test(s)) return { date:"", note:s, unclear:false };
  if (/^(NOT\s*FOUND|N\/?A|NA|NOT\s*UPDATED|NONE|NIL|-+|PENDING|TBA|TBC)$/.test(u)) return { date:"", note:s, unclear:false };
  let m;
  if ((m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/))) return check(+m[1], +m[2], +m[3], s);
  if ((m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})$/))) return check(fixYear(+m[3]), +m[2], +m[1], s);
  if ((m = s.match(/^([A-Za-z]{3,9})[\s\-.]*(\d{1,2})(?:st|nd|rd|th)?[\s,\-.]*(\d{2,4})$/))) { const mo = MONTH_IX[m[1].toLowerCase().slice(0,3)]; if (mo) return check(fixYear(+m[3]), mo, +m[2], s); }
  if ((m = s.match(/^(\d{1,2})(?:st|nd|rd|th)?[\s\-.]*([A-Za-z]{3,9})[\s,\-.]*(\d{2,4})$/))) { const mo = MONTH_IX[m[2].toLowerCase().slice(0,3)]; if (mo) return check(fixYear(+m[3]), mo, +m[1], s); }
  return { date:"", note:s, unclear:true };
  function fixYear(y){ return y < 100 ? 2000 + y : y; }
  function check(y, mo, d, raw){
    if (y >= 1400 && y <= 1500) return { date:"", note:`${raw} (Hijri? please check)`, unclear:true };
    if (!validYMD(y, mo, d) || y < 2015 || y > 2040) return { date:"", note:raw, unclear:true };
    return { date: ymd(y, mo, d), note:"", unclear:false };
  }
}
function normNationality(v){
  const u = String(v||"").toUpperCase().replace(/[^A-Z ]/g,"").trim(); if (!u) return "";
  const map = [[/^SAUDI/,"Saudi"],[/^BANGLA/,"Bangladeshi"],[/^IND(I)?AN|^INDIA/,"Indian"],[/^FILIP|^PHIL|^PHIP|^PILIP/,"Filipino"],[/^PAKIS/,"Pakistani"],[/^NEPAL/,"Nepali"],[/^EGYP/,"Egyptian"],[/^SUDAN/,"Sudanese"],[/^YEMEN/,"Yemeni"],[/^ERIT|^IRIT/,"Eritrean"],[/^SRI ?LANK/,"Sri Lankan"],[/^JORDAN/,"Jordanian"],[/^SYRI/,"Syrian"],[/^NONE$/,""]];
  for (const [re, n] of map) if (re.test(u)) return n;
  return "Other";
}
function normMobile(v){ return String(v||"").replace(/\D/g,"").replace(/^(00)?966/, "").replace(/^0+/, ""); }
async function readWorkbook(file){
  await needXLSX();
  const wb = XLSX.read(await file.arrayBuffer(), { type:"array", cellDates:false });   // Excel day numbers are converted exactly (Date objects can drift a day)
  const rows = []; const sheets = [];
  for (const name of wb.SheetNames) {
    const aoa = XLSX.utils.sheet_to_json(wb.Sheets[name], { header:1, defval:"", raw:true });
    let h = -1; for (let i = 0; i < Math.min(aoa.length, 8); i++) { const t = aoa[i].map(normHead); if (t.some(x => HEAD.name.includes(x)) && t.some(x => HEAD.employee_id.includes(x) || HEAD.iqama.includes(x))) { h = i; break; } }
    if (h < 0) { sheets.push({ name, rows:0, skipped:true }); continue; }
    const idx = colIndex(aoa[h].map(normHead));
    let n = 0;
    aoa.slice(h + 1).forEach((r, i) => {
      if (r.every(c => String(c).trim() === "")) return;
      const get = k => idx[k] >= 0 ? r[idx[k]] : "";
      const eid = String(get("employee_id")).trim().replace(/\.0$/, ""); const nm = String(get("name")).trim();
      if (!eid && !nm) return;
      if (nm === "Example Name" && /delete this example/i.test(String(get("remarks")))) return;
      const d = readDate(get("expiry"));
      const txt = k => String(get(k) ?? "").replace(/\s+/g," ").trim();
      rows.push({ where: `${name.trim()} row ${h + i + 2}`, employee_id: eid, name: nm.replace(/\s+/g," "), store: txt("store"),
        iqama: String(get("iqama")).replace(/\.0$/, "").replace(/\D/g, ""), nationality: normNationality(get("nationality")),
        mobile: normMobile(get("mobile")), expiry: d.date, expiry_note: d.note, unclear: d.unclear, remarks: txt("remarks"),
        job_role: txt("job_role"), card_status: txt("card_status"), file_note: txt("file_note"), check_note: txt("check_note") });
      n++;
    });
    sheets.push({ name, rows:n });
  }
  return { rows, sheets };
}
const rowKey = r => r.iqama ? "iq:" + r.iqama : r.employee_id ? "no:" + r.employee_id : "nm:" + r.name.toUpperCase();
// a workplace in the file: store code, department or branch name (blank = Unassigned)
function knownPlace(p){ const u = String(p || "").trim().toUpperCase(); if (!u || u === "UNASSIGNED") return true;
  return !!S.map[u] || S.depts.some(d => d.toUpperCase() === u) || Object.values(S.map).some(m => m.branch.toUpperCase() === u); }
function analyse(rows){
  const byId = {}; rows.forEach((r, i) => { (byId[rowKey(r)] ??= []).push(i); });
  const exactDup = [], conflicts = [];
  for (const [id, ix] of Object.entries(byId)) {
    if (!id || ix.length < 2) continue;
    const sig = i => [rows[i].store.toUpperCase(), rows[i].expiry || rows[i].expiry_note, rows[i].name.toUpperCase()].join("|");
    if (new Set(ix.map(sig)).size === 1) exactDup.push(id); else conflicts.push({ id, rows: ix.map(i => rows[i]) });
  }
  return { exactDup, conflicts };
}
// ---------- import: screen ----------
function importView(){
  needXLSX().catch(() => {});
  if (S.imp) return S.imp.result ? importResult() : importPreview();
  return header("Import", "Upload the staff list (admins only)") + `
  <div class="steps">
    <div class="card pad"><div class="step-n">1</div><h3>The staff file</h3>
      <p class="note">One row per person, with these columns: <b>${COLS.join(", ")}</b>. <b>Store / Department</b> is a store code (like B48) or a department — pick it from the dropdown in the template. Leave it blank for Unassigned. Area manager, ROM, city and region are filled in from the store code.</p>
      <p class="note">People are matched by <b>Iqama / National ID</b>, then Employee No. New people are added; existing people get new details. A date a store has already <b>verified</b> is never overwritten, and people the app has already placed in a store keep their store.</p>
      <div style="display:flex;gap:10px;flex-wrap:wrap"><a class="btn tan" href="trackit-template.xlsx" download>Download template</a>
      ${S.emps.length ? `<button class="btn ghost" onclick="downloadTemplate(true)">Download current list</button>` : ""}</div>
    </div>
    <div class="card pad"><div class="step-n">2</div><h3>Upload</h3>
      <p class="note">You'll see a check before anything is saved: duplicates, unclear dates and missing stores.</p>
      <label class="drop" id="drop"><input type="file" id="file" accept=".xlsx,.xls,.csv" class="hidden"><b>Choose the file</b><div class="note">or drag it here</div></label>
      <div id="impOut"></div>
    </div>
  </div>
  ${isAdmin() ? `<div class="card pad section" style="border:1px solid #F0C9BF"><h3>Delete all data</h3>
    <p class="note">Removes every employee (${S.emps.length.toLocaleString()}) so you can start again with a fresh upload. Logins are kept. This can't be undone.</p>
    <button class="btn danger" onclick="wipeAll()" ${S.emps.length + S.left.length ? "" : "disabled"}>Delete all uploaded data</button></div>` : ""}`;
}
function wipeAll(){
  modal(`<h3>Delete all uploaded data?</h3>
    <p class="note">This permanently removes <b>${(S.emps.length + S.left.length).toLocaleString()} employees</b> (with their history and card photos) for everyone. Tip: use <b>Download current list</b> first if you want a copy.</p>
    <label>Type DELETE to confirm</label><input type="text" id="wipeTxt" autocomplete="off" oninput="$('#wipeBtn').disabled=this.value.trim()!=='DELETE'">
    <div class="err" id="wipeErr"></div>
    <div class="actions"><button class="btn ghost" onclick="closeModal()">Cancel</button><button class="btn danger" id="wipeBtn" disabled>Delete everything</button></div>`);
  $("#wipeBtn").onclick = async () => {
    $("#wipeBtn").disabled = true; $("#wipeErr").textContent = "";
    const photos = [...S.emps, ...S.left].map(e => e.card_photo).filter(Boolean);
    for (let i = 0; i < photos.length; i += 100) await sb.storage.from("trackit-cards").remove(photos.slice(i, i + 100));
    const a = await sb.from("trackit_staff").delete().not("id", "is", null);
    const b = a.error ? a : await sb.from("trackit_week_totals").delete().not("id", "is", null);
    if (a.error || b.error) { $("#wipeErr").textContent = (a.error || b.error).message; $("#wipeBtn").disabled = false; return; }
    closeModal(); S.imp = null; await loadAll(); render(); toast("All uploaded data deleted");
  };
}
async function downloadTemplate(withData){
  try { await needXLSX(); } catch (e) { return toast(e.message); }
  const data = withData ? S.emps.map(e => { const r = empRow(e); r[7] = e.expiry ? new Date(e.expiry + "T00:00:00") : ""; return r; }) : [];
  const ws = XLSX.utils.aoa_to_sheet([COLS, ...data], { cellDates:true });
  ws["!cols"] = [20,14,32,22,18,14,14,15,30,36].map(w => ({ wch:w }));
  for (let i = 1; i <= data.length; i++) { const c = ws[XLSX.utils.encode_cell({ r:i, c:7 })]; if (c && c.t === "d") c.z = "dd-mmm-yyyy"; }
  const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, "Employees");
  XLSX.writeFile(wb, withData ? `trackit-current-list-${new Date().toISOString().slice(0,10)}.xlsx` : "trackit-template.xlsx");
}
function bindDrop(){
  const d = $("#drop"), f = $("#file"); if (!d) return;
  f.onchange = () => f.files[0] && handleFile(f.files[0]);
  d.ondragover = e => { e.preventDefault(); d.classList.add("over"); };
  d.ondragleave = () => d.classList.remove("over");
  d.ondrop = e => { e.preventDefault(); d.classList.remove("over"); e.dataTransfer.files[0] && handleFile(e.dataTransfer.files[0]); };
}
async function handleFile(file){
  $("#impOut").innerHTML = `<p class="note" style="margin-top:14px">Reading ${esc(file.name)}…</p>`;
  try {
    const { rows, sheets } = await readWorkbook(file);
    if (!rows.length) throw new Error("No employee rows found. The sheet needs headings like Name, Iqama / National ID and Store / Department — use the template.");
    S.imp = { file: file.name, rows, sheets, ...analyse(rows), result: null };
    render();
  } catch (e) { $("#impOut").innerHTML = `<div class="errlist" style="margin-top:14px">${esc(e.message || e)}</div>`; $("#file").value = ""; }
}
function importPreview(){
  const I = S.imp;
  const unclear = I.rows.filter(r => r.unclear), missing = I.rows.filter(r => !r.expiry && !r.unclear).length;
  const noStore = I.rows.filter(r => !r.store), badPlace = I.rows.filter(r => r.store && !knownPlace(r.store)), noId = I.rows.filter(r => !r.iqama && !r.employee_id);
  const listRows = (rows, cell) => `<div class="tbl-wrap section"><table><thead><tr><th>Where</th><th>Employee</th><th>File says</th></tr></thead><tbody>${rows.slice(0,100).map(r => `<tr><td>${esc(r.where)}</td><td>${esc(r.name)}</td><td>${esc(cell(r))}</td></tr>`).join("")}</tbody></table></div>`;
  const good = !I.conflicts.length && !unclear.length && !badPlace.length && !noId.length;
  return header("Check before saving", `${esc(I.file)} · ${I.rows.length} rows`, `<button class="btn ghost" onclick="S.imp=null;render()">Cancel</button>`) + `
  ${I.sheets.filter(s => !s.skipped).length > 1 ? `<div class="card pad"><h3>Sheets</h3><p class="note">${I.sheets.map(s => `${esc(s.name.trim())}: ${s.skipped ? "skipped" : `<b>${s.rows}</b> rows`}`).join(" · ")}</p></div>` : ""}
  ${good ? `<div class="okbox section">Everything looks clean.</div>` : ""}
  <div class="card pad section"><h3>Duplicates</h3>
    ${!I.exactDup.length && !I.conflicts.length ? `<div class="okbox">Nobody appears twice.</div>` : ""}
    ${I.exactDup.length ? `<p class="note">${I.exactDup.length} people appear twice with identical details — merged automatically.</p>` : ""}
    ${I.conflicts.length ? `<div class="warnbox">${I.conflicts.length} people appear more than once with <b>different</b> details. The <b>last row</b> will be used:</div>
      <div class="tbl-wrap section"><table><thead><tr><th>Person</th><th>Rows in file</th></tr></thead><tbody>${I.conflicts.map(c => `<tr><td>${esc(c.rows[0].name)}</td><td>${c.rows.map(r => `${esc(r.where)}: ${esc(r.store)} · ${esc(r.expiry || r.expiry_note)}`).join("<br>")}</td></tr>`).join("")}</tbody></table></div>` : ""}
  </div>
  <div class="card pad section"><h3>Dates</h3>
    <p class="note"><b>${I.rows.filter(r => r.expiry).length}</b> rows have a date. <b>${missing}</b> have no date (blank, N/A, NOT FOUND) and will show as <b>Date missing</b>.</p>
    ${unclear.length ? `<div class="warnbox">${unclear.length} dates couldn't be read and will be saved as <b>Date missing</b>:</div>${listRows(unclear, r => r.expiry_note)}` : ""}
  </div>
  <div class="card pad section"><h3>Store / department</h3>
    ${noStore.length ? `<p class="note"><b>${noStore.length}</b> people have no store or department — they go to <b>Unassigned</b> and their store claims them on the Verify page.</p>` : `<div class="okbox">Everyone has a store or department.</div>`}
    ${badPlace.length ? `<div class="warnbox">${badPlace.length} rows name a store or department Trackit doesn't know. They'll be added as Unassigned:</div>${listRows(badPlace, r => r.store)}` : ""}
    ${noId.length ? `<div class="warnbox">${noId.length} rows have no Iqama and no Employee No. They'll be added, but can't be matched on a later upload:</div>${listRows(noId, () => "(no ID)")}` : ""}
  </div>
  <div class="card pad section"><h3>Save</h3>
    <div class="actions" style="justify-content:flex-start"><button class="btn" id="impBtn" onclick="runImport()">Save ${new Set(I.rows.map(rowKey)).size.toLocaleString()} employees</button></div>
    <div id="impProg"></div>
  </div>`;
}
async function runImport(){
  const I = S.imp; $("#impBtn").disabled = true;
  try {
    const last = new Map(); I.rows.forEach(r => last.set(rowKey(r), r));
    const rows = [...last.values()].map(r => ({ row: r.where, employee_id: r.employee_id, name: r.name, place: r.store, iqama: r.iqama,
      nationality: r.nationality, mobile: r.mobile, expiry: r.expiry, expiry_note: r.expiry_note, remarks: r.remarks,
      job_role: r.job_role, card_status: r.card_status, file_note: r.file_note, check_note: r.check_note }));
    const tot = { added:0, updated:0, skipped:0, back:0, errors:[] };
    const inFile = new Set(rows.flatMap(r => [r.iqama && "iq:" + r.iqama, r.employee_id && "no:" + r.employee_id]).filter(Boolean));
    for (let i = 0; i < rows.length; i += 500) {
      $("#impProg").innerHTML = `<p class="note">Saving ${Math.min(i + 500, rows.length)} of ${rows.length}…</p>`;
      const { data, error } = await sb.rpc("trackit_import_v4", { rows: rows.slice(i, i + 500), week_label: null });
      if (error) throw error;
      tot.added += data.added; tot.updated += data.updated; tot.skipped += data.skipped; tot.back += data.back || 0; tot.errors.push(...data.errors);
    }
    await loadAll();
    I.result = tot; I.missing = S.emps.filter(e => !inFile.has("iq:" + e.iqama) && !inFile.has("no:" + eid(e))).map(e => e.id);
    render(); toast("Import finished");
  } catch (e) { $("#impProg").innerHTML = `<div class="errlist">${esc(e.message || e)}</div>`; $("#impBtn").disabled = false; }
}
function importResult(){
  const t = S.imp.result;
  return header("Import finished", esc(S.imp.file), `<button class="btn" onclick="S.imp=null;go('dashboard')">Go to dashboard</button>`) + `
  <div class="card pad"><div class="summary"><div><b style="color:var(--teal-d)">${t.added}</b>added</div><div><b style="color:var(--tan-d)">${t.updated}</b>updated</div><div><b>${t.skipped}</b>unchanged</div><div><b style="color:${t.errors.some(x => !x.warn)?"var(--red)":"var(--muted)"}">${t.errors.length}</b>notes</div></div>
  ${t.back ? `<p class="note">${t.back} ${t.back === 1 ? "person was" : "people were"} marked as left before and ${t.back === 1 ? "is" : "are"} in this file, so ${t.back === 1 ? "they're" : "they're"} active again.</p>` : ""}
  ${t.errors.length ? `<div class="errlist">${t.errors.slice(0,300).map(e => `<div>${esc(e.row)}: ${esc(e.msg)}</div>`).join("")}</div>` : `<div class="okbox">Everything saved. Stores and departments can now verify their people on the Verify page.</div>`}
  <div class="actions" style="justify-content:flex-start"><button class="btn ghost" onclick="S.imp=null;render()">Upload another file</button></div></div>
  ${leaverCard()}`;
}

function leaverCard(){
  const I = S.imp; if (I.leftDone) return `<div class="card pad section"><div class="okbox">${I.leftDone} marked as left. They're no longer counted. Find them any time under Employees → status "Left the company".</div></div>`;
  const ppl = (I.missing || []).map(findEmp).filter(e => e && !e.left_at); if (!ppl.length) return "";
  return `<div class="card pad section"><h3>Not in this file (${ppl.length})</h3>
    <p class="note">These people are in Trackit but not in the file you just uploaded. <b>If the file is the full, current employee list</b>, they have probably left. Untick anyone who is still working.</p>
    <div class="leaver-tools"><button class="linkbtn" onclick="document.querySelectorAll('.lv').forEach(c=>c.checked=true);countLeavers()">Select all</button> · <button class="linkbtn" onclick="document.querySelectorAll('.lv').forEach(c=>c.checked=false);countLeavers()">Select none</button></div>
    <div class="tbl-wrap"><table><thead><tr><th style="width:36px"></th><th>Employee</th><th class="hm">Store</th><th class="hm">Expiry</th></tr></thead><tbody>
    ${ppl.map(e => `<tr><td><input type="checkbox" class="lv" value="${e.id}" checked onchange="countLeavers()" aria-label="Mark ${esc(e.name)} as left"></td><td><b>${esc(e.name)}</b><div class="sub mono">${esc(eid(e) || (e.iqama ? "ID …" + e.iqama.slice(-4) : ""))}<span class="sm-only"> · ${esc(placeOf(e))}</span></div></td><td class="hm">${esc(placeOf(e))}</td><td class="hm mono">${dateCell(e)}</td></tr>`).join("")}
    </tbody></table></div>
    <div class="actions" style="justify-content:flex-start"><button class="btn" id="lvBtn" onclick="markLeavers()">Mark ${ppl.length} as left</button></div></div>`;
}
function countLeavers(){ const n = document.querySelectorAll(".lv:checked").length, b = $("#lvBtn"); if (b) { b.textContent = `Mark ${n} as left`; b.disabled = !n; } }
async function markLeavers(){
  const ids = [...document.querySelectorAll(".lv:checked")].map(c => c.value); if (!ids.length) return;
  const b = $("#lvBtn"); b.disabled = true; b.textContent = "Saving…";
  const now = new Date().toISOString();
  for (let i = 0; i < ids.length; i += 200) {
    const { error } = await sb.from("trackit_staff").update({ left_at: now }).in("id", ids.slice(i, i + 200));
    if (error) { b.disabled = false; countLeavers(); return toast(error.message); }
  }
  S.imp.leftDone = ids.length; S.imp.missing = []; await loadAll(); render(); toast(`${ids.length} marked as left`);
}

// ---------- alerts ----------
function alerts(){
  const { am, rom, city, region } = S.filters; const mf = (v, w) => !w || (w === "__none" ? !v : v === w);
  const inArea = e => mf(GROUPS.am[1](e), am) && mf(GROUPS.rom[1](e), rom) && mf(GROUPS.city[1](e), city) && mf(GROUPS.region[1](e), region);
  const by = s => S.emps.filter(e => statusOf(e) === s && inArea(e));
  const lists = { exp: by("exp"), due: by("due"), miss: by("miss") };
  const all = lists[S.alertTab], per = 50, pages = Math.max(1, Math.ceil(all.length / per));
  S.page = Math.min(S.page, pages); const list = all.slice((S.page - 1) * per, S.page * per);
  return header("Alerts", "Who needs a Baladiya renewal", storesNeedingAction().length ? `<button class="btn wa-btn" onclick="messageStore()">${ICON.wa}<span>Send reminders</span></button>` : "") + `
  <div class="tabs">${[["exp","Expired"],["due",STATUS_LABEL.due],["miss","Date missing"]].map(([k,l]) => `<button class="${S.alertTab===k?"on":""}" onclick="S.alertTab='${k}';S.page=1;render()">${l} (${lists[k].length})</button>`).join("")}</div>
  ${hasMap() && scopeKind() !== "store" && scopeKind() !== "dept" ? `<div class="filters">${["region","city","am","rom"].map(k => { const lbl = { region:"All regions", city:"All cities", am:"All area managers", rom:"All ROMs" }[k]; const s = new Set(S.emps.map(e => GROUPS[k][1](e)).filter(Boolean)); return `<select aria-label="${lbl}" onchange="S.filters.${k}=this.value;S.page=1;render()"><option value="">${lbl}</option>${[...s].sort().map(v => `<option value="${esc(v)}" ${S.filters[k]===v?"selected":""}>${esc(v)}</option>`).join("")}</select>`; }).join("")}</div>` : ""}
  ${(n => n ? `<div class="warnbox" style="cursor:pointer" onclick="go('verify')">${n.toLocaleString()} ${n === 1 ? "person isn't" : "people aren't"} verified on Balady yet, so ${n === 1 ? "they're" : "they're"} not in these alerts. <b>Go to Verify →</b></div>` : "")(S.emps.filter(e => !e.verified_at && inArea(e)).length)}
  ${S.alertTab === "miss" ? `<p class="note" style="margin-top:-4px">Verified, but no expiry date on Balady (not registered, or the exam is pending).</p>` : ""}
  <div class="card">${list.length ? `<div class="tbl-wrap"><table><thead><tr><th>Employee</th><th class="hm">Store</th><th>Expiry</th><th class="hm">Card status / remarks</th><th></th></tr></thead><tbody>
  ${list.map(e => `<tr><td><b>${esc(e.name)}</b><div class="sub mono">${esc(eid(e) || (e.iqama ? "ID …" + e.iqama.slice(-4) : ""))}<span class="sm-only"> · ${esc(placeOf(e))}</span></div>${remindedTag(e)}${e.card_status ? `<div class="sm-only-b">${csChip(e)}</div>` : ""}</td><td class="hm">${esc(placeOf(e))}${storeSub(e)}</td><td class="mono">${dateCell(e)}</td><td class="hm" style="max-width:260px">${remarksCell(e)}</td><td style="text-align:right;white-space:nowrap">${contact(e)}<button class="btn sm ghost" onclick="editEmp('${e.id}')">Update</button></td></tr>`).join("")}
  </tbody></table></div>${pages > 1 ? `<div class="pager"><span>${all.length.toLocaleString()} people · page ${S.page} of ${pages}</span><span style="display:flex;gap:8px"><button class="btn sm ghost" ${S.page<=1?"disabled":""} onclick="S.page--;render()">Previous</button><button class="btn sm ghost" ${S.page>=pages?"disabled":""} onclick="S.page++;render()">Next</button></span></div>` : ""}` : `<div class="empty">Nobody in this list.</div>`}</div>`;
}

// ---------- message a whole store ----------
const needsMsg = e => ["exp", "due", "miss"].includes(statusOf(e)) || (!!e.card_status && !!e.verified_at);
function storesNeedingAction(){
  const c = {}; for (const e of S.emps) if (needsMsg(e)) c[placeOf(e)] = (c[placeOf(e)] || 0) + 1;
  return Object.entries(c).sort((x, y) => y[1] - x[1]);
}
// Free WhatsApp reminders: WhatsApp opens with the message already written, the manager taps Send,
// comes back, and the next person is ready. Who was reminded is remembered on this device only.
const REMIND_KEY = "trackit-reminded", REMIND_GAP = 7;
S.sent = new Set(); S.msgStore = ""; S.msgSkip = true; S.msgCur = null;
function remindedMap(){ try { const m = JSON.parse(localStorage.getItem(REMIND_KEY) || "{}"); return m && typeof m === "object" ? m : {}; } catch (e) { return {}; } }
function remindedAgo(e){ const d = remindedMap()[e.id]; if (!d) return null; const n = Math.floor((todayUTC() - Date.parse(d)) / 86400000); return n >= 0 ? n : null; }
function agoText(n){ return n === 0 ? "today" : n === 1 ? "yesterday" : `${n} days ago`; }
function remindedTag(e){ const n = remindedAgo(e); return n !== null && n <= 30 ? `<div class="sub rem-tag">${ICON.wa}Reminded ${agoText(n)}</div>` : ""; }
function noteReminded(id){
  S.sent.add(id);
  const m = remindedMap(), n = new Date(), keep = todayUTC() - 90 * 86400000;
  m[id] = new Date(Date.UTC(n.getFullYear(), n.getMonth(), n.getDate())).toISOString().slice(0, 10);
  for (const k of Object.keys(m)) if (Date.parse(m[k]) < keep) delete m[k];
  try { localStorage.setItem(REMIND_KEY, JSON.stringify(m)); } catch (e) { /* storage blocked: remembered for this visit only */ }
}
function remindQueue(){
  const order = { exp:0, due:1, miss:2, ok:3, unv:4 };
  const all = S.emps.filter(e => needsMsg(e) && waMsg(e) && (!S.msgStore || placeOf(e) === S.msgStore));
  // people reminded on an earlier day stay out while the box is ticked; people sent now stay in so the count adds up
  const recent = e => { const n = remindedAgo(e); return n !== null && n < REMIND_GAP && !S.sent.has(e.id); };
  const list = all.filter(e => !(S.msgSkip && recent(e)));
  const withPhone = list.filter(e => phoneIntl(e.mobile)).sort((x, y) => order[statusOf(x)] - order[statusOf(y)] || placeOf(x).localeCompare(placeOf(y)) || String(x.name).localeCompare(String(y.name)));
  return { q: withPhone, noPhone: list.length - withPhone.length, skipped: all.length - list.length };
}
function messageStore(store){
  const stores = storesNeedingAction(); if (!stores.length) return;
  if (store !== undefined) { S.msgStore = store; S.msgCur = null; }
  if (S.msgStore && !stores.some(x => x[0] === S.msgStore)) S.msgStore = "";
  const { q, noPhone, skipped } = remindQueue();
  const done = q.filter(e => S.sent.has(e.id)).length;
  let cur = q.find(e => e.id === S.msgCur) || q.find(e => !S.sent.has(e.id)) || null;
  S.msgCur = cur?.id ?? null;
  const i = cur ? q.indexOf(cur) : -1, total = stores.reduce((s, x) => s + x[1], 0);
  const card = !q.length ? `<div class="empty">${skipped ? `Everyone here was reminded in the last ${REMIND_GAP} days. Untick the box above to remind them again.` : "Nobody here has a mobile number to message."}</div>`
    : done === q.length ? `<div class="rem-done"><b>All done</b><p class="note">${q.length} reminder${q.length === 1 ? "" : "s"} opened in WhatsApp. Make sure you pressed Send in each chat.</p></div>`
    : `<div class="rem-card">
        <div class="rem-top"><span class="sub mono">${i + 1} of ${q.length}</span><span class="sub">${esc(placeOf(cur))}</span></div>
        <b class="rem-name">${esc(cur.name)}</b>
        <div class="sub">${pill(cur)} ${csChip(cur)}${(n => n !== null ? ` · last reminded ${agoText(n)}` : "")(remindedAgo(cur))}</div>
        <div class="rem-text">${esc(waMsg(cur))}</div>
        <div class="rem-acts">
          <button class="btn ghost" ${i <= 0 ? "disabled" : ""} onclick="remindMove(-1)">Back</button>
          <button class="btn ghost" onclick="remindMove(1)">Skip</button>
          <a class="btn wa-btn rem-go" href="https://wa.me/${phoneIntl(cur.mobile)}${waText(cur)}" target="_blank" rel="noopener" onclick="remindSent('${cur.id}')">${ICON.wa}<span>Open WhatsApp</span></a>
        </div></div>`;
  modal(`<h3>Send WhatsApp reminders</h3>
    <p class="note" style="margin-top:-6px">Free. WhatsApp opens with the message already written for each person: tap <b>Send</b> there, come back here, and the next person is ready.</p>
    <div class="rem-tools">
      <select id="msgStoreSel" onchange="messageStore(this.value)"><option value="">All stores (${total})</option>${stores.map(([s, n]) => `<option value="${esc(s)}" ${s === S.msgStore ? "selected" : ""}>${esc(s)} (${n})</option>`).join("")}</select>
      <label class="rem-check"><input type="checkbox" ${S.msgSkip ? "checked" : ""} onchange="S.msgSkip=this.checked;S.msgCur=null;messageStore()"> Skip people reminded in the last ${REMIND_GAP} days${skipped ? ` (${skipped})` : ""}</label>
    </div>
    ${q.length ? `<div class="vbar"><i style="width:${Math.round(done / q.length * 100)}%"></i></div><p class="note" id="msgCount" style="margin:6px 0 10px">${done} of ${q.length} sent${noPhone ? ` · ${noPhone} with no mobile number (add it with Update)` : ""}</p>` : ""}
    ${card}
    ${q.length ? `<details class="rem-all"><summary>Everyone in this list (${q.length})</summary><div class="msg-list">${q.map(e => `<div class="msg-row ${S.sent.has(e.id) ? "sent" : ""} ${e === cur ? "cur" : ""}" data-id="${e.id}" onclick="S.msgCur='${e.id}';messageStore()">
      <div class="msg-who"><b>${esc(e.name)}</b><div class="sub">${esc(placeOf(e))} · ${pill(e)} ${csChip(e)}</div></div>
      <span class="sub">${S.sent.has(e.id) ? "Sent ✓" : (n => n !== null ? agoText(n) : "")(remindedAgo(e))}</span></div>`).join("")}</div></details>` : ""}
    <div class="actions"><button class="btn" onclick="closeModal();render()">Done</button></div>`, true);
}
function remindMove(step){
  const { q } = remindQueue(); const i = q.findIndex(e => e.id === S.msgCur);
  const n = q[Math.min(q.length - 1, Math.max(0, i + step))]; if (n) { S.msgCur = n.id; messageStore(); }
}
function remindSent(id){
  noteReminded(id);
  // let the link open WhatsApp first, then move to the next person who hasn't been sent
  setTimeout(() => { const { q } = remindQueue(); const i = q.findIndex(e => e.id === id);
    const next = q.slice(i + 1).find(e => !S.sent.has(e.id)) || q.find(e => !S.sent.has(e.id));
    S.msgCur = next ? next.id : id; if (document.querySelector("#msgStoreSel")) messageStore(); }, 350);
}

// ---------- one-page PDF report ----------
function printReport(){
  const c = counts(S.emps), csl = cardStatusList(), top = groupRows(placeOf).filter(([, v]) => v.exp + v.due + v.miss).slice(0, 8);
  const soon = S.emps.filter(e => ["exp", "due"].includes(statusOf(e))).slice(0, 8);
  const now = new Date(), stamp = now.toLocaleString("en-GB", { day:"2-digit", month:"long", year:"numeric", hour:"2-digit", minute:"2-digit" });
  const box = (lbl, v, col) => `<div class="r-kpi"><div class="r-l">${lbl}</div><div class="r-v" style="color:${col}">${v}</div></div>`;
  const pct = n => c.total ? Math.round(n / c.total * 100) + "%" : "0%";
  document.getElementById("report")?.remove();
  const r = document.createElement("div"); r.id = "report";
  r.innerHTML = `<div class="r-head"><div class="r-brand"><img src="icon.svg" alt=""><div><b>Trackit</b><span>Half Million · Baladiya health cards</span></div></div><div class="r-date">${stamp}</div></div>
    <h1>Baladiya card report</h1>
    <p class="r-sub">${scopeName() ? esc(scopeName()) + " · " : ""}${c.total} active employees · ${c.total - c.unv} verified on Balady (${pct(c.total - c.unv)})${S.left.length ? ` · ${S.left.length} marked as left (not counted)` : ""}</p>
    <div class="r-kpis">${box("Expired", `${c.exp} <small>${pct(c.exp)}</small>`, "#C2412D")}${box(STATUS_LABEL.due, `${c.due} <small>${pct(c.due)}</small>`, "#A8691C")}${box("Date missing", `${c.miss} <small>${pct(c.miss)}</small>`, "#5E574C")}${box("OK", `${c.ok} <small>${pct(c.ok)}</small>`, "#2F8A72")}</div>
    <div class="r-cols">
      <div><h2>Needing action</h2>${top.length ? `<table><thead><tr><th>Store / department</th><th>Staff</th><th>Expired</th><th>Due</th><th>No date</th></tr></thead><tbody>${top.map(([k, v]) => `<tr><td>${esc(k)}</td><td>${v.total}</td><td class="r-red">${v.exp}</td><td>${v.due}</td><td>${v.miss}</td></tr>`).join("")}</tbody></table>` : `<p>Nothing needs action.</p>`}</div>
      <div><h2>Card status</h2>${csl.length ? `<table><tbody>${csl.map(([k, n]) => `<tr><td>${esc(k)}</td><td class="r-num">${n}</td></tr>`).join("")}</tbody></table>` : `<p>No card statuses recorded yet.</p>`}</div>
    </div>
    <h2>Needs action soonest</h2>${soon.length ? `<table><thead><tr><th>Employee</th><th>Store</th><th>Expiry</th><th>Card status</th></tr></thead><tbody>${soon.map(e => `<tr><td>${esc(e.name)}</td><td>${esc(placeOf(e))}</td><td class="r-nw">${fmtDate(e.expiry)} · ${relDays(e.expiry)}</td><td>${esc(e.card_status || "—")}</td></tr>`).join("")}</tbody></table>` : `<p>Nobody verified is expired or due in the next ${DUE_DAYS} days.</p>`}
    <div class="r-foot">Generated by Trackit · ${stamp}</div>`;
  document.body.appendChild(r); document.body.classList.add("printing");
  const done = () => { document.body.classList.remove("printing"); r.remove(); window.removeEventListener("afterprint", done); };
  window.addEventListener("afterprint", done);
  setTimeout(() => window.print(), 150);
}

// ---------- assistant ----------
function md(t){
  const lines = esc(t).replace(/\*\*(.+?)\*\*/g, "<b>$1</b>").replace(/(^|\s)\*(?!\s)(.+?)\*(?=\s|$)/g, "$1$2").replace(/^#+\s*/gm, "").split(/\n/);
  let h = "", inList = false;
  for (const l of lines) { const m = l.match(/^\s*(?:[-•*]|\d+[.)])\s+(.*)/);
    if (m) { if (!inList) { h += "<ul>"; inList = true; } h += `<li>${m[1]}</li>`; } else { if (inList) { h += "</ul>"; inList = false; } if (l.trim()) h += `<p>${l}</p>`; } }
  return h + (inList ? "</ul>" : "");
}
function assistant(){
  return header("AI Assistant", "Ask about Baladiya renewals in plain words") + `
  <div class="card chat"><div class="msgs" id="msgs"></div>
  <div class="chips" id="chips">${["Which store has the most expired cards?","Who expires this week?","Which stores have nobody expired?","Make a renewal plan for this week"].map(q => `<button onclick="ask(this.textContent)">${q}</button>`).join("")}</div>
  <form class="composer" onsubmit="event.preventDefault();ask($('#cq').value)"><input id="cq" type="text" placeholder="Ask about your employees…" autocomplete="off"><button class="btn">Send</button></form></div>
  <p class="note" style="margin-top:10px">The assistant sees names, stores, dates and remarks — never Iqama or mobile numbers. Free AI has a daily limit.</p>`;
}
function afterChat(){
  const box = $("#msgs"); if (!box) return;
  box.innerHTML = S.chat.length ? S.chat.map(m => `<div class="msg ${m.role==="user"?"u":"a"}">${m.role==="user" ? esc(m.content) : md(m.content)}</div>`).join("")
    : `<div class="empty">Hi ${esc((S.me.full_name||"").split(" ")[0])}! Ask who needs a Baladiya renewal, which stores are behind, or for a plan.</div>`;
  if (S.busy) box.innerHTML += `<div class="typing">Thinking…</div>`;
  const chips = $("#chips"); if (chips) chips.style.display = S.chat.length ? "none" : "";
  box.scrollTop = box.scrollHeight;
}
async function ask(q){
  q = (q || "").trim(); if (!q || S.busy) return;
  S.chat.push({ role:"user", content:q }); S.busy = true; if ($("#cq")) $("#cq").value = ""; afterChat();
  const { data, error } = await sb.functions.invoke("trackit-ask", { body: { question: q, history: S.chat.slice(0, -1) } });
  S.busy = false;
  let msg = data?.answer;
  if (!msg) { let detail = data?.error; if (!detail && error?.context?.json) { try { detail = (await error.context.json()).error; } catch {} } msg = "Sorry — " + (detail || "the assistant isn't available right now."); }
  S.chat.push({ role:"assistant", content: msg });
  if (S.view === "assistant") afterChat();
}

// ---------- users (admin) ----------
async function adminCall(body){
  const { data, error } = await sb.functions.invoke("trackit-admin-users", { body });
  if (data?.ok) return null;
  let msg = data?.error; if (!msg && error?.context?.json) { try { msg = (await error.context.json()).error; } catch {} }
  return msg || error?.message || "Something went wrong";
}
const accessTxt = p => p.role === "admin" ? "Admin — everything" : p.scope_kind === "store" ? `Store: ${S.map[p.scope_value]?.branch || p.scope_value} (${p.scope_value})` : p.scope_kind === "dept" ? `Department: ${p.scope_value}` : p.scope_kind === "am" ? `Area manager: ${p.scope_value}` : "All employees";
function loginsView(){
  const noLogin = unitsWithoutLogin().length, nCreds = Object.keys(S.creds || {}).length;
  return header("Users", "Each login sees only its own store, department or area. Admins see everything.", `${noLogin ? `<button class="btn ghost" onclick="bulkLogins()">Create ${noLogin} store & department logins</button>` : ""}${nCreds ? `<button class="btn ghost" onclick="downloadLogins()">Download logins (Excel)</button>` : ""}<button class="btn" onclick="addLogin()">+ Add user</button>`) + `
  <div class="card"><div class="tbl-wrap"><table><thead><tr><th>Name</th><th class="hm">Email</th><th>Sees</th><th></th></tr></thead><tbody>
  ${S.profiles.map(p => `<tr><td><b>${esc(p.full_name || p.email)}</b><div class="sub sm-only">${esc(p.email)}</div></td><td class="hm">${esc(p.email)}</td><td>${esc(accessTxt(p))}${p.role !== "admin" ? ` <button class="linkbtn" onclick="setAccess('${p.id}')">Change</button>` : ""}</td>
    <td style="text-align:right;white-space:nowrap"><button class="btn sm ghost" onclick="resetPw('${p.id}')">${ICON.key}<span class="hm">Reset password</span></button>${p.id !== S.me.id ? `<button class="icon-btn" title="Remove" aria-label="Remove" onclick="delLogin('${p.id}')" style="display:inline-block">${ICON.trash}</button>` : ""}</td></tr>`).join("")}
  </tbody></table></div></div>
  ${backupCard()}
  ${mappingCard()}
  ${emailCard()}`;
}
// ---------- admin: store mapping ----------
function mappingCard(){
  if (!hasMap()) return `<div class="card pad section"><h3>Branches</h3><p class="note">The branch list hasn't been synced yet. It comes from the weekly Span of Control sync.</p></div>`;
  const branches = Object.values(S.map).sort((x, y) => x.branch.localeCompare(y.branch));
  const synced = S.mapMeta?.synced_at ? fmtTS(S.mapMeta.synced_at) : "not yet";
  return `<div class="card pad section" id="mapCard"><h3>Branches</h3>
    <p class="note">Area manager and ROM come from the Span of Control file every Sunday (last sync: <b>${synced}</b>, ${branches.length} branches). Staff are linked to a branch by store code. City and region are kept here — correct them below and the sync won't overwrite them. Departments have no area manager and show under their own name.</p>
    <details class="map-sec"><summary>Branches — city and region (${branches.length})</summary>
      <div class="tbl-wrap"><table><thead><tr><th>Branch</th><th class="hm">Area manager</th><th>City</th><th>Region</th></tr></thead><tbody>
      ${branches.map(b => `<tr><td><b>${esc(b.branch)}</b><div class="sub mono">${esc(b.code)} · ${esc(b.rom)}</div></td><td class="hm">${esc(b.area_manager)}</td>
        <td><input class="in-sm" aria-label="City for ${esc(b.branch)}" value="${esc(b.city)}" data-code="${esc(b.code)}" data-f="city" onchange="saveGeo(this)" list="cityList"></td>
        <td><input class="in-sm" aria-label="Region for ${esc(b.branch)}" value="${esc(b.region)}" data-code="${esc(b.code)}" data-f="region" onchange="saveGeo(this)" list="regionList"></td></tr>`).join("")}
      </tbody></table></div>
      <datalist id="cityList">${[...new Set(branches.map(b => b.city).filter(Boolean))].sort().map(c => `<option value="${esc(c)}">`).join("")}</datalist>
      <datalist id="regionList">${[...new Set(branches.map(b => b.region).filter(Boolean))].sort().map(c => `<option value="${esc(c)}">`).join("")}</datalist>
    </details></div>`;
}
async function linkStore(sel){
  const store = sel.dataset.store.trim().toUpperCase(), code = sel.value; sel.disabled = true;
  const { error } = code ? await sb.from("trackit_store_alias").upsert({ store, code, set_by: S.me.full_name || S.me.email, set_at: new Date().toISOString() })
                         : await sb.from("trackit_store_alias").delete().eq("store", store);
  sel.disabled = false;
  if (error) return toast(error.message);
  if (code) S.alias[store] = code; else delete S.alias[store];
  mapCache = new Map(); toast(code ? "Store linked" : "Link removed"); render();
}
async function saveGeo(inp){
  const v = inp.value.replace(/\s+/g, " ").trim(), code = inp.dataset.code, f = inp.dataset.f;
  inp.disabled = true;
  const { error } = await sb.from("trackit_store_map").update({ [f]: v }).eq("code", code);
  inp.disabled = false;
  if (error) return toast(error.message);
  S.map[code][f] = v; inp.value = v; mapCache = new Map(); toast(`${f === "city" ? "City" : "Region"} saved`);
}
const DAYS = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
const hourLabel = h => `${((h + 11) % 12) + 1}:00 ${h < 12 ? "AM" : "PM"}`;
// ---------- admin: backups ----------
function backupCard(){
  const b = S.backup || {};
  const last = b.last_ok_at ? fmtTS(b.last_ok_at) : "none yet";
  const warn = b.ok === false;
  return `<div class="card pad section" id="backupCard"><h3>Backups</h3>
    <p class="note">All Trackit data is saved automatically <b>every night at 3:00 AM</b> (Riyadh). Two copies are kept: the <b>latest</b> and the <b>previous</b> one. If staff numbers suddenly drop by more than 20%, the nightly backup does not overwrite the good copy. Passwords are never included.</p>
    <div class="steprow"><span><b>Last good backup</b> <span class="sub">${esc(last)}${b.made_by ? ` · ${esc(b.made_by)}` : ""}</span></span>${b.ok === true ? `<span class="pill p-ok"><i></i>OK</span>` : warn ? `<span class="pill p-exp"><i></i>Check</span>` : ""}</div>
    ${b.message ? `<p class="note"${warn ? ' style="color:var(--red)"' : ""}>${esc(b.message)}</p>` : ""}
    <div class="err" id="bkErr"></div>
    <div class="actions" style="justify-content:flex-start;flex-wrap:wrap"><button class="btn" id="bkNow" onclick="backupNow()">Back up now</button><button class="btn ghost" onclick="downloadBackup('latest', this)">Download latest (Excel)</button><button class="btn ghost" onclick="downloadBackup('previous', this)">Download previous</button></div>
  </div>`;
}
async function callBackup(body){
  const { data, error } = await sb.functions.invoke("trackit-backup", { body });
  let d = data; if (!d && error?.context?.json) { try { d = await error.context.json(); } catch {} }
  return d || { error: error?.message || "Something went wrong" };
}
async function backupNow(force){
  const btn = $("#bkNow"); btn.disabled = true; btn.textContent = "Backing up…"; $("#bkErr").textContent = "";
  const d = await callBackup(force ? { force: true } : {});
  await loadAdmin(); render();
  if (d.ok) return toast("Backup saved");
  if (d.blocked && confirm(`Active staff fell from ${d.before} to ${d.active} since the last backup.\n\nOnly continue if this drop is correct. Save this as the new backup?`)) return backupNow(true);
  const e = $("#bkErr"); if (e) e.textContent = d.message || d.error || "Backup failed";
}
async function downloadBackup(which, btn){
  btn.disabled = true; const d = await callBackup({ action: "download", which }); btn.disabled = false;
  if (d.url) location.href = d.url; else toast(d.error || "Couldn't get the file");
}
function emailCard(){
  const st = S.settings; if (!st) return "";
  const when = st.frequency === "weekly" ? `every ${DAYS[st.weekday]} at ${hourLabel(st.send_hour)}` : `every day at ${hourLabel(st.send_hour)}`;
  return `<div class="card pad section"><h3>Email alerts</h3>
    <p class="note">Sends a summary of everyone <b>expired</b> and <b>expiring within ${DUE_DAYS} days</b> among staff verified on Balady (Riyadh time). No email is sent on days with nothing to report. Iqama and mobile numbers are never included.</p>
    <form id="alertForm" onsubmit="event.preventDefault();saveAlerts()">
      <div class="steprow"><span><b>Alerts</b> <span class="sub">${st.email_enabled ? `On — ${when}` : "Off"}</span></span>
        <div class="seg"><button type="button" class="${!st.email_enabled ? "on" : ""}" onclick="pickAlert(this,false)">Off</button><button type="button" class="${st.email_enabled ? "on done" : ""}" onclick="pickAlert(this,true)">On</button></div></div>
      <input type="hidden" name="email_enabled" value="${st.email_enabled ? "1" : ""}">
      <label>Receivers <span class="sub">(one email per line — add or remove any time)</span></label>
      <textarea name="recipients" rows="3" style="width:100%;font:inherit;padding:10px 12px;border:1px solid var(--line);border-radius:12px;background:#fff" placeholder="name@halfm.sa">${esc((st.recipients || []).join("\n"))}</textarea>
      <div class="row2"><div><label>How often</label><select name="frequency" onchange="$('#wdBox').style.visibility=this.value==='weekly'?'visible':'hidden'"><option value="daily" ${st.frequency==="daily"?"selected":""}>Every day</option><option value="weekly" ${st.frequency==="weekly"?"selected":""}>Once a week</option></select></div>
      <div id="wdBox" style="visibility:${st.frequency==="weekly"?"visible":"hidden"}"><label>Day</label><select name="weekday">${DAYS.map((d,i) => `<option value="${i}" ${st.weekday===i?"selected":""}>${d}</option>`).join("")}</select></div></div>
      <div class="row2"><div><label>Time (Riyadh)</label><select name="send_hour">${Array.from({length:24},(_,h) => `<option value="${h}" ${st.send_hour===h?"selected":""}>${hourLabel(h)}</option>`).join("")}</select></div><div></div></div>
      <div class="row2"><div><label>Sender email <span class="sub">(the one verified in Brevo)</span></label><input type="email" name="sender_email" value="${esc(st.sender_email)}" placeholder="you@example.com"></div>
      <div><label>Sender name</label><input type="text" name="sender_name" value="${esc(st.sender_name)}"></div></div>
      ${st.last_result ? `<p class="note">Last: ${esc(st.last_result)}</p>` : ""}
      <div class="err" id="alertErr"></div>
      <div class="actions" style="justify-content:flex-start"><button class="btn" id="alertSave">Save</button><button type="button" class="btn ghost" id="alertTest" onclick="testAlert()">Send test email now</button></div>
    </form></div>`;
}
function pickAlert(btn, on){ const seg = btn.parentElement; seg.querySelectorAll("button").forEach(b => b.classList.remove("on","done")); btn.classList.add("on"); if (on) btn.classList.add("done"); $("#alertForm [name=email_enabled]").value = on ? "1" : ""; }
function readAlertForm(){
  const fd = Object.fromEntries(new FormData($("#alertForm")));
  const recipients = [...new Set(fd.recipients.split(/[\s,;]+/).map(x => x.trim().toLowerCase()).filter(Boolean))];
  const bad = recipients.filter(x => !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(x));
  return { bad, row: { email_enabled: !!fd.email_enabled, recipients, frequency: fd.frequency, weekday: +fd.weekday, send_hour: +fd.send_hour,
    sender_email: fd.sender_email.trim(), sender_name: fd.sender_name.trim() || "Trackit", updated_at: new Date().toISOString() } };
}
async function saveAlerts(quiet){
  const { bad, row } = readAlertForm(); $("#alertErr").textContent = "";
  if (bad.length) { $("#alertErr").textContent = "Not a valid email: " + bad.join(", "); return false; }
  if (row.email_enabled && !row.recipients.length) { $("#alertErr").textContent = "Add at least one receiver email."; return false; }
  if (row.email_enabled && !row.sender_email) { $("#alertErr").textContent = "Add the sender email you verified in Brevo."; return false; }
  const { error } = await sb.from("trackit_settings").update(row).eq("id", 1);
  if (error) { $("#alertErr").textContent = error.message; return false; }
  Object.assign(S.settings, row); if (!quiet) { toast("Email alerts saved"); render(); }
  return true;
}
async function testAlert(){
  const b = $("#alertTest"); b.disabled = true; b.textContent = "Sending…";
  if (!(await saveAlerts(true))) { b.disabled = false; b.textContent = "Send test email now"; return; }
  const { data, error } = await sb.functions.invoke("trackit-email", { body: { mode: "test" } });
  let msg = data?.error; if (!data?.ok && !msg && error?.context?.json) { try { msg = (await error.context.json()).error; } catch {} }
  await loadAdmin(); render();
  if (data?.ok) toast(`Test email sent to ${data.sent} receiver${data.sent === 1 ? "" : "s"}`);
  else { const e = $("#alertErr"); if (e) e.textContent = msg || error?.message || "Couldn't send"; }
}
function addLogin(){
  modal(`<h3>Add user</h3><form id="lf">
    <label>Full name</label><input type="text" name="full_name" required>
    <label>Email</label><input type="email" name="email" required>
    <label>Starting password (min 8 characters)</label><input type="text" name="password" required minlength="8" autocomplete="off">
    ${accessFields("manager", "store", "")}
    <div class="err" id="lerr2"></div>
    <div class="actions"><button type="button" class="btn ghost" onclick="closeModal()">Cancel</button><button class="btn" id="lbtn2">Create login</button></div></form>`);
  $("#lf").onsubmit = async ev => { ev.preventDefault(); $("#lbtn2").disabled = true;
    const fd = Object.fromEntries(new FormData(ev.target)), acc = readAccess(fd); if (acc.error) { $("#lbtn2").disabled = false; return $("#lerr2").textContent = acc.error; }
    const err = await adminCall({ action:"create", full_name: fd.full_name, email: fd.email, password: fd.password, ...acc });
    $("#lbtn2").disabled = false; if (err) return $("#lerr2").textContent = err;
    closeModal(); toast("Login created — share the password privately"); await loadAdmin(); render(); };
}
// who a login can see: everything, one area manager's stores, one store, or one department
function accessFields(role, kind, val){
  const k = role === "admin" ? "admin" : kind || "all";
  const ams = [...new Set(Object.values(S.map).map(m => m.area_manager).filter(Boolean))].sort();
  const br = Object.values(S.map).sort((x, y) => x.branch.localeCompare(y.branch));
  const box = (kk, html) => `<div class="acc-v ${k === kk ? "" : "hidden"}" data-k="${kk}">${html}</div>`;
  return `<label>Sees</label><select name="acc" onchange="document.querySelectorAll('.acc-v').forEach(d => d.classList.toggle('hidden', d.dataset.k !== this.value))">
      ${[["store","One store"],["dept","One department"],["am","An area manager's stores"],["all","All employees"],["admin","Admin — everything, plus users and import"]].map(([v, l]) => `<option value="${v}" ${k === v ? "selected" : ""}>${l}</option>`).join("")}</select>
    ${box("store", `<label>Store</label><select name="v_store"><option value="">— pick —</option>${br.map(b => `<option value="${esc(b.code)}" ${k === "store" && val === b.code ? "selected" : ""}>${esc(b.branch)} (${esc(b.code)})</option>`).join("")}</select>`)}
    ${box("dept", `<label>Department</label><select name="v_dept"><option value="">— pick —</option>${S.depts.map(d => `<option ${k === "dept" && val === d ? "selected" : ""}>${esc(d)}</option>`).join("")}</select>`)}
    ${box("am", `<label>Area manager</label><select name="v_am"><option value="">— pick —</option>${ams.map(a => `<option ${k === "am" && val === a ? "selected" : ""}>${esc(a)}</option>`).join("")}</select>`)}`;
}
function readAccess(fd){
  const a = fd.acc || "all";
  if (a === "admin") return { role: "admin", scope_kind: "all", scope_value: "" };
  if (a === "all") return { role: "manager", scope_kind: "all", scope_value: "" };
  const v = fd["v_" + a] || ""; if (!v) return { error: "Pick which " + ({ store: "store", dept: "department", am: "area manager" }[a]) + " this login sees." };
  return { role: "manager", scope_kind: a, scope_value: v };
}
function setAccess(id){
  const p = S.profiles.find(x => x.id === id);
  modal(`<h3>Change access</h3><p class="note">For ${esc(p.full_name || p.email)}</p><form id="af">${accessFields(p.role, p.scope_kind, p.scope_value)}
    <div class="err" id="aerr"></div><div class="actions"><button type="button" class="btn ghost" onclick="closeModal()">Cancel</button><button class="btn">Save</button></div></form>`);
  $("#af").onsubmit = async ev => { ev.preventDefault(); const acc = readAccess(Object.fromEntries(new FormData(ev.target))); if (acc.error) return $("#aerr").textContent = acc.error;
    const err = await adminCall({ action: "set_access", id, ...acc }); if (err) return $("#aerr").textContent = err; closeModal(); toast("Access saved"); await loadAdmin(); render(); };
}
// one login per store, with a printable list of passwords
const genPw = () => { const c = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789", a = new Uint32Array(10); crypto.getRandomValues(a); return [...a].map(x => c[x % c.length]).join(""); };
// every store and department that has staff gets one login
const slug = t => String(t).toLowerCase().replace(/&/g, " ").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
function unitsWithoutLogin(){
  const has = (k, v) => S.profiles.some(p => p.role !== "admin" && p.scope_kind === k && p.scope_value === v);
  const st = [...new Set(S.emps.filter(e => e.unit_kind === "store").map(e => e.unit))].filter(c => S.map[c] && !has("store", c)).sort((x, y) => x.localeCompare(y, undefined, { numeric: true }))
    .map(c => ({ kind: "store", value: c, full_name: `${S.map[c].branch} (${c})` }));
  const dp = S.depts.filter(d => S.emps.some(e => e.unit_kind === "dept" && e.unit === d) && !has("dept", d)).map(d => ({ kind: "dept", value: d, full_name: d }));
  return [...st, ...dp];
}
function bulkLogins(){
  const todo = unitsWithoutLogin(); if (!todo.length) return;
  const nS = todo.filter(t => t.kind === "store").length, nD = todo.length - nS;
  modal(`<h3>Create logins</h3><p class="note" style="margin-top:-6px">One login for each of <b>${nS} stores</b>${nD ? ` and <b>${nD} departments</b>` : ""} that have staff and no login yet. Each one sees only its own staff. Passwords are made up at random and kept here so you can <b>Download logins (Excel)</b> any time to share them.</p>
    <form id="bf"><label>Email ending</label><input type="text" name="domain" value="trackit.halfm.sa" required>
    <p class="note">Logins look like <b class="mono">${esc(todo[0].kind === "store" ? todo[0].value.toLowerCase() : slug(todo[0].value))}@trackit.halfm.sa</b>. No emails are sent to these addresses.</p>
    <div class="err" id="berr"></div><div id="bprog"></div>
    <div class="actions"><button type="button" class="btn ghost" onclick="closeModal()">Cancel</button><button class="btn" id="bbtn">Create ${todo.length} logins</button></div></form>`);
  $("#bf").onsubmit = async ev => {
    ev.preventDefault(); const dom = new FormData(ev.target).get("domain").trim().replace(/^@/, "").toLowerCase();
    if (!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(dom)) return $("#berr").textContent = "Enter an email ending like trackit.halfm.sa";
    $("#bbtn").disabled = true; let made = 0; const fails = [];
    for (let i = 0; i < todo.length; i += 20) {
      $("#bprog").innerHTML = `<p class="note">Creating ${Math.min(i + 20, todo.length)} of ${todo.length}…</p>`;
      const items = todo.slice(i, i + 20).map(t => ({ ...t, email: `${t.kind === "store" ? t.value.toLowerCase() : slug(t.value)}@${dom}`, password: genPw() }));
      const { data, error } = await sb.functions.invoke("trackit-admin-users", { body: { action: "bulk_create", items } });
      if (error || !data?.results) { fails.push(...items.map(x => [x.full_name, data?.error || error?.message || "failed"])); continue; }
      for (const r of data.results) { if (r.ok) made++; else fails.push([items.find(x => x.value === r.value)?.full_name || r.value, r.error]); }
    }
    await loadAdmin(); render();
    modal(`<h3>${made} logins created</h3><p class="note">Use <b>Download logins (Excel)</b> on the Users page whenever you need to share them.</p>
      ${fails.length ? `<div class="errlist">${fails.map(([c, e]) => `<div>${esc(c)}: ${esc(e)}</div>`).join("")}</div>` : ""}
      <div class="actions">${made ? `<button class="btn ghost" onclick="downloadLogins()">Download logins (Excel)</button>` : ""}<button class="btn" onclick="closeModal()">Done</button></div>`);
  };
}
async function downloadLogins(){
  try { await needXLSX(); } catch (e) { return toast(e.message); }
  const rows = S.profiles.filter(p => S.creds?.[p.id]).map(p => {
    const c = S.creds[p.id], m = p.scope_kind === "store" ? S.map[p.scope_value] : null;
    return [p.scope_kind === "store" ? "Store" : p.scope_kind === "dept" ? "Department" : "Other", p.scope_kind === "store" ? (m?.branch || p.scope_value) : p.scope_value, p.scope_kind === "store" ? p.scope_value : "", m?.area_manager || "", m?.city || "", c.login, c.password];
  }).sort((x, y) => x[0].localeCompare(y[0]) || x[1].localeCompare(y[1]));
  const link = location.origin + location.pathname;
  const ws = XLSX.utils.aoa_to_sheet([["Type", "Store / Department", "Code", "Area manager", "City", "Login email", "Password", "Website"], ...rows.map(r => [...r, link])]);
  ws["!cols"] = [12, 34, 8, 24, 14, 34, 14, 40].map(w => ({ wch: w }));
  const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, "Logins");
  XLSX.writeFile(wb, `trackit-logins-${new Date().toISOString().slice(0, 10)}.xlsx`);
}
function resetPw(id){
  const m = S.profiles.find(x => x.id === id);
  modal(`<h3>Reset password</h3><p class="note">For ${esc(m.full_name || m.email)}</p><form id="rf"><label>New password (min 8 characters)</label><input type="text" name="password" required minlength="8" autocomplete="off">
  <div class="err" id="rerr"></div><div class="actions"><button type="button" class="btn ghost" onclick="closeModal()">Cancel</button><button class="btn">Save password</button></div></form>`);
  $("#rf").onsubmit = async ev => { ev.preventDefault(); const err = await adminCall({ action:"reset_password", id, password: new FormData(ev.target).get("password") }); if (err) return $("#rerr").textContent = err; closeModal(); toast("Password updated"); await loadAdmin(); };
}
function delLogin(id){
  const m = S.profiles.find(x => x.id === id);
  modal(`<h3>Remove login?</h3><p class="note">${esc(m.email)} won't be able to sign in. Employee data stays in Trackit.</p><div class="err" id="derr"></div>
  <div class="actions"><button class="btn ghost" onclick="closeModal()">Cancel</button><button class="btn danger" id="dm">Remove</button></div>`);
  $("#dm").onclick = async () => { const err = await adminCall({ action:"delete", id }); if (err) return $("#derr").textContent = err; closeModal(); toast("Removed"); await loadAdmin(); render(); };
}

// ---------- modal ----------
function modal(html, wide){ $("#modalRoot").innerHTML = `<div class="modal-bg" onclick="if(event.target===this)softClose()"><div class="modal ${wide?"wide":""}" role="dialog" aria-modal="true">${html}</div></div>`; }
function closeModal(){ $("#modalRoot").innerHTML = ""; }
// tapping outside or pressing Esc never throws away typed changes
function softClose(){
  const f = document.querySelector("#modalRoot form");
  if (f && f.dataset.dirty) { const n = f.querySelector(".unsaved") || f.insertAdjacentElement("beforeend", Object.assign(document.createElement("p"), { className: "unsaved note" })); n.textContent = "You have unsaved changes — press Save to keep them, or Cancel to discard."; return; }
  closeModal();
}
document.addEventListener("keydown", e => { if (e.key === "Escape" && $("#modalRoot").innerHTML) softClose(); });
document.addEventListener("input", e => { const f = e.target.closest && e.target.closest("#modalRoot form"); if (f && e.target.type !== "file") f.dataset.dirty = "1"; });
document.addEventListener("change", e => { const f = e.target.closest && e.target.closest("#modalRoot form"); if (f && e.target.type !== "file") f.dataset.dirty = "1"; });

// ---------- start ----------
sb.auth.getSession().then(({ data }) => data.session ? boot(data.session) : show("login")).catch(() => { clearLocalLogin(); show("login"); });
