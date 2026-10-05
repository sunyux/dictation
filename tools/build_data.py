"""Parse the 你好法语1 默写 PDFs (text extracted with pypdf) into nihao/data.js."""
import json, re, sys, os, unicodedata

SRC = sys.argv[1]  # dir with extracted .txt files
OUT = os.path.join(os.path.dirname(__file__), '..', 'data.js')
UNITS = {1: ('你好法语1_Unité1_默写版.txt', '你好法语1_Unité1_全文翻译默写.txt'),
         2: ('你好法语1_Unité2_默写版.txt', '你好法语1_Unité2_全文翻译默写.txt'),
         3: ('你好法语1_Unité3_默写版_1.txt', '你好法语1_Unité3_全文翻译默写.txt'),
         4: ('你好法语1_Unité4_默写版.txt', '你好法语1_Unité4_全文翻译默写.txt')}
# Rows lost at a PDF page break in the answer key
PATCH = {(1, 15): 'français(e)', (1, 16): 'italien(ne)', (1, 17): 'ma', (1, 18): 'mon'}

FOOT = re.compile(r'^Unité \d · Leçon .*第 \d+ 页\s*$')
LECON = re.compile(r'^Leçon (\d+)　(.+?)(?:　(.+?))?$')
GROUP = re.compile(r'^(\S.*?)　(\d+)$')

def read(name):
    lines = [l for l in open(os.path.join(SRC, name), encoding='utf-8').read().splitlines() if not FOOT.match(l)]
    out = []
    for l in lines:  # a leçon title that wrapped onto the next line
        if out and out[-1].startswith('Leçon ') and out[-1].endswith(' ') and not LECON.match(l):
            out[-1] = out[-1] + l
        else:
            out.append(l)
    return out

def cjk(c): return unicodedata.east_asian_width(c) in 'WF'
def width(s): return sum(2 if cjk(c) else 1 for c in s)

END = tuple('。！？：…）)」"')

def unwrap(lines):
    """Re-join lines the PDF wrapped at the page width."""
    out, last = [], ''
    for l in lines:
        if out and not l.startswith('– '):
            zh = any(cjk(c) for c in last)
            if last.endswith((' ', '-')) or (zh and width(last) >= 60 and not last.rstrip().endswith(END) and (cjk(l[0]) or l[0] in '（(')):
                out[-1] += l; last = l; continue
        out.append(l); last = l
    return [re.sub(r'\s+', ' ', o).strip() for o in out]

def split_lecons(lines, start, stop=None):
    res, cur = {}, None
    for l in lines[start:stop]:
        m = LECON.match(l)
        if m:
            cur = int(m.group(1)); res[cur] = {'title': m.group(2).replace('答案', '').strip(),
                                               'zh': (m.group(3) or '').replace('答案', '').strip(), 'lines': []}
        elif cur is not None:
            res[cur]['lines'].append(l)
    return res

POS = re.compile(r'(?:(?<=\s)|(?<=[^\x00-\x7f])|(?<=\]))((?:[a-zé]+\.)+(?:\s*/\s*(?:[a-zé]+\.)+)*|—)$')

def parse_rows(lines):
    """Yield (group, num, text) rows from a vocab table section."""
    group, rows = None, []
    for l in lines:
        if l.startswith('# 中文'): continue
        g = GROUP.match(l)
        if g and not re.match(r'^\d+ ', l):
            group = re.sub(r'（.*?）', '', g.group(1)).strip(); continue
        m = re.match(r'^(\d+)(?: (.*))?$', l)
        if m and (not rows or rows[-1][1] < int(m.group(1)) <= rows[-1][1] + 6):
            rows.append([group, int(m.group(1)), m.group(2) or ''])
        elif rows:
            rows[-1][2] += '\n' + l
    return rows

