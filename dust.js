// Floating dust in a slow, warm light: a few soft WebGL points drifting over the page.
// Quiet on purpose — sparse, tiny, slow; paused when the tab is hidden; off with "reduce motion".
(function () {
  const N = 46;
  let cv, gl, prog, buf, raf = 0, on = false, t0 = 0, seeds;

  const VS = `attribute vec4 a; uniform float t; uniform vec2 res; varying float al;
    void main() {
      // a = (x, y, size, phase); drift up and sideways, wrap around
      float y = fract(a.y + t * (0.004 + a.w * 0.006));
      float x = fract(a.x + 0.03 * sin(t * 0.15 + a.w * 6.2831) + t * 0.002);
      gl_Position = vec4(x * 2.0 - 1.0, y * 2.0 - 1.0, 0.0, 1.0);
      gl_PointSize = a.z * (res.y > 900.0 ? 1.4 : 1.0);
      al = (0.35 + 0.65 * (0.5 + 0.5 * sin(t * 0.6 + a.w * 40.0))) * smoothstep(0.0, 0.15, y) * smoothstep(1.0, 0.85, y);
    }`;
  const FS = `precision mediump float; varying float al;
    void main() {
      float d = length(gl_PointCoord - 0.5);
      float m = smoothstep(0.5, 0.0, d);
      gl_FragColor = vec4(0.86, 0.68, 0.36, m * al * 0.55);
    }`;

  function sh(type, src) { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); return s; }
  function setup() {
    cv = document.createElement('canvas');
    cv.className = 'dust'; cv.setAttribute('aria-hidden', 'true');
    document.body.appendChild(cv);
    gl = cv.getContext('webgl', { premultipliedAlpha: false, antialias: false });
    if (!gl) { cv.remove(); cv = null; return false; }
    prog = gl.createProgram();
    gl.attachShader(prog, sh(gl.VERTEX_SHADER, VS)); gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FS));
    gl.linkProgram(prog); gl.useProgram(prog);
    seeds = new Float32Array(N * 4);
    for (let i = 0; i < N; i++) seeds.set([Math.random(), Math.random(), 2 + Math.random() * 5, Math.random()], i * 4);
    buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buf); gl.bufferData(gl.ARRAY_BUFFER, seeds, gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, 'a'); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 4, gl.FLOAT, false, 0, 0);
    gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    addEventListener('resize', size); size();
    document.addEventListener('visibilitychange', () => { if (document.hidden) stop(); else if (on) start(); });
    return true;
  }
  function size() {
    if (!cv) return;
    const r = Math.min(devicePixelRatio || 1, 2);
    cv.width = innerWidth * r; cv.height = innerHeight * r;
    gl.viewport(0, 0, cv.width, cv.height);
    gl.uniform2f(gl.getUniformLocation(prog, 'res'), cv.width, cv.height);
  }
  function frame(now) {
    gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
    gl.uniform1f(gl.getUniformLocation(prog, 't'), (now - t0) / 1000 + 100);
    gl.drawArrays(gl.POINTS, 0, N);
    raf = requestAnimationFrame(frame);
  }
  function start() { if (!raf && cv) { t0 = t0 || performance.now(); raf = requestAnimationFrame(frame); } }
  function stop() { cancelAnimationFrame(raf); raf = 0; }

  window.DUST = {
    set(v) {
      on = !!v && !matchMedia('(prefers-reduced-motion: reduce)').matches;
      if (on && !cv && !setup()) return;
      if (cv) cv.hidden = !on;
      on ? start() : stop();
    },
  };
})();
