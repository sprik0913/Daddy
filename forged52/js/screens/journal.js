// Personal and prayer journal. Private by default: stored on the device and in the man's own cloud row only.
import { store } from '../core/store.js';
import { P } from '../core/data.js';
import { $, esc, icon, toast, paintIcons, sheet, sheetHead, confirmSheet, download, fmt } from '../core/ui.js';
import { answerSheet } from './today.js';

const TYPES = { reflection: ['Reflection', 'pen-line'], prayer: ['Prayer', 'hand-heart'], gratitude: ['Gratitude', 'sun'], note: ['Note', 'sticky-note'] };
const PROMPTS = ['What did God reveal to me through this passage?', 'What does this passage teach about God’s character?', 'Is there a sin I need to confess?', 'Is there a command I need to obey?', 'Is there a promise I need to remember in its proper context?', 'How can I apply this Scripture to my marriage?', 'How can I apply this Scripture to my parenting?', 'How can I honor God in my work today?', 'Who can I serve today?', 'What am I thankful for?'];
let F = { type: 'all', q: '', tag: '', view: 'list', month: null };

export async function render(main) {
  const all = store.st.journal;
  const tags = [...new Set(all.flatMap((e) => e.tags || []))].sort();
  const list = all.filter((e) => (F.type === 'all' || (F.type === 'answered' ? e.answered : e.type === F.type)) && (!F.tag || (e.tags || []).includes(F.tag)) && (!F.q || (e.title + ' ' + e.body + ' ' + (e.answeredNote || '')).toLowerCase().includes(F.q.toLowerCase())));
  const answered = all.filter((e) => e.answered).length;
  main.innerHTML = `
  <div class="topbar"><a class="iconbtn" href="#profile" aria-label="Back">${icon('arrow-left')}</a><div class="eyebrow">Journal</div><button class="iconbtn" type="button" id="jMenu" aria-label="Export and backup">${icon('download')}</button></div>
  <h1 class="h1">Your journal</h1>
  <p class="lead" style="margin-top:6px">Private. Only you can see it. ${answered ? `${answered} answered prayer${answered > 1 ? 's' : ''} recorded.` : ''}</p>
  <div class="row-btns section" style="margin-top:20px">${Object.entries(TYPES).map(([k, [l, ic]]) => `<button class="btn sm" type="button" data-new="${k}">${icon(ic)} ${l}</button>`).join('')}</div>
  <div class="section" style="margin-top:20px">
    <label class="sr" for="jQ">Search journal</label><input class="input" id="jQ" placeholder="Search your journal" value="${esc(F.q)}">
    <div class="chips" style="margin-top:10px" id="jTypes">${[['all', 'All'], ['reflection', 'Reflections'], ['prayer', 'Prayers'], ['answered', 'Answered'], ['gratitude', 'Gratitude'], ['note', 'Notes']].map(([k, l]) => `<button class="chip" type="button" data-t="${k}" aria-pressed="${F.type === k}">${l}</button>`).join('')}</div>
    ${tags.length ? `<div class="chips" style="margin-top:8px">${tags.map((t) => `<button class="chip" type="button" data-tag="${esc(t)}" aria-pressed="${F.tag === t}">#${esc(t)}</button>`).join('')}</div>` : ''}
    <div class="seg" style="margin-top:12px;max-width:280px"><button type="button" data-v="list" aria-pressed="${F.view === 'list'}">List</button><button type="button" data-v="cal" aria-pressed="${F.view === 'cal'}">Calendar</button></div>
  </div>
  <div class="section" id="jBody" style="margin-top:16px"></div>`;
  const body = $('#jBody');
  if (F.view === 'cal') body.innerHTML = calendar(list);
  else body.innerHTML = list.length ? `<div class="list">${list.map((e) => `<button class="li" type="button" data-id="${esc(e.id)}" style="width:100%;text-align:left">${icon(TYPES[e.type]?.[1] || 'pen-line')}<span class="grow"><span class="t">${esc(e.title || TYPES[e.type]?.[0] || 'Entry')}${e.answered ? ' <span class="badge good">Answered</span>' : ''}</span><br><span class="s">${esc(fmt(new Date(e.date || e.created), { month: 'short', day: 'numeric', year: 'numeric' }))}${e.day ? ' · Day ' + e.day : ''} · ${esc((e.body || '').slice(0, 90))}</span></span>${icon('chevron-right')}</button>`).join('')}</div>`
    : `<div class="card flat" style="text-align:center">${icon('notebook-pen')}<p class="muted" style="margin-top:8px">${all.length ? 'Nothing matches that filter.' : 'Your journal is empty. Start with today’s reflection or a prayer.'}</p></div>`;
  paintIcons(main);
  const rerender = () => render(main);
  $('#jQ').oninput = (e) => { F.q = e.target.value; clearTimeout(rerender.t); rerender.t = setTimeout(() => { rerender().then(() => { const i = $('#jQ'); i.focus(); i.setSelectionRange(i.value.length, i.value.length); }); }, 300); };
  main.querySelectorAll('[data-t]').forEach((b) => b.onclick = () => { F.type = b.dataset.t; rerender(); });
  main.querySelectorAll('[data-tag]').forEach((b) => b.onclick = () => { F.tag = F.tag === b.dataset.tag ? '' : b.dataset.tag; rerender(); });
  main.querySelectorAll('[data-v]').forEach((b) => b.onclick = () => { F.view = b.dataset.v; rerender(); });
  main.querySelectorAll('[data-new]').forEach((b) => b.onclick = () => editor({ type: b.dataset.new }, rerender));
  main.querySelectorAll('[data-id]').forEach((b) => b.onclick = () => editor(store.st.journal.find((x) => x.id === b.dataset.id), rerender));
  main.querySelectorAll('[data-day]').forEach((b) => b.onclick = () => { F.q = ''; F.view = 'list'; F.type = 'all'; const d = b.dataset.day; const es = store.st.journal.filter((e) => (e.date || '').startsWith(d)); if (es[0]) editor(es[0], rerender); });
  $('#jMenu').onclick = () => backupSheet(rerender);
}

