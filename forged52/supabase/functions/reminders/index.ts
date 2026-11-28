// Runs hourly (pg_cron). Each device gets only the categories it turned on (push_subs.prefs):
//  reading   - daily at the chosen hour, unless today's reading is already done
//  memory    - Sundays at the chosen hour: this week's memory verse
//  mission   - Sundays at the chosen hour: this week's mission (combined with memory when both are on)
//  prayer    - daily at 8 PM local (off by default)
//  meeting   - two hours before a crew's meeting, on the meeting day
// Crew discussion, prayer requests and encouragement are sent by the api function when they happen.
import { createClient } from "npm:@supabase/supabase-js@2.45.4";
import webpush from "npm:web-push@3.6.7";
import { PLANS, DAYS, nice } from "./plans.ts";
import { WEEKS } from "./weeks.ts";

const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
webpush.setVapidDetails("https://forged52.pages.dev", Deno.env.get("VAPID_PUBLIC")!, Deno.env.get("VAPID_PRIVATE")!);

function local(tz: string) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23", weekday: "short" }).formatToParts(new Date()).map((p) => [p.type, p.value]));
  return { date: `${parts.year}-${parts.month}-${parts.day}`, hour: Number(parts.hour), dow: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(parts.weekday) };
}
const days = (a: string, b: string) => Math.round((Date.parse(a) - Date.parse(b)) / 864e5);
const on = (prefs: Record<string, boolean> | null, k: string, dflt = true) => (prefs && k in prefs ? !!prefs[k] : dflt);

Deno.serve(async (req) => {
  if (req.headers.get("x-cron-key") !== Deno.env.get("CRON_KEY")) return new Response("forbidden", { status: 403 });
  const { data: subs } = await admin.from("push_subs").select("*");
  const ids = [...new Set((subs || []).map((s) => s.user_id))];
  const [{ data: prog }, { data: mems }] = ids.length
    ? await Promise.all([
      admin.from("progress").select("user_id,route,start_date,done").in("user_id", ids),
      admin.from("crew_members").select("user_id,crews(id,name,meeting_day,meeting_time,meeting_tz)").in("user_id", ids),
    ])
    : [{ data: [] }, { data: [] }];
  const P = Object.fromEntries((prog || []).map((p) => [p.user_id, p]));
  const CREWS: Record<string, any[]> = {};
  for (const m of (mems || []) as any[]) if (m.crews) (CREWS[m.user_id] ||= []).push(m.crews);
  let sent = 0;
  const send = async (s: any, title: string, body: string, url = "/#today", tag?: string) => {
    try { await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, JSON.stringify({ title, body, url, tag })); sent++; return true; }
    catch (e) { const c = (e as { statusCode?: number }).statusCode; if (c === 404 || c === 410) await admin.from("push_subs").delete().eq("endpoint", s.endpoint); return false; }
  };

  for (const s of subs || []) {
    let L; try { L = local(s.tz || "America/Detroit"); } catch { L = local("America/Detroit"); }
    const p = P[s.user_id];
    const n = p ? days(L.date, p.start_date) + 1 : 0;
    const w = n >= 1 && n <= 364 ? Math.ceil(n / 7) : 0;

    // daily reading
    if (L.hour === s.hour && s.last_sent !== L.date) {
      await admin.from("push_subs").update({ last_sent: L.date }).eq("endpoint", s.endpoint);
      if (p && on(s.prefs, "reading")) {
        if (n < 1) await send(s, "FORGED52", `Your 52 weeks start in ${1 - n} day${1 - n > 1 ? "s" : ""}. Get ready.`);
        else if (w && !(p.done || []).includes(n)) {
          const ref = String((PLANS[p.route] || PLANS.topical)[w - 1][DAYS[(n - 1) % 7]]);
          await send(s, `Day ${n} · ${nice(ref)}`, "Your reading is waiting. About 15 minutes.", "/#today", "reading");
        }
      }
      // weekly memory verse and mission, on Sunday
      if (w && L.dow === 0 && s.last_weekly !== L.date && (on(s.prefs, "memory") || on(s.prefs, "mission"))) {
        await admin.from("push_subs").update({ last_weekly: L.date }).eq("endpoint", s.endpoint);
        const W = WEEKS[w - 1];
        const parts = [];
        if (on(s.prefs, "memory")) parts.push(`Memory verse: ${W.ref}.`);
        if (on(s.prefs, "mission")) parts.push(`Mission: ${W.mission.length > 110 ? W.mission.slice(0, 107) + "..." : W.mission}`);
        await send(s, `Week ${w} · ${W.theme}`, parts.join(" "), `/#week-${w}`, "weekly");
      }
    }
    // evening prayer
    if (L.hour === 20 && on(s.prefs, "prayer", false)) await send(s, "FORGED52", "Take two minutes to pray before the day ends.", "/#study-prayer", "prayer");
    // crew meetings
    if (on(s.prefs, "meeting")) for (const c of CREWS[s.user_id] || []) {
      if (c.meeting_day == null || !c.meeting_time) continue;
      let M; try { M = local(c.meeting_tz || s.tz || "America/Detroit"); } catch { continue; }
      const mh = Number(String(c.meeting_time).split(":")[0]);
      if (M.dow === c.meeting_day && M.hour === (mh + 22) % 24 && mh >= 2) await send(s, c.name, `Your crew meets today at ${c.meeting_time}.`, "/#crew", "meeting-" + c.id);
    }
  }
  return new Response(JSON.stringify({ sent }), { headers: { "content-type": "application/json" } });
});
