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
  ctx: null, on: true, mute: false, rec: null,
  wake() {
    if (!this.ctx) { try { this.ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { this.ctx = null; } }
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
  },
  tone(f, dur = 0.7, type = 'sine', gain = 0.08, when = 0) {
    // while a highlight reel renders, sounds are noted with their time in the film and played into it later
    if (this.rec) { this.rec.list.push(['tone', [f, dur, type, gain], this.rec.at + when]); return; }
    if (!this.on || this.mute || !this.ctx) return;
    const t = this.ctx.currentTime + when, o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(f, t);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(gain, t + 0.012); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.ctx.destination); o.start(t); o.stop(t + dur + 0.05);
  },
  whoosh(p, when = 0) {
    if (this.rec) { this.rec.list.push(['whoosh', [p], this.rec.at]); return; }
    if (!this.on || this.mute || !this.ctx) return;
    const c = this.ctx, t = c.currentTime + when, n = Math.floor(c.sampleRate * 0.45), buf = c.createBuffer(1, n, c.sampleRate), d = buf.getChannelData(0);
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

/*PHYS*/
const PULL = 0.75, SPEED = 1.3, FF = 14;
// only the aim preview uses this smooth form; flights use the exact stepping in phys.js
function bodyPos(b, t) {
  if (!b.orbit) return [b.x, b.y];
  const o = b.orbit, a = o.phase + t / o.period * Math.PI * 2;
  return [o.cx + o.R * Math.cos(a), o.cy + o.R * Math.sin(a)];
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
const store = (() => { try { return JSON.parse(localStorage.getItem('areabake.slingshot.v3') || '{}') || {}; } catch (e) { return {}; } })();
store.best = store.best || {};
const save = () => { if (CLIP) return; try { localStorage.setItem('areabake.slingshot.v3', JSON.stringify(store)); } catch (e) {} };
if (store.sound === false) Sound.on = false;
const S = {
  idx: 0, tick: 0, acc: 0, speed: 1, ffK: 1, ff: false, comets: [], ghosts: [], dust: [], sparks: [], waves: [], labels: [],
  got: [], order: [], shots: 0, score: 0, tricks: [], won: false, wonAt: 0, gold: null, aim: null, flash: 0, hitStop: 0, throws: [], replay: null,
  coached: !!store.coached, time: 0, P: [], Q: [], title: null, W: null, band: null, tg: [],
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
  const str = JSON.stringify([L.launch, L.bodies.map(b => [b.x, b.y, b.m, b.orbit && b.orbit.R, b.orbit && b.orbit.period]), L.targets].concat(L.piles ? [L.piles] : []));
  let h = 2166136261; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0).toString(36).slice(0, 4);
}

/* ======================= GPU background ======================= */
const cvs = $('#gl'), fx = $('#fx'), g2 = fx.getContext('2d');
const gl = cvs.getContext('webgl2', { antialias: false, alpha: false, depth: false, stencil: false, powerPreference: 'high-performance' });
let DPR = 1, W = 1, H = 1, cssW = 1, cssH = 1, G = { s: 100, cx: 0, cy: 0 }, V = { s: 100, cx: 0, cy: 0 };
const FS = `#version 300 es
precision highp float; precision highp int;
uniform vec2 u_center; uniform float u_scale, u_time, u_flash; uniform int u_n; uniform vec4 u_b[10]; uniform float u_kind[10]; uniform vec3 u_sc[10];
uniform vec3 u_acc, u_neb; uniform vec4 u_gw; uniform vec2 u_gw2;
uniform int u_tn; uniform vec4 u_tg[6]; uniform vec3 u_tcol[6]; uniform float u_tr;
uniform vec4 u_dent; uniform float u_dentA;
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
// Bessel J_n by its integral form, (1 / pi) int_0^pi cos(n tau - x sin tau) d tau
float besselJ(float n, float x){ float s = 0.0; for (int i = 0; i < 20; i++) { float tau = (float(i) + 0.5) * 3.14159265 / 20.0; s += cos(n * tau - x * sin(tau)); } return s / 20.0; }
// a drumhead mode: n nodal diameters, and k the m-th zero of J_n so the rim stays still
vec2 chMode(float m){
  if (m < 0.5) return vec2(2.0, 8.4172); if (m < 1.5) return vec2(3.0, 9.7610); if (m < 2.5) return vec2(1.0, 7.0156);
  if (m < 3.5) return vec2(4.0, 11.0647); if (m < 4.5) return vec2(0.0, 8.6537); return vec2(5.0, 12.2251);
}
vec3 plates(vec2 p){
  vec3 add = vec3(0.0);
  for (int i = 0; i < 6; i++) {
    if (i >= u_tn) break;
    vec4 T = u_tg[i];
    if (T.z < 0.0) continue;
    vec2 d = (p - T.xy) / u_tr; float r = length(d);
    if (r > 1.02) continue;
    float hit = T.w, shake = hit < 0.0 ? 0.0 : clamp(hit / 0.35, 0.0, 1.0), gone = hit < 0.0 ? 0.0 : clamp((hit - 0.25) / 0.95, 0.0, 1.0);
    vec2 nk = chMode(T.z); float th = atan(d.y, d.x) + u_time * 0.12 * (mod(T.z, 2.0) > 0.5 ? 1.0 : -1.0);
    float u = besselJ(nk.x, nk.y * r) * cos(nk.x * th);
    // the sand: dense on the nodes, loosened by a hit, then gone
    vec2 cell = floor(gl_FragCoord.xy * 0.8);
    float jit = (h21(cell + floor(u_time * 24.0)) - 0.5) * shake * 0.5, eps = 0.05 + 0.3 * shake;
    float sand = exp(-pow((u + jit) / eps, 2.0)) * step(0.42 + 0.3 * shake, h21(cell + float(i) * 13.1));
    float edge = smoothstep(1.0, 0.94, r), keep = 1.0 - gone;
    vec3 hue = u_tcol[i];
    add = add * (1.0 - edge * keep * 0.85) + (hue * 0.05 + vec3(0.012, 0.014, 0.024)) * edge * keep
        + mix(hue, vec3(1.0), 0.35) * sand * edge * keep * 1.15 + hue * exp(-abs(r - 1.0) * 70.0) * 0.5 * keep;
  }
  return add;
}
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
  // the launcher's dent drags space toward the pull; the field lines are drawn in the dragged space
  vec2 dq = p - u_dent.xy, pw = p - u_dent.zw * exp(-dot(dq, dq) / 0.05);
  for (int i = 0; i < 10; i++) {
    if (i >= u_n) break;
    vec4 b = u_b[i]; vec2 d = p - b.xy; float r = length(d);
    float rw = length(pw - b.xy);
    if (u_kind[i] > 1.5) {
      float rs = b.w / 2.6, rin = 3.0 * rs, rout = 7.0 * rs;
      phi += b.z / max(rw - rs, 0.004);
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
    phi += b.z / sqrt(rw * rw + 0.0004);
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
  // the dent itself: log-spaced rings of a small well, stretched with the sheet, and a faint dimple of shade
  if (u_dentA > 0.0) {
    vec2 qq = pw - u_dent.xy; float rr = length(qq), v2 = log(rr + 0.012) * 6.5, fw2 = max(fwidth(v2), 1e-4);
    float rings = (1.0 - smoothstep(0.3, 1.25, abs(fract(v2) - 0.5) / fw2)) * clamp(0.2 / fw2, 0.0, 1.0) * smoothstep(0.4, 0.05, length(dq));
    col = col * (1.0 - 0.35 * u_dentA * exp(-rr * rr / 0.004)) + u_acc * rings * 0.45 * u_dentA;
  }
  col = col * shadow + vec3(1.0, 0.86, 0.68) * ring;
  // plates sit over the sky: darken beneath them, then lay the sand
  { vec3 pl = plates(p); float cover = 0.0;
    for (int i = 0; i < 6; i++) { if (i >= u_tn) break; vec4 T = u_tg[i]; if (T.z < 0.0) continue; float r = length(p - T.xy) / u_tr; float gone = T.w < 0.0 ? 0.0 : clamp((T.w - 0.25) / 0.95, 0.0, 1.0); cover = max(cover, smoothstep(1.0, 0.94, r) * (1.0 - gone)); }
    col = col * (1.0 - cover * 0.9) + pl; }
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
  for (const n of ['u_center', 'u_scale', 'u_time', 'u_flash', 'u_n', 'u_b', 'u_kind', 'u_sc', 'u_acc', 'u_neb', 'u_gw', 'u_gw2', 'u_tn', 'u_tg', 'u_tcol', 'u_tr', 'u_dent', 'u_dentA']) U[n] = gl.getUniformLocation(prog, n);
  gl.bindVertexArray(gl.createVertexArray());
}
function geom() {
  // the 2 x 3.4 portrait arena, between the top bar and the bottom controls
  const top = CLIP ? 70 : 96, bottom = CLIP ? 60 : 70, s = Math.min((cssW - 12) / 2.1, (cssH - top - bottom) / 3.45);
  G = { s, cx: cssW / 2, cy: top + (cssH - top - bottom) / 2 };
  setView();
}
/* ---- the camera ---- */
// G is the layout (the arena at rest); V is what you see. The camera eases out when a throw heads far
// away, so the comet and the whole level stay in frame, and glides back in as the comet falls home.
// Zoom and pan follow first-order springs (they settle without overshooting, never with a jolt);
// a close pass gets a short, gentle push-in. Only the view moves: the physics never sees the camera.
function setView() { const c = S.cam || { z: 1, x: 0, y: 0 }; V = { s: G.s * c.z, cx: G.cx - c.x * G.s * c.z, cy: G.cy + c.y * G.s * c.z }; }
function levelBox(L) {
  let x0 = L.launch[0], x1 = x0, y0 = L.launch[1], y1 = y0;
  const add = (x, y, r = 0) => { x0 = Math.min(x0, x - r); x1 = Math.max(x1, x + r); y0 = Math.min(y0, y - r); y1 = Math.max(y1, y + r); };
  for (const t of L.targets) add(t[0], t[1], TR);
  for (const b of L.bodies) b.orbit ? add(b.orbit.cx, b.orbit.cy, b.orbit.R + b.r) : add(b.x, b.y, b.r);
  return [x0, x1, y0, y1];
}
function stepCamera(dt) {
  const c = S.cam, L = level();
  let zt = 1, xt = 0, yt = 0;
  if (S.camShot) ({ z: zt, x: xt, y: yt } = S.camShot);
  else {
    let [x0, x1, y0, y1] = levelBox(L), out = false;
    for (const k of S.comets) { if (!k.alive) continue; const m = 0.22; if (k.x - m < x0) x0 = k.x - m; if (k.x + m > x1) x1 = k.x + m; if (k.y - m < y0) y0 = k.y - m; if (k.y + m > y1) y1 = k.y + m; }
    // the arena at rest shows about +/-hw by -hb..+ht in world units
    const hw = (cssW / 2 - 8) / G.s, ht = (G.cy - 70) / G.s, hb = (cssH - G.cy - 20) / G.s;
    const need = Math.max((x1 - x0) / (2 * hw), (y1 - y0) / (ht + hb), Math.max(-x0, x1) / hw, y1 / ht, -y0 / hb);
    if (need > 1) { out = true; zt = Math.max(0.22, 1 / need); xt = (x0 + x1) / 2 * (1 - zt); yt = ((y0 + y1) / 2 - (ht - hb) / 2) * (1 - zt); }
    // a close pass: lean in a little toward it, briefly
    if (S.near && S.time - S.near.t < 0.9 && !S.ff) { const e = Math.sin(Math.PI * (S.time - S.near.t) / 0.9); zt *= 1 + 0.16 * e; xt += (S.near.x - xt) * 0.25 * e; yt += (S.near.y - yt) * 0.25 * e; }
  }
  const kz = 1 - Math.exp(-dt * (zt < c.z ? 3.2 : 1.4)), kp = 1 - Math.exp(-dt * 2.4);
  c.z += (zt - c.z) * kz; c.x += (xt - c.x) * kp; c.y += (yt - c.y) * kp;
  setView();
}
function resize() {
  if (CLIP) return;
  DPR = Math.min(window.devicePixelRatio || 1, 2); cssW = innerWidth; cssH = innerHeight;
  W = Math.round(cssW * DPR); H = Math.round(cssH * DPR);
  cvs.width = fx.width = W; cvs.height = fx.height = H;
  geom();
}
const toScr = (x, y) => [V.cx + x * V.s, V.cy - y * V.s];
function renderGL() {
  if (!gl) return;
  const L = level(), B = L.bodies, n = Math.min(10, B.length), arr = new Float32Array(40), kind = new Float32Array(10), col = new Float32Array(30), th = world().theme;
  for (let i = 0; i < n; i++) { arr.set([S.P[i][0], S.P[i][1], B[i].m, B[i].r], i * 4); kind[i] = B[i].bh ? 2 : isMoon(B[i]) ? 1 : 0; col.set(L.cols[i], i * 3); }
  gl.viewport(0, 0, W, H); gl.useProgram(prog);
  gl.uniform2f(U.u_center, V.cx * DPR, H - V.cy * DPR); gl.uniform1f(U.u_scale, V.s * DPR);
  gl.uniform1f(U.u_time, S.time % 1000); gl.uniform1f(U.u_flash, S.flash);
  gl.uniform1i(U.u_n, n); gl.uniform4fv(U.u_b, arr); gl.uniform1fv(U.u_kind, kind); gl.uniform3fv(U.u_sc, col);
  gl.uniform3fv(U.u_acc, hex(th.acc)); gl.uniform3fv(U.u_neb, hex(th.neb));
  // Chladni plates are drawn by the shader: position, mode (or -1 once collected), and time since hit
  const tg = new Float32Array(24), tc = new Float32Array(18), nt = Math.min(6, L.targets.length);
  for (let i = 0; i < nt; i++) {
    const o = S.tg[i] || { hit: -1, mode: -1 }, done = S.got[i] && o.hit < 0;
    tg.set([L.targets[i][0], L.targets[i][1], done ? -1 : o.mode, o.hit], i * 4);
    tc.set(hex(o.hue || '#ffffff'), i * 3);
  }
  gl.uniform1i(U.u_tn, nt); gl.uniform4fv(U.u_tg, tg); gl.uniform3fv(U.u_tcol, tc); gl.uniform1f(U.u_tr, TR);
  // the launcher's dent: where it sits, how far it is pulled (in world units), and how strongly it shows
  const off = dentOffset(), ready = !S.won && !S.replay && (S.aim || !S.comets.length);
  gl.uniform4f(U.u_dent, L.launch[0], L.launch[1], off[0] / V.s, -off[1] / V.s); gl.uniform1f(U.u_dentA, CLIP && !ready ? 0.3 : ready ? 1 : 0.35);
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
  const W = makeWorld(L);
  Object.assign(S, { W, tick: 0, acc: 0, ffK: 1, ff: false, comets: W.comets, ghosts: [], dust: [], sparks: [], waves: [], labels: [],
    got: W.got, order: [], shots: 0, score: 0, tricks: [], won: false, gold: null, aim: null, throws: [], replay: replay || null, flash: 0, hitStop: 0,
    P: W.P, Q: W.Q, band: null, rewind: null, tg: makeTargets(L), cam: { z: 1, x: 0, y: 0 }, camShot: null, near: null });
  setView();
  if (!CLIP) {
    document.documentElement.style.setProperty('--accent', world().theme.acc);
    $('#lvname').textContent = `${L.li + 1}. ${L.name}`;
    $('#winbar').hidden = true; $('#toast').hidden = true; $('#menu').hidden = true;
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
    const sx = px, sy = cy + py - h / 2, ax = (sx - V.cx) / V.s, ay = -(sy - V.cy) / V.s, sc = Math.random();
    return { x: ax, y: ay, hx: ax, hy: ay, vx: 0, vy: 0, ox: (Math.random() - 0.5) * 0.5, oy: (Math.random() - 0.5) * 0.5, tw: Math.random() * 6.28, sc, alive: true };
  });
  S.title = { parts, t0: S.time, released: false, eyebrow: `${S.replay && !CLIP ? (S.replay.hint ? 'Hint' : 'Replay') : world().daily ? 'Today' : world().name} · ${L.li + 1}`, par: `par ${L.par}`, tint };
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
function fire(vx, vy, kind = 'n') {
  Sound.wake();
  // quantized so a replay link reproduces the throw exactly
  vx = Math.round(vx * 1e5) / 1e5; vy = Math.round(vy * 1e5) / 1e5;
  releaseTitle();
  for (const c of S.comets) if (c.alive) { c.alive = false; retire(c); }
  const L = level(), [x, y] = L.launch, c = newComet(S.W, vx, vy, kind);
  Object.assign(c, { trail: [[x, y]], winds: L.bodies.map(() => 0), angs: L.bodies.map(() => null), close: false, moon: false, hits: 0,
    moving: L.bodies.some(b => b.orbit), E0: energy(L.bodies, S.P, x, y, vx, vy) });
  S.comets.push(c);
  if (!S.replay) S.throws.push(kind === 'n' ? [S.tick, vx, vy] : [S.tick, vx, vy, kind, -1]);
  S.shots++; S.ff = false; S.ffK = 1;
  S.waves.push({ x, y, age: 0, r0: 0.02, col: '239,232,218' });
  Sound.whoosh(Math.min(1, Math.hypot(vx, vy) / (PULL * SPEED))); buzz(8);
  if (!S.coached && !CLIP) { S.coached = store.coached = true; save(); }
  hudPips();
}
const HOOKS = {
  hit: (c, i) => onHit(c, i),
  track: c => tricks(c),
  dead: c => retire(c),
};
function retire(c) {
  if (c.fate === 'crash') { Sound.thud(); burst(c.x, c.y, '#ffb47a', 30, 1.4); S.waves.push({ x: c.x, y: c.y, age: 0, r0: 0.04, col: '255,180,122' }); buzz(20); }
  if (c.trail !== S.gold) { S.ghosts.push(c.trail); if (S.ghosts.length > 3) S.ghosts.shift(); }
}
function burst(x, y, col, n, life = 0.6) {
  for (let i = 0; i < n; i++) { const a = Math.random() * Math.PI * 2, v = 0.2 + Math.random() * 0.7; S.sparks.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: life + Math.random() * life, age: 0, col }); }
}
function award(c, name, pts, at) {
  // each trick pays once per level, and labels earned together queue up and stack instead of overprinting
  const kind = name.split(' ×')[0];
  if (S.tricks.some(q => q[0].split(' ×')[0] === kind)) return;
  S.tricks.push([name, pts]); S.score += pts;
  const k = S.labels.filter(l => l.age < 0.4).length;
  const p = at || c;
  S.labels.push({ x: p.x, y: p.y, vx: 0, vy: 0, text: `${name} +${pts}`, age: -0.4 * k, slot: k, chimed: false });
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
}

/* ======================= simulation ======================= */
// every sixth step, after the physics has had its say: the trail, and the bookkeeping for tricks
function tricks(c) {
  const B = level().bodies;
  c.trail.push([c.x, c.y]); if (c.trail.length > 3200) c.trail.shift();
  // winding around the stars, close shaves, energy stolen from something moving
  // winding number about every star: the total turning angle seen from it, over 2 pi
  let far = true;
  for (let k = 0; k < B.length; k++) {
    const b = B[k], p = S.P[k], d = Math.sqrt((p[0] - c.x) * (p[0] - c.x) + (p[1] - c.y) * (p[1] - c.y));
    if (!isMoon(b)) {
      const ang = Math.atan2(c.y - p[1], c.x - p[0]);
      if (c.angs[k] != null) { let da = ang - c.angs[k]; if (da > Math.PI) da -= 2 * Math.PI; if (da < -Math.PI) da += 2 * Math.PI; c.winds[k] += da; }
      c.angs[k] = ang;
      if (d < b.r * 1.45) c.close = true;
      // a fast, close pass: the camera leans in and time breathes out for a moment
      if (d < b.r * 1.7 && !S.ff && Math.hypot(c.vx, c.vy) > 0.7 && (!S.near || S.time - S.near.t > 2.5)) { S.near = { t: S.time, x: (c.x + p[0]) / 2, y: (c.y + p[1]) / 2 }; S.slow = 0.45; }
    }
    if (b.orbit && d < b.r * 4) far = false;
  }
  // E = v^2/2 + phi(x, t) only changes when the wells move (dE/dt = d phi/dt), so any gain is a true gravity assist.
  // Measured away from the moving bodies, where their own pull is not mid-swing.
  if (c.moving && far && energy(B, S.P, c.x, c.y, c.vx, c.vy) - c.E0 > 0.1) c.moon = true;
}
function onHit(c, i) {
  c.hits++; S.order.push(i);
  const L = level(), [tx, ty] = L.targets[i];
  targetHit(i, c); S.waves.push({ x: tx, y: ty, age: 0, r0: TR, col: hex(TH[i % TH.length]).map(v => v * 255 | 0).join(',') });
  S.hitStop = 0.45; S.flash = 1; S.score += 500;
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
  const stop = S.hitStop > 0 ? 0.2 : S.slow > 0 ? 0.45 : 1; S.hitStop -= dt; S.slow = (S.slow || 0) - dt;
  S.acc += dt * (S.hold ? 6 : 1) * S.ffK * stop * (S.won ? 0.3 : 1);
  const L = level(), B = L.bodies, W = S.W;
  let n = 0;
  while (S.acc >= DT && n < 9000) {
    S.acc -= DT; n++;
    // a replayed throw launches on exactly the step the original did
    if (S.replay) { const r = S.replay.throws.find(q => q[0] === W.tick && !q.done); if (r) { r.done = true; fire(r[1], r[2]); } }
    step(W, HOOKS);
    S.P = W.P; S.Q = W.Q; S.tick = W.tick;
  }
  S.comets = W.comets = W.comets.filter(c => c.alive);
  tails(dt, B);
  // sparks are test particles too: crash debris swings round the star before it fades
  { const a = [0, 0, -1]; for (const p of S.sparks) { accel(B, S.P, p.x, p.y, a); p.vx = (p.vx + a[0] * dt) * 0.985; p.vy = (p.vy + a[1] * dt) * 0.985; p.x += p.vx * dt; p.y += p.vy * dt; p.age += dt; if (a[2] >= 0) p.age = p.life; } }
  for (const w of S.waves) w.age += dt;
  // trick labels are written in starlight too: once shown they drift, gently, down the gravity well
  { const a = [0, 0, -1]; for (const l of S.labels) { l.age += dt; if (l.age >= 0 && !l.chimed) { l.chimed = true; Sound.trick(); }
    if (l.age > 0) { accel(B, S.P, l.x, l.y, a); l.vx += a[0] * dt * 0.06; l.vy += a[1] * dt * 0.06; l.x += l.vx * dt; l.y += l.vy * dt; } } }
  S.dust = S.dust.filter(p => p.age < p.life); S.sparks = S.sparks.filter(p => p.age < p.life);
  S.waves = S.waves.filter(w => w.age < 1); S.labels = S.labels.filter(l => l.age < 1.8);
  stepTitle(dt); stepTargets(dt); stepBand(dt); if (!CLIP) stepCamera(dt);
  // time speeds up once every comet still flying has gone stale (decided per step inside the physics)
  S.ff = !S.won && S.comets.length > 0 && S.comets.every(c => c.ff);
  if (!CLIP) { const show = S.ffK > 1.6 || !!S.hold; if ($('#ff').hidden === show) $('#ff').hidden = !show; }
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

/* ---- targets: Chladni plates ---- */
// Sand on a vibrating drumhead gathers where the plate stays still: the nodal lines of the mode
// J_n(k r) cos(n theta) = 0, with k a zero of the Bessel function J_n so the rim never moves.
// Each plate rings in its own mode and its own color. They are drawn in the sky shader.
function makeTargets(L) { return L.targets.map((t, i) => ({ hue: TH[(i + L.li) % TH.length], hit: -1, mode: (i * 2 + L.li) % 6 })); }
function targetHit(i, c) {
  const L = level(), o = S.tg[i], [tx, ty] = L.targets[i];
  o.hit = 0;
  // the sand is thrown off the plate: grains of its color, falling in the level's real field
  for (let k = 0; k < 54; k++) {
    const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * TR * 0.85, v = 0.12 + Math.random() * 0.45;
    S.sparks.push({ x: tx + Math.cos(a) * r, y: ty + Math.sin(a) * r, vx: Math.cos(a) * v + c.vx * 0.2, vy: Math.sin(a) * v + c.vy * 0.2, life: 1 + Math.random() * 1.3, age: 0, col: k % 4 ? o.hue : '#fff6e6' });
  }
}
function stepTargets(dt) { for (const o of S.tg) if (o.hit >= 0) o.hit += dt; }
function drawTargets(g, t) {
  const L = level();
  L.targets.forEach(([x, y], i) => {
    const o = S.tg[i]; if (!o) return;
    const [sx, sy] = toScr(x, y), R = TR * V.s;
    if (o.hit > 1.2 || S.got[i] && o.hit < 0) {
      // where it was: a faint ring in its color
      g.strokeStyle = rgba(o.hue, 0.3); g.lineWidth = 1; g.setLineDash([2, 4]); g.beginPath(); g.arc(sx, sy, R * 0.95, 0, 7); g.stroke(); g.setLineDash([]);
      return;
    }
    const fade = o.hit < 0 ? 1 : clamp(1 - o.hit / 1.2, 0, 1), glow = g.createRadialGradient(sx, sy, R * 0.7, sx, sy, R * 2.2);
    glow.addColorStop(0, rgba(o.hue, 0.2 * fade)); glow.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = glow; g.beginPath(); g.arc(sx, sy, R * 2.2, 0, 7); g.fill();
  });
}

/* ---- the launcher: a dent in spacetime ---- */
// The comet waits in a small well of its own. Pulling back drags the well, like a weight on a rubber sheet:
// the rings around it, and the level's own field lines nearby, stretch toward your finger (the shader displaces
// space by the pull, fading as exp(-r^2 / s^2)). Let go and the sheet springs back as a damped oscillator,
// x'' = -k x - c x', ringing a few times at 6 Hz.
const BAND_K = Math.pow(2 * Math.PI * 6, 2), BAND_C = 2 * 0.11 * Math.sqrt(BAND_K);
function stepBand(dt) {
  const b = S.band; if (!b) return;
  for (let k = 0; k < 4; k++) { const h = dt / 4; b.vx += (-BAND_K * b.x - BAND_C * b.vx) * h; b.vy += (-BAND_K * b.y - BAND_C * b.vy) * h; b.x += b.vx * h; b.y += b.vy * h; }
  if (Math.abs(b.x) + Math.abs(b.y) < 0.2 && Math.abs(b.vx) + Math.abs(b.vy) < 2) S.band = null;
}
// the dent's pull, in screen pixels: the drag while aiming, the spring after release
const dentOffset = () => S.aim && !S.aim.cancel ? pullOffset(S.aim) : S.band ? [S.band.x, S.band.y] : [0, 0];
function drawLauncher(g) {
  if (S.won || S.replay || CLIP || !(S.aim || !S.comets.length)) return;
  // the next comet, resting where the sheet is pulled to
  const L = level(), [lx, ly] = toScr(L.launch[0], L.launch[1]), off = dentOffset(), px = lx + off[0], py = ly + off[1];
  const gp = g.createRadialGradient(px, py, 0, px, py, 12);
  gp.addColorStop(0, '#ffffff'); gp.addColorStop(0.3, 'rgba(200,230,255,.55)'); gp.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = gp; g.beginPath(); g.arc(px, py, 12, 0, 7); g.fill();
}
function pullOffset(A) {
  // the finger's drag, scaled down to the slingshot: full power stretches the band 70 px
  const maxDrag = PULL * G.s / 0.55, dx = A.cx - A.sx, dy = A.cy - A.sy, l = Math.hypot(dx, dy), f = 56 / maxDrag * Math.min(1, maxDrag / Math.max(l, 1e-6));
  return [dx * f, dy * f];
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
function preview(vx, vy, dur = 3.2) {
  const L = level(), B = L.bodies, out = [], a = [0, 0, -1], h = 1 / 150, t0 = S.tick * DT;
  let x = L.launch[0], y = L.launch[1];
  const P = L.bodies.map(() => [0, 0]);
  for (let s = 0; s < dur; s += h) {
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
  for (const b of L.bodies) if (b.orbit) { const [ox, oy] = toScr(b.orbit.cx, b.orbit.cy); g.beginPath(); g.arc(ox, oy, b.orbit.R * V.s, 0, 7); g.stroke(); }
  g.setLineDash([]);
  drawTargets(g, t);
  g.globalCompositeOperation = 'lighter';
  // the title, written in starlight
  const T = S.title, BHI = L.bodies.map((b, k) => b.bh ? k : -1).filter(k => k >= 0);
  if (T) {
    const age = t - T.t0, rel = T.released ? t - T.rt : 0;
    const fade = T.released ? clamp(1 - rel / 4.2, 0, 1) : 1;
    for (const p of T.parts) {
      if (!p.alive) continue;
      let px = p.x, py = p.y;
      if (!T.released) { const e = 1 - Math.pow(1 - clamp(age / 0.7, 0, 1), 3); px = p.hx + p.ox * (1 - e); py = p.hy + p.oy * (1 - e); }
      const [sx, sy] = toScr(px, py), tw = 0.65 + 0.35 * Math.sin(t * 5 + p.tw);
      const a = (T.released ? fade : clamp(age / 0.4, 0, 1)) * tw, col = `rgba(${235 + 20 * p.sc | 0},${(225 + 30 * T.tint[1] * p.sc) | 0},${(215 + 40 * T.tint[2] * p.sc) | 0},${a})`;
      // near a black hole each grain is pulled apart along the line to it: the tidal stretch grows as 2 m / r^3
      let st = 0, ux = 0, uy = 0;
      if (T.released && BHI.length) for (const k of BHI) { const dx = S.P[k][0] - px, dy = S.P[k][1] - py, r2 = dx * dx + dy * dy, r = Math.sqrt(r2), q = 2 * L.bodies[k].m / (r2 * r) * 0.004; if (q > st) { st = q; ux = dx / r; uy = -dy / r; } }
      if (st > 0.08) { const len = Math.min(16, st * 6); g.strokeStyle = col; g.lineWidth = 1.4; g.beginPath(); g.moveTo(sx - ux * len, sy - uy * len); g.lineTo(sx + ux * len, sy + uy * len); g.stroke(); }
      else { g.fillStyle = col; g.fillRect(sx - 0.9, sy - 0.9, 1.8, 1.8); }
    }
    const ta = T.released ? clamp(1 - rel / 0.6, 0, 1) : clamp(age / 0.5, 0, 1);
    if (ta > 0) {
      g.globalCompositeOperation = 'source-over'; g.textAlign = 'center';
      g.font = '500 10px "IBM Plex Mono", ui-monospace, monospace'; g.fillStyle = rgba(acc, 0.9 * ta);
      g.fillText(T.eyebrow.toUpperCase().split('').join(' '), cssW / 2, cssH * 0.4 - 52);
      g.font = '400 13px "IBM Plex Mono", ui-monospace, monospace'; g.fillStyle = `rgba(155,152,170,${ta})`;
      g.fillText(T.par, cssW / 2, cssH * 0.4 + 56);
      g.textAlign = 'start'; g.globalCompositeOperation = 'lighter';
    }
  }
  if (S.rewind) {
    const p = clamp((t - S.rewind.t0) / 0.5, 0, 1), e = p * p * (3 - 2 * p);
    for (const tr of S.rewind.tr) {
      const n = Math.max(2, Math.round(tr.length * (1 - e))), h = tr[n - 1], [sx, sy] = toScr(h[0], h[1]);
      ribbon(tr.slice(0, n), false, 1);
      const gr = g.createRadialGradient(sx, sy, 0, sx, sy, 18); gr.addColorStop(0, '#fff'); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.beginPath(); g.arc(sx, sy, 18, 0, 7); g.fill();
    }
  }
  if (S.gold) ribbon(S.gold, true, 1);
  for (const c of S.rewind ? [] : S.comets) {
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
    g.strokeStyle = `rgba(${w.col},${(1 - w.age) * 0.7})`; g.lineWidth = 1.8; g.beginPath(); g.arc(sx, sy, (w.r0 + e * 0.34) * V.s, 0, 7); g.stroke();
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
  drawLauncher(g);
  // first time only: a ghost finger showing the gesture
  if (!S.coached && !S.aim && !S.comets.length && !CLIP && (!S.title || S.title.released)) {
    const ph = (t % 2.6) / 2.6, pull = Math.sin(Math.min(1, ph / 0.7) * Math.PI / 2), fade = ph < 0.8 ? 1 : 1 - (ph - 0.8) / 0.2;
    const ox = cssW / 2, oy = cssH * 0.62, fy = oy + pull * cssH * 0.16;
    g.strokeStyle = `rgba(239,232,218,${0.35 * fade})`; g.setLineDash([3, 5]); g.beginPath(); g.moveTo(ox, oy); g.lineTo(ox, fy); g.stroke(); g.setLineDash([]);
    g.fillStyle = `rgba(239,232,218,${0.28 * fade})`; g.beginPath(); g.arc(ox, fy, 20, 0, 7); g.fill();
    g.strokeStyle = `rgba(239,232,218,${0.6 * fade})`; g.lineWidth = 1.5; g.beginPath(); g.arc(ox, fy, 20, 0, 7); g.stroke();
  }
  // after five misses, a throw that works shows as a faint path (unless hints are off in the menu)
  if (store.hints !== false && L.sol && S.shots >= 5 && !S.won && !S.replay && !CLIP) {
    const hp = preview(L.sol[0], L.sol[1], 7), a0 = clamp((S.shots - 4.5) * 2, 0, 1);
    g.fillStyle = acc;
    for (let i = 0; i < hp.length; i += 3) { const [sx, sy] = toScr(hp[i][0], hp[i][1]); g.globalAlpha = 0.28 * a0 * (1 - i / hp.length); g.beginPath(); g.arc(sx, sy, 1.4, 0, 7); g.fill(); }
    g.globalAlpha = 1;
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
    g.strokeStyle = 'rgba(239,232,218,.2)'; g.lineWidth = 1; g.beginPath(); g.moveTo(A.sx, A.sy); g.lineTo(A.cx, A.cy); g.stroke();
    g.strokeStyle = 'rgba(239,232,218,.45)'; g.beginPath(); g.arc(A.cx, A.cy, 14, 0, 7); g.stroke();
    }
  }
  // trick labels drift up slowly and fade
  g.font = '500 15px "IBM Plex Mono", ui-monospace, monospace'; g.textAlign = 'center';
  for (const l of S.labels) {
    if (l.age < 0) continue;
    const [sx, sy] = toScr(l.x, l.y), a = l.age < 0.2 ? l.age / 0.2 : 1 - Math.max(0, l.age - 1.1) / 0.7;
    g.fillStyle = `rgba(255,211,110,${a})`; g.fillText(l.text, sx, sy - 26 - l.slot * 22 - Math.min(l.age, 0.5) * 22);
  }
  if (CLIP) { g.font = '400 12px "IBM Plex Mono", ui-monospace, monospace'; g.fillStyle = 'rgba(239,232,218,.6)'; g.fillText('areabake.com/phone', cssW / 2, cssH - 26); }
  g.textAlign = 'start';
}

/* ======================= input ======================= */
let pointer = null;
const CANCEL_R = 34;
cvs.addEventListener('contextmenu', e => e.preventDefault());
// Gestures stay off the screen's edges, where the phone itself listens: swipe up for home, down for
// notifications, in from the side to go back. A touch that starts there is left alone.
const EDGE = 22;
const nearEdge = e => e.clientX < EDGE || e.clientX > innerWidth - EDGE || e.clientY > innerHeight - 34;
let lastTap = { t: -9, x: 0, y: 0 }, holdTimer = 0;
cvs.addEventListener('pointerdown', e => {
  Sound.wake();
  if (nearEdge(e)) return;
  if (S.won) { if (S.time - S.wonAt > 1.2 && !S.replay) next(); return; }
  // a second finger while aiming cancels the throw
  if (pointer !== null) { if (S.aim) S.band = { x: pullOffset(S.aim)[0], y: pullOffset(S.aim)[1], vx: 0, vy: 0 }; S.aim = null; pointer = null; buzz(6); return; }
  if (S.replay) return;
  releaseTitle();
  cvs.setPointerCapture(e.pointerId);
  pointer = e.pointerId;
  S.aim = { sx: e.clientX, sy: e.clientY, cx: e.clientX, cy: e.clientY, v: [0, 0], path: [], cancel: true, moved: false, t0: performance.now() };
  // a finger held still while a comet flies speeds time up until it lifts
  clearTimeout(holdTimer);
  if (S.comets.length) holdTimer = setTimeout(() => { if (S.aim && !S.aim.moved) { S.hold = true; buzz(6); } }, 220);
});
cvs.addEventListener('pointermove', e => {
  if (e.pointerId !== pointer || !S.aim) return;
  const A = S.aim; A.cx = e.clientX; A.cy = e.clientY;
  const was = A.cancel; A.cancel = Math.hypot(A.cx - A.sx, A.cy - A.sy) < CANCEL_R;
  if (S.hold) { A.cancel = true; return; }
  if (!A.cancel) A.moved = true; else if (!was && A.moved) buzz(6);
  // a drag of about 40% of the arena height is full power; pulling back throws forward
  const k = 0.55 / G.s;
  let px = -(A.cx - A.sx) * k, py = (A.cy - A.sy) * k;
  const l = Math.hypot(px, py); if (l > PULL) { px *= PULL / l; py *= PULL / l; }
  A.v = [px * SPEED, py * SPEED]; A.path = preview(A.v[0], A.v[1]);
});
const release = e => {
  if (e.pointerId !== pointer) return;
  pointer = null; const A = S.aim; S.aim = null; clearTimeout(holdTimer);
  if (S.hold) { S.hold = false; return; }
  // two quick taps in about the same place start the level again
  if (A && !A.moved && e.type === 'pointerup' && performance.now() - A.t0 < 300) {
    const now = performance.now();
    if (now - lastTap.t < 380 && Math.hypot(A.sx - lastTap.x, A.sy - lastTap.y) < 60) { lastTap.t = -9; restart(); return; }
    lastTap = { t: now, x: A.sx, y: A.sy };
  }
  if (A && !A.cancel) { const o = pullOffset(A); S.band = { x: o[0], y: o[1], vx: 0, vy: 0 }; }
  if (A && e.type === 'pointerup' && !A.cancel && Math.hypot(A.v[0], A.v[1]) > 0.06) fire(A.v[0], A.v[1]);
};
cvs.addEventListener('pointerup', release); cvs.addEventListener('pointercancel', release);
document.addEventListener('gesturestart', e => e.preventDefault());
window.addEventListener('keydown', e => {
  if (e.key === 'r' || e.key === 'R') restart();
  if (e.key === 'n' || e.key === 'N') next();
  if (e.key === ' ') { e.preventDefault(); if (!e.repeat) S.hold = true; }
});
window.addEventListener('keyup', e => { if (e.key === ' ') S.hold = false; });

/* ======================= buttons and sheets ======================= */
const next = () => {
  if (S.replay) load(S.idx);
  else if (world().daily) load(Math.min(store.last || 0, DAILY0 - 1));
  else load(S.idx + 1 >= ALL.length || isDaily(S.idx + 1) ? 0 : S.idx + 1);
};
// restart rewinds: leapfrog is time-reversible, so running a flight backward is just its own trail in reverse
function restart() {
  const tr = S.comets.filter(c => c.trail && c.trail.length > 8).map(c => c.trail.slice());
  if (!tr.length || REDUCED || S.won) { load(S.idx); return; }
  S.rewind = { tr, t0: S.time }; S.aim = null;
  Sound.tone(523.25, 0.3, 'sine', 0.03); Sound.tone(392, 0.3, 'sine', 0.03, 0.12);
}
$('#skipBtn').onclick = () => { store.skipped = [...new Set([...(store.skipped || []), level().gid])]; save(); $('#menu').hidden = true; next(); };
$('#menuBtn').onclick = () => { buildMenu(); $('#menu').hidden = false; };
$('#closeMenu').onclick = () => $('#menu').hidden = true;
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
  const hr = $('#hintRow'); hr.replaceChildren();
  [[true, 'On'], [false, 'Off']].forEach(([id, name]) => { const b = document.createElement('button'); b.type = 'button'; b.className = 'pill'; b.textContent = name; b.setAttribute('aria-pressed', String(id === (store.hints !== false))); b.onclick = () => { store.hints = id; save(); buildMenu(); }; hr.append(b); });
  $('#skipBtn').disabled = S.won || !!S.replay;
  const r = $('#soundRow'); r.replaceChildren();
  [[true, 'On'], [false, 'Off']].forEach(([id, name]) => { const b = document.createElement('button'); b.type = 'button'; b.className = 'pill'; b.textContent = name; b.setAttribute('aria-pressed', String(id === Sound.on)); b.onclick = () => { Sound.on = store.sound = id; save(); if (id) Sound.wake(); buildMenu(); }; r.append(b); });
}

/* ======================= replays ======================= */
// A replay is the level plus the throws: on which step each was made and how hard.
const b36 = n => (n < 0 ? '-' : '') + Math.abs(n).toString(36);
// Links name the level by id and fingerprint rather than position, so adding levels never breaks them.
const KCODE = ['n', 's', 'b', 'h'];
function replayCode() {
  const L = level();
  return `${L.gid}~${fp(L)}.` + S.throws.map(([t, vx, vy, kind, act]) => {
    const a = [t, Math.round(vx * 1e5), Math.round(vy * 1e5)];
    if (kind && kind !== 'n') a.push(KCODE.indexOf(kind), act == null ? -1 : act);
    return a.map(b36).join('.');
  }).join('_');
}
function parseReplay(code) {
  const cut = code.indexOf('.'), head = code.slice(0, cut);
  let idx;
  if (head.includes('~')) {
    const [gid, f] = head.split('~'); idx = ALL.findIndex(L => L.gid === gid);
    if (idx < 0) return null;
    if (fp(ALL[idx]) !== f) return { idx, throws: [] };
  } else { idx = parseInt(head, 10); if (!(idx >= 0 && idx < ALL.length)) return null; }
  const throws = code.slice(cut + 1).split('_').map(s => s.split('.').map(v => parseInt(v, 36))).filter(a => (a.length === 3 || a.length === 5) && a.every(Number.isFinite))
    .map(([t, x, y, k, act]) => k == null ? [t, x / 1e5, y / 1e5] : [t, x / 1e5, y / 1e5, KCODE[k] || 'n', act]);
  return { idx, throws };
}
$('#shareBtn').onclick = async () => {
  const base = ON_SITE ? location.origin + '/phone' : 'https://areabake.com/phone';
  const url = `${base}#r=${replayCode()}`, L = level();
  const text = `Slingshot, ${world().daily ? "today's sky" : world().name} ${L.li + 1}: ${'★'.repeat(stars())} ${S.score.toLocaleString('en-US')} points. Watch my throw:`;
  try { if (navigator.share) { await navigator.share({ title: 'Slingshot', text, url }); return; } } catch (e) { if (e && e.name === 'AbortError') return; }
  try { await navigator.clipboard.writeText(`${text} ${url}`); toast('Link copied', 2500); } catch (e) { toast(url); }
};

