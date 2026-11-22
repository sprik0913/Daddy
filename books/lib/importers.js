'use strict';
// File importers: bank CSV / OFX / QFX, and QuickBooks exports (chart of accounts, customers/vendors, journal).
const L = require('./ledger');
const { tx } = require('./db');

// ---------- CSV ----------
function parseCSV(text) {
  text = String(text).replace(/^﻿/, '');
  // Tab-separated if the first line has tabs and no commas.
  const first = text.split(/\r?\n/, 1)[0] || '';
  const sep = first.includes('\t') && !first.includes(',') ? '\t' : ',';
  const rows = [];
  let row = [], field = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) {
      if (ch === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else q = false; }
      else field += ch;
    } else if (ch === '"') q = true;
    else if (ch === sep) { row.push(field); field = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(field); rows.push(row); row = []; field = '';
    } else field += ch;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  return rows.map((r) => r.map((c) => c.trim())).filter((r) => r.some((c) => c !== ''));
}

const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9#]/g, '');

// Accepts 2024-01-31, 01/31/2024, 1/31/24, 31.01.2024 (with dmy option), 20240131, Jan 31 2024.
function parseDate(s, dmy = false) {
  s = String(s || '').trim();
  let m;
  if ((m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/))) return iso(m[1], m[2], m[3]);
  if ((m = s.match(/^(\d{4})(\d{2})(\d{2})/))) return iso(m[1], m[2], m[3]);
  if ((m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})/))) {
    let y = Number(m[3]); if (y < 100) y += y > 70 ? 1900 : 2000;
    return dmy ? iso(y, m[2], m[1]) : iso(y, m[1], m[2]);
  }
  const t = Date.parse(s);
  if (!Number.isNaN(t) && /[a-z]/i.test(s)) return new Date(t - new Date(t).getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  return null;
}
function iso(y, mo, d) {
  y = Number(y); mo = Number(mo); d = Number(d);
  if (!(mo >= 1 && mo <= 12 && d >= 1 && d <= 31 && y > 1900)) return null;
  return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

// ---------- bank files ----------
function findCol(header, names) {
  const h = header.map(norm);
  for (const n of names) { const i = h.indexOf(norm(n)); if (i >= 0) return i; }
  for (const n of names) { const i = h.findIndex((x) => x.includes(norm(n))); if (i >= 0) return i; }
  return -1;
}

// Returns rows with amount in cents, positive = money into the account (deposit / card payment).
function parseBankCSV(text, opts = {}) {
  const rows = parseCSV(text);
  let hi = rows.findIndex((r) => r.some((c) => /date/i.test(c)) && r.some((c) => /amount|debit|credit|withdraw|deposit/i.test(c)));
  if (hi < 0) throw new L.UserError('Could not find a header row with Date and Amount columns');
  const header = rows[hi];
  const date = findCol(header, ['Posting Date', 'Transaction Date', 'Trans Date', 'Date', 'Posted Date']);
  const desc = findCol(header, ['Description', 'Payee', 'Name', 'Merchant', 'Memo', 'Details', 'Transaction']);
  const memo = findCol(header, ['Memo', 'Extended Description', 'Notes']);
  const amount = findCol(header, ['Amount', 'Transaction Amount']);
  const debit = findCol(header, ['Debit', 'Withdrawal', 'Withdrawals', 'Withdrawal Amount', 'Money Out', 'Charges']);
  const credit = findCol(header, ['Credit', 'Deposit', 'Deposits', 'Deposit Amount', 'Money In', 'Payments']);
  const ref = findCol(header, ['Check Number', 'Check #', 'Reference', 'Ref', 'Transaction ID', 'Check or Slip #']);
  const type = findCol(header, ['Type', 'Details', 'Debit/Credit', 'Transaction Type']);
  if (date < 0) throw new L.UserError('No Date column found');
  if (amount < 0 && debit < 0 && credit < 0) throw new L.UserError('No Amount (or Debit/Credit) column found');
  const out = [];
  for (const r of rows.slice(hi + 1)) {
    const d = parseDate(r[date], opts.dmy);
    if (!d) continue;
    let amt;
    if (amount >= 0 && (debit < 0 || amount !== debit)) {
      amt = L.toCents(r[amount]);
      // Some banks list all amounts positive with a separate Debit/Credit type column.
      if (type >= 0 && amt > 0 && /^(debit|dr|withdrawal|sale|purchase)$/i.test(r[type])) amt = -amt;
    } else {
      amt = Math.abs(L.toCents(r[credit] || 0)) - Math.abs(L.toCents(r[debit] || 0));
    }
    if (opts.flip) amt = -amt;
    if (!amt) continue;
    let description = desc >= 0 ? r[desc] : '';
    if (memo >= 0 && memo !== desc && r[memo] && !description.includes(r[memo])) description = `${description} ${r[memo]}`.trim();
    if (ref >= 0 && r[ref] && /check/i.test(header[ref])) description = `${description} (Check ${r[ref]})`.trim();
    out.push({ date: d, amount: amt, description, fitid: ref >= 0 && !/check/i.test(header[ref]) ? r[ref] : '' });
  }
  return out;
}

// OFX/QFX (Quicken / QuickBooks Web Connect). Handles both SGML and XML flavors.
function parseOFX(text, opts = {}) {
  const out = [];
  const blocks = String(text).split(/<STMTTRN>/i).slice(1);
  const tag = (b, t) => { const m = b.match(new RegExp(`<${t}>([^<\\r\\n]*)`, 'i')); return m ? m[1].trim() : ''; };
  for (const b of blocks) {
    const body = b.split(/<\/STMTTRN>/i)[0];
    const date = parseDate(tag(body, 'DTPOSTED'));
    let amt = L.toCents(tag(body, 'TRNAMT'));
    if (opts.flip) amt = -amt;
    if (!date || !amt) continue;
    const name = decode(tag(body, 'NAME'));
    const memo = decode(tag(body, 'MEMO'));
    const check = tag(body, 'CHECKNUM');
    let description = name && memo && !name.includes(memo) && !memo.includes(name) ? `${name} ${memo}` : (name || memo);
    if (check) description = `${description} (Check ${check})`.trim();
    out.push({ date, amount: amt, description, fitid: tag(body, 'FITID') });
  }
  if (!out.length && !blocks.length) throw new L.UserError('No transactions found in this OFX/QFX file');
  return out;
}
const decode = (s) => s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&apos;/g, "'").replace(/&quot;/g, '"');

