'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { open } = require('../lib/db');
const L = require('../lib/ledger');
const I = require('../lib/importers');

function setup() {
  const db = open(':memory:');
  const cid = L.createCompany(db, { name: 'Test Fab', sales_tax_rate: 6 });
  const a = (name) => db.prepare('SELECT id FROM accounts WHERE company_id=? AND name=?').get(cid, name).id;
  return { db, cid, a };
}
const bsBalanced = (db, cid, asOf) => {
  const bs = L.balanceSheet(db, cid, asOf);
  assert.equal(bs.assets.total, bs.liabilitiesAndEquity, 'balance sheet must balance');
  return bs;
};

test('money parsing', () => {
  assert.equal(L.toCents('1,234.56'), 123456);
  assert.equal(L.toCents('($12.30)'), -1230);
  assert.equal(L.toCents('-$5'), -500);
  assert.equal(L.toCents('5.00-'), -500);
  assert.equal(L.toCents(''), 0);
  assert.equal(L.toCents(0.1 + 0.2), 30);
});

test('unbalanced entries are rejected', () => {
  const { db, cid, a } = setup();
  assert.throws(() => L.saveJournal(db, cid, { date: '2026-01-05', lines: [{ account_id: a('Checking'), debit: 10 }, { account_id: a('Rent'), credit: 9 }] }), /off by 0.01|off by 1.00/);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM entries').get().n, 0);
});

test('invoice with tax, partial then full payment', () => {
  const { db, cid, a } = setup();
  const cust = L.saveContact(db, cid, { kind: 'customer', name: 'Acme' });
  const id = L.saveInvoice(db, cid, { contact_id: cust, date: '2026-03-01', lines: [
    { description: 'Railing', qty: 2, rate: '500', account_id: a('Fabrication Services'), taxable: true },
    { description: 'Install', qty: 1, rate: '200', account_id: a('Installation Services'), taxable: false }] });
  let inv = L.getInvoice(db, cid, id);
  assert.equal(inv.number, '1001');
  assert.equal(inv.subtotal, 120000);
  assert.equal(inv.tax, 6000);
  assert.equal(inv.total, 126000);
  assert.equal(inv.due_date, '2026-03-31');
  assert.equal(L.listContacts(db, cid, 'customer')[0].balance, 126000);

  L.savePayment(db, cid, { kind: 'received', contact_id: cust, date: '2026-03-10', amount: '1000', account_id: a('Checking'), apps: [{ doc_id: id, amount: '1000' }] });
  inv = L.getInvoice(db, cid, id);
  assert.equal(inv.balance, 26000);
  assert.ok(['partial', 'overdue'].includes(inv.status));
  assert.throws(() => L.savePayment(db, cid, { kind: 'received', contact_id: cust, date: '2026-03-11', amount: '300', account_id: a('Checking'), apps: [{ doc_id: id, amount: '300' }] }), /Only 260.00 is open/);
  L.savePayment(db, cid, { kind: 'received', contact_id: cust, date: '2026-03-12', amount: '260', account_id: a('Checking'), apps: [{ doc_id: id, amount: '260' }] });
  assert.equal(L.getInvoice(db, cid, id).status, 'paid');

  const pnl = L.profitAndLoss(db, cid, '2026-01-01', '2026-12-31');
  assert.equal(pnl.income.total, 120000);
  assert.equal(pnl.net, 120000);
  const bs = bsBalanced(db, cid, '2026-12-31');
  assert.equal(bs.liabilities.total, 6000); // sales tax owed
  assert.equal(L.register(db, cid, a('Checking')).closing, 126000);
  assert.throws(() => L.deleteInvoice(db, cid, id), /payments/);
});

