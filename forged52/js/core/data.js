// App-wide data: plans, curriculum, recaps, word counts. Loaded once, used by every screen.
import { json } from './bible.js';
import { store } from './store.js';
import * as P from './plan.js';

export const D = { plans: null, cur: null, recap: null, wc: null, study: null };
export async function loadCore() {
  const [plans, cur, recap, wc] = await Promise.all([json('data/plans.json'), json('data/curriculum.json'), json('data/recap.json'), json('data/wordcount.json')]);
  Object.assign(D, { plans, cur, recap, wc });
}
export const loadStudy = async () => (D.study ||= await json('data/study.json'));

export const today = () => P.scheduledDay(store.start);
export const started = () => P.dayIndex(store.start) >= 0;
export const reading = (n) => P.reading(D.plans, store.route, n);
export const week = (w) => D.cur.weeks[w - 1];
export const dateFor = (n) => P.dateFor(store.start, n);
export const minutes = (ref) => P.minutesFor(D.wc, ref);
export const recapFor = (c) => (D.recap.ch[c.usfm] || [])[c.ch - 1] || '';
export const bookInfo = (usfm) => D.recap.books[usfm];
export const talkFor = (usfm) => D.recap.talk[usfm];
export const weekDone = (w) => { let c = 0; for (let n = (w - 1) * 7 + 1; n <= w * 7; n++) if (store.done.has(n)) c++; return c; };
// mission text for this man's season of life
export function missionFor(w) { const wk = week(w); const s = store.prefs.season || {}; return (wk.alt && (!s.married || !s.kids) && /wife|kids|child|son|daughter|famil/i.test(wk.mission)) ? wk.alt : wk.mission; }
// Today's reading number: if he's behind and chose gradual catch-up, today shows the first unread too
export function focusDay() {
  const c = P.catchup(store.done, store.start);
  if (!c.started) return 1;
  return c.sched;
}
export { P };
