"""Build nlf-data.js (the NLF · Road to A1 vocabulary book) from tools/nlf/sheet.json (the Google Sheet)
and tools/nlf/uN.txt (zh meaning, zh example, memory tips; one line per sheet row, same order)."""
import json, re, os, sys
HERE = os.path.dirname(__file__)
OUT = os.environ.get('OUT') or os.path.join(HERE, '..', 'nlf-data.js')
sheet = json.load(open(os.path.join(HERE, 'nlf', 'sheet.json')))

THEMES = {
 0: ('Les bases', '基础：问候、时间、季节'), 1: ('Se présenter', '自我介绍、爱好、国家'),
 2: ('La famille et le quartier', '家人、街区、日常活动'), 3: ('Manger et faire les courses', '饮食、购物、餐厅'),
 4: ('La ville et les déplacements', '城市、交通、方向'), 5: ('Les vêtements et les couleurs', '衣服、颜色、物品'),
 6: ('Le portrait', '外貌、性格、日常作息'), 7: ('Le logement', '住处、家具、设备'),
 8: ('La santé et le sport', '健康、身体、运动'), 9: ('Les vacances', '假期、住宿、自然'),
 10: ('Le travail et les études', '工作、学习、校园')}
THEMES_EN = {0: 'Basics: greetings, time, seasons', 1: 'Introductions, hobbies, countries', 2: 'Family, neighbourhood, daily activities',
 3: 'Food, shopping, restaurants', 4: 'City, transport, directions', 5: 'Clothes, colours, objects', 6: 'Looks, personality, daily routine',
 7: 'Home, furniture, equipment', 8: 'Health, body, sport', 9: 'Holidays, accommodation, nature', 10: 'Work, study, campus'}
POS = {'adj': ('形容词', 'adj.'), 'adv': ('副词', 'adv.'), 'v': ('动词', 'v.'), 'loc': ('冠词、感叹词、短语', 'loc.'),
       'prep': ('介词、连词', 'prép.'), 'pron': ('代词', 'pron.'), 'num': ('形容词', 'adj.num.'),
       'm': ('阳性名词', 'n.m.'), 'f': ('阴性名词', 'n.f.'), 'n': ('名词', 'n.'), 'pl': ('名词', 'n.pl.')}
FIX_FR = {'Forte(e)': 'Fort(e)', 'Une étudiant(e)': 'Un(e) étudiant(e)', 'Un visioconférence / visio / zoom / appel vidéo': 'Une visioconférence / visio / zoom / appel vidéo',
          'Une bande dessinée  (BD)': 'Une bande dessinée (BD)'}
