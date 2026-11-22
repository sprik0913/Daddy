'use strict';
/* Sprik Books front end: plain JavaScript, no build step. Pages are rendered from the URL hash. */

// ---------- utilities ----------
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const money = (c, opts = {}) => {
  if (c === null || c === undefined) return '';
  const s = (Math.abs(c) / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return c < 0 ? `-$${s}` : `${opts.plus && c > 0 ? '+' : ''}$${s}`;
};
const moneyCell = (c) => `<td class="num ${c < 0 ? 'neg' : ''}">${money(c)}</td>`;
const dollars = (c) => (c ? (c / 100).toFixed(2) : '');
const today = () => { const d = new Date(); return new Date(d - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10); };
const fmtDate = (d) => { if (!d) return ''; const [y, m, dd] = d.split('-'); return `${m}/${dd}/${y}`; };
const monthStart = () => today().slice(0, 8) + '01';
const yearStart = () => today().slice(0, 5) + '01-01';

function toast(msg, err) {
  const t = $('#toast');
  t.textContent = msg; t.className = 'show' + (err ? ' err' : '');
  clearTimeout(toast.t); toast.t = setTimeout(() => (t.className = ''), err ? 5000 : 2500);
}

async function api(method, path, body) {
  const res = await fetch(path, {
    method, headers: body !== undefined ? { 'Content-Type': 'application/json' } : (method !== 'GET' ? { 'Content-Type': 'application/json' } : {}),
    body: body !== undefined ? JSON.stringify(body) : (method !== 'GET' ? '{}' : undefined),
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && !path.startsWith('/api/auth')) { route(); throw new Error('Please log in'); }
  if (!res.ok) throw new Error(data.error || `Error ${res.status}`);
  return data;
}
const capi = (method, path, body) => api(method, `/api/c/${S.cid}${path}`, body);

// Wrap an async action: show errors as a toast.
const run = (fn) => async (...a) => { try { await fn(...a); } catch (e) { toast(e.message, true); } };

function readFile(input) {
  return new Promise((resolve, reject) => {
    const f = input.files[0];
    if (!f) return reject(new Error('Choose a file first'));
    const r = new FileReader();
    r.onload = () => resolve({ name: f.name, text: r.result });
    r.onerror = () => reject(new Error('Could not read the file'));
    r.readAsText(f);
  });
}

function downloadCSV(name, rows) {
  const csv = rows.map((r) => r.map((c) => { const s = String(c ?? ''); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; }).join(',')).join('\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
  a.download = name; a.click(); URL.revokeObjectURL(a.href);
}

// ---------- state ----------
const S = { companies: [], cid: null, meta: null };
const acct = (id) => S.meta.accounts.find((a) => a.id === Number(id));

function accountOptions(selected, filter = () => true, blank = '— choose account —') {
  const groups = [['Income', ['income', 'other_income']], ['Cost of goods sold', ['cogs']], ['Expenses', ['expense', 'other_expense']],
    ['Bank & cards', ['bank', 'credit_card']], ['Other assets', ['ar', 'current_asset', 'fixed_asset', 'other_asset']],
    ['Liabilities', ['ap', 'current_liability', 'long_term_liability']], ['Equity', ['equity']]];
  let h = `<option value="">${esc(blank)}</option>`;
  for (const [label, subs] of groups) {
    const list = S.meta.accounts.filter((a) => subs.includes(a.subtype) && (a.is_active || a.id === Number(selected)) && filter(a));
    if (!list.length) continue;
    h += `<optgroup label="${label}">` + list.map((a) => `<option value="${a.id}" ${a.id === Number(selected) ? 'selected' : ''}>${esc(a.code ? a.code + ' · ' : '')}${esc(a.name)}</option>`).join('') + '</optgroup>';
  }
  return h;
}
const contactOptions = (list, selected, blank = '— choose —') => `<option value="">${blank}</option>` + list.map((c) => `<option value="${c.id}" ${c.id === Number(selected) ? 'selected' : ''}>${esc(c.name)}</option>`).join('');
const bankAccounts = () => S.meta.accounts.filter((a) => ['bank', 'credit_card'].includes(a.subtype) && a.is_active);
const depositAccounts = () => S.meta.accounts.filter((a) => (['bank', 'credit_card'].includes(a.subtype) || a.system_key === 'undeposited') && a.is_active);

async function loadMeta() { S.meta = await capi('GET', '/meta'); }

// ---------- modal ----------
function modal(html, { wide } = {}) {
  const root = $('#modal-root');
  root.innerHTML = `<div class="modal-bg"><div class="modal ${wide ? 'wide' : ''}" role="dialog">${html}</div></div>`;
  const bg = $('.modal-bg', root);
  bg.addEventListener('mousedown', (e) => { if (e.target === bg) closeModal(); });
  $$('[data-close]', root).forEach((b) => b.addEventListener('click', closeModal));
  const first = $('input:not([type=hidden]),select,textarea', root);
  if (first) setTimeout(() => first.focus(), 30);
  return $('.modal', root);
}
function closeModal() { $('#modal-root').innerHTML = ''; }
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeModal(); });

function confirmBox(msg, okLabel = 'Delete') {
  return new Promise((resolve) => {
    const m = modal(`<p>${esc(msg)}</p><div class="actions"><button class="btn" data-close>Cancel</button><button class="btn primary" id="cf-ok">${esc(okLabel)}</button></div>`);
    $('#cf-ok', m).onclick = () => { closeModal(); resolve(true); };
    $$('[data-close]', m).forEach((b) => b.addEventListener('click', () => resolve(false)));
  });
}

const formData = (form) => Object.fromEntries(new FormData(form).entries());

// ---------- routing ----------
window.addEventListener('hashchange', () => route());
const go = (h) => { if (location.hash === h) route(); else location.hash = h; };

async function route() {
  closeModal();
  try {
    const auth = await api('GET', '/api/auth');
    if (auth.setup) return renderSetup();
    if (!auth.loggedIn) return renderLogin();
    S.companies = await api('GET', '/api/companies');
    if (!S.companies.length) return renderFirstCompany();
    const saved = Number(localStorage.getItem('cid'));
    if (!S.cid) S.cid = S.companies.some((c) => c.id === saved) ? saved : S.companies[0].id;
    if (!S.companies.some((c) => c.id === S.cid)) S.cid = S.companies[0].id;
    await loadMeta();
    const [page, ...args] = (location.hash.slice(2).split('?')[0] || 'dashboard').split('/');
    const fn = PAGES[page] || PAGES.dashboard;
    await renderShell(page);
    await fn(...args.map(decodeURIComponent));
  } catch (e) {
    console.error(e);
    const main = $('main');
    if (main) main.innerHTML = `<div class="alert err">${esc(e.message)}</div>`; else $('#app').innerHTML = `<div class="center"><div class="alert err">${esc(e.message)}</div></div>`;
  }
}

const NAV = [
  ['dashboard', 'Dashboard'], ['banking', 'Banking'], ['sep'],
  ['invoices', 'Invoices'], ['customers', 'Customers'], ['sep'],
  ['bills', 'Bills'], ['vendors', 'Vendors'], ['sep'],
  ['journal', 'Transactions'], ['accounts', 'Chart of accounts'], ['reconcile', 'Reconcile'], ['reports', 'Reports'], ['sep'],
  ['import', 'Import from QuickBooks'], ['settings', 'Settings'],
];

async function renderShell(page) {
  let review = 0;
  try { review = (await capi('GET', '/dashboard')).toReview; } catch { /* ignore */ }
  $('#app').innerHTML = `
  <div class="shell">
    <aside class="side" id="side">
      <div class="brand"><img src="icon.svg" alt="">Sprik Books</div>
      <select id="co-pick" aria-label="Company">
        ${S.companies.map((c) => `<option value="${c.id}" ${c.id === S.cid ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}
        <option value="new">+ Add a business…</option>
      </select>
      <nav>${NAV.map(([k, label]) => k === 'sep' ? '<div class="sep"></div>' :
        `<a href="#/${k}" class="${k === page ? 'on' : ''}"><span>${label}</span>${k === 'banking' && review ? `<span class="badge">${review}</span>` : ''}</a>`).join('')}
        <div class="sep"></div><a href="#" id="logout"><span>Log out</span></a>
      </nav>
    </aside>
    <main><div class="top"><button class="btn menu-btn" id="menu-btn" aria-label="Menu">☰</button><div id="page-title" class="row" style="flex:1"></div></div><div id="page"></div></main>
  </div>`;
  $('#menu-btn').onclick = (e) => { e.stopPropagation(); $('#side').classList.toggle('open'); };
  $('main').addEventListener('click', () => $('#side').classList.remove('open'));
  $('#co-pick').onchange = (e) => {
    if (e.target.value === 'new') { e.target.value = S.cid; return newCompanyDialog(); }
    S.cid = Number(e.target.value); localStorage.setItem('cid', S.cid); go('#/dashboard');
  };
  $('#logout').onclick = run(async (e) => { e.preventDefault(); await api('POST', '/api/auth/logout'); route(); });
}

function title(t, actions = '') { $('#page-title').innerHTML = `<h1>${esc(t)}</h1><div class="spacer"></div>${actions}`; }
const page = () => $('#page');

// ---------- auth screens ----------
function renderSetup() {
  $('#app').innerHTML = `<div class="center"><form class="panel" id="f">
    <div class="brand" style="color:var(--ink);padding:0 0 10px"><img src="icon.svg" alt="">Sprik Books</div>
    <p class="muted">Welcome! Pick a password. You'll use it to open your books from this computer or your phone.</p>
    <label>Password<input type="password" name="password" autocomplete="new-password" required minlength="6"></label>
    <label style="margin-top:10px">Same password again<input type="password" name="again" autocomplete="new-password" required></label>
    <button class="btn primary" style="margin-top:14px;width:100%">Start</button></form></div>`;
  $('#f').onsubmit = run(async (e) => {
    e.preventDefault();
    const d = formData(e.target);
    if (d.password !== d.again) throw new Error("The passwords don't match");
    await api('POST', '/api/auth/setup', { password: d.password });
    route();
  });
}
function renderLogin() {
  $('#app').innerHTML = `<div class="center"><form class="panel" id="f">
    <div class="brand" style="color:var(--ink);padding:0 0 10px"><img src="icon.svg" alt="">Sprik Books</div>
    <label>Password<input type="password" name="password" autocomplete="current-password" required></label>
    <button class="btn primary" style="margin-top:14px;width:100%">Log in</button></form></div>`;
  $('#f').onsubmit = run(async (e) => { e.preventDefault(); await api('POST', '/api/auth/login', formData(e.target)); route(); });
}

const companyFields = (c = {}) => `
  <label class="wide">Business name<input name="name" required value="${esc(c.name)}"></label>
  <label class="wide">Address<textarea name="address" rows="2">${esc(c.address)}</textarea></label>
  <label>Email<input name="email" type="email" value="${esc(c.email)}"></label>
  <label>Phone<input name="phone" value="${esc(c.phone)}"></label>
  <label>Sales tax rate %<input name="sales_tax_rate" type="number" step="0.001" min="0" value="${esc(c.sales_tax_rate ?? 6)}"></label>
  <label>Fiscal year starts<select name="fiscal_year_start">${['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'].map((m, i) => `<option value="${i + 1}" ${Number(c.fiscal_year_start || 1) === i + 1 ? 'selected' : ''}>${m}</option>`).join('')}</select></label>`;

function renderFirstCompany() {
  $('#app').innerHTML = `<div class="center"><form class="panel" id="f" style="max-width:520px">
    <h2>Set up your first business</h2>
    <p class="muted small">You can add more businesses later. All of them are included, no extra charge, ever.</p>
    <div class="form">${companyFields()}
    <label class="check wide"><input type="checkbox" name="blank"> Start with a bare chart of accounts (I'll import mine from QuickBooks)</label></div>
    <button class="btn primary" style="margin-top:14px;width:100%">Create</button></form></div>`;
  $('#f').onsubmit = run(async (e) => {
    e.preventDefault();
    const d = formData(e.target);
    const r = await api('POST', '/api/companies', { ...d, blank: !!d.blank });
    S.cid = r.id; localStorage.setItem('cid', r.id); go('#/dashboard');
  });
}

function newCompanyDialog() {
  const m = modal(`<h2>Add a business</h2><form id="f"><div class="form">${companyFields({ sales_tax_rate: 6 })}
    <label class="check wide"><input type="checkbox" name="blank"> Start with a bare chart of accounts (import from QuickBooks)</label></div>
    <div class="actions"><button type="button" class="btn" data-close>Cancel</button><button class="btn primary">Create</button></div></form>`);
  $('#f', m).onsubmit = run(async (e) => {
    e.preventDefault();
    const d = formData(e.target);
    const r = await api('POST', '/api/companies', { ...d, blank: !!d.blank });
    S.cid = r.id; localStorage.setItem('cid', r.id); closeModal(); go('#/dashboard');
  });
}

// ---------- pages ----------
const PAGES = {};

PAGES.dashboard = async () => {
  const d = await capi('GET', '/dashboard');
  title(d.company.name, `<a class="btn" href="#/invoice/new">+ Invoice</a><a class="btn" href="#/bill/new">+ Bill</a><a class="btn primary" href="#/banking">Banking</a>`);
  const max = Math.max(1, ...d.monthly.map((m) => Math.max(m.income, m.expense)));
  page().innerHTML = `
    ${d.toReview ? `<div class="alert"><b>${d.toReview}</b> bank transaction${d.toReview > 1 ? 's' : ''} waiting for review. <a href="#/banking">Review now →</a></div>` : ''}
    <div class="grid cards">
      <div class="panel stat"><div class="label">Profit this month</div><div class="value ${d.monthPnl.net < 0 ? 'neg' : ''}">${money(d.monthPnl.net)}</div><div class="small muted">${money(d.monthPnl.income.total)} in · ${money(d.monthPnl.cogs.total + d.monthPnl.expense.total)} out</div></div>
      <div class="panel stat"><div class="label">Profit this year</div><div class="value ${d.ytdPnl.net < 0 ? 'neg' : ''}">${money(d.ytdPnl.net)}</div><div class="small muted">Income ${money(d.ytdPnl.income.total)}</div></div>
      <div class="panel stat"><div class="label">Customers owe you</div><div class="value">${money(d.ar.total)}</div><div class="small ${d.ar.overdue ? 'neg' : 'muted'}">${money(d.ar.overdue)} overdue</div></div>
      <div class="panel stat"><div class="label">You owe vendors</div><div class="value">${money(d.ap.total)}</div><div class="small ${d.ap.overdue ? 'neg' : 'muted'}">${money(d.ap.overdue)} overdue</div></div>
    </div>
    <div class="grid two" style="margin-top:14px">
      <div class="panel flush"><h2>Bank & card accounts</h2><div class="table-wrap"><table><tbody>
        ${d.accounts.map((a) => `<tr class="click" data-href="#/banking/${a.id}"><td>${esc(a.name)} ${a.toReview ? `<span class="badge">${a.toReview} to review</span>` : ''}</td>${moneyCell(a.balance)}</tr>`).join('') || '<tr><td class="empty">No bank accounts yet. Add one in Chart of accounts.</td></tr>'}
      </tbody></table></div></div>
      <div class="panel"><div class="row"><h2 style="margin:0">Last 12 months</h2><div class="spacer"></div><div class="legend"><span><i style="background:var(--brand)"></i>Income</span><span><i style="background:#94a3b8"></i>Expenses</span></div></div>
        <div class="bars">${d.monthly.map((m) => `<div class="m" title="${m.month}: income ${money(m.income)}, expenses ${money(m.expense)}, net ${money(m.net)}">
          <div class="pair"><div class="b in" style="height:${Math.max(0, m.income) / max * 100}%"></div><div class="b out" style="height:${Math.max(0, m.expense) / max * 100}%"></div></div>
          <div class="lbl">${new Date(m.month + '-15').toLocaleString('en-US', { month: 'short' })}</div></div>`).join('')}</div>
      </div>
    </div>`;
  bindRowLinks();
};

function bindRowLinks(root = document) { $$('tr[data-href]', root).forEach((tr) => tr.addEventListener('click', (e) => { if (!e.target.closest('a,button,input,select')) go(tr.dataset.href); })); }

// ----- banking -----
PAGES.banking = async (accountId, tab = 'new') => {
  const banks = bankAccounts();
  if (!banks.length) {
    title('Banking');
    page().innerHTML = `<div class="panel empty">Add a Bank or Credit card account in <a href="#/accounts">Chart of accounts</a> first.</div>`;
    return;
  }
  const a = acct(accountId) && banks.find((b) => b.id === Number(accountId)) ? acct(accountId) : banks[0];
  title('Banking', `<button class="btn" id="rules-btn">Rules</button><button class="btn primary" id="import-btn">Import bank file</button>`);
  const rows = await capi('GET', `/bank/${a.id}?status=${tab === 'review' ? 'new' : tab === 'new' ? 'new' : tab}`);
  const counts = await capi('GET', '/dashboard');
  page().innerHTML = `
    <div class="row" style="margin-bottom:12px">
      <select id="bank-pick">${banks.map((b) => `<option value="${b.id}" ${b.id === a.id ? 'selected' : ''}>${esc(b.name)}${(counts.accounts.find((x) => x.id === b.id)?.toReview) ? ` (${counts.accounts.find((x) => x.id === b.id).toReview})` : ''}</option>`).join('')}</select>
      <span class="muted small">Book balance: <b>${money(counts.accounts.find((x) => x.id === a.id)?.balance || 0)}</b></span>
    </div>
    <div class="tabs">
      <a href="#/banking/${a.id}/new" class="${tab === 'new' ? 'on' : ''}">For review</a>
      <a href="#/banking/${a.id}/posted" class="${tab === 'posted' ? 'on' : ''}">Categorized</a>
      <a href="#/banking/${a.id}/excluded" class="${tab === 'excluded' ? 'on' : ''}">Excluded</a>
    </div>
    ${tab === 'new' ? `<div class="row" style="margin-bottom:10px">
      <button class="btn primary" id="accept-btn">Accept selected suggestions</button>
      <button class="btn" id="ai-btn" title="Ask Claude to suggest categories for lines without one">✨ AI suggest</button>
      <span class="muted small">Tip: pick a category and press Add. The app learns from what you choose.</span></div>` : ''}
    <div class="panel flush"><div class="table-wrap"><table class="${tab === 'new' ? 'bank-review' : ''}">
      <thead><tr>${tab === 'new' ? '<th><input type="checkbox" id="all"></th>' : ''}<th>Date</th><th>Description</th><th class="num">Amount</th><th>${tab === 'posted' ? 'Posted to' : tab === 'new' ? 'Category' : ''}</th><th></th></tr></thead>
      <tbody>${rows.map((t) => bankRow(t, tab)).join('') || `<tr><td colspan="6" class="empty">${tab === 'new' ? 'All caught up. Import a bank file (CSV, OFX or QFX) to bring in new transactions.' : 'Nothing here.'}</td></tr>`}</tbody>
    </table></div></div>`;
  $('#bank-pick').onchange = (e) => go(`#/banking/${e.target.value}/${tab}`);
  $('#import-btn').onclick = () => bankImportDialog(a);
  $('#rules-btn').onclick = () => rulesDialog();
  if (tab === 'new') {
    $('#all') && ($('#all').onchange = (e) => $$('.sel').forEach((c) => (c.checked = e.target.checked)));
    $('#accept-btn').onclick = run(async () => {
      const ids = $$('.sel:checked').map((c) => Number(c.dataset.id));
      if (!ids.length) throw new Error('Tick the lines to accept (lines with a suggestion)');
      const r = await capi('POST', `/bank/${a.id}/accept`, { ids });
      toast(`${r.posted} posted${r.errors.length ? `, ${r.errors.length} failed` : ''}`, !!r.errors.length);
      route();
    });
    $('#ai-btn').onclick = run(async (e) => {
      e.target.disabled = true; e.target.textContent = 'Thinking…';
      try {
        const ids = $$('.sel:checked').map((c) => Number(c.dataset.id));
        const r = await capi('POST', `/bank/${a.id}/ai`, { ids });
        toast(`AI suggested ${r.suggested} categor${r.suggested === 1 ? 'y' : 'ies'}`);
        route();
      } finally { e.target.disabled = false; e.target.textContent = '✨ AI suggest'; }
    });
  }
  $$('[data-act]').forEach((b) => b.addEventListener('click', run(async () => {
    const id = Number(b.dataset.id);
    const tr = b.closest('tr');
    if (b.dataset.act === 'add') {
      const account_id = $('.cat', tr).value;
      if (!account_id) throw new Error('Pick a category first');
      await capi('POST', `/bank-txn/${id}/post`, { account_id, contact_id: $('.payee', tr).value || null });
      tr.remove(); toast('Added');
      if (!$$('[data-act=add]').length) route();
    } else if (b.dataset.act === 'more') bankDetailDialog(rows.find((r) => r.id === id), a);
    else if (b.dataset.act === 'exclude') { await capi('POST', `/bank-txn/${id}/exclude`); tr.remove(); toast('Excluded'); }
    else if (b.dataset.act === 'undo') { await capi('POST', `/bank-txn/${id}/undo`); tr.remove(); toast('Moved back to review'); }
  })));
};

function bankRow(t, tab) {
  const contacts = t.amount > 0 ? S.meta.customers : S.meta.vendors;
  if (tab !== 'new') {
    return `<tr><td>${fmtDate(t.date)}</td><td>${esc(t.description)}</td>${moneyCell(t.amount)}<td>${esc(t.posted_to || '')}</td>
      <td class="num">${t.entry_id ? `<a class="btn sm" href="#/entry/${t.entry_id}">Open</a> ` : ''}<button class="btn sm" data-act="undo" data-id="${t.id}">Undo</button></td></tr>`;
  }
  return `<tr><td><input type="checkbox" class="sel" data-id="${t.id}" ${t.suggested_account_id ? '' : 'disabled'}></td>
    <td>${fmtDate(t.date)}</td><td>${esc(t.description)}${t.suggestion_source ? ` <span class="pill ${t.suggestion_source}">${t.suggestion_source}</span>` : ''}</td>
    ${moneyCell(t.amount)}
    <td style="min-width:260px"><div class="row" style="flex-wrap:nowrap;gap:4px">
      <select class="cat" style="flex:2">${accountOptions(t.suggested_account_id, (x) => x.id !== t.account_id && !['ar', 'ap'].includes(x.system_key), '— category —')}</select>
      <select class="payee" style="flex:1" title="${t.amount > 0 ? 'Customer' : 'Vendor'} (optional)">${contactOptions(contacts, t.suggested_contact_id, t.amount > 0 ? 'customer' : 'vendor')}</select></div></td>
    <td class="num" style="white-space:nowrap"><button class="btn sm primary" data-act="add" data-id="${t.id}">Add</button>
      <button class="btn sm" data-act="more" data-id="${t.id}" title="Match, split, rule, exclude">⋯</button></td></tr>`;
}

async function bankDetailDialog(t, bank) {
  const m = await capi('GET', `/bank-txn/${t.id}/matches`);
  const words = t.description.replace(/[#*\d]+/g, ' ').replace(/\s+/g, ' ').trim().split(' ').slice(0, 2).join(' ');
  const dlg = modal(`<h2>${esc(t.description)}</h2>
    <p class="muted">${fmtDate(t.date)} · <b class="${t.amount < 0 ? 'neg' : 'pos'}">${money(t.amount)}</b> · ${esc(bank.name)}</p>
    ${m.docs.length || m.lines.length ? `<h3>Match to something already entered</h3><div class="table-wrap"><table><tbody>
      ${m.docs.map((d) => `<tr><td>${d.doc_type === 'invoice' ? 'Invoice' : 'Bill'} ${esc(d.number || '')}</td><td>${esc(d.contact_name)}</td><td>${fmtDate(d.date)}</td><td class="num"><button class="btn sm primary" data-doc="${d.doc_type}:${d.doc_id}">Match</button></td></tr>`).join('')}
      ${m.lines.map((l) => `<tr><td>${esc(l.memo || l.ref || 'Entry')}</td><td>${esc(l.contact_name || '')}</td><td>${fmtDate(l.date)}</td><td class="num"><button class="btn sm primary" data-line="${l.line_id}">Match</button></td></tr>`).join('')}
    </tbody></table></div>` : '<p class="muted small">No matching invoices, bills or entries found.</p>'}
    <h3>Or categorize</h3>
    <form id="f"><div class="form">
      <label class="wide">Category<select name="account_id" required>${accountOptions(t.suggested_account_id, (x) => x.id !== t.account_id && !['ar', 'ap'].includes(x.system_key))}</select></label>
      <label>${t.amount > 0 ? 'Customer' : 'Vendor'}<select name="contact_id">${contactOptions(t.amount > 0 ? S.meta.customers : S.meta.vendors, t.suggested_contact_id, '(none)')}</select></label>
      <label>Memo<input name="memo" value="${esc(t.description)}"></label>
      <label class="check wide"><input type="checkbox" name="make_rule"> Always use this category when the description contains</label>
      <label class="wide"><input name="rule_text" value="${esc(words)}"></label>
    </div>
    <div class="actions"><button type="button" class="btn danger" id="excl">Exclude (duplicate / personal)</button><button type="button" class="btn" id="split">Split…</button><div class="spacer"></div>
      <button type="button" class="btn" data-close>Cancel</button><button class="btn primary">Add</button></div></form>`);
  $$('[data-doc]', dlg).forEach((b) => (b.onclick = run(async () => { const [doc_type, doc_id] = b.dataset.doc.split(':'); await capi('POST', `/bank-txn/${t.id}/match`, { doc_type, doc_id }); closeModal(); toast('Matched and payment recorded'); route(); })));
  $$('[data-line]', dlg).forEach((b) => (b.onclick = run(async () => { await capi('POST', `/bank-txn/${t.id}/match`, { line_id: b.dataset.line }); closeModal(); toast('Matched'); route(); })));
  $('#excl', dlg).onclick = run(async () => { await capi('POST', `/bank-txn/${t.id}/exclude`); closeModal(); toast('Excluded'); route(); });
  $('#split', dlg).onclick = () => { closeModal(); splitDialog(t, bank); };
  $('#f', dlg).onsubmit = run(async (e) => {
    e.preventDefault();
    const d = formData(e.target);
    await capi('POST', `/bank-txn/${t.id}/post`, { ...d, make_rule: !!d.make_rule, contact_id: d.contact_id || null });
    if (d.make_rule) await capi('POST', `/bank/${bank.id}/refresh`);
    closeModal(); toast('Added'); route();
  });
}

// Split one bank line across several categories: create a journal entry, then match the bank line to it.
function splitDialog(t, bank) {
  const dlg = modal(`<h2>Split ${money(t.amount)}</h2><p class="muted small">${esc(t.description)} · ${fmtDate(t.date)}</p>
    <form id="f"><table class="lines-table"><thead><tr><th>Category</th><th>Memo</th><th class="num">Amount</th></tr></thead><tbody id="sl"></tbody></table>
    <div class="row" style="margin-top:8px"><button type="button" class="btn sm" id="addl">+ Line</button><div class="spacer"></div><span>Left to assign: <b id="left"></b></span></div>
    <div class="actions"><button type="button" class="btn" data-close>Cancel</button><button class="btn primary">Save split</button></div></form>`, { wide: true });
  const total = Math.abs(t.amount);
  const addLine = (amt = '') => {
    const tr = document.createElement('tr');
    tr.innerHTML = `<td><select class="c">${accountOptions(null, (x) => x.id !== t.account_id)}</select></td><td><input class="mm" value="${esc(t.description)}"></td><td><input class="am num" type="number" step="0.01" value="${amt}"></td>`;
    $('#sl', dlg).appendChild(tr);
    $('.am', tr).oninput = upd;
  };
  const upd = () => { const used = $$('.am', dlg).reduce((s, i) => s + Math.round(Number(i.value || 0) * 100), 0); $('#left', dlg).textContent = money(total - used); };
  addLine((total / 100).toFixed(2)); addLine(); upd();
  $('#addl', dlg).onclick = () => addLine();
  $('#f', dlg).onsubmit = run(async (e) => {
    e.preventDefault();
    const sign = t.amount > 0 ? 1 : -1;
    const parts = $$('#sl tr', dlg).map((tr) => ({ account_id: $('.c', tr).value, memo: $('.mm', tr).value, cents: Math.round(Number($('.am', tr).value || 0) * 100) })).filter((p) => p.cents);
    if (parts.some((p) => !p.account_id)) throw new Error('Pick a category for every line');
    if (parts.reduce((s, p) => s + p.cents, 0) !== total) throw new Error('The split must add up to the full amount');
    const lines = [{ account_id: bank.id, debit: sign > 0 ? total / 100 : '', credit: sign < 0 ? total / 100 : '', memo: t.description }]
      .concat(parts.map((p) => ({ account_id: p.account_id, memo: p.memo, debit: sign < 0 ? p.cents / 100 : '', credit: sign > 0 ? p.cents / 100 : '' })));
    const r = await capi('POST', '/entries', { date: t.date, memo: t.description, lines });
    const ent = await capi('GET', `/entries/${r.id}`);
    const bl = ent.lines.find((l) => l.account_id === bank.id);
    await capi('POST', `/bank-txn/${t.id}/match`, { line_id: bl.id });
    closeModal(); toast('Split saved'); route();
  });
}

function bankImportDialog(a) {
  const dlg = modal(`<h2>Import into ${esc(a.name)}</h2>
    <p class="muted small">Download transactions from your bank's website as <b>CSV</b>, <b>OFX</b>, <b>QFX</b> or <b>QBO</b> (Web Connect) and choose the file here. Duplicates are skipped automatically, so overlapping date ranges are fine.</p>
    <form id="f"><input type="file" id="file" accept=".csv,.txt,.ofx,.qfx,.qbo" required>
    <label class="check" style="margin-top:12px"><input type="checkbox" name="flip"> Flip signs (use if charges show up as money in, common with credit card CSVs)</label>
    <label class="check"><input type="checkbox" name="dmy"> Dates are day/month/year</label>
    <div class="actions"><button type="button" class="btn" data-close>Cancel</button><button class="btn primary">Import</button></div></form>`);
  $('#f', dlg).onsubmit = run(async (e) => {
    e.preventDefault();
    const f = await readFile($('#file', dlg));
    const d = formData(e.target);
    const r = await capi('POST', `/bank/${a.id}/import`, { filename: f.name, text: f.text, flip: !!d.flip, dmy: !!d.dmy });
    closeModal(); toast(`${r.added} imported, ${r.dupes} duplicates skipped${r.autoPosted ? `, ${r.autoPosted} auto-posted` : ''}`);
    go(`#/banking/${a.id}/new`);
  });
}

async function rulesDialog() {
  const rules = await capi('GET', '/rules');
  const dlg = modal(`<h2>Bank rules</h2><p class="muted small">When an imported description contains the text, the category is filled in for you. Turn on <i>auto-add</i> to skip review entirely.</p>
    <div class="table-wrap"><table><thead><tr><th>Contains</th><th>Direction</th><th>Category</th><th>Payee</th><th>Auto</th><th></th></tr></thead><tbody>
    ${rules.map((r) => `<tr><td>${esc(r.match_text)}</td><td>${r.direction === 'in' ? 'Money in' : r.direction === 'out' ? 'Money out' : 'Any'}</td><td>${esc(r.account_name)}</td><td>${esc(r.contact_name || '')}</td><td>${r.auto_post ? '✓' : ''}</td><td><button class="btn sm danger" data-del="${r.id}">Delete</button></td></tr>`).join('') || '<tr><td colspan="6" class="empty">No rules yet.</td></tr>'}
    </tbody></table></div>
    <h3>New rule</h3><form id="f"><div class="form">
      <label>Description contains<input name="match_text" required placeholder="e.g. CONSUMERS ENERGY"></label>
      <label>Direction<select name="direction"><option value="any">Any</option><option value="out">Money out</option><option value="in">Money in</option></select></label>
      <label>Category<select name="account_id" required>${accountOptions()}</select></label>
      <label>Payee<select name="contact_id">${contactOptions([...S.meta.vendors, ...S.meta.customers], null, '(none)')}</select></label>
      <label class="check wide"><input type="checkbox" name="auto_post"> Auto-add (skip review)</label></div>
      <div class="actions"><button type="button" class="btn" data-close>Close</button><button class="btn primary">Add rule</button></div></form>`, { wide: true });
  $$('[data-del]', dlg).forEach((b) => (b.onclick = run(async () => { await capi('DELETE', `/rules/${b.dataset.del}`); rulesDialog(); })));
  $('#f', dlg).onsubmit = run(async (e) => {
    e.preventDefault();
    const d = formData(e.target);
    await capi('POST', '/rules', { ...d, auto_post: !!d.auto_post, contact_id: d.contact_id || null });
    for (const b of bankAccounts()) await capi('POST', `/bank/${b.id}/refresh`);
    toast('Rule added'); route();
  });
}

// ----- invoices -----
const statusPill = (s) => `<span class="pill ${s}">${s}</span>`;

PAGES.invoices = async (status = 'all') => {
  title('Invoices', `<a class="btn" href="#/payment/received/new">Receive payment</a><a class="btn primary" href="#/invoice/new">+ New invoice</a>`);
  const rows = await capi('GET', `/invoices${status !== 'all' ? '?status=' + status : ''}`);
  page().innerHTML = `<div class="tabs">${['all', 'unpaid', 'overdue', 'paid'].map((s) => `<a href="#/invoices/${s}" class="${s === status ? 'on' : ''}">${s[0].toUpperCase() + s.slice(1)}</a>`).join('')}<a href="#/payments/received">Payments received</a></div>
    <div class="panel flush"><div class="table-wrap"><table><thead><tr><th>No.</th><th>Date</th><th>Customer</th><th>Due</th><th class="num">Total</th><th class="num">Balance</th><th>Status</th></tr></thead><tbody>
    ${rows.map((i) => `<tr class="click" data-href="#/invoice/${i.id}/view"><td>${esc(i.number)}</td><td>${fmtDate(i.date)}</td><td>${esc(i.contact_name)}</td><td>${fmtDate(i.due_date)}</td>${moneyCell(i.total)}${moneyCell(i.balance)}<td>${statusPill(i.status)}</td></tr>`).join('') || '<tr><td colspan="7" class="empty">No invoices.</td></tr>'}
    </tbody></table></div></div>`;
  bindRowLinks();
};

PAGES.invoice = async (id, mode) => {
  if (id !== 'new' && mode === 'view') return invoiceView(id);
  const inv = id === 'new' ? { date: today(), lines: [{ qty: 1, taxable: 1 }], tax_rate: S.meta.company.sales_tax_rate } : await capi('GET', `/invoices/${id}`);
  const pre = new URLSearchParams(location.hash.split('?')[1] || '');
  if (id === 'new' && pre.get('customer')) inv.contact_id = Number(pre.get('customer'));
  title(id === 'new' ? 'New invoice' : `Edit invoice ${inv.number}`);
  const incomeFilter = (a) => ['income', 'other_income'].includes(a.subtype);
  const defaultIncome = S.meta.accounts.find((a) => a.subtype === 'income' && a.is_active && !a.system_key)?.id;
  page().innerHTML = `<form id="f" class="panel">
    <div class="form">
      <label>Customer <a href="#" id="newcust" class="small">+ new</a><select name="contact_id" required>${contactOptions(S.meta.customers, inv.contact_id)}</select></label>
      <label>Invoice no.<input name="number" value="${esc(inv.number || '')}" placeholder="${esc(S.meta.company.next_invoice_no)} (automatic)"></label>
      <label>Date<input type="date" name="date" value="${inv.date}" required></label>
      <label>Due date<input type="date" name="due_date" value="${inv.due_date || ''}" placeholder="auto"></label>
      <label>Tax rate %<input type="number" step="0.001" name="tax_rate" value="${inv.tax_rate}"></label>
    </div>
    <div class="table-wrap" style="margin-top:14px"><table class="lines-table"><thead><tr><th style="width:34%">Description</th><th>Income account</th><th style="width:80px">Qty</th><th style="width:110px">Rate</th><th class="num" style="width:100px">Amount</th><th style="width:40px">Tax</th><th></th></tr></thead><tbody id="lines"></tbody></table></div>
    <button type="button" class="btn sm" id="addl" style="margin-top:6px">+ Add line</button>
    <div class="row" style="justify-content:flex-end;margin-top:10px"><table style="width:auto"><tbody>
      <tr><td>Subtotal</td><td class="num" id="sub"></td></tr><tr><td>Sales tax</td><td class="num" id="tax"></td></tr><tr class="grand"><td>Total</td><td class="num" id="tot"></td></tr></tbody></table></div>
    <label class="wide" style="margin-top:10px">Message / notes on invoice<textarea name="memo">${esc(inv.memo || '')}</textarea></label>
    <div class="actions" style="display:flex;gap:8px;justify-content:flex-end;margin-top:14px">
      <a class="btn" href="#/invoices">Cancel</a><button class="btn primary">Save invoice</button></div></form>`;
  const tbody = $('#lines');
  const addLine = (l = {}) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `<td><input class="d" value="${esc(l.description || '')}"></td><td><select class="a">${accountOptions(l.account_id || defaultIncome, incomeFilter)}</select></td>
      <td><input class="q" type="number" step="any" value="${l.qty ?? 1}"></td><td><input class="r" type="number" step="0.01" value="${l.rate !== undefined ? dollars(l.rate) : ''}"></td>
      <td class="num amt"></td><td><input type="checkbox" class="t" ${l.taxable === 0 ? '' : 'checked'}></td><td><button type="button" class="btn sm danger rm">×</button></td>`;
    tbody.appendChild(tr);
    $$('input', tr).forEach((i) => (i.oninput = calc));
    $('.t', tr).onchange = calc;
    $('.rm', tr).onclick = () => { tr.remove(); calc(); };
  };
  const calc = () => {
    let sub = 0, taxable = 0;
    $$('#lines tr').forEach((tr) => {
      const amt = Math.round(Number($('.q', tr).value || 0) * Math.round(Number($('.r', tr).value || 0) * 100));
      $('.amt', tr).textContent = money(amt); sub += amt; if ($('.t', tr).checked) taxable += amt;
    });
    const tax = Math.round(taxable * Number($('[name=tax_rate]').value || 0) / 100);
    $('#sub').textContent = money(sub); $('#tax').textContent = money(tax); $('#tot').textContent = money(sub + tax);
  };
  (inv.lines.length ? inv.lines : [{}]).forEach(addLine); calc();
  $('[name=tax_rate]').oninput = calc;
  $('#addl').onclick = () => addLine();
  $('#newcust').onclick = (e) => { e.preventDefault(); contactDialog('customer', null, async (cid2) => { await loadMeta(); $('[name=contact_id]').innerHTML = contactOptions(S.meta.customers, cid2); }); };
  $('#f').onsubmit = run(async (e) => {
    e.preventDefault();
    const d = formData(e.target);
    d.lines = $$('#lines tr').map((tr) => ({ description: $('.d', tr).value, account_id: $('.a', tr).value, qty: $('.q', tr).value, rate: $('.r', tr).value, taxable: $('.t', tr).checked }));
    if (id !== 'new') d.id = Number(id);
    const r = await capi('POST', '/invoices', d);
    toast('Invoice saved'); go(`#/invoice/${r.id}/view`);
  });
};

async function invoiceView(id) {
  const inv = await capi('GET', `/invoices/${id}`);
  const co = S.meta.company;
  title(`Invoice ${inv.number}`, `${statusPill(inv.status)}
    ${inv.balance > 0 ? `<a class="btn primary" href="#/payment/received/new?customer=${inv.contact_id}&invoice=${inv.id}">Receive payment</a>` : ''}
    <button class="btn" onclick="window.print()">Print / PDF</button>
    ${inv.contact_email ? `<a class="btn" href="mailto:${esc(inv.contact_email)}?subject=${encodeURIComponent(`Invoice ${inv.number} from ${co.name}`)}&body=${encodeURIComponent(`Hi,\n\nPlease find invoice ${inv.number} for ${money(inv.total)}, due ${fmtDate(inv.due_date)}.\n\nThank you,\n${co.name}`)}">Email</a>` : ''}
    ${inv.voided ? '' : `<a class="btn" href="#/invoice/${inv.id}">Edit</a>`}
    <button class="btn danger" id="more">${inv.voided ? 'Delete' : 'Void'}</button>`);
  page().innerHTML = `<div class="invoice-doc">
    <div class="head"><div><div class="big">${esc(co.name)}</div><pre>${esc(co.address)}</pre><div>${esc(co.phone)} ${esc(co.email)}</div></div>
      <div style="text-align:right"><div style="font-size:24px;font-weight:700">INVOICE</div><div>No. <b>${esc(inv.number)}</b></div><div>Date: ${fmtDate(inv.date)}</div><div>Due: ${fmtDate(inv.due_date)}</div></div></div>
    <div style="margin-bottom:20px"><div class="muted small">BILL TO</div><b>${esc(inv.contact_name)}</b><pre>${esc(inv.contact_address || '')}</pre></div>
    <table><thead><tr><th>Description</th><th class="num">Qty</th><th class="num">Rate</th><th class="num">Amount</th></tr></thead><tbody>
      ${inv.lines.map((l) => `<tr><td>${esc(l.description)}</td><td class="num">${l.qty}</td><td class="num">${money(l.rate)}</td><td class="num">${money(l.amount)}</td></tr>`).join('')}
      <tr class="total"><td colspan="3" class="num">Subtotal</td><td class="num">${money(inv.subtotal)}</td></tr>
      ${inv.tax ? `<tr><td colspan="3" class="num">Sales tax (${inv.tax_rate}%)</td><td class="num">${money(inv.tax)}</td></tr>` : ''}
      <tr class="grand"><td colspan="3" class="num">Total</td><td class="num">${money(inv.total)}</td></tr>
      ${inv.paid ? `<tr><td colspan="3" class="num">Paid</td><td class="num">-${money(inv.paid)}</td></tr><tr class="grand"><td colspan="3" class="num">Balance due</td><td class="num">${money(inv.balance)}</td></tr>` : ''}
    </tbody></table>
    ${inv.memo ? `<p style="margin-top:20px;white-space:pre-wrap">${esc(inv.memo)}</p>` : ''}
    <p style="margin-top:24px;color:#555">${esc(co.invoice_footer || '')}</p>
    ${inv.voided ? '<h2 style="color:#b91c1c">VOID</h2>' : ''}
  </div>
  ${inv.payments.length ? `<div class="panel no-print" style="margin-top:14px;max-width:820px"><h2>Payments</h2><table><tbody>${inv.payments.map((p) => `<tr class="click" data-href="#/payment/received/${p.id}"><td>${fmtDate(p.date)}</td><td>${esc(p.method || '')} ${esc(p.ref || '')}</td>${moneyCell(p.amount)}</tr>`).join('')}</tbody></table></div>` : ''}`;
  bindRowLinks();
  $('#more').onclick = run(async () => {
    if (inv.voided) { if (!(await confirmBox('Delete this void invoice permanently?'))) return; await capi('DELETE', `/invoices/${inv.id}`); toast('Deleted'); return go('#/invoices'); }
    if (!(await confirmBox('Void this invoice? It stays on record with a zero amount.', 'Void'))) return;
    await capi('POST', `/invoices/${inv.id}/void`); toast('Voided'); route();
  });
}

// ----- payments (received & paid) -----
PAGES.payments = async (kind = 'received') => {
  const rows = await capi('GET', `/payments?kind=${kind}`);
  title(kind === 'paid' ? 'Bill payments' : 'Payments received', `<a class="btn primary" href="#/payment/${kind}/new">+ ${kind === 'paid' ? 'Pay bills' : 'Receive payment'}</a>`);
  page().innerHTML = `<div class="panel flush"><div class="table-wrap"><table><thead><tr><th>Date</th><th>${kind === 'paid' ? 'Vendor' : 'Customer'}</th><th>Account</th><th>Method / ref</th><th class="num">Amount</th></tr></thead><tbody>
    ${rows.map((p) => `<tr class="click" data-href="#/payment/${kind}/${p.id}"><td>${fmtDate(p.date)}</td><td>${esc(p.contact_name)}</td><td>${esc(p.account_name)}</td><td>${esc(p.method)} ${esc(p.ref)}</td>${moneyCell(p.amount)}</tr>`).join('') || '<tr><td colspan="5" class="empty">None yet.</td></tr>'}
    </tbody></table></div></div>`;
  bindRowLinks();
};

PAGES.payment = async (kind, id) => {
  const paid = kind === 'paid';
  const pre = new URLSearchParams(location.hash.split('?')[1] || '');
  const p = id && id !== 'new' ? await capi('GET', `/payments/${id}`) : { date: today(), contact_id: Number(pre.get(paid ? 'vendor' : 'customer')) || null, apps: [] };
  title(p.id ? (paid ? 'Bill payment' : 'Payment received') : (paid ? 'Pay bills' : 'Receive payment'), p.id ? '<button class="btn danger" id="del">Delete</button>' : '');
  const contacts = paid ? S.meta.vendors : S.meta.customers;
  const defAcct = p.account_id || (paid ? bankAccounts()[0]?.id : depositAccounts().find((a) => a.subtype === 'bank')?.id);
  page().innerHTML = `<form id="f" class="panel"><div class="form">
      <label>${paid ? 'Vendor' : 'Customer'}<select name="contact_id" required>${contactOptions(contacts, p.contact_id)}</select></label>
      <label>Date<input type="date" name="date" value="${p.date}" required></label>
      <label>${paid ? 'Paid from' : 'Deposit to'}<select name="account_id" required>${accountOptions(defAcct, (a) => (paid ? bankAccounts() : depositAccounts()).some((x) => x.id === a.id))}</select></label>
      <label>Method<select name="method">${['', 'Check', 'Cash', 'ACH', 'Card', 'Zelle', 'Wire', 'Other'].map((m) => `<option ${m === p.method ? 'selected' : ''}>${m}</option>`).join('')}</select></label>
      <label>Check / ref no.<input name="ref" value="${esc(p.ref || '')}"></label>
      <label>Amount<input name="amount" type="number" step="0.01" min="0.01" required value="${p.amount ? dollars(p.amount) : ''}"></label>
      <label class="wide">Memo<input name="memo" value="${esc(p.memo || '')}"></label></div>
    <h3>Apply to ${paid ? 'bills' : 'invoices'}</h3><div id="docs" class="table-wrap"><p class="muted small">Pick a ${paid ? 'vendor' : 'customer'} to see open ${paid ? 'bills' : 'invoices'}.</p></div>
    <div class="actions" style="display:flex;gap:8px;justify-content:flex-end;margin-top:14px"><a class="btn" href="#/payments/${kind}">Cancel</a><button class="btn primary">Save</button></div></form>`;
  const loadDocs = async () => {
    const cid2 = $('[name=contact_id]').value;
    if (!cid2) return;
    const docs = (await capi('GET', `/${paid ? 'bills' : 'invoices'}?contact_id=${cid2}`)).filter((d) => !d.voided);
    const mine = new Map((p.apps || []).map((a) => [a.doc_id, a.amount]));
    const open = docs.map((d) => ({ ...d, open: d.balance + (mine.get(d.id) || 0) })).filter((d) => d.open > 0);
    const preDoc = Number(pre.get(paid ? 'bill' : 'invoice'));
    $('#docs').innerHTML = open.length ? `<table><thead><tr><th></th><th>No.</th><th>Date</th><th>Due</th><th class="num">Open</th><th class="num">Payment</th></tr></thead><tbody>
      ${open.map((d) => { const v = mine.get(d.id) ?? (preDoc === d.id ? d.open : 0); return `<tr><td><input type="checkbox" class="ck" ${v ? 'checked' : ''}></td><td>${esc(d.number || d.id)}</td><td>${fmtDate(d.date)}</td><td>${fmtDate(d.due_date)}</td>${moneyCell(d.open)}<td><input class="ap num" data-id="${d.id}" data-open="${d.open}" type="number" step="0.01" value="${v ? dollars(v) : ''}" style="width:110px"></td></tr>`; }).join('')}
      </tbody></table>` : `<p class="muted small">No open ${paid ? 'bills' : 'invoices'}. The payment will be kept as a credit.</p>`;
    const sync = () => { const t = $$('.ap').reduce((s, i) => s + Math.round(Number(i.value || 0) * 100), 0); if (t) $('[name=amount]').value = (t / 100).toFixed(2); };
    $$('.ck').forEach((c) => (c.onchange = () => { const i = $('.ap', c.closest('tr')); i.value = c.checked ? (Number(i.dataset.open) / 100).toFixed(2) : ''; sync(); }));
    $$('.ap').forEach((i) => (i.oninput = sync));
    if (!p.id) sync();
  };
  $('[name=contact_id]').onchange = loadDocs;
  loadDocs();
  if ($('#del')) $('#del').onclick = run(async () => { if (await confirmBox('Delete this payment?')) { await capi('DELETE', `/payments/${p.id}`); toast('Deleted'); go(`#/payments/${kind}`); } });
  $('#f').onsubmit = run(async (e) => {
    e.preventDefault();
    const d = formData(e.target);
    d.kind = kind; d.apps = $$('.ap').map((i) => ({ doc_id: i.dataset.id, amount: i.value })).filter((a) => Number(a.amount) > 0);
    if (p.id) d.id = p.id;
    await capi('POST', '/payments', d);
    toast('Payment saved'); go(`#/payments/${kind}`);
  });
};

// ----- bills -----
PAGES.bills = async (status = 'all') => {
  title('Bills', `<a class="btn" href="#/payment/paid/new">Pay bills</a><a class="btn primary" href="#/bill/new">+ New bill</a>`);
  const rows = await capi('GET', `/bills${status !== 'all' ? '?status=' + status : ''}`);
  page().innerHTML = `<div class="tabs">${['all', 'unpaid', 'overdue', 'paid'].map((s) => `<a href="#/bills/${s}" class="${s === status ? 'on' : ''}">${s[0].toUpperCase() + s.slice(1)}</a>`).join('')}<a href="#/payments/paid">Bill payments</a></div>
    <div class="panel flush"><div class="table-wrap"><table><thead><tr><th>Date</th><th>Vendor</th><th>Ref no.</th><th>Due</th><th class="num">Total</th><th class="num">Balance</th><th>Status</th></tr></thead><tbody>
    ${rows.map((b) => `<tr class="click" data-href="#/bill/${b.id}"><td>${fmtDate(b.date)}</td><td>${esc(b.contact_name)}</td><td>${esc(b.number)}</td><td>${fmtDate(b.due_date)}</td>${moneyCell(b.total)}${moneyCell(b.balance)}<td>${statusPill(b.status)}</td></tr>`).join('') || '<tr><td colspan="7" class="empty">No bills.</td></tr>'}
    </tbody></table></div></div>`;
  bindRowLinks();
};

PAGES.bill = async (id) => {
  const b = id === 'new' ? { date: today(), lines: [{}] } : await capi('GET', `/bills/${id}`);
  title(id === 'new' ? 'New bill' : `Bill ${b.number || ''} – ${b.contact_name}`, id === 'new' ? '' : `${statusPill(b.status)}${b.balance > 0 ? `<a class="btn primary" href="#/payment/paid/new?vendor=${b.contact_id}&bill=${b.id}">Pay</a>` : ''}<button class="btn danger" id="del">Delete</button>`);
  page().innerHTML = `<form id="f" class="panel"><div class="form">
      <label>Vendor <a href="#" id="newv" class="small">+ new</a><select name="contact_id" required>${contactOptions(S.meta.vendors, b.contact_id)}</select></label>
      <label>Bill / ref no.<input name="number" value="${esc(b.number || '')}"></label>
      <label>Bill date<input type="date" name="date" value="${b.date}" required></label>
      <label>Due date<input type="date" name="due_date" value="${b.due_date || ''}"></label></div>
    <div class="table-wrap" style="margin-top:14px"><table class="lines-table"><thead><tr><th>Category</th><th>Description</th><th style="width:130px" class="num">Amount</th><th></th></tr></thead><tbody id="lines"></tbody></table></div>
    <div class="row" style="margin-top:6px"><button type="button" class="btn sm" id="addl">+ Add line</button><div class="spacer"></div><b>Total <span id="tot"></span></b></div>
    <label style="margin-top:10px">Memo<textarea name="memo">${esc(b.memo || '')}</textarea></label>
    <div class="actions" style="display:flex;gap:8px;justify-content:flex-end;margin-top:14px"><a class="btn" href="#/bills">Cancel</a><button class="btn primary">Save bill</button></div></form>
    ${b.payments?.length ? `<div class="panel" style="margin-top:14px"><h2>Payments</h2><table><tbody>${b.payments.map((p) => `<tr class="click" data-href="#/payment/paid/${p.id}"><td>${fmtDate(p.date)}</td><td>${esc(p.method)} ${esc(p.ref)}</td>${moneyCell(p.amount)}</tr>`).join('')}</tbody></table></div>` : ''}`;
  bindRowLinks();
  const addLine = (l = {}) => {
    const tr = document.createElement('tr');
    const vend = S.meta.vendors.find((v) => v.id === Number($('[name=contact_id]').value));
    tr.innerHTML = `<td><select class="a">${accountOptions(l.account_id || vend?.default_account_id, (a) => !['ar', 'ap'].includes(a.system_key))}</select></td><td><input class="d" value="${esc(l.description || '')}"></td>
      <td><input class="m num" type="number" step="0.01" value="${l.amount !== undefined ? dollars(l.amount) : ''}"></td><td><button type="button" class="btn sm danger rm">×</button></td>`;
    $('#lines').appendChild(tr);
    $('.m', tr).oninput = calc;
    $('.rm', tr).onclick = () => { tr.remove(); calc(); };
  };
  const calc = () => { $('#tot').textContent = money($$('#lines .m').reduce((s, i) => s + Math.round(Number(i.value || 0) * 100), 0)); };
  b.lines.forEach(addLine); calc();
  $('#addl').onclick = () => addLine();
  $('[name=contact_id]').onchange = (e) => {
    const v = S.meta.vendors.find((x) => x.id === Number(e.target.value));
    if (v?.default_account_id) $$('#lines .a').forEach((s) => { if (!s.value) s.value = v.default_account_id; });
  };
  $('#newv').onclick = (e) => { e.preventDefault(); contactDialog('vendor', null, async (vid) => { await loadMeta(); $('[name=contact_id]').innerHTML = contactOptions(S.meta.vendors, vid); }); };
  if ($('#del')) $('#del').onclick = run(async () => { if (await confirmBox('Delete this bill?')) { await capi('DELETE', `/bills/${b.id}`); toast('Deleted'); go('#/bills'); } });
  $('#f').onsubmit = run(async (e) => {
    e.preventDefault();
    const d = formData(e.target);
    d.lines = $$('#lines tr').map((tr) => ({ account_id: $('.a', tr).value, description: $('.d', tr).value, amount: $('.m', tr).value }));
    if (id !== 'new') d.id = Number(id);
    await capi('POST', '/bills', d);
    toast('Bill saved'); go('#/bills');
  });
};

// ----- customers & vendors -----
function contactDialog(kind, c, after) {
  c = c || { kind };
  const dlg = modal(`<h2>${c.id ? 'Edit' : 'New'} ${kind}</h2><form id="f"><div class="form">
    <label class="wide">Name<input name="name" required value="${esc(c.name)}"></label>
    <label>Email<input name="email" type="email" value="${esc(c.email)}"></label>
    <label>Phone<input name="phone" value="${esc(c.phone)}"></label>
    <label class="wide">Address<textarea name="address" rows="3">${esc(c.address)}</textarea></label>
    ${kind === 'vendor' ? `<label class="wide">Default category for bills<select name="default_account_id">${accountOptions(c.default_account_id, () => true, '(none)')}</select></label>` : ''}
    <label class="wide">Notes<textarea name="notes" rows="2">${esc(c.notes)}</textarea></label>
    ${c.id ? `<label class="check wide"><input type="checkbox" name="is_active" ${c.is_active ? 'checked' : ''}> Active</label>` : ''}</div>
    <div class="actions">${c.id ? '<button type="button" class="btn danger" id="del">Delete</button><div class="spacer"></div>' : ''}<button type="button" class="btn" data-close>Cancel</button><button class="btn primary">Save</button></div></form>`);
  $('#f', dlg).onsubmit = run(async (e) => {
    e.preventDefault();
    const d = formData(e.target);
    const r = await capi('POST', '/contacts', { ...d, kind, id: c.id, is_active: c.id ? !!d.is_active : true, default_account_id: d.default_account_id || null });
    closeModal(); toast('Saved');
    if (after) after(r.id); else route();
  });
  if ($('#del', dlg)) $('#del', dlg).onclick = run(async () => { await capi('DELETE', `/contacts/${c.id}`); closeModal(); toast('Deleted'); go(`#/${kind}s`); });
}

function contactsPage(kind) {
  return async () => {
    const rows = await capi('GET', `/contacts?kind=${kind}`);
    title(kind === 'vendor' ? 'Vendors' : 'Customers', `<button class="btn primary" id="new">+ New ${kind}</button>`);
    page().innerHTML = `<div class="row" style="margin-bottom:10px"><input id="q" placeholder="Search…" style="max-width:280px"><label class="check"><input type="checkbox" id="inact"> Show inactive</label></div>
      <div class="panel flush"><div class="table-wrap"><table><thead><tr><th>Name</th><th>Email</th><th>Phone</th><th class="num">${kind === 'vendor' ? 'You owe' : 'Owes you'}</th></tr></thead><tbody id="tb"></tbody></table></div></div>`;
    const draw = () => {
      const q = $('#q').value.toLowerCase();
      const list = rows.filter((r) => (r.is_active || $('#inact').checked) && (!q || r.name.toLowerCase().includes(q) || (r.email || '').toLowerCase().includes(q)));
      $('#tb').innerHTML = list.map((r) => `<tr class="click" data-href="#/contact/${r.id}"><td>${esc(r.name)}${r.is_active ? '' : ' <span class="pill">inactive</span>'}</td><td>${esc(r.email)}</td><td>${esc(r.phone)}</td>${moneyCell(r.balance)}</tr>`).join('') || `<tr><td colspan="4" class="empty">No ${kind}s yet.</td></tr>`;
      bindRowLinks($('#tb'));
    };
    $('#q').oninput = draw; $('#inact').onchange = draw; draw();
    $('#new').onclick = () => contactDialog(kind);
  };
}
PAGES.customers = contactsPage('customer');
PAGES.vendors = contactsPage('vendor');

PAGES.contact = async (id) => {
  const c = await capi('GET', `/contacts/${id}`);
  const v = c.kind === 'vendor';
  title(c.name, `<button class="btn" id="edit">Edit</button>${v ? `<a class="btn" href="#/payment/paid/new?vendor=${c.id}">Pay</a><a class="btn primary" href="#/bill/new">+ Bill</a>` : `<a class="btn" href="#/payment/received/new?customer=${c.id}">Receive payment</a><a class="btn primary" href="#/invoice/new?customer=${c.id}">+ Invoice</a>`}`);
  const open = c.docs.filter((d) => d.balance > 0).reduce((s, d) => s + d.balance, 0);
  page().innerHTML = `<div class="grid two"><div class="panel"><div class="muted small">${v ? 'Vendor' : 'Customer'}</div>
      <div>${esc(c.email)}</div><div>${esc(c.phone)}</div><div style="white-space:pre-wrap">${esc(c.address)}</div>${c.notes ? `<p class="muted" style="white-space:pre-wrap">${esc(c.notes)}</p>` : ''}</div>
    <div class="panel stat"><div class="label">Open ${v ? 'bills' : 'invoices'}</div><div class="value">${money(open)}</div></div></div>
    <div class="panel flush" style="margin-top:14px"><h2>${v ? 'Bills' : 'Invoices'}</h2><div class="table-wrap"><table><thead><tr><th>No.</th><th>Date</th><th>Due</th><th class="num">Total</th><th class="num">Balance</th><th>Status</th></tr></thead><tbody>
    ${c.docs.map((d) => `<tr class="click" data-href="${v ? `#/bill/${d.id}` : `#/invoice/${d.id}/view`}"><td>${esc(d.number)}</td><td>${fmtDate(d.date)}</td><td>${fmtDate(d.due_date)}</td>${moneyCell(d.total)}${moneyCell(d.balance)}<td>${statusPill(d.status)}</td></tr>`).join('') || '<tr><td colspan="6" class="empty">None yet.</td></tr>'}
    </tbody></table></div></div>`;
  bindRowLinks();
  $('#edit').onclick = () => contactDialog(c.kind, c);
};

// ----- chart of accounts -----
PAGES.accounts = async () => {
  const rows = await capi('GET', '/accounts');
  title('Chart of accounts', `<button class="btn primary" id="new">+ New account</button>`);
  const order = ['bank', 'ar', 'current_asset', 'fixed_asset', 'other_asset', 'credit_card', 'ap', 'current_liability', 'long_term_liability', 'equity', 'income', 'other_income', 'cogs', 'expense', 'other_expense'];
  page().innerHTML = `<div class="row" style="margin-bottom:10px"><input id="q" placeholder="Search…" style="max-width:280px"><label class="check"><input type="checkbox" id="inact"> Show inactive</label></div>
    <div class="panel flush"><div class="table-wrap"><table><thead><tr><th>Code</th><th>Name</th><th>Type</th><th class="num">Balance</th><th></th></tr></thead><tbody id="tb"></tbody></table></div></div>`;
  const draw = () => {
    const q = $('#q').value.toLowerCase();
    let h = '';
    for (const sub of order) {
      const list = rows.filter((r) => r.subtype === sub && (r.is_active || $('#inact').checked) && (!q || r.name.toLowerCase().includes(q) || r.code.includes(q)));
      if (!list.length) continue;
      h += `<tr class="head"><td colspan="5">${esc(S.meta.subtypes[sub])}</td></tr>` + list.map((a) => `<tr class="click" data-href="#/register/${a.id}"><td>${esc(a.code)}</td><td>${esc(a.name)}${a.is_active ? '' : ' <span class="pill">inactive</span>'}${a.system_key ? ' <span class="pill" title="Built-in account">built-in</span>' : ''}</td><td class="muted small">${esc(S.meta.subtypes[a.subtype])}</td>${moneyCell(a.balance)}<td class="num"><button class="btn sm" data-edit="${a.id}">Edit</button></td></tr>`).join('');
    }
    $('#tb').innerHTML = h;
    bindRowLinks($('#tb'));
    $$('[data-edit]').forEach((b) => (b.onclick = () => accountDialog(rows.find((r) => r.id === Number(b.dataset.edit)))));
  };
  $('#q').oninput = draw; $('#inact').onchange = draw; draw();
  $('#new').onclick = () => accountDialog();
};

function accountDialog(a = {}) {
  const dlg = modal(`<h2>${a.id ? 'Edit' : 'New'} account</h2><form id="f"><div class="form">
    <label>Code / number<input name="code" value="${esc(a.code)}"></label>
    <label>Type<select name="subtype" required>${Object.entries(S.meta.subtypes).map(([k, v]) => `<option value="${k}" ${k === a.subtype ? 'selected' : ''}>${v}</option>`).join('')}</select></label>
    <label class="wide">Name<input name="name" required value="${esc(a.name)}"></label>
    <label class="wide">Description<input name="description" value="${esc(a.description)}"></label>
    ${a.id ? `<label class="check wide"><input type="checkbox" name="is_active" ${a.is_active ? 'checked' : ''}> Active</label>` : ''}
    ${!a.id ? `<label class="wide">Opening balance (optional)<input name="opening" type="number" step="0.01" placeholder="0.00"></label><label class="wide">as of<input name="opening_date" type="date" value="${today()}"></label>` : ''}</div>
    <div class="actions">${a.id && !a.system_key ? '<button type="button" class="btn danger" id="del">Delete</button><div class="spacer"></div>' : ''}<button type="button" class="btn" data-close>Cancel</button><button class="btn primary">Save</button></div></form>`);
  $('#f', dlg).onsubmit = run(async (e) => {
    e.preventDefault();
    const d = formData(e.target);
    const r = await capi('POST', '/accounts', { ...d, id: a.id, is_active: a.id ? !!d.is_active : true });
    if (!a.id && Number(d.opening)) {
      await loadMeta();
      const ob = S.meta.accounts.find((x) => x.system_key === 'opening_balance');
      const na = S.meta.accounts.find((x) => x.id === r.id);
      const debitNormal = ['asset', 'expense'].includes(na.type);
      const amt = Math.abs(Number(d.opening));
      const pos = Number(d.opening) > 0 === debitNormal;
      await capi('POST', '/entries', { date: d.opening_date, memo: `Opening balance - ${na.name}`, lines: [
        { account_id: na.id, debit: pos ? amt : '', credit: pos ? '' : amt }, { account_id: ob.id, debit: pos ? '' : amt, credit: pos ? amt : '' }] });
    }
    closeModal(); toast('Saved'); route();
  });
  if ($('#del', dlg)) $('#del', dlg).onclick = run(async () => { await capi('DELETE', `/accounts/${a.id}`); closeModal(); toast('Deleted'); route(); });
}

// ----- account register -----
PAGES.register = async (id) => {
  const q = new URLSearchParams(location.hash.split('?')[1] || '');
  const from = q.get('from') || '', to = q.get('to') || '';
  const r = await capi('GET', `/reports/register?account_id=${parseInt(id, 10)}&from=${from}&to=${to}`);
  title(r.account.name, `<a class="btn" href="#/entry/new">+ Journal entry</a>`);
  page().innerHTML = `<div class="row" style="margin-bottom:10px"><label>From<input type="date" id="from" value="${from}"></label><label>To<input type="date" id="to" value="${to}"></label><button class="btn" id="go" style="align-self:flex-end">Show</button><button class="btn" id="csv" style="align-self:flex-end">Export CSV</button></div>
    <div class="panel flush"><div class="table-wrap"><table><thead><tr><th>Date</th><th>Ref</th><th>Name</th><th>Memo</th><th>Other account</th><th class="num">Amount</th><th class="num">Balance</th><th></th></tr></thead><tbody>
    <tr class="head"><td colspan="6">Opening balance</td>${moneyCell(r.opening)}<td></td></tr>
    ${r.rows.map((l) => `<tr class="click" data-href="#/entry/${l.entry_id}"><td>${fmtDate(l.date)}</td><td>${esc(l.ref)}</td><td>${esc(l.contact_name || '')}</td><td>${esc(l.line_memo || l.memo)}</td><td class="small muted">${esc(l.other || '')}</td>${moneyCell(l.natural)}${moneyCell(l.balance)}<td>${l.cleared === 2 ? '<span title="Reconciled">R</span>' : l.cleared ? '<span title="Cleared">C</span>' : ''}</td></tr>`).join('')}
    <tr class="total"><td colspan="6">Ending balance</td>${moneyCell(r.closing)}<td></td></tr></tbody></table></div></div>`;
  bindRowLinks();
  $('#go').onclick = () => go(`#/register/${parseInt(id, 10)}?from=${$('#from').value}&to=${$('#to').value}`);
  $('#csv').onclick = () => downloadCSV(`${r.account.name}.csv`, [['Date', 'Ref', 'Name', 'Memo', 'Other account', 'Amount', 'Balance'], ...r.rows.map((l) => [l.date, l.ref, l.contact_name, l.line_memo || l.memo, l.other, dollars(l.natural) || '0', (l.balance / 100).toFixed(2)])]);
};

// ----- journal -----
PAGES.journal = async () => {
  const q = new URLSearchParams(location.hash.split('?')[1] || '');
  const rows = await capi('GET', `/entries?${q}`);
  title('Transactions', `<a class="btn" href="#/expense">+ Expense</a><a class="btn" href="#/deposit">+ Deposit</a><a class="btn primary" href="#/entry/new">+ Journal entry</a>`);
  page().innerHTML = `<form id="filt" class="row" style="margin-bottom:10px"><input name="search" placeholder="Search memo, name, ref…" value="${esc(q.get('search') || '')}"><input type="date" name="from" value="${esc(q.get('from') || '')}"><input type="date" name="to" value="${esc(q.get('to') || '')}"><button class="btn">Filter</button></form>
    <div class="panel flush"><div class="table-wrap"><table><thead><tr><th>Date</th><th>Type</th><th>Ref</th><th>Name</th><th>Memo</th><th>Accounts</th><th class="num">Amount</th></tr></thead><tbody>
    ${rows.map((e) => `<tr class="click" data-href="#/entry/${e.id}"><td>${fmtDate(e.date)}</td><td><span class="pill">${esc(e.source.replace('_', ' '))}</span></td><td>${esc(e.ref)}</td><td>${esc(e.contact_name || '')}</td><td>${esc(e.memo)}</td><td class="small muted">${esc(e.accounts)}</td>${moneyCell(e.total)}</tr>`).join('') || '<tr><td colspan="7" class="empty">No transactions.</td></tr>'}
    </tbody></table></div></div>${rows.length >= 200 ? '<p class="muted small">Showing the latest 200. Use the filters to narrow down.</p>' : ''}`;
  bindRowLinks();
  $('#filt').onsubmit = (e) => { e.preventDefault(); go('#/journal?' + new URLSearchParams(formData(e.target))); };
};

PAGES.entry = async (id) => {
  const e = id === 'new' ? { date: today(), lines: [{}, {}] } : await capi('GET', `/entries/${id}`);
  if (e.doc && e.doc.type !== 'bank_txn') {
    const link = e.doc.type === 'invoice' ? `#/invoice/${e.doc.id}/view` : e.doc.type === 'bill' ? `#/bill/${e.doc.id}` : `#/payment/${(await capi('GET', `/payments/${e.doc.id}`)).kind}/${e.doc.id}`;
    title(`${e.memo}`, `<a class="btn primary" href="${link}">Open ${e.doc.type}</a>`);
    page().innerHTML = `<div class="panel"><p class="muted">${fmtDate(e.date)} · created from a ${e.doc.type}. Edit it from the ${e.doc.type}.</p><table><thead><tr><th>Account</th><th>Name</th><th>Memo</th><th class="num">Debit</th><th class="num">Credit</th></tr></thead><tbody>
      ${e.lines.map((l) => `<tr><td>${esc(l.account_name)}</td><td>${esc(l.contact_name || '')}</td><td>${esc(l.memo)}</td><td class="num">${l.amount > 0 ? money(l.amount) : ''}</td><td class="num">${l.amount < 0 ? money(-l.amount) : ''}</td></tr>`).join('')}</tbody></table></div>`;
    return;
  }
  title(id === 'new' ? 'New journal entry' : 'Journal entry', id !== 'new' ? '<button class="btn danger" id="del">Delete</button>' : '');
  const allContacts = [...S.meta.customers.map((c) => ({ ...c, name: c.name + ' (customer)' })), ...S.meta.vendors.map((c) => ({ ...c, name: c.name + ' (vendor)' }))];
  page().innerHTML = `<form id="f" class="panel"><div class="form">
    <label>Date<input type="date" name="date" value="${e.date}" required></label><label>Ref no.<input name="ref" value="${esc(e.ref || '')}"></label>
    <label class="wide">Memo<input name="memo" value="${esc(e.memo || '')}"></label></div>
    <div class="table-wrap" style="margin-top:14px"><table class="lines-table"><thead><tr><th style="width:30%">Account</th><th class="num" style="width:120px">Debit</th><th class="num" style="width:120px">Credit</th><th>Memo</th><th>Name</th><th></th></tr></thead><tbody id="lines"></tbody>
    <tfoot><tr class="total"><td>Totals</td><td class="num" id="dt"></td><td class="num" id="ct"></td><td colspan="3" id="diff"></td></tr></tfoot></table></div>
    <button type="button" class="btn sm" id="addl" style="margin-top:6px">+ Add line</button>
    ${e.source === 'bank' ? '<p class="muted small">This entry came from a bank import. Keep the bank account line as it is.</p>' : ''}
    <div class="actions" style="display:flex;gap:8px;justify-content:flex-end;margin-top:14px"><a class="btn" href="#/journal">Cancel</a><button class="btn primary">Save</button></div></form>`;
  const addLine = (l = {}) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `<td><select class="a">${accountOptions(l.account_id)}</select></td><td><input class="dr num" type="number" step="0.01" value="${l.amount > 0 ? dollars(l.amount) : ''}"></td>
      <td><input class="cr num" type="number" step="0.01" value="${l.amount < 0 ? dollars(-l.amount) : ''}"></td><td><input class="m" value="${esc(l.memo || '')}"></td>
      <td><select class="c">${contactOptions(allContacts, l.contact_id, '')}</select></td><td><button type="button" class="btn sm danger rm">×</button></td>`;
    $('#lines').appendChild(tr);
    $$('input', tr).forEach((i) => (i.oninput = calc));
    $('.rm', tr).onclick = () => { tr.remove(); calc(); };
  };
  const calc = () => {
    const sum = (c) => $$(c).reduce((s, i) => s + Math.round(Number(i.value || 0) * 100), 0);
    const dt = sum('#lines .dr'), ct = sum('#lines .cr');
    $('#dt').textContent = money(dt); $('#ct').textContent = money(ct);
    $('#diff').innerHTML = dt === ct ? '<span class="pos">Balanced</span>' : `<span class="neg">Off by ${money(Math.abs(dt - ct))}</span>`;
  };
  e.lines.forEach(addLine); calc();
  $('#addl').onclick = () => addLine();
  if ($('#del')) $('#del').onclick = run(async () => { if (await confirmBox('Delete this entry?')) { await capi('DELETE', `/entries/${id}`); toast('Deleted'); go('#/journal'); } });
  $('#f').onsubmit = run(async (ev) => {
    ev.preventDefault();
    const d = formData(ev.target);
    d.lines = $$('#lines tr').map((tr) => ({ account_id: $('.a', tr).value, debit: $('.dr', tr).value, credit: $('.cr', tr).value, memo: $('.m', tr).value, contact_id: $('.c', tr).value || null })).filter((l) => l.account_id);
    if (id !== 'new') d.id = Number(id);
    await capi('POST', '/entries', d);
    toast('Saved'); go('#/journal');
  });
};

// Quick expense (money out) or deposit (money in) – a simple two-line entry.
function quickPage(kind) {
  return async () => {
    const out = kind === 'expense';
    title(out ? 'Record an expense' : 'Record a deposit');
    page().innerHTML = `<form id="f" class="panel" style="max-width:640px"><div class="form">
      <label>Date<input type="date" name="date" value="${today()}" required></label>
      <label>Amount<input type="number" step="0.01" min="0.01" name="amount" required></label>
      <label class="wide">${out ? 'Paid from' : 'Deposit to'}<select name="bank" required>${accountOptions(bankAccounts()[0]?.id, (a) => bankAccounts().some((b) => b.id === a.id) || a.system_key === 'undeposited')}</select></label>
      <label class="wide">Category<select name="account_id" required>${accountOptions(null, (a) => !['ar', 'ap'].includes(a.system_key))}</select></label>
      <label>${out ? 'Vendor' : 'Customer / from'}<select name="contact_id">${contactOptions(out ? S.meta.vendors : S.meta.customers, null, '(none)')}</select></label>
      <label>Ref / check no.<input name="ref"></label>
      <label class="wide">Memo<input name="memo"></label></div>
      <div class="actions" style="display:flex;gap:8px;justify-content:flex-end;margin-top:14px"><a class="btn" href="#/journal">Cancel</a><button class="btn primary">Save</button></div></form>`;
    $('#f').onsubmit = run(async (e) => {
      e.preventDefault();
      const d = formData(e.target);
      const amt = d.amount;
      await capi('POST', '/entries', { date: d.date, ref: d.ref, memo: d.memo, lines: [
        { account_id: d.bank, debit: out ? '' : amt, credit: out ? amt : '', contact_id: d.contact_id || null },
        { account_id: d.account_id, debit: out ? amt : '', credit: out ? '' : amt, memo: d.memo, contact_id: d.contact_id || null }] });
      toast('Saved'); go('#/journal');
    });
  };
}
PAGES.expense = quickPage('expense');
PAGES.deposit = quickPage('deposit');

// ----- reconcile -----
PAGES.reconcile = async (accountId) => {
  const accts = S.meta.accounts.filter((a) => ['bank', 'credit_card'].includes(a.subtype) && a.is_active);
  title('Reconcile');
  if (!accts.length) { page().innerHTML = '<div class="panel empty">No bank or card accounts yet.</div>'; return; }
  const a = accts.find((x) => x.id === Number(accountId)) || accts[0];
  const q = new URLSearchParams(location.hash.split('?')[1] || '');
  const date = q.get('date') || today();
  const r = await capi('GET', `/reconcile?account_id=${a.id}&date=${date}`);
  page().innerHTML = `<div class="panel" style="margin-bottom:14px"><div class="form">
      <label>Account<select id="acc">${accts.map((x) => `<option value="${x.id}" ${x.id === a.id ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}</select></label>
      <label>Statement ending date<input type="date" id="sd" value="${date}"></label>
      <label>Statement ending balance<input type="number" step="0.01" id="sb" value="${esc(q.get('bal') || '')}" placeholder="from your statement"></label></div>
      <div class="grid cards" style="margin-top:14px">
        <div class="stat"><div class="label">Last reconciled balance</div><div class="value">${money(r.opening)}</div><div class="small muted">${r.last ? 'on ' + fmtDate(r.last.statement_date) : 'never reconciled'}</div></div>
        <div class="stat"><div class="label">Cleared balance</div><div class="value" id="cb"></div></div>
        <div class="stat"><div class="label">Difference</div><div class="value" id="df"></div></div></div></div>
    <div class="row" style="margin-bottom:8px"><button class="btn sm" id="selall">Select all</button><div class="spacer"></div><button class="btn primary" id="finish" disabled>Finish reconciling</button></div>
    <div class="panel flush"><div class="table-wrap"><table><thead><tr><th></th><th>Date</th><th>Ref</th><th>Name / memo</th><th class="num">Amount</th></tr></thead><tbody>
    ${r.items.map((i) => `<tr><td><input type="checkbox" class="rc" data-id="${i.id}" data-amt="${i.natural}" ${i.cleared ? 'checked' : ''}></td><td>${fmtDate(i.date)}</td><td>${esc(i.ref)}</td><td>${esc(i.contact_name || '')} ${esc(i.memo)}</td>${moneyCell(i.natural)}</tr>`).join('') || '<tr><td colspan="5" class="empty">Nothing to reconcile up to this date.</td></tr>'}
    </tbody></table></div></div>
    ${r.history.length ? `<div class="panel flush" style="margin-top:14px"><h2>History</h2><table><tbody>${r.history.map((h, i) => `<tr><td>${fmtDate(h.statement_date)}</td>${moneyCell(h.statement_balance)}<td class="small muted">done ${esc(h.completed_at)}</td><td class="num">${i === 0 ? `<button class="btn sm danger" data-undo="${h.id}">Undo</button>` : ''}</td></tr>`).join('')}</tbody></table></div>` : ''}`;
  const calc = () => {
    const cleared = r.opening + $$('.rc:checked').reduce((s, c) => s + Number(c.dataset.amt), 0);
    const target = Math.round(Number($('#sb').value || 0) * 100);
    $('#cb').textContent = money(cleared);
    const diff = target - cleared;
    $('#df').textContent = money(diff); $('#df').className = 'value ' + (diff === 0 ? 'pos' : 'neg');
    $('#finish').disabled = diff !== 0 || $('#sb').value === '';
  };
  $$('.rc').forEach((c) => (c.onchange = calc)); $('#sb').oninput = calc; calc();
  $('#selall').onclick = () => { const all = $$('.rc').every((c) => c.checked); $$('.rc').forEach((c) => (c.checked = !all)); calc(); };
  $('#acc').onchange = (e) => go(`#/reconcile/${e.target.value}`);
  $('#sd').onchange = (e) => go(`#/reconcile/${a.id}?date=${e.target.value}&bal=${$('#sb').value}`);
  $('#finish').onclick = run(async () => {
    await capi('POST', '/reconcile', { account_id: a.id, statement_date: $('#sd').value, statement_balance: $('#sb').value, line_ids: $$('.rc:checked').map((c) => c.dataset.id) });
    toast('Reconciled!'); go(`#/reconcile/${a.id}`);
  });
  $$('[data-undo]').forEach((b) => (b.onclick = run(async () => { if (await confirmBox('Undo this reconciliation?', 'Undo')) { await capi('DELETE', `/reconcile/${b.dataset.undo}`); route(); } })));
};

// ----- reports -----
const REPORTS = [['pnl', 'Profit & loss'], ['bs', 'Balance sheet'], ['ar', 'A/R aging'], ['ap', 'A/P aging'], ['sales', 'Sales by customer'], ['spend', 'Expenses by vendor'], ['tb', 'Trial balance']];

PAGES.reports = async (kind = 'pnl') => {
  const q = new URLSearchParams(location.hash.split('?')[1] || '');
  const from = q.get('from') || yearStart(), to = q.get('to') || today(), asOf = q.get('asOf') || today();
  const ranged = ['pnl', 'sales', 'spend'].includes(kind);
  title('Reports', `<button class="btn" id="csv">Export CSV</button><button class="btn" onclick="window.print()">Print</button>`);
  const presets = [['This month', monthStart(), today()], ['This year', yearStart(), today()],
    ['Last year', `${Number(today().slice(0, 4)) - 1}-01-01`, `${Number(today().slice(0, 4)) - 1}-12-31`],
    ['Last month', (() => { const d = new Date(today().slice(0, 7) + '-01T00:00:00Z'); d.setUTCMonth(d.getUTCMonth() - 1); return d.toISOString().slice(0, 10); })(), (() => { const d = new Date(today().slice(0, 7) + '-01T00:00:00Z'); d.setUTCDate(0); return d.toISOString().slice(0, 10); })()]];
  page().innerHTML = `<div class="tabs no-print">${REPORTS.map(([k, l]) => `<a href="#/reports/${k}" class="${k === kind ? 'on' : ''}">${l}</a>`).join('')}</div>
    <div class="row no-print" style="margin-bottom:12px">${ranged ? `<label>From<input type="date" id="from" value="${from}"></label><label>To<input type="date" id="to" value="${to}"></label>
      <div class="row" style="align-self:flex-end">${presets.map(([l, f, t]) => `<button class="btn sm" data-f="${f}" data-t="${t}">${l}</button>`).join('')}</div>`
      : `<label>As of<input type="date" id="asof" value="${asOf}"></label>`}<button class="btn primary" id="run" style="align-self:flex-end">Run</button></div>
    <div class="panel" id="rep"></div>`;
  const reload = (f, t) => go(`#/reports/${kind}?` + (ranged ? `from=${f ?? $('#from').value}&to=${t ?? $('#to').value}` : `asOf=${$('#asof').value}`));
  $('#run').onclick = () => reload();
  $$('[data-f]').forEach((b) => (b.onclick = () => reload(b.dataset.f, b.dataset.t)));
  const co = S.meta.company.name;
  let csv = [];
  const head = (t, sub) => `<div style="text-align:center;margin-bottom:14px"><div class="muted">${esc(co)}</div><h2 style="margin:2px 0">${t}</h2><div class="muted small">${sub}</div></div>`;
  const sec = (label, s, link = true) => { csv.push([label]); s.items.forEach((i) => csv.push(['', i.name, (i.amount / 100).toFixed(2)])); csv.push(['Total ' + label, '', (s.total / 100).toFixed(2)]);
    return `<tr class="head"><td colspan="2">${label}</td></tr>${s.items.map((i) => `<tr ${link && i.id ? `class="click" data-href="#/register/${i.id}?from=${ranged ? from : ''}&to=${ranged ? to : asOf}"` : ''}><td class="indent">${esc(i.name)}</td>${moneyCell(i.amount)}</tr>`).join('')}<tr class="total"><td>Total ${label}</td>${moneyCell(s.total)}</tr>`; };
  let html = '';
  if (kind === 'pnl') {
    const r = await capi('GET', `/reports/pnl?from=${from}&to=${to}`);
    html = head('Profit and Loss', `${fmtDate(from)} – ${fmtDate(to)}`) + `<table><tbody>${sec('Income', r.income)}${r.cogs.items.length ? sec('Cost of Goods Sold', r.cogs) + `<tr class="total"><td>Gross Profit</td>${moneyCell(r.gross)}</tr>` : ''}
      ${sec('Expenses', r.expense)}${r.otherIncome.items.length || r.otherExpense.items.length ? `<tr class="total"><td>Operating Profit</td>${moneyCell(r.operating)}</tr>` + (r.otherIncome.items.length ? sec('Other Income', r.otherIncome) : '') + (r.otherExpense.items.length ? sec('Other Expenses', r.otherExpense) : '') : ''}
      <tr class="grand"><td>Net Profit</td>${moneyCell(r.net)}</tr></tbody></table>`;
    csv.push(['Net Profit', '', (r.net / 100).toFixed(2)]);
  } else if (kind === 'bs') {
    const r = await capi('GET', `/reports/bs?asOf=${asOf}`);
    html = head('Balance Sheet', `As of ${fmtDate(asOf)}`) + `<table><tbody>${sec('Assets', r.assets)}<tr><td colspan="2">&nbsp;</td></tr>${sec('Liabilities', r.liabilities)}${sec('Equity', r.equity)}
      <tr class="grand"><td>Total Liabilities & Equity</td>${moneyCell(r.liabilitiesAndEquity)}</tr></tbody></table>${r.balanced ? '' : '<div class="alert err">Assets do not equal liabilities + equity. Please report this.</div>'}`;
  } else if (kind === 'tb') {
    const r = await capi('GET', `/reports/tb?asOf=${asOf}`);
    csv = [['Account', 'Debit', 'Credit'], ...r.rows.map((x) => [x.name, dollars(x.debit), dollars(x.credit)])];
    html = head('Trial Balance', `As of ${fmtDate(asOf)}`) + `<table><thead><tr><th>Account</th><th class="num">Debit</th><th class="num">Credit</th></tr></thead><tbody>
      ${r.rows.map((x) => `<tr class="click" data-href="#/register/${x.id}"><td>${esc(x.code ? x.code + ' · ' : '')}${esc(x.name)}</td><td class="num">${x.debit ? money(x.debit) : ''}</td><td class="num">${x.credit ? money(x.credit) : ''}</td></tr>`).join('')}
      <tr class="grand"><td>Total</td><td class="num">${money(r.debit)}</td><td class="num">${money(r.credit)}</td></tr></tbody></table>`;
  } else if (kind === 'ar' || kind === 'ap') {
    const r = await capi('GET', `/reports/aging?kind=${kind}&asOf=${asOf}`);
    csv = [['Name', ...r.buckets, 'Total'], ...r.rows.map((x) => [x.name, ...r.buckets.map((b) => dollars(x[b])), dollars(x.total)])];
    html = head(kind === 'ar' ? 'Accounts Receivable Aging' : 'Accounts Payable Aging', `As of ${fmtDate(asOf)} · days past due`) + `<div class="table-wrap"><table><thead><tr><th>Name</th>${r.buckets.map((b) => `<th class="num">${b === 'current' ? 'Current' : b}</th>`).join('')}<th class="num">Total</th></tr></thead><tbody>
      ${r.rows.map((x) => `<tr class="click" data-href="#/contact/${x.contact_id}"><td>${esc(x.name)}</td>${r.buckets.map((b) => `<td class="num">${x[b] ? money(x[b]) : ''}</td>`).join('')}${moneyCell(x.total)}</tr>`).join('') || '<tr><td colspan="7" class="empty">Nothing outstanding.</td></tr>'}
      <tr class="grand"><td>Total</td>${r.buckets.map((b) => moneyCell(r.totals[b])).join('')}${moneyCell(r.totals.total)}</tr></tbody></table></div>
      ${r.ledgerBalance !== r.totals.total ? `<p class="muted small">The ${kind === 'ar' ? 'Accounts Receivable' : 'Accounts Payable'} account balance is ${money(r.ledgerBalance)}. The difference of ${money(r.ledgerBalance - r.totals.total)} comes from history imported from QuickBooks or journal entries rather than ${kind === 'ar' ? 'invoices' : 'bills'} entered here.</p>` : ''}`;
  } else {
    const vend = kind === 'spend';
    const rows = await capi('GET', `/reports/bycontact?kind=${vend ? 'vendor' : 'customer'}&from=${from}&to=${to}`);
    const total = rows.reduce((s, r) => s + r.amount, 0);
    csv = [[vend ? 'Vendor' : 'Customer', 'Amount'], ...rows.map((r) => [r.name, (r.amount / 100).toFixed(2)])];
    html = head(vend ? 'Expenses by Vendor' : 'Sales by Customer', `${fmtDate(from)} – ${fmtDate(to)}`) + `<table><tbody>${rows.map((r) => `<tr ${r.contact_id ? `class="click" data-href="#/contact/${r.contact_id}"` : ''}><td>${esc(r.name)}</td>${moneyCell(r.amount)}</tr>`).join('') || '<tr><td class="empty">Nothing in this period.</td></tr>'}
      <tr class="grand"><td>Total</td>${moneyCell(total)}</tr></tbody></table>`;
  }
  $('#rep').innerHTML = html;
  bindRowLinks($('#rep'));
  $('#csv').onclick = () => downloadCSV(`${REPORTS.find((r) => r[0] === kind)[1]}.csv`, csv);
};

// ----- QuickBooks import -----
PAGES.import = async () => {
  const batches = await capi('GET', '/import/batches');
  title('Import from QuickBooks');
  const step = (n, t, body) => `<div class="panel" style="margin-bottom:14px"><h2>${n}. ${t}</h2>${body}</div>`;
  page().innerHTML = `<div class="alert ok">Bring your history over, then cancel QuickBooks. Do the steps in order. Every journal import can be undone below.</div>
    ${step(1, 'Chart of accounts', `<p class="muted small"><b>QuickBooks Online:</b> Settings ⚙ → Chart of accounts → Run report → Export → Export to Excel, then open it and <i>Save As CSV</i>.<br><b>QuickBooks Desktop:</b> Reports → Accountant &amp; Taxes → Account Listing → Excel → Create new worksheet → save as CSV.</p>
      <div class="row"><input type="file" id="f-acc" accept=".csv,.txt"><button class="btn primary" data-imp="qb-accounts" data-file="f-acc">Import accounts</button></div>`)}
    ${step(2, 'Customers and vendors', `<p class="muted small"><b>Online:</b> Sales → Customers → Export (the Excel icon), and Expenses → Vendors → Export. <b>Desktop:</b> Customer Center / Vendor Center → Excel → Export Customer/Vendor List. Save each as CSV.</p>
      <div class="row"><input type="file" id="f-cust" accept=".csv,.txt"><button class="btn primary" data-imp="qb-contacts" data-kind="customer" data-file="f-cust">Import customers</button></div>
      <div class="row" style="margin-top:8px"><input type="file" id="f-vend" accept=".csv,.txt"><button class="btn primary" data-imp="qb-contacts" data-kind="vendor" data-file="f-vend">Import vendors</button></div>`)}
    ${step(3, 'Transaction history', `<p class="muted small"><b>Online:</b> Reports → search “Journal” → Report period <b>All Dates</b> (or the years you want) → Run report → Export to Excel → Save As CSV.<br>
      <b>Desktop:</b> Reports → Accountant &amp; Taxes → Journal → Dates: All → Excel → save as CSV.<br>
      Each QuickBooks transaction comes in as one balanced entry, so your Profit &amp; Loss and Balance Sheet will match QuickBooks. Big files are fine; split by year if your export is huge.</p>
      <div class="row"><input type="file" id="f-jnl" accept=".csv,.txt"><label class="check"><input type="checkbox" id="dmy"> Dates are day/month/year</label><button class="btn primary" data-imp="qb-journal" data-file="f-jnl">Import transactions</button></div>`)}
    ${step(4, 'Check it', `<p class="muted small">Compare <a href="#/reports/bs">Balance Sheet</a> and <a href="#/reports/pnl">Profit &amp; Loss</a> with the same reports in QuickBooks. Look at <a href="#/accounts">Chart of accounts</a> for anything marked “Created by QuickBooks import – check the type”. Then set a <a href="#/settings">closing date</a> so the imported history can't be changed by accident.</p>
      <p class="muted small">Open invoices and bills come over as balances on each customer/vendor (see the A/R and A/P aging reports). For new invoices from now on, use the Invoices page.</p>`)}
    <div id="result"></div>
    <div class="panel flush"><h2>Import history</h2><div class="table-wrap"><table><thead><tr><th>When</th><th>Type</th><th>File</th><th>Result</th><th></th></tr></thead><tbody>
    ${batches.map((b) => `<tr><td class="small">${esc(b.created_at)}</td><td>${esc({ bank: 'Bank file', qb_journal: 'QB transactions', qb_accounts: 'QB accounts', qb_contacts: 'QB contacts' }[b.kind])}</td><td>${esc(b.filename)}</td><td class="small">${esc(b.summary)}</td><td class="num">${['bank', 'qb_journal'].includes(b.kind) ? `<button class="btn sm danger" data-undo="${b.id}">Undo</button>` : ''}</td></tr>`).join('') || '<tr><td colspan="5" class="empty">Nothing imported yet.</td></tr>'}
    </tbody></table></div></div>`;
  $$('[data-imp]').forEach((b) => (b.onclick = run(async () => {
    const f = await readFile($('#' + b.dataset.file));
    b.disabled = true; const label = b.textContent; b.textContent = 'Importing…';
    try {
      const r = await capi('POST', `/import/${b.dataset.imp}`, { filename: f.name, text: f.text, kind: b.dataset.kind, dmy: $('#dmy').checked });
      await loadMeta();
      $('#result').innerHTML = `<div class="alert ok"><b>Done:</b> ${esc(r.summary)}${r.problems?.length ? `<br>Skipped (not balanced):<br>${r.problems.map(esc).join('<br>')}` : ''}${r.newAccounts?.length ? `<br>New accounts created (check their types in Chart of accounts): ${r.newAccounts.map((a) => esc(a.name)).join(', ')}` : ''}</div>`;
      toast('Imported');
      setTimeout(() => PAGES.import().then(() => {}), 0);
    } finally { b.disabled = false; b.textContent = label; }
  })));
  $$('[data-undo]').forEach((b) => (b.onclick = run(async () => { if (await confirmBox('Remove everything this import added?', 'Undo import')) { await capi('DELETE', `/import/batches/${b.dataset.undo}`); toast('Import undone'); route(); } })));
};

// ----- settings -----
PAGES.settings = async () => {
  const co = await capi('GET', '');
  const st = await api('GET', '/api/settings');
  title('Settings');
  page().innerHTML = `<div class="grid two">
    <form class="panel" id="co"><h2>Business</h2><div class="form">${companyFields(co)}
      <label>Next invoice no.<input type="number" name="next_invoice_no" value="${co.next_invoice_no}"></label>
      <label>Invoice terms (days)<input type="number" name="invoice_terms_days" value="${co.invoice_terms_days}"></label>
      <label class="wide">Invoice footer<input name="invoice_footer" value="${esc(co.invoice_footer)}"></label>
      <label class="wide">Closing date (no changes on or before)<input type="date" name="closing_date" value="${co.closing_date || ''}"></label></div>
      <div class="actions"><button class="btn primary">Save</button></div></form>
    <div>
      <div class="panel" style="margin-bottom:14px"><h2>Backups</h2><p class="muted small">A copy is saved automatically every day (last 30 kept) in <code>${esc(st.dataDir)}/backups</code>. Download one to keep somewhere safe, like a USB drive or cloud folder.</p>
        <a class="btn primary" href="/api/backup">Download backup now</a></div>
      <form class="panel" id="ai" style="margin-bottom:14px"><h2>✨ AI categorizing (optional)</h2>
        <p class="muted small">Rules and your history categorize most bank lines for free. For the rest, Claude can suggest categories. You need your own Anthropic API key from console.anthropic.com; it typically costs pennies a month.
        Status: <b>${st.ai.enabled ? 'on' : !st.ai.sdkInstalled ? 'not installed (run npm install)' : 'no key'}</b></p>
        <label>Anthropic API key<input name="anthropic_key" type="password" placeholder="${st.ai.hasKey ? '•••••••• (saved)' : 'sk-ant-…'}" autocomplete="off"></label>
        <div class="actions"><button type="button" class="btn" id="ai-clear">Remove key</button><button class="btn primary">Save key</button></div></form>
      <form class="panel" id="pw" style="margin-bottom:14px"><h2>Password</h2><div class="form">
        <label>Current<input type="password" name="current" required autocomplete="current-password"></label>
        <label>New<input type="password" name="password" required minlength="6" autocomplete="new-password"></label></div>
        <div class="actions"><button class="btn primary">Change password</button></div></form>
      <form class="panel" id="delco"><h2>Delete this business</h2><p class="muted small">Permanently deletes <b>${esc(co.name)}</b> and all its data. Download a backup first.</p>
        <label>Type the business name to confirm<input name="confirm" autocomplete="off"></label>
        <div class="actions"><button class="btn danger">Delete business</button></div></form>
    </div></div>`;
  $('#co').onsubmit = run(async (e) => { e.preventDefault(); await capi('PUT', '', formData(e.target)); toast('Saved'); route(); });
  $('#ai').onsubmit = run(async (e) => { e.preventDefault(); const d = formData(e.target); if (!d.anthropic_key) throw new Error('Paste a key first'); await api('PUT', '/api/settings', d); toast('Key saved'); route(); });
  $('#ai-clear').onclick = run(async () => { await api('PUT', '/api/settings', { anthropic_key: '' }); toast('Key removed'); route(); });
  $('#pw').onsubmit = run(async (e) => { e.preventDefault(); await api('POST', '/api/auth/password', formData(e.target)); toast('Password changed'); e.target.reset(); });
  $('#delco').onsubmit = run(async (e) => {
    e.preventDefault();
    if (!(await confirmBox(`Really delete ${co.name} and everything in it?`))) return;
    await capi('DELETE', '', formData(e.target)); S.cid = null; localStorage.removeItem('cid'); toast('Deleted'); go('#/dashboard');
  });
};

route();
