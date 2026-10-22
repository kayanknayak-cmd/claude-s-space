<script>
'use strict';
const $ = s => document.querySelector(s);
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const hex = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16) / 255);
const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;
const ON_SITE = /(^|\.)areabake\.com$/.test(location.hostname);

/* ======================= levels ======================= */
const WORLDS = /*LEVELS*/[];

/* ======================= sound ======================= */
const Sound = {
  ctx: null, on: true, mute: false,
  wake() {
    if (!this.ctx) { try { this.ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { this.ctx = null; } }
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
  },
  tone(f, dur = 0.7, type = 'sine', gain = 0.08, when = 0) {
    if (!this.on || this.mute || !this.ctx) return;
    const t = this.ctx.currentTime + when, o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(f, t);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(gain, t + 0.012); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.ctx.destination); o.start(t); o.stop(t + dur + 0.05);
  },
  whoosh(p) {
    if (!this.on || this.mute || !this.ctx) return;
    const c = this.ctx, t = c.currentTime, n = Math.floor(c.sampleRate * 0.45), buf = c.createBuffer(1, n, c.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, 2);
    const src = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
    src.buffer = buf; f.type = 'bandpass'; f.Q.value = 1.4;
    f.frequency.setValueAtTime(300 + 900 * p, t); f.frequency.exponentialRampToValueAtTime(140, t + 0.45);
    g.gain.value = 0.05 + 0.08 * p; src.connect(f).connect(g).connect(c.destination); src.start(t);
  },
  chime(i) { const s = [523.25, 659.25, 783.99, 880, 1046.5, 1174.66, 1318.5]; const f = s[i % s.length]; this.tone(f, 1.2, 'sine', 0.07); this.tone(f * 2, 0.6, 'sine', 0.025); },
  trick() { this.tone(1567.98, 0.5, 'triangle', 0.03); this.tone(2093, 0.4, 'sine', 0.02, 0.06); },
  thud() { this.tone(70, 0.5, 'sine', 0.14); this.tone(140, 0.25, 'triangle', 0.04); },
  // the comet sings its speed: pitch rises exponentially, two octaves from rest to full speed,
  // so you hear it fall into a well and climb back out (v^2 / 2 + phi stays constant)
  hum(v) {
    if (!this.ctx) return;
    const on = this.on && !this.mute && v > 0, t = this.ctx.currentTime;
    if (!this.h) {
      if (!on) return;
      const c = this.ctx, o = c.createOscillator(), f = c.createBiquadFilter(), g = c.createGain();
      o.type = 'triangle'; f.type = 'lowpass'; f.frequency.value = 700; g.gain.value = 0;
      o.connect(f).connect(g).connect(c.destination); o.start(); this.h = { o, g };
    }
    if (on) this.h.o.frequency.setTargetAtTime(110 * Math.pow(2, 2 * clamp(v, 0, 1.2)), t, 0.06);
    this.h.g.gain.setTargetAtTime(on ? 0.006 + 0.012 * clamp(v, 0, 1) : 0, t, on ? 0.08 : 0.15);
  },
  fanfare() { [523.25, 659.25, 783.99, 1046.5, 1318.5].forEach((f, i) => { this.tone(f, 1.5, 'sine', 0.06, i * 0.1); this.tone(f / 2, 1.5, 'triangle', 0.02, i * 0.1); }); },
};
let CLIP = false;
const buzz = ms => { if (CLIP) return; try { navigator.vibrate && navigator.vibrate(ms); } catch (e) {} };

/* ======================= physics ======================= */
// Newtonian gravity with a little softening, integrated by leapfrog (kick,
// drift, kick) so orbits keep their energy. Black holes pull with the
// Paczynski-Wiita force m / (r - rs)^2, a one-line stand-in for general
// relativity that reproduces its precessing, zoom-whirl orbits. Every level runs in fixed steps
// from its start, and moons advance by an exact rotation each step, so a
// throw replays bit for bit on any device.
const EPS2 = 0.0004, DT = 1 / 600, PULL = 0.75, SPEED = 1.3, TR = 0.075, STALE = 4.5, FF = 14;
function bodyPos(b, t) {
  if (!b.orbit) return [b.x, b.y];
  const o = b.orbit, a = o.phase + t / o.period * Math.PI * 2;
  return [o.cx + o.R * Math.cos(a), o.cy + o.R * Math.sin(a)];
}
function startPos(L) { return L.bodies.map(b => b.orbit ? [b.orbit.cx + b.orbit.ox, b.orbit.cy + b.orbit.oy] : [b.x, b.y]); }
function advance(L, P, Q) {
  for (let i = 0; i < L.bodies.length; i++) {
    const b = L.bodies[i];
    if (!b.orbit) { Q[i][0] = P[i][0]; Q[i][1] = P[i][1]; continue; }
    const o = b.orbit, dx = P[i][0] - o.cx, dy = P[i][1] - o.cy;
    Q[i][0] = o.cx + dx * o.c - dy * o.s; Q[i][1] = o.cy + dx * o.s + dy * o.c;
  }
}
function accel(B, P, x, y, out) {
  let ax = 0, ay = 0, hit = -1;
  for (let i = 0; i < B.length; i++) {
    const b = B[i], dx = P[i][0] - x, dy = P[i][1] - y, r2 = dx * dx + dy * dy;
    if (r2 < b.r * b.r) hit = i;
    let inv;
    if (b.rs) { const r = Math.sqrt(r2), q = Math.max(r - b.rs, 1e-3); inv = b.m / (r * q * q); }
    else { const e = r2 + EPS2; inv = b.m / (e * Math.sqrt(e)); }
    ax += dx * inv; ay += dy * inv;
  }
  out[0] = ax; out[1] = ay; out[2] = hit; return out;
}
const isMoon = b => b.orbit && !b.star;
function energy(B, P, x, y, vx, vy) {
  let pot = 0;
  // sqrt, not hypot: only sqrt is guaranteed to round the same on every device, and this decides a comet's fate
  for (let k = 0; k < B.length; k++) { const dx = P[k][0] - x, dy = P[k][1] - y, r = Math.sqrt(dx * dx + dy * dy); pot -= B[k].m / (B[k].rs ? Math.max(r - B[k].rs, 1e-3) : r); }
  return 0.5 * (vx * vx + vy * vy) + pot;
}

/* ======================= star color from temperature ======================= */
// Heavier stars burn hotter. Temperature maps to color with a fit to the
// blackbody spectrum (Tanner Helland's), from orange dwarfs to blue giants.
function blackbody(T) {
  T /= 100; let r, g, b;
  r = T <= 66 ? 255 : 329.698727446 * Math.pow(T - 60, -0.1332047592);
  g = T <= 66 ? 99.4708025861 * Math.log(T) - 161.1195681661 : 288.1221695283 * Math.pow(T - 60, -0.0755148492);
  b = T >= 66 ? 255 : T <= 19 ? 0 : 138.5177312231 * Math.log(T - 10) - 305.0447927307;
  return [r, g, b].map(v => clamp(v, 0, 255) / 255);
}
const starTemp = m => 2700 + 10800 * Math.pow(clamp((m - 0.05) / 0.35, 0, 1), 0.85);

/* ======================= state ======================= */
const ALL = WORLDS.flatMap((w, wi) => w.levels.map((L, li) => ({ ...L, wi, li, gid: `${w.id}-${li}`, cols: L.bodies.map(b => b.bh ? [1, 0.86, 0.68] : isMoon(b) ? [0.55, 0.7, 0.98] : blackbody(starTemp(b.m))) })));
const store = (() => { try { return JSON.parse(localStorage.getItem('areabake.slingshot.v2') || '{}') || {}; } catch (e) { return {}; } })();
store.best = store.best || {};
const save = () => { if (CLIP) return; try { localStorage.setItem('areabake.slingshot.v2', JSON.stringify(store)); } catch (e) {} };
if (store.sound === false) Sound.on = false;
const S = {
  idx: 0, tick: 0, acc: 0, speed: 1, ffK: 1, ff: false, comets: [], ghosts: [], dust: [], sparks: [], waves: [], labels: [],
  got: [], order: [], shots: 0, score: 0, tricks: [], won: false, wonAt: 0, gold: null, aim: null, flash: 0, hitStop: 0, throws: [], replay: null,
  coached: !!store.coached, time: 0, P: [], Q: [], title: null,
};
const level = () => ALL[S.idx];
const world = () => WORLDS[level().wi];
const isDaily = i => !!WORLDS[ALL[i].wi].daily;
// every world opens on its first level; inside a world, each level opens the next
function unlocked(i) { return ALL[i].li === 0 || isDaily(i) || store.best[ALL[i - 1].gid] || store.best[ALL[i].gid] || (store.skipped || []).includes(ALL[i - 1].gid); }
// one shared sky a day: everyone gets the same level on the same date, wherever they are
const DAILY = WORLDS.find(w => w.daily), DAILY0 = ALL.findIndex(L => WORLDS[L.wi].daily);
const dayNo = () => { const d = new Date(); return Math.floor((Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) - Date.UTC(2026, 9, 22)) / 864e5); };
function todayIdx() {
  if (!DAILY) return -1;
  const n = dayNo(), k = DAILY.levels.length;
  return DAILY0 + ((n % k) + k) % k;
}
function streak() {
  const d = store.days || {}; let n = dayNo(), k = 0;
  if (!d[n]) n--;
  while (d[n]) { k++; n--; }
  return k;
}
// a short fingerprint of a layout, so an old link never replays onto a level that has since changed
function fp(L) {
  const str = JSON.stringify([L.launch, L.bodies.map(b => [b.x, b.y, b.m, b.orbit && b.orbit.R, b.orbit && b.orbit.period]), L.targets]);
  let h = 2166136261; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0).toString(36).slice(0, 4);
}

