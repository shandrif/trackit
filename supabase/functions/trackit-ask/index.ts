import { createClient } from "npm:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

const PREFERRED = [
  "openrouter/free",
  "google/gemma-4-31b-it:free",
  "nvidia/nemotron-3-super-120b-a12b:free",
  "google/gemma-4-26b-a4b-it:free",
  "thinkingmachines/inkling:free",
  "nvidia/nemotron-3.5-lightning:free",
];
let cachedFree: string[] | null = null;
async function freeModels(): Promise<string[]> {
  if (cachedFree) return cachedFree;
  try {
    const r = await fetch("https://openrouter.ai/api/v1/models");
    const j = await r.json();
    const ids: string[] = (j.data || []).map((m: any) => m.id).filter((id: string) => id.endsWith(":free"));
    const pref = PREFERRED.filter((p) => p === "openrouter/free" || ids.includes(p));
    const rest = ids.filter((id) => !pref.includes(id) && !/safety|code|omni|nano|2\.6b/i.test(id));
    cachedFree = [...pref, ...rest].slice(0, 8);
  } catch { cachedFree = PREFERRED; }
  return cachedFree.length ? cachedFree : PREFERRED;
}

// Find the OpenRouter key even if the secret name has a small typo or stray spaces.
function findKey(): { key: string | null; names: string[] } {
  const exact = Deno.env.get("OPENROUTER_API_KEY");
  if (exact && exact.trim()) return { key: exact.trim(), names: ["OPENROUTER_API_KEY"] };
  const env = Deno.env.toObject();
  const names = Object.keys(env).filter((k) => /open.?router|^or_|api_?key/i.test(k) && !/^SUPABASE/i.test(k));
  for (const n of names) {
    const v = (env[n] || "").trim();
    if (v.startsWith("sk-or-")) return { key: v, names };
  }
  return { key: null, names };
}

