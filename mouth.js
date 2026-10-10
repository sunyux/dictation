// Mouth diagrams for the pronunciation book: a side view of the mouth (facing left) plus a small
// front view of the lips. Each sound is described by a few settings and drawn from them.
(function () {
  // tongue: [x, y] of the highest point of the tongue (x small = front, y small = high)
  // lips: spread | round | neutral · open: 0–1 jaw opening · nasal: air through the nose
  // contact: where something closes or narrows (consonants) · voiced: vocal folds vibrate
  const M = {
    a: { tongue: [96, 124], lips: 'neutral', open: 1 },
    i: { tongue: [80, 90], lips: 'spread', open: 0.15 },
    u: { tongue: [122, 90], lips: 'round', open: 0.2 },
    y: { tongue: [80, 90], lips: 'round', open: 0.15 },
    e: { tongue: [82, 98], lips: 'spread', open: 0.35 },
    'ɛ': { tongue: [86, 108], lips: 'spread', open: 0.6 },
    'ə': { tongue: [100, 104], lips: 'round', open: 0.4 },
    o: { tongue: [120, 98], lips: 'round', open: 0.35 },
    'ɔ': { tongue: [118, 110], lips: 'round', open: 0.6 },
    'ø': { tongue: [84, 98], lips: 'round', open: 0.35 },
    'œ': { tongue: [88, 108], lips: 'round', open: 0.6 },
    'ɑ̃': { tongue: [112, 124], lips: 'neutral', open: 0.9, nasal: 1 },
    'ɔ̃': { tongue: [118, 108], lips: 'round', open: 0.5, nasal: 1 },
    'ɛ̃': { tongue: [88, 110], lips: 'spread', open: 0.6, nasal: 1 },
    j: { tongue: [82, 87], lips: 'spread', open: 0.1 },
    w: { tongue: [122, 87], lips: 'round', open: 0.1 },
    'ɥ': { tongue: [80, 87], lips: 'round', open: 0.1 },
    b: { contact: 'lips', voiced: 1 }, p: { contact: 'lips' },
    v: { contact: 'labiodental', voiced: 1, fric: 1 }, f: { contact: 'labiodental', fric: 1 },
    s: { contact: 'alveolar', fric: 1, lips: 'spread' }, z: { contact: 'alveolar', fric: 1, voiced: 1, lips: 'spread' },
    'ʃ': { contact: 'postalveolar', fric: 1, lips: 'round' }, 'ʒ': { contact: 'postalveolar', fric: 1, voiced: 1, lips: 'round' },
    k: { contact: 'velar' }, g: { contact: 'velar', voiced: 1 },
    n: { contact: 'alveolar', nasal: 1, voiced: 1 }, 'ɲ': { contact: 'palatal', nasal: 1, voiced: 1 },
    'ʁ': { contact: 'uvular', fric: 1, voiced: 1 },
  };
  // which diagrams each lesson shows
  window.LESSON_MOUTH = {
    a: ['a'], i: ['i'], ou: ['u'], u: ['y'], e_ferme: ['e'], e_ouvert: ['ɛ'], e_muet: ['ə', 'e'], o: ['o', 'ɔ'], eu: ['ø', 'œ'],
    an: ['ɑ̃'], on: ['ɔ̃'], in: ['ɛ̃'], nasal_n: ['ɔ̃', 'n'], yod: ['j'], oi: ['w'], ui: ['ɥ', 'w'],
    c_g: ['k', 's', 'ʒ'], s_z: ['s', 'z'], ch_j: ['ʃ', 'ʒ'], gn_ill: ['ɲ', 'j'], ph_th_x: ['f', 'ʁ'],
    au_eu: ['o', 'ø'], ou_u: ['u', 'y'], u_eu: ['y', 'ø'], e_e: ['e', 'ɛ'], an_on: ['ɑ̃', 'ɔ̃'], on_in: ['ɔ̃', 'ɛ̃'], an_in: ['ɑ̃', 'ɛ̃'], b_v: ['b', 'v'],
  };
  const PLACE = {
    lips: ['双唇闭合', 'both lips close'], labiodental: ['上齿碰下唇', 'upper teeth on lower lip'],
    alveolar: ['舌尖抵上齿龈', 'tongue tip at the gum ridge'], postalveolar: ['舌尖在齿龈后', 'tongue just behind the gum ridge'],
    palatal: ['舌面贴硬腭', 'tongue body against the hard palate'], velar: ['舌根抵软腭', 'back of tongue against the soft palate'],
    uvular: ['舌根靠近小舌', 'back of tongue near the uvula'],
  };
  const T = (lang, zh, en) => lang === 'en' ? en : lang === 'zhen' ? `${zh} · ${en}` : zh;

  function features(k, s, lang) {
    const f = [];
    if (s.contact) f.push(T(lang, ...PLACE[s.contact]));
    else {
      const [x, y] = s.tongue;
      f.push(T(lang, x < 95 ? '舌位靠前' : x > 110 ? '舌位靠后' : '舌位居中', x < 95 ? 'tongue forward' : x > 110 ? 'tongue back' : 'tongue central'));
      f.push(T(lang, y < 94 ? '舌头抬高' : y < 112 ? '舌头半高' : '舌头放低', y < 94 ? 'tongue high' : y < 112 ? 'tongue mid' : 'tongue low'));
    }
    if (s.lips === 'round') f.push(T(lang, '嘴唇撮圆', 'lips rounded'));
    if (s.lips === 'spread') f.push(T(lang, '嘴角拉开', 'lips spread'));
    if (s.nasal) f.push(T(lang, '气流走鼻腔', 'air through the nose'));
    if (s.fric) f.push(T(lang, '气流摩擦', 'air hisses through'));
    if (s.contact) f.push(T(lang, s.voiced ? '声带振动' : '声带不振动', s.voiced ? 'voice on' : 'voice off'));
    return f;
  }

  window.MOUTH_SVG = function (k, lang = 'zh') {
    const s = M[k];
    if (!s) return '';
    const open = s.contact ? (s.contact === 'velar' || s.contact === 'uvular' ? 0.3 : 0.15) : s.open;
    const lips = s.lips || 'neutral';
    const ang = open * 12;                       // jaw rotation in degrees
    const lipX = lips === 'round' ? 27 : lips === 'spread' ? 38 : 33;
    // tongue: tip and the highest point
    let tip = [60, 109], top = s.tongue || [100, 112];
    if (s.contact === 'alveolar') { tip = [59, s.fric ? 92 : 89]; top = [92, 104]; }
    if (s.contact === 'postalveolar') { tip = [66, s.fric ? 92 : 90]; top = [95, 102]; }
    if (s.contact === 'palatal') { tip = [62, 108]; top = [86, 84]; }
    if (s.contact === 'velar') { tip = [62, 110]; top = [122, 83]; }
    if (s.contact === 'uvular') { tip = [62, 110]; top = [136, 92]; }
    const [tx, ty] = top;
    // tongue: tip → highest point → root down the throat, closed along the floor of the mouth
    const tongue = `M${tip[0]} ${tip[1]} C${tip[0] + 6} ${tip[1] - 3} ${tx - 18} ${ty + 1} ${tx} ${ty} C${tx + 14} ${ty - 1} ${148} ${Math.max(ty + 6, 100)} 151 ${Math.max(ty + 34, 140)} L152 178 L134 172 Q98 152 66 128 Q57 120 ${tip[0]} ${tip[1]} Z`;
    const lowerLipY = s.contact === 'lips' ? -9 : 0;
    const lowerLipX = s.contact === 'labiodental' ? 15 : 0;
    // upper lip, depending on the lip shape
    const upperLip = `M46 81 Q${lipX + 4} 82 ${lipX} 90 Q${lipX + 2} 96 52 96`;
    const lowerLip = `M52 108 Q${lipX + 2 + lowerLipX} ${107 + lowerLipY} ${lipX + lowerLipX} ${113 + lowerLipY} Q${lipX + 4 + lowerLipX / 2} 122 46 126`;
    const velum = s.nasal ? 'M118 80 Q132 90 134 110' : 'M118 80 Q140 80 157 90';
    const air = s.nasal
      ? `<path class="air nose" d="M150 170 L150 120 Q146 96 142 84 Q120 70 60 70 L18 72" />`
      : s.contact === 'lips' ? '' : `<path class="air" d="M150 170 L150 130 Q140 ${ty + 6} ${tx} ${ty + 8} Q76 ${Math.min(ty + 10, 104)} 40 ${98 + open * 8} L14 ${98 + open * 8}" />`;
    const voice = s.voiced || !s.contact ? `<path class="voice" d="M162 182 l4 -4 l4 4 l4 -4 l4 4" />` : '';
    const contactDot = s.contact ? {
      lips: [32, 96], labiodental: [50, 99], alveolar: [60, 88], postalveolar: [67, 87], palatal: [86, 82], velar: [122, 81], uvular: [138, 92],
    }[s.contact] : null;
    // lips seen from the front
    const fv = lips === 'round' ? { rx: 9, ry: Math.max(4, 3 + open * 8) } : lips === 'spread' ? { rx: 21, ry: 2 + open * 8 } : { rx: 15, ry: 3 + open * 12 };
    const closed = s.contact === 'lips';
    const svg = `<svg viewBox="0 0 220 200" class="mouth-svg" role="img" aria-label="[${k}]">
      <path class="cavity" d="M40 72 Q100 60 150 66 L158 70 L158 196" />
      <path class="face" d="M78 6 C60 18 54 36 54 52 L28 70 Q22 75 30 79 L46 81" />
      <path class="lip" d="${upperLip}" />
      <path class="tooth" d="M50 91 L57 91 L56 100 L51 100 Z" />
      <path class="palate" d="M57 92 Q60 84 66 85 Q92 78 118 80" />
      <path class="velum ${s.nasal ? 'down' : ''}" d="${velum}" />
      <path class="wall" d="M158 70 L158 196" />
      <g transform="rotate(${ang} 150 80)">
        <path class="tooth" d="M50 104 L57 104 L56 112 L51 112 Z" />
        <path class="lip" d="${lowerLip}" />
        <path class="face" d="M46 126 Q42 150 62 160 Q100 172 132 160" />
        <g transform="rotate(${-ang / 2} 150 80)"><path class="tongue" d="${tongue}" /></g>
      </g>
      ${air}${voice}
      ${!s.contact ? `<circle class="peak" cx="${tx}" cy="${ty}" r="3.5" transform="rotate(${ang / 2} 150 80)" />` : ''}
      ${contactDot ? `<circle class="contact" cx="${contactDot[0]}" cy="${contactDot[1]}" r="4" />` : ''}
      <g transform="translate(190 34)">
        <ellipse class="lipfront" rx="${fv.rx + 6}" ry="${(closed ? 3 : fv.ry) + 6}" />
        <ellipse class="mouthfront" rx="${fv.rx}" ry="${closed ? 0.6 : fv.ry}" />
      </g>
      <text class="ipa" x="196" y="78" text-anchor="middle">[${k}]</text>
    </svg>`;
    return `<figure class="mouth">${svg}<figcaption>${features(k, s, lang).map(x => `<span>${x}</span>`).join('')}</figcaption></figure>`;
  };
})();
