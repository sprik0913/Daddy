// FORGED app bootstrap: data, routing, navigation, theme, cloud, service worker.
import { store, ls } from './core/store.js';
import { loadCore } from './core/data.js';
import { initCloud } from './core/cloud.js';
import { $, $$, paintIcons, toast } from './core/ui.js';
import { startFor, iso } from './core/plan.js';

const screens = {
  today: () => import('./screens/today.js'),
  journey: () => import('./screens/journey.js'),
  week: () => import('./screens/journey.js'),
  study: () => import('./screens/study.js'),
  crew: () => import('./screens/brotherhood.js'),
  lead: () => import('./screens/brotherhood.js'),
  profile: () => import('./screens/profile.js'),
  journal: () => import('./screens/journal.js'),
  memory: () => import('./screens/memory.js'),
  word: () => import('./screens/word.js'),
  welcome: () => import('./screens/landing.js'),
  start: () => import('./screens/onboarding.js'),
};
const FULL = new Set(['welcome', 'start']);
const ALIAS = { challenge: 'welcome', why: 'welcome', plan: 'journey', join: 'profile', you: 'profile', setup: 'profile' };
const TAB = { today: 'today', journey: 'journey', week: 'journey', study: 'study', crew: 'crew', lead: 'crew', profile: 'profile', journal: 'profile', memory: 'today', word: 'profile' };

export function applyTheme() {
  document.documentElement.setAttribute('data-theme', store.prefs.theme || 'iron');
  document.documentElement.classList.toggle('big', !!store.prefs.big);
  const m = document.querySelector('meta[name=theme-color]'); if (m) m.content = getComputedStyle(document.documentElement).getPropertyValue('--bg').trim() || '#141613';
}

function parseHash() {
  let h = decodeURIComponent(location.hash.slice(1));
  const [rawName, ...rest] = h.split('-'); let name = ALIAS[rawName] || rawName; const param = rest.join('-');
  if (!screens[name]) name = store.st.onboarded || store.done.size ? 'today' : 'welcome';
  return { name, param };
}

let current = { cleanup: null, key: '' };
export async function route() {
  const { name, param } = parseHash();
  const key = name + ':' + param;
  if (current.cleanup) { try { current.cleanup(); } catch { /* ignore */ } current.cleanup = null; }
  document.body.classList.toggle('full', FULL.has(name));
  $('#nav').hidden = FULL.has(name);
  $$('#nav [data-tab]').forEach((a) => a.dataset.tab === TAB[name] ? a.setAttribute('aria-current', 'page') : a.removeAttribute('aria-current'));
  const main = $('#main');
  main.classList.toggle('wide', FULL.has(name));
  try {
    const mod = await screens[name]();
    const target = FULL.has(name) ? $('#fullscreen') : main;
    if (FULL.has(name)) { main.innerHTML = ''; } else { $('#fullscreen').innerHTML = ''; }
    const fn = mod.screens ? mod.screens[name] : mod.render;
    current.cleanup = (await fn(target, param)) || null;
    current.key = key;
    paintIcons(target);
    if (key !== route.last) { scrollTo(0, 0); if (!FULL.has(name)) main.focus({ preventScroll: true }); }
    route.last = key;
    document.title = { today: 'Today', journey: 'Journey', week: 'Week ' + param, study: 'Study', crew: 'Brotherhood', lead: 'Point Man guide', profile: 'Profile', journal: 'Journal', memory: 'Scripture memory', word: 'Post a word', welcome: 'FORGED52', start: 'Get started' }[name] + ' · FORGED52';
  } catch (e) {
    console.error(e);
    main.innerHTML = `<div class="card"><div class="h3">Something went wrong</div><p class="muted" style="margin-top:8px">This screen couldn't load. Check your connection and try again.</p><button class="btn" style="margin-top:16px" onclick="location.reload()">Reload</button></div>`;
  }
}
export const refresh = () => route();

function handleLinks() {
  const q = new URLSearchParams(location.search); let changed = false;
  // Sync link from the old app: ?plan=topical&week=28&day=7
  const w = +q.get('week'), d = +q.get('day');
  if (w >= 1 && w <= 52 && d >= 1 && d <= 7) {
    const pl = q.get('plan'); if (pl === 'topical' || pl === 'chrono') store.route = pl;
    const n = (w - 1) * 7 + d; store.start = startFor(n); for (let k = 1; k < n; k++) store.done.add(k);
    store.st.onboarded = true; store.write(); ['week', 'day', 'plan'].forEach((k) => q.delete(k)); changed = true; location.hash = 'today';
    setTimeout(() => toast(`Synced to week ${w}, day ${d}`), 600);
  }
  const crew = q.get('crew'); if (crew) { ls.set('f52.pendingCrew', crew.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6)); q.delete('crew'); changed = true; location.hash = store.st.onboarded ? 'crew' : 'welcome'; }
  if (changed) history.replaceState(null, '', location.pathname + (q.toString() ? '?' + q : '') + location.hash);
}

async function boot() {
  applyTheme();
  handleLinks();
  try { await loadCore(); } catch (e) { $('#main').innerHTML = '<div class="card"><div class="h3">Offline</div><p class="muted">FORGED couldn\'t load its reading plan. Connect to the internet once and it will work offline after that.</p></div>'; return; }
  addEventListener('hashchange', route);
  await route();
  paintIcons(document);
  initCloud();
  if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});
  ls.set('forged.lastOpen', iso(new Date()));
}
// wait for deferred Lucide so first paint has icons
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
