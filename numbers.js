// French numbers, times, dates, prices, ordinals and phone numbers spelled out, with the logic shown.
(function () {
  const U = ['zéro', 'un', 'deux', 'trois', 'quatre', 'cinq', 'six', 'sept', 'huit', 'neuf', 'dix', 'onze', 'douze', 'treize', 'quatorze', 'quinze', 'seize'];
  const T = { 20: 'vingt', 30: 'trente', 40: 'quarante', 50: 'cinquante', 60: 'soixante' };
  // 0–99, traditional spelling (hyphens below 100, "et" for 21, 31 … 71)
  function below100(n, fem) {
    const un = fem ? 'une' : 'un';
    if (n === 1) return un;
    if (n <= 16) return U[n];
    if (n < 20) return 'dix-' + U[n - 10];
    if (n < 70) { const t = Math.floor(n / 10) * 10, u = n % 10; return T[t] + (u === 0 ? '' : u === 1 ? ' et ' + un : '-' + U[u]); }
    if (n < 80) { const r = n - 60; return 'soixante' + (r === 11 ? ' et onze' : '-' + below100(r)); }
    const r = n - 80;
    return r === 0 ? 'quatre-vingts' : 'quatre-vingt-' + (r === 1 ? un : below100(r));
  }
  function below1000(n, fem) {
    const h = Math.floor(n / 100), r = n % 100;
    let s = h === 0 ? '' : h === 1 ? 'cent' : U[h] + (r === 0 ? ' cents' : ' cent');
    if (r) s += (s ? ' ' : '') + below100(r, fem);
    return s;
  }
  function words(n, fem = false) {
    if (n < 0) return 'moins ' + words(-n, fem);
    if (n === 0) return 'zéro';
    const parts = [];
    const bil = Math.floor(n / 1e9), mil = Math.floor(n / 1e6) % 1000, th = Math.floor(n / 1000) % 1000, rest = n % 1000;
    if (bil) parts.push(words(bil) + (bil > 1 ? ' milliards' : ' milliard'));
    if (mil) parts.push(below1000(mil) + (mil > 1 ? ' millions' : ' million'));
    // "mille" never takes s; "quatre-vingts"/"cents" lose their s before mille
    if (th) parts.push(th === 1 ? 'mille' : below1000(th).replace(/vingts$/, 'vingt').replace(/cents$/, 'cent') + ' mille');
    if (rest) parts.push(below1000(rest, fem));
    return parts.join(' ').replace(/^un milli/, 'un milli');
  }
  // how a tricky number is built
  function logic(n) {
    const r = n % 100;
    const out = [];
    if (r >= 70 && r < 80) out.push(`${r} = 60 + ${r - 60} → soixante + ${below100(r - 60)}`);
    if (r >= 80) out.push(`${r} = 4 × 20${r > 80 ? ' + ' + (r - 80) : ''} → quatre-vingt${r === 80 ? 's' : '-' + below100(r - 80)}`);
    if (r % 10 === 1 && r > 20 && r < 80) out.push(`${r}：个位是 1 时用 « et »（${below100(r)}） | 1 in the units: « et »`);
    if (r === 81 || r === 91) out.push(`81、91 不用 et | 81 and 91 take no « et »`);
    if (n >= 200 && n % 100 === 0 && n < 1000) out.push(`整百加 s：${below1000(n)} | round hundreds take an s`);
    if (n >= 1000) out.push(`mille 永远不加 s | mille never takes an s`);
    return out;
  }
  const MONTHS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
  const MONTHS_ZH = ['一月', '二月', '三月', '四月', '五月', '六月', '七月', '八月', '九月', '十月', '十一月', '十二月'];
  function ordinal(n, fem) {
    if (n === 1) return fem ? 'première' : 'premier';
    let w = words(n);
    if (w.endsWith('cinq')) return w + 'uième';
    if (w.endsWith('neuf')) return w.slice(0, -1) + 'vième';
    if (w.endsWith('e')) w = w.slice(0, -1);
    if (w.endsWith('quatre-vingts') || w.endsWith('cents')) w = w.slice(0, -1);
    return w + 'ième';
  }
  function hours(h) { return h === 0 ? 'zéro heure' : words(h, true) + (h === 1 ? ' heure' : ' heures'); }
  function timeOf(h, m) {
    const formal = h === 0 && m === 0 ? 'minuit' : h === 12 && m === 0 ? 'midi' : hours(h) + (m ? ' ' + words(m, true) : '');
    // spoken 12-hour style
    let hh = h, mm = m, sign = '';
    if (m > 30) { hh = h + 1; mm = 60 - m; sign = 'moins'; }
    const h12 = hh % 24;
    const base = h12 === 0 ? 'minuit' : h12 === 12 ? 'midi' : hours(h12 > 12 ? h12 - 12 : h12);
    const part = sign ? (mm === 15 ? ' moins le quart' : ' moins ' + words(mm, true)) : m === 0 ? '' : m === 15 ? ' et quart' : m === 30 ? (h12 === 0 || h12 === 12 ? ' et demi' : ' et demie') : ' ' + words(m, true);
    const when = h12 === 0 || h12 === 12 ? '' : h12 < 12 ? ' du matin' : h12 < 18 ? " de l'après-midi" : ' du soir';
    return { formal, spoken: base + part + (when && (h12 >= 12 || h12 < 12 && h < 12) ? when : '') };
  }
  function phone(digits) { return digits.match(/\d\d/g).map(p => p[0] === '0' ? 'zéro ' + U[+p[1]] : words(+p)).join(', '); }

  // turn any input into readings; returns [{fr, label, labelEn, note}]
  function read(input) {
    const s = input.trim().replace(/\s+/g, ' ');
    let m;
    if ((m = s.match(/^(\d{1,2})\s*[:hH]\s*(\d{2})$/))) {
      const h = +m[1], mi = +m[2]; if (h > 23 || mi > 59) return [];
      const t = timeOf(h, mi);
      return [{ fr: t.formal, label: '正式说法（24 小时制，车站、广播）', labelEn: 'Formal (24-hour: stations, announcements)' },
        { fr: t.spoken, label: '口语说法（12 小时制）', labelEn: 'Everyday speech (12-hour)', note: '一点用 une heure；过一刻 et quart，半 et demie，差一刻 moins le quart | une heure; quarter past et quart, half past et demie, quarter to moins le quart' }];
    }
    if ((m = s.match(/^(\d{1,2})[\/.-](\d{1,2})(?:[\/.-](\d{2,4}))?$/))) {
      const d = +m[1], mo = +m[2]; if (!d || d > 31 || !mo || mo > 12) return [];
      let y = m[3] ? +m[3] : null; if (y != null && y < 100) y += 2000;
      return [{ fr: `le ${d === 1 ? 'premier' : words(d)} ${MONTHS[mo - 1]}${y ? ' ' + words(y) : ''}`, label: `日期（${MONTHS_ZH[mo - 1]}）`, labelEn: 'Date',
        note: '日期用基数词，只有 1 号说 premier；日在前、月在后，不用 de | Dates use cardinal numbers, only the 1st is premier; day before month, no « de »' }];
    }
    if ((m = s.match(/^(\d+)\s*(er|re|ère|e|è|ème|eme)$/i))) {
      const n = +m[1], fem = /re|ère/i.test(m[2]);
      return [{ fr: ordinal(n, fem), label: '序数词', labelEn: 'Ordinal', note: '去掉词尾 e 加 -ième；cinq → cinquième，neuf → neuvième | drop final e, add -ième; cinq → cinquième, neuf → neuvième' }];
    }
    if ((m = s.match(/^(?:€\s*)?(\d+)(?:[,.](\d{1,2}))?\s*(?:€|euros?|eur)?$/i)) && /€|eur/i.test(s)) {
      const e = +m[1], c = m[2] ? +(m[2].length === 1 ? m[2] + '0' : m[2]) : 0;
      return [{ fr: `${words(e)} euro${e > 1 ? 's' : ''}${c ? ' ' + words(c) : ''}`, label: '价格', labelEn: 'Price', note: '2,50 € 说 deux euros cinquante（cents 一般省略）| 2,50 € is deux euros cinquante (« centimes » is usually dropped)' }];
    }
    const digits = s.replace(/[ .]/g, '');
    if (/^0\d{9}$/.test(digits)) return [{ fr: phone(digits), label: '电话号码（两位一组）', labelEn: 'Phone number (in pairs)', note: '法国电话号码两位两位地读 | French phone numbers are read two digits at a time' }];
    if ((m = s.replace(/\s/g, '').match(/^(-?\d+),(\d+)$/))) {
      const z = m[2].match(/^0*/)[0].length, rest = m[2].slice(z);
      return [{ fr: `${words(+m[1])} virgule ${'zéro '.repeat(z)}${rest ? words(+rest) : ''}`.trim(),
        label: '小数（法语用逗号）', labelEn: 'Decimal (French uses a comma)', note: '小数点在法语里是逗号，读 virgule | the decimal point is a comma, read « virgule »' }];
    }
    if (/^-?\d{1,12}$/.test(s.replace(/[\s.]/g, ''))) {
      const n = +s.replace(/[\s.]/g, '');
      const res = [{ fr: words(n), label: '数字', labelEn: 'Number', logic: logic(Math.abs(n)) }];
      if (n % 10 === 1 && n % 100 !== 11) res.push({ fr: words(n, true), label: '后面跟阴性名词时', labelEn: 'Before a feminine noun' });
      if (n >= 1000 && n <= 2099) res.push({ fr: words(n), label: '作为年份', labelEn: 'As a year', note: '年份也用 mille：1998 = mille neuf cent quatre-vingt-dix-huit | years use mille too' });
      return res;
    }
    return [];
  }
  // random items for the listening practice
  function random(kind) {
    const r = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
    if (kind === 'n100') { const n = Math.random() < 0.5 ? r(60, 99) : r(0, 99); return { fr: words(n), answer: String(n) }; }
    if (kind === 'n10k') { const n = r(100, 9999); return { fr: words(n), answer: String(n) }; }
    if (kind === 'year') { const n = r(1900, 2030); return { fr: words(n), answer: String(n) }; }
    if (kind === 'time') { const h = r(0, 23), m = [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55][r(0, 11)]; return { fr: timeOf(h, m).formal, answer: `${h}:${String(m).padStart(2, '0')}` }; }
    if (kind === 'date') { const d = r(1, 28), mo = r(1, 12); return { fr: `le ${d === 1 ? 'premier' : words(d)} ${MONTHS[mo - 1]}`, answer: `${d}/${mo}` }; }
    if (kind === 'price') { const e = r(1, 99), c = [0, 50, 20, 90, 75, 99][r(0, 5)]; return { fr: `${words(e)} euro${e > 1 ? 's' : ''}${c ? ' ' + words(c) : ''}`, answer: `${e}${c ? ',' + String(c).padStart(2, '0') : ''}` }; }
    if (kind === 'phone') { const d = '0' + r(1, 7) + Array.from({ length: 8 }, () => r(0, 9)).join(''); return { fr: phone(d), answer: d }; }
  }
  window.FRNUM = { words, ordinal, timeOf, read, random };
})();
