<script>
'use strict';
// one source, two games: 'night' is Slingshot in Morphogen's Specimen colors under a real night sky;
// 'toy' is the bright, playful one, built on the same physics
const THEME = /*THEME*/'night', TOY = THEME === 'toy';
// the Specimen palette: coral, teal, sand on cream and near-black
const PAL = { coral: '#ef7d62', teal: '#63cdb9', sand: '#e8c06e', cream: '#fff6e6', ink: '#080a11', deep: '#1f2a33' };
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
  // Bonk's drum: a struck circular membrane rings at frequencies set by the zeros of the Bessel functions,
  // f_nm / f_01 = j_nm / j_01: 1, 1.593, 2.136, 2.296, 2.653, 2.918 (not a harmonic series, hence the
  // "bonk"). Each drum kind weights those partials and decays differently; the plate's own mode is the loudest.
  bonk(kind, mode, when = 0) {
    const D = DRUMS.find(q => q.id === kind) || DRUMS[0], R = [1, 1.593, 2.136, 2.296, 2.653, 2.918];
    const f0 = D.f * Math.pow(2, ((mode || 0) % 3) / 12);
    // the strike: a quick pitch drop on the fundamental
    if (this.rec) { this.rec.list.push(['bonk', [kind, mode], this.rec.at + when]); return; }
    if (!this.on || this.mute || !this.ctx) return;
    const c = this.ctx, t = c.currentTime + when;
    const o = c.createOscillator(), gn = c.createGain(); o.type = D.wave;
    o.frequency.setValueAtTime(f0 * 1.9, t); o.frequency.exponentialRampToValueAtTime(f0, t + 0.045);
    gn.gain.setValueAtTime(0, t); gn.gain.linearRampToValueAtTime(D.g, t + 0.004); gn.gain.exponentialRampToValueAtTime(0.0001, t + D.d);
    o.connect(gn).connect(c.destination); o.start(t); o.stop(t + D.d + 0.05);
    D.p.forEach((w, k) => { if (w) this.tone(f0 * R[k + 1], D.d * (k === (mode % 5) ? 0.9 : 0.55), 'sine', D.g * w * (k === (mode % 5) ? 1.4 : 1), when); });
  },
  // a quiet chord under each level: one sine per star, heavier stars lower, on a pentatonic scale so any mix agrees
  ambient(L) {
    this.stopAmbient();
    if (!this.on || this.mute || !this.ctx || !L) return;
    const c = this.ctx, t = c.currentTime, scale = [110, 130.81, 146.83, 164.81, 196, 220, 261.63], nodes = [];
    for (const b of L.bodies) {
      const k = clamp(Math.floor((0.42 - b.m) / 0.42 * scale.length), 0, scale.length - 1), o = c.createOscillator(), g = c.createGain();
      o.type = 'sine'; o.frequency.value = scale[k] * (b.bh ? 0.5 : 1); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.006, t + 2.5);
      o.connect(g).connect(c.destination); o.start(t); nodes.push([o, g]);
    }
    this.amb = nodes;
  },
  stopAmbient() { if (!this.amb || !this.ctx) return; const t = this.ctx.currentTime; for (const [o, g] of this.amb) { g.gain.setTargetAtTime(0, t, 0.3); o.stop(t + 1.5); } this.amb = null; },
  fanfare() { [523.25, 659.25, 783.99, 1046.5, 1318.5].forEach((f, i) => { this.tone(f, 1.5, 'sine', 0.06, i * 0.1); this.tone(f / 2, 1.5, 'triangle', 0.02, i * 0.1); }); },
};
let CLIP = false;
// drums for Bonk, one per world, collected by clearing a level there (f: fundamental, p: partial weights, d: decay)
const DRUMS = [
  { id: 'wood', name: 'Wood block', world: 'w1', f: 330, wave: 'triangle', g: 0.09, d: 0.22, p: [0.3, 0.15, 0, 0, 0] },
  { id: 'tom', name: 'Tom', world: 'w2', f: 147, wave: 'sine', g: 0.12, d: 0.45, p: [0.45, 0.3, 0.2, 0.1, 0.05] },
  { id: 'glass', name: 'Glass', world: 'w7', f: 523, wave: 'sine', g: 0.06, d: 1.2, p: [0.5, 0.35, 0.3, 0.2, 0.15] },
  { id: 'steel', name: 'Steel pan', world: 'w8', f: 392, wave: 'sine', g: 0.07, d: 0.8, p: [0.6, 0, 0.4, 0, 0.25] },
  { id: 'gong', name: 'Gong', world: 'w6', f: 98, wave: 'sine', g: 0.1, d: 1.8, p: [0.5, 0.45, 0.4, 0.35, 0.3] },
];
const drumOK = d => d.world === 'w1' || Object.keys(store.best || {}).some(k => k.startsWith(d.world + '-'));
function drum() { const pick = DRUMS.find(d => d.id === store.drum); if (pick && drumOK(pick)) return pick.id; const w = DRUMS.find(d => d.world === world().id); return w && drumOK(w) ? w.id : 'wood'; }
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
// stars in the palette: light ones sand-warm, heavy ones cream-white (toy: sand to coral)
function starCol(m) { const k = clamp((m - 0.08) / 0.3, 0, 1), a = hex(TOY ? PAL.sand : PAL.sand), b = hex(TOY ? PAL.coral : PAL.cream); return a.map((v, i) => v + (b[i] - v) * k); }