function parseBankFile(name, text, opts) {
  if (/<OFX>|OFXHEADER/i.test(text) || /\.(ofx|qfx|qbo)$/i.test(name || '')) return parseOFX(text, opts);
  return parseBankCSV(text, opts);
}

// ---------- QuickBooks: chart of accounts ----------
// QuickBooks Online: Settings > Chart of accounts > Run report > Export to CSV/Excel (save as CSV).
// QuickBooks Desktop: Reports > Accountant & Taxes > Account Listing > Excel > CSV.
const QB_TYPES = [
  [/^bank|cash/i, 'bank'],
  [/receivable|a\/r/i, 'ar'],
  [/other current asset|current asset/i, 'current_asset'],
  [/fixed asset|property, plant/i, 'fixed_asset'],
  [/other asset/i, 'other_asset'],
  [/payable|a\/p/i, 'ap'],
  [/credit card/i, 'credit_card'],
  [/long.?term liab/i, 'long_term_liability'],
  [/liabilit/i, 'current_liability'],
  [/equity/i, 'equity'],
  [/other income/i, 'other_income'],
  [/income|revenue/i, 'income'],
  [/cost of (goods|sales)|cogs/i, 'cogs'],
  [/other expense/i, 'other_expense'],
  [/expense/i, 'expense'],
];
function mapQBType(t) {
  for (const [re, sub] of QB_TYPES) if (re.test(t || '')) return sub;
  return null;
}

