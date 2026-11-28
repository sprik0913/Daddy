// Optional cloud: anonymous Supabase session, backup/sync, crews, shared prayer, notifications.
// Everything works locally without it; the cloud only adds sync and brotherhood.
import { SUPABASE, VAPID_PUBLIC } from '../config.js';
import { store } from './store.js';

export const cloud = { sb: null, me: null, ready: false, error: null, listeners: new Set() };
const API = SUPABASE.url + '/functions/v1/api';
const emit = () => cloud.listeners.forEach((f) => { try { f(); } catch { /* ignore */ } });
export const onCloud = (f) => { cloud.listeners.add(f); return () => cloud.listeners.delete(f); };

export async function api(action, body = {}, headers = {}) {
  const h = { 'content-type': 'application/json', apikey: SUPABASE.anonKey, ...headers };
  const s = cloud.sb && (await cloud.sb.auth.getSession()).data.session; if (s) h.authorization = 'Bearer ' + s.access_token;
  const r = await fetch(API, { method: 'POST', headers: h, body: JSON.stringify({ action, ...body }) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || 'Something went wrong (' + r.status + ')');
  return j;
}

let pushTimer = 0;
export async function initCloud() {
  if (!window.supabase) { cloud.error = 'offline'; emit(); return; }
  try {
    cloud.sb = window.supabase.createClient(SUPABASE.url, SUPABASE.anonKey, { auth: { persistSession: true, autoRefreshToken: true, storageKey: 'f52.auth', detectSessionInUrl: false } });
    let { data: { session } } = await cloud.sb.auth.getSession();
    if (!session) { const r = await cloud.sb.auth.signInAnonymously(); if (r.error) throw r.error; session = r.data.session; }
    cloud.me = session.user; cloud.ready = true; cloud.error = null;
    await pull();
    if (store.name) await cloud.sb.from('profiles').upsert({ id: cloud.me.id, name: store.name, share_checkins: store.prefs.shareCheckins });
    store.on(() => { clearTimeout(pushTimer); pushTimer = setTimeout(() => push().catch(() => {}), 1500); });
    emit();
  } catch (e) { console.warn('cloud', e); cloud.error = String(e.message || e); emit(); }
}

function mergeData(local, remote) {
  if (!remote || typeof remote !== 'object') return local;
  const ids = new Map(local.journal.map((e) => [e.id, e]));
  for (const e of remote.journal || []) { const l = ids.get(e.id); if (!l) local.journal.push(e); else if ((e.updated || 0) > (l.updated || 0)) Object.assign(l, e); }
  local.journal.sort((a, b) => String(b.created).localeCompare(String(a.created)));
  for (const k of ['highlights', 'notes', 'weekNotes', 'meetingNotes']) local[k] = { ...(remote[k] || {}), ...(local[k] || {}) };
  local.bookmarks = [...new Set([...(local.bookmarks || []), ...(remote.bookmarks || [])])];
  const savedKeys = new Set(local.saved.map((s) => s.key)); for (const s of remote.saved || []) if (!savedKeys.has(s.key)) local.saved.push(s);
  local.collections = [...new Set([...(local.collections || []), ...(remote.collections || [])])];
  for (const [id, c] of Object.entries(remote.memory?.cards || {})) { const l = local.memory.cards[id]; if (!l || (c.last || 0) > (l.last || 0)) local.memory.cards[id] = c; }
  const cust = new Set(local.memory.custom.map((c) => c.id)); for (const c of remote.memory?.custom || []) if (!cust.has(c.id)) local.memory.custom.push(c);
  for (const [n, p] of Object.entries(remote.dayParts || {})) local.dayParts[n] = { ...p, ...(local.dayParts[n] || {}) };
  if ((remote.updated || 0) > (local.updated || 0)) { local.prefs = { ...local.prefs, ...(remote.prefs || {}) }; local.readerPos = remote.readerPos || local.readerPos; }
  local.seenAch = [...new Set([...(local.seenAch || []), ...(remote.seenAch || [])])];
  local.onboarded = local.onboarded || !!remote.onboarded;
  return local;
}
async function pull() {
  const { data } = await cloud.sb.from('progress').select('*').eq('user_id', cloud.me.id).maybeSingle();
  if (!data) { await push(); return; }
  const remoteNewer = (Date.parse(data.updated_at) || 0) > (store.st.updated || 0);
  (data.done || []).forEach((n) => store.done.add(n)); (data.missions || []).forEach((n) => store.missions.add(n));
  if (remoteNewer || !store.done.size) { store.route = data.route || store.route; store.start = data.start_date || store.start; }
  // legacy journal column (pre-redesign): one line per day
  for (const [day, body] of Object.entries(data.journal || {})) if (body && !store.dayEntry(+day)) store.st.journal.push({ id: 'legacy-' + day, type: 'reflection', title: 'Where I saw God', body, tags: [], day: +day, date: data.start_date, created: data.updated_at, updated: 0 });
  mergeData(store.st, data.data);
  store.write(false); await push();
}
export async function push() {
  if (!cloud.ready) return;
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/Detroit';
  const legacy = {}; store.st.journal.filter((e) => e.type === 'reflection' && e.day).forEach((e) => { legacy[e.day] = e.body; });
  const data = { ...store.st, prefs: { ...store.st.prefs, photo: '' } }; // photo stays on the device
  await cloud.sb.from('progress').upsert({ user_id: cloud.me.id, route: store.route, start_date: store.start, done: [...store.done], missions: [...store.missions], journal: legacy, data, tz, updated_at: new Date().toISOString() });
}
export async function saveProfile() { if (!cloud.ready) return; await cloud.sb.from('profiles').upsert({ id: cloud.me.id, name: store.name, share_checkins: store.prefs.shareCheckins }); }

/* ---------- crews ---------- */
export async function myCrews() {
  const { data, error } = await cloud.sb.from('crew_members').select('crew_id, joined_at, crews(id,code,name,owner,description,meeting_day,meeting_time,meeting_tz)').eq('user_id', cloud.me.id).order('joined_at');
  if (error) throw error; return (data || []).map((r) => r.crews).filter(Boolean);
}
export async function createCrew(name) { const r = await cloud.sb.rpc('create_crew', { crew_name: name }); if (r.error) throw r.error; return r.data; }
export async function joinCrew(code) { const r = await cloud.sb.rpc('join_crew', { invite: code }); if (r.error) throw r.error; return r.data; }
export async function crewStatus(id) { const r = await cloud.sb.rpc('crew_status', { c: id }); if (r.error) throw r.error; return r.data || []; }
export async function leaveCrew(id) { const { error } = await cloud.sb.from('crew_members').delete().eq('crew_id', id).eq('user_id', cloud.me.id); if (error) throw error; }
export async function deleteCrew(id) { const { error } = await cloud.sb.from('crews').delete().eq('id', id); if (error) throw error; }
export async function removeMember(id, uid) { const r = await cloud.sb.rpc('remove_member', { c: id, member: uid }); if (r.error) throw r.error; }
export async function updateCrew(id, patch) { const { error } = await cloud.sb.from('crews').update(patch).eq('id', id); if (error) throw error; }
export async function posts(id, limit = 40) {
  const { data, error } = await cloud.sb.from('crew_posts').select('id,user_id,kind,body,week,created_at').eq('crew_id', id).order('created_at', { ascending: false }).limit(limit);
  if (error) throw error; return data || [];
}
export async function addPost(id, kind, body, week) { const { error } = await cloud.sb.from('crew_posts').insert({ crew_id: id, user_id: cloud.me.id, kind, body, week }); if (error) throw error; api('crew_notify', { crew_id: id, kind }).catch(() => {}); }
export async function deletePost(pid) { const { error } = await cloud.sb.from('crew_posts').delete().eq('id', pid); if (error) throw error; }
export async function prayers(id) {
  const { data, error } = await cloud.sb.from('prayer_requests').select('*').eq('crew_id', id).order('created_at', { ascending: false }).limit(60);
  if (error) throw error; return data || [];
}
export async function sharePrayer(id, body) { const { error } = await cloud.sb.from('prayer_requests').insert({ crew_id: id, user_id: cloud.me.id, body }); if (error) throw error; api('crew_notify', { crew_id: id, kind: 'prayer' }).catch(() => {}); }
export async function answerPrayer(pid, note) { const { error } = await cloud.sb.from('prayer_requests').update({ answered: true, answer_note: note || null, answered_at: new Date().toISOString() }).eq('id', pid); if (error) throw error; }
export async function deletePrayer(pid) { const { error } = await cloud.sb.from('prayer_requests').delete().eq('id', pid); if (error) throw error; }
export async function prayFor(pid) { const r = await cloud.sb.rpc('pray_for', { req: pid }); if (r.error) throw r.error; return r.data; }
export async function names(ids) { if (!ids.length) return {}; const { data } = await cloud.sb.from('profiles').select('id,name').in('id', ids); return Object.fromEntries((data || []).map((p) => [p.id, p.name || 'Brother'])); }

/* ---------- notifications ---------- */
const b64u = (s) => { const p = '='.repeat((4 - (s.length % 4)) % 4); const b = atob((s + p).replace(/-/g, '+').replace(/_/g, '/')); return Uint8Array.from(b, (c) => c.charCodeAt(0)); };
export const pushSupport = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
export const isIOS = () => /iPad|iPhone|iPod/.test(navigator.userAgent);
export const isStandalone = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
export async function enablePush() {
  if (!cloud.ready) throw new Error('Notifications need an internet connection.');
  if (!pushSupport()) throw new Error(isIOS() && !isStandalone() ? 'On iPhone, add FORGED to your Home Screen and open it from there first.' : 'This browser cannot show notifications.');
  const perm = await Notification.requestPermission(); if (perm !== 'granted') throw new Error('Notifications are turned off for this app in your settings.');
  const reg = await navigator.serviceWorker.register('sw.js'); await navigator.serviceWorker.ready;
  let sub = await reg.pushManager.getSubscription(); if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64u(VAPID_PUBLIC) });
  await savePushPrefs(sub);
  return true;
}
export async function savePushPrefs(sub) {
  if (!cloud.ready) return;
  if (!sub) { const reg = await navigator.serviceWorker?.getRegistration(); sub = await reg?.pushManager.getSubscription(); }
  if (!sub) return;
  const j = sub.toJSON(); const [hh] = (store.prefs.readTime || '06:00').split(':');
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/Detroit';
  const { error } = await cloud.sb.from('push_subs').upsert({ endpoint: j.endpoint, user_id: cloud.me.id, p256dh: j.keys.p256dh, auth: j.keys.auth, hour: +hh, tz, prefs: store.prefs.notify });
  if (error) throw error;
}
export async function pushEnabled() { try { const reg = await navigator.serviceWorker?.getRegistration(); return !!(await reg?.pushManager.getSubscription()); } catch { return false; } }

/* ---------- devices, words, account ---------- */
export async function makeTransferCode() { await push(); return (await api('transfer_create')).code; }
export async function useTransferCode(code) {
  const r = await api('transfer_redeem', { code });
  const { error } = await cloud.sb.auth.verifyOtp({ token_hash: r.token_hash, type: 'magiclink' }); if (error) throw error;
  cloud.me = (await cloud.sb.auth.getUser()).data.user; store.st.updated = 0; await pull(); emit();
}
export async function latestWord() { if (!cloud.ready) return null; const { data } = await cloud.sb.from('words').select('*').order('created_at', { ascending: false }).limit(1); return data && data[0]; }
export async function allWords() { const { data } = await cloud.sb.from('words').select('*').order('created_at', { ascending: false }).limit(30); return data || []; }
export async function deleteAccount() { await api('delete_account'); await cloud.sb.auth.signOut(); cloud.ready = false; cloud.me = null; }
