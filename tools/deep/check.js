// Validate one batch of in-depth cards.
// usage: node tools/deep/check.js <in.json> <out.zh.json> <out.en.json>
const fs = require('fs');
const [inF, zhF, enF] = process.argv.slice(2);
const words = JSON.parse(fs.readFileSync(inF, 'utf8')).map(w => w.fr);
const bad = [];
const CJK = /[㐀-鿿]/;
const str = (v, min = 1) => typeof v === 'string' && v.trim().length >= min;
const pairs = (a, n) => Array.isArray(a) && a.length >= n && a.every(p => Array.isArray(p) && p.length === 2 && str(p[0]) && str(p[1]));
function check(file, lang) {
  let d; try { d = JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) { bad.push(`${file}: not valid JSON (${e.message})`); return; }
  for (const fr of words) if (!d[fr]) bad.push(`${lang}: missing "${fr}"`);
  for (const k of Object.keys(d)) if (!words.includes(k)) bad.push(`${lang}: unexpected key "${k}"`);
  for (const fr of words) {
    const c = d[fr]; if (!c) continue; const p = [];
    for (const f of ['pos', 'ipa', 'ph', 'pi', 'et', 'fq', 'me']) if (!str(c[f])) p.push(f);
    if (!str(c.s, 12)) p.push('s');
    if (lang === 'en' && !str(c.cog)) p.push('cog');
    if (!/^\[.+\]$/.test(c.ipa || '')) p.push('ipa-format');
    if (!pairs(c.ex, 2)) p.push('ex(>=2 pairs)');
    if (!pairs(c.co, 2)) p.push('co(>=2 pairs)');
    if (!Array.isArray(c.sy) || !c.sy.length || !c.sy.every(t => Array.isArray(t) && t.length === 3 && t.every(x => str(x)))) p.push('sy(>=1 triples)');
    const tk = lang === 'zh' ? 'zh' : 'en';
    if (!c.tr || !['fr', 'alt', 'note', tk].every(f => str(c.tr[f]))) p.push('tr');
    const txt = [c.s, c.ph, c.pi, c.et, c.fq, c.me, c.pos].join(' ');
    if (lang === 'en' && CJK.test(txt)) p.push('CJK-in-en');
    if (lang === 'zh' && !CJK.test(c.s || '')) p.push('no-CJK-in-zh');
    if (p.length) bad.push(`${lang}: "${fr}" -> ${p.join(', ')}`);
  }
}
check(zhF, 'zh'); check(enF, 'en');
if (bad.length) { console.log(bad.join('\n')); process.exit(1); }
console.log(`OK ${words.length} words`);
