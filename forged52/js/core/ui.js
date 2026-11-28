// Small UI toolkit: DOM helpers, icons (Lucide), toast, sheets, confirm.
export const $ = (s, el = document) => el.querySelector(s);
export const $$ = (s, el = document) => [...el.querySelectorAll(s)];
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const icon = (name, label = '') => `<i data-lucide="${name}"${label ? ` aria-label="${esc(label)}" role="img"` : ' aria-hidden="true"'}></i>`;
export function paintIcons(root = document) { if (window.lucide) window.lucide.createIcons({ attrs: { class: 'lucide' }, nameAttr: 'data-lucide', root }); }

let toastTimer = 0;
export function toast(msg) {
  const t = $('#toast'); if (!t) return; t.textContent = msg; t.classList.add('show');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), 2600);
}

// Bottom sheet. Returns {el, close}. Content is HTML; focus moves into the sheet and Escape closes it.
export function sheet(html, { onClose, label = 'Dialog' } = {}) {
  const wrap = document.createElement('div'); wrap.className = 'sheet'; wrap.setAttribute('role', 'dialog'); wrap.setAttribute('aria-modal', 'true'); wrap.setAttribute('aria-label', label);
  wrap.innerHTML = `<div class="sheet-card">${html}</div>`;
  const prev = document.activeElement;
  const close = () => { wrap.remove(); document.body.style.overflow = ''; onClose && onClose(); prev && prev.focus && prev.focus(); };
  wrap.addEventListener('click', (e) => { if (e.target === wrap || e.target.closest('[data-close]')) close(); });
  wrap.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });
  document.body.appendChild(wrap); document.body.style.overflow = 'hidden'; paintIcons(wrap);
  const f = wrap.querySelector('input,textarea,select,button:not([data-close])'); (f || wrap.querySelector('button'))?.focus();
  return { el: wrap, close };
}
export const sheetHead = (title, sub = '') => `<div class="sheet-h"><div><div class="h2">${esc(title)}</div>${sub ? `<div class="faint">${esc(sub)}</div>` : ''}</div><button class="iconbtn" type="button" data-close aria-label="Close">${icon('x')}</button></div>`;

export function confirmSheet(title, body, okLabel = 'Confirm', danger = false) {
  return new Promise((res) => {
    let ok = false;
    const s = sheet(`${sheetHead(title)}<p class="muted">${esc(body)}</p><div class="row-btns" style="margin-top:20px"><button class="btn ${danger ? '' : 'primary'}" type="button" id="cfOk" ${danger ? 'style="border-color:var(--danger);color:var(--danger)"' : ''}>${esc(okLabel)}</button><button class="btn ghost" type="button" data-close>Cancel</button></div>`, { onClose: () => res(ok) });
    s.el.querySelector('#cfOk').onclick = () => { ok = true; s.close(); };
  });
}

export async function share({ title, text, url }) {
  try { if (navigator.share) { await navigator.share({ title, text, url }); return 'shared'; } } catch (e) { if (e && e.name === 'AbortError') return 'cancel'; }
  try { await navigator.clipboard.writeText([text, url].filter(Boolean).join(' ')); toast('Copied. Paste it in a text.'); return 'copied'; } catch { toast(url || text); return 'shown'; }
}
export function download(name, data, type = 'application/json') {
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([data], { type })); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 3000);
}
export const fmt = (d, o) => d.toLocaleDateString(undefined, o);
export const greeting = () => { const h = new Date().getHours(); return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening'; };