FIX_EX = {"J'ai acheté mes billets pour le concert de demain?.": "J'ai acheté mes billets pour le concert de demain."}
ACC_EXTRA = {  # hand-set accepted answers where the sheet wording is not a plain "A / B"
 'X fois par ...': ['X fois par', 'x fois par'], 'Avoir mal à ...': ['Avoir mal à'], 'Qui ?': ['Qui'],
 'Pas cher/chère': ['Pas cher', 'Pas chère'], 'Nord, Sud, Est, Ouest': ['Nord, Sud, Est, Ouest', 'Nord Sud Est Ouest'],
 'Bleu / Saignant / À point / Bien cuit': ['Bleu', 'Saignant', 'À point', 'Bien cuit', 'Bleu, Saignant, À point, Bien cuit'],
 'Beurk !': ['Beurk'], 'Bof !': ['Bof'], 'Joyeux anniversaire !': ['Joyeux anniversaire'],
 'Ça va ? / Ça va.': ['Ça va ?', 'Ça va', 'Ça va ? Ça va'],
 "Être/Tomber en panne": ['Être en panne', 'Tomber en panne', 'Être/Tomber en panne'],
 'Midi / Le midi': ['Midi', 'Le midi'],
 'Le "football américain"': ['Le football américain', 'Le "football américain"'],
 '"Je voudrais"': ['Je voudrais'], '"Marcher"': ['Marcher'],
 "À gauche/droite/côté de": ['À gauche de', 'À droite de', 'À côté de', 'À gauche', 'À droite', 'À côté', 'À gauche/droite/côté de'],
 'La première/seconde classe': ['La première classe', 'La seconde classe', 'La première/seconde classe'],
 'Un lit simple/double': ['Un lit simple', 'Un lit double', 'Un lit simple/double'],
 'Prendre une photo/vidéo': ['Prendre une photo', 'Prendre une vidéo', 'Prendre une photo/vidéo'],
 'Du sirop pour la toux/gorge': ['Du sirop pour la toux', 'Du sirop pour la gorge', 'Du sirop pour la toux/gorge'],
 'Une salle de classe/cours': ['Une salle de classe', 'Une salle de cours', 'Une salle de classe/cours'],
 'Une / De la barbe': ['Une barbe', 'De la barbe', 'Une / De la barbe'], 'Une / De la moustache': ['Une moustache', 'De la moustache', 'Une / De la moustache'],
 "L'oeil / Les yeux": ["L'oeil", 'Les yeux', "L'œil", "L'oeil / Les yeux"],
 'Payer (par carte, en espèces, en liquide)': ['Payer', 'Payer par carte', 'Payer en espèces', 'Payer en liquide', 'Payer (par carte, en espèces, en liquide)'],
 'Du jus (de fruit)': ['Du jus', 'Du jus de fruit', 'Du jus (de fruit)'],
 'Du vin (rouge, rosé, blanc)': ['Du vin', 'Du vin rouge', 'Du vin rosé', 'Du vin blanc', 'Du vin (rouge, rosé, blanc)'],
 'Une carafe (d\'eau)': ['Une carafe', "Une carafe d'eau", "Une carafe (d'eau)"],
 'Une bouteille (de)': ['Une bouteille', 'Une bouteille de', 'Une bouteille (de)'],
 'Une fuite (d\'eau, de gaz)': ['Une fuite', "Une fuite d'eau", 'Une fuite de gaz', "Une fuite (d'eau, de gaz)"],
 'Un arrêt (de bus, de tram)': ['Un arrêt', 'Un arrêt de bus', 'Un arrêt de tram', 'Un arrêt (de bus, de tram)'],
 'Une ligne (de bus, de métro)': ['Une ligne', 'Une ligne de bus', 'Une ligne de métro', 'Une ligne (de bus, de métro)'],
 'Un film (d\'action, d\'amour, d\'horreur, ...)': ['Un film', "Un film d'action", "Un film d'amour", "Un film d'horreur"],
 'Une vue sur ... (la mer, la montagne, ...)': ['Une vue sur', 'Une vue sur la mer', 'Une vue sur la montagne', 'Une vue sur ... (la mer, la montagne, ...)'],
 "L'aller / Le retour / Un aller-retour": ["L'aller", 'Le retour', 'Un aller-retour', "L'aller / Le retour / Un aller-retour"],
 'En avoir assez / En avoir marre / Ne plus en pouvoir': ['En avoir assez', 'En avoir marre', 'Ne plus en pouvoir'],
 'Un(e) plombier / plombière': ['Un plombier', 'Une plombière', 'Un plombier / plombière', 'Un(e) plombier / plombière'],
 'Une ordonnance': None,
}
def clean(s): return re.sub(r'\s+', ' ', s.replace('\\', '')).strip()
def strip_q(s): return s.replace('"', '') if s.count('"') == 2 and s[0] == '"' and s[-1] == '"' else s
def article_pos(fr, cat):
    if cat.startswith('Adj'): return 'adj'
    if cat.startswith('Adv'): return 'adv'
    if cat.startswith('Ver'): return 'v'
    if cat.startswith(('Exp', 'For', 'Que')): return 'loc'
    if cat.startswith('Pro'): return 'pron'
    if cat.startswith('Pr'): return 'prep'
    f = fr.lower()
    if re.match(r'^(le|un) ', f): return 'm'
    if re.match(r'^(la|une|de la) ', f): return 'f'
    if re.match(r'^(les|des) ', f): return 'pl'
    return 'n'
