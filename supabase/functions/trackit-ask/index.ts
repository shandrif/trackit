import { createClient } from "npm:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

// ---------- Google Gemini ----------
function geminiKey(): string | null {
  const env = Deno.env.toObject();
  for (const n of ["GEMINI_API_KEY", "GOOGLE_API_KEY", "GOOGLE_GEMINI_API_KEY", "GEMINI_KEY"]) {
    const v = (env[n] || "").trim(); if (v) return v;
  }
  for (const [k, v] of Object.entries(env)) if (/gemini|google.?ai/i.test(k) && (v || "").trim()) return v.trim();
  for (const v of Object.values(env)) if ((v || "").trim().startsWith("AIza")) return v.trim();
  return null;
}
let gemModels: string[] | null = null;
let gemAt = 0;
async function geminiModels(key: string): Promise<string[]> {
  if (gemModels && Date.now() - gemAt < 3600_000) return gemModels;
  gemAt = Date.now();
  const fallback = ["gemini-2.5-flash", "gemini-2.5-flash-lite", "gemini-2.0-flash"];
  try {
    const r = await fetch("https://generativelanguage.googleapis.com/v1beta/models?pageSize=200", { headers: { "x-goog-api-key": key } });
    const j = await r.json();
    const ids: string[] = (j.models || [])
      .filter((m: any) => (m.supportedGenerationMethods || []).includes("generateContent"))
      .map((m: any) => String(m.name).replace(/^models\//, ""))
      .filter((id: string) => /^gemini-[\d.]+-flash/.test(id) && !/image|tts|audio|live|thinking|exp|embed|native/i.test(id));
    const ver = (id: string) => parseFloat((id.match(/gemini-([\d.]+)/) || [])[1] || "0");
    const score = (id: string) => ver(id) * 10 - (/lite/.test(id) ? 3 : 0) - (/preview/.test(id) ? 1 : 0) - (/-\d{3,}$|-\d{2}-\d{4}$/.test(id) ? 0.5 : 0);
    ids.sort((x, y) => score(y) - score(x));
    gemModels = ids.length ? ids.slice(0, 5) : fallback;
  } catch { gemModels = fallback; }
  return gemModels;
}
const busyUntil = new Map<string, number>(); // models that said "high demand" are skipped for a few minutes
const noThinkCfg = new Set<string>();         // models that don't accept the "think briefly" setting
async function askGemini(key: string, model: string, system: string, turns: { role: string; content: string }[]): Promise<{ answer?: string; status: number; body?: string }> {
  const call = (thinking: boolean) => fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
    method: "POST",
    headers: { "x-goog-api-key": key, "Content-Type": "application/json" },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: system }] },
      contents: turns.map((t) => ({ role: t.role === "assistant" ? "model" : "user", parts: [{ text: t.content }] })),
      generationConfig: { temperature: 0.2, maxOutputTokens: 4096, ...(thinking ? { thinkingConfig: /gemini-2\./.test(model) ? { thinkingBudget: 0 } : { thinkingLevel: "low" } } : {}) },
    }),
    signal: AbortSignal.timeout(30000),
  });
  let r = await call(!noThinkCfg.has(model));
  if (r.status === 400 && !noThinkCfg.has(model)) {
    const b = await r.text();
    if (/think/i.test(b)) { noThinkCfg.add(model); r = await call(false); }
    else return { status: 400, body: b.slice(0, 300) };
  }
  if (r.status === 503 || r.status === 429) busyUntil.set(model, Date.now() + 5 * 60_000);
  if (!r.ok) return { status: r.status, body: (await r.text()).slice(0, 300) };
  const j = await r.json().catch(() => ({}));
  const parts = j.candidates?.[0]?.content?.parts || [];
  const answer = parts.filter((p: any) => !p.thought && p.text).map((p: any) => p.text).join("").trim();
  return answer ? { answer, status: 200 } : { status: 200, body: "empty answer (" + (j.candidates?.[0]?.finishReason || "no reason") + ")" };
}