/* ======================= GPU background ======================= */
const cvs = $('#gl'), fx = $('#fx'), g2 = fx.getContext('2d');
const gl = cvs.getContext('webgl2', { antialias: false, alpha: false, depth: false, stencil: false, powerPreference: 'high-performance' });
let DPR = 1, W = 1, H = 1, cssW = 1, cssH = 1, G = { s: 100, cx: 0, cy: 0 };
const FS = `#version 300 es
precision highp float; precision highp int;
uniform vec2 u_center; uniform float u_scale, u_time, u_flash; uniform int u_n; uniform vec4 u_b[10]; uniform float u_kind[10]; uniform vec3 u_sc[10];
uniform vec3 u_acc, u_neb; uniform vec4 u_gw; uniform vec2 u_gw2;
out vec4 o;
float h21(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float vn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0 - 2.0*f);
  return mix(mix(h21(i), h21(i + vec2(1,0)), f.x), mix(h21(i + vec2(0,1)), h21(i + vec2(1,1)), f.x), f.y); }
float fbm(vec2 p){ float s = 0.0, a = 0.5; for (int i = 0; i < 4; i++) { s += a * vn(p); p = p * 2.03 + vec2(1.7, 9.2); a *= 0.5; } return s; }
// blackbody color for a temperature in kelvin (Tanner Helland's fit, the same one the stars use)
vec3 bb(float T){ T /= 100.0; vec3 c;
  c.r = T <= 66.0 ? 1.0 : clamp(1.29293618606 * pow(T - 60.0, -0.1332047592), 0.0, 1.0);
  c.g = T <= 66.0 ? clamp(0.39008157876 * log(T) - 0.63184144378, 0.0, 1.0) : clamp(1.12989086089 * pow(T - 60.0, -0.0755148492), 0.0, 1.0);
  c.b = T >= 66.0 ? 1.0 : T <= 19.0 ? 0.0 : clamp(0.54320678911 * log(T - 10.0) - 1.19625408914, 0.0, 1.0);
  return c; }
void main(){
  vec2 p = (gl_FragCoord.xy - u_center) / u_scale;
  // gravitational lensing by black holes: the thin-lens map beta = theta - thetaE^2 (theta - x) / |theta - x|^2
  // sends each pixel to the patch of sky behind it, so background stars smear into Einstein arcs.
  // Lensing keeps surface brightness, so stretched stars stay as bright; squeezed ones (inside the ring) dim by 1/|det J|.
  vec2 defl = vec2(0.0); float shadow = 1.0, ring = 0.0, squeeze = 1.0;
  for (int i = 0; i < 10; i++) {
    if (i >= u_n) break;
    if (u_kind[i] < 1.5) continue;
    vec4 b = u_b[i]; vec2 d = p - b.xy; float r2 = max(dot(d, d), 1e-6), r = sqrt(r2), tE = 0.3 * sqrt(b.z / 0.28);
    defl += tE * tE * d / r2;
    float k4 = tE * tE * tE * tE / (r2 * r2); squeeze *= clamp(1.0 / max(abs(1.0 - k4), 1e-3), 0.0, 1.0);
    shadow *= smoothstep(b.w * 0.96, b.w * 1.03, r);
    // the photon ring hugs the shadow's edge, with a soft glow of light that nearly escaped
    ring += exp(-abs(r - b.w * 1.035) / (b.w * 0.025)) * 0.9 + exp(-max(r - b.w, 0.0) / (b.w * 0.45)) * 0.12 * step(b.w, r);
  }
  vec2 ps = p - defl, fq = ps * u_scale + u_center;
  vec3 col = vec3(0.010, 0.011, 0.026);
  for (int l = 0; l < 2; l++) {
    float sc = l == 0 ? 3.0 : 5.0;
    vec2 q = fq / sc + vec2(0.0, u_time * (l == 0 ? 1.2 : 2.6));
    float s = h21(floor(q) + float(l) * 17.0);
    if (s > 0.994) col += vec3(0.6, 0.65, 0.85) * (s - 0.994) * (l == 0 ? 55.0 : 90.0) * (0.6 + 0.4 * sin(u_time * 1.3 + s * 900.0)) * squeeze;
  }
  float nb = fbm(ps * 1.1 + vec2(0.0, u_time * 0.006)), nb2 = fbm(ps * 2.2 - vec2(u_time * 0.008, 3.1));
  col += mix(u_acc, u_neb, nb2) * pow(smoothstep(0.34, 0.95, nb), 2.0) * 0.16;
  // gravitational waves from a waltzing pair: the quadrupole pattern h ~ cos 2(Omega t - phi - Omega r / c) / r,
  // a two-armed spiral turning with the stars at twice their frequency. The pattern is the real one; its
  // strength is exaggerated many millions of times so you can see it.
  if (u_gw2.x > 0.0) {
    vec2 d = p - u_gw.xy; float r = length(d), w = cos(2.0 * (u_gw.z - atan(d.y, d.x)) - u_gw.w * r);
    col += mix(u_acc, u_neb, 0.5) * w * u_gw2.x * smoothstep(u_gw2.y * 0.6, u_gw2.y * 1.6, r) / (r + 0.35);
  }
  float phi = 0.0; vec3 light = vec3(0.0);
  for (int i = 0; i < 10; i++) {
    if (i >= u_n) break;
    vec4 b = u_b[i]; vec2 d = p - b.xy; float r = length(d);
    if (u_kind[i] > 1.5) {
      float rs = b.w / 2.6, rin = 3.0 * rs, rout = 7.0 * rs;
      phi += b.z / max(r - rs, 0.004);
      // a thin accretion disk seen face on, from the innermost stable orbit (3 rs) outward.
      // Temperature follows the thin-disk law T ~ r^-3/4 (1 - sqrt(rin / r))^1/4, which peaks at r = 49/36 rin;
      // light climbing out of the well is redshifted by g = sqrt(1 - 3 rs / 2r); gas turns at the
      // Keplerian rate (slowed down here), and that shear winds the glow into spirals by itself.
      if (r > rin && r < rout) {
        float x = rin / r, T = pow(x, 0.75) * pow(1.0 - sqrt(x), 0.25) / 0.488;
        float gz = sqrt(max(1.0 - 1.5 * rs / r, 0.0));
        float om = sqrt(b.z / (r * (r - rs) * (r - rs)));
        float th = atan(d.y, d.x) - om * u_time * 0.12;
        // slow around the ring, fast across it: the noise is stretched into streaks along the orbit
        float turb = 0.2 + 1.6 * fbm(vec2(cos(th), sin(th)) * 3.0 + vec2(r * 46.0, r * 19.0) + float(i) * 3.1);
        light += bb(1500.0 + 3400.0 * T * gz) * pow(T, 1.5) * gz * gz * turb * smoothstep(rout, rout * 0.5, r) * 0.5;
      }
      continue;
    }
    phi += b.z / sqrt(r * r + 0.0004);
    float core = 1.0 - smoothstep(b.w * 0.9, b.w, r);
    if (u_kind[i] > 0.5) {
      float sh = sqrt(max(0.0, 1.0 - r * r / (b.w * b.w)));
      float lit = clamp(dot(normalize(vec3(-d / b.w, sh) + 1e-5), normalize(vec3(-b.xy, 0.6))), 0.0, 1.0);
      light += u_sc[i] * core * (0.12 + 0.9 * lit) + vec3(0.45, 0.7, 1.0) * exp(-max(r - b.w, 0.0) / (b.w * 0.35)) * 0.28 * (1.0 - core);
      continue;
    }
    vec3 sc = u_sc[i];
    // the disc: limb darkening (brighter at the center, I = 1 - u(1 - mu)) and slowly boiling granulation
    float mu = sqrt(max(0.0, 1.0 - r * r / (b.w * b.w)));
    float gran = 0.84 + 0.32 * fbm(d / b.w * 6.0 + vec2(u_time * 0.11, -u_time * 0.08) + float(i) * 7.3);
    vec3 disc = sc * (1.0 - 0.62 * (1.0 - mu)) * gran * 2.4 + vec3(1.0) * pow(mu, 6.0) * 0.6;
    float ang = atan(d.y, d.x);
    float rays = 0.78 + 0.22 * sin(ang * 9.0 + u_time * 0.45 + float(i) * 1.7) * sin(ang * 5.0 - u_time * 0.3 + float(i));
    float halo = exp(-max(r - b.w, 0.0) / (b.w * 0.8)) * 0.7 * rays + 0.006 * b.z / (r * r + 0.004);
    light += disc * core + sc * halo * (1.0 - core);
  }
  float v = log(phi + 0.02) * 4.5, fw = max(fwidth(v), 1e-4);
  float line = (1.0 - smoothstep(0.35, 1.35, abs(fract(v + 0.5) - 0.5) / fw)) * clamp(0.16 / fw, 0.0, 1.0);
  float dp = smoothstep(0.35, 5.5, phi);
  vec3 lc = dp < 0.5 ? mix(vec3(0.52, 0.38, 1.0), vec3(0.22, 0.86, 0.82), dp * 2.0) : mix(vec3(0.22, 0.86, 0.82), vec3(1.0, 0.8, 0.45), dp * 2.0 - 1.0);
  col += lc * line * (0.07 + 0.22 * smoothstep(0.0, 2.4, log(phi + 1.0)));
  col += u_acc * 0.028 * smoothstep(0.2, 3.0, phi) + light + vec3(0.55, 0.85, 1.0) * u_flash * 0.08;
  col = col * shadow + vec3(1.0, 0.86, 0.68) * ring;
  col = 1.0 - exp(-col * 1.15);
  o = vec4(col, 1.0);
}`;
let prog = null, U = {};
if (gl) {
  const sh = (t, src) => { const s = gl.createShader(t); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s)); return s; };
  prog = gl.createProgram();
  gl.attachShader(prog, sh(gl.VERTEX_SHADER, `#version 300 es
  void main(){ vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2)); gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0); }`));
  gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FS)); gl.linkProgram(prog);
  for (const n of ['u_center', 'u_scale', 'u_time', 'u_flash', 'u_n', 'u_b', 'u_kind', 'u_sc', 'u_acc', 'u_neb', 'u_gw', 'u_gw2']) U[n] = gl.getUniformLocation(prog, n);
  gl.bindVertexArray(gl.createVertexArray());
}
function geom() {
  // the 2 x 3.4 portrait arena, between the top bar and the bottom controls
  const top = CLIP ? 70 : 96, bottom = CLIP ? 60 : 70, s = Math.min((cssW - 12) / 2.1, (cssH - top - bottom) / 3.45);
  G = { s, cx: cssW / 2, cy: top + (cssH - top - bottom) / 2 };
}
function resize() {
  if (CLIP) return;
  DPR = Math.min(window.devicePixelRatio || 1, 2); cssW = innerWidth; cssH = innerHeight;
  W = Math.round(cssW * DPR); H = Math.round(cssH * DPR);
  cvs.width = fx.width = W; cvs.height = fx.height = H;
  geom();
}
const toScr = (x, y) => [G.cx + x * G.s, G.cy - y * G.s];
function renderGL() {
  if (!gl) return;
  const L = level(), B = L.bodies, n = Math.min(10, B.length), arr = new Float32Array(40), kind = new Float32Array(10), col = new Float32Array(30), th = world().theme;
  for (let i = 0; i < n; i++) { arr.set([S.P[i][0], S.P[i][1], B[i].m, B[i].r], i * 4); kind[i] = B[i].bh ? 2 : isMoon(B[i]) ? 1 : 0; col.set(L.cols[i], i * 3); }
  gl.viewport(0, 0, W, H); gl.useProgram(prog);
  gl.uniform2f(U.u_center, G.cx * DPR, H - G.cy * DPR); gl.uniform1f(U.u_scale, G.s * DPR);
  gl.uniform1f(U.u_time, S.time % 1000); gl.uniform1f(U.u_flash, S.flash);
  gl.uniform1i(U.u_n, n); gl.uniform4fv(U.u_b, arr); gl.uniform1fv(U.u_kind, kind); gl.uniform3fv(U.u_sc, col);
  gl.uniform3fv(U.u_acc, hex(th.acc)); gl.uniform3fv(U.u_neb, hex(th.neb));
  // a pair of stars sharing one orbit center radiates; its waves leave at a slow, visible "speed of light"
  const pair = B.map((b, i) => i).filter(i => B[i].star && B[i].orbit);
  if (pair.length >= 2) {
    const o = B[pair[0]].orbit, ang = Math.atan2(S.P[pair[0]][1] - o.cy, S.P[pair[0]][0] - o.cx), om = 2 * Math.PI / o.period;
    gl.uniform4f(U.u_gw, o.cx, o.cy, ang, 2 * om / 0.3); gl.uniform2f(U.u_gw2, 0.045, o.R + B[pair[1]].orbit.R);
  } else gl.uniform2f(U.u_gw2, 0, 0);
  gl.drawArrays(gl.TRIANGLES, 0, 3);
}

