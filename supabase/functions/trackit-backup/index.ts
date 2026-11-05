// Daily backup of all Trackit data.
// - Runs every night from pg_cron (header x-trackit-token) or on demand by an admin ("Back up now").
// - Writes one JSON (gzipped) and one Excel file to the private "trackit-backups" bucket:
//     latest/…   ← newest backup (overwritten each day)
//     previous/… ← the one before it
// - Safety: if active staff dropped by more than 20% since the last backup, the good copy is NOT overwritten.
// - Optional off-site copy to OneDrive when MS_TENANT_ID / MS_CLIENT_ID / MS_CLIENT_SECRET / MS_ONEDRIVE_USER are set.
// - Emails the Excel file each night to the address in trackit_backup_status.email_to (Brevo), so a
//   Power Automate flow can save it into OneDrive.
// - Passwords and secret keys are never included.
import { createClient } from "npm:@supabase/supabase-js@2";
import * as XLSX from "npm:xlsx@0.18.5";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-trackit-token",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

const BUCKET = "trackit-backups";
const JSON_NAME = "trackit-backup.json.gz";
const XLSX_NAME = "trackit-backup.xlsx";
const ONEDRIVE_FOLDER = "Trackit Backups";
const DROP_LIMIT = 0.8; // refuse to overwrite if active staff < 80% of the last backup

// table → columns to keep (null = all). Secrets are left out on purpose.
const TABLES: Record<string, string | null> = {
  trackit_staff: null,
  trackit_staff_history: null,
  trackit_store_map: null,
  trackit_store_alias: null,
  trackit_departments: null,
  trackit_profiles: "id,email,full_name,role,scope_kind,scope_value,created_at", // no passwords anywhere
  trackit_move_requests: null,
  trackit_reminders: null,
  trackit_week_totals: null,
  trackit_map_meta: null,
  trackit_settings: "id,email_enabled,recipients,sender_email,sender_name,frequency,weekday,send_hour,last_sent,last_result", // no cron token
};

async function readAll(service: any, table: string, cols: string | null) {
  const rows: any[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await service.from(table).select(cols || "*").range(from, from + 999);
    if (error) throw new Error(`${table}: ${error.message}`);
    rows.push(...(data || []));
    if (!data || data.length < 1000) break;
  }
  return rows;
}

async function gzip(text: string): Promise<Uint8Array> {
  const stream = new Blob([text]).stream().pipeThrough(new CompressionStream("gzip"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

function toXlsx(data: Record<string, any[]>, meta: Record<string, unknown>): Uint8Array {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(Object.entries(meta).map(([k, v]) => ({ item: k, value: typeof v === "object" ? JSON.stringify(v) : v }))), "About");
  for (const [t, rows] of Object.entries(data)) {
    const flat = rows.map((r) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, v !== null && typeof v === "object" ? JSON.stringify(v) : v])));
    XLSX.utils.book_append_sheet(wb, flat.length ? XLSX.utils.json_to_sheet(flat) : XLSX.utils.aoa_to_sheet([["(empty)"]]), t.replace(/^trackit_/, "").slice(0, 31));
  }
  return new Uint8Array(XLSX.write(wb, { type: "array", bookType: "xlsx", compression: true }) as ArrayBuffer);
}

// ---------- nightly email with the Excel attached (Brevo, same sender as the alert emails) ----------
function brevoKey(): string | null {
  const exact = Deno.env.get("BREVO_API_KEY");
  if (exact && exact.trim()) return exact.trim();
  for (const [k, v] of Object.entries(Deno.env.toObject())) if (/brevo|sendinblue/i.test(k) && (v || "").trim()) return v.trim();
  return null;
}
function b64(bytes: Uint8Array): string {
  let bin = ""; for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}
