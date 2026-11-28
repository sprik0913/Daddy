# FORGED52

**Forged by the Word. Strengthened by brothers. Transformed by Christ.**

FORGED52 is the flagship program of FORGED, a free discipleship app for men. It covers the whole Bible in 52 weeks, with a weekly theme, devotional, mission, prayer, Scripture memory and private crews. There are no ads and no subscriptions, and no account is needed to begin.

- **Live (production):** https://forged52.pages.dev, a Cloudflare Pages project (`forged52`). The redesign went live on 2026-11-28 as deployment `3259f1e8`.
- **Preview branch:** https://preview.forged52.pages.dev (Pages branch `preview`).
- **Rollback:** the last pre-redesign production deployment is `658f8cc1` (https://658f8cc1.forged52.pages.dev). Roll back in the Cloudflare dashboard under Pages → forged52 → Deployments.

## Architecture

The app is plain HTML, CSS and ES modules. It has no build step or framework, so any static host works.

```
index.html              app shell (nav, main, fullscreen container, toast)
css/tokens.css          design tokens: colors per theme, type, spacing, radii
css/app.css             components and layouts (mobile first; sidebar at >= 960px)
js/config.js            BRAND, PROGRAMS, FLAGS, PHASES, THEMES, notification categories, public keys
js/app.js               hash router, theme, deep links (?plan&week&day sync, ?crew=CODE invites), boot
js/core/plan.js         pure reading-plan logic (unit tested)
js/core/store.js        local persistence + migration from the old app (unit tested)
js/core/bible.js        Scripture: bundled WEB, NLT API, reference lookup, keyword search, audio URLs
js/core/cloud.js        Supabase: anonymous auth, sync, crews, prayer, push, device transfer
js/core/data.js         loads plans, curriculum, recaps; helpers for the current day/week
js/core/ui.js           DOM helpers, sheets (dialogs), toasts, icons, share/download
js/screens/*.js         one module per screen, loaded on demand
data/*.json             compiled content (plans, curriculum, recaps, study, WEB text, audio index)
content/                editable sources for the curriculum, recaps and study center
tools/                  build scripts (curriculum, study, recaps, plan fixes, Cloudflare worker)
supabase/               migrations and edge functions
tests/                  unit tests (node:test) and a Playwright smoke test
```

### Routes

| Hash | Screen |
|---|---|
| `#welcome` | Public landing page (first visit) |
| `#start` | 7-step onboarding |
| `#today` | Daily dashboard: the Word, the Forge, the Mission, the Prayer, the Brotherhood, Scripture memory, completion |
| `#journey`, `#week-N` | 12 phases and 52 weeks; each week's devotional, readings, questions, mission, discussion guide |
| `#study`, `#study-<section>[-<id>]` | Understand the Bible (66 book intros, timeline, covenants, prophecies, genres, places, background), Biblical manhood (20 topics), Hard questions (21), Prayer room (16 guides), Scripture library (22 topics), My library, Study assistant (not configured) |
| `#crew`, `#lead-N` | Brotherhood (crews) and the printable Point Man meeting guide |
| `#profile`, `#journal`, `#memory`, `#word` | Profile and settings, private journal, Scripture memory, posting the weekly word |

The old app's links still work. `#challenge`, `#plan`, `#join` and `#why` redirect, and so does `?plan=topical&week=28&day=7`.

## Branding

Every product name, tagline and hero line lives in `BRAND` in `js/config.js`. To rename the app, change it there. Programs are listed in `PROGRAMS`, and FORGED52 is the flagship. A future program reuses the same week, phase and curriculum shape.

## Design system: Iron & Bronze

| Token | Value | Use |
|---|---|---|
| `--bg` | `#141613` | Background |
| `--bg-2` | `#1D211B` | Deep charcoal surfaces |
| `--card` | `#272B25` | Cards |
| `--olive` | `#626B52` | Tactical olive |
| `--accent` | `#C59B61` | Bronze accent |
| `--text` | `#F4F0E7` | Bone text |
| `--text-2` | `#B7B8AE` | Secondary text |
| `--line` | `#393B34` | Borders |

- **Type:** Barlow Condensed for headings, Inter for UI, Source Serif 4 for Scripture.
- **Themes:** Iron & Bronze (default), Bone (light), Venom and High contrast. They live in `css/tokens.css` and are chosen in Profile.
- **Large text:** a separate option.
- **Icons:** Lucide.

## Data and migration (nothing is lost)

- **Legacy keys:** the old app stored progress in `localStorage` keys `f52.*`. These keys are still read and written, so rolling back to the old site keeps working.
- **Backup snapshot:** on first launch, every `f52.*` key is copied into `forged.backup.v0` before anything else happens.
- **New state:** journal entries, highlights, notes, saved verses, memory progress and preferences live in `forged.state` (schema v1).
- **Journal:** daily journal lines from the old app (`f52.j.N`) become journal entries, and the original keys stay in place.
- **Backup and restore:** Profile → Backup exports everything as JSON. Restore is additive, and it saves `forged.backup.beforeImport` first.
- **Cloud copy:** the app signs in anonymously and keeps a private copy in Supabase `progress.data`, protected by row-level security. Device transfer codes move it to a new phone.
- **Database backup:** before the schema changes, the database was backed up outside the repo. Migration `002` only adds columns and tables; nothing was dropped.

## Scripture and licensing

- **World English Bible (WEB):** public domain and bundled in `data/web.json` (from TehShrike/world-english-bible). It is used offline, in the Study library and for memory verses.
- **NLT:** loaded from Tyndale's public NLT API (`api.nlt.to`, anonymous, non-commercial, 50 verses per request). The text is never cached to storage, and the copyright line is shown. **Tyndale ends public access on January 1, 2027**; after that, `FLAGS.nltEnabled` turns off and the reader uses WEB. Continued NLT use needs a license from Tyndale.
- **Landing hero photo:** "Vintage smith's workshop - 0172" by Jorge Royan, CC BY-SA 3.0, via Wikimedia Commons (cropped and color-graded). The license requires the credit line shown in the landing page footer.
- **Narration:** Winfred W. Henson's public-domain WEB recording, streamed from ebible.org.
- **No text changes:** Scripture text is never edited. Memory and library verses are copied exactly, and a unit test checks every memory verse against the WEB.

## Content review status

The 52-week curriculum (`content/curriculum/`), chapter recaps (`content/*.txt`) and the study center (`content/study/`) were drafted for FORGED. They are **marked as drafts awaiting pastoral review** in the app. To mark them reviewed, set `FLAGS.contentReviewed = true`. Where Christians disagree, as with some hard questions, the main views are named rather than one being presented as the only one.

To rebuild the content after editing:

```
python3 tools/build_curriculum.py   # data/curriculum.json (+ reminders weekly table); validates memory refs
python3 tools/build_study.py        # data/study.json; validates every reference against the WEB
python3 tools/build_recap.py        # data/recap.json; checks all 1,189 chapters
```

### Reading plan corrections

The plans came from the original app. Tests showed that Topical skipped 41 chapters and Chronological skipped 34, including 1–3 John and all of Revelation.

The cause was bare book names like "Ruth" being read as chapter 1 only, plus three typos. `tools/fix_plans.py` documents the corrections. No day numbers moved, so existing progress is unaffected. Both plans now read all 1,189 chapters, and `tests/plan.test.mjs` checks this.

## Backend (Supabase)

- **Project:** `tfqirxldqhlylhcmbovq`.
- **Migrations:** in `supabase/migrations/` and applied in order. `001_initial.sql` covers profiles, progress, crews, nudges, push, words and transfer codes. `002_forged_brotherhood.sql` adds the app data column, crew details and meetings, posts, prayer requests, `crew_status` with opt-in sharing, and notification preferences.
- **Edge functions:**
  - `api`: transfer codes, nudges, `crew_notify`, `delete_account`, the weekly word and test pushes.
  - `reminders`: runs hourly through pg_cron with the `x-cron-key` header. It sends daily reading, Sunday memory and mission, evening prayer and crew meeting reminders, each only if that device turned the category on.
- **Secrets:** `VAPID_PUBLIC`, `VAPID_PRIVATE`, `ADMIN_KEY` (Point Man posting key) and `CRON_KEY`. They live only in Supabase function secrets.
- **Keys in the app:** the browser holds only the public anon key and the public VAPID key (`js/config.js`). Both are designed to be public, and row-level security enforces access.

Deploy a function:

```
curl -X POST "https://api.supabase.com/v1/projects/<ref>/functions/deploy?slug=api" \
  -H "Authorization: Bearer <management token>" \
  -F 'metadata={"entrypoint_path":"index.ts","name":"api","verify_jwt":false}' -F file=@supabase/functions/api/index.ts
```

### Privacy rules built in

- Journals, personal prayers, notes and reading history are never shared.
- Crewmates see only a member's name and, if he opts in, whether he read today and how many days this week.
- Prayer requests are visible only when posted to a crew.
- Crew notifications never include the text itself.
- There are no leaderboards or streak rankings, and missed days are never shown to others.

## Deploying to Cloudflare Pages

```
python3 tools/build_worker.py . /tmp/_worker.js        # packs assets/ css/ js/ data/ + root files (about 1.8 MB gzipped; the free limit is 3 MB)
curl -X POST "https://api.cloudflare.com/client/v4/accounts/<account>/pages/projects/forged52/deployments" \
  -H "Authorization: Bearer <token>" -F manifest={} -F branch=preview -F "_worker.js=@/tmp/_worker.js;type=application/javascript+module"
```

- `branch=preview` makes a preview deployment. `branch=main` replaces production.
- Bump `VERSION` in `sw.js` on each release so installed apps pick up the new files.

## Tests

```
node --test tests/*.test.mjs             # 14 unit tests: plans, dates, catch-up, lookup, curriculum, migration
python3 -m http.server 8765 & node tests/e2e.mjs test-results   # Playwright smoke test
```

The smoke test opens every screen at 390, 768 and 1280 px as a returning week-28 user with old-app data. It fails on any page error, console error, horizontal scroll or failed render. It also checks that the old journal entry and theme survived, opens the reader, and walks a new visitor from the landing page through onboarding to Today. Live services (Supabase, NLT, audio) are blocked so the run is repeatable.

## Known limitations

- **NLT:** ends January 1, 2027 unless Tyndale licenses continued use.
- **Cross-references:** none; no licensed cross-reference dataset is connected.
- **Study assistant:** designed but **not active**. It needs a server-side AI provider behind a Supabase edge function, never a key in the browser, plus content guardrails. The Study tab says so plainly.
- **iPhone notifications:** only work after the app is added to the Home Screen (an iOS 16.4+ requirement).
- **Accounts:** anonymous. Moving to a new device uses a 15-minute transfer code; there is no email sign-in yet, because Supabase's free tier does not allow custom email templates.
- **Offline:** the app works offline after the first visit. NLT text, narration audio and crew features need a connection.
- **Accessibility:** the target is WCAG 2.2 AA: semantic landmarks, labels, focus states, reduced motion, large text and a high-contrast theme. It has not yet had an audit with a screen reader on real devices.

## Integrations needing credentials or licensing

| Integration | Status | Needed |
|---|---|---|
| NLT text | Public API until 2027-01-01 | Tyndale license for continued or commercial use |
| NLT audio | Not included | Tyndale/Hosanna license |
| Cross-references | Not included | A licensed dataset (for example, Treasury of Scripture Knowledge, which is public domain, or a licensed one) |
| AI study assistant | Off | AI provider API key stored as a Supabase secret, plus pastoral review of prompts |
| Email sign-in | Not used | Supabase paid tier or custom SMTP for magic-link templates |
| Push notifications | Working (VAPID) | Nothing more |
