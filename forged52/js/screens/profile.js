// PROFILE: personalization, stats, achievements, library, notifications, privacy and data.
import { BRAND, THEMES, FOCUS_AREAS, NOTIFY_CATEGORIES, FLAGS } from '../config.js';
import { store } from '../core/store.js';
import { D, today, weekDone, P } from '../core/data.js';
import * as C from '../core/cloud.js';
import { $, esc, icon, toast, paintIcons, sheet, sheetHead, confirmSheet, fmt } from '../core/ui.js';
import { ACHIEVEMENTS, patchSVG, certificate } from './achievements.js';
import { backupSheet } from './journal.js';
import { applyTheme } from '../app.js';
import { openPassage } from './reader.js';

export async function render(main) {
  const p = store.prefs; const n = today();
  const chDone = P.chaptersDone(D.plans, store.route, store.done);
  const weeksFull = Array.from({ length: 52 }, (_, i) => weekDone(i + 1)).filter((c) => c === 7).length;
  const earned = ACHIEVEMENTS.filter((a) => a.test());
  const pushOn = await C.pushEnabled();
  main.innerHTML = `
  <div style="display:flex;gap:16px;align-items:center">
    <label class="avatar" for="pPhoto" style="width:72px;height:72px;font-size:1.6rem;cursor:pointer;${p.photo ? `background-image:url(${p.photo})` : ''}" aria-label="Change profile photo">${p.photo ? '' : esc((store.name || 'F')[0].toUpperCase())}</label><input type="file" id="pPhoto" accept="image/*" class="sr">
    <div style="flex:1;min-width:0"><div class="eyebrow">Profile</div><h1 class="h1" style="font-size:2rem">${esc(store.name || 'Brother')}</h1><div class="faint">Day ${n} · ${store.route === 'chrono' ? 'Chronological' : 'Topical'} plan</div></div>
  </div>
  <div class="stats section"><div class="stat"><b class="num">${store.done.size}</b><span>days read</span></div><div class="stat"><b class="num">${chDone}</b><span>chapters</span></div><div class="stat"><b class="num">${weeksFull}</b><span>full weeks</span></div></div>

  <section class="section"><div class="section-h"><h2 class="h2">Patches</h2><span class="faint">${earned.length} of ${ACHIEVEMENTS.length}</span></div>
    <div class="patches">${ACHIEVEMENTS.map((a) => { const ok = a.test(); const [x, y] = a.prog(); return `<button class="patch${ok ? '' : ' locked'}" type="button" data-ach="${a.id}">${patchSVG(a)}<b>${esc(a.name)}</b><span>${ok ? 'Earned' : `${x}/${y}`}</span></button>`; }).join('')}</div>
    <p class="faint" style="margin-top:10px">Milestones mark faithfulness over time, never worth before God. Missed days never take a patch away.</p>
    <button class="btn" type="button" id="pCert" style="margin-top:12px">${icon('award')} Download your certificate</button></section>

  <section class="section"><h2 class="h2">You</h2>
    <div class="card" style="margin-top:12px">
      <label class="label" for="pName">Name</label><div style="display:flex;gap:8px"><input class="input" id="pName" maxlength="24" value="${esc(store.name)}" placeholder="First name"><button class="btn" type="button" id="pNameSave">Save</button></div>
      <div class="field"><div class="label">Season of life (tailors missions)</div><label class="check"><input type="checkbox" id="pMarried" ${p.season.married ? 'checked' : ''}><span>I'm married</span></label><label class="check" style="margin-top:8px"><input type="checkbox" id="pKids" ${p.season.kids ? 'checked' : ''}><span>I have children at home</span></label></div>
      <div class="field"><div class="label">Areas I want to grow in (optional)</div><div class="chips" id="pFocus">${FOCUS_AREAS.map((f) => `<button class="chip" type="button" data-f="${esc(f)}" aria-pressed="${p.focus.includes(f)}">${esc(f)}</button>`).join('')}</div><p class="faint" style="margin-top:6px">Used only to suggest Study topics. Stays private.</p></div>
    </div></section>

  <section class="section"><h2 class="h2">Reading</h2>
    <div class="card" style="margin-top:12px">
      <div class="label">Plan</div><div class="seg" id="pPlan"><button type="button" data-p="topical" aria-pressed="${store.route === 'topical'}">Topical</button><button type="button" data-p="chrono" aria-pressed="${store.route === 'chrono'}">Chronological</button></div>
      <div class="field"><label class="label" for="pStart">Start date</label><input class="input" type="date" id="pStart" value="${esc(store.start)}"></div>
      <div class="field"><div class="label">Pick up where you are</div><div style="display:flex;gap:8px"><select class="select" id="pWeek" aria-label="Week">${Array.from({ length: 52 }, (_, i) => `<option value="${i + 1}" ${P.weekOf(n) === i + 1 ? 'selected' : ''}>Week ${i + 1}</option>`).join('')}</select><select class="select" id="pDay" aria-label="Day">${P.DAYS.map((d, i) => `<option value="${i + 1}" ${((n - 1) % 7) === i ? 'selected' : ''}>${P.DAYNAME(d)}</option>`).join('')}</select><button class="btn" type="button" id="pSync">Set</button></div><label class="check" style="margin-top:8px"><input type="checkbox" id="pMark" checked><span class="faint">Mark earlier days complete</span></label></div>
      <div class="field"><div class="label">Translation</div><div class="seg" id="pTr"><button type="button" data-t="nlt" aria-pressed="${p.translation === 'nlt'}" ${FLAGS.nltEnabled ? '' : 'disabled'}>NLT</button><button type="button" data-t="web" aria-pressed="${p.translation !== 'nlt'}">WEB</button></div></div>
    </div></section>

  <section class="section"><h2 class="h2">Look</h2>
    <div class="card" style="margin-top:12px"><div class="label">Theme</div><div class="chips" id="pTheme">${THEMES.map((t) => `<button class="chip" type="button" data-th="${t.id}" aria-pressed="${p.theme === t.id}">${esc(t.name)}</button>`).join('')}</div>
      <label class="check" style="margin-top:14px"><input type="checkbox" id="pBig" ${p.big ? 'checked' : ''}><span>Larger text everywhere</span></label>
      <p class="faint" style="margin-top:8px">Reader font, size, spacing and light/sepia modes are in the reader’s <b>Aa</b> menu.</p></div></section>

  <section class="section"><h2 class="h2">Notifications</h2>
    <div class="card" style="margin-top:12px"><div class="field" style="margin-top:0"><label class="label" for="pTime">Daily reading time</label><input class="input" type="time" id="pTime" value="${esc(p.readTime)}"></div>
      <div class="field">${NOTIFY_CATEGORIES.map((c) => `<label class="check" style="margin-top:8px"><input type="checkbox" data-n="${c.id}" ${p.notify[c.id] ? 'checked' : ''}><span>${esc(c.name)}</span></label>`).join('')}</div>
      <button class="btn ${pushOn ? '' : 'primary'}" type="button" id="pPush" style="margin-top:14px">${icon('bell')} ${pushOn ? 'Save notification settings' : 'Turn on notifications'}</button>${pushOn ? ` <button class="btn ghost" type="button" id="pTest">Send a test</button>` : ''}
      <p class="faint" id="pPushMsg" style="margin-top:8px">${C.isIOS() && !C.isStandalone() ? 'On iPhone: tap Share, then Add to Home Screen, then open FORGED from your Home Screen to turn these on.' : 'Encouraging, never pushy. Turn any category off at any time.'}</p></div></section>

  <section class="section"><h2 class="h2">Your words and Scripture</h2>
    <div class="list" style="margin-top:12px"><a class="li" href="#journal">${icon('notebook-pen')}<span class="grow"><span class="t">Journal and prayers</span><br><span class="s">${store.st.journal.length} entries</span></span>${icon('chevron-right')}</a><button class="li" type="button" id="pLib" style="width:100%;text-align:left">${icon('library')}<span class="grow"><span class="t">Saved Scripture</span><br><span class="s">${store.st.saved.length} verses · ${store.st.bookmarks.length} bookmarks · ${Object.keys(store.st.notes).length} notes</span></span>${icon('chevron-right')}</button><a class="li" href="#memory">${icon('brain')}<span class="grow"><span class="t">Scripture memory</span></span>${icon('chevron-right')}</a><a class="li" href="#crew">${icon('users')}<span class="grow"><span class="t">Brotherhood</span></span>${icon('chevron-right')}</a></div></section>

  <section class="section"><h2 class="h2">Privacy and data</h2>
    <div class="card" style="margin-top:12px"><label class="check"><input type="checkbox" id="pShare" ${p.shareCheckins ? 'checked' : ''}><span><b>Share daily check-ins with my crew</b><br><span class="faint">Only whether you read today. Journals, prayers, notes and reading history are never shared.</span></span></label></div>
    <div class="list" style="margin-top:12px">
      <button class="li" type="button" id="pBackup" style="width:100%;text-align:left">${icon('archive')}<span class="grow"><span class="t">Export, backup and restore</span></span>${icon('chevron-right')}</button>
      <button class="li" type="button" id="pDevice" style="width:100%;text-align:left">${icon('smartphone')}<span class="grow"><span class="t">Use on another device</span><br><span class="s">${C.cloud.ready ? 'Your progress is backed up' : 'Connect to the internet to sync'}</span></span>${icon('chevron-right')}</button>
      <a class="li" href="#start">${icon('compass')}<span class="grow"><span class="t">Replay onboarding</span></span>${icon('chevron-right')}</a>
      <a class="li" href="#welcome">${icon('flag')}<span class="grow"><span class="t">The challenge page</span><br><span class="s">Invite a brother</span></span>${icon('chevron-right')}</a>
      <a class="li" href="#word">${icon('megaphone')}<span class="grow"><span class="t">Post a word</span><br><span class="s">For the ${esc(BRAND.leaderTitle)} with a posting key</span></span>${icon('chevron-right')}</a>
      <button class="li" type="button" id="pDelete" style="width:100%;text-align:left;color:var(--danger)">${icon('trash-2')}<span class="grow"><span class="t">Delete my account and cloud data</span></span></button>
    </div></section>

  <section class="section faint" style="font-size:.8rem;line-height:1.6"><p><b>Scripture:</b> World English Bible (public domain). NLT text via Tyndale’s public NLT API until Jan 1, 2027: Holy Bible, New Living Translation, copyright © 1996, 2004, 2015 by Tyndale House Foundation. Narration: Winfred W. Henson’s public-domain WEB recording (eBible.org).</p><p>${esc(BRAND.program)} is free with no ads. ${esc(BRAND.org)}.</p></section>`;
  paintIcons(main);
  const re = () => render(main);
  main.querySelectorAll('[data-ach]').forEach((b) => b.onclick = () => { const a = ACHIEVEMENTS.find((x) => x.id === b.dataset.ach); const [x, y] = a.prog(); sheet(`<div style="text-align:center">${sheetHead(a.name)}<div style="width:min(180px,55vw);margin:0 auto 12px">${patchSVG(a)}</div><p class="muted">${esc(a.desc)}</p><p class="faint" style="margin-top:8px">${a.test() ? 'Earned' : `Progress: ${x} of ${y}`}</p></div>`, { label: a.name }); });
  $('#pCert').onclick = () => certificate(store.name);
  $('#pPhoto').onchange = async (e) => { const f = e.target.files[0]; if (!f) return; const img = await createImageBitmap(f); const s = 160, cv = document.createElement('canvas'); cv.width = cv.height = s; const g = cv.getContext('2d'); const m = Math.min(img.width, img.height); g.drawImage(img, (img.width - m) / 2, (img.height - m) / 2, m, m, 0, 0, s, s); store.prefs.photo = cv.toDataURL('image/jpeg', 0.8); store.write(); re(); };
  $('#pNameSave').onclick = async () => { store.name = $('#pName').value.trim(); store.write(); await C.saveProfile(); toast('Saved'); re(); };
  $('#pMarried').onchange = (e) => { store.prefs.season.married = e.target.checked; store.write(); };
  $('#pKids').onchange = (e) => { store.prefs.season.kids = e.target.checked; store.write(); };
  $('#pFocus').onclick = (e) => { const b = e.target.closest('[data-f]'); if (!b) return; const f = b.dataset.f; const set = new Set(store.prefs.focus); set.has(f) ? set.delete(f) : set.add(f); store.prefs.focus = [...set]; store.write(); b.setAttribute('aria-pressed', set.has(f)); };
  $('#pPlan').onclick = async (e) => { const b = e.target.closest('[data-p]'); if (!b || b.dataset.p === store.route) return; if (await confirmSheet('Switch reading plan?', 'Your completed days stay completed.', 'Switch')) { store.route = b.dataset.p; store.write(); re(); } };
  $('#pStart').onchange = (e) => { if (!e.target.value) return; store.start = e.target.value; store.write(); toast('Start date saved'); };
  $('#pSync').onclick = () => { const w = +$('#pWeek').value, d = +$('#pDay').value, k = (w - 1) * 7 + d; store.start = P.startFor(k); if ($('#pMark').checked) for (let i = 1; i < k; i++) store.done.add(i); store.st.onboarded = true; store.write(); toast(`Today is now Day ${k}`); re(); };
  $('#pTr').onclick = (e) => { const b = e.target.closest('[data-t]'); if (!b || b.disabled) return; store.prefs.translation = b.dataset.t; store.write(); re(); };
  $('#pTheme').onclick = (e) => { const b = e.target.closest('[data-th]'); if (!b) return; store.prefs.theme = b.dataset.th; store.write(); applyTheme(); re(); };
  $('#pBig').onchange = (e) => { store.prefs.big = e.target.checked; store.write(); applyTheme(); };
  $('#pTime').onchange = (e) => { store.prefs.readTime = e.target.value || '06:00'; store.write(); C.savePushPrefs().catch(() => {}); };
  main.querySelectorAll('[data-n]').forEach((c) => c.onchange = () => { store.prefs.notify[c.dataset.n] = c.checked; store.write(); C.savePushPrefs().catch(() => {}); });
  $('#pPush').onclick = async () => { try { await C.enablePush(); toast('Notifications on'); re(); } catch (e) { $('#pPushMsg').textContent = e.message; } };
  $('#pTest')?.addEventListener('click', async () => { try { const r = await C.api('test_push'); toast(r.ok ? 'Test sent' : 'No device found'); } catch (e) { toast(e.message); } });
  $('#pShare').onchange = async (e) => { store.prefs.shareCheckins = e.target.checked; store.write(); await C.saveProfile().catch(() => {}); };
  $('#pBackup').onclick = () => backupSheet(re);
  $('#pLib').onclick = librarySheet;
  $('#pDevice').onclick = deviceSheet;
  $('#pDelete').onclick = async () => {
    if (!C.cloud.ready) { toast('Connect to the internet to delete cloud data'); return; }
    if (!(await confirmSheet('Delete your account?', 'This permanently deletes your cloud backup, crew memberships, shared prayer requests and posts. Data on this device stays until you clear it. This can’t be undone.', 'Delete everything', true))) return;
    try { await C.deleteAccount(); toast('Your cloud data was deleted'); setTimeout(() => location.reload(), 1200); } catch (e) { toast(e.message); }
  };
}

