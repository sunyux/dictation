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
  // word(s) → HTML with alternating-colour syllables; spaces, apostrophes, hyphens, punctuation kept
  function chunk(text) {
    return String(text).split(/([\s'’\-–.,;:!?()¿¡…]+)/).map(tok => {
      if (!tok || /^[\s'’\-–.,;:!?()¿¡…]+$/.test(tok) || !/[a-zàâäéèêëîïôöùûüœæç]/i.test(tok)) return esc(tok);
      return syllabify(tok).map((s, k) => `<span class="syl s${k % 2}">${esc(s)}</span>`).join('');
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

  window.DYS = { syllabify, chunk, compare, spell, stopSpell, spellRow, tiles, NAMES };
})();
