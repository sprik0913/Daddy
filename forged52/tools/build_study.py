#!/usr/bin/env python3
"""Compile content/study/*.txt into data/study.json. Validates every reference against the bundled WEB
and attaches WEB text (public domain) to library verses and topic refs so Study works offline."""
import json, os, re, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
WEB = json.load(open(os.path.join(ROOT, 'data/web.json')))
RECAP = json.load(open(os.path.join(ROOT, 'data/recap.json')))
CANON_JS = open(os.path.join(ROOT, 'js/core/plan.js')).read()
NAMES = dict(re.findall(r"\['([0-9A-Z]{3})', '([^']+)', \d+\]", CANON_JS))
problems = []


def ref(r, where, text=True):
    m = re.fullmatch(r'([0-9A-Z]{3})\.(\d+)\.(\d+)(?:-(\d+))?', r.strip())
    if not m:
        problems.append(f'{where}: bad ref {r!r}'); return None
    u, c, a, b = m.group(1), int(m.group(2)), int(m.group(3)), int(m.group(4) or m.group(3))
    ch = (WEB.get(u) or [None] * 0)
    if u not in NAMES or c > len(ch) or b > len(ch[c - 1]) or a > b:
        problems.append(f'{where}: ref out of range {r}'); return None
    out = {'u': u, 'c': c, 'a': a, 'b': b, 'label': f"{NAMES[u]} {c}:{a}" + (f"–{b}" if b != a else '')}
    if text:
        out['t'] = ' '.join(ch[c - 1][a - 1:b]).strip()
    return out


def refs(line, where, text=True):
    return [x for x in (ref(r, where, text) for r in line.split(';') if r.strip()) if x]


def topics(name):
    out, cur, body = [], None, []
    for raw in open(os.path.join(ROOT, 'content/study', name + '.txt'), encoding='utf-8'):
        line = raw.rstrip('\n')
        if line.startswith('#') and not line.startswith('## '):
            continue
        if line.startswith('## '):
            if cur: cur['body'] = [p for p in '\n'.join(body).split('\n\n') if p.strip()]; out.append(cur)
            i, t = [x.strip() for x in line[3:].split('|', 1)]
            cur, body = {'id': i, 'title': t}, []
            continue
        m = re.match(r'^(refs|summary|practice|ask|views|prompts|focus):\s*(.*)$', line)
        if m and cur is not None:
            k, v = m.groups()
            if k == 'refs': cur['refs'] = refs(v, f'{name}/{cur["id"]}')
            elif k in ('practice', 'ask', 'prompts'): cur[k] = [x.strip() for x in v.split('||')]
            else: cur[k] = v.strip()
            continue
        if cur is not None: body.append(line)
    if cur: cur['body'] = [p.strip().replace('\n', ' ') for p in '\n'.join(body).split('\n\n') if p.strip()]; out.append(cur)
    for t in out:
        t['body'] = [p.strip().replace('\n', ' ') for p in t.get('body', []) if p.strip()]
        if name != 'library' and not t.get('summary'): problems.append(f'{name}/{t["id"]}: no summary')
    return out


def bible():
    secs, cur = [], None
    for raw in open(os.path.join(ROOT, 'content/study/bible.txt'), encoding='utf-8'):
        line = raw.strip()
        if line.startswith('## '):
            i, t = [x.strip() for x in line[3:].split('|', 1)]; cur = {'id': i, 'title': t, 'items': []}; secs.append(cur)
        elif line.startswith('item:') and cur:
            parts = [x.strip() for x in line[5:].split('|')]
            if len(parts) != 4: problems.append(f'bible/{cur["id"]}: item needs 4 fields: {line[:50]}'); continue
            cur['items'].append({'title': parts[0], 'label': parts[1], 'text': parts[2], 'refs': refs(parts[3], f'bible/{cur["id"]}', False)})
    return secs


books = [{'u': u, 'name': NAMES[u], **RECAP['books'][u]} for u in NAMES if u in RECAP['books']]
if len(books) != 66: problems.append(f'book intros: {len(books)} of 66')
data = {
    'draft': True,
    'books': books,
    'bible': bible(),
    'manhood': topics('manhood'),
    'questions': topics('questions'),
    'prayer': topics('prayer'),
    'library': topics('library'),
    'assistant': {'enabled': False, 'note': 'The AI study assistant is designed but not active. It needs a server-side provider (see README). No API keys are stored in the app.'},
}
if problems:
    print('\n'.join(problems)); sys.exit(1)
json.dump(data, open(os.path.join(ROOT, 'data/study.json'), 'w'), ensure_ascii=False, separators=(',', ':'))
print('study.json:', {k: len(v) for k, v in data.items() if isinstance(v, list)}, os.path.getsize(os.path.join(ROOT, 'data/study.json')) // 1024, 'KB')