const DAY = 86400000;
function status(exp: string, today: number) {
  const d = Math.round((Date.parse(exp) - today) / DAY);
  return d < 0 ? `EXPIRED ${-d} days ago` : d <= 30 ? `due in ${d} days` : `ok (${d} days)`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const gkey = geminiKey();
    if (!gkey) return json({ error: "The AI key hasn't been added yet. Ask the admin to add GEMINI_API_KEY in Supabase." }, 503);
    const auth = req.headers.get("Authorization") || "";
    const service = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
    const testToken = req.headers.get("x-trackit-token") || "";
    let isTest = false;
    if (testToken) {
      const { data: st } = await service.from("trackit_settings").select("cron_token").eq("id", 1).single();
      if (!st || st.cron_token !== testToken) return json({ error: "Not allowed" }, 401);
      isTest = true;
    } else {
      const { data: u } = await service.auth.getUser(auth.replace("Bearer ", ""));
      if (!u?.user) return json({ error: "Not signed in" }, 401);
      const { data: me } = await service.from("trackit_profiles").select("id,role").eq("id", u.user.id).maybeSingle();
      if (!me) return json({ error: "Your login hasn't been added to Trackit yet." }, 403);
    }
    const { question, history } = await req.json();
    if (!question || String(question).length > 600) return json({ error: "Please ask a shorter question." }, 400);

    const rows: any[] = [];
    for (let from = 0; ; from += 1000) {
      // Only names, stores, dates and remarks — never Iqama or mobile numbers
      const { data, error } = await service.from("trackit_staff")
        .select("name,store,nationality,expiry,expiry_note,remarks")
        .order("expiry", { nullsFirst: true }).range(from, from + 999);
      if (error) return json({ error: error.message }, 400);
      rows.push(...(data || []));
      if (!data || data.length < 1000) break;
    }
    const now = new Date(); const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
    const todayStr = new Date(today).toISOString().slice(0, 10);
    type G = { total: number; expired: number; due: number; missing: number };
    const add = (m: Record<string, G>, k: string) => (m[k] ??= { total: 0, expired: 0, due: 0, missing: 0 });
    let expired = 0, due = 0, ok = 0, missing = 0;
    const byStore: Record<string, G> = {};
    const urgent: string[] = [];
    for (const r of rows) {
      const gs = [add(byStore, r.store || "(no store)")];
      let st: string;
      if (!r.expiry) { missing++; st = "missing"; } else { const d = Math.round((Date.parse(r.expiry) - today) / DAY); st = d < 0 ? "expired" : d <= 30 ? "due" : "ok"; }
      if (st === "expired") expired++; else if (st === "due") due++; else if (st === "ok") ok++;
      for (const g of gs) { g.total++; if (st !== "ok") (g as any)[st]++; }
      if (st !== "ok" && urgent.length < 400) {
        urgent.push(`${r.name} | ${r.store} | ${r.expiry ? `expiry ${r.expiry}, ${status(r.expiry, today)}` : `NO DATE (file said: ${r.expiry_note || "blank"})`}${r.remarks ? " | AM remark: " + String(r.remarks).slice(0, 80) : ""}`);
      }
    }
    const fmt = (m: Record<string, G>, n: number) => Object.entries(m).sort((a, b) => (b[1].expired + b[1].due + b[1].missing) - (a[1].expired + a[1].due + a[1].missing)).slice(0, n)
      .map(([k, v]) => `${k}: ${v.total} staff, ${v.expired} expired, ${v.due} due in 30 days, ${v.missing} no date`).join("\n");
    const context = `Today is ${todayStr}. Baladiya health card records: ${rows.length}. Expired: ${expired}. Due within 30 days: ${due}. Date missing: ${missing}. OK: ${ok}.

By store:\n${fmt(byStore, 150)}\n\nEveryone expired, due within 30 days, or with no date (most overdue first):\n${urgent.join("\n") || "none"}`;

    const messages = [
      { role: "system", content: "You are Trackit's assistant for Half Million Coffee. You help the team keep staff Baladiya (municipality) health cards renewed. Answer ONLY from the data provided. Be brief and practical. Use plain sentences or short '-' lists. Do not use markdown bold, tables or headings. Status rules: expiry date before today = expired; within 30 days = due soon; no date = date missing (needs checking in the Baladiya system); otherwise OK. If the data does not answer the question, say so. Reply in the same language the user writes in (English or Arabic or Hindi)." },
      { role: "system", content: "DATA:\n" + context },
      ...((Array.isArray(history) ? history : []).slice(-6).map((m: any) => ({ role: m.role === "assistant" ? "assistant" : "user", content: String(m.content).slice(0, 1500) }))),
      { role: "user", content: String(question) },
    ];

    const fails: string[] = [];
    const t0 = Date.now();
    const turns = messages.filter((m) => m.role !== "system") as { role: string; content: string }[];
    while (turns.length > 1 && turns[0].role === "assistant") turns.shift(); // Gemini wants the chat to start with the user
    const system = messages.filter((m) => m.role === "system").map((m) => m.content).join("\n\n");
    const all = await geminiModels(gkey);
    const ready = all.filter((m) => (busyUntil.get(m) || 0) < Date.now());
    const order = ready.length ? ready : all;
    let quota = false;
    for (let round = 0; round < 2; round++) {
      if (round === 1) await new Promise((r) => setTimeout(r, 2000)); // everything busy: wait a moment, try once more
      for (const model of order) {
        let res: { answer?: string; status: number; body?: string };
        try { res = await askGemini(gkey, model, system, turns); } catch (err) { res = { status: 0, body: String(err) }; }
        if (res.answer) return json({ answer: res.answer, ...(isTest ? { model, ms: Date.now() - t0, models: order } : {}) });
        fails.push(`${model}: ${res.status} ${res.body || ""}`.slice(0, 200));
        console.log("gemini fail", model, res.status, res.body);
        if ((res.status === 400 || res.status === 401 || res.status === 403) && /api.?key|permission|unauthenticated|forbidden/i.test(res.body || ""))
          return json({ error: "Google rejected the Gemini key. Ask the admin to check GEMINI_API_KEY in Supabase.", ...(isTest ? { fails } : {}) }, 502);
        if (res.status === 429 && /quota|per day|daily|limit/i.test(res.body || "")) quota = true;
      }
    }
    if (quota) return json({ error: "Today's free Gemini limit has been reached. It resets tomorrow.", ...(isTest ? { fails } : {}) }, 503);
    return json({ error: "The AI is busy right now. Please try again in a minute.", ...(isTest ? { fails } : {}) }, 503);
  } catch (e) {
    return json({ error: String((e as any)?.message || e) }, 500);
  }
});