function librarySheet() {
  const cols = store.st.collections; let cur = 'all';
  const s = sheet(`${sheetHead('Saved Scripture')}<div class="chips" id="lsCols"></div><div id="lsList" style="margin-top:12px"></div>`, { label: 'Saved Scripture' });
  const draw = () => {
    s.el.querySelector('#lsCols').innerHTML = [['all', 'All'], ...cols.map((c) => [c, c]), ['bookmarks', 'Bookmarks'], ['notes', 'Notes']].map(([k, l]) => `<button class="chip" type="button" data-c="${esc(k)}" aria-pressed="${cur === k}">${esc(l)}</button>`).join('');
    let html = '';
    if (cur === 'bookmarks') html = store.st.bookmarks.map((k) => `<button class="li" type="button" data-open="${esc(k)}" style="width:100%;text-align:left">${icon('bookmark')}<span class="grow">${esc(keyRef(k))}</span></button>`).join('');
    else if (cur === 'notes') html = Object.entries(store.st.notes).map(([k, v]) => `<button class="li" type="button" data-open="${esc(k)}" style="width:100%;text-align:left">${icon('sticky-note')}<span class="grow"><span class="t">${esc(keyRef(k))}</span><br><span class="s">${esc(v.slice(0, 100))}</span></span></button>`).join('');
    else html = store.st.saved.filter((x) => cur === 'all' || x.collections.includes(cur)).map((x) => `<div class="li"><span class="grow"><span class="t">${esc(x.ref)}</span><br><span class="s serif">${esc(x.text.slice(0, 180))}</span></span><button class="btn sm ghost" type="button" data-un="${esc(x.key)}" aria-label="Remove">${icon('x')}</button></div>`).join('');
    s.el.querySelector('#lsList').innerHTML = html ? `<div class="list">${html}</div>` : '<p class="faint">Nothing here yet. In the reader, tap a verse to save, bookmark or add a note.</p>';
    paintIcons(s.el);
    s.el.querySelectorAll('[data-c]').forEach((b) => b.onclick = () => { cur = b.dataset.c; draw(); });
    s.el.querySelectorAll('[data-un]').forEach((b) => b.onclick = () => { store.st.saved = store.st.saved.filter((x) => x.key !== b.dataset.un); store.write(); draw(); });
    s.el.querySelectorAll('[data-open]').forEach((b) => b.onclick = () => { s.close(); openPassage(keyRef(b.dataset.open)); });
  };
  draw();
}
const keyRef = (k) => { const [u, c, v] = k.split('.'); const nm = P.BOOKNAME[u] || u; return v ? `${nm} ${c}:${v}` : `${nm} ${c}`; };

