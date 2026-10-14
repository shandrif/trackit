import { createClient } from "npm:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

const PREFERRED = [
  "meta-llama/llama-3.3-70b-instruct:free",
  "deepseek/deepseek-chat-v3-0324:free",
  "google/gemma-3-27b-it:free",
  "mistralai/mistral-small-3.2-24b-instruct:free",
  "qwen/qwen3-235b-a22b:free",
];
let cachedFree: string[] | null = null;
async function freeModels(): Promise<string[]> {
  if (cachedFree) return cachedFree;
  try {
    const r = await fetch("https://openrouter.ai/api/v1/models");
    const j = await r.json();
    const ids: string[] = (j.data || []).map((m: any) => m.id).filter((id: string) => id.endsWith(":free"));
    const pref = PREFERRED.filter((p) => ids.includes(p));
    const rest = ids.filter((id) => !pref.includes(id) && /instruct|chat|gemma|llama|mistral|qwen|deepseek/i.test(id));
    cachedFree = [...pref, ...rest].slice(0, 6);
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
    // Use the caller's own login so database security rules decide what the AI can see
    const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: auth } }, auth: { persistSession: false },
    });
    const { data: u } = await sb.auth.getUser(auth.replace("Bearer ", ""));
    if (!u?.user) return json({ error: "Not signed in" }, 401);
    const { question, history } = await req.json();
    if (!question || String(question).length > 600) return json({ error: "Please ask a shorter question." }, 400);

    const rows: any[] = [];
    for (let from = 0; ; from += 1000) {
      const { data, error } = await sb.from("trackit_employees")
        .select("name,store,expiry,manager:trackit_profiles(full_name,email)")
        .order("expiry").range(from, from + 999);
      if (error) return json({ error: error.message }, 400);
      rows.push(...(data || []));
      if (!data || data.length < 1000) break;
    }
    const now = new Date(); const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
    const todayStr = new Date(today).toISOString().slice(0, 10);
    let expired = 0, due = 0, ok = 0; const byStore: Record<string, { total: number; expired: number; due: number }> = {};
    const urgent: string[] = [];
    for (const r of rows) {
      const d = Math.round((Date.parse(r.expiry) - today) / DAY);
      const s = r.store || "(no store)";
      byStore[s] ??= { total: 0, expired: 0, due: 0 };
      byStore[s].total++;
      if (d < 0) { expired++; byStore[s].expired++; } else if (d <= 30) { due++; byStore[s].due++; } else ok++;
      if (d <= 60 && urgent.length < 400) {
        const mgr = r.manager?.full_name || r.manager?.email || "";
        urgent.push(`${r.name} | ${s}${mgr ? " | AM: " + mgr : ""} | expiry ${r.expiry} | ${status(r.expiry, today)}`);
      }
    }
    const stores = Object.entries(byStore).sort((a, b) => (b[1].expired + b[1].due) - (a[1].expired + a[1].due))
      .slice(0, 120).map(([s, v]) => `${s}: ${v.total} staff, ${v.expired} expired, ${v.due} due in 30 days`);
    const context = `Today is ${todayStr}. Baladiya health card records visible to this user: ${rows.length}. Expired: ${expired}. Due within 30 days: ${due}. OK: ${ok}.\n\nBy store:\n${stores.join("\n")}\n\nEmployees expired or due within 60 days (soonest first):\n${urgent.join("\n") || "none"}`;

    const messages = [
      { role: "system", content: "You are Trackit's assistant for Half Million Coffee. You help area managers keep staff Baladiya (municipality) health cards renewed. Answer ONLY from the data provided. Be brief and practical. Use plain sentences or short '-' lists. Do not use markdown bold, tables or headings. Status rules: expiry date before today = expired; within 30 days = due soon; otherwise OK. If the data does not answer the question, say so. Reply in the same language the user writes in (English or Arabic or Hindi)." },
      { role: "system", content: "DATA:\n" + context },
      ...((Array.isArray(history) ? history : []).slice(-6).map((m: any) => ({ role: m.role === "assistant" ? "assistant" : "user", content: String(m.content).slice(0, 1500) }))),
      { role: "user", content: String(question) },
    ];

    let lastErr = "";
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
        lastErr = "empty answer";
      } else {
        lastErr = `${r.status}`;
        if (r.status === 401) return json({ error: "The OpenRouter key was rejected. Ask the admin to check it." }, 502);
      }
    }
    return json({ error: lastErr === "429" ? "The free AI limit for today has been reached. Try again later." : "The AI is busy right now. Please try again in a minute." }, 503);
  } catch (e) {
    return json({ error: String((e as any)?.message || e) }, 500);
  }
});