/* ======================= level flow ======================= */
const TH = ['#ff7aa8', '#ffd166', '#6ef0c8', '#8fb0ff', '#c79bff'];
function load(i, replay) {
  S.idx = clamp(i, 0, ALL.length - 1);
  const L = level();
  Object.assign(S, { tick: 0, acc: 0, ffK: 1, ff: false, comets: [], ghosts: [], dust: [], sparks: [], waves: [], labels: [],
    got: L.targets.map(() => false), order: [], shots: 0, score: 0, tricks: [], won: false, gold: null, aim: null, throws: [], replay: replay || null, flash: 0, hitStop: 0,
    P: startPos(L), Q: startPos(L) });
  if (!CLIP) {
    document.documentElement.style.setProperty('--accent', world().theme.acc);
    $('#lvname').textContent = `${L.li + 1}. ${L.name}`;
    $('#winbar').hidden = true; $('#toast').hidden = true; $('#hintBtn').hidden = true; $('#speedBtn').hidden = false;
    $('#replayTag').hidden = !replay; $('#replayTag').textContent = replay && replay.hint ? 'Hint' : 'Replay';
    if (!world().daily) store.last = S.idx;
    save(); hudPips();
  }
  titleCard();
}
function hudPips() {
  if (CLIP) return;
  const L = level(), p = $('#pips'); p.replaceChildren();
  L.targets.forEach((_, i) => { const d = document.createElement('span'); d.className = 'pip' + (S.got[i] ? ' on' : ''); d.style.setProperty('--pc', TH[i % TH.length]); p.append(d); });
  const s = document.createElement('span'); s.className = 'shots'; s.textContent = `${S.shots} · par ${L.par}`; p.append(s);
  $('#skipBtn').hidden = S.won || !!S.replay || S.shots < L.par + 4;
  $('#hintBtn').hidden = S.won || !!S.replay || S.shots < L.par + 2 || !L.sol;
}

/* ---- the title: the level name written in starlight, then released into the level's gravity ---- */
function titleCard() {
  const L = level(), c = document.createElement('canvas'), w = Math.round(cssW), h = 160;
  c.width = w; c.height = h;
  const x = c.getContext('2d');
  let fs = 64; x.font = `300 italic ${fs}px "Cormorant Garamond", Garamond, serif`;
  fs = Math.min(70, fs * (w * 0.84) / Math.max(1, x.measureText(L.name).width));
  x.font = `300 italic ${fs}px "Cormorant Garamond", Garamond, serif`; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillStyle = '#fff';
  x.fillText(L.name, w / 2, h / 2);
  const d = x.getImageData(0, 0, w, h).data, pts = [];
  for (let yy = 0; yy < h; yy += 2) for (let xx = 0; xx < w; xx += 2) if (d[(yy * w + xx) * 4 + 3] > 120) pts.push([xx, yy]);
  for (let k = pts.length - 1; k > 0; k--) { const j = Math.floor(Math.random() * (k + 1)); [pts[k], pts[j]] = [pts[j], pts[k]]; }
  const cy = cssH * 0.4, th = world().theme, tint = hex(th.acc);
  const parts = pts.slice(0, 720).map(([px, py]) => {
    const sx = px, sy = cy + py - h / 2, ax = (sx - G.cx) / G.s, ay = -(sy - G.cy) / G.s, sc = Math.random();
    return { x: ax, y: ay, hx: ax, hy: ay, vx: 0, vy: 0, ox: (Math.random() - 0.5) * 0.5, oy: (Math.random() - 0.5) * 0.5, tw: Math.random() * 6.28, sc, alive: true };
  });
  S.title = { parts, t0: S.time, released: false, eyebrow: `${S.replay ? (S.replay.hint ? 'Hint' : 'Replay') : world().daily ? 'Today' : world().name} · ${L.li + 1}`, par: `par ${L.par}`, tint };
  if (!CLIP) document.body.classList.add('titling');
  // the italic face may still be loading on the very first level
  if (!CLIP && document.fonts && document.fonts.status !== 'loaded') document.fonts.ready.then(() => { if (S.title && !S.title.released && S.time - S.title.t0 < 0.6) titleCard(); });
}
function releaseTitle() {
  const T = S.title; if (!T || T.released) return;
  T.released = true; T.rt = S.time;
  for (const p of T.parts) { p.vx = (Math.random() - 0.5) * 0.06; p.vy = (Math.random() - 0.5) * 0.06; }
  if (!CLIP) document.body.classList.remove('titling');
}
function stepTitle(dt) {
  const T = S.title; if (!T) return;
  const age = S.time - T.t0;
  if (!T.released && age > (REDUCED ? 0.9 : 1.6)) releaseTitle();
  if (!T.released) return;
  // each grain of the name is a test particle: it falls into the real wells of this level
  const L = level(), a = [0, 0, -1], h = dt * 0.55;
  for (const p of T.parts) {
    if (!p.alive) continue;
    for (let k = 0; k < 2; k++) {
      accel(L.bodies, S.P, p.x, p.y, a); p.vx += a[0] * h * 0.5; p.vy += a[1] * h * 0.5;
      p.x += p.vx * h; p.y += p.vy * h;
      accel(L.bodies, S.P, p.x, p.y, a); p.vx += a[0] * h * 0.5; p.vy += a[1] * h * 0.5;
      if (a[2] >= 0) { p.alive = false; if (Math.random() < 0.15) S.sparks.push({ x: p.x, y: p.y, vx: (Math.random() - 0.5) * 0.3, vy: (Math.random() - 0.5) * 0.3, life: 0.5, age: 0, col: '#fff2d6' }); break; }
    }
  }
  if (S.time - T.rt > 4.5) S.title = null;
}

