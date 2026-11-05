// ---------- PDF alerts report for the scheduled email (jsPDF + autoTable) ----------
// Uses the same helpers as the Excel file (statusOf, placeOf, geo, …), so both attachments always agree.
function makeAlertsPdfDoc(jsPDF, autoTable){
  const C = { ink: [27, 23, 20], tan: [212, 180, 138], sand: [244, 239, 232], mute: [110, 101, 91], red: [194, 65, 12], redbg: [253, 232, 221],
    redHead: [124, 45, 18], amb: [180, 83, 9], ambbg: [254, 243, 199], ambHead: [146, 64, 14], grey: [107, 114, 128], greyHead: [75, 85, 99], teal: [31, 122, 109], band: [250, 248, 245] };
  const emps = S.emps, by = s => emps.filter(e => statusOf(e) === s);
  const exp = by("exp").sort((a, b) => daysLeft(a.expiry) - daysLeft(b.expiry));
  const due = by("due").sort((a, b) => daysLeft(a.expiry) - daysLeft(b.expiry));
  const miss = by("miss").sort((a, b) => placeOf(a).localeCompare(placeOf(b)) || String(a.name).localeCompare(String(b.name)));
  const verified = emps.filter(e => e.verified_at).length;
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const W = doc.internal.pageSize.getWidth(), M = 12;
  const fmtD = d => d ? (() => { const [y, m, dd] = String(d).slice(0, 10).split("-"); return `${dd}-${MONTHS[+m - 1]}-${y}`; })() : "";
  const txt = v => String(v ?? "").replace(/[^\x20-\x7E -ÿ]/g, "").trim(); // built-in PDF fonts only cover Latin letters

  // page 1: banner, tiles, two summary tables
  doc.setFillColor(...C.ink); doc.roundedRect(M, M, W - 2 * M, 24, 2, 2, "F");
  doc.setTextColor(255, 255, 255); doc.setFont("helvetica", "bold"); doc.setFontSize(19);
  doc.text("TRACKIT  ·  Baladiya Alerts", M + 7, M + 11);
  doc.setFont("helvetica", "normal"); doc.setFontSize(9.5); doc.setTextColor(207, 198, 187);
  doc.text(`All stores  ·  Generated ${xlNow()} (Riyadh)  ·  only staff verified on the Balady website are counted`, M + 7, M + 18);
  doc.setTextColor(...C.tan); doc.setFont("helvetica", "bold"); doc.setFontSize(10); doc.text("HALF MILLION", W - M - 7, M + 11, { align: "right" });

  const tiles = [[exp.length, "Expired", C.red], [due.length, `Due within ${DUE_DAYS} days`, C.amb], [miss.length, "Date missing", C.grey],
    [`${emps.length ? Math.round(verified / emps.length * 100) : 0}%`, `Verified on Balady (${verified.toLocaleString()} of ${emps.length.toLocaleString()})`, C.teal]];
  const tw = (W - 2 * M - 3 * 5) / 4, ty = M + 30;
  tiles.forEach(([v, l, col], i) => {
    const x = M + i * (tw + 5);
    doc.setDrawColor(230, 224, 216); doc.setFillColor(255, 255, 255); doc.roundedRect(x, ty, tw, 24, 1.5, 1.5, "FD");
    doc.setFillColor(...col); doc.rect(x, ty, tw, 1.6, "F");
    doc.setTextColor(...col); doc.setFont("helvetica", "bold"); doc.setFontSize(22); doc.text(String(typeof v === "number" ? v.toLocaleString() : v), x + 5, ty + 13);
    doc.setTextColor(...C.mute); doc.setFont("helvetica", "normal"); doc.setFontSize(9); doc.text(l, x + 5, ty + 20);
  });

  const group = (list, key) => { const m = new Map(); for (const e of list) { const k = key(e) || "—"; const g = m.get(k) || { k, exp: 0, due: 0, miss: 0, any: e }; g[statusOf(e)]++; m.set(k, g); } return [...m.values()].map(g => ({ ...g, act: g.exp + g.due + g.miss })).sort((a, b) => b.exp - a.exp || b.act - a.act || a.k.localeCompare(b.k)); };
  const all = [...exp, ...due, ...miss];
  const stores = group(all, placeOf).slice(0, 12), ams = group(all, e => geo("area_manager", e));
  const half = (W - 2 * M - 8) / 2, sy = ty + 33;
  const mini = (title, first, rows, x, withAm) => {
    doc.setTextColor(...C.ink); doc.setFont("helvetica", "bold"); doc.setFontSize(11.5); doc.text(title, x, sy - 2.5);
    autoTable(doc, {
      startY: sy, margin: { left: x, right: W - x - half }, tableWidth: half, theme: "plain",
      head: [[first, ...(withAm ? ["Area Manager"] : []), "Expired", "Due", "No date", "Total"]],
      body: rows.map(g => [txt(g.k) + (withAm && xlCode(g.any) ? ` (${xlCode(g.any)})` : ""), ...(withAm ? [txt(xlGeo("area_manager", g.any))] : []), g.exp, g.due, g.miss, g.act]),
      styles: { font: "helvetica", fontSize: 8.6, cellPadding: { top: 1.6, bottom: 1.6, left: 2, right: 2 }, lineColor: [239, 234, 227], lineWidth: { bottom: 0.2 } },
      headStyles: { fillColor: C.sand, textColor: C.ink, fontStyle: "bold", lineColor: C.tan, lineWidth: { bottom: 0.6 } },
      columnStyles: Object.fromEntries([...Array(withAm ? 6 : 5).keys()].slice(withAm ? 2 : 1).map(i => [i, { halign: "right" }])),
      didParseCell: d => { if (d.section === "body" && d.column.index === (withAm ? 2 : 1) && Number(d.cell.raw) > 0) { d.cell.styles.textColor = C.red; d.cell.styles.fontStyle = "bold"; } },
      bodyStyles: { textColor: C.ink }, alternateRowStyles: { fillColor: C.band },
    });
  };
  if (all.length) { mini("Top stores to chase", "Store", stores, M, true); mini("By Area Manager (most expired first)", "Area Manager", ams, M + half + 8, false); }
  else { doc.setTextColor(...C.teal); doc.setFontSize(13); doc.text("Nothing expired, due or missing - well done.", M, sy + 4); }

  // detail pages
  const section = (title, list, head, color, extraHead, extraVal, emptyMsg) => {
    doc.addPage();
    doc.setFillColor(...head); doc.rect(M, M, W - 2 * M, 11, "F");
    doc.setTextColor(255, 255, 255); doc.setFont("helvetica", "bold"); doc.setFontSize(13); doc.text(`${title}  (${list.length})`, M + 4, M + 7.5);
    if (!list.length) { doc.setTextColor(...C.mute); doc.setFont("helvetica", "italic"); doc.setFontSize(10); doc.text(emptyMsg, M, M + 20); return; }
    autoTable(doc, {
      startY: M + 14, margin: { left: M, right: M, top: M + 4, bottom: 14 }, theme: "grid",
      head: [["#", "Emp No", "Name", "Iqama", "Mobile", "Store / Dept", "Area Manager", extraHead[0], extraHead[1], "Card Status", "Reminded"]],
      body: list.map((e, i) => [i + 1, eid(e), txt(e.name), e.iqama || "", e.mobile || "", txt(placeOf(e)), txt(xlGeo("area_manager", e)), ...extraVal(e), txt(e.card_status), fmtD(xlReminded(e))]),
      styles: { font: "helvetica", fontSize: 7.6, cellPadding: 1.5, lineColor: [230, 224, 216], lineWidth: 0.15, textColor: C.ink, overflow: "linebreak" },
      headStyles: { fillColor: head, textColor: 255, fontStyle: "bold", fontSize: 7.8 },
      alternateRowStyles: { fillColor: C.band },
      columnStyles: { 0: { cellWidth: 8, halign: "right" }, 1: { cellWidth: 14 }, 2: { cellWidth: 46, fontStyle: "bold" }, 3: { cellWidth: 21 }, 4: { cellWidth: 19 }, 5: { cellWidth: 36 }, 6: { cellWidth: 30 }, 7: { cellWidth: 20 }, 8: { cellWidth: 17, halign: "right", fontStyle: "bold", textColor: color }, 10: { cellWidth: 18 } },
    });
  };
  section("EXPIRED - renew now", exp, C.redHead, C.red, ["Expiry", "Days over"], e => [fmtD(e.expiry), -daysLeft(e.expiry)], "Nobody is expired.");
  section(`DUE WITHIN ${DUE_DAYS} DAYS`, due, C.ambHead, C.amb, ["Expiry", "Days left"], e => [fmtD(e.expiry), daysLeft(e.expiry)], `Nobody is due in the next ${DUE_DAYS} days.`);
  section("DATE MISSING", miss, C.greyHead, C.grey, ["File said", ""], e => [txt(e.expiry_note || e.file_note || ""), ""], "Nobody has a missing date.");

  const n = doc.getNumberOfPages();
  for (let i = 1; i <= n; i++) {
    doc.setPage(i); doc.setFont("helvetica", "normal"); doc.setFontSize(8); doc.setTextColor(...C.mute);
    doc.text(`Trackit  ·  Baladiya alerts  ·  ${xlStamp()}`, M, doc.internal.pageSize.getHeight() - 6);
    doc.text(`Page ${i} of ${n}`, W - M, doc.internal.pageSize.getHeight() - 6, { align: "right" });
  }
  return new Uint8Array(doc.output("arraybuffer"));
}
