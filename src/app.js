// ---------- config ----------
const SUPABASE_URL = "https://rcufmnidwyycbrtqgqga.supabase.co";
const SUPABASE_KEY = "sb_publishable_u2__PPq2nDZLyoNnLHxkVA_olltjpHc";
const sb = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
const DUE_DAYS = 30;
const NATIONALITIES = ["Saudi","Bangladeshi","Indian","Filipino","Pakistani","Nepali","Egyptian","Sudanese","Yemeni","Eritrean","Sri Lankan","Jordanian","Syrian","Other"];
const CARD_STATUSES = ["Training pending","Training done but card status not updated","Rescheduled for exam","Need to pay SAR 60"];
const COLS = ["Employee ID","Name","Store","Iqama Number","Nationality","Expiry Date","Mobile Number","AM Remarks"];

// ---------- state ----------
const S = { me:null, emps:[], weeks:[], profiles:[], view:"dashboard", page:1, filters:{q:"",store:"",status:""}, alertTab:"exp", chat:[], channel:null, imp:null };

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
const isAdmin = () => S.me?.role === "admin";
function toast(msg){ const t = document.createElement("div"); t.className = "toast"; t.textContent = msg; document.body.appendChild(t); setTimeout(() => t.remove(), 2600); }
function phoneIntl(m){ let d = String(m||"").replace(/\D/g,""); if (!d) return ""; if (d.startsWith("00")) d = d.slice(2); if (d.startsWith("0")) d = d.slice(1); if (d.length === 9 && d.startsWith("5")) d = "966" + d; return d; }
function waText(e){
  const s = statusOf(e); if (s === "ok") return "";
  const first = String(e.name || "").trim().split(/\s+/)[0] || "";
  const hi = first ? `Hi ${first[0].toUpperCase()}${first.slice(1).toLowerCase()},` : "Hi,";
  const n = e.expiry ? daysLeft(e.expiry) : 0;
  const msg = s === "exp" ? `${hi} your Baladiya card expired on ${fmtDate(e.expiry)}. Please renew it as soon as possible and share the new card with your area manager. Thank you.`
    : s === "due" ? `${hi} your Baladiya card expires on ${fmtDate(e.expiry)} (${n === 0 ? "today" : `in ${n} day${n === 1 ? "" : "s"}`}). Please book your renewal now. Thank you.`
    : `${hi} we don't have your Baladiya card expiry date. Please send a photo of your Baladiya card to your area manager. Thank you.`;
  return "?text=" + encodeURIComponent(msg);
}
function contact(e){
  const p = phoneIntl(e.mobile); if (!p) return "";
  return `<span class="contact"><a href="tel:+${p}" title="Call" aria-label="Call">${ICON.phone}</a><a href="https://wa.me/${p}${waText(e)}" target="_blank" rel="noopener" title="${statusOf(e) === "ok" ? "WhatsApp" : "WhatsApp — reminder ready to send"}" aria-label="WhatsApp">${ICON.wa}</a></span>`;
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
  wa:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M3.5 20.5l1.3-4.2A8.5 8.5 0 1 1 8 19.6z"/><path d="M9 9.5c.3 2 2.2 4.1 4.5 4.8l1.2-1.2 1.8.9c-.3 1.2-1.3 1.9-2.4 1.8C10.8 15.4 8.5 13 8.2 10c-.1-1 .6-2 1.8-2.3l.9 1.8z"/></svg>',
};
const VIEWS = () => [
  ["dashboard","Dashboard",ICON.dash],["employees","Employees",ICON.users],["import","Import",ICON.up],
  ["alerts","Alerts",ICON.bell],["assistant","AI Assistant",ICON.spark],
  ...(isAdmin() ? [["logins","Users",ICON.shield]] : [])
];