/* ---- throwing ---- */
function fire(vx, vy) {
  Sound.wake();
  // quantized so a replay link reproduces the throw exactly
  vx = Math.round(vx * 1e5) / 1e5; vy = Math.round(vy * 1e5) / 1e5;
  releaseTitle();
  for (const c of S.comets) if (c.alive) { c.alive = false; retire(c); }
  const L = level(), [x, y] = L.launch;
  S.comets.push({ x, y, vx, vy, age: 0, alive: true, a: [0, 0, -1], trail: [[x, y]], k: 0,
    cells: new Set(), fresh: 0, novel: 0, ffBase: 0, winds: L.bodies.map(() => 0), angs: L.bodies.map(() => null), close: false, moon: false, hits: 0,
    moving: L.bodies.some(b => b.orbit), E0: energy(L.bodies, S.P, x, y, vx, vy) });
  if (!S.replay) S.throws.push([S.tick, vx, vy]);
  S.shots++; S.ff = false; S.ffK = 1;
  S.waves.push({ x, y, age: 0, r0: 0.02, col: '239,232,218' });
  Sound.whoosh(Math.min(1, Math.hypot(vx, vy) / (PULL * SPEED))); buzz(8);
  if (!S.coached && !CLIP) { S.coached = store.coached = true; save(); }
  hudPips();
}
function retire(c) {
  if (c.fate === 'crash') { Sound.thud(); burst(c.x, c.y, '#ffb47a', 30); S.waves.push({ x: c.x, y: c.y, age: 0, r0: 0.04, col: '255,180,122' }); buzz(20); }
  if (c.trail !== S.gold) { S.ghosts.push(c.trail); if (S.ghosts.length > 3) S.ghosts.shift(); }
}
function burst(x, y, col, n) {
  for (let i = 0; i < n; i++) { const a = Math.random() * Math.PI * 2, v = 0.2 + Math.random() * 0.7; S.sparks.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 0.6 + Math.random() * 0.6, age: 0, col }); }
}
function award(c, name, pts) {
  // each trick pays once per level, and labels earned together queue up and stack instead of overprinting
  const kind = name.split(' ×')[0];
  if (S.tricks.some(q => q[0].split(' ×')[0] === kind)) return;
  S.tricks.push([name, pts]); S.score += pts;
  const k = S.labels.filter(l => l.age < 0.4).length;
  S.labels.push({ x: c.x, y: c.y, text: `${name} +${pts}`, age: -0.4 * k, slot: k, chimed: false });
}
function stars() { const L = level(); return S.shots <= L.par ? 3 : S.shots <= L.par + 2 ? 2 : 1; }
function win(c) {
  S.won = true; S.wonAt = S.time; S.gold = c.trail; Sound.fanfare(); buzz([12, 40, 12]);
  const L = level(), parBonus = Math.max(0, L.par - S.shots + 1) * 300;
  S.score += parBonus; if (parBonus) S.tricks.push([S.shots < L.par ? 'Under par' : 'On par', parBonus]);
  L.targets.forEach(([x, y], i) => { burst(x, y, TH[i % TH.length], 40); S.waves.push({ x, y, age: 0, r0: TR, col: hex(TH[i % TH.length]).map(v => v * 255 | 0).join(',') }); });
  if (!S.replay && !CLIP) {
    const prev = store.best[L.gid], rec = { shots: S.shots, score: S.score, stars: stars() };
    if (!prev || rec.score > prev.score) store.best[L.gid] = rec;
    store.throws = store.throws || {}; store.throws[L.gid] = S.throws;
    if (S.idx === todayIdx()) { store.days = store.days || {}; store.days[dayNo()] = Math.max(store.days[dayNo()] || 0, rec.stars); }
    save();
  }
  $('#hintBtn').hidden = true; $('#skipBtn').hidden = true;
}

/* ======================= simulation ======================= */
function track(c, B) {
  // anywhere new lately? A visit also marks neighbors so a slowly drifting orbit counts as old ground
  if (Math.abs(c.x) < 1.1 && Math.abs(c.y) < 1.8) {
    const i = Math.floor(c.x / 0.07), j = Math.floor(c.y / 0.07), key = i * 4096 + j;
    if (!c.cells.has(key)) {
      for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) c.cells.add((i + a) * 4096 + j + b);
      c.novel++; if (!S.ff || c.novel - c.ffBase >= 4) c.fresh = c.age;
    }
  }
  // tricks: winding around the nearest star, close shaves, energy stolen from something moving
  // winding number about every star: the total turning angle seen from it, over 2 pi
  let far = true;
  for (let k = 0; k < B.length; k++) {
    const b = B[k], p = S.P[k], d = Math.sqrt((p[0] - c.x) * (p[0] - c.x) + (p[1] - c.y) * (p[1] - c.y));
    if (!isMoon(b)) {
      const ang = Math.atan2(c.y - p[1], c.x - p[0]);
      if (c.angs[k] != null) { let da = ang - c.angs[k]; if (da > Math.PI) da -= 2 * Math.PI; if (da < -Math.PI) da += 2 * Math.PI; c.winds[k] += da; }
      c.angs[k] = ang;
      if (d < b.r * 1.45) c.close = true;
    }
    if (b.orbit && d < b.r * 4) far = false;
  }
  // E = v^2/2 + phi(x, t) only changes when the wells move (dE/dt = d phi/dt), so any gain is a true gravity assist.
  // Measured away from the moving bodies, where their own pull is not mid-swing.
  if (c.moving && far && energy(B, S.P, c.x, c.y, c.vx, c.vy) - c.E0 > 0.1) c.moon = true;
  // leaving with enough energy to never come back
  if (Math.abs(c.x) > 1.35 || Math.abs(c.y) > 2.0) {
    if (energy(B, S.P, c.x, c.y, c.vx, c.vy) > 0 && c.x * c.vx + c.y * c.vy > 0) { c.alive = false; c.fate = 'lost'; }
  }
  if (c.age - c.fresh > STALE + 26 || c.age > 240) { c.alive = false; c.fate = 'loop'; }
}
function onHit(c, i) {
  c.hits++; S.order.push(i);
  const L = level(), [tx, ty] = L.targets[i];
  burst(tx, ty, TH[i % TH.length], 36); S.waves.push({ x: tx, y: ty, age: 0, r0: TR, col: hex(TH[i % TH.length]).map(v => v * 255 | 0).join(',') });
  S.hitStop = 0.45; S.flash = 1; S.score += 500; c.fresh = c.age;
  Sound.chime(S.order.length - 1); buzz(14);
  const B = L.bodies, TAU = Math.PI * 2;
  let wk = 0; c.winds.forEach((w, k) => { if (Math.abs(w) > Math.abs(c.winds[wk])) wk = k; });
  const loops = Math.floor(Math.abs(c.winds[wk]) / TAU), lp = B[wk].bh ? 'Zoom-whirl' : 'Orbit';
  // once around one star and once the other way around another: winding numbers +1 and -1
  if (c.winds.some(w => w >= TAU) && c.winds.some(w => w <= -TAU)) award(c, 'Figure eight', 500);
  if (loops >= 1 && !c.loopPaid) { c.loopPaid = true; award(c, loops > 1 ? `${lp} ×${loops}` : lp, 300 * Math.min(3, loops)); }
  if (c.close && !c.closePaid) { c.closePaid = true; award(c, 'Close shave', 200); }
  if (c.moon && !c.moonPaid) { c.moonPaid = true; award(c, 'Gravity assist', 300); }
  if (c.age > 12 && !c.longPaid) { c.longPaid = true; award(c, 'Long game', 300); }
  if (c.hits === 2) award(c, 'Double', 250);
  if (c.hits === 3) award(c, 'Triple', 400);
  if (c.hits >= 4) award(c, 'Sweep', 500);
  hudPips();
  if (S.got.every(Boolean)) win(c);
}
function simulate(dt) {
  S.ffK += ((S.ff ? FF : 1) - S.ffK) * (1 - Math.exp(-dt * (S.ff ? 2.2 : 7)));
  S.flash *= Math.exp(-dt * 3);
  const stop = S.hitStop > 0 ? 0.2 : 1; S.hitStop -= dt;
  S.acc += dt * S.speed * S.ffK * stop * (S.won ? 0.3 : 1);
  const L = level(), B = L.bodies, T = L.targets;
  let n = 0;
  while (S.acc >= DT && n < 9000) {
    S.acc -= DT; n++;
    // a replayed throw launches on exactly the step the original did
    if (S.replay) { const r = S.replay.throws.find(q => q[0] === S.tick && !q.done); if (r) { r.done = true; fire(r[1], r[2]); } }
    advance(L, S.P, S.Q);
    for (const c of S.comets) {
      if (!c.alive) continue;
      const a = c.a;
      accel(B, S.P, c.x, c.y, a); c.vx += a[0] * DT * 0.5; c.vy += a[1] * DT * 0.5;
      c.x += c.vx * DT; c.y += c.vy * DT; c.age += DT;
      accel(B, S.Q, c.x, c.y, a); c.vx += a[0] * DT * 0.5; c.vy += a[1] * DT * 0.5;
      if (a[2] >= 0) { c.alive = false; c.fate = 'crash'; }
      if (++c.k % 3 === 0 && !S.won) for (let i = 0; i < T.length; i++) if (!S.got[i]) { const dx = T[i][0] - c.x, dy = T[i][1] - c.y; if (dx * dx + dy * dy < TR * TR) { S.got[i] = true; onHit(c, i); } }
      if (c.k % 6 === 0) { c.trail.push([c.x, c.y]); if (c.trail.length > 3200) c.trail.shift(); track(c, B); }
      if (!c.alive) retire(c);
    }
    [S.P, S.Q] = [S.Q, S.P];
    S.tick++;
  }
  S.comets = S.comets.filter(c => c.alive);
  tails(dt, B);
  for (const p of S.sparks) { p.age += dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 0.96; p.vy *= 0.96; }
  for (const w of S.waves) w.age += dt;
  for (const l of S.labels) { l.age += dt; if (l.age >= 0 && !l.chimed) { l.chimed = true; Sound.trick(); } }
  S.dust = S.dust.filter(p => p.age < p.life); S.sparks = S.sparks.filter(p => p.age < p.life);
  S.waves = S.waves.filter(w => w.age < 1); S.labels = S.labels.filter(l => l.age < 1.8);
  stepTitle(dt);
  const live = !S.won && S.comets[0];
  const was = S.ff; S.ff = !!live && live.age - live.fresh > STALE;
  if (S.ff && !was) live.ffBase = live.novel;
  if (!CLIP) { const show = S.ffK > 1.6; if ($('#ff').hidden === show) $('#ff').hidden = !show; }
}

