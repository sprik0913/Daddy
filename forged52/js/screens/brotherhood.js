// BROTHERHOOD: private crews, opt-in check-ins, discussion, shared prayer, Point Man tools.
import { BRAND, FLAGS, phaseOf } from '../config.js';
import { store, ls } from '../core/store.js';
import { today, week, P } from '../core/data.js';
import * as C from '../core/cloud.js';
import { $, esc, icon, toast, paintIcons, sheet, sheetHead, confirmSheet, share, fmt } from '../core/ui.js';

export const screens = { crew: renderCrew, lead: renderLead };
const KIND = { discussion: ['Discussion', 'message-circle'], encourage: ['Encouragement', 'heart'], testimony: ['Testimony', 'sparkles'], announcement: ['Announcement', 'megaphone'] };
const DAYN = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const bump = () => ls.set('forged.crewActs', String(+(ls.get('forged.crewActs') || 0) + 1));

async function renderCrew(main) {
  main.innerHTML = `<div class="eyebrow">Brotherhood</div><h1 class="h1">Strengthened by brothers</h1><p class="lead" style="margin-top:6px">Accountability, not competition. You choose what you share.</p><div id="cBody" class="section"><p class="faint">Connecting…</p></div>`;
  const draw = async () => {
    const box = $('#cBody'); if (!box) return;
    if (!C.cloud.ready) { box.innerHTML = C.cloud.error ? `<div class="card"><div class="h3">Brotherhood needs a connection</div><p class="muted" style="margin-top:8px">Crews sync online. Everything else in FORGED works without one. Reconnect and reopen this page.</p></div>` : '<p class="faint">Connecting…</p>'; return; }
    let crews; try { crews = await C.myCrews(); } catch (e) { box.innerHTML = `<div class="card"><p class="muted">${esc(e.message)}</p></div>`; return; }
    if (!crews.length) return noCrew(box, draw);
    return crewView(box, crews[0], draw);
  };
  await draw(); const off = C.onCloud(draw); return () => off();
}