// Guess an account type from its name, for accounts that appear in a journal but not in the chart.
function guessSubtype(name, qbTxnType) {
  const n = name.toLowerCase();
  if (/receivable/.test(n)) return 'ar';
  if (/payable/.test(n) && !/payroll|tax/.test(n)) return 'ap';
  if (/checking|savings|bank|cash|undeposited|petty/.test(n)) return /undeposited/.test(n) ? 'current_asset' : 'bank';
  if (/credit card|visa|mastercard|amex|american express|discover/.test(n)) return 'credit_card';
  if (/loan|note payable|mortgage|line of credit/.test(n)) return 'long_term_liability';
  if (/tax payable|liabilit|payroll/.test(n) && !/expense/.test(n)) return 'current_liability';
  if (/equity|draw|capital|retained|distribution|contribution/.test(n)) return 'equity';
  if (/equipment|vehicle|truck|machinery|furniture|building|depreciation/.test(n) && !/rent|repair|expense/.test(n)) return 'fixed_asset';
  if (/inventory/.test(n)) return 'current_asset';
  if (/cost of goods|cogs|materials|subcontract|job (cost|materials)/.test(n)) return 'cogs';
  if (/interest income|other income/.test(n)) return 'other_income';
  if (/sales|income|revenue|service|fees earned/.test(n) && !/tax/.test(n)) return 'income';
  if (/deposit|sales receipt|invoice/i.test(qbTxnType || '') && /sales|service/.test(n)) return 'income';
  return 'expense';
}

function importQBAccounts(db, cid, text, filename) {
  const rows = parseCSV(text);
  const hi = rows.findIndex((r) => r.some((c) => /^(full name|account|name)$/i.test(c)) && r.some((c) => /type/i.test(c)));
  if (hi < 0) throw new L.UserError('Could not find the Account and Type columns. Export the Account List report from QuickBooks as CSV.');
  const h = rows[hi];
  const nameI = findCol(h, ['Full name', 'Account', 'Name']);
  const typeI = findCol(h, ['Account type', 'Type']);
  const detailI = findCol(h, ['Detail type', 'Detail Type']);
  const descI = findCol(h, ['Description']);
  const numI = findCol(h, ['Account #', 'Number', 'Account Number', 'Acct #', 'Code']);
  return tx(db, () => {
    let added = 0, updated = 0, skipped = 0;
    for (const r of rows.slice(hi + 1)) {
      let name = (r[nameI] || '').trim();
      if (!name || /^total/i.test(name)) { skipped++; continue; }
      let code = numI >= 0 ? r[numI] || '' : '';
      // Desktop puts "1000 · Checking" in one cell.
      const m = name.match(/^(\d+)\s*[·\-]\s*(.+)$/);
      if (m && !code) { code = m[1]; name = m[2]; }
      name = name.replace(/\s*:\s*/g, ':');
      const sub = mapQBType(r[typeI]) || (detailI >= 0 ? mapQBType(r[detailI]) : null) || guessSubtype(name);
      const ex = db.prepare('SELECT * FROM accounts WHERE company_id=? AND name=?').get(cid, name);
      if (ex) {
        if (!ex.system_key || L.TYPES[sub] === ex.type) {
          db.prepare('UPDATE accounts SET code=COALESCE(NULLIF(?, \'\'), code), type=?, subtype=?, description=COALESCE(NULLIF(?, \'\'), description) WHERE id=?')
            .run(code, ex.system_key ? ex.type : L.TYPES[sub], ex.system_key ? ex.subtype : sub, descI >= 0 ? r[descI] || '' : '', ex.id);
        }
        updated++;
      } else {
        db.prepare('INSERT INTO accounts (company_id, code, name, type, subtype, description) VALUES (?,?,?,?,?,?)')
          .run(cid, code, name, L.TYPES[sub], sub, descI >= 0 ? r[descI] || '' : '');
        added++;
        // Adopt QuickBooks' own A/R, A/P, sales tax etc. as the built-in accounts when ours are unused.
        adoptSystem(db, cid, name, sub);
      }
    }
    const summary = `${added} accounts added, ${updated} updated`;
    db.prepare("INSERT INTO import_batches (company_id, kind, filename, summary) VALUES (?, 'qb_accounts', ?, ?)").run(cid, filename || '', summary);
    return { added, updated, skipped, summary };
  });
}

