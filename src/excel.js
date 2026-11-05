// ---------- styled Excel downloads (Employees page and Alerts page) ----------
// ExcelJS is loaded only when someone presses a Download button, so the app itself stays light.
// Iqama and mobile numbers are included for admins only.
const XL = {
  ink: "FF1B1714", tan: "FFD4B48A", sand: "FFF4EFE8", band: "FFFAF8F5", line: "FFE6E0D8", white: "FFFFFFFF", mute: "FF6E655B",
  teal: "FF1F7A6D", okbg: "FFDDF3EC", red: "FFC2410C", redbg: "FFFDE8DD", redHead: "FF7C2D12",
  amb: "FFB45309", ambbg: "FFFEF3C7", ambHead: "FF92400E", grey: "FF6B7280", greybg: "FFEEF0F2", greyHead: "FF4B5563",
};
const XL_STATUS = {
  exp: { label: "Expired", fg: XL.red, bg: XL.redbg }, due: { label: "Due soon", fg: XL.amb, bg: XL.ambbg },
  miss: { label: "Date missing", fg: XL.grey, bg: XL.greybg }, unv: { label: "Not verified", fg: XL.grey, bg: "FFF5F5F4" },
  ok: { label: "OK", fg: XL.teal, bg: XL.okbg },
};
const XL_FONT = "Calibri";
let excelLib = null;
function loadExcelJS(){
  if (window.ExcelJS) return Promise.resolve(window.ExcelJS);
  if (!excelLib) excelLib = new Promise((ok, bad) => {
    const s = document.createElement("script");
    s.src = "https://cdn.jsdelivr.net/npm/exceljs@4.4.0/dist/exceljs.min.js";
    s.onload = () => window.ExcelJS ? ok(window.ExcelJS) : bad(new Error("Excel tool didn't load"));
    s.onerror = () => { excelLib = null; bad(new Error("Couldn't load the Excel tool. Check the internet connection and try again.")); };
    document.head.appendChild(s);
  });
  return excelLib;
}

