'use strict';
// Sprik Books server. Start with: node server.js   (or start.bat / start.sh)
// Open http://localhost:8080 on this computer, or http://<this-computer's-IP>:8080 from your phone on the same Wi-Fi.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const os = require('node:os');
const { open } = require('./lib/db');
const L = require('./lib/ledger');
const I = require('./lib/importers');
const AI = require('./lib/ai');

const PORT = Number(process.env.PORT) || 8080;
const HOST = process.env.HOST || '0.0.0.0';
const DATA_DIR = process.env.BOOKS_DATA || path.join(__dirname, 'data');
const DB_FILE = path.join(DATA_DIR, 'books.db');
const PUBLIC = path.join(__dirname, 'public');

function createApp(db, opts = {}) {
  const setting = (k) => db.prepare('SELECT value FROM settings WHERE key=?').get(k)?.value ?? null;
  const setSetting = (k, v) => db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run(k, v);

  // ----- auth -----
  const hash = (pw, salt) => crypto.scryptSync(pw, salt, 64).toString('hex');
  function checkPassword(pw) {
    const stored = setting('password');
    if (!stored) return false;
    const [salt, h] = stored.split(':');
    const a = Buffer.from(hash(String(pw), salt), 'hex');
    const b = Buffer.from(h, 'hex');
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  }
  function setPassword(pw) {
    if (!pw || String(pw).length < 6) throw new L.UserError('Use a password of at least 6 characters');
    const salt = crypto.randomBytes(16).toString('hex');
    setSetting('password', `${salt}:${hash(String(pw), salt)}`);
  }
  function newSession(res) {
    const token = crypto.randomBytes(32).toString('hex');
    db.prepare("INSERT INTO sessions (token, created_at) VALUES (?, datetime('now'))").run(token);
    res.setHeader('Set-Cookie', `sb=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${60 * 60 * 24 * 90}`);
  }
  function sessionToken(req) {
    const m = (req.headers.cookie || '').match(/(?:^|;\s*)sb=([a-f0-9]{64})/);
    return m ? m[1] : null;
  }
  function loggedIn(req) {
    if (opts.noAuth) return true;
    const t = sessionToken(req);
    if (!t) return false;
    db.prepare("DELETE FROM sessions WHERE created_at < datetime('now', '-90 days')").run();
    return !!db.prepare('SELECT 1 FROM sessions WHERE token=?').get(t);
  }

  // ----- routing -----
  const routes = [];
  const route = (method, pattern, handler, { pub = false } = {}) => {
    const keys = [];
    const re = new RegExp('^' + pattern.replace(/:(\w+)/g, (_, k) => { keys.push(k); return '([^/]+)'; }) + '$');
    routes.push({ method, re, keys, handler, pub });
  };
  const ok = (data) => data ?? { ok: true };

  route('GET', '/api/auth', (req) => ({ setup: !setting('password'), loggedIn: loggedIn(req) }), { pub: true });
  route('POST', '/api/auth/setup', (req, res, p, body) => {
    if (setting('password')) throw new L.UserError('A password is already set');
    setPassword(body.password);
    newSession(res);
    return ok();
  }, { pub: true });
  let failures = 0;
  route('POST', '/api/auth/login', async (req, res, p, body) => {
    if (!checkPassword(body.password)) {
      failures++;
      await new Promise((r) => setTimeout(r, Math.min(5000, 300 * failures)));
      throw Object.assign(new L.UserError('Wrong password'), { status: 401 });
    }
    failures = 0;
    newSession(res);
    return ok();
  }, { pub: true });
  route('POST', '/api/auth/logout', (req, res) => {
    const t = sessionToken(req);
    if (t) db.prepare('DELETE FROM sessions WHERE token=?').run(t);
    res.setHeader('Set-Cookie', 'sb=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0');
    return ok();
  }, { pub: true });
  route('POST', '/api/auth/password', (req, res, p, body) => {
    if (!checkPassword(body.current)) throw new L.UserError('Current password is wrong');
    setPassword(body.password);
    db.prepare('DELETE FROM sessions').run();
    newSession(res);
    return ok();
  });

  // ----- global settings -----
  route('GET', '/api/settings', () => ({ ai: AI.status(setting('anthropic_key')), version: require('./package.json').version, dataDir: DATA_DIR }));
  route('PUT', '/api/settings', (req, res, p, body) => {
    if (body.anthropic_key !== undefined) setSetting('anthropic_key', String(body.anthropic_key).trim());
    return ok();
  });
  route('GET', '/api/backup', (req, res) => {
    const tmp = path.join(os.tmpdir(), `books-backup-${Date.now()}.db`);
    db.exec(`VACUUM INTO '${tmp.replace(/'/g, "''")}'`);
    const data = fs.readFileSync(tmp);
    fs.unlinkSync(tmp);
    res.writeHead(200, { 'Content-Type': 'application/octet-stream', 'Content-Disposition': `attachment; filename="sprik-books-${L.today()}.db"` });
    res.end(data);
    return undefined;
  });

  // ----- companies -----
  route('GET', '/api/companies', () => db.prepare('SELECT id, name FROM companies ORDER BY name COLLATE NOCASE').all());
  route('POST', '/api/companies', (req, res, p, body) => ({ id: L.createCompany(db, body) }));
  route('GET', '/api/c/:cid', (req, res, p) => L.getCompany(db, p.cid));
  route('PUT', '/api/c/:cid', (req, res, p, body) => L.updateCompany(db, p.cid, body));
  route('DELETE', '/api/c/:cid', (req, res, p, body) => {
    const c = L.getCompany(db, p.cid);
    if (body.confirm !== c.name) throw new L.UserError('Type the company name exactly to delete it');
    db.prepare('DELETE FROM companies WHERE id=?').run(c.id);
    return ok();
  });
  route('GET', '/api/c/:cid/dashboard', (req, res, p) => L.dashboard(db, p.cid));
  route('GET', '/api/c/:cid/meta', (req, res, p) => ({
    accounts: db.prepare('SELECT id, code, name, type, subtype, system_key, is_active FROM accounts WHERE company_id=? ORDER BY code=\'\', code, name').all(p.cid),
    customers: db.prepare("SELECT id, name, email, default_account_id FROM contacts WHERE company_id=? AND kind='customer' AND is_active=1 ORDER BY name COLLATE NOCASE").all(p.cid),
    vendors: db.prepare("SELECT id, name, email, default_account_id FROM contacts WHERE company_id=? AND kind='vendor' AND is_active=1 ORDER BY name COLLATE NOCASE").all(p.cid),
    subtypes: L.SUBTYPE_LABELS,
    company: L.getCompany(db, p.cid),
  }));

  // ----- accounts -----
  route('GET', '/api/c/:cid/accounts', (req, res, p, b, q) => L.listAccounts(db, p.cid, q.asOf));
  route('POST', '/api/c/:cid/accounts', (req, res, p, body) => ({ id: L.saveAccount(db, p.cid, body) }));
  route('DELETE', '/api/c/:cid/accounts/:id', (req, res, p) => ok(L.deleteAccount(db, p.cid, p.id)));

  // ----- contacts -----
  route('GET', '/api/c/:cid/contacts', (req, res, p, b, q) => L.listContacts(db, p.cid, q.kind === 'vendor' ? 'vendor' : 'customer'));
  route('GET', '/api/c/:cid/contacts/:id', (req, res, p) => {
    const c = L.getContact(db, p.cid, p.id);
    return { ...c, docs: c.kind === 'vendor' ? L.listBills(db, p.cid, { contact_id: c.id }) : L.listInvoices(db, p.cid, { contact_id: c.id }) };
  });
  route('POST', '/api/c/:cid/contacts', (req, res, p, body) => ({ id: L.saveContact(db, p.cid, body) }));
  route('DELETE', '/api/c/:cid/contacts/:id', (req, res, p) => ok(L.deleteContact(db, p.cid, p.id)));

  // ----- journal -----
  route('GET', '/api/c/:cid/entries', (req, res, p, b, q) => L.listEntries(db, p.cid, q));
  route('GET', '/api/c/:cid/entries/:id', (req, res, p) => L.getEntry(db, p.cid, p.id));
  route('POST', '/api/c/:cid/entries', (req, res, p, body) => ({ id: L.saveJournal(db, p.cid, body) }));
  route('DELETE', '/api/c/:cid/entries/:id', (req, res, p) => ok(L.deleteEntry(db, p.cid, p.id)));

  // ----- invoices / bills / payments -----
  route('GET', '/api/c/:cid/invoices', (req, res, p, b, q) => L.listInvoices(db, p.cid, q));
  route('GET', '/api/c/:cid/invoices/:id', (req, res, p) => L.getInvoice(db, p.cid, p.id));
  route('POST', '/api/c/:cid/invoices', (req, res, p, body) => ({ id: L.saveInvoice(db, p.cid, body) }));
  route('POST', '/api/c/:cid/invoices/:id/void', (req, res, p) => ok(L.voidInvoice(db, p.cid, p.id)));
  route('DELETE', '/api/c/:cid/invoices/:id', (req, res, p) => ok(L.deleteInvoice(db, p.cid, p.id)));
  route('GET', '/api/c/:cid/bills', (req, res, p, b, q) => L.listBills(db, p.cid, q));
  route('GET', '/api/c/:cid/bills/:id', (req, res, p) => L.getBill(db, p.cid, p.id));
  route('POST', '/api/c/:cid/bills', (req, res, p, body) => ({ id: L.saveBill(db, p.cid, body) }));
  route('DELETE', '/api/c/:cid/bills/:id', (req, res, p) => ok(L.deleteBill(db, p.cid, p.id)));
  route('GET', '/api/c/:cid/payments', (req, res, p, b, q) => L.listPayments(db, p.cid, q.kind === 'paid' ? 'paid' : 'received'));
  route('GET', '/api/c/:cid/payments/:id', (req, res, p) => L.getPayment(db, p.cid, p.id));
  route('POST', '/api/c/:cid/payments', (req, res, p, body) => ({ id: L.savePayment(db, p.cid, body) }));
  route('DELETE', '/api/c/:cid/payments/:id', (req, res, p) => ok(L.deletePayment(db, p.cid, p.id)));

  // ----- banking -----
  route('GET', '/api/c/:cid/bank/:acct', (req, res, p, b, q) => L.listBankTxns(db, p.cid, p.acct, q.status));
  route('POST', '/api/c/:cid/bank/:acct/import', (req, res, p, body) => {
    const rows = I.parseBankFile(body.filename, body.text || '', { flip: !!body.flip, dmy: !!body.dmy });
    if (!rows.length) throw new L.UserError('No transactions found in this file');
    return L.importBankRows(db, p.cid, p.acct, rows, body.filename);
  });
  route('POST', '/api/c/:cid/bank/:acct/refresh', (req, res, p) => ok(L.refreshSuggestions(db, p.cid, p.acct)));
  route('POST', '/api/c/:cid/bank/:acct/accept', (req, res, p, body) => {
    // Post every selected line that has a suggestion.
    let posted = 0;
    const errors = [];
    for (const id of body.ids || []) {
      const t = L.getBankTxn(db, p.cid, id);
      if (t.status !== 'new' || !t.suggested_account_id) continue;
      try { L.postBankTxn(db, p.cid, t.id, { account_id: t.suggested_account_id, contact_id: t.suggested_contact_id }); posted++; } catch (e) { errors.push(`${t.description}: ${e.message}`); }
    }
    return { posted, errors };
  });
  route('POST', '/api/c/:cid/bank/:acct/ai', async (req, res, p, body) => {
    const co = L.getCompany(db, p.cid);
    const all = L.listBankTxns(db, p.cid, p.acct, 'new');
    const todo = (body.ids?.length ? all.filter((t) => body.ids.includes(t.id)) : all.filter((t) => !t.suggested_account_id)).slice(0, 150);
    if (!todo.length) return { suggested: 0 };
    const accounts = db.prepare("SELECT id, name, type, subtype FROM accounts WHERE company_id=? AND is_active=1 AND id<>? AND COALESCE(system_key,'') NOT IN ('ar','ap')").all(p.cid, Number(p.acct));
    const examples = db.prepare(`SELECT b.description, b.amount, l.account_id, a.name account_name FROM bank_txns b JOIN lines l ON l.entry_id=b.entry_id AND l.account_id<>b.account_id
      JOIN accounts a ON a.id=l.account_id WHERE b.company_id=? AND b.status='posted' GROUP BY b.description ORDER BY MAX(b.date) DESC LIMIT 60`).all(p.cid);
    const results = await AI.categorize({ apiKey: setting('anthropic_key'), companyName: co.name, txns: todo, accounts, examples });
    const up = db.prepare("UPDATE bank_txns SET suggested_account_id=?, suggested_contact_id=?, suggestion_source='ai' WHERE id=? AND company_id=? AND status='new'");
    let suggested = 0;
    for (const r of results) {
      if (!r.account_id) continue;
      const a = accounts.find((x) => x.id === r.account_id);
      let contact = null;
      if (r.payee) {
        const kind = a && a.type === 'income' ? 'customer' : 'vendor';
        contact = db.prepare('SELECT id FROM contacts WHERE company_id=? AND kind=? AND name=? COLLATE NOCASE').get(p.cid, kind, r.payee)?.id
          || L.findOrCreateContact(db, p.cid, kind, r.payee);
      }
      up.run(r.account_id, contact, r.id, p.cid);
      suggested++;
    }
    return { suggested };
  });
  route('POST', '/api/c/:cid/bank-txn/:id/post', (req, res, p, body) => ({ entry_id: L.postBankTxn(db, p.cid, p.id, body) }));
  route('GET', '/api/c/:cid/bank-txn/:id/matches', (req, res, p) => L.bankMatches(db, p.cid, p.id));
  route('POST', '/api/c/:cid/bank-txn/:id/match', (req, res, p, body) => ({ entry_id: L.matchBankTxn(db, p.cid, p.id, body) }));
  route('POST', '/api/c/:cid/bank-txn/:id/exclude', (req, res, p) => ok(L.excludeBankTxn(db, p.cid, p.id)));
  route('POST', '/api/c/:cid/bank-txn/:id/undo', (req, res, p) => ok(L.undoBankTxn(db, p.cid, p.id)));
  route('GET', '/api/c/:cid/rules', (req, res, p) => L.listRules(db, p.cid));
  route('POST', '/api/c/:cid/rules', (req, res, p, body) => ({ id: L.saveRule(db, p.cid, body) }));
  route('DELETE', '/api/c/:cid/rules/:id', (req, res, p) => ok(db.prepare('DELETE FROM rules WHERE id=? AND company_id=?').run(Number(p.id), p.cid) && undefined));

  // ----- reconcile -----
  route('GET', '/api/c/:cid/reconcile', (req, res, p, b, q) => ({ ...L.reconcileData(db, p.cid, q.account_id, q.date), history: L.listReconciliations(db, p.cid, q.account_id) }));
  route('POST', '/api/c/:cid/reconcile', (req, res, p, body) => ({ id: L.finishReconcile(db, p.cid, body) }));
  route('DELETE', '/api/c/:cid/reconcile/:id', (req, res, p) => ok(L.undoReconcile(db, p.cid, p.id)));

  // ----- reports -----
  route('GET', '/api/c/:cid/reports/pnl', (req, res, p, b, q) => L.profitAndLoss(db, p.cid, q.from, q.to));
  route('GET', '/api/c/:cid/reports/bs', (req, res, p, b, q) => L.balanceSheet(db, p.cid, q.asOf));
  route('GET', '/api/c/:cid/reports/tb', (req, res, p, b, q) => L.trialBalance(db, p.cid, q.asOf));
  route('GET', '/api/c/:cid/reports/register', (req, res, p, b, q) => L.register(db, p.cid, q.account_id, q.from, q.to));
  route('GET', '/api/c/:cid/reports/aging', (req, res, p, b, q) => L.aging(db, p.cid, q.kind === 'ap' ? 'ap' : 'ar', q.asOf));
  route('GET', '/api/c/:cid/reports/bycontact', (req, res, p, b, q) => L.byContactReport(db, p.cid, q.kind === 'vendor' ? 'vendor' : 'customer', q.from, q.to));
  route('GET', '/api/c/:cid/reports/monthly', (req, res, p, b, q) => L.monthly(db, p.cid, Math.min(36, Number(q.months) || 12)));

  // ----- QuickBooks import -----
  route('POST', '/api/c/:cid/import/qb-accounts', (req, res, p, body) => I.importQBAccounts(db, p.cid, body.text || '', body.filename));
  route('POST', '/api/c/:cid/import/qb-contacts', (req, res, p, body) => I.importQBContacts(db, p.cid, body.kind === 'vendor' ? 'vendor' : 'customer', body.text || '', body.filename));
  route('POST', '/api/c/:cid/import/qb-journal', (req, res, p, body) => I.importQBJournal(db, p.cid, body.text || '', body.filename, { dmy: !!body.dmy }));
  route('GET', '/api/c/:cid/import/batches', (req, res, p) => I.listBatches(db, p.cid));
  route('DELETE', '/api/c/:cid/import/batches/:id', (req, res, p) => ok(I.undoBatch(db, p.cid, p.id)));

  // ----- request handling -----
  const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json', '.webmanifest': 'application/manifest+json' };
  function serveStatic(req, res, pathname) {
    let file = path.normalize(path.join(PUBLIC, pathname === '/' ? 'index.html' : pathname));
    if (!file.startsWith(PUBLIC)) { res.writeHead(403); return res.end(); }
    if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(PUBLIC, 'index.html');
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    fs.createReadStream(file).pipe(res);
  }

  function readBody(req) {
    return new Promise((resolve, reject) => {
      let size = 0; const chunks = [];
      req.on('data', (c) => { size += c.length; if (size > 50 * 1024 * 1024) { reject(new L.UserError('File too large (50 MB max)')); req.destroy(); } else chunks.push(c); });
      req.on('end', () => {
        if (!chunks.length) return resolve({});
        try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); } catch { reject(new L.UserError('Bad request body')); }
      });
      req.on('error', reject);
    });
  }

  return async function handler(req, res) {
    const url = new URL(req.url, 'http://x');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'no-referrer');
    if (!url.pathname.startsWith('/api/')) return serveStatic(req, res, url.pathname);
    const send = (status, data) => { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(data)); };
    try {
      const r = routes.find((x) => x.method === req.method && x.re.test(url.pathname));
      if (!r) return send(404, { error: 'Not found' });
      if (!r.pub && !loggedIn(req)) return send(401, { error: 'Please log in' });
      // Writes must be JSON, which browsers will not send cross-site without CORS.
      if (req.method !== 'GET' && !(req.headers['content-type'] || '').startsWith('application/json')) return send(415, { error: 'JSON required' });
      const m = url.pathname.match(r.re);
      const params = {};
      r.keys.forEach((k, i) => { params[k] = decodeURIComponent(m[i + 1]); });
      if (params.cid) { params.cid = Number(params.cid); L.getCompany(db, params.cid); }
      const body = req.method === 'GET' ? {} : await readBody(req);
      const query = Object.fromEntries(url.searchParams);
      const out = await r.handler(req, res, params, body, query);
      if (!res.headersSent) send(200, out === undefined ? { ok: true } : out);
    } catch (e) {
      if (!(e instanceof L.UserError) && !e.status) console.error(e);
      if (!res.headersSent) send(e.status || 500, { error: e.status || e instanceof L.UserError ? e.message : 'Something went wrong: ' + e.message });
    }
  };
}