function adoptSystem(db, cid, name, sub) {
  const n = name.toLowerCase();
  let key = null;
  if (sub === 'ar' && /receivable/.test(n)) key = 'ar';
  else if (sub === 'ap' && /payable/.test(n)) key = 'ap';
  else if (/sales tax payable|sales tax agency/.test(n)) key = 'sales_tax';
  else if (/^retained earnings$/.test(n)) key = 'retained_earnings';
  else if (/^opening bal(ance)? equity$/.test(n)) key = 'opening_balance';
  else if (/^uncategori[sz]ed income$/.test(n)) key = 'uncategorized_income';
  else if (/^uncategori[sz]ed expense$/.test(n)) key = 'uncategorized_expense';
  else if (/^undeposited funds$/.test(n)) key = 'undeposited';
  if (!key) return;
  const cur = db.prepare('SELECT * FROM accounts WHERE company_id=? AND system_key=?').get(cid, key);
  const target = db.prepare('SELECT * FROM accounts WHERE company_id=? AND name=?').get(cid, name);
  if (cur && cur.id === target.id) return;
  if (cur) {
    const used = db.prepare('SELECT COUNT(*) n FROM lines WHERE account_id=?').get(cur.id).n
      + db.prepare('SELECT COUNT(*) n FROM invoice_lines WHERE account_id=?').get(cur.id).n
      + db.prepare('SELECT COUNT(*) n FROM bill_lines WHERE account_id=?').get(cur.id).n;
    if (used) return;
    db.prepare('DELETE FROM accounts WHERE id=?').run(cur.id);
  }
  db.prepare('UPDATE accounts SET system_key=? WHERE id=?').run(key, target.id);
}

// ---------- QuickBooks: customers & vendors ----------
function importQBContacts(db, cid, kind, text, filename) {
  const rows = parseCSV(text);
  const hi = rows.findIndex((r) => r.some((c) => /^(customer|vendor|name|display name|full name|company)/i.test(c)));
  if (hi < 0) throw new L.UserError('Could not find a Name column');
  const h = rows[hi];
  const nameI = findCol(h, [kind === 'vendor' ? 'Vendor' : 'Customer', 'Display Name', 'Name', 'Full Name', 'Company']);
  const emailI = findCol(h, ['Email', 'Main Email', 'E-mail']);
  const phoneI = findCol(h, ['Phone', 'Phone Numbers', 'Main Phone', 'Mobile']);
  const addrI = findCol(h, ['Billing Address', 'Bill to', 'Address', 'Street']);
  const cityI = findCol(h, ['City', 'Billing City']);
  const stateI = findCol(h, ['State', 'Billing State']);
  const zipI = findCol(h, ['Zip', 'Postal Code', 'ZIP Code']);
  return tx(db, () => {
    let added = 0, updated = 0;
    for (const r of rows.slice(hi + 1)) {
      const name = (r[nameI] || '').trim();
      if (!name || /^total/i.test(name)) continue;
      let address = addrI >= 0 ? r[addrI] || '' : '';
      const cityLine = [cityI >= 0 ? r[cityI] : '', [stateI >= 0 ? r[stateI] : '', zipI >= 0 ? r[zipI] : ''].filter(Boolean).join(' ')].filter(Boolean).join(', ');
      if (cityLine && !address.includes(cityLine)) address = [address, cityLine].filter(Boolean).join('\n');
      const ex = db.prepare('SELECT * FROM contacts WHERE company_id=? AND kind=? AND name=?').get(cid, kind, name);
      const data = { kind, name, email: emailI >= 0 ? r[emailI] : '', phone: phoneI >= 0 ? r[phoneI] : '', address };
      if (ex) {
        L.saveContact(db, cid, { ...ex, email: data.email || ex.email, phone: data.phone || ex.phone, address: data.address || ex.address });
        updated++;
      } else { L.saveContact(db, cid, data); added++; }
    }
    const summary = `${added} ${kind}s added, ${updated} updated`;
    db.prepare("INSERT INTO import_batches (company_id, kind, filename, summary) VALUES (?, 'qb_contacts', ?, ?)").run(cid, filename || '', summary);
    return { added, updated, summary };
  });
}

// ---------- QuickBooks: journal (full transaction history) ----------
// QuickBooks Online: Reports > "Journal" > pick the date range (e.g. All Dates) > Export to Excel/CSV.
// QuickBooks Desktop: Reports > Accountant & Taxes > Journal > Excel > CSV.
// Each QuickBooks transaction becomes one balanced entry here.
const CUSTOMER_TYPES = /invoice|payment|sales receipt|credit memo|refund|deposit|estimate|statement charge/i;
const VENDOR_TYPES = /bill|check|expense|purchase|vendor credit|credit card|cash expense/i;