// ---- small helpers ----
const xlDate = d => { if (!d) return null; const t = Date.parse(String(d).slice(0, 10)); return isNaN(t) ? null : new Date(t); };
// always Riyadh time, also when the file is made on the server for the scheduled email
const xlStamp = () => new Date().toLocaleDateString("en-GB", { timeZone: "Asia/Riyadh", day: "2-digit", month: "short", year: "numeric" });
const xlNow = () => new Date().toLocaleString("en-GB", { timeZone: "Asia/Riyadh", day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
const xlWho = () => S.me?.full_name || S.me?.email || "";
const xlScope = () => isAdmin() ? "All Stores" : (scopeName() || "My staff");
const xlFill = c => ({ type: "pattern", pattern: "solid", fgColor: { argb: c } });
const xlThin = { style: "thin", color: { argb: XL.line } };
const xlBorder = { top: xlThin, left: xlThin, bottom: xlThin, right: xlThin };
const xlSafeName = s => String(s).replace(/[\\/:*?"<>|]+/g, " ").replace(/\s+/g, " ").trim();
const xlCode = e => e.unit_kind === "store" ? e.unit : "";
// in the lists, departments show "Department" as area manager and leave ROM / city / region empty
const xlGeo = (k, e) => isDept(e) ? (k === "area_manager" ? "Department" : "") : geo(k, e);
const xlReminded = e => (typeof remindedMap === "function" ? remindedMap()[e.id] : null) || null;
const xlRank = { exp: 0, due: 1, miss: 2, unv: 3, ok: 4 };
const xlUrgent = (a, b) => {
  const sa = statusOf(a), sb2 = statusOf(b);
  if (sa !== sb2) return xlRank[sa] - xlRank[sb2];
  return (a.expiry || "9999").localeCompare(b.expiry || "9999") || String(a.name).localeCompare(String(b.name));
};
const xlStatusText = e => { const s = statusOf(e); if (s === "exp") return `Expired ${-daysLeft(e.expiry)} days`; if (s === "due") { const n = daysLeft(e.expiry); return n === 0 ? "Due today" : `Due in ${n} days`; } return XL_STATUS[s].label; };

// title + subtitle at the top of a sheet; returns the next free row
function xlTitle(ws, title, sub, cols, color = XL.ink){
  ws.mergeCells(1, 1, 1, cols); ws.mergeCells(2, 1, 2, cols);
  const a = ws.getCell(1, 1); a.value = title; a.font = { name: XL_FONT, size: 15, bold: true, color: { argb: XL.white } }; a.fill = xlFill(color); a.alignment = { vertical: "middle", indent: 1 };
  const b = ws.getCell(2, 1); b.value = sub; b.font = { name: XL_FONT, size: 10, color: { argb: XL.mute } }; b.alignment = { vertical: "middle", indent: 1 };
  ws.getRow(1).height = 30; ws.getRow(2).height = 20; ws.getRow(3).height = 6;
  return 4;
}
// a filterable, frozen, banded table. cols: [{h, w, v:e=>value, kind:'date'|'num'|'text'|'status'|'days', wrap}]
function xlTable(ws, startRow, cols, rows, opt = {}){
  const head = ws.getRow(startRow);
  cols.forEach((c, i) => {
    ws.getColumn(i + 1).width = c.w || 14;
    const cell = head.getCell(i + 1); cell.value = c.h;
    cell.font = { name: XL_FONT, bold: true, size: 11, color: { argb: XL.white } }; cell.fill = xlFill(opt.head || XL.ink);
    cell.alignment = { vertical: "middle", wrapText: true }; cell.border = xlBorder;
  });
  head.height = 30;
  rows.forEach((e, r) => {
    const row = ws.getRow(startRow + 1 + r); row.height = 20;
    cols.forEach((c, i) => {
      const cell = row.getCell(i + 1); let v = c.v(e, r);
      if (c.kind === "date") { v = xlDate(v); if (v) cell.numFmt = "dd-mmm-yyyy"; }
      if (c.kind === "text") v = v == null || v === "" ? "" : String(v);
      cell.value = v ?? "";
      cell.font = { name: XL_FONT, size: 11, bold: !!c.bold };
      cell.alignment = { vertical: "middle", wrapText: !!c.wrap, horizontal: c.kind === "num" || c.kind === "days" ? "right" : "left" };
      cell.border = xlBorder;
      if (r % 2) cell.fill = xlFill(XL.band);
      if (c.kind === "status") { const st = XL_STATUS[statusOf(e)]; cell.fill = xlFill(st.bg); cell.font = { name: XL_FONT, size: 11, bold: true, color: { argb: st.fg } }; cell.alignment = { vertical: "middle", horizontal: "center" }; }
      if (c.kind === "days" && typeof v === "number") { if (v < 0) cell.font = { name: XL_FONT, size: 11, bold: true, color: { argb: XL.red } }; else if (v <= DUE_DAYS) cell.font = { name: XL_FONT, size: 11, bold: true, color: { argb: XL.amb } }; }
      if (c.style) c.style(cell, e, v);
    });
  });
  const last = startRow + Math.max(rows.length, 1);
  if (!rows.length) { ws.mergeCells(startRow + 1, 1, startRow + 1, cols.length); const c = ws.getCell(startRow + 1, 1); c.value = opt.empty || "Nobody here."; c.font = { name: XL_FONT, italic: true, color: { argb: XL.mute } }; }
  ws.autoFilter = { from: { row: startRow, column: 1 }, to: { row: startRow, column: cols.length } };
  ws.views = [{ state: "frozen", xSplit: opt.freezeCols || 0, ySplit: startRow, showGridLines: false }];
  ws.pageSetup = { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0, paperSize: 9, margins: { left: .3, right: .3, top: .4, bottom: .4, header: .2, footer: .2 } };
  ws.pageSetup.printTitlesRow = `${startRow}:${startRow}`;
  ws.headerFooter.oddFooter = `&L${xlSafeName(ws.name)}&RPage &P of &N`;
  return last;
}
// a block of KPI tiles (2 columns each) starting at column 2
function xlTiles(ws, row, tiles){
  tiles.forEach((t, i) => {
    const c1 = 2 + i * 2, c2 = c1 + 1;
    [row, row + 1, row + 2].forEach(r => ws.mergeCells(r, c1, r, c2));
    const bar = ws.getCell(row, c1); bar.fill = xlFill(t.color || XL.ink);
    const v = ws.getCell(row + 1, c1); v.value = t.value; v.numFmt = "#,##0"; v.font = { name: XL_FONT, size: 24, bold: true, color: { argb: t.color || XL.ink } }; v.alignment = { vertical: "middle", horizontal: "left", indent: 1 };
    const l = ws.getCell(row + 2, c1); l.value = t.label; l.font = { name: XL_FONT, size: 10, color: { argb: XL.mute } }; l.alignment = { vertical: "top", indent: 1 };
    for (const r of [row + 1, row + 2]) for (const c of [c1, c2]) { const cell = ws.getCell(r, c); cell.border = { left: c === c1 ? xlThin : undefined, right: c === c2 ? xlThin : undefined, bottom: r === row + 2 ? xlThin : undefined }; }
  });
  ws.getRow(row).height = 5; ws.getRow(row + 1).height = 36; ws.getRow(row + 2).height = 20;
  return row + 4;
}
// a small summary table on the Summary sheet at (row, col); cols: [{h, v, kind:'num'|'pct'|'text'}]
function xlMini(ws, row, col, title, cols, rows){
  const t = ws.getCell(row, col); t.value = title; t.font = { name: XL_FONT, size: 12, bold: true };
  const h = ws.getRow(row + 1);
  cols.forEach((c, i) => { const cell = h.getCell(col + i); cell.value = c.h; cell.font = { name: XL_FONT, bold: true, size: 10.5 }; cell.fill = xlFill(XL.sand); cell.border = { bottom: { style: "medium", color: { argb: XL.tan } } }; cell.alignment = { horizontal: c.kind === "text" ? "left" : "right" }; });
  rows.forEach((r, i) => cols.forEach((c, j) => {
    const cell = ws.getCell(row + 2 + i, col + j); cell.value = c.v(r);
    cell.font = { name: XL_FONT, size: 10.5, bold: !!c.bold, color: c.red && c.v(r) > 0 ? { argb: XL.red } : undefined };
    cell.border = { bottom: { style: "thin", color: { argb: "FFEFEAE3" } } };
    cell.alignment = { horizontal: c.kind === "text" ? "left" : "right" };
    if (c.kind === "pct") cell.numFmt = "0%";
    if (c.kind === "num") cell.numFmt = "#,##0";
  }));
  const pctCol = cols.findIndex(c => c.kind === "pct");
  if (pctCol >= 0 && rows.length) {
    const L = ws.getColumn(col + pctCol).letter;
    ws.addConditionalFormatting({ ref: `${L}${row + 2}:${L}${row + 1 + rows.length}`, rules: [{ type: "dataBar", minLength: 0, maxLength: 100, cfvo: [{ type: "num", value: 0 }, { type: "num", value: 1 }], color: { argb: XL.teal }, gradient: false }] });
  }
  return row + 3 + rows.length;
}
function xlGroup(list, key){
  const m = new Map();
  for (const e of list) { const k = key(e) || "—"; if (!m.has(k)) m.set(k, { k, total: 0, ver: 0, exp: 0, due: 0, miss: 0, ok: 0, stores: new Set(), any: e }); const g = m.get(k); g.total++; if (e.verified_at) g.ver++; const s = statusOf(e); if (s in g) g[s]++; g.stores.add(placeOf(e)); }
  return [...m.values()].map(g => ({ ...g, pct: g.total ? g.ver / g.total : 0, act: g.exp + g.due + g.miss, nStores: g.stores.size }));
}
function xlBanner(ws, title, sub, cols){
  ws.getColumn(1).width = 2;
  for (let c = 2; c <= cols; c++) ws.getColumn(c).width = 13;
  ws.mergeCells(2, 2, 2, cols); ws.mergeCells(3, 2, 3, cols);
  const a = ws.getCell(2, 2); a.value = title; a.font = { name: XL_FONT, size: 20, bold: true, color: { argb: XL.white } }; a.alignment = { vertical: "middle", indent: 1 };
  const b = ws.getCell(3, 2); b.value = sub; b.font = { name: XL_FONT, size: 10.5, color: { argb: "FFCFC6BB" } }; b.alignment = { vertical: "top", indent: 1 };
  for (let c = 2; c <= cols; c++) { ws.getCell(2, c).fill = xlFill(XL.ink); ws.getCell(3, c).fill = xlFill(XL.ink); }
  ws.getRow(1).height = 10; ws.getRow(2).height = 40; ws.getRow(3).height = 24; ws.getRow(4).height = 12;
  ws.views = [{ showGridLines: false }];
  ws.pageSetup = { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0, paperSize: 9 };
  return 5;
}
// "Chase list": one block per store with its area manager and ROM; each store starts on a new printed page
function xlChase(ws, list, admin){
  const cols = [{ h: "Name", w: 30 }, { h: "Employee No", w: 13 }, ...(admin ? [{ h: "Mobile", w: 13 }] : []), { h: "Status", w: 18 }, { h: "Expiry Date", w: 14 }, { h: "Card Status", w: 30 }, { h: "Remarks", w: 34 }, { h: "Reminded On", w: 14 }];
  const n = cols.length;
  let r = xlTitle(ws, "CHASE LIST BY STORE", `${xlScope()} · ${list.length} people to follow up · print or send each block to the area manager · ${xlNow()}`, n);
  cols.forEach((c, i) => ws.getColumn(i + 1).width = c.w);
  const byStore = new Map();
  for (const e of [...list].sort(xlUrgent)) { const k = placeOf(e); if (!byStore.has(k)) byStore.set(k, []); byStore.get(k).push(e); }
  const stores = [...byStore.entries()].sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]));
  if (!stores.length) { ws.getCell(r, 1).value = "Nothing to follow up — well done."; return; }
  stores.forEach(([store, people], si) => {
    const e0 = people[0], code = xlCode(e0);
    ws.mergeCells(r, 1, r, 2); ws.mergeCells(r, 3, r, Math.min(4, n)); if (n >= 6) ws.mergeCells(r, 5, r, n - 1);
    const sh = ws.getRow(r); sh.height = 26;
    ws.getCell(r, 1).value = `📍 ${store}${code ? ` (${code})` : ""}`;
    ws.getCell(r, 3).value = isDept(e0) ? "Department" : `Area Manager: ${geo("area_manager", e0) || "—"}`;
    if (n >= 6) ws.getCell(r, 5).value = isDept(e0) ? "" : `ROM: ${geo("rom", e0) || "—"}`;
    ws.getCell(r, n).value = `${people.length} to action`;
    for (let c = 1; c <= n; c++) { const cell = ws.getCell(r, c); cell.fill = xlFill(XL.sand); cell.font = { name: XL_FONT, bold: true, size: 11.5 }; cell.border = { top: { style: "medium", color: { argb: XL.tan } } }; cell.alignment = { vertical: "middle" }; }
    r++;
    const hr = ws.getRow(r); cols.forEach((c, i) => { const cell = hr.getCell(i + 1); cell.value = c.h; cell.font = { name: XL_FONT, bold: true, size: 9.5, color: { argb: XL.mute } }; cell.border = { bottom: xlThin }; }); r++;
    people.forEach((e, i) => {
      const vals = [e.name, eid(e), ...(admin ? [e.mobile || ""] : []), xlStatusText(e), xlDate(e.expiry), e.card_status || "", e.remarks || "", xlDate(xlReminded(e))];
      const row = ws.getRow(r); row.height = 20;
      vals.forEach((v, j) => { const cell = row.getCell(j + 1); cell.value = v ?? ""; cell.font = { name: XL_FONT, size: 11, bold: j === 0 }; cell.border = xlBorder; if (i % 2) cell.fill = xlFill(XL.band); if (v instanceof Date) { cell.numFmt = "dd-mmm-yyyy"; cell.alignment = { horizontal: "left" }; } if (j > 0 && typeof v === "string" && /^\d+$/.test(v)) cell.alignment = { horizontal: "left" }; });
      const st = XL_STATUS[statusOf(e)], sc = row.getCell(admin ? 4 : 3); sc.fill = xlFill(st.bg); sc.font = { name: XL_FONT, size: 11, bold: true, color: { argb: st.fg } }; sc.alignment = { horizontal: "center" };
      r++;
    });
    if (si < stores.length - 1) ws.getRow(r).addPageBreak();
    r += 1;
  });
  ws.views = [{ showGridLines: false }];
  ws.pageSetup = { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0, paperSize: 9 };
  ws.headerFooter.oddFooter = "&LChase list by store&RPage &P of &N";
}
async function xlSave(wb, name){
  const buf = await wb.xlsx.writeBuffer();
  const url = URL.createObjectURL(new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
  const a = document.createElement("a"); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}
async function xlRun(btn, build){
  const label = btn ? btn.innerHTML : ""; if (btn) { btn.disabled = true; btn.innerHTML = "Preparing Excel…"; }
  try { const ExcelJS = await loadExcelJS(); await build(ExcelJS); toast("Excel downloaded"); }
  catch (err) { toast(err.message || "Couldn't make the Excel file"); }
  finally { if (btn) { btn.disabled = false; btn.innerHTML = label; } }
}
const xlNewBook = ExcelJS => { const wb = new ExcelJS.Workbook(); wb.creator = "Trackit"; wb.created = new Date(); return wb; };

// ======== Employees page: full staff workbook ========
function downloadStaffExcel(btn){
  return xlRun(btn, async ExcelJS => {
    const admin = isAdmin(), emps = [...S.emps].sort(xlUrgent), left = [...S.left];
    const wb = xlNewBook(ExcelJS);
    const cnt = s => emps.filter(e => statusOf(e) === s).length;

    // 1. Summary
    const sm = wb.addWorksheet("Summary", { properties: { tabColor: { argb: XL.ink } } });
    let r = xlBanner(sm, "TRACKIT · Baladiya Health Card Report", `${xlScope()} · Generated ${xlNow()} by ${xlWho()}`, 13);
    r = xlTiles(sm, r, [
      { value: emps.length, label: "Active staff" }, { value: emps.filter(e => e.verified_at).length, label: "Verified on Balady", color: XL.teal },
      { value: cnt("exp"), label: "Expired", color: XL.red }, { value: cnt("due"), label: `Due within ${DUE_DAYS} days`, color: XL.amb },
      { value: cnt("miss"), label: "Date missing", color: XL.grey }, { value: cnt("ok"), label: "OK", color: XL.teal },
    ]);
    const cols6 = first => [{ h: first, v: g => g.k, kind: "text", bold: true }, { h: "Staff", v: g => g.total, kind: "num" }, { h: "Verified", v: g => g.pct, kind: "pct" }, { h: "Expired", v: g => g.exp, kind: "num", red: true }, { h: "Due", v: g => g.due, kind: "num" }, { h: "No date", v: g => g.miss, kind: "num" }];
    const worst = (a, b) => b.exp - a.exp || b.act - a.act || a.k.localeCompare(b.k);
    const a1 = xlMini(sm, r, 2, "By Region", cols6("Region"), xlGroup(emps, e => geo("region", e)).sort(worst));
    const a2 = xlMini(sm, r, 9, "By Area Manager (most expired first)", cols6("Area Manager"), xlGroup(emps, e => geo("area_manager", e)).sort(worst));
    sm.getColumn(2).width = 22; sm.getColumn(9).width = 22;
    const note = sm.getCell(Math.max(a1, a2) + 1, 2);
    note.value = `Statuses count only staff verified on the Balady website. "Due soon" = expiring within ${DUE_DAYS} days.${admin ? "" : " Iqama and mobile numbers are included for admins only."}`;
    note.font = { name: XL_FONT, size: 9.5, italic: true, color: { argb: XL.mute } };

    // 2. All Staff
    const all = wb.addWorksheet("All Staff", { properties: { tabColor: { argb: XL.teal } } });
    const staffCols = [
      { h: "#", w: 6, v: (e, i) => i + 1, kind: "num" },
      { h: "Employee No", w: 13, v: e => eid(e), kind: "text" },
      { h: "Name", w: 30, v: e => e.name, kind: "text", bold: true },
      ...(admin ? [{ h: "Iqama / ID", w: 14, v: e => e.iqama, kind: "text" }] : []),
      { h: "Nationality", w: 13, v: e => e.nationality, kind: "text" },
      ...(admin ? [{ h: "Mobile", w: 13, v: e => e.mobile, kind: "text" }] : []),
      { h: "Job Role", w: 18, v: e => e.job_role, kind: "text" },
      { h: "Store / Dept", w: 28, v: e => placeOf(e), kind: "text" },
      { h: "Store Code", w: 10, v: e => xlCode(e), kind: "text" },
      { h: "Area Manager", w: 20, v: e => xlGeo("area_manager", e), kind: "text" },
      { h: "ROM", w: 20, v: e => xlGeo("rom", e), kind: "text" },
      { h: "City", w: 13, v: e => xlGeo("city", e), kind: "text" },
      { h: "Region", w: 15, v: e => xlGeo("region", e), kind: "text" },
      { h: "Expiry Date", w: 13, v: e => e.expiry, kind: "date" },
      { h: "Days Left", w: 10, v: e => e.expiry ? daysLeft(e.expiry) : null, kind: "days" },
      { h: "Status", w: 14, v: e => XL_STATUS[statusOf(e)].label, kind: "status" },
      { h: "Card Status", w: 30, v: e => e.card_status, kind: "text" },
      { h: "Verified On", w: 13, v: e => e.verified_at, kind: "date" },
      { h: "Verified By", w: 22, v: e => e.verified_by_name, kind: "text" },
      { h: "Remarks", w: 34, v: e => e.remarks, kind: "text", wrap: false },
      { h: "Last Reminded", w: 13, v: e => xlReminded(e), kind: "date" },
      { h: "Last Updated", w: 13, v: e => e.updated_at, kind: "date" },
      { h: "Updated By", w: 22, v: e => e.updated_by_name, kind: "text" },
    ];
    let start = xlTitle(all, "ALL STAFF", `${xlScope()} · ${emps.length.toLocaleString()} active staff · most urgent first · ${xlNow()}`, staffCols.length);
    xlTable(all, start, staffCols, emps, { freezeCols: 3 });

    // 3. Needs Action
    const act = emps.filter(e => ["exp", "due", "miss"].includes(statusOf(e)));
    xlChase(wb.addWorksheet("Needs Action", { properties: { tabColor: { argb: XL.red } } }), act, admin);

    // 4. By Store
    const bs = wb.addWorksheet("By Store", { properties: { tabColor: { argb: XL.tan } } });
    const groups = xlGroup(emps, placeOf).sort((a, b) => b.exp - a.exp || b.act - a.act || a.k.localeCompare(b.k));
    const storeCols = [
      { h: "Store / Dept", w: 30, v: g => g.k, kind: "text", bold: true }, { h: "Code", w: 9, v: g => xlCode(g.any), kind: "text" },
      { h: "Area Manager", w: 22, v: g => xlGeo("area_manager", g.any), kind: "text" }, { h: "ROM", w: 22, v: g => xlGeo("rom", g.any), kind: "text" },
      { h: "City", w: 14, v: g => xlGeo("city", g.any), kind: "text" }, { h: "Region", w: 16, v: g => xlGeo("region", g.any), kind: "text" },
      { h: "Staff", w: 9, v: g => g.total, kind: "num" }, { h: "Verified %", w: 11, v: g => g.pct, kind: "num", style: c => c.numFmt = "0%" },
      { h: "Expired", w: 10, v: g => g.exp, kind: "num", style: (c, g) => { if (g.exp) { c.fill = xlFill(XL.redbg); c.font = { name: XL_FONT, bold: true, color: { argb: XL.red } }; } } },
      { h: "Due", w: 9, v: g => g.due, kind: "num", style: (c, g) => { if (g.due) c.font = { name: XL_FONT, bold: true, color: { argb: XL.amb } }; } },
      { h: "No date", w: 9, v: g => g.miss, kind: "num" }, { h: "OK", w: 9, v: g => g.ok, kind: "num" },
    ];
    start = xlTitle(bs, "BY STORE", `${xlScope()} · ${groups.length} stores and departments · problem stores first · ${xlNow()}`, storeCols.length);
    const lastRow = xlTable(bs, start, storeCols, groups, { freezeCols: 1 });
    if (groups.length) bs.addConditionalFormatting({ ref: `H${start + 1}:H${lastRow}`, rules: [{ type: "dataBar", minLength: 0, maxLength: 100, cfvo: [{ type: "num", value: 0 }, { type: "num", value: 1 }], color: { argb: XL.teal }, gradient: false }] });

    // 5. Left Staff
    const ls = wb.addWorksheet("Left Staff", { properties: { tabColor: { argb: XL.grey } } });
    const leftCols = [
      { h: "#", w: 6, v: (e, i) => i + 1, kind: "num" }, { h: "Employee No", w: 13, v: e => eid(e), kind: "text" },
      { h: "Name", w: 30, v: e => e.name, kind: "text", bold: true }, ...(admin ? [{ h: "Iqama / ID", w: 14, v: e => e.iqama, kind: "text" }] : []),
      { h: "Last Store / Dept", w: 28, v: e => placeOf(e), kind: "text" }, { h: "Left On", w: 13, v: e => e.left_at, kind: "date" },
      { h: "Marked By", w: 24, v: e => e.updated_by_name, kind: "text" }, { h: "Remarks", w: 34, v: e => e.remarks, kind: "text" },
    ];
    start = xlTitle(ls, "LEFT STAFF", `${xlScope()} · ${left.length} people marked as left · ${xlNow()}`, leftCols.length, XL.greyHead);
    xlTable(ls, start, leftCols, left, { freezeCols: 3, head: XL.greyHead, empty: "Nobody has been marked as left." });

    await xlSave(wb, xlSafeName(`Trackit Staff - ${xlScope()} - ${xlStamp()}.xlsx`));
  });
}

// ======== Alerts page: expired / due / date missing workbook ========
function downloadAlertsExcel(btn){
  return xlRun(btn, async ExcelJS => {
    const admin = isAdmin();
    const { am, rom, city, region } = S.filters; const mf = (v, w) => !w || (w === "__none" ? !v : v === w);
    const inArea = e => mf(GROUPS.am[1](e), am) && mf(GROUPS.rom[1](e), rom) && mf(GROUPS.city[1](e), city) && mf(GROUPS.region[1](e), region);
    const by = s => S.emps.filter(e => statusOf(e) === s && inArea(e));
    const exp = by("exp").sort((a, b) => daysLeft(a.expiry) - daysLeft(b.expiry)), due = by("due").sort((a, b) => daysLeft(a.expiry) - daysLeft(b.expiry)), miss = by("miss").sort((a, b) => placeOf(a).localeCompare(placeOf(b)) || String(a.name).localeCompare(String(b.name)));
    const area = [am && `Area Manager: ${am}`, rom && `ROM: ${rom}`, city && `City: ${city}`, region && `Region: ${region}`].filter(Boolean).map(x => x.replace("__none", "(none)")).join(" · ");
    const scope = xlScope() + (area ? ` · ${area}` : "");
    const wb = xlNewBook(ExcelJS);

    // 1. Summary
    const sm = wb.addWorksheet("Summary", { properties: { tabColor: { argb: XL.ink } } });
    let r = xlBanner(sm, "TRACKIT · Baladiya Alerts", `${scope} · Generated ${xlNow()} by ${xlWho()}`, 13);
    r = xlTiles(sm, r, [
      { value: exp.length, label: "Expired", color: XL.red }, { value: due.length, label: `Due within ${DUE_DAYS} days`, color: XL.amb },
      { value: miss.length, label: "Date missing", color: XL.grey }, { value: exp.length + due.length + miss.length, label: "Total to action" },
    ]);
    const all = [...exp, ...due, ...miss];
    const cols = first => [{ h: first, v: g => g.k, kind: "text", bold: true }, { h: "Expired", v: g => g.exp, kind: "num", red: true }, { h: "Due", v: g => g.due, kind: "num" }, { h: "No date", v: g => g.miss, kind: "num" }, { h: "Total", v: g => g.act, kind: "num" }];
    const worst = (a, b) => b.exp - a.exp || b.act - a.act || a.k.localeCompare(b.k);
    const stores = xlGroup(all, placeOf).sort(worst).slice(0, 10).map(g => ({ ...g, k: g.k + (xlCode(g.any) ? ` (${xlCode(g.any)})` : "") }));
    const a1 = xlMini(sm, r, 2, "Top 10 stores to chase", cols("Store"), stores);
    const a2 = xlMini(sm, r, 9, "By Area Manager (most expired first)", cols("Area Manager"), xlGroup(all, e => geo("area_manager", e)).sort(worst));
    sm.getColumn(2).width = 30; sm.getColumn(9).width = 24;
    const note = sm.getCell(Math.max(a1, a2) + 1, 2);
    note.value = `Only staff verified on the Balady website are counted. "Reminded On" is the last WhatsApp reminder sent from Trackit.${admin ? "" : " Mobile numbers are included for admins only."}`;
    note.font = { name: XL_FONT, size: 9.5, italic: true, color: { argb: XL.mute } };

    // shared columns for the three lists
    const base = extra => [
      { h: "#", w: 6, v: (e, i) => i + 1, kind: "num" }, { h: "Employee No", w: 13, v: e => eid(e), kind: "text" },
      { h: "Name", w: 30, v: e => e.name, kind: "text", bold: true },
      ...(admin ? [{ h: "Mobile", w: 13, v: e => e.mobile, kind: "text" }] : []),
      { h: "Store / Dept", w: 28, v: e => placeOf(e), kind: "text" }, { h: "Area Manager", w: 20, v: e => xlGeo("area_manager", e), kind: "text" },
      { h: "ROM", w: 20, v: e => xlGeo("rom", e), kind: "text" }, { h: "City", w: 13, v: e => xlGeo("city", e), kind: "text" },
      ...extra,
      { h: "Card Status", w: 30, v: e => e.card_status, kind: "text" }, { h: "Remarks", w: 34, v: e => e.remarks, kind: "text" },
      { h: "Reminded On", w: 13, v: e => xlReminded(e), kind: "date" },
    ];
    // 2. Expired — darker red the longer it's overdue
    const ex = wb.addWorksheet("Expired", { properties: { tabColor: { argb: XL.red } } });
    const exCols = base([{ h: "Expiry Date", w: 13, v: e => e.expiry, kind: "date" }, { h: "Days Overdue", w: 12, v: e => -daysLeft(e.expiry), kind: "num", style: c => c.font = { name: XL_FONT, bold: true, color: { argb: XL.red } } }]);
    let s = xlTitle(ex, "EXPIRED", `${scope} · ${exp.length} people · most overdue first · ${xlNow()}`, exCols.length, XL.redHead);
    xlTable(ex, s, exCols, exp, { head: XL.redHead, freezeCols: 3, empty: "Nobody is expired." });
    if (exp.length) { const L = ex.getColumn(exCols.findIndex(c => c.h === "Days Overdue") + 1).letter; ex.addConditionalFormatting({ ref: `${L}${s + 1}:${L}${s + exp.length}`, rules: [{ type: "colorScale", cfvo: [{ type: "min" }, { type: "max" }], color: [{ argb: "FFFEF1EA" }, { argb: "FFF4A582" }] }] }); }
    // 3. Due — anyone within 7 days highlighted
    const du = wb.addWorksheet(`Due within ${DUE_DAYS} days`, { properties: { tabColor: { argb: XL.amb } } });
    const duCols = base([{ h: "Expiry Date", w: 13, v: e => e.expiry, kind: "date" }, { h: "Days Left", w: 10, v: e => daysLeft(e.expiry), kind: "num", style: (c, e, v) => { c.font = { name: XL_FONT, bold: true, color: { argb: XL.amb } }; if (v <= 7) c.fill = xlFill(XL.ambbg); } }]);
    s = xlTitle(du, `DUE WITHIN ${DUE_DAYS} DAYS`, `${scope} · ${due.length} people · soonest first · 7 days or less highlighted · ${xlNow()}`, duCols.length, XL.ambHead);
    xlTable(du, s, duCols, due, { head: XL.ambHead, freezeCols: 3, empty: `Nobody is due in the next ${DUE_DAYS} days.` });
    // 4. Date missing
    const mi = wb.addWorksheet("Date missing", { properties: { tabColor: { argb: XL.grey } } });
    const miCols = base([{ h: "What the file said", w: 26, v: e => e.expiry_note || e.file_note || "", kind: "text" }]);
    s = xlTitle(mi, "DATE MISSING", `${scope} · ${miss.length} people verified on Balady without an expiry date · ${xlNow()}`, miCols.length, XL.greyHead);
    xlTable(mi, s, miCols, miss, { head: XL.greyHead, freezeCols: 3, empty: "Nobody has a missing date." });
    // 5. Chase list
    xlChase(wb.addWorksheet("Chase List by Store", { properties: { tabColor: { argb: XL.tan } } }), all, admin);

    await xlSave(wb, xlSafeName(`Trackit Alerts - ${xlScope()}${area ? " - filtered" : ""} - ${xlStamp()}.xlsx`));
  });
}