// ----- automatic backups: one per day, keep the last 30 -----
function backup(db) {
  const dir = path.join(DATA_DIR, 'backups');
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `books-${L.today()}.db`);
  if (fs.existsSync(file)) fs.unlinkSync(file);
  db.exec(`VACUUM INTO '${file.replace(/'/g, "''")}'`);
  const files = fs.readdirSync(dir).filter((f) => /^books-\d{4}-\d{2}-\d{2}\.db$/.test(f)).sort();
  for (const f of files.slice(0, Math.max(0, files.length - 30))) fs.unlinkSync(path.join(dir, f));
}

if (require.main === module) {
  const db = open(DB_FILE);
  const server = http.createServer(createApp(db));
  server.listen(PORT, HOST, () => {
    const ips = Object.values(os.networkInterfaces()).flat().filter((i) => i && i.family === 'IPv4' && !i.internal).map((i) => i.address);
    console.log('\n  Sprik Books is running.');
    console.log(`  On this computer:  http://localhost:${PORT}`);
    for (const ip of ips) console.log(`  From your phone:   http://${ip}:${PORT}`);
    console.log(`  Data file:         ${DB_FILE}\n  Leave this window open while you use it. Ctrl+C to stop.\n`);
  });
  try { backup(db); } catch (e) { console.error('Backup failed:', e.message); }
  setInterval(() => { try { backup(db); } catch (e) { console.error('Backup failed:', e.message); } }, 6 * 60 * 60 * 1000).unref();
}

module.exports = { createApp };
