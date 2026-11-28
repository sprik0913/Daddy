// TODAY: the dashboard men open every morning.
import { BRAND, FLAGS, phaseOf } from '../config.js';
import { store, ls } from '../core/store.js';
import { D, today, started, reading, week, dateFor, minutes, recapFor, bookInfo, weekDone, missionFor, P } from '../core/data.js';
import { cloud, onCloud, latestWord, myCrews, crewStatus, posts, prayers, names } from '../core/cloud.js';
import { $, esc, icon, toast, fmt, greeting, sheet, sheetHead, paintIcons } from '../core/ui.js';
import { openReader } from './reader.js';
import { practiceBlock, wirePractice, cardFor, reviewCard } from './memory.js';
import { checkAchievements } from './achievements.js';

const ENCOURAGE = [
  'Before you lead others, let God lead you.', 'Steady beats intense. Show up today.', 'You are not earning his love. You are learning to live in it.',
  'Iron sharpens iron. Lean on your brothers.', 'Strength under God’s control looks like humility.', 'Grace got you here. Grace will carry you on.', 'Lead your home by following Jesus first.',
];
const CLOSERS = [
  ['The steadfast love of the LORD never ceases; his mercies never come to an end; they are new every morning.', 'Lamentations 3:22–23'],
  ['He who began a good work in you will bring it to completion at the day of Jesus Christ.', 'Philippians 1:6'],
  ['Your word is a lamp to my feet and a light to my path.', 'Psalm 119:105'],
  ['Let us not grow weary of doing good, for in due season we will reap, if we do not give up.', 'Galatians 6:9'],
];

