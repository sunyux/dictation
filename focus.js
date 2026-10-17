// Focus mode (for keeping attention on one thing at a time):
// on practice pages it hides everything except the exercise, runs a short sprint timer,
// suggests a break when the sprint ends, and shows a quiet "right in a row" counter.
(function () {
  const SPRINT = 10 * 60, BREAK = 2 * 60;      // seconds
  let on = false, active = false, left = SPRINT, tick = 0, streak = 0, pill, ov, obs;
  const zh = () => (window.NH_LANG ? window.NH_LANG() : 'zh') !== 'en';
  const T = (a, b) => (zh() ? a : b);
  const mmss = s => String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0');

  function build() {
    pill = document.createElement('div');
    pill.className = 'focus-pill'; pill.hidden = true;
    pill.innerHTML = `<span class="fp-dot"></span><span class="fp-time"></span><span class="fp-streak" hidden></span>
      <button class="fp-pause" type="button"></button><button class="fp-exit" type="button"></button>`;
    document.body.appendChild(pill);
    pill.querySelector('.fp-exit').onclick = () => { window.FOCUS.set(false, true); };
    pill.querySelector('.fp-pause').onclick = () => { tick ? stop() : start(); label(); };
    // watch answers being marked right / wrong anywhere in the page
    obs = new MutationObserver(ms => {
      if (!active) return;
      for (const m of ms) for (const n of m.addedNodes) {
        if (n.nodeType !== 1) continue;
        const fb = n.matches('.feedback') ? n : n.querySelector && n.querySelector('.feedback');
        if (!fb) continue;
        if (fb.classList.contains('ok')) streak++; else if (fb.classList.contains('bad')) streak = 0;
        showStreak();
      }
    });
    obs.observe(document.getElementById('main') || document.body, { childList: true, subtree: true });
  }
  function label() {
    if (!pill) return;
    pill.querySelector('.fp-time').textContent = mmss(left);
    pill.querySelector('.fp-pause').textContent = tick ? T('暂停', 'Pause') : T('继续', 'Resume');
    pill.querySelector('.fp-exit').textContent = T('退出专注', 'Exit focus');
    pill.style.setProperty('--fp', (1 - left / SPRINT) * 100 + '%');
  }
  function showStreak() {
    const s = pill.querySelector('.fp-streak');
    s.hidden = streak < 2;
    s.textContent = T(`连对 ${streak}`, `${streak} in a row`);
    if (streak >= 2) { s.classList.remove('pop'); void s.offsetWidth; s.classList.add('pop'); }
  }
  function start() { if (!tick) tick = setInterval(step, 1000); }
  function stop() { clearInterval(tick); tick = 0; }
  function step() {
    if (document.hidden) return;
    left--; label();
    if (left <= 0) { stop(); breakTime(); }
  }
  function breakTime() {
    let b = BREAK;
    ov = document.createElement('div');
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
  function apply() {
    const want = on && active;
    document.documentElement.classList.toggle('focusing', want);
    if (!pill) build();
    pill.hidden = !want;
    if (want) { start(); label(); } else { stop(); }
  }

  window.FOCUS = {
    // the setting itself
    set(v, fromPill) {
      on = !!v;
      if (fromPill && window.NH_SET_FOCUS) window.NH_SET_FOCUS(false);
      apply();
    },
    // called on every page change: is this a practice page?
    page(isDrill) {
      if (isDrill && !active) { left = SPRINT; streak = 0; }
      active = !!isDrill;
      if (pill) showStreak();
      apply();
    },
  };
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && document.documentElement.classList.contains('focusing') && !document.querySelector('.deep-ov, .focus-break')) window.FOCUS.set(false, true);
  });
})();