test('editing an invoice rewrites its entry', () => {
  const { db, cid, a } = setup();
  const cust = L.saveContact(db, cid, { kind: 'customer', name: 'Acme' });
  const id = L.saveInvoice(db, cid, { contact_id: cust, date: '2026-03-01', tax_rate: 0, lines: [{ qty: 1, rate: '100', account_id: a('Sales') }] });
  L.saveInvoice(db, cid, { id, contact_id: cust, date: '2026-03-02', tax_rate: 0, lines: [{ qty: 3, rate: '100', account_id: a('Sales') }] });
  assert.equal(db.prepare("SELECT COUNT(*) n FROM entries WHERE source='invoice'").get().n, 1);
  assert.equal(L.profitAndLoss(db, cid, '2026-01-01', '2026-12-31').income.total, 30000);
  L.voidInvoice(db, cid, id);
  assert.equal(L.profitAndLoss(db, cid, '2026-01-01', '2026-12-31').income.total, 0);
  assert.equal(L.getInvoice(db, cid, id).status, 'void');
});

test('bills and bill payments, aging', () => {
  const { db, cid, a } = setup();
  const v = L.saveContact(db, cid, { kind: 'vendor', name: 'Steel Supply' });
  const id = L.saveBill(db, cid, { contact_id: v, date: '2026-01-10', due_date: '2026-02-10', number: 'S-55', lines: [{ amount: '800', account_id: a('Materials & Steel') }] });
  const ag = L.aging(db, cid, 'ap', '2026-03-01');
  assert.equal(ag.totals['1-30'], 80000);
  assert.equal(ag.ledgerBalance, 80000);
  L.savePayment(db, cid, { kind: 'paid', contact_id: v, date: '2026-03-02', amount: '800', account_id: a('Checking'), apps: [{ doc_id: id, amount: '800' }] });
  assert.equal(L.getBill(db, cid, id).status, 'paid');
  assert.equal(L.aging(db, cid, 'ap', '2026-03-05').ledgerBalance, 0);
  const pnl = L.profitAndLoss(db, cid, '2026-01-01', '2026-12-31');
  assert.equal(pnl.cogs.total, 80000);
  assert.equal(pnl.gross, -80000);
  bsBalanced(db, cid, '2026-12-31');
});

test('bank import: dedupe, categorize, learn, match, undo', () => {
  const { db, cid, a } = setup();
  const csv = `Date,Description,Amount
01/05/2026,CONSUMERS ENERGY PAYMENT 1234,-210.55
01/06/2026,DEPOSIT,1500.00
01/07/2026,HOME DEPOT #4521,-89.10
01/07/2026,HOME DEPOT #4521,-89.10`;
  const rows = I.parseBankCSV(csv);
  assert.equal(rows.length, 4);
  assert.equal(rows[0].amount, -21055);
  let r = L.importBankRows(db, cid, a('Checking'), rows, 'jan.csv');
  assert.equal(r.added, 4); // the two identical Home Depot lines are both kept
  r = L.importBankRows(db, cid, a('Checking'), rows, 'jan-again.csv');
  assert.equal(r.added, 0);
  assert.equal(r.dupes, 4);

  const list = L.listBankTxns(db, cid, a('Checking'), 'new');
  const hd = list.filter((t) => t.description.startsWith('HOME DEPOT'));
  L.postBankTxn(db, cid, hd[0].id, { account_id: a('Shop Supplies & Consumables') });
  // History now suggests the same category for a similar line.
  const s = L.suggestFor(db, cid, { description: 'HOME DEPOT #9999', amount: -1000 });
  assert.equal(s.account_id, a('Shop Supplies & Consumables'));
  assert.equal(s.source, 'history');

  // A rule beats history.
  const ce = list.find((t) => t.description.startsWith('CONSUMERS'));
  L.postBankTxn(db, cid, ce.id, { account_id: a('Utilities'), make_rule: true, rule_text: 'consumers energy' });
  assert.equal(L.suggestFor(db, cid, { description: 'Consumers Energy autopay', amount: -5 }).source, 'rule');

  // Deposit matches an open invoice for the same amount.
  const cust = L.saveContact(db, cid, { kind: 'customer', name: 'Acme' });
  const inv = L.saveInvoice(db, cid, { contact_id: cust, date: '2026-01-02', tax_rate: 0, lines: [{ qty: 1, rate: '1500', account_id: a('Sales') }] });
  const dep = list.find((t) => t.description === 'DEPOSIT');
  const m = L.bankMatches(db, cid, dep.id);
  assert.equal(m.docs.length, 1);
  L.matchBankTxn(db, cid, dep.id, { doc_type: 'invoice', doc_id: inv });
  assert.equal(L.getInvoice(db, cid, inv).status, 'paid');

  assert.equal(L.register(db, cid, a('Checking')).closing, -21055 + 150000 - 8910);
  // Undo sends the line back to review and removes its entry.
  L.undoBankTxn(db, cid, hd[0].id);
  assert.equal(L.getBankTxn(db, cid, hd[0].id).status, 'new');
  assert.equal(L.register(db, cid, a('Checking')).closing, -21055 + 150000);
  // Undoing the matched deposit keeps the payment but un-clears it.
  L.undoBankTxn(db, cid, dep.id);
  assert.equal(L.getInvoice(db, cid, inv).status, 'paid');
  bsBalanced(db, cid, '2026-12-31');
});

