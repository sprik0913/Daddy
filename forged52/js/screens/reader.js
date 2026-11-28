// Premium Bible reader: distraction-free text, highlights, notes, bookmarks, sharing, search and narration.
import { BRAND, FLAGS } from '../config.js';
import { store } from '../core/store.js';
import { reading, recapFor, bookInfo, P } from '../core/data.js';
import { chapter, audioUrl, label, lookup, search, web } from '../core/bible.js';
import { $, esc, icon, toast, sheet, sheetHead, paintIcons, share, download } from '../core/ui.js';
import { checkAchievements } from './achievements.js';

const COLORS = [['gold', '#d6aa5a'], ['olive', '#82965f'], ['blue', '#6e96c8'], ['rose', '#c8786e']];
let R = null; // active reader state

export function openReader({ day = null, chapters = null, startCi = 0, startV = null, listen = false, title = '', onDone = null } = {}) {
  const chs = chapters || P.parseRef(reading(day).ref);
  const resume = day && store.st.readerPos && store.st.readerPos.day === day ? store.st.readerPos : null;
  R = { day, chs, ci: resume ? Math.min(resume.ci, chs.length - 1) : startCi, startV: resume ? resume.vi : startV, sel: new Set(), title: title || (day ? P.nice(reading(day).ref) : label(chs[0])), onDone, audio: null, verses: [], translation: '', readCh: new Set(resume?.readCh || []) };
  const el = document.createElement('div'); el.className = 'reader'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true'); el.setAttribute('aria-label', 'Bible reader');
  el.dataset.mode = store.prefs.readerMode || 'dark';
  el.innerHTML = `
    <div class="r-top">
      <button class="r-btn" type="button" id="rClose" aria-label="Close reader">${icon('x')}</button>
      <div class="grow"><div class="rt" id="rTitle">${esc(R.title)}</div><div class="rs" id="rSub"></div></div>
      <button class="r-btn" type="button" id="rSearch" aria-label="Search the Bible">${icon('search')}</button>
      <button class="r-btn" type="button" id="rCtx" aria-label="Context">${icon('scroll')}</button>
      <button class="r-btn" type="button" id="rSet" aria-label="Reading settings">${icon('type')}</button>
    </div>
    <div class="r-chaps" id="rChaps" ${chs.length < 2 ? 'hidden' : ''}></div>
    <div class="r-body" id="rBody"><div class="r-text" id="rText"><p class="faint">Loading…</p></div></div>
    <div class="r-bar"><div class="r-audio">
      <button class="r-play" type="button" id="rPlay" aria-label="Play narration">${icon('play')}</button>
      <span class="t" id="rCur">0:00</span><input type="range" id="rSeek" min="0" max="1000" value="0" aria-label="Narration position"><span class="t" id="rDur">--:--</span>
      <button class="r-btn" type="button" id="rRate" aria-label="Playback speed" style="width:auto;padding:0 10px;font-weight:700;font-size:.85rem">1×</button>
    </div><div class="faint" style="text-align:center;font-size:.72rem;margin-top:6px;color:var(--r-dim)" id="rNarr">Narration: World English Bible, read by Winfred W. Henson (public domain)</div></div>`;
  document.body.appendChild(el); document.body.style.overflow = 'hidden'; R.el = el;
  applyReaderPrefs();
  el.querySelector('#rClose').onclick = closeReader;
  el.querySelector('#rSet').onclick = settingsSheet;
  el.querySelector('#rSearch').onclick = searchSheet;
  el.querySelector('#rCtx').onclick = contextSheet;
  el.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !document.querySelector('.sheet')) closeReader(); });
  setupAudio();
  loadChapter(R.ci).then(() => { if (listen) playAudio(); });
  paintIcons(el); el.querySelector('#rClose').focus();
}
export function closeReader() {
  if (!R) return; savePos(); if (R.audio) { R.audio.pause(); R.audio.src = ''; }
  $('.vbar')?.remove(); R.el.remove(); document.body.style.overflow = ''; const cb = R.onDone; R = null; cb && cb();
}
function applyReaderPrefs() {
  const p = store.prefs; const t = R.el.querySelector('#rText');
  R.el.dataset.mode = p.readerMode || 'dark';
  t.style.setProperty('--r-size', (p.size || 1.2) + 'rem'); t.style.setProperty('--r-lh', p.lh || 1.75);
  t.style.setProperty('--r-font', p.font === 'sans' ? 'var(--font-ui)' : 'var(--font-serif)');
}
const vkey = (c, n) => `${c.usfm}.${c.ch}.${n}`;

