/* verbs-dict.js — the verb dictionary from the Mon Français (petits mondes) site,
   plus the verbs of 你好法语 1. Four tenses, with regular endings and special forms marked.

   To add a verb: add one line to VERBS. Regular -er / -ir / -re verbs only need
   zh + en (+ aux:'être' if it uses être). Irregular verbs also give pres/pp/fut. */
(function () {
  // small stand-ins for the helpers the original site provided
  const PLAY = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4 2.5v11l9-5.5z" fill="currentColor"/></svg>';
  const FL = {
    esc: s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])),
    bi: (zh, en) => (window.NH_BI ? window.NH_BI(zh, en) : zh),
    sayBtn: (text, size) => `<button type="button" class="play ${size === 'tiny' ? 'tiny' : ''}" data-say="${FL.esc(text)}" aria-label="朗读">${PLAY}</button>`,
    ICON_SPEAKER: PLAY,
  };

  const VERBS = {
    // irregular
    'être':      { zh: '是；在', en: 'to be', pres: 'suis es est sommes êtes sont', pp: 'été', fut: 'ser', imp: 'ét' },
    'avoir':     { zh: '有', en: 'to have', pres: 'ai as a avons avez ont', pp: 'eu', fut: 'aur' },
    'aller':     { zh: '去', en: 'to go', pres: 'vais vas va allons allez vont', pp: 'allé', fut: 'ir', aux: 'être' },
    'venir':     { zh: '来', en: 'to come', pres: 'viens viens vient venons venez viennent', pp: 'venu', fut: 'viendr', aux: 'être' },
    'partir':    { zh: '出发；离开', en: 'to leave', pres: 'pars pars part partons partez partent', pp: 'parti', aux: 'être' },
    'sortir':    { zh: '出去', en: 'to go out', pres: 'sors sors sort sortons sortez sortent', pp: 'sorti', aux: 'être' },
    'dormir':    { zh: '睡觉', en: 'to sleep', pres: 'dors dors dort dormons dormez dorment', pp: 'dormi' },
    'faire':     { zh: '做', en: 'to do / make', pres: 'fais fais fait faisons faites font', pp: 'fait', fut: 'fer' },
    'prendre':   { zh: '拿；乘坐', en: 'to take', pres: 'prends prends prend prenons prenez prennent', pp: 'pris' },
    'mettre':    { zh: '放；花（时间）', en: 'to put', pres: 'mets mets met mettons mettez mettent', pp: 'mis' },
    'pouvoir':   { zh: '能够', en: 'can', pres: 'peux peux peut pouvons pouvez peuvent', pp: 'pu', fut: 'pourr' },
    'vouloir':   { zh: '想要', en: 'to want', pres: 'veux veux veut voulons voulez veulent', pp: 'voulu', fut: 'voudr' },
    'devoir':    { zh: '必须', en: 'must', pres: 'dois dois doit devons devez doivent', pp: 'dû', fut: 'devr' },
    'voir':      { zh: '看见', en: 'to see', pres: 'vois vois voit voyons voyez voient', pp: 'vu', fut: 'verr' },
    'savoir':    { zh: '知道', en: 'to know', pres: 'sais sais sait savons savez savent', pp: 'su', fut: 'saur' },
    'lire':      { zh: '读；阅读', en: 'to read', pres: 'lis lis lit lisons lisez lisent', pp: 'lu' },
    'écrire':    { zh: '写', en: 'to write', pres: 'écris écris écrit écrivons écrivez écrivent', pp: 'écrit' },
    'connaître': { zh: '认识；了解', en: 'to know (a person, a place)', pres: 'connais connais connaît connaissons connaissez connaissent', pp: 'connu' },
    'se lever':  { zh: '起床', en: 'to get up', pres: 'lève lèves lève levons levez lèvent', pp: 'levé', fut: 'lèver' },
    // regular -er
    'arriver':   { zh: '到达', en: 'to arrive', aux: 'être' },
    'rentrer':   { zh: '回家；返回', en: 'to go back home', aux: 'être' },
    'rester':    { zh: '待；留下', en: 'to stay', aux: 'être' },
    'commencer': { zh: '开始', en: 'to begin' },
    'manger':    { zh: '吃', en: 'to eat' },
    'travailler':{ zh: '工作', en: 'to work' },
    'parler':    { zh: '说', en: 'to speak' },
    'compter':   { zh: '数；计算', en: 'to count' },
    'calculer':  { zh: '计算', en: 'to calculate' },
    'coûter':    { zh: '价值；花费', en: 'to cost' },
    'ajouter':   { zh: '加上；添加', en: 'to add' },
    'jouer':     { zh: '玩；演奏；上演', en: 'to play' },
    'téléphoner':{ zh: '打电话', en: 'to phone' },
    'penser':    { zh: '想；认为', en: 'to think' },
    'donner':    { zh: '给', en: 'to give' },
    'expliquer': { zh: '解释；讲解', en: 'to explain' },
    'écouter':   { zh: '听', en: 'to listen' },
    'aimer':     { zh: '喜欢；爱', en: 'to like / love' },
    'déjeuner':  { zh: '吃午饭', en: 'to have lunch' },
    'dîner':     { zh: '吃晚饭', en: 'to have dinner' },
    'regarder':  { zh: '看', en: 'to watch' },
    'habiter':   { zh: '居住', en: 'to live (somewhere)' },
    'se coucher':{ zh: '睡觉；躺下', en: 'to go to bed' },
    'se réveiller': { zh: '醒来', en: 'to wake up' },
    // regular -ir / -re
    'finir':     { zh: '结束；完成', en: 'to finish' },
    'attendre':  { zh: '等待', en: 'to wait' },
    // 你好法语 1 · Unités 1–4
    "s'appeler": { zh: '名叫', en: 'to be called', pres: 'appelle appelles appelle appelons appelez appellent', fut: 'appeller' },
    'chercher':  { zh: '寻找', en: 'to look for' },
    'trouver':   { zh: '找到；觉得', en: 'to find; to think of' },
    'porter':    { zh: '穿戴', en: 'to wear' },
    'louer':     { zh: '出租；租用', en: 'to rent' },
    'continuer': { zh: '继续', en: 'to continue' },
    'entrer':    { zh: '进入', en: 'to enter', aux: 'être' },
    'passer':    { zh: '经过', en: 'to pass, to go by' },
    'traverser': { zh: '穿过', en: 'to cross' },
    'visiter':   { zh: '参观', en: 'to visit' },
    'préparer':  { zh: '准备', en: 'to prepare' },
    'éviter':    { zh: '避免', en: 'to avoid' },
    'nager':     { zh: '游泳', en: 'to swim' },
    'recommencer': { zh: '重新开始', en: 'to start again' },
    'retourner': { zh: '返回', en: 'to go back', aux: 'être' },
    'reprendre': { zh: '重新从事', en: 'to resume', pres: 'reprends reprends reprend reprenons reprenez reprennent', pp: 'repris' },
    'se laver':  { zh: '洗漱', en: 'to wash (oneself)' },
    "s'habiller": { zh: '穿衣服', en: 'to get dressed' },
    'se reposer': { zh: '休息', en: 'to rest' },
    'se promener': { zh: '散步', en: 'to go for a walk', pres: 'promène promènes promène promenons promenez promènent', fut: 'promèner' },
    "s'entraîner": { zh: '训练', en: 'to train' },
    "s'endormir": { zh: '睡着', en: 'to fall asleep', pres: 'endors endors endort endormons endormez endorment', pp: 'endormi' },
    'se détendre': { zh: '放松', en: 'to relax' },
    'se terminer': { zh: '结束', en: 'to end' },
  };

  const P = ['je', 'tu', 'il/elle/on', 'nous', 'vous', 'ils/elles'];
  const REFL = ['me', 'te', 'se', 'nous', 'vous', 'se'];
  const AGREE = ['(e)', '(e)', '(e)', '(e)s', '(e)(s)', '(e)s'];
  const AUX = { avoir: 'ai as a avons avez ont'.split(' '), 'être': 'suis es est sommes êtes sont'.split(' ') };
  const END_IMP = ['ais', 'ais', 'ait', 'ions', 'iez', 'aient'];
  const END_FUT = ['ai', 'as', 'a', 'ons', 'ez', 'ont'];
  const TENSES = [
    { id: 'present', fr: 'Présent', zh: '现在时', en: 'Present' },
    { id: 'pc', fr: 'Passé composé', zh: '复合过去时', en: 'Past' },
    { id: 'imparfait', fr: 'Imparfait', zh: '未完成过去时', en: 'Imperfect' },
    { id: 'futur', fr: 'Futur simple', zh: '简单将来时', en: 'Future' },
  ];
  const startsVowel = w => /^[aeiouyâàéèêëîïôûùœh]/i.test(w);

  function regularPres(base) {
    const s = base.slice(0, -2);
    if (base.endsWith('er')) {
      const n = s.endsWith('c') ? s.slice(0, -1) + 'ç' : s.endsWith('g') ? s + 'e' : s;
      return [s + 'e', s + 'es', s + 'e', n + 'ons', s + 'ez', s + 'ent'];
    }
    if (base.endsWith('ir')) return [s + 'is', s + 'is', s + 'it', s + 'issons', s + 'issez', s + 'issent'];
    return [s + 's', s + 's', s, s + 'ons', s + 'ez', s + 'ent'];
  }
  const regularPP = b => b.slice(0, -2) + (b.endsWith('er') ? 'é' : b.endsWith('ir') ? 'i' : 'u');

  function line(pi, form, refl) {
    let v = form;
    if (refl) v = (pi !== 3 && pi !== 4 && startsVowel(v) ? REFL[pi][0] + "'" : REFL[pi] + ' ') + v;
    return (pi === 0 && startsVowel(v) ? "j'" : P[pi] + ' ') + v;
  }

  /* ---------- regular vs special ----------
     Each form is compared with what a regular verb of the same ending would give.
     Regular forms show their ending (the rule at work); the letters that break the
     rule are wrapped in <mark class="irr">. */
  const END_PRES = {
    er: ['e', 'es', 'e', 'ons', 'ez', 'ent'],
    ir: ['is', 'is', 'it', 'issons', 'issez', 'issent'],
    re: ['s', 's', '', 'ons', 'ez', 'ent'],
    ir3: ['s', 's', 't', 'ons', 'ez', 'ent'],   // partir, sortir, dormir
  };
  // -ir verbs without -issons (partir, dormir…) follow their own pattern, not finir's
  const family = (base, pres) => base.endsWith('er') ? 'er'
    : base.endsWith('ir') ? (pres[3].endsWith('issons') ? 'ir' : 'ir3') : 're';
  const esc = s => FL.esc(s);
  // regular form: stem + <span class="end">ending</span>
  const showRule = (form, ending) => ending && form.endsWith(ending)
    ? `${esc(form.slice(0, -ending.length))}<span class="end">${esc(ending)}</span>`
    : esc(form);
  // special form: keep what matches the regular form, mark the part that differs
  function showDiff(actual, expected) {
    let p = 0;
    while (p < actual.length && p < expected.length && actual[p] === expected[p]) p++;
    let q = 0;
    while (q < actual.length - p && q < expected.length - p && actual[actual.length - 1 - q] === expected[expected.length - 1 - q]) q++;
    const mid = actual.slice(p, actual.length - q);
    // nothing added, or most of the word changed (lu, ir-, ser-): mark it whole
    if (!mid || mid.length * 2 >= actual.length) return `<mark class="irr">${esc(actual)}</mark>`;
    return `${esc(actual.slice(0, p))}<mark class="irr">${esc(mid)}</mark>${esc(actual.slice(actual.length - q))}`;
  }
  function analyse(c) {
    const fam = family(c.base, c.forms.present);
    const stem = c.base.slice(0, -2);
    const expect = {
      // ir3: the singular drops the stem's last consonant (part- -> par-s)
      present: END_PRES[fam].map((e, i) => (fam === 'ir3' && i < 3 ? stem.slice(0, -1) : stem) + e),
      // imparfait and futur are regular for almost every verb, so they are built from the rule itself
      imparfait: END_IMP.map(e => c.forms.present[3].replace(/ons$/, '') + e),
      futur: END_FUT.map(e => (c.base.endsWith('re') ? c.base.slice(0, -1) : c.base) + e),
    };
    const ends = { present: END_PRES[fam], imparfait: END_IMP, futur: END_FUT };
    const regPP = regularPP(c.base);
    const html = {}, special = {};
    for (const t of ['present', 'imparfait', 'futur']) {
      special[t] = 0;
      html[t] = c.forms[t].map((f, i) => {
        let exp = expect[t][i];
        if (t === 'imparfait' && (i === 3 || i === 4)) exp = exp.replace(/ç(?=ions|iez)/, 'c').replace(/ge(?=ions|iez)/, 'g');
        if (f === exp) return showRule(f, ends[t][i]);
        special[t]++;
        if (t === 'present') return showDiff(f, exp);
        // imparfait / futur: the ending is always regular, only the stem can be special
        const e = ends[t][i];
        return showDiff(f.slice(0, -e.length), exp.slice(0, -e.length)) + `<span class="end">${esc(e)}</span>`;
      });
    }
    const ppHTML = c.pp === regPP ? showRule(c.pp, regPP.slice(stem.length)) : showDiff(c.pp, regPP);
    special.pc = c.pp === regPP ? 0 : 6;
    html.pc = AUX[c.aux].map((a, i) =>
      `${c.aux === 'être' ? `<mark class="aux">${esc(a)}</mark>` : esc(a)} ${ppHTML}${c.aux === 'être' ? esc(AGREE[i]) : ''}`);
    const group = c.base === 'aller' || fam === 're' || fam === 'ir3' ? 3 : fam === 'er' ? 1 : 2;
    return { fam, group, html, special, regPP };
  }

  const cache = {};
  function conj(key) {
    if (cache[key]) return cache[key];
    const d = VERBS[key];
    if (!d) return null;
    const refl = /^se |^s'/.test(key);
    const base = key.replace(/^se |^s'/, '');
    const aux = refl ? 'être' : d.aux || 'avoir';
    const pres = d.pres ? d.pres.split(' ') : regularPres(base);
    const pp = d.pp || regularPP(base);
    const impStem = d.imp || pres[3].slice(0, -3);
    const imp = END_IMP.map((e, i) =>
      (i === 3 || i === 4 ? impStem.replace(/ç$/, 'c').replace(/(g)e$/, '$1') : impStem) + e);
    const futStem = d.fut || (base.endsWith('re') ? base.slice(0, -1) : base);
    const fut = END_FUT.map(e => futStem + e);
    const pc = AUX[aux].map((a, i) => `${a} ${pp}${aux === 'être' ? AGREE[i] : ''}`);
    const forms = { present: pres, pc, imparfait: imp, futur: fut };
    const lines = {};
    for (const t in forms) lines[t] = forms[t].map((f, i) => line(i, f, refl));
    const c = { key, base, refl, aux, pp, zh: d.zh, en: d.en, forms, lines };
    Object.assign(c, analyse(c));
    // the verb form sits at the end of each line, so swap it for the marked-up version
    c.linesHTML = {};
    for (const t in forms) c.linesHTML[t] = lines[t].map((l, i) => esc(l.slice(0, l.length - forms[t][i].length)) + c.html[t][i]);
    return (cache[key] = c);
  }

  // reverse index: conjugated word -> infinitive. Past participles are left out on purpose
  // ("été" is also "summer", "fait" is covered by the present tense anyway).
  const INDEX = {};
  for (const key in VERBS) {
    const c = conj(key);
    INDEX[c.base] = key;
    ['present', 'imparfait', 'futur'].forEach(t => c.forms[t].forEach(f => { INDEX[f.toLowerCase()] = INDEX[f.toLowerCase()] || key; }));
  }

  /* ---------- tables ---------- */
  function tenseTable(c, t, hi) {
    return `<table class="conj">${c.lines[t].map((l, i) => {
      const on = hi && c.forms[t][i].toLowerCase() === hi ? ' class="hi"' : '';
      return `<tr${on}><td lang="fr">${c.linesHTML[t][i]}</td><td>${FL.sayBtn(l, 'tiny')}</td></tr>`;
    }).join('')}</table>`;
  }
  const B = FL.bi;
  function groupLabel(c) {
    const n = c.special.present + c.special.pc + c.special.imparfait + c.special.futur;
    if (c.group === 1) return n ? B('第一组 -er · 有拼写变化', 'Group 1 -er · spelling changes') : B('第一组 · 规则 -er', 'Group 1 · regular -er');
    if (c.group === 2) return B('第二组 · 规则 -ir', 'Group 2 · regular -ir');
    if (n) return B('第三组 · 不规则', 'Group 3 · irregular');
    return c.fam === 'ir3' ? B('第三组 · partir 型，有规律', 'Group 3 · partir pattern, regular') : B('第三组 · 规则 -re', 'Group 3 · regular -re');
  }
  // endings like -ez must not break across lines
  const nb = str => str.replace(/-(?=[a-zéèç])/g, '\u2011');
  const ruleFor = (c, t) => ruleText(c, t, (zh, en) => B(nb(zh), nb(en)));
  function ruleText(c, t, B) {
    if (t === 'present' && c.fam === 'ir3') {
      return B('单数：去掉 -ir 和词干最后一个辅音，加 -s -s -t；复数：去掉 -ir，加 -ons -ez -ent',
        'Singular: drop -ir and the stem’s last consonant, add -s -s -t; plural: drop -ir, add -ons -ez -ent');
    }
    if (t === 'present') {
      const e = END_PRES[c.fam].map(x => x ? '-' + x : '—').join(' ');
      return B(`去掉 -${c.fam}，加 ${e}`, `Drop -${c.fam}, add ${e}`);
    }
    if (t === 'imparfait') return B('nous 的现在时去掉 -ons，加 -ais -ais -ait -ions -iez -aient', 'nous present minus -ons, add -ais -ais -ait -ions -iez -aient');
    if (t === 'futur') return B('不定式（-re 去掉 e）+ -ai -as -a -ons -ez -ont', 'Infinitive (-re drops e) + -ai -as -a -ons -ez -ont');
    return B(`${c.aux} 的现在时 + 过去分词（-er→é，-ir→i，-re→u）`, `${c.aux} in the present + past participle (-er→é, -ir→i, -re→u)`);
  }
  const specialNote = (c, t) => c.special[t]
    ? `<span class="rule-flag">${B(`${c.special[t]} 个特殊变化`, `${c.special[t]} special`)}</span>` : `<span class="rule-ok">${B('全部规则', 'all regular')}</span>`;
  const legend = () => `<p class="conj-legend"><span><span class="end">-ons</span> ${B('规则词尾', 'regular ending')}</span><span><mark class="irr">v</mark> ${B('特殊变化', 'special form')}</span><span><mark class="aux">suis</mark> ${B('助动词 être', 'être as helper')}</span></p>`;
  const auxNote = c => `<span class="aux-note">${FL.bi('复合过去时助动词', 'Past-tense helper')}: <b lang="fr">${c.aux}</b></span>`;

  window.VERBDICT = {
    list: () => Object.keys(VERBS),
    get: conj,
    TENSES,
    // full 4-tense grid
    tableHTML(key) {
      const c = conj(key);
      if (!c) return '';
      return `<div class="conj-full">
        <div class="conj-head"><h3 lang="fr">${FL.esc(key)}</h3>${FL.sayBtn(key)}<span class="conj-mean">${FL.bi(c.zh, c.en)}</span>
          <span class="conj-group ${c.special.present + c.special.pc + c.special.imparfait + c.special.futur ? 'is-special' : ''}">${groupLabel(c)}</span>${auxNote(c)}</div>
        ${legend()}
        <div class="conj-grid">${TENSES.map(t => `
          <div class="conj-block">
            <div class="conj-tense"><span lang="fr">${t.fr}</span> <small>${FL.bi(t.zh, t.en)}</small>
              ${FL.sayBtn(c.lines[t.id].join(', '), 'tiny')}</div>
            <p class="conj-rule">${ruleFor(c, t.id)} ${specialNote(c, t.id)}</p>
            ${tenseTable(c, t.id)}
          </div>`).join('')}</div></div>`;
    },
  };
})();
