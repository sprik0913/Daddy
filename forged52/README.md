# Forged52

A calm, four-page site for the Forged52 challenge: read the whole Bible in 52 weeks. Open `index.html` or host the folder on any static host.

- **Today** (default): today's reading, Listen, Mark complete, streak, progress, a verse for the day, and this week's checklist
- **Plan**: choose Mixed (each weekday a different part of the Bible) or In order (chronological), set a start date, and see all 52 weeks. It opens on your current week; changing the start date moves everything with it
- **Why**: a short explanation of the challenge
- **Start**: pick a start date and route, add all 364 readings to your calendar as reminders, and copy an invite link

**Listening**: each reading opens a player that reads the passage aloud verse by verse with the phone's voice, highlighting the current verse in large type. NLT comes from Tyndale's NLT API (anonymous, non-commercial; Tyndale ends public access January 1, 2027, after which it falls back to WEB automatically). The full World English Bible (public domain, from github.com/TehShrike/world-english-bible) is bundled in `assets/web.json`, so WEB works offline and is the fallback whenever NLT or KJV can't be reached. KJV comes from bible-api.com. A link opens the same chapter with a human NLT narrator in the YouVersion Bible app. Finishing a reading marks it complete.

**Large text**: the Aa button scales the whole site up and brightens secondary text.

Progress is stored in the browser (localStorage); no account required. Reading plans come from the Forged52 app.