/* ======================= state ======================= */
const ALL = WORLDS.flatMap((w, wi) => w.levels.map((L, li) => ({ ...L, wi, li, gid: `${w.id}-${li}`, cols: L.bodies.map(b => b.bh ? hex(PAL.sand) : b.cluster ? hex(PAL.cream) : starCol(b.m)) })));
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
// every world wears the same palette now: teal for lines and accents, coral for the haze
for (const w of WORLDS) w.theme = TOY ? { acc: '#2f8f80', neb: PAL.coral } : { acc: PAL.teal, neb: PAL.coral };
const isDaily = i => !!WORLDS[ALL[i].wi].daily;
// every world opens on its first level; inside a world, each level opens the next
function unlocked(i) { return ALL[i].li === 0 || isDaily(i) || store.best[ALL[i - 1].gid] || store.best[ALL[i].gid] || (store.skipped || []).includes(ALL[i - 1].gid); }
// one shared sky a day: everyone gets the same level on the same date, wherever they are
const DAILY = WORLDS.find(w => w.daily), DAILY0 = ALL.findIndex(L => WORLDS[L.wi].daily);
/* ---- Bonk: seasons, skies, trail paints, drums (all cosmetic, kept on this device) ---- */
function season() { const d = new Date(), m = d.getMonth() + 1, day = d.getDate(); return (m === 10 && day >= 15) || (m === 11 && day <= 5) ? 'halloween' : m === 12 ? 'winter' : m === 1 && day <= 3 ? 'newyear' : null; }
const SKIES = [
  { id: 'day', name: 'Daylight', bg0: '#fff6e6', bg1: '#d7eeea', line: '#30907f' },
  { id: 'sunset', name: 'Sunset', bg0: '#ffe2c4', bg1: '#f2a8a0', line: '#8a3f4a' },
  { id: 'candy', name: 'Candy', bg0: '#fde9f2', bg1: '#d3ebff', line: '#7a5cc9' },
  { id: 'blueprint', name: 'Blueprint', bg0: '#2c5a88', bg1: '#22466b', line: '#d5e6f6', dark: true },
  { id: 'news', name: 'Newsprint', bg0: '#f3f0e9', bg1: '#e3dfd5', line: '#3a3a3a' },
  { id: 'halloween', name: 'Halloween', bg0: '#f08a3c', bg1: '#3b2a4a', line: '#ffd9a0', dark: true, season: 'halloween' },
  { id: 'winter', name: 'Snow', bg0: '#f6f9ff', bg1: '#cfe0f2', line: '#5a7fa6', season: 'winter' },
];
const skyOK = k => k && (!k.season || k.season === season());
function SKY() { const k = SKIES.find(q => q.id === store.sky); return skyOK(k) ? k : SKIES.find(q => q.season && q.season === season()) || SKIES[0]; }
const PAINTS = [{ id: 'ribbon', name: 'Ribbon' }, { id: 'chalk', name: 'Chalk' }, { id: 'glitter', name: 'Glitter' }, { id: 'sparkler', name: 'Sparkler' }];
// Bonk's day turns at midnight UTC, so the whole world gets the new sky at the same moment
const dayNo = () => { if (TOY) return Math.floor((Date.now() - Date.UTC(2026, 9, 22)) / 864e5); const d = new Date(); return Math.floor((Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) - Date.UTC(2026, 9, 22)) / 864e5); };
const hardDay = () => TOY && new Date(Date.now()).getUTCDay() === 0;
function todayIdx() {
  if (!DAILY) return -1;
  const n = dayNo(), k = DAILY.levels.length;
  // Sundays bring a hard sky: one from the daily pool where under 3.5% of throws win
  if (hardDay()) { const hard = DAILY.levels.map((L, i) => [L, i]).filter(([L]) => L.win && L.win < 0.035); if (hard.length) return DAILY0 + hard[Math.floor(n / 7) % hard.length][1]; }
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
uniform vec4 u_dent; uniform float u_dentA; uniform float u_dpr;
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
  // a still night sky. The Milky Way is a faint tilted band with dark dust lanes; stars sit one to a cell of
  // a jittered grid, brighter ones far rarer (a steep power law, as real star counts are), each a tiny point
  // of light. Nothing here moves or twinkles, and it stays put when the camera zooms, like a distant sky.
  vec2 m = fq / (u_dpr * 420.0);
  float band = dot(m - vec2(0.45, 1.0), normalize(vec2(0.92, -0.4)));
  float mw = exp(-band * band / 0.06) * (0.55 + 0.45 * fbm(m * 3.1 + 2.3)) * (1.0 - 0.75 * smoothstep(0.5, 0.72, fbm(m * 7.3 + 9.1)));
  vec3 col = vec3(0.031, 0.039, 0.067) + mix(vec3(1.0, 0.96, 0.9), vec3(0.91, 0.75, 0.43), 0.35) * mw * 0.055;
  for (int l = 0; l < 2; l++) {
    float cs = (l == 0 ? 7.0 : 21.0) * u_dpr;
    vec2 cell = floor(fq / cs), f = fq - cell * cs;
    float h = h21(cell + float(l) * 31.7), keep = l == 0 ? 0.26 + 0.45 * mw : 0.86;
    if (h > keep) continue;
    vec2 at = vec2(h21(cell * 1.7 + 4.1), h21(cell * 2.3 + 9.2)) * (cs - 4.0 * u_dpr) + 2.0 * u_dpr;
    float mag = pow(h21(cell + 7.7 + float(l)), l == 0 ? 16.0 : 6.0), w = (0.5 + mag * 1.1) * u_dpr;
    vec3 tint = h21(cell + 3.3) > 0.75 ? vec3(0.82, 0.92, 1.0) : h21(cell + 5.5) > 0.7 ? vec3(1.0, 0.88, 0.7) : vec3(1.0, 0.97, 0.92);
    col += tint * exp(-dot(f - at, f - at) / (w * w)) * (0.05 + 1.3 * mag) * squeeze;
  }
  float phi = 0.0; vec3 light = vec3(0.0);
  // the launcher's dent drags space toward the pull; the field lines are drawn in the dragged space
  vec2 dq = p - u_dent.xy, pw = p - u_dent.zw * exp(-dot(dq, dq) / 0.05);
  for (int i = 0; i < 10; i++) {
    if (i >= u_n) break;
    vec4 b = u_b[i]; vec2 d = p - b.xy; float r = length(d);
    float rw = length(pw - b.xy);
    if (u_kind[i] > 2.5) {
      // a star cluster, a Plummer sphere: surface density (1 + R^2 / a^2)^-2, drawn as a glow and as resolved
      // stars, one chance per small cell with that probability; the potential is m / sqrt(r^2 + a^2)
      float a = b.w, sig = 1.0 / pow(1.0 + r * r / (a * a), 2.0);
      phi += b.z / sqrt(rw * rw + a * a);
      vec2 cc = floor(gl_FragCoord.xy / (3.0 * u_dpr)), ff = gl_FragCoord.xy - (cc + 0.5) * 3.0 * u_dpr;
      float pick = step(h21(cc + float(i) * 5.1), 0.55 * sig), br = 0.4 + 0.6 * h21(cc + 2.2);
      light += u_sc[i] * (sig * 0.16 + pick * br * exp(-dot(ff, ff) / (0.9 * u_dpr * u_dpr)) * 0.9);
      continue;
    }
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
    float gran = 0.86 + 0.28 * fbm(d / b.w * 6.0 + float(i) * 7.3);
    vec3 disc = sc * (1.0 - 0.62 * (1.0 - mu)) * gran * 2.4 + vec3(1.0) * pow(mu, 6.0) * 0.6;
    float halo = exp(-max(r - b.w, 0.0) / (b.w * 0.8)) * 0.6 + 0.006 * b.z / (r * r + 0.004);
    light += disc * core + sc * halo * (1.0 - core);
  }
  float v = log(phi + 0.02) * 4.5, fw = max(fwidth(v), 1e-4);
  float line = (1.0 - smoothstep(0.35, 1.35, abs(fract(v + 0.5) - 0.5) / fw)) * clamp(0.16 / fw, 0.0, 1.0);
  float dp = smoothstep(0.35, 5.5, phi);
  vec3 lc = mix(vec3(0.39, 0.8, 0.73), vec3(0.91, 0.75, 0.43), dp);
  col += lc * line * (0.07 + 0.22 * smoothstep(0.0, 2.4, log(phi + 1.0)));
  col += u_acc * 0.02 * smoothstep(0.2, 3.0, phi) + light + vec3(1.0, 0.96, 0.9) * u_flash * 0.06;
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
// The toy sky: daylight, flat and soft. Bodies are low-poly balls: each pixel's sphere normal is snapped to
// a facet (ten slices around, eight down), lit by one sun from the upper left, and casts a soft shadow onto
// the backdrop. Plates are drums seen at a tilt, a top face and a side band, and they jiggle like jelly.
const FS_TOY = `#version 300 es
precision highp float; precision highp int;
uniform vec2 u_center; uniform float u_scale, u_time, u_flash; uniform int u_n; uniform vec4 u_b[10]; uniform float u_kind[10]; uniform vec3 u_sc[10];
uniform vec3 u_acc, u_neb; uniform vec4 u_gw; uniform vec2 u_gw2;
uniform int u_tn; uniform vec4 u_tg[6]; uniform vec3 u_tcol[6]; uniform float u_tr;
uniform vec4 u_dent; uniform float u_dentA; uniform float u_dpr;
uniform float u_bw[10]; uniform vec2 u_td[6]; uniform vec3 u_bg0, u_bg1, u_line;
out vec4 o;
// a skimmed star wobbles like jelly: x and y squash out of phase (area kept), dying away as e^(-t / 0.32)
vec2 jelly(vec2 d, float t){ if (t < 0.0) return d; float w = 0.16 * exp(-t / 0.32) * sin(t * 40.0); return vec2(d.x / (1.0 + w), d.y * (1.0 + w)); }
float h21(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float besselJ(float n, float x){ float s = 0.0; for (int i = 0; i < 20; i++) { float tau = (float(i) + 0.5) * 3.14159265 / 20.0; s += cos(n * tau - x * sin(tau)); } return s / 20.0; }
vec2 chMode(float m){
  if (m < 0.5) return vec2(2.0, 8.4172); if (m < 1.5) return vec2(3.0, 9.7610); if (m < 2.5) return vec2(1.0, 7.0156);
  if (m < 3.5) return vec2(4.0, 11.0647); if (m < 4.5) return vec2(0.0, 8.6537); return vec2(5.0, 12.2251);
}
const vec3 SUN = vec3(-0.55, 0.62, 0.56);
// a faceted ball: the normal snapped to a facet, lit with a wrap so the dark side never goes black
vec3 ball(vec2 d, vec3 base, float facets){
  float z = sqrt(max(0.0, 1.0 - dot(d, d))), th = atan(d.y, d.x), ph = acos(clamp(z, -1.0, 1.0));
  float st = 6.2831853 / facets, sp = 1.5707963 / (facets * 0.4);
  th = (floor(th / st) + 0.5) * st; ph = (floor(ph / sp) + 0.5) * sp;
  vec3 nrm = vec3(cos(th) * sin(ph), sin(th) * sin(ph), cos(ph));
  float lam = dot(nrm, normalize(SUN)) * 0.5 + 0.5;
  return base * (0.5 + 0.62 * lam) + vec3(1.0) * pow(max(dot(nrm, normalize(SUN + vec3(0.0, 0.0, 1.0))), 0.0), 18.0) * 0.18;
}
void main(){
  vec2 p = (gl_FragCoord.xy - u_center) / u_scale, sp = gl_FragCoord.xy / (u_dpr * 900.0);
  // the backdrop: cream at the bottom into a pale teal sky, with a faint paper grain that never moves
  vec3 col = mix(u_bg0, u_bg1, smoothstep(0.0, 1.0, sp.y * 0.9 + 0.05));
  col *= 0.985 + 0.03 * h21(floor(gl_FragCoord.xy / u_dpr));
  // field lines first, drawn as thin teal contours of the potential, in the space the launcher drags
  float phi = 0.0;
  vec2 dq = p - u_dent.xy, pw = p - u_dent.zw * exp(-dot(dq, dq) / 0.05);
  for (int i = 0; i < 10; i++) {
    if (i >= u_n) break;
    vec4 b = u_b[i]; float rw = length(pw - b.xy);
    phi += u_kind[i] > 2.5 ? b.z / sqrt(rw * rw + b.w * b.w) : u_kind[i] > 1.5 ? b.z / max(rw - b.w / 2.6, 0.004) : b.z / sqrt(rw * rw + 0.0004);
  }
  float v = log(phi + 0.02) * 4.0, fw = max(fwidth(v), 1e-4);
  float line = (1.0 - smoothstep(0.3, 1.2, abs(fract(v + 0.5) - 0.5) / fw)) * clamp(0.18 / fw, 0.0, 1.0);
  col = mix(col, u_line, line * 0.28);
  // soft shadows of every body and plate, cast down and to the right
  vec2 so = vec2(0.035, -0.05);
  for (int i = 0; i < 10; i++) {
    if (i >= u_n) break;
    vec4 b = u_b[i]; if (u_kind[i] > 2.5) continue;
    float r = length(jelly(p - b.xy - so, u_bw[i])) / max(b.w, 0.02);
    col *= 1.0 - 0.16 * smoothstep(1.25, 0.6, r);
  }
  for (int i = 0; i < 6; i++) {
    if (i >= u_tn) break; vec4 T = u_tg[i]; if (T.z < 0.0) continue;
    float gone = T.w < 0.0 ? 0.0 : clamp((T.w - 0.3) / 0.9, 0.0, 1.0) * 0.5;
    col *= 1.0 - 0.13 * (1.0 - gone) * smoothstep(1.2, 0.7, length((p - T.xy - so * 0.7) / u_tr));
  }
  // bodies
  for (int i = 0; i < 10; i++) {
    if (i >= u_n) break;
    vec4 b = u_b[i]; vec2 d = jelly(p - b.xy, u_bw[i]); float r = length(d);
    if (u_kind[i] > 2.5) {
      // a star cluster: a puff of confetti stars, Plummer-distributed (density (1 + R^2/a^2)^-2)
      float a = b.w, sig = 1.0 / pow(1.0 + r * r / (a * a), 2.0);
      col = mix(col, vec3(1.0, 0.9, 0.78), sig * 0.35);
      vec2 cc = floor(gl_FragCoord.xy / (5.0 * u_dpr)), ff = gl_FragCoord.xy - (cc + 0.5) * 5.0 * u_dpr;
      float pick = step(h21(cc + float(i) * 5.1), 0.45 * sig), hh = h21(cc + 2.2);
      vec3 cf = hh < 0.33 ? vec3(0.94, 0.49, 0.38) : hh < 0.66 ? vec3(0.39, 0.8, 0.73) : vec3(0.91, 0.75, 0.43);
      col = mix(col, cf, pick * smoothstep(2.2 * u_dpr, 1.2 * u_dpr, length(ff)));
      continue;
    }
    float R = b.w; if (r > R * 1.02) continue;
    float aa = smoothstep(R, R * 0.97, r);
    vec3 base = u_kind[i] > 1.5 ? vec3(0.09, 0.1, 0.13) : u_sc[i];
    vec3 c = ball(d / R, base, u_kind[i] > 1.5 ? 12.0 : 10.0);
    // a black hole wears a thin sand ring, its photon ring, flat around it
    col = mix(col, c, aa);
  }
  for (int i = 0; i < 10; i++) {
    if (i >= u_n || u_kind[i] < 1.5 || u_kind[i] > 2.5) continue;
    float r = length(p - u_b[i].xy) / u_b[i].w;
    col = mix(col, vec3(0.91, 0.75, 0.43), smoothstep(0.06, 0.0, abs(r - 1.18)) * 0.9);
  }
  // plates: a tilted drum, top face and side band; on a hit the skin jiggles like jelly
  for (int i = 0; i < 6; i++) {
    if (i >= u_tn) break;
    vec4 T = u_tg[i]; if (T.z < 0.0) continue;
    // a rung drum stays, quieter, keeping a dent in its sand where it was struck
    float hit = T.w, gone = hit < 0.0 ? 0.0 : clamp((hit - 0.3) / 0.9, 0.0, 1.0) * 0.5;
    // jelly: a damped wobble, x and y squashing out of phase (area kept), e^(-t / 0.3) sin(2 pi 7 t)
    float wob = hit < 0.0 ? 0.0 : 0.22 * exp(-hit / 0.3) * sin(hit * 44.0);
    vec2 d = (p - T.xy) / u_tr; d.x /= 1.0 + wob; d.y *= 1.0 + wob;
    vec2 top = vec2(d.x, (d.y - 0.07) / 0.78), bot = vec2(d.x, (d.y + 0.09) / 0.78);
    float inTop = smoothstep(1.0, 0.95, length(top)), inBot = smoothstep(1.0, 0.95, length(bot)) * step(d.y, 0.07);
    vec3 hue = u_tcol[i];
    col = mix(col, hue * 0.62, max(inBot, 0.0) * (1.0 - gone));
    vec2 nk = chMode(T.z); float th = atan(top.y, top.x), rr = length(top);
    float u = besselJ(nk.x, nk.y * rr) * cos(nk.x * th);
    vec2 cell = floor(gl_FragCoord.xy / (1.6 * u_dpr));
    float shake = hit < 0.0 ? 0.0 : clamp(hit / 0.3, 0.0, 1.0), jit = (h21(cell + floor(u_time * 24.0)) - 0.5) * shake * 0.5;
    float sand = exp(-pow((u + jit) / (0.07 + 0.3 * shake), 2.0)) * step(0.35 + 0.35 * shake + 0.4 * gone, h21(cell + float(i) * 13.1));
    vec3 face = mix(hue * 1.08, vec3(1.0), 0.12) * (0.92 + 0.08 * top.y);
    face = mix(face, vec3(1.0, 0.98, 0.94), sand * 0.9);
    if (hit >= 0.0) { float dd = length(top - u_td[i]); face *= 1.0 - 0.28 * smoothstep(0.3, 0.12, dd) + 0.12 * smoothstep(0.34, 0.3, dd) * smoothstep(0.26, 0.3, dd); }
    col = mix(col, mix(face, col, gone), inTop);
    col = mix(col, hue * 0.72, smoothstep(0.07, 0.0, abs(length(top) - 0.965)) * (1.0 - gone));
  }
  // the launcher's dent: teal rings of a small well, stretched toward the pull
  if (u_dentA > 0.0) {
    vec2 qq = pw - u_dent.xy; float rr = length(qq), v2 = log(rr + 0.012) * 6.5, fw2 = max(fwidth(v2), 1e-4);
    float rings = (1.0 - smoothstep(0.3, 1.25, abs(fract(v2) - 0.5) / fw2)) * clamp(0.2 / fw2, 0.0, 1.0) * smoothstep(0.4, 0.05, length(dq));
    col = mix(col, vec3(0.19, 0.56, 0.5), rings * 0.5 * u_dentA);
  }
  col += vec3(1.0, 0.95, 0.85) * u_flash * 0.06;
  o = vec4(col, 1.0);
}`;
let prog = null, U = {};
if (gl) {
  const sh = (t, src) => { const s = gl.createShader(t); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s)); return s; };
  prog = gl.createProgram();
  gl.attachShader(prog, sh(gl.VERTEX_SHADER, `#version 300 es
  void main(){ vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2)); gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0); }`));
  gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, TOY ? FS_TOY : FS)); gl.linkProgram(prog);
  for (const n of ['u_center', 'u_scale', 'u_time', 'u_flash', 'u_n', 'u_b', 'u_kind', 'u_sc', 'u_acc', 'u_neb', 'u_gw', 'u_gw2', 'u_tn', 'u_tg', 'u_tcol', 'u_tr', 'u_dent', 'u_dentA', 'u_dpr', 'u_bw', 'u_td', 'u_bg0', 'u_bg1', 'u_line']) U[n] = gl.getUniformLocation(prog, n);
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
    if (S.near && S.time - S.near.t < 0.9 && !S.ff) { const e = Math.sin(Math.PI * (S.time - S.near.t) / 0.9); zt *= 1 + (S.near.k || 0.16) * e; xt += (S.near.x - xt) * 0.25 * e; yt += (S.near.y - yt) * 0.25 * e; }
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
  for (let i = 0; i < n; i++) { arr.set([S.P[i][0], S.P[i][1], B[i].m, B[i].cluster ? B[i].a : B[i].r], i * 4); kind[i] = B[i].cluster ? 3 : B[i].bh ? 2 : isMoon(B[i]) ? 1 : 0; col.set(L.cols[i], i * 3); }
  gl.viewport(0, 0, W, H); gl.useProgram(prog);
  gl.uniform2f(U.u_center, V.cx * DPR, H - V.cy * DPR); gl.uniform1f(U.u_scale, V.s * DPR);
  gl.uniform1f(U.u_time, S.time % 1000); gl.uniform1f(U.u_flash, S.flash); gl.uniform1f(U.u_dpr, DPR);
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
  if (TOY) {
    const bw = new Float32Array(10), td = new Float32Array(12), sky = SKY();
    for (let i = 0; i < n; i++) bw[i] = S.skim && S.skim[i] > -9 ? S.time - S.skim[i] : -1;
    for (let i = 0; i < nt; i++) { const o = S.tg[i]; if (o && o.dent) td.set(o.dent, i * 2); }
    gl.uniform1fv(U.u_bw, bw); gl.uniform2fv(U.u_td, td); gl.uniform3fv(U.u_bg0, hex(sky.bg0)); gl.uniform3fv(U.u_bg1, hex(sky.bg1)); gl.uniform3fv(U.u_line, hex(sky.line));
  }
  // the launcher's dent: where it sits, how far it is pulled (in world units), and how strongly it shows
  const off = dentOffset(), ready = !S.won && !S.replay && (S.aim || !S.comets.length);
  gl.uniform4f(U.u_dent, L.launch[0], L.launch[1], off[0] / V.s, -off[1] / V.s); gl.uniform1f(U.u_dentA, CLIP && !ready ? 0.3 : ready ? 1 : 0.35);
  gl.drawArrays(gl.TRIANGLES, 0, 3);
}

/* ======================= level flow ======================= */
const TH = [PAL.coral, PAL.teal, PAL.sand];
function load(i, replay) {
  S.idx = clamp(i, 0, ALL.length - 1);
  const L = level();
  const W = makeWorld(L);
  Object.assign(S, { W, tick: 0, acc: 0, ffK: 1, ff: false, comets: W.comets, ghosts: [], dust: [], sparks: [], waves: [], labels: [],
    got: W.got, order: [], shots: 0, score: 0, tricks: [], won: false, gold: null, aim: null, throws: [], replay: replay || null, flash: 0, hitStop: 0,
    P: W.P, Q: W.Q, band: null, rewind: null, tg: makeTargets(L), cam: { z: 1, x: 0, y: 0 }, camShot: null, near: null, puffs: [], splats: [], skim: L.bodies.map(() => -9), impossible: false });
  if (S.ghostRun && S.ghostRun.lvl !== S.idx) { if (S.ghostRun.lvl == null) S.ghostRun.lvl = S.idx; else S.ghostRun = null; }
  if (S.ghostRun) S.ghostRun.W = null;
  setView();
  if (!CLIP) {
    document.documentElement.style.setProperty('--accent', world().theme.acc);
    if (TOY) { const k = SKY(), r = document.documentElement.style; r.setProperty('--paper', k.dark ? '#fff6e6' : '#1f2a33'); r.setProperty('--accent', k.dark ? '#ffd9a0' : world().theme.acc);
      if (season() === 'halloween' && !(store.kept || []).includes('pumpkin')) { store.kept = [...(store.kept || []), 'pumpkin']; } }
    $('#lvname').textContent = `${L.li + 1}. ${L.name}`;
    $('#winbar').hidden = true; $('#toast').hidden = true; $('#menu').hidden = true;
    $('#replayTag').hidden = !replay; $('#replayTag').textContent = replay && replay.hint ? 'Hint' : 'Replay';
    if (!world().daily && !world().custom) store.last = S.idx;
    save(); hudPips();
  }
  const glide = S.glideFor === S.idx && S.glide ? S.glide : null; S.glide = null; S.glideFor = -1;
  if (TOY && !CLIP) Sound.ambient(L);
  titleCard(glide);
}
function hudPips() {
  if (CLIP) return;
  const L = level(), p = $('#pips'); p.replaceChildren();
  L.targets.forEach((_, i) => { const d = document.createElement('span'); d.className = 'pip' + (S.got[i] ? ' on' : ''); d.style.setProperty('--pc', TH[i % TH.length]); p.append(d); });
}

