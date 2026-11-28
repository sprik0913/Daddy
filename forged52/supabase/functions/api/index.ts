// Forged52 API: device transfer codes, crew nudges, weekly word posting, test notifications.
import { createClient } from "npm:@supabase/supabase-js@2.45.4";
import webpush from "npm:web-push@3.6.7";

const SB_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
webpush.setVapidDetails("https://forged52.pages.dev", Deno.env.get("VAPID_PUBLIC")!, Deno.env.get("VAPID_PRIVATE")!);
const admin = createClient(SB_URL, SERVICE, { auth: { persistSession: false } });

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-admin-key",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "content-type": "application/json" } });

async function caller(req: Request) {
  const auth = req.headers.get("authorization") || "";
  if (!auth) return null;
  const c = createClient(SB_URL, ANON, { global: { headers: { Authorization: auth } }, auth: { persistSession: false } });
  const { data } = await c.auth.getUser();
  return data.user;
}

export async function pushTo(userId: string, title: string, body: string, url = "/#today") {
  const { data: subs } = await admin.from("push_subs").select("*").eq("user_id", userId);
  let sent = 0;
  for (const s of subs || []) {
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, JSON.stringify({ title, body, url }));
      sent++;
    } catch (e) {
      const code = (e as { statusCode?: number }).statusCode;
      if (code === 404 || code === 410) await admin.from("push_subs").delete().eq("endpoint", s.endpoint);
    }
  }
  return sent;
}

const ALPHA = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const code = (n: number) => Array.from(crypto.getRandomValues(new Uint8Array(n)), (b) => ALPHA[b % ALPHA.length]).join("");

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  let body: Record<string, any> = {};
  try { body = await req.json(); } catch { /* empty */ }
  const action = body.action;
  try {
    if (action === "transfer_create") {
      const user = await caller(req); if (!user) return json({ error: "Not signed in" }, 401);
      if (!user.email) {
        const { error } = await admin.auth.admin.updateUserById(user.id, { email: `u${user.id.replace(/-/g, "")}@sync.forged52.app`, email_confirm: true });
        if (error) return json({ error: error.message }, 500);
      }
      await admin.from("transfer_codes").delete().eq("user_id", user.id);
      const c = code(8);
      await admin.from("transfer_codes").insert({ code: c, user_id: user.id, expires_at: new Date(Date.now() + 15 * 60e3).toISOString() });
      return json({ code: c.slice(0, 4) + "-" + c.slice(4) });
    }
    if (action === "transfer_redeem") {
      const c = String(body.code || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
      const { data: row } = await admin.from("transfer_codes").select("*").eq("code", c).maybeSingle();
      if (!row || new Date(row.expires_at) < new Date()) return json({ error: "That code is wrong or expired. Make a new one on your other device." }, 400);
      const { data: u } = await admin.auth.admin.getUserById(row.user_id);
      if (!u?.user?.email) return json({ error: "Account not ready" }, 400);
      const { data: link, error } = await admin.auth.admin.generateLink({ type: "magiclink", email: u.user.email });
      if (error) return json({ error: error.message }, 500);
      await admin.from("transfer_codes").delete().eq("code", c);
      return json({ token_hash: link.properties.hashed_token });
    }
    if (action === "nudge") {
      const user = await caller(req); if (!user) return json({ error: "Not signed in" }, 401);
      const { crew_id, to_user } = body;
      const { data: m } = await admin.from("crew_members").select("user_id").eq("crew_id", crew_id).in("user_id", [user.id, to_user]);
      if ((m || []).length < 2 || user.id === to_user) return json({ error: "Not in the same crew" }, 403);
      const { error } = await admin.from("nudges").insert({ crew_id, from_user: user.id, to_user });
      if (error) return json({ ok: false, already: true });
      const { data: p } = await admin.from("profiles").select("name").eq("id", user.id).maybeSingle();
      const sent = await pushTo(to_user, "Forged52", `${p?.name || "A brother"} is picking you up. Today's reading is waiting.`);
      return json({ ok: true, delivered: sent > 0 });
    }
    if (action === "test_push") {
      const user = await caller(req); if (!user) return json({ error: "Not signed in" }, 401);
      const sent = await pushTo(user.id, "Forged52", "Reminders are on. See you tomorrow morning.");
      return json({ ok: sent > 0 });
    }
    if (action === "post_word") {
      if (req.headers.get("x-admin-key") !== Deno.env.get("ADMIN_KEY")) return json({ error: "Wrong posting key" }, 403);
      const title = String(body.title || "").trim().slice(0, 120);
      if (!title) return json({ error: "Add a title" }, 400);
      let audio_url: string | null = null;
      if (body.audio_b64) {
        const type = String(body.audio_type || "audio/webm");
        const ext = type.includes("mp4") || type.includes("m4a") ? "m4a" : type.includes("mpeg") ? "mp3" : type.includes("ogg") ? "ogg" : "webm";
        const bytes = Uint8Array.from(atob(body.audio_b64), (ch) => ch.charCodeAt(0));
        const path = `word-${Date.now()}.${ext}`;
        const { error } = await admin.storage.from("words").upload(path, bytes, { contentType: type });
        if (error) return json({ error: error.message }, 500);
        audio_url = admin.storage.from("words").getPublicUrl(path).data.publicUrl;
      }
      const video_url = body.video_url ? String(body.video_url).slice(0, 500) : null;
      const { data, error } = await admin.from("words").insert({ title, body: String(body.body || "").slice(0, 4000), audio_url, video_url }).select().single();
      if (error) return json({ error: error.message }, 500);
      return json({ ok: true, word: data });
    }
    if (action === "delete_word") {
      if (req.headers.get("x-admin-key") !== Deno.env.get("ADMIN_KEY")) return json({ error: "Wrong posting key" }, 403);
      await admin.from("words").delete().eq("id", body.id);
      return json({ ok: true });
    }
    return json({ error: "Unknown action" }, 400);
  } catch (e) {
    return json({ error: String((e as Error).message || e) }, 500);
  }
});
