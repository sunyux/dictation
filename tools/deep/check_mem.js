// Validate one batch of memory aids. usage: node tools/deep/check_mem.js <in.json> <out.json>
const fs = require('fs');
const [inF, outF] = process.argv.slice(2);
const words = JSON.parse(fs.readFileSync(inF, 'utf8')).map(w => w.fr), bad = [];
let d; try { d = JSON.parse(fs.readFileSync(outF, 'utf8')); } catch (e) { console.log('not valid JSON: ' + e.message); process.exit(1); }
const CJK = /[㐀-鿿]/, str = (v, n = 4) => typeof v === 'string' && v.trim().length >= n;
for (const fr of words) {
  const c = d[fr]; if (!c) { bad.push(`missing "${fr}"`); continue; }
  const p = [];
  if (!(c.t === null || str(c.t, 2))) p.push('t');
  for (const l of ['zh', 'en']) {
    const x = c[l]; if (!x) { p.push(l); continue; }
    if (!str(x.h)) p.push(l + '.h'); if (!str(x.s)) p.push(l + '.s');
    if (!(x.r === null || str(x.r))) p.push(l + '.r');
    if (l === 'en' && CJK.test([x.h, x.r, x.s].join(' '))) p.push('CJK-in-en');
    if (l === 'zh' && !CJK.test(x.h || '')) p.push('no-CJK-in-zh.h');
  }
  if (p.length) bad.push(`"${fr}" -> ${p.join(', ')}`);
}
for (const k of Object.keys(d)) if (!words.includes(k)) bad.push(`unexpected key "${k}"`);
if (bad.length) { console.log(bad.join('\n')); process.exit(1); }
console.log(`OK ${words.length}`);
