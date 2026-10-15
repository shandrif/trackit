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

    if (action === "create") {
      const email = String(body.email || "").trim().toLowerCase();
      const password = String(body.password || "");
      const role = body.role === "admin" ? "admin" : "manager";
      const full_name = String(body.full_name || "").trim();
      if (!full_name) return json({ error: "Enter a name" }, 400);
      if (!email.includes("@")) return json({ error: "Enter a valid email" }, 400);
      if (password.length < 8) return json({ error: "Password must be at least 8 characters" }, 400);
      const { data, error } = await service.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { full_name } });
      if (error) return json({ error: error.message }, 400);
      const { error: pe } = await service.from("trackit_profiles").insert({ id: data.user.id, email, full_name, role });
      if (pe) { await service.auth.admin.deleteUser(data.user.id); return json({ error: pe.message }, 400); }
      return json({ ok: true });
    }

    if (action === "reset_password") {
      const password = String(body.password || "");
      if (password.length < 8) return json({ error: "Password must be at least 8 characters" }, 400);
      const { data: p } = await service.from("trackit_profiles").select("id").eq("id", body.id).maybeSingle();
      if (!p) return json({ error: "Login not found" }, 404);
      const { error } = await service.auth.admin.updateUserById(body.id, { password });
      if (error) return json({ error: error.message }, 400);
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