async function loadChapter(i) {
  R.ci = i; R.sel.clear(); $('.vbar')?.remove();
  const c = R.chs[i];
  const chips = R.el.querySelector('#rChaps');
  chips.innerHTML = R.chs.map((x, k) => `<button type="button" data-ci="${k}" class="${k === i ? 'cur' : ''} ${R.readCh.has(k) ? 'done' : ''}">${esc(label(x))}</button>`).join('');
  chips.querySelectorAll('[data-ci]').forEach((b) => b.onclick = () => { const playing = R.audio && !R.audio.paused; loadChapter(+b.dataset.ci).then(() => playing && playAudio()); });
  const text = R.el.querySelector('#rText'); text.innerHTML = '<p class="faint" style="color:var(--r-dim)">Loading…</p>';
  try {
    const { verses, translation } = await chapter(c, store.prefs.translation || 'nlt');
    R.verses = verses; R.translation = translation;
    R.el.querySelector('#rSub').textContent = `${label(c)} · ${translation}`;
    const isLast = i === R.chs.length - 1;
    text.innerHTML = `<h2>${esc(label(c))}</h2>${verses.map((v) => { const k = vkey(c, v.n); const hl = store.st.highlights[k]; const bm = store.st.bookmarks.includes(k); const note = store.st.notes[k];
      return `<span class="v${hl ? ' hl-' + hl : ''}" data-v="${v.n}" tabindex="0" role="button" aria-label="Verse ${v.n}"><sup>${v.n}</sup>${esc(v.t)}${bm ? `<span class="bm" aria-label="bookmarked"> ${icon('bookmark')}</span>` : ''}${note ? `<span class="note-ico" aria-label="has note">${icon('sticky-note')}</span>` : ''}</span> `; }).join('')}
      ${translation === 'NLT' ? '<p style="font-size:.72rem;color:var(--r-dim);margin-top:24px;line-height:1.4">Scripture quotations are taken from the Holy Bible, New Living Translation, copyright © 1996, 2004, 2015 by Tyndale House Foundation. Used by permission of Tyndale House Publishers, Carol Stream, Illinois 60188. All rights reserved.</p>' : '<p style="font-size:.72rem;color:var(--r-dim);margin-top:24px">World English Bible (public domain).</p>'}
      <div class="r-done">${isLast ? (R.day ? `<button class="btn primary" type="button" id="rFinish">${icon('check-circle-2')} ${store.done.has(R.day) ? 'Day ' + R.day + ' completed' : 'Finish Day ' + R.day}</button>` : '') : `<button class="btn" type="button" id="rNext">Next: ${esc(label(R.chs[i + 1]))} ${icon('arrow-right')}</button>`}</div>`;
    text.querySelectorAll('.v').forEach((v) => { v.onclick = () => toggleSel(+v.dataset.v); v.onkeydown = (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleSel(+v.dataset.v); } }; });
    text.querySelector('#rNext')?.addEventListener('click', () => { R.readCh.add(i); loadChapter(i + 1); });
    text.querySelector('#rFinish')?.addEventListener('click', () => { R.readCh.add(i); if (R.day && !store.done.has(R.day)) { store.setDone(R.day, true); toast('Day ' + R.day + ' complete. Well done.'); checkAchievements(); } store.st.readerPos = null; store.write(); closeReader(); });
    paintIcons(text);
    const body = R.el.querySelector('#rBody');
    if (R.startV) { const t = text.querySelector(`[data-v="${R.startV}"]`); if (t) { t.scrollIntoView({ block: 'center' }); t.classList.add('sel'); setTimeout(() => t.classList.remove('sel'), 1600); } R.startV = null; } else body.scrollTop = 0;
    body.onscroll = throttle(savePos, 800);
    R.el.querySelector('#rNarr').textContent = translation === 'WEB' ? 'Narration: World English Bible, read by Winfred W. Henson (public domain)' : 'Narration is the World English Bible (public domain); text shown is the NLT.';
    loadAudioSrc();
  } catch (e) { text.innerHTML = `<p style="color:var(--r-dim)">Couldn't load ${esc(label(c))}. Check your connection and try again.</p>`; }
}
function savePos() {
  if (!R || !R.day) return;
  const body = R.el.querySelector('#rBody'); const vs = [...R.el.querySelectorAll('.v')]; const top = body.getBoundingClientRect().top + 60;
  const cur = vs.find((v) => v.getBoundingClientRect().bottom > top);
  store.st.readerPos = { day: R.day, ci: R.ci, vi: cur ? +cur.dataset.v : 1, readCh: [...R.readCh] }; store.write(false);
}
const throttle = (fn, ms) => { let t = 0; return () => { const now = Date.now(); if (now - t > ms) { t = now; fn(); } }; };