/* ---- comet tails, formed the way real ones are ---- */
// Starlight pushes on what boils off the comet. Gas is shoved straight away from each star (the blue ion
// tail); dust feels gravity weakened by radiation pressure, (1 - beta) m / r^2, keeps the comet's own
// velocity, and so lags into a curved gold tail. Luminosity grows as m^3.5 while gravity grows as m,
// so beta scales as m^2.5: heavy hot stars blow hardest. Black holes and moons give no light.
// The comet sheds faster as the starlight on it grows (flux ~ L / r^2), so tails flare near stars.
const lum = b => b.bh || isMoon(b) ? 0 : Math.pow(b.m / 0.25, 2.5);
function tails(dt, B) {
  for (const c of S.comets) {
    let flux = 0;
    for (let k = 0; k < B.length; k++) { const dx = S.P[k][0] - c.x, dy = S.P[k][1] - c.y; flux += lum(B[k]) * B[k].m / (dx * dx + dy * dy + 0.01); }
    let n = Math.min(5, 0.5 + flux * 0.7) * dt * 60;
    for (; n > 0 && S.dust.length < 1400; n--) {
      if (n < 1 && Math.random() > n) break;
      const j = () => (Math.random() - 0.5) * 0.04;
      S.dust.push({ x: c.x, y: c.y, vx: c.vx * 0.96 + j(), vy: c.vy * 0.96 + j(), beta: 0.15 + Math.random() * 0.95, ion: false, age: 0, life: 1.1 + Math.random() * 1.3 });
      if (Math.random() < 0.8) S.dust.push({ x: c.x, y: c.y, vx: c.vx * 0.3 + j(), vy: c.vy * 0.3 + j(), beta: 0, ion: true, age: 0, life: 0.45 + Math.random() * 0.5 });
    }
  }
  for (const p of S.dust) {
    let ax = 0, ay = 0;
    for (let k = 0; k < B.length; k++) {
      const b = B[k], dx = S.P[k][0] - p.x, dy = S.P[k][1] - p.y, r2 = dx * dx + dy * dy + 0.004, f = b.m / (r2 * Math.sqrt(r2)), L = lum(b);
      const k1 = p.ion ? -5 * L : 1 - p.beta * L;
      ax += dx * f * k1; ay += dy * f * k1;
    }
    const am = Math.hypot(ax, ay); if (am > 30) { ax *= 30 / am; ay *= 30 / am; }
    p.vx += ax * dt; p.vy += ay * dt;
    if (p.ion) { p.vx *= 1 - 2.5 * dt; p.vy *= 1 - 2.5 * dt; }
    p.x += p.vx * dt; p.y += p.vy * dt; p.age += dt;
  }
}