function calendar(list) {
  const now = new Date(); const y = now.getFullYear(), m = now.getMonth(); const months = [];
  for (let k = 0; k < 3; k++) { const d = new Date(y, m - k, 1); months.push(d); }
  const byDay = {}; list.forEach((e) => { const d = (e.date || e.created || '').slice(0, 10); byDay[d] = (byDay[d] || 0) + 1; });
  return months.map((first) => { const days = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate(); const pad = first.getDay(); const cells = [];
    for (let i = 0; i < pad; i++) cells.push('<span></span>');
    for (let d = 1; d <= days; d++) { const key = P.iso(new Date(first.getFullYear(), first.getMonth(), d)); const c = byDay[key]; cells.push(c ? `<button type="button" data-day="${key}" class="chip" aria-pressed="true" style="padding:6px 0;text-align:center">${d}</button>` : `<span class="faint" style="text-align:center;padding:6px 0">${d}</span>`); }
    return `<div class="card flat" style="margin-bottom:12px"><div class="h3" style="margin-bottom:10px">${fmt(first, { month: 'long', year: 'numeric' })}</div><div style="display:grid;grid-template-columns:repeat(7,1fr);gap:4px">${cells.join('')}</div></div>`; }).join('');
}

export function editor(e, after) {
  const isNew = !e.id; const t = e.type || 'reflection';
  const sh = sheet(`${sheetHead(isNew ? 'New ' + TYPES[t][0].toLowerCase() : TYPES[t][0], e.ref ? P.nice(e.ref) : '')}
    <label class="label" for="eTitle">Title</label><input class="input" id="eTitle" maxlength="120" value="${esc(e.title || '')}" placeholder="${t === 'prayer' ? 'What are you praying for?' : 'Title'}">
    ${t === 'prayer' ? `<div class="field"><label class="label" for="eScope">For</label><select class="select" id="eScope">${[['personal', 'Me'], ['family', 'My family'], ['others', 'Others']].map(([k, l]) => `<option value="${k}" ${e.scope === k ? 'selected' : ''}>${l}</option>`).join('')}</select></div>` : ''}
    <div class="field"><label class="label" for="eBody">Entry</label><textarea class="textarea" id="eBody" style="min-height:160px" placeholder="${esc(PROMPTS[Math.floor(Math.random() * PROMPTS.length)])}">${esc(e.body || '')}</textarea></div>
    ${!isNew || t !== 'prayer' ? '' : ''}
    <div class="field"><label class="label" for="eTags">Tags (comma separated)</label><input class="input" id="eTags" value="${esc((e.tags || []).join(', '))}" placeholder="marriage, work"></div>
    ${e.answered ? `<div class="field"><div class="label">Answered</div><p class="muted">${esc(e.answeredNote || 'Marked answered.')}</p></div>` : ''}
    <details class="more"><summary>${icon('lightbulb')} Prompts</summary><ul class="muted" style="margin:8px 0 0 18px">${PROMPTS.map((p) => `<li>${esc(p)}</li>`).join('')}</ul></details>
    <div class="row-btns" style="margin-top:18px"><button class="btn primary" type="button" id="eSave">Save</button>${!isNew && t === 'prayer' && !e.answered ? '<button class="btn" type="button" id="eAns">Mark answered</button>' : ''}${!isNew ? '<button class="btn ghost" type="button" id="eDel" style="color:var(--danger)">Delete</button>' : ''}</div>
    <p class="faint" style="margin-top:10px">${icon('lock')} Private. Never shared with your crew.</p>`, { label: 'Journal entry' });
  const val = (id) => sh.el.querySelector(id)?.value || '';
  sh.el.querySelector('#eSave').onclick = () => {
    const patch = { title: val('#eTitle').trim() || TYPES[t][0], body: val('#eBody'), tags: val('#eTags').split(',').map((x) => x.trim().toLowerCase()).filter(Boolean), scope: sh.el.querySelector('#eScope')?.value };
    if (!patch.body.trim()) { toast('Write something first'); return; }
    if (isNew) store.addEntry({ type: t, ...patch }); else store.updateEntry(e.id, patch);
    sh.close(); toast('Saved'); after && after();
  };
  sh.el.querySelector('#eAns')?.addEventListener('click', () => { sh.close(); answerSheet(e.id, after); });
  sh.el.querySelector('#eDel')?.addEventListener('click', async () => { if (await confirmSheet('Delete this entry?', 'This can’t be undone.', 'Delete', true)) { store.deleteEntry(e.id); sh.close(); after && after(); } });
}

