// Scripture memory: weekly verse, progressive hiding, flashcards, reference recall, spaced repetition.
import { store } from '../core/store.js';
import { D, today, week, P } from '../core/data.js';
import { lookup, verseText } from '../core/bible.js';
import { $, esc, icon, toast, paintIcons, sheet, sheetHead } from '../core/ui.js';

const INTERVALS = [0, 1, 2, 4, 9, 21]; // days until next review by box (1..5)
const LEVELS = ['Read it', 'Hide some words', 'Hide most words', 'First letters', 'From memory'];
const todayStr = () => P.iso(new Date());
const addDays = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return P.iso(d); };

export const cardFor = (id) => store.st.memory.cards[id] || { box: 1, due: todayStr(), reviews: 0, last: 0 };
export function reviewCard(id, correct) {
  const c = { ...cardFor(id) }; c.box = correct ? Math.min(5, c.box + 1) : 1; c.due = addDays(INTERVALS[c.box]); c.reviews++; c.last = Date.now();
  store.st.memory.cards[id] = c; store.write(); return c;
}
// all memory items available so far: weekly verses up to this week + custom verses
export function memoryItems() {
  const w = P.weekOf(today()); const items = [];
  for (let i = 1; i <= w; i++) { const m = week(i).memory; items.push({ id: 'w' + i, ref: m.ref, text: m.text, week: i }); }
  for (const c of store.st.memory.custom) items.push({ id: c.id, ref: c.ref, text: c.text, custom: true });
  return items;
}

function masked(text, level) {
  const words = text.split(' ');
  return words.map((w, i) => {
    const hide = level === 4 || (level === 1 && i % 3 === 1) || (level === 2 && i % 4 !== 0) || false;
    if (level === 3) return `<span class="first">${esc(w.replace(/^([\u201c"'(]*\w).*$/, '$1'))}\u2026</span>`;
    return hide ? `<span class="gap" role="button" tabindex="0" aria-label="Hidden word, tap to reveal">${esc(w)}</span>` : esc(w);
  }).join(' ');
}
export function practiceBlock(mem, id) {
  return `<div data-practice="${id}" data-level="0"><p class="serif" style="font-size:1.15rem;line-height:1.6" data-ptext>${esc(mem.text)}</p><div class="faint" style="margin-top:6px">${esc(mem.ref)} \u00b7 ${esc(mem.translation || 'WEB')}</div>
    <div class="seg" style="margin-top:12px" data-plevels aria-label="Practice level">${LEVELS.map((l, i) => `<button type="button" data-l="${i}" aria-pressed="${i === 0}">${i === 0 ? 'Read' : i === 4 ? 'Recite' : i === 3 ? 'Letters' : i === 1 ? 'Some' : 'Most'}</button>`).join('')}</div>
    <script type="application/json" data-pmem>${JSON.stringify(mem).replace(/</g, '\\u003c')}</script></div>`;
}
export function wirePractice(root, id) {
  const box = root.querySelector(`[data-practice="${id}"]`); if (!box) return;
  const mem = JSON.parse(box.querySelector('[data-pmem]').textContent);
  const draw = (lv) => { box.dataset.level = lv; box.querySelector('[data-ptext]').innerHTML = lv === 4 ? '<span class="faint">Say the whole verse out loud, then tap to check.</span>' : masked(mem.text, lv); box.querySelectorAll('[data-l]').forEach((b) => b.setAttribute('aria-pressed', +b.dataset.l === lv)); };
  box.querySelector('[data-plevels]').onclick = (e) => { const b = e.target.closest('[data-l]'); if (b) draw(+b.dataset.l); };
  box.querySelector('[data-ptext]').onclick = (e) => { const g = e.target.closest('.gap'); if (g) g.classList.toggle('show'); else if (box.dataset.level === '4') box.querySelector('[data-ptext]').innerHTML = esc(mem.text); };
}