/* ======================= drawing ======================= */
function spCol(v, a) {
  // slow comets glow violet, fast ones gold-white (speeds now top out near 1)
  const t = clamp((v - 0.15) / 0.95, 0, 1), A = [122, 108, 255], B = [79, 216, 232], C = [255, 241, 196];
  const m = t < 0.5 ? A.map((x, i) => x + (B[i] - x) * t * 2) : B.map((x, i) => x + (C[i] - x) * (t * 2 - 1));
  return `rgba(${m[0] | 0},${m[1] | 0},${m[2] | 0},${a})`;
}
const rgba = (h, a) => { const c = hex(h).map(v => Math.round(v * 255)); return `rgba(${c[0]},${c[1]},${c[2]},${a})`; };
function path(tr, a, b) { g2.beginPath(); for (let i = a; i < b; i++) { const [x, y] = toScr(tr[i][0], tr[i][1]); i === a ? g2.moveTo(x, y) : g2.lineTo(x, y); } }
function preview(vx, vy) {
  const L = level(), B = L.bodies, out = [], a = [0, 0, -1], h = 1 / 150, t0 = S.tick * DT;
  let x = L.launch[0], y = L.launch[1];
  const P = L.bodies.map(() => [0, 0]);
  for (let s = 0; s < 3.2; s += h) {
    B.forEach((b, i) => { const q = bodyPos(b, t0 + s); P[i][0] = q[0]; P[i][1] = q[1]; });
    accel(B, P, x, y, a); vx += a[0] * h * 0.5; vy += a[1] * h * 0.5; x += vx * h; y += vy * h;
    accel(B, P, x, y, a); vx += a[0] * h * 0.5; vy += a[1] * h * 0.5;
    if (a[2] >= 0) break; out.push([x, y]);
  }
  return out;
}
// a comet trail as a glowing ribbon: three passes (halo, glow, core), each wider where the comet was faster
function ribbon(tr, gold, fade) {
  const g = g2, n = tr.length; if (n < 2) return;
  const seg = Math.max(1, Math.floor(n / 36));
  for (const [wm, am] of [[5.5, 0.05], [2.4, 0.16], [1, 0.85]]) {
    for (let k = 0; k < n - 1; k += seg) {
      const e = Math.min(n - 1, k + seg), q0 = tr[k], q1 = tr[e], v = Math.hypot(q1[0] - q0[0], q1[1] - q0[1]) / (0.01 * Math.max(1, e - k));
      const age = k / n, a = Math.pow(age, 1.4) * am * fade;
      g.strokeStyle = gold ? `rgba(255,214,120,${a})` : spCol(v, a);
      g.lineWidth = wm * (0.7 + 2.6 * clamp(v, 0, 1)) * (0.35 + 0.65 * age);
      path(tr, k, e + 1); g.stroke();
    }
  }
}
function starShape(g, x, y, R, fill) {
  // a five-pointed star: vertices alternate between radius R and R * 0.42 every 36 degrees
  g.beginPath();
  for (let k = 0; k < 10; k++) { const r = k % 2 ? R * 0.42 : R, a = -Math.PI / 2 + k * Math.PI / 5; k ? g.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r) : g.moveTo(x + Math.cos(a) * r, y + Math.sin(a) * r); }
  g.closePath(); fill ? g.fill() : g.stroke();
}
function draw() {
  const g = g2, t = S.time, L = level(), acc = world().theme.acc;
  g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, W, H); g.setTransform(DPR, 0, 0, DPR, 0, 0);
  g.lineCap = 'round'; g.lineJoin = 'round';
  g.lineWidth = 1; g.strokeStyle = 'rgba(239,232,218,.14)';
  for (const tr of S.ghosts) { path(tr, 0, tr.length); g.stroke(); }
  // every moving body keeps to a circle; a faint trace of it lets you read the timing
  g.setLineDash([2, 7]); g.strokeStyle = 'rgba(239,232,218,.13)';
  for (const b of L.bodies) if (b.orbit) { const [ox, oy] = toScr(b.orbit.cx, b.orbit.cy); g.beginPath(); g.arc(ox, oy, b.orbit.R * G.s, 0, 7); g.stroke(); }
  g.setLineDash([]);
  // targets: glowing crystal orbs, each its own color
  L.targets.forEach(([x, y], i) => {
    const [sx, sy0] = toScr(x, y), r = TR * G.s, hue = TH[i % TH.length], sy = sy0 + (S.got[i] ? 0 : Math.sin(t * 1.4 + i) * 1.5);
    const glow = g.createRadialGradient(sx, sy, 0, sx, sy, r * 2.6);
    glow.addColorStop(0, rgba(hue, S.got[i] ? 0.14 : 0.28)); glow.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = glow; g.beginPath(); g.arc(sx, sy, r * 2.6, 0, 7); g.fill();
    if (S.got[i]) {
      g.fillStyle = rgba(hue, 0.4); g.beginPath(); g.arc(sx, sy, r * 0.42, 0, 7); g.fill();
      g.strokeStyle = rgba(hue, 0.5); g.lineWidth = 1; g.beginPath(); g.arc(sx, sy, r, 0, 7); g.stroke();
      return;
    }
    const core = g.createRadialGradient(sx - r * 0.25, sy - r * 0.25, 0, sx, sy, r * 0.75);
    core.addColorStop(0, 'rgba(255,255,255,.95)'); core.addColorStop(0.35, rgba(hue, 0.85)); core.addColorStop(1, rgba(hue, 0));
    g.fillStyle = core; g.beginPath(); g.arc(sx, sy, r * 0.75, 0, 7); g.fill();
    g.strokeStyle = hue; g.lineWidth = 1.4; g.setLineDash([5, 6]); g.lineDashOffset = -t * 14;
    g.beginPath(); g.arc(sx, sy, r * (1 + 0.06 * Math.sin(t * 3 + i)), 0, 7); g.stroke(); g.setLineDash([]);
    for (let k = 0; k < 3; k++) { const a = t * (1.4 + k * 0.3) + i * 2 + k * 2.1; g.fillStyle = 'rgba(255,255,255,.85)'; g.beginPath(); g.arc(sx + Math.cos(a) * r * 1.2, sy + Math.sin(a) * r * 1.2, 1.4, 0, 7); g.fill(); }
  });
  g.globalCompositeOperation = 'lighter';
  // the title, written in starlight
  const T = S.title;
  if (T) {
    const age = t - T.t0, rel = T.released ? t - T.rt : 0;
    const fade = T.released ? clamp(1 - rel / 4.2, 0, 1) : 1;
    for (const p of T.parts) {
      if (!p.alive) continue;
      let px = p.x, py = p.y;
      if (!T.released) { const e = 1 - Math.pow(1 - clamp(age / 0.7, 0, 1), 3); px = p.hx + p.ox * (1 - e); py = p.hy + p.oy * (1 - e); }
      const [sx, sy] = toScr(px, py), tw = 0.65 + 0.35 * Math.sin(t * 5 + p.tw);
      const a = (T.released ? fade : clamp(age / 0.4, 0, 1)) * tw;
      g.fillStyle = `rgba(${235 + 20 * p.sc | 0},${(225 + 30 * T.tint[1] * p.sc) | 0},${(215 + 40 * T.tint[2] * p.sc) | 0},${a})`;
      g.fillRect(sx - 0.9, sy - 0.9, 1.8, 1.8);
    }
    const ta = T.released ? clamp(1 - rel / 0.6, 0, 1) : clamp(age / 0.5, 0, 1);
    if (ta > 0) {
      g.globalCompositeOperation = 'source-over'; g.textAlign = 'center';
      g.font = '500 11px Jost, system-ui, sans-serif'; g.fillStyle = rgba(acc, 0.9 * ta);
      g.fillText(T.eyebrow.toUpperCase().split('').join(' '), cssW / 2, cssH * 0.4 - 52);
      g.font = '400 13px "IBM Plex Mono", ui-monospace, monospace'; g.fillStyle = `rgba(155,152,170,${ta})`;
      g.fillText(T.par, cssW / 2, cssH * 0.4 + 56);
      g.textAlign = 'start'; g.globalCompositeOperation = 'lighter';
    }
  }
  if (S.gold) ribbon(S.gold, true, 1);
  for (const c of S.comets) {
    if (c.trail !== S.gold) ribbon(c.trail, false, 1);
    const [sx, sy] = toScr(c.x, c.y), sp = Math.hypot(c.vx, c.vy), R = 16 + 10 * clamp(sp, 0, 1), grd = g.createRadialGradient(sx, sy, 0, sx, sy, R);
    grd.addColorStop(0, '#ffffff'); grd.addColorStop(0.18, spCol(sp, 0.65)); grd.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grd; g.beginPath(); g.arc(sx, sy, R, 0, 7); g.fill();
  }
  g.fillStyle = 'rgb(255,214,150)';
  for (const p of S.dust) if (!p.ion) { const [sx, sy] = toScr(p.x, p.y); g.globalAlpha = (1 - p.age / p.life) * 0.5; g.fillRect(sx - 0.9, sy - 0.9, 1.8, 1.8); }
  g.fillStyle = 'rgb(120,200,255)';
  for (const p of S.dust) if (p.ion) { const [sx, sy] = toScr(p.x, p.y); g.globalAlpha = (1 - p.age / p.life) * 0.55; g.fillRect(sx - 0.8, sy - 0.8, 1.6, 1.6); }
  for (const p of S.sparks) { const [sx, sy] = toScr(p.x, p.y); g.globalAlpha = 1 - p.age / p.life; g.fillStyle = p.col; g.beginPath(); g.arc(sx, sy, 1.8, 0, 7); g.fill(); }
  g.globalAlpha = 1;
  for (const w of S.waves) {
    const [sx, sy] = toScr(w.x, w.y), e = 1 - Math.pow(1 - w.age, 3);
    g.strokeStyle = `rgba(${w.col},${(1 - w.age) * 0.7})`; g.lineWidth = 1.8; g.beginPath(); g.arc(sx, sy, (w.r0 + e * 0.34) * G.s, 0, 7); g.stroke();
  }
  // a win, drawn in the sky: the targets join into a constellation, stars and score glow above
  if (S.won) {
    const k = t - S.wonAt, P = S.order.map(i => toScr(...L.targets[i]));
    const draw1 = clamp((k - 0.2) / 0.9, 0, 1) * (P.length - 1 + (P.length > 2 ? 1 : 0));
    g.strokeStyle = 'rgba(255,214,120,.55)'; g.lineWidth = 1.2;
    for (let s = 0; s < draw1; s++) {
      const a = P[s % P.length], b = P[(s + 1) % P.length], f = Math.min(1, draw1 - s);
      g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f); g.stroke();
    }
    const st = stars(), cy = (CLIP ? 70 : 96) + 34;
    for (let s = 0; s < 3; s++) {
      const pop = clamp((k - 0.5 - s * 0.18) / 0.35, 0, 1), sc = pop < 1 ? 1.4 - 0.4 * pop : 1, x = cssW / 2 + (s - 1) * 44;
      if (!pop) continue;
      g.globalAlpha = pop; g.fillStyle = s < st ? '#ffd36e' : 'rgba(239,232,218,.12)';
      starShape(g, x, cy, 15 * sc, true);
    }
    g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
    const sa = clamp((k - 1.0) / 0.5, 0, 1);
    if (sa) {
      g.textAlign = 'center'; g.font = '500 26px "IBM Plex Mono", ui-monospace, monospace'; g.fillStyle = `rgba(239,232,218,${sa})`;
      g.fillText(S.score.toLocaleString('en-US'), cssW / 2, cy + 50);
      g.font = '400 12px "IBM Plex Mono", ui-monospace, monospace'; g.fillStyle = `rgba(255,211,110,${0.8 * sa})`;
      g.fillText(S.tricks.slice(0, 4).map(q => q[0]).join('  ·  '), cssW / 2, cy + 74);
      g.textAlign = 'start';
    }
    g.globalCompositeOperation = 'lighter';
  }
  g.globalCompositeOperation = 'source-over';
  // off-screen comets get an arrow at the edge
  for (const c of S.comets) {
    const [sx, sy] = toScr(c.x, c.y), m = 30;
    if (sx > m && sx < cssW - m && sy > m + 60 && sy < cssH - m) continue;
    const dx = sx - G.cx, dy = sy - G.cy, k = Math.min((dx > 0 ? cssW - m - G.cx : G.cx - m) / Math.abs(dx || 1e-6), (dy > 0 ? cssH - m - G.cy : G.cy - m - 60) / Math.abs(dy || 1e-6));
    g.save(); g.translate(G.cx + dx * k, G.cy + dy * k); g.rotate(Math.atan2(dy, dx)); g.fillStyle = 'rgba(255,244,226,.9)';
    g.beginPath(); g.moveTo(11, 0); g.lineTo(-6, -7); g.lineTo(-2, 0); g.lineTo(-6, 7); g.closePath(); g.fill(); g.restore();
  }
  // launcher: a small planet with a ring and a moonlet
  const [lx, ly] = toScr(L.launch[0], L.launch[1]);
  const pg = g.createRadialGradient(lx - 2, ly - 2, 0, lx, ly, 7); pg.addColorStop(0, '#fff8ea'); pg.addColorStop(1, '#b9b2a2');
  g.fillStyle = pg; g.beginPath(); g.arc(lx, ly, 6.5, 0, 7); g.fill();
  g.strokeStyle = acc; g.lineWidth = 1.3; g.beginPath(); g.ellipse(lx, ly, 14, 5.5, -0.35, 0, 7); g.stroke();
  const ma = t * 1.3; g.fillStyle = 'rgba(239,232,218,.8)'; g.beginPath(); g.arc(lx + Math.cos(ma) * 20, ly + Math.sin(ma) * 8, 1.8, 0, 7); g.fill();
  if (!S.aim && !S.comets.length && !S.won && !S.replay && !CLIP) {
    g.strokeStyle = 'rgba(239,232,218,.3)'; g.lineWidth = 1; g.setLineDash([2, 5]);
    g.beginPath(); g.arc(lx, ly, 26 + 4 * Math.sin(t * 2.5), 0, 7); g.stroke(); g.setLineDash([]);
  }
  // first time only: a ghost finger showing the gesture
  if (!S.coached && !S.aim && !S.comets.length && !CLIP && (!S.title || S.title.released)) {
    const ph = (t % 2.6) / 2.6, pull = Math.sin(Math.min(1, ph / 0.7) * Math.PI / 2), fade = ph < 0.8 ? 1 : 1 - (ph - 0.8) / 0.2;
    const ox = cssW / 2, oy = cssH * 0.62, fy = oy + pull * cssH * 0.16;
    g.strokeStyle = `rgba(239,232,218,${0.35 * fade})`; g.setLineDash([3, 5]); g.beginPath(); g.moveTo(ox, oy); g.lineTo(ox, fy); g.stroke(); g.setLineDash([]);
    g.fillStyle = `rgba(239,232,218,${0.28 * fade})`; g.beginPath(); g.arc(ox, fy, 20, 0, 7); g.fill();
    g.strokeStyle = `rgba(239,232,218,${0.6 * fade})`; g.lineWidth = 1.5; g.beginPath(); g.arc(ox, fy, 20, 0, 7); g.stroke();
  }
  // aiming
  if (S.aim) {
    const A = S.aim, sp = Math.hypot(A.v[0], A.v[1]), pw = sp / (PULL * SPEED);
    // the spot the drag began is the cancel zone: slide back into it and let go to call the throw off
    g.strokeStyle = `rgba(239,232,218,${A.cancel && A.moved ? 0.75 : 0.22})`; g.lineWidth = 1.2;
    g.beginPath(); g.arc(A.sx, A.sy, CANCEL_R, 0, 7); g.stroke();
    if (A.cancel) {
      if (A.moved) { const q = 8; g.beginPath(); g.moveTo(A.sx - q, A.sy - q); g.lineTo(A.sx + q, A.sy + q); g.moveTo(A.sx + q, A.sy - q); g.lineTo(A.sx - q, A.sy + q); g.stroke(); }
    } else {
    g.fillStyle = acc;
    A.path.forEach((p, i) => { if (i % 4) return; const [sx, sy] = toScr(p[0], p[1]); g.globalAlpha = 1 - i / A.path.length; g.beginPath(); g.arc(sx, sy, 2, 0, 7); g.fill(); });
    g.globalAlpha = 1;
    const hot = Math.round(154 + 101 * pw);
    g.strokeStyle = `rgb(${hot},${Math.round(215 - 36 * pw)},${Math.round(255 - 148 * pw)})`; g.lineWidth = 3;
    g.beginPath(); g.arc(lx, ly, 22, -Math.PI / 2, -Math.PI / 2 + pw * Math.PI * 2); g.stroke();
    g.strokeStyle = 'rgba(239,232,218,.35)'; g.lineWidth = 1.2; g.beginPath(); g.moveTo(A.sx, A.sy); g.lineTo(A.cx, A.cy); g.stroke();
    g.fillStyle = 'rgba(239,232,218,.5)'; g.beginPath(); g.arc(A.cx, A.cy, 16, 0, 7); g.fill();
    }
  }
  // trick labels drift up slowly and fade
  g.font = '500 15px "IBM Plex Mono", ui-monospace, monospace'; g.textAlign = 'center';
  for (const l of S.labels) {
    if (l.age < 0) continue;
    const [sx, sy] = toScr(l.x, l.y), a = l.age < 0.2 ? l.age / 0.2 : 1 - Math.max(0, l.age - 1.1) / 0.7;
    g.fillStyle = `rgba(255,211,110,${a})`; g.fillText(l.text, sx, sy - 26 - l.slot * 22 - l.age * 22);
  }
  if (CLIP) { g.font = '500 13px Jost, system-ui, sans-serif'; g.fillStyle = 'rgba(239,232,218,.6)'; g.fillText('areabake.com/phone', cssW / 2, cssH - 26); }
  g.textAlign = 'start';
}

