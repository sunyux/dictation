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
  // language modes: 'zhen' 中英法 · 'zh' 中法 · 'en' 英法
  const L = () => settings.lang;
  const BI = {};
  const bi = (zh, en) => { BI[zh] = en; return L() === 'en' ? en : zh; };
  const G = o => {
    const zh = esc(o.zh || ''), en = esc(o.en || '');
    if (L() === 'en') return en || zh;
    if (L() === 'zhen' && en) return `${zh}<span class="en-gloss" lang="en">${en}</span>`;
    return zh;
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
    miss(it) {
      const db = this.all(), id = this.id(it), old = db[id] || { right: 0, wrong: 0, first: dayStr() };
      db[id] = { ...old, ...it, box: 0, due: addDays(1), wrong: old.wrong + 1, last: dayStr(), done: false };
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
  function stampSVG(n, kind, on) {
    const [city, g] = STAMPS[n] || ['Leçon ' + n, 'house'];
    return `<svg viewBox="0 0 100 120" class="stamp ${on ? 'on' : ''} ${kind}" aria-label="${esc(city)}">
      <rect x="3" y="3" width="94" height="114" rx="2" class="st-paper"/>
      <rect x="9" y="9" width="82" height="102" class="st-frame"/>
      <g transform="translate(10 6) scale(.8)" class="st-glyph"><path d="${GLYPH[g]}"/></g>
      <text x="50" y="96" class="st-city">${esc(city)}</text>
      <text x="50" y="106" class="st-sub">${kind === 'v' ? 'VOCABULAIRE' : 'TEXTE'} · ${n}</text>
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

  /* ---------- cloud sync: Google sign-in + one Firestore document per user ---------- */
  const NOSYNC = new Set(['nh:settings', 'nh:lastAuto', 'nh:lastBackup', 'nh:lastSync']);
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
          if (u) await this.pull();
          refreshCloudUI();
        });
        document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && this.user) this.pull(); });
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
    signOut() { firebase.auth().signOut(); },
    doc() { return this.db.collection('users').doc(this.user.uid); },
    local() {
      const data = {};
      Object.keys(localStorage).filter(k => k.startsWith('nh:') && !NOSYNC.has(k)).forEach(k => { data[k] = localStorage.getItem(k); });
      return data;
    },
    // download the cloud copy, merge it into this device, then upload the merged result
    async pull() {
      if (!this.user || this.busy) return;
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
      if (!this.user) return;
      try {
        await this.doc().set({ data: this.local(), updated: firebase.firestore.FieldValue.serverTimestamp(), email: this.user.email || '' });
        store.set('lastSync', new Date().toISOString(), true); this.status = 'ok';
      } catch (e) { this.status = 'error'; this.err = e.code || e.message || String(e); }
      refreshCloudUI();
    },
    changed() { if (this.user && !this.applying) { clearTimeout(this.timer); this.timer = setTimeout(() => this.push(), 3000); } },
  };
  function cloudHTML() {
    if (!window.FIREBASE_CONFIG) return `<p class="hint-text" style="margin:0">云同步还没有设置。</p>`;
    if (!window.firebase) return `<p class="notice">云同步组件没有加载（可能是网络问题），刷新页面再试。</p>`;
    if (!CLOUD.ready) return `<p class="kbd">正在连接…</p>`;
    if (!CLOUD.user) return `<p class="hint-text" style="margin:0 0 12px">用 Google 账号登录后，手机和电脑会自动共用同一份进度：掌握的单词、错题本、打卡和邮票。</p>
      <button class="btn" id="cl-in">用 Google 登录</button>`;
    const last = store.get('lastSync', '');
    const st = CLOUD.status === 'syncing' ? '正在同步…' : CLOUD.status === 'error' ? '同步失败' : last ? `已同步 · ${last.slice(0, 16).replace('T', ' ')}` : '';
    return `<div class="toolbar"><span>已登录：<b>${esc(CLOUD.user.email || CLOUD.user.displayName || '')}</b></span>
      <span class="kbd">${st}</span><span class="spacer"></span>
      <button class="btn ghost small" id="cl-now">立即同步</button><button class="btn ghost small" id="cl-out">退出登录</button></div>
      ${CLOUD.status === 'error' ? `<p class="notice" style="margin:8px 0 0">${esc(cloudErr(CLOUD.err))}<br><span class="kbd" lang="en">${esc(CLOUD.err || '')}</span></p>` : ''}
      <p class="kbd" style="margin:6px 0 0">每次练习后自动上传；打开网站或切回这个页面时自动下载并合并。</p>`;
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
    const dot = $('#cloud-dot'); if (dot) dot.dataset.state = CLOUD.user ? CLOUD.status || 'ok' : 'off';
  }
  function bindCloud(box) {
    const i = $('#cl-in', box), n = $('#cl-now', box), o = $('#cl-out', box);
    if (i) i.onclick = () => CLOUD.signIn();
    if (n) n.onclick = () => CLOUD.pull();
    if (o) o.onclick = () => CLOUD.signOut();
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
      <label class="chk"><input type="checkbox" id="s-len" ${settings.lenient ? 'checked' : ''}> 重音写错也算对</label>
      <button class="btn ghost small" data-say="Bonjour ! Je m'appelle Alice. Ça va bien ?">试听</button>
      <p class="kbd" style="margin:12px 0 0">macOS 可在 系统设置 › 辅助功能 › 朗读内容 › 系统声音 下载更自然的法语声音（如 Amélie 高音质）。</p>`;
    $('#s-rate').oninput = e => { settings.rate = +e.target.value; $('#rate-v').textContent = settings.rate.toFixed(2); saveSettings(); };
    $('#s-vol').oninput = e => { settings.volume = +e.target.value; $('#vol-v').textContent = Math.round(settings.volume * 100) + '%'; saveSettings(); };
    $('#s-vol').onchange = () => TTS.say('Bonjour !');
    $('#s-voice').onchange = e => { settings.voice = e.target.value; TTS.pick(); saveSettings(); };
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
  function route() {
    cleanup(); cleanup = () => { };
    TTS.stop(); seqToken++;
    const parts = location.hash.replace(/^#\/?/, '').split('/').filter(Boolean);
    const crumbs = $('#crumbs');
    window.scrollTo(0, 0);
    if (!parts.length) { crumbs.innerHTML = ''; return viewHome(); }
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

  function viewReview(sub) {
    document.title = '错题本 · 每日复习';
    const KIND = { word: '单词', cloze: '填空', sentence: '句子' };
    const db = SRS.all();
    const items = Object.entries(db).map(([id, e]) => ({ id, ...e }));
    const due = SRS.due();
    const active = items.filter(e => !e.done), done = items.filter(e => e.done);
    if (sub === 'go') {
      main.innerHTML = '<div class="toolbar"><a class="btn ghost small" href="#/review">‹ 返回错题本</a></div><div id="drill"></div>';
      return reviewDrill($('#drill'), shuffle(due));
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
        <a class="btn ${due.length ? '' : 'ghost'}" href="#/review/go" ${due.length ? '' : 'aria-disabled="true" onclick="return false"'}>${due.length ? `开始今天的复习（${due.length}）` : '今天没有要复习的'}</a>
        ${active.length && !due.length ? '<button class="btn ghost" id="early">提前复习全部</button>' : ''}
        <span class="spacer"></span>
        <button class="btn ghost small" id="exp">导出备份</button>
        <label class="btn ghost small" style="cursor:pointer">导入<input type="file" id="imp" accept=".json" hidden></label>
      </div>
      ${Object.keys(byLecon).length ? Object.entries(byLecon).map(([n, list]) => `
        <section class="unit"><div class="unit-title"><h2 lang="fr">Leçon ${n}</h2><span>${list.length} 条</span></div>
        ${list.map(e => `<div class="err-row">
          <span class="err-kind">${KIND[e.kind]}</span>
          <div class="err-body"><div lang="fr">${playBtn(e.kind === 'word' ? forms(e.fr).say : e.fr)} ${esc(e.fr)}</div><div class="lzh">${e.kind === 'cloze' ? esc(e.zh) : G(e)}${e.pos ? ' · ' + esc(e.pos) : ''}</div></div>
          <span class="err-meta">错 ${e.wrong} 次<br>${e.due <= today ? '<b class="w-miss">&nbsp;今天&nbsp;</b>' : e.due.slice(5).replace('-', '/') + ' 复习'}</span>
          <button class="err-del" data-id="${esc(e.id)}" title="移出错题本" aria-label="移出错题本">×</button>
        </div>`).join('')}</section>`).join('')
        : '<p class="notice">错题本还是空的。去做几课练习吧，写错的会自动出现在这里。</p>'}`;
    $$('.err-del', main).forEach(b => b.onclick = () => { SRS.remove(b.dataset.id); viewReview(); });
    const early = $('#early', main);
    if (early) early.onclick = () => {
      main.innerHTML = '<div class="toolbar"><a class="btn ghost small" href="#/review">‹ 返回错题本</a></div><div id="drill"></div>';
      reviewDrill($('#drill'), shuffle(active));
    };
    $('#exp', main).onclick = () => BACKUP.download();
    $('#imp', main).onchange = async e => {
      try { BACKUP.merge(JSON.parse(await e.target.files[0].text())); viewReview(); }
      catch { alert(tr('这个文件读不出来。').replace(' · ', '\n')); }
    };
  }

  function reviewDrill(box, queue) {
    let i = 0, answered = false, right = 0;
    const draw = () => {
      if (i >= queue.length) {
        box.innerHTML = `<div class="drill summary"><p class="kicker" lang="fr">Bilan</p><div class="score">${right} / ${queue.length}</div>
          <p>${right === queue.length ? '全部答对！' : '答错的明天会再出现。'}</p>
          <div class="drill-actions" style="justify-content:center"><a class="btn" href="#/review">回到错题本</a></div></div>`;
        return;
      }
      const e = queue[i]; answered = false;
      const word = e.kind !== 'sentence';
      box.innerHTML = `<div class="drill">
        <div class="count">${i + 1} / ${queue.length} · Leçon ${e.n}</div>
        <div class="bar"><i style="width:${i / queue.length * 100}%"></i></div>
        <div class="prompt">${e.kind === 'cloze'
          ? `<div class="pzh long" lang="fr" style="font-family:var(--serif)">${esc(e.zh).replace('____', '<u>&emsp;?&emsp;</u>')}</div><div class="ppos">填出空缺的词</div>`
          : `<div class="pzh ${e.zh.length > 30 ? 'long' : ''}">${G(e)}</div><div class="ppos">${esc(e.pos || '')}</div>`}</div>
        ${word ? `<input class="answer-in" id="ans" lang="fr" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="${bi('用法语写…', 'Write in French…')}">`
          : `<textarea class="answer-in" id="ans" lang="fr" rows="2" autocapitalize="off" spellcheck="false" placeholder="${bi('写出法语句子…', 'Write the French sentence…')}"></textarea>`}
        <div class="drill-actions"><button class="btn ghost small" id="skip">${bi('不会，看答案', 'Show answer')}</button><span class="spacer"></span><span class="kbd"><kbd>Enter</kbd> 检查 / 下一个</span></div>
        <div id="fb"></div></div>`;
      const inp = $('#ans', box); inp.focus();
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
      } else {
        const r = giveUp ? 'bad' : checkWord(val, e.fr);
        good = r === 'ok'; html = esc(e.fr) + (r === 'accent' ? ' <span class="kbd">（注意重音）</span>' : '');
      }
      good ? (SRS.hit(e), right++, XP.gain(3, '复习答对')) : SRS.miss(e);
      const next = good ? GAPS[Math.min((e.box || 0) + 1, GAPS.length - 1)] : 1;
      $('#fb', box).innerHTML = `<div class="feedback ${good ? 'ok' : 'bad'}"><span class="lab">${good ? `答对了 · ${(e.box || 0) + 1 >= GAPS.length ? '已掌握' : next + ' 天后再复习'}` : '明天再来一次'}</span>
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
        ${coverHTML(book)}
        <div class="home-text">
          <p class="kicker" lang="fr">Cahier de dictée</p>
          <h1>跟着课本，一课一课写下来</h1>
          <p>每一课都按你的默写讲义整理：先记单词，再练句子，最后整篇默写、开口背诵。所有法语都可以点一下朗读。</p>
          <ol class="steps-intro">
            <li><b>1</b><span>词汇 — 看中文写法语，或听音拼写</span></li>
            <li><b>2</b><span>句子 — 课文填空、逐句中译法、听写</span></li>
            <li><b>3</b><span>全文默写 — 对照中文，整篇写出来</span></li>
            <li><b>4</b><span>背诵 — 对着麦克风说，说对的词会逐个显现</span></li>
          </ol>
          <a class="btn" href="#/${book.id}">打开《${esc(book.title)}》</a>
          ${backupNag()}${reviewBanner()}${backupNag()}
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
            return `<a class="lecon-card" href="#/${book.id}/${l.n}">
              <div class="n" lang="fr">Leçon ${l.n}</div>
              <h3 lang="fr">${esc(l.title)}</h3>
              <div class="zh">${esc(l.zh)}</div>
              ${progHTML(book, l)}
            </a>`;
          }).join('')}</div>
        </section>`).join('')}
      <p class="footer-note">进度保存在这台设备的浏览器里。</p>`;
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
      </div>`;
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
    const { lecon, pane } = ctx;
    store.set('vmode', mode);
    const head = modeBar([['list', bi('浏览', 'Browse')], ['test', bi('首测', 'First test')], ['write', bi('看中文默写', 'Meaning → French')], ['listen', bi('听音拼写', 'Listen & spell')], ['conj', bi('动词变位', 'Conjugation')]], mode);
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
          <div class="vrow ${hide ? 'hidefr' : ''} ${mst.w[v.fr] ? 'mastered' : ''}" data-say="${esc(forms(v.fr).say)}" data-fr="${esc(v.fr)}">
            <span class="vdrag" title="${bi('拖动调整顺序', 'Drag to reorder')}" aria-label="${bi('拖动调整顺序', 'Drag to reorder')}">⠿</span>
            <span class="play">${ICON.play}</span>
            <span class="vzh">${G(v)}</span><span class="pos">${esc(v.pos)}</span>
            <span class="vfr" lang="fr">${esc(v.fr)}</span>
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
      if (mode === 'conj') { pane.innerHTML = head + '<div id="drill"></div>'; bindModes(pane, m => paneVocab(ctx, m)); return conjDrill(ctx, $('#drill', pane)); }
      pane.innerHTML = head + '<div id="drill"></div>';
      const box = $('#drill', pane);
      if (mode === 'test') {
        const st = MASTER.stats(ctx.book.id, lecon);
        box.innerHTML = `<div class="drill summary"><p class="kicker" lang="fr">Premier test</p>
          <h2 style="font-size:30px;margin-bottom:10px">本课词汇首测</h2>
          <p class="hint-text" style="margin:0 0 18px">把这一课 ${lecon.vocab.length} 个词全部默写一遍，不能用提示。<br>写对的直接算掌握，以后不用再复习；写错的<b>不进错题本</b>，之后在「看中文默写」或「听音拼写」里练，第一次就写对也算掌握。</p>
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
    const listen = mode === 'listen', test = mode === 'test';
    const draw = () => {
      if (i >= queue.length) return done();
      const v = queue[i]; answered = false; hintN = 0;
      box.innerHTML = `<div class="drill">
        <div class="count">${i + 1} / ${queue.length}</div>
        <div class="bar"><i style="width:${i / queue.length * 100}%"></i></div>
        <div class="prompt">${listen
          ? `${playBtn(forms(v.fr).say, 'big')}<div class="ppos">${esc(v.pos)}</div>`
          : `<div class="pzh">${G(v)}</div><div class="ppos">${esc(v.pos)}${v.g ? ' · ' + esc(v.g) : ''}</div>`}</div>
        <input class="answer-in" id="ans" lang="fr" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="${bi('用法语写…', 'Write in French…')}">
        <div class="drill-actions">
          ${test ? '' : '<button class="btn ghost small" id="hint">提示一个字母</button>'}
          <button class="btn ghost small" id="skip">${bi('不会，看答案', 'Show answer')}</button>
          <span class="spacer"></span>
          <span class="kbd"><kbd>Enter</kbd> 检查 / 下一个</span>
        </div>
        <div id="fb"></div>
        <div class="kbd" style="margin-top:14px">顺序：
          <a href="#" id="ord">${order === 'shuffle' ? '随机（点击改为列表顺序）' : '列表顺序（点击改为随机）'}</a></div>
      </div>`;
      const inp = $('#ans', box);
      inp.focus();
      if (listen) setTimeout(() => TTS.say(forms(v.fr).say), 200);
      inp.onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); answered ? (i++, draw()) : check(); } };
      if (!test) $('#hint', box).onclick = () => {
        const target = forms(v.fr).accept[0];
        hintN = Math.min(hintN + 1, target.length);
        inp.value = target.slice(0, hintN); inp.focus();
      };
      $('#skip', box).onclick = () => check(true);
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
      if (!good || hintN) {
        wrong.push(v);
        if (!test) { SRS.miss(it); MASTER.word(bk, ln, v.fr, false); }
      } else if (test || !inReview(bk, ln, v.fr)) MASTER.word(bk, ln, v.fr);
      else SRS.hit(it);
      fb.innerHTML = `<div class="feedback ${r}">
        <span class="lab">${good ? (hintN ? '对了（用了提示）' : '完全正确') : r === 'accent' ? '差一点：注意重音符号' : giveUp ? '答案' : '不对，正确答案是'}</span>
        <div class="ans" lang="fr">${playBtn(forms(v.fr).say)} ${esc(v.fr)} ${listen ? `<span class="kbd" style="font-family:var(--zh)">${G(v)}</span>` : ''}</div>
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
        ${test && wrong.length ? '<p class="kbd">写错的词没有进错题本，去「看中文默写」或「听音拼写」练它们。</p>' : ''}
        ${wrong.length ? `<ul>${wrong.map(v => `<li><span lang="fr">${esc(v.fr)}</span><span class="w-zh">${G(v)}</span></li>`).join('')}</ul>` : '<p>全部正确，很棒。</p>'}
        <div class="drill-actions" style="justify-content:center">
          ${wrong.length ? '<button class="btn" id="again-wrong">只练错的</button>' : ''}
          <button class="btn ghost" id="again">重新开始</button></div></div>`;
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
    'commencer': 'commence commences commence commençons commencez commencent', 'recommencer': 'recommence recommences recommence recommençons recommencez recommencent',
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
      return { p: PRON[i], text, form: f };
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

  function conjDrill(ctx, box) {
    const { book, lecon } = ctx;
    const all = book.units.flatMap(u => u.lecons);
    let wide = store.get('conjwide', false);
    const pool = l => l.vocab.filter(v => v.pos.startsWith('v') && conjugate(v.fr)).map(v => ({ ...v, n: l.n }));
    let verbs = pool(lecon);
    const forced = !verbs.length;
    if (wide || forced) verbs = all.filter(l => l.n <= lecon.n).flatMap(pool).filter((v, i, a) => a.findIndex(x => x.fr === v.fr) === i);
    if (!verbs.length) { box.innerHTML = '<p class="notice">到这一课为止还没有动词。</p>'; return; }
    let see = store.get('conjsee', false);
    const queue = shuffle(verbs.flatMap(v => conjugate(v.fr).map(c => ({ v, c }))));
    let i = 0, answered = false, right = 0;
    const draw = () => {
      if (i >= queue.length) {
        box.innerHTML = `<div class="drill summary"><p class="kicker" lang="fr">Bilan</p><div class="score">${right} / ${queue.length}</div>
          <p>${verbs.map(v => esc(v.fr)).join(' · ')}</p>
          <div class="drill-actions" style="justify-content:center"><button class="btn" id="again">再来一遍</button></div></div>`;
        $('#again', box).onclick = () => conjDrill(ctx, box);
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
          ${forced ? '<span>这一课没有动词，用的是之前课的动词</span>' : `<label><input type="checkbox" id="wide" ${wide ? 'checked' : ''}> 包含之前各课的动词</label>`}
        </div></div>`;
      const inp = $('#ans', box); inp.focus();
      if (!see) setTimeout(() => TTS.say(c.text), 200);
      inp.onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); answered ? (i++, draw()) : check(); } };
      $('#skip', box).onclick = () => check(true);
      $('#see', box).onchange = e => { see = e.target.checked; store.set('conjsee', see); draw(); };
      const w = $('#wide', box); if (w) w.onchange = e => { store.set('conjwide', e.target.checked); conjDrill(ctx, box); };
    };
    const check = (giveUp = false) => {
      const { v, c } = queue[i], val = $('#ans', box).value;
      if (!val.trim() && !giveUp) return;
      answered = true;
      const a = norm(val), t = norm(c.text);
      const pronounFree = norm(c.text.replace(/^(je|j'|tu|il|elle|nous|vous|ils|elles)\s*/, ''));
      let r = giveUp ? 'bad' : (a === t ? 'ok' : strip(a) === strip(t) ? (settings.lenient ? 'ok' : 'accent') : a === pronounFree ? 'pron' : 'bad');
      const good = r === 'ok';
      if (good) { right++; XP.gain(1, '变位正确'); }
      const it = { book: book.id, n: v.n, kind: 'word', fr: c.text, zh: `${forms(v.fr).say} · ${c.p}（现在时）`, en: `${forms(v.fr).say} · ${c.p} (present tense)`, pos: '变位' };
      good ? SRS.hit(it) : SRS.miss(it);
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
        else SRS.miss(it), inp.insertAdjacentHTML('afterend', `<span class="cloze-fix">${esc(inp.dataset.a)}</span>`);
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
        d.perfect ? SRS.hit(it) : SRS.miss(it);
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
        if (t.value.trim()) { const it = { book: book.id, n: lecon.n, kind: 'sentence', fr: r.fr.replace(/^–\s*/, ''), zh: r.zh.replace(/^–\s*/, ''), en: (r.en || '').replace(/^–\s*/, '') }; d.perfect ? SRS.hit(it) : SRS.miss(it); if (d.perfect) MASTER.line(book.id, lecon.n, +t.dataset.k); }
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
  CLOUD.init();
  renderStatus();
  translateTree(document.body);
  idbGet('handle').then(h => { if (h && h.queryPermission) h.queryPermission({ mode: 'readwrite' }).then(p => { if (p === 'granted') { BACKUP.handle = h; BACKUP.write(); } }); });
  route();
})();
