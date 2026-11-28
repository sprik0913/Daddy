// Reading-plan logic. Pure functions (no DOM, no storage) so they can be unit tested in Node.

export const DAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
export const DAYNAME = (k) => k[0].toUpperCase() + k.slice(1);
export const TOPICAL_LABELS = { sunday: 'Letters', monday: 'Foundations', tuesday: 'The Story', wednesday: 'Prayer & Worship', thursday: 'Wisdom', friday: 'The Prophets', saturday: 'Jesus' };
export const TOTAL_DAYS = 364;

export const BOOKS = {
  Gen: ['Genesis', 'GEN'], Exo: ['Exodus', 'EXO'], Lev: ['Leviticus', 'LEV'], Num: ['Numbers', 'NUM'], Deut: ['Deuteronomy', 'DEU'], Joshua: ['Joshua', 'JOS'], Judges: ['Judges', 'JDG'], Ruth: ['Ruth', 'RUT'],
  'I Sam': ['1 Samuel', '1SA'], 'II Sam': ['2 Samuel', '2SA'], 'I Kings': ['1 Kings', '1KI'], 'II Kings': ['2 Kings', '2KI'], 'I Chron': ['1 Chronicles', '1CH'], 'II Chron': ['2 Chronicles', '2CH'], Ezra: ['Ezra', 'EZR'], Neh: ['Nehemiah', 'NEH'], Esther: ['Esther', 'EST'],
  Job: ['Job', 'JOB'], Psalms: ['Psalms', 'PSA'], Prov: ['Proverbs', 'PRO'], Eccl: ['Ecclesiastes', 'ECC'], Song: ['Song of Songs', 'SNG'], Isaiah: ['Isaiah', 'ISA'], Jer: ['Jeremiah', 'JER'], Jeremiah: ['Jeremiah', 'JER'], Lam: ['Lamentations', 'LAM'], Lamentations: ['Lamentations', 'LAM'],
  Ezek: ['Ezekiel', 'EZK'], Daniel: ['Daniel', 'DAN'], Hosea: ['Hosea', 'HOS'], Joel: ['Joel', 'JOL'], Amos: ['Amos', 'AMO'], Obadiah: ['Obadiah', 'OBA'], Jonah: ['Jonah', 'JON'], Micah: ['Micah', 'MIC'], Nahum: ['Nahum', 'NAM'], Habakkuk: ['Habakkuk', 'HAB'], Zephaniah: ['Zephaniah', 'ZEP'], Haggai: ['Haggai', 'HAG'], Zech: ['Zechariah', 'ZEC'], Malachi: ['Malachi', 'MAL'],
  Matt: ['Matthew', 'MAT'], Mark: ['Mark', 'MRK'], Luke: ['Luke', 'LUK'], John: ['John', 'JHN'], Acts: ['Acts', 'ACT'], Rom: ['Romans', 'ROM'], 'I Cor': ['1 Corinthians', '1CO'], 'II Cor': ['2 Corinthians', '2CO'], Gal: ['Galatians', 'GAL'], Eph: ['Ephesians', 'EPH'], Phil: ['Philippians', 'PHP'], Col: ['Colossians', 'COL'],
  'I Thes': ['1 Thessalonians', '1TH'], 'II Thes': ['2 Thessalonians', '2TH'], 'I Tim': ['1 Timothy', '1TI'], 'II Tim': ['2 Timothy', '2TI'], Titus: ['Titus', 'TIT'], Philemon: ['Philemon', 'PHM'], Heb: ['Hebrews', 'HEB'], James: ['James', 'JAS'],
  'I Peter': ['1 Peter', '1PE'], 'II Peter': ['2 Peter', '2PE'], 'I John': ['1 John', '1JN'], 'II John': ['2 John', '2JN'], 'III John': ['3 John', '3JN'], Jude: ['Jude', 'JUD'], Rev: ['Revelation', 'REV'],
};
// Canonical order, full names and chapter counts (USFM codes)
export const CANON = [
  ['GEN', 'Genesis', 50], ['EXO', 'Exodus', 40], ['LEV', 'Leviticus', 27], ['NUM', 'Numbers', 36], ['DEU', 'Deuteronomy', 34], ['JOS', 'Joshua', 24], ['JDG', 'Judges', 21], ['RUT', 'Ruth', 4], ['1SA', '1 Samuel', 31], ['2SA', '2 Samuel', 24], ['1KI', '1 Kings', 22], ['2KI', '2 Kings', 25], ['1CH', '1 Chronicles', 29], ['2CH', '2 Chronicles', 36], ['EZR', 'Ezra', 10], ['NEH', 'Nehemiah', 13], ['EST', 'Esther', 10], ['JOB', 'Job', 42], ['PSA', 'Psalms', 150], ['PRO', 'Proverbs', 31], ['ECC', 'Ecclesiastes', 12], ['SNG', 'Song of Songs', 8], ['ISA', 'Isaiah', 66], ['JER', 'Jeremiah', 52], ['LAM', 'Lamentations', 5], ['EZK', 'Ezekiel', 48], ['DAN', 'Daniel', 12], ['HOS', 'Hosea', 14], ['JOL', 'Joel', 3], ['AMO', 'Amos', 9], ['OBA', 'Obadiah', 1], ['JON', 'Jonah', 4], ['MIC', 'Micah', 7], ['NAM', 'Nahum', 3], ['HAB', 'Habakkuk', 3], ['ZEP', 'Zephaniah', 3], ['HAG', 'Haggai', 2], ['ZEC', 'Zechariah', 14], ['MAL', 'Malachi', 4],
  ['MAT', 'Matthew', 28], ['MRK', 'Mark', 16], ['LUK', 'Luke', 24], ['JHN', 'John', 21], ['ACT', 'Acts', 28], ['ROM', 'Romans', 16], ['1CO', '1 Corinthians', 16], ['2CO', '2 Corinthians', 13], ['GAL', 'Galatians', 6], ['EPH', 'Ephesians', 6], ['PHP', 'Philippians', 4], ['COL', 'Colossians', 4], ['1TH', '1 Thessalonians', 5], ['2TH', '2 Thessalonians', 3], ['1TI', '1 Timothy', 6], ['2TI', '2 Timothy', 4], ['TIT', 'Titus', 3], ['PHM', 'Philemon', 1], ['HEB', 'Hebrews', 13], ['JAS', 'James', 5], ['1PE', '1 Peter', 5], ['2PE', '2 Peter', 3], ['1JN', '1 John', 5], ['2JN', '2 John', 1], ['3JN', '3 John', 1], ['JUD', 'Jude', 1], ['REV', 'Revelation', 22],
];
export const BOOKNAME = Object.fromEntries(CANON.map(([u, n]) => [u, n]));