def variants(part):
    """masculine/short form (parentheses dropped) and feminine/long form (parentheses opened)."""
    m = re.sub(r'\s*\([^)]*\)', '', part).strip()
    f = re.sub(r'\(([^)]*)\)', r'\1', part).strip()
    # "Un(e) cousin(e)" -> "Un cousin" / "Une cousine"
    m2 = re.sub(r'\(e\)', '', part); m2 = re.sub(r'\(([^)]*)\)', '', m2).strip()
    return [x for x in dict.fromkeys([part, m, f, m2]) if x]
def accept(fr):
    if fr in ACC_EXTRA and ACC_EXTRA[fr]: return ACC_EXTRA[fr]
    out = [fr]
    for part in [p.strip() for p in re.split(r'\s+/\s+', fr)]:
        out += variants(part)
    # French words like "Brésilien(ne)" -> also "Brésilienne"; handled by variants()
    out = [clean(x) for x in out if x]
    return list(dict.fromkeys(out))
def say_of(fr):
    if fr in ACC_EXTRA and ACC_EXTRA[fr]: return ACC_EXTRA[fr][0].replace('X fois par', 'fois par')
    part = re.split(r'\s+/\s+', fr)[0]
    return re.sub(r'\(([^)]*)\)', lambda m: '' if m.group(1) in ('e', 'ne', 'que') else m.group(1), part).replace('  ', ' ').strip()

ART = r"^(le |la |les |l'|un |une |des |du |de la |de l'|d'|un\(e\) |\(faire\) )"
def blank(ex, fr):
    """split an example sentence around the word that matches the headword: [pre, {b: word}, post]"""
    head = re.split(r'\s+/\s+', fr)[0]
    head = re.sub(r'\([^)]*\)', ' ', head)
    words = [w for w in re.findall(r"[^\W\d_]+(?:-[^\W\d_]+)*", head.lower()) if w not in {'le','la','les','un','une','des','du','de','d','l','à','au','aux','en','sur','pour','qui','que','faire','avoir','être','x'}] or re.findall(r"[^\W\d_]+", head.lower())
    toks = [(m.start(), m.end(), m.group().lower()) for m in re.finditer(r"[^\W\d_]+(?:-[^\W\d_]+)*", ex)]
    for w in words:
        k = max(3, min(len(w), len(w) - 2 if len(w) > 5 else len(w) - 1 if len(w) > 3 else len(w)))
        for s, e, t in toks:
            if t == w or (len(w) >= 4 and t[:k] == w[:k] and abs(len(t) - len(w)) <= 4):
                if t in {'le','la','les','un','une','des','du','de'}: continue
                return [ex[:s], {'b': ex[s:e]}, ex[e:]] if s else [{'b': ex[s:e]}, ex[e:]]
    return None

BLANK = {'Un an': 'ans', 'Avoir': 'ai', 'Être': 'suis', 'La copine / La petite-copine / La petite-amie / La meuf': 'petite-amie',
 'Le copain / Le petit-copain / Le petit-ami / Le mec': 'petit-ami', 'Connaître': 'connais', 'Bleu / Saignant / À point / Bien cuit': 'à point',
 'La carte / Le menu': 'menu', 'Aller': 'vais', 'Mettre': 'mets', 'Vouloir': 'veux', 'Des moules': 'moules', 'Dormir': 'dors', 'Pouvoir': 'peux',
 'Sortir': 'sors', 'Venir': 'viens', 'Léger / Légère': 'légère', 'En promotion / En solde': 'solde', 'Une bande dessinée (BD)': 'BD',
 "L'oeil / Les yeux": 'yeux', 'Une / De la barbe': 'barbe', 'Une / De la moustache': 'moustache', 'Devoir': 'dois', 'Partir': 'pars',
 "S'asseoir": 'assois', "S'endormir": 'endors', 'Se lever': 'lève', 'Gai / Gaie': 'gaie', 'Une clé': 'clés',
 'En avoir assez / En avoir marre / Ne plus en pouvoir': 'marre', 'Se sentir': 'sens', 'Sentir': 'sens',
 "L'aller / Le retour / Un aller-retour": 'aller-retour', 'Biologique': 'bio', 'Le travail / Le bureau': 'bureau',
 'Les mathématiques (les maths)': 'maths', 'Une visioconférence / visio / zoom / appel vidéo': 'visio'}