test('bank match to an existing manual entry', () => {
  const { db, cid, a } = setup();
  L.saveJournal(db, cid, { date: '2026-02-01', memo: 'Check 101 rent', lines: [{ account_id: a('Rent'), debit: 1200 }, { account_id: a('Checking'), credit: 1200 }] });
  L.importBankRows(db, cid, a('Checking'), [{ date: '2026-02-03', amount: -120000, description: 'CHECK 101' }], 'x');
  const t = L.listBankTxns(db, cid, a('Checking'), 'new')[0];
  const m = L.bankMatches(db, cid, t.id);
  assert.equal(m.lines.length, 1);
  L.matchBankTxn(db, cid, t.id, { line_id: m.lines[0].line_id });
  assert.equal(L.register(db, cid, a('Checking')).closing, -120000); // not double counted
});

test('bank CSV variants and OFX', () => {
  const debitCredit = I.parseBankCSV(`Account history\n\nPosting Date,Description,Debit,Credit,Balance\n2026-01-02,FUEL,45.00,,955\n2026-01-03,TRANSFER IN,,500.00,1455`);
  assert.deepEqual(debitCredit.map((r) => r.amount), [-4500, 50000]);
  const flipped = I.parseBankCSV(`Transaction Date,Description,Amount\n1/2/26,AMAZON,25.99`, { flip: true });
  assert.equal(flipped[0].amount, -2599);
  assert.equal(flipped[0].date, '2026-01-02');
  const ofx = I.parseOFX(`OFXHEADER:100\n<OFX><BANKMSGSRSV1><STMTTRNRS><STMTRS><BANKTRANLIST>
<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20260110120000[-5:EST]<TRNAMT>-42.17<FITID>A1<NAME>MENARDS<MEMO>STORE 3</STMTTRN>
<STMTTRN><TRNTYPE>CREDIT<DTPOSTED>20260111<TRNAMT>100.00<FITID>A2<NAME>Interest &amp; More</STMTTRN></BANKTRANLIST></STMTRS></STMTTRNRS></BANKMSGSRSV1></OFX>`);
  assert.equal(ofx.length, 2);
  assert.deepEqual(ofx[0], { date: '2026-01-10', amount: -4217, description: 'MENARDS STORE 3', fitid: 'A1' });
  assert.equal(ofx[1].description, 'Interest & More');
});

test('closing date locks the books', () => {
  const { db, cid, a } = setup();
  L.updateCompany(db, cid, { closing_date: '2025-12-31' });
  assert.throws(() => L.saveJournal(db, cid, { date: '2025-12-15', lines: [{ account_id: a('Checking'), debit: 1 }, { account_id: a('Sales'), credit: 1 }] }), /closed/);
  L.saveJournal(db, cid, { date: '2026-01-01', lines: [{ account_id: a('Checking'), debit: 1 }, { account_id: a('Sales'), credit: 1 }] });
});