export async function render(main) {
  const n = today(), r = reading(n), w = r.week, wk = week(w), ph = phaseOf(w), isStarted = started();
  const parts = store.parts(n), done = store.done.has(n);
  const chs = P.parseRef(r.ref), first = chs[0];
  const info = first ? bookInfo(first.usfm) : null;
  const c = P.catchup(store.done, store.start);
  const gradual = store.prefs.catchup === 'gradual' && c.behind > 0;
  const extra = gradual ? P.gradualToday(store.done, store.start).filter((x) => x !== n) : [];
  const pct = Math.round((store.done.size / 364) * 100);
  const chDone = P.chaptersDone(D.plans, store.route, store.done);
  const entry = store.dayEntry(n);
  const mins = minutes(r.ref);
  const pos = store.st.readerPos && store.st.readerPos.day === n ? store.st.readerPos : null;
  const dayIdx = (n - 1) % 7; const q = wk.reflect[dayIdx % wk.reflect.length];
  const memCard = cardFor('w' + w);
  const nameStr = store.name ? esc(store.name) : 'brother';
  const draft = FLAGS.contentReviewed ? '' : `<div class="draft">${icon('info')}<span>Devotional content is a draft awaiting pastoral review. Scripture is the authority; test everything by it.</span></div>`;

  main.innerHTML = `
  <header class="topbar">
    <a class="brandmark" href="#today" style="visibility:var(--brand-vis,visible)"><img src="${BRAND.logo}" alt="" width="50" height="34"><b>FORGED<span>52</span></b></a>
    <div class="row-btns">
      <button class="iconbtn" type="button" id="tBell" aria-label="Updates">${icon('bell')}<span class="dot" id="tBellDot" hidden></span></button>
      <a class="avatar" href="#profile" aria-label="Profile" ${store.prefs.photo ? `style="background-image:url(${store.prefs.photo})"` : ''}>${store.prefs.photo ? '' : esc((store.name || 'F')[0].toUpperCase())}</a>
    </div>
  </header>

  <section class="greet rise">
    <div class="eyebrow">${fmt(new Date(), { weekday: 'long', month: 'long', day: 'numeric' })}</div>
    <h1 class="h1">${greeting()}, ${nameStr}.</h1>
    <p class="lead" style="margin-top:6px">${ENCOURAGE[(n + w) % ENCOURAGE.length]}</p>
    <div class="meta-row" style="margin-top:10px"><span>${icon('flag')} Week ${w} of 52</span><span>${icon('layers')} Phase ${ph.n}: ${ph.name}</span><span>${icon('target')} ${esc(wk.theme)}</span></div>
  </section>

  <div id="tWord"></div>

  ${!isStarted ? `<div class="card section rise"><div class="card-k"><span class="t">Getting ready</span></div><p class="muted">Your journey begins ${fmt(dateFor(1), { weekday: 'long', month: 'long', day: 'numeric' })}. You can read ahead, or start today.</p><div class="row-btns" style="margin-top:14px"><button class="btn primary" type="button" id="tStartNow">Start today</button><a class="btn ghost" href="#profile">Change start date</a></div></div>` : ''}

  ${isStarted && c.behind > 1 && !gradual && ls.get('forged.cuDismiss') !== P.iso(new Date()) ? `
  <div class="card section rise" id="tCatch">
    <div class="card-k">${icon('heart-handshake')}<span class="t">Welcome back, brother</span></div>
    <p class="muted">Today is another opportunity to grow. You're ${c.behind} reading${c.behind > 1 ? 's' : ''} behind schedule, and that's okay. Nothing is lost. Choose what works for you:</p>
    <div class="stack" style="margin-top:14px">
      <button class="btn block primary" type="button" data-cu="resume">${icon('play')} Resume where I left off (Day ${c.next})</button>
      <button class="btn block" type="button" data-cu="gradual">${icon('trending-up')} Catch up gradually (two readings a day)</button>
      <button class="btn block ghost" type="button" data-cu="keep">${icon('calendar-check')} Keep today's reading and continue at my pace</button>
    </div>
    <p class="faint" style="margin-top:10px">Resuming moves your dates forward so Day ${c.next} is today. Your completed readings stay completed.</p>
  </div>` : ''}

  <section class="card section rise">
    <div style="display:flex;gap:16px;align-items:center">
      <div class="ring" style="--p:${pct}" role="img" aria-label="${pct}% of the Bible read"><span class="num">${pct}%</span></div>
      <div style="flex:1;min-width:0">
        <div class="h3">Journey progress</div>
        <div class="faint">${store.route === 'chrono' ? 'Chronological' : 'Topical'} plan · Week ${w} of 52</div>
      </div>
    </div>
    <div class="stats" style="margin-top:16px">
      <div class="stat"><b class="num">${store.done.size}</b><span>days read</span></div>
      <div class="stat"><b class="num">${chDone}</b><span>chapters</span></div>
      <div class="stat"><b class="num">${weekDone(w)}/7</b><span>this week</span></div>
    </div>
    <div class="week7" style="margin-top:16px" aria-label="This week">${[0, 1, 2, 3, 4, 5, 6].map((i) => { const d = (w - 1) * 7 + i + 1; return `<div class="d${store.done.has(d) ? ' on' : ''}${d === n && isStarted ? ' today' : ''}"><b>${store.done.has(d) ? icon('check') : fmt(dateFor(d), { weekday: 'narrow' })}</b>${fmt(dateFor(d), { day: 'numeric' })}</div>`; }).join('')}</div>
  </section>

  <section class="card hero section rise" aria-labelledby="w01">
    <div class="card-k"><span class="n">01</span><span class="t" id="w01">The Word</span><span class="r">${done ? '<span class="badge good">' + icon('check') + ' Read</span>' : `<span class="badge">${icon('clock')} ~${mins} min</span>`}</span></div>
    <div class="faint">Day ${n} · ${esc(r.day)}${r.cat ? ' · ' + esc(r.cat) : ''}</div>
    <div class="word-ref">${esc(P.nice(r.ref))}</div>
    ${info ? `<p class="muted">${esc(recapFor(first))}</p>` : ''}
    <div class="row-btns" style="margin-top:18px">
      <button class="btn primary" type="button" id="tRead">${icon(pos ? 'book-open-check' : 'book-open')} ${pos ? 'Continue reading' : 'Start reading'}</button>
      <button class="btn" type="button" id="tListen">${icon('headphones')} Listen instead</button>
      <button class="btn ghost ${done ? 'done' : ''}" type="button" id="tDone" aria-pressed="${done}">${icon(done ? 'check-circle-2' : 'circle')} ${done ? 'Completed' : 'Mark as read'}</button>
    </div>
    ${extra.length ? `<div class="divider"></div><div class="faint" style="margin-bottom:8px">Catch-up reading</div>${extra.map((x) => `<button class="li" type="button" data-open="${x}" style="width:100%;text-align:left;border:1px solid var(--line);border-radius:10px">${icon('rotate-ccw')}<span class="grow"><span class="t">${esc(P.nice(reading(x).ref))}</span><br><span class="s">Day ${x}</span></span>${icon('chevron-right')}</button>`).join('')}` : ''}
  </section>

  <section class="card section rise" aria-labelledby="w02">
    <div class="card-k"><span class="n">02</span><span class="t" id="w02">The Forge</span><span class="r">${entry ? '<span class="badge good">' + icon('check') + ' Reflected</span>' : ''}</span></div>
    <div class="h3">${esc(wk.theme)}</div>
    <p class="quote" style="margin-top:12px">${esc(wk.truth)}</p>
    <div class="stack" style="margin-top:14px">
      ${chs.map((ch) => `<div><b>${esc(ch.name)} ${ch.ch}</b> <span class="muted">${esc(recapFor(ch))}</span></div>`).join('')}
    </div>
    ${info ? `<details class="more"><summary>${icon('scroll')} Context: ${esc(first.name)}</summary><dl class="kv" style="margin-top:10px"><div><dt>Written by</dt><dd>${esc(info.who)}</dd></div><div><dt>When &amp; where</dt><dd>${esc(info.when)}</dd></div><div><dt>Big idea</dt><dd>${esc(info.big)}</dd></div><div><dt>Where Jesus shows up</dt><dd>${esc(info.jesus)}</dd></div></dl></details>` : ''}
    <details class="more"><summary>${icon('flame')} This week's devotional</summary><p class="muted" style="margin-top:10px">${esc(wk.devotional)}</p><p class="faint" style="margin-top:8px">Foundation: ${esc(wk.foundation)}</p></details>
    <div class="divider"></div>
    <div class="eyebrow" style="margin-bottom:6px">Reflect</div>
    <p class="q">${esc(q)}</p>
    <label class="sr" for="tJournal">Your reflection</label>
    <textarea class="textarea" id="tJournal" style="margin-top:12px" placeholder="What did God show you? Private to you.">${esc(entry?.body || '')}</textarea>
    <div style="display:flex;justify-content:space-between;align-items:center;margin-top:8px;gap:10px;flex-wrap:wrap"><span class="faint" id="tSaved">${entry ? 'Saved privately' : 'Only you can see this'}</span><a class="link" href="#journal">Open journal</a></div>
    ${draft}
  </section>

  <section class="card section rise" aria-labelledby="w03">
    <div class="card-k"><span class="n">03</span><span class="t" id="w03">The Mission</span><span class="r">${store.missions.has(w) ? '<span class="badge good">' + icon('check') + ' Done</span>' : '<span class="badge">This week</span>'}</span></div>
    <p class="q">${esc(missionFor(w))}</p>
    <button class="btn ${store.missions.has(w) ? 'done' : ''}" type="button" id="tMission" style="margin-top:14px">${icon(store.missions.has(w) ? 'check-circle-2' : 'circle')} ${store.missions.has(w) ? 'Mission done' : 'Mark mission done'}</button>
  </section>

  <section class="card section rise" aria-labelledby="w04">
    <div class="card-k"><span class="n">04</span><span class="t" id="w04">The Prayer</span><span class="r">${parts.prayer ? '<span class="badge good">' + icon('check') + ' Prayed</span>' : ''}</span></div>
    <p class="serif" style="font-size:1.08rem;line-height:1.6">Lord, as I read ${esc(P.nice(r.ref))} today, open my eyes to see you and my heart to obey. ${esc(wk.prayer)}</p>
    <div class="divider"></div>
    <div class="section-h" style="margin:0 0 8px"><div class="eyebrow">My prayer requests</div><a class="link" href="#journal">All prayers</a></div>
    <div id="tPrayList" class="stack" style="gap:8px"></div>
    <form id="tPrayForm" style="display:flex;gap:8px;margin-top:10px"><label class="sr" for="tPrayIn">New prayer request</label><input class="input" id="tPrayIn" maxlength="300" placeholder="Add a prayer request"><select class="select" id="tPrayScope" style="width:auto" aria-label="For"><option value="personal">Me</option><option value="family">Family</option><option value="others">Others</option></select><button class="btn" type="submit" aria-label="Add">${icon('plus')}</button></form>
    <div id="tCrewPrayers"></div>
    <button class="btn ${parts.prayer ? 'done' : ''}" type="button" id="tPrayed" style="margin-top:14px">${icon(parts.prayer ? 'check-circle-2' : 'hand-heart')} ${parts.prayer ? 'Prayed today' : 'I prayed'}</button>
  </section>

  <section class="card section rise" aria-labelledby="w05" id="tBro">
    <div class="card-k"><span class="n">05</span><span class="t" id="w05">The Brotherhood</span></div>
    <div id="tBroBody"><p class="faint">Optional. Men grow faster together.</p><div class="row-btns" style="margin-top:12px"><a class="btn" href="#crew">${icon('users')} Start or join a crew</a></div></div>
  </section>

  <section class="card section rise" aria-labelledby="w06">
    <div class="card-k"><span class="n">06</span><span class="t" id="w06">Scripture memory</span><span class="r"><span class="badge">Level ${memCard.box}/5</span></span></div>
    ${practiceBlock(wk.memory, 'tMem')}
    <div class="row-btns" style="margin-top:14px"><button class="btn ${parts.memory ? 'done' : ''}" type="button" id="tMemDone">${icon(parts.memory ? 'check-circle-2' : 'brain')} ${parts.memory ? 'Practiced today' : 'I said it from memory'}</button><a class="btn ghost" href="#memory">Practice mode</a></div>
  </section>

  <section class="section" id="tComplete"></section>

  <details class="card section flat more" style="margin-top:24px"><summary>${icon('timer')} The daily routine (about 25 minutes)</summary>
    <ol class="muted" style="margin:12px 0 0 20px;display:grid;gap:6px"><li>Opening prayer (1 min)</li><li>Scripture reading or audio (~${mins} min today)</li><li>Understand the passage (3 min)</li><li>Reflect and journal (2 min)</li><li>Practical application (2 min)</li><li>Closing prayer (2 min)</li></ol>
    <p class="faint" style="margin-top:10px">Short on time? Read the Scripture. Everything else is here to help, never to burden.</p></details>
  <p class="faint" style="text-align:center;margin:28px 0 0">${esc(BRAND.grace)}</p>`;

  // ----- wiring -----
  const rerender = () => render(main).then(() => paintIcons(main));
  const openDay = (day, listen = false) => openReader({ day, listen, onDone: rerender });
  $('#tRead').onclick = () => openDay(n);
  $('#tListen').onclick = () => openDay(n, true);
  main.querySelectorAll('[data-open]').forEach((b) => b.onclick = () => openDay(+b.dataset.open));
  $('#tDone').onclick = () => { store.setDone(n); if (store.done.has(n)) { toast('Well done. Keep going.'); checkAchievements(); } rerender(); };
  $('#tStartNow')?.addEventListener('click', () => { store.start = P.iso(new Date()); store.write(); rerender(); });
  main.querySelectorAll('[data-cu]').forEach((b) => b.onclick = () => {
    const m = b.dataset.cu;
    if (m === 'resume') { store.start = P.startFor(c.next); store.prefs.catchup = 'normal'; store.write(); toast(`Day ${c.next} is now today`); }
    else if (m === 'gradual') { store.prefs.catchup = 'gradual'; store.write(); toast('Two readings a day until you’re caught up'); }
    else { ls.set('forged.cuDismiss', P.iso(new Date())); }
    rerender();
  });
  let jt = 0;
  $('#tJournal').addEventListener('input', (e) => {
    clearTimeout(jt); const v = e.target.value; $('#tSaved').textContent = 'Saving…';
    jt = setTimeout(() => { const ex = store.dayEntry(n); if (ex) { if (v.trim()) store.updateEntry(ex.id, { body: v }); else store.deleteEntry(ex.id); } else if (v.trim()) store.addEntry({ type: 'reflection', title: 'Where I saw God', body: v, day: n, ref: r.ref, prompt: q, date: P.iso(new Date()) }); store.part(n, 'forge', !!v.trim()); $('#tSaved').textContent = 'Saved privately'; }, 600);
  });
  $('#tMission').onclick = () => { store.setMission(w); if (store.missions.has(w)) { toast('Mission done. Lead on.'); checkAchievements(); } rerender(); };
  $('#tPrayed').onclick = () => { store.part(n, 'prayer'); checkAchievements(); rerender(); };
  $('#tMemDone').onclick = () => { if (!parts.memory) reviewCard('w' + w, true); store.part(n, 'memory', true); rerender(); };
  wirePractice(main, 'tMem');

  // prayer requests (private, local + synced to own row)
  const drawPrayers = () => {
    const open = store.st.journal.filter((e) => e.type === 'prayer' && !e.answered).slice(0, 5);
    $('#tPrayList').innerHTML = open.length ? open.map((e) => `<div class="li" style="border:1px solid var(--line);border-radius:10px;padding:10px 12px"><span class="grow"><span class="t" style="font-weight:500">${esc(e.body)}</span><br><span class="s">${esc({ personal: 'For me', family: 'For my family', others: 'For others' }[e.scope] || 'Prayer')}</span></span><button class="btn sm ghost" type="button" data-ans="${e.id}">${icon('check')} Answered</button></div>`).join('') : '<p class="faint">No open requests. Add one below.</p>';
    $('#tPrayList').querySelectorAll('[data-ans]').forEach((b) => b.onclick = () => answerSheet(b.dataset.ans, drawPrayers));
    paintIcons($('#tPrayList'));
  };
  drawPrayers();
  $('#tPrayForm').onsubmit = (e) => { e.preventDefault(); const v = $('#tPrayIn').value.trim(); if (!v) return; store.addEntry({ type: 'prayer', title: 'Prayer request', body: v, scope: $('#tPrayScope').value }); $('#tPrayIn').value = ''; drawPrayers(); toast('Added to your prayers'); };

  // completion
  const drawComplete = () => {
    const p = store.parts(n); const items = [['The Word', store.done.has(n)], ['The Forge', !!store.dayEntry(n)], ['The Mission', store.missions.has(w)], ['The Prayer', !!p.prayer], ['Memory', !!p.memory]];
    const count = items.filter((x) => x[1]).length; const closer = CLOSERS[n % CLOSERS.length];
    $('#tComplete').innerHTML = p.complete ? `<div class="card complete-day pop"><div class="glow">${icon('flame')}</div><div class="h2">Day ${n} complete</div><p class="quote" style="text-align:left;margin:16px auto 0;max-width:520px">${esc(closer[0])}<cite>${esc(closer[1])}</cite></p><p class="faint" style="margin-top:14px">Not to earn his love. Because you have it.</p></div>`
      : `<div class="card flat"><div class="section-h" style="margin:0"><div class="h3">Today's routine</div><span class="faint num">${count}/5</span></div><div class="bar" style="margin:10px 0 14px"><i style="width:${count * 20}%"></i></div><div class="chips">${items.map(([t, ok]) => `<span class="chip" aria-pressed="${ok}">${ok ? icon('check') + ' ' : ''}${t}</span>`).join('')}</div><button class="btn primary block" type="button" id="tFinish" style="margin-top:16px" ${store.done.has(n) ? '' : 'disabled'}>${icon('flag')} Complete today</button>${store.done.has(n) ? '' : '<p class="faint" style="margin-top:8px;text-align:center">Read today’s Scripture to complete the day. The rest is optional.</p>'}</div>`;
    paintIcons($('#tComplete'));
    $('#tFinish')?.addEventListener('click', () => { store.part(n, 'complete', true); drawComplete(); checkAchievements(); $('#tComplete').scrollIntoView({ behavior: 'smooth', block: 'center' }); });
  };
  drawComplete();

  // cloud-driven sections
  const drawCloud = async () => {
    if (!cloud.ready) return;
    try {
      const word = await latestWord();
      if (word && Date.now() - Date.parse(word.created_at) < 10 * 864e5) {
        $('#tWord').innerHTML = `<section class="card section rise" style="border-color:rgba(var(--accent-rgb),.5)"><div class="card-k">${icon('megaphone')}<span class="t">From the ${esc(BRAND.leaderTitle)}</span></div><div class="h3">${esc(word.title)}</div>${word.body ? `<p class="muted" style="margin-top:8px;white-space:pre-line">${esc(word.body)}</p>` : ''}${word.audio_url ? `<audio controls preload="none" src="${esc(word.audio_url)}" style="width:100%;margin-top:12px"></audio>` : ''}${word.video_url && /^https:\/\//.test(word.video_url) ? `<a class="btn" style="margin-top:12px" href="${esc(word.video_url)}" target="_blank" rel="noopener">${icon('play-circle')} Watch</a>` : ''}<div class="faint" style="margin-top:10px">${fmt(new Date(word.created_at), { weekday: 'long', month: 'short', day: 'numeric' })}</div></section>`;
        paintIcons($('#tWord')); $('#tBellDot').hidden = false;
      }
      const crews = await myCrews(); const crew = crews[0];
      if (crew) {
        const [st, ps, prs] = await Promise.all([crewStatus(crew.id), posts(crew.id, 2), prayers(crew.id)]);
        const sharing = st.filter((m) => m.shares || m.is_me); const inToday = sharing.filter((m) => m.read_today).length;
        const nm = await names([...new Set([...ps.map((x) => x.user_id), ...prs.slice(0, 3).map((x) => x.user_id)])]);
        $('#tBroBody').innerHTML = `<div class="h3">${esc(crew.name)}</div><div class="faint">${st.length} men · ${inToday} of ${sharing.length} sharing checked in today</div>
          <div class="divider"></div><div class="eyebrow" style="margin-bottom:6px">This week's question</div><p class="q">${esc(wk.discuss[0])}</p>
          ${ps.length ? `<div class="divider"></div>${ps.map((p) => `<div style="margin-bottom:10px"><span class="faint"><b style="color:var(--text)">${esc(nm[p.user_id] || 'Brother')}</b> · ${esc({ discussion: 'Discussion', encourage: 'Encouragement', testimony: 'Testimony', announcement: 'Announcement' }[p.kind])}</span><p style="margin-top:2px">${esc(p.body.slice(0, 160))}${p.body.length > 160 ? '…' : ''}</p></div>`).join('')}` : ''}
          <div class="row-btns" style="margin-top:12px"><a class="btn" href="#crew">${icon('users')} Open crew</a></div>`;
        const open = prs.filter((x) => !x.answered).slice(0, 3);
        if (open.length) { $('#tCrewPrayers').innerHTML = `<div class="divider"></div><div class="eyebrow" style="margin-bottom:6px">Brothers' requests</div>${open.map((x) => `<p class="muted" style="margin-bottom:6px"><b style="color:var(--text)">${esc(nm[x.user_id] || 'Brother')}:</b> ${esc(x.body)}</p>`).join('')}`; }
        paintIcons($('#tBro'));
      }
    } catch (e) { console.warn(e); }
  };
  drawCloud();
  const off = onCloud(drawCloud);

  $('#tBell').onclick = async () => {
    const word = cloud.ready ? await latestWord().catch(() => null) : null;
    const pend = ls.get('f52.pendingCrew');
    const items = [];
    if (word) items.push(`<a class="li" href="#today" data-close>${icon('megaphone')}<span class="grow"><span class="t">${esc(word.title)}</span><br><span class="s">From the ${esc(BRAND.leaderTitle)} · ${fmt(new Date(word.created_at), { month: 'short', day: 'numeric' })}</span></span></a>`);
    if (pend) items.push(`<a class="li" href="#crew" data-close>${icon('user-plus')}<span class="grow"><span class="t">You've been invited to a crew</span><br><span class="s">Code ${esc(pend)}</span></span></a>`);
    if (c.behind > 1) items.push(`<div class="li">${icon('heart-handshake')}<span class="grow"><span class="t">Welcome back</span><br><span class="s">Pick up at Day ${c.next} whenever you're ready.</span></span></div>`);
    sheet(sheetHead('Updates') + (items.length ? `<div class="list">${items.join('')}</div>` : '<p class="muted">You’re all caught up.</p>') + '<p class="faint" style="margin-top:14px">Manage notifications in Profile.</p>', { label: 'Updates' });
  };
  return () => off();
}

export function answerSheet(id, after) {
  const s = sheet(`${sheetHead('Answered prayer', 'Give thanks and remember what God did.')}<label class="label" for="ansNote">How did God answer? (optional)</label><textarea class="textarea" id="ansNote" placeholder="Write it down so you remember"></textarea><button class="btn primary block" type="button" id="ansSave" style="margin-top:14px">Mark answered</button>`, { label: 'Answered prayer' });
  s.el.querySelector('#ansSave').onclick = () => { store.updateEntry(id, { answered: true, answeredNote: s.el.querySelector('#ansNote').value.trim(), answeredAt: new Date().toISOString() }); s.close(); toast('Praise God'); after && after(); };
}
