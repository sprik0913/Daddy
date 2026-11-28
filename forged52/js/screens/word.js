// Point Man weekly word: post a message (text, voice recording or audio file, optional video link) with the posting key.
import { BRAND } from '../config.js';
import { ls } from '../core/store.js';
import * as C from '../core/cloud.js';
import { $, esc, icon, toast, paintIcons, fmt, confirmSheet } from '../core/ui.js';

export async function render(main) {
  main.innerHTML = `
  <div class="topbar"><a class="iconbtn" href="#profile" aria-label="Back">${icon('arrow-left')}</a><div class="eyebrow">${esc(BRAND.leaderTitle)}</div><span style="width:44px"></span></div>
  <h1 class="h1">Post a word</h1><p class="lead" style="margin-top:6px">A short message for every man doing the challenge. It appears at the top of Today for 10 days.</p>
  <div class="card section"><label class="label" for="wKey">Posting key</label><input class="input" id="wKey" placeholder="F52-XXXX-XXXX" autocapitalize="characters" value="${esc(ls.get('f52.adminKey') || '')}">
    <div class="field"><label class="label" for="wTitle">Title</label><input class="input" id="wTitle" maxlength="120" placeholder="Week 30: Don't coast"></div>
    <div class="field"><label class="label" for="wBody">Message</label><textarea class="textarea" id="wBody" maxlength="4000" placeholder="What you want the men to hear this week"></textarea></div>
    <div class="field"><label class="label" for="wVideo">Video link (optional)</label><input class="input" id="wVideo" placeholder="https://"></div>
    <div class="field"><div class="label">Voice message (optional)</div><div class="row-btns"><button class="btn" type="button" id="wRec">${icon('mic')} Record</button><label class="btn ghost" for="wFile" style="cursor:pointer">${icon('upload')} Upload audio</label><input type="file" id="wFile" accept="audio/*" class="sr"></div><span class="faint" id="wRecMsg"></span><audio id="wPrev" controls hidden style="width:100%;margin-top:10px"></audio></div>
    <button class="btn primary block" type="button" id="wPost" style="margin-top:18px">Post it</button><p class="faint" id="wMsg" role="alert" style="margin-top:8px"></p></div>
  <section class="section"><h2 class="h3">Posted</h2><div id="wList" class="list" style="margin-top:10px"></div></section>`;
  paintIcons(main);
  let rec = null, chunks = [], blob = null;
  $('#wRec').onclick = async () => {
    if (rec && rec.state === 'recording') { rec.stop(); return; }
    try { const stream = await navigator.mediaDevices.getUserMedia({ audio: true }); chunks = []; rec = new MediaRecorder(stream); rec.ondataavailable = (e) => chunks.push(e.data);
      rec.onstop = () => { stream.getTracks().forEach((t) => t.stop()); blob = new Blob(chunks, { type: rec.mimeType || 'audio/webm' }); const a = $('#wPrev'); a.src = URL.createObjectURL(blob); a.hidden = false; $('#wRec').innerHTML = icon('mic') + ' Record again'; paintIcons($('#wRec')); $('#wRecMsg').textContent = 'Recorded. Listen back before posting.'; };
      rec.start(); $('#wRec').textContent = 'Stop recording'; $('#wRecMsg').textContent = 'Recording…'; } catch (e) { $('#wRecMsg').textContent = 'Microphone not available: ' + (e.message || e); }
  };
  $('#wFile').onchange = (e) => { const f = e.target.files[0]; if (f) { blob = f; const a = $('#wPrev'); a.src = URL.createObjectURL(f); a.hidden = false; } };
  const b64 = (b) => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(',')[1]); r.onerror = rej; r.readAsDataURL(b); });
  $('#wPost').onclick = async () => {
    const msg = $('#wMsg'); msg.textContent = 'Posting…';
    try { if (!C.cloud.ready) throw new Error('Needs an internet connection.'); const key = $('#wKey').value.trim(); const body = { title: $('#wTitle').value, body: $('#wBody').value, video_url: $('#wVideo').value.trim() || null };
      if (blob) { if (blob.size > 15e6) throw new Error('Audio is too long. Keep it under about 10 minutes.'); body.audio_b64 = await b64(blob); body.audio_type = blob.type || 'audio/webm'; }
      await C.api('post_word', body, { 'x-admin-key': key }); ls.set('f52.adminKey', key); msg.textContent = 'Posted. It shows at the top of Today for 10 days.'; toast('Posted'); render(main);
    } catch (e) { msg.textContent = e.message; }
  };
  const drawList = async () => {
    if (!C.cloud.ready) { $('#wList').innerHTML = '<p class="faint" style="padding:14px">Connect to see posted words.</p>'; return; }
    const ws = await C.allWords();
    $('#wList').innerHTML = ws.length ? ws.map((w) => `<div class="li"><span class="grow"><span class="t">${esc(w.title)}</span><br><span class="s">${fmt(new Date(w.created_at), { month: 'short', day: 'numeric', year: 'numeric' })}</span></span><button class="btn sm ghost" type="button" data-del="${w.id}" aria-label="Delete">${icon('trash-2')}</button></div>`).join('') : '<p class="faint" style="padding:14px">Nothing posted yet.</p>';
    paintIcons($('#wList'));
    $('#wList').querySelectorAll('[data-del]').forEach((b) => b.onclick = async () => { if (await confirmSheet('Delete this word?', 'It disappears for everyone.', 'Delete', true)) { try { await C.api('delete_word', { id: +b.dataset.del }, { 'x-admin-key': $('#wKey').value.trim() }); drawList(); } catch (e) { toast(e.message); } } });
  };
  drawList(); const off = C.onCloud(drawList); return () => off();
}