test('reconcile', () => {
  const { db, cid, a } = setup();
  const e1 = L.saveJournal(db, cid, { date: '2026-01-02', lines: [{ account_id: a('Checking'), debit: 1000 }, { account_id: a('Owner Equity'), credit: 1000 }] });
  L.saveJournal(db, cid, { date: '2026-01-05', lines: [{ account_id: a('Rent'), debit: 300 }, { account_id: a('Checking'), credit: 300 }] });
  L.saveJournal(db, cid, { date: '2026-01-25', lines: [{ account_id: a('Fuel & Vehicle'), debit: 50 }, { account_id: a('Checking'), credit: 50 }] });
  const r = L.reconcileData(db, cid, a('Checking'), '2026-01-31');
  assert.equal(r.items.length, 3);
  const ids = r.items.filter((i) => i.natural !== -5000).map((i) => i.id);
  assert.throws(() => L.finishReconcile(db, cid, { account_id: a('Checking'), statement_date: '2026-01-31', statement_balance: '650', line_ids: ids }), /off by/);
  L.finishReconcile(db, cid, { account_id: a('Checking'), statement_date: '2026-01-31', statement_balance: '700', line_ids: ids });
  assert.equal(L.reconcileData(db, cid, a('Checking'), '2026-02-28').opening, 70000);
  assert.throws(() => L.deleteEntry(db, cid, e1), /reconciled/);
});

test('retained earnings roll forward at fiscal year end', () => {
  const { db, cid, a } = setup();
  L.saveJournal(db, cid, { date: '2025-06-01', lines: [{ account_id: a('Checking'), debit: 5000 }, { account_id: a('Sales'), credit: 5000 }] });
  L.saveJournal(db, cid, { date: '2026-02-01', lines: [{ account_id: a('Checking'), debit: 700 }, { account_id: a('Sales'), credit: 700 }] });
  const bs = bsBalanced(db, cid, '2026-03-01');
  assert.equal(bs.equity.items.find((i) => i.name === 'Retained Earnings').amount, 500000);
  assert.equal(bs.equity.items.find((i) => i.name.startsWith('Net Income')).amount, 70000);
});

test('nested transaction rolls back cleanly', () => {
  const { db, cid, a } = setup();
  const v = L.saveContact(db, cid, { kind: 'vendor', name: 'V' });
  L.importBankRows(db, cid, a('Checking'), [{ date: '2026-01-02', amount: -5000, description: 'X' }], 'x');
  const t = L.listBankTxns(db, cid, a('Checking'), 'new')[0];
  const bill = L.saveBill(db, cid, { contact_id: v, date: '2026-01-01', lines: [{ amount: '60', account_id: a('Rent') }] });
  assert.throws(() => L.matchBankTxn(db, cid, t.id, { doc_type: 'bill', doc_id: bill }), /Amounts differ/);
  assert.equal(L.getBankTxn(db, cid, t.id).status, 'new');
  assert.equal(db.prepare('SELECT COUNT(*) n FROM payments').get().n, 0);
});

