#!/usr/bin/env python3
"""Prints every uncovered line / branch / function of an lcov.info file with its source text.
Usage: python3 scripts/uncovered.py <lcov.info> [max]"""
import sys, os, re
lcov = sys.argv[1]; limit = int(sys.argv[2]) if len(sys.argv) > 2 else 400
rows, cur = [], None
recs = {}
for line in open(lcov):
    line = line.strip()
    if line.startswith('SF:'):
        cur = line[3:]; recs[cur] = {'lines': {}, 'br': [], 'fn': []}
    elif cur and line.startswith('DA:'):
        n, h = line[3:].split(',')[:2]
        recs[cur]['lines'][int(n)] = int(h)
    elif cur and line.startswith('BRDA:'):
        n, blk, br, h = line[5:].split(',')
        recs[cur]['br'].append((int(n), h))
    elif cur and line.startswith('FNDA:'):
        h, name = line[5:].split(',', 1); recs[cur]['fn'].append((int(h), name))
    elif line == 'end_of_record':
        cur = None
count = 0
base = os.path.dirname(os.path.dirname(os.path.abspath(lcov)))  # coverage/ sits in the package root
for f, r in sorted(recs.items()):
    path = f if os.path.isabs(f) else os.path.join(base, f)
    rel = os.path.relpath(path, os.getcwd())
    try: src = open(path).read().split('\n')
    except OSError: src = []
    out = []
    for n, h in sorted(r['lines'].items()):
        if h == 0: out.append((n, 'line', src[n-1].strip() if n-1 < len(src) else ''))
    seen = set()
    for n, h in r['br']:
        if h in ('0', '-') and (n) not in seen:
            seen.add(n); out.append((n, 'branch', src[n-1].strip() if n-1 < len(src) else ''))
    for h, name in r['fn']:
        if h == 0: out.append((0, 'function', name))
    if not out: continue
    print(f'\n== {rel}')
    for n, kind, text in sorted(out, key=lambda x: x[0]):
        print(f'  {n:>4} {kind:8} {text[:150]}'); count += 1
        if count >= limit: sys.exit(0)
print(f'\n{count} uncovered item(s) listed')
