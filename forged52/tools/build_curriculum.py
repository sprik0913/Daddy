# Compile content/curriculum/*.txt into data/curriculum.json and validate every week.
import json, glob, os, re, sys
root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
web = json.load(open(os.path.join(root, 'data/web.json'), encoding='utf-8'))
NAMES = {'GEN':'Genesis','EXO':'Exodus','LEV':'Leviticus','NUM':'Numbers','DEU':'Deuteronomy','JOS':'Joshua','JDG':'Judges','RUT':'Ruth','1SA':'1 Samuel','2SA':'2 Samuel','1KI':'1 Kings','2KI':'2 Kings','1CH':'1 Chronicles','2CH':'2 Chronicles','EZR':'Ezra','NEH':'Nehemiah','EST':'Esther','JOB':'Job','PSA':'Psalm','PRO':'Proverbs','ECC':'Ecclesiastes','SNG':'Song of Songs','ISA':'Isaiah','JER':'Jeremiah','LAM':'Lamentations','EZK':'Ezekiel','DAN':'Daniel','HOS':'Hosea','JOL':'Joel','AMO':'Amos','OBA':'Obadiah','JON':'Jonah','MIC':'Micah','NAM':'Nahum','HAB':'Habakkuk','ZEP':'Zephaniah','HAG':'Haggai','ZEC':'Zechariah','MAL':'Malachi','MAT':'Matthew','MRK':'Mark','LUK':'Luke','JHN':'John','ACT':'Acts','ROM':'Romans','1CO':'1 Corinthians','2CO':'2 Corinthians','GAL':'Galatians','EPH':'Ephesians','PHP':'Philippians','COL':'Colossians','1TH':'1 Thessalonians','2TH':'2 Thessalonians','1TI':'1 Timothy','2TI':'2 Timothy','TIT':'Titus','PHM':'Philemon','HEB':'Hebrews','JAS':'James','1PE':'1 Peter','2PE':'2 Peter','1JN':'1 John','2JN':'2 John','3JN':'3 John','JUD':'Jude','REV':'Revelation'}
REQUIRED = ['foundation', 'truth', 'devotional', 'pointman', 'reflect', 'mission', 'discuss', 'endweek', 'prayer', 'memory']
LISTS = {'reflect', 'discuss'}

# Memory verse text is copied from the WEB exactly as published (including quotation marks that open in
# one verse and close in a later one). Never edit Scripture text here.

weeks = {}
for f in sorted(glob.glob(os.path.join(root, 'content/curriculum/*.txt'))):
    cur = None
    for ln in open(f, encoding='utf-8'):
        ln = ln.rstrip('\n')
        if not ln.strip() or ln.startswith('# '): continue
        m = re.match(r'^## WEEK (\d+) \| (.+)$', ln)
        if m: cur = {'week': int(m.group(1)), 'theme': m.group(2).strip()}; weeks[cur['week']] = cur; continue
        k, _, v = ln.partition(': ')
        if cur is None or not v: raise SystemExit(f'bad line in {f}: {ln[:60]}')
        cur[k.strip()] = [x.strip() for x in v.split('||')] if k.strip() in LISTS else v.strip()
problems = []
for w in range(1, 53):
    wk = weeks.get(w)
    if not wk: problems.append(f'week {w} missing'); continue
    for k in REQUIRED:
        if not wk.get(k): problems.append(f'week {w} missing {k}')
    try:
        u, c, a, b = wk['memory'].split('|'); c, a, b = int(c), int(a), int(b)
        verses = web[u][c - 1][a - 1:b]
        if len(verses) != b - a + 1 or not all(verses): raise ValueError
        wk['memory'] = {'usfm': u, 'ch': c, 'v1': a, 'v2': b, 'ref': f"{NAMES[u]} {c}:{a}" + (f"–{b}" if b != a else ''), 'text': ' '.join(verses), 'translation': 'WEB'}
    except Exception:
        problems.append(f'week {w} bad memory ref {wk.get("memory")}')
out = {'program': 'forged52', 'reviewed': False, 'weeks': [weeks[w] for w in range(1, 53) if w in weeks]}
json.dump(out, open(os.path.join(root, 'data/curriculum.json'), 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
print('weeks', len(out['weeks']), 'problems', problems)
if problems: sys.exit(1)

# Also emit the small weekly table used by the reminders edge function
_W = [{'theme': w['theme'], 'ref': w['memory']['ref'], 'mission': w['mission']} for w in json.load(open(os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'data/curriculum.json')))['weeks']]
open(os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'supabase/functions/reminders/weeks.ts'), 'w').write('// Weekly theme, memory verse and mission (generated from data/curriculum.json by tools/build_curriculum.py)\nexport const WEEKS: { theme: string; ref: string; mission: string }[] = ' + json.dumps(_W, ensure_ascii=False) + ';\n')