/* ---- the title: the level name written in starlight, then released into the level's gravity ---- */
// the level's name as a field of points, in layout coordinates (where the title is written)
const TITLE_FONT = fs => TOY ? `600 ${fs}px Fredoka, "Varela Round", system-ui, sans-serif` : `300 italic ${fs}px "Cormorant Garamond", Garamond, serif`;
function titlePoints(name) {
  const c = document.createElement('canvas'), w = Math.round(cssW), h = 160;
  c.width = w; c.height = h;
  const x = c.getContext('2d');
  let fs = TOY ? 54 : 64; x.font = TITLE_FONT(fs);
  fs = Math.min(TOY ? 58 : 70, fs * (w * 0.84) / Math.max(1, x.measureText(name).width));
  x.font = TITLE_FONT(fs); x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillStyle = '#fff';
  x.fillText(name, w / 2, h / 2);
  const d = x.getImageData(0, 0, w, h).data, pts = [];
  for (let yy = 0; yy < h; yy += 2) for (let xx = 0; xx < w; xx += 2) if (d[(yy * w + xx) * 4 + 3] > 120) pts.push([xx, yy]);
  for (let k = pts.length - 1; k > 0; k--) { const j = Math.floor(Math.random() * (k + 1)); [pts[k], pts[j]] = [pts[j], pts[k]]; }
  const cy = cssH * 0.4;
  return pts.slice(0, 720).map(([px, py]) => [(px - G.cx) / G.s, -(cy + py - h / 2 - G.cy) / G.s]);
}
function titleCard(from) {
  const L = level(), th = world().theme, tint = hex(th.acc);
  // a win in the toy game hands its drifting sand straight to the next title, so the name is already there
  const parts = from ? from.map(q => ({ x: q.tx, y: q.ty, hx: q.tx, hy: q.ty, vx: 0, vy: 0, ox: 0, oy: 0, tw: Math.random() * 6.28, sc: Math.random(), col: q.col, alive: true }))
    : titlePoints(L.name).map(([ax, ay]) => ({ x: ax, y: ay, hx: ax, hy: ay, vx: 0, vy: 0, ox: (Math.random() - 0.5) * 0.5, oy: (Math.random() - 0.5) * 0.5, tw: Math.random() * 6.28, sc: Math.random(), alive: true }));
  S.title = { parts, t0: S.time - (from ? 0.7 : 0), released: false, eyebrow: `${S.replay && !CLIP ? (S.replay.hint ? 'Hint' : 'Replay') : S.duel ? (S.duel.turn ? "Teal's turn" : "Coral's turn") : S.ghostRun ? 'Challenge' : world().custom ? 'Your sky' : world().daily ? (hardDay() && S.idx === todayIdx() ? 'Sunday · hard' : 'Today') : world().name} · ${L.li + 1}`, tint };
  if (!CLIP) document.body.classList.add('titling');
  // the face may still be loading on the very first level
  if (!from && !CLIP && document.fonts && document.fonts.status !== 'loaded') document.fonts.ready.then(() => { if (S.title && !S.title.released && S.time - S.title.t0 < 0.6) titleCard(); });
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
  // Bonk keeps only your last finished throw on screen; a new throw clears it
  if (TOY) S.ghosts = [];
  const L = level(), [x, y] = L.launch, c = newComet(S.W, vx, vy, kind);
  Object.assign(c, { trail: [[x, y]], winds: L.bodies.map(() => 0), angs: L.bodies.map(() => null), close: false, moon: false, hits: 0,
    moving: L.bodies.some(b => b.orbit), E0: energy(L.bodies, S.P, x, y, vx, vy) });
  c.born = S.time;
  S.comets.push(c);
  if (S.ghostRun && !S.replay) { const G2 = makeWorld(L), q = S.ghostRun.throw, gc = newComet(G2, q[1], q[2], 'n'); G2.comets.push(gc); S.ghostRun.W = G2; S.ghostRun.trail = []; S.ghostRun.c = gc; S.ghostRun.done = false; }
  if (!S.replay) S.throws.push(kind === 'n' ? [S.tick, vx, vy] : [S.tick, vx, vy, kind, -1]);
  S.shots++; S.ff = false; S.ffK = 1;
  S.waves.push({ x, y, age: 0, r0: 0.02, col: '239,232,218' });
  Sound.whoosh(Math.min(1, Math.hypot(vx, vy) / (PULL * SPEED))); buzz(8);
  if (!S.coached && !CLIP) { S.coached = store.coached = true; save(); }
  hudPips();
}
const HOOKS = {
  hit: (c, i) => c.grain ? onHit(c.by.grain ? c.by.by : c.by, i, c) : onHit(c, i),
  track: c => tricks(c),
  dead: c => retire(c),
};
function retire(c) {
  if (c.fate === 'crash') {
    Sound.thud(); buzz(20);
    // the toy game ends a crash in a little puff of cartoon smoke: a few round clouds that swell and thin out
    if (TOY) {
      // the ball goes flat against what it hit, x-eyed, then boings back up and fades
      const B = level().bodies; let nx = 0, ny = 1, bd = 1e9;
      B.forEach((b, k) => { const d = Math.hypot(c.x - S.P[k][0], c.y - S.P[k][1]); if (d < bd) { bd = d; nx = (c.x - S.P[k][0]) / (d || 1); ny = (c.y - S.P[k][1]) / (d || 1); } });
      S.splats.push({ x: c.x, y: c.y, nx, ny, t0: S.time, spin: c.spin || 0 });
      Sound.tone(220, 0.25, 'triangle', 0.05); Sound.tone(165, 0.3, 'sine', 0.05, 0.05); for (let k = 0; k < 7; k++) { const a = k / 7 * 6.283 + Math.random(), v = 0.12 + Math.random() * 0.18; S.puffs.push({ x: c.x, y: c.y, vx: Math.cos(a) * v + c.vx * 0.08, vy: Math.sin(a) * v + c.vy * 0.08, r: 0.02 + Math.random() * 0.02, age: 0, life: 0.7 + Math.random() * 0.4 }); } }
    else { burst(c.x, c.y, '#ffb47a', 30, 1.4); S.waves.push({ x: c.x, y: c.y, age: 0, r0: 0.04, col: '255,180,122' }); }
  }
  if (c.trail !== S.gold) { S.ghosts.push(c.trail); if (S.ghosts.length > (TOY ? 1 : 3)) S.ghosts.shift(); }
}
function burst(x, y, col, n, life = 0.6) {
  for (let i = 0; i < n; i++) { const a = Math.random() * Math.PI * 2, v = 0.2 + Math.random() * 0.7; S.sparks.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: life + Math.random() * life, age: 0, col }); }
}
function award(c, name, pts) {
  // tricks are kept as quiet bookkeeping (each pays once per level); nothing is written on screen
  const kind = name.split(' ×')[0];
  if (S.tricks.some(q => q[0].split(' ×')[0] === kind)) return;
  S.tricks.push([name, pts]); S.score += pts;
}
function stars() { const L = level(); return S.shots <= L.par ? 3 : S.shots <= L.par + 2 ? 2 : 1; }
function win(c) {
  S.won = true; S.wonAt = S.time; S.gold = c.trail; Sound.fanfare(); buzz([12, 40, 12]);
  const L = level(), parBonus = Math.max(0, L.par - S.shots + 1) * 300;
  S.score += parBonus; if (parBonus) S.tricks.push([S.shots < L.par ? 'Under par' : 'On par', parBonus]);
  L.targets.forEach(([x, y], i) => { burst(x, y, S.tg[i] ? S.tg[i].hue : TH[i % TH.length], 40); S.waves.push({ x, y, age: 0, r0: TR, col: hex(S.tg[i] ? S.tg[i].hue : TH[i % TH.length]).map(v => v * 255 | 0).join(',') }); });
  // a level where under 1% of throws win earns a badge
  S.impossible = TOY && L.win != null && L.win < 0.01 && !S.replay;
  if (S.impossible && !CLIP) { store.imp = { ...(store.imp || {}), [L.gid]: 1 }; save(); }
  // New Year: the win goes up in fireworks
  if (TOY && season() === 'newyear') for (let k = 0; k < 6; k++) { const x = (Math.random() - 0.5) * 1.4, y = 0.2 + Math.random() * 1.1; burst(x, y, TH[k % 3], 36, 1.2); }
  // pass and play: Coral throws, then Teal plays the same sky; fewer throws takes it
  if (S.duel && !S.replay && !CLIP) {
    const d = S.duel; d.n[d.turn] = S.throws.length;
    if (d.turn === 0) { d.turn = 1; setTimeout(() => toast('Pass it to Teal', 2500), 900); }
    else { const [a, b] = d.n; d.turn = 0; d.n = []; setTimeout(() => toast(`Coral ${a} · Teal ${b}${a === b ? ' · tie' : a < b ? ' · Coral takes it' : ' · Teal takes it'}`, 4500), 900); }
  }
  // the toy game: every plate's sand lifts and drifts into the next level's name, waiting to begin
  if (TOY && !S.replay && !CLIP) {
    const ni = nextIdx(), pts = titlePoints(ALL[ni].name);
    S.glide = pts.map(([tx, ty], k) => { const j = k % L.targets.length, [px, py] = L.targets[j], a = Math.random() * 6.283, r = Math.sqrt(Math.random()) * TR;
      return { sx: px + Math.cos(a) * r, sy: py + Math.sin(a) * r, tx, ty, d: 0.5 + Math.random() * 0.7, col: S.tg[j] ? S.tg[j].hue : PAL.coral }; });
    S.glideFor = ni;
  }
  if (!S.replay && !CLIP) {
    const prev = store.best[L.gid], rec = { shots: S.shots, score: S.score, stars: stars() };
    if (!prev || rec.score > prev.score) store.best[L.gid] = rec;
    store.throws = store.throws || {}; store.throws[L.gid] = S.throws;
    if (S.idx === todayIdx()) { store.days = store.days || {}; store.days[dayNo()] = Math.max(store.days[dayNo()] || 0, rec.stars); if (TOY && !S.duel) postToday(S.throws.length); }
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
      if (TOY && d < b.r * 1.9 && S.time - S.skim[k] > 0.6) S.skim[k] = S.time;
      // a fast, close pass: the camera leans in and time breathes out for a moment
      if (d < b.r * 1.7 && !S.ff && Math.hypot(c.vx, c.vy) > 0.7 && (!S.near || S.time - S.near.t > 2.5)) { S.near = { t: S.time, x: (c.x + p[0]) / 2, y: (c.y + p[1]) / 2 }; S.slow = 0.45; }
    }
    if (b.orbit && d < b.r * 4) far = false;
  }
  // E = v^2/2 + phi(x, t) only changes when the wells move (dE/dt = d phi/dt), so any gain is a true gravity assist.
  // Measured away from the moving bodies, where their own pull is not mid-swing.
  if (c.moving && far && energy(B, S.P, c.x, c.y, c.vx, c.vy) - c.E0 > 0.1) c.moon = true;
}
function onHit(c, i, grain) {
  c.hits++; S.order.push(i);
  const L = level(), [tx, ty] = L.targets[i];
  if (grain) award(c, 'Chain bonk', 400);
  targetHit(i, grain || c); S.waves.push({ x: tx, y: ty, age: 0, r0: TR, col: hex(TH[i % TH.length]).map(v => v * 255 | 0).join(',') });
  S.hitStop = 0.45; S.flash = 1; S.score += 500;
  if (TOY) Sound.bonk(drum(), S.tg[i] ? S.tg[i].mode : 0); else Sound.chime(S.order.length - 1);
  buzz(14);
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
    const gr = S.ghostRun;
    if (gr && gr.W && !gr.done) { step(gr.W, { hit() {} }); if (gr.W.tick % 6 === 0) gr.trail.push([gr.c.x, gr.c.y]); if (gr.W.won || !gr.c.alive) gr.done = true; }
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
  for (const q of S.puffs) { q.age += dt; q.x += q.vx * dt; q.y += q.vy * dt; q.vx *= 0.95; q.vy *= 0.95; }
  S.puffs = S.puffs.filter(q => q.age < q.life); S.splats = S.splats.filter(q => S.time - q.t0 < 1.3);
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
  if (TOY) return;
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
  // where it struck, for the dent it leaves in the sand; and a quick lean of the camera toward it
  let dx = (c.x - tx) / TR, dy = (c.y - ty) / TR; const dl = Math.hypot(dx, dy); if (dl > 0.7) { dx *= 0.7 / dl; dy *= 0.7 / dl; }
  o.dent = [dx, dy];
  if (TOY && !CLIP) S.near = { t: S.time, x: tx, y: ty, k: 0.26 };
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
    if (TOY && o.hit >= 0) return;
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
  if (TOY) { const pull = Math.hypot(off[0], off[1]) / 56; toyBall(g, px, py, -off[0], -off[1], pull, 9, { look: pull > 0.1 ? [-off[0] / (56 * pull), -off[1] / (56 * pull)] : lookAt(L.launch[0], L.launch[1]), wide: pull > 0.7 ? (pull - 0.7) * 2 : 0 }); return; }
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
  // slow comets glow teal, fast ones sand and then cream-white (speeds top out near 1)
  const t = clamp((v - 0.15) / 0.95, 0, 1), A = [99, 205, 185], B = [232, 192, 110], C = [255, 246, 230];
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
  if (TOY) {
    const paint = gold ? 'ribbon' : (PAINTS.find(q => q.id === store.paint) || PAINTS[0]).id;
    if (paint === 'glitter') {
      // glitter: dots of the palette scattered along the path, catching the light in turn
      for (let k = 0; k < n; k += 2) { const age = k / n, [sx, sy] = toScr(tr[k][0], tr[k][1]), tw = 0.5 + 0.5 * Math.sin(S.time * 9 + k * 1.7);
        g.fillStyle = rgba(TH[k % 3], Math.pow(age, 1.1) * (0.4 + 0.6 * tw) * fade); g.fillRect(sx - 1.4, sy - 1.4, 2.8, 2.8); }
      return;
    }
    if (paint === 'chalk') { g.setLineDash([5, 4]); g.lineCap = 'butt'; }
    // one clean tail, thickening toward the comet
    for (let k = 0; k < n - 1; k += seg) {
      const e = Math.min(n - 1, k + seg), age = k / n;
      g.strokeStyle = gold ? `rgba(214,160,60,${0.9 * fade})` : paint === 'chalk' ? `rgba(${SKY().dark ? '255,246,230' : '90,96,104'},${(0.3 + 0.5 * age) * fade})` : `rgba(239,125,98,${Math.pow(age, 1.2) * 0.85 * fade})`;
      g.lineWidth = gold ? 3 : paint === 'chalk' ? 2.4 : 1 + 3.2 * age; path(tr, k, e + 1); g.stroke();
    }
    g.setLineDash([]); g.lineCap = 'round';
    if (paint === 'sparkler' && n > 3) {
      // a sparkler: short bright sparks flicking out from the last stretch of the path
      for (let k = 0; k < 14; k++) { const q = tr[n - 1 - Math.floor(Math.random() * Math.min(n - 1, 40))], [sx, sy] = toScr(q[0], q[1]), a = Math.random() * 6.283, l = 3 + Math.random() * 6;
        g.strokeStyle = `rgba(255,${190 + Math.random() * 60 | 0},90,${0.8 * fade})`; g.lineWidth = 1; g.beginPath(); g.moveTo(sx, sy); g.lineTo(sx + Math.cos(a) * l, sy + Math.sin(a) * l); g.stroke(); }
    }
    return;
  }
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
/* ---- the Bonk ball ---- */
// A shiny ball that stretches along its motion and squashes on launch, keeping its area (length x width = 1)
// so it reads as squishy rather than growing. It spins as it rolls through space (angle += speed / radius),
// and it has a face: eyes that look toward the nearest star, blink now and then, and go wide on a near miss.
const SKINS = [
  { id: 'coral', name: 'Coral', need: 0 }, { id: 'marble', name: 'Marble', need: 2 }, { id: 'jelly', name: 'Jelly', need: 5 },
  { id: 'planet', name: 'Planet', need: 9 }, { id: 'cat', name: 'Cat', need: 14 }, { id: 'disco', name: 'Disco', need: 20 },
  { id: 'pumpkin', name: 'Pumpkin', need: 0, season: 'halloween' },
];
const cleared = () => Object.keys(store.best || {}).length;
const skinOK = k => k && (k.season ? season() === k.season || (store.kept || []).includes(k.id) : cleared() >= k.need);
const skin = () => { if (S.duel) return S.duel.turn ? 'jelly' : 'coral'; const k = SKINS.find(q => q.id === store.skin); return skinOK(k) ? k.id : (season() === 'halloween' ? 'pumpkin' : 'coral'); };
function toyBall(g, x, y, vx, vy, sp, age, o = {}) {
  const R = 7.5 * (o.scale || 1), squash = 1 - 0.35 * Math.exp(-age * 16) * Math.min(1, age * 40 + 0.2), along = (1 + 0.45 * clamp(sp, 0, 1.3)) * squash * (o.flat ? 1 / o.flat : 1), across = 1 / along;
  const a = o.dir != null ? o.dir : Math.atan2(vy, vx), sk = o.skin || skin(), spin = o.spin || 0, al = o.alpha == null ? 1 : o.alpha;
  g.save(); g.globalAlpha = al;
  g.save(); g.translate(x + 2.5, y + 3.5); g.rotate(a); g.fillStyle = 'rgba(31,42,51,.15)'; g.beginPath(); g.ellipse(0, 0, R * along, R * across, 0, 0, 7); g.fill(); g.restore();
  g.save(); g.translate(x, y); g.rotate(a); g.scale(along, across);
  const col = { coral: [PAL.coral, '#b8513c'], marble: ['#f4ecdf', '#b9ad99'], jelly: ['#7fd9c9', '#2f8f80'], planet: [PAL.sand, '#a9792a'], cat: ['#f19a6f', '#b85c3c'], disco: ['#c9cfd6', '#6b7580'], pumpkin: ['#f08a3c', '#b4521b'] }[sk];
  const gr = g.createRadialGradient(-R * 0.35, -R * 0.4, R * 0.1, 0, 0, R * 1.1); gr.addColorStop(0, '#fffaf2'); gr.addColorStop(0.45, col[0]); gr.addColorStop(1, col[1]);
  if (sk === 'jelly') g.globalAlpha = al * 0.82;
  g.fillStyle = gr; g.beginPath(); g.arc(0, 0, R, 0, 7); g.fill();
  g.globalAlpha = al;
  // the pattern turns with the spin, so you can see it roll
  g.save(); g.beginPath(); g.arc(0, 0, R, 0, 7); g.clip(); g.rotate(spin);
  if (sk === 'coral' || sk === 'cat') { g.strokeStyle = 'rgba(255,250,242,.55)'; g.lineWidth = 1.4; g.beginPath(); g.ellipse(0, 0, R * 0.98, R * 0.32, 0, 0, 7); g.stroke(); }
  if (sk === 'marble') { g.strokeStyle = 'rgba(47,143,128,.7)'; g.lineWidth = 1.6; for (let k = 0; k < 3; k++) { g.beginPath(); g.arc(R * 0.3 * Math.cos(k * 2.1), R * 0.3 * Math.sin(k * 2.1), R * (0.5 + k * 0.15), k, k + 2.2); g.stroke(); } }
  if (sk === 'jelly') { g.fillStyle = 'rgba(255,255,255,.55)'; for (let k = 0; k < 3; k++) { g.beginPath(); g.arc(R * (k - 1) * 0.42, R * 0.25 * Math.sin(k * 3), R * 0.12, 0, 7); g.fill(); } }
  if (sk === 'disco') { g.strokeStyle = 'rgba(60,66,74,.55)'; g.lineWidth = 0.7; for (let k = -3; k <= 3; k++) { g.beginPath(); g.moveTo(k * R * 0.3, -R); g.lineTo(k * R * 0.3, R); g.moveTo(-R, k * R * 0.3); g.lineTo(R, k * R * 0.3); g.stroke(); } }
  if (sk === 'pumpkin') { g.strokeStyle = 'rgba(140,60,20,.55)'; g.lineWidth = 1.1; for (const k of [-0.5, 0, 0.5]) { g.beginPath(); g.ellipse(k * R * 0.6, 0, R * 0.28, R * 0.98, 0, 0, 7); g.stroke(); } }
  g.restore();
  g.restore();
  // extras that stay upright: a ring, ears, a stem
  if (sk === 'planet') { g.strokeStyle = '#2f8f80'; g.lineWidth = 1.6; g.beginPath(); g.ellipse(x, y, R * 1.7, R * 0.5, -0.35, 0.1, Math.PI - 0.1); g.stroke(); }
  if (sk === 'cat') { g.fillStyle = col[0]; for (const sx of [-1, 1]) { g.beginPath(); g.moveTo(x + sx * R * 0.25, y - R * 0.75); g.lineTo(x + sx * R * 0.85, y - R * 1.25); g.lineTo(x + sx * R * 0.85, y - R * 0.35); g.closePath(); g.fill(); } }
  if (sk === 'pumpkin') { g.fillStyle = '#4f7a3a'; g.fillRect(x - 1, y - R * 1.25, 2.2, R * 0.45); }
  if (o.face !== false) toyFace(g, x, y, R, o);
  if (sk === 'disco' && Math.sin(S.time * 7 + x) > 0.85) { g.fillStyle = '#fff'; g.beginPath(); g.arc(x + R * 0.5, y - R * 0.5, 1.4, 0, 7); g.fill(); }
  g.restore();
}
function toyFace(g, x, y, R, o) {
  const [lx, ly] = o.look || [0, 0], wide = o.wide || 0, ex = R * 0.34, ey = -R * 0.1, er = R * (0.24 + 0.12 * wide);
  const blink = !o.dead && (S.time * 0.37 + x * 0.013) % 1 > 0.965 ? 0.12 : 1;
  for (const s of [-1, 1]) {
    const cx = x + s * ex, cy = y + ey;
    if (o.dead) { g.strokeStyle = '#1f2a33'; g.lineWidth = 1.2; g.beginPath(); g.moveTo(cx - er * 0.7, cy - er * 0.7); g.lineTo(cx + er * 0.7, cy + er * 0.7); g.moveTo(cx + er * 0.7, cy - er * 0.7); g.lineTo(cx - er * 0.7, cy + er * 0.7); g.stroke(); continue; }
    g.fillStyle = '#fffdf8'; g.beginPath(); g.ellipse(cx, cy, er, er * blink * 1.1, 0, 0, 7); g.fill();
    if (blink > 0.5) { g.fillStyle = '#1f2a33'; g.beginPath(); g.arc(cx + lx * er * 0.45, cy + ly * er * 0.45, er * (0.5 - 0.12 * wide), 0, 7); g.fill(); }
  }
  // a mouth: a small smile, an "o" on a near miss
  g.strokeStyle = '#1f2a33'; g.lineWidth = 1; g.beginPath();
  if (wide > 0.3 || o.dead) g.arc(x, y + R * 0.42, R * 0.14 * (o.dead ? 1 : 0.6 + wide * 0.5), 0, 7); else g.arc(x, y + R * 0.22, R * 0.26, 0.25 * Math.PI, 0.75 * Math.PI);
  g.stroke();
}
function roundRect(g, x, y, w, h, r) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }
// where the ball looks: toward the nearest star, in screen terms
function lookAt(x, y) {
  const L = level(); let best = null, bd = 1e9;
  L.bodies.forEach((b, k) => { const d = Math.hypot(S.P[k][0] - x, S.P[k][1] - y); if (d < bd) { bd = d; best = S.P[k]; } });
  if (!best) return [0, 0];
  const dx = best[0] - x, dy = -(best[1] - y), l = Math.hypot(dx, dy) || 1; return [dx / l, dy / l];
}
function starShape(g, x, y, R, fill) {
  // a five-pointed star: vertices alternate between radius R and R * 0.42 every 36 degrees
  g.beginPath();
  for (let k = 0; k < 10; k++) { const r = k % 2 ? R * 0.42 : R, a = -Math.PI / 2 + k * Math.PI / 5; k ? g.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r) : g.moveTo(x + Math.cos(a) * r, y + Math.sin(a) * r); }
  g.closePath(); fill ? g.fill() : g.stroke();
}
function draw() {
  const g = g2, t = S.time, L = level(), acc = world().theme.acc;
  // light adds up on the night sky; the toy sky is daylight, where colors simply paint over one another
  const ADD = TOY ? 'source-over' : 'lighter', INK = TOY && !SKY().dark ? '31,42,51' : '239,232,218';
  g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, W, H); g.setTransform(DPR, 0, 0, DPR, 0, 0);
  g.lineCap = 'round'; g.lineJoin = 'round';
  g.lineWidth = 1; g.strokeStyle = `rgba(${INK},.14)`;
  if (TOY) { g.setLineDash([3, 5]); g.strokeStyle = 'rgba(31,42,51,.28)'; g.lineWidth = 1.4; }
  for (const tr of S.ghosts) { path(tr, 0, tr.length); g.stroke(); }
  g.setLineDash([]);
  // every moving body keeps to a circle; a faint trace of it lets you read the timing
  g.setLineDash([2, 7]); g.strokeStyle = `rgba(${INK},.13)`;
  for (const b of L.bodies) if (b.orbit) { const [ox, oy] = toScr(b.orbit.cx, b.orbit.cy); g.beginPath(); g.arc(ox, oy, b.orbit.R * V.s, 0, 7); g.stroke(); }
  g.setLineDash([]);
  drawTargets(g, t);
  g.globalCompositeOperation = ADD;
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
      const a = (T.released ? fade : clamp(age / 0.4, 0, 1)) * (TOY ? 1 : tw);
      const col = TOY ? rgba(p.col || (p.sc < 0.33 ? PAL.coral : p.sc < 0.66 ? '#2f8f80' : '#c99a3c'), a) : `rgba(${235 + 20 * p.sc | 0},${(225 + 30 * T.tint[1] * p.sc) | 0},${(215 + 40 * T.tint[2] * p.sc) | 0},${a})`;
      // near a black hole each grain is pulled apart along the line to it: the tidal stretch grows as 2 m / r^3
      let st = 0, ux = 0, uy = 0;
      if (T.released && BHI.length) for (const k of BHI) { const dx = S.P[k][0] - px, dy = S.P[k][1] - py, r2 = dx * dx + dy * dy, r = Math.sqrt(r2), q = 2 * L.bodies[k].m / (r2 * r) * 0.004; if (q > st) { st = q; ux = dx / r; uy = -dy / r; } }
      if (st > 0.08) { const len = Math.min(16, st * 6); g.strokeStyle = col; g.lineWidth = 1.4; g.beginPath(); g.moveTo(sx - ux * len, sy - uy * len); g.lineTo(sx + ux * len, sy + uy * len); g.stroke(); }
      else { g.fillStyle = col; const z = TOY ? 1.3 : 0.9; g.fillRect(sx - z, sy - z, 2 * z, 2 * z); }
    }
    const ta = T.released ? clamp(1 - rel / 0.6, 0, 1) : clamp(age / 0.5, 0, 1);
    if (ta > 0) {
      g.globalCompositeOperation = 'source-over'; g.textAlign = 'center';
      g.font = TOY ? '600 13px Fredoka, system-ui, sans-serif' : '500 10px "IBM Plex Mono", ui-monospace, monospace'; g.fillStyle = rgba(acc, 0.9 * ta);
      g.fillText(TOY ? T.eyebrow : T.eyebrow.toUpperCase().split('').join(' '), cssW / 2, cssH * 0.4 - 52);
      g.textAlign = 'start'; g.globalCompositeOperation = ADD;
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
    const [sx, sy] = toScr(c.x, c.y), sp = Math.hypot(c.vx, c.vy);
    if (TOY) {
      c.spin = (c.spin || 0) + sp * V.s / 7.5 * (S.frameDt || 0.016) * 0.6;
      const wide = S.near && t - S.near.t < 0.9 ? Math.sin(Math.PI * (t - S.near.t) / 0.9) : 0;
      toyBall(g, sx, sy, c.vx, -c.vy, sp, t - (c.born || 0), { spin: c.spin, look: lookAt(c.x, c.y), wide });
      continue;
    }
    const R = 16 + 10 * clamp(sp, 0, 1), grd = g.createRadialGradient(sx, sy, 0, sx, sy, R);
    grd.addColorStop(0, '#ffffff'); grd.addColorStop(0.18, spCol(sp, 0.65)); grd.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grd; g.beginPath(); g.arc(sx, sy, R, 0, 7); g.fill();
  }
  g.fillStyle = 'rgb(232,192,110)';
  for (const p of S.dust) if (!p.ion) { const [sx, sy] = toScr(p.x, p.y); g.globalAlpha = (1 - p.age / p.life) * 0.5; g.fillRect(sx - 0.9, sy - 0.9, 1.8, 1.8); }
  g.fillStyle = 'rgb(99,205,185)';
  for (const p of S.dust) if (p.ion) { const [sx, sy] = toScr(p.x, p.y); g.globalAlpha = (1 - p.age / p.life) * 0.55; g.fillRect(sx - 0.8, sy - 0.8, 1.6, 1.6); }
  for (const p of S.sparks) { const [sx, sy] = toScr(p.x, p.y); g.globalAlpha = 1 - p.age / p.life; g.fillStyle = p.col; g.beginPath(); g.arc(sx, sy, TOY ? 2.2 : 1.8, 0, 7); g.fill(); }
  g.globalAlpha = 1;
  if (TOY) for (const q of S.W.grains) if (q.alive) { const [sx, sy] = toScr(q.x, q.y); g.fillStyle = rgba(S.tg[q.from] ? S.tg[q.from].hue : PAL.sand, 0.9); g.fillRect(sx - 1.6, sy - 1.6, 3.2, 3.2); }
  // the friend's ghost: their winning throw, flying beside yours
  if (S.ghostRun && S.ghostRun.W) {
    const gr = S.ghostRun; g.setLineDash([2, 4]); g.strokeStyle = 'rgba(31,42,51,.25)'; g.lineWidth = 1.4; path(gr.trail, 0, gr.trail.length); g.stroke(); g.setLineDash([]);
    if (!gr.done) { const [sx, sy] = toScr(gr.c.x, gr.c.y); toyBall(g, sx, sy, gr.c.vx, -gr.c.vy, Math.hypot(gr.c.vx, gr.c.vy), 9 + S.time, { alpha: 0.42, skin: 'jelly', look: lookAt(gr.c.x, gr.c.y) }); }
  }
  // cartoon puffs: round clouds that swell and thin out, each with a soft shadow below
  for (const q of S.puffs) {
    const [sx, sy] = toScr(q.x, q.y), e = q.age / q.life, R = (q.r + 0.05 * Math.sqrt(e)) * V.s, a = 1 - e * e;
    g.fillStyle = `rgba(31,42,51,${0.08 * a})`; g.beginPath(); g.arc(sx + 3, sy + 4, R, 0, 7); g.fill();
    g.fillStyle = `rgba(255,250,242,${0.95 * a})`; g.beginPath(); g.arc(sx, sy, R, 0, 7); g.fill();
  }
  // the badge for an impossible clear: a tilted sticker that pops in
  if (S.won && S.impossible) {
    const k = t - S.wonAt, pop = clamp((k - 0.6) / 0.25, 0, 1), sc = pop < 1 ? 0.6 + 0.6 * pop : 1 + 0.03 * Math.sin(k * 3);
    if (pop > 0) { g.save(); g.translate(cssW / 2, 132); g.rotate(-0.12); g.scale(sc, sc); g.globalAlpha = pop;
      g.fillStyle = '#a94a33'; roundRect(g, -78, -16, 156, 38, 19); g.fill(); g.fillStyle = PAL.coral; roundRect(g, -78, -20, 156, 38, 19); g.fill();
      g.fillStyle = '#fff'; g.font = '600 17px Fredoka, system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('Impossible!', 0, -1); g.restore(); g.textBaseline = 'alphabetic'; g.textAlign = 'start'; }
  }
  for (const q of S.splats) {
    const e = S.time - q.t0, [sx, sy] = toScr(q.x, q.y), flat = e < 0.12 ? 1 + e * 14 : 1 + 0.7 * Math.exp(-(e - 0.12) * 5) * Math.cos((e - 0.12) * 22);
    toyBall(g, sx, sy, 0, 0, 0, 9, { dir: Math.atan2(-q.ny, q.nx), flat: Math.max(0.5, flat), dead: true, spin: q.spin, alpha: clamp(1 - (e - 0.8) / 0.5, 0, 1) });
  }
  // the toy win: sand drifting from the plates into the next level's name (eased, each grain on its own clock)
  if (S.glide && S.won) {
    const k = t - S.wonAt;
    for (const q of S.glide) {
      const e = clamp((k - q.d) / 1.3, 0, 1), sm = e * e * (3 - 2 * e), lift = Math.sin(sm * Math.PI) * 0.18;
      const [sx, sy] = toScr(q.sx + (q.tx - q.sx) * sm, q.sy + (q.ty - q.sy) * sm + lift);
      g.fillStyle = rgba(q.col, clamp(k / 0.3, 0, 1)); g.fillRect(sx - 1.3, sy - 1.3, 2.6, 2.6);
    }
  }
  for (const w of S.waves) {
    const [sx, sy] = toScr(w.x, w.y), e = 1 - Math.pow(1 - w.age, 3);
    g.strokeStyle = `rgba(${w.col},${(1 - w.age) * 0.7})`; g.lineWidth = 1.8; g.beginPath(); g.arc(sx, sy, (w.r0 + e * 0.34) * V.s, 0, 7); g.stroke();
  }
  g.globalCompositeOperation = 'source-over';
  // off-screen comets get an arrow at the edge
  for (const c of S.comets) {
    const [sx, sy] = toScr(c.x, c.y), m = 30;
    if (sx > m && sx < cssW - m && sy > m + 60 && sy < cssH - m) continue;
    const dx = sx - G.cx, dy = sy - G.cy, k = Math.min((dx > 0 ? cssW - m - G.cx : G.cx - m) / Math.abs(dx || 1e-6), (dy > 0 ? cssH - m - G.cy : G.cy - m - 60) / Math.abs(dy || 1e-6));
    g.save(); g.translate(G.cx + dx * k, G.cy + dy * k); g.rotate(Math.atan2(dy, dx)); g.fillStyle = TOY ? 'rgba(31,42,51,.8)' : 'rgba(255,244,226,.9)';
    g.beginPath(); g.moveTo(11, 0); g.lineTo(-6, -7); g.lineTo(-2, 0); g.lineTo(-6, 7); g.closePath(); g.fill(); g.restore();
  }
  drawLauncher(g);
  // first time only: a ghost finger showing the gesture
  if (!S.coached && !S.aim && !S.comets.length && !CLIP && (!S.title || S.title.released)) {
    const ph = (t % 2.6) / 2.6, pull = Math.sin(Math.min(1, ph / 0.7) * Math.PI / 2), fade = ph < 0.8 ? 1 : 1 - (ph - 0.8) / 0.2;
    const ox = cssW / 2, oy = cssH * 0.62, fy = oy + pull * cssH * 0.16;
    g.strokeStyle = `rgba(${INK},${0.35 * fade})`; g.setLineDash([3, 5]); g.beginPath(); g.moveTo(ox, oy); g.lineTo(ox, fy); g.stroke(); g.setLineDash([]);
    g.fillStyle = `rgba(${INK},${0.2 * fade})`; g.beginPath(); g.arc(ox, fy, 20, 0, 7); g.fill();
    g.strokeStyle = `rgba(${INK},${0.6 * fade})`; g.lineWidth = 1.5; g.beginPath(); g.arc(ox, fy, 20, 0, 7); g.stroke();
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
    g.strokeStyle = `rgba(${INK},${A.cancel && A.moved ? 0.75 : 0.22})`; g.lineWidth = 1.2;
    g.beginPath(); g.arc(A.sx, A.sy, CANCEL_R, 0, 7); g.stroke();
    if (A.cancel) {
      if (A.moved) { const q = 8; g.beginPath(); g.moveTo(A.sx - q, A.sy - q); g.lineTo(A.sx + q, A.sy + q); g.moveTo(A.sx + q, A.sy - q); g.lineTo(A.sx - q, A.sy + q); g.stroke(); }
    } else {
    g.fillStyle = acc;
    A.path.forEach((p, i) => { if (i % 4) return; const [sx, sy] = toScr(p[0], p[1]); g.globalAlpha = 1 - i / A.path.length; g.beginPath(); g.arc(sx, sy, 2, 0, 7); g.fill(); });
    g.globalAlpha = 1;
    g.strokeStyle = `rgba(${INK},.2)`; g.lineWidth = 1; g.beginPath(); g.moveTo(A.sx, A.sy); g.lineTo(A.cx, A.cy); g.stroke();
    g.strokeStyle = `rgba(${INK},.45)`; g.beginPath(); g.arc(A.cx, A.cy, 14, 0, 7); g.stroke();
    }
  }
  if (CLIP && !TOY) { g.font = '400 12px "IBM Plex Mono", ui-monospace, monospace'; g.fillStyle = `rgba(${INK},.6)`; g.fillText('areabake.com/phone', cssW / 2, cssH - 26); }
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
  Sound.wake(); if (TOY && !Sound.amb) Sound.ambient(level());
  if (nearEdge(e)) return;
  if (S.photo) { cvs.setPointerCapture(e.pointerId); S.photo.pts.set(e.pointerId, [e.clientX, e.clientY]); return; }
  if (S.edit) { editTap(e); return; }
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
  if (S.photo) { photoMove(e); return; }
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
  if (S.photo) { S.photo.pts.delete(e.pointerId); return; }
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
  if (TOY && (e.key === 'p' || e.key === 'P')) S.photo ? photoEnd() : photo();
  if (S.photo && e.key === 'Escape') photoEnd();
  if (e.key === ' ') { e.preventDefault(); if (!e.repeat) S.hold = true; }
});
window.addEventListener('keyup', e => { if (e.key === ' ') S.hold = false; });

