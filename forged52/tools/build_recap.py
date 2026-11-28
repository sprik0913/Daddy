# Compile content/*.txt into assets/recap.json and check every chapter of every book is covered.
import json, glob, os, sys
here = os.path.dirname(os.path.abspath(__file__)); root = os.path.dirname(here)
web = json.load(open(os.path.join(root, 'assets/web.json'), encoding='utf-8'))
books, ch = {}, {}
missions, talk, verses = {}, {}, {}
NAMES = {}
for f in sorted(glob.glob(os.path.join(root, 'content/*.txt'))):
    for ln in open(f, encoding='utf-8'):
        ln = ln.rstrip('\n')
        if not ln.strip(): continue
        if ln.startswith('M|'):
            _, w, t = ln.split('|', 2); missions[int(w)] = t; continue
        if ln.startswith('T|'):
            _, code, t = ln.split('|', 2); talk[code] = t; continue
        if ln.startswith('V|'):
            _, w, code, c, a, b = ln.split('|'); verses[int(w)] = (code, int(c), int(a), int(b)); continue
        if ln.startswith('B|'):
            _, code, who, when, big, jesus = ln.split('|', 5)
            books[code] = {'who': who, 'when': when, 'big': big, 'jesus': jesus}
        else:
            ref, text = ln.split('|', 1); code, n = ref.split(' ')
            ch.setdefault(code, {})[int(n)] = text
out = {'books': books, 'ch': {}}; missing = []
for code, chapters in web.items():
    if code not in books: missing.append(code + ' (book intro)')
    lst = []
    for i in range(1, len(chapters) + 1):
        t = ch.get(code, {}).get(i)
        if t is None: missing.append(f'{code} {i}')
        lst.append(t or '')
    out['ch'][code] = lst
BOOKNAME = {'GEN':'Genesis','EXO':'Exodus','LEV':'Leviticus','NUM':'Numbers','DEU':'Deuteronomy','JOS':'Joshua','JDG':'Judges','RUT':'Ruth','1SA':'1 Samuel','2SA':'2 Samuel','1KI':'1 Kings','2KI':'2 Kings','1CH':'1 Chronicles','2CH':'2 Chronicles','EZR':'Ezra','NEH':'Nehemiah','EST':'Esther','JOB':'Job','PSA':'Psalm','PRO':'Proverbs','ECC':'Ecclesiastes','SNG':'Song of Songs','ISA':'Isaiah','JER':'Jeremiah','LAM':'Lamentations','EZK':'Ezekiel','DAN':'Daniel','HOS':'Hosea','JOL':'Joel','AMO':'Amos','OBA':'Obadiah','JON':'Jonah','MIC':'Micah','NAM':'Nahum','HAB':'Habakkuk','ZEP':'Zephaniah','HAG':'Haggai','ZEC':'Zechariah','MAL':'Malachi','MAT':'Matthew','MRK':'Mark','LUK':'Luke','JHN':'John','ACT':'Acts','ROM':'Romans','1CO':'1 Corinthians','2CO':'2 Corinthians','GAL':'Galatians','EPH':'Ephesians','PHP':'Philippians','COL':'Colossians','1TH':'1 Thessalonians','2TH':'2 Thessalonians','1TI':'1 Timothy','2TI':'2 Timothy','TIT':'Titus','PHM':'Philemon','HEB':'Hebrews','JAS':'James','1PE':'1 Peter','2PE':'2 Peter','1JN':'1 John','2JN':'2 John','3JN':'3 John','JUD':'Jude','REV':'Revelation'}
out['missions'] = [missions.get(i, '') for i in range(1, 53)]
out['talk'] = talk
vv = []
for i in range(1, 53):
    code, c, a, b = verses[i]
    text = ' '.join(web[code][c-1][a-1:b])
    for o, cl in (('“', '”'),):
        while text.count(o) != text.count(cl):
            if text.count(cl) > text.count(o): text = text.replace(cl, '', 1) if text.startswith(cl) else text[::-1].replace(cl, '', 1)[::-1]
            else: text = text.replace(o, '', 1)
    text = text.strip()
    vv.append({'ref': f"{BOOKNAME[code]} {c}:{a}" + (f"–{b}" if b != a else ''), 'text': text})
out['verses'] = vv
for i in range(1, 53):
    if not missions.get(i): missing.append(f'mission {i}')
for code in web:
    if code not in talk: missing.append(f'talk {code}')
json.dump(out, open(os.path.join(root, 'assets/recap.json'), 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
print('books', len(books), 'chapters', sum(len(v) for v in ch.values()), 'missing', missing)
