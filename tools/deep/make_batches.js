// Split the NLF vocabulary into batches of 50 words for writing in-depth cards.
// usage: node tools/deep/make_batches.js <outdir>
global.window = {}; const fs = require('fs');
for (const f of ['nlf-data.js', 'nlf-a2.js', 'nlf-b.js']) eval(fs.readFileSync(f, 'utf8'));
const out = process.argv[2]; fs.mkdirSync(out, { recursive: true });
const short = { nlf: 'a1', 'nlf-a2': 'a2', 'nlf-b': 'b' };
const N = 50; let total = 0;
for (const b of window.BOOKS.filter(b => b.flat)) {
  const seen = new Set(), list = [];
  for (const u of b.units) for (const l of u.lecons) for (const v of l.vocab) {
    if (seen.has(v.fr)) continue; seen.add(v.fr);
    list.push({ fr: v.fr, pos: v.pos, g: v.g, zh: v.zh, en: v.en, ex: v.ex });
  }
  for (let i = 0; i * N < list.length; i++) {
    const name = `${short[b.id]}-${String(i + 1).padStart(2, '0')}`;
    fs.writeFileSync(`${out}/${name}.json`, JSON.stringify(list.slice(i * N, (i + 1) * N), null, 1));
    total++;
  }
  console.log(b.id, list.length, 'words');
}
console.log(total, 'batches');