/* ======================= buttons and sheets ======================= */
function nextIdx() {
  if (S.replay) return S.idx;
  if (S.duel && S.duel.turn === 1) return S.idx;
  if (world().daily || world().custom) return Math.min(store.last || 0, DAILY0 - 1);
  return S.idx + 1 >= ALL.length || isDaily(S.idx + 1) ? 0 : S.idx + 1;
}
const next = () => load(nextIdx());
// restart rewinds: leapfrog is time-reversible, so running a flight backward is just its own trail in reverse
function restart() {
  const tr = S.comets.filter(c => c.trail && c.trail.length > 8).map(c => c.trail.slice());
  if (!tr.length || REDUCED || S.won) { load(S.idx); return; }
  S.rewind = { tr, t0: S.time }; S.aim = null;
  Sound.tone(523.25, 0.3, 'sine', 0.03); Sound.tone(392, 0.3, 'sine', 0.03, 0.12);
}
$('#skipBtn').onclick = () => { store.skipped = [...new Set([...(store.skipped || []), level().gid])]; save(); $('#menu').hidden = true; next(); };
$('#menuBtn').onclick = () => { buildMenu(); $('#menu').hidden = false; };
$('#retryBtn').onclick = () => load(S.idx);
// Photo mode stops time where it is. One finger pans, two pinch (or the wheel zooms), and Save keeps the frame.
function photo() {
  if (!TOY || S.photo) return;
  S.photo = { pts: new Map(), cam: { ...S.cam } }; S.aim = null; S.hold = false;
  $('#menu').hidden = true; $('#toast').hidden = true; $('#winbar').dataset.was = $('#winbar').hidden ? '' : '1'; $('#winbar').hidden = true;
  const b = document.createElement('div'); b.id = 'photoBar';
  b.innerHTML = '<button type="button" class="pill" data-a="save">Save photo</button><button type="button" class="pill" data-a="done">Done</button>';
  b.onclick = e => { const a = e.target.dataset.a; if (a === 'save') photoSave(); if (a === 'done') photoEnd(); };
  document.body.append(b);
}
function photoEnd() {
  if (!S.photo) return; Object.assign(S.cam, S.photo.cam); S.photo = null; setView();
  const b = $('#photoBar'); if (b) b.remove(); if ($('#winbar').dataset.was) $('#winbar').hidden = false;
}
function photoMove(e) {
  const P = S.photo, p0 = P.pts.get(e.pointerId); if (!p0) return;
  const c = S.cam, pts = [...P.pts.values()];
  if (pts.length === 1) { c.x -= (e.clientX - p0[0]) / (G.s * c.z); c.y += (e.clientY - p0[1]) / (G.s * c.z); }
  else { const o = pts.find(q => q !== p0), d0 = Math.hypot(p0[0] - o[0], p0[1] - o[1]), d1 = Math.hypot(e.clientX - o[0], e.clientY - o[1]); if (d0 > 8) photoZoom(d1 / d0, (o[0] + e.clientX) / 2, (o[1] + e.clientY) / 2); }
  P.pts.set(e.pointerId, [e.clientX, e.clientY]);
}
// zoom about a screen point, so whatever sits under the fingers stays there
function photoZoom(f, px, py) {
  const c = S.cam, z = clamp(c.z * f, 0.2, 5), wx = (px - V.cx) / V.s, wy = (V.cy - py) / V.s;
  c.z = z; setView(); const [nx, ny] = toScr(wx, wy); c.x += (nx - px) / (G.s * z); c.y -= (ny - py) / (G.s * z); setView();
}
cvs.addEventListener('wheel', e => { if (!S.photo) return; e.preventDefault(); photoZoom(Math.exp(-e.deltaY * 0.0015), e.clientX, e.clientY); }, { passive: false });
function photoSave() {
  renderGL(); draw();
  const out = document.createElement('canvas'); out.width = W; out.height = H; const oc = out.getContext('2d');
  oc.drawImage(cvs, 0, 0); oc.drawImage(fx, 0, 0);
  out.toBlob(blob => { if (!blob) return; const name = `bonk-${world().id}-${level().li + 1}-photo.png`; shareFile(new File([blob], name, { type: 'image/png' }), blob, name); }, 'image/png');
}
$('#nextBtn').onclick = () => next();
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
    b.lastChild.textContent = (done ? '●' : `No. ${L.li + 1}`) + (sk > 1 && !TOY ? ` · ${sk} days` : '');
    // Bonk: the streak is a row of little drums, one per day in a row
    if (TOY && sk > 0) { const row = document.createElement('span'); row.className = 'drums'; row.setAttribute('aria-label', `${sk} day streak`); for (let k = 0; k < Math.min(sk, 14); k++) row.append(document.createElement('i')); b.lastChild.prepend(row); }
    b.onclick = () => { $('#menu').hidden = true; load(ti); };
    box.append(b);
  }
  let gi = 0;
  if (TOY) { buildStarMap(box); buildToyOpts(); }
  else WORLDS.forEach(w => {
    if (w.daily) return;
    const sec = document.createElement('div'), h = document.createElement('h2'), grid = document.createElement('div');
    const got = w.levels.filter((_, i) => store.best[`${w.id}-${i}`]).length;
    h.innerHTML = '<span></span><span></span>'; h.firstChild.textContent = w.name; h.lastChild.textContent = `${got} / ${w.levels.length}`;
    grid.className = 'grid'; grid.style.setProperty('--wc', w.theme.acc);
    w.levels.forEach((L, i) => {
      const idx = gi++, b = document.createElement('button'), best = store.best[`${w.id}-${i}`];
      b.type = 'button'; b.className = 'tile' + (idx === S.idx ? ' cur' : ''); b.disabled = !unlocked(idx);
      b.innerHTML = `${i + 1}<small>${best ? '●' : ''}</small>`;
      b.setAttribute('aria-label', `${w.name} level ${i + 1}, ${L.name}${best ? ', cleared' : ''}`);
      b.onclick = () => { $('#menu').hidden = true; load(idx); };
      grid.append(b);
    });
    sec.append(h, grid); box.append(sec);
  });
  const hr = $('#hintRow'); hr.replaceChildren();
  [[true, 'On'], [false, 'Off']].forEach(([id, name]) => { const b = document.createElement('button'); b.type = 'button'; b.className = 'pill'; b.textContent = name; b.setAttribute('aria-pressed', String(id === (store.hints !== false))); b.onclick = () => { store.hints = id; save(); buildMenu(); }; hr.append(b); });
  $('#skipBtn').disabled = S.won || !!S.replay;
  const r = $('#soundRow'); r.replaceChildren();
  [[true, 'On'], [false, 'Off']].forEach(([id, name]) => { const b = document.createElement('button'); b.type = 'button'; b.className = 'pill'; b.textContent = name; b.setAttribute('aria-pressed', String(id === Sound.on)); b.onclick = () => { Sound.on = store.sound = id; save(); if (id) Sound.wake(); else Sound.stopAmbient(); buildMenu(); }; r.append(b); });
}

