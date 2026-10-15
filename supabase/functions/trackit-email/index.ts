import { createClient } from "npm:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-trackit-token",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });
const APP_URL = "https://shandrif.github.io/trackit/";
const DAY = 86400000;
const esc = (v: unknown) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));

// Find the Brevo key even if the secret name has a small typo.
function brevoKey(): string | null {
  const exact = Deno.env.get("BREVO_API_KEY");
  if (exact && exact.trim()) return exact.trim();
  const env = Deno.env.toObject();
  for (const [k, v] of Object.entries(env)) {
    if (/brevo|sendinblue/i.test(k) && (v || "").trim()) return v.trim();
  }
  for (const v of Object.values(env)) if ((v || "").trim().startsWith("xkeysib-")) return v.trim();
  return null;
}

// Riyadh is UTC+3 all year (no daylight saving)
function riyadhNow() {
  const d = new Date(Date.now() + 3 * 3600000);
  return { date: d.toISOString().slice(0, 10), hour: d.getUTCHours(), weekday: d.getUTCDay() };
}
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const fmt = (d: string) => { const [y, m, dd] = d.split("-"); return `${dd} ${MONTHS[+m - 1]} ${y}`; };

function buildEmail(rows: any[], today: string) {
  const t = Date.parse(today);
  const exp: any[] = [], due: any[] = []; let missing = 0;
  for (const r of rows) {
    if (!r.expiry) { missing++; continue; }
    const n = Math.round((Date.parse(r.expiry) - t) / DAY);
    if (n < 0) exp.push({ ...r, n }); else if (n <= 30) due.push({ ...r, n });
  }
  exp.sort((a, b) => a.n - b.n); due.sort((a, b) => a.n - b.n);
  const cell = "padding:8px 10px;border-bottom:1px solid #EFE5D8;font-size:13px;color:#111";
  const head = "padding:8px 10px;text-align:left;font-size:11px;letter-spacing:.04em;text-transform:uppercase;color:#6E655B;background:#F7F1E9";
  const table = (list: any[], kind: "exp" | "due") => list.length ? `
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;background:#fff;border:1px solid #EFE5D8;border-radius:10px">
      <tr><th style="${head}">Employee</th><th style="${head}">Store</th><th style="${head}">Expiry</th></tr>
      ${list.map((r) => `<tr><td style="${cell}"><b>${esc(r.name)}</b><br><span style="color:#6E655B;font-size:12px">${esc(r.employee_id)}</span></td><td style="${cell}">${esc(r.store)}</td>
        <td style="${cell};white-space:nowrap">${fmt(r.expiry)}<br><span style="font-size:12px;color:${kind === "exp" ? "#C2412D" : "#A9875F"}">${kind === "exp" ? `${-r.n} day${r.n === -1 ? "" : "s"} ago` : r.n === 0 ? "today" : `in ${r.n} day${r.n === 1 ? "" : "s"}`}</span></td></tr>`).join("")}
    </table>` : `<p style="font-size:13px;color:#6E655B;margin:0">Nobody.</p>`;
  const kpi = (label: string, v: number, col: string) => `<td style="padding:12px 14px;background:#fff;border:1px solid #EFE5D8;border-radius:10px" width="33%"><div style="font-size:12px;color:#6E655B">${label}</div><div style="font-size:26px;font-weight:700;color:${col}">${v}</div></td>`;
  const html = `<!doctype html><html><body style="margin:0;background:#F5EDE3;font-family:'Frutiger LT Arabic',Frutiger,'Segoe UI',Arial,sans-serif">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td align="center" style="padding:24px 12px">
  <table role="presentation" width="640" cellspacing="0" cellpadding="0" style="max-width:640px;width:100%">
    <tr><td style="background:#111;border-radius:12px;padding:16px 20px;color:#fff">
      <img src="${APP_URL}icon-email.png" width="34" height="34" alt="Trackit" style="display:inline-block;width:34px;height:34px;border-radius:8px;vertical-align:middle;border:0">
      <span style="font-size:18px;font-weight:700;vertical-align:middle;margin-left:8px">Trackit</span>
      <span style="float:right;color:#D4B38B;font-size:13px;line-height:34px">Baladiya card alert · ${fmt(today)}</span></td></tr>
    <tr><td style="padding:18px 0 6px"><table role="presentation" width="100%" cellspacing="8" cellpadding="0" style="margin:0 -8px"><tr>
      ${kpi("Expired", exp.length, "#C2412D")}${kpi("Due in 30 days", due.length, "#A9875F")}${kpi("Date missing", missing, "#6E655B")}</tr></table></td></tr>
    <tr><td style="padding:14px 0 8px"><h2 style="margin:0;font-size:16px;color:#C2412D">Expired — renew now (${exp.length})</h2></td></tr>
    <tr><td>${table(exp, "exp")}</td></tr>
    <tr><td style="padding:20px 0 8px"><h2 style="margin:0;font-size:16px;color:#A9875F">Expiring within 30 days (${due.length})</h2></td></tr>
    <tr><td>${table(due, "due")}</td></tr>
    <tr><td align="center" style="padding:24px 0 8px"><a href="${APP_URL}#alerts" style="display:inline-block;background:#111;color:#fff;text-decoration:none;padding:12px 22px;border-radius:10px;font-weight:700;font-size:14px">Open Trackit</a></td></tr>
    <tr><td align="center" style="padding:8px 0;font-size:11px;color:#9b8f80">Sent automatically by Trackit. Change receivers or turn alerts off in Trackit → Users → Email alerts.</td></tr>
  </table></td></tr></table></body></html>`;
  const subject = `Trackit: ${exp.length} expired, ${due.length} expiring within 30 days`;
  return { html, subject, exp: exp.length, due: due.length };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const service = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
    const body = await req.json().catch(() => ({}));
    const mode = body.mode === "cron" ? "cron" : "test";
    const { data: st } = await service.from("trackit_settings").select("*").eq("id", 1).single();
    if (!st) return json({ error: "Settings not found" }, 500);

    if (mode === "cron") {
      if ((req.headers.get("x-trackit-token") || "") !== st.cron_token) return json({ error: "Not allowed" }, 401);
    } else {
      const token = (req.headers.get("Authorization") || "").replace("Bearer ", "");
      const { data: u } = await service.auth.getUser(token);
      if (!u?.user) return json({ error: "Not signed in" }, 401);
      const { data: me } = await service.from("trackit_profiles").select("role").eq("id", u.user.id).maybeSingle();
      if (me?.role !== "admin") return json({ error: "Admins only" }, 403);
    }

    const now = riyadhNow();
    if (mode === "cron") {
      if (!st.email_enabled) return json({ skipped: "alerts are off" });
      if (now.hour !== st.send_hour) return json({ skipped: "not the send hour" });
      if (st.frequency === "weekly" && now.weekday !== st.weekday) return json({ skipped: "not the send day" });
      if (st.last_sent === now.date) return json({ skipped: "already sent today" });
    }

    const recipients: string[] = (st.recipients || []).map((e: string) => e.trim()).filter((e: string) => /.+@.+\..+/.test(e));
    if (!recipients.length) return json({ error: "Add at least one receiver email first." }, 400);
    if (!/.+@.+\..+/.test(st.sender_email || "")) return json({ error: "Add the sender email (the one you verified in Brevo) first." }, 400);
    const key = brevoKey();
    if (!key) return json({ error: "The Brevo key hasn't been added yet. Add it in Supabase as a secret named BREVO_API_KEY." }, 503);

    const rows: any[] = [];
    for (let from = 0; ; from += 1000) {
      const { data, error } = await service.from("trackit_staff").select("employee_id,name,store,expiry").order("expiry").range(from, from + 999);
      if (error) return json({ error: error.message }, 500);
      rows.push(...(data || []));
      if (!data || data.length < 1000) break;
    }
    const mail = buildEmail(rows, now.date);
    if (mode === "cron" && mail.exp === 0 && mail.due === 0) {
      await service.from("trackit_settings").update({ last_sent: now.date, last_result: `${now.date}: nothing expired or due — no email needed` }).eq("id", 1);
      return json({ skipped: "nothing to report" });
    }

    const r = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: { "api-key": key, "Content-Type": "application/json", accept: "application/json" },
      body: JSON.stringify({
        sender: { email: st.sender_email, name: st.sender_name || "Trackit" },
        to: recipients.map((email) => ({ email })),
        subject: (mode === "test" ? "[Test] " : "") + mail.subject,
        htmlContent: mail.html,
      }),
    });
    const text = await r.text();
    if (!r.ok) {
      let msg = text.slice(0, 300);
      try { msg = JSON.parse(text).message || msg; } catch { /* keep text */ }
      if (r.status === 401) msg = "Brevo rejected the key. Check BREVO_API_KEY in Supabase.";
      await service.from("trackit_settings").update({ last_result: `${now.date}: failed — ${msg}` }).eq("id", 1);
      return json({ error: "Brevo: " + msg }, 502);
    }
    const note = `${now.date}: ${mode === "test" ? "test " : ""}email sent to ${recipients.length} receiver${recipients.length === 1 ? "" : "s"} (${mail.exp} expired, ${mail.due} due)`;
    await service.from("trackit_settings").update(mode === "cron" ? { last_sent: now.date, last_result: note } : { last_result: note }).eq("id", 1);
    return json({ ok: true, sent: recipients.length, expired: mail.exp, due: mail.due });
  } catch (e) {
    return json({ error: String((e as any)?.message || e) }, 500);
  }
});