function noCrew(box, again) {
  const pend = ls.get('f52.pendingCrew') || '';
  box.innerHTML = `${pend ? `<div class="card" style="border-color:rgba(var(--accent-rgb),.5);margin-bottom:16px"><div class="card-k">${icon('mail-open')}<span class="t">You've been invited</span></div><p class="muted">Crew code <b class="num" style="color:var(--accent)">${esc(pend)}</b>. Add your name and join below.</p></div>` : ''}
    <div class="card"><label class="label" for="cMe">Your first name</label><input class="input" id="cMe" maxlength="24" value="${esc(store.name)}" placeholder="First name" autocomplete="given-name">
      <label class="check" style="margin-top:14px"><input type="checkbox" id="cShare" ${store.prefs.shareCheckins ? 'checked' : ''}><span><b>Share my daily check-in</b><br><span class="faint">Your crew sees whether you read today. Never your journal, prayers or notes.</span></span></label></div>
    <div class="card section"><div class="card-k">${icon('log-in')}<span class="t">Join a crew</span></div><div style="display:flex;gap:8px"><label class="sr" for="cCode">Crew code</label><input class="input" id="cCode" maxlength="6" placeholder="6-letter code" value="${esc(pend)}" autocapitalize="characters"><button class="btn primary" type="button" id="cJoin">Join</button></div></div>
    <div class="card section"><div class="card-k">${icon('plus-circle')}<span class="t">Start a crew</span></div><p class="faint" style="margin-bottom:10px">2 to 12 men. You'll be the ${esc(BRAND.leaderTitle)} and get the weekly meeting guides.</p><div style="display:flex;gap:8px"><label class="sr" for="cName">Crew name</label><input class="input" id="cName" maxlength="40" placeholder="e.g. Tuesday Morning Men"><button class="btn" type="button" id="cMake">Start</button></div></div>
    <p class="faint" id="cStatus" role="alert" style="margin-top:12px"></p>
    <p class="faint" style="margin-top:20px">Brotherhood is optional. Your reading, journal and everything else work without a crew.</p>`;
  paintIcons(box);
  const prep = async () => { const n = $('#cMe').value.trim(); if (!n) { $('#cStatus').textContent = 'Add your first name first.'; $('#cMe').focus(); return false; } store.name = n; store.prefs.shareCheckins = $('#cShare').checked; store.write(); await C.saveProfile(); return true; };
  $('#cJoin').onclick = async () => { if (!(await prep())) return; try { await C.joinCrew($('#cCode').value); ls.del('f52.pendingCrew'); toast('Welcome to the crew'); bump(); again(); } catch (e) { $('#cStatus').textContent = e.message || 'Couldn’t join.'; } };
  $('#cMake').onclick = async () => { if (!(await prep())) return; try { await C.createCrew($('#cName').value || 'My crew'); toast('Crew started. Invite your men.'); again(); } catch (e) { $('#cStatus').textContent = e.message || 'Couldn’t start the crew.'; } };
}

async function crewView(box, crew, again) {
  const leader = crew.owner === C.cloud.me.id; const w = P.weekOf(today()); const wk = week(w);
  const [st, ps, prs] = await Promise.all([C.crewStatus(crew.id), C.posts(crew.id), C.prayers(crew.id)]);
  const nm = Object.fromEntries(st.map((m) => [m.user_id, m.name]));
  const unknown = [...new Set([...ps, ...prs].map((x) => x.user_id).filter((id) => !nm[id]))]; Object.assign(nm, await C.names(unknown));
  const sharing = st.filter((m) => m.shares || m.is_me);
  const meet = crew.meeting_day != null && crew.meeting_time ? `${DAYN[crew.meeting_day]}s at ${crew.meeting_time}` : '';
  box.innerHTML = `
  <div class="card hero"><div style="display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;align-items:flex-start"><div><div class="h2">${esc(crew.name)}</div><div class="faint" style="margin-top:4px">${st.length} men · Code <b class="num" style="color:var(--accent)">${esc(crew.code)}</b>${meet ? ' · Meets ' + esc(meet) : ''}</div>${crew.description ? `<p class="muted" style="margin-top:8px">${esc(crew.description)}</p>` : ''}</div>${leader ? `<span class="badge accent">${icon('shield')} ${esc(BRAND.leaderTitle)}</span>` : ''}</div>
    <div class="row-btns" style="margin-top:16px"><button class="btn primary" type="button" id="cInvite">${icon('user-plus')} Invite men</button><a class="btn" href="#lead-${w}">${icon('clipboard-list')} Meeting guide</a>${leader ? `<button class="btn ghost" type="button" id="cManage">${icon('settings')} Manage</button>` : ''}</div></div>

  <section class="section"><div class="section-h"><h2 class="h3">This week</h2><span class="faint">${sharing.filter((m) => m.read_today).length} of ${sharing.length} sharing checked in today</span></div>
    <div class="list">${st.map((m) => `<div class="member"><span class="tick" aria-pressed="${!!m.read_today}" aria-label="${m.read_today ? 'Read today' : m.read_today === false ? 'Not yet today' : 'Not sharing'}">${icon('check')}</span><span class="grow"><b>${esc(m.name)}</b>${m.is_me ? ' <span class="faint">(you)</span>' : ''}${m.is_leader ? ` <span class="badge">${esc(BRAND.leaderTitle)}</span>` : ''}<br><span class="faint">${m.read_today == null ? 'Keeps check-ins private' : m.read_today ? 'Read today' : 'Not yet today'}${m.week_days != null ? ` · ${m.week_days}/7 this week` : ''}</span></span>${!m.is_me ? `<button class="btn sm ghost" type="button" data-enc="${m.user_id}" aria-label="Encourage ${esc(m.name)}">${icon('heart')}</button>` : ''}${leader && !m.is_me ? `<button class="btn sm ghost" type="button" data-rm="${m.user_id}" aria-label="Remove ${esc(m.name)}">${icon('user-minus')}</button>` : ''}</div>`).join('')}</div>
    <label class="check" style="margin-top:12px"><input type="checkbox" id="cShare" ${store.prefs.shareCheckins ? 'checked' : ''}><span class="faint">Share my daily check-in with this crew</span></label></section>

  <section class="card section"><div class="card-k">${icon('message-circle-question')}<span class="t">Week ${w} discussion</span></div><p class="q">${esc(wk.discuss[0])}</p><details class="more"><summary>More questions</summary><ol class="muted" style="margin:8px 0 0 18px">${wk.discuss.slice(1).map((q) => `<li>${esc(q)}</li>`).join('')}</ol></details></section>

  <section class="section"><div class="section-h"><h2 class="h3">Prayer requests</h2><button class="btn sm" type="button" id="cPray">${icon('plus')} Share a request</button></div>
    ${prs.length ? `<div class="list">${prs.map((p) => `<div class="post"><div class="who"><b>${esc(nm[p.user_id] || 'Brother')}</b> · ${fmt(new Date(p.created_at), { month: 'short', day: 'numeric' })}${p.answered ? ` <span class="badge good">${icon('check')} Answered</span>` : ''}</div><p>${esc(p.body)}</p>${p.answered && p.answer_note ? `<p class="muted" style="margin-top:4px"><b>God answered:</b> ${esc(p.answer_note)}</p>` : ''}<div class="row-btns" style="margin-top:8px">${!p.answered ? `<button class="btn sm" type="button" data-prayed="${p.id}">${icon('hand-heart')} I prayed${p.prayed_count ? ' · ' + p.prayed_count : ''}</button>` : ''}${p.user_id === C.cloud.me.id && !p.answered ? `<button class="btn sm ghost" type="button" data-answer="${p.id}">Answered</button>` : ''}${p.user_id === C.cloud.me.id || leader ? `<button class="btn sm ghost" type="button" data-delp="${p.id}" aria-label="Delete">${icon('trash-2')}</button>` : ''}</div></div>`).join('')}</div>` : '<p class="faint">No shared requests yet. Personal prayers in your journal stay private.</p>'}</section>

  <section class="section"><div class="section-h"><h2 class="h3">Crew discussion</h2></div>
    <form id="cPost" class="card flat"><div class="seg" id="cKind">${Object.entries(KIND).filter(([k]) => k !== 'announcement' || leader).map(([k, [l]], i) => `<button type="button" data-k="${k}" aria-pressed="${i === 0}">${l}</button>`).join('')}</div><label class="sr" for="cMsg">Message</label><textarea class="textarea" id="cMsg" maxlength="2000" style="margin-top:10px;min-height:80px" placeholder="Answer this week's question, encourage a brother, or share what God is doing"></textarea><button class="btn primary" type="submit" style="margin-top:10px">${icon('send')} Post to crew</button></form>
    ${ps.length ? `<div class="list" style="margin-top:12px">${ps.map((p) => `<div class="post"><div class="who">${icon(KIND[p.kind][1])}<b>${esc(nm[p.user_id] || 'Brother')}</b> · ${esc(KIND[p.kind][0])} · ${fmt(new Date(p.created_at), { month: 'short', day: 'numeric' })}${p.user_id === C.cloud.me.id || leader ? `<button class="btn sm ghost" type="button" data-delpost="${p.id}" style="margin-left:auto" aria-label="Delete post">${icon('trash-2')}</button>` : ''}</div><p>${esc(p.body)}</p></div>`).join('')}</div>` : ''}</section>
  <div class="row-btns section"><button class="btn ghost" type="button" id="cLeave">${icon('log-out')} Leave crew</button></div>
  <p class="faint" style="margin-top:12px">Never shared: your journal, private prayers, notes and reading history. No rankings, ever.</p>`;
  paintIcons(box);
  const re = () => again();
  $('#cInvite').onclick = () => share({ title: BRAND.program + ' crew', text: `Join my ${BRAND.program} crew "${crew.name}". We're reading the whole Bible and growing as men together. Code: ${crew.code}`, url: `${BRAND.siteUrl}/?crew=${crew.code}` });
  $('#cShare').onchange = async (e) => { store.prefs.shareCheckins = e.target.checked; store.write(); await C.saveProfile(); toast(e.target.checked ? 'Sharing check-ins' : 'Check-ins private'); re(); };
  let kind = 'discussion'; $('#cKind').onclick = (e) => { const b = e.target.closest('[data-k]'); if (!b) return; kind = b.dataset.k; $('#cKind').querySelectorAll('button').forEach((x) => x.setAttribute('aria-pressed', x === b)); };
  $('#cPost').onsubmit = async (e) => { e.preventDefault(); const v = $('#cMsg').value.trim(); if (!v) return; try { await C.addPost(crew.id, kind, v, w); bump(); toast('Posted'); re(); } catch (er) { toast(er.message); } };
  box.querySelectorAll('[data-delpost]').forEach((b) => b.onclick = async () => { if (await confirmSheet('Delete this post?', 'It will be removed for everyone.', 'Delete', true)) { await C.deletePost(+b.dataset.delpost); re(); } });
  $('#cPray').onclick = () => { const s = sheet(`${sheetHead('Share a prayer request', 'Only your crew can see it')}<label class="sr" for="pBody">Request</label><textarea class="textarea" id="pBody" maxlength="1000" placeholder="How can your brothers pray for you?"></textarea><button class="btn primary block" type="button" id="pGo" style="margin-top:12px">Share with crew</button>`, { label: 'Share prayer request' }); s.el.querySelector('#pGo').onclick = async () => { const v = s.el.querySelector('#pBody').value.trim(); if (!v) return; try { await C.sharePrayer(crew.id, v); bump(); s.close(); toast('Shared with your crew'); re(); } catch (e) { toast(e.message); } }; };
  box.querySelectorAll('[data-prayed]').forEach((b) => b.onclick = async () => { b.disabled = true; try { await C.prayFor(+b.dataset.prayed); bump(); toast('Thank you for praying'); re(); } catch (e) { toast(e.message); b.disabled = false; } });
  box.querySelectorAll('[data-answer]').forEach((b) => b.onclick = () => { const s = sheet(`${sheetHead('Answered prayer')}<label class="label" for="aN">How did God answer? (optional)</label><textarea class="textarea" id="aN"></textarea><button class="btn primary block" type="button" id="aGo" style="margin-top:12px">Mark answered</button>`, { label: 'Answered prayer' }); s.el.querySelector('#aGo').onclick = async () => { await C.answerPrayer(+b.dataset.answer, s.el.querySelector('#aN').value.trim()); s.close(); toast('Praise God'); re(); }; });
  box.querySelectorAll('[data-delp]').forEach((b) => b.onclick = async () => { if (await confirmSheet('Delete this request?', 'It will be removed for everyone.', 'Delete', true)) { await C.deletePrayer(+b.dataset.delp); re(); } });
  box.querySelectorAll('[data-enc]').forEach((b) => b.onclick = async () => { b.disabled = true; try { const r = await C.api('nudge', { crew_id: crew.id, to_user: b.dataset.enc }); bump(); toast(r.already ? 'Already encouraged him today' : r.delivered ? 'He got your encouragement' : 'Encouragement sent. He’ll see it when notifications are on.'); } catch (e) { toast(e.message); b.disabled = false; } });
  box.querySelectorAll('[data-rm]').forEach((b) => b.onclick = async () => { if (await confirmSheet('Remove this man from the crew?', 'He can rejoin only with a new invite.', 'Remove', true)) { try { await C.removeMember(crew.id, b.dataset.rm); re(); } catch (e) { toast(e.message); } } });
  $('#cLeave').onclick = async () => { if (await confirmSheet(leader ? 'Leave as leader?' : 'Leave this crew?', leader ? 'If you leave, the crew stays but no one can manage it. To end the crew, use Manage → Delete crew.' : 'You can rejoin with the invite code.', 'Leave', true)) { await C.leaveCrew(crew.id); re(); } };
  $('#cManage')?.addEventListener('click', () => {
    const s = sheet(`${sheetHead('Manage crew')}<label class="label" for="mName">Crew name</label><input class="input" id="mName" maxlength="40" value="${esc(crew.name)}"><div class="field"><label class="label" for="mDesc">Description</label><textarea class="textarea" id="mDesc" maxlength="300" style="min-height:70px">${esc(crew.description || '')}</textarea></div>
      <div class="field" style="display:flex;gap:8px"><div style="flex:1"><label class="label" for="mDay">Meeting day</label><select class="select" id="mDay"><option value="">None</option>${DAYN.map((d, i) => `<option value="${i}" ${crew.meeting_day === i ? 'selected' : ''}>${d}</option>`).join('')}</select></div><div style="flex:1"><label class="label" for="mTime">Time</label><input class="input" type="time" id="mTime" value="${esc(crew.meeting_time || '')}"></div></div>
      <button class="btn primary block" type="button" id="mSave" style="margin-top:16px">Save</button><button class="btn ghost block" type="button" id="mDel" style="margin-top:8px;color:var(--danger)">Delete crew</button>`, { label: 'Manage crew' });
    s.el.querySelector('#mSave').onclick = async () => { const d = s.el.querySelector('#mDay').value; try { await C.updateCrew(crew.id, { name: s.el.querySelector('#mName').value.trim() || crew.name, description: s.el.querySelector('#mDesc').value.trim(), meeting_day: d === '' ? null : +d, meeting_time: s.el.querySelector('#mTime').value || null, meeting_tz: Intl.DateTimeFormat().resolvedOptions().timeZone }); s.close(); toast('Saved'); re(); } catch (e) { toast(e.message); } };
    s.el.querySelector('#mDel').onclick = async () => { s.close(); if (await confirmSheet('Delete this crew?', 'All posts and shared prayer requests in it are deleted for everyone. Members keep their own progress.', 'Delete crew', true)) { await C.deleteCrew(crew.id); re(); } };
  });
}

