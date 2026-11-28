// Browser smoke test: every screen at phone, tablet and desktop widths, for a returning user (legacy data)
// and a brand-new visitor. Fails on page errors, console errors or horizontal scrolling.
// Usage: python3 -m http.server 8765 &  then  node tests/e2e.mjs [outdir]
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright'); // preinstalled globally
import { mkdirSync } from 'node:fs';

const BASE = process.env.BASE || 'http://localhost:8765/';
const OUT = process.argv[2] || 'test-results';
mkdirSync(OUT, { recursive: true });
const OFFLINE_HOSTS = /supabase\.co|api\.nlt\.to|ebible\.org/; // keep tests independent of live services
const ROUTES = ['today', 'journey', 'week-28', 'study', 'study-books', 'study-book-ROM', 'study-bible-timeline', 'study-manhood', 'study-manhood-husband', 'study-questions-suffering', 'study-questions-endtimes', 'study-bible-geography', 'study-prayer', 'study-prayer-lords', 'study-library-courage', 'study-saved', 'study-assistant', 'crew', 'lead-28', 'profile', 'journal', 'memory', 'word'];
const WIDTHS = [[390, 844, 'm'], [768, 1024, 't'], [1280, 860, 'd']];
// A man on week 28 of the old app, with a journal line and a saved theme
const LEGACY = { 'f52.plan': 'topical', 'f52.start': '', 'f52.done': '', 'f52.name': 'Josh', 'f52.joined': '1', 'f52.j.190': 'God kept me steady today.', 'f52.color': 'iron' };

const problems = [];
const b = await chromium.launch();
async function page(vp, seed) {
  const ctx = await b.newContext({ viewport: { width: vp[0], height: vp[1] }, deviceScaleFactor: 1 });
  await ctx.route(OFFLINE_HOSTS, (r) => r.abort());
  if (seed) await ctx.addInitScript((s) => { if (!localStorage.getItem('f52.joined')) for (const [k, v] of Object.entries(s)) localStorage.setItem(k, v); }, seed);
  const p = await ctx.newPage();
  p.errs = [];
  p.on('pageerror', (e) => p.errs.push('pageerror: ' + e.message));
  p.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|ERR_FAILED|net::|Failed to fetch/.test(m.text())) p.errs.push('console: ' + m.text()); });
  return p;
}
const start = new Date(); start.setDate(start.getDate() - 195); // today = day 196 (week 28, day 7)
LEGACY['f52.start'] = start.toISOString().slice(0, 10);
LEGACY['f52.done'] = JSON.stringify(Array.from({ length: 193 }, (_, i) => i + 1)); // 2 days behind

for (const vp of WIDTHS) {
  const p = await page(vp, LEGACY);
  for (const r of ROUTES) {
    await p.goto(BASE + '#' + r); await p.waitForTimeout(r === 'today' ? 900 : 450);
    const sw = await p.evaluate(() => document.documentElement.scrollWidth);
    const broken = await p.evaluate(() => !!document.querySelector('#main .card .h3')?.textContent.includes('Something went wrong'));
    if (sw > vp[0] + 1) problems.push(`${vp[2]} #${r}: horizontal scroll ${sw}px`);
    if (broken) problems.push(`${vp[2]} #${r}: screen failed to render`);
    if (vp[2] !== 't' || r === 'today') await p.screenshot({ path: `${OUT}/${vp[2]}-${r}.png`, fullPage: vp[2] === 'm' && ['today', 'study', 'profile'].includes(r) });
  }
  // reader opens and renders WEB text offline
  await p.goto(BASE + '#today'); await p.waitForTimeout(700);
  await p.click('#tRead').catch(() => problems.push(`${vp[2]}: no read button`));
  await p.waitForTimeout(900);
  const verses = await p.locator('.reader [data-v]').count();
  if (verses < 5) problems.push(`${vp[2]}: reader shows ${verses} verses`);
  await p.screenshot({ path: `${OUT}/${vp[2]}-reader.png` });
  // migrated data: legacy journal line is in the journal, theme kept
  await p.goto(BASE + '#journal'); await p.waitForTimeout(400);
  if (!(await p.content()).includes('God kept me steady today.')) problems.push(`${vp[2]}: legacy journal entry missing`);
  if ((await p.evaluate(() => document.documentElement.dataset.theme)) !== 'iron') problems.push(`${vp[2]}: legacy theme not kept`);
  if (p.errs.length) problems.push(...p.errs.map((e) => `${vp[2]} returning: ${e}`));
  await p.context().close();

  // new visitor: landing then onboarding through to Today
  const n = await page(vp, null);
  await n.goto(BASE); await n.waitForTimeout(900);
  if (!(await n.locator('.land-hero h1').count())) problems.push(`${vp[2]}: new visitor did not get the landing page`);
  await n.screenshot({ path: `${OUT}/${vp[2]}-welcome.png`, fullPage: vp[2] !== 't' });
  if ((await n.evaluate(() => document.documentElement.scrollWidth)) > vp[0] + 1) problems.push(`${vp[2]} welcome: horizontal scroll`);
  await n.click('a[href="#start"] >> nth=0'); await n.waitForTimeout(400);
  for (let i = 0; i < 6; i++) { if (i === 3 && vp[2] === 'm') await n.screenshot({ path: `${OUT}/m-onboarding-4.png` }); await n.click('#oNext'); await n.waitForTimeout(250); }
  await n.click('#oNext'); await n.waitForTimeout(900);
  if (!(await n.url()).includes('#today')) problems.push(`${vp[2]}: onboarding did not finish on Today (${await n.url()})`);
  if (n.errs.length) problems.push(...n.errs.map((e) => `${vp[2]} new: ${e}`));
  await n.context().close();
}
await b.close();
console.log(problems.length ? 'PROBLEMS\n' + problems.join('\n') : 'All screens rendered without errors at 390, 768 and 1280px.');
process.exit(problems.length ? 1 : 0);
