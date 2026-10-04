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
    set(k, v) { try { localStorage.setItem('nh:' + k, JSON.stringify(v)); } catch { } },
  };
  const settings = Object.assign({ rate: 0.85, lenient: false, voice: '' }, store.get('settings', {}));
  const saveSettings = () => store.set('settings', settings);
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
    id: it => `${it.book}|${it.n}|${it.kind}|${it.fr}|${it.zh}`,
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
      if (e.box >= GAPS.length) e.done = true; else e.due = addDays(GAPS[e.box]);
      this.save(db);
    },
    remove(id) { const db = this.all(); delete db[id]; this.save(db); },
    due() { const t = dayStr(); return Object.entries(this.all()).filter(([, e]) => !e.done && e.due <= t).map(([id, e]) => ({ id, ...e })); },
  };

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
    const s = fr.replace(/[¹²³*]/g, '').trim();
    const acc = new Set([s]);
    let say = s, m;
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
      <label><span class="lab">法语声音</span>
        <select id="s-voice">${vs.length ? vs.map(v => `<option ${TTS.voice && v.name === TTS.voice.name ? 'selected' : ''}>${esc(v.name)}</option>`).join('') : '<option>（系统没有法语声音）</option>'}</select></label>
      <label class="chk"><input type="checkbox" id="s-len" ${settings.lenient ? 'checked' : ''}> 重音写错也算对</label>
      <button class="btn ghost small" data-say="Bonjour ! Je m'appelle Alice. Ça va bien ?">试听</button>
      <p class="kbd" style="margin:12px 0 0">macOS 可在 系统设置 › 辅助功能 › 朗读内容 › 系统声音 下载更自然的法语声音（如 Amélie 高音质）。</p>`;
    $('#s-rate').oninput = e => { settings.rate = +e.target.value; $('#rate-v').textContent = settings.rate.toFixed(2); saveSettings(); };
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
      if (!r.fr.startsWith('–') && zs.length > 1 && zs.length === fs.length) zs.forEach((z, i) => out.push({ zh: z.trim(), fr: fs[i].trim(), head }));
      else out.push({ zh: r.zh.replace(/^–\s*/, ''), fr: r.fr.replace(/^–\s*/, ''), head });
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
          <div class="err-body"><div lang="fr">${playBtn(e.kind === 'word' ? forms(e.fr).say : e.fr)} ${esc(e.fr)}</div><div class="lzh">${esc(e.zh)}${e.pos ? ' · ' + esc(e.pos) : ''}</div></div>
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
    $('#exp', main).onclick = () => {
      const data = { srs: SRS.all(), progress: Object.fromEntries(Object.keys(localStorage).filter(k => k.startsWith('nh:prog:')).map(k => [k, store.get(k.slice(3), {})])) };
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([JSON.stringify(data, null, 1)], { type: 'application/json' }));
      a.download = `nihao-错题本-${dayStr()}.json`; a.click();
    };
    $('#imp', main).onchange = async e => {
      try {
        const data = JSON.parse(await e.target.files[0].text());
        const cur = SRS.all();
        for (const [id, it] of Object.entries(data.srs || {})) if (!cur[id] || (it.last || '') > (cur[id].last || '')) cur[id] = it;
        SRS.save(cur);
        for (const [k, v] of Object.entries(data.progress || {})) store.set(k.slice(3), v);
        viewReview();
      } catch { alert('这个文件读不出来。'); }
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
          : `<div class="pzh ${e.zh.length > 30 ? 'long' : ''}">${esc(e.zh)}</div><div class="ppos">${esc(e.pos || '')}</div>`}</div>
        ${word ? '<input class="answer-in" id="ans" lang="fr" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="用法语写…">'
          : '<textarea class="answer-in" id="ans" lang="fr" rows="2" autocapitalize="off" spellcheck="false" placeholder="写出法语句子…"></textarea>'}
        <div class="drill-actions"><button class="btn ghost small" id="skip">不会，看答案</button><span class="spacer"></span><span class="kbd"><kbd>Enter</kbd> 检查 / 下一个</span></div>
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
      good ? (SRS.hit(e), right++) : SRS.miss(e);
      const next = good ? GAPS[Math.min((e.box || 0) + 1, GAPS.length - 1)] : 1;
      $('#fb', box).innerHTML = `<div class="feedback ${good ? 'ok' : 'bad'}"><span class="lab">${good ? `答对了 · ${(e.box || 0) + 1 >= GAPS.length ? '已掌握' : next + ' 天后再复习'}` : '明天再来一次'}</span>
        <div class="ans" lang="fr">${playBtn(say)}<span>${html}</span></div></div>`;
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
          ${reviewBanner()}
        </div>
      </section>`;
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
              <div class="meta">${l.vocab.length} 词 · ${sentences(l).length} 句
                <span class="marks" title="词汇 · 句子 · 全文 · 背诵">${PARTS.map(k => `<span class="mark"><i style="width:${Math.round((p[k] || 0) * 100)}%"></i></span>`).join('')}</span></div>
            </a>`;
          }).join('')}</div>
        </section>`).join('')}
      <p class="footer-note">进度保存在这台设备的浏览器里。</p>`;
  }

  const TABS = [['vocab', '词汇', 'Vocabulaire'], ['phrases', '句子', 'Phrases'], ['full', '全文默写', 'Dictée'], ['recite', '背诵', 'Réciter']];
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
      </header>
      <nav class="tabs" role="tablist">${TABS.map((t, i) => `<button class="tab" role="tab" aria-selected="${t[0] === tab}" data-tab="${t[0]}"><b>${i + 1}</b>${t[1]}</button>`).join('')}</nav>
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

  /* ----- 1 · vocabulary ----- */
  function paneVocab(ctx, mode = store.get('vmode', 'list')) {
    const { lecon, pane } = ctx;
    store.set('vmode', mode);
    const head = modeBar([['list', '浏览'], ['write', '看中文默写'], ['listen', '听音拼写']], mode);
    if (mode === 'list') {
      const groups = [];
      lecon.vocab.forEach(v => { let g = groups.find(x => x.g === v.g); if (!g) groups.push(g = { g: v.g, items: [] }); g.items.push(v); });
      const hide = store.get('vhide', false);
      pane.innerHTML = head.replace('<span class="spacer"></span>', `<span class="spacer"></span>
          <label class="kbd" style="display:flex;gap:6px;align-items:center"><input type="checkbox" id="vhide" ${hide ? 'checked' : ''}> 遮住法语</label>
          <button class="btn ghost small" id="vplay">${ICON.play} 全部朗读</button>`) +
        groups.map(g => `<div class="vgroup"><h3>${esc(g.g || '')}</h3>${g.items.map(v => `
          <div class="vrow ${hide ? 'hidefr' : ''}" data-say="${esc(forms(v.fr).say)}">
            <span class="play">${ICON.play}</span>
            <span class="vzh">${esc(v.zh)}</span><span class="pos">${esc(v.pos)}</span>
            <span class="vfr" lang="fr">${esc(v.fr)}</span></div>`).join('')}</div>`).join('');
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
        cleanup = () => stopper && stopper();
      };
    } else {
      pane.innerHTML = head + '<div id="drill"></div>';
      wordDrill(ctx, $('#drill', pane), mode, lecon.vocab);
    }
    bindModes(pane, m => paneVocab(ctx, m));
  }

  function wordDrill(ctx, box, mode, words) {
    const order = store.get('vorder', 'shuffle');
    let queue = order === 'shuffle' ? shuffle(words) : words.slice();
    let i = 0, wrong = [], firstTry = 0, answered = false, hintN = 0;
    const listen = mode === 'listen';
    const draw = () => {
      if (i >= queue.length) return done();
      const v = queue[i]; answered = false; hintN = 0;
      box.innerHTML = `<div class="drill">
        <div class="count">${i + 1} / ${queue.length}</div>
        <div class="bar"><i style="width:${i / queue.length * 100}%"></i></div>
        <div class="prompt">${listen
          ? `${playBtn(forms(v.fr).say, 'big')}<div class="ppos">${esc(v.pos)}</div>`
          : `<div class="pzh">${esc(v.zh)}</div><div class="ppos">${esc(v.pos)}${v.g ? ' · ' + esc(v.g) : ''}</div>`}</div>
        <input class="answer-in" id="ans" lang="fr" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="用法语写…">
        <div class="drill-actions">
          <button class="btn ghost small" id="hint">提示一个字母</button>
          <button class="btn ghost small" id="skip">不会，看答案</button>
          <span class="spacer"></span>
          <span class="kbd"><kbd>Enter</kbd> 检查 / 下一个</span>
        </div>
        <div id="fb"></div>
        <div class="kbd" style="margin-top:14px">顺序：
          <a href="#" id="ord">${order === 'shuffle' ? '随机（点击改为课本顺序）' : '课本顺序（点击改为随机）'}</a></div>
      </div>`;
      const inp = $('#ans', box);
      inp.focus();
      if (listen) setTimeout(() => TTS.say(forms(v.fr).say), 200);
      inp.onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); answered ? (i++, draw()) : check(); } };
      $('#hint', box).onclick = () => {
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
      const it = { book: ctx.book.id, n: ctx.lecon.n, kind: 'word', fr: v.fr, zh: v.zh, pos: v.pos };
      if (!good || hintN) { wrong.push(v); SRS.miss(it); } else SRS.hit(it);
      fb.innerHTML = `<div class="feedback ${r}">
        <span class="lab">${good ? (hintN ? '对了（用了提示）' : '完全正确') : r === 'accent' ? '差一点：注意重音符号' : giveUp ? '答案' : '不对，正确答案是'}</span>
        <div class="ans" lang="fr">${playBtn(forms(v.fr).say)} ${esc(v.fr)} ${listen ? `<span class="kbd" style="font-family:var(--zh)">${esc(v.zh)}</span>` : ''}</div></div>`;
      TTS.say(forms(v.fr).say);
      if (good && !hintN) setTimeout(() => { if (answered && queue[i] === v) { i++; draw(); } }, 1100);
    };
    const done = () => {
      const score = firstTry / queue.length;
      if (queue.length === words.length || score === 1) ctx.save('vocab', score);
      box.innerHTML = `<div class="drill summary">
        <p class="kicker" lang="fr">Bilan</p>
        <div class="score">${Math.round(score * 100)}%</div>
        <p>${queue.length} 个里一次写对 ${firstTry} 个</p>
        ${wrong.length ? `<ul>${wrong.map(v => `<li><span lang="fr">${esc(v.fr)}</span><span class="w-zh">${esc(v.zh)}</span></li>`).join('')}</ul>` : '<p>全部正确，很棒。</p>'}
        <div class="drill-actions" style="justify-content:center">
          ${wrong.length ? '<button class="btn" id="again-wrong">只练错的</button>' : ''}
          <button class="btn ghost" id="again">重新开始</button></div></div>`;
      const w = wrong.slice();
      $('#again', box).onclick = () => wordDrill(ctx, box, mode, words);
      if (w.length) $('#again-wrong', box).onclick = () => { queue = shuffle(w); i = 0; wrong = []; firstTry = 0; draw(); };
    };
    draw();
  }

  /* ----- 2 · sentences ----- */
  function panePhrases(ctx, mode = store.get('pmode', 'cloze')) {
    const { lecon, pane } = ctx;
    store.set('pmode', mode);
    pane.innerHTML = modeBar([['cloze', '课文填空'], ['zh2fr', '逐句中译法'], ['dictee', '逐句听写']], mode) + '<div id="pbody"></div>';
    bindModes(pane, m => panePhrases(ctx, m));
    const body = $('#pbody', pane);
    if (mode === 'cloze') cloze(ctx, body);
    else sentenceDrill(ctx, body, mode);
  }

  function cloze(ctx, body) {
    const { lecon } = ctx;
    if (!lecon.cloze) { body.innerHTML = '<p class="notice">这一课没有填空题。</p>'; return; }
    let bi = 0;
    const heads = new Set(lecon.text.filter(r => r.h).map(r => r.h));
    const lineText = row => row.map(s => typeof s === 'string' ? s : s.b).join('');
    body.innerHTML = `<p class="hint-text">根据记忆补全课文里的空。<kbd>Enter</kbd> 跳到下一个空，最后点「检查」。</p>
      <div class="textblock">${lecon.cloze.map(row => {
        const blanks = row.filter(s => typeof s !== 'string').length;
        const full = lineText(row);
        if (!blanks && heads.has(full.trim())) return `<div class="tline h" lang="fr">${esc(full)}</div>`;
        return `<div class="tline"><div class="row">${playBtn(full)}<div class="body lfr" lang="fr">${row.map(s => typeof s === 'string' ? esc(s)
          : `<input class="cloze-in" data-i="${bi++}" data-a="${esc(s.b)}" size="${Math.max(3, s.b.length + 1)}" autocomplete="off" autocapitalize="off" spellcheck="false" aria-label="填空">`).join('')}</div></div></div>`;
      }).join('')}</div>
      <div class="toolbar" style="margin-top:16px"><button class="btn" id="ccheck">检查</button><button class="btn ghost" id="cshow">显示答案</button><button class="btn ghost" id="cclear">清空</button><span class="spacer"></span><span class="scorebox" id="cscore"></span></div>`;
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
          : `<div class="pzh ${s.zh.length > 30 ? 'long' : ''}">${esc(s.zh)}</div>`}</div>
        <textarea class="answer-in" id="ans" lang="fr" rows="2" autocapitalize="off" spellcheck="false" placeholder="写出法语句子…"></textarea>
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
        const it = { book: ctx.book.id, n: ctx.lecon.n, kind: 'sentence', fr: s.fr, zh: s.zh };
        d.perfect ? SRS.hit(it) : SRS.miss(it);
      }
      const cls = d.perfect ? 'ok' : d.score > 0.7 ? 'accent' : 'bad';
      $('#fb', body).innerHTML = `<div class="feedback ${cls}">
        <span class="lab">${d.perfect ? '完全正确' : giveUp ? '答案' : `对了 ${Math.round(d.score * 100)}% · 绿色=对 · 波浪线=重音 · 红色=漏写或写错`}</span>
        <div class="ans" lang="fr">${playBtn(s.fr)}<span>${giveUp ? esc(s.fr) : marked(s.fr, d.st)}</span></div>
        ${d.extra.length && !giveUp ? `<span class="lab">多写/拼错的词：<span class="w-extra" lang="fr">${esc(d.extra.join(' '))}</span></span>` : ''}
        ${dictee ? `<span class="lab" style="font-family:var(--zh);margin-top:6px">${esc(s.zh)}</span>` : ''}</div>`;
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
        <button class="btn ghost small" id="fplay">${ICON.play} 播放全文</button>
        <label class="kbd" style="display:flex;gap:6px;align-items:center"><input type="checkbox" id="fhide" ${hideZh ? 'checked' : ''}> 隐藏中文（纯听写）</label>
        <span class="spacer"></span><span class="scorebox" id="fscore"></span>
      </div>
      <div class="textblock" id="flines">${lecon.text.map((r, k) => r.h
        ? `<div class="tline h" lang="fr">${esc(r.h)}</div>`
        : `<div class="tline" data-k="${k}"><div class="row">${playBtn(r.fr)}<div class="body">
            <div class="lzh" ${hideZh ? 'hidden' : ''}>${esc(r.zh)}</div>
            <textarea class="answer-in full-in" lang="fr" rows="1" data-k="${k}" autocapitalize="off" spellcheck="false" placeholder="…">${esc(draft[k] || '')}</textarea>
            <div class="full-res"></div></div></div></div>`).join('')}</div>
      <div class="toolbar" style="margin-top:16px">
        <button class="btn" id="fcheck">检查全部</button><button class="btn ghost" id="fshow">显示答案</button><button class="btn ghost" id="fclear">清空</button>
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
        if (t.value.trim()) { const it = { book: book.id, n: lecon.n, kind: 'sentence', fr: r.fr.replace(/^–\s*/, ''), zh: r.zh.replace(/^–\s*/, '') }; d.perfect ? SRS.hit(it) : SRS.miss(it); }
        t.nextElementSibling.innerHTML = d.perfect ? `<span class="w-ok">✓</span>`
          : `<div lang="fr">${marked(r.fr, d.st)}</div>${d.extra.length ? `<div class="yours">多写/拼错：<span class="w-extra">${esc(d.extra.join(' '))}</span></div>` : ''}`;
      });
      const s = total / areas.length;
      $('#fscore', pane).innerHTML = `正确率 <b>${Math.round(s * 100)}%</b>`;
      ctx.save('full', s);
    };
    $('#fshow', pane).onclick = () => areas.forEach(t => { t.nextElementSibling.innerHTML = `<div lang="fr" class="w-ok">${esc(lecon.text[t.dataset.k].fr)}</div>`; });
    $('#fclear', pane).onclick = () => {
      if (!confirm('清空这一课的默写草稿？')) return;
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
    pane.innerHTML = modeBar([['read', '看着原文读'], ['zh', '看中文背'], ['blind', '盲背']], mode) + `
      ${SR ? '' : '<div class="notice">这个浏览器不支持语音识别。请用 Chrome 或 Safari（macOS）打开；也可以在页面底部打字背诵。</div>'}
      <div class="recite-ctrl">
        <button class="mic" id="mic" aria-label="开始背诵" title="开始 / 停止" ${SR ? '' : 'disabled'}>${ICON.mic}</button>
        <div class="heard" id="heard">${SR ? '点麦克风开始说法语。说对的词会逐个显现；卡住了可以点灰色的词看提示。' : ''}</div>
        <span class="scorebox" id="rscore"></span>
        <button class="btn ghost small" id="rreset">重来</button>
      </div>
      <div class="textblock ${veil ? 'veil' : ''}" id="rlines">${rows.map(r => r.h
        ? `<div class="tline h" lang="fr">${esc(r.h)}</div>`
        : `<div class="tline" data-line="${r.k}"><div class="row">${playBtn(r.fr)}<div class="body">
            ${mode === 'blind' ? '' : mode === 'zh' ? `<div class="lzh">${esc(r.zh)}</div>` : ''}
            <div class="lfr" lang="fr">${markup(r.fr, () => 'rw todo')}</div>
            ${mode === 'read' ? `<div class="lzh">${esc(r.zh)}</div>` : ''}</div></div></div>`).join('')}</div>
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
          if (lt.some(t => t.st !== 'ok')) SRS.miss({ book: ctx.book.id, n: ctx.lecon.n, kind: 'sentence', fr: r.fr.replace(/^–\s*/, ''), zh: r.zh.replace(/^–\s*/, '') }); });
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

  route();
})();