/* ======================= input ======================= */
let pointer = null;
const CANCEL_R = 34;
cvs.addEventListener('contextmenu', e => e.preventDefault());
cvs.addEventListener('pointerdown', e => {
  Sound.wake();
  if (S.won) { if (S.time - S.wonAt > 1.2 && !S.replay) next(); return; }
  // a second finger while aiming cancels the throw
  if (pointer !== null) { S.aim = null; pointer = null; buzz(6); return; }
  if (S.replay) return;
  releaseTitle();
  cvs.setPointerCapture(e.pointerId);
  pointer = e.pointerId;
  S.aim = { sx: e.clientX, sy: e.clientY, cx: e.clientX, cy: e.clientY, v: [0, 0], path: [], cancel: true, moved: false };
});
cvs.addEventListener('pointermove', e => {
  if (e.pointerId !== pointer || !S.aim) return;
  const A = S.aim; A.cx = e.clientX; A.cy = e.clientY;
  const was = A.cancel; A.cancel = Math.hypot(A.cx - A.sx, A.cy - A.sy) < CANCEL_R;
  if (!A.cancel) A.moved = true; else if (!was && A.moved) buzz(6);
  // a drag of about 40% of the arena height is full power; pulling back throws forward
  const k = 0.55 / G.s;
  let px = -(A.cx - A.sx) * k, py = (A.cy - A.sy) * k;
  const l = Math.hypot(px, py); if (l > PULL) { px *= PULL / l; py *= PULL / l; }
  A.v = [px * SPEED, py * SPEED]; A.path = preview(A.v[0], A.v[1]);
});
const release = e => {
  if (e.pointerId !== pointer) return;
  pointer = null; const A = S.aim; S.aim = null;
  if (A && e.type === 'pointerup' && !A.cancel && Math.hypot(A.v[0], A.v[1]) > 0.06) fire(A.v[0], A.v[1]);
};
cvs.addEventListener('pointerup', release); cvs.addEventListener('pointercancel', release);
document.addEventListener('gesturestart', e => e.preventDefault());
window.addEventListener('keydown', e => {
  if (e.key === 'r' || e.key === 'R') load(S.idx);
  if (e.key === 'n' || e.key === 'N') next();
});

/* ======================= buttons and sheets ======================= */
const SPEEDS = [1, 2, 4];
const next = () => {
  if (S.replay) load(S.idx);
  else if (world().daily) load(Math.min(store.last || 0, DAILY0 - 1));
  else load(S.idx + 1 >= ALL.length || isDaily(S.idx + 1) ? 0 : S.idx + 1);
};
$('#speedBtn').onclick = () => { S.speed = SPEEDS[(SPEEDS.indexOf(S.speed) + 1) % SPEEDS.length]; $('#speedBtn').textContent = S.speed + '×'; };
$('#restartBtn').onclick = () => load(S.idx);
$('#skipBtn').onclick = () => { store.skipped = [...new Set([...(store.skipped || []), level().gid])]; save(); next(); };
$('#hintBtn').onclick = () => { const L = level(); if (L.sol) load(S.idx, { throws: [[0, L.sol[0], L.sol[1]]], hint: true }); };
$('#menuBtn').onclick = () => { buildMenu(); $('#menu').hidden = false; };
$('#closeMenu').onclick = () => $('#menu').hidden = true;
$('#retryBtn').onclick = () => load(S.idx);
$('#nextBtn').onclick = next;
function toast(html, ms) {
  const t = $('#toast'); t.innerHTML = html; t.hidden = false;
  clearTimeout(toast.h); if (ms) toast.h = setTimeout(() => t.hidden = true, ms);
  return t;
}
function buildMenu() {
  const box = $('#worlds'); box.replaceChildren();
  const ti = todayIdx();
  if (ti >= 0) {
    const L = ALL[ti], b = document.createElement('button');
    b.type = 'button'; b.className = 'today'; b.style.setProperty('--dc', DAILY.theme.acc);
    b.innerHTML = '<span></span><small></small>'; b.firstChild.textContent = "Today's sky"; const sk = streak(), done = (store.days || {})[dayNo()];
    b.lastChild.textContent = (done ? '★'.repeat(done) : `No. ${L.li + 1}`) + (sk > 1 ? ` · ${sk} days` : '');
    b.onclick = () => { $('#menu').hidden = true; load(ti); };
    box.append(b);
  }
  let gi = 0;
  WORLDS.forEach(w => {
    if (w.daily) return;
    const sec = document.createElement('div'), h = document.createElement('h2'), grid = document.createElement('div');
    const got = w.levels.reduce((s, _, i) => s + ((store.best[`${w.id}-${i}`] || {}).stars || 0), 0);
    h.innerHTML = '<span></span><span></span>'; h.firstChild.textContent = w.name; h.lastChild.textContent = `★ ${got}/${w.levels.length * 3}`;
    grid.className = 'grid'; grid.style.setProperty('--wc', w.theme.acc);
    w.levels.forEach((L, i) => {
      const idx = gi++, b = document.createElement('button'), best = store.best[`${w.id}-${i}`];
      b.type = 'button'; b.className = 'tile' + (idx === S.idx ? ' cur' : ''); b.disabled = !unlocked(idx);
      b.innerHTML = `${i + 1}<small>${best ? '★'.repeat(best.stars) : ''}</small>`;
      b.setAttribute('aria-label', `${w.name} level ${i + 1}, ${L.name}${best ? `, ${best.stars} stars` : ''}`);
      b.onclick = () => { $('#menu').hidden = true; load(idx); };
      grid.append(b);
    });
    sec.append(h, grid); box.append(sec);
  });
  const r = $('#soundRow'); r.replaceChildren();
  [[true, 'On'], [false, 'Off']].forEach(([id, name]) => { const b = document.createElement('button'); b.type = 'button'; b.className = 'pill'; b.textContent = name; b.setAttribute('aria-pressed', String(id === Sound.on)); b.onclick = () => { Sound.on = store.sound = id; save(); if (id) Sound.wake(); buildMenu(); }; r.append(b); });
}

