// Spelling aids for letter-order mix-ups (dyslexia):
//  · syllable chunks (French words split into alternating-colour syllables, a heuristic)
//  · letter-by-letter comparison of what you wrote vs the right word, with swapped letters called out
//  · "read the letters" (French letter names, each letter lights up) and letter tiles (put the word together)
// Pure helpers on window.DYS; app.js wires them into the drills.
(function () {
  const V = 'aeiouyàâäéèêëîïôöùûüœæ';
  const isV = c => V.includes(c.toLowerCase());
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  /* ---------- syllables (approximate) ---------- */
  const ONSET2 = new Set(['bl', 'br', 'cl', 'cr', 'dr', 'fl', 'fr', 'gl', 'gr', 'pl', 'pr', 'tr', 'vr']);
  const DIGRAPH = new Set(['ch', 'ph', 'th', 'gn', 'qu', 'gu']);
  function syllabify(word) {
    const w = [...word];
    // vowel groups
    const groups = []; let i = 0;
    while (i < w.length) {
      if (isV(w[i])) { let j = i; while (j < w.length && isV(w[j])) j++; groups.push([i, j]); i = j; } else i++;
    }
    if (groups.length < 2) return [word];
    const cuts = [];
    for (let g = 0; g < groups.length - 1; g++) {
      const a = groups[g][1], b = groups[g + 1][0];      // consonants between: a..b
      const n = b - a;
      if (n === 0) continue;
      let cut;
      if (n === 1) cut = a;
      else {
        const last2 = (w[b - 2] + w[b - 1]).toLowerCase();
        if (n === 2 && (DIGRAPH.has(last2) || ONSET2.has(last2) && !DIGRAPH.has(last2))) cut = b - 2;
        else if (n >= 3 && (DIGRAPH.has(last2) || ONSET2.has(last2))) cut = b - 2;
        else cut = b - 1;
      }
      cuts.push(cut);
    }
    const parts = []; let from = 0;
    [...new Set(cuts)].sort((x, y) => x - y).forEach(c => { if (c > from) { parts.push(w.slice(from, c).join('')); from = c; } });
    parts.push(w.slice(from).join(''));
    // a trailing part without a vowel (final consonants) joins the previous one
    while (parts.length > 1 && ![...parts[parts.length - 1]].some(isV)) { const l = parts.pop(); parts[parts.length - 1] += l; }
    return parts;
  }
  /* ---------- silent and nasal letters (rule-based; exceptions listed) ---------- */
  const SOUNDED_END = new Set(['bus', 'sud', 'est', 'ouest', 'tennis', 'fils', 'huit', 'six', 'dix', 'week-end', 'stress', 'match', 'golf', 'sac', 'but', 'net', 'cap', 'stop', 'bar', 'lac', 'mer', 'hiver', 'enfer', 'super', 'hier', 'amer', 'ananas', 'maïs', 'plus', 'os', 'ours', 'tous', 'jus', 'cours']);
  const NO_FINAL_E = new Set(['que', 'le', 'me', 'te', 'se', 'ne', 'ce', 'de', 'je']);
  // returns, for each letter, '' | 'sil' (silent) | 'nas' (written n/m that only nasalises the vowel before it)
  function mask(word) {
    const w = [...word], lw = w.map(c => c.toLowerCase()), n = w.length, m = new Array(n).fill('');
    const base = lw.join('');
    const isC = i => i >= 0 && i < n && !isV(lw[i]) && /[a-zç]/.test(lw[i]);
    const syl = syllabify(word).length;
    // h on its own (not ch / ph / th)
    for (let i = 0; i < n; i++) if (lw[i] === 'h' && !(i > 0 && 'cpt'.includes(lw[i - 1]) && 'ctp'.includes(lw[i - 1]))) m[i] = 'sil';
    // u after q, and after g before e / i
    for (let i = 1; i < n - 1; i++) if (lw[i] === 'u' && (lw[i - 1] === 'q' || (lw[i - 1] === 'g' && 'eiéèê'.includes(lw[i + 1])))) m[i] = 'sil';
    // nasal n / m: vowel + n|m + consonant or end (not nn / mm, not before a vowel)
    for (let i = 1; i < n; i++) if ((lw[i] === 'n' || lw[i] === 'm') && isV(lw[i - 1]) && lw[i + 1] !== lw[i] && (i === n - 1 || (!isV(lw[i + 1]) && lw[i + 1] !== 'h' && lw[i + 1] !== undefined))) m[i] = 'nas';
    if (SOUNDED_END.has(base)) return m;
    // endings
    const set = (i, v = 'sil') => { if (i >= 0 && i < n && !m[i]) m[i] = v; };
    const last = lw[n - 1];
    if (/(e)(s)$/.test(base) && n > 3 && !/[èé]s$/.test(base) && syl >= 2) { set(n - 2); set(n - 1); }   // femmes
    else if (/ent$/.test(base) && n > 4 && syl >= 2) { set(n - 1); }                                      // comment, souvent (t)
    else if (/er$/.test(base) && syl >= 2) { set(n - 1); }                                                  // parler, boulanger
    else if (/ez$/.test(base) && n > 3) { set(n - 1); }                                                     // vous parlez
    else if (last === 'e' && n > 2 && !NO_FINAL_E.has(base) && [...lw.slice(0, n - 1)].some(isV)) { set(n - 1); }
    else if ('sxzdtp'.includes(last) && n > 2) { set(n - 1); }
    else if (last === 'g' && lw[n - 2] === 'n') { set(n - 1); }                                              // long
    else if (last === 'c' && lw[n - 2] === 'n') { set(n - 1); }                                              // blanc
    // e before a hard g in -geons / -geant: mangeons
    for (let i = 1; i < n - 1; i++) if (lw[i] === 'e' && lw[i - 1] === 'g' && 'aoàô'.includes(lw[i + 1])) set(i);
    return m;
  }
  // word(s) → HTML with alternating-colour syllables; silent letters grey, nasal markers dotted
  function chunk(text) {
    return String(text).split(/([\s'’\-–.,;:!?()¿¡…]+)/).map(tok => {
      if (!tok || /^[\s'’\-–.,;:!?()¿¡…]+$/.test(tok) || !/[a-zàâäéèêëîïôöùûüœæç]/i.test(tok)) return esc(tok);
      const mk = mask(tok); let at = 0;
      return syllabify(tok).map((sy, k) => {
        const inner = [...sy].map(ch => { const c = mk[at++]; return c ? `<i class="${c === 'sil' ? 'sl' : 'nl'}">${esc(ch)}</i>` : esc(ch); }).join('');
        return `<span class="syl s${k % 2}">${inner}</span>`;
      }).join('');
    }).join('');
  }

  /* ---------- letter-by-letter comparison ---------- */
  const norm = s => s.normalize('NFC').toLowerCase().trim();
  function align(t, c) {          // Levenshtein with adjacent swaps (Damerau); returns ops from typed t to correct c
    const n = t.length, m = c.length, d = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
    for (let i = 0; i <= n; i++) d[i][0] = i; for (let j = 0; j <= m; j++) d[0][j] = j;
    for (let i = 1; i <= n; i++) for (let j = 1; j <= m; j++) {
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (t[i - 1] === c[j - 1] ? 0 : 1));
      if (i > 1 && j > 1 && t[i - 1] === c[j - 2] && t[i - 2] === c[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
    }
    const ops = []; let i = n, j = m;
    while (i > 0 || j > 0) {
      if (i > 1 && j > 1 && t[i - 1] === c[j - 2] && t[i - 2] === c[j - 1] && d[i][j] === d[i - 2][j - 2] + 1) { ops.push({ k: 'swap', t: t[i - 2] + t[i - 1], c: c[j - 2] + c[j - 1] }); i -= 2; j -= 2; }
      else if (i > 0 && j > 0 && t[i - 1] === c[j - 1] && d[i][j] === d[i - 1][j - 1]) { ops.push({ k: 'eq', t: t[i - 1], c: c[j - 1] }); i--; j--; }
      else if (i > 0 && j > 0 && d[i][j] === d[i - 1][j - 1] + 1) { ops.push({ k: 'sub', t: t[i - 1], c: c[j - 1] }); i--; j--; }
      else if (j > 0 && d[i][j] === d[i][j - 1] + 1) { ops.push({ k: 'ins', c: c[j - 1] }); j--; }
      else { ops.push({ k: 'del', t: t[i - 1] }); i--; }
    }
    return ops.reverse();
  }
  // returns HTML: "you wrote" row and "right" row, aligned by letter, plus a sentence about swaps
  function compare(correct, typed, lang) {
    const T = [...norm(typed)], C = [...norm(correct)];
    if (!T.length || T.join('') === C.join('')) return '';
    const ops = align(T, C);
    const wrote = [], right = []; const swaps = [];
    ops.forEach(o => {
      if (o.k === 'eq') { wrote.push(`<i>${esc(o.t)}</i>`); right.push(`<i>${esc(o.c)}</i>`); }
      else if (o.k === 'swap') { wrote.push(`<i class="sw">${esc(o.t)}</i>`); right.push(`<i class="sw">${esc(o.c)}</i>`); swaps.push(o); }
      else if (o.k === 'sub') { wrote.push(`<i class="bad">${esc(o.t)}</i>`); right.push(`<i class="fix">${esc(o.c)}</i>`); }
      else if (o.k === 'ins') { wrote.push('<i class="gap">_</i>'); right.push(`<i class="fix">${esc(o.c)}</i>`); }
      else { wrote.push(`<i class="bad">${esc(o.t)}</i>`); right.push('<i class="gap"></i>'); }
    });
    const en = lang === 'en', zhen = lang === 'zhen';
    const L = (zh, e) => (en ? e : zhen ? `${zh} · ${e}` : zh);
    const note = swaps.length
      ? `<p class="cmp-note">${L('这里有两个字母顺序反了：', 'Two letters are in the wrong order: ')}${swaps.map(s => `<b>${esc(s.t)}</b> → <b>${esc(s.c)}</b>`).join('，')}</p>`
      : '';
    return `<div class="cmp" lang="fr"><div class="cmp-row"><span class="cmp-lab">${L('你写的', 'You')}</span><span class="cmp-w">${wrote.join('')}</span></div>
      <div class="cmp-row"><span class="cmp-lab">${L('正确', 'Right')}</span><span class="cmp-w">${right.join('')}</span></div></div>${note}`;
  }

  /* ---------- where you usually go wrong in a word ---------- */
  // attempts: strings you wrote instead of `correct`. Returns { marks:Set(index in correct), text } for the 1–2 commonest slips.
  function spots(correct, attempts, lang) {
    const C = [...norm(correct)], tally = new Map();
    attempts.forEach(a => {
      const T = [...norm(a)]; if (!T.length || T.join('') === C.join('')) return;
      let ci = 0;
      align(T, C).forEach(o => {
        let key, i = ci;
        if (o.k === 'eq') { ci++; return; }
        if (o.k === 'swap') { key = `swap|${i}|${o.c}|${o.t}`; ci += 2; }
        else if (o.k === 'sub') { key = `sub|${i}|${o.c}|${o.t}`; ci++; }
        else if (o.k === 'ins') { key = `miss|${i}|${o.c}|`; ci++; }
        else { i = Math.max(0, ci - 1); key = `extra|${i}|${C[i] || ''}|${o.t}`; }
        tally.set(key, (tally.get(key) || 0) + 1);
      });
    });
    if (!tally.size) return null;
    const list = [...tally.entries()].map(([k, n]) => { const [kind, i, c, t] = k.split('|'); return { kind, i: +i, c, t, n }; }).sort((a, b) => b.n - a.n || a.i - b.i);
    const top = list.slice(0, 2), marks = new Set();
    const en = lang === 'en', both = lang === 'zhen';
    const L = (zh, e) => (en ? e : both ? `${zh} · ${e}` : zh);
    const sent = d => {
      if (d.kind === 'swap') { [d.i, d.i + 1].forEach(x => marks.add(x)); return L(`第 ${d.i + 1}–${d.i + 2} 位 “${d.c}” 容易写反（写成过 “${d.t}”）`, `letters ${d.i + 1}–${d.i + 2} “${d.c}” often come out reversed (“${d.t}”)`); }
      marks.add(d.i);
      if (d.kind === 'sub') return L(`第 ${d.i + 1} 位 “${d.c}” 容易写成 “${d.t}”`, `letter ${d.i + 1} “${d.c}” often becomes “${d.t}”`);
      if (d.kind === 'miss') return L(`第 ${d.i + 1} 位 “${d.c}” 容易漏掉`, `letter ${d.i + 1} “${d.c}” often gets left out`);
      return L(`“${d.c}” 后面容易多写 “${d.t}”`, `an extra “${d.t}” often sneaks in after “${d.c}”`);
    };
    return { text: top.map(sent).join(en ? '; ' : '；'), marks, n: top[0].n };
  }
  // the word with the trouble letters underlined
  function marked(word, marks) {
    return [...word].map((c, i) => marks.has(i) ? `<u class="hot">${esc(c)}</u>` : esc(c)).join('');
  }

  /* ---------- reading the letters aloud ---------- */
  const NAMES = { a: 'a', b: 'bé', c: 'cé', d: 'dé', e: 'e', f: 'effe', g: 'gé', h: 'ache', i: 'i', j: 'ji', k: 'ka', l: 'elle', m: 'emme', n: 'enne', o: 'o', p: 'pé', q: 'ku', r: 'erre', s: 'esse', t: 'té', u: 'u', v: 'vé', w: 'double vé', x: 'ixe', y: 'i grec', z: 'zède',
    'é': 'e accent aigu', 'è': 'e accent grave', 'ê': 'e accent circonflexe', 'ë': 'e tréma', 'à': 'a accent grave', 'â': 'a accent circonflexe', 'ù': 'u accent grave', 'û': 'u accent circonflexe', 'î': 'i accent circonflexe', 'ô': 'o accent circonflexe', 'ç': 'c cédille', 'œ': 'o e dans l\'o', '\'': 'apostrophe', '’': 'apostrophe', '-': 'trait d\'union' };
  let token = 0;
  function spell(word, row, say) {          // row: element holding .sp-l spans; say(text, onend)
    const my = ++token, ls = [...row.querySelectorAll('.sp-l')];
    let k = 0;
    const next = () => {
      ls.forEach(x => x.classList.remove('on'));
      if (my !== token || k >= ls.length) return;
      const el = ls[k++]; el.classList.add('on');
      say(NAMES[el.dataset.l.toLowerCase()] || el.dataset.l, () => setTimeout(next, 80));
    };
    next();
  }
  const stopSpell = () => { token++; };
  function spellRow(word) {
    return `<span class="sp-row" lang="fr">${[...word].filter(c => c !== ' ').map(c => `<span class="sp-l" data-l="${esc(c)}">${esc(c)}</span>`).join('')}</span>`;
  }

  /* ---------- letter tiles ---------- */
  function shuffleNoSame(arr) {
    const a = arr.slice();
    for (let n = 0; n < 8; n++) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } if (a.join('') !== arr.join('') || arr.length < 3) break; }
    return a;
  }
  // mounts tiles into el; calls onChange(value) as the word is built
  function tiles(el, word, onChange) {
    const letters = [...word.replace(/\s+/g, '')];
    const pool = shuffleNoSame(letters).map((l, id) => ({ l, id, used: false }));
    let built = [];
    const draw = () => {
      el.innerHTML = `<div class="tl-built" lang="fr">${built.map(b => `<span class="tl-b">${esc(b.l)}</span>`).join('') || '<span class="tl-hint">…</span>'}</div>
        <div class="tl-pool">${pool.map(p => `<button type="button" class="tl-t" data-id="${p.id}" ${p.used ? 'disabled' : ''} lang="fr">${esc(p.l)}</button>`).join('')}
        <button type="button" class="tl-undo">⌫</button></div>`;
      el.querySelectorAll('.tl-t').forEach(b => b.onclick = () => { const p = pool[+b.dataset.id]; p.used = true; built.push(p); draw(); onChange(built.map(x => x.l).join('')); });
      el.querySelector('.tl-undo').onclick = () => { const p = built.pop(); if (p) { p.used = false; draw(); onChange(built.map(x => x.l).join('')); } };
    };
    draw();
  }

  window.DYS = { syllabify, chunk, mask, spots, marked, compare, spell, stopSpell, spellRow, tiles, NAMES };
})();
