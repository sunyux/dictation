#!/usr/bin/env node
// Builds tcf-data.js (the "TCF 词汇" book) from the local TCF vocabulary list.
// usage: node tools/build_tcf.js [path/to/data-vocab/index.js]
//
// This site is public, so ONLY headwords, word class, Chinese + English meaning, level and
// how often each one appears are copied. The source's example sentences and their exam
// references (fields x, y, ref, tk, f) are never read into the output.
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..'), DIR = path.join(__dirname, 'tcf');
const SRC = process.argv[2] || path.join(require('os').homedir(), 'tcf-scraper/web/data-vocab/index.js');
global.window = {}; require(path.resolve(SRC));
const V = window.TCF_VOCAB;
const lines = f => fs.readFileSync(path.join(DIR, f), 'utf8').split('\n').filter(l => l.trim() && !l.startsWith('#'));
const pairs = f => new Map(lines(f).map(l => { const i = l.indexOf('|'); return [l.slice(0, i), l.slice(i + 1)]; }));
const zhFix = pairs('zhfix.txt'), enFix = pairs('enfix.txt');

// gender / word-class corrections
const GEN = new Map();
for (const l of lines('genders.txt')) {
  const m = l.match(/^(\S+):\s*(.*)$/);
  for (const w of m[2].split(',').map(s => s.trim()).filter(Boolean)) GEN.set(w, m[1]);
}
// genders already printed in the site's own books (checked: no conflicts with the source)
const BOOK_GENDER = (() => {
  const sandbox = { BOOKS: [] }, keep = global.window; global.window = sandbox;
  for (const f of ['data.js', 'nlf-data.js', 'nlf-a2.js', 'nlf-b.js']) eval(fs.readFileSync(path.join(ROOT, f), 'utf8').replace(/\bwindow\b/g, 'sandbox'));
  global.window = keep;
  const m = new Map();
  for (const b of sandbox.BOOKS) for (const u of b.units) for (const l of u.lecons) for (const v of l.vocab || []) {
    const g = /^n\.\s*m\.(?!\s*[\/,])/.test(v.pos) ? 'm' : /^n\.\s*f\./.test(v.pos) ? 'f' : '';
    if (!g) continue;
    const k = v.fr.toLowerCase().replace(/^(le |la |les |l'|l’|un |une |des )/, '').trim();
    m.set(k, m.has(k) && m.get(k) !== g ? '' : g);
  }
  return m;
})();

const GROUPS = ['阳性名词', '阴性名词', '名词', '动词', '形容词', '副词', '其他词', '短语'];
const NOUN = { m: [0, 'n.m.'], f: [1, 'n.f.'], mf: [2, 'n.'], mp: [0, 'n.m.pl.'], fp: [1, 'n.f.pl.'] };
const OTHER = { v: [3, 'v.'], adj: [4, 'adj.'], adv: [5, 'adv.'], conj: [6, 'conj.'], 'prép': [6, 'prép.'], pron: [6, 'pron.'], interj: [6, 'interj.'], num: [6, 'num.'] };
const clean = s => String(s || '').replace(/[\t\r\n]+/g, ' ').trim();
const noGender = [];

function word(w) {
  let code = GEN.get(w.w);
  if (!code) code = w.c === 'n' ? (w.g || BOOK_GENDER.get(w.w.toLowerCase()) || '') : w.c;
  if (code === 'drop') return null;
  if (!NOUN[code] && !OTHER[code]) { noGender.push(w.w); code = 'mf'; }
  const [g, pos] = NOUN[code] || OTHER[code];
  return [g, w.w, pos, clean(zhFix.get(w.w) || w.zh), clean(enFix.get(w.w) || w.en)];
}

const words = V.words.map((w, i) => ({ w, i, lr: w.n[0] + w.n[1], ws: w.n[2] + w.n[3] })).filter(x => x.lr >= 2 || x.ws >= 2);
const section = (list, count) => list.sort((a, b) => b[count] - a[count] || a.i - b.i)
  .map(x => { const r = word(x.w); return r && [...r, x[count]]; }).filter(Boolean);
const byLevel = (...lv) => section(words.filter(x => x.lr >= 2 && lv.includes(x.w.lv)), 'lr');
const unplaced = words.filter(x => x.lr >= 2 && !['A1', 'A2', 'B1', 'B2', 'C1', 'C2'].includes(x.w.lv));
if (unplaced.length) throw new Error('listening/reading words without a level: ' + unplaced.map(x => x.w.w).join(', '));

// phrases: Chinese (and spelling fixes) from phrases_zh.tsv, keyed by the source spelling
const PZH = new Map(lines('phrases_zh.tsv').map(l => { const [k, zh, fr] = l.split('\t'); return [k, { zh, fr }]; }));
const untranslated = V.phrases.filter(p => !PZH.has(p.w)).map(p => p.w);
const merged = new Map();   // singular / plural (and oe / œ) spellings of one phrase become one entry
V.phrases.forEach((p, i) => {
  const t = PZH.get(p.w); if (!t || t.zh === '-') return;
  const fr = t.fr || p.w;
  const key = fr.toLowerCase().replace(/[’`]/g, "'").replace(/œ/g, 'oe').split(/\s+/).map(s => s.replace(/(?<=..)[sx]$/, '')).join(' ');
  const row = { i, fr, zh: t.zh, en: p.en, n: p.n[0] + p.n[1] };
  const had = merged.get(key);
  if (!had) merged.set(key, row);
  else { const keep = row.fr.length < had.fr.length ? row : had; merged.set(key, { ...keep, i: had.i, n: had.n + row.n }); }
});
const phrases = [...merged.values()].sort((a, b) => b.n - a.n || a.i - b.i)
  .map(p => [7, p.fr, 'loc.', clean(zhFix.get(p.fr) || p.zh), clean(enFix.get(p.fr) || p.en), p.n]);

// section id, label, Chinese note, English note, first leçon number (fixed ranges, so saved progress stays put), rows
const SECTIONS = [
  ['A1', '听力和阅读里的 A1 词', 'A1 words from listening and reading', 1100, byLevel('A1')],
  ['A2', '听力和阅读里的 A2 词', 'A2 words from listening and reading', 1200, byLevel('A2')],
  ['B1', '听力和阅读里的 B1 词', 'B1 words from listening and reading', 1300, byLevel('B1')],
  ['B2', '听力和阅读里的 B2 词', 'B2 words from listening and reading', 1400, byLevel('B2')],
  ['C1–C2', '听力和阅读里的 C1、C2 词', 'C1 and C2 words from listening and reading', 1500, byLevel('C1', 'C2')],
  ['Écrit et oral', '只在写作和口语里常见的词', 'Words that come up in writing and speaking only', 1600, section(words.filter(x => x.lr < 2), 'ws')],
  ['Expressions', '短语搭配', 'Phrases and collocations', 1700, phrases],
];
const SIZE = 100;
const data = SECTIONS.map(([label, zh, en, base, rows]) => {
  const les = [];
  for (let k = 0; k * SIZE < rows.length; k++) {
    if (k >= 99) throw new Error('more than 99 leçons in ' + label);
    les.push([base + k + 1, k * SIZE + 1, rows.slice(k * SIZE, (k + 1) * SIZE)]);
  }
  return [label, zh, en, les];
});

const out = `// Generated by tools/build_tcf.js — do not edit by hand.
// TCF vocabulary: headwords, word class, meanings, level and frequency only (no exam sentences or references).
// Row: [group, French, word class, Chinese, English, times seen]
(function () {
  var G = ${JSON.stringify(GROUPS)};
  var D = ${JSON.stringify(data)};
  var units = D.map(function (s, si) {
    return { n: si + 1, label: s[0], zh: s[1], en: s[2], lecons: s[3].map(function (l, li) {
      var rows = l[2], from = l[1], to = from + rows.length - 1;
      var vocab = rows.map(function (r) { var v = { g: G[r[0]], fr: r[1], pos: r[2], zh: r[3], en: r[4], f: r[5] }; if (r[2] === 'v.') v.nc = 1; return v; })
        .sort(function (a, b) { return G.indexOf(a.g) - G.indexOf(b.g) || b.f - a.f; });
      return { n: l[0], label: s[0] + ' · ' + (li + 1), title: rows.slice(0, 3).map(function (r) { return r[1]; }).join(' · '),
        zh: '按出现次数排第 ' + from + '–' + to + ' 位', en: 'Ranks ' + from + '–' + to + ' by frequency', vocab: vocab, cloze: [], text: [] };
    }) };
  });
  (window.BOOKS = window.BOOKS || []).push({ id: 'tcf', title: 'TCF Vocabulaire', zhTitle: 'TCF 词汇', fr: 'Vocabulaire',
    flat: true, wordsOnly: true, level: 'TCF', units: units });
})();
`;
fs.writeFileSync(path.join(ROOT, 'tcf-data.js'), out);
for (const s of data) console.log(s[0].padEnd(14), 'entries', s[3].reduce((a, l) => a + l[2].length, 0), 'leçons', s[3].length);
console.log('size', (out.length / 1024).toFixed(0), 'KB (chars)');
if (noGender.length) console.log('NOUNS WITHOUT GENDER (' + noGender.length + '):', noGender.join(', '));
if (untranslated.length) console.log('PHRASES WITHOUT CHINESE, left out (' + untranslated.length + '):', untranslated.join(' | '));