/* ---- Bonk: today's sky, among the people this page is shared with ---- */
// Each person keeps one row at runs/<their id>: the day and their fewest throws on it. Everyone who can open the
// page reads the rows; each person writes only their own (the owner can tidy). Names are looked up when drawn.
const Board = { db: null, user: null, ready: null };
function boardInit() {
  if (Board.ready || !window.claude) return Board.ready || Promise.resolve();
  return Board.ready = Promise.all([claude.use('db'), claude.use('user')]).then(([db, user]) => { Board.db = db; Board.user = user; }).catch(() => {});
}
async function postToday(n) {
  await boardInit(); if (!Board.db || !Board.user) return;
  const id = await Board.user.id(); if (!id) return;
  const ref = Board.db.collection('runs').doc(id), day = dayNo();
  try { const cur = (await ref.get()).data(); if (cur && cur.day === day && cur.throws <= n) return; await ref.set({ day, throws: n, at: Date.now() }); } catch (e) {}
}
function boardInto(box) {
  if (todayIdx() < 0) return;
  const sec = document.createElement('div'), h = document.createElement('h2'), list = document.createElement('ol');
  h.textContent = "Today's sky, among friends"; list.className = 'board'; sec.append(h, list); box.append(sec); sec.hidden = true;
  (async () => {
    await boardInit(); if (!Board.db) return;
    let rows; try { rows = (await Board.db.collection('runs').where('day', '==', dayNo()).limit(200).get()).docs.map(d => ({ id: d.id, ...d.data() })); } catch (e) { return; }
    rows = rows.filter(r => typeof r.throws === 'number').sort((a, b) => a.throws - b.throws || a.at - b.at).slice(0, 12);
    const me = Board.user ? await Board.user.id() : null;
    if (!rows.length) { if (me) { sec.hidden = false; const li = document.createElement('li'); li.className = 'empty'; li.textContent = 'Nobody yet. Clear it first.'; list.append(li); } return; }
    const ps = Board.user ? await Board.user.profiles(rows.map(r => r.id)) : {};
    for (const r of rows) {
      const li = document.createElement('li'), a = document.createElement('span'), b = document.createElement('span');
      a.textContent = r.id === me ? 'You' : (ps[r.id] && ps[r.id].name) || 'Someone'; b.textContent = `${r.throws} throw${r.throws === 1 ? '' : 's'}`;
      if (r.id === me) li.className = 'me'; li.append(a, b); list.append(li);
    }
    sec.hidden = false;
  })();
}

