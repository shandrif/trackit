import { createClient } from "npm:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const service = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
    const token = (req.headers.get("Authorization") || "").replace("Bearer ", "");
    const { data: u, error: ue } = await service.auth.getUser(token);
    if (ue || !u?.user) return json({ error: "Not signed in" }, 401);
    const { data: me } = await service.from("trackit_profiles").select("role").eq("id", u.user.id).maybeSingle();
    if (me?.role !== "admin") return json({ error: "Admins only" }, 403);

    const body = await req.json();
    const action = body.action;

    // who a login can see: all, one area manager's stores, one store, or one department
    const checkAccess = async (b: any): Promise<{ role: string; scope_kind: string; scope_value: string } | string> => {
      const role = b.role === "admin" ? "admin" : "manager";
      const kind = ["all", "am", "store", "dept"].includes(b.scope_kind) ? b.scope_kind : "all";
      const value = kind === "all" || role === "admin" ? "" : String(b.scope_value || "").trim();
      if (role === "admin") return { role, scope_kind: "all", scope_value: "" };
      if (kind !== "all" && !value) return "Pick what this login sees";
      if (kind === "store") { const { data } = await service.from("trackit_store_map").select("code").eq("code", value).maybeSingle(); if (!data) return "Unknown store"; }
      if (kind === "dept") { const { data } = await service.from("trackit_departments").select("name").eq("name", value).maybeSingle(); if (!data) return "Unknown department"; }
      if (kind === "am") { const { data } = await service.from("trackit_store_map").select("code").eq("area_manager", value).limit(1); if (!data?.length) return "Unknown area manager"; }
      return { role, scope_kind: kind, scope_value: value };
    };
    const createOne = async (b: any, acc: { role: string; scope_kind: string; scope_value: string }): Promise<string | null> => {
      const email = String(b.email || "").trim().toLowerCase();
      const password = String(b.password || "");
      const full_name = String(b.full_name || "").trim();
      if (!full_name) return "Enter a name";
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return "Enter a valid email";
      if (password.length < 8) return "Password must be at least 8 characters";
      const { data, error } = await service.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { full_name } });
      if (error) return /already/i.test(error.message) ? "A login with this email already exists" : error.message;
      const { error: pe } = await service.from("trackit_profiles").insert({ id: data.user.id, email, full_name, ...acc });
      if (pe) { await service.auth.admin.deleteUser(data.user.id); return pe.message; }
      return null;
    };

    if (action === "create") {
      const acc = await checkAccess(body); if (typeof acc === "string") return json({ error: acc }, 400);
      const err = await createOne(body, acc); if (err) return json({ error: err }, 400);
      // store and department logins also go into the admin's downloadable login list
      if (acc.scope_kind === "store" || acc.scope_kind === "dept") {
        const em = String(body.email).trim().toLowerCase();
        const { data: p } = await service.from("trackit_profiles").select("id").eq("email", em).maybeSingle();
        if (p) await service.from("trackit_login_creds").upsert({ profile_id: p.id, login: em, password: String(body.password), updated_at: new Date().toISOString() });
      }
      return json({ ok: true });
    }

    // one login per store or department; the starting password is kept so the admin can download the list
    if (action === "bulk_create") {
      const items = Array.isArray(body.items) ? body.items.slice(0, 25) : [];
      const results = [];
      for (const it of items) {
        const kind = it.kind === "dept" ? "dept" : "store", value = String(it.value ?? it.code ?? "");
        const acc = await checkAccess({ role: "manager", scope_kind: kind, scope_value: value });
        if (typeof acc === "string") { results.push({ value, ok: false, error: acc }); continue; }
        const err = await createOne(it, acc);
        if (!err) {
          const { data: p } = await service.from("trackit_profiles").select("id").eq("email", String(it.email).trim().toLowerCase()).maybeSingle();
          if (p) await service.from("trackit_login_creds").upsert({ profile_id: p.id, login: String(it.email).trim().toLowerCase(), password: String(it.password), updated_at: new Date().toISOString() });
        }
        results.push(err ? { value, ok: false, error: err } : { value, ok: true });
      }
      return json({ ok: true, results });
    }

    if (action === "set_access") {
      if (body.id === u.user.id) return json({ error: "You can't change your own access" }, 400);
      const acc = await checkAccess(body); if (typeof acc === "string") return json({ error: acc }, 400);
      const { data: p, error } = await service.from("trackit_profiles").update(acc).eq("id", body.id).select("id");
      if (error) return json({ error: error.message }, 400);
      if (!p?.length) return json({ error: "Login not found" }, 404);
      return json({ ok: true });
    }

    if (action === "reset_password") {
      const password = String(body.password || "");
      if (password.length < 8) return json({ error: "Password must be at least 8 characters" }, 400);
      const { data: p } = await service.from("trackit_profiles").select("id").eq("id", body.id).maybeSingle();
      if (!p) return json({ error: "Login not found" }, 404);
      const { error } = await service.auth.admin.updateUserById(body.id, { password });
      if (error) return json({ error: error.message }, 400);
      // keep the downloadable login list correct for store / department logins
      await service.from("trackit_login_creds").update({ password, updated_at: new Date().toISOString() }).eq("profile_id", body.id);
      return json({ ok: true });
    }

    if (action === "delete") {
      if (body.id === u.user.id) return json({ error: "You can't remove your own login" }, 400);
      const { data: p } = await service.from("trackit_profiles").select("id").eq("id", body.id).maybeSingle();
      if (!p) return json({ error: "Login not found" }, 404);
      const { error } = await service.auth.admin.deleteUser(body.id);
      if (error) return json({ error: error.message }, 400);
      return json({ ok: true });
    }

    return json({ error: "Unknown action" }, 400);
  } catch (e) {
    return json({ error: String((e as any)?.message || e) }, 500);
  }
});