def vocab(q_lines, a_lines, lec):
    qi = q_lines.index('二、课文填空') if '二、课文填空' in q_lines else len(q_lines)
    ai = next((i for i, l in enumerate(a_lines) if l.startswith('二、课文')), len(a_lines))
    answers = {n: t.replace('\n', '') for _, n, t in parse_rows(a_lines[:ai])}
    items = []
    for group, n, t in parse_rows(q_lines[:qi]):
        t = t.replace('\n', '')
        m = POS.search(t)
        pos = m.group(1) if m else ''
        zh = t[:m.start()].strip() if m else t.strip()
        fr = PATCH.get((lec, n))
        if fr is None:
            a = answers.get(n, '')
            k, zs = 0, zh.replace(' ', '')
            for i, c in enumerate(a):
                if k == len(zs): fr = a[i:].strip(); break
                if c == ' ': continue
                if c == zs[k]: k += 1
                else: break
            else:
                fr = a[len(a):] if k == len(zs) else None
        if not fr:
            print(f'!! L{lec} #{n} {zh}: no answer ({answers.get(n)!r})', file=sys.stderr); continue
        items.append({'g': group, 'zh': zh, 'pos': '' if pos == '—' else pos, 'fr': fr})
    return items, q_lines[qi + 2:], a_lines[ai + 1:]

def cloze(q_lines, a_lines):
    q, a = '\n'.join(q_lines).replace('-\n', '-'), '\n'.join(a_lines).replace('-\n', '-')
    parts = re.split(r'_{2,}', q)
    pat = r'\s*'.join([])  # placeholder
    rx = ''
    for i, p in enumerate(parts):
        lit = r'\s*'.join(re.escape(w) for w in p.split())
        if p[:1].isspace() or (i and not p): lit = r'\s*' + lit
        rx += lit + (r'\s*' if p[-1:].isspace() else '')
        if i < len(parts) - 1: rx += r'([^\s]+?)'
    m = re.fullmatch(r'\s*' + rx + r'\s*', a, re.S)
    if not m:
        print('!! cloze mismatch', q_lines[:2], file=sys.stderr); return None
    blanks = list(m.groups())
    out_lines, bi = [], 0
    for line in unwrap(q_lines):
        segs = re.split(r'(_{2,})', line)
        row = []
        for s in segs:
            if re.fullmatch(r'_{2,}', s):
                row.append({'b': blanks[bi]}); bi += 1
            elif s: row.append(s)
        out_lines.append(row)
    return out_lines

def sents(t, zh):
    return len(re.findall(r'[。！？]', t)) if zh else len(re.findall(r'[.!?](?=\s|$)', t))

def align(zh, fr):
    """Merge Chinese paragraphs that the French keeps as one, matching sentence counts."""
    out, j = [], 0
    for f in fr:
        if j >= len(zh): break
        cur = zh[j]; j += 1
        if cur != f:
            while j < len(zh) and sents(cur, True) < sents(f, False) and zh[j] != fr[min(len(out) + 1, len(fr) - 1)]:
                cur += zh[j]; j += 1
        out.append(cur)
    return out

def texts(zh_lines, fr_lines):
    zh, fr = unwrap(zh_lines), unwrap(fr_lines)
    if len(zh) > len(fr): zh = align(zh, fr)
    if len(zh) != len(fr):
        print('!! line count', len(zh), len(fr), zh[:1], file=sys.stderr)
        for a, b in zip(zh, fr): print('   ', a, '|', b, file=sys.stderr)
    rows = []
    for z, f in zip(zh, fr):
        if z == f and not f.startswith('–'): rows.append({'h': f})
        else: rows.append({'zh': z, 'fr': f})
    return rows

book = {'id': 'nihao1', 'title': '你好法语 1', 'fr': 'Bonjour ! Le français 1', 'units': []}
for u, (vf, tf) in UNITS.items():
    v = read(vf); t = read(tf)
    vk = v.index('参考答案'); tk = t.index('参考答案')
    vq, va = split_lecons(v, 0, vk), split_lecons(v, vk)
    tq, ta = split_lecons(t, 0, tk), split_lecons(t, tk)
    lecons = []
    for n in vq:
        items, cq, ca = vocab(vq[n]['lines'], va[n]['lines'], n)
        lecons.append({'n': n, 'title': vq[n]['title'], 'zh': vq[n]['zh'], 'vocab': items,
                       'cloze': cloze(cq, ca), 'text': texts(tq[n]['lines'], ta[n]['lines'])})
        print(f'L{n}: {len(items)} words, {len(lecons[-1]["text"])} lines', file=sys.stderr)
    book['units'].append({'n': u, 'lecons': lecons})

with open(OUT, 'w', encoding='utf-8') as f:
    f.write('// Generated by tools/build_data.py from the 你好法语1 默写 PDFs.\nwindow.BOOKS = [' +
            json.dumps(book, ensure_ascii=False, indent=1) + '];\n')
