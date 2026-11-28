// JOURNEY: the 12-phase, 52-week map and each week's full curriculum.
import { PHASES, FLAGS, BRAND, phaseOf } from '../config.js';
import { store } from '../core/store.js';
import { D, today, reading, week, dateFor, weekDone, missionFor, minutes, P } from '../core/data.js';
import { $, esc, icon, toast, paintIcons, fmt, confirmSheet } from '../core/ui.js';
import { openReader, openPassage } from './reader.js';
import { practiceBlock, wirePractice } from './memory.js';

export const screens = { journey: renderMap, week: renderWeek };

function renderMap(main) {
  const n = today(), cw = P.weekOf(n);
  const fullWeeks = Array.from({ length: 52 }, (_, i) => weekDone(i + 1)).filter((c) => c === 7).length;
  main.innerHTML = `
  <div class="eyebrow">The journey</div><h1 class="h1">52 weeks. 12 phases.</h1>
  <p class="lead" style="margin-top:6px">${fullWeeks} week${fullWeeks === 1 ? '' : 's'} complete. Tap any week to see its readings, devotional, mission and discussion guide.</p>
  <div class="card section flat"><div class="label">Reading plan</div>
    <div class="seg" id="jPlan"><button type="button" data-p="topical" aria-pressed="${store.route === 'topical'}">Topical</button><button type="button" data-p="chrono" aria-pressed="${store.route === 'chrono'}">Chronological</button></div>
    <p class="faint" style="margin-top:8px">${store.route === 'topical' ? 'Each weekday covers a different part of the Bible: Letters, Foundations, The Story, Prayer & Worship, Wisdom, The Prophets and Jesus.' : 'The Bible in the order events happened, from Creation to Revelation.'} Both read the whole Bible. Switching keeps your completed days.</p></div>
  ${PHASES.map((ph) => `<section class="phase"><div class="phase-h"><span class="pn">PHASE ${ph.n}</span><h2 class="h3">${esc(ph.name)}</h2></div><p class="faint" style="margin:-4px 0 10px">${esc(ph.theme)}</p>
    <div class="weeks">${Array.from({ length: ph.weeks[1] - ph.weeks[0] + 1 }, (_, k) => { const w = ph.weeks[0] + k, c = weekDone(w); return `<a class="wk${c === 7 ? ' done' : c ? ' part' : ''}${w === cw ? ' cur' : ''}" href="#week-${w}" aria-label="Week ${w}: ${esc(week(w).theme)}, ${c} of 7 read">${w}<small>${c === 7 ? icon('check') : c + '/7'}</small></a>`; }).join('')}</div></section>`).join('')}`;
  main.querySelectorAll('[data-p]').forEach((b) => b.onclick = async () => { if (b.dataset.p === store.route) return; if (await confirmSheet('Switch reading plan?', 'Your completed days stay completed. Upcoming readings will follow the ' + (b.dataset.p === 'chrono' ? 'chronological' : 'topical') + ' plan.', 'Switch')) { store.route = b.dataset.p; store.write(); renderMap(main); paintIcons(main); } });
}