const BOOK_RE = /(^|, )((?:I{1,3} )?[A-Za-z]+)/g;
export const nice = (ref) => ref.replace(BOOK_RE, (m, p, b) => p + (BOOKS[b] ? BOOKS[b][0] : b)).replace(/(\d)-(\d)/g, '$1–$2');

// "Psalms 131, 138-139" | "Titus 1-3, II Tim 1-4" | "Psalms 119:1-88" | "Ruth" (whole book) -> [{usfm,name,ch,v1?,v2?}]
export function parseRef(ref) {
  const out = []; let book = null;
  String(ref).split(',').map((x) => x.trim()).forEach((part) => {
    const m = part.match(/^((?:I{1,3} )?[A-Za-z]+)\s*(.*)$/); let rest = part;
    if (m && BOOKS[m[1]]) { book = BOOKS[m[1]]; rest = m[2]; }
    if (!book) return;
    if (!rest) { const n = CANON.find(([u]) => u === book[1])[2]; for (let c = 1; c <= n; c++) out.push({ name: book[0], usfm: book[1], ch: c }); return; } // bare book = whole book
    const vm = rest.match(/^(\d+):(\d+)-(\d+)$/);
    if (vm) { out.push({ name: book[0], usfm: book[1], ch: +vm[1], v1: +vm[2], v2: +vm[3] }); return; }
    const [a, b] = rest.split('-').map(Number);
    for (let c = a; c <= (b || a); c++) out.push({ name: book[0], usfm: book[1], ch: c });
  });
  return out;
}

