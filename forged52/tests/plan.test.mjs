// Unit tests for reading-plan logic, reference parsing, catch-up and data integrity. Run: node --test tests/
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as P from '../js/core/plan.js';
import { lookup } from '../js/core/bible.js';

const plans = JSON.parse(readFileSync(new URL('../data/plans.json', import.meta.url)));
const web = JSON.parse(readFileSync(new URL('../data/web.json', import.meta.url)));
const cur = JSON.parse(readFileSync(new URL('../data/curriculum.json', import.meta.url)));
const wc = JSON.parse(readFileSync(new URL('../data/wordcount.json', import.meta.url)));

test('parseRef handles ranges, lists, verse ranges and single-chapter books', () => {
  assert.deepEqual(P.parseRef('Psalms 131, 138-139').map((c) => c.ch), [131, 138, 139]);
  assert.deepEqual(P.parseRef('Titus 1-3, II Tim 1-4').map((c) => c.usfm + c.ch), ['TIT1', 'TIT2', 'TIT3', '2TI1', '2TI2', '2TI3', '2TI4']);
  assert.deepEqual(P.parseRef('Psalms 119:1-88')[0], { name: 'Psalms', usfm: 'PSA', ch: 119, v1: 1, v2: 88 });
  assert.deepEqual(P.parseRef('Jude')[0], { name: 'Jude', usfm: 'JUD', ch: 1 });
});

for (const route of ['topical', 'chrono']) {
  test(`${route} plan: 364 days, every reading parses, whole Bible covered`, () => {
    const seen = new Map();
    for (let n = 1; n <= P.TOTAL_DAYS; n++) {
      const r = P.reading(plans, route, n);
      assert.ok(r.ref, `day ${n} has a reading`);
      const chs = P.parseRef(r.ref);
      assert.ok(chs.length > 0, `day ${n} (${r.ref}) parses`);
      for (const c of chs) {
        assert.ok(web[c.usfm] && web[c.usfm][c.ch - 1], `day ${n}: ${c.usfm} ${c.ch} exists`);
        const key = c.usfm + '.' + c.ch; seen.set(key, (seen.get(key) || 0) + 1);
      }
    }
    const missing = [];
    for (const [u, , count] of P.CANON) for (let c = 1; c <= count; c++) if (!seen.has(u + '.' + c)) missing.push(u + ' ' + c);
    assert.deepEqual(missing, [], 'every chapter of all 66 books is read');
  });
}

test('reading() maps day numbers to week and weekday', () => {
  const r = P.reading(plans, 'topical', 1);
  assert.equal(r.week, 1); assert.equal(r.key, 'sunday'); assert.equal(r.ref, 'Rom 1-2');
  const r8 = P.reading(plans, 'topical', 8); assert.equal(r8.week, 2); assert.equal(r8.key, 'sunday');
  assert.equal(P.reading(plans, 'topical', 364).week, 52);
});

test('dates: dayIndex, scheduledDay, startFor and dateFor agree', () => {
  const now = new Date(2026, 10, 28, 9, 30);
  assert.equal(P.dayIndex('2026-11-28', now), 0);
  assert.equal(P.scheduledDay('2026-11-01', now), 28);
  assert.equal(P.scheduledDay('2027-01-01', now), 1, 'future start clamps to day 1');
  assert.equal(P.scheduledDay('2020-01-01', now), 364, 'finished plan clamps to day 364');
  const s = P.startFor(196, now); assert.equal(P.scheduledDay(s, now), 196);
  assert.equal(P.iso(P.dateFor('2026-11-01', 28)), '2026-11-28');
  assert.equal(P.nextSunday(new Date(2026, 10, 28)).getDay(), 0);
});

test('catch-up: behind count, resume and gradual', () => {
  const now = new Date(2026, 10, 28);
  const start = P.iso(new Date(2026, 10, 19)); // today is day 10
  const done = new Set([1, 2, 3, 4, 5]);
  const c = P.catchup(done, start, now);
  assert.equal(c.sched, 10); assert.equal(c.next, 6); assert.equal(c.behind, 4); assert.equal(c.missed, 4);
  assert.deepEqual(P.gradualToday(done, start, now, 2), [6, 7]);
  assert.equal(P.scheduledDay(P.startFor(c.next, now), now), 6, 'resume makes the next unread day today');
  assert.equal(P.catchup(new Set(), P.iso(new Date(2026, 11, 5)), now).started, false);
});

test('minutesFor gives sensible estimates', () => {
  const m = P.minutesFor(wc, 'Psalms 119:1-88'); assert.ok(m >= 2 && m < 30, `Psalm 119 half: ${m}`);
  const g = P.minutesFor(wc, 'Gen 1-3'); assert.ok(g >= 5 && g <= 20, `Gen 1-3: ${g}`);
});

test('lookup parses free-form references', () => {
  const cases = { 'john 3:16': ['JHN', 3, 16, 16], '1 cor 13': ['1CO', 13, undefined, undefined], 'Ps 23:1-4': ['PSA', 23, 1, 4], '1jn 4:8': ['1JN', 4, 8, 8], 'Song of Songs 2': ['SNG', 2, undefined, undefined], 'Philemon 1:6': ['PHM', 1, 6, 6], '2 Timothy 1:7': ['2TI', 1, 7, 7], 'phil 4:13': ['PHP', 4, 13, 13], 'Rev 21:4–5': ['REV', 21, 4, 5] };
  for (const [q, [u, ch, a, b]] of Object.entries(cases)) { const r = lookup(q); assert.ok(r, q); assert.deepEqual([r.usfm, r.ch, r.v1, r.v2], [u, ch, a, b], q); }
  assert.equal(lookup('john 99'), null); assert.equal(lookup('courage'), null);
});

test('curriculum: 52 complete weeks with valid memory verses', () => {
  assert.equal(cur.weeks.length, 52);
  for (const w of cur.weeks) {
    for (const k of ['theme', 'truth', 'devotional', 'mission', 'prayer']) assert.ok(w[k] && w[k].length > (k === 'theme' ? 3 : 20), `week ${w.week} ${k}`);
    assert.ok(w.reflect.length >= 3 && w.discuss.length >= 3, `week ${w.week} questions`);
    const m = w.memory; assert.equal(web[m.usfm][m.ch - 1].slice(m.v1 - 1, m.v2).join(' '), m.text, `week ${w.week} memory text is exact WEB`);
  }
});