test('QuickBooks Online import: accounts, contacts, journal', () => {
  const db = open(':memory:');
  const cid = L.createCompany(db, { name: 'QB Co', blank: true });
  const accounts = `Account List
QB Co

Full name,Type,Detail type,Description,Total balance
Business Checking,Bank,Checking,,"12,000.00"
Accounts Receivable (A/R),Accounts receivable (A/R),Accounts Receivable (A/R),,500.00
Accounts Payable (A/P),Accounts payable (A/P),Accounts Payable (A/P),,0.00
Visa,Credit Card,Credit Card,,0.00
Sales of Product Income,Income,Sales of Product Income,,
Job Materials,Cost of Goods Sold,Supplies & Materials - COGS,,
Utilities:Electric,Expenses,Utilities,,
Opening Balance Equity,Equity,Opening Balance Equity,,
`;
  const ra = I.importQBAccounts(db, cid, accounts, 'accounts.csv');
  assert.equal(ra.added, 7); // Opening Balance Equity already existed
  assert.equal(ra.updated, 1);
  // QuickBooks' A/R and A/P replaced our unused built-ins.
  assert.equal(L.systemAccount(db, cid, 'ar').name, 'Accounts Receivable (A/R)');
  assert.equal(L.systemAccount(db, cid, 'ap').name, 'Accounts Payable (A/P)');
  assert.equal(db.prepare("SELECT subtype FROM accounts WHERE company_id=? AND name='Visa'").get(cid).subtype, 'credit_card');

  const cust = `Customer,Phone Numbers,Email,Full Name,Billing Address
Acme Corp,616-555-0100,ap@acme.test,Acme Corp,"1 Main St, Zeeland, MI 49464"
`;
  assert.equal(I.importQBContacts(db, cid, 'customer', cust, 'c.csv').added, 1);

  const journal = `QB Co
Journal
All Dates

,Date,Transaction Type,Num,Name,Memo/Description,Account,Debit,Credit
,01/01/2025,Deposit,,,Opening,Business Checking,"10,000.00",
,,,,,Opening,Opening Balance Equity,,"10,000.00"
,,,,,,,"$10,000.00","$10,000.00"

,01/15/2025,Invoice,1001,Acme Corp,,Accounts Receivable (A/R),500.00,
,,,,Acme Corp,Railing,Sales of Product Income,,500.00
,,,,,,,$500.00,$500.00

,02/01/2025,Expense,,Consumers Energy,,Visa,,120.00
,,,,Consumers Energy,Jan power,Utilities:Electric,120.00,
,,,,,,,$120.00,$120.00

,02/03/2025,Bill,77,Steel Depot,,Accounts Payable (A/P),,300.00
,,,,Steel Depot,Plate,Job Materials,300.00,
,,,,,,,$300.00,$300.00

,03/01/2025,Journal Entry,J1,,Broken,Business Checking,1.00,
,,,,,,,1.00,

TOTAL,,,,,,,"$10,921.00","$10,920.00"
`;
  const rj = I.importQBJournal(db, cid, journal, 'journal.csv');
  assert.equal(rj.imported, 4);
  assert.equal(rj.unbalanced, 1);
  const pnl = L.profitAndLoss(db, cid, '2025-01-01', '2025-12-31');
  assert.equal(pnl.income.total, 50000);
  assert.equal(pnl.cogs.total, 30000);
  assert.equal(pnl.expense.total, 12000);
  const bs = bsBalanced(db, cid, '2025-12-31');
  assert.equal(bs.assets.total, 1050000);
  const acme = L.listContacts(db, cid, 'customer').find((c) => c.name === 'Acme Corp');
  assert.equal(acme.balance, 50000);
  const steel = L.listContacts(db, cid, 'vendor').find((c) => c.name === 'Steel Depot');
  assert.equal(steel.balance, 30000);
  assert.equal(L.aging(db, cid, 'ar', '2025-12-31').ledgerBalance, 50000);

  // Undo removes it all.
  I.undoBatch(db, cid, rj.batch);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM entries WHERE company_id=?').get(cid).n, 0);
});

test('QuickBooks Desktop journal (Trans # column, "1000 · Checking" names)', () => {
  const db = open(':memory:');
  const cid = L.createCompany(db, { name: 'Desk', blank: true });
  const journal = `Trans #,Type,Date,Num,Name,Memo,Account,Debit,Credit
12,Check,03/04/2025,1050,Menards,,1000 · Checking,,45.10
12,Check,03/04/2025,1050,Menards,Tools,6400 · Small Tools,45.10,
,,,,,,,45.10,45.10
13,Deposit,03/05/2025,,,,1000 · Checking,900.00,
13,Deposit,03/05/2025,,Bob,Gate,4000 · Fabrication Sales,,900.00
`;
  const r = I.importQBJournal(db, cid, journal, 'desk.csv');
  assert.equal(r.imported, 2);
  assert.equal(db.prepare("SELECT subtype FROM accounts WHERE company_id=? AND name='Checking'").get(cid).subtype, 'bank');
  assert.equal(db.prepare("SELECT subtype FROM accounts WHERE company_id=? AND name='Fabrication Sales'").get(cid).subtype, 'income');
  assert.equal(L.profitAndLoss(db, cid, '2025-01-01', '2025-12-31').net, 90000 - 4510);
});

test('multiple companies are isolated', () => {
  const { db, cid, a } = setup();
  const cid2 = L.createCompany(db, { name: 'Second Biz' });
  assert.throws(() => L.saveJournal(db, cid2, { date: '2026-01-01', lines: [{ account_id: a('Checking'), debit: 1 }, { account_id: a('Sales'), credit: 1 }] }), /Account not found/);
});
