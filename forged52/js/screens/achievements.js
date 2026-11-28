// Achievement patches: cumulative milestones (never streak-based), drawn as forged-bronze vector emblems.
import { BRAND } from '../config.js';
import { store } from '../core/store.js';
import { D, week, P } from '../core/data.js';
import { esc, icon, sheet, sheetHead, download, fmt } from '../core/ui.js';

const weeksComplete = () => { let c = 0; for (let w = 1; w <= 52; w++) { let k = 0; for (let n = (w - 1) * 7 + 1; n <= w * 7; n++) if (store.done.has(n)) k++; if (k === 7) c++; } return c; };
const prayerDays = () => Object.values(store.st.dayParts).filter((p) => p.prayer).length + store.st.journal.filter((e) => e.type === 'prayer').length;
const brotherhood = () => +(localStorage.getItem('forged.crewActs') || 0);
const stewardDone = () => [21, 22, 23, 24].every((w) => store.missions.has(w));

export const ACHIEVEMENTS = [
  { id: 'first-fire', name: 'First Fire', desc: 'Completed your first reading.', shape: 'shield', glyph: 'flame', test: () => store.done.size >= 1, prog: () => [Math.min(store.done.size, 1), 1] },
  { id: 'foundation', name: 'The Foundation', desc: 'Completed your first full week.', shape: 'shield', glyph: 'stone', test: () => weeksComplete() >= 1, prog: () => [Math.min(weeksComplete(), 1), 1] },
  { id: 'forged', name: 'Forged', desc: '30 days of Scripture read.', shape: 'round', glyph: 'anvil', test: () => store.done.size >= 30, prog: () => [Math.min(store.done.size, 30), 30] },
  { id: 'faithful', name: 'Faithful', desc: '90 days of Scripture read.', shape: 'round', glyph: 'cross', test: () => store.done.size >= 90, prog: () => [Math.min(store.done.size, 90), 90] },
  { id: 'watchman', name: 'The Watchman', desc: '30 times in prayer.', shape: 'shield', glyph: 'tower', test: () => prayerDays() >= 30, prog: () => [Math.min(prayerDays(), 30), 30] },
  { id: 'steward', name: 'The Steward', desc: 'Completed the Steward missions (weeks 21–24).', shape: 'diamond', glyph: 'key', test: stewardDone, prog: () => [[21, 22, 23, 24].filter((w) => store.missions.has(w)).length, 4] },
  { id: 'iron-brother', name: 'Iron Brother', desc: '10 acts of brotherhood: posts, prayers and encouragement in your crew.', shape: 'diamond', glyph: 'swords', test: () => brotherhood() >= 10, prog: () => [Math.min(brotherhood(), 10), 10] },
  { id: 'servant', name: 'The Servant', desc: '12 weekly missions completed.', shape: 'round', glyph: 'towel', test: () => store.missions.size >= 12, prog: () => [Math.min(store.missions.size, 12), 12] },
  { id: 'halfway', name: 'The Halfway Mark', desc: '26 weeks of readings completed.', shape: 'shield', glyph: 'half', test: () => store.done.size >= 182, prog: () => [Math.min(store.done.size, 182), 182] },
  { id: 'finisher', name: 'The Finisher', desc: 'All 52 weeks completed.', shape: 'shield', glyph: 'crown', test: () => weeksComplete() >= 52, prog: () => [weeksComplete(), 52] },
  { id: 'the-word', name: 'The Word', desc: 'The entire Bible reading plan completed.', shape: 'round', glyph: 'book', test: () => store.done.size >= 364, prog: () => [store.done.size, 364] },
];

