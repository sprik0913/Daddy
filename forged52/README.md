# Forged52

Live: https://forged52.pages.dev (Cloudflare Pages project `forged52`; the folder is packed into one `_worker.js` and uploaded as a direct deployment). The older copy at https://forged52-daily.netlify.app stopped updating when the Netlify account ran out of credits.

A calm, four-page site for the Forged52 challenge: read the whole Bible in 52 weeks. Open `index.html` or host the folder on any static host.

- **Today** (default): today's reading, Listen, Mark complete, streak, progress, a verse for the day, and this week's checklist
- **Plan**: choose Topical (each weekday a different part of the Bible, same labels and order as the Forged52 app) or Chronological, set a start date, and see all 52 weeks. It opens on your current week; changing the start date moves everything with it
- **Challenge** (`#challenge`, the first page new visitors see): a full-screen challenge with rising sparks, the 1-in-10 stat (LifeWay Research, 2017), a phone-time calculator, "I'm in" (pick start day and plan, then a COMMITTED stamp drops you into Day 1), and "Call out a brother", which shares a link like `?from=Josh` that opens with "JOSH CALLED YOU OUT."
- **Setup**: pick a start date and route, add all 364 readings to your calendar as reminders, and copy an invite link

**Listening**: by default each reading plays a real human narration: Winfred W. Henson's public-domain recording of the World English Bible, streamed chapter by chapter from ebible.org (file list in `assets/audio.json`). The text follows along, there's a seek bar, and lock-screen controls work, so it keeps playing with the screen off. The robotic phone-voice reader has been removed. (Older notes below about NLT/KJV text loading describe code that is now dormant.) Previously a phone-voice mode read the passage aloud verse by verse, highlighting the current verse in large type. NLT comes from Tyndale's NLT API (anonymous, non-commercial; Tyndale ends public access January 1, 2027, after which it falls back to WEB automatically). The full World English Bible (public domain, from github.com/TehShrike/world-english-bible) is bundled in `assets/web.json`, so WEB works offline and is the fallback whenever NLT or KJV can't be reached. KJV comes from bible-api.com. A link opens the same chapter with a human NLT narrator in the YouVersion Bible app. Finishing a reading marks it complete.

**Dig deeper**: under each day's reading on Today: a one-line recap of every chapter read, a briefing on each book (author, setting, big idea, where Jesus shows up), three questions to think on, and a "Where did you see God today?" journal saved per day that can be shared with a brother. The recaps and briefings live in `content/*.txt` (one line per chapter, written for this site; worth a review by a pastor or Bible teacher) and are compiled to `assets/recap.json` by `python3 tools/build_recap.py`, which also checks all 1,189 chapters are covered.

**Sync link**: `https://forged52.pages.dev/?plan=topical&week=28&day=7` sets the plan, lines today up with that week and day (day 1 = Sunday) and marks earlier days complete, then cleans the address.

**Large text**: the Aa button scales the whole site up and brightens secondary text.

Progress is stored in the browser (localStorage); no account required. Reading plans come from the Forged52 app.

## Deploying

`python3 tools/build_worker.py <folder with index.html and assets/> _worker.js` packs the site into one Cloudflare Pages advanced-mode worker. Upload it as a direct deployment to the `forged52` Pages project (multipart POST to `/accounts/<id>/pages/projects/forged52/deployments` with `manifest={}`, `branch=main` and the `_worker.js` file).

## Crews, sync, reminders and more (backend)

Backend: Supabase project `forged52` (ref `tfqirxldqhlylhcmbovq`). Schema and security rules are in `supabase/schema.sql`; server functions in `supabase/functions/` (`api`: device transfer codes, crew nudges, posting/deleting the weekly word, test notification; `reminders`: run hourly by pg_cron, sends each subscriber today's reading at their chosen local hour unless they've already read). Secrets (VAPID private key, ADMIN_KEY for posting, CRON_KEY) live only in Supabase function secrets.

- Everyone is signed in anonymously in the background; no account needed.
- **Crew** tab: start or join a crew (2-12 men) with a 6-letter code or an invite link `?crew=CODE`. See who's read today, streaks, and send "Pick him up" (a push notification, once a day per man).
- **Patches**: earned at 1, 28, 91, 182, 273 and 364 readings.
- **Weekly mission**, **verse of the week** (with practice mode) and **Table Talk** (a family dinner question per book) come from `content/08-extras.txt`.
- **Daily reminders**: web push. On iPhone the site must be added to the Home Screen first (iOS 16.4+). Uses `sw.js` and `manifest.webmanifest`.
- **Use on another device**: make an 8-character code on one device and enter it on the other; the account moves over (no email needed).
- **Weekly word**: `#word` page (linked as "Post a word" in the footer). Needs the posting key. Posts show at the top of Today for 10 days, with optional voice recording, audio file or video link.
