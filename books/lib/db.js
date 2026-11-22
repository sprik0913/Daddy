'use strict';
// Database setup. Uses Node's built-in SQLite (Node 22.13+), so there is nothing to install.
const { DatabaseSync } = require('node:sqlite');
const fs = require('node:fs');
const path = require('node:path');

const SCHEMA = `
PRAGMA foreign_keys = ON;
PRAGMA journal_mode = WAL;

CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT);
CREATE TABLE IF NOT EXISTS sessions (token TEXT PRIMARY KEY, created_at TEXT NOT NULL);

CREATE TABLE IF NOT EXISTS companies (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  address TEXT DEFAULT '', email TEXT DEFAULT '', phone TEXT DEFAULT '',
  fiscal_year_start INTEGER NOT NULL DEFAULT 1,         -- month 1-12
  sales_tax_rate REAL NOT NULL DEFAULT 0,               -- percent, e.g. 6
  next_invoice_no INTEGER NOT NULL DEFAULT 1001,
  closing_date TEXT DEFAULT NULL,                       -- no changes on/before this date
  invoice_terms_days INTEGER NOT NULL DEFAULT 30,
  invoice_footer TEXT DEFAULT 'Thank you for your business!',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- type: asset | liability | equity | income | expense
-- subtype: bank, credit_card, ar, ap, current_asset, fixed_asset, other_asset,
--          current_liability, long_term_liability, equity, income, other_income,
--          cogs, expense, other_expense
CREATE TABLE IF NOT EXISTS accounts (
  id INTEGER PRIMARY KEY,
  company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  code TEXT DEFAULT '',
  name TEXT NOT NULL,
  type TEXT NOT NULL,
  subtype TEXT NOT NULL,
  description TEXT DEFAULT '',
  system_key TEXT DEFAULT NULL,  -- ar, ap, sales_tax, retained_earnings, opening_balance, uncategorized_income, uncategorized_expense
  is_active INTEGER NOT NULL DEFAULT 1,
  UNIQUE(company_id, name)
);

CREATE TABLE IF NOT EXISTS contacts (
  id INTEGER PRIMARY KEY,
  company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,            -- customer | vendor
  name TEXT NOT NULL,
  email TEXT DEFAULT '', phone TEXT DEFAULT '', address TEXT DEFAULT '', notes TEXT DEFAULT '',
  default_account_id INTEGER REFERENCES accounts(id) ON DELETE SET NULL,
  is_active INTEGER NOT NULL DEFAULT 1,
  UNIQUE(company_id, kind, name)
);

-- Every money movement is a journal entry whose lines sum to zero.
-- amount is in cents: positive = debit, negative = credit.
CREATE TABLE IF NOT EXISTS entries (
  id INTEGER PRIMARY KEY,
  company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  date TEXT NOT NULL,
  memo TEXT DEFAULT '',
  ref TEXT DEFAULT '',
  source TEXT NOT NULL DEFAULT 'manual', -- manual, invoice, bill, payment, bank, qb_import, opening
  contact_id INTEGER REFERENCES contacts(id) ON DELETE SET NULL,
  import_batch INTEGER DEFAULT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS entries_company_date ON entries(company_id, date);

CREATE TABLE IF NOT EXISTS lines (
  id INTEGER PRIMARY KEY,
  entry_id INTEGER NOT NULL REFERENCES entries(id) ON DELETE CASCADE,
  account_id INTEGER NOT NULL REFERENCES accounts(id),
  amount INTEGER NOT NULL,
  memo TEXT DEFAULT '',
  contact_id INTEGER REFERENCES contacts(id) ON DELETE SET NULL,
  cleared INTEGER NOT NULL DEFAULT 0,   -- 0 no, 1 cleared, 2 reconciled
  reconcile_id INTEGER DEFAULT NULL
);
CREATE INDEX IF NOT EXISTS lines_account ON lines(account_id);
CREATE INDEX IF NOT EXISTS lines_entry ON lines(entry_id);

CREATE TABLE IF NOT EXISTS invoices (
  id INTEGER PRIMARY KEY,
  company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  contact_id INTEGER NOT NULL REFERENCES contacts(id),
  number TEXT NOT NULL,
  date TEXT NOT NULL, due_date TEXT NOT NULL,
  memo TEXT DEFAULT '',
  tax_rate REAL NOT NULL DEFAULT 0,
  subtotal INTEGER NOT NULL DEFAULT 0, tax INTEGER NOT NULL DEFAULT 0, total INTEGER NOT NULL DEFAULT 0,
  entry_id INTEGER REFERENCES entries(id) ON DELETE SET NULL,
  voided INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS invoice_lines (
  id INTEGER PRIMARY KEY,
  invoice_id INTEGER NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  description TEXT DEFAULT '',
  qty REAL NOT NULL DEFAULT 1,
  rate INTEGER NOT NULL DEFAULT 0,
  amount INTEGER NOT NULL DEFAULT 0,
  account_id INTEGER NOT NULL REFERENCES accounts(id),
  taxable INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS bills (
  id INTEGER PRIMARY KEY,
  company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  contact_id INTEGER NOT NULL REFERENCES contacts(id),
  number TEXT DEFAULT '',
  date TEXT NOT NULL, due_date TEXT NOT NULL,
  memo TEXT DEFAULT '',
  total INTEGER NOT NULL DEFAULT 0,
  entry_id INTEGER REFERENCES entries(id) ON DELETE SET NULL,
  voided INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS bill_lines (
  id INTEGER PRIMARY KEY,
  bill_id INTEGER NOT NULL REFERENCES bills(id) ON DELETE CASCADE,
  description TEXT DEFAULT '',
  amount INTEGER NOT NULL DEFAULT 0,
  account_id INTEGER NOT NULL REFERENCES accounts(id)
);

-- kind: received (customer pays us) | paid (we pay a vendor)
CREATE TABLE IF NOT EXISTS payments (
  id INTEGER PRIMARY KEY,
  company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  contact_id INTEGER NOT NULL REFERENCES contacts(id),
  date TEXT NOT NULL,
  amount INTEGER NOT NULL,
  account_id INTEGER NOT NULL REFERENCES accounts(id),
  method TEXT DEFAULT '', ref TEXT DEFAULT '', memo TEXT DEFAULT '',
  entry_id INTEGER REFERENCES entries(id) ON DELETE SET NULL
);
CREATE TABLE IF NOT EXISTS payment_apps (
  id INTEGER PRIMARY KEY,
  payment_id INTEGER NOT NULL REFERENCES payments(id) ON DELETE CASCADE,
  doc_type TEXT NOT NULL,  -- invoice | bill
  doc_id INTEGER NOT NULL,
  amount INTEGER NOT NULL
);

-- Imported bank / card lines waiting to be categorized.
-- amount in cents, positive = money into the account.
CREATE TABLE IF NOT EXISTS bank_txns (
  id INTEGER PRIMARY KEY,
  company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  account_id INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  date TEXT NOT NULL,
  amount INTEGER NOT NULL,
  description TEXT DEFAULT '',
  fitid TEXT DEFAULT '',
  status TEXT NOT NULL DEFAULT 'new',   -- new | posted | excluded
  entry_id INTEGER REFERENCES entries(id) ON DELETE SET NULL,
  suggested_account_id INTEGER REFERENCES accounts(id) ON DELETE SET NULL,
  suggested_contact_id INTEGER REFERENCES contacts(id) ON DELETE SET NULL,
  suggestion_source TEXT DEFAULT '',
  import_batch INTEGER DEFAULT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS bank_txns_status ON bank_txns(company_id, account_id, status);

CREATE TABLE IF NOT EXISTS rules (
  id INTEGER PRIMARY KEY,
  company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  match_text TEXT NOT NULL,
  direction TEXT NOT NULL DEFAULT 'any',  -- any | in | out
  account_id INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  contact_id INTEGER REFERENCES contacts(id) ON DELETE SET NULL,
  auto_post INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS reconciliations (
  id INTEGER PRIMARY KEY,
  company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  account_id INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  statement_date TEXT NOT NULL,
  statement_balance INTEGER NOT NULL,
  completed_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS import_batches (
  id INTEGER PRIMARY KEY,
  company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,       -- bank | qb_journal | qb_accounts | qb_contacts
  filename TEXT DEFAULT '',
  summary TEXT DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
`;

function open(file) {
  if (file !== ':memory:') fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec(SCHEMA);
  return db;
}

// Run fn inside a transaction; roll back on any error.
// Nested calls use savepoints, so helpers can call each other safely.
const depth = new WeakMap();
function tx(db, fn) {
  const d = depth.get(db) || 0;
  const sp = `sp${d}`;
  db.exec(d === 0 ? 'BEGIN' : `SAVEPOINT ${sp}`);
  depth.set(db, d + 1);
  try {
    const out = fn();
    depth.set(db, d);
    db.exec(d === 0 ? 'COMMIT' : `RELEASE ${sp}`);
    return out;
  } catch (e) {
    depth.set(db, d);
    if (d === 0) db.exec('ROLLBACK');
    else db.exec(`ROLLBACK TO ${sp}; RELEASE ${sp}`);
    throw e;
  }
}

module.exports = { open, tx };
