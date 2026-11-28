// STUDY: understand the Bible, biblical manhood, hard questions, prayer room, Scripture library, saved verses.
// Routes: #study, #study-<section>, #study-<section>-<id>
import { FLAGS } from '../config.js';
import { store } from '../core/store.js';
import { loadStudy, today } from '../core/data.js';
import { esc, icon, paintIcons, toast, sheet, sheetHead, confirmSheet } from '../core/ui.js';
import { openReader, searchSheet } from './reader.js';
import { editor } from './journal.js';

const SECTIONS = [
  ['books', 'book-open', 'Understand the Bible', 'Book intros, the big story, covenants, how to read'],
  ['manhood', 'shield', 'Biblical manhood', '14 topics for the man of God'],
  ['questions', 'help-circle', 'Hard questions', 'Honest answers from Scripture'],
  ['prayer', 'hand-heart', 'Prayer room', 'Guided prayer for every season'],
  ['library', 'library', 'Scripture library', 'Verses by topic, ready to save'],
  ['saved', 'bookmark', 'My library', 'Your saved verses and collections'],
];
const draft = () => FLAGS.contentReviewed ? '' : `<div class="draft">${icon('info')}<span>Study content is a draft written for FORGED and awaiting pastoral review. Scripture is the authority; test everything by it.</span></div>`;
const back = (href, label) => `<div class="topbar"><a class="iconbtn" href="${href}" aria-label="Back">${icon('arrow-left')}</a><div class="eyebrow">${esc(label)}</div><button class="iconbtn" type="button" data-search aria-label="Search the Bible">${icon('search')}</button></div>`;
const refBtns = (refs) => `<div class="refs">${refs.map((r) => `<button class="refbtn" type="button" data-ref="${r.u}.${r.c}.${r.a}" data-label="${esc(r.label)}">${icon('book-open')}${esc(r.label)}</button>`).join('')}</div>`;

export async function render(main, param = '') {
  let S;
  try { S = await loadStudy(); } catch { main.innerHTML = `${back('#today', 'Study')}<div class="card"><p class="muted">Study content needs a connection the first time. Try again online.</p></div>`; return; }
  const [sec, ...rest] = param.split('-'); const id = rest.join('-');
  const view = { '': hub, books: books, book: book, bible: bibleSec, manhood: topicList, questions: topicList, prayer: topicList, library: topicList, saved: saved, assistant: assistant }[sec] || hub;
  main.innerHTML = view(S, sec, id);
  wire(main, S, sec, id);
}

function hub(S) {
  const focus = store.prefs.focus || [];
  const recs = S.manhood.filter((t) => focus.includes(t.focus)).slice(0, 4);
  return `<div class="eyebrow">Study</div><h1 class="h1">Dig deeper</h1><p class="lead" style="margin-top:6px">Understand what you read, and let it shape the man you are.</p>
  <button class="card section" type="button" data-search style="display:flex;gap:12px;align-items:center;width:100%;text-align:left">${icon('search')}<span class="grow"><b>Search the Bible</b><br><span class="faint">A passage like John 3:16 or a word like courage</span></span>${icon('chevron-right')}</button>
  ${recs.length ? `<section class="section"><div class="section-h"><h2 class="h3">Recommended for you</h2><a class="faint" href="#profile">Edit focus</a></div><div class="list">${recs.map((t) => `<a class="li" href="#study-manhood-${t.id}"><span class="grow"><span class="t">${esc(t.title)}</span><br><span class="s">${esc(t.summary)}</span></span>${icon('chevron-right')}</a>`).join('')}</div></section>` : ''}
  <div class="tiles section">${SECTIONS.map(([k, ic, t, d]) => `<a class="tile" href="#study-${k}">${icon(ic)}<b>${t}</b><span>${d}</span></a>`).join('')}
  <a class="tile" href="#study-assistant">${icon('sparkles')}<b>Study assistant</b><span>Not set up yet</span></a></div>`;
}