const DAY = 86400000;
function status(exp: string, today: number) {
  const d = Math.round((Date.parse(exp) - today) / DAY);
  return d < 0 ? `EXPIRED ${-d} days ago` : d <= 30 ? `due in ${d} days` : `ok (${d} days)`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const { key, names } = findKey();
    if (!key) {
      const seen = names.length ? ` Secrets found with a similar name: ${names.join(", ")} (but none holds a key starting with sk-or-).` : " No secret with a similar name was found in this project.";
      return json({ error: "The AI key hasn't been added yet. Ask the admin to add OPENROUTER_API_KEY." + seen }, 503);
    }
    const auth = req.headers.get("Authorization") || "";
    const service = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
    const { data: u } = await service.auth.getUser(auth.replace("Bearer ", ""));
    if (!u?.user) return json({ error: "Not signed in" }, 401);
    const { data: me } = await service.from("trackit_profiles").select("id,role,person_id,is_rom").eq("id", u.user.id).maybeSingle();
    if (!me || (me.role !== "admin" && !me.person_id)) return json({ error: "Your login hasn't been linked to Trackit yet." }, 403);
    const { question, history } = await req.json();
    if (!question || String(question).length > 600) return json({ error: "Please ask a shorter question." }, 400);

    // Same rule as the database: admin sees all branches; an AM sees branches they manage; a ROM also sees branches they oversee
    const [{ data: branches }, { data: people }] = await Promise.all([
      service.from("trackit_branches").select("id,name,region,am_id,rom_id"), service.from("trackit_people").select("id,name")]);
    const pname = (id: string) => (people || []).find((p: any) => p.id === id)?.name || "";
    const mine = (branches || []).filter((b: any) => me.role === "admin" || b.am_id === me.person_id || (me.is_rom && b.rom_id === me.person_id));
    const bmap = new Map(mine.map((b: any) => [b.id, b]));
    const ids = [...bmap.keys()];
    const rows: any[] = [];
    if (ids.length) for (let from = 0; ; from += 1000) {
      // Only names, branches, dates and progress — never Iqama or mobile numbers
      const { data, error } = await service.from("trackit_employees")
        .select("name,branch_id,expiry,expiry_note,medical,training,card_updated,remarks")
        .in("branch_id", ids).order("expiry", { nullsFirst: true }).range(from, from + 999);
      if (error) return json({ error: error.message }, 400);
      rows.push(...(data || []));
      if (!data || data.length < 1000) break;
    }
    const now = new Date(); const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
    const todayStr = new Date(today).toISOString().slice(0, 10);
    type G = { total: number; expired: number; due: number; missing: number; card: number };
    const add = (m: Record<string, G>, k: string) => (m[k] ??= { total: 0, expired: 0, due: 0, missing: 0, card: 0 });
    let expired = 0, due = 0, ok = 0, missing = 0;
    const byBranch: Record<string, G> = {}, byAM: Record<string, G> = {}, byRegion: Record<string, G> = {};
    const urgent: string[] = [];
    const step = (r: any) => `medical ${r.medical}, training ${r.training.replace("_", " ")}, card updated ${r.card_updated ? "yes" : "no"}`;
    for (const r of rows) {
      const b: any = bmap.get(r.branch_id) || {};
      const am = pname(b.am_id) || "(no AM)";
      const gs = [add(byBranch, `${b.name} (AM ${am})`), add(byAM, am), add(byRegion, b.region || "—")];
      let st: string;
      if (!r.expiry) { missing++; st = "missing"; } else { const d = Math.round((Date.parse(r.expiry) - today) / DAY); st = d < 0 ? "expired" : d <= 30 ? "due" : "ok"; }
      if (st === "expired") expired++; else if (st === "due") due++; else if (st === "ok") ok++;
      for (const g of gs) { g.total++; if (st !== "ok") (g as any)[st]++; if (r.card_updated) g.card++; }
      if (st !== "ok" && urgent.length < 400) {
        urgent.push(`${r.name} | ${b.name} | AM ${am} | ${r.expiry ? `expiry ${r.expiry}, ${status(r.expiry, today)}` : `NO DATE (file said: ${r.expiry_note || "blank"})`} | ${step(r)}${r.remarks ? " | remark: " + String(r.remarks).slice(0, 80) : ""}`);
      }
    }
    const fmt = (m: Record<string, G>, n: number) => Object.entries(m).sort((a, b) => (b[1].expired + b[1].due + b[1].missing) - (a[1].expired + a[1].due + a[1].missing)).slice(0, n)
      .map(([k, v]) => `${k}: ${v.total} staff, ${v.expired} expired, ${v.due} due in 30 days, ${v.missing} no date, ${v.card} card updated`).join("\n");
    const context = `Today is ${todayStr}. Baladiya health card records visible to this user: ${rows.length}. Expired: ${expired}. Due within 30 days: ${due}. Date missing: ${missing}. OK: ${ok}.
Renewal steps per person: 1 medical, 2 Baladiya training (can be not required), 3 card updated in system.

By region:\n${fmt(byRegion, 10)}\n\nBy area manager:\n${fmt(byAM, 30)}\n\nBy branch:\n${fmt(byBranch, 120)}\n\nEveryone expired, due within 30 days, or with no date (most overdue first):\n${urgent.join("\n") || "none"}`;

    const messages = [
      { role: "system", content: "You are Trackit's assistant for Half Million Coffee. You help area managers keep staff Baladiya (municipality) health cards renewed. Answer ONLY from the data provided. Be brief and practical. Use plain sentences or short '-' lists. Do not use markdown bold, tables or headings. Status rules: expiry date before today = expired; within 30 days = due soon; no date = date missing (needs checking in the Baladiya system); otherwise OK. Each person goes through medical, then training (or not required), then card updated. If the data does not answer the question, say so. Reply in the same language the user writes in (English or Arabic or Hindi)." },
      { role: "system", content: "DATA:\n" + context },
      ...((Array.isArray(history) ? history : []).slice(-6).map((m: any) => ({ role: m.role === "assistant" ? "assistant" : "user", content: String(m.content).slice(0, 1500) }))),
      { role: "user", content: String(question) },
    ];

    const fails: string[] = [];
    let dailyCap = false;
    for (const model of await freeModels()) {
      const r = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json", "X-Title": "Trackit" },
        body: JSON.stringify({ model, messages, temperature: 0.2, max_tokens: 700 }),
      });
      if (r.ok) {
        const j = await r.json();
        const answer = j.choices?.[0]?.message?.content?.trim();
        if (answer) return json({ answer, model });
        fails.push(`${model}: empty answer`);
        continue;
      }
      const body = await r.text();
      if (r.status === 401) return json({ error: "The OpenRouter key was rejected. Ask the admin to check it." }, 502);
      if (r.status === 402) return json({ error: "OpenRouter says this account needs credit for this request (" + body.slice(0, 160) + ")" }, 502);
      if (r.status === 429 && /per-day|per day|daily/i.test(body)) dailyCap = true;
      fails.push(`${model}: ${r.status}`);
      console.log("openrouter fail", model, r.status, body.slice(0, 300));
    }
    if (dailyCap) return json({ error: "The free AI limit for today has been reached for this OpenRouter account. It resets daily." }, 503);
    return json({ error: "The free AI models are busy right now. Please try again in a minute. (" + fails.join("; ") + ")" }, 503);
  } catch (e) {
    return json({ error: String((e as any)?.message || e) }, 500);
  }
});