export const iso = (d) => new Date(d.getTime() - d.getTimezoneOffset() * 6e4).toISOString().slice(0, 10);
export const parseDate = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
export const today0 = (now = new Date()) => { const d = new Date(now); d.setHours(0, 0, 0, 0); return d; };
export const nextSunday = (now = new Date()) => { const d = today0(now); d.setDate(d.getDate() + ((7 - d.getDay()) % 7)); return d; };

// 0-based index of today relative to the start date (negative = not started)
export const dayIndex = (start, now = new Date()) => Math.round((today0(now) - parseDate(start)) / 864e5);
export const scheduledDay = (start, now) => { const i = dayIndex(start, now); return i < 0 ? 1 : i >= TOTAL_DAYS ? TOTAL_DAYS : i + 1; };
export const dateFor = (start, n) => { const d = parseDate(start); d.setDate(d.getDate() + n - 1); return d; };
export const weekOf = (n) => Math.ceil(n / 7);

export function reading(plans, route, n) {
  const w = Math.floor((n - 1) / 7), k = DAYS[(n - 1) % 7];
  const ref = plans[route][w][k];
  return { n, ref, week: w + 1, key: k, day: DAYNAME(k), cat: route === 'topical' ? TOPICAL_LABELS[k] : '' };
}

export const chaptersIn = (ref) => parseRef(ref).length;
export function chaptersDone(plans, route, done) { let c = 0; for (const n of done) if (n >= 1 && n <= TOTAL_DAYS) c += chaptersIn(reading(plans, route, n).ref); return c; }

// first day (1..upTo) not yet completed, or null if all done
export function firstUnread(done, upTo = TOTAL_DAYS) { for (let n = 1; n <= upTo; n++) if (!done.has(n)) return n; return null; }

// Catch-up summary for the "Welcome back" flow
export function catchup(done, start, now = new Date()) {
  const sched = scheduledDay(start, now), idx = dayIndex(start, now);
  if (idx < 0) return { started: false, behind: 0, sched, next: 1 };
  const next = firstUnread(done, TOTAL_DAYS) || TOTAL_DAYS;
  let missed = 0; for (let n = 1; n < sched; n++) if (!done.has(n)) missed++;
  return { started: true, sched, next, missed, behind: Math.max(0, sched - next) };
}
// New start date so that `n` becomes today's reading (used by "resume where I left off")
export function startFor(n, now = new Date()) { const d = today0(now); d.setDate(d.getDate() - (n - 1)); return iso(d); }
// Gradual catch-up: readings to do today when spreading `behind` extra readings over `days` days
export function gradualToday(done, start, now = new Date(), perDay = 2) {
  const c = catchup(done, start, now); if (!c.started || c.behind <= 0) return [c.sched];
  const out = []; for (let n = c.next; n <= c.sched && out.length < perDay; n++) if (!done.has(n)) out.push(n);
  return out;
}

// Estimated minutes for a reading from a word-count table {USFM:[words per chapter]}
export function minutesFor(wordcount, ref, wpm = 220) {
  let w = 0; for (const c of parseRef(ref)) { const ch = (wordcount[c.usfm] || [])[c.ch - 1] || 0; w += c.v1 ? Math.round(ch * ((c.v2 - c.v1 + 1) / 60)) : ch; }
  return Math.max(2, Math.round(w / wpm));
}
