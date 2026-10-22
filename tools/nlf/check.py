import json,re,sys
f=sys.argv[1]
s=open(f).read()
forms=json.loads(s.split('Object.assign(window.NLF_FORMS = window.NLF_FORMS || {}, ')[1].split(');\n')[0])
book=json.loads(s.split('.push(')[1].rsplit(');',1)[0])
print('--- no blank')
for u in book['units']:
    l=u['lecons'][0]
    clz={''.join(x if isinstance(x,str) else x['b'] for x in r) for r in l['cloze']}
    for v in l['vocab']:
        if 'ex' in v and v['ex'][0] not in clz: print(repr(v['fr']),'|',v['ex'][0])
print('--- odd fr')
for fr in forms:
    if re.search(r'[\[\]"…]|\.\.\.|\(.*[a-z ]{4,}.*\)|,|/[^ ]| / .* / ',fr): print(repr(fr),forms[fr]['accept'][:4])