export async function render(main) {
  const n = today(), w = P.weekOf(n), wk = week(w); const items = memoryItems();
  const due = items.filter((i) => cardFor(i.id).due <= todayStr());
  const mastered = items.filter((i) => cardFor(i.id).box >= 5).length;
  main.innerHTML = `
  <div class="topbar"><a class="iconbtn" href="#today" aria-label="Back">${icon('arrow-left')}</a><div class="eyebrow">Scripture memory</div><span style="width:44px"></span></div>
  <h1 class="h1">Hide it in your heart</h1>
  <p class="lead" style="margin-top:6px">A few minutes a day. Practice the weekly verse, then review older verses when they come due.</p>
  <div class="stats section"><div class="stat"><b class="num">${items.length}</b><span>verses</span></div><div class="stat"><b class="num">${due.length}</b><span>due today</span></div><div class="stat"><b class="num">${mastered}</b><span>mastered</span></div></div>
  <section class="card section"><div class="card-k">${icon('star')}<span class="t">Week ${w} verse</span><span class="r"><span class="badge">Level ${cardFor('w' + w).box}/5</span></span></div>${practiceBlock(wk.memory, 'mW')}</section>
  <section class="section"><div class="section-h"><h2 class="h2">Review</h2><span class="faint">${due.length} due</span></div><div id="mFlash"></div></section>
  <section class="section"><div class="section-h"><h2 class="h2">All verses</h2><button class="btn sm" type="button" id="mAdd">${icon('plus')} Add verse</button></div>
    <div class="list">${items.map((i) => { const c = cardFor(i.id); return `<div class="li"><span class="grow"><span class="t">${esc(i.ref)}</span><br><span class="s">${i.custom ? 'Your verse' : 'Week ' + i.week} \u00b7 level ${c.box}/5 \u00b7 next ${c.due <= todayStr() ? 'today' : esc(c.due)}</span></span>${i.custom ? `<button class="btn sm ghost" type="button" data-del="${esc(i.id)}" aria-label="Remove">${icon('trash-2')}</button>` : ''}</div>`; }).join('')}</div></section>`;
  wirePractice(main, 'mW');
  // flashcards
  let queue = [...due]; let mode = 0; // 0 = see ref, recall verse; 1 = see verse, recall ref
  const drawFlash = () => {
    const f = $('#mFlash'); const it = queue[0];
    if (!it) { f.innerHTML = `<div class="card flat" style="text-align:center">${icon('check-circle-2')}<p class="muted" style="margin-top:8px">All caught up. Come back tomorrow.</p></div>`; paintIcons(f); return; }
    f.innerHTML = `<div class="seg" style="margin-bottom:10px"><button type="button" data-mode="0" aria-pressed="${mode === 0}">Recall the verse</button><button type="button" data-mode="1" aria-pressed="${mode === 1}">Recall the reference</button></div>
      <div class="flash" id="fCard" role="button" tabindex="0" aria-label="Flashcard. Tap to reveal."><div><div class="verse">${mode === 0 ? `<b>${esc(it.ref)}</b>` : esc(it.text)}</div><div class="faint" style="margin-top:10px">Say it, then tap to check</div></div></div>
      <div class="row-btns" style="margin-top:12px;justify-content:center" id="fBtns" hidden><button class="btn" type="button" data-r="0">${icon('rotate-ccw')} Missed it</button><button class="btn primary" type="button" data-r="1">${icon('check')} Got it</button></div>
      <p class="faint" style="text-align:center;margin-top:8px">${queue.length} left</p>`;
    paintIcons(f);
    f.querySelectorAll('[data-mode]').forEach((b) => b.onclick = () => { mode = +b.dataset.mode; drawFlash(); });
    const reveal = () => { f.querySelector('.verse').innerHTML = `${esc(it.text)}<br><b style="display:block;margin-top:10px;font-family:var(--font-ui);font-size:.9rem;color:var(--accent)">${esc(it.ref)}</b>`; f.querySelector('#fBtns').hidden = false; };
    f.querySelector('#fCard').onclick = reveal; f.querySelector('#fCard').onkeydown = (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); reveal(); } };
    f.querySelectorAll('[data-r]').forEach((b) => b.onclick = () => { const ok = b.dataset.r === '1'; reviewCard(it.id, ok); queue.shift(); if (!ok) queue.push(it); if (ok) store.part(n, 'memory', true); drawFlash(); });
  };
  drawFlash();
  main.querySelectorAll('[data-del]').forEach((b) => b.onclick = () => { store.st.memory.custom = store.st.memory.custom.filter((c) => c.id !== b.dataset.del); delete store.st.memory.cards[b.dataset.del]; store.write(); render(main).then(() => paintIcons(main)); });
  $('#mAdd').onclick = () => {
    const sh = sheet(`${sheetHead('Add a verse', 'Type a reference like Romans 8:28 or Psalm 23:1-3')}<form id="aF"><label class="sr" for="aRef">Reference</label><input class="input" id="aRef" placeholder="Romans 8:28"><p class="faint" id="aPrev" style="margin-top:10px"></p><button class="btn primary block" type="submit" style="margin-top:12px">Add</button></form>`, { label: 'Add verse' });
    sh.el.querySelector('#aF').onsubmit = async (e) => {
      e.preventDefault(); const r = lookup(sh.el.querySelector('#aRef').value); const p = sh.el.querySelector('#aPrev');
      if (!r || !r.v1) { p.textContent = 'Enter a book, chapter and verse, like Romans 8:28.'; return; }
      const text = await verseText(r.usfm, r.ch, r.v1, r.v2); if (!text) { p.textContent = 'That verse wasn\u2019t found.'; return; }
      const ref = `${r.name} ${r.ch}:${r.v1}${r.v2 !== r.v1 ? '\u2013' + r.v2 : ''} (WEB)`; const id = `c-${r.usfm}.${r.ch}.${r.v1}`;
      if (!store.st.memory.custom.find((c) => c.id === id)) store.st.memory.custom.push({ id, ref, text }); store.write(); sh.close(); toast('Added'); render(main).then(() => paintIcons(main));
    };
  };
}