async function emailBackup(service: any, to: string, xlsx: Uint8Array, summary: string): Promise<string> {
  if (!to) return "off";
  const key = brevoKey(); if (!key) return "failed: no Brevo key";
  const { data: st } = await service.from("trackit_settings").select("sender_email,sender_name").eq("id", 1).single();
  if (!st?.sender_email) return "failed: no sender email in Trackit settings";
  const day = new Date(Date.now() + 3 * 3600_000).toISOString().slice(0, 10); // Riyadh date
  const r = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST", headers: { "api-key": key, "Content-Type": "application/json", accept: "application/json" },
    body: JSON.stringify({
      sender: { email: st.sender_email, name: st.sender_name || "Trackit" },
      to: [{ email: to }],
      subject: `Trackit backup ${day}`,
      htmlContent: `<p>Nightly Trackit backup for ${day}.</p><p>${summary.replace(/[<>&]/g, "")}</p><p>The attached file contains staff personal data (Iqama, mobile). Keep it in your company OneDrive only.</p>`,
      attachment: [{ name: XLSX_NAME, content: b64(xlsx) }],
    }),
  });
  if (!r.ok) { const t = await r.text(); let m = t.slice(0, 160); try { m = JSON.parse(t).message || m; } catch { /* keep */ } return "failed: " + m; }
  return "sent to " + to;
}