/* ======================= highlight reels ======================= */
// Not a screen recording: the run is replayed from its throws (bit for bit, so every shot is what really
// happened), and a small director cuts it like a sports highlight. First a silent pass finds the moments:
// the winning throw, each plate it rings, its close passes, the win. Then the film: the level's starlight
// title, a jump to the winning throw, slow motion and a push-in on every hit, a lean-in on close passes,
// quiet stretches run fast, and a pull-back over the gold path for the win. Sound is synthesized offline
// to the same timeline. Everything renders here on the device; nothing is uploaded.
let muxer = null;
function loadMuxer() {
  if (window.Mp4Muxer) return Promise.resolve(window.Mp4Muxer);
  return muxer || (muxer = new Promise((ok, no) => {
    const sc = document.createElement('script'); sc.src = 'https://cdn.jsdelivr.net/npm/mp4-muxer@5.1.3/build/mp4-muxer.min.js';
    sc.onload = () => ok(window.Mp4Muxer); sc.onerror = () => { muxer = null; no(new Error('load')); }; document.head.append(sc);
  }));
}
// the silent pass: where are the moments, in physics steps?
function scanRun(L, throws) {
  const W = makeWorld(L), ev = { hits: [], passes: [], tf: throws.length ? throws[throws.length - 1][0] : 0, tw: -1 }, last = { t: -1e9 };
  const H = {
    hit: (c, i) => ev.hits.push({ tick: W.tick, i }),
    track: c => {
      for (let k = 0; k < L.bodies.length; k++) {
        const b = L.bodies[k]; if (isMoon(b)) continue;
        const dx = W.P[k][0] - c.x, dy = W.P[k][1] - c.y;
        if (dx * dx + dy * dy < (b.r * 1.7) ** 2 && Math.hypot(c.vx, c.vy) > 0.7 && W.tick - last.t > 900) { last.t = W.tick; ev.passes.push({ tick: W.tick, x: (c.x + W.P[k][0]) / 2, y: (c.y + W.P[k][1]) / 2 }); }
      }
    },
  };
  const end = ev.tf + 600 * 90;
  while (W.tick < end && !W.won) {
    for (const q of throws) if (q[0] === W.tick) { for (const c of W.comets) c.alive = false; W.comets.push(newComet(W, q[1], q[2], 'n')); }
    P_step(W, H);
    if (W.tick > ev.tf && !W.comets.some(c => c.alive)) break;
  }
  if (W.won) ev.tw = W.tick;
  ev.hits = ev.hits.filter(h => h.tick >= ev.tf); ev.passes = ev.passes.filter(p => p.tick >= ev.tf);
  return ev;
}
const P_step = step;
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
  const chunks = []; let failed = null;
  const enc = new VideoEncoder({ output: (ch, meta) => chunks.push([ch, meta]), error: e => failed = e });
  enc.configure(cfg);
  const L0 = level(), throws = S.throws.map(q => q.slice()), ev = scanRun(L0, throws);
  if (ev.tw < 0) { enc.close(); toast('Could not rebuild this run.', 3000); return; }
  // set the game aside, render the reel at film size, then put everything back
  const keep = { S: { ...S }, DPR, W, H, cssW, cssH, G, V };
  CLIP = true; Sound.rec = { list: [], at: 0 };
  DPR = 2; cssW = vw / 2; cssH = vh / 2; W = vw; H = vh; cvs.width = fx.width = W; cvs.height = fx.height = H; geom();
  const out = document.createElement('canvas'); out.width = vw; out.height = vh; const oc = out.getContext('2d');
  S.time = 0;
  load(keep.S.idx, { throws: throws.map(q => q.slice()) });
  const btn = $('#clipBtn'); btn.disabled = true;
  const box = levelBox(L0), fitZ = bx => { const hw = (cssW / 2 - 8) / G.s, hh = (cssH / 2 - 60) / G.s; return clamp(Math.min(hw / Math.max(-bx[0], bx[1]), hh / Math.max(-bx[2], bx[3])), 0.22, 1.2); };
  let rate = 1, f = 0, bars = 0, jumped = ev.tf < 120;
  const frame = async (extra) => {
    S.hitStop = 0;
    renderGL(); draw();
    oc.drawImage(cvs, 0, 0); oc.drawImage(fx, 0, 0);
    // letterbox bars slide in for the slow-motion moments; a soft vignette throughout
    if (bars > 0.01) { oc.fillStyle = '#000'; const bh = vh * 0.075 * bars; oc.fillRect(0, 0, vw, bh); oc.fillRect(0, vh - bh, vw, bh); }
    const vg = oc.createRadialGradient(vw / 2, vh / 2, vh * 0.3, vw / 2, vh / 2, vh * 0.75); vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,.45)');
    oc.fillStyle = vg; oc.fillRect(0, 0, vw, vh);
    if (extra) extra(oc);
    oc.font = '400 24px "IBM Plex Mono", ui-monospace, monospace'; oc.textAlign = 'center'; oc.fillStyle = 'rgba(239,232,218,.55)'; oc.fillText('areabake.com/phone', vw / 2, vh - 52);
    const vf = new VideoFrame(out, { timestamp: Math.round(f * 1e6 / fps), duration: Math.round(1e6 / fps) });
    enc.encode(vf, { keyFrame: f % 120 === 0 }); vf.close(); f++;
    Sound.rec.at = f / fps;
    while (enc.encodeQueueSize > 4) await new Promise(r => setTimeout(r, 2));
    if (f % 20 === 0) { toast(`Cutting your highlight reel ${Math.min(99, Math.round(S.tick / Math.max(1, ev.tw) * 100))}%`); await new Promise(r => setTimeout(r, 0)); }
  };
  const advance = (simDt) => { S.time += simDt; simulate(simDt); stepCamera(1 / fps); };
  try {
    // 1. the opening: the title in starlight over a wide view of the whole system
    S.camShot = { z: Math.min(1, fitZ(box) * 0.92), x: 0, y: 0 }; S.cam.z = S.camShot.z;
    // the clock holds while the name writes itself, then lets it fall into the level's wells
    for (let k = 0; k < fps * 2.4 && !failed; k++) { S.time += 1 / fps; stepTitle(1 / fps); stepCamera(1 / fps); await frame(); }
    releaseTitle();
    // 2. straight to the winning throw
    if (!jumped && S.tick < ev.tf - 240) { const n0 = Sound.rec.list.length; while (S.tick < ev.tf - 240) { S.time += 0.25; simulate(0.25); } Sound.rec.list.length = n0; S.sparks = []; S.dust = []; S.labels = []; S.waves = []; }
    // 3. the flight, directed
    let wonF = -1;
    for (let k = 0; k < fps * 40 && !failed; k++) {
      const tt = S.tick, hit = ev.hits.find(h => Math.abs(h.tick - tt) < 270), pass = ev.passes.find(p => Math.abs(p.tick - tt) < 300);
      const nextEv = [...ev.hits.map(h => h.tick), ...ev.passes.map(p => p.tick), ev.tw].filter(x => x > tt).sort((a, b) => a - b)[0] ?? 1e9;
      const prevEv = [ev.tf, ...ev.hits.map(h => h.tick), ...ev.passes.map(p => p.tick)].filter(x => x <= tt).sort((a, b) => b - a)[0] ?? ev.tf;
      let want = 1, shot = null;
      if (S.won) { want = 0.3; shot = null; }
      else if (hit) { want = 0.28; const T = L0.targets[hit.i]; shot = { z: 1.55, x: T[0] * 0.85, y: T[1] * 0.85 }; }
      else if (pass) { want = 0.5; shot = { z: 1.25, x: pass.x * 0.7, y: pass.y * 0.7 }; }
      else if (nextEv - tt > 1500 && tt - prevEv > 900) want = 3.2;
      rate += (want - rate) * 0.12; bars += ((hit || pass ? 1 : 0) - bars) * 0.08;
      S.camShot = shot;
      if (S.won && wonF < 0) wonF = f;
      if (S.won && f - wonF > fps * 1.2) break;
      advance(rate / fps); await frame();
    }
    // 4. the win: pull back over the gold path as the constellation draws, then the card
    const gb = S.gold ? S.gold.reduce((b, p) => [Math.min(b[0], p[0]), Math.max(b[1], p[0]), Math.min(b[2], p[1]), Math.max(b[3], p[1])], [...box]) : box;
    S.camShot = { z: fitZ(gb) * 0.95, x: 0, y: 0 };
    for (let k = 0; k < fps * 3.2 && !failed; k++) {
      bars += (0 - bars) * 0.08; advance(0.35 / fps);
      const fade = clamp((k - fps * 2.7) / (fps * 0.5), 0, 1);
      await frame(c => {
        const a = clamp((k - fps * 0.9) / (fps * 0.6), 0, 1);
        c.textAlign = 'center'; c.fillStyle = `rgba(239,232,218,${0.85 * a})`; c.font = '300 italic 84px "Cormorant Garamond", serif';
        c.fillText(L0.name, vw / 2, vh * 0.8);
        c.font = '500 22px "IBM Plex Mono", monospace'; c.fillStyle = `rgba(155,152,170,${a})`;
        c.fillText(`${world().daily ? "TODAY'S SKY" : world().name.toUpperCase()} · ${L0.li + 1}`.split('').join(' '), vw / 2, vh * 0.8 + 56);
        if (fade) { c.fillStyle = `rgba(0,0,0,${fade})`; c.fillRect(0, 0, vw, vh); }
      });
    }
    if (!failed) await enc.flush();
  } finally {
    try { enc.close(); } catch (e) {}
    const rec = Sound.rec; Sound.rec = null; CLIP = false; btn.disabled = false;
    Object.assign(S, keep.S); DPR = keep.DPR; W = keep.W; H = keep.H; cssW = keep.cssW; cssH = keep.cssH; G = keep.G; V = keep.V;
    cvs.width = fx.width = W; cvs.height = fx.height = H; resize();
    last = performance.now();
    makeClip.rec = rec;
  }
  if (failed) { toast('The video encoder stopped. Try again.', 3500); return; }
  // the soundtrack: every noted sound, plus a low two-note drone, rendered offline and encoded as AAC where the device can
  const dur = f / fps, audio = await renderReelAudio(makeClip.rec.list, dur);
  // AAC where the device has it, Opus otherwise (both play inside an MP4); silent only if neither can encode
  let aCfg = null, aKind = null;
  if ('AudioEncoder' in window && audio) for (const [codec, k] of [['mp4a.40.2', 'aac'], ['opus', 'opus']]) {
    const c = { codec, sampleRate: 48000, numberOfChannels: 2, bitrate: 128000 };
    try { if ((await AudioEncoder.isConfigSupported(c)).supported) { aCfg = c; aKind = k; break; } } catch (e) {}
  }
  const aOK = !!aCfg;
  const mux = new M.Muxer({ target: new M.ArrayBufferTarget(), video: { codec: kind, width: vw, height: vh, frameRate: fps },
    ...(aOK ? { audio: { codec: aKind, numberOfChannels: 2, sampleRate: 48000 } } : {}), fastStart: 'in-memory' });
  for (const [ch, meta] of chunks) mux.addVideoChunk(ch, meta);
  if (aOK) {
    const aenc = new AudioEncoder({ output: (ch, meta) => mux.addAudioChunk(ch, meta), error: () => {} });
    aenc.configure(aCfg);
    const L = audio.getChannelData(0), R = audio.getChannelData(1), n = 1024;
    for (let i = 0; i < audio.length; i += n) {
      const m = Math.min(n, audio.length - i), buf = new Float32Array(m * 2); buf.set(L.subarray(i, i + m), 0); buf.set(R.subarray(i, i + m), m);
      const ad = new AudioData({ format: 'f32-planar', sampleRate: 48000, numberOfFrames: m, numberOfChannels: 2, timestamp: Math.round(i / 48000 * 1e6), data: buf });
      aenc.encode(ad); ad.close();
    }
    await aenc.flush(); aenc.close();
  }
  mux.finalize();
  const L = level(), name = `slingshot-${world().id}-${L.li + 1}.mp4`, blob = new Blob([mux.target.buffer], { type: 'video/mp4' });
  const file = new File([blob], name, { type: 'video/mp4' });
  // sharing needs a fresh tap, so the finished reel waits behind one
  const t = toast('Your highlight reel is ready. <button type="button">Share or save</button>');
  t.querySelector('button').onclick = () => shareFile(file, blob, name);
}
async function renderReelAudio(list, dur) {
  if (!window.OfflineAudioContext) return null;
  try {
    const oac = new OfflineAudioContext(2, Math.ceil(dur * 48000), 48000), saved = Sound.ctx, on = Sound.on, mute = Sound.mute;
    Sound.ctx = oac; Sound.on = true; Sound.mute = false;
    for (const [kind, args, at] of list) { if (kind === 'tone') Sound.tone(args[0], args[1], args[2], args[3], at); else Sound.whoosh(args[0], at); }
    // a drone on the world's two notes, a fifth apart, swelling in and out over the whole reel
    for (const fq of [110, 164.81]) {
      const o = oac.createOscillator(), g = oac.createGain(); o.type = 'sine'; o.frequency.value = fq;
      g.gain.setValueAtTime(0, 0); g.gain.linearRampToValueAtTime(0.022, 1.5); g.gain.setValueAtTime(0.022, Math.max(1.6, dur - 1.2)); g.gain.linearRampToValueAtTime(0, dur);
      o.connect(g).connect(oac.destination); o.start(0); o.stop(dur);
    }
    Sound.ctx = saved; Sound.on = on; Sound.mute = mute;
    return await oac.startRendering();
  } catch (e) { return null; }
}
// where video can't be made, the finished sky as a picture instead
function stillShot() {
  renderGL(); draw();
  const out = document.createElement('canvas'); out.width = W; out.height = H; const oc = out.getContext('2d');
  oc.drawImage(cvs, 0, 0); oc.drawImage(fx, 0, 0);
  oc.font = `400 ${12 * DPR}px "IBM Plex Mono", ui-monospace, monospace`; oc.textAlign = 'center'; oc.fillStyle = 'rgba(239,232,218,.6)';
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
  if (S.rewind) { renderGL(); draw(); if (S.time - S.rewind.t0 > 0.5) { S.rewind = null; load(S.idx); } return; }
  simulate(dt); renderGL(); draw();
  const hc = !S.won && S.comets[0];
  Sound.hum(hc && S.ffK < 2 ? Math.hypot(hc.vx, hc.vy) : 0);
  if (S.won && $('#winbar').hidden && S.time - S.wonAt > 1.1) {
    $('#winbar').hidden = !!S.replay;
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
