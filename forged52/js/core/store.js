// Local persistence + migration. Legacy f52.* keys stay the source of truth for plan progress
// (and keep being written), so nothing a user saved before the redesign is lost or moved.
import { nextSunday, iso, dateFor } from './plan.js';

const ls = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch { /* storage full or blocked */ } },
  del(k) { try { localStorage.removeItem(k); } catch { /* ignore */ } },
  keys() { try { const out = []; for (let i = 0; i < localStorage.length; i++) out.push(localStorage.key(i)); return out; } catch { return []; } },
};
export { ls };

const STATE_KEY = 'forged.state';
export const SCHEMA = 1;

const defaults = () => ({
  v: SCHEMA,
  journal: [],          // {id,type,title,body,tags[],day?,ref?,date,created,updated,answered?,answeredNote?,scope?}
  highlights: {},       // "ROM.1.16": "gold"
  notes: {},            // "ROM.1.16": "text"
  bookmarks: [],        // "ROM.1.16" or "ROM.1"
  saved: [],            // {key, ref, text, collections[]}
  collections: ['Favorites'],
  memory: { cards: {}, custom: [] }, // cards: id -> {box,due,reviews,last}
  dayParts: {},         // "196": {word,forge,mission,prayer,memory,brotherhood}
  weekNotes: {},        // "28": end-of-week reflection
  meetingNotes: {},     // "28": Point Man notes
  readerPos: null,      // {day, ci, vi}
  prefs: {
    theme: 'iron', translation: 'nlt', readerMode: 'dark', font: 'serif', size: 1.2, lh: 1.75,
    readTime: '06:00', focus: [], season: { married: true, kids: true },
    notify: { reading: true, memory: true, prayer: false, mission: true, encourage: true, meeting: true, discussion: true, prayers: true },
    shareCheckins: true, big: false, photo: '',
  },
  seenAch: [],
  onboarded: false,
  updated: 0,
});

function migrateLegacy() {
  // 1) snapshot every legacy key before touching anything
  const snap = {}; ls.keys().filter((k) => k.startsWith('f52.')).forEach((k) => { snap[k] = ls.get(k); });
  if (Object.keys(snap).length && !ls.get('forged.backup.v0')) ls.set('forged.backup.v0', JSON.stringify({ at: new Date().toISOString(), keys: snap }));
  const st = defaults();
  // 2) daily journal lines (f52.j.N) become journal entries; the original keys are left in place
  const start = ls.get('f52.start') || iso(nextSunday());
  for (const [k, v] of Object.entries(snap)) {
    const m = k.match(/^f52\.j\.(\d+)$/);
    if (m && v) { const n = +m[1]; const d = iso(dateFor(start, n)); st.journal.push({ id: 'legacy-' + n, type: 'reflection', title: 'Where I saw God', body: v, tags: [], day: n, date: d, created: d, updated: Date.now() }); }
  }
  // 3) preferences
  const col = snap['f52.color']; st.prefs.theme = col === 'venom' ? 'venom' : 'iron';
  if (snap['f52.big'] === '1') st.prefs.big = true;
  if (snap['f52.tr2'] === 'web' || snap['f52.tr2'] === 'kjv') st.prefs.translation = 'web';
  if (snap['f52.remHour']) st.prefs.readTime = String(snap['f52.remHour']).padStart(2, '0') + ':00';
  const done = JSON.parse(snap['f52.done'] || '[]');
  st.onboarded = snap['f52.joined'] === '1' || done.length > 0;
  return st;
}