/* ----- verse selection actions ----- */
function toggleSel(n) {
  R.sel.has(n) ? R.sel.delete(n) : R.sel.add(n);
  R.el.querySelectorAll('.v').forEach((v) => v.classList.toggle('sel', R.sel.has(+v.dataset.v)));
  drawVbar();
}
function selInfo() {
  const c = R.chs[R.ci]; const ns = [...R.sel].sort((a, b) => a - b); const vs = R.verses.filter((v) => R.sel.has(v.n));
  const ref = `${c.name} ${c.ch}:${ns[0]}${ns.length > 1 ? (ns[ns.length - 1] - ns[0] === ns.length - 1 ? '–' + ns[ns.length - 1] : ',' + ns.slice(1).join(',')) : ''}`;
  return { c, ns, text: vs.map((v) => v.t).join(' '), ref: `${ref} (${R.translation})`, keys: ns.map((n) => vkey(c, n)) };
}
function drawVbar() {
  $('.vbar')?.remove(); if (!R.sel.size) return;
  const bar = document.createElement('div'); bar.className = 'vbar'; bar.setAttribute('role', 'toolbar'); bar.setAttribute('aria-label', 'Verse actions');
  bar.innerHTML = `${COLORS.map(([k, c]) => `<button type="button" data-hl="${k}" aria-label="Highlight ${k}"><span class="swatch" style="background:${c}"></span></button>`).join('')}
    <button type="button" data-hl="" aria-label="Clear highlight">${icon('eraser')}</button>
    <button type="button" data-a="bm">${icon('bookmark')} Save</button><button type="button" data-a="note">${icon('sticky-note')} Note</button>
    <button type="button" data-a="copy">${icon('copy')} Copy</button><button type="button" data-a="share">${icon('share')} Share</button>
    <button type="button" data-a="img">${icon('image')} Image</button><button type="button" data-a="lib">${icon('library')} Library</button><button type="button" data-a="mem">${icon('brain')} Memorize</button>
    <button type="button" data-a="x" aria-label="Done">${icon('x')}</button>`;
  R.el.appendChild(bar); paintIcons(bar);
  bar.onclick = async (e) => {
    const b = e.target.closest('button'); if (!b) return; const s = selInfo();
    if ('hl' in b.dataset) { s.keys.forEach((k) => { if (b.dataset.hl) store.st.highlights[k] = b.dataset.hl; else delete store.st.highlights[k]; }); store.write(); refreshVerses(); return; }
    const a = b.dataset.a;
    if (a === 'x') { R.sel.clear(); refreshVerses(); }
    else if (a === 'bm') { s.keys.forEach((k) => { if (!store.st.bookmarks.includes(k)) store.st.bookmarks.push(k); }); store.write(); toast('Bookmarked'); refreshVerses(); }
    else if (a === 'copy') { try { await navigator.clipboard.writeText(`"${s.text}" ${s.ref}`); toast('Copied'); } catch { toast('Copy not available'); } }
    else if (a === 'share') share({ title: s.ref, text: `"${s.text}" ${s.ref}` });
    else if (a === 'img') verseImage(s);
    else if (a === 'note') noteSheet(s);
    else if (a === 'lib') librarySheet(s);
    else if (a === 'mem') { const id = 'c-' + s.keys[0]; if (!store.st.memory.custom.find((x) => x.id === id)) store.st.memory.custom.push({ id, ref: s.ref, text: s.text }); store.write(); toast('Added to Scripture memory'); }
  };
}
function refreshVerses() {
  const c = R.chs[R.ci];
  R.el.querySelectorAll('.v').forEach((v) => { const k = vkey(c, +v.dataset.v); v.className = 'v' + (store.st.highlights[k] ? ' hl-' + store.st.highlights[k] : '') + (R.sel.has(+v.dataset.v) ? ' sel' : '');
    const has = store.st.bookmarks.includes(k); const bmEl = v.querySelector('.bm'); if (has && !bmEl) { v.insertAdjacentHTML('beforeend', `<span class="bm"> ${icon('bookmark')}</span>`); paintIcons(v); } if (!has && bmEl) bmEl.remove();
    const hasN = !!store.st.notes[k]; const nEl = v.querySelector('.note-ico'); if (hasN && !nEl) { v.insertAdjacentHTML('beforeend', `<span class="note-ico">${icon('sticky-note')}</span>`); paintIcons(v); } if (!hasN && nEl) nEl.remove(); });
  drawVbar();
}
function noteSheet(s) {
  const k = s.keys[0]; const sh = sheet(`${sheetHead('Note', s.ref)}<p class="serif muted" style="margin-bottom:12px">"${esc(s.text.slice(0, 240))}"</p><label class="sr" for="nTxt">Note</label><textarea class="textarea" id="nTxt" placeholder="What is God showing you here?">${esc(store.st.notes[k] || '')}</textarea><div class="row-btns" style="margin-top:12px"><button class="btn primary" type="button" id="nSave">Save note</button>${store.st.notes[k] ? '<button class="btn ghost" type="button" id="nDel">Delete</button>' : ''}</div>`, { label: 'Verse note' });
  sh.el.querySelector('#nSave').onclick = () => { const v = sh.el.querySelector('#nTxt').value.trim(); if (v) store.st.notes[k] = v; else delete store.st.notes[k]; store.write(); sh.close(); refreshVerses(); toast('Note saved'); };
  sh.el.querySelector('#nDel')?.addEventListener('click', () => { delete store.st.notes[k]; store.write(); sh.close(); refreshVerses(); });
}
export function librarySheet(s) {
  const cols = store.st.collections;
  const sh = sheet(`${sheetHead('Save to library', s.ref)}<div class="chips" id="lCols">${cols.map((c) => `<button class="chip" type="button" aria-pressed="false" data-c="${esc(c)}">${esc(c)}</button>`).join('')}</div><form id="lNew" style="display:flex;gap:8px;margin-top:12px"><label class="sr" for="lName">New collection</label><input class="input" id="lName" maxlength="40" placeholder="New collection, e.g. Marriage"><button class="btn" type="submit">Add</button></form><button class="btn primary block" type="button" id="lSave" style="margin-top:14px">Save</button>`, { label: 'Save to library' });
  const picked = new Set(['Favorites']); sh.el.querySelector('[data-c="Favorites"]')?.setAttribute('aria-pressed', 'true');
  sh.el.querySelector('#lCols').onclick = (e) => { const b = e.target.closest('[data-c]'); if (!b) return; const c = b.dataset.c; picked.has(c) ? picked.delete(c) : picked.add(c); b.setAttribute('aria-pressed', picked.has(c)); };
  sh.el.querySelector('#lNew').onsubmit = (e) => { e.preventDefault(); const v = sh.el.querySelector('#lName').value.trim(); if (!v || cols.includes(v)) return; cols.push(v); picked.add(v); sh.el.querySelector('#lCols').insertAdjacentHTML('beforeend', `<button class="chip" type="button" aria-pressed="true" data-c="${esc(v)}">${esc(v)}</button>`); sh.el.querySelector('#lName').value = ''; };
  sh.el.querySelector('#lSave').onclick = () => { const key = s.keys.join(','); const ex = store.st.saved.find((x) => x.key === key); if (ex) ex.collections = [...new Set([...ex.collections, ...picked])]; else store.st.saved.unshift({ key, ref: s.ref, text: s.text, collections: [...picked], saved: new Date().toISOString() }); store.write(); sh.close(); toast('Saved to your library'); };
}
async function verseImage(s) {
  const W = 1080, H = 1350, cv = document.createElement('canvas'); cv.width = W; cv.height = H; const g = cv.getContext('2d');
  const grd = g.createLinearGradient(0, 0, W, H); grd.addColorStop(0, '#1D211B'); grd.addColorStop(1, '#141613'); g.fillStyle = grd; g.fillRect(0, 0, W, H);
  g.strokeStyle = 'rgba(197,155,97,.55)'; g.lineWidth = 3; g.strokeRect(54, 54, W - 108, H - 108);
  await document.fonts?.ready;
  g.fillStyle = '#F4F0E7'; g.textAlign = 'center'; let fs = 58; const maxW = W - 200;
  const wrap = (size) => { g.font = `400 ${size}px "Source Serif 4", Georgia, serif`; const words = `“${s.text}”`.split(' '); const lines = []; let line = ''; for (const w of words) { const t = line ? line + ' ' + w : w; if (g.measureText(t).width > maxW) { lines.push(line); line = w; } else line = t; } lines.push(line); return lines; };
  let lines = wrap(fs); while (lines.length * fs * 1.4 > H - 520 && fs > 30) { fs -= 4; lines = wrap(fs); }
  const top = (H - lines.length * fs * 1.4) / 2 - 40; lines.forEach((l, i) => g.fillText(l, W / 2, top + i * fs * 1.4));
  g.fillStyle = '#C59B61'; g.font = '700 40px "Barlow Condensed", sans-serif'; g.fillText(s.ref.toUpperCase(), W / 2, top + lines.length * fs * 1.4 + 70);
  g.fillStyle = 'rgba(244,240,231,.55)'; g.font = '700 30px "Barlow Condensed", sans-serif'; g.fillText(BRAND.program + ' · ' + BRAND.taglineLines[0].toUpperCase(), W / 2, H - 100);
  cv.toBlob(async (blob) => {
    const file = new File([blob], 'forged-verse.png', { type: 'image/png' });
    try { if (navigator.canShare && navigator.canShare({ files: [file] })) { await navigator.share({ files: [file], title: s.ref }); return; } } catch (e) { if (e.name === 'AbortError') return; }
    download('forged-verse.png', blob, 'image/png'); toast('Image saved');
  }, 'image/png');
}