function renderWeek(main, param) {
  const w = Math.max(1, Math.min(52, +param || P.weekOf(today()))); const wk = week(w), ph = phaseOf(w); const n0 = (w - 1) * 7;
  const draft = FLAGS.contentReviewed ? '' : `<div class="draft">${icon('info')}<span>This curriculum is a draft awaiting pastoral review. Read it alongside Scripture and your church’s teaching.</span></div>`;
  const foundationRefs = wk.foundation.split(';').map((s) => s.trim());
  main.innerHTML = `
  <div class="topbar"><a class="iconbtn" href="#journey" aria-label="Back to journey">${icon('arrow-left')}</a><div class="row-btns"><a class="iconbtn" href="#week-${Math.max(1, w - 1)}" aria-label="Previous week">${icon('chevron-left')}</a><a class="iconbtn" href="#week-${Math.min(52, w + 1)}" aria-label="Next week">${icon('chevron-right')}</a></div></div>
  <div class="eyebrow">Phase ${ph.n} · ${esc(ph.name)} · Week ${w}</div><h1 class="h1">${esc(wk.theme)}</h1>
  <p class="quote" style="margin-top:14px">${esc(wk.truth)}</p>
  <div class="refs article" style="margin-top:12px"><div class="refs">${foundationRefs.map((r) => `<button class="refbtn" type="button" data-ref="${esc(r)}">${icon('book-open')} ${esc(r)}</button>`).join('')}</div></div>

  <section class="card section"><div class="card-k">${icon('flame')}<span class="t">Opening devotional</span></div><p class="muted">${esc(wk.devotional)}</p></section>
  <section class="card section" style="border-color:rgba(var(--accent-rgb),.45)"><div class="card-k">${icon('megaphone')}<span class="t">${esc(BRAND.leaderTitle)} message</span></div><p class="muted">${esc(wk.pointman)}</p></section>

  <section class="section"><div class="section-h"><h2 class="h2">Daily readings</h2><span class="faint num">${weekDone(w)}/7</span></div>
    <div class="list">${Array.from({ length: 7 }, (_, i) => { const n = n0 + i + 1, r = reading(n), on = store.done.has(n); return `<div class="li${n === today() ? ' now' : ''}"><button class="tick" type="button" data-done="${n}" aria-pressed="${on}" aria-label="Mark day ${n} read">${icon('check')}</button><span class="grow"><span class="t">${esc(P.nice(r.ref))}</span><br><span class="s">Day ${n} · ${esc(r.day)}${r.cat ? ' · ' + esc(r.cat) : ''} · ${fmt(dateFor(n), { month: 'short', day: 'numeric' })} · ~${minutes(r.ref)} min</span></span><button class="iconbtn" type="button" data-read="${n}" aria-label="Read day ${n}">${icon('book-open')}</button></div>`; }).join('')}</div></section>

  <section class="card section"><div class="card-k">${icon('message-circle-question')}<span class="t">Daily reflection</span></div><ol class="muted" style="margin-left:18px;display:grid;gap:8px">${wk.reflect.map((q) => `<li>${esc(q)}</li>`).join('')}</ol></section>
  <section class="card section"><div class="card-k">${icon('brain')}<span class="t">Memory verse</span></div>${practiceBlock(wk.memory, 'wkMem')}</section>
  <section class="card section"><div class="card-k">${icon('target')}<span class="t">Mission</span><span class="r">${store.missions.has(w) ? '<span class="badge good">Done</span>' : ''}</span></div><p class="q">${esc(missionFor(w))}</p>${wk.alt && missionFor(w) !== wk.alt ? `<p class="faint" style="margin-top:8px">Different season of life? ${esc(wk.alt)}</p>` : ''}<button class="btn ${store.missions.has(w) ? 'done' : ''}" type="button" id="wMission" style="margin-top:12px">${icon(store.missions.has(w) ? 'check-circle-2' : 'circle')} ${store.missions.has(w) ? 'Mission done' : 'Mark mission done'}</button></section>
  <section class="card section"><div class="card-k">${icon('users')}<span class="t">Brotherhood discussion</span></div><ol class="muted" style="margin-left:18px;display:grid;gap:8px">${wk.discuss.map((q) => `<li>${esc(q)}</li>`).join('')}</ol><a class="btn" href="#lead-${w}" style="margin-top:14px">${icon('clipboard-list')} ${esc(BRAND.leaderTitle)} meeting guide</a></section>
  <section class="card section"><div class="card-k">${icon('notebook-pen')}<span class="t">End-of-week reflection</span></div><p class="q">${esc(wk.endweek)}</p><label class="sr" for="wNote">Your end-of-week reflection</label><textarea class="textarea" id="wNote" style="margin-top:10px" placeholder="Private to you">${esc(store.st.weekNotes[w] || '')}</textarea><div class="faint" id="wSaved" style="margin-top:6px">Saved privately</div></section>
  <section class="card section"><div class="card-k">${icon('hand-heart')}<span class="t">Closing prayer</span></div><p class="serif" style="font-size:1.08rem;line-height:1.6">${esc(wk.prayer)}</p></section>
  ${draft}`;
  wirePractice(main, 'wkMem');
  const rer = () => { renderWeek(main, w); paintIcons(main); };
  main.querySelectorAll('[data-ref]').forEach((b) => b.onclick = () => openPassage(b.dataset.ref.replace(/;.*/, '')));
  main.querySelectorAll('[data-done]').forEach((b) => b.onclick = () => { store.setDone(+b.dataset.done); rer(); });
  main.querySelectorAll('[data-read]').forEach((b) => b.onclick = () => openReader({ day: +b.dataset.read, onDone: rer }));
  $('#wMission').onclick = () => { store.setMission(w); rer(); };
  let t = 0; $('#wNote').oninput = (e) => { clearTimeout(t); t = setTimeout(() => { store.st.weekNotes[w] = e.target.value; store.write(); $('#wSaved').textContent = 'Saved privately'; }, 500); };
}