/* ---- Bonk: skies you make, by hand or from a name ---- */
// Two players on one phone: Coral, then Teal, on the same sky.
function toggleDuel() { S.duel = S.duel ? null : { turn: 0, n: [] }; $('#menu').hidden = true; load(S.idx); }
// Made skies live in a world of their own that the star map leaves out.
function addCustom(L) {
  let wi = WORLDS.findIndex(w => w.custom);
  if (wi < 0) { WORLDS.push({ id: 'mine', name: 'Your sky', levels: [], custom: true, theme: { acc: '#2f8f80', neb: PAL.coral } }); wi = WORLDS.length - 1; }
  const w = WORLDS[wi], code = skyCode(L), old = ALL.findIndex(q => q.wi === wi && q.code === code);
  if (old >= 0) return old;
  w.levels.push(L);
  ALL.push({ chain: true, par: 1, ...L, wi, li: w.levels.length - 1, code, gid: `mine-${hashStr(code).toString(36)}`, cols: L.bodies.map(b => starCol(b.m)) });
  return ALL.length - 1;
}
function hashStr(t) { let h = 2166136261; for (let i = 0; i < t.length; i++) h = Math.imul(h ^ t.charCodeAt(i), 16777619); return h >>> 0; }
// A sky fits in a link of letters and digits: l (the ball), s and b (small and big stars) and t (drums), each with
// x and y in two base-36 digits on a grid of 1/250; v is the winning throw on a grid of 1/10000; the name follows a '~'.
// Every number is an integer over its grid, so a sky read back from a link is bit for bit the one that was checked.
const SK = { s: { m: 0.16, r: 0.06 }, b: { m: 0.3, r: 0.08 } }, GP = 250, GV = 1e4;
const snap = x => Math.round(x * GP) / GP, snapV = v => Math.round(v * GV) / GV;
const qn = (n, w) => clamp(n, 0, 36 ** w - 1).toString(36).padStart(w, '0');
function skyCode(L) {
  const xy = ([x, y]) => qn(Math.round(x * GP) + 300, 2) + qn(Math.round(y * GP) + 500, 2);
  let c = 'l' + xy(L.launch);
  for (const b of L.bodies) c += (b.m > 0.2 ? 'b' : 's') + xy([b.x, b.y]);
  for (const t of L.targets) c += 't' + xy(t);
  if (L.sol) c += 'v' + qn(Math.round(L.sol[0] * GV) + 20000, 3) + qn(Math.round(L.sol[1] * GV) + 20000, 3);
  return c + '~' + L.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 24);
}
function readSky(code) {
  const [body, nm = ''] = code.split('~'), L = { launch: [0, -1.25], bodies: [], targets: [], name: nm ? nm.replace(/-/g, ' ').replace(/^./, ch => ch.toUpperCase()) : 'A sky' };
  for (let i = 0; i < body.length;) {
    const k = body[i], w = k === 'v' ? 6 : 4, a = body.slice(i + 1, i + 1 + w); i += 1 + w;
    if (a.length < w || !'lsbtv'.includes(k)) return null;
    if (k === 'v') { L.sol = [(parseInt(a.slice(0, 3), 36) - 20000) / GV, (parseInt(a.slice(3), 36) - 20000) / GV]; continue; }
    const x = (parseInt(a.slice(0, 2), 36) - 300) / GP, y = (parseInt(a.slice(2, 4), 36) - 500) / GP;
    if (k === 'l') L.launch = [x, y]; else if (k === 't') L.targets.push([x, y]); else L.bodies.push({ x, y, ...SK[k] });
  }
  return L.targets.length && L.bodies.length <= 10 ? L : null;
}
// one throw in a fresh sky, start to finish, with its path sampled every 12 steps
function flyOne(L, vx, vy, maxT, trail) {
  const W = makeWorld(L), c = newComet(W, vx, vy, 'n'); W.comets.push(c);
  while (c.alive && !W.won && W.tick < maxT) { step(W, {}); if (trail && W.tick % 12 === 0) trail.push([c.x, c.y]); }
  return { won: W.won, got: W.got.filter(Boolean).length, c, ticks: W.tick };
}
// a fan of throws, aimed with the rational form of the circle so every device draws the same fan:
// direction (-2t, 1 - t^2) / (1 + t^2) sweeps from straight up to well past sideways
function fan(na, np) {
  const out = [];
  for (let i = 0; i < na; i++) { const t = -3 + 6 * i / (na - 1), d = 1 + t * t, dx = -2 * t / d, dy = (1 - t * t) / d;
    for (let j = 0; j < np; j++) { const p = 0.3 + 0.675 * (j + 1) / np; out.push([snapV(dx * p), snapV(dy * p)]); } }
  return out;
}
const breathe = () => new Promise(r => setTimeout(r, 0));
// fairness: some single throw has to bonk every drum
async function fairThrow(L) {
  if (L.sol && flyOne(L, L.sol[0], L.sol[1], 600 * 40).won) return L.sol;
  let best = [];
  const tryAll = async list => { for (let k = 0; k < list.length; k++) { const [vx, vy] = list[k], r = flyOne(L, vx, vy, 600 * 30); if (r.won) return [vx, vy]; best.push([r.got, vx, vy]); if (k % 16 === 15) await breathe(); } return null; };
  let hit = await tryAll(fan(49, 8)); if (hit) return hit;
  // then a finer fan around the throws that came closest
  best.sort((a, b) => b[0] - a[0]);
  for (const [, vx, vy] of best.slice(0, 4)) {
    const near = []; for (let i = -4; i <= 4; i++) for (let j = -4; j <= 4; j++) near.push([snapV(vx + i * 0.004), snapV(vy + j * 0.004)]);
    best = []; hit = await tryAll(near); if (hit) return hit;
  }
  return null;
}
// A sky from a name: the name seeds where the stars go; then the drums go on the path of a throw that loops,
// so the sky is fair by construction. The same name builds the same sky on every phone.
async function skyFromName(name) {
  const rnd = seeded(hashStr(name.trim().toLowerCase()));
  for (let tries = 0; tries < 30; tries++) {
    const L = { name: name.trim().slice(0, 24), launch: [snap(rnd() * 0.6 - 0.3), -1.252], bodies: [], targets: [] };
    const nb = 1 + (rnd() < 0.55 ? 1 : 0);
    for (let k = 0; k < nb; k++) { const big = rnd() < 0.5; L.bodies.push({ x: snap(rnd() * 1.2 - 0.6), y: snap(rnd() * 1.3 - 0.35), ...SK[big ? 'b' : 's'] }); }
    if (nb === 2 && Math.hypot(L.bodies[0].x - L.bodies[1].x, L.bodies[0].y - L.bodies[1].y) < 0.45) continue;
    const list = fan(25, 5), off = Math.floor(rnd() * list.length);
    for (let k = 0; k < list.length; k++) {
      const [vx, vy] = list[(k + off) % list.length], tr = [], r = flyOne({ ...L, targets: [[9, 9]] }, vx, vy, 600 * 22, tr);
      if (k % 16 === 15) await breathe();
      // keep only throws that swing all the way round a star before they end
      let turns = 0; for (const b of L.bodies) { let sum = 0, a0 = null; for (const [x, y] of tr) { const a = Math.atan2(y - b.y, x - b.x); if (a0 != null) { let d = a - a0; d -= 2 * Math.PI * Math.round(d / (2 * Math.PI)); sum += d; } a0 = a; } turns = Math.max(turns, Math.abs(sum) / (2 * Math.PI)); }
      if (turns < 1 || tr.length < 60) continue;
      const ok = ([x, y]) => Math.abs(x) < 0.95 && y > -0.95 && y < 1.55 && Math.hypot(x - L.launch[0], y - L.launch[1]) > 0.35 && L.bodies.every(b => Math.hypot(x - b.x, y - b.y) > b.r + TR + 0.06);
      const picks = [];
      for (const f of [0.3, 0.55, 0.85]) { for (let i = Math.floor(tr.length * f); i < tr.length; i++) { const q = tr[i]; if (ok(q) && picks.every(p => Math.hypot(p[0] - q[0], p[1] - q[1]) > 0.35)) { picks.push([snap(q[0]), snap(q[1])]); break; } } }
      if (picks.length < 3) continue;
      L.targets = picks; L.sol = [vx, vy];
      if (flyOne(L, vx, vy, 600 * 30).won) return L;
    }
  }
  return null;
}
async function nameSky(name) {
  if (!name.trim()) return;
  $('#menu').hidden = true; toast('Building a sky from that name');
  const L = await skyFromName(name);
  if (!L) { toast('That name would not make a fair sky. Try another.', 3000); return; }
  load(addCustom(L)); toast('', 1);
}
// The sky editor: tap to place, tap a thing again to take it away. Try it checks that one throw can win.
function openEditor() {
  $('#menu').hidden = true;
  const L0 = world().custom ? level() : null;
  S.edit = { tool: 's', L: L0 ? { name: L0.name, launch: [...L0.launch], bodies: L0.bodies.map(b => ({ ...b })), targets: L0.targets.map(t => [...t]) } : { name: 'My sky', launch: [0, -1.252], bodies: [{ x: 0, y: 0.2, ...SK.b }], targets: [] } };
  editShow();
  const bar = document.createElement('div'); bar.id = 'editBar';
  const tools = [['s', 'Star'], ['b', 'Big star'], ['t', 'Drum'], ['l', 'Ball']];
  bar.innerHTML = tools.map(([k, n]) => `<button type="button" class="pill" data-t="${k}" aria-pressed="${k === 's'}">${n}</button>`).join('') + '<button type="button" class="pill go" data-a="try">Try it</button><button type="button" class="pill" data-a="done">Close</button>';
  bar.onclick = async e => {
    const t = e.target.dataset.t, a = e.target.dataset.a;
    if (t) { S.edit.tool = t; bar.querySelectorAll('[data-t]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.t === t))); }
    if (a === 'done') editClose();
    if (a === 'try') {
      const L = S.edit.L; if (!L.targets.length) { toast('Add a drum or two first.', 2500); return; }
      e.target.disabled = true; toast('Checking that one throw can win');
      L.sol = null; const sol = await fairThrow(L); e.target.disabled = false;
      if (!sol) { toast('No single throw gets every drum yet. Move something.', 3500); return; }
      L.sol = sol; const i = addCustom({ ...L }); editClose(); load(i);
      const base = ON_SITE ? location.origin + '/bonk' : BONK_URL;
      const url = `${base}#s.${skyCode(ALL[i])}`;
      copyText(`Bonk: I made a sky. Can you clear it? ${url}`, () => toast('It is fair. Link copied.', 3000), () => { toast('It is fair. <span class="link"></span>').querySelector('.link').textContent = url; });
    }
  };
  document.body.append(bar);
}
// the draft plays as a level while it is edited, so it looks exactly like the real thing
function editShow() {
  const E = S.edit, L = E.L;
  if (E.di == null) E.di = addCustom({ name: 'draft', launch: [0, -1.252], bodies: [], targets: [[9, 9]] });
  ALL[E.di] = { ...ALL[E.di], ...L, draft: true, sol: null, cols: L.bodies.map(b => starCol(b.m)) };
  load(E.di); S.title = null; document.body.classList.remove('titling'); $('#lvname').textContent = 'Make a sky';
}
function editTap(e) {
  const E = S.edit, L = E.L, x = (e.clientX - V.cx) / V.s, y = (V.cy - e.clientY) / V.s;
  if (Math.abs(x) > 1.2 || Math.abs(y) > 2) return;
  const ti = L.targets.findIndex(t => Math.hypot(t[0] - x, t[1] - y) < TR * 1.4), bi = L.bodies.findIndex(b => Math.hypot(b.x - x, b.y - y) < b.r * 1.5);
  if (ti >= 0) L.targets.splice(ti, 1);
  else if (bi >= 0) L.bodies.splice(bi, 1);
  else if (E.tool === 'l') L.launch = [snap(x), snap(y)];
  else if (E.tool === 't') { if (L.targets.length >= 6) return toast('Six drums at most.', 2000); L.targets.push([snap(x), snap(y)]); }
  else { if (L.bodies.length >= 4) return toast('Four stars at most.', 2000); L.bodies.push({ x: snap(x), y: snap(y), ...SK[E.tool] }); }
  Sound.wake(); Sound.bonk(drum(), L.targets.length % 6);
  editShow();
}
function editClose() { const b = $('#editBar'); if (b) b.remove(); S.edit = null; load(level().draft ? Math.min(store.last || 0, DAILY0 - 1) : S.idx); }

/* ---- Bonk's menu: each world is a constellation; its levels are the stars, joined in order ---- */
function buildStarMap(box) {
  let gi = 0;
  WORLDS.forEach((w, wi) => {
    if (w.daily || w.custom) return;
    const sec = document.createElement('div'), h = document.createElement('h2'), map = document.createElement('div'), n = w.levels.length;
    const got = w.levels.filter((_, i) => store.best[`${w.id}-${i}`]).length;
    h.innerHTML = '<span></span><span></span>'; h.firstChild.textContent = w.name; h.lastChild.textContent = `${got} / ${n}`;
    map.className = 'starmap';
    // star positions: spread left to right, lifted and dropped by a seeded wave, so each world gets its own shape
    const rnd = seeded(wi * 977 + 13), pts = w.levels.map((_, i) => [7 + 86 * i / Math.max(1, n - 1), 50 + 34 * Math.sin(i * 1.7 + wi * 2.3) * (0.6 + 0.4 * rnd())]);
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); svg.setAttribute('viewBox', '0 0 100 100'); svg.setAttribute('preserveAspectRatio', 'none');
    const pl = document.createElementNS(svg.namespaceURI, 'polyline'); pl.setAttribute('points', pts.map(p => p.join(',')).join(' ')); svg.append(pl); map.append(svg);
    w.levels.forEach((L, i) => {
      const idx = gi++, b = document.createElement('button'), best = store.best[`${w.id}-${i}`];
      b.type = 'button'; b.className = 'star' + (best ? ' done' : '') + (idx === S.idx ? ' cur' : '') + (best && L.win < 0.01 ? ' imp' : '');
      b.disabled = !unlocked(idx); b.style.left = pts[i][0] + '%'; b.style.top = pts[i][1] + '%'; b.textContent = i + 1;
      b.setAttribute('aria-label', `${w.name} level ${i + 1}, ${L.name}${best ? ', cleared' : ''}${best && L.win < 0.01 ? ', impossible' : ''}`);
      b.onclick = () => { $('#menu').hidden = true; load(idx); };
      map.append(b);
    });
    sec.append(h, map); box.append(sec);
  });
}
function seeded(seed) { let s = seed >>> 0; return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
function pills(title, items, cur, pick, note) {
  const sec = document.createElement('div'), h = document.createElement('h2'), row = document.createElement('div');
  h.textContent = title; row.className = 'row';
  for (const it of items) {
    const b = document.createElement('button'); b.type = 'button'; b.className = 'pill'; b.textContent = it.name;
    b.disabled = it.ok === false; if (it.ok === false && note) b.title = note(it);
    b.setAttribute('aria-pressed', String(it.id === cur)); b.onclick = () => { pick(it.id); buildMenu(); };
    row.append(b);
  }
  sec.append(h, row); return sec;
}
function buildToyOpts() {
  const box = $('#toyOpts'); box.hidden = false; box.replaceChildren();
  const play = document.createElement('div'); play.className = 'row';
  for (const [label, fn] of [['Make a sky', () => openEditor()], [S.duel ? 'Back to one player' : 'Two players', () => toggleDuel()], ['Photo', () => photo()], ['Oops reel', () => { $('#menu').hidden = true; makeClip('oops'); }]]) { const b = document.createElement('button'); b.type = 'button'; b.className = 'pill'; b.textContent = label; b.onclick = fn; play.append(b); }
  box.append(play);
  const nm = document.createElement('form'); nm.className = 'row namesky';
  nm.innerHTML = '<input type="text" maxlength="24" placeholder="Type a name, get a sky" aria-label="Name for a new sky"><button type="submit" class="pill">Make</button>';
  nm.onsubmit = e => { e.preventDefault(); nameSky(nm.querySelector('input').value); };
  box.append(nm);
  box.append(pills('Ball', SKINS.filter(k => !k.season || skinOK(k)).map(k => ({ ...k, ok: skinOK(k) })), skin(), id => { store.skin = id; save(); }, k => `Clear ${k.need} levels`));
  box.append(pills('Drum', DRUMS.map(d => ({ ...d, ok: drumOK(d) })), drum(), id => { store.drum = id; save(); Sound.wake(); Sound.bonk(id, 0); }, () => 'Clear a level in its world'));
  box.append(pills('Sky', SKIES.filter(k => skyOK(k)), SKY().id, id => { store.sky = id; save(); load(S.idx); }));
  box.append(pills('Trail', PAINTS, (PAINTS.find(q => q.id === store.paint) || PAINTS[0]).id, id => { store.paint = id; save(); }));
  if (store.board !== false) boardInto(box);
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
// Bonk lives at its artifact link (or areabake.com/bonk once it is on the site). Its links use only the
// characters an artifact keeps in its address: '#c.' challenges you to beat a throw, '#r.' just plays it back.
const BONK_URL = 'https://claude.ai/artifact/9d6V9nGLmcLCuzgeHDEhSf';
// copying can be refused, or left hanging, inside a framed page; show the toast either way and never wait on it
function copyText(text, ok, fail) {
  let done = false; const fin = f => { if (!done) { done = true; f(); } };
  try { navigator.clipboard.writeText(text).then(() => fin(ok), () => fin(fail)); } catch (e) { fin(fail); }
  setTimeout(() => fin(fail), 1500);
}
$('#shareBtn').onclick = async () => {
  const L = level();
  if (TOY) {
    const base = ON_SITE ? location.origin + '/bonk' : BONK_URL, n = S.throws.length;
    const url = world().custom ? `${base}#s.${skyCode(L)}` : `${base}#c.${replayCode()}`;
    const where = world().custom ? `a sky called ${L.name}` : world().daily ? `today's sky, No. ${L.li + 1}` : `${world().name} ${L.li + 1}`;
    const text = `Bonk, ${where}: ${n} throw${n === 1 ? '' : 's'}. Beat it:`;
    const extras = () => { const [b1, b2] = $('#toast').querySelectorAll('button'); b1.onclick = () => shareCard(); b2.onclick = () => photo(); };
    const more = ' <button type="button">Save a card</button> <button type="button">Photo</button>';
    copyText(`${text} ${url}`, () => { toast('Challenge link copied.' + more); extras(); }, () => { toast(`<span class="link"></span>${more}`).querySelector('.link').textContent = url; extras(); });
    return;
  }
  const base = ON_SITE ? location.origin + '/phone' : 'https://areabake.com/phone';
  const url = `${base}#r=${replayCode()}`;
  const text = `Slingshot, ${world().daily ? "today's sky" : world().name} ${L.li + 1}. Watch my throw:`;
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
  const W = makeWorld(L), ev = { hits: [], passes: [], tf: throws.length ? throws[throws.length - 1][0] : 0, tw: -1, loops: 0 }, last = { t: -1e9 };
  // full turns of the winning throw around each star: the angle it sweeps, summed step by step
  const wind = L.bodies.map(() => 0), ang = L.bodies.map(() => null);
  const H = {
    hit: (c, i) => ev.hits.push({ tick: W.tick, i }),
    track: c => {
      for (let k = 0; k < L.bodies.length; k++) {
        const b = L.bodies[k]; if (isMoon(b)) continue;
        const dx = W.P[k][0] - c.x, dy = W.P[k][1] - c.y;
        if (W.tick >= ev.tf) { const a = Math.atan2(dy, dx); if (ang[k] != null) { let d = a - ang[k]; d -= 2 * Math.PI * Math.round(d / (2 * Math.PI)); wind[k] += d; } ang[k] = a; }
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
  ev.loops = Math.floor(Math.max(0, ...wind.map(Math.abs)) / (2 * Math.PI) + 0.02);
  ev.hits = ev.hits.filter(h => h.tick >= ev.tf); ev.passes = ev.passes.filter(p => p.tick >= ev.tf);
  return ev;
}
const P_step = step;
// one throw on its own from a fresh sky: where it crashed, if it did (the stars never move, so it flies the same)
function scanCrash(L, q) {
  const W = makeWorld(L), c = newComet(W, q[1], q[2], 'n'); W.comets.push(c);
  while (c.alive && W.tick < 600 * 40) P_step(W, {});
  return c.fate === 'crash' ? { tick: W.tick, x: c.x, y: c.y } : null;
}
async function makeClip(mode) {
  if (CLIP) return;
  const oops = TOY && mode === 'oops';
  const bloopers = oops ? S.throws.map(q => [q, scanCrash(level(), q)]).filter(b => b[1]).slice(-5) : [];
  if (oops && !bloopers.length) { toast('No crashes on this level yet.', 2500); return; }
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
  const L0 = level(), throws = S.throws.map(q => q.slice()), ev = oops ? null : scanRun(L0, throws);
  if (!oops && ev.tw < 0) { enc.close(); toast('Could not rebuild this run.', 3000); return; }
  const ink = TOY && !SKY().dark ? '31,42,51' : '239,232,218';
  // set the game aside, render the reel at film size, then put everything back
  const keep = { S: { ...S }, DPR, W, H, cssW, cssH, G, V };
  CLIP = true; Sound.rec = { list: [], at: 0 };
  DPR = 2; cssW = vw / 2; cssH = vh / 2; W = vw; H = vh; cvs.width = fx.width = W; cvs.height = fx.height = H; geom();
  const out = document.createElement('canvas'); out.width = vw; out.height = vh; const oc = out.getContext('2d');
  S.time = 0;
  if (!oops) load(keep.S.idx, { throws: throws.map(q => q.slice()) });
  const btn = $('#clipBtn'); btn.disabled = true;
  const box = levelBox(L0), fitZ = bx => { const hw = (cssW / 2 - 8) / G.s, hh = (cssH / 2 - 60) / G.s; return clamp(Math.min(hw / Math.max(-bx[0], bx[1]), hh / Math.max(-bx[2], bx[3])), 0.22, 1.2); };
  let rate = 1, f = 0, bars = 0, jumped = oops || ev.tf < 120;
  const frame = async (extra) => {
    S.hitStop = 0;
    renderGL(); draw();
    oc.drawImage(cvs, 0, 0); oc.drawImage(fx, 0, 0);
    // letterbox bars slide in for the slow-motion moments; a soft vignette throughout
    if (bars > 0.01) { oc.fillStyle = '#000'; const bh = vh * 0.075 * bars; oc.fillRect(0, 0, vw, bh); oc.fillRect(0, vh - bh, vw, bh); }
    const vg = oc.createRadialGradient(vw / 2, vh / 2, vh * 0.3, vw / 2, vh / 2, vh * 0.75); vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, `rgba(0,0,0,${TOY ? 0.16 : 0.45})`);
    oc.fillStyle = vg; oc.fillRect(0, 0, vw, vh);
    if (extra) extra(oc);
    oc.font = TOY ? '600 30px Fredoka, system-ui, sans-serif' : '400 24px "IBM Plex Mono", ui-monospace, monospace'; oc.textAlign = 'center'; oc.fillStyle = `rgba(${ink},.55)`; oc.fillText(TOY ? 'bonk' : 'areabake.com/phone', vw / 2, vh - 52);
    const vf = new VideoFrame(out, { timestamp: Math.round(f * 1e6 / fps), duration: Math.round(1e6 / fps) });
    enc.encode(vf, { keyFrame: f % 120 === 0 }); vf.close(); f++;
    Sound.rec.at = f / fps;
    while (enc.encodeQueueSize > 4) await new Promise(r => setTimeout(r, 2));
    if (f % 20 === 0) { toast(oops ? 'Cutting your oops reel' : `Cutting your highlight reel ${Math.min(99, Math.round(S.tick / Math.max(1, ev.tw) * 100))}%`); await new Promise(r => setTimeout(r, 0)); }
  };
  const advance = (simDt) => { S.time += simDt; simulate(simDt); stepCamera(1 / fps); };
  try {
   if (oops) {
    // the oops reel: each crash on its own, slowing right before the bump, then a beat on the splat
    for (const [q, cr] of bloopers) {
      load(keep.S.idx, { throws: [[0, q[1], q[2]]] }); S.title = null; S.camShot = null;
      for (let k = 0; k < fps * 14 && !failed; k++) {
        const near = S.tick > cr.tick - 260;
        const want = near ? 0.25 : S.tick < cr.tick - 1200 ? 2.2 : 1;
        rate += (want - rate) * 0.15; bars += ((near ? 1 : 0) - bars) * 0.1;
        S.camShot = near ? { z: 1.6, x: cr.x * 0.85, y: cr.y * 0.85 } : null;
        if (S.tick > cr.tick + 20) { for (let j = 0; j < fps * 1.1 && !failed; j++) { advance(0.6 / fps); await frame(); } break; }
        advance(rate / fps); await frame();
      }
    }
    S.camShot = { z: 1, x: 0, y: 0 };
    for (let k = 0; k < fps * 2 && !failed; k++) {
      bars += (0 - bars) * 0.08; advance(0.3 / fps);
      const a = clamp((k - fps * 0.2) / (fps * 0.5), 0, 1), fade = clamp((k - fps * 1.5) / (fps * 0.5), 0, 1);
      await frame(c => {
        c.textAlign = 'center'; c.fillStyle = `rgba(${ink},${0.9 * a})`; c.font = '600 150px Fredoka, system-ui, sans-serif'; c.fillText('oops', vw / 2, vh * 0.78);
        c.font = '500 36px Fredoka, system-ui, sans-serif'; c.fillStyle = `rgba(${ink},${0.6 * a})`; c.fillText(`${bloopers.length} bonk${bloopers.length === 1 ? '' : 's'} on ${L0.name}`, vw / 2, vh * 0.78 + 70);
        if (fade) { c.fillStyle = `rgba(0,0,0,${fade})`; c.fillRect(0, 0, vw, vh); }
      });
    }
   } else {
    // 0. the hook (Bonk): open on the winning bump in slow motion, then rewind to the start
    const fh = ev.hits.length ? ev.hits[ev.hits.length - 1] : null;
    if (TOY && fh && fh.tick - ev.tf > 600) {
      S.title = null;
      const n0 = Sound.rec.list.length; while (S.tick < fh.tick - 140) { S.time += 0.25; simulate(0.25); } Sound.rec.list.length = n0; S.sparks = []; S.dust = []; S.puffs = []; S.waves = [];
      const T = L0.targets[fh.i]; S.camShot = { z: 1.6, x: T[0] * 0.85, y: T[1] * 0.85 }; S.cam.z = 1.6; S.cam.x = S.camShot.x; S.cam.y = S.camShot.y; bars = 1;
      let wf = -1;
      for (let k = 0; k < fps * 4 && !failed; k++) { if (S.won && wf < 0) wf = k; if (wf >= 0 && k - wf > fps * 0.45) break; advance(0.3 / fps); await frame(); }
      for (let k = 0; k < fps * 0.3 && !failed; k++) await frame();
      S.won = false; S.glide = null; S.rewind = { tr: S.comets.filter(c => c.trail && c.trail.length > 8).map(c => c.trail.slice()), t0: S.time };
      Sound.tone(523.25, 0.3, 'sine', 0.03); Sound.tone(392, 0.3, 'sine', 0.03, 0.12); S.camShot = { z: Math.min(1, fitZ(box) * 0.92), x: 0, y: 0 };
      for (let k = 0; k < fps * 0.55 && !failed; k++) { S.time += 1 / fps; bars += (0 - bars) * 0.1; stepCamera(1 / fps); await frame(); }
      S.rewind = null; load(keep.S.idx, { throws: throws.map(q => q.slice()) });
    }
    // 1. the opening: the title in starlight over a wide view of the whole system
    S.camShot = { z: Math.min(1, fitZ(box) * 0.92), x: 0, y: 0 }; S.cam.z = S.camShot.z;
    // the clock holds while the name writes itself, then lets it fall into the level's wells
    for (let k = 0; k < fps * 2.4 && !failed; k++) { S.time += 1 / fps; stepTitle(1 / fps); stepCamera(1 / fps); await frame(); }
    releaseTitle();
    // 2. straight to the winning throw
    if (!jumped && S.tick < ev.tf - 240) { const n0 = Sound.rec.list.length; while (S.tick < ev.tf - 240) { S.time += 0.25; simulate(0.25); } Sound.rec.list.length = n0; S.sparks = []; S.dust = []; S.labels = []; S.waves = []; }
    // 3. the flight, directed
    let wonF = -1, held = !TOY || !fh;
    for (let k = 0; k < fps * 40 && !failed; k++) {
      // wait for it: just before the last bump, the clock stops and the camera leans in
      if (!held && S.tick >= fh.tick - 70) { held = true; S.camShot = { z: 1.75, x: L0.targets[fh.i][0] * 0.9, y: L0.targets[fh.i][1] * 0.9 }; for (let j = 0; j < fps * 0.8 && !failed; j++) { bars += (1 - bars) * 0.1; stepCamera(1 / fps); await frame(); } }
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
        c.textAlign = 'center'; c.fillStyle = `rgba(${ink},${0.85 * a})`; c.font = TOY ? '600 92px Fredoka, system-ui, sans-serif' : '300 italic 84px "Cormorant Garamond", serif';
        c.fillText(L0.name, vw / 2, vh * 0.8);
        if (TOY) {
          // the caption says what happened, in plain counts
          const n = throws.length, secs = Math.round((ev.tw - ev.tf) * DT), pl = (x, w) => `${x} ${w}${x === 1 ? '' : 's'}`;
          c.font = '500 38px Fredoka, system-ui, sans-serif'; c.fillStyle = `rgba(${ink},${0.65 * a})`;
          c.fillText([pl(n, 'throw'), ev.loops ? pl(ev.loops, 'loop') : '', pl(secs, 'second')].filter(Boolean).join(' · '), vw / 2, vh * 0.8 + 66);
        } else {
          c.font = '500 22px "IBM Plex Mono", monospace'; c.fillStyle = `rgba(155,152,170,${a})`;
          c.fillText(`${world().daily ? "TODAY'S SKY" : world().name.toUpperCase()} · ${L0.li + 1}`.split('').join(' '), vw / 2, vh * 0.8 + 56);
        }
        if (fade) { c.fillStyle = `rgba(0,0,0,${fade})`; c.fillRect(0, 0, vw, vh); }
      });
    }
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
  const L = level(), name = `${TOY ? 'bonk' : 'slingshot'}-${world().id}-${L.li + 1}${oops ? '-oops' : ''}.mp4`, blob = new Blob([mux.target.buffer], { type: 'video/mp4' });
  const file = new File([blob], name, { type: 'video/mp4' });
  // sharing needs a fresh tap, so the finished reel waits behind one
  const t = toast(`Your ${oops ? 'oops' : 'highlight'} reel is ready. <button type="button">Share or save</button>`);
  t.querySelector('button').onclick = () => shareFile(file, blob, name);
}
async function renderReelAudio(list, dur) {
  if (!window.OfflineAudioContext) return null;
  try {
    const oac = new OfflineAudioContext(2, Math.ceil(dur * 48000), 48000), saved = Sound.ctx, on = Sound.on, mute = Sound.mute;
    Sound.ctx = oac; Sound.on = true; Sound.mute = false;
    for (const [kind, args, at] of list) { if (kind === 'tone') Sound.tone(args[0], args[1], args[2], args[3], at); else if (kind === 'bonk') Sound.bonk(args[0], args[1], at); else Sound.whoosh(args[0], at); }
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
// The share card gives nothing away: no stars and no drums from the level, only the shape your winning
// path traced (scaled to fit), how many throws it took, and your streak as a row of little drums.
function shareCard() {
  const k = SKY(), cw = 1080, ch = 1350, c = document.createElement('canvas'); c.width = cw; c.height = ch; const x = c.getContext('2d');
  const gr = x.createLinearGradient(0, ch, 0, 0); gr.addColorStop(0, k.bg0); gr.addColorStop(1, k.bg1); x.fillStyle = gr; x.fillRect(0, 0, cw, ch);
  const ink = k.dark ? '#fff6e6' : '#1f2a33', L = level(), tr = S.gold || [];
  x.fillStyle = ink; x.textAlign = 'center'; x.font = '600 110px Fredoka, system-ui, sans-serif'; x.fillText('Bonk', cw / 2, 190);
  x.font = '500 40px Fredoka, system-ui, sans-serif'; x.globalAlpha = 0.7; x.fillText(world().daily ? `Today's sky · No. ${L.li + 1}` : `${world().name} · ${L.li + 1}`, cw / 2, 262); x.globalAlpha = 1;
  if (tr.length > 1) {
    let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9; for (const [a, b] of tr) { x0 = Math.min(x0, a); x1 = Math.max(x1, a); y0 = Math.min(y0, b); y1 = Math.max(y1, b); }
    const sc = Math.min(760 / Math.max(x1 - x0, 1e-3), 640 / Math.max(y1 - y0, 1e-3)), cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
    x.lineCap = 'round'; x.lineJoin = 'round'; x.strokeStyle = '#d6a03c'; x.lineWidth = 14; x.beginPath();
    tr.forEach(([a, b], i) => { const px = cw / 2 + (a - cx) * sc, py = 690 - (b - cy) * sc; i ? x.lineTo(px, py) : x.moveTo(px, py); }); x.stroke();
    const [ea, eb] = tr[tr.length - 1]; x.fillStyle = PAL.coral; x.beginPath(); x.arc(cw / 2 + (ea - cx) * sc, 690 - (eb - cy) * sc, 26, 0, 7); x.fill();
  }
  const n = S.throws.length; x.fillStyle = ink; x.font = '600 76px Fredoka, system-ui, sans-serif'; x.fillText(`${n} throw${n === 1 ? '' : 's'}`, cw / 2, 1120);
  const sk = streak(); for (let i = 0; i < Math.min(sk, 14); i++) { const px = cw / 2 + (i - (Math.min(sk, 14) - 1) / 2) * 52; x.fillStyle = ['#a94a33', '#2f8f80', '#9c6e22'][i % 3]; x.beginPath(); x.ellipse(px, 1196, 20, 15, 0, 0, 7); x.fill(); x.fillStyle = TH[i % 3]; x.beginPath(); x.ellipse(px, 1190, 20, 15, 0, 0, 7); x.fill(); }
  x.font = '500 30px Fredoka, system-ui, sans-serif'; x.globalAlpha = 0.6; x.fillStyle = ink; x.fillText(ON_SITE ? 'areabake.com/bonk' : 'areabake', cw / 2, 1290); x.globalAlpha = 1;
  c.toBlob(blob => { if (!blob) return; const name = `bonk-${world().id}-${L.li + 1}.png`; shareFile(new File([blob], name, { type: 'image/png' }), blob, name); }, 'image/png');
}
// where video can't be made, the finished sky as a picture instead
function stillShot() {
  renderGL(); draw();
  const out = document.createElement('canvas'); out.width = W; out.height = H; const oc = out.getContext('2d');
  oc.drawImage(cvs, 0, 0); oc.drawImage(fx, 0, 0);
  oc.font = TOY ? `600 ${14 * DPR}px Fredoka, system-ui, sans-serif` : `400 ${12 * DPR}px "IBM Plex Mono", ui-monospace, monospace`; oc.textAlign = 'center'; oc.fillStyle = TOY && !SKY().dark ? 'rgba(31,42,51,.55)' : 'rgba(239,232,218,.6)';
  oc.fillText(TOY ? 'bonk' : 'areabake.com/phone', W / 2, H - 26 * DPR);
  out.toBlob(blob => {
    if (!blob) { toast('Could not make a picture.', 3000); return; }
    const name = `${TOY ? 'bonk' : 'slingshot'}-${world().id}-${level().li + 1}.png`, file = new File([blob], name, { type: 'image/png' });
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
$('#clipBtn').onclick = () => makeClip();

/* ======================= loop ======================= */
let last = performance.now();
function loop(now) {
  requestAnimationFrame(loop);
  const dt = Math.min(0.05, Math.max(0.001, (now - last) / 1000)); last = now; S.frameDt = dt;
  if (document.hidden || CLIP) { Sound.hum(0); if (Sound.amb) Sound.stopAmbient(); return; }
  if (TOY && !Sound.amb && Sound.ctx && Sound.on && Sound.ctx.state === 'running') Sound.ambient(level());
  S.time += dt;
  if (S.photo) { setView(); renderGL(); draw(); return; }
  if (S.rewind) { renderGL(); draw(); if (S.time - S.rewind.t0 > 0.5) { S.rewind = null; load(S.idx); } return; }
  simulate(dt); renderGL(); draw();
  const hc = !S.won && S.comets[0];
  Sound.hum(hc && S.ffK < 2 ? Math.hypot(hc.vx, hc.vy) : 0);
  if (S.won && $('#winbar').hidden && S.time - S.wonAt > (TOY && S.glide ? 2.3 : 1.1)) {
    $('#winbar').hidden = false; $('#shareBtn').hidden = $('#clipBtn').hidden = !!S.replay; $('#retryBtn').hidden = !!S.replay;
  }
  if (S.replay && !S.won && !S.comets.length && S.replay.throws.every(q => q.done)) load(S.idx);
}
window.addEventListener('resize', resize);
resize();
const ms = TOY && /#s\.([0-9a-z._~-]+)/.exec(location.hash), sky = ms && readSky(ms[1]);
const m = !sky && /#([rc])[.=]([0-9a-z._~-]+)/.exec(location.hash), rp = m && parseReplay(m[2]);
if (sky) load(addCustom(sky)); else
// a challenge: play the level yourself, with your friend's winning throw flying beside each of yours as a ghost
if (rp && rp.throws.length && m[1] === 'c' && TOY) { S.ghostRun = { throw: rp.throws[rp.throws.length - 1] }; load(rp.idx); }
else if (rp && rp.throws.length) load(rp.idx, { throws: rp.throws });
else if (rp) load(rp.idx);
else if (/#today/.test(location.hash) && todayIdx() >= 0) load(todayIdx());
else load(Math.min(store.last || 0, (DAILY ? DAILY0 : ALL.length) - 1));
if (!gl) document.body.insertAdjacentHTML('beforeend', '<p style="position:fixed;bottom:40%;left:0;right:0;text-align:center">This game needs WebGL 2, which this browser has turned off.</p>');
if (ON_SITE && 'serviceWorker' in navigator) navigator.serviceWorker.register('/phone-sw.js', { scope: '/phone' }).catch(() => {});
requestAnimationFrame(loop);
</script>