class Store {
  constructor() {
    const raw = ls.get(STATE_KEY);
    let st = null;
    try { st = raw ? JSON.parse(raw) : null; } catch { st = null; }
    if (!st) st = migrateLegacy();
    const d = defaults();
    st = { ...d, ...st, prefs: { ...d.prefs, ...(st.prefs || {}), notify: { ...d.prefs.notify, ...((st.prefs || {}).notify || {}) }, season: { ...d.prefs.season, ...((st.prefs || {}).season || {}) } }, memory: { ...d.memory, ...(st.memory || {}) } };
    this.st = st;
    this.route = ls.get('f52.plan') === 'chrono' ? 'chrono' : 'topical';
    this.start = ls.get('f52.start') || iso(nextSunday());
    this.done = new Set(JSON.parse(ls.get('f52.done') || '[]'));
    this.missions = new Set(JSON.parse(ls.get('f52.missions') || '[]'));
    this.name = ls.get('f52.name') || '';
    this.listeners = new Set();
    this.write(false);
  }
  on(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  write(notify = true) {
    this.st.updated = Date.now();
    ls.set(STATE_KEY, JSON.stringify(this.st));
    ls.set('f52.plan', this.route); ls.set('f52.start', this.start);
    ls.set('f52.done', JSON.stringify([...this.done].sort((a, b) => a - b)));
    ls.set('f52.missions', JSON.stringify([...this.missions]));
    if (this.name) ls.set('f52.name', this.name);
    if (this.st.onboarded) ls.set('f52.joined', '1');
    ls.set('f52.updated', String(this.st.updated));
    if (notify) this.listeners.forEach((fn) => { try { fn(); } catch (e) { console.warn(e); } });
  }
  get prefs() { return this.st.prefs; }
  setPref(k, v) { this.st.prefs[k] = v; this.write(); }
  setDone(n, v) { (v ?? !this.done.has(n)) ? this.done.add(n) : this.done.delete(n); this.write(); }
  setMission(w, v) { (v ?? !this.missions.has(w)) ? this.missions.add(w) : this.missions.delete(w); this.write(); }
  part(n, key, v) { const p = (this.st.dayParts[n] ||= {}); p[key] = v ?? !p[key]; this.write(); return p[key]; }
  parts(n) { return this.st.dayParts[n] || {}; }
  // journal
  addEntry(e) { const now = Date.now(); const entry = { id: 'j' + now.toString(36) + Math.random().toString(36).slice(2, 6), tags: [], created: new Date().toISOString(), updated: now, date: iso(new Date()), ...e }; this.st.journal.unshift(entry); this.mirrorLegacy(entry); this.write(); return entry; }
  updateEntry(id, patch) { const e = this.st.journal.find((x) => x.id === id); if (e) { Object.assign(e, patch, { updated: Date.now() }); this.mirrorLegacy(e); this.write(); } return e; }
  deleteEntry(id) { const e = this.st.journal.find((x) => x.id === id); this.st.journal = this.st.journal.filter((x) => x.id !== id); if (e && e.type === 'reflection' && e.day) ls.del('f52.j.' + e.day); this.write(); }
  mirrorLegacy(e) { if (e.type === 'reflection' && e.day) ls.set('f52.j.' + e.day, e.body || ''); }
  dayEntry(n) { return this.st.journal.find((x) => x.type === 'reflection' && x.day === n); }
  // export / import
  exportAll() { return { app: 'forged', schema: SCHEMA, exported: new Date().toISOString(), route: this.route, start: this.start, done: [...this.done], missions: [...this.missions], name: this.name, state: this.st }; }
  importAll(obj) {
    if (!obj || obj.app !== 'forged') throw new Error('That file is not a FORGED backup.');
    ls.set('forged.backup.beforeImport', JSON.stringify(this.exportAll()));
    this.route = obj.route || this.route; this.start = obj.start || this.start;
    (obj.done || []).forEach((n) => this.done.add(n)); (obj.missions || []).forEach((n) => this.missions.add(n));
    if (obj.name) this.name = obj.name;
    const ids = new Set(this.st.journal.map((x) => x.id));
    for (const e of (obj.state?.journal || [])) if (!ids.has(e.id)) this.st.journal.push(e);
    for (const k of ['highlights', 'notes']) this.st[k] = { ...(obj.state?.[k] || {}), ...this.st[k] };
    this.st.bookmarks = [...new Set([...(this.st.bookmarks || []), ...(obj.state?.bookmarks || [])])];
    this.write();
  }
}
export const store = new Store();