def blank_fixed(ex, w):
    i = ex.find(w)
    return None if i < 0 else ([ex[:i]] if i else []) + [{'b': w}] + ([ex[i + len(w):]] if ex[i + len(w):] else [])

units = []
tot = 0; nocloze = 0
for u in range(11):
    rows = sheet[str(u)][1:]
    lines = [l.rstrip('\n').split('|') for l in open(os.path.join(HERE, 'nlf', f'u{u}.txt'), encoding='utf-8') if l.strip()]
    assert len(lines) == len(rows), (u, len(lines), len(rows))
    vocab, text, cloze = [], [], []
    for i, (r, ln) in enumerate(zip(rows, lines), 1):
        assert int(ln[0]) == i, (u, i, ln[0])
        cat, fr, ex_fr, en, ex_en = r[0], clean(r[1]), clean(r[2]), clean(r[3]), clean(r[4])
        fr = FIX_FR.get(fr, fr); fr = strip_q(fr); ex_fr = FIX_EX.get(ex_fr, ex_fr)
        if ex_fr in ('X', ''): ex_fr = ''
        if en == 'X': en = ''
        zh, pos, ex_zh = ln[1], ln[2], ln[3]
        tip_zh, tip_en = (ln[4] if len(ln) > 4 else ''), (ln[5] if len(ln) > 5 else '')
        assert len(ln) == 6, (u, i, len(ln), ln)
        p = pos or article_pos(fr, cat)
        g, pp = POS[p]
        if p in ('m', 'f') and re.search(r' / |\(e\)|^Un\(e\)', fr): g, pp = POS['n']   # both genders: plain noun
        v = {'g': g, 'zh': zh, 'pos': pp, 'fr': fr}
        if en: v['en'] = en
        v['acc'] = accept(fr); v['say'] = say_of(fr)
        if ex_fr:
            v['ex'] = [ex_fr, ex_zh, ex_en]
            text.append({'zh': ex_zh, 'fr': ex_fr, 'en': ex_en})
            b = blank_fixed(ex_fr, BLANK[fr]) if fr in BLANK else blank(ex_fr, fr)
            if b: cloze.append(b)
            else: nocloze += 1
        if not re.search(r'[\u4e00-\u9fff]', tip_zh): tip_zh = tip_en = ''   # a tip that only repeats the word is no tip
        v['tip'] = tip_zh; v['tipEn'] = tip_en
        vocab.append(v); tot += 1
    # group by part of speech like the other book
    order = ['阳性名词', '阴性名词', '名词', '动词', '形容词', '副词', '代词', '介词、连词', '冠词、感叹词、短语']
    vocab.sort(key=lambda v: order.index(v['g']))
    fr_t, zh_t = THEMES[u]
    units.append({'n': u, 'lecons': [{'n': 100 + u, 'title': fr_t, 'zh': zh_t, 'en': THEMES_EN[u], 'vocab': vocab, 'cloze': [['Phrases']] + cloze if False else cloze, 'text': text}]})
book = {'id': 'nlf', 'title': 'NLF · Road to A1', 'zhTitle': 'NLF · 通往 A1', 'fr': 'Vocabulaire', 'flat': True, 'level': 'A1', 'units': units}
forms = {v['fr']: {'accept': v.pop('acc'), 'say': v.pop('say')} for u in units for l in u['lecons'] for v in l['vocab']}
js = '// Generated by tools/build_nlf.py from the "NLF - Road to A1 - Vocabulaire" sheet. Words only; the examples feed the sentence drills.\n'
js += 'window.NLF_FORMS = ' + json.dumps(forms, ensure_ascii=False, separators=(',', ':')) + ';\n'
js += '(window.BOOKS = window.BOOKS || []).push(' + json.dumps(book, ensure_ascii=False, separators=(',', ':')) + ');\n'
open(OUT, 'w', encoding='utf-8').write(js)
print('words', tot, 'sentences without blank', nocloze, 'bytes', len(js))
