// Public landing page: introduces FORGED and invites men in.
import { BRAND, PHASES } from '../config.js';
import { store } from '../core/store.js';
import { verseText } from '../core/bible.js';
import { esc, icon, paintIcons, share, sheet, sheetHead } from '../core/ui.js';

// Hero photo: "Vintage smith's workshop - 0172" by Jorge Royan, CC BY-SA 3.0, via Wikimedia Commons
// (cropped and color-graded for FORGED; credit shown in the footer as the license requires).
const HERO = `<img src="assets/hero-forge.webp" width="1008" height="832" alt="A blacksmith's hammer over glowing iron on an anvil" fetchpriority="high" decoding="async">`;

export async function render(root) {
  const from = (new URLSearchParams(location.search).get('from') || '').replace(/[^A-Za-z .'-]/g, '').slice(0, 20);
  const returning = store.st.onboarded || store.done.size;
  const verses = [['PRO', 27, 17, 17, 'Proverbs 27:17'], ['1CO', 16, 13, 14, '1 Corinthians 16:13–14'], ['ROM', 12, 2, 2, 'Romans 12:2'], ['JAS', 1, 22, 22, 'James 1:22']];
  root.innerHTML = `<div class="landing">
  <nav class="land-nav" aria-label="Site"><a class="brandmark" href="#welcome"><img src="${BRAND.logo}" alt="" width="50" height="34"><b>FORGED<span>52</span></b></a><a class="btn sm ${returning ? 'primary' : ''}" href="${returning ? '#today' : '#start'}">${returning ? 'Open app' : 'Get started'}</a></nav>
  <header class="land-hero">
    <div>
      ${from ? `<div class="badge accent" style="margin-bottom:16px">${icon('flag')} ${esc(from)} invited you to take the challenge</div>` : ''}
      <div class="eyebrow">${esc(BRAND.parent)} · A 52-week discipleship journey for men</div>
      <h1 style="margin-top:12px">God’s Word. Your life. <em>A deeper faith.</em></h1>
      <p class="lead" style="margin-top:16px;font-size:1.15rem">${esc(BRAND.heroSupport)}</p>
      <div class="row-btns" style="margin-top:26px"><a class="btn primary" href="#start">${icon('flame')} Accept the challenge</a><button class="btn" type="button" id="lInvite">${icon('user-plus')} Invite a brother</button></div>
      <p class="faint" style="margin-top:14px">Free. No ads. No account needed to begin.</p>
    </div>
    <div class="forge-art">${HERO}</div>
  </header>

  <section class="land-sec"><div class="big3"><div><b>52</b><span>Weeks</span></div><div><b>66</b><span>Books</span></div><div><b>1</b><span>Commitment</span></div></div>
    <p class="lead" style="margin:26px auto 0;text-align:center">${esc(BRAND.secondary)}</p></section>

  <section class="land-sec"><div class="eyebrow">More than a reading plan</div><h2 class="h1" style="margin-top:8px">Everything a man needs to grow</h2>
    <div class="feat" style="margin-top:24px">${[
      ['book-open', 'The whole Bible', 'Read or listen to every book in 52 weeks, topical or chronological, with context for every chapter.'],
      ['flame', 'Practical discipleship', 'A weekly theme, devotional, reflection and a mission that turns reading into obedience.'],
      ['users', 'Brotherhood', 'Private crews of 2–12 men. Opt-in check-ins, shared prayer, encouragement. No rankings.'],
      ['hand-heart', 'Prayer and journaling', 'Guided prayers, a private journal, prayer requests and a record of answered prayer.'],
      ['brain', 'Scripture memory', 'One verse a week with spaced repetition. A few minutes a day.'],
      ['clipboard-list', 'For churches and groups', 'Point Man guides for every week: discussion, prayer and a challenge, ready to print.'],
    ].map(([ic, t, d]) => `<div class="card">${icon(ic)}<div class="h3" style="margin-top:10px">${t}</div><p class="muted" style="margin-top:6px">${d}</p></div>`).join('')}</div></section>

  <section class="land-sec"><div class="eyebrow">The 52-week journey</div><h2 class="h1" style="margin-top:8px">Twelve phases. One man, forged.</h2>
    <div class="feat" style="margin-top:20px">${PHASES.map((p) => `<div class="card tight flat"><div class="faint">Weeks ${p.weeks[0]}–${p.weeks[1]}</div><div class="h3">${esc(p.name)}</div><p class="faint" style="margin-top:4px">${esc(p.theme)}</p></div>`).join('')}</div></section>

  <section class="land-sec" id="lShotsSec" hidden><div class="eyebrow">Inside the app</div><div class="shots" style="margin-top:16px" id="lShots"></div></section>

  <section class="land-sec"><div class="eyebrow">Our foundation</div><div class="feat" style="margin-top:18px" id="lVerses">${verses.map(([, , , , r]) => `<div class="card flat"><p class="serif muted" data-v="${r}">…</p><div class="faint" style="margin-top:8px">${r} (WEB)</div></div>`).join('')}</div></section>

  <section class="land-sec"><div class="eyebrow">The mission</div><h2 class="h1" style="margin-top:8px">${BRAND.taglineLines.map(esc).join('<br>')}</h2>
    <p class="lead" style="margin-top:14px">We exist to develop men who are rooted in Scripture, devoted to Jesus Christ, faithful husbands, intentional fathers, humble leaders, responsible stewards, men of integrity, strong in prayer, connected to brothers and committed to sharing the gospel.</p>
    <p class="muted" style="margin-top:12px">${esc(BRAND.grace)} ${BRAND.philosophy.map(esc).join(' ')}</p></section>

  <section class="land-sec"><div class="eyebrow">Churches and men’s groups</div><h2 class="h2" style="margin-top:8px">Run FORGED52 with your men</h2><p class="lead" style="margin-top:10px">Start a crew, invite your men with a code, and use the weekly Point Man guide for a 45-minute meeting. Free for every church and group.</p><a class="btn" href="#start" style="margin-top:16px">${icon('users')} Start a crew</a></section>

  <section class="land-sec faq"><div class="eyebrow">Questions</div><h2 class="h2" style="margin:8px 0 12px">Frequently asked</h2>${[
    ['Does it cost anything?', 'No. FORGED52 is free, with no ads and no subscriptions.'],
    ['Do I need an account?', 'No. Start reading right away. Your progress is backed up privately in the background, and you can move it to another device with a code. Crews use the same private account.'],
    ['Which Bible translation?', 'The NLT is used where Tyndale’s public NLT service allows (until January 1, 2027). The World English Bible, a public-domain modern translation, is built in, works offline and is used for audio narration.'],
    ['How long does it take each day?', 'About 15 minutes of Scripture, or about 25 minutes for the full routine of prayer, reading, reflection and application. Everything beyond Scripture is optional.'],
    ['What if I miss days?', 'Nothing is lost. Resume where you left off, catch up gradually, or pick a new start date. Grace, not guilt.'],
    ['Who sees my journal and prayers?', 'Only you. Your crew can see whether you read today, and only if you choose to share that. Shared prayer requests are only the ones you post to your crew.'],
    ['Is the devotional content reviewed?', 'Scripture is the authority. The devotional and study content was drafted for FORGED and is marked as a draft until reviewed by pastors. Test everything by the Word.'],
  ].map(([q, a]) => `<details><summary>${q}</summary><p>${a}</p></details>`).join('')}</section>

  <section class="land-sec"><div class="eyebrow">Install</div><h2 class="h2" style="margin-top:8px">Put it on your Home Screen</h2>
    <div class="feat" style="margin-top:16px"><div class="card flat"><div class="h3">iPhone</div><p class="muted" style="margin-top:6px">Open this page in Safari, tap <b>Share</b>, then <b>Add to Home Screen</b>.</p></div><div class="card flat"><div class="h3">Android</div><p class="muted" style="margin-top:6px">Open in Chrome, tap the menu, then <b>Install app</b> or <b>Add to Home screen</b>.</p></div><div class="card flat"><div class="h3">Computer</div><p class="muted" style="margin-top:6px">Use it in any browser, or click the install icon in the address bar.</p></div></div>
    <div class="row-btns" style="margin-top:24px"><a class="btn primary" href="#start">${icon('flame')} Accept the challenge</a></div></section>
  <footer class="land-sec faint" style="text-align:center">${esc(BRAND.program)} · ${esc(BRAND.org)}<br>${esc(BRAND.tagline)}</footer>
  </div>`;
  paintIcons(root);
  root.querySelector('#lInvite').onclick = inviteSheet;
  for (const [u, c, a, b, r] of verses) verseText(u, c, a, b).then((t) => { const el = root.querySelector(`[data-v="${r}"]`); if (el) el.textContent = t; }).catch(() => {});
  fetch('assets/screens/list.json').then((r) => r.ok ? r.json() : []).then((list) => { if (!list.length) return; root.querySelector('#lShots').innerHTML = list.map((s) => `<img src="assets/screens/${s.file}" alt="${esc(s.alt)}" loading="lazy" width="440" height="952">`).join(''); root.querySelector('#lShotsSec').hidden = false; }).catch(() => {});
}

export function inviteSheet() {
  const s = sheet(`${sheetHead('Invite a brother', 'Iron sharpens iron')}<p class="muted">He’ll see your name at the top of the page.</p><label class="label" for="ivName" style="margin-top:12px">Your first name</label><input class="input" id="ivName" maxlength="20" value="${esc(store.name)}" autocomplete="given-name"><button class="btn primary block" type="button" id="ivGo" style="margin-top:14px">${icon('send')} Send the invite</button>`, { label: 'Invite a brother' });
  s.el.querySelector('#ivGo').onclick = async () => { const n = s.el.querySelector('#ivName').value.trim().replace(/[^A-Za-z .'-]/g, ''); if (n) { store.name = n; store.write(); }
    await share({ title: BRAND.program, text: `${n ? n + ' here. ' : ''}I'm taking the ${BRAND.program} challenge: the whole Bible in 52 weeks, growing as a man of God with brothers. Join me?`, url: `${BRAND.siteUrl}/${n ? '?from=' + encodeURIComponent(n) : ''}#welcome` }); s.close(); };
}
