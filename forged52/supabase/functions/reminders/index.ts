// Runs hourly (pg_cron). Sends each subscriber today's reading at their chosen local hour, unless they've already read it.
import { createClient } from "npm:@supabase/supabase-js@2.45.4";
import webpush from "npm:web-push@3.6.7";
import { PLANS, DAYS, nice } from "./plans.ts";

const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
webpush.setVapidDetails("https://forged52.pages.dev", Deno.env.get("VAPID_PUBLIC")!, Deno.env.get("VAPID_PRIVATE")!);

function local(tz: string) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23" }).formatToParts(new Date()).map((p) => [p.type, p.value]));
  return { date: `${parts.year}-${parts.month}-${parts.day}`, hour: Number(parts.hour) };
}
const days = (a: string, b: string) => Math.round((Date.parse(a) - Date.parse(b)) / 864e5);

Deno.serve(async (req) => {
  if (req.headers.get("x-cron-key") !== Deno.env.get("CRON_KEY")) return new Response("forbidden", { status: 403 });
  const { data: subs } = await admin.from("push_subs").select("*");
  const ids = [...new Set((subs || []).map((s) => s.user_id))];
  const { data: prog } = ids.length ? await admin.from("progress").select("user_id,route,start_date,done").in("user_id", ids) : { data: [] };
  const P = Object.fromEntries((prog || []).map((p) => [p.user_id, p]));
  let sent = 0;
  for (const s of subs || []) {
    let L; try { L = local(s.tz || "America/Detroit"); } catch { L = local("America/Detroit"); }
    if (L.hour !== s.hour || s.last_sent === L.date) continue;
    const p = P[s.user_id];
    await admin.from("push_subs").update({ last_sent: L.date }).eq("endpoint", s.endpoint);
    if (!p) continue;
    const n = days(L.date, p.start_date) + 1;
    let title = "Forged52", body = "";
    if (n < 1) { body = `Your 52 weeks start in ${1 - n} day${1 - n > 1 ? "s" : ""}. Get ready.`; }
    else if (n > 364) continue;
    else {
      if ((p.done || []).includes(n)) continue;
      const w = Math.floor((n - 1) / 7), k = DAYS[(n - 1) % 7];
      const ref = String((PLANS[p.route] || PLANS.topical)[w][k]);
      title = `Day ${n} · ${nice(ref)}`; body = "Your reading is waiting. 15 minutes. Let's go.";
    }
    try { await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, JSON.stringify({ title, body, url: "/#today" })); sent++; }
    catch (e) { const c = (e as { statusCode?: number }).statusCode; if (c === 404 || c === 410) await admin.from("push_subs").delete().eq("endpoint", s.endpoint); }
  }
  return new Response(JSON.stringify({ sent }), { headers: { "content-type": "application/json" } });
});
