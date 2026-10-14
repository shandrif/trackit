// ---------- config ----------
const SUPABASE_URL = "https://rcufmnidwyycbrtqgqga.supabase.co";
const SUPABASE_KEY = "sb_publishable_u2__PPq2nDZLyoNnLHxkVA_olltjpHc";
const sb = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
const DUE_DAYS = 30;
const NATIONALITIES = ["Saudi","Bangladeshi","Indian","Filipino","Pakistani","Nepali","Egyptian","Sudanese","Yemeni","Eritrean","Sri Lankan","Jordanian","Syrian","Other"];

// ---------- state ----------
const S = { me:null, person:null, emps:[], branches:[], people:[], aliases:[], profiles:[], weeks:[], stats:[],
  view:"dashboard", page:1, filters:{q:"",region:"",am:"",branch:"",status:"",step:""}, alertTab:"exp", chat:[], channel:null, imp:null };

// ---------- helpers ----------
const $ = s => document.querySelector(s);
const esc = v => String(v ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const todayUTC = () => { const n = new Date(); return Date.UTC(n.getFullYear(), n.getMonth(), n.getDate()); };
const daysLeft = d => Math.round((Date.parse(d) - todayUTC()) / 86400000);
const statusOf = e => { if (!e.expiry) return "miss"; const n = daysLeft(e.expiry); return n < 0 ? "exp" : n <= DUE_DAYS ? "due" : "ok"; };
const STATUS_LABEL = { exp:"Expired", due:"Due ≤ 30 days", miss:"Date missing", ok:"OK" };
const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const fmtDate = d => { if(!d) return ""; const [y,m,dd] = d.split("-"); return `${dd} ${MONTHS[+m-1]} ${y}`; };
const relDays = d => { const n = daysLeft(d); return n < 0 ? `${-n} day${n===-1?"":"s"} ago` : n === 0 ? "today" : `in ${n} day${n===1?"":"s"}`; };
const pill = e => { const s = statusOf(e); return `<span class="pill p-${s}"><i></i>${STATUS_LABEL[s]}</span>`; };
const dateCell = e => e.expiry ? `${fmtDate(e.expiry)}<div class="sub">${relDays(e.expiry)}</div>` : `<div class="sub">${esc(e.expiry_note || "No date")}</div>`;
const maskIq = v => { v = String(v||""); return v.length > 4 ? "•••• " + v.slice(-4) : v; };
const isAdmin = () => S.me?.role === "admin";
const isRom = () => !isAdmin() && S.me?.is_rom;
const roleLabel = p => p.role === "admin" ? "Admin" : p.is_rom ? "ROM" : "Area Manager";
const branchOf = id => S.branches.find(b => b.id === id) || {};
const personName = id => S.people.find(p => p.id === id)?.name || "";
const title = s => String(s||"").toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
const trainingDone = e => e.training === "done" || e.training === "not_required";
const stepOf = e => e.card_updated ? "card" : (trainingDone(e) && e.medical === "done") ? "training" : e.medical === "done" ? "medical" : "none";
const STEP_LABEL = { none:"Not started", medical:"Medical done", training:"Training done", card:"Card updated" };
const needsAction = e => statusOf(e) !== "ok";
function toast(msg){ const t = document.createElement("div"); t.className = "toast"; t.textContent = msg; document.body.appendChild(t); setTimeout(() => t.remove(), 2600); }
function progDots(e){
  const t = e.training === "not_required" ? `<i class="na" title="Training not required">T</i>` : `<i class="${e.training==='done'?'on':''}" title="Training">T</i>`;
  return `<span class="prog" title="${STEP_LABEL[stepOf(e)]}"><i class="${e.medical==='done'?'on':''}" title="Medical">M</i>${t}<i class="${e.card_updated?'on':''}" title="Card updated">C</i></span>`;
}
function phoneIntl(m){ let d = String(m||"").replace(/\D/g,""); if (!d) return ""; if (d.startsWith("00")) d = d.slice(2); if (d.startsWith("0")) d = d.slice(1); if (d.length === 9 && d.startsWith("5")) d = "966" + d; return d; }
function contact(e){
  const p = phoneIntl(e.mobile); if (!p) return "";
  return `<span class="contact"><a href="tel:+${p}" title="Call" aria-label="Call">${ICON.phone}</a><a href="https://wa.me/${p}" target="_blank" rel="noopener" title="WhatsApp" aria-label="WhatsApp">${ICON.wa}</a></span>`;
}
const ICON = {
  dash:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/></svg>',
  users:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.8-3.6 3.4-5.5 6.5-5.5s5.7 1.9 6.5 5.5"/><path d="M16 4.5a3.5 3.5 0 0 1 0 7M18 14.8c1.9.7 3.1 2.5 3.5 5.2"/></svg>',
  up:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 15V4M7 9l5-5 5 5"/><path d="M4 15v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3"/></svg>',
  bell:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.9 1.9 0 0 0 3.4 0"/></svg>',
  spark:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/><path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z"/></svg>',
  shield:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/><path d="M9 12l2 2 4-4"/></svg>',
  store:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 9l1.5-5h13L20 9M4 9h16v11H4zM9 20v-6h6v6"/></svg>',
  edit:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 20h4L19 9l-4-4L4 16z"/></svg>',
  trash:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/></svg>',
  key:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" width="16" height="16"><circle cx="8" cy="15" r="4"/><path d="M10.8 12.2 20 3M16 7l3 3M14 9l2 2"/></svg>',
  phone:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2"/></svg>',
  wa:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M3.5 20.5l1.3-4.2A8.5 8.5 0 1 1 8 19.6z"/><path d="M9 9.5c.3 2 2.2 4.1 4.5 4.8l1.2-1.2 1.8.9c-.3 1.2-1.3 1.9-2.4 1.8C10.8 15.4 8.5 13 8.2 10c-.1-1 .6-2 1.8-2.3l.9 1.8z"/></svg>',
};
const VIEWS = () => [
  ["dashboard","Dashboard",ICON.dash],["employees","Employees",ICON.users],["import","Import",ICON.up],
  ["alerts","Alerts",ICON.bell],["assistant","AI Assistant",ICON.spark],
  ...(isAdmin() ? [["people","People & logins",ICON.shield],["branches","Branches",ICON.store]] : [])
];
const scopeText = () => isAdmin() ? "All regions" : isRom() ? `ROM · ${S.branches.length} branches` : `${S.branches.length} branches`;

// ---------- auth ----------
$("#loginForm").addEventListener("submit", async e => {
  e.preventDefault(); $("#lerr").textContent = ""; $("#lbtn").disabled = true;
  const { error } = await sb.auth.signInWithPassword({ email: $("#lemail").value.trim(), password: $("#lpass").value });
  $("#lbtn").disabled = false;
  if (error) $("#lerr").textContent = error.message === "Invalid login credentials" ? "Wrong email or password." : error.message;
});
async function signOut(){ if (S.channel) sb.removeChannel(S.channel); await sb.auth.signOut(); location.reload(); }
sb.auth.onAuthStateChange((ev, session) => { setTimeout(() => { if (ev === "SIGNED_IN" && !S.me && !S.booting) boot(session); if (ev === "SIGNED_OUT") show("login"); }, 0); });
function show(which){ ["login","noaccess","shell"].forEach(id => $("#"+id).classList.toggle("hidden", id !== which)); }
async function boot(session){
  if (S.booting || S.me) return; S.booting = true;
  try { await bootInner(session); } finally { S.booting = false; }
}
async function bootInner(session){
  if (!session) { const { data } = await sb.auth.getSession(); session = data.session; }
  if (!session) return show("login");
  const { data: me } = await sb.from("trackit_profiles").select("*").eq("id", session.user.id).maybeSingle();
  if (!me || (me.role !== "admin" && !me.person_id)) return show("noaccess");
  S.me = me;
  $("#meName").textContent = me.full_name || me.email;
  $("#meRole").textContent = me.role === "admin" ? "Admin · all regions" : me.is_rom ? "ROM" : "Area Manager";
  show("shell");
  await loadAll();
  subscribe();
  go(location.hash.slice(1) || "dashboard");
}

// ---------- data ----------
async function pageAll(table, select, order){
  const rows = [];
  for (let from = 0; ; from += 1000) {
    let q = sb.from(table).select(select).range(from, from + 999); if (order) q = q.order(order);
    const { data, error } = await q;
    if (error) { toast(error.message); break; }
    rows.push(...data); if (data.length < 1000) break;
  }
  return rows;
}
async function loadAll(){
  const [emps, branches, people, aliases, weeks, stats] = await Promise.all([
    pageAll("trackit_employees", "*", "expiry"), pageAll("trackit_branches", "*", "name"), pageAll("trackit_people", "*", "name"),
    pageAll("trackit_branch_aliases", "*"), pageAll("trackit_weeks", "*", "created_at"), pageAll("trackit_week_stats", "*")]);
  // expired first, then soonest; missing dates after expired
  S.emps = emps.sort((a, b) => (a.expiry || "0000") < (b.expiry || "0000") ? -1 : 1);
  S.branches = branches; S.people = people; S.aliases = aliases; S.weeks = weeks; S.stats = stats;
  if (isAdmin()) { const { data } = await sb.from("trackit_profiles").select("*").order("full_name"); S.profiles = data || []; }
}
let reloadT = null;
function subscribe(){
  S.channel = sb.channel("trackit-emps")
    .on("postgres_changes", { event: "*", schema: "public", table: "trackit_employees" }, () => {
      clearTimeout(reloadT); reloadT = setTimeout(async () => { await loadAll(); render(true); }, 800);
    }).subscribe();
}

// ---------- routing ----------
function go(v){ if (!VIEWS().some(x => x[0] === v)) v = "dashboard"; S.view = v; S.page = 1; location.hash = v; render(); window.scrollTo(0,0); }
window.addEventListener("hashchange", () => { const v = location.hash.slice(1); if (S.me && v && v !== S.view) go(v); });
function renderNav(){
  $("#nav").innerHTML = VIEWS().map(([k,l,i]) => `<button class="${S.view===k?"on":""}" onclick="go('${k}')">${i}<span>${l}</span></button>`).join("");
  const short = { "AI Assistant":"Ask AI", "People & logins":"People", "Branches":"Branches" };
  $("#bnav").innerHTML = VIEWS().map(([k,l,i]) => `<button class="${S.view===k?"on":""}" onclick="go('${k}')">${i}<span>${short[l]||l}</span></button>`).join("");
}
function render(fromLive){
  renderNav();
  if (fromLive && (S.view === "assistant" || (S.view === "import" && S.imp))) return;
  const f = { dashboard, employees, import: importView, alerts, assistant, people: peopleView, branches: branchesView }[S.view];
  const keepFocus = document.activeElement?.id;
  $("#main").innerHTML = f();
  if (S.view === "assistant") afterChat();
  if (S.view === "import") bindDrop();
  if (keepFocus && document.getElementById(keepFocus)) { const el = document.getElementById(keepFocus); el.focus(); if (el.setSelectionRange && el.value) el.setSelectionRange(el.value.length, el.value.length); }
}
const header = (t, p, extra="") => `<div class="top"><div><h2>${t}</h2><p>${p}</p></div><div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap"><span class="live"><i></i>Live</span>${extra}</div></div>`;

// ---------- dashboard ----------
function counts(list){ const c = { exp:0, due:0, miss:0, ok:0, total:list.length }; for (const e of list) c[statusOf(e)]++; return c; }
function groupRows(keyFn){
  const g = {};
  for (const e of S.emps) {
    const k = keyFn(e) || "—"; g[k] ??= { total:0, exp:0, due:0, miss:0, ok:0, card:0 };
    g[k].total++; g[k][statusOf(e)]++; if (e.card_updated) g[k].card++;
  }
  return Object.entries(g).sort((a,b) => (b[1].exp*1e6 + b[1].miss*1e3 + b[1].due) - (a[1].exp*1e6 + a[1].miss*1e3 + a[1].due));
}
function groupTable(titleTxt, colName, rows){
  if (!rows.length) return "";
  return `<div class="card section"><div class="pad" style="padding-bottom:6px"><h3>${titleTxt}</h3></div><div class="tbl-wrap"><table><thead><tr><th>${colName}</th><th>Staff</th><th>Expired</th><th>Due</th><th class="hm">No date</th><th class="hm">Card updated</th></tr></thead><tbody>
  ${rows.map(([k,v]) => `<tr><td><b>${esc(k)}</b></td><td class="mono">${v.total}</td><td class="mono" style="color:${v.exp?"var(--red)":"var(--muted)"};font-weight:${v.exp?700:400}">${v.exp}</td><td class="mono" style="color:${v.due?"var(--amber)":"var(--muted)"};font-weight:${v.due?700:400}">${v.due}</td><td class="mono hm">${v.miss}</td><td class="mono hm">${v.card}</td></tr>`).join("")}
  </tbody></table></div></div>`;
}
function funnel(){
  const list = S.emps.filter(needsAction);
  const n = { none:0, medical:0, training:0, card:0 }; list.forEach(e => n[stepOf(e)]++);
  const tot = list.length || 1;
  const row = (lbl, v, col) => `<div class="frow"><span>${lbl}</span><div class="track"><span style="width:${v/tot*100}%;background:${col}"></span></div><b>${v}</b></div>`;
  return `<div class="card pad"><h3>Renewal progress</h3><p class="note" style="margin:-8px 0 14px">${list.length} people need a renewal (expired, due or no date). Where are they?</p>
  <div class="funnel">${row("Not started", n.none, "#C9BBA8")}${row("Medical done", n.medical, "#D4B38B")}${row("Training done", n.training, "#A9875F")}${row("Card updated", n.card, "#84C6B2")}</div></div>`;
}
function trend(){
  const myB = new Set(S.branches.map(b => b.id));
  const weeks = S.weeks.slice(-12).map(w => { const st = S.stats.filter(s => s.week_id === w.id && myB.has(s.branch_id));
    const sum = k => st.reduce((a,s) => a + s[k], 0); return { label: w.label, exp: sum("expired"), due: sum("due"), miss: sum("missing"), card: sum("card_done") }; });
  if (weeks.length < 2) return `<div class="card pad"><h3>Week by week</h3><p class="note">The trend appears after two weekly uploads${weeks.length ? ` (saved so far: ${esc(weeks[0].label)})` : ""}. ${isAdmin() ? "Each import is saved under the week name you give it." : ""}</p></div>`;
  const W = 560, H = 210, P = { l:36, r:12, t:12, b:34 };
  const max = Math.max(1, ...weeks.flatMap(w => [w.exp, w.due, w.miss]));
  const x = i => P.l + i * (W - P.l - P.r) / (weeks.length - 1), y = v => P.t + (H - P.t - P.b) * (1 - v / max);
  const line = (k, col) => `<polyline fill="none" stroke="${col}" stroke-width="3" stroke-linejoin="round" points="${weeks.map((w,i) => `${x(i)},${y(w[k])}`).join(" ")}"/>` + weeks.map((w,i) => `<circle cx="${x(i)}" cy="${y(w[k])}" r="3.5" fill="${col}"><title>${esc(w.label)}: ${w[k]}</title></circle>`).join("");
  const grid = [0, .5, 1].map(f => `<line x1="${P.l}" x2="${W-P.r}" y1="${y(max*f)}" y2="${y(max*f)}" stroke="#EFE5D8"/><text x="${P.l-6}" y="${y(max*f)+4}" text-anchor="end" font-size="11" fill="#6E655B">${Math.round(max*f)}</text>`).join("");
  const labels = weeks.map((w,i) => `<text x="${x(i)}" y="${H-12}" text-anchor="middle" font-size="11" fill="#6E655B">${esc(w.label.replace(/^week\s*/i,"W"))}</text>`).join("");
  return `<div class="card pad trend"><h3>Week by week</h3><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Expired, due and missing-date counts by week">${grid}${line("exp","#C2412D")}${line("due","#A9875F")}${line("miss","#9b8f80")}${labels}</svg>
  <div class="legend" style="margin-top:6px"><span><span class="dot" style="background:#C2412D"></span> Expired</span><span><span class="dot" style="background:#A9875F"></span> Due ≤ 30 days</span><span><span class="dot" style="background:#9b8f80"></span> No date</span></div></div>`;
}
function dashboard(){
  const c = counts(S.emps);
  const kpi = (st, lbl, v, sub, col) => `<div class="card kpi" onclick="quick('${st}')"><div class="l"><span class="dot" style="background:${col}"></span>${lbl}</div><div class="v mono" style="color:${col === "var(--ink)" ? "var(--ink)" : col}">${v.toLocaleString()}</div><div class="s">${sub}</div></div>`;
  const next = S.emps.filter(e => ["exp","due"].includes(statusOf(e))).slice(0, 8);
  let groups = "";
  if (isAdmin()) groups = groupTable("By region", "Region", groupRows(e => branchOf(e.branch_id).region)) + groupTable("By area manager", "Area manager", groupRows(e => title(personName(branchOf(e.branch_id).am_id))));
  else if (isRom()) groups = groupTable("By area manager", "Area manager", groupRows(e => title(personName(branchOf(e.branch_id).am_id)))) + groupTable("By branch", "Branch", groupRows(e => branchOf(e.branch_id).name));
  else groups = groupTable("By branch", "Branch", groupRows(e => branchOf(e.branch_id).name));
  return header("Dashboard", `${scopeText()} · ${c.total.toLocaleString()} employees tracked`) + `
  <div class="kpis k5">
    ${kpi("", "Total", c.total, isAdmin() ? `${new Set(S.emps.map(e=>e.branch_id)).size} branches` : `${S.branches.length} branches`, "var(--ink)")}
    ${kpi("exp", "Expired", c.exp, "Renew now", "var(--red)")}
    ${kpi("due", "Due ≤ 30 days", c.due, "Book renewals", "var(--amber)")}
    ${kpi("miss", "Date missing", c.miss, "Check Baladiya system", "#6E655B")}
    ${kpi("ok", "OK", c.ok, "More than 30 days", "var(--teal-d)")}
  </div>
  <div class="grid2">${funnel()}${trend()}</div>
  ${groups}
  <div class="card section"><div class="pad" style="padding-bottom:6px"><h3>Needs action soonest</h3></div>
    ${next.length ? `<div class="tbl-wrap"><table><thead><tr><th>Employee</th><th class="hm">Branch</th><th>Expiry</th><th class="hm">Progress</th></tr></thead><tbody>
    ${next.map(e => `<tr onclick="editEmp('${e.id}')" style="cursor:pointer"><td><b>${esc(e.name)}</b><div class="sub mono">${esc(e.employee_id)}<span class="sm-only"> · ${esc(branchOf(e.branch_id).name)}</span></div></td><td class="hm">${esc(branchOf(e.branch_id).name)}</td><td class="mono">${dateCell(e)}</td><td class="hm">${progDots(e)}</td></tr>`).join("")}
    </tbody></table></div><div class="pager"><span>The 8 most overdue</span><button class="btn sm ghost" onclick="go('alerts')">See all alerts</button></div>` : `<div class="empty">Nothing expired or due in the next 30 days.</div>`}
  </div>`;
}
function quick(st){ S.filters = { q:"", region:"", am:"", branch:"", status:st, step:"" }; go("employees"); }

// ---------- employees ----------
function filtered(){
  const { q, region, am, branch, status, step } = S.filters; const ql = q.trim().toLowerCase();
  return S.emps.filter(e => { const b = branchOf(e.branch_id);
    return (!ql || e.name.toLowerCase().includes(ql) || e.employee_id.toLowerCase().includes(ql) || String(e.iqama).includes(ql) || String(e.mobile).includes(ql)) &&
      (!region || b.region === region) && (!am || b.am_id === am) && (!branch || e.branch_id === branch) &&
      (!status || statusOf(e) === status) && (!step || stepOf(e) === step); });
}
function filterBar(){
  const f = S.filters;
  const regions = [...new Set(S.branches.map(b => b.region))].sort();
  const ams = [...new Set(S.branches.map(b => b.am_id))].map(id => ({ id, name: personName(id) })).sort((a,b) => a.name < b.name ? -1 : 1);
  const brs = S.branches.filter(b => (!f.region || b.region === f.region) && (!f.am || b.am_id === f.am));
  const sel = (key, all, opts) => `<select onchange="S.filters.${key}=this.value;S.page=1;render()"><option value="">${all}</option>${opts.map(([v,l]) => `<option value="${esc(v)}" ${f[key]===v?"selected":""}>${esc(l)}</option>`).join("")}</select>`;
  return `<div class="filters">
    <input id="fq" type="search" placeholder="Search name, number, Iqama or mobile…" value="${esc(f.q)}" oninput="S.filters.q=this.value;S.page=1;render()">
    ${isAdmin() ? sel("region", "All regions", regions.map(r => [r, r])) : ""}
    ${(isAdmin() || isRom()) ? sel("am", "All area managers", ams.map(a => [a.id, title(a.name)])) : ""}
    ${sel("branch", "All branches", brs.map(b => [b.id, b.name]))}
    ${sel("status", "All statuses", Object.entries(STATUS_LABEL))}
    ${sel("step", "Any progress", Object.entries(STEP_LABEL))}
  </div>`;
}
function employees(){
  const list = filtered(); const per = 50; const pages = Math.max(1, Math.ceil(list.length / per));
  S.page = Math.min(S.page, pages); const slice = list.slice((S.page-1)*per, S.page*per);
  return header("Employees", `${scopeText()} · update progress and dates`, `<button class="btn ghost" onclick="exportCSV()">Export list</button><button class="btn" onclick="editEmp()">+ Add employee</button>`) + filterBar() + `
  <div class="card">${slice.length ? `<div class="tbl-wrap"><table><thead><tr><th>Employee</th><th class="hm">Branch</th><th class="hm">Nationality</th><th>Baladiya expiry</th><th class="hm">Status</th><th class="hm">Progress</th><th></th></tr></thead><tbody>
    ${slice.map(e => `<tr><td><b>${esc(e.name)}</b><div class="sub mono">${esc(e.employee_id)}<span class="sm-only"> · ${esc(branchOf(e.branch_id).name)}</span></div></td><td class="hm">${esc(branchOf(e.branch_id).name)}<div class="sub">${esc(title(personName(branchOf(e.branch_id).am_id)))}</div></td><td class="hm">${esc(e.nationality)}</td><td class="mono">${dateCell(e)}<div class="sm-only" style="margin-top:6px">${progDots(e)}</div></td><td class="hm">${pill(e)}</td><td class="hm">${progDots(e)}</td>
    <td style="white-space:nowrap;text-align:right">${contact(e)}<button class="icon-btn" title="Edit" aria-label="Edit" onclick="editEmp('${e.id}')" style="display:inline-block">${ICON.edit}</button><button class="icon-btn hm" title="Delete" aria-label="Delete" onclick="delEmp('${e.id}')" style="display:inline-block">${ICON.trash}</button></td></tr>`).join("")}
  </tbody></table></div>
  <div class="pager"><span>${list.length.toLocaleString()} employee${list.length===1?"":"s"} · page ${S.page} of ${pages}</span><span style="display:flex;gap:8px"><button class="btn sm ghost" ${S.page<=1?"disabled":""} onclick="S.page--;render()">Previous</button><button class="btn sm ghost" ${S.page>=pages?"disabled":""} onclick="S.page++;render()">Next</button></span></div>`
  : `<div class="empty">${S.emps.length ? "No employees match these filters." : "No employees yet. Use <a href='#import'>Import</a> to upload this week's file."}</div>`}</div>`;
}
function segHTML(name, value, opts){ return `<div class="seg" data-name="${name}">${opts.map(([v,l]) => `<button type="button" class="${value===v?"on":""} ${value===v && v!=="pending" && v!=="no"?"done":""}" onclick="pickSeg(this,'${v}')">${l}</button>`).join("")}</div><input type="hidden" name="${name}" value="${value}">`; }
function pickSeg(btn, v){ const seg = btn.parentElement; seg.querySelectorAll("button").forEach(b => b.classList.remove("on","done")); btn.classList.add("on"); if (v !== "pending" && v !== "no") btn.classList.add("done"); seg.nextElementSibling.value = v; }
function editEmp(id){
  const e = id ? S.emps.find(x => x.id === id) : { employee_id:"", name:"", iqama:"", nationality:"", mobile:"", branch_id: S.branches[0]?.id, expiry:"", expiry_note:"", medical:"pending", training:"pending", card_updated:false, remarks:"" };
  const brOpts = [...S.branches].sort((a,b) => (a.region+a.name) < (b.region+b.name) ? -1 : 1).map(b => `<option value="${b.id}" ${e.branch_id===b.id?"selected":""}>${esc(b.name)} · ${esc(b.region)}</option>`).join("");
  const natOpts = [...new Set([...NATIONALITIES, e.nationality].filter(Boolean))].map(n => `<option ${n===e.nationality?"selected":""}>${esc(n)}</option>`).join("");
  modal(`<h3>${id ? esc(e.name) : "Add employee"}</h3>${id ? `<p class="note" style="margin-top:-8px">${pill(e)} ${contact(e)}</p>` : ""}
    <form id="ef">
      <h4 style="margin:14px 0 4px">Renewal progress</h4>
      <div class="steprow"><span>1. Medical</span>${segHTML("medical", e.medical, [["pending","Pending"],["done","Done"]])}</div>
      <div class="steprow"><span>2. Baladiya training</span>${segHTML("training", e.training, [["pending","Pending"],["done","Done"],["not_required","Not required"]])}</div>
      <div class="steprow"><span>3. Card updated</span>${segHTML("card_updated", e.card_updated ? "yes" : "no", [["no","No"],["yes","Yes"]])}</div>
      <div class="row2"><div><label>Baladiya expiry date</label><input type="date" name="expiry" value="${esc(e.expiry || "")}"></div>
      <div><label>Remarks</label><input type="text" name="remarks" value="${esc(e.remarks)}" placeholder="e.g. medical booked for Sunday"></div></div>
      ${!e.expiry && e.expiry_note ? `<p class="note">File said: <b>${esc(e.expiry_note)}</b>. Enter the real date when you have it.</p>` : ""}
      <p class="note">When the card is renewed, set <b>Card updated: Yes</b> and enter the new expiry date.</p>
      <h4 style="margin:18px 0 4px">Employee details</h4>
      <div class="row2"><div><label>Employee number</label><input type="text" name="employee_id" required value="${esc(e.employee_id)}"></div>
      <div><label>Employee name</label><input type="text" name="name" required value="${esc(e.name)}"></div></div>
      <div class="row2"><div><label>Branch</label><select name="branch_id">${brOpts}</select></div>
      <div><label>Nationality</label><select name="nationality"><option value="">—</option>${natOpts}</select></div></div>
      <div class="row2"><div><label>Iqama number</label><input type="text" name="iqama" inputmode="numeric" value="${esc(e.iqama)}"></div>
      <div><label>Mobile</label><input type="text" name="mobile" inputmode="tel" value="${esc(e.mobile)}"></div></div>
      <div class="err" id="eerr"></div>
      <div class="actions"><button type="button" class="btn ghost" onclick="closeModal()">Cancel</button><button class="btn">${id ? "Save" : "Add employee"}</button></div>
    </form>`, true);
  $("#ef").onsubmit = async ev => {
    ev.preventDefault(); const fd = Object.fromEntries(new FormData(ev.target));
    const row = { employee_id: fd.employee_id.trim(), name: fd.name.trim(), iqama: fd.iqama.trim(), nationality: fd.nationality, mobile: fd.mobile.trim(),
      branch_id: fd.branch_id, expiry: fd.expiry || null, remarks: fd.remarks.trim(), medical: fd.medical, training: fd.training, card_updated: fd.card_updated === "yes" };
    if (row.card_updated && row.medical !== "done") row.medical = "done";
    if (row.card_updated && row.training === "pending") row.training = "done";
    if (row.expiry) row.expiry_note = "";
    const q = id ? sb.from("trackit_employees").update(row).eq("id", id) : sb.from("trackit_employees").insert(row);
    const { error } = await q;
    if (error) { $("#eerr").textContent = error.code === "23505" ? "That employee number is already in Trackit (maybe in another area)." : error.message; return; }
    closeModal(); toast(id ? "Saved" : "Employee added"); await loadAll(); render();
  };
}
function delEmp(id){
  const e = S.emps.find(x => x.id === id);
  modal(`<h3>Delete ${esc(e.name)}?</h3><p class="note">This removes employee ${esc(e.employee_id)} from Trackit. It can't be undone.</p>
  <div class="actions"><button class="btn ghost" onclick="closeModal()">Cancel</button><button class="btn danger" id="dbtn">Delete</button></div>`);
  $("#dbtn").onclick = async () => { const { error } = await sb.from("trackit_employees").delete().eq("id", id); if (error) return toast(error.message); closeModal(); toast("Deleted"); await loadAll(); render(); };
}
const TEMPLATE_HEAD = ["Employee Number","Employee Name","Branch","Iqama Number","Nationality","Mobile Number","Expiry Date","Medical","Training","Card Updated","Remarks"];
const empRow = e => [e.employee_id, e.name, branchOf(e.branch_id).name, e.iqama, e.nationality, e.mobile, e.expiry || e.expiry_note, e.medical === "done" ? "Done" : "Pending", { done:"Done", not_required:"Not required", pending:"Pending" }[e.training], e.card_updated ? "Yes" : "No", e.remarks];
function exportCSV(){
  const list = filtered();
  const head = [...TEMPLATE_HEAD, "Status", "Region", "Area Manager", "ROM"];
  downloadCSV(`trackit-export-${new Date().toISOString().slice(0,10)}.csv`, [head, ...list.map(e => { const b = branchOf(e.branch_id); return [...empRow(e), STATUS_LABEL[statusOf(e)], b.region, title(personName(b.am_id)), title(personName(b.rom_id))]; })]);
}
function downloadCSV(name, rows){
  const csv = "﻿" + rows.map(r => r.map(v => { v = String(v ?? ""); return /[",\n]/.test(v) ? `"${v.replace(/"/g,'""')}"` : v; }).join(",")).join("\r\n");
  const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([csv], { type:"text/csv;charset=utf-8" })); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

// ---------- import: reading files ----------
const normBranch = s => String(s||"").toUpperCase().replace(/\(S\)/g,"").replace(/[-_.,/()]/g," ").replace(/\bHM\b/g," ").replace(/\s+/g," ").trim();
const normHead = h => String(h||"").toLowerCase().replace(/\s+/g," ").trim();
const HEAD = {
  employee_id: ["employee number","employee no","emp no","employee id","emp id","employee #","staff id"],
  name: ["employee name","name","full name"],
  branch: ["branch","store","branch name"],
  iqama: ["iqama number","iqama","iqama no","iqama id","id number"],
  nationality: ["nationality"],
  expiry: ["expire date","expiry date","expired date","expiration date","baladiya expiry date","baladiya expiry","expiry","expire"],
  mobile: ["mobile number","phone number","mobile","phone","mobile no","contact"],
  remarks: ["am- remarks","am remarks","am-remarks","remarks","remark","reamrk","notes","comments"],
  medical: ["finished medical","medical"],
  training: ["finished baladyah training","finished baladiya training","training","baladiya training","baladyah training"],
  card: ["card updated yes-no","card updated","card updated yes no"],
};
function colIndex(head){ const idx = {}; for (const [k, names] of Object.entries(HEAD)) idx[k] = head.findIndex(h => names.some(n => h === n || h.startsWith(n))); return idx; }
const MONTH_IX = { jan:1, feb:2, mar:3, apr:4, may:5, jun:6, jul:7, aug:8, sep:9, sept:9, oct:10, nov:11, dec:12 };
function validYMD(y, m, d){ const dt = new Date(Date.UTC(y, m-1, d)); return dt.getUTCFullYear() === y && dt.getUTCMonth() === m-1 && dt.getUTCDate() === d; }
const ymd = (y, m, d) => `${y}-${String(m).padStart(2,"0")}-${String(d).padStart(2,"0")}`;
function readDate(v){
  // returns { date: "YYYY-MM-DD" | "", note: original text when no date, unclear: true when a human should check }
  if (v === null || v === undefined || String(v).trim() === "") return { date:"", note:"Blank in file", unclear:false };
  if (v instanceof Date && !isNaN(v)) return check(v.getFullYear(), v.getMonth()+1, v.getDate(), String(v));
  if (typeof v === "number") { const d = XLSX.SSF.parse_date_code(v); return d ? check(d.y, d.m, d.d, String(v)) : { date:"", note:String(v), unclear:true }; }
  const s = String(v).trim(), u = s.toUpperCase();
  if (/^0+[-/ ]+(JAN|0+)[-/ ]+0+$/i.test(s)) return { date:"", note:s, unclear:false };
  if (/^(NOT\s*FOUND|N\/?A|NA|NOT\s*UPDATED|NONE|NIL|-+|PENDING|TBA|TBC)$/.test(u)) return { date:"", note:s, unclear:false };
  let m;
  if ((m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/))) return check(+m[1], +m[2], +m[3], s);
  if ((m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})$/))) return check(fixYear(+m[3]), +m[2], +m[1], s);
  if ((m = s.match(/^([A-Za-z]{3,9})[\s\-.]*(\d{1,2})(?:st|nd|rd|th)?[\s,\-.]*(\d{2,4})$/))) { const mo = MONTH_IX[m[1].toLowerCase().slice(0, m[1].toLowerCase().startsWith("sept") ? 4 : 3)]; if (mo) return check(fixYear(+m[3]), mo, +m[2], s); }
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
const YES = v => /^(Y|YES|DONE|TRUE|1|FINISHED|COMPLETED)$/i.test(String(v||"").trim());
function stepsFromRow(r, idx, remarks){
  // returns progress fields only when the file says something about them
  const out = {}; const has = k => idx[k] >= 0 && String(r[idx[k]] ?? "").trim() !== "";
  if (has("medical")) out.medical = YES(r[idx.medical]) ? "done" : "pending";
  if (has("training")) { const t = String(r[idx.training]).trim(); out.training = /not\s*req/i.test(t) ? "not_required" : YES(t) ? "done" : "pending"; }
  if (has("card")) out.card_updated = YES(r[idx.card]) ? "true" : "false";
  const R = String(remarks||"").toUpperCase();
  if (!("medical" in out) && /MEDICAL\s*(IS\s*)?(DONE|COMPLETED?|FINISHED|OK)|(DONE|FINISHED|COMPLETED?)\s*(THE\s*)?MEDICAL/.test(R)) out.medical = "done";
  if (!("training" in out) && /(CLASS|TRAINING|EXAM|COURSE)\s*(IS\s*)?(DONE|COMPLETED?|FINISHED|PASSED)|(PASSED|DONE|FINISHED)\s*(THE\s*)?(EXAM|CLASS|TRAINING|COURSE)/.test(R)) out.training = "done";
  if (!("card_updated" in out) && !/NOT\s*(BEEN\s*)?UPDATED|DATA NOT UP/.test(R) && /(CARD|BALADIYA|BALADYAH|BALADIYAH)\s*(IS\s*)?(UPDATED|ISSUED|RENEWED|PRINTED|RECEIVED)|UPDATED IN (THE )?SYSTEM|ALREADY UPDATED/.test(R)) out.card_updated = "true";
  if (out.card_updated === "true") { out.medical ??= "done"; if (!out.training) out.training = "done"; }
  if (out.training === "done") out.medical ??= "done";
  return out;
}
function similarity(a, b){
  if (!a || !b) return 0;
  const A = new Set(a.split(" ")), B = new Set(b.split(" "));
  const inter = [...A].filter(x => B.has(x) || [...B].some(y => (x.length > 3 && y.startsWith(x.slice(0,4))) )).length;
  const jac = inter / (A.size + B.size - inter);
  const bg = s => { const g = new Set(); const t = s.replace(/ /g,""); for (let i=0;i<t.length-1;i++) g.add(t.slice(i,i+2)); return g; };
  const ga = bg(a), gb = bg(b); const gi = [...ga].filter(x => gb.has(x)).length; const dice = 2*gi/(ga.size+gb.size || 1);
  return Math.max(jac, dice);
}
function suggestBranch(raw){
  const n = normBranch(raw); let best = null, score = 0;
  for (const b of S.branches) { const s = Math.max(similarity(n, normBranch(b.name)), ...S.aliases.filter(a => a.branch_id === b.id).map(a => similarity(n, a.alias))); if (s > score) { score = s; best = b; } }
  return score >= 0.45 ? best : null;
}
async function readWorkbook(file){
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type:"array", cellDates:true });
  const rows = []; const sheets = [];
  for (const name of wb.SheetNames) {
    const aoa = XLSX.utils.sheet_to_json(wb.Sheets[name], { header:1, defval:"", raw:true });
    let h = -1; for (let i = 0; i < Math.min(aoa.length, 8); i++) { const t = aoa[i].map(normHead).join("|"); if (/employee/.test(t) && /branch|store/.test(t)) { h = i; break; } }
    if (h < 0) { sheets.push({ name, rows:0, skipped:true }); continue; }
    const head = aoa[h].map(normHead); const idx = colIndex(head);
    if (idx.employee_id < 0 || idx.name < 0 || idx.branch < 0) { sheets.push({ name, rows:0, skipped:true }); continue; }
    let n = 0;
    aoa.slice(h + 1).forEach((r, i) => {
      if (r.every(c => String(c).trim() === "")) return;
      const get = k => idx[k] >= 0 ? r[idx[k]] : "";
      const eid = String(get("employee_id")).trim().replace(/\.0$/, ""); const nm = String(get("name")).trim();
      if (!eid && !nm) return;
      const d = readDate(get("expiry")); const remarks = String(get("remarks") ?? "").replace(/\s+/g," ").trim();
      rows.push({ where: `${name.trim()} row ${h + i + 2}`, employee_id: eid, name: nm.replace(/\s+/g," "), branchRaw: String(get("branch")).trim(),
        iqama: String(get("iqama")).trim().replace(/\.0$/, ""), nationality: normNationality(get("nationality")), mobile: String(get("mobile")).replace(/\D/g,""),
        expiry: d.date, expiry_note: d.note, unclear: d.unclear, remarks, ...stepsFromRow(r, idx, remarks) });
      n++;
    });
    sheets.push({ name, rows:n });
  }
  return { rows, sheets };
}
function analyse(rows){
  // branch resolution
  const aliasMap = new Map(S.aliases.map(a => [a.alias, a]));
  const branchNames = {}; // raw -> {norm, status: ok|confirm|unknown, branch_id, count}
  for (const r of rows) {
    const n = normBranch(r.branchRaw); const key = r.branchRaw || "(blank)";
    if (!branchNames[key]) {
      const a = aliasMap.get(n); const myIds = new Set(S.branches.map(b => b.id));
      if (a && a.confirmed) branchNames[key] = { norm:n, status: myIds.has(a.branch_id) ? "ok" : "outside", branch_id:a.branch_id, count:0 };
      else if (a) branchNames[key] = { norm:n, status:"confirm", branch_id:a.branch_id, count:0 };
      else { const s = suggestBranch(r.branchRaw); branchNames[key] = { norm:n, status:"unknown", branch_id: s?.id || "", count:0 }; }
    }
    branchNames[key].count++;
  }
  // duplicates
  const byId = {}; rows.forEach((r, i) => { (byId[r.employee_id] ??= []).push(i); });
  const exactDup = [], conflicts = [];
  for (const [id, ix] of Object.entries(byId)) {
    if (!id || ix.length < 2) continue;
    const sig = i => [rows[i].branchRaw.toUpperCase(), rows[i].expiry || rows[i].expiry_note, rows[i].name.toUpperCase()].join("|");
    if (new Set(ix.map(sig)).size === 1) exactDup.push(id); else conflicts.push({ id, rows: ix.map(i => rows[i]) });
  }
  return { branchNames, exactDup, conflicts };
}

// ---------- import: screen ----------
function importView(){
  if (S.imp) return importPreview();
  return header("Import", "Upload the weekly Baladiya workbook — every sheet is read") + `
  <div class="steps">
    <div class="card pad"><div class="step-n">1</div><h3>Use your usual weekly file</h3>
      <p class="note">Trackit reads <b>every sheet</b> in the workbook (one per region is fine) and finds the columns by their headings: Employee Number, Employee Name, Branch, Iqama Number, Nationality, Expire date, Mobile Number, AM Remarks. Optional: Medical, Training, Card Updated.</p>
      <p class="note">Dates can be written any common way (13/04/2026, APRIL 13,2026, 29-12-26…). "NOT FOUND" or "N/A" are kept as <b>Date missing</b>.</p>
      <div style="display:flex;gap:10px;flex-wrap:wrap"><button class="btn tan" onclick="downloadCSV('trackit-template.csv',[TEMPLATE_HEAD])">Download clean template</button>
      ${S.emps.length ? `<button class="btn ghost" onclick="downloadCSV('trackit-current-list.csv',[TEMPLATE_HEAD,...S.emps.map(empRow)])">Download current list</button>` : ""}</div>
    </div>
    <div class="card pad"><div class="step-n">2</div><h3>Upload</h3>
      <p class="note">You'll see a check before anything is saved: branch names to confirm, duplicates and unclear dates. Rows are matched by <b>Employee Number</b> — new people are added, changes updated, the rest left as they are.</p>
      <label class="drop" id="drop"><input type="file" id="file" accept=".xlsx,.xls,.csv" class="hidden"><b>Choose the workbook</b><div class="note">or drag it here</div></label>
      <div id="impOut"></div>
    </div>
  </div>`;
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
    if (!rows.length) throw new Error("No employee rows found. The sheet needs headings like Employee Number, Employee Name and Branch.");
    const wk = (file.name.match(/week[\s_\-]*(\d{1,2})/i) || [])[1];
    S.imp = { file: file.name, rows, sheets, ...analyse(rows), week: wk ? `Week ${wk} ${new Date().getFullYear()}` : `Week of ${new Date().toISOString().slice(0,10)}`, result: null };
    render();
  } catch (e) { $("#impOut").innerHTML = `<div class="errlist" style="margin-top:14px">${esc(e.message || e)}</div>`; $("#file").value = ""; }
}
function importPreview(){
  const I = S.imp;
  if (I.result) return importResult();
  const bn = Object.entries(I.branchNames);
  const need = bn.filter(([,v]) => v.status === "confirm" || v.status === "unknown");
  const outside = bn.filter(([,v]) => v.status === "outside");
  const ok = bn.filter(([,v]) => v.status === "ok");
  const missing = I.rows.filter(r => !r.expiry && !r.unclear).length, unclear = I.rows.filter(r => r.unclear);
  const stepsFound = I.rows.filter(r => r.medical || r.training || r.card_updated).length;
  const brOpts = sel => `<option value="">— skip these rows —</option>${isAdmin() ? `<option value="__new__">+ Add as a new branch…</option>` : ""}` + [...S.branches].sort((a,b) => (a.region+a.name) < (b.region+b.name) ? -1 : 1).map(b => `<option value="${b.id}" ${sel===b.id?"selected":""}>${esc(b.name)} · ${esc(b.region)}</option>`).join("");
  return header("Check before saving", `${esc(I.file)} · ${I.rows.length} rows from ${I.sheets.filter(s=>!s.skipped).length} sheets`, `<button class="btn ghost" onclick="S.imp=null;render()">Cancel</button>`) + `
  <div class="card pad"><h3>Sheets</h3><p class="note">${I.sheets.map(s => `${esc(s.name.trim())}: ${s.skipped ? "skipped (no employee table)" : `<b>${s.rows}</b> rows`}`).join(" · ")}</p></div>
  <div class="card pad section"><h3>1. Branch names ${need.length ? `<span class="pill p-due">${need.length} to confirm</span>` : `<span class="pill p-ok">all recognised</span>`}</h3>
    <p class="note">${ok.length} spellings already known. ${need.length ? (isAdmin() ? "Check each suggestion below and change it if wrong. Trackit remembers your choice for next week." : "These spellings haven't been confirmed yet. Ask the admin to upload once, or choose the right branch for this upload.") : ""}</p>
    ${need.length ? `<div class="tbl-wrap"><table class="matchtbl"><thead><tr><th>In the file</th><th>Rows</th><th>Trackit branch</th></tr></thead><tbody>
      ${need.map(([raw, v], i) => `<tr><td><b>${esc(raw)}</b>${v.status === "unknown" ? `<div class="sub">${v.branch_id ? "suggested" : "no close match"}</div>` : `<div class="sub">suggested</div>`}</td><td class="mono">${v.count}</td><td><select data-raw="${esc(raw)}" onchange="pickMatch(this)">${brOpts(v.branch_id)}</select></td></tr>`).join("")}
    </tbody></table></div>` : ""}
    ${outside.length ? `<div class="warnbox" style="margin-top:10px">${outside.reduce((a,[,v]) => a + v.count, 0)} rows are for branches outside your area and will be skipped: ${outside.map(([r]) => esc(r)).join(", ")}</div>` : ""}
  </div>
  <div class="card pad section"><h3>2. Duplicates</h3>
    ${!I.exactDup.length && !I.conflicts.length ? `<div class="okbox">No duplicate employee numbers.</div>` : ""}
    ${I.exactDup.length ? `<p class="note">${I.exactDup.length} employee numbers appear twice with identical details — merged automatically.</p>` : ""}
    ${I.conflicts.length ? `<div class="warnbox">${I.conflicts.length} employee numbers appear more than once with <b>different</b> details. The <b>last row</b> in the file will be used. Check these:</div>
      <div class="tbl-wrap section"><table><thead><tr><th>Number</th><th>Rows in file</th></tr></thead><tbody>${I.conflicts.map(c => `<tr><td class="mono">${esc(c.id)}</td><td>${c.rows.map(r => `${esc(r.where)}: ${esc(r.branchRaw)} · ${esc(r.expiry || r.expiry_note)}`).join("<br>")}</td></tr>`).join("")}</tbody></table></div>` : ""}
  </div>
  <div class="card pad section"><h3>3. Dates</h3>
    <p class="note"><b>${I.rows.filter(r => r.expiry).length}</b> rows have a usable date. <b>${missing}</b> say no date (e.g. NOT FOUND, N/A, blank) and will show as <b>Date missing</b>.</p>
    ${unclear.length ? `<div class="warnbox">${unclear.length} dates couldn't be read safely and will be saved as <b>Date missing</b> with the original text, so the area manager can fix them:</div>
      <div class="tbl-wrap section"><table><thead><tr><th>Where</th><th>Employee</th><th>File says</th></tr></thead><tbody>${unclear.map(r => `<tr><td>${esc(r.where)}</td><td>${esc(r.name)}</td><td>${esc(r.expiry_note)}</td></tr>`).join("")}</tbody></table></div>` : ""}
    ${stepsFound ? `<p class="note">Progress found for <b>${stepsFound}</b> rows (from the Medical / Training / Card columns or remarks like "medical done", "class done").</p>` : ""}
  </div>
  <div class="card pad section"><h3>4. Save</h3>
    ${isAdmin() ? `<label>Save this upload as week</label><input type="text" id="weekLabel" value="${esc(I.week)}" style="max-width:320px">
    <p class="note">The week's numbers are kept for the week-by-week trend.</p>` : ""}
    <div class="actions" style="justify-content:flex-start"><button class="btn" id="impBtn" onclick="runImport()">Save ${I.rows.length - I.exactDup.length} employees</button></div>
    <div id="impProg"></div>
  </div>`;
}
function pickMatch(sel){
  const raw = sel.dataset.raw;
  if (sel.value !== "__new__") { S.imp.branchNames[raw].branch_id = sel.value; return; }
  sel.value = S.imp.branchNames[raw].branch_id || "";
  editBranch(null, raw, id => { S.imp.branchNames[raw].branch_id = id; render(); });
}
async function runImport(){
  const I = S.imp; $("#impBtn").disabled = true;
  try {
    // 1. remember confirmed branch spellings (admin)
    if (isAdmin()) {
      const ups = Object.entries(I.branchNames).filter(([,v]) => (v.status === "confirm" || v.status === "unknown") && v.branch_id).map(([,v]) => ({ alias: v.norm, branch_id: v.branch_id, confirmed: true }));
      if (ups.length) { const { error } = await sb.from("trackit_branch_aliases").upsert(ups, { onConflict: "alias" }); if (error) throw error; }
    }
    // 2. rows: last occurrence wins
    const last = new Map(); I.rows.forEach(r => last.set(r.employee_id || r.where, r));
    const skippedBranch = [];
    const rows = [...last.values()].map(r => {
      const v = I.branchNames[r.branchRaw || "(blank)"];
      if (!v || !v.branch_id || v.status === "outside") { skippedBranch.push(r); return null; }
      return { row: r.where, employee_id: r.employee_id, name: r.name, branch_id: v.branch_id, iqama: r.iqama, nationality: r.nationality, mobile: r.mobile,
        expiry: r.expiry, expiry_note: r.expiry_note, remarks: r.remarks, medical: r.medical || "", training: r.training || "", card_updated: r.card_updated || "" };
    }).filter(Boolean);
    const tot = { added:0, updated:0, skipped:0, errors: skippedBranch.map(r => ({ row: r.where, msg: `Branch "${r.branchRaw}" not matched — row skipped` })) };
    for (let i = 0; i < rows.length; i += 500) {
      $("#impProg").innerHTML = `<p class="note">Saving ${Math.min(i + 500, rows.length)} of ${rows.length}…</p>`;
      const { data, error } = await sb.rpc("trackit_import_v2", { rows: rows.slice(i, i + 500) });
      if (error) throw error;
      tot.added += data.added; tot.updated += data.updated; tot.skipped += data.skipped; tot.errors.push(...data.errors);
    }
    // 3. weekly snapshot (admin)
    if (isAdmin()) { const label = ($("#weekLabel")?.value || I.week).trim(); const { error } = await sb.rpc("trackit_snapshot_week", { p_label: label }); if (error) tot.errors.push({ row:"—", msg:"Week not saved: " + error.message }); else tot.week = label; }
    I.result = tot; await loadAll(); render(); toast("Import finished");
  } catch (e) { $("#impProg").innerHTML = `<div class="errlist">${esc(e.message || e)}</div>`; $("#impBtn").disabled = false; }
}
function importResult(){
  const t = S.imp.result;
  return header("Import finished", `${esc(S.imp.file)}${t.week ? ` · saved as ${esc(t.week)}` : ""}`, `<button class="btn" onclick="S.imp=null;go('dashboard')">Go to dashboard</button>`) + `
  <div class="card pad"><div class="summary"><div><b style="color:var(--teal-d)">${t.added}</b>added</div><div><b style="color:var(--tan-d)">${t.updated}</b>updated</div><div><b>${t.skipped}</b>unchanged</div><div><b style="color:${t.errors.length?"var(--red)":"var(--muted)"}">${t.errors.length}</b>problems</div></div>
  ${t.errors.length ? `<div class="errlist">${t.errors.slice(0,300).map(e => `<div>${esc(e.row)}: ${esc(e.msg)}</div>`).join("")}</div>` : `<div class="okbox">Everything saved. Dashboards update for everyone automatically.</div>`}
  <div class="actions" style="justify-content:flex-start"><button class="btn ghost" onclick="S.imp=null;render()">Upload another file</button></div></div>`;
}

// ---------- alerts ----------
function alerts(){
  const by = s => S.emps.filter(e => statusOf(e) === s);
  const lists = { exp: by("exp"), due: by("due"), miss: by("miss") };
  const list = lists[S.alertTab];
  return header("Alerts", `${scopeText()} · who needs a Baladiya renewal`) + `
  <div class="tabs">${[["exp","Expired"],["due","Due ≤ 30 days"],["miss","Date missing"]].map(([k,l]) => `<button class="${S.alertTab===k?"on":""}" onclick="S.alertTab='${k}';render()">${l} (${lists[k].length})</button>`).join("")}</div>
  ${S.alertTab === "miss" ? `<p class="note" style="margin-top:-4px">No usable expiry date in the file. Check the Baladiya system and enter the date.</p>` : ""}
  <div class="card">${list.length ? `<div class="tbl-wrap"><table><thead><tr><th>Employee</th><th class="hm">Branch</th><th>Expiry</th><th class="hm">Progress</th><th class="hm">Remarks</th><th></th></tr></thead><tbody>
  ${list.map(e => `<tr><td><b>${esc(e.name)}</b><div class="sub mono">${esc(e.employee_id)}<span class="sm-only"> · ${esc(branchOf(e.branch_id).name)}</span></div></td><td class="hm">${esc(branchOf(e.branch_id).name)}<div class="sub">${esc(title(personName(branchOf(e.branch_id).am_id)))}</div></td><td class="mono">${dateCell(e)}<div class="sm-only" style="margin-top:6px">${progDots(e)}</div></td><td class="hm">${progDots(e)}</td><td class="hm" style="max-width:260px"><span class="sub">${esc(e.remarks)}</span></td><td style="text-align:right;white-space:nowrap">${contact(e)}<button class="btn sm ghost" onclick="editEmp('${e.id}')">Update</button></td></tr>`).join("")}
  </tbody></table></div>` : `<div class="empty">Nobody in this list.</div>`}</div>`;
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
  <div class="chips" id="chips">${["Who is expired and hasn't started medical?","Which branch has the most expired cards?","Who expires this week?","Make a renewal plan for this week"].map(q => `<button onclick="ask(this.textContent)">${q}</button>`).join("")}</div>
  <form class="composer" onsubmit="event.preventDefault();ask($('#cq').value)"><input id="cq" type="text" placeholder="Ask about your employees…" autocomplete="off"><button class="btn">Send</button></form></div>
  <p class="note" style="margin-top:10px">The assistant sees names, branches, dates and progress — never Iqama or mobile numbers. Free AI has a daily limit.</p>`;
}
function afterChat(){
  const box = $("#msgs"); if (!box) return;
  box.innerHTML = S.chat.length ? S.chat.map(m => `<div class="msg ${m.role==="user"?"u":"a"}">${m.role==="user" ? esc(m.content) : md(m.content)}</div>`).join("")
    : `<div class="empty">Hi ${esc(title((S.me.full_name||"").split(" ")[0]))}! Ask who needs a Baladiya renewal, which branches are behind, or for a plan.</div>`;
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

// ---------- people & logins (admin) ----------
async function adminCall(body){
  const { data, error } = await sb.functions.invoke("trackit-admin-users", { body });
  if (data?.ok) return null;
  let msg = data?.error; if (!msg && error?.context?.json) { try { msg = (await error.context.json()).error; } catch {} }
  return msg || error?.message || "Something went wrong";
}
function peopleView(){
  const rows = S.people.map(p => { const am = S.branches.filter(b => b.am_id === p.id), rom = S.branches.filter(b => b.rom_id === p.id); const login = S.profiles.find(x => x.person_id === p.id);
    const emps = S.emps.filter(e => am.some(b => b.id === e.branch_id) || rom.some(b => b.id === e.branch_id)); const iss = emps.filter(needsAction).length;
    return { p, am, rom, login, emps: emps.length, iss }; }).sort((a,b) => b.rom.length - a.rom.length || (a.p.name < b.p.name ? -1 : 1));
  const loose = S.profiles.filter(x => x.role !== "admin" && !x.person_id);
  return header("People & logins", "Area managers and ROMs come from your branch mapping. Create a login for each.") + `
  <div class="card"><div class="tbl-wrap"><table><thead><tr><th>Name</th><th>Role</th><th class="hm">Branches</th><th>Needs action</th><th>Login</th><th></th></tr></thead><tbody>
  ${rows.map(r => `<tr><td><b>${esc(title(r.p.name))}</b></td><td>${r.rom.length ? `ROM <span class="sub">(${r.rom.length} branches)</span>${r.am.length ? " + AM" : ""}` : "Area Manager"}</td><td class="hm">${r.am.length}</td><td class="mono" style="color:${r.iss?"var(--red)":"var(--muted)"}">${r.iss}</td>
    <td>${r.login ? `<span class="sub">${esc(r.login.email)}</span>` : `<span class="pill p-miss">No login</span>`}</td>
    <td style="text-align:right;white-space:nowrap">${r.login ? `<button class="btn sm ghost" onclick="resetPw('${r.login.id}')">${ICON.key}<span class="hm">Reset password</span></button><button class="icon-btn" title="Remove login" aria-label="Remove login" onclick="delLogin('${r.login.id}')" style="display:inline-block">${ICON.trash}</button>` : `<button class="btn sm" onclick="addLogin('${r.p.id}')">Create login</button>`}</td></tr>`).join("")}
  </tbody></table></div></div>
  <div class="card pad section"><h3>Admins</h3>${S.profiles.filter(x => x.role === "admin").map(x => `<div class="steprow"><span><b>${esc(x.full_name || x.email)}</b> <span class="sub">${esc(x.email)}</span></span>${x.id !== S.me.id ? `<button class="icon-btn" onclick="delLogin('${x.id}')">${ICON.trash}</button>` : `<span class="sub">you</span>`}</div>`).join("")}
    <div class="actions" style="justify-content:flex-start"><button class="btn ghost sm" onclick="addLogin('')">+ Add another admin</button></div></div>
  ${loose.length ? `<div class="card pad section"><h3>Old logins not linked to anyone</h3><p class="note">These can't see anything. Remove them.</p>${loose.map(x => `<div class="steprow"><span>${esc(x.full_name || "")} <span class="sub">${esc(x.email)}</span></span><button class="btn sm ghost" onclick="delLogin('${x.id}')">Remove</button></div>`).join("")}</div>` : ""}`;
}
function addLogin(personId){
  const p = S.people.find(x => x.id === personId); const isRomP = p && S.branches.some(b => b.rom_id === p.id);
  modal(`<h3>${p ? `Login for ${esc(title(p.name))}` : "Add an admin"}</h3>
  ${p ? `<p class="note">${isRomP ? "ROM — will see every branch under their area managers." : `Area Manager — will see their ${S.branches.filter(b => b.am_id === p.id).length} branches.`}</p>` : `<p class="note">Admins see and manage everything.</p>`}
  <form id="lf">${p ? "" : `<label>Full name</label><input type="text" name="full_name" required>`}
    <label>Email</label><input type="email" name="email" required>
    <label>Starting password (min 8 characters)</label><input type="text" name="password" required minlength="8" autocomplete="off">
    <div class="err" id="lerr2"></div>
    <div class="actions"><button type="button" class="btn ghost" onclick="closeModal()">Cancel</button><button class="btn" id="lbtn2">Create login</button></div></form>`);
  $("#lf").onsubmit = async ev => { ev.preventDefault(); $("#lbtn2").disabled = true;
    const fd = Object.fromEntries(new FormData(ev.target));
    const err = await adminCall({ action:"create", role: p ? "manager" : "admin", person_id: p?.id, ...fd });
    $("#lbtn2").disabled = false; if (err) return $("#lerr2").textContent = err;
    closeModal(); toast("Login created — share the password privately"); await loadAll(); render(); };
}
function resetPw(id){
  const m = S.profiles.find(x => x.id === id);
  modal(`<h3>Reset password</h3><p class="note">For ${esc(m.full_name || m.email)}</p><form id="rf"><label>New password (min 8 characters)</label><input type="text" name="password" required minlength="8" autocomplete="off">
  <div class="err" id="rerr"></div><div class="actions"><button type="button" class="btn ghost" onclick="closeModal()">Cancel</button><button class="btn">Save password</button></div></form>`);
  $("#rf").onsubmit = async ev => { ev.preventDefault(); const err = await adminCall({ action:"reset_password", id, password: new FormData(ev.target).get("password") }); if (err) return $("#rerr").textContent = err; closeModal(); toast("Password updated"); };
}
function delLogin(id){
  const m = S.profiles.find(x => x.id === id);
  modal(`<h3>Remove login?</h3><p class="note">${esc(m.email)} won't be able to sign in. Their branches and employees stay in Trackit.</p><div class="err" id="derr"></div>
  <div class="actions"><button class="btn ghost" onclick="closeModal()">Cancel</button><button class="btn danger" id="dm">Remove</button></div>`);
  $("#dm").onclick = async () => { const err = await adminCall({ action:"delete", id }); if (err) return $("#derr").textContent = err; closeModal(); toast("Removed"); await loadAll(); render(); };
}

// ---------- branches (admin) ----------
function branchesView(){
  const q = (S.bq || "").toLowerCase();
  const list = S.branches.filter(b => !q || (b.name + " " + b.region + " " + personName(b.am_id) + " " + personName(b.rom_id)).toLowerCase().includes(q))
    .sort((a,b) => (a.region + a.name) < (b.region + b.name) ? -1 : 1);
  return header("Branches", `${S.branches.length} branches from your mapping. Change an area manager here and their employees move with the branch.`, `<button class="btn" onclick="editBranch()">+ Add branch</button>`) + `
  <div class="filters"><input id="bq" type="search" placeholder="Search branch, region or person…" value="${esc(S.bq || "")}" oninput="S.bq=this.value;render()"></div>
  <div class="card"><div class="tbl-wrap"><table><thead><tr><th>Branch</th><th class="hm">Region</th><th>Area manager</th><th class="hm">ROM</th><th class="hm">Spellings</th><th>Staff</th><th></th></tr></thead><tbody>
  ${list.map(b => `<tr><td><b>${esc(b.name)}</b><div class="sub">${esc(b.code || "")} ${esc(b.city)}</div></td><td class="hm">${esc(b.region)}</td><td>${esc(title(personName(b.am_id)))}</td><td class="hm">${esc(title(personName(b.rom_id)))}</td><td class="hm mono">${S.aliases.filter(a => a.branch_id === b.id && a.confirmed).length}</td><td class="mono">${S.emps.filter(e => e.branch_id === b.id).length}</td>
  <td style="text-align:right"><button class="icon-btn" title="Edit" aria-label="Edit" onclick="editBranch('${b.id}')">${ICON.edit}</button></td></tr>`).join("")}
  </tbody></table></div></div>`;
}
function editBranch(id, newName, onSaved){
  const b = id ? S.branches.find(x => x.id === id) : { name: newName ? String(newName).toUpperCase().replace(/\s+/g," ").trim() : "", code:"", region:"", city:"", am_id:"", rom_id:"" };
  const ppl = sel => `<option value="">—</option>` + S.people.map(p => `<option value="${p.id}" ${sel===p.id?"selected":""}>${esc(title(p.name))}</option>`).join("");
  const spellings = id ? S.aliases.filter(a => a.branch_id === id) : [];
  modal(`<h3>${id ? esc(b.name) : "Add branch"}</h3><form id="bf">
    <div class="row2"><div><label>Branch name</label><input type="text" name="name" required value="${esc(b.name)}"></div><div><label>Code</label><input type="text" name="code" value="${esc(b.code || "")}"></div></div>
    <div class="row2"><div><label>Region</label><input type="text" name="region" list="regList" value="${esc(b.region)}"></div><div><label>City</label><input type="text" name="city" value="${esc(b.city)}"></div></div>
    <datalist id="regList">${[...new Set(S.branches.map(x => x.region))].map(r => `<option value="${esc(r)}">`).join("")}</datalist>
    <div class="row2"><div><label>Area manager</label><select name="am_id">${ppl(b.am_id)}</select></div><div><label>ROM</label><select name="rom_id">${ppl(b.rom_id)}</select></div></div>
    <label>New person (if not in the list)</label><input type="text" name="newperson" placeholder="Full name — becomes the area manager">
    ${spellings.length ? `<p class="note">Spellings Trackit recognises for this branch: ${spellings.map(a => esc(a.alias)).join(", ")}</p>` : ""}
    <div class="err" id="berr"></div><div class="actions"><button type="button" class="btn ghost" onclick="closeModal()">Cancel</button><button class="btn">Save</button></div></form>`);
  $("#bf").onsubmit = async ev => { ev.preventDefault(); const fd = Object.fromEntries(new FormData(ev.target));
    let am = fd.am_id || null;
    if (fd.newperson.trim()) { const { data, error } = await sb.from("trackit_people").upsert({ name: fd.newperson.trim().toUpperCase() }, { onConflict:"name" }).select().single(); if (error) return $("#berr").textContent = error.message; am = data.id; }
    const row = { name: fd.name.trim(), code: fd.code.trim() || null, region: fd.region.trim(), city: fd.city.trim(), am_id: am, rom_id: fd.rom_id || null };
    const q = id ? sb.from("trackit_branches").update(row).eq("id", id).select().single() : sb.from("trackit_branches").insert(row).select().single();
    const { data, error } = await q; if (error) return $("#berr").textContent = error.message;
    await sb.from("trackit_branch_aliases").upsert({ alias: normBranch(row.name), branch_id: data.id, confirmed: true }, { onConflict:"alias" });
    closeModal(); toast("Branch saved"); await loadAll(); if (onSaved) onSaved(data.id); else render(); };
}

// ---------- modal ----------
function modal(html, wide){ $("#modalRoot").innerHTML = `<div class="modal-bg" onclick="if(event.target===this)closeModal()"><div class="modal ${wide?"wide":""}" role="dialog" aria-modal="true">${html}</div></div>`; }
function closeModal(){ $("#modalRoot").innerHTML = ""; }
document.addEventListener("keydown", e => { if (e.key === "Escape") closeModal(); });

// ---------- start ----------
sb.auth.getSession().then(({ data }) => data.session ? boot(data.session) : show("login"));
