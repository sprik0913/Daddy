// Scripture access. WEB (public domain) is bundled for offline use. NLT comes from Tyndale's public API
// while it is available (non-commercial, 50 verses per anonymous request); it never gets cached to storage.
import { FLAGS } from '../config.js';
import { CANON, BOOKNAME } from './plan.js';

const cache = {};
export async function json(path) {
  if (!cache[path]) cache[path] = fetch(path).then((r) => { if (!r.ok) throw new Error(path + ' ' + r.status); return r.json(); }).catch((e) => { delete cache[path]; throw e; });
  return cache[path];
}
export const web = () => json('data/web.json');

const nltCache = new Map();
async function nltChapter(usfm, name, ch, v1, v2) {
  const key = `${usfm}.${ch}.${v1 || ''}.${v2 || ''}`; if (nltCache.has(key)) return nltCache.get(key);
  const q = usfm === 'SNG' ? 'song' : name.toLowerCase();
  let a = v1 || 1; const end = v2 || 999; const out = []; const seen = new Set();
  while (a <= end) {
    const b = Math.min(end, a + 49);
    const r = await fetch(`https://api.nlt.to/api/passages?ref=${encodeURIComponent(q + '.' + ch + ':' + a + '-' + b)}&version=NLT&key=TEST`);
    if (!r.ok) throw new Error('nlt ' + r.status);
    const html = await r.text(); let added = 0, m;
    const re = /<verse_export[^>]*\bch="(\d+)"[^>]*\bvn="(\d+)"[^>]*>([\s\S]*?)<\/verse_export>/g;
    while ((m = re.exec(html))) {
      const c = +m[1], n = +m[2]; if (c !== ch || n < a || n > b || seen.has(n)) continue;
      const h = m[3].replace(/<h[23][^>]*>[\s\S]*?<\/h[23]>/g, '').replace(/<span class="tn-ref">[\s\S]*?<\/span>/g, '').replace(/<span class="tn">[\s\S]*?<\/span>/g, '').replace(/<a class="a-tn">[\s\S]*?<\/a>/g, '').replace(/<span class="vn">[\s\S]*?<\/span>/g, '').replace(/<[^>]+>/g, ' ');
      const t = new DOMParser().parseFromString(h, 'text/html').body.textContent.replace(/\s+/g, ' ').trim();
      if (!t) continue; seen.add(n); out.push({ n, t }); added++;
    }
    if (added < b - a + 1) break; a = b + 1;
  }
  if (!out.length) throw new Error('nlt empty');
  nltCache.set(key, out); return out;
}

// Returns {verses:[{n,t}], translation:'NLT'|'WEB'}
export async function chapter(c, want = 'nlt') {
  if (want === 'nlt' && FLAGS.nltEnabled && navigator.onLine !== false) {
    try { return { verses: await nltChapter(c.usfm, c.name, c.ch, c.v1, c.v2), translation: 'NLT' }; } catch { /* fall back */ }
  }
  const W = await web(); const all = (W[c.usfm] || [])[c.ch - 1] || [];
  const a = c.v1 || 1, b = c.v2 || all.length; const verses = [];
  for (let v = a; v <= Math.min(b, all.length); v++) if (all[v - 1]) verses.push({ n: v, t: all[v - 1] });
  return { verses, translation: 'WEB' };
}

// verse text from WEB for a "USFM.ch.v" key or range
export async function verseText(usfm, ch, v1, v2 = v1) { const W = await web(); return ((W[usfm] || [])[ch - 1] || []).slice(v1 - 1, v2).join(' '); }

// Free-form reference parsing: "john 3:16", "1 cor 13", "Ps 23:1-4"
const ALIASES = {};
for (const [u, n] of CANON) { const k = n.toLowerCase(); ALIASES[k] = u; ALIASES[k.replace(/\s/g, '')] = u; ALIASES[u.toLowerCase()] = u; }
Object.assign(ALIASES, { ps: 'PSA', psalm: 'PSA', pss: 'PSA', prov: 'PRO', gen: 'GEN', ex: 'EXO', exod: 'EXO', lev: 'LEV', num: 'NUM', deut: 'DEU', josh: 'JOS', judg: 'JDG', matt: 'MAT', mt: 'MAT', mk: 'MRK', lk: 'LUK', jn: 'JHN', rom: 'ROM', gal: 'GAL', eph: 'EPH', phil: 'PHP', col: 'COL', heb: 'HEB', jas: 'JAS', rev: 'REV', isa: 'ISA', jer: 'JER', ezek: 'EZK', dan: 'DAN', eccl: 'ECC', song: 'SNG', 'song of solomon': 'SNG' });
export function lookup(q) {
  const m = String(q).trim().toLowerCase().match(/^([1-3]?\s*[a-z][a-z .]*?)\s*(\d+)(?::(\d+)(?:\s*[-–]\s*(\d+))?)?$/);
  if (!m) return null;
  const b = m[1].replace(/\./g, '').replace(/\s+/g, ' ').trim().replace(/^([1-3])\s*/, '$1 ');
  const flat = b.replace(/\s/g, '');
  const u = ALIASES[b] || ALIASES[flat] || CANON.find(([, n]) => n.toLowerCase().startsWith(b))?.[0] || CANON.find(([, n]) => n.toLowerCase().replace(/\s/g, '').startsWith(flat))?.[0];
  if (!u) return null;
  const ch = +m[2]; const count = CANON.find(([x]) => x === u)[2]; if (ch < 1 || ch > count) return null;
  return { usfm: u, name: BOOKNAME[u], ch, v1: m[3] ? +m[3] : undefined, v2: m[3] ? +(m[4] || m[3]) : undefined };
}
export async function search(term, limit = 60) {
  const t = term.trim().toLowerCase(); if (t.length < 3) return [];
  const W = await web(); const out = [];
  for (const [u] of CANON) { const b = W[u] || []; for (let c = 0; c < b.length; c++) for (let v = 0; v < b[c].length; v++) if (b[c][v].toLowerCase().includes(t)) { out.push({ usfm: u, name: BOOKNAME[u], ch: c + 1, v: v + 1, t: b[c][v] }); if (out.length >= limit) return out; } }
  return out;
}

// Human narration: Winfred W. Henson's public-domain WEB recording (ebible.org)
let AUDIO = null;
export async function audioUrl(usfm, ch) { if (!AUDIO) AUDIO = await json('data/audio.json'); const f = (AUDIO.books[usfm] || [])[ch - 1]; return f ? AUDIO.base + f : null; }
export const label = (c) => `${c.name} ${c.ch}${c.v1 ? `:${c.v1}–${c.v2}` : ''}`;
