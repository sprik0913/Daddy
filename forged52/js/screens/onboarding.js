// ONBOARDING: seven short, skippable steps. No account required.
import { BRAND, FOCUS_AREAS } from '../config.js';
import { store, ls } from '../core/store.js';
import { P } from '../core/data.js';
import * as C from '../core/cloud.js';
import { esc, icon, paintIcons, toast, fmt } from '../core/ui.js';

const STEPS = 7;
export async function render(root) {
  let step = 0;
  const st = { route: store.route, start: store.done.size ? 'keep' : 'today', date: store.start, focus: [...store.prefs.focus], time: store.prefs.readTime, remind: false, crew: ls.get('f52.pendingCrew') ? 'join' : 'solo', name: store.name, code: ls.get('f52.pendingCrew') || '', married: store.prefs.season.married, kids: store.prefs.season.kids };
  const opt = (sel, val, ic, title, sub) => `<button class="option" type="button" data-${sel}="${val}" aria-pressed="${st[sel] === val}">${icon(ic)}<span><b>${title}</b><span>${sub}</span></span></button>`;
  const draw = () => {
    const bodies = [
      () => `<div class="eyebrow">Welcome to ${esc(BRAND.parent)}</div><h1 class="h1" style="margin-top:8px">${BRAND.taglineLines.map(esc).join('<br>')}</h1><p class="lead" style="margin-top:14px">${esc(BRAND.secondary)}</p><div class="card flat" style="margin-top:20px"><p class="muted">${esc(BRAND.grace)}</p><p class="faint" style="margin-top:10px">${BRAND.philosophy.map(esc).join(' ')}</p></div>`,
      () => `<div class="eyebrow">Step 2</div><h1 class="h1">Choose your reading plan</h1><p class="lead" style="margin-top:8px">Both read the entire Bible in 52 weeks. You can switch anytime without losing progress.</p>${opt('route', 'topical', 'layout-grid', 'Topical', 'Each weekday covers a different part of the Bible: Letters, Foundations, The Story, Prayer & Worship, Wisdom, The Prophets and Jesus.')}${opt('route', 'chrono', 'history', 'Chronological', 'The Bible in the order events happened, from Creation to Revelation.')}`,
      () => `<div class="eyebrow">Step 3</div><h1 class="h1">When do you start?</h1>${store.done.size ? opt('start', 'keep', 'check-circle-2', 'Keep my current progress', `You're on Day ${P.scheduledDay(store.start)} with ${store.done.size} readings done.`) : ''}${opt('start', 'today', 'sunrise', 'Start today', fmt(new Date(), { weekday: 'long', month: 'long', day: 'numeric' }))}${opt('start', 'sunday', 'calendar', 'Start this Sunday', fmt(P.nextSunday(), { weekday: 'long', month: 'long', day: 'numeric' }) + ' (weeks run Sunday to Saturday)')}${opt('start', 'pick', 'calendar-days', 'Pick a date', '')}<div ${st.start === 'pick' ? '' : 'hidden'} style="margin-top:10px"><label class="sr" for="oDate">Start date</label><input class="input" type="date" id="oDate" value="${esc(st.date)}"></div>`,
      () => `<div class="eyebrow">Step 4 · optional</div><h1 class="h1">Where do you want to grow?</h1><p class="lead" style="margin-top:8px">We’ll suggest Study topics. Stays private.</p><div class="chips" style="margin-top:16px" id="oFocus">${FOCUS_AREAS.map((f) => `<button class="chip" type="button" data-f="${esc(f)}" aria-pressed="${st.focus.includes(f)}">${esc(f)}</button>`).join('')}</div><div class="card flat" style="margin-top:20px"><div class="label">Season of life (tailors weekly missions)</div><label class="check"><input type="checkbox" id="oMar" ${st.married ? 'checked' : ''}><span>I’m married</span></label><label class="check" style="margin-top:8px"><input type="checkbox" id="oKids" ${st.kids ? 'checked' : ''}><span>I have children at home</span></label></div>`,
      () => `<div class="eyebrow">Step 5 · optional</div><h1 class="h1">Your daily time</h1><p class="lead" style="margin-top:8px">When will you meet with God each day? About 25 minutes, or 15 if you only read.</p><label class="label" for="oTime" style="margin-top:16px">Reading time</label><input class="input" type="time" id="oTime" value="${esc(st.time)}"><label class="check" style="margin-top:16px"><input type="checkbox" id="oRemind" ${st.remind ? 'checked' : ''}><span><b>Remind me each day</b><br><span class="faint">${C.isIOS() && !C.isStandalone() ? 'On iPhone, reminders work after you add FORGED to your Home Screen. You can turn them on later in Profile.' : 'You can change or turn this off anytime.'}</span></span></label>`,
      () => `<div class="eyebrow">Step 6 · optional</div><h1 class="h1">Brotherhood</h1><p class="lead" style="margin-top:8px">Men quit alone and finish together.</p>${opt('crew', 'solo', 'user', 'Continue on my own for now', 'You can start or join a crew anytime.')}${opt('crew', 'join', 'log-in', 'Join a crew', 'Enter a code from a brother.')}${opt('crew', 'create', 'users', 'Start a crew', 'Invite 2 to 11 men and lead weekly conversations.')}
        <div ${st.crew === 'solo' ? 'hidden' : ''} style="margin-top:14px"><label class="label" for="oName">Your first name</label><input class="input" id="oName" maxlength="24" value="${esc(st.name)}" autocomplete="given-name"><div ${st.crew === 'join' ? '' : 'hidden'} class="field"><label class="label" for="oCode">Crew code</label><input class="input" id="oCode" maxlength="6" value="${esc(st.code)}" autocapitalize="characters"></div><div ${st.crew === 'create' ? '' : 'hidden'} class="field"><label class="label" for="oCrew">Crew name</label><input class="input" id="oCrew" maxlength="40" placeholder="Tuesday Morning Men"></div></div><p class="faint" id="oMsg" role="alert" style="margin-top:8px"></p>`,
      () => `<div class="eyebrow">Step 7</div><h1 class="h1">Begin your journey</h1><p class="lead" style="margin-top:8px">Every morning: open Today, read the Word, reflect, pray, and live it out.</p><div class="card flat" style="margin-top:18px"><dl class="kv"><div><dt>Plan</dt><dd>${st.route === 'chrono' ? 'Chronological' : 'Topical'}</dd></div><div><dt>Start</dt><dd>${st.start === 'keep' ? 'Keep current progress' : st.start === 'today' ? 'Today' : st.start === 'sunday' ? fmt(P.nextSunday(), { month: 'long', day: 'numeric' }) : esc(st.date)}</dd></div><div><dt>Brotherhood</dt><dd>${st.crew === 'solo' ? 'On my own for now' : st.crew === 'join' ? 'Joining a crew' : 'Starting a crew'}</dd></div></dl></div><p class="quote" style="margin-top:20px">Be on your guard; stand firm in the faith; be courageous; be strong. Let all that you do be done in love.<cite>1 Corinthians 16:13–14</cite></p>`,
    ];
    root.innerHTML = `<div class="onb"><div class="onb-steps" aria-label="Step ${step + 1} of ${STEPS}">${Array.from({ length: STEPS }, (_, i) => `<i class="${i <= step ? 'on' : ''}"></i>`).join('')}</div>
      <div class="onb-body rise">${bodies[step]()}</div>
      <div class="onb-foot"><button class="btn ghost" type="button" id="oBack" ${step ? '' : 'style="visibility:hidden"'}>${icon('arrow-left')} Back</button><div class="row-btns">${step < STEPS - 1 ? '<button class="btn ghost" type="button" id="oSkip">Skip</button>' : ''}<button class="btn primary" type="button" id="oNext">${step === STEPS - 1 ? 'Open Today' : step === 0 ? 'Get started' : 'Next'} ${icon('arrow-right')}</button></div></div></div>`;
    paintIcons(root);
    root.querySelectorAll('[data-route],[data-start],[data-crew]').forEach((b) => b.onclick = () => { const k = Object.keys(b.dataset)[0]; st[k] = b.dataset[k]; draw(); });
    root.querySelector('#oFocus')?.addEventListener('click', (e) => { const b = e.target.closest('[data-f]'); if (!b) return; const s = new Set(st.focus); s.has(b.dataset.f) ? s.delete(b.dataset.f) : s.add(b.dataset.f); st.focus = [...s]; b.setAttribute('aria-pressed', s.has(b.dataset.f)); });
    root.querySelector('#oBack').onclick = () => { collect(); step--; draw(); };
    root.querySelector('#oSkip')?.addEventListener('click', () => { collect(); step = STEPS - 1; draw(); });
    root.querySelector('#oNext').onclick = async () => { collect(); if (step === 5 && st.crew !== 'solo' && !(await crewStep())) return; if (step < STEPS - 1) { step++; draw(); window.scrollTo(0, 0); } else finish(); };
  };
  const collect = () => {
    const v = (id) => root.querySelector(id);
    if (v('#oDate')) st.date = v('#oDate').value || st.date; if (v('#oMar')) { st.married = v('#oMar').checked; st.kids = v('#oKids').checked; }
    if (v('#oTime')) { st.time = v('#oTime').value || st.time; st.remind = v('#oRemind').checked; }
    if (v('#oName')) st.name = v('#oName').value.trim(); if (v('#oCode')) st.code = v('#oCode').value.trim(); if (v('#oCrew')) st.crewName = v('#oCrew').value.trim();
  };
  const crewStep = async () => {
    const msg = root.querySelector('#oMsg');
    if (!st.name) { msg.textContent = 'Add your first name.'; return false; }
    if (!C.cloud.ready) { msg.textContent = 'Crews need a connection. You can set this up later from Brotherhood.'; return true; }
    store.name = st.name; store.write(); await C.saveProfile().catch(() => {});
    try { if (st.crew === 'join') { await C.joinCrew(st.code); ls.del('f52.pendingCrew'); toast('You joined the crew'); } else { await C.createCrew(st.crewName || 'My crew'); toast('Crew started'); } return true; }
    catch (e) { msg.textContent = e.message || 'Couldn’t do that.'; return false; }
  };
  const finish = async () => {
    store.route = st.route;
    if (st.start === 'today') store.start = P.iso(new Date()); else if (st.start === 'sunday') store.start = P.iso(P.nextSunday()); else if (st.start === 'pick') store.start = st.date;
    Object.assign(store.prefs, { focus: st.focus, readTime: st.time, season: { married: st.married, kids: st.kids } });
    if (st.name) store.name = st.name;
    store.st.onboarded = true; store.write();
    if (st.remind) C.enablePush().catch(() => toast('Turn on reminders later in Profile'));
    location.hash = 'today';
  };
  draw();
}