/* Point Man weekly meeting guide (printable) */
function renderLead(main, param) {
  const w = Math.max(1, Math.min(52, +param || P.weekOf(today()))); const wk = week(w), ph = phaseOf(w);
  main.innerHTML = `
  <div class="topbar no-print"><a class="iconbtn" href="#crew" aria-label="Back">${icon('arrow-left')}</a><div class="row-btns"><a class="iconbtn" href="#lead-${Math.max(1, w - 1)}" aria-label="Previous week">${icon('chevron-left')}</a><a class="iconbtn" href="#lead-${Math.min(52, w + 1)}" aria-label="Next week">${icon('chevron-right')}</a><button class="iconbtn" type="button" id="lPrint" aria-label="Print guide">${icon('printer')}</button></div></div>
  <div class="eyebrow">${esc(BRAND.leaderTitle)} guide · Week ${w} · ${esc(ph.name)}</div><h1 class="h1">${esc(wk.theme)}</h1>
  <p class="faint" style="margin-top:6px">About 45 minutes. Keep it simple: open in prayer, get into the Word, get honest, send them out with a challenge.</p>
  <section class="card section"><div class="card-k"><span class="n">1</span><span class="t">Open in prayer (3 min)</span></div><p class="serif">Father, thank you for these men. As we open your word, give us honest hearts and open ears. Make this time about you, not us. In Jesus’ name, amen.</p></section>
  <section class="card section"><div class="card-k"><span class="n">2</span><span class="t">Biblical foundation (10 min)</span></div><p><b>Read together:</b> ${esc(wk.foundation)}</p><p class="quote" style="margin-top:10px">${esc(wk.truth)}</p><p class="muted" style="margin-top:10px">${esc(wk.devotional)}</p></section>
  <section class="card section"><div class="card-k"><span class="n">3</span><span class="t">Discussion (20 min)</span></div><ol style="margin-left:18px;display:grid;gap:10px">${wk.discuss.map((q) => `<li>${esc(q)}</li>`).join('')}</ol><p class="faint" style="margin-top:10px">Tip: go first and go honest. The group will only go as deep as you do. Never pressure anyone to share.</p></section>
  <section class="card section"><div class="card-k"><span class="n">4</span><span class="t">This week's challenge (5 min)</span></div><p>${esc(wk.mission)}</p>${wk.alt ? `<p class="faint" style="margin-top:6px">Alternative: ${esc(wk.alt)}</p>` : ''}<p class="muted" style="margin-top:8px"><b>Memory verse:</b> ${esc(wk.memory.ref)}: “${esc(wk.memory.text)}”</p></section>
  <section class="card section"><div class="card-k"><span class="n">5</span><span class="t">Pray for each other and close (7 min)</span></div><p class="muted">Share requests, pray in pairs or as a group, then close:</p><p class="serif" style="margin-top:8px">${esc(wk.prayer)}</p></section>
  <section class="card section no-print"><div class="card-k">${icon('notebook-pen')}<span class="t">Meeting notes</span></div><label class="sr" for="lNotes">Meeting notes</label><textarea class="textarea" id="lNotes" placeholder="Who came, what came up, who needs follow-up. Private to you.">${esc(store.st.meetingNotes[w] || '')}</textarea></section>
  <div class="row-btns section no-print"><button class="btn" type="button" id="lAnnounce">${icon('megaphone')} Post an announcement</button></div>
  ${FLAGS.contentReviewed ? '' : `<div class="draft">${icon('info')}<span>Draft curriculum awaiting pastoral review.</span></div>`}`;
  $('#lPrint').onclick = () => window.print();
  let t = 0; $('#lNotes').oninput = (e) => { clearTimeout(t); t = setTimeout(() => { store.st.meetingNotes[w] = e.target.value; store.write(); }, 500); };
  $('#lAnnounce').onclick = async () => {
    if (!C.cloud.ready) { toast('Needs a connection'); return; }
    const crews = await C.myCrews(); const crew = crews.find((c) => c.owner === C.cloud.me.id); if (!crew) { toast('Only a crew leader can post announcements'); return; }
    const s = sheet(`${sheetHead('Announcement', crew.name)}<label class="sr" for="anB">Announcement</label><textarea class="textarea" id="anB" maxlength="2000" placeholder="Meeting moved to Thursday 7pm…"></textarea><button class="btn primary block" type="button" id="anGo" style="margin-top:12px">Post</button>`, { label: 'Announcement' });
    s.el.querySelector('#anGo').onclick = async () => { const v = s.el.querySelector('#anB').value.trim(); if (!v) return; await C.addPost(crew.id, 'announcement', v, w); s.close(); toast('Announcement posted'); };
  };
}