function parseQBJournal(text, opts = {}) {
  const rows = parseCSV(text);
  const hi = rows.findIndex((r) => r.some((c) => /^date$/i.test(c)) && r.some((c) => /^account/i.test(c)) && r.some((c) => /debit/i.test(c)));
  if (hi < 0) throw new L.UserError('Could not find the Date / Account / Debit / Credit columns. Export the Journal report from QuickBooks as CSV.');
  const h = rows[hi];
  const col = (...n) => findCol(h, n);
  const C = {
    trans: col('Trans #', 'Transaction ID', 'Trans no'), date: col('Date', 'Transaction date'), type: col('Transaction Type', 'Type'),
    num: col('Num', 'No.', 'Number', 'Ref no'), name: col('Name'), memo: col('Memo/Description', 'Memo', 'Description'),
    account: col('Account', 'Account full name', 'Account name', 'Split'), debit: col('Debit'), credit: col('Credit'),
  };
  const txns = [];
  let cur = null, lastTrans = null;
  const flush = () => { if (cur && cur.lines.length) txns.push(cur); cur = null; };
  for (const r of rows.slice(hi + 1)) {
    const get = (k) => (C[k] >= 0 ? (r[C[k]] || '').trim() : '');
    const account = get('account').replace(/^\d+\s*·\s*/, '').replace(/\s*:\s*/g, ':');
    const dateCell = get('date');
    const trans = get('trans');
    const startsNew = (C.trans >= 0 && trans && trans !== lastTrans) || (C.trans < 0 && dateCell);
    if (startsNew) {
      flush();
      const date = parseDate(dateCell, opts.dmy);
      if (!date) continue;
      cur = { date, type: get('type'), num: get('num'), name: get('name'), memo: get('memo'), lines: [] };
      lastTrans = trans || null;
    }
    if (!cur) continue;
    if (!account) {
      // Subtotal row (blank account) closes a transaction in QuickBooks Online exports.
      if ((get('debit') || get('credit')) && C.trans < 0) flush();
      continue;
    }
    if (/^total/i.test(account)) continue;
    const amt = L.toCents(get('debit')) - L.toCents(get('credit'));
    if (!amt) continue;
    cur.lines.push({ account, amount: amt, name: get('name') || cur.name, memo: get('memo') });
    if (!cur.name && get('name')) cur.name = get('name');
    if (!cur.type && get('type')) cur.type = get('type');
  }
  flush();
  return txns;
}

function importQBJournal(db, cid, text, filename, opts = {}) {
  const txns = parseQBJournal(text, opts);
  if (!txns.length) throw new L.UserError('No transactions found in this file');
  return tx(db, () => {
    const batch = Number(db.prepare("INSERT INTO import_batches (company_id, kind, filename) VALUES (?, 'qb_journal', ?)").run(cid, filename || '').lastInsertRowid);
    const accountCache = new Map();
    const newAccounts = [];
    const acctId = (name, type) => {
      if (accountCache.has(name)) return accountCache.get(name);
      let a = db.prepare('SELECT id FROM accounts WHERE company_id=? AND name=?').get(cid, name);
      if (!a) {
        // QuickBooks names the built-in ones a bit differently.
        const alias = { 'accounts receivable (a/r)': 'ar', 'accounts receivable': 'ar', 'accounts payable (a/p)': 'ap', 'accounts payable': 'ap' }[name.toLowerCase()];
        if (alias) a = L.systemAccount(db, cid, alias);
      }
      if (!a) {
        const sub = guessSubtype(name, type);
        const id = Number(db.prepare('INSERT INTO accounts (company_id, name, type, subtype, description) VALUES (?,?,?,?,?)')
          .run(cid, name, L.TYPES[sub], sub, 'Created by QuickBooks import - check the type').lastInsertRowid);
        newAccounts.push({ name, subtype: sub });
        adoptSystem(db, cid, name, sub);
        a = { id };
      }
      accountCache.set(name, a.id);
      return a.id;
    };
    let imported = 0, unbalanced = 0;
    const problems = [];
    let minDate = null, maxDate = null;
    for (const t of txns) {
      const sum = t.lines.reduce((s, l) => s + l.amount, 0);
      if (sum !== 0) { unbalanced++; if (problems.length < 20) problems.push(`${t.date} ${t.type} ${t.num} is off by ${(sum / 100).toFixed(2)}`); continue; }
      const kind = CUSTOMER_TYPES.test(t.type) ? 'customer' : VENDOR_TYPES.test(t.type) ? 'vendor' : null;
      const contactFor = (name) => {
        if (!name) return null;
        if (kind) return L.findOrCreateContact(db, cid, kind, name);
        const ex = db.prepare('SELECT id FROM contacts WHERE company_id=? AND name=? ORDER BY kind').get(cid, name);
        return ex ? ex.id : null;
      };
      const lines = t.lines.map((l) => {
        const account_id = acctId(l.account, t.type);
        const a = db.prepare('SELECT system_key FROM accounts WHERE id=?').get(account_id);
        // A/R lines belong to customers and A/P lines to vendors, whatever the transaction type.
        let contact_id = null;
        if (a.system_key === 'ar') contact_id = L.findOrCreateContact(db, cid, 'customer', l.name);
        else if (a.system_key === 'ap') contact_id = L.findOrCreateContact(db, cid, 'vendor', l.name);
        else contact_id = contactFor(l.name);
        return { account_id, amount: l.amount, memo: l.memo, contact_id };
      });
      L.insertEntry(db, cid, {
        date: t.date, memo: [t.type, t.memo].filter(Boolean).join(' - ') || 'QuickBooks import', ref: t.num, source: 'qb_import',
        contact_id: contactFor(t.name), import_batch: batch, lines,
      });
      imported++;
      if (!minDate || t.date < minDate) minDate = t.date;
      if (!maxDate || t.date > maxDate) maxDate = t.date;
    }
    const summary = `${imported} transactions (${minDate || '-'} to ${maxDate || '-'}), ${newAccounts.length} new accounts, ${unbalanced} skipped as unbalanced`;
    db.prepare('UPDATE import_batches SET summary=? WHERE id=?').run(summary, batch);
    return { batch, imported, unbalanced, problems, newAccounts, summary };
  });
}

