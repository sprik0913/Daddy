'use strict';
// Double-entry bookkeeping core. All money is integer cents.
// Every invoice, bill, payment and bank transaction becomes a balanced journal entry,
// so the reports are always computed from one source of truth: the `lines` table.
const { tx } = require('./db');

class UserError extends Error {
  constructor(msg) { super(msg); this.status = 400; }
}
const fail = (msg) => { throw new UserError(msg); };

// ---------- helpers ----------
function toCents(v) {
  if (v === null || v === undefined || v === '') return 0;
  if (typeof v === 'number') return Math.round(v * 100);
  let s = String(v).trim();
  let neg = false;
  if (/^\(.*\)$/.test(s)) { neg = true; s = s.slice(1, -1); }
  s = s.replace(/[$,\s]/g, '');
  if (s.endsWith('-')) { neg = !neg; s = s.slice(0, -1); }
  if (s.startsWith('-')) { neg = !neg; s = s.slice(1); }
  if (s.startsWith('+')) s = s.slice(1);
  if (s === '') return 0;
  const n = Number(s);
  if (!Number.isFinite(n)) fail(`Not a number: ${v}`);
  const c = Math.round(n * 100);
  return neg ? -c : c;
}
const isDate = (d) => typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d);
const today = () => new Date().toISOString().slice(0, 10);
function addDays(date, n) {
  const d = new Date(date + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
function daysBetween(a, b) {
  return Math.round((new Date(b + 'T00:00:00Z') - new Date(a + 'T00:00:00Z')) / 86400000);
}
const DEBIT_NORMAL = new Set(['asset', 'expense']);
// Natural (displayed) balance: debits positive for assets/expenses, credits positive otherwise.
const natural = (type, raw) => (raw === 0 ? 0 : DEBIT_NORMAL.has(type) ? raw : -raw);

const TYPES = {
  bank: 'asset', ar: 'asset', current_asset: 'asset', fixed_asset: 'asset', other_asset: 'asset',
  credit_card: 'liability', ap: 'liability', current_liability: 'liability', long_term_liability: 'liability',
  equity: 'equity',
  income: 'income', other_income: 'income',
  cogs: 'expense', expense: 'expense', other_expense: 'expense',
};
const SUBTYPE_LABELS = {
  bank: 'Bank', ar: 'Accounts receivable', current_asset: 'Other current asset', fixed_asset: 'Fixed asset',
  other_asset: 'Other asset', credit_card: 'Credit card', ap: 'Accounts payable',
  current_liability: 'Other current liability', long_term_liability: 'Long-term liability', equity: 'Equity',
  income: 'Income', other_income: 'Other income', cogs: 'Cost of goods sold', expense: 'Expense',
  other_expense: 'Other expense',
};

// ---------- companies & chart of accounts ----------
const DEFAULT_ACCOUNTS = [
  ['1000', 'Checking', 'bank'],
  ['1010', 'Savings', 'bank'],
  ['1100', 'Accounts Receivable', 'ar', 'ar'],
  ['1200', 'Inventory', 'current_asset'],
  ['1300', 'Undeposited Funds', 'current_asset', 'undeposited'],
  ['1500', 'Machinery & Equipment', 'fixed_asset'],
  ['1510', 'Vehicles', 'fixed_asset'],
  ['1590', 'Accumulated Depreciation', 'fixed_asset'],
  ['2000', 'Accounts Payable', 'ap', 'ap'],
  ['2100', 'Credit Card', 'credit_card'],
  ['2200', 'Sales Tax Payable', 'current_liability', 'sales_tax'],
  ['2300', 'Payroll Liabilities', 'current_liability'],
  ['2500', 'Loans Payable', 'long_term_liability'],
  ['3000', 'Owner Equity', 'equity'],
  ['3100', 'Owner Draws', 'equity'],
  ['3200', 'Opening Balance Equity', 'equity', 'opening_balance'],
  ['3900', 'Retained Earnings', 'equity', 'retained_earnings'],
  ['4000', 'Sales', 'income'],
  ['4100', 'Fabrication Services', 'income'],
  ['4200', 'Installation Services', 'income'],
  ['4900', 'Uncategorized Income', 'income', 'uncategorized_income'],
  ['4950', 'Interest Income', 'other_income'],
  ['5000', 'Materials & Steel', 'cogs'],
  ['5100', 'Subcontractors', 'cogs'],
  ['5200', 'Shop Supplies & Consumables', 'cogs'],
  ['5300', 'Freight & Delivery', 'cogs'],
  ['6000', 'Advertising & Marketing', 'expense'],
  ['6050', 'Bank & Card Fees', 'expense'],
  ['6100', 'Fuel & Vehicle', 'expense'],
  ['6150', 'Insurance', 'expense'],
  ['6200', 'Office Supplies & Software', 'expense'],
  ['6250', 'Professional Fees', 'expense'],
  ['6300', 'Rent', 'expense'],
  ['6350', 'Repairs & Maintenance', 'expense'],
  ['6400', 'Small Tools & Equipment', 'expense'],
  ['6450', 'Telephone & Internet', 'expense'],
  ['6500', 'Utilities', 'expense'],
  ['6550', 'Meals', 'expense'],
  ['6600', 'Travel', 'expense'],
  ['6650', 'Wages', 'expense'],
  ['6700', 'Payroll Taxes', 'expense'],
  ['6750', 'Taxes & Licenses', 'expense'],
  ['6800', 'Depreciation', 'expense'],
  ['6990', 'Uncategorized Expense', 'expense', 'uncategorized_expense'],
  ['7000', 'Interest Expense', 'other_expense'],
];
// Accounts every company must have; recreated if missing (e.g. after a QuickBooks chart import).
const REQUIRED = DEFAULT_ACCOUNTS.filter((a) => a[3]);

function createCompany(db, data) {
  const name = (data.name || '').trim() || fail('Company name is required');
  return tx(db, () => {
    const r = db.prepare(`INSERT INTO companies (name, address, email, phone, sales_tax_rate, fiscal_year_start)
      VALUES (?,?,?,?,?,?)`).run(name, data.address || '', data.email || '', data.phone || '',
      Number(data.sales_tax_rate) || 0, Number(data.fiscal_year_start) || 1);
    const cid = Number(r.lastInsertRowid);
    const accounts = data.blank ? REQUIRED : DEFAULT_ACCOUNTS;
    const ins = db.prepare('INSERT INTO accounts (company_id, code, name, type, subtype, system_key) VALUES (?,?,?,?,?,?)');
    for (const [code, nm, sub, key] of accounts) ins.run(cid, code, nm, TYPES[sub], sub, key || null);
    return cid;
  });
}

function updateCompany(db, cid, d) {
  const c = getCompany(db, cid);
  const closing = d.closing_date === undefined ? c.closing_date : (d.closing_date || null);
  if (closing && !isDate(closing)) fail('Closing date must be YYYY-MM-DD');
  db.prepare(`UPDATE companies SET name=?, address=?, email=?, phone=?, sales_tax_rate=?, fiscal_year_start=?,
    next_invoice_no=?, closing_date=?, invoice_terms_days=?, invoice_footer=? WHERE id=?`).run(
    (d.name ?? c.name).trim() || fail('Company name is required'), d.address ?? c.address, d.email ?? c.email,
    d.phone ?? c.phone, Number(d.sales_tax_rate ?? c.sales_tax_rate) || 0,
    Math.min(12, Math.max(1, Number(d.fiscal_year_start ?? c.fiscal_year_start) || 1)),
    Number(d.next_invoice_no ?? c.next_invoice_no) || 1001, closing,
    Number(d.invoice_terms_days ?? c.invoice_terms_days) || 0, d.invoice_footer ?? c.invoice_footer, cid);
  return getCompany(db, cid);
}

function getCompany(db, cid) {
  return db.prepare('SELECT * FROM companies WHERE id=?').get(cid) || fail('Company not found');
}

function systemAccount(db, cid, key) {
  let a = db.prepare('SELECT * FROM accounts WHERE company_id=? AND system_key=?').get(cid, key);
  if (!a) {
    const def = REQUIRED.find((r) => r[3] === key) || fail(`Unknown system account ${key}`);
    let name = def[1];
    if (db.prepare('SELECT 1 FROM accounts WHERE company_id=? AND name=?').get(cid, name)) {
      // An account with this name exists (e.g. imported from QuickBooks) – adopt it.
      db.prepare('UPDATE accounts SET system_key=? WHERE company_id=? AND name=?').run(key, cid, name);
    } else {
      db.prepare('INSERT INTO accounts (company_id, code, name, type, subtype, system_key) VALUES (?,?,?,?,?,?)')
        .run(cid, def[0], name, TYPES[def[2]], def[2], key);
    }
    a = db.prepare('SELECT * FROM accounts WHERE company_id=? AND system_key=?').get(cid, key);
  }
  return a;
}

function getAccount(db, cid, id) {
  return db.prepare('SELECT * FROM accounts WHERE id=? AND company_id=?').get(Number(id), cid) || fail('Account not found');
}

function saveAccount(db, cid, d) {
  const name = (d.name || '').trim() || fail('Account name is required');
  const subtype = d.subtype;
  if (!TYPES[subtype]) fail('Pick an account type');
  const dupe = db.prepare('SELECT id FROM accounts WHERE company_id=? AND name=?').get(cid, name);
  if (dupe && dupe.id !== Number(d.id)) fail(`An account named "${name}" already exists`);
  if (d.id) {
    const a = getAccount(db, cid, d.id);
    if (a.system_key && TYPES[subtype] !== a.type) fail('This built-in account cannot change type');
    db.prepare('UPDATE accounts SET code=?, name=?, type=?, subtype=?, description=?, is_active=? WHERE id=?')
      .run(d.code || '', name, TYPES[subtype], subtype, d.description || '', d.is_active === false || d.is_active === 0 ? 0 : 1, a.id);
    return a.id;
  }
  const r = db.prepare('INSERT INTO accounts (company_id, code, name, type, subtype, description) VALUES (?,?,?,?,?,?)')
    .run(cid, d.code || '', name, TYPES[subtype], subtype, d.description || '');
  return Number(r.lastInsertRowid);
}

function deleteAccount(db, cid, id) {
  const a = getAccount(db, cid, id);
  if (a.system_key) fail('Built-in accounts cannot be deleted');
  const used = db.prepare('SELECT COUNT(*) n FROM lines WHERE account_id=?').get(a.id).n;
  if (used) fail('This account has transactions. Make it inactive instead.');
  db.prepare('DELETE FROM accounts WHERE id=?').run(a.id);
}

function listAccounts(db, cid, asOf) {
  const rows = db.prepare(`SELECT a.*, COALESCE((SELECT SUM(l.amount) FROM lines l JOIN entries e ON e.id=l.entry_id
      WHERE l.account_id=a.id AND e.date<=?),0) AS raw
    FROM accounts a WHERE a.company_id=? ORDER BY a.code='' , a.code, a.name`).all(asOf || '9999-12-31', cid);
  return rows.map((r) => ({ ...r, balance: natural(r.type, r.raw) }));
}

// ---------- contacts ----------
function saveContact(db, cid, d) {
  const name = (d.name || '').trim() || fail('Name is required');
  const kind = d.kind === 'vendor' ? 'vendor' : 'customer';
  const dupe = db.prepare('SELECT id FROM contacts WHERE company_id=? AND kind=? AND name=?').get(cid, kind, name);
  if (dupe && dupe.id !== Number(d.id)) fail(`A ${kind} named "${name}" already exists`);
  const acct = d.default_account_id ? getAccount(db, cid, d.default_account_id).id : null;
  if (d.id) {
    db.prepare(`UPDATE contacts SET name=?, email=?, phone=?, address=?, notes=?, default_account_id=?, is_active=?
      WHERE id=? AND company_id=?`).run(name, d.email || '', d.phone || '', d.address || '', d.notes || '', acct,
      d.is_active === false || d.is_active === 0 ? 0 : 1, Number(d.id), cid);
    return Number(d.id);
  }
  const r = db.prepare(`INSERT INTO contacts (company_id, kind, name, email, phone, address, notes, default_account_id)
    VALUES (?,?,?,?,?,?,?,?)`).run(cid, kind, name, d.email || '', d.phone || '', d.address || '', d.notes || '', acct);
  return Number(r.lastInsertRowid);
}

function findOrCreateContact(db, cid, kind, name) {
  name = (name || '').trim();
  if (!name) return null;
  const c = db.prepare('SELECT id FROM contacts WHERE company_id=? AND kind=? AND name=?').get(cid, kind, name);
  return c ? c.id : saveContact(db, cid, { kind, name });
}

function getContact(db, cid, id) {
  return db.prepare('SELECT * FROM contacts WHERE id=? AND company_id=?').get(Number(id), cid) || fail('Contact not found');
}

function listContacts(db, cid, kind) {
  const key = kind === 'vendor' ? 'ap' : 'ar';
  const acct = systemAccount(db, cid, key);
  const rows = db.prepare(`SELECT c.*, COALESCE((SELECT SUM(l.amount) FROM lines l WHERE l.account_id=? AND l.contact_id=c.id),0) raw
    FROM contacts c WHERE c.company_id=? AND c.kind=? ORDER BY c.name COLLATE NOCASE`).all(acct.id, cid, kind);
  return rows.map((r) => ({ ...r, balance: kind === 'vendor' ? -r.raw : r.raw }));
}

function deleteContact(db, cid, id) {
  const c = getContact(db, cid, id);
  const used = db.prepare(`SELECT (SELECT COUNT(*) FROM invoices WHERE contact_id=?) + (SELECT COUNT(*) FROM bills WHERE contact_id=?)
    + (SELECT COUNT(*) FROM payments WHERE contact_id=?) n`).get(c.id, c.id, c.id).n;
  if (used) fail('This contact has invoices, bills or payments. Make it inactive instead.');
  db.prepare('DELETE FROM contacts WHERE id=?').run(c.id);
}

// ---------- journal entries ----------
function checkOpenPeriod(db, cid, date) {
  const c = getCompany(db, cid);
  if (c.closing_date && date <= c.closing_date) fail(`The books are closed through ${c.closing_date}. Change the closing date in Settings first.`);
}

function insertEntry(db, cid, e) {
  if (!isDate(e.date)) fail('A valid date is required');
  checkOpenPeriod(db, cid, e.date);
  const lines = (e.lines || []).filter((l) => l.account_id && l.amount);
  if (lines.length < 2) fail('An entry needs at least two lines with amounts');
  const sum = lines.reduce((s, l) => s + l.amount, 0);
  if (sum !== 0) fail(`Debits and credits are off by ${(Math.abs(sum) / 100).toFixed(2)}`);
  for (const l of lines) {
    if (!Number.isInteger(l.amount)) fail('Bad amount');
    getAccount(db, cid, l.account_id);
  }
  const r = db.prepare(`INSERT INTO entries (company_id, date, memo, ref, source, contact_id, import_batch)
    VALUES (?,?,?,?,?,?,?)`).run(cid, e.date, e.memo || '', e.ref || '', e.source || 'manual', e.contact_id || null, e.import_batch || null);
  const id = Number(r.lastInsertRowid);
  const ins = db.prepare('INSERT INTO lines (entry_id, account_id, amount, memo, contact_id, cleared) VALUES (?,?,?,?,?,?)');
  for (const l of lines) ins.run(id, Number(l.account_id), l.amount, l.memo || '', l.contact_id || e.contact_id || null, l.cleared || 0);
  return id;
}

function getEntry(db, cid, id) {
  const e = db.prepare('SELECT * FROM entries WHERE id=? AND company_id=?').get(Number(id), cid) || fail('Entry not found');
  e.lines = db.prepare(`SELECT l.*, a.name account_name, a.type account_type, c.name contact_name FROM lines l
    JOIN accounts a ON a.id=l.account_id LEFT JOIN contacts c ON c.id=l.contact_id WHERE l.entry_id=? ORDER BY l.id`).all(e.id);
  e.doc = docForEntry(db, e.id);
  return e;
}

function docForEntry(db, entryId) {
  for (const t of ['invoices', 'bills', 'payments']) {
    const r = db.prepare(`SELECT id FROM ${t} WHERE entry_id=?`).get(entryId);
    if (r) return { type: t.slice(0, -1), id: r.id };
  }
  const b = db.prepare('SELECT id FROM bank_txns WHERE entry_id=?').get(entryId);
  return b ? { type: 'bank_txn', id: b.id } : null;
}

// Manual journal entry; lines use {account_id, debit, credit} from the UI.
function saveJournal(db, cid, d) {
  const lines = (d.lines || []).map((l) => ({
    account_id: Number(l.account_id), amount: toCents(l.debit) - toCents(l.credit), memo: l.memo || '',
    contact_id: l.contact_id ? Number(l.contact_id) : null,
  }));
  return tx(db, () => {
    let cleared = new Map();
    if (d.id) {
      const old = getEntry(db, cid, d.id);
      if (old.doc && old.doc.type !== 'bank_txn') fail(`This entry belongs to a ${old.doc.type}. Edit the ${old.doc.type} instead.`);
      if (old.lines.some((l) => l.cleared === 2)) fail('This entry has reconciled lines and cannot be edited');
      checkOpenPeriod(db, cid, old.date);
      old.lines.forEach((l) => { if (l.cleared) cleared.set(l.account_id, l.cleared); });
      const bank = old.doc && old.doc.type === 'bank_txn' ? old.doc.id : null;
      db.prepare('DELETE FROM entries WHERE id=?').run(old.id);
      const id = insertEntry(db, cid, { ...d, source: old.source, lines: lines.map((l) => ({ ...l, cleared: cleared.get(l.account_id) || 0 })) });
      if (bank) db.prepare('UPDATE bank_txns SET entry_id=? WHERE id=?').run(id, bank);
      return id;
    }
    return insertEntry(db, cid, { ...d, source: 'manual', lines });
  });
}

function deleteEntry(db, cid, id) {
  return tx(db, () => {
    const e = getEntry(db, cid, id);
    if (e.doc && e.doc.type !== 'bank_txn') fail(`This entry belongs to a ${e.doc.type}. Delete or void the ${e.doc.type} instead.`);
    if (e.lines.some((l) => l.cleared === 2)) fail('This entry has reconciled lines and cannot be deleted');
    checkOpenPeriod(db, cid, e.date);
    db.prepare("UPDATE bank_txns SET status='new', entry_id=NULL WHERE entry_id=?").run(e.id);
    db.prepare('DELETE FROM entries WHERE id=?').run(e.id);
  });
}

function listEntries(db, cid, q = {}) {
  const where = ['e.company_id=?'];
  const args = [cid];
  if (q.from) { where.push('e.date>=?'); args.push(q.from); }
  if (q.to) { where.push('e.date<=?'); args.push(q.to); }
  if (q.search) {
    where.push(`(e.memo LIKE ? OR e.ref LIKE ? OR EXISTS (SELECT 1 FROM lines l2 LEFT JOIN contacts c2 ON c2.id=l2.contact_id
      WHERE l2.entry_id=e.id AND (l2.memo LIKE ? OR c2.name LIKE ?)))`);
    const s = `%${q.search}%`;
    args.push(s, s, s, s);
  }
  if (q.account_id) { where.push('EXISTS (SELECT 1 FROM lines l3 WHERE l3.entry_id=e.id AND l3.account_id=?)'); args.push(Number(q.account_id)); }
  args.push(Math.min(Number(q.limit) || 200, 2000));
  const rows = db.prepare(`SELECT e.*, c.name contact_name,
      (SELECT SUM(amount) FROM lines WHERE entry_id=e.id AND amount>0) total,
      (SELECT GROUP_CONCAT(a.name, ', ') FROM (SELECT DISTINCT account_id FROM lines WHERE entry_id=e.id) x JOIN accounts a ON a.id=x.account_id) accounts
    FROM entries e LEFT JOIN contacts c ON c.id=e.contact_id WHERE ${where.join(' AND ')}
    ORDER BY e.date DESC, e.id DESC LIMIT ?`).all(...args);
  return rows;
}

// ---------- invoices ----------
function invoicePaid(db, id) {
  return db.prepare(`SELECT COALESCE(SUM(pa.amount),0) n FROM payment_apps pa WHERE pa.doc_type='invoice' AND pa.doc_id=?`).get(id).n;
}
function billPaid(db, id) {
  return db.prepare(`SELECT COALESCE(SUM(pa.amount),0) n FROM payment_apps pa WHERE pa.doc_type='bill' AND pa.doc_id=?`).get(id).n;
}

function docStatus(doc, paid, date = today()) {
  if (doc.voided) return 'void';
  const bal = doc.total - paid;
  if (bal <= 0) return 'paid';
  if (doc.due_date < date) return 'overdue';
  return paid > 0 ? 'partial' : 'open';
}

function saveInvoice(db, cid, d) {
  const contact = getContact(db, cid, d.contact_id);
  if (contact.kind !== 'customer') fail('Pick a customer');
  if (!isDate(d.date)) fail('Invoice date is required');
  const co = getCompany(db, cid);
  const items = (d.lines || []).filter((l) => l.account_id && (toCents(l.rate) || l.description)).map((l) => {
    const qty = Number(l.qty === '' || l.qty === undefined ? 1 : l.qty);
    if (!Number.isFinite(qty)) fail('Bad quantity');
    const rate = toCents(l.rate);
    return { description: l.description || '', qty, rate, amount: Math.round(qty * rate), account_id: Number(l.account_id), taxable: l.taxable ? 1 : 0 };
  });
  if (!items.length) fail('Add at least one line');
  for (const it of items) {
    const a = getAccount(db, cid, it.account_id);
    if (a.type !== 'income' && a.type !== 'liability' && a.type !== 'asset') fail(`"${a.name}" is not an income account`);
  }
  const taxRate = Number(d.tax_rate ?? co.sales_tax_rate) || 0;
  const subtotal = items.reduce((s, i) => s + i.amount, 0);
  const tax = Math.round(items.filter((i) => i.taxable).reduce((s, i) => s + i.amount, 0) * taxRate / 100);
  const total = subtotal + tax;
  const due = isDate(d.due_date) ? d.due_date : addDays(d.date, co.invoice_terms_days);

  return tx(db, () => {
    let id = d.id ? Number(d.id) : null;
    let number = (d.number || '').toString().trim();
    if (id) {
      const old = getInvoice(db, cid, id);
      if (old.voided) fail('This invoice is void');
      if (total < old.paid) fail('The new total is less than what has already been paid');
      if (old.entry_id) {
        checkOpenPeriod(db, cid, old.date);
        db.prepare('DELETE FROM entries WHERE id=?').run(old.entry_id);
      }
      number = number || old.number;
    } else {
      if (!number) {
        number = String(co.next_invoice_no);
        db.prepare('UPDATE companies SET next_invoice_no=next_invoice_no+1 WHERE id=?').run(cid);
      } else if (/^\d+$/.test(number) && Number(number) >= co.next_invoice_no) {
        db.prepare('UPDATE companies SET next_invoice_no=? WHERE id=?').run(Number(number) + 1, cid);
      }
    }
    const dupe = db.prepare('SELECT id FROM invoices WHERE company_id=? AND number=? AND id IS NOT ?').get(cid, number, id);
    if (dupe) fail(`Invoice number ${number} is already used`);

    const ar = systemAccount(db, cid, 'ar');
    const lines = [{ account_id: ar.id, amount: total, contact_id: contact.id, memo: `Invoice ${number}` }];
    for (const it of items) lines.push({ account_id: it.account_id, amount: -it.amount, memo: it.description });
    if (tax) lines.push({ account_id: systemAccount(db, cid, 'sales_tax').id, amount: -tax, memo: `Sales tax ${taxRate}%` });
    const entryId = total === 0 ? null : insertEntry(db, cid, { date: d.date, memo: `Invoice ${number} - ${contact.name}`, ref: number, source: 'invoice', contact_id: contact.id, lines });

    if (id) {
      db.prepare(`UPDATE invoices SET contact_id=?, number=?, date=?, due_date=?, memo=?, tax_rate=?, subtotal=?, tax=?, total=?, entry_id=? WHERE id=?`)
        .run(contact.id, number, d.date, due, d.memo || '', taxRate, subtotal, tax, total, entryId, id);
      db.prepare('DELETE FROM invoice_lines WHERE invoice_id=?').run(id);
    } else {
      id = Number(db.prepare(`INSERT INTO invoices (company_id, contact_id, number, date, due_date, memo, tax_rate, subtotal, tax, total, entry_id)
        VALUES (?,?,?,?,?,?,?,?,?,?,?)`).run(cid, contact.id, number, d.date, due, d.memo || '', taxRate, subtotal, tax, total, entryId).lastInsertRowid);
    }
    const ins = db.prepare('INSERT INTO invoice_lines (invoice_id, description, qty, rate, amount, account_id, taxable) VALUES (?,?,?,?,?,?,?)');
    for (const it of items) ins.run(id, it.description, it.qty, it.rate, it.amount, it.account_id, it.taxable);
    return id;
  });
}

function getInvoice(db, cid, id) {
  const inv = db.prepare(`SELECT i.*, c.name contact_name, c.email contact_email, c.address contact_address FROM invoices i
    JOIN contacts c ON c.id=i.contact_id WHERE i.id=? AND i.company_id=?`).get(Number(id), cid) || fail('Invoice not found');
  inv.lines = db.prepare('SELECT * FROM invoice_lines WHERE invoice_id=? ORDER BY id').all(inv.id);
  inv.paid = invoicePaid(db, inv.id);
  inv.balance = inv.voided ? 0 : inv.total - inv.paid;
  inv.status = docStatus(inv, inv.paid);
  inv.payments = db.prepare(`SELECT p.id, p.date, p.method, p.ref, pa.amount FROM payment_apps pa JOIN payments p ON p.id=pa.payment_id
    WHERE pa.doc_type='invoice' AND pa.doc_id=? ORDER BY p.date`).all(inv.id);
  return inv;
}

function listInvoices(db, cid, q = {}) {
  const rows = db.prepare(`SELECT i.*, c.name contact_name,
      COALESCE((SELECT SUM(amount) FROM payment_apps WHERE doc_type='invoice' AND doc_id=i.id),0) paid
    FROM invoices i JOIN contacts c ON c.id=i.contact_id WHERE i.company_id=? ${q.contact_id ? 'AND i.contact_id=' + Number(q.contact_id) : ''}
    ORDER BY i.date DESC, i.id DESC`).all(cid);
  const t = today();
  return rows.map((r) => ({ ...r, balance: r.voided ? 0 : r.total - r.paid, status: docStatus(r, r.paid, t) }))
    .filter((r) => !q.status || (q.status === 'unpaid' ? ['open', 'partial', 'overdue'].includes(r.status) : r.status === q.status));
}

function voidInvoice(db, cid, id) {
  return tx(db, () => {
    const inv = getInvoice(db, cid, id);
    if (inv.paid) fail('Delete the payments on this invoice first');
    if (inv.entry_id) { checkOpenPeriod(db, cid, inv.date); db.prepare('DELETE FROM entries WHERE id=?').run(inv.entry_id); }
    db.prepare('UPDATE invoices SET voided=1, entry_id=NULL WHERE id=?').run(inv.id);
  });
}

function deleteInvoice(db, cid, id) {
  return tx(db, () => {
    const inv = getInvoice(db, cid, id);
    if (inv.paid) fail('Delete the payments on this invoice first');
    if (inv.entry_id) { checkOpenPeriod(db, cid, inv.date); db.prepare('DELETE FROM entries WHERE id=?').run(inv.entry_id); }
    db.prepare('DELETE FROM invoices WHERE id=?').run(inv.id);
  });
}

// ---------- bills ----------
function saveBill(db, cid, d) {
  const contact = getContact(db, cid, d.contact_id);
  if (contact.kind !== 'vendor') fail('Pick a vendor');
  if (!isDate(d.date)) fail('Bill date is required');
  const items = (d.lines || []).filter((l) => l.account_id && toCents(l.amount)).map((l) => ({
    description: l.description || '', amount: toCents(l.amount), account_id: Number(l.account_id),
  }));
  if (!items.length) fail('Add at least one line with an amount');
  items.forEach((i) => getAccount(db, cid, i.account_id));
  const total = items.reduce((s, i) => s + i.amount, 0);
  const due = isDate(d.due_date) ? d.due_date : d.date;
  return tx(db, () => {
    let id = d.id ? Number(d.id) : null;
    if (id) {
      const old = getBill(db, cid, id);
      if (old.voided) fail('This bill is void');
      if (total < old.paid) fail('The new total is less than what has already been paid');
      if (old.entry_id) { checkOpenPeriod(db, cid, old.date); db.prepare('DELETE FROM entries WHERE id=?').run(old.entry_id); }
    }
    const ap = systemAccount(db, cid, 'ap');
    const lines = [{ account_id: ap.id, amount: -total, contact_id: contact.id, memo: `Bill ${d.number || ''}`.trim() }];
    for (const it of items) lines.push({ account_id: it.account_id, amount: it.amount, memo: it.description });
    const entryId = total === 0 ? null : insertEntry(db, cid, { date: d.date, memo: `Bill ${d.number || ''} - ${contact.name}`.replace('  ', ' '), ref: d.number || '', source: 'bill', contact_id: contact.id, lines });
    if (id) {
      db.prepare('UPDATE bills SET contact_id=?, number=?, date=?, due_date=?, memo=?, total=?, entry_id=? WHERE id=?')
        .run(contact.id, d.number || '', d.date, due, d.memo || '', total, entryId, id);
      db.prepare('DELETE FROM bill_lines WHERE bill_id=?').run(id);
    } else {
      id = Number(db.prepare('INSERT INTO bills (company_id, contact_id, number, date, due_date, memo, total, entry_id) VALUES (?,?,?,?,?,?,?,?)')
        .run(cid, contact.id, d.number || '', d.date, due, d.memo || '', total, entryId).lastInsertRowid);
    }
    const ins = db.prepare('INSERT INTO bill_lines (bill_id, description, amount, account_id) VALUES (?,?,?,?)');
    for (const it of items) ins.run(id, it.description, it.amount, it.account_id);
    return id;
  });
}

function getBill(db, cid, id) {
  const b = db.prepare(`SELECT b.*, c.name contact_name FROM bills b JOIN contacts c ON c.id=b.contact_id
    WHERE b.id=? AND b.company_id=?`).get(Number(id), cid) || fail('Bill not found');
  b.lines = db.prepare('SELECT * FROM bill_lines WHERE bill_id=? ORDER BY id').all(b.id);
  b.paid = billPaid(db, b.id);
  b.balance = b.voided ? 0 : b.total - b.paid;
  b.status = docStatus(b, b.paid);
  b.payments = db.prepare(`SELECT p.id, p.date, p.method, p.ref, pa.amount FROM payment_apps pa JOIN payments p ON p.id=pa.payment_id
    WHERE pa.doc_type='bill' AND pa.doc_id=? ORDER BY p.date`).all(b.id);
  return b;
}

function listBills(db, cid, q = {}) {
  const rows = db.prepare(`SELECT b.*, c.name contact_name,
      COALESCE((SELECT SUM(amount) FROM payment_apps WHERE doc_type='bill' AND doc_id=b.id),0) paid
    FROM bills b JOIN contacts c ON c.id=b.contact_id WHERE b.company_id=? ${q.contact_id ? 'AND b.contact_id=' + Number(q.contact_id) : ''}
    ORDER BY b.date DESC, b.id DESC`).all(cid);
  const t = today();
  return rows.map((r) => ({ ...r, balance: r.voided ? 0 : r.total - r.paid, status: docStatus(r, r.paid, t) }))
    .filter((r) => !q.status || (q.status === 'unpaid' ? ['open', 'partial', 'overdue'].includes(r.status) : r.status === q.status));
}

function deleteBill(db, cid, id) {
  return tx(db, () => {
    const b = getBill(db, cid, id);
    if (b.paid) fail('Delete the payments on this bill first');
    if (b.entry_id) { checkOpenPeriod(db, cid, b.date); db.prepare('DELETE FROM entries WHERE id=?').run(b.entry_id); }
    db.prepare('DELETE FROM bills WHERE id=?').run(b.id);
  });
}

// ---------- payments ----------
// kind 'received': customer pays invoices; deposit into a bank (or Undeposited Funds) account.
// kind 'paid': we pay vendor bills from a bank or credit card account.
// apps: [{doc_id, amount}]. Any unapplied remainder stays on the customer/vendor as a credit.
function savePayment(db, cid, d, opts = {}) {
  const kind = d.kind === 'paid' ? 'paid' : 'received';
  const contact = getContact(db, cid, d.contact_id);
  if (contact.kind !== (kind === 'paid' ? 'vendor' : 'customer')) fail(kind === 'paid' ? 'Pick a vendor' : 'Pick a customer');
  if (!isDate(d.date)) fail('Payment date is required');
  const amount = toCents(d.amount);
  if (amount <= 0) fail('Payment amount must be more than zero');
  const acct = getAccount(db, cid, d.account_id);
  if (!['bank', 'credit_card', 'current_asset'].includes(acct.subtype)) fail('Pick a bank, card or Undeposited Funds account');
  const apps = (d.apps || []).map((a) => ({ doc_id: Number(a.doc_id), amount: toCents(a.amount) })).filter((a) => a.amount > 0);
  const applied = apps.reduce((s, a) => s + a.amount, 0);
  if (applied > amount) fail('More is applied to invoices/bills than the payment amount');

  return tx(db, () => {
    for (const a of apps) {
      const doc = kind === 'paid' ? getBill(db, cid, a.doc_id) : getInvoice(db, cid, a.doc_id);
      if (doc.contact_id !== contact.id) fail('That invoice/bill belongs to someone else');
      let open = doc.balance;
      if (d.id) open += db.prepare('SELECT COALESCE(SUM(amount),0) n FROM payment_apps WHERE payment_id=? AND doc_id=? AND doc_type=?').get(Number(d.id), doc.id, kind === 'paid' ? 'bill' : 'invoice').n;
      if (a.amount > open) fail(`Only ${(open / 100).toFixed(2)} is open on ${kind === 'paid' ? 'bill' : 'invoice'} ${doc.number || doc.id}`);
    }
    if (d.id) {
      const old = db.prepare('SELECT * FROM payments WHERE id=? AND company_id=?').get(Number(d.id), cid) || fail('Payment not found');
      removePaymentEntry(db, cid, old);
      db.prepare('DELETE FROM payment_apps WHERE payment_id=?').run(old.id);
    }
    const ctl = systemAccount(db, cid, kind === 'paid' ? 'ap' : 'ar');
    const sign = kind === 'paid' ? -1 : 1;
    const lines = [
      { account_id: acct.id, amount: sign * amount, cleared: opts.cleared ? 1 : 0 },
      { account_id: ctl.id, amount: -sign * amount, contact_id: contact.id },
    ];
    const memo = `${kind === 'paid' ? 'Payment to' : 'Payment from'} ${contact.name}`;
    const entryId = insertEntry(db, cid, { date: d.date, memo: d.memo || memo, ref: d.ref || '', source: 'payment', contact_id: contact.id, lines });
    let id = d.id ? Number(d.id) : null;
    if (id) {
      db.prepare('UPDATE payments SET contact_id=?, date=?, amount=?, account_id=?, method=?, ref=?, memo=?, entry_id=? WHERE id=?')
        .run(contact.id, d.date, amount, acct.id, d.method || '', d.ref || '', d.memo || '', entryId, id);
    } else {
      id = Number(db.prepare(`INSERT INTO payments (company_id, kind, contact_id, date, amount, account_id, method, ref, memo, entry_id)
        VALUES (?,?,?,?,?,?,?,?,?,?)`).run(cid, kind, contact.id, d.date, amount, acct.id, d.method || '', d.ref || '', d.memo || '', entryId).lastInsertRowid);
    }
    const ins = db.prepare('INSERT INTO payment_apps (payment_id, doc_type, doc_id, amount) VALUES (?,?,?,?)');
    for (const a of apps) ins.run(id, kind === 'paid' ? 'bill' : 'invoice', a.doc_id, a.amount);
    return id;
  });
}

function removePaymentEntry(db, cid, p) {
  if (!p.entry_id) return;
  const e = getEntry(db, cid, p.entry_id);
  if (e.lines.some((l) => l.cleared === 2)) fail('This payment is reconciled and cannot be changed');
  checkOpenPeriod(db, cid, e.date);
  db.prepare("UPDATE bank_txns SET status='new', entry_id=NULL WHERE entry_id=?").run(e.id);
  db.prepare('DELETE FROM entries WHERE id=?').run(e.id);
}

function getPayment(db, cid, id) {
  const p = db.prepare(`SELECT p.*, c.name contact_name, a.name account_name FROM payments p JOIN contacts c ON c.id=p.contact_id
    JOIN accounts a ON a.id=p.account_id WHERE p.id=? AND p.company_id=?`).get(Number(id), cid) || fail('Payment not found');
  p.apps = db.prepare(`SELECT pa.*, COALESCE(i.number, b.number) number FROM payment_apps pa
    LEFT JOIN invoices i ON pa.doc_type='invoice' AND i.id=pa.doc_id LEFT JOIN bills b ON pa.doc_type='bill' AND b.id=pa.doc_id
    WHERE pa.payment_id=?`).all(p.id);
  return p;
}

function listPayments(db, cid, kind) {
  return db.prepare(`SELECT p.*, c.name contact_name, a.name account_name FROM payments p JOIN contacts c ON c.id=p.contact_id
    JOIN accounts a ON a.id=p.account_id WHERE p.company_id=? AND p.kind=? ORDER BY p.date DESC, p.id DESC`).all(cid, kind);
}

function deletePayment(db, cid, id) {
  return tx(db, () => {
    const p = getPayment(db, cid, id);
    removePaymentEntry(db, cid, p);
    db.prepare('DELETE FROM payments WHERE id=?').run(p.id);
  });
}

// ---------- banking ----------
const normalize = (s) => String(s || '').toLowerCase()
  .replace(/\b(pos|debit|credit|purchase|card|ach|checkcard|recurring|payment|pmt|online|web|id|ppd|ccd|xx+\d*)\b/g, ' ')
  .replace(/[#*\d]+/g, ' ').replace(/[^a-z& ]/g, ' ').replace(/\s+/g, ' ').trim();

function suggestFor(db, cid, t) {
  const desc = (t.description || '').toLowerCase();
  const rules = db.prepare('SELECT * FROM rules WHERE company_id=? ORDER BY LENGTH(match_text) DESC').all(cid);
  for (const r of rules) {
    if (r.direction === 'in' && t.amount < 0) continue;
    if (r.direction === 'out' && t.amount > 0) continue;
    if (desc.includes(r.match_text.toLowerCase())) return { account_id: r.account_id, contact_id: r.contact_id, source: 'rule', rule: r };
  }
  // Learn from history: the most common category for similar past descriptions.
  const key = normalize(t.description);
  if (key) {
    const past = db.prepare(`SELECT b.description, b.amount, l.account_id, e.contact_id FROM bank_txns b JOIN entries e ON e.id=b.entry_id
      JOIN lines l ON l.entry_id=e.id AND l.account_id<>b.account_id WHERE b.company_id=? AND b.status='posted'
      ORDER BY b.date DESC LIMIT 3000`).all(cid);
    const tally = new Map();
    const firstWords = key.split(' ').slice(0, 2).join(' ');
    for (const p of past) {
      if ((p.amount > 0) !== (t.amount > 0)) continue;
      const pk = normalize(p.description);
      let score = 0;
      if (pk === key) score = 3;
      else if (firstWords.length >= 4 && pk.startsWith(firstWords)) score = 1;
      if (!score) continue;
      const k = p.account_id + ':' + (p.contact_id || '');
      const cur = tally.get(k) || { account_id: p.account_id, contact_id: p.contact_id, score: 0 };
      cur.score += score;
      tally.set(k, cur);
    }
    const best = [...tally.values()].sort((a, b) => b.score - a.score)[0];
    if (best) return { account_id: best.account_id, contact_id: best.contact_id, source: 'history' };
  }
  return null;
}

// rows: [{date, amount (cents, + = into account), description, fitid}]
function importBankRows(db, cid, accountId, rows, filename) {
  const acct = getAccount(db, cid, accountId);
  if (!['bank', 'credit_card'].includes(acct.subtype) && acct.type !== 'asset' && acct.type !== 'liability') fail('Pick a bank or credit card account');
  return tx(db, () => {
    const batch = Number(db.prepare("INSERT INTO import_batches (company_id, kind, filename) VALUES (?, 'bank', ?)").run(cid, filename || '').lastInsertRowid);
    let added = 0, dupes = 0, autoPosted = 0;
    const byFit = db.prepare('SELECT id FROM bank_txns WHERE account_id=? AND fitid=? AND fitid<>\'\'');
    const bySig = db.prepare('SELECT COUNT(*) n FROM bank_txns WHERE account_id=? AND date=? AND amount=? AND description=?');
    const seen = new Map();
    const ins = db.prepare(`INSERT INTO bank_txns (company_id, account_id, date, amount, description, fitid, suggested_account_id,
      suggested_contact_id, suggestion_source, import_batch) VALUES (?,?,?,?,?,?,?,?,?,?)`);
    for (const r of rows) {
      if (!isDate(r.date) || !r.amount) continue;
      if (r.fitid && byFit.get(acct.id, r.fitid)) { dupes++; continue; }
      if (!r.fitid) {
        // Same date+amount+description may legitimately repeat inside one file, so compare counts.
        const sig = `${r.date}|${r.amount}|${r.description}`;
        const inFile = (seen.get(sig) || 0) + 1;
        seen.set(sig, inFile);
        if (bySig.get(acct.id, r.date, r.amount, r.description).n >= inFile) { dupes++; continue; }
      }
      const s = suggestFor(db, cid, r);
      const id = Number(ins.run(cid, acct.id, r.date, r.amount, r.description || '', r.fitid || '', s?.account_id || null,
        s?.contact_id || null, s?.source || '', batch).lastInsertRowid);
      added++;
      if (s?.rule?.auto_post) {
        try { postBankTxn(db, cid, id, { account_id: s.account_id, contact_id: s.contact_id }, true); autoPosted++; } catch { /* leave for review */ }
      }
    }
    db.prepare('UPDATE import_batches SET summary=? WHERE id=?').run(`${added} added, ${dupes} duplicates skipped, ${autoPosted} auto-posted`, batch);
    return { batch, added, dupes, autoPosted };
  });
}

function getBankTxn(db, cid, id) {
  return db.prepare('SELECT * FROM bank_txns WHERE id=? AND company_id=?').get(Number(id), cid) || fail('Bank transaction not found');
}

function postBankTxn(db, cid, id, d, nested) {
  const run = () => {
    const t = getBankTxn(db, cid, id);
    if (t.status !== 'new') fail('Already handled');
    const cat = getAccount(db, cid, d.account_id);
    if (cat.id === t.account_id) fail('Pick a different account than the bank account itself');
    if (cat.system_key === 'ar' || cat.system_key === 'ap') fail('Use "Match" to apply this to an invoice or bill');
    const contactId = d.contact_id ? getContact(db, cid, d.contact_id).id : null;
    const entryId = insertEntry(db, cid, {
      date: t.date, memo: d.memo || t.description, source: 'bank', contact_id: contactId,
      lines: [
        { account_id: t.account_id, amount: t.amount, cleared: 1 },
        { account_id: cat.id, amount: -t.amount, memo: d.memo || t.description },
      ],
    });
    db.prepare("UPDATE bank_txns SET status='posted', entry_id=? WHERE id=?").run(entryId, t.id);
    if (d.make_rule && d.rule_text) {
      db.prepare('INSERT INTO rules (company_id, match_text, direction, account_id, contact_id) VALUES (?,?,?,?,?)')
        .run(cid, d.rule_text.trim(), t.amount > 0 ? 'in' : 'out', cat.id, contactId);
    }
    return entryId;
  };
  return nested ? run() : tx(db, run);
}

// Candidates the imported line may already be recorded as: uncleared lines in the same account with the
// same amount within 10 days, plus open invoices/bills for the same amount.
function bankMatches(db, cid, id) {
  const t = getBankTxn(db, cid, id);
  const lines = db.prepare(`SELECT l.id line_id, e.id entry_id, e.date, e.memo, e.ref, c.name contact_name FROM lines l
    JOIN entries e ON e.id=l.entry_id LEFT JOIN contacts c ON c.id=e.contact_id
    WHERE l.account_id=? AND l.amount=? AND l.cleared=0 AND e.date BETWEEN ? AND ?
      AND NOT EXISTS (SELECT 1 FROM bank_txns b WHERE b.entry_id=e.id AND b.account_id=l.account_id)
    ORDER BY ABS(julianday(e.date)-julianday(?)) LIMIT 10`).all(t.account_id, t.amount, addDays(t.date, -10), addDays(t.date, 10), t.date);
  const docs = t.amount > 0
    ? listInvoices(db, cid, { status: 'unpaid' }).filter((i) => i.balance === t.amount).map((i) => ({ doc_type: 'invoice', doc_id: i.id, number: i.number, contact_name: i.contact_name, date: i.date, contact_id: i.contact_id }))
    : listBills(db, cid, { status: 'unpaid' }).filter((b) => b.balance === -t.amount).map((b) => ({ doc_type: 'bill', doc_id: b.id, number: b.number, contact_name: b.contact_name, date: b.date, contact_id: b.contact_id }));
  return { lines, docs };
}

function matchBankTxn(db, cid, id, d) {
  return tx(db, () => {
    const t = getBankTxn(db, cid, id);
    if (t.status !== 'new') fail('Already handled');
    let entryId;
    if (d.line_id) {
      const l = db.prepare(`SELECT l.*, e.company_id FROM lines l JOIN entries e ON e.id=l.entry_id WHERE l.id=?`).get(Number(d.line_id));
      if (!l || l.company_id !== cid || l.account_id !== t.account_id || l.amount !== t.amount) fail('That transaction does not match');
      db.prepare('UPDATE lines SET cleared=1 WHERE id=? AND cleared=0').run(l.id);
      entryId = l.entry_id;
    } else if (d.doc_type && d.doc_id) {
      const isInv = d.doc_type === 'invoice';
      const doc = isInv ? getInvoice(db, cid, d.doc_id) : getBill(db, cid, d.doc_id);
      if (doc.balance !== Math.abs(t.amount)) fail('Amounts differ');
      const pid = savePayment(db, cid, {
        kind: isInv ? 'received' : 'paid', contact_id: doc.contact_id, date: t.date, amount: Math.abs(t.amount) / 100,
        account_id: t.account_id, memo: t.description, apps: [{ doc_id: doc.id, amount: Math.abs(t.amount) / 100 }],
      }, { cleared: true });
      entryId = db.prepare('SELECT entry_id FROM payments WHERE id=?').get(pid).entry_id;
    } else fail('Nothing to match');
    db.prepare("UPDATE bank_txns SET status='posted', entry_id=? WHERE id=?").run(entryId, t.id);
    return entryId;
  });
}

function excludeBankTxn(db, cid, id) {
  const t = getBankTxn(db, cid, id);
  if (t.status !== 'new') fail('Already handled');
  db.prepare("UPDATE bank_txns SET status='excluded' WHERE id=?").run(t.id);
}

// Send a posted/excluded line back to the review queue.
function undoBankTxn(db, cid, id) {
  return tx(db, () => {
    const t = getBankTxn(db, cid, id);
    if (t.entry_id) {
      const e = getEntry(db, cid, t.entry_id);
      if (e.lines.some((l) => l.cleared === 2 && l.account_id === t.account_id)) fail('This transaction is reconciled');
      if (e.source === 'bank') {
        checkOpenPeriod(db, cid, e.date);
        db.prepare('DELETE FROM entries WHERE id=?').run(e.id);
      } else {
        db.prepare('UPDATE lines SET cleared=0 WHERE entry_id=? AND account_id=? AND amount=? AND cleared=1').run(e.id, t.account_id, t.amount);
      }
    }
    db.prepare("UPDATE bank_txns SET status='new', entry_id=NULL WHERE id=?").run(t.id);
  });
}

function listBankTxns(db, cid, accountId, status) {
  const rows = db.prepare(`SELECT b.*, a.name suggested_account_name, c.name suggested_contact_name,
      (SELECT GROUP_CONCAT(a2.name, ', ') FROM lines l2 JOIN accounts a2 ON a2.id=l2.account_id WHERE l2.entry_id=b.entry_id AND l2.account_id<>b.account_id) posted_to
    FROM bank_txns b LEFT JOIN accounts a ON a.id=b.suggested_account_id LEFT JOIN contacts c ON c.id=b.suggested_contact_id
    WHERE b.company_id=? AND b.account_id=? AND b.status=? ORDER BY b.date DESC, b.id DESC LIMIT 1000`).all(cid, Number(accountId), status || 'new');
  return rows;
}

function refreshSuggestions(db, cid, accountId) {
  const rows = db.prepare("SELECT * FROM bank_txns WHERE company_id=? AND account_id=? AND status='new'").all(cid, Number(accountId));
  const up = db.prepare('UPDATE bank_txns SET suggested_account_id=?, suggested_contact_id=?, suggestion_source=? WHERE id=?');
  for (const r of rows) {
    if (r.suggestion_source === 'ai' && r.suggested_account_id) continue;
    const s = suggestFor(db, cid, r);
    up.run(s?.account_id || null, s?.contact_id || null, s?.source || '', r.id);
  }
}

function saveRule(db, cid, d) {
  const text = (d.match_text || '').trim() || fail('Enter the text to match');
  const acct = getAccount(db, cid, d.account_id);
  const contact = d.contact_id ? getContact(db, cid, d.contact_id).id : null;
  const dir = ['in', 'out'].includes(d.direction) ? d.direction : 'any';
  if (d.id) {
    db.prepare('UPDATE rules SET match_text=?, direction=?, account_id=?, contact_id=?, auto_post=? WHERE id=? AND company_id=?')
      .run(text, dir, acct.id, contact, d.auto_post ? 1 : 0, Number(d.id), cid);
    return Number(d.id);
  }
  return Number(db.prepare('INSERT INTO rules (company_id, match_text, direction, account_id, contact_id, auto_post) VALUES (?,?,?,?,?,?)')
    .run(cid, text, dir, acct.id, contact, d.auto_post ? 1 : 0).lastInsertRowid);
}

function listRules(db, cid) {
  return db.prepare(`SELECT r.*, a.name account_name, c.name contact_name FROM rules r JOIN accounts a ON a.id=r.account_id
    LEFT JOIN contacts c ON c.id=r.contact_id WHERE r.company_id=? ORDER BY r.match_text COLLATE NOCASE`).all(cid);
}

// ---------- reconciliation ----------
function reconcileData(db, cid, accountId, statementDate) {
  const acct = getAccount(db, cid, accountId);
  const last = db.prepare('SELECT * FROM reconciliations WHERE account_id=? ORDER BY statement_date DESC, id DESC LIMIT 1').get(acct.id);
  const opening = db.prepare(`SELECT COALESCE(SUM(amount),0) n FROM lines WHERE account_id=? AND cleared=2`).get(acct.id).n;
  const items = db.prepare(`SELECT l.id, l.amount, l.cleared, e.date, e.memo, e.ref, c.name contact_name FROM lines l JOIN entries e ON e.id=l.entry_id
    LEFT JOIN contacts c ON c.id=e.contact_id WHERE l.account_id=? AND l.cleared<2 AND e.date<=? ORDER BY e.date, l.id`).all(acct.id, statementDate || '9999-12-31');
  return { account: acct, last, opening: natural(acct.type, opening), items: items.map((i) => ({ ...i, natural: natural(acct.type, i.amount) })) };
}

function finishReconcile(db, cid, d) {
  const acct = getAccount(db, cid, d.account_id);
  if (!isDate(d.statement_date)) fail('Statement date is required');
  const ids = (d.line_ids || []).map(Number);
  return tx(db, () => {
    const opening = db.prepare('SELECT COALESCE(SUM(amount),0) n FROM lines WHERE account_id=? AND cleared=2').get(acct.id).n;
    let sum = 0;
    const get = db.prepare('SELECT l.* FROM lines l JOIN entries e ON e.id=l.entry_id WHERE l.id=? AND e.company_id=? AND l.account_id=? AND l.cleared<2');
    for (const id of ids) { const l = get.get(id, cid, acct.id) || fail('A selected line is no longer available'); sum += l.amount; }
    const target = natural(acct.type, toCents(d.statement_balance));
    if (opening + sum !== target) fail(`Not balanced: off by ${(Math.abs(opening + sum - target) / 100).toFixed(2)}`);
    const rid = Number(db.prepare('INSERT INTO reconciliations (company_id, account_id, statement_date, statement_balance) VALUES (?,?,?,?)')
      .run(cid, acct.id, d.statement_date, toCents(d.statement_balance)).lastInsertRowid);
    const up = db.prepare('UPDATE lines SET cleared=2, reconcile_id=? WHERE id=?');
    for (const id of ids) up.run(rid, id);
    return rid;
  });
}

function undoReconcile(db, cid, rid) {
  const r = db.prepare('SELECT * FROM reconciliations WHERE id=? AND company_id=?').get(Number(rid), cid) || fail('Not found');
  const newer = db.prepare('SELECT 1 FROM reconciliations WHERE account_id=? AND id>?').get(r.account_id, r.id);
  if (newer) fail('Undo the newer reconciliations first');
  tx(db, () => {
    db.prepare('UPDATE lines SET cleared=1, reconcile_id=NULL WHERE reconcile_id=?').run(r.id);
    db.prepare('DELETE FROM reconciliations WHERE id=?').run(r.id);
  });
}

function listReconciliations(db, cid, accountId) {
  return db.prepare('SELECT * FROM reconciliations WHERE company_id=? AND account_id=? ORDER BY statement_date DESC, id DESC').all(cid, Number(accountId));
}

// ---------- reports ----------
function fyStart(company, asOf) {
  const m = company.fiscal_year_start || 1;
  const y = Number(asOf.slice(0, 4));
  const mo = Number(asOf.slice(5, 7));
  const year = mo >= m ? y : y - 1;
  return `${year}-${String(m).padStart(2, '0')}-01`;
}

function sums(db, cid, from, to) {
  return db.prepare(`SELECT a.id, a.code, a.name, a.type, a.subtype, a.system_key, COALESCE(SUM(l.amount),0) raw
    FROM accounts a LEFT JOIN lines l ON l.account_id=a.id AND l.entry_id IN (SELECT id FROM entries WHERE company_id=? AND date>=? AND date<=?)
    WHERE a.company_id=? GROUP BY a.id ORDER BY a.code='', a.code, a.name`).all(cid, from || '0000-01-01', to || '9999-12-31', cid);
}

function section(rows, subtypes) {
  const items = rows.filter((r) => subtypes.includes(r.subtype)).map((r) => ({ id: r.id, code: r.code, name: r.name, amount: natural(r.type, r.raw) })).filter((r) => r.amount !== 0);
  return { items, total: items.reduce((s, r) => s + r.amount, 0) };
}

function profitAndLoss(db, cid, from, to) {
  const rows = sums(db, cid, from, to);
  const income = section(rows, ['income']);
  const cogs = section(rows, ['cogs']);
  const expense = section(rows, ['expense']);
  const otherIncome = section(rows, ['other_income']);
  const otherExpense = section(rows, ['other_expense']);
  const gross = income.total - cogs.total;
  const operating = gross - expense.total;
  const net = operating + otherIncome.total - otherExpense.total;
  return { from, to, income, cogs, gross, expense, operating, otherIncome, otherExpense, net };
}

function netIncome(db, cid, from, to) {
  const r = db.prepare(`SELECT COALESCE(SUM(l.amount),0) n FROM lines l JOIN entries e ON e.id=l.entry_id JOIN accounts a ON a.id=l.account_id
    WHERE e.company_id=? AND e.date>=? AND e.date<=? AND a.type IN ('income','expense')`).get(cid, from, to).n;
  return -r;
}

function balanceSheet(db, cid, asOf) {
  asOf = asOf || today();
  const co = getCompany(db, cid);
  const start = fyStart(co, asOf);
  const rows = sums(db, cid, null, asOf);
  const assets = section(rows, ['bank', 'ar', 'current_asset', 'fixed_asset', 'other_asset']);
  const liabilities = section(rows, ['credit_card', 'ap', 'current_liability', 'long_term_liability']);
  const equity = section(rows, ['equity']);
  const priorEarnings = netIncome(db, cid, '0000-01-01', addDays(start, -1));
  const currentEarnings = netIncome(db, cid, start, asOf);
  // Prior years' profit rolls into Retained Earnings automatically.
  const re = systemAccount(db, cid, 'retained_earnings');
  const reItem = equity.items.find((i) => i.id === re.id);
  if (reItem) reItem.amount += priorEarnings; else if (priorEarnings) equity.items.push({ id: re.id, code: re.code, name: re.name, amount: priorEarnings });
  equity.items.push({ id: null, code: '', name: 'Net Income (this fiscal year)', amount: currentEarnings });
  equity.total += priorEarnings + currentEarnings;
  return { asOf, fiscalYearStart: start, assets, liabilities, equity, liabilitiesAndEquity: liabilities.total + equity.total, balanced: assets.total === liabilities.total + equity.total };
}

function trialBalance(db, cid, asOf) {
  const rows = sums(db, cid, null, asOf || today()).filter((r) => r.raw !== 0)
    .map((r) => ({ id: r.id, code: r.code, name: r.name, debit: r.raw > 0 ? r.raw : 0, credit: r.raw < 0 ? -r.raw : 0 }));
  return { asOf: asOf || today(), rows, debit: rows.reduce((s, r) => s + r.debit, 0), credit: rows.reduce((s, r) => s + r.credit, 0) };
}

function register(db, cid, accountId, from, to) {
  const acct = getAccount(db, cid, accountId);
  const opening = db.prepare(`SELECT COALESCE(SUM(l.amount),0) n FROM lines l JOIN entries e ON e.id=l.entry_id
    WHERE l.account_id=? AND e.date<?`).get(acct.id, from || '0000-01-01').n;
  const rows = db.prepare(`SELECT l.id line_id, l.amount, l.memo line_memo, l.cleared, e.id entry_id, e.date, e.memo, e.ref, e.source,
      c.name contact_name,
      (SELECT GROUP_CONCAT(a2.name, ', ') FROM lines l2 JOIN accounts a2 ON a2.id=l2.account_id WHERE l2.entry_id=e.id AND l2.account_id<>l.account_id) other
    FROM lines l JOIN entries e ON e.id=l.entry_id LEFT JOIN contacts c ON c.id=COALESCE(l.contact_id, e.contact_id)
    WHERE l.account_id=? AND e.date>=? AND e.date<=? ORDER BY e.date, e.id, l.id`).all(acct.id, from || '0000-01-01', to || '9999-12-31');
  let bal = natural(acct.type, opening);
  const out = rows.map((r) => { const amt = natural(acct.type, r.amount); bal += amt; return { ...r, natural: amt, balance: bal }; });
  return { account: acct, opening: natural(acct.type, opening), rows: out, closing: bal };
}

function aging(db, cid, kind, asOf) {
  asOf = asOf || today();
  const docs = kind === 'ap' ? listBills(db, cid, { status: 'unpaid' }) : listInvoices(db, cid, { status: 'unpaid' });
  const buckets = ['current', '1-30', '31-60', '61-90', '90+'];
  const byContact = new Map();
  for (const d of docs) {
    if (d.date > asOf) continue;
    const late = daysBetween(d.due_date, asOf);
    const b = late <= 0 ? 'current' : late <= 30 ? '1-30' : late <= 60 ? '31-60' : late <= 90 ? '61-90' : '90+';
    const row = byContact.get(d.contact_id) || { contact_id: d.contact_id, name: d.contact_name, total: 0, docs: [], ...Object.fromEntries(buckets.map((x) => [x, 0])) };
    row[b] += d.balance; row.total += d.balance; row.docs.push({ id: d.id, number: d.number, date: d.date, due_date: d.due_date, balance: d.balance, bucket: b });
    byContact.set(d.contact_id, row);
  }
  const rows = [...byContact.values()].sort((a, b) => a.name.localeCompare(b.name));
  const totals = Object.fromEntries([...buckets, 'total'].map((b) => [b, rows.reduce((s, r) => s + r[b], 0)]));
  // Ledger balance of A/R or A/P (includes history imported from QuickBooks that has no invoice/bill documents).
  const ctl = systemAccount(db, cid, kind === 'ap' ? 'ap' : 'ar');
  const raw = db.prepare('SELECT COALESCE(SUM(l.amount),0) n FROM lines l JOIN entries e ON e.id=l.entry_id WHERE l.account_id=? AND e.date<=?').get(ctl.id, asOf).n;
  return { asOf, buckets, rows, totals, ledgerBalance: natural(ctl.type, raw) };
}

function byContactReport(db, cid, kind, from, to) {
  // Sales by customer (income credited on entries with that customer) or spending by vendor (expenses debited).
  const types = kind === 'vendor' ? "('expense')" : "('income')";
  const rows = db.prepare(`SELECT COALESCE(c.name, '(no name)') name, c.id contact_id, SUM(l.amount) raw FROM lines l JOIN entries e ON e.id=l.entry_id
    JOIN accounts a ON a.id=l.account_id LEFT JOIN contacts c ON c.id=e.contact_id
    WHERE e.company_id=? AND e.date>=? AND e.date<=? AND a.type IN ${types} GROUP BY c.id ORDER BY ABS(SUM(l.amount)) DESC`).all(cid, from, to);
  return rows.map((r) => ({ ...r, amount: kind === 'vendor' ? r.raw : -r.raw }));
}

function monthly(db, cid, months = 12) {
  const end = today();
  const d = new Date(end.slice(0, 7) + '-01T00:00:00Z');
  d.setUTCMonth(d.getUTCMonth() - (months - 1));
  const start = d.toISOString().slice(0, 10);
  const rows = db.prepare(`SELECT substr(e.date,1,7) month,
      -SUM(CASE WHEN a.type='income' THEN l.amount ELSE 0 END) income,
      SUM(CASE WHEN a.type='expense' THEN l.amount ELSE 0 END) expense
    FROM lines l JOIN entries e ON e.id=l.entry_id JOIN accounts a ON a.id=l.account_id
    WHERE e.company_id=? AND e.date>=? AND e.date<=? GROUP BY month ORDER BY month`).all(cid, start, end);
  const out = [];
  for (let i = 0; i < months; i++) {
    const m = d.toISOString().slice(0, 7);
    const r = rows.find((x) => x.month === m) || { income: 0, expense: 0 };
    out.push({ month: m, income: r.income, expense: r.expense, net: r.income - r.expense });
    d.setUTCMonth(d.getUTCMonth() + 1);
  }
  return out;
}

function dashboard(db, cid) {
  const t = today();
  const co = getCompany(db, cid);
  const accounts = listAccounts(db, cid).filter((a) => ['bank', 'credit_card'].includes(a.subtype) && a.is_active);
  const review = db.prepare("SELECT account_id, COUNT(*) n FROM bank_txns WHERE company_id=? AND status='new' GROUP BY account_id").all(cid);
  const ar = aging(db, cid, 'ar', t);
  const ap = aging(db, cid, 'ap', t);
  return {
    company: co,
    accounts: accounts.map((a) => ({ id: a.id, name: a.name, subtype: a.subtype, balance: a.balance, toReview: review.find((r) => r.account_id === a.id)?.n || 0 })),
    toReview: review.reduce((s, r) => s + r.n, 0),
    monthPnl: profitAndLoss(db, cid, t.slice(0, 7) + '-01', t),
    ytdPnl: profitAndLoss(db, cid, fyStart(co, t), t),
    ar: { total: ar.ledgerBalance, overdue: ar.totals.total - ar.totals.current },
    ap: { total: ap.ledgerBalance, overdue: ap.totals.total - ap.totals.current },
    monthly: monthly(db, cid, 12),
  };
}

module.exports = {
  UserError, fail, toCents, isDate, today, addDays, natural, TYPES, SUBTYPE_LABELS, DEFAULT_ACCOUNTS,
  createCompany, updateCompany, getCompany, systemAccount,
  getAccount, saveAccount, deleteAccount, listAccounts,
  saveContact, findOrCreateContact, getContact, listContacts, deleteContact,
  insertEntry, getEntry, saveJournal, deleteEntry, listEntries, checkOpenPeriod,
  saveInvoice, getInvoice, listInvoices, voidInvoice, deleteInvoice,
  saveBill, getBill, listBills, deleteBill,
  savePayment, getPayment, listPayments, deletePayment,
  suggestFor, importBankRows, getBankTxn, postBankTxn, bankMatches, matchBankTxn, excludeBankTxn, undoBankTxn,
  listBankTxns, refreshSuggestions, saveRule, listRules,
  reconcileData, finishReconcile, undoReconcile, listReconciliations,
  fyStart, profitAndLoss, balanceSheet, trialBalance, register, aging, byContactReport, monthly, dashboard,
};
