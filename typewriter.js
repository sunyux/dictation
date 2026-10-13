// Typewriter sounds (synthesised with Web Audio, no files) and the printed slip.
(function () {
  let ctx = null;
  const ac = () => (ctx = ctx || new (window.AudioContext || window.webkitAudioContext)());
  function noise(dur, freq, q, gain, when = 0) {
    const a = ac(), t = a.currentTime + when;
    const buf = a.createBuffer(1, Math.max(1, a.sampleRate * dur), a.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / d.length, 3);
    const src = a.createBufferSource(); src.buffer = buf;
    const f = a.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = freq; f.Q.value = q;
    const g = a.createGain(); g.gain.value = gain;
    src.connect(f).connect(g).connect(a.destination); src.start(t);
  }
  function thump(freq, dur, gain, when = 0) {
    const a = ac(), t = a.currentTime + when, o = a.createOscillator(), g = a.createGain();
    o.type = 'triangle'; o.frequency.setValueAtTime(freq, t); o.frequency.exponentialRampToValueAtTime(freq * .5, t + dur);
    g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(.0001, t + dur);
    o.connect(g).connect(a.destination); o.start(t); o.stop(t + dur + .02);
  }
  const vol = () => (window.NH_VOLUME != null ? window.NH_VOLUME : .7);
  const TW = {
    key() { const v = vol(); noise(.035, 2600 + Math.random() * 900, 1.2, .55 * v); thump(140 + Math.random() * 30, .05, .35 * v); },
    space() { const v = vol(); noise(.05, 900, .9, .5 * v); thump(90, .08, .45 * v); },
    back() { const v = vol(); noise(.03, 1800, 1, .35 * v); },
    // carriage return: a ratchet slide, then the bell
    ret() {
      const v = vol();
      for (let k = 0; k < 9; k++) noise(.02, 1500 + k * 60, 2, .25 * v, k * .028);
      thump(110, .12, .5 * v, .26);
      const a = ac(), t = a.currentTime + .3;
      [2093, 4186].forEach((f, i) => { const o = a.createOscillator(), g = a.createGain(); o.type = 'sine'; o.frequency.value = f; g.gain.setValueAtTime(i ? .08 * v : .22 * v, t); g.gain.exponentialRampToValueAtTime(.0001, t + 1.1); o.connect(g).connect(a.destination); o.start(t); o.stop(t + 1.2); });
    },
    printLine() { const v = vol(); for (let k = 0; k < 4; k++) noise(.018, 3200, 3, .18 * v, k * .022); },
  };
  window.TYPEWRITER = TW;
})();
