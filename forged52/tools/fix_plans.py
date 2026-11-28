#!/usr/bin/env python3
"""One-time corrections to the reading plans carried over from the original app (applied 2026-11-28).
Day numbers never move, so existing progress is unaffected. Idempotent: running it again changes nothing.
  Topical: 'I Cor 11-2' -> 'I Cor 11-12'; week 32 Tuesday repeated 'I Kings 1-4' -> 'I Chron 1-4'; 'Heb 5-6' -> 'Heb 5-7'.
  Chronological: adds Jeremiah 21 and Psalms 14, 23, 24, 70 next to related readings, and rebalances
  weeks 49-52 so 1-3 John and Revelation (missing before) are read at the end, in order."""
import json, os, re
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
path = os.path.join(ROOT, 'data/plans.json'); P = json.load(open(path))
D = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']
T, C = P['topical'], P['chrono']

def sub(plan, week, day, old, new):
    cur = str(plan[week - 1][day])
    if cur == new: return
    assert cur == old, f'{week} {day}: expected {old!r}, found {cur!r}'
    plan[week - 1][day] = new

sub(T, 14, 'sunday', 'I Cor 11-2', 'I Cor 11-12')
sub(T, 32, 'tuesday', 'I Kings 1-4', 'I Chron 1-4')
sub(T, 40, 'sunday', 'Heb 5-6', 'Heb 5-7')
sub(C, 32, 'thursday', 'Jeremiah 17-20', 'Jeremiah 17-21')
sub(C, 42, 'wednesday', 'I Chron 20, 23-25', 'I Chron 20, Psalms 14, 23-24, 70')  # 1 Chron 23-25 was already read in week 20

# Rebalance chrono weeks 49-52 with 1-3 John and Revelation appended
ABBR = {'ACT': 'Acts', '1CO': 'I Cor', '2CO': 'II Cor', 'ROM': 'Rom', 'EPH': 'Eph', 'PHP': 'Phil', 'COL': 'Col', 'PHM': 'Philemon', '1TI': 'I Tim', 'TIT': 'Titus', '2TI': 'II Tim',
        '1PE': 'I Peter', '2PE': 'II Peter', 'JUD': 'Jude', 'HEB': 'Heb', '1JN': 'I John', '2JN': 'II John', '3JN': 'III John', 'REV': 'Rev'}
FROM = {v: k for k, v in ABBR.items()}
COUNTS = {'PHM': 1, 'JUD': 1, '2JN': 1, '3JN': 1}
if 'Rev' not in json.dumps(C[51]):
    seq = []
    for w in C[48:52]:
        for d in D:
            book = None
            for part in [x.strip() for x in str(w[d]).split(',')]:
                m = re.match(r'^((?:I{1,3} )?[A-Za-z]+)\s*(.*)$', part)
                if m and m.group(1) in FROM: book, rest = FROM[m.group(1)], m.group(2)
                else: rest = part
                if not rest: seq += [(book, 1)]; continue
                a, _, b = rest.partition('-'); seq += [(book, c) for c in range(int(a), int(b or a) + 1)]
    seq += [('1JN', c) for c in range(1, 6)] + [('2JN', 1), ('3JN', 1)] + [('REV', c) for c in range(1, 23)]
    days, i = [], 0
    for k in range(28):
        take = round((len(seq) - i) / (28 - k)); days.append(seq[i:i + take]); i += take
    def fmt(chs):
        out, j = [], 0
        while j < len(chs):
            b, a = chs[j]; e = a
            while j + 1 < len(chs) and chs[j + 1][0] == b and chs[j + 1][1] == e + 1: j += 1; e = chs[j][1]
            out.append(ABBR[b] if b in COUNTS else f'{ABBR[b]} {a}' + (f'-{e}' if e != a else '')); j += 1
        return ', '.join(out)
    for k, chs in enumerate(days): C[48 + k // 7][D[k % 7]] = fmt(chs)

json.dump(P, open(path, 'w'), ensure_ascii=False, separators=(',', ':'))
for w in C[48:52]: print(w['week'], [w[d] for d in D])