function books(S) {
  const ot = S.books.slice(0, 39), nt = S.books.slice(39);
  const list = (bs) => `<div class="list">${bs.map((b) => `<a class="li" href="#study-book-${b.u}"><span class="grow"><span class="t">${esc(b.name)}</span><br><span class="s">${esc(b.big.slice(0, 110))}${b.big.length > 110 ? '…' : ''}</span></span>${icon('chevron-right')}</a>`).join('')}</div>`;
  return `${back('#study', 'Understand the Bible')}<h1 class="h1">Understand the Bible</h1>
  <div class="tiles section">${S.bible.map((s) => `<a class="tile" href="#study-bible-${s.id}">${icon({ timeline: 'milestone', covenants: 'link', prophecies: 'crown', genres: 'library-big', connections: 'git-merge' }[s.id] || 'book')}<b>${esc(s.title)}</b><span>${s.items.length} ${s.id === 'timeline' ? 'eras' : 'entries'}</span></a>`).join('')}</div>
  <section class="section"><h2 class="h2">Old Testament</h2><div style="margin-top:10px">${list(ot)}</div></section>
  <section class="section"><h2 class="h2">New Testament</h2><div style="margin-top:10px">${list(nt)}</div></section>${draft()}`;
}

function book(S, sec, id) {
  const i = S.books.findIndex((b) => b.u === id); const b = S.books[i]; if (!b) return books(S);
  const prev = S.books[i - 1], next = S.books[i + 1];
  return `${back('#study-books', 'Book introduction')}<h1 class="h1">${esc(b.name)}</h1>
  <div class="card section"><dl class="kv"><div><dt>Written by</dt><dd>${esc(b.who)}</dd></div><div><dt>When and where</dt><dd>${esc(b.when)}</dd></div><div><dt>The big idea</dt><dd>${esc(b.big)}</dd></div><div><dt>Where Jesus shows up</dt><dd>${esc(b.jesus)}</dd></div></dl>
  <button class="btn primary" type="button" data-read="${b.u}" style="margin-top:18px">${icon('book-open')} Read ${esc(b.name)} 1</button></div>
  <div class="row-btns section" style="justify-content:space-between">${prev ? `<a class="btn ghost" href="#study-book-${prev.u}">${icon('chevron-left')} ${esc(prev.name)}</a>` : '<span></span>'}${next ? `<a class="btn ghost" href="#study-book-${next.u}">${esc(next.name)} ${icon('chevron-right')}</a>` : ''}</div>${draft()}`;
}

function bibleSec(S, sec, id) {
  const s = S.bible.find((x) => x.id === id); if (!s) return books(S);
  const body = s.id === 'timeline'
    ? `<div class="tl section">${s.items.map((it) => `<div class="tl-i"><b>${esc(it.title)}</b><span>${esc(it.label)}</span><p class="muted" style="margin-top:4px">${esc(it.text)}</p>${refBtns(it.refs)}</div>`).join('')}</div>`
    : `<div class="section" style="display:grid;gap:var(--s3)">${s.items.map((it) => `<div class="card"><div class="faint">${esc(it.label)}</div><div class="h3" style="margin-top:2px">${esc(it.title)}</div><p class="muted" style="margin-top:6px">${esc(it.text)}</p>${refBtns(it.refs)}</div>`).join('')}</div>`;
  return `${back('#study-books', 'Understand the Bible')}<h1 class="h1">${esc(s.title)}</h1>${body}${draft()}`;
}

const TOPIC_META = { manhood: ['Biblical manhood', 'Study what Scripture says about the man God calls you to be.'], questions: ['Hard questions', 'Honest questions deserve honest answers. Where faithful Christians disagree, we say so.'], prayer: ['Prayer room', 'Pick a guide and pray through it, one line at a time.'], library: ['Scripture library', 'Verses by topic. Tap a verse to read it in context, save it or memorize it.'] };
function topicList(S, sec, id) {
  const list = S[sec]; const [title, sub] = TOPIC_META[sec];
  if (id) { const t = list.find((x) => x.id === id); if (t) return sec === 'prayer' ? prayerGuide(t) : sec === 'library' ? libTopic(t) : article(t, sec, title); }
  return `${back('#study', title)}<h1 class="h1">${esc(title)}</h1><p class="lead" style="margin-top:6px">${esc(sub)}</p>
  <div class="list section">${list.map((t) => `<a class="li" href="#study-${sec}-${t.id}"><span class="grow"><span class="t">${esc(t.title)}</span>${t.summary ? `<br><span class="s">${esc(t.summary)}</span>` : `<br><span class="s">${t.refs.length} verses</span>`}</span>${icon('chevron-right')}</a>`).join('')}</div>${sec === 'library' ? '' : draft()}`;
}

