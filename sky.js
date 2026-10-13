// Line-drawn constellations and celestial bodies for the star cards (engraving style).
(function () {
  const star = (x, y, r = 1.6) => `<circle cx="${x}" cy="${y}" r="${r}" fill="currentColor" stroke="none"/><path d="M${x - r * 2.4} ${y}H${x + r * 2.4}M${x} ${y - r * 2.4}V${y + r * 2.4}" stroke-width=".4"/>`;
  const line = pts => `<path d="M${pts.map(p => p.join(' ')).join('L')}" stroke-dasharray="1.6 1.4"/>`;
  const conste = (pts, links) => links.map(l => line(l.map(i => pts[i]))).join('') + pts.map(([x, y], i) => star(x, y, i % 3 ? 1.2 : 1.7)).join('');
  const ART = [
    // Ursa Major — the Big Dipper
    () => conste([[12, 24], [28, 22], [42, 28], [54, 32], [60, 46], [80, 48], [84, 32]], [[0, 1, 2, 3, 4, 5, 6, 3]]),
    // Saturn
    () => `<circle cx="50" cy="36" r="15"/><path d="M36 32Q50 28 64 32M35.5 38Q50 34 64.5 38" stroke-width=".5"/><ellipse cx="50" cy="36" rx="34" ry="8" transform="rotate(-18 50 36)"/><ellipse cx="50" cy="36" rx="28" ry="5.6" transform="rotate(-18 50 36)" stroke-width=".5"/>${star(12, 12, 1)}${star(88, 60, 1.2)}`,
    // Cassiopeia
    () => conste([[12, 26], [30, 46], [48, 28], [64, 46], [84, 22]], [[0, 1, 2, 3, 4]]),
    // a comet
    () => `<circle cx="74" cy="20" r="4"/><circle cx="74" cy="20" r="1.4" fill="currentColor"/>${[0, 1, 2, 3, 4, 5].map(k => `<path d="M${72 - k * .6} ${23 + k * .4}Q${46 - k * 2} ${40 + k * 2} ${14 + k * 3} ${62 - k}" stroke-width="${.7 - k * .08}"/>`).join('')}${star(30, 16, 1)}${star(86, 52, 1.1)}`,
    // Orion
    () => conste([[30, 10], [70, 14], [42, 36], [50, 38], [58, 40], [30, 64], [74, 62], [50, 6]], [[7, 0, 2, 3, 4, 1, 7], [2, 5], [4, 6]]),
    // crescent moon
    () => `<path d="M60 10A26 26 0 1 0 60 62A20 20 0 1 1 60 10Z"/>${[0, 1, 2, 3, 4, 5, 6].map(k => `<path d="M${30 + k * 3} ${18 + k * 2}L${30 + k * 3} ${54 - k * 2}" stroke-width=".35"/>`).join('')}${star(80, 20, 1.2)}${star(76, 52, .9)}`,
    // Lyra
    () => conste([[50, 10], [44, 28], [58, 30], [40, 52], [56, 54]], [[0, 1, 2, 0], [1, 3, 4, 2]]),
    // Jupiter and its four moons
    () => `<circle cx="46" cy="36" r="16"/><path d="M31 30H61M30.5 36H61.5M31.5 42H60.5" stroke-width=".5"/><ellipse cx="52" cy="40" rx="3.5" ry="2" stroke-width=".5"/>${[[12, 36], [20, 37], [74, 35], [86, 36]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="1.4" fill="currentColor" stroke="none"/>`).join('')}`,
    // Cygnus, the Northern Cross
    () => conste([[50, 6], [50, 26], [50, 46], [50, 64], [22, 30], [78, 24]], [[0, 1, 2, 3], [4, 1, 5]]),
    // the sun, engraved
    () => `<circle cx="50" cy="36" r="13"/><circle cx="50" cy="36" r="9" stroke-width=".4"/>${Array.from({ length: 16 }, (_, k) => { const a = k * Math.PI / 8, r1 = 16, r2 = k % 2 ? 22 : 27; return `<path d="M${50 + r1 * Math.cos(a)} ${36 + r1 * Math.sin(a)}L${50 + r2 * Math.cos(a)} ${36 + r2 * Math.sin(a)}" stroke-width="${k % 2 ? .4 : .7}"/>`; }).join('')}`,
    // the Pleiades
    () => conste([[40, 24], [48, 20], [55, 26], [62, 22], [52, 34], [44, 38], [60, 38]], []),
    // Leo
    () => conste([[16, 44], [30, 40], [44, 46], [62, 44], [70, 30], [64, 18], [74, 12], [82, 22]], [[0, 1, 2, 3, 4, 5, 6, 7, 4]]),
    // an armillary-like orbit drawing
    () => `<circle cx="50" cy="36" r="4" fill="currentColor"/><ellipse cx="50" cy="36" rx="16" ry="10"/><ellipse cx="50" cy="36" rx="30" ry="18" stroke-dasharray="1.6 1.4"/><ellipse cx="50" cy="36" rx="42" ry="26" stroke-width=".5"/><circle cx="66" cy="36" r="1.8" fill="currentColor"/><circle cx="26" cy="46" r="2.4"/><circle cx="83" cy="22" r="1.4" fill="currentColor"/>`,
    // Scorpius
    () => conste([[14, 14], [22, 20], [30, 18], [34, 30], [40, 42], [50, 50], [62, 54], [74, 52], [80, 44], [76, 38]], [[0, 1, 2], [1, 3, 4, 5, 6, 7, 8, 9]]),
  ];
  window.SKY_ART = (i) => `<svg class="sky-art" viewBox="0 0 100 72" fill="none" stroke="currentColor" stroke-width=".7" stroke-linecap="round" aria-hidden="true">${ART[((i % ART.length) + ART.length) % ART.length]()}</svg>`;
})();