// ---------- auth ----------
$("#loginForm").addEventListener("submit", async e => {
  e.preventDefault(); $("#lerr").textContent = ""; $("#lbtn").disabled = true;
  const { error } = await sb.auth.signInWithPassword({ email: $("#lemail").value.trim(), password: $("#lpass").value });
  $("#lbtn").disabled = false;
  if (error) $("#lerr").textContent = error.message === "Invalid login credentials" ? "Wrong email or password." : error.message;
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
  const [{ error: uErr }, { data: me, error: meErr }] = await Promise.all([
    sb.auth.getUser().catch(err => ({ error: err })),
    sb.from("trackit_profiles").select("*").eq("id", session.user.id).maybeSingle(),
  ]);
  if (uErr && uErr.status >= 400 && uErr.status < 500) { try { await sb.auth.signOut({ scope: "local" }); } catch (e) { /* ignore */ } clearLocalLogin(); return show("login"); }
  if (meErr) { showConnError(); return; }
  if (!me) return show("noaccess");
  S.me = me;
  $("#meName").textContent = me.full_name || me.email;
  $("#meRole").textContent = isAdmin() ? "Admin" : "User";
  show("shell");
  await loadAll(); subscribe();
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
async function pageAll(table, order){
  const rows = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await sb.from(table).select("*").order(order).order("id").range(from, from + 999);
    if (error) { toast(error.message); break; }
    rows.push(...data); if (data.length < 1000) break;
  }
  return rows;
}
async function loadAll(){
  const emps = await pageAll("trackit_staff", "expiry");
  S.emps = emps.sort((a, b) => (a.expiry || "0000") < (b.expiry || "0000") ? -1 : 1);
  if (isAdmin()) {
    const [{ data }, { data: st }] = await Promise.all([sb.from("trackit_profiles").select("*").order("full_name"),
      sb.from("trackit_settings").select("email_enabled,recipients,sender_email,sender_name,frequency,weekday,send_hour,last_sent,last_result").eq("id", 1).maybeSingle()]);
    S.profiles = data || []; S.settings = st;
  }
}
let reloadT = null;
function subscribe(){
  S.channel = sb.channel("trackit-staff")
    .on("postgres_changes", { event: "*", schema: "public", table: "trackit_staff" }, () => {
      clearTimeout(reloadT); reloadT = setTimeout(async () => { await loadAll(); render(true); }, 800);
    }).subscribe(status => {
      const online = status === "SUBSCRIBED";
      document.body.classList.toggle("offline", !online);
      if (online && S.wasOffline) { S.wasOffline = false; loadAll().then(() => render(true)); }
      if (!online) S.wasOffline = true;
    });
}
const stores = () => [...new Set(S.emps.map(e => e.store).filter(Boolean))].sort();

// ---------- routing ----------
function go(v){ if (!VIEWS().some(x => x[0] === v)) v = "dashboard"; S.view = v; S.page = 1; location.hash = v; render(); const m = $("#main"); if (m) m.scrollTop = 0; }
window.addEventListener("hashchange", () => { const v = location.hash.slice(1); if (S.me && v && v !== S.view) go(v); });
function renderNav(){
  $("#nav").innerHTML = VIEWS().map(([k,l,i]) => `<button class="${S.view===k?"on":""}" onclick="go('${k}')">${i}<span>${l}</span></button>`).join("");
  const short = { "AI Assistant":"Ask AI" };
  $("#bnav").innerHTML = VIEWS().map(([k,l,i]) => `<button class="${S.view===k?"on":""}" onclick="go('${k}')">${i}<span>${short[l]||l}</span></button>`).join("");
}
function render(fromLive){
  renderNav();
  if (fromLive && (S.view === "assistant" || (S.view === "import" && S.imp))) return;
  const f = { dashboard, employees, import: importView, alerts, assistant, logins: loginsView }[S.view];
  const keepFocus = document.activeElement?.id;
  $("#main").innerHTML = f();
  if (S.view === "assistant") afterChat();
  if (S.view === "import") bindDrop();
  if (keepFocus && document.getElementById(keepFocus)) { const el = document.getElementById(keepFocus); el.focus(); if (el.setSelectionRange && el.value) el.setSelectionRange(el.value.length, el.value.length); }
}
const header = (t, p, extra="") => `<div class="top"><div><h2>${t}</h2><p>${p}</p></div><div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap"><span class="live" title="Updates appear automatically"><i></i><span class="on-txt">Live</span><span class="off-txt">Reconnecting…</span></span>${extra}</div></div>`;

// ---------- dashboard ----------
function counts(list){ const c = { exp:0, due:0, miss:0, ok:0, total:list.length }; for (const e of list) c[statusOf(e)]++; return c; }
function groupRows(keyFn){
  const g = {};
  for (const e of S.emps) { const k = keyFn(e) || "—"; g[k] ??= { total:0, exp:0, due:0, miss:0, ok:0 }; g[k].total++; g[k][statusOf(e)]++; }
  return Object.entries(g).sort((a,b) => (b[1].exp*1e6 + b[1].due*1e3 + b[1].miss) - (a[1].exp*1e6 + a[1].due*1e3 + a[1].miss));
}
function groupTable(titleTxt, colName, rows, filterKey){
  if (!rows.length) return "";
  return `<div class="card"><div class="pad" style="padding-bottom:6px"><h3>${titleTxt}</h3></div><div class="tbl-wrap"><table><thead><tr><th>${colName}</th><th>Staff</th><th>Expired</th><th>Due</th><th class="hm">No date</th></tr></thead><tbody>
  ${rows.map(([k,v]) => `<tr style="cursor:pointer" onclick="openGroup('${filterKey}',this.dataset.k)" data-k="${esc(k === "—" ? "" : k)}"><td><b>${esc(k)}</b></td><td class="mono">${v.total}</td><td class="mono" style="color:${v.exp?"var(--red)":"var(--muted)"};font-weight:${v.exp?700:400}">${v.exp}</td><td class="mono" style="color:${v.due?"var(--amber)":"var(--muted)"};font-weight:${v.due?700:400}">${v.due}</td><td class="mono hm">${v.miss}</td></tr>`).join("")}
  </tbody></table></div></div>`;
}
function openGroup(key, val){ S.filters = { q:"", store:"", status:"" }; S.filters[key] = val; go("employees"); }
function dashboard(){
  const c = counts(S.emps);
  const kpi = (st, lbl, v, sub, col) => `<div class="card kpi" onclick="quick('${st}')"><div class="l"><span class="dot" style="background:${col}"></span>${lbl}</div><div class="v mono" style="color:${col}">${v.toLocaleString()}</div><div class="s">${sub}</div></div>`;
  const next = S.emps.filter(e => ["exp","due"].includes(statusOf(e))).slice(0, 8);
  return header("Dashboard", `${c.total.toLocaleString()} employees · ${stores().length} stores`) + `
  <div class="kpis k5">
    ${kpi("", "Total", c.total, "All employees", "var(--ink)")}
    ${kpi("exp", "Expired", c.exp, "Renew now", "var(--red)")}
    ${kpi("due", "Due ≤ 30 days", c.due, "Book renewals", "var(--amber)")}
    ${kpi("miss", "Date missing", c.miss, "Check Baladiya system", "#6E655B")}
    ${kpi("ok", "OK", c.ok, "More than 30 days", "var(--teal-d)")}
  </div>
  ${groupTable("By store", "Store", groupRows(e => e.store), "store")}
  <div class="card section"><div class="pad" style="padding-bottom:6px"><h3>Needs action soonest</h3></div>
    ${next.length ? `<div class="tbl-wrap"><table><thead><tr><th>Employee</th><th class="hm">Store</th><th>Expiry</th><th class="hm">AM remarks</th></tr></thead><tbody>
    ${next.map(e => `<tr onclick="editEmp('${e.id}')" style="cursor:pointer"><td><b>${esc(e.name)}</b><div class="sub mono">${esc(e.employee_id)}<span class="sm-only"> · ${esc(e.store)}</span></div></td><td class="hm">${esc(e.store)}</td><td class="mono">${dateCell(e)}</td><td class="hm"><span class="sub">${esc(e.remarks)}</span></td></tr>`).join("")}
    </tbody></table></div><div class="pager"><span>The 8 most overdue</span><button class="btn sm ghost" onclick="go('alerts')">See all alerts</button></div>` : `<div class="empty">${S.emps.length ? "Nothing expired or due in the next 30 days." : "No employees yet. Go to <a href='#import'>Import</a> to upload the weekly file."}</div>`}
  </div>`;
}
function quick(st){ S.filters = { q:"", store:"", status:st }; go("employees"); }

// ---------- employees ----------
function filtered(){
  const { q, store, status } = S.filters; const ql = q.trim().toLowerCase();
  return S.emps.filter(e => (!ql || e.name.toLowerCase().includes(ql) || e.employee_id.toLowerCase().includes(ql) || String(e.iqama).includes(ql) || String(e.mobile).includes(ql)) &&
    (!store || e.store === store) && (!status || statusOf(e) === status));
}
function filterBar(){
  const f = S.filters;
  const sts = [...new Set(S.emps.map(e => e.store).filter(Boolean))].sort();
  const sel = (key, all, opts) => `<select onchange="S.filters.${key}=this.value;S.page=1;render()"><option value="">${all}</option>${opts.map(([v,l]) => `<option value="${esc(v)}" ${f[key]===v?"selected":""}>${esc(l)}</option>`).join("")}</select>`;
  return `<div class="filters">
    <input id="fq" type="search" placeholder="Search name, ID, Iqama or mobile…" value="${esc(f.q)}" oninput="S.filters.q=this.value;S.page=1;render()">
    ${sel("store", "All stores", sts.map(s => [s, s]))}
    ${sel("status", "All statuses", Object.entries(STATUS_LABEL))}
  </div>`;
}
function employees(){
  const list = filtered(); const per = 50; const pages = Math.max(1, Math.ceil(list.length / per));
  S.page = Math.min(S.page, pages); const slice = list.slice((S.page-1)*per, S.page*per);
  return header("Employees", "Search, filter and update expiry dates", `<button class="btn ghost" onclick="exportCSV()">Export list</button><button class="btn" onclick="editEmp()">+ Add employee</button>`) + filterBar() + `
  <div class="card">${slice.length ? `<div class="tbl-wrap"><table><thead><tr><th>Employee</th><th class="hm">Store</th><th class="hm">Nationality</th><th>Baladiya expiry</th><th class="hm">Status</th><th class="hm">AM remarks</th><th></th></tr></thead><tbody>
    ${slice.map(e => `<tr><td><b>${esc(e.name)}</b><div class="sub mono">${esc(e.employee_id)}<span class="sm-only"> · ${esc(e.store)}</span></div></td><td class="hm">${esc(e.store)}</td><td class="hm">${esc(e.nationality)}</td><td class="mono">${dateCell(e)}</td><td class="hm">${pill(e)}</td><td class="hm" style="max-width:240px"><span class="sub">${esc(e.remarks)}</span></td>
    <td style="white-space:nowrap;text-align:right">${contact(e)}<button class="icon-btn" title="Edit" aria-label="Edit" onclick="editEmp('${e.id}')" style="display:inline-block">${ICON.edit}</button>${isAdmin() ? `<button class="icon-btn hm" title="Delete" aria-label="Delete" onclick="delEmp('${e.id}')" style="display:inline-block">${ICON.trash}</button>` : ""}</td></tr>`).join("")}
  </tbody></table></div>
  <div class="pager"><span>${list.length.toLocaleString()} employee${list.length===1?"":"s"} · page ${S.page} of ${pages}</span><span style="display:flex;gap:8px"><button class="btn sm ghost" ${S.page<=1?"disabled":""} onclick="S.page--;render()">Previous</button><button class="btn sm ghost" ${S.page>=pages?"disabled":""} onclick="S.page++;render()">Next</button></span></div>`
  : `<div class="empty">${S.emps.length ? "No employees match these filters." : "No employees yet. Use <a href='#import'>Import</a> to upload this week's file."}</div>`}</div>`;
}
function editEmp(id){
  const e = id ? S.emps.find(x => x.id === id) : { employee_id:"", name:"", store:"", iqama:"", nationality:"", mobile:"", expiry:"", expiry_note:"", remarks:"", card_status:"" };
  const opts = (list, cur) => [...new Set([...list, cur].filter(Boolean))].map(n => `<option ${n===cur?"selected":""}>${esc(n)}</option>`).join("");
  modal(`<h3>${id ? esc(e.name) : "Add employee"}</h3>${id ? `<p class="note" style="margin-top:-8px">${pill(e)} ${contact(e)}</p>` : ""}
    <form id="ef">
      <div class="row2"><div><label>Expiry date</label><input type="date" name="expiry" value="${esc(e.expiry || "")}"></div>
      <div><label>AM remarks</label><input type="text" name="remarks" value="${esc(e.remarks)}" placeholder="e.g. medical booked for Sunday"></div></div>
      ${(() => { const cs = e.card_status || "", known = !cs || CARD_STATUSES.includes(cs); return `<div class="row2"><div><label>Card status</label>
        <select name="card_status_sel" id="csSel" onchange="$('#csCustomWrap').classList.toggle('hidden', this.value !== '__custom'); if (this.value === '__custom') $('#csCustom').focus()">
          <option value="">—</option>${CARD_STATUSES.map(s => `<option value="${esc(s)}" ${s === cs ? "selected" : ""}>${esc(s)}</option>`).join("")}
          <option value="__custom" ${known ? "" : "selected"}>Custom…</option></select></div>
        <div id="csCustomWrap" class="${known ? "hidden" : ""}"><label>Custom status</label><input type="text" id="csCustom" name="card_status_custom" maxlength="120" value="${known ? "" : esc(cs)}" placeholder="Type the card status"></div></div>`; })()}
      ${!e.expiry && e.expiry_note ? `<p class="note">File said: <b>${esc(e.expiry_note)}</b>. Enter the real date when you have it.</p>` : ""}
      <div class="row2"><div><label>Employee ID</label><input type="text" name="employee_id" required value="${esc(e.employee_id)}"></div>
      <div><label>Name</label><input type="text" name="name" required value="${esc(e.name)}"></div></div>
      <div class="row2"><div><label>Store</label><input type="text" name="store" list="storeList" required value="${esc(e.store)}"><datalist id="storeList">${stores().map(s => `<option value="${esc(s)}">`).join("")}</datalist></div>
      <div><label>Nationality</label><select name="nationality"><option value="">—</option>${opts(NATIONALITIES, e.nationality)}</select></div></div>
      <div class="row2"><div><label>Iqama number</label><input type="text" name="iqama" inputmode="numeric" value="${esc(e.iqama)}"></div>
      <div><label>Mobile number</label><input type="text" name="mobile" inputmode="tel" value="${esc(e.mobile)}" placeholder="5XXXXXXXX"></div></div>
      <div class="err" id="eerr"></div>
      <div class="actions"><button type="button" class="btn ghost" onclick="closeModal()">Cancel</button><button class="btn">${id ? "Save" : "Add employee"}</button></div>
    </form>`, true);
  $("#ef").onsubmit = async ev => {
    ev.preventDefault(); const fd = Object.fromEntries(new FormData(ev.target));
    const row = { employee_id: fd.employee_id.trim(), name: fd.name.trim(), store: fd.store.trim(), iqama: fd.iqama.trim(), nationality: fd.nationality,
      mobile: fd.mobile.replace(/\D/g,""), expiry: fd.expiry || null, remarks: fd.remarks.trim(),
      card_status: fd.card_status_sel === "__custom" ? (fd.card_status_custom || "").trim() : (fd.card_status_sel || "") };
    if (fd.card_status_sel === "__custom" && !row.card_status) { $("#eerr").textContent = "Type the custom card status, or pick one from the list."; return; }
    if (row.expiry) row.expiry_note = "";
    const { error } = id ? await sb.from("trackit_staff").update(row).eq("id", id) : await sb.from("trackit_staff").insert(row);
    if (error) { $("#eerr").textContent = error.code === "23505" ? "That Employee ID is already in Trackit." : error.message; return; }
    closeModal(); toast(id ? "Saved" : "Employee added"); await loadAll(); render();
  };
}
function delEmp(id){
  const e = S.emps.find(x => x.id === id);
  modal(`<h3>Delete ${esc(e.name)}?</h3><p class="note">This removes employee ${esc(e.employee_id)} from Trackit (e.g. they left the company). It can't be undone.</p>
  <div class="actions"><button class="btn ghost" onclick="closeModal()">Cancel</button><button class="btn danger" id="dbtn">Delete</button></div>`);
  $("#dbtn").onclick = async () => { const { error } = await sb.from("trackit_staff").delete().eq("id", id); if (error) return toast(error.message); closeModal(); toast("Deleted"); await loadAll(); render(); };
}
const empRow = e => [e.employee_id, e.name, e.store, e.iqama, e.nationality, e.expiry || "", e.mobile, e.remarks];
function exportCSV(){ downloadCSV(`trackit-export-${new Date().toISOString().slice(0,10)}.csv`, [[...COLS, "Status"], ...filtered().map(e => [...empRow(e), STATUS_LABEL[statusOf(e)]])]); }
function downloadCSV(name, rows){
  const csv = "﻿" + rows.map(r => r.map(v => { v = String(v ?? ""); if (/^[=+\-@\t\r]/.test(v) && !/^-?\d/.test(v)) v = "'" + v; return /[",\n]/.test(v) ? `"${v.replace(/"/g,'""')}"` : v; }).join(",")).join("\r\n");
  const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([csv], { type:"text/csv;charset=utf-8" })); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

// ---------- import: reading files ----------
const normHead = h => String(h||"").toLowerCase().replace(/\s+/g," ").trim();
const HEAD = {
  employee_id: ["employee id","employee number","employee no","emp no","emp id","staff id"],
  name: ["name","employee name","full name"],
  store: ["store","branch","store name","branch name"],
  iqama: ["iqama number","iqama","iqama no"],
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
  const wb = XLSX.read(await file.arrayBuffer(), { type:"array", cellDates:true });
  const rows = []; const sheets = [];
  for (const name of wb.SheetNames) {
    const aoa = XLSX.utils.sheet_to_json(wb.Sheets[name], { header:1, defval:"", raw:true });
    let h = -1; for (let i = 0; i < Math.min(aoa.length, 8); i++) { const t = aoa[i].map(normHead); if (t.some(x => HEAD.employee_id.includes(x)) && t.some(x => HEAD.store.includes(x))) { h = i; break; } }
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
      rows.push({ where: `${name.trim()} row ${h + i + 2}`, employee_id: eid, name: nm.replace(/\s+/g," "), store: String(get("store")).replace(/\s+/g," ").trim(),
        iqama: String(get("iqama")).trim().replace(/\.0$/, ""), nationality: normNationality(get("nationality")),
        mobile: normMobile(get("mobile")), expiry: d.date, expiry_note: d.note, unclear: d.unclear, remarks: String(get("remarks") ?? "").replace(/\s+/g," ").trim() });
      n++;
    });
    sheets.push({ name, rows:n });
  }
  return { rows, sheets };
}
function analyse(rows){
  const byId = {}; rows.forEach((r, i) => { (byId[r.employee_id] ??= []).push(i); });
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
  return header("Import", "Upload the weekly Baladiya file") + `
  <div class="steps">
    <div class="card pad"><div class="step-n">1</div><h3>Use the Trackit template</h3>
      <p class="note">One sheet, one row per employee, these columns: <b>${COLS.join(", ")}</b>.</p>
      <p class="note">Rows are matched by <b>Employee ID</b> — new people are added and changes are updated. Nobody is removed.</p>
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
    <button class="btn danger" onclick="wipeAll()" ${S.emps.length ? "" : "disabled"}>Delete all uploaded data</button></div>` : ""}`;
}
function wipeAll(){
  modal(`<h3>Delete all uploaded data?</h3>
    <p class="note">This permanently removes <b>${S.emps.length.toLocaleString()} employees</b> for everyone. Tip: use <b>Download current list</b> first if you want a copy.</p>
    <label>Type DELETE to confirm</label><input type="text" id="wipeTxt" autocomplete="off" oninput="$('#wipeBtn').disabled=this.value.trim()!=='DELETE'">
    <div class="err" id="wipeErr"></div>
    <div class="actions"><button class="btn ghost" onclick="closeModal()">Cancel</button><button class="btn danger" id="wipeBtn" disabled>Delete everything</button></div>`);
  $("#wipeBtn").onclick = async () => {
    $("#wipeBtn").disabled = true; $("#wipeErr").textContent = "";
    const a = await sb.from("trackit_staff").delete().not("id", "is", null);
    const b = a.error ? a : await sb.from("trackit_week_totals").delete().not("id", "is", null);
    if (a.error || b.error) { $("#wipeErr").textContent = (a.error || b.error).message; $("#wipeBtn").disabled = false; return; }
    closeModal(); S.imp = null; await loadAll(); render(); toast("All uploaded data deleted");
  };
}
async function downloadTemplate(withData){
  try { await needXLSX(); } catch (e) { return toast(e.message); }
  const data = withData ? S.emps.map(e => { const r = empRow(e); r[5] = e.expiry ? new Date(e.expiry + "T00:00:00") : ""; return r; }) : [];
  const ws = XLSX.utils.aoa_to_sheet([COLS, ...data], { cellDates:true });
  ws["!cols"] = [16,30,26,16,14,14,16,40].map(w => ({ wch:w }));
  for (let i = 1; i <= data.length; i++) { const c = ws[XLSX.utils.encode_cell({ r:i, c:5 })]; if (c && c.t === "d") c.z = "dd-mmm-yyyy"; }
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
    if (!rows.length) throw new Error("No employee rows found. The sheet needs headings like Employee ID, Name and Store — use the Trackit template.");
    S.imp = { file: file.name, rows, sheets, ...analyse(rows), result: null };
    render();
  } catch (e) { $("#impOut").innerHTML = `<div class="errlist" style="margin-top:14px">${esc(e.message || e)}</div>`; $("#file").value = ""; }
}
function importPreview(){
  const I = S.imp;
  const unclear = I.rows.filter(r => r.unclear), missing = I.rows.filter(r => !r.expiry && !r.unclear).length;
  const noStore = I.rows.filter(r => !r.store);
  const listRows = (rows, cell) => `<div class="tbl-wrap section"><table><thead><tr><th>Where</th><th>Employee</th><th>File says</th></tr></thead><tbody>${rows.slice(0,100).map(r => `<tr><td>${esc(r.where)}</td><td>${esc(r.name)}</td><td>${esc(cell(r))}</td></tr>`).join("")}</tbody></table></div>`;
  const good = !I.conflicts.length && !unclear.length && !noStore.length;
  return header("Check before saving", `${esc(I.file)} · ${I.rows.length} rows`, `<button class="btn ghost" onclick="S.imp=null;render()">Cancel</button>`) + `
  ${I.sheets.filter(s => !s.skipped).length > 1 ? `<div class="card pad"><h3>Sheets</h3><p class="note">${I.sheets.map(s => `${esc(s.name.trim())}: ${s.skipped ? "skipped" : `<b>${s.rows}</b> rows`}`).join(" · ")}</p></div>` : ""}
  ${good ? `<div class="okbox section">Everything looks clean.</div>` : ""}
  <div class="card pad section"><h3>Duplicates</h3>
    ${!I.exactDup.length && !I.conflicts.length ? `<div class="okbox">No duplicate Employee IDs.</div>` : ""}
    ${I.exactDup.length ? `<p class="note">${I.exactDup.length} Employee IDs appear twice with identical details — merged automatically.</p>` : ""}
    ${I.conflicts.length ? `<div class="warnbox">${I.conflicts.length} Employee IDs appear more than once with <b>different</b> details. The <b>last row</b> will be used:</div>
      <div class="tbl-wrap section"><table><thead><tr><th>Employee ID</th><th>Rows in file</th></tr></thead><tbody>${I.conflicts.map(c => `<tr><td class="mono">${esc(c.id)}</td><td>${c.rows.map(r => `${esc(r.where)}: ${esc(r.store)} · ${esc(r.expiry || r.expiry_note)}`).join("<br>")}</td></tr>`).join("")}</tbody></table></div>` : ""}
  </div>
  <div class="card pad section"><h3>Dates</h3>
    <p class="note"><b>${I.rows.filter(r => r.expiry).length}</b> rows have a date. <b>${missing}</b> have no date (blank, N/A, NOT FOUND) and will show as <b>Date missing</b>.</p>
    ${unclear.length ? `<div class="warnbox">${unclear.length} dates couldn't be read and will be saved as <b>Date missing</b>:</div>${listRows(unclear, r => r.expiry_note)}` : ""}
  </div>
  ${noStore.length ? `<div class="card pad section"><h3>Store</h3>
    <div class="warnbox">${noStore.length} rows have no store.</div>${listRows(noStore, () => "(blank)")}
  </div>` : ""}
  <div class="card pad section"><h3>Save</h3>
    <div class="actions" style="justify-content:flex-start"><button class="btn" id="impBtn" onclick="runImport()">Save ${new Set(I.rows.map(r => r.employee_id)).size} employees</button></div>
    <div id="impProg"></div>
  </div>`;
}
async function runImport(){
  const I = S.imp; $("#impBtn").disabled = true;
  try {
    const last = new Map(); I.rows.forEach(r => last.set(r.employee_id || r.where, r));
    const rows = [...last.values()].map(r => ({ row: r.where, employee_id: r.employee_id, name: r.name, store: r.store, iqama: r.iqama,
      nationality: r.nationality, mobile: r.mobile, expiry: r.expiry, expiry_note: r.expiry_note, remarks: r.remarks }));
    const tot = { added:0, updated:0, skipped:0, errors:[] };
    for (let i = 0; i < rows.length; i += 500) {
      $("#impProg").innerHTML = `<p class="note">Saving ${Math.min(i + 500, rows.length)} of ${rows.length}…</p>`;
      const { data, error } = await sb.rpc("trackit_import_v3", { rows: rows.slice(i, i + 500), week_label: null });
      if (error) throw error;
      tot.added += data.added; tot.updated += data.updated; tot.skipped += data.skipped; tot.errors.push(...data.errors);
    }
    I.result = tot; await loadAll(); render(); toast("Import finished");
  } catch (e) { $("#impProg").innerHTML = `<div class="errlist">${esc(e.message || e)}</div>`; $("#impBtn").disabled = false; }
}
function importResult(){
  const t = S.imp.result;
  return header("Import finished", esc(S.imp.file), `<button class="btn" onclick="S.imp=null;go('dashboard')">Go to dashboard</button>`) + `
  <div class="card pad"><div class="summary"><div><b style="color:var(--teal-d)">${t.added}</b>added</div><div><b style="color:var(--tan-d)">${t.updated}</b>updated</div><div><b>${t.skipped}</b>unchanged</div><div><b style="color:${t.errors.length?"var(--red)":"var(--muted)"}">${t.errors.length}</b>problems</div></div>
  ${t.errors.length ? `<div class="errlist">${t.errors.slice(0,300).map(e => `<div>${esc(e.row)}: ${esc(e.msg)}</div>`).join("")}</div>` : `<div class="okbox">Everything saved. Dashboards update for everyone automatically.</div>`}
  <div class="actions" style="justify-content:flex-start"><button class="btn ghost" onclick="S.imp=null;render()">Upload another file</button></div></div>`;
}

// ---------- alerts ----------
function alerts(){
  const by = s => S.emps.filter(e => statusOf(e) === s);
  const lists = { exp: by("exp"), due: by("due"), miss: by("miss") };
  const all = lists[S.alertTab], per = 50, pages = Math.max(1, Math.ceil(all.length / per));
  S.page = Math.min(S.page, pages); const list = all.slice((S.page - 1) * per, S.page * per);
  return header("Alerts", "Who needs a Baladiya renewal") + `
  <div class="tabs">${[["exp","Expired"],["due","Due ≤ 30 days"],["miss","Date missing"]].map(([k,l]) => `<button class="${S.alertTab===k?"on":""}" onclick="S.alertTab='${k}';S.page=1;render()">${l} (${lists[k].length})</button>`).join("")}</div>
  ${S.alertTab === "miss" ? `<p class="note" style="margin-top:-4px">No usable expiry date. Check the Baladiya system and enter the date.</p>` : ""}
  <div class="card">${list.length ? `<div class="tbl-wrap"><table><thead><tr><th>Employee</th><th class="hm">Store</th><th>Expiry</th><th class="hm">AM remarks</th><th></th></tr></thead><tbody>
  ${list.map(e => `<tr><td><b>${esc(e.name)}</b><div class="sub mono">${esc(e.employee_id)}<span class="sm-only"> · ${esc(e.store)}</span></div></td><td class="hm">${esc(e.store)}</td><td class="mono">${dateCell(e)}</td><td class="hm" style="max-width:260px"><span class="sub">${esc(e.remarks)}</span></td><td style="text-align:right;white-space:nowrap">${contact(e)}<button class="btn sm ghost" onclick="editEmp('${e.id}')">Update</button></td></tr>`).join("")}
  </tbody></table></div>${pages > 1 ? `<div class="pager"><span>${all.length.toLocaleString()} people · page ${S.page} of ${pages}</span><span style="display:flex;gap:8px"><button class="btn sm ghost" ${S.page<=1?"disabled":""} onclick="S.page--;render()">Previous</button><button class="btn sm ghost" ${S.page>=pages?"disabled":""} onclick="S.page++;render()">Next</button></span></div>` : ""}` : `<div class="empty">Nobody in this list.</div>`}</div>`;
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
function loginsView(){
  return header("Users", "Everyone with a login sees all employees. Only admins manage users and delete employees.", `<button class="btn" onclick="addLogin()">+ Add user</button>`) + `
  <div class="card"><div class="tbl-wrap"><table><thead><tr><th>Name</th><th class="hm">Email</th><th>Role</th><th></th></tr></thead><tbody>
  ${S.profiles.map(p => `<tr><td><b>${esc(p.full_name || p.email)}</b><div class="sub sm-only">${esc(p.email)}</div></td><td class="hm">${esc(p.email)}</td><td>${p.role === "admin" ? "Admin" : "User"}</td>
    <td style="text-align:right;white-space:nowrap"><button class="btn sm ghost" onclick="resetPw('${p.id}')">${ICON.key}<span class="hm">Reset password</span></button>${p.id !== S.me.id ? `<button class="icon-btn" title="Remove" aria-label="Remove" onclick="delLogin('${p.id}')" style="display:inline-block">${ICON.trash}</button>` : ""}</td></tr>`).join("")}
  </tbody></table></div></div>
  ${emailCard()}`;
}
const DAYS = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
const hourLabel = h => `${((h + 11) % 12) + 1}:00 ${h < 12 ? "AM" : "PM"}`;
function emailCard(){
  const st = S.settings; if (!st) return "";
  const when = st.frequency === "weekly" ? `every ${DAYS[st.weekday]} at ${hourLabel(st.send_hour)}` : `every day at ${hourLabel(st.send_hour)}`;
  return `<div class="card pad section"><h3>Email alerts</h3>
    <p class="note">Sends a summary of everyone <b>expired</b> and <b>expiring within 30 days</b> (Riyadh time). No email is sent on days with nothing to report. Iqama and mobile numbers are never included.</p>
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
  await loadAll(); render();
  if (data?.ok) toast(`Test email sent to ${data.sent} receiver${data.sent === 1 ? "" : "s"}`);
  else { const e = $("#alertErr"); if (e) e.textContent = msg || error?.message || "Couldn't send"; }
}
function addLogin(){
  modal(`<h3>Add user</h3><form id="lf">
    <label>Full name</label><input type="text" name="full_name" required>
    <label>Email</label><input type="email" name="email" required>
    <label>Starting password (min 8 characters)</label><input type="text" name="password" required minlength="8" autocomplete="off">
    <label>Role</label><select name="role"><option value="manager">User — sees and updates all employees</option><option value="admin">Admin — also manages users</option></select>
    <div class="err" id="lerr2"></div>
    <div class="actions"><button type="button" class="btn ghost" onclick="closeModal()">Cancel</button><button class="btn" id="lbtn2">Create login</button></div></form>`);
  $("#lf").onsubmit = async ev => { ev.preventDefault(); $("#lbtn2").disabled = true;
    const err = await adminCall({ action:"create", ...Object.fromEntries(new FormData(ev.target)) });
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
  modal(`<h3>Remove login?</h3><p class="note">${esc(m.email)} won't be able to sign in. Employee data stays in Trackit.</p><div class="err" id="derr"></div>
  <div class="actions"><button class="btn ghost" onclick="closeModal()">Cancel</button><button class="btn danger" id="dm">Remove</button></div>`);
  $("#dm").onclick = async () => { const err = await adminCall({ action:"delete", id }); if (err) return $("#derr").textContent = err; closeModal(); toast("Removed"); await loadAll(); render(); };
}

// ---------- modal ----------
function modal(html, wide){ $("#modalRoot").innerHTML = `<div class="modal-bg" onclick="if(event.target===this)closeModal()"><div class="modal ${wide?"wide":""}" role="dialog" aria-modal="true">${html}</div></div>`; }
function closeModal(){ $("#modalRoot").innerHTML = ""; }
document.addEventListener("keydown", e => { if (e.key === "Escape") closeModal(); });

// ---------- start ----------
sb.auth.getSession().then(({ data }) => data.session ? boot(data.session) : show("login")).catch(() => { clearLocalLogin(); show("login"); });