function article(t, sec, title) {
  return `${back('#study-' + sec, title)}<article class="article"><h1 class="h1">${esc(t.title)}</h1><p class="lead" style="margin-top:8px">${esc(t.summary)}</p>
  <h3>Scripture</h3>${refBtns(t.refs)}
  ${t.body.map((p) => `<p style="margin-top:12px">${esc(p)}</p>`).join('')}
  ${t.views ? `<h3>Where Christians differ</h3><p>${esc(t.views)}</p>` : ''}
  ${t.practice ? `<h3>Put it into practice</h3><ul class="checklist">${t.practice.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}
  ${t.ask ? `<h3>Ask yourself</h3><ul class="checklist">${t.ask.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}
  <div class="row-btns" style="margin-top:20px"><button class="btn" type="button" data-journal="${esc(t.title)}">${icon('pen-line')} Journal about this</button></div></article>${draft()}`;
}

function prayerGuide(t) {
  return `${back('#study-prayer', 'Prayer room')}<h1 class="h1">${esc(t.title)}</h1><p class="lead" style="margin-top:6px">${esc(t.summary)}</p>
  <ol class="section prayer-steps" style="display:grid;gap:var(--s3);list-style:none;padding:0">${t.prompts.map((p, i) => `<li class="card tight"><div class="card-k"><span class="n">${String(i + 1).padStart(2, '0')}</span><span class="t" style="text-transform:none;letter-spacing:0;font-family:var(--font-ui);font-weight:500">${esc(p)}</span></div></li>`).join('')}</ol>
  <div class="section"><div class="label">Pray with Scripture</div>${refBtns(t.refs)}</div>
  <div class="row-btns section"><button class="btn primary" type="button" data-prayed>${icon('check')} I prayed</button><button class="btn" type="button" data-prayreq>${icon('plus')} Add a prayer request</button></div>`;
}

function libTopic(t) {
  return `${back('#study-library', 'Scripture library')}<h1 class="h1">${esc(t.title)}</h1>
  <div class="section" style="display:grid;gap:var(--s3)">${t.refs.map((r, i) => `<div class="card"><p class="serif" style="font-size:1.08rem;line-height:1.6">${esc(r.t)}</p><div class="faint" style="margin-top:6px">${esc(r.label)} (WEB)</div>
  <div class="row-btns" style="margin-top:10px"><button class="btn sm ghost" type="button" data-ref="${r.u}.${r.c}.${r.a}" data-label="${esc(r.label)}">${icon('book-open')} Context</button><button class="btn sm ghost" type="button" data-save="${i}">${icon('bookmark')} Save</button><button class="btn sm ghost" type="button" data-mem="${i}">${icon('brain')} Memorize</button></div></div>`).join('')}</div>`;
}

function saved() {
  const items = store.st.saved; const cols = store.st.collections;
  const sel = saved.col || 'All';
  const shown = sel === 'All' ? items : items.filter((x) => (x.collections || []).includes(sel));
  return `${back('#study', 'My library')}<h1 class="h1">My library</h1><p class="lead" style="margin-top:6px">Verses you saved while reading or from the Scripture library. Private to you.</p>
  <div class="chips section" id="sCols">${['All', ...cols].map((c) => `<button class="chip" type="button" data-col="${esc(c)}" aria-pressed="${c === sel}">${esc(c)} <span class="faint">${c === 'All' ? items.length : items.filter((x) => (x.collections || []).includes(c)).length}</span></button>`).join('')}</div>
  <div class="section" style="display:grid;gap:var(--s3)">${shown.length ? shown.map((x) => `<div class="card"><p class="serif" style="line-height:1.6">${esc(x.text)}</p><div class="faint" style="margin-top:6px">${esc(x.ref)}</div><div class="row-btns" style="margin-top:10px"><button class="btn sm ghost" type="button" data-open="${esc(x.ref)}">${icon('book-open')} Read</button><button class="btn sm ghost" type="button" data-unsave="${esc(x.key)}">${icon('trash-2')} Remove</button></div></div>`).join('') : `<div class="card flat"><p class="muted">Nothing here yet. In the reader, tap a verse and choose ${icon('library')} Save, or save from the Scripture library.</p><a class="btn" href="#study-library" style="margin-top:12px">Browse the library</a></div>`}</div>
  ${sel !== 'All' && sel !== 'Favorites' ? `<button class="btn ghost" type="button" data-delcol="${esc(sel)}">Delete collection</button>` : ''}`;
}

function assistant(S) {
  return `${back('#study', 'Study assistant')}<h1 class="h1">Study assistant</h1>
  <div class="card section"><div class="badge">${icon('power-off')} Not configured</div><p class="muted" style="margin-top:12px">${esc(S.assistant.note)}</p>
  <p class="muted" style="margin-top:10px">When it is set up, the assistant will help you understand passages, historical context and how to apply what you read. It will always point back to Scripture, cite references, encourage you to ask your pastor, avoid presenting itself as authoritative and never see your journal unless you choose to share an entry.</p></div>
  <p class="faint">Until then, use the book introductions, chapter recaps in the reader and the topics here.</p>`;
}

function wire(main, S, sec, id) {
  paintIcons(main);
  main.querySelectorAll('[data-search]').forEach((b) => b.onclick = searchSheet);
  main.querySelectorAll('[data-ref]').forEach((b) => b.onclick = () => { const [u, c, a] = b.dataset.ref.split('.'); const bk = S.books.find((x) => x.u === u); openReader({ chapters: [{ usfm: u, name: bk ? bk.name : u, ch: +c }], startV: +a, title: b.dataset.label }); });
  main.querySelector('[data-read]')?.addEventListener('click', (e) => { const u = e.currentTarget.dataset.read; const bk = S.books.find((x) => x.u === u); openReader({ chapters: [{ usfm: u, name: bk.name, ch: 1 }], title: bk.name + ' 1' }); });
  main.querySelector('[data-journal]')?.addEventListener('click', (e) => editor({ type: 'reflection', title: e.currentTarget.dataset.journal, tags: ['study'] }, () => toast('Saved to your journal')));
  main.querySelector('[data-prayed]')?.addEventListener('click', () => { store.part(today(), 'prayer', true); toast('Amen. Marked as prayed today.'); });
  main.querySelector('[data-prayreq]')?.addEventListener('click', () => editor({ type: 'prayer', scope: 'personal' }, () => toast('Prayer request saved')));
  if (sec === 'library' && id) {
    const t = S.library.find((x) => x.id === id);
    const key = (r) => `${r.u}.${r.c}.${r.a}` + (r.b !== r.a ? '-' + r.b : '');
    main.querySelectorAll('[data-save]').forEach((b) => b.onclick = () => { const r = t.refs[+b.dataset.save]; const k = key(r); const ex = store.st.saved.find((x) => x.key === k); if (ex) { ex.collections = [...new Set([...(ex.collections || []), 'Favorites', t.title])]; } else store.st.saved.unshift({ key: k, ref: r.label, text: r.t, collections: ['Favorites', t.title], saved: new Date().toISOString() }); if (!store.st.collections.includes(t.title)) store.st.collections.push(t.title); store.write(); toast(`Saved to Favorites and ${t.title}`); });
    main.querySelectorAll('[data-mem]').forEach((b) => b.onclick = () => { const r = t.refs[+b.dataset.mem]; const mid = 'c-' + key(r); if (!store.st.memory.custom.find((x) => x.id === mid)) store.st.memory.custom.push({ id: mid, ref: r.label, text: r.t }); store.write(); toast('Added to Scripture memory'); });
  }
  if (sec === 'saved') {
    const redraw = () => { main.innerHTML = saved(); wire(main, S, sec, id); };
    main.querySelector('#sCols').onclick = (e) => { const b = e.target.closest('[data-col]'); if (b) { saved.col = b.dataset.col; redraw(); } };
    main.querySelectorAll('[data-open]').forEach((b) => b.onclick = () => openRefLabel(b.dataset.open, S));
    main.querySelectorAll('[data-unsave]').forEach((b) => b.onclick = () => { store.st.saved = store.st.saved.filter((x) => x.key !== b.dataset.unsave); store.write(); redraw(); });
    main.querySelector('[data-delcol]')?.addEventListener('click', async (e) => { const c = e.currentTarget.dataset.delcol; if (!(await confirmSheet(`Delete “${c}”?`, 'The verses stay in your library.', 'Delete', true))) return; store.st.collections = store.st.collections.filter((x) => x !== c); store.st.saved.forEach((x) => { x.collections = (x.collections || []).filter((y) => y !== c); }); saved.col = 'All'; store.write(); redraw(); });
  }
}
async function openRefLabel(label, S) {
  const { lookup } = await import('../core/bible.js'); const r = lookup(label.replace(/\s*\(.*\)$/, ''));
  if (r) openReader({ chapters: [{ usfm: r.usfm, name: r.name, ch: r.ch }], startV: r.v1, title: label }); else toast('Couldn’t open ' + label);
}