const GLYPH = {
  flame: '<path d="M60 38c8 10 14 16 14 26a14 14 0 0 1-28 0c0-6 3-10 6-13 0 6 3 9 6 9-2-8 0-14 2-22z" fill="currentColor"/>',
  stone: '<path d="M38 70h44v10H38zM44 58h32v10H44zM50 46h20v10H50z" fill="currentColor"/>',
  anvil: '<path d="M36 50h40c0 6 6 8 12 8H74l-4 8 6 8H44l6-8-4-8h-6c-3 0-4-4-4-8z" fill="currentColor"/>',
  cross: '<path d="M56 36h8v14h14v8H64v28h-8V58H42v-8h14z" fill="currentColor"/>',
  tower: '<path d="M46 84V52l-4-8h8v4h6v-4h8v4h6v-4h8l-4 8v32zM56 70v14h8V70z" fill="currentColor"/>',
  key: '<circle cx="50" cy="60" r="10" fill="none" stroke="currentColor" stroke-width="6"/><path d="M58 58h26v6h-4v8h-6v-8h-16z" fill="currentColor"/>',
  swords: '<path d="M40 40l26 26-4 4L36 44zM80 40L54 66l4 4 26-26zM44 70l6 6-8 8-6-6zM76 70l-6 6 8 8 6-6z" fill="currentColor"/>',
  towel: '<path d="M42 44h36v8H42zM46 52h28v32H46z" fill="currentColor" opacity=".9"/><path d="M50 60h20M50 68h20" stroke="#1D211B" stroke-width="2"/>',
  half: '<circle cx="60" cy="62" r="20" fill="none" stroke="currentColor" stroke-width="5"/><path d="M60 42a20 20 0 0 1 0 40z" fill="currentColor"/>',
  crown: '<path d="M40 76l-4-30 14 12 10-18 10 18 14-12-4 30z" fill="currentColor"/>',
  book: '<path d="M38 46c8-3 16-3 22 2v34c-6-5-14-5-22-2zM82 46c-8-3-16-3-22 2v34c6-5 14-5 22-2z" fill="currentColor"/>',
};
const SHAPE = {
  shield: (s) => `<path d="M60 6 L108 20 V62 C108 94 86 112 60 122 C34 112 12 94 12 62 V20 Z" ${s}/>`,
  round: (s) => `<circle cx="60" cy="64" r="54" ${s}/>`,
  diamond: (s) => `<path d="M60 8 L112 64 L60 120 L8 64 Z" ${s}/>`,
};
export function patchSVG(a) {
  return `<svg viewBox="0 0 120 128" role="img" aria-label="${esc(a.name)} patch"><defs><linearGradient id="bz-${a.id}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#E2C08A"/><stop offset=".5" stop-color="#C59B61"/><stop offset="1" stop-color="#8A6532"/></linearGradient></defs>
    ${SHAPE[a.shape](`fill="#1D211B" stroke="url(#bz-${a.id})" stroke-width="6"`)}
    <g transform="translate(0,-2)">${SHAPE[a.shape]('fill="none" stroke="#C59B61" stroke-opacity=".45" stroke-width="1.5" stroke-dasharray="3 3" transform="translate(60 64) scale(.84) translate(-60 -64)"')}</g>
    <g style="color:#C59B61" transform="translate(0,-4)">${GLYPH[a.glyph]}</g>
    <text x="60" y="${a.shape === 'diamond' ? 100 : 106}" text-anchor="middle" font-family="'Barlow Condensed',sans-serif" font-weight="700" font-size="${a.name.length > 12 ? 9 : 11}" letter-spacing="1.2" fill="#F4F0E7">${esc(a.name.toUpperCase())}</text></svg>`;
}
export const earned = () => ACHIEVEMENTS.filter((a) => a.test());

export function checkAchievements() {
  const seen = new Set(store.st.seenAch); const fresh = earned().filter((a) => !seen.has(a.id));
  if (!fresh.length) return;
  fresh.forEach((a) => store.st.seenAch.push(a.id)); store.write();
  const a = fresh[fresh.length - 1];
  sheet(`<div style="text-align:center">${sheetHead('Milestone reached')}<div class="pop" style="width:min(200px,60vw);margin:0 auto 14px">${patchSVG(a)}</div><div class="h2">${esc(a.name)}</div><p class="muted" style="margin-top:6px">${esc(a.desc)}</p><p class="faint" style="margin-top:14px">A marker of faithfulness, not a measure of worth. You were already loved.</p><button class="btn primary block" type="button" data-close style="margin-top:16px">Keep going</button></div>`, { label: 'Milestone' });
}

export function certificate(name) {
  const W = 1600, H = 1100, cv = document.createElement('canvas'); cv.width = W; cv.height = H; const g = cv.getContext('2d');
  g.fillStyle = '#141613'; g.fillRect(0, 0, W, H);
  g.strokeStyle = '#C59B61'; g.lineWidth = 6; g.strokeRect(50, 50, W - 100, H - 100); g.lineWidth = 2; g.strokeRect(70, 70, W - 140, H - 140);
  g.textAlign = 'center'; g.fillStyle = '#C59B61'; g.font = '700 34px "Barlow Condensed", sans-serif'; g.fillText(BRAND.program + ' · CERTIFICATE OF COMPLETION', W / 2, 190);
  g.fillStyle = '#B7B8AE'; g.font = '400 32px "Source Serif 4", serif'; g.fillText('This certifies that', W / 2, 300);
  g.fillStyle = '#F4F0E7'; g.font = '700 120px "Barlow Condensed", sans-serif'; g.fillText((name || 'A faithful man').toUpperCase(), W / 2, 430);
  g.fillStyle = '#B7B8AE'; g.font = '400 34px "Source Serif 4", serif';
  g.fillText(store.done.size >= 364 ? 'has read the entire Bible over 52 weeks' : `has read ${store.done.size} of 364 daily readings`, W / 2, 520);
  g.fillText('in the FORGED52 discipleship journey.', W / 2, 570);
  g.fillStyle = '#C59B61'; g.font = 'italic 400 32px "Source Serif 4", serif'; g.fillText('“I have fought the good fight, I have finished the race, I have kept the faith.”', W / 2, 700);
  g.fillStyle = '#8C8E84'; g.font = '400 26px "Inter", sans-serif'; g.fillText('2 Timothy 4:7 (WEB)', W / 2, 745);
  g.fillStyle = '#F4F0E7'; g.font = '700 30px "Barlow Condensed", sans-serif'; g.fillText(BRAND.tagline.toUpperCase(), W / 2, 880);
  g.fillStyle = '#8C8E84'; g.font = '400 24px "Inter", sans-serif'; g.fillText(fmt(new Date(), { month: 'long', day: 'numeric', year: 'numeric' }), W / 2, 940);
  cv.toBlob((b) => download('forged52-certificate.png', b, 'image/png'), 'image/png');
}
