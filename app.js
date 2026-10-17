/* 你好法语 · cahier de dictée
   Book → Unité → Leçon → 词汇 / 句子 / 全文默写 / 背诵 */
(() => {
  'use strict';
  const BOOKS = window.BOOKS || [];
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const main = $('#main');

  /* ---------- storage ---------- */
  const store = {
    get(k, d) { try { const v = localStorage.getItem('nh:' + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
    set(k, v, quiet) { try { localStorage.setItem('nh:' + k, JSON.stringify(v)); } catch { } if (!quiet) BACKUP.changed(); },
  };
  const settings = Object.assign({ rate: 0.85, volume: 0.7, lenient: false, voice: '' }, store.get('settings', {}));
  const saveSettings = () => store.set('settings', settings);
  if (!settings.lang) settings.lang = 'zh';
  document.documentElement.classList.toggle('mono', settings.look === 'mono');
  document.documentElement.classList.toggle('no-riso', settings.riso === false);
  // language modes: 'zhen' 中英法 · 'zh' 中法 · 'en' 英法
  const L = () => settings.lang;
  const BI = {};
  const bi = (zh, en) => { BI[zh] = en; return L() === 'en' ? en : zh; };
  window.NH_BI = (zh, en) => bi(zh, en);
  const G = o => {
    const zh = esc(o.zh || ''), en = esc(o.en || '');
    if (L() === 'en') return en || zh;
    if (L() === 'zhen' && en) return `${zh}<span class="en-gloss" lang="en">${en}</span>`;
    return zh;
  };
  // meaning: 中英法 shows both, 中法 Chinese only, 英法 English only (falling back to Chinese when there is no English)
  const MEAN = o => {
    const zh = o.zh && !(L() === 'en' && o.en) ? `<span class="m-zh">${esc(o.zh)}</span>` : '';
    const en = o.en && L() !== 'zh' ? `<span class="m-en" lang="en">${esc(o.en)}</span>` : '';
    return zh + en;
  };
  const Gt = o => L() === 'en' ? (o.en || o.zh || '') : (o.zh || '');   // plain text
  const H = r => esc(L() === 'en' ? (r.hen || r.h) : r.h);
  // 英法 mode: translate the remaining Chinese UI text fragments (see i18n.js)
  const CJK = /[\u3400-\u9fff\uff08-\uff1f]/;
  function enFor(t) {
    if (BI[t]) return t.replace(t, BI[t]);
    for (const [re, en] of (window.ZH_EN || [])) if (re.test(t)) return t.replace(re, en);
    return null;
  }
  // 英法: Chinese → English.  中英法: Chinese followed by English.
  function tr(str) {
    if (L() === 'zh' || !str || !CJK.test(str)) return str;
    const t = str.trim(), en = enFor(t);
    if (!en) return str;
    return L() === 'en' ? str.replace(t, en) : str.replace(t, `${t} · ${en}`);
  }
  const SKIP = '.brand, .cover, #langsw, .book-head h1, .crumbs, [lang="fr"], [data-tr]';
  function fixNode(n) {
    if (!CJK.test(n.nodeValue) || !n.parentElement || n.parentElement.closest(SKIP)) return;
    const t = n.nodeValue.trim(), en = enFor(t);
    if (!en) return;
    if (L() === 'en') { n.nodeValue = n.nodeValue.replace(t, en); return; }
    const wrap = document.createElement('span');
    wrap.dataset.tr = '1';
    const long = en.length > 36 && !n.parentElement.closest('button, .btn, .mode, .tab, label, .kbd');
    wrap.innerHTML = `${esc(n.nodeValue)}<span class="en-ui ${long ? 'block' : ''}" lang="en">${esc(en)}</span>`;
    n.replaceWith(wrap);
  }
  function fixAttrs(el) {
    for (const a of ['placeholder', 'title', 'aria-label']) if (el.hasAttribute(a)) { const v = tr(el.getAttribute(a)); if (v !== el.getAttribute(a)) el.setAttribute(a, v); }
  }
  function translateTree(root) {
    if (L() === 'zh' || !root) return;
    if (root.nodeType === 3) return fixNode(root);
    if (root.nodeType !== 1 || root.closest(SKIP)) return;
    fixAttrs(root);
    const texts = [], w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
    let n;
    while ((n = w.nextNode())) n.nodeType === 1 ? (!n.closest(SKIP) && fixAttrs(n)) : texts.push(n);
    texts.forEach(fixNode);
  }
  new MutationObserver(ms => {
    if (L() === 'zh') return;
    for (const m of ms) {
      if (m.type === 'characterData') translateTree(m.target);
      else m.addedNodes.forEach(translateTree);
    }
  }).observe(document.body, { childList: true, subtree: true, characterData: true });
  // attach English glosses to the book data
  (function () {
    const EV = window.EN_V || {}, ET = window.EN_T || {};
    for (const b of BOOKS) for (const u of b.units) for (const l of u.lecons) {
      l.vocab.forEach(v => { v.en = EV[l.n + ':' + v.fr] || EV[v.fr] || ''; });
      l.text.forEach((r, k) => { const e = (ET[l.n] || [])[k] || ''; if (r.h) r.hen = e; else r.en = e; });
    }
  })();
  const progKey = (book, n) => `prog:${book}:${n}`;
  const getProg = (book, n) => store.get(progKey(book, n), {});
  function setProg(book, n, part, score) {
    const p = getProg(book, n);
    p[part] = Math.max(p[part] || 0, Math.round(score * 100) / 100);
    store.set(progKey(book, n), p);
  }

  /* ---------- mistake book (spaced review) ----------
     Every mistake becomes an item; it comes back tomorrow, then after 2, 4, 7, 15 days
     each time it is answered right. A wrong answer sends it back to tomorrow. */
  const GAPS = [1, 2, 4, 7, 15];
  const dayStr = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const addDays = n => { const d = new Date(); d.setDate(d.getDate() + n); return dayStr(d); };
  const SRS = {
    all() { return store.get('srs', {}); },
    save(db) { store.set('srs', db); },
    id: it => it.kind === 'word' && it.pos !== '变位' ? `${it.book}|${it.n}|word|${it.fr}` : `${it.book}|${it.n}|${it.kind}|${it.fr}|${it.zh}`,
    // item: {book, n, kind: 'word'|'cloze'|'sentence', fr, zh, pos?}
    // typed: what was written instead (kept: the last 3 different attempts)
    miss(it, typed = '') {
      const db = this.all(), id = this.id(it), old = db[id] || { right: 0, wrong: 0, first: dayStr() };
      let tries = old.tries || [];
      const t = String(typed || '').trim();
      if (t && norm(t) !== norm(it.fr)) tries = [{ t, d: dayStr() }, ...tries.filter(x => x.t !== t)].slice(0, 3);
      db[id] = { ...old, ...it, box: 0, due: addDays(1), wrong: old.wrong + 1, last: dayStr(), done: false, tries };
      this.save(db);
    },
    hit(it) {
      const db = this.all(), e = db[this.id(it)];
      if (!e) return;
      e.right++; e.last = dayStr();
      e.box = Math.min(e.box + 1, GAPS.length);
      if (e.box >= GAPS.length) { e.done = true; if (e.kind === 'word' && e.pos !== '变位') MASTER.word(e.book, e.n, e.fr); }
      else e.due = addDays(GAPS[e.box]);
      this.save(db);
    },
    remove(id) { const db = this.all(); delete db[id]; this.save(db); },
    due() { const t = dayStr(); return Object.entries(this.all()).filter(([, e]) => !e.done && e.due <= t).map(([id, e]) => ({ id, ...e })); },
  };

  /* ---------- mastery: words passed on the first try, text lines written perfectly ---------- */
  const MASTER = {
    key: (book, n) => `master:${book}:${n}`,
    get(book, n) { return store.get(this.key(book, n), { w: {}, t: {}, test: '' }); },
    put(book, n, m) { store.set(this.key(book, n), m); },
    word(book, n, fr, on = true) { const m = this.get(book, n), was = !!m.w[fr]; on ? (m.w[fr] = m.w[fr] || dayStr()) : delete m.w[fr]; this.put(book, n, m); if (on && !was) { XP.gain(3, '新掌握 ' + fr); checkStamps(book, n); } },
    line(book, n, k) { const m = this.get(book, n), was = !!m.t[k]; m.t[k] = m.t[k] || dayStr(); this.put(book, n, m); if (!was) { XP.gain(3, '课文掌握一行'); checkStamps(book, n); } },
    stats(book, lecon) {
      const m = this.get(book, lecon.n);
      const words = lecon.vocab.filter(v => m.w[v.fr]).length;
      const lines = lecon.text.filter((r, k) => !r.h && m.t[k]).length;
      const totalLines = lecon.text.filter(r => !r.h).length;
      return { words, totalWords: lecon.vocab.length, lines, totalLines, test: m.test,
        vocabDone: words === lecon.vocab.length, textDone: lines === totalLines };
    },
  };
  // a word that is in the mistake book only counts as mastered once its reviews are finished
  const inReview = (book, n, fr) => { const e = SRS.all()[SRS.id({ book, n, kind: 'word', fr })]; return e && !e.done; };

  /* ---------- rewards: XP, daily goal, streak, stamps ---------- */
  const STAMPS = {
    1: ['Paris', 'tower'], 2: ['Genève', 'fountain'], 3: ['Montréal', 'leaf'], 4: ['Dakar', 'baobab'],
    5: ['Chambre', 'window'], 6: ['Portrait', 'face'], 7: ['Boutique', 'dress'], 8: ['Montmartre', 'easel'],
    9: ['Appartement', 'house'], 10: ['Louvre', 'pyramid'], 11: ['Martinique', 'palm'], 12: ['Marseille', 'boat'],
    13: ['Gare', 'clock'], 14: ['Londres', 'bigben'], 15: ['Dimanche', 'racket'], 16: ['Piscine', 'swim'],
    17: ['Crêpes', 'pan'], 18: ['Val d\'Isère', 'skis'], 19: ['Barcelone', 'letter'], 20: ['Fêtes', 'firework'],
  };
  const GLYPH = {
    tower: 'M50 12 L42 88 M50 12 L58 88 M44 62 H56 M46 44 H54 M38 88 Q50 70 62 88 M50 6 V12',
    fountain: 'M50 88 V30 M50 30 Q40 10 30 40 M50 30 Q60 10 70 40 M50 30 Q46 14 42 48 M50 30 Q54 14 58 48 M28 88 H72 M34 88 Q50 78 66 88',
    leaf: 'M50 88 V64 M50 64 L30 70 L34 58 L22 50 L32 46 L28 32 L40 38 L44 24 L50 36 L56 24 L60 38 L72 32 L68 46 L78 50 L66 58 L70 70 Z',
    baobab: 'M42 88 Q44 60 40 44 M58 88 Q56 60 60 44 M40 44 Q30 36 24 40 M40 44 Q38 30 32 24 M60 44 Q70 36 76 40 M60 44 Q62 30 68 24 M50 44 V24 M30 88 H70',
    window: 'M30 20 H70 V84 H30 Z M50 20 V84 M30 52 H70 M22 20 L30 28 V76 L22 84 Z M78 20 L70 28 V76 L78 84 Z',
    face: 'M50 22 Q72 22 72 48 Q72 74 50 80 Q28 74 28 48 Q28 22 50 22 M40 46 H44 M56 46 H60 M42 62 Q50 68 58 62 M30 40 Q36 18 64 22 Q72 30 70 40',
    dress: 'M42 16 L38 30 L42 34 L28 86 H72 L58 34 L62 30 L58 16 Q50 24 42 16',
    easel: 'M50 14 L34 88 M50 14 L66 88 M50 14 V88 M30 26 H70 V60 H30 Z M38 52 Q46 34 54 46 Q60 38 64 52',
    house: 'M24 88 V36 L50 16 L76 36 V88 M36 48 H46 V58 H36 Z M54 48 H64 V58 H54 Z M36 66 H46 V76 H36 Z M54 66 H64 V88 H54 Z M16 88 H84',
    pyramid: 'M50 18 L18 82 H82 Z M50 18 L50 82 M34 50 H66 M26 66 H74 M10 88 H90',
    palm: 'M52 88 Q48 60 54 32 M54 32 Q38 22 22 30 M54 32 Q44 14 30 12 M54 32 Q62 14 76 14 M54 32 Q70 24 82 36 M54 32 Q66 40 70 54 M14 88 Q50 80 86 88',
    clock: 'M50 22 A28 28 0 1 1 49.9 22 M50 50 V32 M50 50 L64 58 M50 14 V22 M42 10 H58 M50 82 V90 M34 90 H66',
    bigben: 'M38 88 V34 H62 V88 M38 34 L50 12 L62 34 M44 46 A6 6 0 1 1 43.9 46 M50 52 V48 M50 52 L53 54 M38 64 H62 M38 76 H62 M30 88 H70',
    racket: 'M44 18 Q24 22 26 44 Q30 62 46 60 Q64 56 62 36 Q58 16 44 18 M34 28 L56 50 M30 40 L50 58 M40 22 L60 44 M50 58 L66 84 M66 84 L70 82 M72 30 A6 6 0 1 1 71.9 30',
    swim: 'M14 70 Q24 64 34 70 T54 70 T74 70 T90 70 M14 82 Q24 76 34 82 T54 82 T74 82 T90 82 M30 60 Q46 44 66 50 L76 46 M62 34 A6 6 0 1 1 61.9 34 M40 56 L56 40',
    pan: 'M18 52 A26 10 0 1 0 70 52 A26 10 0 1 0 18 52 M70 52 L92 44 M24 52 Q44 40 64 52 M32 48 Q44 44 56 48 M44 28 Q48 20 44 14 M54 30 Q58 22 54 16',
    skis: 'M30 14 L44 88 M44 14 L58 88 M26 12 Q30 8 34 12 M40 12 Q44 8 48 12 M66 20 V70 M66 20 L62 26 M74 22 V74 M74 22 L78 28 M60 70 H80',
    letter: 'M14 30 H86 V74 H14 Z M14 30 L50 56 L86 30 M14 74 L40 52 M86 74 L60 52 M64 36 H80 V48 H64 Z',
    firework: 'M50 50 L50 20 M50 50 L72 28 M50 50 L80 50 M50 50 L72 72 M50 50 L50 80 M50 50 L28 72 M50 50 L20 50 M50 50 L28 28 M50 16 v-4 M76 24 l3 -3 M84 50 h4 M50 84 v4 M24 24 l-3 -3 M16 50 h-4 M30 88 L50 50',
    boat: 'M20 66 H80 L70 80 H30 Z M50 66 V14 M50 18 L76 58 H50 M50 24 L30 58 H50 M10 88 Q20 84 30 88 T50 88 T70 88 T90 88',
  };
  const STREAK_BADGES = [3, 7, 14, 30, 60, 100];
  const XP = {
    log() { return store.get('log', {}); },
    goal() { return store.get('goal', 30); },
    today() { return this.log()[dayStr()] || { xp: 0 }; },
    gain(n, why) {
      if (!n) return;
      const log = this.log(), d = dayStr(), before = (log[d] || { xp: 0 }).xp;
      log[d] = { xp: before + n };
      store.set('log', log);
      toast(`+${n}`, why);
      const g = this.goal();
      if (before < g && before + n >= g) celebrate('今日目标完成', `今天已经拿到 ${before + n} 分。连续打卡 ${this.streak()} 天。`, null);
      const s = this.streak();
      if (before < g && before + n >= g && STREAK_BADGES.includes(s)) celebrate(`连续 ${s} 天`, '获得一枚打卡印章，在「我的邮册」里查看。', null);
      renderStatus();
    },
    // consecutive days reaching the daily goal, ending today (or yesterday if today isn't done yet)
    streak() {
      const log = this.log(), g = this.goal();
      const d = new Date();
      if (!((log[dayStr(d)] || {}).xp >= g)) d.setDate(d.getDate() - 1);
      let n = 0;
      while ((log[dayStr(d)] || {}).xp >= g) { n++; d.setDate(d.getDate() - 1); }
      return n;
    },
    best() {
      const log = this.log(), g = this.goal(), days = Object.keys(log).filter(k => log[k].xp >= g).sort();
      let best = 0, run = 0, prev = null;
      for (const k of days) {
        const d = new Date(k + 'T12:00'); 
        run = prev && (d - prev) / 864e5 < 1.5 ? run + 1 : 1;
        best = Math.max(best, run); prev = d;
      }
      return best;
    },
    total() { return Object.values(this.log()).reduce((a, b) => a + b.xp, 0); },
  };
  // the stamp's line drawing, used as the picture on each leçon card
  function lessonArt(n) {
    const g = STAMPS[n] && GLYPH[STAMPS[n][1]];
    if (!g) return window.SKY_ART ? window.SKY_ART(n - 1) : '';
    return `<svg class="sky-art stamp-art" viewBox="0 0 100 96" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${g}"/></svg>`;
  }
  function stampSVG(n, kind, on) {
    const [city, g] = STAMPS[n] || ['Leçon ' + n, 'house'];
    // engraved stamp frame (blue for vocabulary, red for the text); the leçon's drawing goes inside
    return `<svg viewBox="0 0 100 113" class="stamp ${on ? 'on' : ''} ${kind}" aria-label="${esc(city)}">
      <image href="img/stamp-${kind}.webp" width="100" height="113" preserveAspectRatio="none"/>
      <g transform="translate(26 17) scale(.48)" class="st-glyph"><path d="${GLYPH[g]}"/></g>
      <text x="50" y="80" class="st-city">${esc(city)}</text>
      <text x="50" y="88" class="st-sub">${kind === 'v' ? 'VOCABULAIRE' : 'TEXTE'} · ${n}</text>
    </svg>`;
  }
  // called after mastery changes: award stamps when a part of a leçon is complete
  function checkStamps(book, n) {
    const b = findBook(book), f = b && findLecon(b, n);
    if (!f) return;
    const st = MASTER.stats(book, f.lecon), got = store.get('stamps', {});
    const hp = $('.lecon-head .prog'); if (hp && location.hash.includes(`/${n}`)) hp.outerHTML = progHTML(b, f.lecon, true);
    for (const [k, done, label] of [['v', st.vocabDone, '词汇'], ['t', st.textDone, '课文']]) {
      const id = `${book}:${n}:${k}`;
      if (done && !got[id]) {
        got[id] = dayStr(); store.set('stamps', got);
        XP.gain(k === 'v' ? 20 : 30, `Leçon ${n} ${label}通过`);
        celebrate(`Leçon ${n} ${label}通过`, '一枚新邮票贴进了你的邮册。', stampSVG(n, k, true));
      }
    }
  }
  let toastT;
  function toast(big, small) {
    let t = $('#toast');
    if (!t) { t = document.createElement('div'); t.id = 'toast'; document.body.appendChild(t); }
    t.innerHTML = `<b>${esc(big)}</b>${small ? `<span>${esc(small)}</span>` : ''}`;
    t.className = 'show';
    clearTimeout(toastT); toastT = setTimeout(() => t.className = '', 1400);
  }
  const celebQ = [];
  function celebrate(title, text, art) {
    celebQ.push({ title, text, art });
    if (celebQ.length === 1) showCeleb();
  }
  function showCeleb() {
    const c = celebQ[0]; if (!c) return;
    const m = document.createElement('div');
    m.className = 'celeb';
    m.innerHTML = `<div class="celeb-card" role="dialog" aria-modal="true">${c.art ? `<div class="celeb-art">${c.art}</div>` : '<div class="celeb-seal">✦</div>'}
      <h2>${esc(c.title)}</h2><p>${esc(c.text)}</p><button class="btn">好的</button></div>`;
    document.body.appendChild(m);
    const close = () => { m.remove(); celebQ.shift(); showCeleb(); };
    $('button', m).onclick = close; $('button', m).focus();
    m.onclick = e => { if (e.target === m) close(); };
  }
  function renderStatus() {
    const el = $('#status'); if (!el) return;
    const xp = XP.today().xp, g = XP.goal(), s = XP.streak();
    const pct = Math.min(1, xp / g), C = 2 * Math.PI * 9;
    el.innerHTML = `<svg viewBox="0 0 24 24" class="ring" aria-hidden="true"><circle cx="12" cy="12" r="9" class="ring-bg"/><circle cx="12" cy="12" r="9" class="ring-fg ${pct >= 1 ? 'full' : ''}" stroke-dasharray="${C * pct} ${C}"/></svg>
      <span class="st-txt"><b>${s}</b> 天 · ${xp}/${g}</span>`;
    el.title = `连续 ${s} 天达成目标 · 今日 ${xp}/${g} 分`;
  }

  /* ---------- backup: full export / import, optional auto-save to a local file ---------- */
  const BACKUP = {
    handle: null, timer: null,
    dump() {
      const data = {};
      Object.keys(localStorage).filter(k => k.startsWith('nh:')).forEach(k => { data[k] = localStorage.getItem(k); });
      return { app: 'nihao-dictation', v: 2, saved: new Date().toISOString(), data };
    },
    download() {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([JSON.stringify(this.dump())], { type: 'application/json' }));
      a.download = `nihao-备份-${dayStr()}.json`; a.click();
      store.set('lastBackup', dayStr());
    },
    merge(obj) {
      // old format from the mistake-book export
      if (obj.srs && !obj.data) obj = { data: { 'nh:srs': JSON.stringify(obj.srs), ...Object.fromEntries(Object.entries(obj.progress || {}).map(([k, v]) => [k, JSON.stringify(v)])) } };
      if (!obj.data) throw new Error('bad file');
      for (const [k, raw] of Object.entries(obj.data)) {
        const cur = localStorage.getItem(k);
        let v = raw;
        try {
          const a = JSON.parse(raw), b = cur ? JSON.parse(cur) : null;
          if (b && k === 'nh:srs') { for (const [id, e] of Object.entries(a)) if (!b[id] || (e.last || '') > (b[id].last || '')) b[id] = e; v = JSON.stringify(b); }
          else if (b && k.startsWith('nh:master:')) { b.w = { ...a.w, ...b.w }; b.t = { ...a.t, ...b.t }; b.test = b.test || a.test; v = JSON.stringify(b); }
          else if (b && k === 'nh:log') { for (const [d, e] of Object.entries(a)) if (!b[d] || b[d].xp < e.xp) b[d] = e; v = JSON.stringify(b); }
          else if (b && k === 'nh:stamps') v = JSON.stringify({ ...a, ...b });
          else if (b && k === 'nh:errs') { const seen = new Set(b.map(e => JSON.stringify(e))); v = JSON.stringify([...b, ...a.filter(e => !seen.has(JSON.stringify(e)))].slice(-400)); }
          else if (b && k === 'nh:journal') { for (const [dd, e] of Object.entries(a)) if (!b[dd] || (e.updated || '') > (b[dd].updated || '')) b[dd] = e; v = JSON.stringify(b); }
          else if (b && k === 'nh:mywords') { const have = new Set(b.map(w => w.fr)); v = JSON.stringify([...b, ...a.filter(w => !have.has(w.fr))]); }
          else if (b && k.startsWith('nh:testmiss:')) { for (const [w, n] of Object.entries(a)) b[w] = Math.max(b[w] || 0, n); v = JSON.stringify(b); }
          else if (b && k.startsWith('nh:sons:')) v = JSON.stringify({ quiz: Math.max(a.quiz || 0, b.quiz || 0), dict: Math.max(a.dict || 0, b.dict || 0) });
        } catch { }
        try { localStorage.setItem(k, v); } catch { }
      }
    },
    async pickFile() {
      this.handle = await window.showSaveFilePicker({ suggestedName: 'nihao-自动备份.json', types: [{ description: 'JSON', accept: { 'application/json': ['.json'] } }] });
      await idbSet('handle', this.handle);
      await this.write();
    },
    async resume() {
      const h = await idbGet('handle');
      if (!h) return false;
      if ((await h.requestPermission({ mode: 'readwrite' })) !== 'granted') return false;
      this.handle = h; await this.write(); return true;
    },
    async write() {
      if (!this.handle) return;
      try {
        const w = await this.handle.createWritable();
        await w.write(JSON.stringify(this.dump())); await w.close();
        store.set('lastAuto', new Date().toISOString(), true);
      } catch { this.handle = null; }
    },
    changed() { if (this.handle) { clearTimeout(this.timer); this.timer = setTimeout(() => this.write(), 2500); } CLOUD.changed(); },
  };
  function idb() {
    return new Promise((res, rej) => { const r = indexedDB.open('nihao', 1); r.onupgradeneeded = () => r.result.createObjectStore('kv'); r.onsuccess = () => res(r.result); r.onerror = rej; });
  }
  async function idbSet(k, v) { try { const db = await idb(); db.transaction('kv', 'readwrite').objectStore('kv').put(v, k); } catch { } }
  async function idbGet(k) { try { const db = await idb(); return await new Promise(r => { const q = db.transaction('kv').objectStore('kv').get(k); q.onsuccess = () => r(q.result); q.onerror = () => r(null); }); } catch { return null; } }
  if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => { });

  /* ---------- typewriter mode, printed slips and printable worksheets ---------- */
  const twOn = () => !!settings.typewriter;
  document.documentElement.classList.toggle('tw', !!settings.typewriter);
  window.NH_VOLUME = settings.volume;
  document.addEventListener('keydown', e => {
    if (!twOn() || !window.TYPEWRITER || !e.target.matches || !e.target.matches('input:not([type=checkbox]):not([type=range]):not([type=file]), textarea')) return;
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.key === 'Enter') TYPEWRITER.ret();
    else if (e.key === ' ') TYPEWRITER.space();
    else if (e.key === 'Backspace') TYPEWRITER.back();
    else if (e.key.length === 1) TYPEWRITER.key();
  }, true);

  // a paper slip that comes out of a printer, typed line by line
  function printSlip(title, lines) {
    const old = $('#slip'); if (old) old.remove();
    const ov = document.createElement('div');
    ov.id = 'slip'; ov.className = 'slip-ov';
    const now = new Date();
    const stamp = `${dayStr(now)}  ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    const all = ['*** CAHIER DE DICTÉE ***', stamp, '', title, '-'.repeat(26), ...lines, '-'.repeat(26), bi('继续加油！', 'Continue comme ça !'), '', '  · · ·'];
    ov.innerHTML = `<div class="printer"><div class="printer-body"><span class="printer-led"></span><span class="printer-name">IMPRIMERIE</span></div><div class="printer-slot"></div>
        <div class="paper-wrap"><div class="paper"><pre class="paper-text"></pre></div></div></div>
      <div class="slip-actions"><button class="btn small" id="slip-print">${bi('用打印机打出来', 'Print on paper')}</button><button class="btn small" id="slip-pdf">${bi('下载 PDF', 'Download PDF')}</button><button class="btn ghost small" id="slip-close">${bi('收起', 'Close')}</button></div>`;
    document.body.appendChild(ov);
    const pre = $('.paper-text', ov);
    let li = 0, ci = 0, stopped = false;
    const step = () => {
      if (stopped || li >= all.length) return;
      const line = all[li];
      if (ci === 0 && window.TYPEWRITER) TYPEWRITER.printLine();
      ci = Math.min(line.length, ci + 3);
      pre.textContent = all.slice(0, li).join('\n') + (li ? '\n' : '') + line.slice(0, ci);
      if (ci >= line.length) { li++; ci = 0; setTimeout(step, 90); } else setTimeout(step, 18);
    };
    setTimeout(step, 450);
    const close = () => { stopped = true; ov.remove(); };
    $('#slip-close', ov).onclick = close;
    ov.addEventListener('click', e => { if (e.target === ov) close(); });
    $('#slip-pdf', ov).onclick = async () => {
      stopped = true; pre.textContent = all.join('\n');
      const paper = $('.paper', ov), clone = paper.cloneNode(true);
      clone.classList.add('pdf-render', 'paper-pdf');
      const h = Math.ceil(paper.getBoundingClientRect().height * 25.4 / 96) + 12;
      await savePdf(clone.outerHTML, `slip-${dayStr()}.pdf`, { margin: 4, format: [88, Math.max(120, h)] });
    };
    $('#slip-print', ov).onclick = () => { stopped = true; pre.textContent = all.join('\n'); document.body.classList.add('printing-slip'); window.print(); document.body.classList.remove('printing-slip'); };
  }
  const slipBtn = id => `<button class="btn ghost" id="${id}"><svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true"><path d="M6 9V3h12v6M6 18H4v-7h16v7h-2M7 14h10v7H7z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg> ${bi('打印小票', 'Print a slip')}</button>`;
  const vw = t => [...String(t)].reduce((n, c) => n + (/[\u2E80-\uFFEF]/.test(c) ? 2 : 1), 0);
  const pad = (a, b, w = 26) => { a = String(a); b = String(b); return a + ' '.repeat(Math.max(1, w - vw(a) - vw(b))) + b; };

  // PDF export: html2canvas draws each block, jsPDF lays the images out on pages (loaded only when needed)
  let pdfLib = null;
  const loadJs = src => new Promise((ok, bad) => { const sc = document.createElement('script'); sc.src = src; sc.onload = ok; sc.onerror = bad; document.head.appendChild(sc); });
  function loadPdf() {
    if (window.html2canvas && window.jspdf) return Promise.resolve();
    return pdfLib = pdfLib || Promise.all([loadJs('https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js'), loadJs('https://cdn.jsdelivr.net/npm/jspdf@2.5.1/dist/jspdf.umd.min.js')]);
  }
  // html: markup to render; blocks inside matching opt.split each start on a new page
  async function savePdf(html, filename, opt = {}) {
    toast('PDF', bi('正在生成 PDF…', 'Making the PDF…'));
    const host = document.createElement('div');
    host.className = 'pdf-host';
    host.style.top = window.scrollY + 'px';
    host.innerHTML = html;
    document.body.appendChild(host);
    try {
      await loadPdf();
      await document.fonts.ready;
      const fmt = opt.format || [210, 297], margin = opt.margin ?? 12;
      const pdf = new window.jspdf.jsPDF({ unit: 'mm', format: fmt, orientation: 'portrait' });
      const W = fmt[0] - margin * 2, H = fmt[1] - margin * 2;
      const blocks = opt.split ? [...host.querySelectorAll(opt.split)] : [host.firstElementChild];
      let first = true;
      for (const block of blocks) {
        const canvas = await window.html2canvas(block, { scale: 2, backgroundColor: '#ffffff', useCORS: true });
        const pxPerMm = canvas.width / W, pageH = Math.floor(H * pxPerMm);
        for (let y = 0; y < canvas.height; y += pageH) {
          const h = Math.min(pageH, canvas.height - y);
          const part = document.createElement('canvas'); part.width = canvas.width; part.height = h;
          part.getContext('2d').drawImage(canvas, 0, y, canvas.width, h, 0, 0, canvas.width, h);
          if (!first) pdf.addPage(fmt, 'portrait');
          first = false;
          pdf.addImage(part.toDataURL('image/jpeg', 0.92), 'JPEG', margin, margin, W, h / pxPerMm);
        }
      }
      pdf.save(filename);
    } catch (e) { console.warn(e); alert(tr('PDF 生成失败（可能是网络连不上）。可以用「打印」里的「存储为 PDF」。').replace(' · ', '\n')); }
    host.remove();
  }
  function worksheetEl(book, lecon) {
    const area = document.createElement('div');
    area.id = 'print-area';
    const blanks = n => '_'.repeat(Math.max(6, Math.min(18, n + 2)));
    const cloze = (lecon.cloze || []).map(row => row.map(s => typeof s === 'string' ? esc(s) : `<span class="pw-blank">${blanks(s.b.length)}</span>`).join('')).join('<br>');
    const lines = lecon.text.filter(r => !r.h);
    area.innerHTML = `
      <section class="pw-page"><h1>Leçon ${lecon.n} · ${esc(lecon.title)}</h1><p class="pw-sub">${esc(book.title)} · ${esc(lecon.zh)} · ${bi('姓名', 'Name')} ________ ${bi('日期', 'Date')} ________</p>
        <h2>${bi('一、词汇默写', 'I. Vocabulary')}</h2>
        <table class="pw-table">${lecon.vocab.map((v, k) => `<tr><td>${k + 1}</td><td>${esc(v.zh)}</td><td>${esc(v.pos)}</td><td class="pw-line"></td></tr>`).join('')}</table></section>
      ${cloze ? `<section class="pw-page pw-break"><h2>${bi('二、课文填空', 'II. Fill the gaps')}</h2><div class="pw-cloze">${cloze}</div></section>` : ''}
      <section class="pw-page pw-break"><h2>${bi('三、全文默写', 'III. Full dictation')}</h2>${lines.map(r => `<p class="pw-zh">${esc(r.zh)}</p><div class="pw-write"></div>`).join('')}</section>
      <section class="pw-page pw-break"><h2>${bi('答案', 'Answers')}</h2>
        <ol class="pw-ans">${lecon.vocab.map(v => `<li><b>${esc(v.fr)}</b> — ${esc(v.zh)}</li>`).join('')}</ol>
        ${lines.map(r => `<p class="pw-fr">${esc(r.fr)}</p>`).join('')}</section>`;
    return area;
  }
  async function worksheetPdf(book, lecon) {
    const area = worksheetEl(book, lecon);
    area.classList.add('pdf-render');
    await savePdf(area.outerHTML, `Lecon-${lecon.n}-dictee.pdf`, { split: '.pw-page' });
  }
  // a printable worksheet for one leçon: words, gap-fill, full text, then the answers
  function printWorksheet(book, lecon) {
    const area = worksheetEl(book, lecon);
    document.body.appendChild(area);
    document.body.classList.add('printing-sheet');
    setTimeout(() => { window.print(); document.body.classList.remove('printing-sheet'); area.remove(); }, 50);
  }

  /* ---------- noun gender: colour hints and a faint article before the word ---------- */
  function gender(pos) {
    pos = String(pos || '');
    return /(^|\W)n\.m\.|^m\./.test(pos) ? 'm' : /(^|\W)n\.f\.|^f\./.test(pos) ? 'f' : '';
  }
  function artHint(v) {
    const g = gender(v.pos); if (!g) return '';
    const pl = /pl\./.test(v.pos), vow = /^[aeiouyhâàéèêëîïôûœ]/i.test(v.fr);
    const a = pl ? 'des · les' : g === 'm' ? (vow ? "un · l'" : 'un · le') : (vow ? "une · l'" : 'une · la');
    return `<span class="art-hint" aria-hidden="true">${a}</span>`;
  }
  // the right answer with the letters whose accent differs from what was typed marked
  function accentDiff(typed, target) {
    const t = [...typed.normalize('NFC')], c = [...target.normalize('NFC')];
    if (t.length !== c.length) return esc(target);
    return c.map((ch, i) => ch !== t[i] && strip(ch).toLowerCase() === strip(t[i]).toLowerCase() ? `<mark class="acc-x">${esc(ch)}</mark>` : esc(ch)).join('');
  }

  /* ---------- accent bar: typewriter keys, number shortcuts and e/ → é composing ---------- */
  const ACCENTS = {
    keys: ['é', 'è', 'ê', 'ë', 'à', 'â', 'ù', 'û', 'ç', 'œ'],
    // composing pairs (only in single-word answers, where "donc," etc. can't occur)
    pairs: { 'e/': 'é', 'e\\': 'è', 'e^': 'ê', 'e"': 'ë', 'a\\': 'à', 'a^': 'â', 'u\\': 'ù', 'u^': 'û', 'c,': 'ç', 'oe': 'œ', 'i^': 'î', 'o^': 'ô' },
    el: null, target: null,
    // which inputs get the bar; "word" ones also get the number keys and composing
    fits: el => el && el.matches && el.matches('.answer-in[lang="fr"], .cloze-in, .full-in, #typed'),
    isWord: el => el.matches('input.answer-in[lang="fr"], .cloze-in'),
    init() {
      const bar = this.el = document.createElement('div');
      bar.className = 'acc-bar'; bar.hidden = true; bar.setAttribute('role', 'toolbar'); bar.setAttribute('aria-label', 'accents');
      bar.innerHTML = this.keys.map((k, i) => `<button type="button" class="acc-key" data-k="${k}" tabindex="-1"><small>${(i + 1) % 10}</small>${k}</button>`).join('');
      document.body.appendChild(bar);
      // keep focus in the input when a key is pressed
      bar.addEventListener('pointerdown', e => e.preventDefault());
      bar.addEventListener('click', e => { const b = e.target.closest('.acc-key'); if (b && this.target) this.insert(this.target, b.dataset.k, 0); });
      document.addEventListener('focusin', e => { if (this.fits(e.target)) { this.target = e.target; bar.hidden = false; bar.classList.toggle('word', this.isWord(e.target)); } });
      document.addEventListener('focusout', () => setTimeout(() => { if (!this.fits(document.activeElement)) { bar.hidden = true; this.target = null; } }, 0));
      document.addEventListener('keydown', e => {
        const el = e.target;
        if (!this.fits(el) || !this.isWord(el) || e.ctrlKey || e.metaKey || e.altKey || !/^[0-9]$/.test(e.key)) return;
        e.preventDefault();
        const k = this.keys[(+e.key + 9) % 10];
        this.insert(el, k, 0); this.press(k);
      });
      document.addEventListener('input', e => {
        const el = e.target;
        if (!this.fits(el) || !this.isWord(el) || e.inputType !== 'insertText') return;
        const p = el.selectionStart, two = el.value.slice(p - 2, p);
        const out = this.pairs[two.toLowerCase()];
        if (!out) return;
        const ch = two[0] === two[0].toUpperCase() && two[0] !== two[0].toLowerCase() ? out.toUpperCase() : out;
        el.setSelectionRange(p - 2, p); this.insert(el, ch, 0); this.press(out);
      });
    },
    insert(el, ch) {
      el.focus();
      const a = el.selectionStart ?? el.value.length, b = el.selectionEnd ?? a;
      el.setRangeText(ch, a, b, 'end');
      el.dispatchEvent(new Event('input', { bubbles: true }));
    },
    press(k) {
      const b = this.el && this.el.querySelector(`[data-k="${k}"]`); if (!b) return;
      b.classList.remove('down'); void b.offsetWidth; b.classList.add('down');
      setTimeout(() => b.classList.remove('down'), 160);
    },
  };

  /* ---------- cloud sync: Google sign-in + one Firestore document per user ---------- */
  const NOSYNC = new Set(['nh:synccode', 'nh:eaFold', 'nh:settings', 'nh:lastAuto', 'nh:lastBackup', 'nh:lastSync']);
  const CLOUD = {
    ready: false, user: null, timer: null, busy: false, applying: false, status: '',
    on: () => !!(window.FIREBASE_CONFIG && window.firebase),
    init() {
      if (!this.on()) return;
      try {
        firebase.initializeApp(window.FIREBASE_CONFIG);
        this.db = firebase.firestore();
        firebase.auth().getRedirectResult().catch(() => { });
        firebase.auth().onAuthStateChanged(async u => {
          this.user = u; this.ready = true;
          if (this.linked()) await this.pull();
          refreshCloudUI();
        });
        document.addEventListener('visibilitychange', () => {
          if (document.visibilityState === 'visible' && this.linked()) this.pull();
          else this.flush();
        });
        window.addEventListener('pagehide', () => this.flush());
      } catch (e) { this.status = 'error'; }
    },
    async signIn() {
      const p = new firebase.auth.GoogleAuthProvider();
      try { await firebase.auth().signInWithPopup(p); }
      catch (e) {
        if (/popup/.test(e.code || '')) await firebase.auth().signInWithRedirect(p);
        else alert(tr('登录失败：') + (e.message || e.code));
      }
    },
    signOut() { localStorage.removeItem('nh:synccode'); firebase.auth().signOut(); },
    // a sync code: an alternative to Google — anyone with the code shares the same progress
    code: () => localStorage.getItem('nh:synccode') || '',
    linked() { return !!this.user && (!this.user.isAnonymous || !!this.code()); },
    newCode() {
      const A = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789', r = crypto.getRandomValues(new Uint8Array(12));
      return [...r].map(x => A[x % 32]).join('').replace(/(.{4})(?!$)/g, '$1-');
    },
    async useCode(code) {
      code = String(code || '').toUpperCase().replace(/[^A-Z0-9]/g, '').replace(/(.{4})(?!$)/g, '$1-');
      if (code.length !== 14) { alert(bi('同步码应该是 12 个字母或数字', 'A sync code has 12 letters or digits')); return; }
      localStorage.setItem('nh:synccode', code);
      try {
        if (!this.user) await firebase.auth().signInAnonymously();
        else { await this.pull(); refreshCloudUI(); }
      } catch (e) {
        localStorage.removeItem('nh:synccode');
        alert(bi('同步码登录失败：', 'Sync code sign-in failed: ') + (e.code === 'auth/operation-not-allowed' || e.code === 'auth/admin-restricted-operation' ? bi('需要在 Firebase 里开启「匿名」登录方式。', 'Anonymous sign-in needs to be turned on in Firebase.') : (e.message || e.code)));
      }
    },
    doc() {
      return this.user.isAnonymous ? this.db.collection('codes').doc(this.code()) : this.db.collection('users').doc(this.user.uid);
    },
    local() {
      const data = {};
      Object.keys(localStorage).filter(k => k.startsWith('nh:') && !NOSYNC.has(k)).forEach(k => { data[k] = localStorage.getItem(k); });
      return data;
    },
    // download the cloud copy, merge it into this device, then upload the merged result
    async pull() {
      if (!this.linked() || this.busy) return;
      this.busy = true; this.status = 'syncing'; refreshCloudUI();
      try {
        const snap = await this.doc().get();
        if (snap.exists && snap.data().data) {
          this.applying = true;
          BACKUP.merge({ data: snap.data().data });
          this.applying = false;
        }
        await this.doc().set({ data: this.local(), updated: firebase.firestore.FieldValue.serverTimestamp(), email: this.user.email || '' });
        store.set('lastSync', new Date().toISOString(), true);
        this.status = 'ok';
        renderStatus();
        if (snap.exists) route();
      } catch (e) { this.status = 'error'; this.err = e.code || e.message || String(e); console.warn('sync', e); }
      this.busy = false; refreshCloudUI();
    },
    async push() {
      if (!this.linked()) return;
      try {
        await this.doc().set({ data: this.local(), updated: firebase.firestore.FieldValue.serverTimestamp(), email: this.user.email || '' });
        store.set('lastSync', new Date().toISOString(), true); this.status = 'ok';
      } catch (e) { this.status = 'error'; this.err = e.code || e.message || String(e); }
      refreshCloudUI();
    },
    // to save free Firestore quota: upload once a practice ends (leaving the page, switching away), not after every answer
    dirty: false,
    changed() { if (this.linked() && !this.applying) { this.dirty = true; clearTimeout(this.timer); this.timer = setTimeout(() => this.flush(), 120000); } },
    flush() { if (this.dirty && this.linked()) { this.dirty = false; clearTimeout(this.timer); this.push(); } },
  };
  function cloudHTML() {
    if (!window.FIREBASE_CONFIG) return `<p class="hint-text" style="margin:0">云同步还没有设置。</p>`;
    if (!window.firebase) return `<p class="notice">云同步组件没有加载（可能是网络问题），刷新页面再试。</p>`;
    if (!CLOUD.ready) return `<p class="kbd">正在连接…</p>`;
    if (!CLOUD.linked()) return `<p class="hint-text" style="margin:0 0 12px">用 Google 账号登录后，手机和电脑会自动共用同一份进度：掌握的单词、错题本、打卡和邮票。</p>
      <button class="btn" id="cl-in">用 Google 登录</button>
      <p class="hint-text" style="margin:16px 0 8px">${bi('不想用 Google？也可以用同步码：在一台设备上生成，在其他设备上输入同一个码，进度就会同步。', 'No Google? Use a sync code instead: make one on one device, type the same code on the others, and your progress syncs.')}</p>
      <div class="toolbar"><button class="btn ghost" id="cl-gen">${bi('生成同步码', 'Make a sync code')}</button>
        <input id="cl-code" class="answer-in" style="font-size:16px;max-width:220px;text-transform:uppercase" placeholder="XXXX-XXXX-XXXX" autocomplete="off" spellcheck="false">
        <button class="btn ghost" id="cl-use">${bi('用这个码', 'Use this code')}</button></div>`;
    const last = store.get('lastSync', '');
    const st = CLOUD.status === 'syncing' ? '正在同步…' : CLOUD.status === 'error' ? '同步失败' : last ? `已同步 · ${last.slice(0, 16).replace('T', ' ')}` : '';
    const who = CLOUD.user.isAnonymous ? `${bi('同步码', 'Sync code')}：<b class="sync-code" lang="en">${esc(CLOUD.code())}</b>` : `已登录：<b>${esc(CLOUD.user.email || CLOUD.user.displayName || '')}</b>`;
    return `<div class="toolbar"><span>${who}</span>
      <span class="kbd">${st}</span><span class="spacer"></span>
      ${CLOUD.user.isAnonymous ? `<button class="btn ghost small" id="cl-copy">${bi('复制', 'Copy')}</button>` : ''}<button class="btn ghost small" id="cl-now">立即同步</button><button class="btn ghost small" id="cl-out">退出登录</button></div>
      ${CLOUD.status === 'error' ? `<p class="notice" style="margin:8px 0 0">${esc(cloudErr(CLOUD.err))}<br><span class="kbd" lang="en">${esc(CLOUD.err || '')}</span></p>` : ''}
      ${CLOUD.user.isAnonymous ? `<p class="hint-text" style="margin:8px 0 0">${bi('把这个码记下来（截图或抄在本子上）。在别的设备的「同步码」里输入它，就能拿回全部记录。码丢了就找不回来了。', 'Write this code down (screenshot it or copy it into a notebook). Type it into "Sync code" on another device to get all your records back. A lost code can\'t be recovered.')}</p>` : ''}
      <p class="kbd" style="margin:6px 0 0">每次练习结束（离开练习页或切走）时自动上传；打开网站或切回这个页面时自动下载并合并。</p>`;
  }
  function cloudErr(code) {
    code = String(code || '');
    if (/permission-denied|insufficient permissions/i.test(code)) return '数据库拒绝访问：请在 Firebase 的 Firestore Database → 规则里粘贴规则并点「发布」。';
    if (/not-found|does not exist|NOT_FOUND|failed-precondition/i.test(code)) return '找不到数据库：请在 Firebase 里打开 Firestore Database，点「创建数据库」。';
    if (/unavailable|offline|network/i.test(code)) return '网络连不上 Firebase：检查网络（需要能访问 Google），然后点「立即同步」。';
    return '同步出错，下面是错误代码，发给 Claude 看看。';
  }
  function refreshCloudUI() {
    const box = $('#cloud'); if (box) { box.innerHTML = cloudHTML(); bindCloud(box); }
    const dot = $('#cloud-dot'); if (dot) dot.dataset.state = CLOUD.linked() ? CLOUD.status || 'ok' : 'off';
  }
  function bindCloud(box) {
    const i = $('#cl-in', box), n = $('#cl-now', box), o = $('#cl-out', box);
    if (i) i.onclick = () => CLOUD.signIn();
    if (n) n.onclick = () => CLOUD.pull();
    if (o) o.onclick = () => { if (!CLOUD.user.isAnonymous || confirm(bi('退出前请确认已经记下同步码，否则这台设备就连不回这份记录了。', 'Make sure you have written the sync code down first — otherwise this device can\'t reconnect to these records.'))) CLOUD.signOut(); };
    const g = $('#cl-gen', box), u = $('#cl-use', box), c = $('#cl-copy', box);
    if (g) g.onclick = () => CLOUD.useCode(CLOUD.newCode());
    if (u) u.onclick = () => CLOUD.useCode($('#cl-code', box).value);
    if (c) c.onclick = () => navigator.clipboard.writeText(CLOUD.code()).then(() => { c.textContent = bi('已复制', 'Copied'); });
  }

  /* ---------- verb dictionary (from the Mon Français site + the textbook verbs) ---------- */
  function viewVerbs(sel) {
    const D = window.VERBDICT;
    if (!D) { main.innerHTML = '<p class="notice">动词词典没有加载。</p>'; return; }
    document.title = bi('动词词典', 'Verb dictionary') + ' · 你好法语';
    const strip2 = v => v.replace(/^se |^s'/, '');
    const list = D.list().sort((a, b) => strip2(a).localeCompare(strip2(b), 'fr'));
    // which leçon of the book each verb comes from
    const inBook = {};
    for (const u of BOOKS[0].units) for (const l of u.lecons) for (const v of l.vocab) if (v.pos.startsWith('v')) {
      const m = v.fr.match(/^(\S+)\s*\((se|s')\)$/);
      const k = m ? (/^[aeiouyhâéèêî]/i.test(m[1]) ? "s'" : 'se ') + m[1] : v.fr;
      if (!inBook[k]) inBook[k] = l.n;
    }
    const kindOf = v => { const c = D.get(v), n = c.special.present + c.special.pc + c.special.imparfait + c.special.futur; return c.group === 3 && n ? 'irr' : n ? 'spell' : 'reg'; };
    const TAG = { irr: bi('不规则', 'irregular'), spell: bi('拼写变化', 'spelling') };
    const counts = { irr: 0, spell: 0, reg: 0 };
    list.forEach(v => counts[kindOf(v)]++);
    const filter = store.get('vdfilter', 'all');
    main.innerHTML = `
      <p class="kicker" lang="fr">Les verbes</p>
      <h1 style="font-size:44px">${bi('动词词典', 'Verb dictionary')}</h1>
      <p class="hint-text" style="margin-top:8px">${bi('现在时、复合过去时、未完成过去时、简单将来时。蓝色是规则词尾，红色是特殊变化；点任意一行听发音。', 'Present, passé composé, imparfait and futur simple. Blue = regular ending, red = special form; tap any line to hear it.')}</p>
      <div class="verb-page">
        <aside class="verb-list">
          <input type="search" class="verb-search typed-recite" placeholder="${bi('搜索动词 / 中文 / 英文', 'Search verb / meaning')}" style="margin:0 0 10px">
          <div class="modes" style="margin-bottom:10px">
            <button class="mode" data-kind="all" aria-pressed="${filter === 'all'}">${bi('全部', 'All')} ${list.length}</button>
            <button class="mode" data-kind="irr" aria-pressed="${filter === 'irr'}">${bi('不规则', 'Irregular')} ${counts.irr}</button>
            <button class="mode" data-kind="book" aria-pressed="${filter === 'book'}">${bi('课本里的', 'In the book')} ${list.filter(v => inBook[v]).length}</button>
          </div>
          <ul>${list.map(v => {
            const k = kindOf(v), c = D.get(v);
            return `<li data-kind="${k}" data-book="${inBook[v] ? 1 : ''}" data-search="${esc(loose(v + ' ' + c.zh + ' ' + c.en))}"><button type="button" data-verb="${esc(v)}">
              <span class="vl-name"><span lang="fr">${esc(v)}</span>${TAG[k] ? `<span class="v-tag ${k}">${TAG[k]}</span>` : ''}${inBook[v] ? `<span class="v-tag book">L${inBook[v]}</span>` : ''}</span>
              <small>${G(c)}</small></button></li>`;
          }).join('')}</ul>
        </aside>
        <div class="verb-detail"></div>
      </div>`;
    const detail = $('.verb-detail', main);
    const show = (v, scroll) => {
      if (!D.get(v)) v = list.includes('être') ? 'être' : list[0];
      detail.innerHTML = D.tableHTML(v);
      $$('[data-verb]', main).forEach(b => b.classList.toggle('on', b.dataset.verb === v));
      history.replaceState(null, '', '#/verbes/' + encodeURIComponent(v));
      if (scroll && window.innerWidth < 800) detail.scrollIntoView({ behavior: 'smooth' });
    };
    $('.verb-list ul', main).addEventListener('click', e => { const b = e.target.closest('[data-verb]'); if (b) show(b.dataset.verb, true); });
    let kind = filter;
    const apply = () => {
      const q = loose($('.verb-search', main).value || '');
      $$('.verb-list li', main).forEach(li => {
        const ok = kind === 'all' || (kind === 'irr' ? li.dataset.kind === 'irr' : !!li.dataset.book);
        li.hidden = !ok || (q && !li.dataset.search.includes(q));
      });
    };
    $('.verb-search', main).addEventListener('input', apply);
    $$('[data-kind]', main).forEach(b => b.onclick = () => { kind = b.dataset.kind; store.set('vdfilter', kind); $$('[data-kind]', main).forEach(x => x.setAttribute('aria-pressed', x === b)); apply(); });
    apply();
    show(sel);
  }

  /* ---------- 《法语发音》: the pronunciation book ---------- */
  const SB = () => window.SOUNDS;
  const sLessons = () => SB().units.flatMap(u => u.lessons.map(l => ({ ...l, unit: u })));
  const sFind = id => sLessons().find(l => l.id === id);
  const gloss = s => { const [w, zh, en] = String(s).split('|'); return { w, zh: zh || '', en: en || '' }; };
  const sProg = id => store.get('sons:' + id, {});
  function sSave(id, part, score) { const p = sProg(id); p[part] = Math.max(p[part] || 0, Math.round(score * 100) / 100); store.set('sons:' + id, p); }
  const tl = o => esc(L() === 'en' ? (o.te || o.t) : o.t);
  const txt = (zh, en) => G({ zh, en });
  // every word a lesson uses, with the answer it belongs to
  function sItems(l) {
    if (l.quiz.type === 'spell') return l.spell.flatMap(r => r.ex.map(e => ({ ...gloss(e), a: r.sp })));
    if (l.quiz.type === 'pair') return l.quiz.items.map(([e, a]) => ({ ...gloss(e), a }));
    return [];
  }
  const sOptions = l => l.quiz.type === 'spell' ? l.spell.map(r => ({ k: r.sp, label: r.sp + (r.say ? ' ' + r.say : '') })) : (l.options || []);
  const partnerOf = (l, w) => { for (const p of l.pairs || []) { if (p[0] === w) return p[1]; if (p[1] === w) return p[0]; } return null; };

  function soundCover(tag = 'a') {
    return `<${tag} class="cover sons" ${tag === 'a' ? 'href="#/sons"' : ''} aria-label="${esc(SB().title)}">
      <div class="c-zh">法语<br>发音</div><div class="c-fr" lang="fr">${esc(SB().fr)}</div><div class="c-num" lang="fr">ɛ̃</div>
      <svg viewBox="0 0 200 90" fill="none" stroke="currentColor" stroke-width="1.1" stroke-linecap="round" aria-hidden="true">
        <path d="M20 70 Q40 20 60 70 T100 70 T140 70 T180 70" /><path d="M20 80 Q50 50 80 80 T140 80 T200 80" stroke-width=".7"/>
        <path d="M150 20 q8 -8 16 0 q-8 10 -16 0z M170 34 q6 -6 12 0 q-6 8 -12 0z" stroke-width=".8"/>
      </svg></${tag}>`;
  }

  function viewSounds() {
    const B = SB();
    document.title = B.title + ' · ' + B.fr;
    main.innerHTML = `
      <div class="book-head">${soundCover('div')}<div><p class="kicker" lang="fr">${esc(B.fr)}</p><h1>${esc(B.title)}</h1>
        <p class="hint-text" style="margin:6px 0 0">${bi('字母、元音、鼻化元音、半元音、辅音、不发音字母与连读，以及最容易混的几组音。每课有口腔图、例词、辨音练习和听写。', 'Letters, vowels, nasals, semi-vowels, consonants, silent letters and liaison, and the pairs people mix up. Each lesson has a mouth diagram, example words, a listening quiz and a dictation.')}</p></div></div>
      ${B.units.map(u => `
        <section class="unit">
          <div class="unit-title"><h2>${tl(u)}</h2><span lang="fr">Partie ${u.n}</span></div>
          <div class="lecons">${u.lessons.map(l => {
            const p = sProg(l.id);
            const bar = (label, v) => `<div class="pbar ${v >= 0.999 ? 'done' : ''}"><span class="pl">${label}</span><span class="pt"><i style="width:${Math.round((v || 0) * 100)}%"></i></span><span class="pn">${v ? Math.round(v * 100) + '%' : '—'}</span></div>`;
            return `<a class="lecon-card" href="#/sons/${l.id}">${window.SKY_ART ? window.SKY_ART(sLessons().findIndex(x => x.id === l.id) + 5) : ''}
              <div class="n" lang="fr">${esc(l.ipa)}</div><h3 lang="fr">${tl(l)}</h3>
              <div class="prog">${bar(bi('辨音', 'Quiz'), p.quiz)}${bar(bi('听写', 'Dictée'), p.dict)}</div></a>`;
          }).join('')}</div>
        </section>`).join('')}`;
  }

  function viewSoundLesson(id, tab = 'learn') {
    const l = sFind(id);
    if (!l) { location.hash = '#/sons'; return; }
    const all = sLessons(), idx = all.findIndex(x => x.id === id), prev = all[idx - 1], next = all[idx + 1];
    document.title = `${l.ipa} · ${SB().title}`;
    const hasDict = l.quiz.type !== 'letter';
    main.innerHTML = `
      <header class="lecon-head"><p class="kicker">${tl(l.unit)}</p><h1 lang="fr">${esc(l.ipa)} <span class="sons-title">${tl(l)}</span></h1></header>
      <nav class="tabs" role="tablist">
        <button class="tab" data-st="learn" aria-selected="${tab === 'learn'}"><b>1</b>${bi('讲解', 'Learn')}</button>
        <button class="tab" data-st="quiz" aria-selected="${tab === 'quiz'}"><b>2</b>${l.quiz.type === 'letter' ? bi('听字母', 'Letters') : bi('辨音练习', 'Listening quiz')}</button>
        ${hasDict ? `<button class="tab" data-st="dict" aria-selected="${tab === 'dict'}"><b>3</b>${bi('听写', 'Dictation')}</button>` : ''}
      </nav>
      <section id="pane"></section>
      <div class="toolbar" style="margin-top:40px">
        ${prev ? `<a class="btn ghost small" href="#/sons/${prev.id}">‹ <span lang="fr">${esc(prev.ipa)}</span></a>` : ''}<span class="spacer"></span>
        ${next ? `<a class="btn ghost small" href="#/sons/${next.id}"><span lang="fr">${esc(next.ipa)}</span> ›</a>` : ''}
      </div>`;
    $$('[data-st]', main).forEach(b => b.onclick = () => { history.replaceState(null, '', `#/sons/${id}/${b.dataset.st}`); route(); });
    const pane = $('#pane');
    if (tab === 'quiz') sQuiz(l, pane);
    else if (tab === 'dict' && hasDict) sDict(l, pane);
    else sLearn(l, pane);
  }

  const chip = g => `<button class="wchip" data-say="${esc(g.w)}"><span lang="fr">${esc(g.w)}</span><small>${G(g)}</small></button>`;
  function sLearn(l, pane) {
    const mouths = (window.LESSON_MOUTH || {})[l.id] || [];
    let h = '';
    if (mouths.length && window.MOUTH_SVG) h += `<div class="mouths">${mouths.map(k => window.MOUTH_SVG(k, L())).join('')}</div>`;
    h += `<div class="sons-how">${txt(l.how, l.howEn)}</div>`;
    if (l.letters) h += `<div class="letters">${l.letters.map(([L1, name, ipa]) => `<button class="letter" data-say="${esc(name)}"><b lang="fr">${L1}</b><span lang="fr">${esc(name)}</span>${ipa ? `<small>${ipa}</small>` : ''}</button>`).join('')}</div>`;
    if (l.spell) h += `<div class="spell-table">${l.spell.map(r => `<div class="spell-row"><div class="sp" lang="fr">${esc(r.sp)}${r.say ? `<small>${esc(r.say)}</small>` : ''}</div>
      <div class="chips">${r.ex.map(e => chip(gloss(e))).join('')}</div></div>`).join('')}</div>`;
    if (l.options && l.quiz.items) {
      const items = sItems(l);
      h += `<div class="opt-cols">${l.options.map(o => `<div class="opt-col"><h3 lang="fr">${esc(L() === 'en' ? o.labelEn || o.label : o.label)}</h3>
        <div class="chips">${items.filter(it => it.a === o.k).map(chip).join('')}</div></div>`).join('')}</div>`;
    }
    if (l.pairs) h += `<h3 class="pairs-h">${bi('成对对比：两个词只差这一个音', 'Minimal pairs: the two words differ only in this sound')}</h3>
      <div class="pairs">${l.pairs.map(([a, b]) => `<div class="pair"><button class="wchip" data-say="${esc(a)}"><span lang="fr">${esc(a)}</span></button><span class="vs">↔</span>
        <button class="wchip" data-say="${esc(b)}"><span lang="fr">${esc(b)}</span></button>
        <button class="play" data-pair="${esc(a)}|${esc(b)}" title="${bi('连着听两个', 'Hear both')}">${ICON.play}</button></div>`).join('')}</div>`;
    h += `<div class="toolbar" style="margin-top:22px"><a class="btn" href="#/sons/${l.id}/quiz">${bi('开始辨音练习 ›', 'Start the quiz ›')}</a></div>`;
    pane.innerHTML = h;
    $$('[data-pair]', pane).forEach(b => b.onclick = e => { e.stopPropagation(); const [a, c] = b.dataset.pair.split('|'); speakSeq([a, c], () => { }); });
  }

  function sQuiz(l, pane) {
    if (l.quiz.type === 'letter') return sLetters(l, pane);
    const opts = sOptions(l);
    const queue = shuffle(sItems(l)).slice(0, 20);
    let i = 0, right = 0, answered = false;
    const draw = () => {
      if (i >= queue.length) {
        const sc = right / queue.length; sSave(l.id, 'quiz', sc);
        pane.innerHTML = `<div class="drill summary"><p class="kicker" lang="fr">Bilan</p><div class="score">${right} / ${queue.length}</div>
          <p>${sc >= 0.9 ? bi('耳朵已经分得很清楚了！', 'Your ear can tell them apart!') : bi('答错的那几组可以回「讲解」里成对多听几遍。', 'Go back to Learn and replay the pairs you missed.')}</p>
          <div class="drill-actions" style="justify-content:center"><button class="btn" id="again">${bi('再来一轮', 'Another round')}</button><a class="btn ghost" href="#/sons/${l.id}/dict">${bi('去听写 ›', 'Dictation ›')}</a></div></div>`;
        $('#again', pane).onclick = () => sQuiz(l, pane);
        return;
      }
      const it = queue[i]; answered = false;
      pane.innerHTML = `<div class="drill">
        <div class="count">${i + 1} / ${queue.length}</div><div class="bar"><i style="width:${i / queue.length * 100}%"></i></div>
        <div class="prompt">${playBtn(it.w, 'big')}
          <div class="ppos">${l.quiz.type === 'spell' ? `${bi('这个词用的是哪种写法？', 'Which spelling does this word use?')} · ${G(it)}` : bi('你听到的是哪个音？', 'Which sound do you hear?')}</div></div>
        <div class="choices">${opts.map((o, k) => `<button class="choice" data-k="${esc(o.k)}"><kbd>${k + 1}</kbd> <span lang="fr">${esc(L() === 'en' ? o.labelEn || o.label : o.label)}</span></button>`).join('')}</div>
        <div id="fb"></div>
        <p class="kbd" style="margin-top:12px">${bi('数字键选择 · 空格再听一次 · Enter 下一题', 'Number keys to choose · Space to replay · Enter for next')}</p></div>`;
      setTimeout(() => TTS.say(it.w), 250);
      $$('.choice', pane).forEach(b => b.onclick = () => answer(b.dataset.k));
    };
    const answer = k => {
      if (answered) return;
      answered = true;
      const it = queue[i], ok = k === it.a;
      if (ok) { right++; XP.gain(1, bi('辨音正确', 'Heard it right')); }
      else ERRS.quiz(l.id, it.w, k);
      $$('.choice', pane).forEach(b => { b.disabled = true; if (b.dataset.k === it.a) b.classList.add('ok'); else if (b.dataset.k === k) b.classList.add('bad'); });
      const p = partnerOf(l, it.w);
      $('#fb', pane).innerHTML = `<div class="feedback ${ok ? 'ok' : 'bad'}"><span class="lab">${ok ? bi('对了', 'Right') : bi('听错了，对比一下', 'Not quite — compare them')}</span>
        <div class="ans">${playBtn(it.w)} <span lang="fr">${esc(it.w)}</span> <span class="kbd">${G(it)}</span>
        ${p ? `<span class="vs">↔</span>${playBtn(p)} <span lang="fr">${esc(p)}</span>` : ''}</div></div>`;
      if (!ok && p) setTimeout(() => speakSeq([it.w, p], () => { }), 300);
    };
    const onKey = e => {
      if (!document.body.contains(pane) || !$('.choice', pane) && !$('.summary', pane)) return;
      if (e.target.matches('input, textarea')) return;
      const n = +e.key;
      if (n >= 1 && n <= opts.length && !answered) { e.preventDefault(); answer(opts[n - 1].k); }
      else if (e.key === ' ') { e.preventDefault(); if (queue[i]) TTS.say(queue[i].w); }
      else if (e.key === 'Enter' && answered) { e.preventDefault(); i++; draw(); }
    };
    document.addEventListener('keydown', onKey);
    const prevC = cleanup; cleanup = () => { document.removeEventListener('keydown', onKey); prevC && prevC(); };
    pane.addEventListener('click', e => { if (answered && e.target.closest('.feedback') === null && e.target.closest('.choices') && false) { } });
    draw();
    // tapping anywhere below the feedback moves on (handy on phones)
    pane.addEventListener('click', e => { if (answered && e.target.closest('#fb') && !e.target.closest('[data-say]')) { i++; draw(); } });
  }

  function sLetters(l, pane) {
    const queue = shuffle(l.letters);
    let i = 0, right = 0, answered = false;
    const draw = () => {
      if (i >= queue.length) {
        sSave(l.id, 'quiz', right / queue.length);
        pane.innerHTML = `<div class="drill summary"><p class="kicker" lang="fr">Bilan</p><div class="score">${right} / ${queue.length}</div>
          <div class="drill-actions" style="justify-content:center"><button class="btn" id="again">${bi('再来一轮', 'Another round')}</button></div></div>`;
        $('#again', pane).onclick = () => sLetters(l, pane);
        return;
      }
      const [Lt, name] = queue[i]; answered = false;
      pane.innerHTML = `<div class="drill"><div class="count">${i + 1} / ${queue.length}</div><div class="bar"><i style="width:${i / queue.length * 100}%"></i></div>
        <div class="prompt">${playBtn(name, 'big')}<div class="ppos">${bi('听字母的读音，写出这个字母', 'Hear the letter name and type the letter')}</div></div>
        <input class="answer-in" id="ans" maxlength="2" autocomplete="off" autocapitalize="characters" spellcheck="false" style="text-align:center;font-size:34px">
        <div id="fb"></div></div>`;
      const inp = $('#ans', pane); inp.focus();
      setTimeout(() => TTS.say(name), 250);
      inp.onkeydown = e => {
        if (e.key !== 'Enter') return;
        e.preventDefault();
        if (answered) { i++; draw(); return; }
        if (!inp.value.trim()) return;
        answered = true;
        const ok = inp.value.trim().toUpperCase() === Lt;
        if (ok) { right++; XP.gain(1, bi('字母正确', 'Letter right')); } else ERRS.quiz(l.id, Lt, inp.value.trim().toUpperCase());
        $('#fb', pane).innerHTML = `<div class="feedback ${ok ? 'ok' : 'bad'}"><span class="lab">${ok ? bi('对了', 'Right') : bi('正确答案', 'Answer')}</span>
          <div class="ans">${playBtn(name)} <b style="font-size:28px">${Lt}</b> <span lang="fr">« ${esc(name)} »</span></div></div>`;
      };
    };
    draw();
  }

  function sDict(l, pane) {
    const seen = new Set();
    const words = shuffle(sItems(l).filter(it => !seen.has(it.w) && seen.add(it.w))).slice(0, 15);
    let i = 0, right = 0, answered = false;
    const draw = () => {
      if (i >= words.length) {
        sSave(l.id, 'dict', right / words.length);
        pane.innerHTML = `<div class="drill summary"><p class="kicker" lang="fr">Bilan</p><div class="score">${right} / ${words.length}</div>
          <div class="drill-actions" style="justify-content:center"><button class="btn" id="again">${bi('再来一轮', 'Another round')}</button></div></div>`;
        $('#again', pane).onclick = () => sDict(l, pane);
        return;
      }
      const it = words[i]; answered = false;
      pane.innerHTML = `<div class="drill"><div class="count">${i + 1} / ${words.length}</div><div class="bar"><i style="width:${i / words.length * 100}%"></i></div>
        <div class="prompt">${playBtn(it.w, 'big')}<div class="ppos">${bi('听写这个词', 'Write the word you hear')}</div></div>
        <input class="answer-in" id="ans" lang="fr" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="${bi('用法语写…', 'Write in French…')}">
        <div class="drill-actions"><button class="btn ghost small" id="skip">${bi('不会，看答案', 'Show answer')}</button><span class="spacer"></span><span class="kbd"><kbd>Enter</kbd> ${bi('检查 / 下一个', 'check / next')}</span></div>
        <div id="fb"></div></div>`;
      const inp = $('#ans', pane); inp.focus();
      setTimeout(() => TTS.say(it.w), 250);
      const check = give => {
        if (!inp.value.trim() && !give) return;
        answered = true;
        const r = give ? 'bad' : checkWord(inp.value, it.w), ok = r === 'ok';
        if (ok) { right++; XP.gain(2, bi('听写正确', 'Dictation right')); } else if (!give) ERRS.typed(it.w, inp.value);
        $('#fb', pane).innerHTML = `<div class="feedback ${ok ? 'ok' : r === 'accent' ? 'accent' : 'bad'}"><span class="lab">${ok ? bi('完全正确', 'Perfect') : r === 'accent' ? bi('差一点：注意重音', 'Almost — check the accents') : bi('正确答案', 'Answer')}</span>
          <div class="ans">${playBtn(it.w)} <span lang="fr">${esc(it.w)}</span> <span class="kbd">${G(it)}</span></div></div>`;
      };
      inp.onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); answered ? (i++, draw()) : check(false); } };
      $('#skip', pane).onclick = () => check(true);
    };
    draw();
  }

  /* ---------- error analysis: what kind of spelling mix-up each mistake is ---------- */
  const EXTRA_CLS = {
    accent: { t: '重音符号（é è ê à ç…）', te: 'Accents (é è ê à ç…)', lesson: 'accents' },
    muettes: { t: '漏写不发音的字母', te: 'Missing silent letters', lesson: 'muettes' },
    double: { t: '双写辅音（ll / ss / tt / nn…）', te: 'Double consonants (ll / ss / tt / nn…)', lesson: null },
    h: { t: '漏写 h', te: 'Missing h', lesson: 'h' },
    e_muet: { t: '漏写或多写 e', te: 'Missing or extra e', lesson: 'e_muet' },
    other: { t: '其他拼写错误', te: 'Other spelling mistakes', lesson: null },
  };
  const closest = (fr, val) => (forms(fr).accept.filter(x => !/[(/]/.test(x)).length ? forms(fr).accept.filter(x => !/[(/]/.test(x)) : forms(fr).accept).slice().sort((a, b) => levAny(norm(a), norm(val)) - levAny(norm(b), norm(val)))[0];
  const ERRS = {
    all() { return store.get('errs', []); },
    push(e) { const a = this.all(); a.push({ ...e, d: dayStr() }); store.set('errs', a.slice(-400)); },
    typed(correct, typed) {
      const c = norm(correct), t = norm(typed);
      if (!t || c === t || t.length > c.length + 6) return;
      this.push({ c: correct, t: typed.trim() });
    },
    quiz(lesson, word, chosen) { this.push({ q: lesson, c: word, t: chosen }); },
    // pair up missing and extra words of a sentence attempt and log the close ones
    sentence(target, input) {
      const d = diff(target, input), T = tokens(target);
      const miss = T.filter((_, k) => d.st[k] === 'miss');
      d.extra.forEach((x, k) => { const m = miss[k]; if (m && levAny(loose(m), loose(x)) <= Math.max(2, m.length / 2)) this.typed(m, x); });
    },
  };
  function levAny(a, b) {
    const d = Array.from({ length: b.length + 1 }, (_, i) => i);
    for (let i = 1; i <= a.length; i++) { let p = d[0]; d[0] = i; for (let j = 1; j <= b.length; j++) { const t = d[j]; d[j] = Math.min(d[j] + 1, d[j - 1] + 1, p + (a[i - 1] === b[j - 1] ? 0 : 1)); p = t; } }
    return d[b.length];
  }
  let RULES = null;
  function rules() {
    if (RULES) return RULES;
    RULES = [];
    for (const c of window.CONFUSIONS || []) {
      const add = (x, y) => { if (x !== y) RULES.push([x, y, c.id]); };
      if (c.group) for (const x of c.group) for (const y of c.group) add(x, y);
      if (c.a) for (const x of c.a) for (const y of c.b) { add(x, y); add(y, x); }
      if (c.pairs) for (const [x, y] of c.pairs) { add(x, y); add(y, x); }
    }
    return RULES;
  }
  function edits(s) {
    const out = [];
    for (const [x, y, id] of rules()) {
      let p = s.indexOf(x);
      while (p >= 0) { out.push([s.slice(0, p) + y + s.slice(p + x.length), id]); p = s.indexOf(x, p + 1); }
    }
    const m = s.match(/(ent|es|[estdxzp])$/);
    if (m) out.push([s.slice(0, -m[0].length), 'muettes']);
    if (s.startsWith('h')) out.push([s.slice(1), 'h']);
    for (let p = 0; p < s.length; p++) {
      if (s[p] === s[p + 1] && /[bcdfglmnprst]/.test(s[p])) out.push([s.slice(0, p) + s.slice(p + 1), 'double']);
      if (/[bcdfglmnprst]/.test(s[p]) && s[p] !== s[p + 1] && s[p] !== s[p - 1] && p > 0) out.push([s.slice(0, p) + s[p] + s.slice(p), 'double']);
      if (s[p] === 'e') out.push([s.slice(0, p) + s.slice(p + 1), 'e_muet']);
    }
    return out;
  }
  const DETECT = {};
  function detect(correct, typed) {
    const c = norm(correct), t = norm(typed), key = c + '|' + t;
    if (DETECT[key]) return DETECT[key];
    let res = [];
    if (c === t) res = [];
    else if (strip(c) === strip(t)) res = ['accent'];
    else {
      const goal = s => s === t || strip(s) === strip(t);
      const accentToo = s => s !== t ? ['accent'] : [];
      const d0 = levAny(c, t);
      let found = null;
      for (const [s1, id1] of edits(c)) {
        if (goal(s1)) { found = [id1, ...accentToo(s1)]; break; }
      }
      if (!found) {
        outer: for (const [s1, id1] of edits(c)) {
          if (levAny(s1, t) >= d0) continue;
          for (const [s2, id2] of edits(s1)) if (goal(s2)) { found = [...new Set([id1, id2, ...accentToo(s2)])]; break outer; }
        }
      }
      res = found || ['other'];
    }
    return (DETECT[key] = res);
  }
  function analyseErrors() {
    const conf = Object.fromEntries((window.CONFUSIONS || []).map(c => [c.id, c]));
    const byQuizLesson = {};
    const tally = {};
    const add = (id, ex) => { const e = tally[id] = tally[id] || { id, n: 0, ex: [] }; e.n++; if (ex && e.ex.length < 5 && !e.ex.some(x => x.c === ex.c && x.t === ex.t)) e.ex.push(ex); };
    for (const e of ERRS.all()) {
      if (e.q) {
        const c = (window.CONFUSIONS || []).find(x => x.lesson === e.q);
        add(c ? c.id : 'q:' + e.q, { c: e.c, t: e.t, quiz: true });
        byQuizLesson[e.q] = true;
      } else detect(e.c, e.t).forEach(id => add(id, { c: e.c, t: e.t }));
    }
    return Object.values(tally).map(x => {
      let meta;
      if (x.id.startsWith('q:')) { const l = sFind(x.id.slice(2)); meta = { t: l ? l.t : x.id, te: l ? l.te : x.id, lesson: l && l.id }; }
      else meta = conf[x.id] || EXTRA_CLS[x.id] || EXTRA_CLS.other;
      return { ...x, ...meta };
    }).sort((a, b) => (a.id === 'other') - (b.id === 'other') || b.n - a.n);
  }
  function errorAnalysisHTML() {
    const rows = analyseErrors();
    if (!rows.length) return `<section class="unit"><div class="unit-title"><h2>${bi('易错分析', 'Mistake patterns')}</h2></div>
      <p class="hint-text" style="margin:0">${bi('写错的单词会在这里按类型统计，比如「au 写成 eu」，并链接到《法语发音》里对应的练习。多做几次默写就会出现。', 'Your misspellings will be grouped here by type — e.g. "au written as eu" — with a link to the matching lesson in the pronunciation book. Do a few dictations and they will appear.')}</p></section>`;
    const max = rows[0].n, open = localStorage.getItem('nh:eaFold') !== '1';
    return `<section class="unit"><details class="ea-fold" ${open ? 'open' : ''} ontoggle="try{localStorage.setItem('nh:eaFold',this.open?'0':'1')}catch(e){}">
      <summary class="unit-title"><h2>${bi('易错分析', 'Mistake patterns')}</h2><span>${bi('你最常把什么写成什么', 'What you most often write instead')}</span><i class="ea-chev" aria-hidden="true">▾</i></summary>
      <div class="err-ana">${rows.map(r => `<div class="ea-row">
        <div class="ea-head"><b lang="fr">${tl(r)}</b><span class="ea-n">${r.n} ${bi('次', 'times')}</span>
          ${r.lesson ? `<a class="btn ghost small" href="#/sons/${r.lesson}/quiz">${bi('去练习 ›', 'Practise ›')}</a>` : ''}</div>
        <div class="ea-bar"><i style="width:${Math.max(6, r.n / max * 100)}%"></i></div>
        <div class="ea-ex">${r.ex.map(x => x.quiz ? `<span lang="fr">${esc(x.c)} <small>${bi('选了', 'chose')} ${esc(x.t)}</small></span>`
          : `<span lang="fr"><s>${esc(x.t)}</s> → ${esc(x.c)}</span>`).join('')}</div>
      </div>`).join('')}</div></details></section>`;
  }

  /* ---------- tools: quick lookup (overlay) and translation ---------- */
  let LOOKUP = null;
  function lookupIndex() {
    if (LOOKUP) return LOOKUP;
    const items = [], forms2inf = {};
    for (const b of BOOKS) for (const u of b.units) for (const l of u.lecons) for (const v of l.vocab)
      items.push({ fr: v.fr, zh: v.zh, en: v.en, pos: v.pos, src: 'book', book: b.id, n: l.n, v });
    if (window.SOUNDS) for (const l of sLessons()) for (const it of sItems(l)) if (!items.some(x => x.fr === it.w)) items.push({ fr: it.w, zh: it.zh, en: it.en, src: 'sons', lesson: l.id });
    const D = window.VERBDICT;
    if (D) for (const k of D.list()) {
      const c = D.get(k);
      if (!items.some(x => x.fr.replace(/\s*\((se|s')\)/, '') === c.base && x.src === 'book')) items.push({ fr: k, zh: c.zh, en: c.en, pos: 'v.', src: 'verb', verb: k });
      for (const t of ['present', 'imparfait', 'futur']) c.forms[t].forEach((f, i) => { const key = loose(f); (forms2inf[key] = forms2inf[key] || []).push({ verb: k, t, i }); });
      (forms2inf[loose(c.pp)] = forms2inf[loose(c.pp)] || []).push({ verb: k, t: 'pp' });
    }
    items.forEach(x => { x.kfr = loose(x.fr.replace(/[¹²³*]/g, '')); x.kmean = loose((x.zh || '') + ' ' + (x.en || '')); });
    return (LOOKUP = { items, forms2inf });
  }
  const TENSE_NAME = { present: ['现在时', 'present'], imparfait: ['未完成过去时', 'imperfect'], futur: ['简单将来时', 'future'], pp: ['过去分词', 'past participle'] };
  const PERSON = ['je', 'tu', 'il/elle', 'nous', 'vous', 'ils/elles'];
  function lookupHTML(q) {
    const raw = q.trim(); if (!raw) return `<p class="hint-text" style="margin:8px 2px">${bi('输入法语、中文或英文都可以，比如 chapeau、帽子、hat、prennent。', 'Type French, Chinese or English — e.g. chapeau, 帽子, hat, prennent.')}</p>`;
    const k = loose(raw), { items, forms2inf } = lookupIndex();
    const word = new RegExp('(^|[^a-z])' + k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '([^a-z]|$)');
    const score = x => x.kfr === k ? 0 : x.kfr.startsWith(k) ? 1 : word.test(x.kmean) ? 1.5 : x.kfr.includes(k) ? 2 : x.kmean.includes(k) ? 3 : 9;
    const hits = items.map(x => [score(x), x]).filter(([s]) => s < 9).sort((a, b) => a[0] - b[0] || a[1].fr.length - b[1].fr.length).slice(0, 12).map(([, x]) => x);
    const conj = (forms2inf[k] || []).filter((c, i, a) => a.findIndex(y => y.verb === c.verb && y.t === c.t) === i);
    let h = '';
    if (conj.length) h += `<div class="lk-conj">${conj.map(c => `<a href="#/verbes/${encodeURIComponent(c.verb)}" class="lk-conj-row"><span lang="fr">${esc(raw)}</span> → <b lang="fr">${esc(c.verb)}</b>
      <small>${bi(TENSE_NAME[c.t][0], TENSE_NAME[c.t][1])}${c.i != null ? ' · ' + PERSON[c.i] : ''}</small></a>`).join('')}</div>`;
    h += hits.map(x => {
      const tag = x.src === 'book' ? `<a class="v-tag book" href="#/${x.book}/${x.n}/vocab">L${x.n}</a>` : x.src === 'sons' ? `<a class="v-tag" href="#/sons/${x.lesson}">${bi('发音书', 'Sounds')}</a>` : `<a class="v-tag" href="#/verbes/${encodeURIComponent(x.verb)}">${bi('动词词典', 'Verbs')}</a>`;
      const tip = x.v ? wordTip(x.n, x.v) : '';
      const verbLink = x.pos && x.pos.startsWith('v') && window.VERBDICT ? (() => { const m = x.fr.match(/^(\S+)\s*\((se|s')\)$/); const key = m ? (/^[aeiouyhâéèêî]/i.test(m[1]) ? "s'" : 'se ') + m[1] : x.fr; return window.VERBDICT.get(key) && x.src !== 'verb' ? `<a class="v-tag" href="#/verbes/${encodeURIComponent(key)}">${bi('变位', 'conjugate')}</a>` : ''; })() : '';
      return `<div class="lk-item"><div class="lk-head">${playBtn(forms(x.fr).say)}<b lang="fr">${esc(x.fr)}</b>${favBtn({ fr: x.fr, zh: x.zh, en: x.en, pos: x.pos, from: x.src === 'book' ? 'L' + x.n : x.src })}${x.pos ? `<span class="pos">${esc(x.pos)}</span>` : ''}${tag}${verbLink}</div>
        <div class="lk-mean">${G(x)}</div>${tip ? `<div class="lk-tip">${tip}</div>` : ''}</div>`;
    }).join('');
    if (!hits.length && !conj.length) h += `<p class="hint-text" style="margin:8px 2px">${bi('网站的词库里没有找到。', 'Not in the site\'s word lists.')}</p>`;
    h += `<div class="lk-more"><a href="#/tools/translate?q=${encodeURIComponent(raw)}" class="btn ghost small">${bi('翻译', 'Translate')} « ${esc(raw.slice(0, 20))} »</a>
      <a class="btn ghost small" target="_blank" rel="noopener" href="https://www.wordreference.com/fren/${encodeURIComponent(raw)}">WordReference ↗</a>
      <a class="btn ghost small" target="_blank" rel="noopener" href="https://www.larousse.fr/dictionnaires/francais/${encodeURIComponent(raw)}">Larousse ↗</a></div>`;
    return h;
  }
  function openLookup(q = '') {
    let ov = $('#lookup');
    if (!ov) {
      ov = document.createElement('div'); ov.id = 'lookup'; ov.className = 'lookup';
      ov.innerHTML = `<div class="lk-box" role="dialog" aria-modal="true"><div class="lk-bar">
          <input type="search" id="lk-in" lang="fr" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="${bi('随手查：法语 / 中文 / English', 'Look up: French / 中文 / English')}">
          <button class="btn ghost small" id="lk-x">${bi('关闭', 'Close')}</button></div><div id="lk-res"></div></div>`;
      document.body.appendChild(ov);
      const inp = $('#lk-in', ov), res = $('#lk-res', ov);
      inp.oninput = () => { res.innerHTML = lookupHTML(inp.value); };
      $('#lk-x', ov).onclick = () => ov.hidden = true;
      ov.addEventListener('click', e => { if (e.target === ov || e.target.closest('a[href^="#"]')) ov.hidden = true; });
    }
    ov.hidden = false;
    const inp = $('#lk-in', ov); inp.value = q; $('#lk-res', ov).innerHTML = lookupHTML(q);
    setTimeout(() => inp.focus(), 30);
  }
  document.addEventListener('keydown', e => {
    if (e.key === '/' && !(e.target.matches && e.target.matches('input, textarea, [contenteditable]'))) { e.preventDefault(); openLookup(); }
    if (e.key === 'Escape' && $('#lookup') && !$('#lookup').hidden) $('#lookup').hidden = true;
  });

  const LANGS = { fr: ['法语', 'French'], 'zh-CN': ['中文', 'Chinese'], en: ['英语', 'English'] };
  /* ---------- 生词本: my own word list, practised like a leçon ---------- */
  const MINE = {
    all() { return store.get('mywords', []); },
    has(fr) { return this.all().some(w => w.fr === fr); },
    add(w) { if (this.has(w.fr)) return; const a = this.all(); a.push({ fr: w.fr, zh: w.zh || '', en: w.en || '', pos: w.pos || '', from: w.from || '', added: dayStr() }); store.set('mywords', a); },
    remove(fr) { store.set('mywords', this.all().filter(w => w.fr !== fr)); },
    toggle(w) { this.has(w.fr) ? this.remove(w.fr) : this.add(w); return this.has(w.fr); },
  };
  const mineBook = () => {
    const lec = { n: 0, title: 'Mon carnet', zh: '生词本', vocab: MINE.all().map(w => ({ ...w, g: bi('我的生词', 'My words') })), text: [], cloze: null };
    return { book: { id: 'mine', title: bi('生词本', 'My words'), units: [{ n: 0, lecons: [lec] }] }, lecon: lec };
  };
  const leconName = n => n === 0 ? bi('生词本', 'My words') : 'Leçon ' + n;
  const favBtn = w => `<button class="fav ${MINE.has(w.fr) ? 'on' : ''}" data-fav="${esc(JSON.stringify({ fr: w.fr, zh: w.zh || '', en: w.en || '', pos: w.pos || '', from: w.from || '' }))}" title="${bi('收藏到生词本', 'Save to my words')}" aria-label="${bi('收藏到生词本', 'Save to my words')}">${MINE.has(w.fr) ? '★' : '☆'}</button>`;
  document.addEventListener('click', e => {
    const b = e.target.closest('[data-fav]');
    if (!b) return;
    e.stopPropagation(); e.preventDefault();
    const on = MINE.toggle(JSON.parse(b.dataset.fav));
    b.classList.toggle('on', on); b.textContent = on ? '★' : '☆';
    toast(on ? '★' : '☆', on ? bi('已加入生词本', 'Saved to my words') : bi('已从生词本移除', 'Removed from my words'));
  }, true);

  function viewMine(mode) {
    document.title = bi('生词本', 'My words') + ' · 你好法语';
    const words = MINE.all();
    main.innerHTML = `
      <header class="lecon-head"><p class="kicker" lang="fr">Mon carnet</p><h1>${bi('生词本', 'My words')}</h1>
        <div class="zh">${bi(`${words.length} 个词 · 在随手查里点 ☆ 收藏，或者在下面手动添加`, `${words.length} words · tap ☆ in Look up, or add one below`)}</div></header>
      <details class="mine-add" ${words.length ? '' : 'open'}><summary>${bi('＋ 手动添加一个词', '＋ Add a word yourself')}</summary>
        <div class="mine-form">
          <input id="mw-fr" lang="fr" class="typed-recite" placeholder="${bi('法语，例如 la montagne', 'French, e.g. la montagne')}" autocapitalize="off" spellcheck="false">
          <input id="mw-zh" class="typed-recite" placeholder="${bi('中文意思（可留空，点「自动翻译」）', 'Chinese meaning (optional — try Auto-translate)')}">
          <input id="mw-en" class="typed-recite" placeholder="${bi('英文意思（可留空）', 'English meaning (optional)')}">
          <div class="toolbar"><button class="btn" id="mw-add">${bi('加入生词本', 'Add')}</button><button class="btn ghost small" id="mw-tr">${bi('自动翻译', 'Auto-translate')}</button><span class="kbd" id="mw-msg"></span></div>
        </div></details>
      ${words.length ? `<details class="mine-add"><summary>${bi('管理生词', 'Manage words')}</summary><div class="mine-list">${words.map(w => `<div class="mine-row">${playBtn(forms(w.fr).say)}<b lang="fr">${esc(w.fr)}</b><span>${G(w)}</span>
          <button class="err-del" data-del="${esc(w.fr)}" title="${bi('删除', 'Delete')}">×</button></div>`).join('')}</div></details>` : ''}
      <section id="pane"></section>`;
    const msg = $('#mw-msg', main);
    $('#mw-tr', main).onclick = async () => {
      const fr = $('#mw-fr', main).value.trim(); if (!fr) return;
      msg.textContent = bi('翻译中…', 'Translating…');
      const get = async to => { try { const r = await fetch(`https://api.mymemory.translated.net/get?q=${encodeURIComponent(fr)}&langpair=fr|${to}`); const j = await r.json(); const d = document.createElement('div'); d.innerHTML = j.responseData.translatedText; return d.textContent.replace(/^[\s\-–—]+|[\s\-–—]+$/g, ''); } catch { return ''; } };
      const [zh, en] = await Promise.all([get('zh-CN'), get('en')]);
      if (zh && !$('#mw-zh', main).value) $('#mw-zh', main).value = zh;
      if (en && !$('#mw-en', main).value) $('#mw-en', main).value = en;
      msg.textContent = zh || en ? bi('看一下翻译对不对，再加入', 'Check the translation, then add') : bi('翻译服务连不上，请手动填写', 'Translation unavailable — please type it');
    };
    $('#mw-add', main).onclick = () => {
      const fr = $('#mw-fr', main).value.trim(); if (!fr) return;
      if (MINE.has(fr)) { msg.textContent = bi('已经在生词本里了', 'Already in your words'); return; }
      MINE.add({ fr, zh: $('#mw-zh', main).value.trim(), en: $('#mw-en', main).value.trim(), from: 'manual' });
      viewMine(mode);
    };
    $$('[data-del]', main).forEach(b => b.onclick = () => { if (confirm(tr('从生词本删除这个词？').replace(' · ', '\n'))) { MINE.remove(b.dataset.del); viewMine(mode); } });
    const pane = $('#pane');
    if (!words.length) { pane.innerHTML = `<p class="notice">${bi('生词本还是空的。在任何页面点放大镜查词，点结果旁边的 ☆ 就能收藏。', 'Your list is empty. Look a word up (magnifier at the top) and tap ☆ next to it.')}</p>`; return; }
    const { book, lecon } = mineBook();
    paneVocab({ book, lecon, pane, save: () => { } }, mode);
  }

  /* ---------- 朗读器: read any French text aloud, word by word, sentence by sentence ---------- */
  function readerTool(pane) {
    const text = store.get('readertext', '');
    pane.innerHTML = `
      <textarea id="rd-in" class="typed-recite" rows="5" lang="fr" placeholder="${bi('把任何法语贴在这里：歌词、新闻、老师发的材料……', 'Paste any French here: lyrics, news, class handouts…')}">${esc(text)}</textarea>
      <div class="toolbar">
        <button class="btn" id="rd-play">${ICON.play} ${bi('整段朗读', 'Read it all')}</button>
        <label class="kbd" style="display:flex;gap:6px;align-items:center"><input type="checkbox" id="rd-shadow" ${store.get('rdshadow', false) ? 'checked' : ''}> ${bi('跟读模式（每句后停下）', 'Shadowing (pause after each sentence)')}</label>
        <span class="spacer"></span>
        <label class="kbd" style="display:flex;gap:6px;align-items:center">${bi('语速', 'Speed')} <input type="range" id="rd-rate" min="0.5" max="1.2" step="0.05" value="${settings.rate}"> <b id="rd-rv">${settings.rate.toFixed(2)}</b></label>
      </div>
      <div id="rd-ctrl" class="toolbar" hidden><button class="btn small" id="rd-next">${bi('下一句 ▶', 'Next ▶')}</button><button class="btn ghost small" id="rd-again">${bi('再听一遍', 'Again')}</button><button class="btn ghost small" id="rd-stop">${bi('停止', 'Stop')}</button><span class="kbd">${bi('空格 = 下一句', 'Space = next')}</span></div>
      <div id="rd-text" class="rd-text"></div>
      <p class="kbd">${bi('点句子左边的 ▶ 单独听这一句；点任何一个词可以查它、收藏到生词本。', 'Tap ▶ beside a sentence to hear just that one; tap any word to look it up and save it.')}</p>`;
    const inp = $('#rd-in', pane), view = $('#rd-text', pane), ctrl = $('#rd-ctrl', pane);
    let sents = [], cur = -1, playing = false, token = 0;
    const render = () => {
      store.set('readertext', inp.value);
      sents = inp.value.replace(/\r/g, '').split(/(?<=[.!?…])\s+|\n+/).map(x => x.trim()).filter(Boolean);
      view.innerHTML = sents.map((s, k) => {
        let html = '', last = 0;
        for (const m of s.matchAll(TOKEN)) { html += esc(s.slice(last, m.index)) + `<span class="rw2" data-a="${m.index}" data-b="${m.index + m[0].length}">${esc(m[0])}</span>`; last = m.index + m[0].length; }
        return `<div class="rd-s" data-k="${k}"><button class="play rd-one" data-k="${k}" aria-label="${bi('朗读这一句', 'Read this sentence')}">${ICON.play}</button><span lang="fr">${html + esc(s.slice(last))}</span></div>`;
      }).join('');
    };
    const mark = (k, ci) => {
      $$('.rd-s', view).forEach(el => el.classList.toggle('cur', +el.dataset.k === k));
      $$('.rw2.on', view).forEach(el => el.classList.remove('on'));
      if (k < 0 || ci == null) return;
      const w = $$(`.rd-s[data-k="${k}"] .rw2`, view).find(el => ci >= +el.dataset.a && ci < +el.dataset.b);
      if (w) w.classList.add('on');
    };
    const sayOne = (k, then) => {
      const my = ++token;
      if (!TTS.ok) return;
      speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(sents[k].replace(/…/g, ',').replace(/[–—]/g, ' '));
      u.lang = 'fr-FR'; if (TTS.voice) u.voice = TTS.voice; u.rate = settings.rate; u.volume = settings.volume;
      u.onboundary = e => { if (my === token && e.name !== 'sentence') mark(k, e.charIndex); };
      u.onend = u.onerror = () => { if (my !== token) return; mark(k, null); then && then(); };
      cur = k; mark(k, 0);
      $(`.rd-s[data-k="${k}"]`, view)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      speechSynthesis.speak(u);
    };
    const stop = () => { token++; playing = false; TTS.stop(); mark(-1); ctrl.hidden = true; };
    const step = k => {
      if (!playing || k >= sents.length) { stop(); return; }
      sayOne(k, () => {
        if (!playing) return;
        if ($('#rd-shadow', pane).checked) { ctrl.hidden = false; cur = k; }
        else setTimeout(() => step(k + 1), 300);
      });
    };
    inp.oninput = render;
    render();
    $('#rd-play', pane).onclick = () => { render(); if (!sents.length) return; playing = true; step(0); };
    $('#rd-shadow', pane).onchange = e => store.set('rdshadow', e.target.checked);
    $('#rd-rate', pane).oninput = e => { settings.rate = +e.target.value; $('#rd-rv', pane).textContent = settings.rate.toFixed(2); saveSettings(); };
    $('#rd-next', pane).onclick = () => { ctrl.hidden = true; step(cur + 1); };
    $('#rd-again', pane).onclick = () => { sayOne(cur, () => { if (playing && $('#rd-shadow', pane).checked) ctrl.hidden = false; }); };
    $('#rd-stop', pane).onclick = stop;
    view.addEventListener('click', e => {
      const one = e.target.closest('.rd-one');
      if (one) { e.stopPropagation(); playing = false; ctrl.hidden = true; sayOne(+one.dataset.k); return; }
      const w = e.target.closest('.rw2');
      if (w) { TTS.say(w.textContent); openLookup(w.textContent.replace(/'$/, '')); }
    });
    const onKey = e => {
      if (!document.body.contains(pane) || e.target.matches && e.target.matches('input, textarea')) return;
      if (e.key === ' ' && !ctrl.hidden) { e.preventDefault(); ctrl.hidden = true; step(cur + 1); }
    };
    document.addEventListener('keydown', onKey);
    const prevC = cleanup; cleanup = () => { document.removeEventListener('keydown', onKey); stop(); prevC && prevC(); };
  }

  /* ---------- 数字时间: numbers, times, dates spelled out + listening practice ---------- */
  const halves = s => { const [zh, en] = String(s).split(' | '); return L() === 'en' ? (en || zh) : L() === 'zhen' && en ? `${zh}<span class="en-gloss" lang="en">${esc(en)}</span>` : zh; };
  function numbersTool(pane, q) {
    const N = window.FRNUM;
    const EX = ['97', '71', '80', '1998', '2026', '21:45', '9h15', '15/03', '1er', '21e', '2,50 €', '06 12 34 56 78', '3,14'];
    const KINDS = [['n100', bi('数字 0–99', 'Numbers 0–99')], ['n10k', bi('数字 100–9999', 'Numbers 100–9999')], ['year', bi('年份', 'Years')], ['time', bi('时间', 'Times')], ['date', bi('日期', 'Dates')], ['price', bi('价格', 'Prices')], ['phone', bi('电话号码', 'Phone numbers')]];
    pane.innerHTML = `
      <input id="nm-in" class="typed-recite" inputmode="text" autocomplete="off" placeholder="${bi('输入数字、时间、日期、价格……比如 97、21:45、15/03/2026、2,50 €', 'Type a number, time, date, price… e.g. 97, 21:45, 15/03/2026, 2,50 €')}" value="${esc(q || store.get('nmlast', '97'))}">
      <div class="chips" style="margin:8px 0 14px">${EX.map(x => `<button class="wchip nm-ex" data-x="${esc(x)}"><span>${esc(x)}</span></button>`).join('')}</div>
      <div id="nm-out"></div>
      <section class="unit" style="margin-top:30px"><div class="unit-title"><h2>${bi('听力练习', 'Listening practice')}</h2><span>${bi('听法语，写出数字', 'Hear it in French, write the digits')}</span></div>
        <div class="modes">${KINDS.map(([k, t]) => `<button class="mode" data-nk="${k}" aria-pressed="${k === store.get('nmkind', 'n100')}">${t}</button>`).join('')}</div>
        <div id="nm-quiz"></div></section>`;
    const inp = $('#nm-in', pane), out = $('#nm-out', pane);
    const show = () => {
      store.set('nmlast', inp.value);
      const res = N.read(inp.value);
      out.innerHTML = !inp.value.trim() ? '' : !res.length ? `<p class="notice">${bi('没认出来。支持：整数、小数（3,14）、时间（21:45 或 9h15）、日期（15/03/2026）、序数（1er、21e）、价格（2,50 €）、电话（06 12 34 56 78）。', 'Not recognised. Try: whole numbers, decimals (3,14), times (21:45 or 9h15), dates (15/03/2026), ordinals (1er, 21e), prices (2,50 €), phone numbers (06 12 34 56 78).')}</p>`
        : res.map(r => `<div class="nm-card"><span class="lab">${bi(r.label, r.labelEn)}</span>
          <div class="nm-fr">${playBtn(r.fr)}<span lang="fr">${esc(r.fr)}</span></div>
          ${(r.logic || []).map(x => `<div class="nm-logic">${halves(x)}</div>`).join('')}
          ${r.note ? `<div class="nm-note">${halves(r.note)}</div>` : ''}</div>`).join('');
    };
    inp.oninput = show;
    inp.onkeydown = e => { if (e.key === 'Enter') { const r = N.read(inp.value); if (r[0]) TTS.say(r[0].fr); } };
    $$('.nm-ex', pane).forEach(b => b.onclick = () => { inp.value = b.dataset.x; show(); const r = N.read(inp.value); if (r[0]) TTS.say(r[0].fr); });
    show();
    const quiz = kind => {
      store.set('nmkind', kind);
      $$('[data-nk]', pane).forEach(b => b.setAttribute('aria-pressed', b.dataset.nk === kind));
      const box = $('#nm-quiz', pane);
      const items = Array.from({ length: 10 }, () => N.random(kind));
      let i = 0, right = 0, answered = false;
      const canon = s => s.replace(/\s/g, '').replace(/[h.]/gi, m => m === '.' ? ',' : ':').replace(/€|euros?/gi, '').replace(/^0(\d):/, '$1:').replace(/,00$/, '').replace(/\/0(\d)/, '/$1').replace(/^0(\d)\//, '$1/');
      const draw = () => {
        if (i >= items.length) {
          box.innerHTML = `<div class="drill summary"><div class="score">${right} / ${items.length}</div>
            <div class="drill-actions" style="justify-content:center"><button class="btn" id="nm-again">${bi('再来 10 题', '10 more')}</button></div></div>`;
          $('#nm-again', box).onclick = () => quiz(kind);
          return;
        }
        const it = items[i]; answered = false;
        box.innerHTML = `<div class="drill"><div class="count">${i + 1} / ${items.length}</div><div class="bar"><i style="width:${i / items.length * 100}%"></i></div>
          <div class="prompt">${playBtn(it.fr, 'big')}<div class="ppos">${bi('写出你听到的', 'Write what you hear')} · ${kind === 'time' ? '21:45' : kind === 'date' ? '15/3' : kind === 'price' ? '2,50' : kind === 'phone' ? '0612345678' : '97'}</div></div>
          <input class="answer-in" id="nm-a" inputmode="${kind === 'time' || kind === 'date' ? 'text' : 'decimal'}" autocomplete="off" style="text-align:center;font-size:28px">
          <div class="drill-actions"><button class="btn ghost small" id="nm-skip">${bi('看答案', 'Show answer')}</button><span class="spacer"></span><span class="kbd"><kbd>Enter</kbd> ${bi('检查 / 下一题', 'check / next')}</span></div>
          <div id="nm-fb"></div></div>`;
        const a = $('#nm-a', box); a.focus();
        setTimeout(() => TTS.say(it.fr), 250);
        const check = give => {
          if (!a.value.trim() && !give) return;
          answered = true;
          const ok = !give && canon(a.value) === canon(it.answer);
          if (ok) { right++; XP.gain(1, bi('数字听对了', 'Number right')); }
          $('#nm-fb', box).innerHTML = `<div class="feedback ${ok ? 'ok' : 'bad'}"><span class="lab">${ok ? bi('对了', 'Right') : bi('正确答案', 'Answer')}</span>
            <div class="ans">${playBtn(it.fr)} <b>${esc(it.answer)}</b> <span lang="fr" class="kbd">${esc(it.fr)}</span></div></div>`;
        };
        a.onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); answered ? (i++, draw()) : check(false); } };
        $('#nm-skip', box).onclick = () => check(true);
      };
      draw();
    };
    $$('[data-nk]', pane).forEach(b => b.onclick = () => quiz(b.dataset.nk));
    quiz(store.get('nmkind', 'n100'));
  }

  /* ---------- 法语日记: a small French journal with hints and a checker ---------- */
  const JR = {
    all() { return store.get('journal', {}); },
    get(d) { return this.all()[d] || null; },
    put(d, e) { const a = this.all(); a[d] = { ...e, updated: new Date().toISOString() }; store.set('journal', a); },
  };
  const P2 = a => Array.isArray(a) ? (L() === 'en' ? a[1] : L() === 'zhen' ? `${a[0]}<span class="en-gloss" lang="en">${esc(a[1])}</span>` : a[0]) : a;
  const promptOf = id => (window.JOURNAL_PROMPTS || []).find(p => p.id === id);
  function todaysPrompt() {
    const ps = window.JOURNAL_PROMPTS || [], d = new Date();
    const n = Math.floor((d - new Date(d.getFullYear(), 0, 0)) / 864e5);
    return ps[n % (ps.length - 1)];
  }
  // words the site knows, to flag possible misspellings
  let KNOWN = null;
  function knownWords() {
    if (KNOWN) return KNOWN;
    KNOWN = new Set();
    const add = w => tokens(w).forEach(t => KNOWN.add(loose(t).replace(/'$/, '')));
    const { items, forms2inf } = lookupIndex();
    items.forEach(x => { add(x.fr.replace(/\(.*?\)/g, ' ')); forms(x.fr).accept.forEach(add); });
    Object.keys(forms2inf).forEach(k => KNOWN.add(k));
    for (const b of BOOKS) for (const u of b.units) for (const l of u.lecons) l.text.forEach(r => add(r.fr || r.h || ''));
    ('le la les l un une des du de d au aux à a et ou mais donc je j tu il elle on nous vous ils elles me m te t se s ce c ces cet cette mon ma mes ton ta tes son sa ses notre nos votre vos leur leurs '
      + 'qui que qu quoi où quand comment pourquoi combien ne n pas plus jamais rien très bien aussi encore déjà toujours souvent parfois avec sans pour par sur sous dans en chez entre vers après avant '
      + 'oui non si y est suis es sommes êtes sont ai as avons avez ont vais vas va allons allez vont fais fait faisons faites font aujourd hui demain hier matin soir midi ici là beaucoup peu trop '
      + 'il fait beau froid chaud pleut parce que alors puis enfin tout tous toute toutes autre même cela ça voilà voici bonjour salut merci').split(' ').forEach(w => KNOWN.add(loose(w)));
    return KNOWN;
  }
  const RULES_J = [
    [/\bje (ai|aime|habite|appelle|arrive|écoute|étudie|entre|adore|y)\b/gi, m => m.replace(/^je /i, "j'"), ['元音前 je 要省略成 j\'', 'je becomes j\' before a vowel']],
    [/\b(le|la) ([aeiouéèêh]\w*)/gi, m => m.replace(/^(le|la) /i, "l'"), ['元音前 le / la 要省略成 l\'（嘘音 h 例外）', 'le / la become l\' before a vowel (except aspirated h)']],
    [/\bde le\b/gi, () => 'du', ['de + le 要合成 du', 'de + le must become du']],
    [/\bde les\b/gi, () => 'des', ['de + les 要合成 des', 'de + les must become des']],
    [/(?<!\p{L})à le(?!\p{L})/giu, () => 'au', ['à + le 要合成 au', 'à + le must become au']],
    [/(?<!\p{L})à les(?!\p{L})/giu, () => 'aux', ['à + les 要合成 aux', 'à + les must become aux']],
    [/\bsi il(s?)\b/gi, m => "s'il" + (m.endsWith('s') ? 's' : ''), ['si + il 要写成 s\'il', 'si + il must be written s\'il']],
    [/\b(ne|me|te|se|de|que|ce) ([aeiouéèêh]\w*)/gi, m => m.replace(/^(\w)e /i, "$1'"), ['元音前 ne / me / te / se / de / que 要省略', 'ne / me / te / se / de / que drop their e before a vowel']],
    [/\bje suis (\d+) ans\b/gi, m => m.replace(/je suis/i, "j'ai"), ['年龄用 avoir：j\'ai … ans', 'Age takes avoir: j\'ai … ans']],
    [/\bje ne (\w+)(?! pas| plus| jamais| rien)\b/gi, null, ['否定要两部分：ne … pas', 'Negation has two parts: ne … pas']],
  ];
  function checkJournal(text) {
    const out = [];
    for (const [re, fix, why] of RULES_J) for (const m of text.matchAll(re)) {
      if (!fix && /pas|plus|jamais|rien/.test(text.slice(m.index, m.index + m[0].length + 20))) continue;
      out.push({ kind: 'rule', at: m[0], fix: fix ? fix(m[0]) : null, why });
    }
    const K = knownWords(), seen = new Set();
    const first = new Set([...text.matchAll(/(^|[.!?]\s+)(\p{L}+)/gu)].map(m => m[2]));
    for (const t of tokens(text)) {
      const k = loose(t).replace(/'$/, '');
      if (!k || /\d/.test(k) || K.has(k) || seen.has(k) || k.length < 2) continue;
      if (/^\p{Lu}/u.test(t) && !first.has(t)) continue;           // names
      if (K.has(k.replace(/s$/, '')) || K.has(k.replace(/es$/, '')) || K.has(k.replace(/e$/, '')) || K.has(k.replace(/(ent|ons|ez)$/, 'er'))) continue;
      seen.add(k);
      out.push({ kind: 'word', at: t });
    }
    return out;
  }
  async function mymemory(text, from, to) {
    const r = await fetch(`https://api.mymemory.translated.net/get?q=${encodeURIComponent(text.slice(0, 480))}&langpair=${from}|${to}`);
    const j = await r.json(); const d = document.createElement('div'); d.innerHTML = j.responseData.translatedText; return d.textContent;
  }

  function viewJournal(day) {
    const today = dayStr(), d = day || today, entry = JR.get(d) || {};
    let pid = entry.prompt || (d === today ? store.get('jprompt:' + today, '') : '') || todaysPrompt().id;
    const p = () => promptOf(pid) || todaysPrompt();
    document.title = bi('法语日记', 'Journal') + ' · ' + d;
    const all = JR.all(), days = Object.keys(all).sort().reverse();
    const words = s => tokens(s || '').length;
    main.innerHTML = `
      <p class="kicker" lang="fr">Mon journal</p><h1>${bi('法语日记', 'French journal')}</h1>
      <div class="journal">
        <div class="j-page">
          <div class="j-date"><span lang="fr">${esc(d)}</span>${d !== today ? `<a href="#/journal" class="btn ghost small">${bi('回到今天', 'Today')}</a>` : ''}</div>
          <div class="j-prompt"><b lang="fr">${esc(p().fr)}</b><span>${P2(p().t)}</span>
            <select id="j-pick">${(window.JOURNAL_PROMPTS || []).map(x => `<option value="${x.id}" ${x.id === p().id ? 'selected' : ''}>${esc(x.fr)}</option>`).join('')}</select></div>
          <textarea id="j-text" lang="fr" spellcheck="false" autocapitalize="sentences" placeholder="${bi('用法语写几句……点右边的句子开头可以直接插入。', 'Write a few sentences in French… tap a starter on the right to insert it.')}">${esc(entry.text || '')}</textarea>
          <div class="toolbar"><span class="kbd" id="j-count"></span><span class="spacer"></span>
            <button class="btn ghost small" id="j-read">${ICON.play} ${bi('朗读', 'Read aloud')}</button>
            <button class="btn ghost small" id="j-back">${bi('回译成中文', 'Translate back')}</button>
            <button class="btn ghost small" id="j-pdf">PDF</button>
            <button class="btn" id="j-check">${bi('检查', 'Check')}</button></div>
          <div id="j-res"></div>
        </div>
        <aside class="j-hints">
          <section><h3>${bi('句子开头', 'Starters')}</h3><div class="chips" id="j-starters">${p().starters.map(s => `<button class="wchip j-ins" data-ins="${esc(s.replace(/…/g, '').trim())}"><span lang="fr">${esc(s)}</span></button>`).join('')}</div></section>
          ${p().lecons.length ? `<section><h3>${bi('可以用的词', 'Useful words')} <small>L${p().lecons.join(', L')}</small></h3><div class="chips j-words">${p().lecons.flatMap(n => (findLecon(BOOKS[0], n) || { lecon: { vocab: [] } }).lecon.vocab).filter(v => !/^\p{Lu}/u.test(v.fr)).slice(0, 36).map(v => `<button class="wchip j-ins" data-ins="${esc(forms(v.fr).accept.filter(x => !/[(/]/.test(x))[0] || v.fr)}" title="${esc(v.zh)}"><span lang="fr">${esc(v.fr)}</span><small>${G(v)}</small></button>`).join('')}</div></section>` : ''}
          <section><h3>${bi('语法提示', 'Grammar tip')}</h3><p class="j-tip">${P2(p().tip)}</p></section>
          <section><details><summary>${bi('看一段例文', 'See an example')}</summary><p lang="fr" class="j-ex">${esc(p().example)} ${playBtn(p().example)}</p></details></section>
          <section><h3>${bi('怎么说？', 'How do I say…?')}</h3><div class="j-how"><input id="j-q" class="typed-recite" placeholder="${bi('输入中文或英文', 'Chinese or English')}"><button class="btn small" id="j-qgo">→ FR</button></div><div id="j-qres" class="j-qres"></div></section>
        </aside>
      </div>
      ${days.length ? `<section class="unit"><div class="unit-title"><h2>${bi('以前的日记', 'Past entries')}</h2><span>${days.length}</span></div>
        <div class="j-list">${days.map(k => `<a href="#/journal/${k}" class="j-item ${k === d ? 'on' : ''}"><b>${k}</b><span lang="fr">${esc((promptOf(all[k].prompt) || {}).fr || '')}</span><small>${words(all[k].text)} ${bi('词', 'words')}</small></a>`).join('')}</div></section>` : ''}`;
    const ta = $('#j-text', main), count = $('#j-count', main), res = $('#j-res', main);
    const save = () => {
      JR.put(d, { prompt: p().id, text: ta.value });
      const n = words(ta.value);
      count.textContent = bi(`${n} 个词`, `${n} words`) + (n >= 20 ? ' ✓' : bi(' · 写满 20 个词算一篇', ' · 20 words make an entry'));
      if (n >= 20 && d === today && !store.get('jxp:' + today)) { store.set('jxp:' + today, 1); XP.gain(10, bi('写了一篇日记', 'Journal entry')); }
    };
    let t; ta.oninput = () => { clearTimeout(t); t = setTimeout(save, 500); };
    save();
    $('#j-pick', main).onchange = e => { pid = e.target.value; if (d === today) store.set('jprompt:' + today, pid); JR.put(d, { prompt: pid, text: ta.value }); viewJournal(day); };
    $('.journal', main).addEventListener('click', e => {
      const b = e.target.closest('.j-ins'); if (!b) return;
      const s = b.dataset.ins, pos = ta.selectionStart ?? ta.value.length, before = ta.value.slice(0, pos), after = ta.value.slice(pos);
      const sep = before && !/\s$/.test(before) ? ' ' : '';
      ta.value = before + sep + s + (/[.!?]$/.test(s) ? ' ' : ' ') + after;
      ta.focus(); ta.selectionStart = ta.selectionEnd = (before + sep + s + ' ').length; save();
      TTS.say(s);
    });
    $('#j-pdf', main).onclick = async () => {
      const el = document.createElement('div'); el.className = 'pdf-render j-pdf';
      el.innerHTML = `<p class="j-pdf-date">${esc(d)}</p><h1>${esc(p().fr)}</h1><div class="j-pdf-text">${esc(ta.value).replace(/\n/g, '<br>')}</div><p class="j-pdf-foot">Mon journal · ${esc(words(ta.value))} mots</p>`;
      await savePdf(el.outerHTML, `journal-${d}.pdf`, { margin: 16 });
    };
    $('#j-read', main).onclick = () => { if (ta.value.trim()) speakSeq(ta.value.split(/(?<=[.!?])\s+/).filter(Boolean), () => { }); };
    $('#j-check', main).onclick = () => {
      const found = checkJournal(ta.value);
      res.innerHTML = !ta.value.trim() ? '' : !found.length ? `<div class="feedback ok"><span class="lab">${bi('没发现常见错误', 'No common mistakes found')}</span>${bi('（只能检查拼写和几种常见语法；意思对不对可以点「回译成中文」看看）', '(only spelling and a few common rules are checked; use "Translate back" to see if it says what you mean)')}</div>`
        : `<div class="feedback accent"><span class="lab">${bi('可以再看看这些地方', 'Have another look at these')}</span>
          <ul class="j-issues">${found.map(f => f.kind === 'rule'
            ? `<li><s lang="fr">${esc(f.at)}</s>${f.fix ? ` → <b lang="fr">${esc(f.fix)}</b>` : ''} <span>${P2(f.why)}</span></li>`
            : `<li><b lang="fr">${esc(f.at)}</b> <span>${bi('网站词库里没有这个词，检查一下拼写？', 'Not in the site\'s word lists — check the spelling?')}</span> <a href="#" data-look="${esc(f.at)}">${bi('查一查', 'Look up')}</a></li>`).join('')}</ul></div>`;
      $$('[data-look]', res).forEach(a => a.onclick = e => { e.preventDefault(); openLookup(a.dataset.look); });
    };
    $('#j-back', main).onclick = async () => {
      if (!ta.value.trim()) return;
      res.innerHTML = `<p class="kbd">${bi('翻译中…', 'Translating…')}</p>`;
      try { const zh = await mymemory(ta.value, 'fr', L() === 'en' ? 'en' : 'zh-CN'); res.innerHTML = `<div class="feedback ok"><span class="lab">${bi('机器回译（看看意思是不是你想说的）', 'Machine back-translation (does it say what you meant?)')}</span><div class="j-backtext">${esc(zh)}</div></div>`; }
      catch { res.innerHTML = `<p class="notice">${bi('翻译服务连不上，稍后再试。', 'Translation service unavailable, try later.')}</p>`; }
    };
    const qgo = async () => {
      const q = $('#j-q', main).value.trim(); if (!q) return;
      const out = $('#j-qres', main); out.textContent = bi('翻译中…', 'Translating…');
      try { const fr = await mymemory(q, /[㐀-鿿]/.test(q) ? 'zh-CN' : 'en', 'fr'); out.innerHTML = `${playBtn(fr)} <span lang="fr">${esc(fr)}</span> <button class="btn ghost small j-ins" data-ins="${esc(fr)}">${bi('插入', 'Insert')}</button>`; }
      catch { out.textContent = bi('翻译服务连不上', 'Translation unavailable'); }
    };
    $('#j-qgo', main).onclick = qgo;
    $('#j-q', main).onkeydown = e => { if (e.key === 'Enter') qgo(); };
  }

  function viewTools(tab, q) {
    document.title = bi('工具', 'Tools') + ' · 你好法语';
    const pair = store.get('trpair', 'fr|zh-CN');
    main.innerHTML = `
      <p class="kicker" lang="fr">Outils</p><h1 style="font-size:44px">${bi('工具', 'Tools')}</h1>
      <nav class="tabs" role="tablist">
        <button class="tab" data-tt="lookup" aria-selected="${!['translate', 'reader', 'numbers'].includes(tab)}"><b>1</b>${bi('随手查', 'Look up')}</button>
        <button class="tab" data-tt="translate" aria-selected="${tab === 'translate'}"><b>2</b>${bi('翻译', 'Translate')}</button>
        <button class="tab" data-tt="reader" aria-selected="${tab === 'reader'}"><b>3</b>${bi('朗读器', 'Reader')}</button>
        <button class="tab" data-tt="numbers" aria-selected="${tab === 'numbers'}"><b>4</b>${bi('数字时间', 'Numbers & time')}</button>
        <a class="tab" href="#/mine" style="text-decoration:none"><b>5</b>${bi('生词本', 'My words')}</a>
        <a class="tab" href="#/journal" style="text-decoration:none"><b>6</b>${bi('法语日记', 'Journal')}</a>
      </nav><section id="tpane"></section>`;
    $$('[data-tt]', main).forEach(b => b.onclick = () => { location.hash = '#/tools/' + b.dataset.tt; });
    const pane = $('#tpane');
    if (tab === 'reader') return readerTool(pane);
    if (tab === 'numbers') return numbersTool(pane, q);
    if (tab !== 'translate') {
      pane.innerHTML = `<input type="search" class="typed-recite" id="tl-in" lang="fr" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="${bi('输入法语、中文或英文', 'Type French, Chinese or English')}" value="${esc(q || '')}">
        <p class="kbd" style="margin:6px 2px 10px">${bi('在任何页面按 / 键，或点右上角的放大镜，都能随时打开随手查。', 'Press / on any page, or tap the magnifier at the top, to look something up anytime.')}</p><div id="tl-res"></div>`;
      const inp = $('#tl-in', pane), res = $('#tl-res', pane);
      inp.oninput = () => { res.innerHTML = lookupHTML(inp.value); };
      res.innerHTML = lookupHTML(inp.value); inp.focus();
      return;
    }
    const [from, to] = pair.split('|');
    pane.innerHTML = `<div class="tr-box">
        <div class="toolbar"><select id="tr-from">${Object.entries(LANGS).map(([k, n]) => `<option value="${k}" ${k === from ? 'selected' : ''}>${bi(...n)}</option>`).join('')}</select>
          <button class="btn ghost small" id="tr-swap" title="${bi('交换', 'Swap')}">⇄</button>
          <select id="tr-to">${Object.entries(LANGS).map(([k, n]) => `<option value="${k}" ${k === to ? 'selected' : ''}>${bi(...n)}</option>`).join('')}</select></div>
        <textarea id="tr-in" class="typed-recite" rows="4" placeholder="${bi('输入要翻译的文字…', 'Text to translate…')}">${esc(q || '')}</textarea>
        <div class="toolbar"><button class="btn" id="tr-go">${bi('翻译', 'Translate')}</button><button class="btn ghost small" id="tr-say">${ICON.play} ${bi('朗读原文', 'Read the original')}</button>
          <span class="spacer"></span><span class="kbd" id="tr-n"></span></div>
        <div id="tr-out" class="tr-out" hidden></div>
        <p class="kbd" style="margin-top:14px">${bi('翻译由免费的 MyMemory 服务提供：文字会发送给这个服务，每天大约可翻译 5000 字，长句可能不够准确。也可以在 DeepL 或 Google 翻译里打开：', 'Translations come from the free MyMemory service: your text is sent to it, about 5,000 characters a day, and long sentences may be rough. You can also open the text in DeepL or Google Translate:')}
          <a href="#" id="tr-deepl">DeepL ↗</a> · <a href="#" id="tr-google">Google ↗</a></p></div>`;
    const $f = $('#tr-from', pane), $t = $('#tr-to', pane), $in = $('#tr-in', pane), out = $('#tr-out', pane);
    const savePair = () => store.set('trpair', $f.value + '|' + $t.value);
    $f.onchange = $t.onchange = savePair;
    $('#tr-swap', pane).onclick = () => { [$f.value, $t.value] = [$t.value, $f.value]; savePair(); };
    $in.oninput = () => { $('#tr-n', pane).textContent = $in.value.length ? $in.value.length + ' / 500' : ''; };
    $('#tr-say', pane).onclick = () => { if ($f.value === 'fr' && $in.value.trim()) TTS.say($in.value); };
    const go = async () => {
      const text = $in.value.trim().slice(0, 500);
      if (!text) return;
      if ($f.value === $t.value) { out.hidden = false; out.innerHTML = esc(text); return; }
      out.hidden = false; out.innerHTML = `<span class="kbd">${bi('翻译中…', 'Translating…')}</span>`;
      try {
        const r = await fetch(`https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=${$f.value}|${$t.value}`);
        const j = await r.json();
        const t = j && j.responseData && j.responseData.translatedText;
        if (!t || j.responseStatus !== 200) throw new Error(j && j.responseDetails || 'error');
        const div = document.createElement('div'); div.innerHTML = t; const plain = div.textContent;
        out.innerHTML = `<div class="tr-res" lang="${$t.value === 'fr' ? 'fr' : $t.value === 'en' ? 'en' : 'zh'}">${esc(plain)}</div>
          <div class="toolbar" style="margin:8px 0 0">${$t.value === 'fr' ? `<button class="btn ghost small" data-say="${esc(plain)}">${ICON.play} ${bi('朗读', 'Read')}</button>` : ''}
          <button class="btn ghost small" id="tr-copy">${bi('复制', 'Copy')}</button></div>`;
        const c = $('#tr-copy', out); if (c) c.onclick = () => { navigator.clipboard && navigator.clipboard.writeText(plain); c.textContent = bi('已复制', 'Copied'); };
      } catch (e) {
        out.innerHTML = `<p class="notice" style="margin:0">${bi('翻译服务暂时连不上（可能是今天的免费额度用完了，或网络问题）。可以点下面的 DeepL / Google 链接。', 'The translation service is not reachable (the free daily quota may be used up, or the network is down). Try the DeepL / Google links below.')}</p>`;
      }
    };
    $('#tr-go', pane).onclick = go;
    $in.addEventListener('keydown', e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) go(); });
    const gl = l => l === 'zh-CN' ? 'zh' : l;
    $('#tr-deepl', pane).onclick = e => { e.preventDefault(); window.open(`https://www.deepl.com/translator#${gl($f.value)}/${gl($t.value)}/${encodeURIComponent($in.value)}`, '_blank', 'noopener'); };
    $('#tr-google', pane).onclick = e => { e.preventDefault(); window.open(`https://translate.google.com/?sl=${$f.value}&tl=${$t.value}&text=${encodeURIComponent($in.value)}`, '_blank', 'noopener'); };
    $in.oninput(); if (q) go(); else $in.focus();
  }

  function viewMe() {
    document.title = '我的 · 打卡与邮册';
    const log = XP.log(), g = XP.goal(), got = store.get('stamps', {});
    const book = BOOKS[0], lecons = book.units.flatMap(u => u.lecons);
    // 12-week calendar
    const days = []; const d = new Date(); d.setDate(d.getDate() - 83 - ((d.getDay() + 6) % 7 === 6 ? 0 : 0));
    for (let i = 0; i < 84; i++) { days.push(dayStr(d)); d.setDate(d.getDate() + 1); }
    const lvl = x => !x ? 0 : x < g / 2 ? 1 : x < g ? 2 : x < g * 2 ? 3 : 4;
    const s = XP.streak(), stampCount = Object.keys(got).length;
    const lastB = store.get('lastBackup', ''), lastA = store.get('lastAuto', '');
    const fsOK = 'showSaveFilePicker' in window;
    main.innerHTML = `
      <p class="kicker" lang="fr">Mon carnet</p>
      <h1 style="font-size:44px">我的打卡与邮册</h1>
      <div class="review-stats">
        <div><b>${s}</b><span>连续天数</span></div>
        <div><b>${XP.best()}</b><span>最长连续</span></div>
        <div><b>${XP.today().xp}<small>/${g}</small></b><span>今日分数</span></div>
        <div><b>${XP.total()}</b><span>总分</span></div>
        <div><b>${stampCount}<small>/${lecons.length * 2}</small></b><span>邮票</span></div>
      </div>
      <div class="toolbar"><span class="kbd">每日目标</span>${[20, 30, 50, 80].map(x => `<button class="mode" data-goal="${x}" aria-pressed="${x === g}">${x} 分</button>`).join('')}</div>
      <p class="hint-text">怎么得分：单词第一次写对 +2，新掌握一个词 +3，句子/课文一行全对 +3，填空每空 +1，复习答对 +3，变位答对 +1；一课词汇通过 +20、课文通过 +30。达到每日目标就算打卡。</p>
      <section class="unit"><div class="unit-title"><h2>最近 12 周</h2></div>
        <div class="cal">${days.map(k => `<i class="c${lvl((log[k] || {}).xp)} ${k === dayStr() ? 'today' : ''}" title="${k} · ${(log[k] || {}).xp || 0} 分"></i>`).join('')}</div>
        <div class="badges">${STREAK_BADGES.map(n => `<div class="badge ${XP.best() >= n ? 'on' : ''}"><b>${n}</b><span>天</span></div>`).join('')}</div>
      </section>
      <section class="unit"><div class="unit-title"><h2>邮册</h2><span>每课词汇通过、课文通过各得一枚</span></div>
        <div class="album">${lecons.map(l => `<div class="album-cell"><div class="pair">${stampSVG(l.n, 'v', got[`${book.id}:${l.n}:v`])}${stampSVG(l.n, 't', got[`${book.id}:${l.n}:t`])}</div><a href="#/${book.id}/${l.n}" lang="fr">Leçon ${l.n}</a></div>`).join('')}</div>
      </section>
      <section class="unit"><div class="unit-title"><h2>云同步</h2><span>手机和电脑共用进度</span></div><div id="cloud"></div></section>
      <section class="unit" id="backup"><div class="unit-title"><h2>保存与恢复</h2></div>
        <p class="hint-text" style="margin:0 0 14px">所有进度（掌握的单词、错题本、打卡、邮票）只存在这个浏览器里。清除 Chrome 的 Cookie 和网站数据会把它们一起删掉，所以记得备份。</p>
        <div class="toolbar">
          <button class="btn" id="bk-dl">下载完整备份</button>
          <label class="btn ghost" style="cursor:pointer">从备份恢复<input type="file" id="bk-up" accept=".json" hidden></label>
          <span class="kbd">${lastB ? `上次下载备份：${lastB}` : '还没有下载过备份'}</span>
        </div>
        ${fsOK ? `<div class="toolbar" style="margin-top:8px">
          <button class="btn ghost" id="bk-auto">${BACKUP.handle ? '自动保存已开启 · 更换文件' : '自动保存到电脑上的文件'}</button>
          <button class="btn ghost small" id="bk-resume" hidden>继续自动保存到上次的文件</button>
          <span class="kbd">${BACKUP.handle ? `每次练习后自动写入${lastA ? ' · 最近 ' + lastA.slice(0, 16).replace('T', ' ') : ''}` : '选一个文件后，每次练习都会自动写进去（仅 Chrome / Edge 电脑版）'}</span>
        </div>` : ''}
      </section>`;
    refreshCloudUI();
    $$('[data-goal]', main).forEach(b => b.onclick = () => { store.set('goal', +b.dataset.goal); renderStatus(); viewMe(); });
    $('#bk-dl', main).onclick = () => { BACKUP.download(); viewMe(); };
    $('#bk-up', main).onchange = async e => {
      try { BACKUP.merge(JSON.parse(await e.target.files[0].text())); toast('已恢复', '备份已合并进来'); renderStatus(); viewMe(); }
      catch { alert(tr('这个文件读不出来。').replace(' · ', '\n')); }
    };
    if (fsOK) {
      $('#bk-auto', main).onclick = async () => { try { await BACKUP.pickFile(); toast('已开启', '自动保存'); viewMe(); } catch { } };
      if (!BACKUP.handle) idbGet('handle').then(h => {
        const b = $('#bk-resume', main); if (!h || !b) return;
        b.hidden = false; b.textContent = `继续自动保存到 ${h.name}`;
        b.onclick = async () => { if (await BACKUP.resume()) { toast('已开启', '自动保存'); viewMe(); } };
      });
    }
  }
  function backupNag() {
    const last = store.get('lastBackup', ''), have = Object.keys(localStorage).some(k => k.startsWith('nh:master:') || k === 'nh:srs');
    if (!have || BACKUP.handle) return '';
    const days = last ? Math.round((new Date(dayStr()) - new Date(last)) / 864e5) : 99;
    return days >= 7 ? `<a class="notice" href="#/me" style="display:block;text-decoration:none;color:inherit">${last ? `已经 ${days} 天没备份了` : '你还没有备份过进度'}，点这里下载一份，防止浏览器清除数据后丢失。</a>` : '';
  }

  /* ---------- text helpers ---------- */
  const strip = s => s.normalize('NFD').replace(/[̀-ͯ]/g, '');
  const norm = s => s.normalize('NFC').toLowerCase()
    .replace(/[’`´]/g, "'").replace(/œ/g, 'oe').replace(/æ/g, 'ae')
    .replace(/…|\.\.\./g, ' ').replace(/[¹²³*]/g, '')
    .replace(/[.!?。！？]+$/, '').replace(/\s+/g, ' ').trim();
  const TOKEN = /[\p{L}\p{N}@]+(?:[-.@][\p{L}\p{N}]+)*'?/gu;
  const tokens = s => s.normalize('NFC').replace(/[’`]/g, "'").match(TOKEN) || [];
  const key = t => norm(t);
  const loose = t => strip(norm(t));

  // Expand "étudiant(e)", "appeler (s')", "directeur(trice)" … into accepted answers + what to read aloud
  function fem(base, suf) {
    if (/^(e|ne|le|te|se|s)$/.test(suf)) return base + suf;
    const k = strip(suf[0]);
    for (let i = base.length - 1; i >= 0; i--) if (strip(base[i]) === k) return base.slice(0, i) + suf;
    return base + suf;
  }
  function forms(fr) {
    let s = fr.replace(/[¹²³*]/g, '').trim();
    const acc = new Set([s]);
    let say = s, m;
    if ((m = s.match(/^(.*), pl\.m\. (\S+)$/))) { acc.add(m[2]); s = m[1]; acc.add(s); }
    if (s.includes('(-)')) { [s.replace('(-)', '-'), s.replace('(-)', ' ')].forEach(x => acc.add(x)); say = s.replace('(-)', ' '); return { accept: [...acc], say }; }
    if ((m = s.match(/^(.*?)(\S+) \/ (\S+)(.*)$/))) { acc.add(m[1] + m[2] + m[4]); acc.add(m[1] + m[3] + m[4]); return { accept: [...acc], say: m[1] + m[3] + m[4] }; }
    if ((m = s.match(/^(.+?)\((la|le|les|l')\)$/))) { const art = m[2] === "l'" ? "l'" : m[2] + ' '; [m[1], art + m[1]].forEach(x => acc.add(x)); return { accept: [...acc], say: art + m[1] }; }
    if ((m = s.match(/^(\S+)\s*\((se|s')\)$/))) {
      const v = m[1], pro = /^[aeiouyhâéèêî]/i.test(v) ? "s'" : 'se ';
      [v, pro + v, 'se ' + v, v + ' (' + m[2] + ')'].forEach(x => acc.add(x));
      return { accept: [...acc], say: pro + v };
    }
    if ((m = s.match(/^(.*) \(pl\. (.*)\)$/))) { acc.add(m[1]); say = m[1]; }
    else if ((m = s.match(/^(.*) \(s'\)$/))) { acc.add(m[1]); acc.add("s'" + m[1]); acc.add('se ' + m[1]); say = "s'" + m[1]; }
    else if ((m = s.match(/^(.*) \((de)\)$/))) { acc.add(m[1]); acc.add(m[1] + ' de'); say = m[1] + ' de'; }
    else if ((m = s.match(/^(\S+) \((\S+)\)$/))) { acc.add(m[1]); acc.add(m[2]); say = m[1] + ', ' + m[2]; }
    else if ((m = s.match(/^(.*?)\((\p{L}+)\)$/u))) {
      const f = fem(m[1], m[2]); acc.add(m[1]); acc.add(f); acc.add(m[1] + '/' + f);
      say = m[1] === f ? m[1] : m[1] + ', ' + f;
    } else if (s.includes(', ')) s.split(', ').forEach(x => acc.add(x));
    return { accept: [...acc], say };
  }
  function checkWord(input, fr) {
    const a = norm(input); if (!a) return 'empty';
    const acc = forms(fr).accept.map(norm);
    if (acc.includes(a)) return 'ok';
    if (acc.map(strip).includes(strip(a))) return settings.lenient ? 'ok' : 'accent';
    return 'bad';
  }

  // LCS word diff: returns status per target token + extra input tokens
  function diff(target, input) {
    const T = tokens(target), I = tokens(input);
    const n = T.length, m = I.length;
    const L = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1));
    for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--)
      L[i][j] = loose(T[i]) === loose(I[j]) ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
    const st = new Array(n).fill('miss'), extra = [];
    let i = 0, j = 0;
    while (i < n && j < m) {
      if (loose(T[i]) === loose(I[j])) { st[i] = key(T[i]) === key(I[j]) ? 'ok' : 'accent'; i++; j++; }
      else if (L[i + 1][j] >= L[i][j + 1]) i++;
      else { extra.push(I[j]); j++; }
    }
    while (j < m) extra.push(I[j++]);
    const ok = st.filter(x => x === 'ok').length, ac = st.filter(x => x === 'accent').length;
    const score = n ? (ok + ac * (settings.lenient ? 1 : 0.5)) / Math.max(n, n + extra.length * 0.5) : 1;
    return { st, extra, score, perfect: ok + (settings.lenient ? ac : 0) === n && !extra.length };
  }
  // wrap the tokens of a string in spans with given classes
  function markup(str, cls) {
    let out = '', last = 0, i = 0;
    for (const m of str.normalize('NFC').matchAll(TOKEN)) {
      out += esc(str.slice(last, m.index)) + `<span class="${cls(i, m[0])}" data-i="${i}">${esc(m[0])}</span>`;
      last = m.index + m[0].length; i++;
    }
    return out + esc(str.slice(last));
  }
  const marked = (str, st) => markup(str, i => 'w-' + st[i]);

  function lev(a, b) {
    if (Math.abs(a.length - b.length) > 2) return 9;
    const d = Array.from({ length: b.length + 1 }, (_, i) => i);
    for (let i = 1; i <= a.length; i++) {
      let prev = d[0]; d[0] = i;
      for (let j = 1; j <= b.length; j++) {
        const t = d[j];
        d[j] = Math.min(d[j] + 1, d[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
        prev = t;
      }
    }
    return d[b.length];
  }
  const NUM = { un: '1', une: '1', deux: '2', trois: '3', quatre: '4', cinq: '5', six: '6', sept: '7', huit: '8', neuf: '9', dix: '10' };
  function close(spoken, target) {
    const a = loose(spoken).replace(/'$/, '').replace(/-/g, ''), b = loose(target).replace(/'$/, '').replace(/-/g, '');
    if (a === b || NUM[a] === b || NUM[b] === a) return true;
    if (b.length <= 2) return a === b;
    return lev(a, b) <= (b.length > 6 ? 2 : 1);
  }

  /* ---------- speech synthesis ---------- */
  const TTS = {
    voices: [], voice: null, ok: 'speechSynthesis' in window,
    pick() {
      if (!this.ok) return;
      this.voices = speechSynthesis.getVoices().filter(v => /^fr/i.test(v.lang));
      const fr = this.voices.filter(v => /fr[-_]FR/i.test(v.lang));
      this.voice = this.voices.find(v => v.name === settings.voice)
        || fr.find(v => /premium|enhanced|amélie|amelie|thomas|google/i.test(v.name))
        || fr[0] || this.voices[0] || null;
    },
    say(text, onend) {
      if (!this.ok) { onend && onend(); return; }
      speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text.replace(/^–\s*/, '').replace(/…/g, ', ').replace(/[¹²³*]/g, ''));
      u.lang = 'fr-FR'; if (this.voice) u.voice = this.voice;
      u.rate = settings.rate;
      u.volume = settings.volume;
      let done = false;
      const fin = () => { if (!done) { done = true; onend && onend(); } };
      u.onend = fin; u.onerror = fin;
      speechSynthesis.speak(u);
    },
    stop() { if (this.ok) speechSynthesis.cancel(); },
  };
  if (TTS.ok) { TTS.pick(); speechSynthesis.onvoiceschanged = () => TTS.pick(); }

  const ICON = {
    play: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4 2.5v11l9-5.5z" fill="currentColor"/></svg>',
    stop: '<svg viewBox="0 0 16 16" aria-hidden="true"><rect x="4" y="4" width="8" height="8" fill="currentColor"/></svg>',
    mic: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="9" y="3" width="6" height="11" rx="3" fill="currentColor"/><path d="M6 11a6 6 0 0 0 12 0M12 17v4M9 21h6" stroke="currentColor" stroke-width="1.8" fill="none" stroke-linecap="round"/></svg>',
  };
  const playBtn = (text, extra = '') => `<button class="play ${extra}" data-say="${esc(text)}" aria-label="朗读" title="朗读">${ICON.play}</button>`;
  /* ---------- in-depth word card (words-deep.js): meaning, sound, roots, examples, collocations, register, use ---------- */
  function openDeep(fr) {
    const en = L() === 'en' && window.DEEP_EN && DEEP_EN[fr];
    const d = en || (window.DEEP && DEEP[fr]); if (!d) return;
    const cog = window.DEEP_EN && DEEP_EN[fr] && DEEP_EN[fr].cog;
    const word = fr.replace(/\s*\(pl\..*\)$/, '');
    const exHTML = d => `<ul class="dp-ex">${d.ex.map(([f, z]) => `<li><span lang="fr">${playBtn(f)} ${esc(f)}</span><small>${esc(z)}</small></li>`).join('')}</ul>`;
    const coHTML = d => `<ul class="dp-co">${d.co.map(([f, z]) => `<li><b lang="fr">${esc(f)}</b> ${esc(z)}</li>`).join('')}</ul>`;
    const syHTML = d => `<table class="dp-sy">${d.sy.map(([w, r, n]) => `<tr><td lang="fr">${esc(w)}</td><td class="dp-reg">${esc(r)}</td><td>${esc(n)}</td></tr>`).join('')}</table>`;
    const tryHTML = (q, d) => `<div class="dp-try"><p class="dp-q">${bi('试着翻译', 'Translate')}：<b>${esc(q)}</b></p>
          <textarea class="answer-in" lang="fr" rows="2" autocapitalize="off" spellcheck="false" placeholder="${bi('用法语写…', 'Write in French…')}"></textarea>
          <button class="btn small dp-show">${bi('对照参考答案', 'Compare with the answer')}</button>
          <div class="dp-ans" hidden><p lang="fr">${playBtn(d.tr.fr)} <b>${esc(d.tr.fr)}</b></p><p lang="fr" class="dp-alt">${bi('更口语', 'More casual')}：${esc(d.tr.alt)}</p><p class="dp-note">${esc(d.tr.note)}</p></div></div>`;
    const sec = (n, zh, frT, body) => `<section class="dp-sec"><h3><b>${n}</b> ${zh} <span lang="fr">${frT}</span></h3>${body}</section>`;
    const ov = document.createElement('div');
    ov.className = 'deep-ov';
    ov.innerHTML = `<div class="deep-box" role="dialog" aria-label="${esc(word)}">
      <button class="deep-x" aria-label="${bi('关闭', 'Close')}">×</button>
      <header class="dp-head"><h2 lang="fr">${playBtn(forms(fr).say)} ${esc(word)}</h2><p class="dp-pos">${esc(d.pos)}</p></header>
      ${en ? [
        sec(1, 'Core meaning', 'Sens principal', `<p>${esc(d.s)}</p>`),
        sec(2, 'English cognates & false friends', 'Connexions avec l\'anglais', `<p>${esc(d.cog)}</p>`),
        sec(3, 'Pronunciation', 'Prononciation', `<p class="dp-ipa" lang="fr">${esc(d.ipa)}</p><p>${esc(d.ph)}</p><p class="dp-trap"><b>Watch out</b> ${esc(d.pi)}</p>`),
        sec(4, 'Etymology & grammar', 'Étymologie', `<p>${esc(d.et)}</p>`),
        sec(5, 'Real-life examples', 'Exemples', exHTML(d)),
        sec(6, 'Collocations & prepositions', 'Collocations', coHTML(d)),
        sec(7, 'Nuance & register', 'Nuances & registres', syHTML(d)),
        sec(8, 'Naturalness & frequency', 'Usage actuel', `<p>${esc(d.fq)}</p>`),
        sec(9, 'Memory hook & practice', 'Pratique', `<p>${esc(d.me)}</p>${tryHTML(d.tr.en, d)}`),
      ].join('') : [
        sec(1, '核心含义', 'Sens principal', `<p>${esc(d.s)}</p>`),
        sec(2, '发音', 'Prononciation', `<p class="dp-ipa" lang="fr">${esc(d.ipa)}</p><p>${esc(d.ph)}</p><p class="dp-trap"><b>易错</b> ${esc(d.pi)}</p>`),
        sec(3, '词源与构词', 'Étymologie', `<p>${esc(d.et)}</p>${L() === 'zhen' && cog ? `<p class="dp-cog" lang="en">${esc(cog)}</p>` : ''}`),
        sec(4, '真实例句', 'Exemples', exHTML(d)),
        sec(5, '常见搭配', 'Collocations', coHTML(d)),
        sec(6, '近义词与语域', 'Nuances & registres', syHTML(d)),
        sec(7, '频率与语感', 'Fréquence', `<p>${esc(d.fq)}</p>`),
        sec(8, '记忆与练习', 'Mémorisation & pratique', `<p>${esc(d.me)}</p>${tryHTML(d.tr.zh, d)}`),
      ].join('')}
    </div>`;
    document.body.appendChild(ov);
    document.body.classList.add('deep-open');
    const close = () => { ov.remove(); document.body.classList.remove('deep-open'); document.removeEventListener('keydown', esc1); };
    const esc1 = e => { if (e.key === 'Escape') close(); };
    document.addEventListener('keydown', esc1);
    ov.addEventListener('click', e => { if (e.target === ov || e.target.closest('.deep-x')) close(); });
    $('.dp-show', ov).onclick = () => { $('.dp-ans', ov).hidden = false; };
  }
  document.addEventListener('click', e => {
    const b = e.target.closest('[data-deep]');
    if (!b) return;
    e.stopPropagation(); e.preventDefault();
    openDeep(b.dataset.deep);
  }, true);

  // one global handler for every [data-say] button
  document.addEventListener('click', e => {
    const b = e.target.closest('[data-say]');
    if (!b) return;
    e.stopPropagation();
    $$('.play.on').forEach(x => x.classList.remove('on'));
    b.classList.add('on');
    TTS.say(b.dataset.say, () => b.classList.remove('on'));
  });

  // read a list of lines one after another, calling onLine(i) as each starts
  let seqToken = 0;
  function speakSeq(texts, onLine, onDone) {
    const my = ++seqToken;
    let i = 0;
    const next = () => {
      if (my !== seqToken) return;
      if (i >= texts.length) { onLine(-1); onDone && onDone(); return; }
      onLine(i); TTS.say(texts[i], () => { i++; setTimeout(next, 250); });
    };
    next();
    return () => { seqToken++; TTS.stop(); onLine(-1); };
  }

  /* ---------- settings panel ---------- */
  function renderSettings() {
    const box = $('#settings');
    const vs = TTS.voices;
    box.innerHTML = `
      <label><span class="lab">朗读语速 · <b id="rate-v">${settings.rate.toFixed(2)}</b></span>
        <input type="range" id="s-rate" min="0.5" max="1.2" step="0.05" value="${settings.rate}"></label>
      <label><span class="lab">朗读音量 · <b id="vol-v">${Math.round(settings.volume * 100)}%</b></span>
        <input type="range" id="s-vol" min="0.05" max="1" step="0.05" value="${settings.volume}"></label>
      ${/iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1) ? '<p class="kbd" style="margin:-8px 0 12px">iPhone / iPad 的浏览器不支持这个设置，请用机身侧面的音量键调。</p>' : ''}
      <label><span class="lab">法语声音</span>
        <select id="s-voice">${vs.length ? vs.map(v => `<option ${TTS.voice && v.name === TTS.voice.name ? 'selected' : ''}>${esc(v.name)}</option>`).join('') : '<option>（系统没有法语声音）</option>'}</select></label>
 <div class="lab" style="margin-bottom:4px">${bi('外观', 'Look')}</div>
      <div class="modes" style="margin-bottom:14px"><button class="mode" data-look="color" aria-pressed="${settings.look !== 'mono'}">${bi('彩色', 'Colour')}</button><button class="mode" data-look="mono" aria-pressed="${settings.look === 'mono'}">${bi('黑白', 'Black & white')}</button></div>
      <label class="chk"><input type="checkbox" id="s-riso" ${settings.riso !== false ? 'checked' : ''}> ${bi('丝网印刷质感', 'Screen-print texture')}</label>
      <label class="chk"><input type="checkbox" id="s-dust" ${settings.dust !== false ? 'checked' : ''}> ${bi('空气里的浮尘', 'Dust in the light')}</label>
      <label class="chk"><input type="checkbox" id="s-focus" ${settings.focus ? 'checked' : ''}> ${bi('专注模式（练习时只留题目，10 分钟一段，到点提醒休息）', 'Focus mode (only the exercise on screen, 10-minute sprints with break reminders)')}</label>
      <label class="chk"><input type="checkbox" id="s-tw" ${settings.typewriter ? 'checked' : ''}> ${bi('打字机模式（打字声 + 打字机字体）', 'Typewriter mode (key sounds + typewriter font)')}</label>
      <label class="chk"><input type="checkbox" id="s-len" ${settings.lenient ? 'checked' : ''}> 重音写错也算对</label>
      <button class="btn ghost small" data-say="Bonjour ! Je m'appelle Alice. Ça va bien ?">试听</button>
      <p class="kbd" style="margin:12px 0 0">macOS 可在 系统设置 › 辅助功能 › 朗读内容 › 系统声音 下载更自然的法语声音（如 Amélie 高音质）。</p>`;
    $('#s-rate').oninput = e => { settings.rate = +e.target.value; $('#rate-v').textContent = settings.rate.toFixed(2); saveSettings(); };
    $('#s-vol').oninput = e => { settings.volume = +e.target.value; window.NH_VOLUME = settings.volume; $('#vol-v').textContent = Math.round(settings.volume * 100) + '%'; saveSettings(); };
    $('#s-vol').onchange = () => TTS.say('Bonjour !');
    $('#s-voice').onchange = e => { settings.voice = e.target.value; TTS.pick(); saveSettings(); };
    $$('[data-look]', box).forEach(b => b.onclick = () => {
      settings.look = b.dataset.look; saveSettings();
      document.documentElement.classList.toggle('mono', settings.look === 'mono');
      $$('[data-look]', box).forEach(x => x.setAttribute('aria-pressed', x === b));
    });
    $('#s-riso').onchange = e => { settings.riso = e.target.checked; saveSettings(); document.documentElement.classList.toggle('no-riso', !settings.riso); };
    $('#s-dust').onchange = e => { settings.dust = e.target.checked; saveSettings(); if (window.DUST) DUST.set(settings.dust); };
    $('#s-focus').onchange = e => setFocus(e.target.checked);
    $('#s-tw').onchange = e => { settings.typewriter = e.target.checked; saveSettings(); document.documentElement.classList.toggle('tw', settings.typewriter); if (settings.typewriter && window.TYPEWRITER) TYPEWRITER.ret(); };
    $('#s-len').onchange = e => { settings.lenient = e.target.checked; saveSettings(); };
  }
  $('#settings-btn').onclick = () => {
    const box = $('#settings');
    if (box.hidden) renderSettings();
    box.hidden = !box.hidden;
  };
  document.addEventListener('click', e => {
    const box = $('#settings');
    if (!box.hidden && !box.contains(e.target) && !e.target.closest('#settings-btn')) box.hidden = true;
  });

  /* ---------- data helpers ---------- */
  const findBook = id => BOOKS.find(b => b.id === id);
  function findLecon(book, n) {
    for (const u of book.units) for (const l of u.lecons) if (l.n === n) return { unit: u, lecon: l };
    return null;
  }
  // practice sentences: split prose paragraphs when Chinese and French sentence counts agree
  function sentences(lecon) {
    const out = [];
    let head = '';
    for (const r of lecon.text) {
      if (r.h) { head = r.h; continue; }
      const zs = r.zh.replace(/^–\s*/, '').split(/(?<=[。！？])(?=.)/);
      const fs = r.fr.replace(/^–\s*/, '').split(/(?<=[.!?])\s+(?=[A-ZÀ-Ý–])/);
      const es = (r.en || '').replace(/^–\s*/, '').split(/(?<=[.!?])\s+(?=[A-Z–])/);
      if (!r.fr.startsWith('–') && zs.length > 1 && zs.length === fs.length) zs.forEach((z, i) => out.push({ zh: z.trim(), fr: fs[i].trim(), en: (es.length === fs.length ? es[i] : r.en || '').trim(), head }));
      else out.push({ zh: r.zh.replace(/^–\s*/, ''), fr: r.fr.replace(/^–\s*/, ''), en: (r.en || '').replace(/^–\s*/, ''), head });
    }
    return out;
  }
  const shuffle = a => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.random() * (i + 1) | 0; [a[i], a[j]] = [a[j], a[i]]; } return a; };

  function coverHTML(book, tag = 'a') {
    return `<${tag} class="cover" ${tag === 'a' ? `href="#/${book.id}"` : ''} aria-label="${esc(book.title)}">
      <div class="c-zh">你好<br>法语</div><div class="c-fr" lang="fr">${esc(book.fr)}</div><div class="c-num">1</div>
      <svg viewBox="0 0 200 90" fill="none" stroke="currentColor" stroke-width="1.1" stroke-linecap="round" aria-hidden="true">
        <path d="M0 88h200M8 88V52h26v36M12 52l9-12 9 12M14 60h5v6h-5zM24 60h5v6h-5zM14 72h5v6h-5zM24 72h5v6h-5z"/>
        <path d="M44 88V38h34v50M44 38l17-14 17 14M50 46h7v9h-7zM65 46h7v9h-7zM50 62h7v9h-7zM65 62h7v9h-7zM57 78h8v10h-8z"/>
        <path d="M70 26v-6h4v6"/>
        <path d="M120 88l14-70 14 70M126 58h16M129 40h10M134 18v-8M124 88q10-16 20 0"/>
        <path d="M160 88V60h30v28M160 60l15-10 15 10M166 66h6v8h-6zM178 66h6v8h-6z"/>
        <path d="M92 20q6-6 12 0M98 14q5-5 10 0" stroke-width=".8"/>
      </svg></${tag}>`;
  }

  /* ---------- router ---------- */
  let cleanup = () => { };
  window.NH_LANG = () => L();
  function setFocus(v) {
    settings.focus = !!v; saveSettings();
    const c = $('#s-focus'); if (c) c.checked = settings.focus;
    const b = $('#focus-btn'); if (b) b.setAttribute('aria-pressed', settings.focus);
    if (window.FOCUS) FOCUS.set(settings.focus);
  }
  window.NH_SET_FOCUS = setFocus;
  if (window.FOCUS) FOCUS.set(!!settings.focus);
  { const b = $('#focus-btn'); if (b) { b.setAttribute('aria-pressed', !!settings.focus); b.onclick = () => setFocus(!settings.focus); } }
  function route() {
    CLOUD.flush();
    cleanup(); cleanup = () => { };
    TTS.stop(); seqToken++;
    const parts = location.hash.replace(/^#\/?/, '').split('/').filter(Boolean);
    const crumbs = $('#crumbs');
    // focus mode only kicks in on practice pages
    if (window.FOCUS) FOCUS.page((BOOKS.some(b => b.id === parts[0]) && parts.length >= 2) || (parts[0] === 'review' && !!parts[1]) || (parts[0] === 'sons' && parts.length >= 2));
    // curtain colour of the reading plate, by section
    document.body.dataset.drape = { journal: 'green', sons: 'blue', review: 'red', tools: 'cream', mine: 'green', verbes: 'blue', me: 'red' }[parts[0]] || 'yellow';
    window.scrollTo(0, 0);
    if (!parts.length) { crumbs.innerHTML = ''; return viewHome(); }
    if (parts[0] === 'journal') { crumbs.innerHTML = `<span>${bi('法语日记', 'Journal')}</span>`; return viewJournal(parts[1]); }
    if (parts[0] === 'mine') { crumbs.innerHTML = `<span>${bi('生词本', 'My words')}</span>`; return viewMine(parts[1]); }
    if (parts[0] === 'tools') {
      crumbs.innerHTML = `<span>${bi('工具', 'Tools')}</span>`;
      const [t, qs] = (parts[1] || 'lookup').split('?');
      return viewTools(t, qs ? decodeURIComponent((qs.match(/q=([^&]*)/) || [])[1] || '') : '');
    }
    if (parts[0] === 'sons') {
      crumbs.innerHTML = `<a href="#/sons">${esc(SB().title)}</a>`;
      return parts[1] ? viewSoundLesson(parts[1], parts[2] || 'learn') : viewSounds();
    }
    if (parts[0] === 'verbes') { crumbs.innerHTML = `<span>${bi('动词词典', 'Verb dictionary')}</span>`; return viewVerbs(decodeURIComponent(parts[1] || '')); }
    if (parts[0] === 'me') { crumbs.innerHTML = '<span>我的打卡与邮册</span>'; return viewMe(); }
    if (parts[0] === 'review') { crumbs.innerHTML = '<span>错题本 · 每日复习</span>'; return viewReview(parts[1]); }
    const book = findBook(parts[0]);
    if (!book) { location.hash = '#/'; return; }
    if (parts.length === 1) {
      crumbs.innerHTML = `<a href="#/${book.id}">${esc(book.title)}</a>`;
      return viewBook(book);
    }
    const n = +parts[1].replace(/\D/g, '');
    const found = findLecon(book, n);
    if (!found) { location.hash = '#/' + book.id; return; }
    crumbs.innerHTML = `<a href="#/${book.id}">${esc(book.title)}</a><span class="sep">›</span><a href="#/${book.id}">Unité ${found.unit.n}</a><span class="sep">›</span><span>Leçon ${n}</span>`;
    viewLecon(book, found.unit, found.lecon, parts[2] || 'vocab');
  }
  window.addEventListener('hashchange', route);

  /* ---------- views ---------- */
  function reviewBanner() {
    const due = SRS.due().length, total = Object.values(SRS.all()).filter(e => !e.done).length;
    if (!total) return '';
    return `<a class="review-banner" href="#/review"><span class="rb-n">${due}</span>
      <span><b>${due ? '今天要复习' : '今天的复习完成了'}</b><br><span class="kbd">错题本里共 ${total} 条 · 点击进入</span></span></a>`;
  }

  // what was written instead of this item: stored attempts, plus older typo-log entries for words
  function wrongTries(e) {
    const out = (e.tries || []).map(x => x.t);
    if (e.kind === 'word') {
      const acc = new Set([e.fr, ...forms(e.fr).accept].map(norm));
      ERRS.all().filter(x => !x.q && acc.has(norm(x.c))).reverse().forEach(x => { if (!out.includes(x.t)) out.push(x.t); });
    }
    return out.slice(0, 3);
  }
  const triesHTML = e => {
    const t = wrongTries(e); if (!t.length) return '';
    const cut = x => x.length > 60 ? x.slice(0, 58) + '…' : x;
    return `<div class="err-tries">${bi('写成过', 'You wrote')}：${t.map(x => `<s lang="fr">${esc(cut(x))}</s>`).join('<span class="sep">·</span>')}</div>`;
  };
  function viewReview(sub) {
    document.title = '错题本 · 每日复习';
    const KIND = { word: '单词', cloze: '填空', sentence: '句子' };
    const db = SRS.all();
    const items = Object.entries(db).map(([id, e]) => ({ id, ...e }));
    const due = SRS.due();
    const active = items.filter(e => !e.done), done = items.filter(e => e.done);
    if (sub === 'learn' || sub === 'early-learn') {
      main.innerHTML = '<div class="toolbar"><a class="btn ghost small" href="#/review">‹ 返回错题本</a></div><div id="drill"></div>';
      return reviewLearn($('#drill'), sub === 'learn' ? due : active, sub === 'learn' ? '#/review/go' : '#/review/early');
    }
    if (sub === 'go' || sub === 'listen' || sub === 'early' || sub === 'early-listen') {
      main.innerHTML = '<div class="toolbar"><a class="btn ghost small" href="#/review">‹ 返回错题本</a></div><div id="drill"></div>';
      return reviewDrill($('#drill'), shuffle(sub.startsWith('early') ? active : due));
    }
    const byLecon = {};
    active.sort((a, b) => a.n - b.n || a.due.localeCompare(b.due)).forEach(e => (byLecon[e.n] = byLecon[e.n] || []).push(e));
    const today = dayStr();
    main.innerHTML = `
      <p class="kicker" lang="fr">Révision du jour</p>
      <h1 style="font-size:44px">错题本</h1>
      <p class="hint-text" style="margin-top:8px">练习里写错、用了提示或背漏的内容会自动记下来。第二天出现在这里；答对后隔 2、4、7、15 天再复习，连续答对 5 次就算掌握。答错会重新从明天开始。</p>
      <div class="review-stats">
        <div><b>${due.length}</b><span>今天到期</span></div>
        <div><b>${active.length}</b><span>还在复习</span></div>
        <div><b>${done.length}</b><span>已掌握</span></div>
      </div>
      <div class="toolbar">
        ${due.length ? `<a class="btn ghost" href="#/review/learn">${bi('先学一遍', 'Study first')}</a><a class="btn" href="#/review/go">开始今天的复习（${due.length}）</a>`
          : `<span class="btn ghost" aria-disabled="true">今天没有要复习的</span>`}
        ${active.length && !due.length ? `<a class="btn ghost" href="#/review/early-learn">${bi('先学一遍', 'Study first')}</a><a class="btn ghost" href="#/review/early">提前复习全部</a>` : ''}
        <span class="spacer"></span>
        <button class="btn ghost small" id="exp">导出备份</button>
        <label class="btn ghost small" style="cursor:pointer">导入<input type="file" id="imp" accept=".json" hidden></label>
      </div>
      ${errorAnalysisHTML()}
      ${Object.keys(byLecon).length ? Object.entries(byLecon).map(([n, list]) => `
        <section class="unit"><div class="unit-title"><h2 lang="fr">${leconName(+n)}</h2><span>${list.length} 条</span></div>
        ${list.map(e => `<div class="err-row">
          <span class="err-kind">${KIND[e.kind]}</span>
          <div class="err-body"><div lang="fr">${playBtn(e.kind === 'word' ? forms(e.fr).say : e.fr)} ${esc(e.fr)}${e.kind === 'word' && window.DEEP && DEEP[e.fr] ? `<button class="deep-btn" data-deep="${esc(e.fr)}" lang="zh">${bi('详解', 'In depth')}</button>` : ''}</div><div class="lzh">${e.kind === 'cloze' ? esc(e.zh) : G(e)}${e.pos ? ' · ' + esc(e.pos) : ''}</div>${triesHTML(e)}</div>
          <span class="err-meta">错 ${e.wrong} 次<br>${e.due <= today ? '<b class="w-miss">&nbsp;今天&nbsp;</b>' : e.due.slice(5).replace('-', '/') + ' 复习'}</span>
          <button class="err-del" data-id="${esc(e.id)}" title="移出错题本" aria-label="移出错题本">×</button>
        </div>`).join('')}</section>`).join('')
        : '<p class="notice">错题本还是空的。去做几课练习吧，写错的会自动出现在这里。</p>'}`;
    $$('.err-del', main).forEach(b => b.onclick = () => { SRS.remove(b.dataset.id); viewReview(); });
    $('#exp', main).onclick = () => BACKUP.download();
    $('#imp', main).onchange = async e => {
      try { BACKUP.merge(JSON.parse(await e.target.files[0].text())); viewReview(); }
      catch { alert(tr('这个文件读不出来。').replace(' · ', '\n')); }
    };
  }

  const promptSay = e => e.kind === 'cloze' ? e.zh.replace('____', e.fr).replace(/^–\s*/, '') : e.kind === 'word' && e.pos !== '变位' ? forms(e.fr).say : e.fr;
  // round 1 is the real review (updates the schedule); later rounds practise the misses until all are right
  // study pass before the review: one card per item — word, sound, meaning, tip, in-depth card — then go to the drill
  function reviewLearn(box, list, next) {
    const items = [...list].sort((a, b) => a.n - b.n);
    let i = 0;
    const draw = () => {
      if (i >= items.length) {
        box.innerHTML = `<div class="drill learn-done"><h2>${bi('学完了', 'All studied')}</h2>
          <p class="hint-text">${bi(`${items.length} 条都看过一遍了，现在默写巩固一下。`, `You\'ve been through all ${items.length}. Now write them out.`)}</p>
          <div class="toolbar"><a class="btn" href="${next}">${bi('开始复习', 'Start the review')}</a><button class="btn ghost" id="lr-again">${bi('再看一遍', 'Go through again')}</button></div></div>`;
        $('#lr-again', box).onclick = () => { i = 0; draw(); };
        return;
      }
      const e = items[i], word = e.kind === 'word';
      const say = word ? forms(e.fr).say : e.fr;
      const tip = word ? wordTip(e.n, e) : '';
      box.innerHTML = `<div class="drill learn-card ${word && gender(e.pos) ? 'g-' + gender(e.pos) : ''}">
        <div class="prog-line"><span class="kbd">${i + 1} / ${items.length}</span><span class="kbd" lang="fr">${esc(leconName(e.n))}</span></div>
        <div class="lc-fr" lang="fr">${playBtn(say)} ${word ? artHint(e) : ''}<b>${esc(e.fr)}</b></div>
        <div class="lc-mean">${e.kind === 'cloze' ? esc(e.zh) : G(e)}${e.pos ? ` <span class="pos ${gender(e.pos) ? 'g-' + gender(e.pos) : ''}">${esc(e.pos)}</span>` : ''}</div>
        ${e.wrong ? `<p class="kbd">${bi(`写错过 ${e.wrong} 次`, `Missed ${e.wrong} times`)}</p>` : ''}
        ${triesHTML(e)}
        ${tipBox(tip)}
        ${word && window.DEEP && DEEP[e.fr] ? `<button class="deep-btn lc-deep" data-deep="${esc(e.fr)}">${bi('看详解', 'In-depth card')}</button>` : ''}
        <div class="toolbar lc-nav">
          <button class="btn ghost" id="lr-prev" ${i ? '' : 'disabled'}>‹ ${bi('上一个', 'Back')}</button>
          <span class="spacer"></span>
          <button class="btn" id="lr-next">${i + 1 < items.length ? bi('下一个', 'Next') + ' ›' : bi('学完了', 'Done') + ' ✓'}</button>
        </div>
        <p class="kbd">${bi('← → 键翻页，空格再听一遍', '← → to move, Space to hear again')}</p></div>`;
      $('#lr-prev', box).onclick = () => { if (i) { i--; draw(); } };
      $('#lr-next', box).onclick = () => { i++; draw(); };
      TTS.say(say);
    };
    const key = ev => {
      if (!box.isConnected) return document.removeEventListener('keydown', key);
      if (document.querySelector('.deep-ov') || /INPUT|TEXTAREA/.test(document.activeElement.tagName)) return;
      if (ev.key === 'ArrowRight') { ev.preventDefault(); if (i < items.length) { i++; draw(); } }
      else if (ev.key === 'ArrowLeft') { ev.preventDefault(); if (i) { i--; draw(); } }
      else if (ev.key === ' ' && i < items.length) { ev.preventDefault(); const e = items[i]; TTS.say(e.kind === 'word' ? forms(e.fr).say : e.fr); }
    };
    document.addEventListener('keydown', key);
    draw();
  }

  function reviewDrill(box, queue, round = 1) {
    const practice = round > 1;
    let i = 0, answered = false, right = 0;
    const wrong = [];
    const draw = () => {
      if (i >= queue.length) {
        const allRight = !wrong.length;
        box.innerHTML = `<div class="drill summary"><p class="kicker" lang="fr">${practice ? bi(`第 ${round - 1} 轮练习`, `Practice round ${round - 1}`) : 'Bilan'}</p>
          <div class="score">${right} / ${queue.length}</div>
          <p>${allRight ? (practice ? bi('全部答对了！今天的错题都练会了。', 'All right! You have learned today\'s misses.') : bi('全部答对！', 'All correct!'))
            : practice ? bi(`还有 ${wrong.length} 个没写对，再来一轮。`, `${wrong.length} still wrong — one more round.`)
            : bi('答错的明天会再出现。现在可以先把它们练对。', 'The ones you missed come back tomorrow. Practise them now until they are right.')}</p>
          ${wrong.length ? `<ul>${wrong.map(e => `<li><span lang="fr">${esc(e.fr)}</span><span class="w-zh">${e.kind === 'cloze' ? esc(e.zh) : G(e)}</span></li>`).join('')}</ul>` : ''}
          <div class="drill-actions" style="justify-content:center">
            ${wrong.length ? `<button class="btn" id="again-wrong">${bi(`练习答错的（${wrong.length}）`, `Practise the misses (${wrong.length})`)}</button>` : ''}
            <a class="btn ${wrong.length ? 'ghost' : ''}" href="#/review">${bi('回到错题本', 'Back to mistake book')}</a>${slipBtn('slip')}</div></div>`;
        $('#slip', box).onclick = () => printSlip(practice ? bi(`错题练习 · 第 ${round - 1} 轮`, `PRATIQUE · TOUR ${round - 1}`) : bi('今日复习', 'RÉVISION DU JOUR'),
          [pad(bi('题数', 'Questions'), queue.length), pad(bi('答对', 'Justes'), right), pad(bi('今日分数', 'Points'), XP.today().xp), pad(bi('连续天数', 'Série'), XP.streak()),
            ...(wrong.length ? ['', bi('要再看看：', 'À revoir :'), ...wrong.slice(0, 12).map(e => '  ' + e.fr.slice(0, 26))] : ['', bi('全部答对！', 'Sans faute !')])]);
        if (wrong.length) $('#again-wrong', box).onclick = () => reviewDrill(box, shuffle(wrong), round + 1);
        return;
      }
      const e = queue[i]; answered = false;
      const word = e.kind !== 'sentence';
      box.innerHTML = `<div class="drill">
        <div class="count">${practice ? bi(`练习 ${round - 1} · `, `Practice ${round - 1} · `) : ''}${i + 1} / ${queue.length} · ${leconName(e.n)}</div>
        <div class="bar"><i style="width:${i / queue.length * 100}%"></i></div>
        <div class="prompt">${e.kind === 'cloze'
          ? `<div class="pzh long" lang="fr" style="font-family:var(--serif)">${esc(e.zh).replace('____', '<u>&emsp;?&emsp;</u>')}</div><div class="ppos">填出空缺的词</div>`
          : `<div class="pmean ${e.zh.length > 30 ? 'long' : ''}">${MEAN(e)}</div>`}
          <div class="ppos">${playBtn(promptSay(e))} ${esc(e.kind === 'cloze' ? '' : e.pos || '')}</div></div>
        ${word ? `<input class="answer-in" id="ans" lang="fr" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="${bi('用法语写…', 'Write in French…')}">`
          : `<textarea class="answer-in" id="ans" lang="fr" rows="2" autocapitalize="off" spellcheck="false" placeholder="${bi('写出法语句子…', 'Write the French sentence…')}"></textarea>`}
        <div class="drill-actions"><button class="btn ghost small" id="skip">${bi('不会，看答案', 'Show answer')}</button><span class="spacer"></span><span class="kbd"><kbd>Enter</kbd> 检查 / 下一个</span></div>
        <div id="fb"></div></div>`;
      const inp = $('#ans', box); inp.focus();
      if (store.get('vauto', false)) setTimeout(() => TTS.say(promptSay(e)), 200);
      inp.onkeydown = ev => { if (ev.key === 'Enter' && !ev.shiftKey) { ev.preventDefault(); answered ? (i++, draw()) : check(); } };
      $('#skip', box).onclick = () => check(true);
    };
    const check = (giveUp = false) => {
      const e = queue[i], val = $('#ans', box).value;
      if (!val.trim() && !giveUp) return;
      answered = true;
      const say = e.kind === 'word' ? forms(e.fr).say : e.fr;
      let good, html;
      if (e.kind === 'sentence') {
        const d = diff(e.fr, giveUp ? '' : val);
        good = d.perfect; html = giveUp ? esc(e.fr) : marked(e.fr, d.st);
        if (!good && !giveUp) ERRS.sentence(e.fr, val);
      } else {
        const r = giveUp ? 'bad' : checkWord(val, e.fr);
        if (r !== 'ok' && !giveUp) ERRS.typed(e.kind === 'word' && e.pos !== '变位' ? closest(e.fr, val) : e.fr, val);
        good = r === 'ok'; html = esc(e.fr) + (r === 'accent' ? ' <span class="kbd">（注意重音）</span>' : '');
      }
      if (good) right++; else wrong.push(e);
      let lab;
      if (practice) {
        if (good) XP.gain(1, bi('练习答对', 'Practice right'));
        lab = good ? bi('对了', 'Right') : bi('还没对，等下再来', 'Not yet — it will come back');
      } else {
        good ? (SRS.hit(e), XP.gain(3, '复习答对')) : SRS.miss(e, giveUp ? '' : val);
        const next = good ? GAPS[Math.min((e.box || 0) + 1, GAPS.length - 1)] : 1;
        lab = good ? `答对了 · ${(e.box || 0) + 1 >= GAPS.length ? '已掌握' : next + ' 天后再复习'}` : '明天再来一次';
      }
      $('#fb', box).innerHTML = `<div class="feedback ${good ? 'ok' : 'bad'}"><span class="lab">${lab}</span>
        <div class="ans" lang="fr">${playBtn(say)}<span>${html}</span></div>
        ${e.kind === 'word' ? tipBox(e.pos === '变位' ? verbTip(e.zh.split(' · ')[0].replace(/^(se |s')/, '')) : wordTip(e.n, e)) : ''}</div>`;
      TTS.say(say);
    };
    draw();
  }

  function viewHome() {
    const book = BOOKS[0];
    document.title = '你好法语 · 默写本';
    main.innerHTML = `
      <section class="home">
        <div class="shelf">${coverHTML(book)}${soundCover()}</div>
        <div class="home-text">
          <p class="kicker" lang="fr">Cahier de dictée</p>
          <h1>${bi('今天写哪一课？', 'Which leçon today?')}</h1>
          <p>${bi('照着默写讲义整理的。法语点一下就会读。', 'Built from your dictation handouts. Tap any French to hear it.')}</p>
          <div class="toolbar"><a class="btn" href="#/${book.id}">打开《${esc(book.title)}》</a><a class="btn ghost" href="#/sons">打开《${esc(SB().title)}》</a><a class="btn ghost" href="#/journal">写今天的法语日记</a></div>
          ${backupNag()}${reviewBanner()}
        </div>
      </section>`;
  }

  function progHTML(book, l, big = false) {
    const st = MASTER.stats(book.id, l);
    const bar = (label, a, b, done) => `<div class="pbar ${done ? 'done' : ''}"><span class="pl">${label}</span>
      <span class="pt"><i style="width:${b ? a / b * 100 : 0}%"></i></span><span class="pn">${done ? '通过' : `${a}/${b}`}</span></div>`;
    return `<div class="prog ${big ? 'big' : ''}">${bar('词汇', st.words, st.totalWords, st.vocabDone)}${bar('课文', st.lines, st.totalLines, st.textDone)}</div>`;
  }

  function viewBook(book) {
    document.title = book.title + ' · 默写本';
    const PARTS = ['vocab', 'phrases', 'full', 'recite'];
    main.innerHTML = `
      <div class="book-head">${coverHTML(book, 'div')}<div><p class="kicker" lang="fr">${esc(book.fr)}</p><h1>${esc(book.title)}</h1></div></div>
      ${reviewBanner()}
      ${book.units.map(u => `
        <section class="unit">
          <div class="unit-title"><h2 lang="fr">Unité ${u.n}</h2><span>Leçon ${u.lecons[0].n}–${u.lecons[u.lecons.length - 1].n}</span></div>
          <div class="lecons">${u.lecons.map(l => {
            const p = getProg(book.id, l.n);
            return `<a class="lecon-card" href="#/${book.id}/${l.n}">${lessonArt(l.n)}
              <div class="n" lang="fr">Leçon ${l.n}</div>
              <h3 lang="fr">${esc(l.title)}</h3>
              <div class="zh">${esc(l.zh)}</div>
              ${progHTML(book, l)}
            </a>`;
          }).join('')}</div>
        </section>`).join('')}
      <p class="footer-note">进度保存在这台设备的浏览器里。</p>
      <p class="credit">${bi('图片来源', 'Image credits')}：<a href="https://commons.wikimedia.org/wiki/File:ARCHITECTURE_ORDERS_Greeks_Etruscan_Roman_(Doric_Ionic_Corinthian_Tuscan_Composite)_by_Paolo_Villa_ENG_edition.pdf" target="_blank" rel="noopener">柱式 Paolo Villa, CC BY-SA 4.0</a> · <a href="https://commons.wikimedia.org/wiki/Category:Urania%27s_Mirror" target="_blank" rel="noopener">Urania's Mirror, Sidney Hall 1825（公有领域）</a></p>`;
  }

  const TABS = [['vocab', '词汇', 'Vocabulary'], ['phrases', '句子', 'Sentences'], ['full', '全文默写', 'Full dictation'], ['recite', '背诵', 'Recite']];
  function viewLecon(book, unit, lecon, tab) {
    if (!TABS.some(t => t[0] === tab)) tab = 'vocab';
    document.title = `Leçon ${lecon.n} · ${lecon.title}`;
    const all = book.units.flatMap(u => u.lecons);
    const idx = all.indexOf(lecon);
    const prev = all[idx - 1], next = all[idx + 1];
    main.innerHTML = `
      <header class="lecon-head">
        <p class="kicker" lang="fr">Unité ${unit.n} · Leçon ${lecon.n}</p>
        <h1 lang="fr">${esc(lecon.title)}</h1>
        <div class="zh">${esc(lecon.zh)}</div>
        ${progHTML(book, lecon, true)}
      </header>
      <nav class="tabs" role="tablist">${TABS.map((t, i) => `<button class="tab" role="tab" aria-selected="${t[0] === tab}" data-tab="${t[0]}"><b>${i + 1}</b>${bi(t[1], t[2])}</button>`).join('')}</nav>
      <section id="pane"></section>
      <div class="toolbar" style="margin-top:40px">
        ${prev ? `<a class="btn ghost small" href="#/${book.id}/${prev.n}">‹ Leçon ${prev.n}</a>` : ''}
        <span class="spacer"></span>
        ${next ? `<a class="btn ghost small" href="#/${book.id}/${next.n}">Leçon ${next.n} ›</a>` : ''}
      </div>
      <div class="toolbar" style="justify-content:center"><button class="btn ghost small" id="worksheet">${bi('打印这一课的默写纸', 'Print a worksheet for this leçon')}</button>
        <button class="btn ghost small" id="worksheet-pdf">${bi('下载默写纸 PDF', 'Download the worksheet as PDF')}</button></div>`;
    $('#worksheet', main).onclick = () => printWorksheet(book, lecon);
    $('#worksheet-pdf', main).onclick = () => worksheetPdf(book, lecon);
    $$('.tab', main).forEach(b => b.onclick = () => { history.replaceState(null, '', `#/${book.id}/${lecon.n}/${b.dataset.tab}`); route(); });
    const pane = $('#pane');
    const ctx = { book, lecon, pane, save: (part, s) => setProg(book.id, lecon.n, part, s) };
    ({ vocab: paneVocab, phrases: panePhrases, full: paneFull, recite: paneRecite })[tab](ctx);
  }

  function modeBar(modes, cur, onPick, extra = '') {
    return `<div class="modes">${modes.map(([k, label]) => `<button class="mode" data-mode="${k}" aria-pressed="${k === cur}">${label}</button>`).join('')}<span class="spacer"></span>${extra}</div>`;
  }
  function bindModes(root, onPick) {
    $$('.mode', root).forEach(b => b.onclick = () => onPick(b.dataset.mode));
  }

  /* ----- custom word order (per leçon, within each part-of-speech group) ----- */
  const orderKey = (book, n) => `order:${book}:${n}`;
  function orderedVocab(book, lecon) {
    const saved = store.get(orderKey(book, lecon.n), null);
    if (!saved) return lecon.vocab.slice();
    const groups = [];
    lecon.vocab.forEach(v => { let g = groups.find(x => x.g === v.g); if (!g) groups.push(g = { g: v.g, items: [] }); g.items.push(v); });
    for (const g of groups) {
      const want = saved[g.g || ''] || [];
      const pos = v => { const i = want.indexOf(v.fr); return i < 0 ? 1e6 + g.items.indexOf(v) : i; };
      g.items.sort((a, b) => pos(a) - pos(b));
    }
    return groups.flatMap(g => g.items);
  }
  function saveOrder(book, n, pane) {
    const o = {};
    $$('.vgroup', pane).forEach(g => { o[g.dataset.g] = $$('.vrow', g).map(r => r.dataset.fr); });
    store.set(orderKey(book, n), o);
  }
  // drag a row by its handle; works with mouse and touch, only inside its own group
  function enableDrag(pane, onDone) {
    let drag = null;
    const pointY = ev => (ev.touches && ev.touches[0] ? ev.touches[0].clientY : ev.clientY);
    const start = (ev, h) => {
      const row = h.closest('.vrow');
      drag = { row, group: row.parentElement };
      row.classList.add('dragging');
      document.body.classList.add('is-dragging');
    };
    const move = ev => {
      if (!drag) return;
      if (ev.cancelable) ev.preventDefault();          // keep the page from scrolling while dragging
      const y = pointY(ev);
      const rows = $$('.vrow', drag.group).filter(r => r !== drag.row);
      let before = null;
      for (const r of rows) { const b = r.getBoundingClientRect(); if (y < b.top + b.height / 2) { before = r; break; } }
      if (before !== drag.row.nextElementSibling) before ? drag.group.insertBefore(drag.row, before) : drag.group.appendChild(drag.row);
      if (y < 80) window.scrollBy(0, -10); else if (y > window.innerHeight - 60) window.scrollBy(0, 10);
    };
    const end = () => {
      if (!drag) return;
      drag.row.classList.remove('dragging');
      document.body.classList.remove('is-dragging');
      drag = null;
      onDone();
    };
    // touch (iPhone / iPad): touch events with a non-passive move so we can stop scrolling
    pane.addEventListener('touchstart', e => { const h = e.target.closest('.vdrag'); if (h) { e.preventDefault(); start(e, h); } }, { passive: false });
    // mouse / pen
    pane.addEventListener('pointerdown', e => { if (e.pointerType === 'touch') return; const h = e.target.closest('.vdrag'); if (h) { e.preventDefault(); start(e, h); } });
    const opts = { passive: false };
    document.addEventListener('touchmove', move, opts);
    const pmove = e => { if (e.pointerType !== 'touch') move(e); }, pup = e => { if (e.pointerType !== 'touch') end(); };
    document.addEventListener('pointermove', pmove); document.addEventListener('pointerup', pup);
    document.addEventListener('touchend', end); document.addEventListener('touchcancel', end);
    const off = () => {
      document.removeEventListener('touchmove', move, opts); document.removeEventListener('pointermove', pmove); document.removeEventListener('pointerup', pup);
      document.removeEventListener('touchend', end); document.removeEventListener('touchcancel', end);
    };
    const prev = cleanup; cleanup = () => { off(); prev && prev(); };
    pane.addEventListener('click', e => { if (e.target.closest('.vdrag')) e.stopPropagation(); }, true);
  }

  /* ----- 1 · vocabulary ----- */
  function paneVocab(ctx, mode = store.get('vmode', 'list')) {
    if (mode === 'listen') { mode = 'write'; store.set('vauto', true); }
    const { lecon, pane } = ctx;
    store.set('vmode', mode);
    const head = modeBar([['list', bi('浏览', 'Browse')], ['test', bi('首测', 'First test')], ['write', bi('默写', 'Dictation')], ['conj', bi('动词变位', 'Conjugation')]], mode);
    if (mode === 'list') {
      const groups = [];
      orderedVocab(ctx.book.id, lecon).forEach(v => { let g = groups.find(x => x.g === v.g); if (!g) groups.push(g = { g: v.g, items: [] }); g.items.push(v); });
      const custom = !!store.get(orderKey(ctx.book.id, lecon.n), null);
      const mst = MASTER.get(ctx.book.id, lecon.n);
      const hide = store.get('vhide', false), showTip = store.get('vtip', true);
      pane.innerHTML = head.replace('<span class="spacer"></span>', `<span class="spacer"></span>
          <label class="kbd" style="display:flex;gap:6px;align-items:center"><input type="checkbox" id="vhide" ${hide ? 'checked' : ''}> ${bi('遮住法语', 'Hide French')}</label>
          <label class="kbd" style="display:flex;gap:6px;align-items:center"><input type="checkbox" id="vtip" ${showTip ? 'checked' : ''}> ${bi('记忆提示', 'Memory tips')}</label>
          <button class="btn ghost small" id="vplay">${ICON.play} ${bi('全部朗读', 'Read all')}</button>`) +
        `<p class="hint-text">${bi('按住左边的 ⠿ 拖动，可以在同一组里调整单词顺序。', 'Drag ⠿ on the left to reorder words within a group.')}${custom ? ` <a href="#" id="vreset">${bi('恢复课本顺序', 'Restore book order')}</a>` : ''}</p>` +
        groups.map(g => `<div class="vgroup" data-g="${esc(g.g || '')}"><h3>${esc(g.g || '')}</h3>${g.items.map(v => `
          <div class="vrow ${hide ? 'hidefr' : ''} ${mst.w[v.fr] ? 'mastered' : ''} ${gender(v.pos) ? 'g-' + gender(v.pos) : ''}" data-say="${esc(forms(v.fr).say)}" data-fr="${esc(v.fr)}">
            <span class="vdrag" title="${bi('拖动调整顺序', 'Drag to reorder')}" aria-label="${bi('拖动调整顺序', 'Drag to reorder')}">⠿</span>
            <span class="play">${ICON.play}</span>
            <span class="vzh">${G(v)}</span><span class="pos">${esc(v.pos)}</span>
            <span class="vfr" lang="fr">${artHint(v)}${esc(v.fr)}${window.DEEP && DEEP[v.fr] ? `<button class="deep-btn" data-deep="${esc(v.fr)}" lang="zh">${bi('详解', 'In depth')}</button>` : ''}</span>
            ${wordTip(lecon.n, v) ? `<span class="vtip" ${showTip ? '' : 'hidden'}>${wordTip(lecon.n, v)}</span>` : ''}</div>`).join('')}</div>`).join('');
      enableDrag(pane, () => { saveOrder(ctx.book.id, lecon.n, pane); if (!$('#vreset', pane)) paneVocab(ctx, 'list'); });
      const rs = $('#vreset', pane); if (rs) rs.onclick = e => { e.preventDefault(); store.set(orderKey(ctx.book.id, lecon.n), null); paneVocab(ctx, 'list'); };
      $('#vtip').onchange = e => { store.set('vtip', e.target.checked); $$('.vtip', pane).forEach(t => t.hidden = !e.target.checked); };
      $('#vhide').onchange = e => { store.set('vhide', e.target.checked); $$('.vrow', pane).forEach(r => r.classList.toggle('hidefr', e.target.checked)); };
      let stopper = null;
      $('#vplay').onclick = e => {
        const btn = e.currentTarget;
        if (stopper) { stopper(); stopper = null; btn.innerHTML = ICON.play + ' 全部朗读'; return; }
        const rows = $$('.vrow', pane);
        btn.innerHTML = ICON.stop + ' 停止';
        stopper = speakSeq(rows.map(r => r.dataset.say), i => {
          rows.forEach((r, k) => r.style.background = k === i ? 'var(--wash-blue)' : '');
          if (i >= 0) rows[i].scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        }, () => { stopper = null; btn.innerHTML = ICON.play + ' 全部朗读'; });
        const prevC = cleanup; cleanup = () => { stopper && stopper(); prevC && prevC(); };
      };
    } else {
      if (mode === 'conj') { pane.innerHTML = head + '<div id="drill"></div>'; bindModes(pane, m => paneVocab(ctx, m)); return conjPane(ctx, $('#drill', pane)); }
      pane.innerHTML = head + '<div id="drill"></div>';
      const box = $('#drill', pane);
      if (mode === 'test') {
        const st = MASTER.stats(ctx.book.id, lecon);
        box.innerHTML = `<div class="drill summary"><p class="kicker" lang="fr">Premier test</p>
          <h2 style="font-size:30px;margin-bottom:10px">本课词汇首测</h2>
          <p class="hint-text" style="margin:0 0 18px">把这一课 ${lecon.vocab.length} 个词全部默写一遍，不能用提示。<br>写对的直接算掌握，以后不用再复习；写错的<b>不进错题本</b>，之后在「默写」里练，第一次就写对也算掌握。同一个词在首测里累计错满 3 次，会自动加入错题本。</p>
          ${st.test ? `<p class="kbd">上次首测：${st.test}</p>` : ''}
          <button class="btn" id="go">${st.test ? '再测一次' : '开始首测'}</button></div>`;
        $('#go', box).onclick = () => wordDrill(ctx, box, 'test', lecon.vocab);
      } else {
        const m = MASTER.get(ctx.book.id, lecon.n);
        const onlyNew = store.get('vonlynew', true);
        const rest = lecon.vocab.filter(v => !m.w[v.fr]);
        const words = onlyNew ? rest : lecon.vocab;
        box.insertAdjacentHTML('beforebegin', `<label class="kbd" style="display:flex;gap:6px;align-items:center;justify-content:center;margin:0 0 14px"><input type="checkbox" id="onlynew" ${onlyNew ? 'checked' : ''}> 只练还没掌握的词（${rest.length} 个）</label>`);
        $('#onlynew', pane).onchange = e => { store.set('vonlynew', e.target.checked); paneVocab(ctx, mode); };
        if (!words.length) box.innerHTML = `<div class="drill summary"><div class="score" style="font-size:44px">通过</div><p>这一课的词汇已经全部掌握。取消上面的勾选可以再全部练一遍。</p></div>`;
        else wordDrill(ctx, box, mode, words);
      }
    }
    bindModes(pane, m => paneVocab(ctx, m));
  }

  function wordDrill(ctx, box, mode, words) {
    const order = store.get('vorder', 'shuffle');
    const mine = orderedVocab(ctx.book.id, ctx.lecon);
    let queue = order === 'shuffle' ? shuffle(words) : words.slice().sort((a, b) => mine.indexOf(a) - mine.indexOf(b));
    let i = 0, wrong = [], firstTry = 0, answered = false, hintN = 0;
    const test = mode === 'test', auto = store.get('vauto', false);
    const draw = () => {
      if (i >= queue.length) return done();
      const v = queue[i]; answered = false; hintN = 0;
      box.innerHTML = `<div class="drill">
        <div class="count">${i + 1} / ${queue.length}</div>
        <div class="bar"><i style="width:${i / queue.length * 100}%"></i></div>
        <div class="prompt"><div class="pmean">${MEAN(v)}</div>
          <div class="ppos">${playBtn(forms(v.fr).say)} <span class="pos ${gender(v.pos) ? 'g-' + gender(v.pos) : ''}">${esc(v.pos)}</span>${v.g ? ' · ' + esc(tr(v.g)) : ''}</div></div>
        <input class="answer-in" id="ans" lang="fr" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="${bi('用法语写…', 'Write in French…')}">
        <div class="drill-actions">
          ${test ? '' : '<button class="btn ghost small" id="hint">提示一个字母</button>'}
          <button class="btn ghost small" id="skip">${bi('不会，看答案', 'Show answer')}</button>
          <button class="btn ghost small stuck-btn" id="stuck">${bi('卡住了', 'I\'m stuck')}</button>
          <span class="spacer"></span>
          <span class="kbd"><kbd>Enter</kbd> 检查 / 下一个</span>
        </div>
        <div id="fb"></div>
        <div class="kbd" style="margin-top:14px;display:flex;gap:18px;flex-wrap:wrap"><span>顺序：
          <a href="#" id="ord">${order === 'shuffle' ? '随机（点击改为列表顺序）' : '列表顺序（点击改为随机）'}</a></span>
          <label><input type="checkbox" id="vauto" ${auto ? 'checked' : ''}> ${bi('每题自动朗读', 'Play each word automatically')}</label></div>
      </div>`;
      const inp = $('#ans', box);
      inp.focus();
      if (auto) setTimeout(() => TTS.say(forms(v.fr).say), 200);
      $('#vauto', box).onchange = e => { store.set('vauto', e.target.checked); wordDrill(ctx, box, mode, words); };
      inp.onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); answered ? (i++, draw()) : check(); } };
      if (!test) $('#hint', box).onclick = () => {
        const target = forms(v.fr).accept[0];
        hintN = Math.min(hintN + 1, target.length);
        inp.value = target.slice(0, hintN); inp.focus();
      };
      $('#skip', box).onclick = () => check(true);
      // "I'm stuck": first a nudge (sound + first letter), then put the word at the end of this round
      let stuckN = 0;
      $('#stuck', box).onclick = () => {
        const inp = $('#ans', box);
        if (!stuckN++) {
          TTS.say(forms(v.fr).say);
          if (!test) { hintN = Math.max(hintN, 1); inp.value = forms(v.fr).accept[0].slice(0, hintN); }
          $('#stuck', box).textContent = bi('还是不会，先跳过', 'Still stuck — skip for now');
          inp.focus();
        } else if (queue.length - i > 1) { queue.push(queue.splice(i, 1)[0]); draw(); }
        else check(true);
      };
      $('#ord', box).onclick = e => { e.preventDefault(); store.set('vorder', order === 'shuffle' ? 'book' : 'shuffle'); wordDrill(ctx, box, mode, words); };
    };
    const check = (giveUp = false) => {
      const v = queue[i], inp = $('#ans', box);
      const r = giveUp ? 'bad' : checkWord(inp.value, v.fr);
      if (r === 'empty') return;
      answered = true;
      const fb = $('#fb', box);
      const good = r === 'ok';
      if (good && !hintN) firstTry++;
      const it = { book: ctx.book.id, n: ctx.lecon.n, kind: 'word', fr: v.fr, zh: v.zh, en: v.en, pos: v.pos };
      const bk = ctx.book.id, ln = ctx.lecon.n;
      if (good && !hintN) XP.gain(2, '一次写对');
      if (!good && !giveUp && inp.value.trim()) ERRS.typed(closest(v.fr, inp.value), inp.value);
      let toBook = false, missN = 0;
      if (!good || hintN) {
        wrong.push(v);
        if (!test) { SRS.miss(it, giveUp ? '' : inp.value); MASTER.word(bk, ln, v.fr, false); }
        else {
          // the first test keeps misses out of the mistake book — unless the same word is missed 3 times
          const tk = `testmiss:${bk}:${ln}`, tm = store.get(tk, {});
          tm[v.fr] = (tm[v.fr] || 0) + 1; store.set(tk, tm);
          if (tm[v.fr] >= 3 && !inReview(bk, ln, v.fr)) { SRS.miss(it, giveUp ? '' : inp.value); toBook = true; }
          missN = tm[v.fr];
        }
      } else if (test || !inReview(bk, ln, v.fr)) MASTER.word(bk, ln, v.fr);
      else SRS.hit(it);
      fb.innerHTML = `<div class="feedback ${r}">
        <span class="lab">${good ? (hintN ? '对了（用了提示）' : '完全正确') : r === 'accent' ? '差一点：注意重音符号' : giveUp ? '答案' : '不对，正确答案是'}</span>
        <div class="ans" lang="fr">${playBtn(forms(v.fr).say)} ${r === 'accent' ? accentDiff(inp.value.trim(), v.fr) : esc(v.fr)}</div>
        ${r === 'accent' ? `<span class="lab acc-note">${bi('拼写正确，注意标出的重音符号', 'Spelling is right — check the marked accents')}</span>` : ''}
        ${test && missN ? `<span class="lab">${toBook ? bi(`首测已经错了 ${missN} 次，加入错题本了`, `Missed ${missN} times in first tests — added to the mistake book`) : missN >= 3 ? bi('已经在错题本里了', 'Already in the mistake book') : bi(`首测错了 ${missN} 次（错满 3 次会进错题本）`, `Missed ${missN} times in first tests (3 puts it in the mistake book)`)}</span>` : ''}
        ${tipBox(wordTip(ctx.lecon.n, v))}</div>`;
      TTS.say(forms(v.fr).say);
      if (good && !hintN) setTimeout(() => { if (answered && queue[i] === v) { i++; draw(); } }, wordTip(ctx.lecon.n, v) ? 1800 : 1100);
    };
    const done = () => {
      if (test) { const m = MASTER.get(ctx.book.id, ctx.lecon.n); m.test = dayStr(); MASTER.put(ctx.book.id, ctx.lecon.n, m); }
      const st = MASTER.stats(ctx.book.id, ctx.lecon);
      const score = firstTry / queue.length;
      if (queue.length === words.length || score === 1) ctx.save('vocab', score);
      box.innerHTML = `<div class="drill summary">
        <p class="kicker" lang="fr">Bilan</p>
        <div class="score">${Math.round(score * 100)}%</div>
        <p>${queue.length} 个里一次写对 ${firstTry} 个 · 本课词汇已掌握 ${st.words}/${st.totalWords}${st.vocabDone ? ' · <b>词汇通过</b>' : ''}</p>
        ${test && wrong.length ? '<p class="kbd">写错的词没有进错题本，去「默写」里练它们。</p>' : ''}
        ${wrong.length ? `<ul>${wrong.map(v => `<li><span lang="fr">${esc(v.fr)}</span><span class="w-zh">${G(v)}</span></li>`).join('')}</ul>` : '<p>全部正确，很棒。</p>'}
        <div class="drill-actions" style="justify-content:center">
          ${wrong.length ? '<button class="btn" id="again-wrong">只练错的</button>' : ''}
          <button class="btn ghost" id="again">重新开始</button>${slipBtn('slip')}</div></div>`;
      $('#slip', box).onclick = () => printSlip(`${ctx.lecon.n ? 'LEÇON ' + ctx.lecon.n : bi('生词本', 'MES MOTS')} · ${test ? bi('首测', 'PREMIER TEST') : bi('默写', 'DICTÉE')}`,
        [pad(bi('题数', 'Mots'), queue.length), pad(bi('一次写对', 'Du premier coup'), firstTry), pad(bi('正确率', 'Score'), Math.round(score * 100) + ' %'), pad(bi('已掌握', 'Appris'), st.words + '/' + st.totalWords),
          ...(wrong.length ? ['', bi('要再看看：', 'À revoir :'), ...wrong.slice(0, 12).map(v => '  ' + v.fr)] : ['', bi('全部正确！', 'Sans faute !')])]);
      const w = wrong.slice();
      $('#again', box).onclick = () => route();
      if (w.length) $('#again-wrong', box).onclick = () => { queue = shuffle(w); i = 0; wrong = []; firstTry = 0; draw(); };
    };
    draw();
  }

  /* ----- verb conjugation (présent) ----- */
  const IRREG = {
    'être': 'suis es est sommes êtes sont', 'avoir': 'ai as a avons avez ont',
    'aller': 'vais vas va allons allez vont', 'faire': 'fais fais fait faisons faites font',
    'prendre': 'prends prends prend prenons prenez prennent', 'partir': 'pars pars part partons partez partent',
    'appeler': 'appelle appelles appelle appelons appelez appellent',
    'dormir': 'dors dors dort dormons dormez dorment', 'endormir': 'endors endors endort endormons endormez endorment',
    'sortir': 'sors sors sort sortons sortez sortent', 'écrire': 'écris écris écrit écrivons écrivez écrivent',
    'lire': 'lis lis lit lisons lisez lisent', 'voir': 'vois vois voit voyons voyez voient',
    'reprendre': 'reprends reprends reprend reprenons reprenez reprennent', 'détendre': 'détends détends détend détendons détendez détendent',
    'lever': 'lève lèves lève levons levez lèvent', 'promener': 'promène promènes promène promenons promenez promènent',
    'manger': 'mange manges mange mangeons mangez mangent', 'nager': 'nage nages nage nageons nagez nagent',
    'commencer': 'commence commences commence commençons commencez commencent',
    'acheter': 'achète achètes achète achetons achetez achètent', 'boire': 'bois bois boit buvons buvez boivent',
    'venir': 'viens viens vient venons venez viennent', 'revenir': 'reviens reviens revient revenons revenez reviennent',
    'descendre': 'descends descends descend descendons descendez descendent', 'recommencer': 'recommence recommences recommence recommençons recommencez recommencent',
  };
  const TIPS = {
    'être': '完全不规则，整串背：je suis · tu es · il est / nous sommes · vous êtes · ils sont。',
    'avoir': "j'ai · tu as · il a / nous avons · vous avez · ils ont。小心 ils ont（有，s 连读成 z）和 ils sont（是）。",
    'aller': '单数和 ils 都以 v 开头：vais · vas · va · vont；只有 nous / vous 用词根 all-：allons · allez。',
    'faire': 'fais · fais · fait（单数发音一样）；vous faites（不是 faisez！），ils font。',
    'prendre': '单数 prend-（d 不发音）：prends · prends · prend；nous/vous 去掉 d：prenons · prenez；ils 双 n：prennent。',
    'partir': '单数去掉词根的 t：pars · pars · part；复数把 t 加回来：partons · partez · partent。',
    'dormir': '单数去掉 m：dors · dors · dort；复数保留 m：dormons · dormez · dorment。同类：sortir、partir（去掉辅音再加 -s -s -t）。',
    'endormir': "en + dormir，变位和 dormir 一样：je m'endors · nous nous endormons。",
    'sortir': '同 partir、dormir：单数去掉 t → sors · sors · sort；复数加回：sortons · sortez · sortent。',
    'écrire': '单数 écri- + s s t：écris · écris · écrit；复数多一个 v：écrivons · écrivez · écrivent。',
    'lire': '单数 li- + s s t：lis · lis · lit；复数加 s 读 [z]：lisons · lisez · lisent。',
    'voir': '单数 voi- + s s t；nous/vous 的 i 变 y：voyons · voyez；ils voient（回到 i）。',
    'reprendre': 're + prendre，变位完全同 prendre：reprends · reprenons · reprennent。',
    'détendre': '-re 规则动词：去掉 -re 得词根 détend-，加 -s · -s · （无）· -ons · -ez · -ent：il se détend（d 不发音）。',
    'lever': '词尾不发音时 e 变 è：lève · lèves · lève · lèvent；nous/vous 不变：levons · levez。同类：promener。',
    'promener': '同 lever：词尾不发音时 e 变 è：promène · promènent；nous promenons。',
    'manger': '只有 nous 特殊：mangeons 加 e，让 g 保持 [ʒ] 音；其他按 -er 规则。同类：nager。',
    'nager': '同 manger：nous nageons 加 e 保持 g 软音。',
    'commencer': '只有 nous 特殊：commençons 用 ç，让 c 在 o 前保持 [s] 音。同类：recommencer。',
    'recommencer': 're + commencer：nous recommençons 用 ç。',
    'acheter': '词尾不发音时 e 变 è：achète · achètes · achète · achètent；nous / vous 不变：achetons · achetez。同 lever。',
    'boire': '完全不规则：bois · bois · boit / buvons · buvez · boivent。nous / vous 用 buv-，ils 用 boiv-。',
    'venir': '单数 vien- + s s t：viens · viens · vient；nous / vous 用 ven-：venons · venez；ils 双 n：viennent。复合过去时用 être。',
    'revenir': 're + venir，变位完全同 venir：reviens · revenons · reviennent。',
    'descendre': '-re 规则动词：去掉 -re 得 descend-，加 -s · -s · （无）· -ons · -ez · -ent：il descend（d 不发音）。复合过去时用 être。',
    'appeler': "词根 appel + er。词尾不发音的 je / tu / il / ils 写双 l：appelle · appelles · appelle · appellent；nous / vous 单 l：appelons · appelez。代词跟着人称变：me · te · se · nous · vous · se，元音前省略成 m' t' s'。",
  };
  function verbTip(fr) {
    if (L() === 'zhen') return verbTipIn(fr, 'zh') + `<span class="tip-en" lang="en">${verbTipIn(fr, 'en')}</span>`;
    return verbTipIn(fr, L());
  }
  function verbTipIn(fr, lang) {
    const inf = fr.replace(/\s*\((s'|se)\)/, '').trim();
    const root = inf.slice(0, -2);
    if (lang === 'en') {
      const E = window.VERB_TIPS_EN || {};
      if (E[inf]) return esc(E[inf]);
      return `<b lang="fr">${esc(root)}</b> + <b lang="fr">er</b> — a regular -er verb. Drop -er to get the stem ${esc(root)}-, then add -e · -es · -e · -ons · -ez · -ent. je / tu / il / ils all sound the same (-es and -ent are silent).` +
        (vowel(inf) ? ` It starts with a vowel, so je becomes <span lang="fr">j'${esc(root)}e</span>.` : '');
    }
    if (TIPS[inf]) return TIPS[inf];
    return `<b lang="fr">${esc(root)}</b> + <b lang="fr">er</b>，第一组规则动词。去掉 -er 留下词根 ${esc(root)}-，再加词尾 -e · -es · -e · -ons · -ez · -ent。je / tu / il / ils 四个读音一样（-es、-ent 不发音）。` +
      (vowel(inf) ? `以元音开头，所以 je 要省略成 <span lang="fr">j'${esc(root)}e</span>。` : '');
  }
  const PRON = ['je', 'tu', 'il/elle', 'nous', 'vous', 'ils/elles'];
  const REFL = ['me', 'te', 'se', 'nous', 'vous', 'se'];
  const vowel = w => /^[aeiouyhâàéèêîïôûœ]/i.test(w);
  function conjugate(fr) {
    const refl = /\((s'|se)\)/.test(fr);
    const inf = fr.replace(/\s*\((s'|se)\)/, '').trim();
    const forms = IRREG[inf] ? IRREG[inf].split(' ')
      : inf.endsWith('er') ? ['e', 'es', 'e', 'ons', 'ez', 'ent'].map(e => inf.slice(0, -2) + e) : null;
    if (!forms) return null;
    return forms.map((f, i) => {
      let pr = PRON[i];
      if (i === 2 || i === 5) pr = pr.split('/')[Math.random() < .5 ? 0 : 1];
      let body = f;
      if (refl) body = (vowel(f) && REFL[i].length === 2 && i !== 3 && i !== 4 ? REFL[i][0] + "'" : REFL[i] + ' ') + f;
      const text = i === 0 && vowel(body) ? "j'" + body : pr + ' ' + body;
      return { p: PRON[i], text, form: f, body, i };
    });
  }
  function wordTip(n, v) {
    const pick = T => T[n + ':' + v.fr] || T[v.fr];
    const fmt = t => esc(t).replace(/\{([^}]+)\}/g, '<b lang="fr">$1</b>');
    const zh = pick(window.TIPS || {}), en = pick(window.TIPS_EN || {});
    if (L() === 'en' && en) return fmt(en);
    if (L() === 'zhen' && zh && en) return fmt(zh) + `<span class="tip-en" lang="en">${fmt(en)}</span>`;
    if (zh) return fmt(zh);
    return v.pos && v.pos.startsWith('v') && conjugate(v.fr) ? verbTip(v.fr) : '';
  }
  const tipBox = html => html ? `<div class="tip"><span class="tip-lab">记忆提示</span>${html}</div>` : '';

  const isSpecial = fr => !!IRREG[fr.replace(/\s*\((s'|se)\)/, '').trim()];
  const lessonVerbs = lecon => lecon.vocab.filter(v => v.pos.startsWith('v') && conjugate(v.fr)).map(v => ({ ...v, n: lecon.n }))
    .filter((v, i, a) => a.findIndex(x => x.fr === v.fr) === i);

  // 动词变位: a table to study every form, plus a dictation of the irregular ones only
  function conjPane(ctx, box, view = store.get('conjview', 'table')) {
    store.set('conjview', view);
    const verbs = lessonVerbs(ctx.lecon), special = verbs.filter(v => isSpecial(v.fr));
    box.innerHTML = `<div class="modes sub">
        <button class="mode" data-cv="table" aria-pressed="${view === 'table'}">${bi('变位表', 'Conjugation table')}</button>
        <button class="mode" data-cv="drill" aria-pressed="${view === 'drill'}">${bi('特殊变位听写', 'Irregular verbs dictation')}${special.length ? ` (${special.length})` : ''}</button>
      </div><div id="cv"></div>`;
    $$('[data-cv]', box).forEach(b => b.onclick = () => conjPane(ctx, box, b.dataset.cv));
    const inner = $('#cv', box);
    if (!verbs.length) { inner.innerHTML = '<p class="notice">这一课没有要变位的动词。</p>'; return; }
    if (view === 'drill') {
      if (!special.length) { inner.innerHTML = '<p class="notice">这一课的动词都是规则变化，看变位表记住词尾就好。</p>'; return; }
      return conjDrill(ctx, inner, special);
    }
    conjTable(ctx, inner, verbs);
  }

  function conjTable(ctx, box, verbs) {
    const cover = store.get('conjcover', false);
    const ends = ['e', 'es', 'e', 'ons', 'ez', 'ent'];
    const row = (v, c) => {
      const inf = v.fr.replace(/\s*\((s'|se)\)/, '').trim();
      const reg = inf.endsWith('er') ? inf.slice(0, -2) + ends[c.i] : null;
      const pron = c.i === 0 && /^j'/.test(c.text) ? "j'" : PRON[c.i];
      const pre = c.body.slice(0, c.body.length - c.form.length);
      let verb;
      if (reg && c.form === reg && !isSpecial(v.fr)) verb = `${esc(pre)}${esc(inf.slice(0, -2))}<b class="ce">${esc(ends[c.i])}</b>`;
      else if (reg && c.form === reg) verb = `${esc(pre)}${esc(c.form)}`;
      else verb = `${esc(pre)}<b class="ci">${esc(c.form)}</b>`;
      const say = (pron === "j'" ? '' : pron.split('/')[0] + ' ') + (pron === "j'" ? c.text : c.body);
      return `<tr data-say="${esc(say)}"><td class="cp">${esc(pron)}</td><td class="cf" lang="fr">${verb}</td></tr>`;
    };
    box.innerHTML = `<div class="toolbar">
        <label class="kbd" style="display:flex;gap:6px;align-items:center"><input type="checkbox" id="ccover" ${cover ? 'checked' : ''}> ${bi('遮住变位（自测）', 'Cover the forms (self-test)')}</label>
        <span class="spacer"></span><span class="kbd">${bi('蓝色 = 规则词尾 · 红色 = 特殊变化 · 点一行听发音', 'blue = regular ending · red = irregular · tap a row to hear it')}</span></div>
      <div class="ctables ${cover ? 'covered' : ''}">${verbs.map(v => {
        const cs = conjugate(v.fr).map((c, i) => ({ ...c, i }));
        const all = cs.map(c => c.text.replace(/^(il|elle|ils|elles) /, m => m)).join(', ');
        return `<section class="ctable">
          <header><span class="cinf" lang="fr">${esc(forms(v.fr).say)}</span>${playBtn(all)}
            <span class="ctag ${isSpecial(v.fr) ? 'sp' : ''}">${isSpecial(v.fr) ? bi('特殊', 'irregular') : bi('规则', 'regular')}</span>
            <div class="cmean">${G(v)}</div></header>
          <table>${cs.map(c => row(v, c)).join('')}</table>
          ${tipBox(verbTip(v.fr))}</section>`;
      }).join('')}</div>`;
    $('#ccover', box).onchange = e => { store.set('conjcover', e.target.checked); $('.ctables', box).classList.toggle('covered', e.target.checked); };
  }

  function conjDrill(ctx, box, verbs) {
    const { book, lecon } = ctx;
    let see = store.get('conjsee', false);
    const queue = shuffle(verbs.flatMap(v => conjugate(v.fr).map(c => ({ v, c }))));
    let i = 0, answered = false, right = 0;
    const draw = () => {
      if (i >= queue.length) {
        box.innerHTML = `<div class="drill summary"><p class="kicker" lang="fr">Bilan</p><div class="score">${right} / ${queue.length}</div>
          <p>${verbs.map(v => esc(v.fr)).join(' · ')}</p>
          <div class="drill-actions" style="justify-content:center"><button class="btn" id="again">再来一遍</button></div></div>`;
        $('#again', box).onclick = () => conjDrill(ctx, box, verbs);
        return;
      }
      const { v, c } = queue[i]; answered = false;
      box.innerHTML = `<div class="drill">
        <div class="count">${i + 1} / ${queue.length}</div>
        <div class="bar"><i style="width:${i / queue.length * 100}%"></i></div>
        <div class="prompt">${see
          ? `<div class="pzh" lang="fr" style="font-family:var(--serif)">${esc(forms(v.fr).say)} · <b>${esc(c.text.split(' ')[0].replace(/^j'.*/, 'je'))}</b></div><div class="ppos">${G(v)} · 现在时</div>`
          : `${playBtn(c.text, 'big')}<div class="ppos">听，然后写下「主语 + 动词」· 现在时</div>`}</div>
        <input class="answer-in" id="ans" lang="fr" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="例如：nous parlons">
        <div class="drill-actions">
          <button class="btn ghost small" id="skip">${bi('不会，看答案', 'Show answer')}</button><span class="spacer"></span>
          <span class="kbd"><kbd>Enter</kbd> 检查 / 下一个</span></div>
        <div id="fb"></div>
        <details class="tips-all"><summary>本组动词的记忆提示</summary>${verbs.map(x => `<div class="tip"><span class="tip-lab" lang="fr">${esc(x.fr)}</span>${verbTip(x.fr)}</div>`).join('')}</details>
        <div class="kbd" style="margin-top:14px;display:flex;gap:16px;flex-wrap:wrap">
          <label><input type="checkbox" id="see" ${see ? 'checked' : ''}> 看提示写（不听）</label>
        </div></div>`;
      const inp = $('#ans', box); inp.focus();
      if (!see) setTimeout(() => TTS.say(c.text), 200);
      inp.onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); answered ? (i++, draw()) : check(); } };
      $('#skip', box).onclick = () => check(true);
      $('#see', box).onchange = e => { see = e.target.checked; store.set('conjsee', see); draw(); };
    };
    const check = (giveUp = false) => {
      const { v, c } = queue[i], val = $('#ans', box).value;
      if (!val.trim() && !giveUp) return;
      answered = true;
      const a = norm(val), t = norm(c.text);
      const pronounFree = norm(c.text.replace(/^(je|j'|tu|il|elle|nous|vous|ils|elles)\s*/, ''));
      let r = giveUp ? 'bad' : (a === t ? 'ok' : strip(a) === strip(t) ? (settings.lenient ? 'ok' : 'accent') : a === pronounFree ? 'pron' : 'bad');
      const good = r === 'ok';
      if (!good && !giveUp && r !== 'pron') ERRS.typed(c.text, val);
      if (good) { right++; XP.gain(1, '变位正确'); }
      const it = { book: book.id, n: v.n, kind: 'word', fr: c.text, zh: `${forms(v.fr).say} · ${c.p}（现在时）`, en: `${forms(v.fr).say} · ${c.p} (present tense)`, pos: '变位' };
      good ? SRS.hit(it) : SRS.miss(it, giveUp ? '' : val);
      $('#fb', box).innerHTML = `<div class="feedback ${good ? 'ok' : r === 'bad' ? 'bad' : 'accent'}">
        <span class="lab">${good ? '正确' : r === 'accent' ? '差一点：注意重音' : r === 'pron' ? '动词对了，记得连主语一起写' : '正确答案'}</span>
        <div class="ans" lang="fr">${playBtn(c.text)} ${esc(c.text)} <span class="kbd" style="font-family:var(--zh)">${esc(v.fr)} · ${G(v)}</span></div>
        <div class="tip"><span class="tip-lab">记忆提示</span>${verbTip(v.fr)}</div></div>`;
      if (see || !good) TTS.say(c.text);
      if (good) setTimeout(() => { if (answered && queue[i] && queue[i].c === c) { i++; draw(); } }, 1600);
    };
    draw();
  }

  /* ----- 2 · sentences ----- */
  function panePhrases(ctx, mode = store.get('pmode', 'cloze')) {
    const { lecon, pane } = ctx;
    store.set('pmode', mode);
    pane.innerHTML = modeBar([['cloze', bi('课文填空', 'Fill the gaps')], ['zh2fr', bi('逐句中译法', L() === 'zhen' ? '逐句翻译' : 'Translate')], ['dictee', bi('逐句听写', 'Dictation')]], mode) + '<div id="pbody"></div>';
    bindModes(pane, m => panePhrases(ctx, m));
    const body = $('#pbody', pane);
    if (mode === 'cloze') cloze(ctx, body);
    else sentenceDrill(ctx, body, mode);
  }

  function cloze(ctx, body) {
    const { lecon } = ctx;
    if (!lecon.cloze) { body.innerHTML = '<p class="notice">这一课没有填空题。</p>'; return; }
    let blank = 0;
    const heads = new Set(lecon.text.filter(r => r.h).map(r => r.h));
    const lineText = row => row.map(s => typeof s === 'string' ? s : s.b).join('');
    body.innerHTML = `<p class="hint-text">根据记忆补全课文里的空。<kbd>Enter</kbd> 跳到下一个空，最后点「检查」。</p>
      <div class="textblock">${lecon.cloze.map(row => {
        const blanks = row.filter(s => typeof s !== 'string').length;
        const full = lineText(row);
        if (!blanks && heads.has(full.trim())) return `<div class="tline h" lang="fr">${esc(full)}</div>`;
        return `<div class="tline"><div class="row">${playBtn(full)}<div class="body lfr" lang="fr">${row.map(s => typeof s === 'string' ? esc(s)
          : `<input class="cloze-in" data-i="${blank++}" data-a="${esc(s.b)}" size="${Math.max(3, s.b.length + 1)}" autocomplete="off" autocapitalize="off" spellcheck="false" aria-label="填空">`).join('')}</div></div></div>`;
      }).join('')}</div>
      <div class="toolbar" style="margin-top:16px"><button class="btn" id="ccheck">${bi('检查', 'Check')}</button><button class="btn ghost" id="cshow">${bi('显示答案', 'Show answers')}</button><button class="btn ghost" id="cclear">${bi('清空', 'Clear')}</button><span class="spacer"></span><span class="scorebox" id="cscore"></span></div>`;
    const ins = $$('.cloze-in', body);
    ins.forEach((inp, k) => inp.onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); (ins[k + 1] || $('#ccheck', body)).focus(); } });
    ins[0] && ins[0].focus();
    const clearMarks = () => { $$('.cloze-fix', body).forEach(x => x.remove()); ins.forEach(i => i.classList.remove('ok', 'bad', 'accent')); };
    $('#ccheck', body).onclick = () => {
      clearMarks();
      let ok = 0;
      ins.forEach(inp => {
        let r = checkWord(inp.value, inp.dataset.a);
        if (r === 'empty') r = 'bad';
        inp.classList.add(r);
        const row = inp.closest('.lfr');
        const ctxLine = [...row.childNodes].map(nd => nd === inp ? '____' : nd.nodeType === 3 ? nd.textContent : nd.tagName === 'INPUT' ? nd.dataset.a : '').join('');
        const it = { book: ctx.book.id, n: ctx.lecon.n, kind: 'cloze', fr: inp.dataset.a, zh: ctxLine.trim() };
        if (r === 'ok') { ok++; SRS.hit(it); }
        else SRS.miss(it, inp.value), inp.value.trim() && ERRS.typed(inp.dataset.a, inp.value), inp.insertAdjacentHTML('afterend', `<span class="cloze-fix">${esc(inp.dataset.a)}</span>`);
      });
      XP.gain(ok, `填空 ${ok} 个正确`);
      const s = ok / ins.length;
      $('#cscore', body).innerHTML = `<b>${ok}</b> / ${ins.length}`;
      ctx.save('phrases', s);
    };
    $('#cshow', body).onclick = () => { clearMarks(); ins.forEach(i => { i.value = i.dataset.a; }); };
    $('#cclear', body).onclick = () => { clearMarks(); ins.forEach(i => { i.value = ''; }); $('#cscore', body).textContent = ''; ins[0].focus(); };
  }

  function sentenceDrill(ctx, body, mode) {
    const list = sentences(ctx.lecon);
    const dictee = mode === 'dictee';
    let i = 0, answered = false;
    const scores = new Array(list.length).fill(null);
    const draw = () => {
      if (i >= list.length) return done();
      const s = list[i]; answered = false;
      body.innerHTML = `<div class="drill">
        <div class="count">${i + 1} / ${list.length}</div>
        <div class="bar"><i style="width:${i / list.length * 100}%"></i></div>
        <div class="prompt">${dictee ? playBtn(s.fr, 'big') + '<div class="ppos">听，然后写下来 · 可反复点播放</div>'
          : `<div class="pzh ${s.zh.length > 30 ? 'long' : ''}">${G(s)}</div>`}</div>
        <textarea class="answer-in" id="ans" lang="fr" rows="2" autocapitalize="off" spellcheck="false" placeholder="${bi('写出法语句子…', 'Write the French sentence…')}"></textarea>
        <div class="drill-actions">
          ${dictee ? '' : playBtn(s.fr)}
          <button class="btn ghost small" id="prev" ${i ? '' : 'disabled'}>上一句</button>
          <button class="btn ghost small" id="skip">看答案</button>
          <span class="spacer"></span><span class="kbd"><kbd>Enter</kbd> 检查 / 下一句 · <kbd>Shift</kbd>+<kbd>Enter</kbd> 换行</span>
        </div><div id="fb"></div></div>`;
      const inp = $('#ans', body);
      inp.focus();
      if (dictee) setTimeout(() => TTS.say(s.fr), 250);
      inp.onkeydown = e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); answered ? (i++, draw()) : check(); } };
      $('#prev', body).onclick = () => { i--; draw(); };
      $('#skip', body).onclick = () => check(true);
    };
    const check = (giveUp = false) => {
      const s = list[i], val = $('#ans', body).value;
      if (!val.trim() && !giveUp) return;
      answered = true;
      const d = diff(s.fr, giveUp ? '' : val);
      if (scores[i] == null) {
        scores[i] = d.score;
        if (d.perfect) XP.gain(3, '句子全对');
        const it = { book: ctx.book.id, n: ctx.lecon.n, kind: 'sentence', fr: s.fr, zh: s.zh, en: s.en };
        d.perfect ? SRS.hit(it) : SRS.miss(it, giveUp ? '' : val);
        if (!d.perfect && !giveUp) ERRS.sentence(s.fr, val);
      }
      const cls = d.perfect ? 'ok' : d.score > 0.7 ? 'accent' : 'bad';
      $('#fb', body).innerHTML = `<div class="feedback ${cls}">
        <span class="lab">${d.perfect ? '完全正确' : giveUp ? '答案' : `对了 ${Math.round(d.score * 100)}% · 绿色=对 · 波浪线=重音 · 红色=漏写或写错`}</span>
        <div class="ans" lang="fr">${playBtn(s.fr)}<span>${giveUp ? esc(s.fr) : marked(s.fr, d.st)}</span></div>
        ${d.extra.length && !giveUp ? `<span class="lab">多写/拼错的词：<span class="w-extra" lang="fr">${esc(d.extra.join(' '))}</span></span>` : ''}
        ${dictee ? `<span class="lab" style="font-family:var(--zh);margin-top:6px">${G(s)}</span>` : ''}</div>`;
      if (!dictee) TTS.say(s.fr);
    };
    const done = () => {
      const got = scores.map(x => x || 0);
      const avg = got.reduce((a, b) => a + b, 0) / list.length;
      ctx.save('phrases', avg);
      body.innerHTML = `<div class="drill summary"><p class="kicker" lang="fr">Bilan</p>
        <div class="score">${Math.round(avg * 100)}%</div><p>${list.length} 句的平均正确率</p>
        <ul>${list.map((s, k) => got[k] < 0.999 ? `<li><span lang="fr">${esc(s.fr)}</span><span class="w-zh">${Math.round(got[k] * 100)}%</span></li>` : '').join('')}</ul>
        <div class="drill-actions" style="justify-content:center"><button class="btn" id="again">再来一遍</button></div></div>`;
      $('#again', body).onclick = () => sentenceDrill(ctx, body, mode);
    };
    draw();
  }

  /* ----- 3 · full-text dictation ----- */
  function paneFull(ctx) {
    const { book, lecon, pane } = ctx;
    const dkey = `draft:${book.id}:${lecon.n}`;
    const draft = store.get(dkey, {});
    let hideZh = store.get('fullhide', false);
    pane.innerHTML = `
      <p class="hint-text">对照中文，把整篇课文默写出来。写完点「检查全部」。草稿会自动保存。</p>
      <div class="toolbar">
        <button class="btn ghost small" id="fplay">${ICON.play} ${bi('播放全文', 'Play all')}</button>
        <label class="kbd" style="display:flex;gap:6px;align-items:center"><input type="checkbox" id="fhide" ${hideZh ? 'checked' : ''}> ${bi('隐藏中文（纯听写）', 'Hide translation (pure dictation)')}</label>
        <span class="spacer"></span><span class="scorebox" id="fscore"></span>
      </div>
      <div class="textblock" id="flines">${lecon.text.map((r, k) => r.h
        ? `<div class="tline h" lang="fr">${H(r)}</div>`
        : `<div class="tline" data-k="${k}"><div class="row">${playBtn(r.fr)}<div class="body">
            <div class="lzh" ${hideZh ? 'hidden' : ''}>${G(r)}</div>
            <textarea class="answer-in full-in" lang="fr" rows="1" data-k="${k}" autocapitalize="off" spellcheck="false" placeholder="…">${esc(draft[k] || '')}</textarea>
            <div class="full-res"></div></div></div></div>`).join('')}</div>
      <div class="toolbar" style="margin-top:16px">
        <button class="btn" id="fcheck">${bi('检查全部', 'Check all')}</button><button class="btn ghost" id="fshow">${bi('显示答案', 'Show answers')}</button><button class="btn ghost" id="fclear">${bi('清空', 'Clear')}</button>
      </div>`;
    const areas = $$('.full-in', pane);
    const grow = t => { t.style.height = 'auto'; t.style.height = t.scrollHeight + 'px'; };
    areas.forEach((t, n) => {
      grow(t);
      t.oninput = () => { grow(t); draft[t.dataset.k] = t.value; store.set(dkey, draft); };
      t.onkeydown = e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); (areas[n + 1] || $('#fcheck', pane)).focus(); } };
    });
    $('#fhide', pane).onchange = e => { hideZh = e.target.checked; store.set('fullhide', hideZh); $$('.lzh', pane).forEach(z => z.hidden = hideZh); };
    $('#fcheck', pane).onclick = () => {
      let total = 0;
      areas.forEach(t => {
        const r = lecon.text[t.dataset.k], d = diff(r.fr, t.value);
        total += d.score;
        if (t.value.trim() && !d.perfect && t.dataset.logged !== t.value) { t.dataset.logged = t.value; ERRS.sentence(r.fr, t.value); }
        if (t.value.trim()) { const it = { book: book.id, n: lecon.n, kind: 'sentence', fr: r.fr.replace(/^–\s*/, ''), zh: r.zh.replace(/^–\s*/, ''), en: (r.en || '').replace(/^–\s*/, '') }; d.perfect ? SRS.hit(it) : SRS.miss(it, t.value); if (d.perfect) MASTER.line(book.id, lecon.n, +t.dataset.k); }
        t.nextElementSibling.innerHTML = d.perfect ? `<span class="w-ok">✓</span>`
          : `<div lang="fr">${marked(r.fr, d.st)}</div>${d.extra.length ? `<div class="yours">多写/拼错：<span class="w-extra">${esc(d.extra.join(' '))}</span></div>` : ''}`;
      });
      const s = total / areas.length;
      $('#fscore', pane).innerHTML = `正确率 <b>${Math.round(s * 100)}%</b>`;
      ctx.save('full', s);
    };
    $('#fshow', pane).onclick = () => areas.forEach(t => { t.nextElementSibling.innerHTML = `<div lang="fr" class="w-ok">${esc(lecon.text[t.dataset.k].fr)}</div>`; });
    $('#fclear', pane).onclick = () => {
      if (!confirm(tr('清空这一课的默写草稿？').replace(' · ', '\n'))) return;
      areas.forEach(t => { t.value = ''; grow(t); t.nextElementSibling.innerHTML = ''; });
      store.set(dkey, {}); for (const k in draft) delete draft[k];
      $('#fscore', pane).textContent = '';
    };
    let stopper = null;
    $('#fplay', pane).onclick = e => {
      const btn = e.currentTarget;
      if (stopper) { stopper(); stopper = null; btn.innerHTML = ICON.play + ' 播放全文'; return; }
      const lines = $$('.tline[data-k]', pane);
      btn.innerHTML = ICON.stop + ' 停止';
      stopper = speakSeq(lines.map(l => lecon.text[l.dataset.k].fr), i => {
        lines.forEach((l, k) => l.classList.toggle('playing', k === i));
        if (i >= 0) lines[i].scrollIntoView({ block: 'center', behavior: 'smooth' });
      }, () => { stopper = null; btn.innerHTML = ICON.play + ' 播放全文'; });
      cleanup = () => stopper && stopper();
    };
  }

  /* ----- 4 · recitation (speech recognition) ----- */
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  function paneRecite(ctx, mode = store.get('rmode', 'zh')) {
    const { lecon, pane } = ctx;
    store.set('rmode', mode);
    const rows = lecon.text.map((r, k) => ({ ...r, k }));
    // global token list across all lines
    const toks = [];
    rows.forEach(r => { if (!r.h) tokens(r.fr).forEach((t, j) => toks.push({ t, line: r.k, j, st: 'todo' })); });
    let p = 0;           // next expected token
    let finished = false;
    let base = 0;        // p at start of the current recognition chunk
    const veil = mode !== 'read';
    pane.innerHTML = modeBar([['read', bi('看着原文读', 'Read along')], ['zh', bi('看中文背', 'From the translation')], ['blind', bi('盲背', 'By heart')]], mode) + `
      ${SR ? '' : '<div class="notice">这个浏览器不支持语音识别。请用 Chrome 或 Safari（macOS）打开；也可以在页面底部打字背诵。</div>'}
      <div class="recite-ctrl">
        <button class="mic" id="mic" aria-label="开始背诵" title="开始 / 停止" ${SR ? '' : 'disabled'}>${ICON.mic}</button>
        <div class="heard" id="heard">${SR ? '点麦克风开始说法语。说对的词会逐个显现；卡住了可以点灰色的词看提示。' : ''}</div>
        <span class="scorebox" id="rscore"></span>
        <button class="btn ghost small" id="rreset">${bi('重来', 'Restart')}</button>
      </div>
      <div class="textblock ${veil ? 'veil' : ''}" id="rlines">${rows.map(r => r.h
        ? `<div class="tline h" lang="fr">${H(r)}</div>`
        : `<div class="tline" data-line="${r.k}"><div class="row">${playBtn(r.fr)}<div class="body">
            ${mode === 'blind' ? '' : mode === 'zh' ? `<div class="lzh">${G(r)}</div>` : ''}
            <div class="lfr" lang="fr">${markup(r.fr, () => 'rw todo')}</div>
            ${mode === 'read' ? `<div class="lzh">${G(r)}</div>` : ''}</div></div></div>`).join('')}</div>
      <input class="typed-recite" id="typed" lang="fr" placeholder="没有麦克风？在这里打字背，空格分词，效果相同" autocapitalize="off" spellcheck="false">
      <p class="kbd">点击某一行左侧的空白处，可以从那一行开始背。</p>`;
    bindModes(pane, m => { stopRec(); paneRecite(ctx, m); });

    // map token -> span
    $$('.tline[data-line]', pane).forEach(l => {
      const line = +l.dataset.line;
      $$('.rw', l).forEach((sp, j) => { const t = toks.find(x => x.line === line && x.j === j); if (t) t.el = sp; });
    });
    const paint = () => {
      toks.forEach((t, i) => {
        if (!t.el) return;
        t.el.className = 'rw ' + t.st + (i === p && t.st === 'todo' ? ' next' : '');
      });
      const curLine = toks[p] ? toks[p].line : -1;
      $$('.tline[data-line]', pane).forEach(l => {
        const n = +l.dataset.line;
        l.classList.toggle('cur', n === curLine);
      });
      const said = toks.filter(t => t.st !== 'todo').length;
      const ok = toks.filter(t => t.st === 'ok').length;
      $('#rscore', pane).innerHTML = said ? `<b>${Math.round(ok / Math.max(1, said) * 100)}%</b> · ${said}/${toks.length} 词` : '';
      if (p >= toks.length && toks.length && !finished) {
        finished = true;
        ctx.save('recite', ok / toks.length);
        rows.forEach(r => { if (r.h) return; const lt = toks.filter(t => t.line === r.k);
          if (lt.every(t => t.st === 'ok')) MASTER.line(ctx.book.id, ctx.lecon.n, r.k);
          else SRS.miss({ book: ctx.book.id, n: ctx.lecon.n, kind: 'sentence', fr: r.fr.replace(/^–\s*/, ''), zh: r.zh.replace(/^–\s*/, ''), en: (r.en || '').replace(/^–\s*/, '') }); });
        $('#heard', pane).innerHTML = `背完了！正确率 ${Math.round(ok / toks.length * 100)}%。红色的词是漏掉或没念清楚的。`;
        stopRec();
      }
    };
    // align a list of spoken words starting at `base`; returns new p and statuses (applied in place)
    const snapshot = () => toks.map(t => t.st);
    let snap = snapshot();
    const align = (words, commit) => {
      toks.forEach((t, i) => t.st = snap[i]);
      let q = base;
      for (let wi = 0; wi < words.length; wi++) {
        const w = words[wi], w2 = words[wi + 1] ? w + words[wi + 1] : null;
        for (let k = q; k < Math.min(toks.length, q + 6); k++) {
          const both = w2 && !close(w, toks[k].t) && close(w2, toks[k].t);
          if (both || close(w, toks[k].t)) {
            if (both) wi++;
            for (let m = q; m < k; m++) if (toks[m].st === 'todo') toks[m].st = 'miss';
            if (toks[k].st === 'todo') toks[k].st = 'ok';
            q = k + 1; break;
          }
        }
      }
      p = q;
      if (commit) { base = p; snap = snapshot(); }
      paint();
      const cur = toks[p] && toks[p].el;
      if (cur) cur.closest('.tline').scrollIntoView({ block: 'center', behavior: 'smooth' });
    };

    // hint: click a hidden word to reveal it
    $('#rlines', pane).addEventListener('click', e => {
      const sp = e.target.closest('.rw');
      if (sp) {
        const t = toks.find(x => x.el === sp);
        if (t && t.st === 'todo') { t.st = 'hinted'; snap = snapshot(); paint(); TTS.say(t.t); }
        return;
      }
      const line = e.target.closest('.tline[data-line]');
      if (line && !e.target.closest('.play')) {
        const first = toks.findIndex(t => t.line === +line.dataset.line);
        if (first >= 0) { p = base = first; snap = snapshot(); paint(); }
      }
    });
    $('#rreset', pane).onclick = () => { stopRec(); paneRecite(ctx, mode); };
    const typed = $('#typed', pane);
    typed.oninput = () => {
      const v = typed.value;
      const words = tokens(v);
      const endsWithSpace = /\s$/.test(v);
      align(endsWithSpace ? words : words.slice(0, -1), false);
      if (endsWithSpace && words.length > 8) { align(words, true); typed.value = ''; }
    };
    typed.onkeydown = e => { if (e.key === 'Enter') { align(tokens(typed.value), true); typed.value = ''; } };

    // speech recognition
    let rec = null, listening = false;
    const mic = $('#mic', pane), heard = $('#heard', pane);
    function stopRec() {
      listening = false;
      if (rec) { try { rec.stop(); } catch { } }
      mic && mic.classList.remove('on');
    }
    function startRec() {
      TTS.stop();
      rec = new SR();
      rec.lang = 'fr-FR'; rec.continuous = true; rec.interimResults = true; rec.maxAlternatives = 1;
      let finals = [];
      rec.onresult = e => {
        let interim = '';
        for (let r = e.resultIndex; r < e.results.length; r++) {
          const txt = e.results[r][0].transcript;
          if (e.results[r].isFinal) finals.push(txt); else interim += txt;
        }
        heard.textContent = '« ' + (finals.slice(-2).join(' ') + ' ' + interim).trim().slice(-120) + ' »';
        align(tokens(finals.join(' ') + ' ' + interim), false);
      };
      rec.onerror = e => {
        if (e.error === 'not-allowed' || e.error === 'service-not-allowed') {
          heard.textContent = '没有麦克风权限。请在浏览器地址栏允许使用麦克风后再试。'; listening = false;
        } else if (e.error === 'network') { heard.textContent = '语音识别需要联网（Chrome 使用在线识别）。'; listening = false; }
      };
      rec.onend = () => {
        // commit what was recognised, then keep listening (Chrome stops after silence)
        align(tokens(finals.join(' ')), true);
        finals = [];
        if (listening && p < toks.length) { try { rec.start(); } catch { stopRec(); } }
        else mic.classList.remove('on');
      };
      try { rec.start(); listening = true; mic.classList.add('on'); heard.textContent = '在听…请开始背诵'; }
      catch { heard.textContent = '无法启动语音识别。'; }
    }
    if (SR) mic.onclick = () => listening ? stopRec() : startRec();
    cleanup = stopRec;
    paint();
  }

  function renderLang() {
    const el = $('#langsw'); if (!el) return;
    el.innerHTML = [['zhen', '中英法'], ['zh', '中法'], ['en', '英法']].map(([k, t]) => `<button data-lang="${k}" aria-pressed="${L() === k}">${t}</button>`).join('');
    document.documentElement.dataset.lang = L();
    $$('button', el).forEach(b => b.onclick = () => { settings.lang = b.dataset.lang; saveSettings(); location.reload(); });
  }
  renderLang();
  const qsb = $('#qs-btn'); if (qsb) qsb.onclick = () => openLookup();
  CLOUD.init();
  ACCENTS.init();
  if (window.DUST) DUST.set(settings.dust !== false && settings.look !== 'mono');
  renderStatus();
  translateTree(document.body);
  idbGet('handle').then(h => { if (h && h.queryPermission) h.queryPermission({ mode: 'readwrite' }).then(p => { if (p === 'granted') { BACKUP.handle = h; BACKUP.write(); } }); });
  route();
})();