/* ----- sheets ----- */
function settingsSheet() {
  const p = store.prefs;
  const sh = sheet(`${sheetHead('Reading settings')}
    <div class="label">Mode</div><div class="seg" id="sMode">${['dark', 'light', 'sepia'].map((m) => `<button type="button" data-m="${m}" aria-pressed="${p.readerMode === m}">${m[0].toUpperCase() + m.slice(1)}</button>`).join('')}</div>
    <div class="label" style="margin-top:16px">Typeface</div><div class="seg" id="sFont"><button type="button" data-f="serif" aria-pressed="${p.font !== 'sans'}">Serif</button><button type="button" data-f="sans" aria-pressed="${p.font === 'sans'}">Sans</button></div>
    <label class="label" style="margin-top:16px" for="sSize">Text size</label><input type="range" id="sSize" min="0.95" max="2" step="0.05" value="${p.size || 1.2}" style="width:100%;accent-color:var(--accent)">
    <label class="label" style="margin-top:12px" for="sLh">Line spacing</label><input type="range" id="sLh" min="1.4" max="2.2" step="0.05" value="${p.lh || 1.75}" style="width:100%;accent-color:var(--accent)">
    <div class="label" style="margin-top:16px">Translation</div><div class="seg" id="sTr"><button type="button" data-t="nlt" aria-pressed="${p.translation === 'nlt'}" ${FLAGS.nltEnabled ? '' : 'disabled'}>NLT</button><button type="button" data-t="web" aria-pressed="${p.translation !== 'nlt'}">WEB</button></div>
    <p class="faint" style="margin-top:8px">${FLAGS.nltEnabled ? 'NLT loads online from Tyndale’s public NLT API, which ends January 1, 2027. WEB is public domain and works offline.' : 'NLT is no longer available through Tyndale’s public API. WEB is public domain and works offline.'}</p>`, { label: 'Reading settings' });
  const set = (k, v) => { store.prefs[k] = v; store.write(); applyReaderPrefs(); };
  sh.el.querySelector('#sMode').onclick = (e) => { const b = e.target.closest('[data-m]'); if (!b) return; set('readerMode', b.dataset.m); sh.el.querySelectorAll('#sMode button').forEach((x) => x.setAttribute('aria-pressed', x === b)); };
  sh.el.querySelector('#sFont').onclick = (e) => { const b = e.target.closest('[data-f]'); if (!b) return; set('font', b.dataset.f); sh.el.querySelectorAll('#sFont button').forEach((x) => x.setAttribute('aria-pressed', x === b)); };
  sh.el.querySelector('#sSize').oninput = (e) => set('size', +e.target.value);
  sh.el.querySelector('#sLh').oninput = (e) => set('lh', +e.target.value);
  sh.el.querySelector('#sTr').onclick = (e) => { const b = e.target.closest('[data-t]'); if (!b || b.disabled) return; set('translation', b.dataset.t); sh.el.querySelectorAll('#sTr button').forEach((x) => x.setAttribute('aria-pressed', x === b)); loadChapter(R.ci); };
}
function contextSheet() {
  const c = R.chs[R.ci]; const b = bookInfo(c.usfm);
  sheet(`${sheetHead(c.name, 'Background and context')}<dl class="kv"><div><dt>This chapter</dt><dd>${esc(recapFor(c))}</dd></div>${b ? `<div><dt>Written by</dt><dd>${esc(b.who)}</dd></div><div><dt>When &amp; where</dt><dd>${esc(b.when)}</dd></div><div><dt>The big idea</dt><dd>${esc(b.big)}</dd></div><div><dt>Where Jesus shows up</dt><dd>${esc(b.jesus)}</dd></div>` : ''}</dl><p class="faint" style="margin-top:16px">Summaries are study aids written for FORGED52, not Scripture. Cross-references aren't available yet because no licensed cross-reference data is connected.</p>`, { label: 'Context' });
}
export function searchSheet() {
  const sh = sheet(`${sheetHead('Search the Bible', 'A passage like "John 3:16" or a word like "courage"')}<form id="qF" style="display:flex;gap:8px"><label class="sr" for="qIn">Search</label><input class="input" id="qIn" placeholder="John 3:16 or courage" autocomplete="off"><button class="btn primary" type="submit" aria-label="Search">${icon('search')}</button></form><div id="qRes" style="margin-top:14px"></div>`, { label: 'Search' });
  sh.el.querySelector('#qF').onsubmit = async (e) => {
    e.preventDefault(); const q = sh.el.querySelector('#qIn').value.trim(); const res = sh.el.querySelector('#qRes'); if (!q) return;
    const ref = lookup(q);
    if (ref) { sh.close(); goTo([ref], ref.v1); return; }
    res.innerHTML = '<p class="faint">Searching…</p>';
    const hits = await search(q);
    res.innerHTML = hits.length ? `<p class="faint" style="margin-bottom:8px">${hits.length >= 60 ? 'First 60 results' : hits.length + ' results'} (World English Bible)</p><div class="list">${hits.map((h, i) => `<button class="li" type="button" data-i="${i}" style="width:100%;text-align:left"><span class="grow"><span class="t">${esc(h.name)} ${h.ch}:${h.v}</span><br><span class="s">${esc(h.t.slice(0, 140))}</span></span></button>`).join('')}</div>` : '<p class="muted">No verses found. Try another word or a reference like "Psalm 23".</p>';
    res.querySelectorAll('[data-i]').forEach((b) => b.onclick = () => { const h = hits[+b.dataset.i]; sh.close(); goTo([{ usfm: h.usfm, name: h.name, ch: h.ch }], h.v); });
  };
}
function goTo(chs, v) { if (R) { R.day = null; R.chs = chs.map(({ usfm, name, ch }) => ({ usfm, name, ch })); R.startV = v; R.el.querySelector('#rTitle').textContent = label(R.chs[0]); R.el.querySelector('#rChaps').hidden = true; loadChapter(0); } else openReader({ chapters: chs.map(({ usfm, name, ch }) => ({ usfm, name, ch })), startV: v }); }
export function openPassage(refStr) { const r = lookup(refStr); if (r) openReader({ chapters: [{ usfm: r.usfm, name: r.name, ch: r.ch }], startV: r.v1, title: refStr }); else toast('Couldn’t open ' + refStr); }