function listBatches(db, cid) {
  return db.prepare(`SELECT b.*, (SELECT COUNT(*) FROM entries WHERE import_batch=b.id) entries,
      (SELECT COUNT(*) FROM bank_txns WHERE import_batch=b.id) bank_lines
    FROM import_batches b WHERE b.company_id=? ORDER BY b.id DESC`).all(cid);
}

// Remove everything an import created (QuickBooks journal entries, or imported bank lines still in review).
function undoBatch(db, cid, id) {
  const b = db.prepare('SELECT * FROM import_batches WHERE id=? AND company_id=?').get(Number(id), cid);
  if (!b) throw new L.UserError('Import not found');
  return tx(db, () => {
    if (b.kind === 'qb_journal') {
      const rec = db.prepare('SELECT COUNT(*) n FROM lines l JOIN entries e ON e.id=l.entry_id WHERE e.import_batch=? AND l.cleared=2').get(b.id).n;
      if (rec) throw new L.UserError('Some of these transactions are reconciled. Undo those reconciliations first.');
      const c = getClosing(db, cid);
      if (c && db.prepare('SELECT 1 FROM entries WHERE import_batch=? AND date<=?').get(b.id, c)) throw new L.UserError(`The books are closed through ${c}`);
      db.prepare("UPDATE bank_txns SET status='new', entry_id=NULL WHERE entry_id IN (SELECT id FROM entries WHERE import_batch=?)").run(b.id);
      db.prepare('DELETE FROM entries WHERE import_batch=?').run(b.id);
    } else if (b.kind === 'bank') {
      const posted = db.prepare("SELECT COUNT(*) n FROM bank_txns WHERE import_batch=? AND status='posted'").get(b.id).n;
      if (posted) throw new L.UserError(`${posted} of these lines are already categorized. Undo them on the Banking page first.`);
      db.prepare('DELETE FROM bank_txns WHERE import_batch=?').run(b.id);
    } else {
      throw new L.UserError('Accounts and contacts imports cannot be undone automatically (edit or delete them directly).');
    }
    db.prepare('DELETE FROM import_batches WHERE id=?').run(b.id);
  });
}
const getClosing = (db, cid) => db.prepare('SELECT closing_date FROM companies WHERE id=?').get(cid).closing_date;

module.exports = { parseCSV, parseDate, parseBankCSV, parseOFX, parseBankFile, importQBAccounts, importQBContacts, parseQBJournal, importQBJournal, listBatches, undoBatch, guessSubtype };