/* ======================= replays ======================= */
// A replay is the level plus the throws: on which step each was made and how hard.
const b36 = n => (n < 0 ? '-' : '') + Math.abs(n).toString(36);
// Links name the level by id and fingerprint rather than position, so adding levels never breaks them.
function replayCode() { const L = level(); return `${L.gid}~${fp(L)}.` + S.throws.map(([t, vx, vy]) => [t, Math.round(vx * 1e5), Math.round(vy * 1e5)].map(b36).join('.')).join('_'); }
function parseReplay(code) {
  const cut = code.indexOf('.'), head = code.slice(0, cut);
  let idx;
  if (head.includes('~')) {
    const [gid, f] = head.split('~'); idx = ALL.findIndex(L => L.gid === gid);
    if (idx < 0) return null;
    if (fp(ALL[idx]) !== f) return { idx, throws: [] };
  } else { idx = parseInt(head, 10); if (!(idx >= 0 && idx < ALL.length)) return null; }
  const throws = code.slice(cut + 1).split('_').map(s => s.split('.').map(v => parseInt(v, 36))).filter(a => a.length === 3 && a.every(Number.isFinite)).map(([t, x, y]) => [t, x / 1e5, y / 1e5]);
  return { idx, throws };
}
$('#shareBtn').onclick = async () => {
  const base = ON_SITE ? location.origin + '/phone' : 'https://areabake.com/phone';
  const url = `${base}#r=${replayCode()}`, L = level();
  const text = `Slingshot, ${world().daily ? "today's sky" : world().name} ${L.li + 1}: ${'★'.repeat(stars())} ${S.score.toLocaleString('en-US')} points. Watch my throw:`;
  try { if (navigator.share) { await navigator.share({ title: 'Slingshot', text, url }); return; } } catch (e) { if (e && e.name === 'AbortError') return; }
  try { await navigator.clipboard.writeText(`${text} ${url}`); toast('Link copied', 2500); } catch (e) { toast(url); }
};

/* ======================= video clips ======================= */
// The run is replayed from its first step and rendered frame by frame into a
// vertical 1080 x 1920 video, so nothing has to be recording while you play.
let muxer = null;
function loadMuxer() {
  if (window.Mp4Muxer) return Promise.resolve(window.Mp4Muxer);
  return muxer || (muxer = new Promise((ok, no) => {
    const sc = document.createElement('script'); sc.src = 'https://cdn.jsdelivr.net/npm/mp4-muxer@5.1.3/build/mp4-muxer.min.js';
    sc.onload = () => ok(window.Mp4Muxer); sc.onerror = () => { muxer = null; no(new Error('load')); }; document.head.append(sc);
  }));
}
async function makeClip() {
  if (CLIP) return;
  if (!('VideoEncoder' in window)) { stillShot(); return; }
  const vw = 1080, vh = 1920, fps = 60;
  // H.264 plays everywhere; VP9 is the fallback where H.264 encoding is missing
  let cfg = null, kind = 'avc';
  for (const [codec, k] of [['avc1.64002a', 'avc'], ['avc1.640028', 'avc'], ['avc1.4d002a', 'avc'], ['avc1.42002a', 'avc'], ['vp09.00.40.08', 'vp9']]) {
    const c = { codec, width: vw, height: vh, bitrate: 14e6, framerate: fps, ...(k === 'avc' ? { avc: { format: 'avc' } } : {}) };
    try { if ((await VideoEncoder.isConfigSupported(c)).supported) { cfg = c; kind = k; break; } } catch (e) {}
  }
  if (!cfg) { stillShot(); return; }
  let M; try { M = await loadMuxer(); } catch (e) { toast('Could not load the video tools. Check your connection.', 3500); return; }
  const mux = new M.Muxer({ target: new M.ArrayBufferTarget(), video: { codec: kind, width: vw, height: vh, frameRate: fps }, fastStart: 'in-memory' });
  let failed = null;
  const enc = new VideoEncoder({ output: (ch, meta) => mux.addVideoChunk(ch, meta), error: e => failed = e });
  enc.configure(cfg);
  // set the game aside, render the replay at clip size, then put everything back
  const keep = { S: { ...S }, DPR, W, H, cssW, cssH, G };
  CLIP = true; Sound.mute = true;
  DPR = 2; cssW = vw / 2; cssH = vh / 2; W = vw; H = vh; cvs.width = fx.width = W; cvs.height = fx.height = H; geom();
  const out = document.createElement('canvas'); out.width = vw; out.height = vh; const oc = out.getContext('2d');
  S.time = 0;
  load(keep.S.idx, { throws: keep.S.throws.map(q => q.slice()) });
  const btn = $('#clipBtn'); btn.disabled = true;
  try {
    for (let f = 0; f < fps * 75 && !failed; f++) {
      S.time += 1 / fps; simulate(1 / fps); renderGL(); draw();
      oc.drawImage(cvs, 0, 0); oc.drawImage(fx, 0, 0);
      const vf = new VideoFrame(out, { timestamp: Math.round(f * 1e6 / fps), duration: Math.round(1e6 / fps) });
      enc.encode(vf, { keyFrame: f % 120 === 0 }); vf.close();
      while (enc.encodeQueueSize > 4) await new Promise(r => setTimeout(r, 2));
      if (f % 20 === 0) { toast(`Making your video ${Math.round(Math.min(1, S.won ? (S.time - S.wonAt) / 3 : S.time / 40) * 100)}%`); await new Promise(r => setTimeout(r, 0)); }
      if (S.won && S.time - S.wonAt > 3.2) break;
      if (!S.won && !S.comets.length && S.replay && S.replay.throws.every(q => q.done) && S.time > 2) break;
    }
    if (!failed) await enc.flush();
  } finally {
    try { enc.close(); } catch (e) {}
    CLIP = false; Sound.mute = false; btn.disabled = false;
    Object.assign(S, keep.S); DPR = keep.DPR; W = keep.W; H = keep.H; cssW = keep.cssW; cssH = keep.cssH; G = keep.G;
    cvs.width = fx.width = W; cvs.height = fx.height = H; resize();
    last = performance.now();
  }
  if (failed) { toast('The video encoder stopped. Try again.', 3500); return; }
  mux.finalize();
  const L = level(), name = `slingshot-${world().id}-${L.li + 1}.mp4`, blob = new Blob([mux.target.buffer], { type: 'video/mp4' });
  const file = new File([blob], name, { type: 'video/mp4' });
  // sharing needs a fresh tap, so the finished video waits behind one
  const t = toast('Your video is ready. <button type="button">Share or save</button>');
  t.querySelector('button').onclick = () => shareFile(file, blob, name);
}
// where video can't be made, the finished sky as a picture instead
function stillShot() {
  renderGL(); draw();
  const out = document.createElement('canvas'); out.width = W; out.height = H; const oc = out.getContext('2d');
  oc.drawImage(cvs, 0, 0); oc.drawImage(fx, 0, 0);
  oc.font = `500 ${13 * DPR}px Jost, system-ui, sans-serif`; oc.textAlign = 'center'; oc.fillStyle = 'rgba(239,232,218,.6)';
  oc.fillText('areabake.com/phone', W / 2, H - 26 * DPR);
  out.toBlob(blob => {
    if (!blob) { toast('Could not make a picture.', 3000); return; }
    const name = `slingshot-${world().id}-${level().li + 1}.png`, file = new File([blob], name, { type: 'image/png' });
    const t = toast('Video is not supported here. <button type="button">Share a picture</button>');
    t.querySelector('button').onclick = () => shareFile(file, blob, name);
  }, 'image/png');
}
async function shareFile(file, blob, name) {
  try { if (navigator.canShare && navigator.canShare({ files: [file] })) { await navigator.share({ files: [file], title: 'Slingshot' }); $('#toast').hidden = true; return; } }
  catch (e) { if (e && e.name === 'AbortError') return; }
  const dl = window.claude ? await window.claude.use('downloads').catch(() => null) : null;
  if (dl) { try { await dl.save({ filename: name, data: blob }); toast('Saved', 2500); } catch (e) { if (!e || e.code !== 'declined') toast('Could not save the video.', 3500); } return; }
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 60000); toast('Saved', 2500);
}
$('#clipBtn').onclick = makeClip;

/* ======================= loop ======================= */
let last = performance.now();
function loop(now) {
  requestAnimationFrame(loop);
  const dt = Math.min(0.05, Math.max(0.001, (now - last) / 1000)); last = now;
  if (document.hidden || CLIP) { Sound.hum(0); return; }
  S.time += dt;
  simulate(dt); renderGL(); draw();
  const hc = !S.won && S.comets[0];
  Sound.hum(hc && S.ffK < 2 ? Math.hypot(hc.vx, hc.vy) : 0);
  if (S.won && $('#winbar').hidden && S.time - S.wonAt > 1.1) {
    $('#winbar').hidden = false; $('#shareBtn').hidden = $('#clipBtn').hidden = !!S.replay; $('#speedBtn').hidden = true;
    $('#nextBtn').setAttribute('aria-label', S.replay ? 'Play this level' : 'Next level');
  }
  if (S.replay && !S.won && !S.comets.length && S.replay.throws.every(q => q.done)) load(S.idx);
}
window.addEventListener('resize', resize);
resize();
const m = /#r=([0-9a-z._~-]+)/.exec(location.hash), rp = m && parseReplay(m[1]);
if (rp && rp.throws.length) load(rp.idx, { throws: rp.throws });
else if (rp) load(rp.idx);
else if (/#today/.test(location.hash) && todayIdx() >= 0) load(todayIdx());
else load(Math.min(store.last || 0, (DAILY ? DAILY0 : ALL.length) - 1));
if (!gl) document.body.insertAdjacentHTML('beforeend', '<p style="position:fixed;bottom:40%;left:0;right:0;text-align:center">This game needs WebGL 2, which this browser has turned off.</p>');
if (ON_SITE && 'serviceWorker' in navigator) navigator.serviceWorker.register('/phone-sw.js', { scope: '/phone' }).catch(() => {});
requestAnimationFrame(loop);
</script>
