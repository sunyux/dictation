// A4 "draw it yourself" workbook for one unit of an NLF book: French word, meaning, a drawing box and a line for your own memory sentence.
// usage: node tools/workbook.js <bookId> <lecon n> <out.html>      then print the HTML to PDF (see README / the Chrome command in the session)
global.window = {}; const fs = require('fs'), path = require('path');
const files = { nlf: 'nlf-data.js', 'nlf-a2': 'nlf-a2.js', 'nlf-b': 'nlf-b.js' };
const [bid, nStr, out] = process.argv.slice(2);
eval(fs.readFileSync(path.join(__dirname, '..', files[bid]), 'utf8'));
const memFile = path.join(__dirname, '..', 'deep-nlf', ({ nlf: 'a1', 'nlf-a2': 'a2', 'nlf-b': 'b' })[bid] + '-mem.js');
if (fs.existsSync(memFile)) eval(fs.readFileSync(memFile, 'utf8'));   // memory tricks, when the book has them
const MEM = window.MEM || {};
const book = window.BOOKS.find(b => b.id === bid), lecon = book.units.flatMap(u => u.lecons).find(l => l.n === +nStr);
const esc = s => String(s || '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const tip = t => esc(String(t || '').replace(/\{([^}]*)\}/g, '§$1§')).replace(/§([^§]*)§/g, '<b>$1</b>');
const seen = new Set(), words = lecon.vocab.filter(v => !seen.has(v.fr) && seen.add(v.fr));
const kind = v => v.g.startsWith('阳') ? 'm' : v.g.startsWith('阴') ? 'f' : v.g === '动词' ? 'v' : v.g === '形容词' ? 'a' : 'o';
const KL = { m: ['un · le', 'm'], f: ['une · la', 'f'], v: ['verbe', 'v'], a: ['adjectif', 'a'], o: ['', 'o'] };
const cell = (v, i) => `<div class="cell k-${kind(v)}">
  <div class="top"><span class="no">${i + 1}</span><span class="fr">${esc(v.fr)}</span></div>
  <div class="mean"><span class="zh">${esc(v.zh)}</span> <span class="en">${esc(v.en)}</span></div>
  ${MEM[v.fr] ? `<div class="tip"><b>🔊</b> ${esc(MEM[v.fr].z.h)}</div>` : v.tip ? `<div class="tip">${tip(v.tip)}</div>` : ''}
  <div class="draw"><span>画一画 · draw it</span></div>
  <div class="mine">我的记忆句 · my sentence: <i></i></div></div>`;
const per = 8, pages = [];
for (let i = 0; i < words.length; i += per) pages.push(words.slice(i, i + per).map((v, k) => cell(v, i + k)).join(''));
const html = `<!doctype html><html lang="fr"><meta charset="utf-8"><title>${esc(lecon.title)} — draw it</title><style>
@page { size: A4; margin: 0; }
* { box-sizing: border-box; }
body { margin: 0; font-family: "PingFang SC", "Hiragino Sans GB", "Helvetica Neue", Arial, sans-serif; color: #2a2723; }
.page { width: 210mm; height: 297mm; padding: 9mm 10mm 8mm; page-break-after: always; display: flex; flex-direction: column; }
.hd { display: flex; justify-content: space-between; align-items: baseline; border-bottom: 0.5mm solid #2a2723; padding-bottom: 1.5mm; margin-bottom: 3mm; font-size: 9pt; }
.hd b { font: 600 12pt Georgia, serif; }
.grid { flex: 1; display: grid; grid-template-columns: 1fr 1fr; grid-template-rows: repeat(4, 1fr); gap: 3mm; min-height: 0; }
.cell { border: 0.3mm solid #b9ad94; border-top-width: 1.6mm; border-radius: 1.5mm; padding: 2mm 2.5mm 2mm; display: flex; flex-direction: column; gap: 1mm; min-height: 0; background: #fffdf8; }
.k-m { border-top-color: #3f7fa8; } .k-f { border-top-color: #b4306a; } .k-v { border-top-color: #3c8d5a; } .k-a { border-top-color: #c08a2e; } .k-o { border-top-color: #8d8473; }
.top { display: flex; align-items: baseline; gap: 2mm; }
.no { font: 7pt "Courier New", monospace; color: #8d8473; }
.fr { font: 600 15pt/1.15 Georgia, "Times New Roman", serif; }
.mean { font-size: 9.5pt; line-height: 1.25; }
.mean .en { color: #6a645a; font-size: 8.5pt; }
.tip { font-size: 7.5pt; color: #6a645a; line-height: 1.25; max-height: 2.5em; overflow: hidden; }
.tip b { color: #b4483c; font-family: Georgia, serif; font-size: 8.5pt; }
.draw { flex: 1; min-height: 0; border: 0.35mm dashed #a79d86; border-radius: 1.5mm; position: relative; background: #fff; }
.draw span { position: absolute; right: 1.5mm; bottom: 0.8mm; font-size: 6pt; color: #b3aa97; }
.mine { font-size: 7pt; color: #6a645a; display: flex; gap: 1.5mm; align-items: flex-end; }
.mine i { flex: 1; border-bottom: 0.25mm solid #8d8473; height: 4mm; }
.cover { justify-content: center; align-items: center; text-align: center; gap: 6mm; }
.cover h1 { font: 600 34pt Georgia, serif; margin: 0; }
.cover h2 { font: 400 15pt Georgia, serif; margin: 0; color: #6a645a; }
.cover ol { text-align: left; font-size: 12pt; line-height: 1.8; max-width: 140mm; }
.leg { display: flex; gap: 6mm; font-size: 10pt; }
.leg i { display: inline-block; width: 8mm; height: 2mm; vertical-align: middle; margin-right: 2mm; border-radius: 1mm; }
</style>
<div class="page cover"><div><div style="font-size:11pt;letter-spacing:.2em;color:#8d8473">NLF · ${esc(book.level)} · UNITÉ ${lecon.n % 100}</div><h1>${esc(lecon.title)}</h1><h2>${esc(lecon.zh)} · ${words.length} mots</h2></div>
<ol><li>大声读出这个词。Say the word out loud.</li><li>画下你脑子里第一个出现的画面——不用画得好看！Draw the first picture that comes to mind — it does not need to be pretty!</li><li>在底下的横线上写一句你自己的记忆句。Write your own memory sentence on the line.</li><li>隔几天翻回来，先盖住法语，看图想词。A few days later, cover the French and recall the word from your picture.</li></ol>
<div class="leg"><span><i style="background:#3f7fa8"></i>阳性 masculin</span><span><i style="background:#b4306a"></i>阴性 féminin</span><span><i style="background:#3c8d5a"></i>动词 verbe</span><span><i style="background:#c08a2e"></i>形容词 adjectif</span></div></div>
${pages.map((g, i) => `<div class="page"><div class="hd"><b>${esc(lecon.title)}</b><span>Unité ${lecon.n % 100} · ${i + 1} / ${pages.length}</span></div><div class="grid">${g}</div></div>`).join('')}
</html>`;
fs.writeFileSync(out, html);
console.log(words.length, 'words,', pages.length, 'pages ->', out);
