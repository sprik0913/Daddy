# Compile content/*.txt into assets/recap.json and check every chapter of every book is covered.
import json, glob, os, sys
here = os.path.dirname(os.path.abspath(__file__)); root = os.path.dirname(here)
web = json.load(open(os.path.join(root, 'assets/web.json'), encoding='utf-8'))
books, ch = {}, {}
for f in sorted(glob.glob(os.path.join(root, 'content/*.txt'))):
    for ln in open(f, encoding='utf-8'):
        ln = ln.rstrip('\n')
        if not ln.strip(): continue
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
json.dump(out, open(os.path.join(root, 'assets/recap.json'), 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
print('books', len(books), 'chapters', sum(len(v) for v in ch.values()), 'missing', missing)
