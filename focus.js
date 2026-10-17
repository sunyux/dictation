// Focus mode (for keeping attention on one thing at a time). On practice pages it:
// hides everything but the exercise · runs 10-minute sprints with a break reminder · counts right answers in a row
// · reading ruler + highlight under the pointer · background noise · a small goal per round · bigger text
// · a soft chime for right answers. The "I'm stuck" button lives in the word drill (app.js).
(function () {
  const SPRINT = 10 * 60, BREAK = 2 * 60;      // seconds
  const get = (k, d) => { try { const v = localStorage.getItem('nh:' + k); return v === null ? d : v; } catch (e) { return d; } };
  const put = (k, v) => { try { localStorage.setItem('nh:' + k, v); } catch (e) { } };
  const fine = matchMedia('(pointer: fine)').matches;
  let ruler = get('fruler', '1') !== '0', big = get('fbig', '0') === '1', chime = get('fchime', '1') !== '0';
  const NOISES = ['off', 'brown', 'rain', 'waves'];
  let noise = 'off', goal = 0, got = 0;
  let on = false, active = false, left = SPRINT, tick = 0, streak = 0, pill, band, lastY = 300;
  const zh = () => (window.NH_LANG ? window.NH_LANG() : 'zh') !== 'en';
  const T = (a, b) => (zh() ? a : b);
  const mmss = s => String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0');
  const vol = () => (typeof window.NH_VOLUME === 'number' ? window.NH_VOLUME : 0.7);

  /* ---------- audio: background noise and the chime ---------- */
  let ac, noiseNode, noiseGain, lfo;
  const ctx = () => { if (!ac) ac = new (window.AudioContext || window.webkitAudioContext)(); if (ac.state === 'suspended') ac.resume(); return ac; };
  function noiseBuffer(kind) {
    const a = ctx(), len = a.sampleRate * 4, buf = a.createBuffer(1, len, a.sampleRate), d = buf.getChannelData(0);
    let last = 0, b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1;
      if (kind === 'brown' || kind === 'waves') { last = (last + 0.02 * w) / 1.02; d[i] = last * 3.5; }
      else {           // pink noise (Paul Kellet), used for rain
        b0 = 0.99886 * b0 + w * 0.0555179; b1 = 0.99332 * b1 + w * 0.0750759; b2 = 0.969 * b2 + w * 0.153852;
        b3 = 0.8665 * b3 + w * 0.3104856; b4 = 0.55 * b4 + w * 0.5329522; b5 = -0.7616 * b5 - w * 0.016898;
        d[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11; b6 = w * 0.115926;
      }
    }
    return buf;
  }
  function stopNoise() {
    try { noiseNode && noiseNode.stop(); lfo && lfo.stop(); } catch (e) { }
    noiseNode = lfo = null;
  }
  function playNoise() {
    stopNoise();
    if (noise === 'off' || !(on && active)) return;
    const a = ctx();
    noiseNode = a.createBufferSource(); noiseNode.buffer = noiseBuffer(noise); noiseNode.loop = true;
    noiseGain = a.createGain(); noiseGain.gain.value = 0.22 * vol();
    let out = noiseNode;
    if (noise === 'rain') { const hp = a.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 700; out.connect(hp); out = hp; }
    if (noise === 'waves') {           // slow swell, like waves on a beach
      lfo = a.createOscillator(); lfo.frequency.value = 0.09;
      const depth = a.createGain(); depth.gain.value = 0.16 * vol();
      lfo.connect(depth); depth.connect(noiseGain.gain); lfo.start();
    }
    out.connect(noiseGain); noiseGain.connect(a.destination); noiseNode.start();
  }
  function ding() {
    if (!chime) return;
    const a = ctx(), t = a.currentTime;
    [[1318.5, 0], [1760, 0.09]].forEach(([f, d]) => {
      const o = a.createOscillator(), g = a.createGain();
      o.type = 'sine'; o.frequency.value = f;
      g.gain.setValueAtTime(0, t + d); g.gain.linearRampToValueAtTime(0.09 * vol(), t + d + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t + d + 0.35);
      o.connect(g); g.connect(a.destination); o.start(t + d); o.stop(t + d + 0.4);
    });
  }

  /* ---------- the pill ---------- */
  function build() {
    pill = document.createElement('div');
    pill.className = 'focus-pill'; pill.hidden = true;
    pill.innerHTML = `<div class="fp-row"><span class="fp-dot"></span><span class="fp-time"></span>
        <span class="fp-goal"></span><span class="fp-streak" hidden></span>
        <button class="fp-pause" type="button"></button><button class="fp-exit" type="button"></button></div>
      <div class="fp-row fp-tools">
        <button class="fp-goalbtn" type="button"></button><button class="fp-noise" type="button"></button>
        <button class="fp-big" type="button">A+</button><button class="fp-chime" type="button"></button><button class="fp-ruler" type="button"></button></div>`;
    document.body.appendChild(pill);
    const q = s => pill.querySelector(s);
    q('.fp-exit').onclick = () => window.FOCUS.set(false, true);
    q('.fp-pause').onclick = () => { tick ? stop() : start(); label(); };
    q('.fp-ruler').onclick = () => { ruler = !ruler; put('fruler', ruler ? '1' : '0'); applyRuler(); label(); };
    q('.fp-big').onclick = () => { big = !big; put('fbig', big ? '1' : '0'); applyBig(); label(); };
    q('.fp-chime').onclick = () => { chime = !chime; put('fchime', chime ? '1' : '0'); if (chime) ding(); label(); };
    q('.fp-noise').onclick = () => { noise = NOISES[(NOISES.indexOf(noise) + 1) % NOISES.length]; put('fnoise', noise); playNoise(); label(); };
    q('.fp-goalbtn').onclick = () => { goal = { 0: 5, 5: 10, 10: 20, 20: 0 }[goal]; got = 0; label(); };
    noise = get('fnoise', 'off'); if (!NOISES.includes(noise)) noise = 'off';
    // reading ruler: a bright band follows the pointer, the rest of the page dims
    band = document.createElement('div'); band.className = 'focus-ruler'; band.hidden = true;
    band.innerHTML = '<i class="fr-top"></i><i class="fr-bot"></i>';
    document.body.appendChild(band);
    document.addEventListener('pointermove', e => {
      if (e.pointerType !== 'mouse') return;
      lastY = e.clientY; if (!band.hidden) band.style.setProperty('--y', lastY + 'px');
    }, { passive: true });
    // watch answers being marked right / wrong anywhere in the page
    new MutationObserver(ms => {
      if (!(on && active)) return;
      for (const m of ms) for (const n of m.addedNodes) {
        if (n.nodeType !== 1) continue;
        const fb = n.matches('.feedback') ? n : n.querySelector && n.querySelector('.feedback');
        if (!fb) continue;
        if (fb.classList.contains('ok')) { streak++; got++; ding(); flash(); if (goal && got === goal) goalDone(); }
        else if (fb.classList.contains('bad')) streak = 0;
        showStreak(); label();
      }
    }).observe(document.getElementById('main') || document.body, { childList: true, subtree: true });
  }
  function label() {
    if (!pill) return;
    const q = s => pill.querySelector(s);
    q('.fp-time').textContent = mmss(left);
    q('.fp-pause').textContent = tick ? T('暂停', 'Pause') : T('继续', 'Resume');
    q('.fp-exit').textContent = T('退出', 'Exit');
    q('.fp-goal').textContent = goal ? `${Math.min(got, goal)} / ${goal}` : '';
    q('.fp-goal').hidden = !goal;
    q('.fp-goalbtn').textContent = goal ? T(`目标 ${goal} 题`, `Goal: ${goal}`) : T('定个小目标', 'Set a goal');
    q('.fp-noise').textContent = { off: T('白噪音：关', 'Noise: off'), brown: T('棕噪音', 'Brown noise'), rain: T('雨声', 'Rain'), waves: T('海浪', 'Waves') }[noise];
    q('.fp-noise').setAttribute('aria-pressed', noise !== 'off');
    q('.fp-big').setAttribute('aria-pressed', big); q('.fp-big').title = T('放大字号', 'Bigger text');
    q('.fp-chime').textContent = T('叮', 'Ding'); q('.fp-chime').setAttribute('aria-pressed', chime); q('.fp-chime').title = T('答对时叮一声', 'Chime on right answers');
    const r = q('.fp-ruler'); r.hidden = !fine; r.textContent = T('阅读尺', 'Ruler'); r.setAttribute('aria-pressed', ruler);
    pill.style.setProperty('--fp', (1 - left / SPRINT) * 100 + '%');
  }
  function showStreak() {
    const s = pill.querySelector('.fp-streak');
    s.hidden = streak < 2;
    s.textContent = T(`连对 ${streak}`, `${streak} in a row`);
    if (streak >= 2) { s.classList.remove('pop'); void s.offsetWidth; s.classList.add('pop'); }
  }
  function flash() {
    const m = document.querySelector('main'); if (!m) return;
    m.classList.remove('fp-flash'); void m.offsetWidth; m.classList.add('fp-flash');
  }
  function goalDone() {
    const box = document.createElement('div');
    box.className = 'focus-goal-done';
    box.innerHTML = `<div><b>${T('目标完成！', 'Goal reached!')}</b><span>${T(`答对了 ${goal} 题`, `${goal} right answers`)}</span>
      <button class="btn small" type="button">${T('再来一组', 'One more round')}</button></div>`;
    document.body.appendChild(box);
    box.querySelector('button').onclick = () => { got = 0; label(); box.remove(); };
    setTimeout(() => box.remove(), 6000);
  }

  /* ---------- sprint timer ---------- */
  function start() { if (!tick) tick = setInterval(step, 1000); }
  function stop() { clearInterval(tick); tick = 0; }
  function step() {
    if (document.hidden) return;
    left--; label();
    if (left <= 0) { stop(); breakTime(); }
  }
  function breakTime() {
    let b = BREAK;
    const ov = document.createElement('div');
    ov.className = 'focus-break';
    ov.innerHTML = `<div class="fb-box"><h2>${T('休息一下', 'Take a break')}</h2>
      <p>${T('已经专注 10 分钟了。站起来、喝口水、看看远处。', 'Ten focused minutes done. Stand up, drink some water, look into the distance.')}</p>
      <p class="fb-count">${mmss(b)}</p>
      <div class="toolbar"><button class="btn" id="fb-go">${T('再来 10 分钟', 'Another 10 minutes')}</button>
      <button class="btn ghost" id="fb-stop">${T('今天就到这', 'That\'s enough today')}</button></div></div>`;
    document.body.appendChild(ov);
    const t = setInterval(() => { b = Math.max(0, b - 1); const c = ov.querySelector('.fb-count'); if (c) c.textContent = b ? mmss(b) : T('休息好了', 'Ready'); if (!b) clearInterval(t); }, 1000);
    ov.querySelector('#fb-go').onclick = () => { clearInterval(t); ov.remove(); left = SPRINT; label(); start(); };
    ov.querySelector('#fb-stop').onclick = () => { clearInterval(t); ov.remove(); location.hash = '#/'; };
  }

  function applyRuler() { if (band) { band.hidden = !(on && active && ruler && fine); band.style.setProperty('--y', lastY + 'px'); } }
  function applyBig() { document.documentElement.classList.toggle('focus-big', on && active && big); }
  function apply() {
    const want = on && active;
    document.documentElement.classList.toggle('focusing', want);
    if (!pill) build();
    pill.hidden = !want;
    if (want) { start(); label(); } else stop();
    applyRuler(); applyBig();
    if (want && noise !== 'off' && !noiseNode) playNoise();
    if (!want) stopNoise();
  }

  window.FOCUS = {
    set(v, fromPill) {
      on = !!v;
      if (fromPill && window.NH_SET_FOCUS) window.NH_SET_FOCUS(false);
      apply();
    },
    // called on every page change: is this a practice page?
    page(isDrill) {
      if (isDrill && !active) { left = SPRINT; streak = 0; got = 0; }
      active = !!isDrill;
      if (pill) showStreak();
      apply();
    },
    on: () => on && active,
  };
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && document.documentElement.classList.contains('focusing') && !document.querySelector('.deep-ov, .focus-break')) window.FOCUS.set(false, true);
  });
})();
