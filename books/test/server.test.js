'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { open } = require('../lib/db');
const { createApp } = require('../server');

test('HTTP API: login required, setup, company, invoice, reports', async () => {
  const db = open(':memory:');
  const server = http.createServer(createApp(db));
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  let cookie = '';
  const call = async (method, path, body) => {
    const res = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json', cookie }, body: body ? JSON.stringify(body) : undefined });
    const sc = res.headers.get('set-cookie');
    if (sc) cookie = sc.split(';')[0];
    return { status: res.status, data: await res.json() };
  };
  try {
    assert.equal((await call('GET', '/api/companies')).status, 401);
    assert.deepEqual((await call('GET', '/api/auth')).data, { setup: true, loggedIn: false });
    assert.equal((await call('POST', '/api/auth/setup', { password: 'secret1' })).status, 200);
    assert.equal((await call('POST', '/api/auth/setup', { password: 'again!!' })).status, 400);
    const co = (await call('POST', '/api/companies', { name: 'Shop' })).data;
    const meta = (await call('GET', `/api/c/${co.id}/meta`)).data;
    const sales = meta.accounts.find((a) => a.name === 'Sales').id;
    const cust = (await call('POST', `/api/c/${co.id}/contacts`, { kind: 'customer', name: 'Bob' })).data.id;
    const inv = await call('POST', `/api/c/${co.id}/invoices`, { contact_id: cust, date: '2026-05-01', tax_rate: 0, lines: [{ qty: 1, rate: 250, account_id: sales }] });
    assert.equal(inv.status, 200);
    const pnl = (await call('GET', `/api/c/${co.id}/reports/pnl?from=2026-01-01&to=2026-12-31`)).data;
    assert.equal(pnl.net, 25000);
    const bad = await call('POST', `/api/c/${co.id}/entries`, { date: '2026-01-01', lines: [{ account_id: sales, debit: 1 }] });
    assert.equal(bad.status, 400);
    assert.match(bad.data.error, /two lines/);
    // Writes without a JSON content type are refused (CSRF guard).
    const form = await fetch(`${base}/api/c/${co.id}/contacts`, { method: 'POST', headers: { cookie, 'Content-Type': 'text/plain' }, body: '{}' });
    assert.equal(form.status, 415);
    await call('POST', '/api/auth/logout');
    cookie = '';
    assert.equal((await call('POST', '/api/auth/login', { password: 'nope' })).status, 401);
    assert.equal((await call('POST', '/api/auth/login', { password: 'secret1' })).status, 200);
    assert.equal((await call('GET', '/api/companies')).data.length, 1);
    const page = await fetch(base + '/');
    assert.match(await page.text(), /Sprik Books/);
  } finally {
    server.close();
  }
});