/* ----- narration ----- */
function setupAudio() {
  const a = new Audio(); a.preload = 'metadata'; R.audio = a; const rates = [0.85, 1, 1.2, 1.4]; let ri = rates.indexOf(store.prefs.audioRate || 1); if (ri < 0) ri = 1; a.playbackRate = rates[ri];
  const el = R.el, play = el.querySelector('#rPlay'), seek = el.querySelector('#rSeek'), mm = (t) => isFinite(t) ? `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}` : '--:--';
  el.querySelector('#rRate').textContent = rates[ri] + '×';
  el.querySelector('#rRate').onclick = () => { ri = (ri + 1) % rates.length; a.playbackRate = rates[ri]; store.prefs.audioRate = rates[ri]; store.write(false); el.querySelector('#rRate').textContent = rates[ri] + '×'; };
  play.onclick = () => a.paused ? playAudio() : a.pause();
  a.addEventListener('play', () => { play.innerHTML = icon('pause'); paintIcons(play); play.setAttribute('aria-label', 'Pause'); });
  a.addEventListener('pause', () => { play.innerHTML = icon('play'); paintIcons(play); play.setAttribute('aria-label', 'Play narration'); });
  a.addEventListener('loadedmetadata', () => { el.querySelector('#rDur').textContent = mm(a.duration); const c = R.chs[R.ci]; if (c.v1 && a.dataset.fresh) { a.dataset.fresh = ''; a.currentTime = a.duration * ((c.v1 - 1) / (c.v2 + 40)); } });
  a.addEventListener('timeupdate', () => {
    if (!a.duration) return; seek.value = (a.currentTime / a.duration) * 1000; el.querySelector('#rCur').textContent = mm(a.currentTime);
    if (R.translation === 'WEB' && R.verses.length) { // follow along by text length
      const lens = R.verses.map((v) => v.t.length + 12); const tot = lens.reduce((x, y) => x + y, 0); let acc = 0, idx = 0; const f = a.currentTime / a.duration * tot; for (; idx < lens.length; idx++) { acc += lens[idx]; if (acc >= f) break; }
      const n = R.verses[Math.min(idx, R.verses.length - 1)].n; if (n !== R.playingV) { R.playingV = n; el.querySelectorAll('.v.playing').forEach((v) => v.classList.remove('playing')); const t = el.querySelector(`.v[data-v="${n}"]`); if (t) { t.classList.add('playing'); t.scrollIntoView({ block: 'center', behavior: 'smooth' }); } }
    }
  });
  a.addEventListener('ended', () => { R.readCh.add(R.ci); if (R.ci < R.chs.length - 1) loadChapter(R.ci + 1).then(playAudio); else if (R.day && !store.done.has(R.day)) { store.setDone(R.day, true); toast('Day ' + R.day + ' complete'); checkAchievements(); } });
  a.addEventListener('error', () => { if (a.src) toast('Narration couldn’t load. Check your connection.'); });
  seek.oninput = () => { if (a.duration) a.currentTime = (seek.value / 1000) * a.duration; };
}
async function loadAudioSrc() { const c = R.chs[R.ci]; const url = await audioUrl(c.usfm, c.ch).catch(() => null); if (url && R.audio.dataset.src !== url) { R.audio.src = url; R.audio.dataset.src = url; R.audio.dataset.fresh = '1'; } R.el.querySelector('#rPlay').disabled = !url; }
async function playAudio() {
  await loadAudioSrc(); try { await R.audio.play(); } catch { /* needs a tap */ }
  if ('mediaSession' in navigator) {
    const c = R.chs[R.ci];
    navigator.mediaSession.metadata = new MediaMetadata({ title: label(c), artist: BRAND.program, album: 'World English Bible · Winfred W. Henson', artwork: [{ src: 'assets/icon-512.png', sizes: '512x512', type: 'image/png' }] });
    navigator.mediaSession.setActionHandler('play', () => R?.audio.play()); navigator.mediaSession.setActionHandler('pause', () => R?.audio.pause());
    navigator.mediaSession.setActionHandler('nexttrack', () => { if (R && R.ci < R.chs.length - 1) loadChapter(R.ci + 1).then(playAudio); });
    navigator.mediaSession.setActionHandler('previoustrack', () => { if (R && R.ci > 0) loadChapter(R.ci - 1).then(playAudio); });
  }
}