export function backupSheet(after) {
  const sh = sheet(`${sheetHead('Export and backup', 'Your data belongs to you')}
    <div class="stack"><button class="btn block" type="button" id="bTxt">${icon('file-text')} Export journal as text</button>
    <button class="btn block" type="button" id="bJson">${icon('archive')} Download full backup (.json)</button>
    <label class="btn block" for="bFile" style="cursor:pointer">${icon('upload')} Restore from a backup file</label><input type="file" id="bFile" accept="application/json,.json" class="sr"></div>
    <p class="faint" style="margin-top:12px">Restoring adds what’s in the file to what’s already here. It never deletes anything.</p>`, { label: 'Backup' });
  sh.el.querySelector('#bTxt').onclick = () => {
    const txt = store.st.journal.map((e) => `${(e.date || e.created || '').slice(0, 10)}  ${TYPES[e.type]?.[0] || 'Entry'}${e.day ? ' (Day ' + e.day + ')' : ''}\n${e.title || ''}\n${e.body || ''}${e.answered ? '\nAnswered: ' + (e.answeredNote || 'yes') : ''}${(e.tags || []).length ? '\nTags: ' + e.tags.join(', ') : ''}\n`).join('\n---\n\n');
    download('forged-journal.txt', txt || 'No entries yet.', 'text/plain');
  };
  sh.el.querySelector('#bJson').onclick = () => download(`forged-backup-${P.iso(new Date())}.json`, JSON.stringify(store.exportAll(), null, 2));
  sh.el.querySelector('#bFile').onchange = async (ev) => { const f = ev.target.files[0]; if (!f) return; try { store.importAll(JSON.parse(await f.text())); toast('Backup restored'); sh.close(); after && after(); } catch (e) { toast(e.message || 'That file couldn’t be read'); } };
}