function deviceSheet() {
  const s = sheet(`${sheetHead('Use on another device', 'No email or password needed')}
    <p class="muted">Your progress, journal, highlights and crew are backed up to your private account. To move them to another phone or computer:</p>
    <ol class="muted" style="margin:10px 0 0 18px"><li>Tap <b>Make a code</b> here.</li><li>On the other device, open ${esc(BRAND.siteUrl.replace('https://', ''))} → Profile → Use on another device, and enter the code within 15 minutes.</li></ol>
    <button class="btn primary" type="button" id="dMake" style="margin-top:14px">Make a code</button> <span class="num" id="dCode" style="font-weight:700;font-size:1.4rem;letter-spacing:.1em;color:var(--accent);margin-left:8px"></span>
    <div class="divider"></div><label class="label" for="dIn">Have a code from your other device?</label><div style="display:flex;gap:8px"><input class="input" id="dIn" maxlength="9" placeholder="ABCD-EFGH" autocapitalize="characters"><button class="btn" type="button" id="dUse">Use code</button></div><p class="faint" id="dMsg" style="margin-top:8px" role="alert"></p>`, { label: 'Use on another device' });
  s.el.querySelector('#dMake').onclick = async () => { try { s.el.querySelector('#dCode').textContent = await C.makeTransferCode(); } catch (e) { s.el.querySelector('#dMsg').textContent = e.message; } };
  s.el.querySelector('#dUse').onclick = async () => { try { await C.useTransferCode(s.el.querySelector('#dIn').value); s.el.querySelector('#dMsg').textContent = 'Done. This device now shares your progress.'; store.st.onboarded = true; store.write(); } catch (e) { s.el.querySelector('#dMsg').textContent = e.message; } };
}
