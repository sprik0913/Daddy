// Migration test: legacy f52.* data from the previous app must survive the redesign untouched.
import test from 'node:test';
import assert from 'node:assert/strict';

const mem = new Map();
globalThis.localStorage = { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k), key: (i) => [...mem.keys()][i] ?? null, get length() { return mem.size; } };

const legacy = {
  'f52.plan': 'chrono', 'f52.start': '2026-05-10', 'f52.done': JSON.stringify([1, 2, 3, 5, 196]), 'f52.missions': '[1,2]',
  'f52.name': 'Josh', 'f52.joined': '1', 'f52.j.3': 'God was patient with me today.', 'f52.j.196': 'Week 28 thoughts',
  'f52.color': 'venom', 'f52.big': '1', 'f52.remHour': '5', 'f52.auth': '{"session":"keep-me"}',
};
for (const [k, v] of Object.entries(legacy)) mem.set(k, v);
const before = new Map(mem);
const { store } = await import('../js/core/store.js');

test('legacy progress is read as-is', () => {
  assert.equal(store.route, 'chrono'); assert.equal(store.start, '2026-05-10');
  assert.deepEqual([...store.done].sort((a, b) => a - b), [1, 2, 3, 5, 196]); assert.equal(store.name, 'Josh');
});
test('legacy keys are preserved and a backup snapshot exists', () => {
  for (const [k, v] of before) if (!['f52.updated'].includes(k)) assert.equal(mem.get(k), v, `${k} unchanged`);
  const snap = JSON.parse(mem.get('forged.backup.v0')); assert.equal(snap.keys['f52.j.3'], legacy['f52.j.3']); assert.equal(snap.keys['f52.auth'], legacy['f52.auth']);
});
test('daily journal lines become journal entries; prefs carry over', () => {
  const e = store.st.journal.find((x) => x.id === 'legacy-3'); assert.equal(e.body, legacy['f52.j.3']); assert.equal(e.day, 3);
  assert.equal(store.st.journal.length, 2); assert.equal(store.prefs.theme, 'venom'); assert.equal(store.prefs.big, true); assert.equal(store.prefs.readTime, '05:00'); assert.equal(store.st.onboarded, true);
});
test('writes keep legacy keys in sync (rollback-safe)', () => {
  store.setDone(4, true); assert.deepEqual(JSON.parse(mem.get('f52.done')), [1, 2, 3, 4, 5, 196]);
  store.setDone(4, false); assert.deepEqual(JSON.parse(mem.get('f52.done')), [1, 2, 3, 5, 196]);
});
test('import is additive and makes a backup first', () => {
  const exp = store.exportAll(); const n = store.st.journal.length;
  exp.state.journal.push({ id: 'new-1', type: 'reflection', title: 'x', body: 'y', tags: [], date: '2026-11-28', created: '2026-11-28', updated: Date.now() });
  store.importAll(exp); assert.equal(store.st.journal.length, n + 1); assert.ok(mem.get('forged.backup.beforeImport'));
  assert.deepEqual([...store.done].sort((a, b) => a - b), [1, 2, 3, 5, 196]);
});