// ---------- optional OneDrive copy (Microsoft Graph, app login made by IT) ----------
async function oneDrive(files: { name: string; body: Uint8Array; type: string }[]): Promise<string> {
  const tenant = Deno.env.get("MS_TENANT_ID"), id = Deno.env.get("MS_CLIENT_ID"), secret = Deno.env.get("MS_CLIENT_SECRET"), user = Deno.env.get("MS_ONEDRIVE_USER");
  if (!tenant || !id || !secret || !user) return "not set up yet";
  const tok = await fetch(`https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`, {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: id, client_secret: secret, scope: "https://graph.microsoft.com/.default", grant_type: "client_credentials" }),
  }).then((r) => r.json());
  if (!tok.access_token) throw new Error("OneDrive login failed: " + (tok.error_description || tok.error || "unknown").toString().slice(0, 160));
  const H = { Authorization: `Bearer ${tok.access_token}` };
  const base = `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(user)}/drive/root:`;
  const path = (name: string) => `${base}/${encodeURI(ONEDRIVE_FOLDER)}/${encodeURIComponent(name)}`;
  for (const f of files) {
    const prev = f.name.replace(/(\.[a-z.]+)$/, "-previous$1");
    // previous ← latest (delete the old previous, then rename latest), then upload the new latest
    await fetch(path(prev), { method: "DELETE", headers: H });
    const cur = await fetch(path(f.name), { headers: H });
    if (cur.ok) {
      const r = await fetch(path(f.name), { method: "PATCH", headers: { ...H, "Content-Type": "application/json" }, body: JSON.stringify({ name: prev }) });
      if (!r.ok) throw new Error(`OneDrive rename failed (${r.status})`);
    }
    const up = await fetch(`${path(f.name)}:/content`, { method: "PUT", headers: { ...H, "Content-Type": f.type }, body: f.body });
    if (!up.ok) throw new Error(`OneDrive upload failed (${up.status}): ${(await up.text()).slice(0, 160)}`);
  }
  return "saved";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const service = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
  const setStatus = (s: Record<string, unknown>) => service.from("trackit_backup_status").update({ ...s, checked_at: new Date().toISOString() }).eq("id", 1);
  let who = "nightly backup";
  try {
    const body = await req.json().catch(() => ({}));
    const token = req.headers.get("x-trackit-token") || "";
    const { data: st } = await service.from("trackit_settings").select("cron_token").eq("id", 1).single();
    if (token) {
      if (!st?.cron_token || token !== st.cron_token) return json({ error: "Not allowed" }, 401);
    } else {
      const { data: u } = await service.auth.getUser((req.headers.get("Authorization") || "").replace("Bearer ", ""));
      if (!u?.user) return json({ error: "Not signed in" }, 401);
      const { data: me } = await service.from("trackit_profiles").select("role,full_name,email").eq("id", u.user.id).maybeSingle();
      if (me?.role !== "admin") return json({ error: "Admins only" }, 403);
      who = me.full_name || me.email;
      // an admin can fetch a short-lived download link for either copy
      if (body.action === "download") {
        const which = body.which === "previous" ? "previous" : "latest";
        const { data, error } = await service.storage.from(BUCKET).createSignedUrl(`${which}/${XLSX_NAME}`, 300, { download: `trackit-backup-${which}.xlsx` });
        if (error) return json({ error: which === "previous" ? "There is no previous backup yet." : "There is no backup yet." }, 404);
        return json({ url: data.signedUrl });
      }
    }

    // 1. read everything
    const data: Record<string, any[]> = {};
    for (const [t, cols] of Object.entries(TABLES)) data[t] = await readAll(service, t, cols);
    const active = data.trackit_staff.filter((r) => !r.left_at).length;
    const counts = Object.fromEntries(Object.entries(data).map(([t, r]) => [t, r.length]));

    // 2. safety: don't overwrite a good backup with badly damaged data
    const { data: last } = await service.from("trackit_backup_status").select("last_ok_at,active_staff,email_to").eq("id", 1).single();
    if (last?.active_staff && active < last.active_staff * DROP_LIMIT && !body.force) {
      const msg = `Not saved: active staff fell from ${last.active_staff} to ${active} since the last backup (more than 20%). The previous good backup was kept. If this drop is correct, an admin can press "Back up now" and confirm.`;
      await setStatus({ ok: false, message: msg });
      return json({ ok: false, blocked: true, message: msg, active, before: last.active_staff }, 409);
    }

    // 3. build the files
    const now = new Date();
    const meta = { app: "Trackit", made_at: now.toISOString(), made_by: who, active_staff: active, counts, note: "Passwords and secret keys are not included." };
    const jsonGz = await gzip(JSON.stringify({ meta, data }));
    const xlsx = toXlsx(data, meta);

    // 4. rotate: previous ← latest, then write the new latest
    const st2 = service.storage.from(BUCKET);
    await st2.remove([`previous/${JSON_NAME}`, `previous/${XLSX_NAME}`]);
    for (const n of [JSON_NAME, XLSX_NAME]) await st2.copy(`latest/${n}`, `previous/${n}`); // fails harmlessly on the very first run
    for (const [n, b, type] of [[JSON_NAME, jsonGz, "application/gzip"], [XLSX_NAME, xlsx, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"]] as const) {
      const { error } = await st2.upload(`latest/${n}`, b, { contentType: type, upsert: true });
      if (error) throw new Error(`Saving ${n} failed: ${error.message}`);
    }

    // 5. off-site copy
    let od = "not set up yet";
    try { od = await oneDrive([{ name: XLSX_NAME, body: xlsx, type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }, { name: JSON_NAME, body: jsonGz, type: "application/gzip" }]); }
    catch (e) { od = "failed: " + String((e as any)?.message || e).slice(0, 200); }

    const base = `${active} active staff, ${data.trackit_store_map.length} branches, ${data.trackit_staff_history.length} history rows · ${Math.round((jsonGz.length + xlsx.length) / 1024)} KB`;
    let em = "off";
    try { em = await emailBackup(service, last?.email_to || "", xlsx, base); } catch (e) { em = "failed: " + String((e as any)?.message || e).slice(0, 160); }
    const msg = `${base} · Email: ${em}${od !== "not set up yet" ? ` · OneDrive: ${od}` : ""}`;
    await setStatus({ ok: true, message: msg, last_ok_at: now.toISOString(), active_staff: active, counts, made_by: who, onedrive: od });
    return json({ ok: true, message: msg, counts });
  } catch (e) {
    const msg = "Backup failed: " + String((e as any)?.message || e).slice(0, 300);
    await setStatus({ ok: false, message: msg });
    return json({ ok: false, error: msg }, 500);
  }
});
