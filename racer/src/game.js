// Ghost Lap: renderer, input, ghosts, sound and feel. track.mjs, sim.mjs and tracks.mjs are inlined above.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const $ = id => document.getElementById(id);
const RACER_URL = 'https://claude.ai/artifact/UTCuSjqjdAevcyj4EPAz9T';
const STORE = 'ghostlap.v1';
const save = (() => { try { return JSON.parse(localStorage.getItem(STORE)) || {}; } catch { return {}; } })();
save.best ||= {}; save.friend ||= {};
if (save.sound === undefined) save.sound = true;
const persist = () => { try { localStorage.setItem(STORE, JSON.stringify(save)); } catch {} };
const calm = matchMedia('(prefers-reduced-motion: reduce)').matches;
const fmt = t => `${Math.floor(t / 60)}:${(t % 60).toFixed(2).padStart(5, '0')}`;
const fmtD = d => (d < 0 ? '-' : '+') + Math.abs(d).toFixed(2);

// ---------- renderer and light ----------
const renderer = new THREE.WebGLRenderer({ canvas: $('c'), antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
const scene = new THREE.Scene();
const SKY = new THREE.Color('#bfe3f2');
scene.background = SKY;
scene.fog = new THREE.Fog(SKY, 90, 260);
const camera = new THREE.PerspectiveCamera(60, 1, .3, 600);
scene.add(new THREE.HemisphereLight('#fffaf0', '#6f9a83', 1.35), new THREE.AmbientLight('#ffffff', .45));
const sun = new THREE.DirectionalLight('#fff3df', 2.1);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.bias = -.0004; sun.shadow.normalBias = .04;
Object.assign(sun.shadow.camera, { left: -45, right: 45, top: 45, bottom: -45, near: 1, far: 160 });
scene.add(sun, sun.target);
const SUN_DIR = new THREE.Vector3(-.45, 1, .35).normalize();

// ---------- models ----------
const manager = new THREE.LoadingManager();
manager.setURLModifier(u => TEX[u.split('/').pop()] ? 'data:image/png;base64,' + TEX[u.split('/').pop()] : u);
const loader = new GLTFLoader(manager);
const proto = {};
const bytes = s => { const b = atob(s), a = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) a[i] = b.charCodeAt(i); return a.buffer; };
function mk(key, shadow = true) {
  const o = proto[key].clone(true);
  o.traverse(m => { if (m.isMesh) { m.castShadow = shadow; m.receiveShadow = true; } });
  return o;
}

// Bake every mesh of a model into instanced meshes, one per mesh, placed by the given matrices.
function instanced(key, base, mats, shadow = true) {
  const root = proto[key];
  root.updateMatrixWorld(true);
  const group = new THREE.Group();
  root.traverse(m => {
    if (!m.isMesh) return;
    const geo = m.geometry.clone().applyMatrix4(m.matrixWorld).applyMatrix4(base);
    const im = new THREE.InstancedMesh(geo, m.material, mats.length);
    mats.forEach((M, i) => im.setMatrixAt(i, M));
    im.castShadow = shadow; im.receiveShadow = true;
    group.add(im);
  });
  return group;
}

// ---------- sound: impacts from Kenney's Impact Sounds, engine and tires made here ----------
let AC = null, master, noise, engine = null, buffers = {};
function ac() {
  if (AC) { if (AC.state === 'suspended') AC.resume(); return AC; }
  try { AC = new (window.AudioContext || window.webkitAudioContext)(); } catch { return null; }
  master = AC.createGain(); master.gain.value = save.sound ? 1 : 0; master.connect(AC.destination);
  noise = AC.createBuffer(1, AC.sampleRate * 2, AC.sampleRate);
  const d = noise.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  for (const [k, b64] of Object.entries(SOUNDS)) AC.decodeAudioData(bytes(b64)).then(b => { buffers[k] = b; }, () => {});
  startEngine();
  return AC;
}
function play(name, vol = 1, rate = 1) {
  const a = ac(); if (!a) return;
  const b = buffers[name];
  const g = a.createGain(); g.gain.value = vol; g.connect(master);
  if (b) { const s = a.createBufferSource(); s.buffer = b; s.playbackRate.value = rate; s.connect(g); s.start(); return; }
  const o = a.createOscillator(), t = a.currentTime; o.type = 'triangle';
  o.frequency.setValueAtTime(180 * rate, t); o.frequency.exponentialRampToValueAtTime(60, t + .15);
  g.gain.setValueAtTime(vol * .5, t); g.gain.exponentialRampToValueAtTime(.001, t + .18);
  o.connect(g); o.start(t); o.stop(t + .2);
}
function beep(f, len = .14, vol = .18) {
  const a = ac(); if (!a) return;
  const t = a.currentTime, o = a.createOscillator(), g = a.createGain();
  o.type = 'square'; o.frequency.value = f;
  const lp = a.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2200;
  g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + .01); g.gain.setValueAtTime(vol, t + len); g.gain.linearRampToValueAtTime(0, t + len + .05);
  o.connect(lp); lp.connect(g); g.connect(master); o.start(t); o.stop(t + len + .1);
}
function whoosh(vol = .25, dur = .5) {
  const a = ac(); if (!a) return;
  const t = a.currentTime, s = a.createBufferSource(), f = a.createBiquadFilter(), g = a.createGain();
  s.buffer = noise; f.type = 'bandpass'; f.Q.value = 1.4;
  f.frequency.setValueAtTime(400, t); f.frequency.exponentialRampToValueAtTime(3000, t + dur);
  g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + .05); g.gain.exponentialRampToValueAtTime(.001, t + dur);
  s.connect(f); f.connect(g); g.connect(master); s.start(t); s.stop(t + dur + .05);
}
// Engine: two detuned saws through a lowpass, pitched by speed through five fake gears. Tires: filtered noise.
function startEngine() {
  const a = AC, out = a.createGain(); out.gain.value = 0; out.connect(master);
  const lp = a.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 700; lp.Q.value = 4; lp.connect(out);
  const o1 = a.createOscillator(), o2 = a.createOscillator(), sub = a.createOscillator();
  o1.type = 'sawtooth'; o2.type = 'sawtooth'; sub.type = 'square'; o2.detune.value = 9;
  const sg = a.createGain(); sg.gain.value = .5;
  o1.connect(lp); o2.connect(lp); sub.connect(sg); sg.connect(lp);
  o1.start(); o2.start(); sub.start();
  const tire = a.createBufferSource(); tire.buffer = noise; tire.loop = true;
  const bp = a.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1500; bp.Q.value = 6;
  const tg = a.createGain(); tg.gain.value = 0;
  tire.connect(bp); bp.connect(tg); tg.connect(master); tire.start();
  engine = { out, lp, o1, o2, sub, tg, bp };
}
const GEARS = [0, 7, 12.5, 17, 21, 26, 40];
function engineSound(c, on) {
  if (!engine) return;
  const t = AC.currentTime, v = c.speed;
  let g = 0; while (v > GEARS[g + 1]) g++;
  const frac = (v - GEARS[g]) / (GEARS[g + 1] - GEARS[g]);
  const f = 46 + g * 6 + frac * 62 + (c.boost > 0 ? 18 : 0);
  engine.o1.frequency.setTargetAtTime(f, t, .05); engine.o2.frequency.setTargetAtTime(f, t, .05); engine.sub.frequency.setTargetAtTime(f / 2, t, .05);
  engine.lp.frequency.setTargetAtTime(500 + frac * 900 + (c.boost > 0 ? 600 : 0), t, .08);
  engine.out.gain.setTargetAtTime(on ? .085 : 0, t, .15);
  const sk = on && !c.offroad ? Math.min(1, (c.drift ? .6 : 0) + Math.max(0, c.slip - 2.5) / 6) : 0;
  engine.tg.gain.setTargetAtTime(sk * .1, t, .05);
  engine.bp.frequency.setTargetAtTime(1300 + 400 * Math.sin(t * 9), t, .05);
}

// ---------- particles ----------
const softTex = (() => {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const x = c.getContext('2d'), g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(.55, 'rgba(255,255,255,.55)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g; x.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
})();
const parts = [];
function puff(p, color, size, life, vel, add = false) {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: softTex, color, transparent: true, depthWrite: false, blending: add ? THREE.AdditiveBlending : THREE.NormalBlending }));
  s.position.copy(p); s.scale.setScalar(size);
  s.userData = { v: vel, life, max: life, size, grow: add ? .2 : 2.2 };
  scene.add(s); parts.push(s);
}
function stepParts(dt) {
  for (let i = parts.length - 1; i >= 0; i--) {
    const s = parts[i], u = s.userData;
    u.life -= dt;
    s.position.addScaledVector(u.v, dt); u.v.multiplyScalar(1 - 2 * dt);
    const k = u.life / u.max;
    s.scale.setScalar(u.size * (1 + (1 - k) * u.grow)); s.material.opacity = Math.max(0, k) * .7;
    if (u.life <= 0) { scene.remove(s); s.material.dispose(); parts.splice(i, 1); }
  }
}

// Skid marks: a ring of flat dark quads left by the rear wheels.
const SKIDS = 2400;
const skidMesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(.3, .9).rotateX(-Math.PI / 2),
  new THREE.MeshBasicMaterial({ color: '#2b2b30', transparent: true, opacity: .45, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }), SKIDS);
skidMesh.count = 0; skidMesh.frustumCulled = false; skidMesh.renderOrder = 1;
let skidN = 0;
const M4 = new THREE.Matrix4(), Q = new THREE.Quaternion(), V = new THREE.Vector3(), ONE = new THREE.Vector3(1, 1, 1), UP = new THREE.Vector3(0, 1, 0);
function skid(x, z, yaw) {
  Q.setFromAxisAngle(UP, yaw); V.set(x, .12, z);
  skidMesh.setMatrixAt(skidN % SKIDS, M4.compose(V, Q, ONE));
  skidN++; skidMesh.count = Math.min(SKIDS, skidN); skidMesh.instanceMatrix.needsUpdate = true;
}

// ---------- track scene ----------
let T, world = null, ti = 0, cellMap, gantry = [];
function rotFor(h, d) {
  for (let q = 0; q < 4; q++) {
    const a = q * Math.PI / 2, x = h[0] * Math.cos(a) + h[1] * Math.sin(a), z = -h[0] * Math.sin(a) + h[1] * Math.cos(a);
    if (Math.abs(x - d[0]) < 1e-6 && Math.abs(z - d[1]) < 1e-6) return a;
  }
  return 0;
}
const hash = (a, b) => { let h = (a * 374761393 + b * 668265263) ^ 0x5bd1e995; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
const free = (i, j) => !cellMap.has(i + ',' + j);

function buildWorld() {
  if (world) scene.remove(world);
  world = new THREE.Group(); scene.add(world); gantry = [];
  cellMap = cells(T);
  // tiles: each racing-kit tile spans x 0..w, z -w..0 once its anchor is removed; map its entry onto the piece
  for (const pc of T.pieces) {
    const key = pc.type === 'start' ? 'start' : pc.type === 'straight' ? 'straight' : 'corner' + pc.size;
    const inner = mk(key, false); inner.position.set(.35, 0, .65);
    if (key === 'start') inner.traverse(m => {
      if (!m.isMesh) return;
      m.geometry.computeBoundingBox();
      if (m.geometry.boundingBox.max.y > .3) { m.material = m.material.clone(); m.material.transparent = true; m.castShadow = true; gantry.push(m); }
    });
    const g1 = new THREE.Group(); g1.add(inner);
    const left = pc.type === 'corner' && pc.turn < 0;
    const entry = left ? [pc.size, -(pc.size - .5)] : [.5, 0], hl = left ? [-1, 0] : [0, -1];
    g1.position.set(-entry[0], 0, -entry[1]);
    const g2 = new THREE.Group(); g2.add(g1);
    g2.rotation.y = rotFor(hl, pc.d); g2.position.set(pc.A[0], 0, pc.A[1]); g2.scale.setScalar(SCALE);
    world.add(g2);
  }
  // ground in the tiles' own grass color
  let grassMat = null;
  proto.straight.traverse(m => { if (m.isMesh && /grass/.test(m.material.name)) grassMat = m.material; });
  const ground = new THREE.Mesh(new THREE.CircleGeometry(400, 48).rotateX(-Math.PI / 2), grassMat ? grassMat.clone() : new THREE.MeshStandardMaterial({ color: '#4d8f6e' }));
  ground.position.y = -.09; ground.receiveShadow = true;
  const ks = [...cellMap.keys()].map(k => k.split(',').map(Number));
  const bx = [Math.min(...ks.map(k => k[0])), Math.max(...ks.map(k => k[0]))], bz = [Math.min(...ks.map(k => k[1])), Math.max(...ks.map(k => k[1]))];
  ground.position.x = (bx[0] + bx[1] + 1) / 2 * SCALE; ground.position.z = (bz[0] + bz[1] + 1) / 2 * SCALE;
  world.add(ground);

  // barriers: red and white blocks along both edges, left out where another piece's tile sits
  const red = [], white = [], cones = [];
  T.pieces.forEach((pc, n) => {
    for (const side of [-1, 1]) {
      const lat = side * (WALL * SCALE + .55);
      let len, at;
      if (pc.type !== 'corner') {
        const rx = -pc.D[1], rz = pc.D[0];
        len = pc.len * SCALE;
        at = s => [pc.A[0] + pc.D[0] * s + rx * lat, pc.A[1] + pc.D[1] * s + rz * lat, pc.D[0], pc.D[1]];
      } else {
        const rr = pc.turn > 0 ? pc.R - lat : pc.R + lat;
        if (rr < 2) { cones.push([pc.C[0], pc.C[1]]); continue; }
        len = rr * Math.PI / 2;
        const ux = pc.A[0] - pc.C[0], uz = pc.A[1] - pc.C[1], ul = Math.hypot(ux, uz);
        const a0 = Math.atan2(uz, ux), dir = pc.turn;
        at = s => { const a = a0 + dir * s / rr; return [pc.C[0] + Math.cos(a) * rr, pc.C[1] + Math.sin(a) * rr, -Math.sin(a) * dir, Math.cos(a) * dir]; };
        void ul;
      }
      const cnt = Math.max(1, Math.round(len / 2));
      for (let k = 0; k < cnt; k++) {
        const [x, z, tx, tz] = at((k + .5) * len / cnt);
        const owner = cellMap.get(Math.floor(x / SCALE) + ',' + Math.floor(z / SCALE));
        if (owner && owner.some(o => o !== n)) continue;
        Q.setFromAxisAngle(UP, Math.atan2(-tz, tx));
        (k % 2 ? white : red).push(new THREE.Matrix4().compose(new THREE.Vector3(x, 0, z), Q, new THREE.Vector3(SCALE, SCALE, SCALE)));
      }
    }
  });
  const center = new THREE.Matrix4().makeTranslation(.225, 0, .7115);
  world.add(instanced('barrierRed', center, red), instanced('barrierWhite', center, white));
  for (const [x, z] of cones) { const p = mk('pylon'); p.position.set(x + .41 * SCALE * .5, 0, z + .71 * SCALE * .5); p.scale.setScalar(SCALE * .5); world.add(p); }

  // the paddock: grandstands on one side of the start straight, garages and tents on the other
  const st = T.pieces[0], rx = -st.D[1], rz = st.D[0];
  const sideFree = s => [0, 1].every(k => free(Math.floor((st.a[0] + st.d[0] * (k + .5) + rx * s) - (rx < 0 ? 0 : 0)), Math.floor(st.a[1] + st.d[1] * (k + .5) + rz * s)));
  const standSide = sideFree(-1.5) ? -1 : 1;
  for (let k = 0; k < 6; k++) {
    const s = st.a.map((v, i) => v + st.d[i] * (k - 1.5));
    for (const side of [standSide, -standSide]) {
      const cx = s[0] + rx * side * 1.5, cz = s[1] + rz * side * 1.5;
      if (!free(Math.floor(cx), Math.floor(cz))) continue;
      const key = side === standSide ? (k % 3 === 1 ? 'standOpen' : 'stand') : (k % 2 ? 'tent' : 'garage');
      const m = mk(key), g = new THREE.Group(), b = new THREE.Group();
      m.position.set(.35 - .5, 0, .65 + .5); b.add(m);
      b.rotation.y = Math.atan2(-rx * side, -rz * side);
      g.add(b); g.position.set(cx * SCALE, 0, cz * SCALE); g.scale.setScalar(SCALE);
      world.add(g);
      cellMap.set(Math.floor(cx) + ',' + Math.floor(cz), [-1]);
    }
  }
  // banner towers beside the gantry, then trees, bushes and rocks on free ground (deterministic per cell)
  for (const side of [-1, 1]) {
    const b = mk('bannerRed'); b.position.set(T.line.p[0] + rx * side * (WALL * SCALE + 2.4), 0, T.line.p[1] + rz * side * (WALL * SCALE + 2.4)); b.scale.setScalar(SCALE * .8); world.add(b);
  }
  const trees = ['treeA', 'treeB', 'treeC', 'treeD', 'treeE'];
  for (let i = bx[0] - 5; i <= bx[1] + 5; i++) for (let j = bz[0] - 5; j <= bz[1] + 5; j++) {
    if (!free(i, j)) continue;
    let near = 9;
    for (let a = -2; a <= 2; a++) for (let b = -2; b <= 2; b++) if (!free(i + a, j + b)) near = Math.min(near, Math.max(Math.abs(a), Math.abs(b)));
    const r = hash(i, j), r2 = hash(j + 7, i - 3);
    if (near >= 2 && r < .55) {
      const n = 1 + Math.floor(r2 * 3);
      for (let k = 0; k < n; k++) {
        const t = mk(trees[Math.floor(hash(i * 3 + k, j) * trees.length)]);
        t.position.set((i + .2 + .6 * hash(i, j * 5 + k)) * SCALE, -.1, (j + .2 + .6 * hash(i * 7 + k, j)) * SCALE);
        t.scale.setScalar(5 + 2.5 * hash(k, i + j)); t.rotation.y = hash(i + k, j) * 6.28;
        world.add(t);
      }
    } else if (near === 2 && r > .8) {
      const t = mk(r > .9 ? 'bush' : 'rock');
      t.position.set((i + .3 + .4 * r2) * SCALE, -.1, (j + .3 + .4 * r) * SCALE); t.scale.setScalar(r > .9 ? 6 : 3); t.rotation.y = r2 * 6.28;
      world.add(t);
    } else if (near >= 2 && r > .97) {
      const t = mk('billboard'); t.position.set((i + .5) * SCALE, 0, (j + .5) * SCALE); t.scale.setScalar(SCALE); t.rotation.y = Math.round(r2 * 4) * Math.PI / 2; world.add(t);
    }
  }
  skidN = 0; skidMesh.count = 0; world.add(skidMesh);
}

// ---------- cars ----------
function carModel(key, ghost) {
  const o = mk(key, !ghost);
  if (ghost) o.traverse(m => {
    if (!m.isMesh) return;
    m.material = m.material.clone(); m.material.transparent = true; m.material.opacity = .42; m.material.depthWrite = false;
    m.material.emissive = new THREE.Color(ghost); m.material.emissiveIntensity = .35;
    m.castShadow = false;
  });
  const g = new THREE.Group(); g.add(o);
  const w = n => o.getObjectByName(n);
  g.userData = { body: w('body'), fl: w('wheel-front-left'), fr: w('wheel-front-right'), wheels: ['wheel-front-left', 'wheel-front-right', 'wheel-back-left', 'wheel-back-right'].map(w).filter(Boolean) };
  scene.add(g);
  return g;
}
function poseCar(g, c, dt, prev) {
  g.position.set(c.x, 0, c.z);
  g.rotation.y = Math.atan2(c.hx, c.hz);
  const u = g.userData, f = c.vx * c.hx + c.vz * c.hz;
  for (const w of u.wheels) w.rotation.x += f * dt / .3;
  if (u.fl) u.fl.rotation.y = u.fr.rotation.y = -c.s * .5;
  if (u.body && prev) {
    const lat = (c.vx * -c.hz + c.vz * c.hx), acc = (c.speed - prev) / Math.max(dt, 1e-3);
    u.body.rotation.z += ((c.drift ? -c.drift * .07 : 0) + lat * .012 - u.body.rotation.z) * .2;
    u.body.rotation.x += (THREE.MathUtils.clamp(-acc * .004, -.05, .05) - u.body.rotation.x) * .2;
  }
}

// ---------- race state ----------
let you, youCar, ghosts = [], state = 'load', countT = 0, acc = 0, k = 0, inputs = [], level = 0, uNow = 0, splitsRef = null, refName = '';
let finishT = 0, camPos = new THREE.Vector3(), camAt = new THREE.Vector3(), lastSpeed = 0, shake = 0, cpSet = new Set();

function splitTimes(inp) {
  const c = makeCar(T), out = {};
  for (let s = 0; s < 120 * 120 && !c.done; s++) for (const e of stepCar(T, c, inp[Math.floor(s / IN_EVERY)] ?? 0)) if (e.t === 'split') out[e.prog] = c.steps * DT;
  return out;
}

function setTrack(i, keepFriend = true) {
  level = (i + TRACKS.length) % TRACKS.length;
  const tr = TRACKS[level];
  T = buildTrack(tr.str);
  buildWorld();
  const n = T.pieces.length;
  cpSet = new Set([Math.round(n / 4), Math.round(n / 2), Math.round(3 * n / 4)]);
  $('name').querySelector('span').textContent = tr.name;
  save.level = level; persist();
  void keepFriend;
  reset();
}

function reset() {
  for (const g of ghosts) scene.remove(g.mesh);
  if (youCar) scene.remove(youCar);
  const tr = TRACKS[level];
  you = makeCar(T); youCar = carModel('race');
  ghosts = [];
  const add = (who, model, tint, rle) => { const inp = decodeInputs(rle); ghosts.push({ who, inp, c: makeCar(T), mesh: carModel(model, tint), splits: null }); };
  if (PACE[tr.name]) add('Pace car', 'taxi', '#ffd34d', PACE[tr.name].inputs);
  if (save.best[tr.name]) add('Your best', 'race', '#7fd1ff', save.best[tr.name].inputs);
  if (save.friend[tr.name]) add(save.friend[tr.name].who || 'Friend', 'police', '#ff8fb1', save.friend[tr.name].inputs);
  const ref = ghosts.find(g => g.who === 'Your best') || ghosts[ghosts.length - 1];
  refName = ref ? ref.who : ''; splitsRef = ref ? splitTimes(ref.inp) : null;
  for (const g of ghosts) poseCar(g.mesh, g.c, 0);
  poseCar(youCar, you, 0);
  inputs = []; k = 0; acc = 0; countT = 0; state = 'count'; uNow = 0; lastSpeed = 0;
  for (const s of parts) scene.remove(s); parts.length = 0;
  skidN = 0; skidMesh.count = 0;
  $('sheet').hidden = true; $('time').textContent = fmt(0); $('split').className = '';
  const L = $('lights'); L.classList.remove('off'); L.querySelectorAll('i').forEach(x => x.className = '');
  $('hint').hidden = !!save.drove;
  // camera starts high over the gantry and swoops down behind the car during the countdown
  camPos.set(you.x - you.hx * 30 + 25, 32, you.z - you.hz * 30 + 10); camAt.set(you.x, 0, you.z);
}

// ---------- input: thumb drag, keys, optional tilt ----------
let drag = null, keys = { l: 0, r: 0 }, tilt = null;
const pad = $('pad'), nub = $('nub');
addEventListener('pointerdown', e => {
  if (e.target !== $('c') || drag) return;
  ac();
  drag = { id: e.pointerId, x0: e.clientX, x: e.clientX };
  pad.style.left = e.clientX + 'px'; pad.style.top = e.clientY + 'px'; pad.classList.add('on');
  nub.style.transform = '';
});
addEventListener('pointermove', e => {
  if (!drag || e.pointerId !== drag.id) return;
  const R = Math.min(innerWidth, 520) * .13;
  drag.x = e.clientX;
  // past full lock the pad follows the thumb, so reversing steers back at once
  if (drag.x - drag.x0 > R) drag.x0 = drag.x - R;
  if (drag.x0 - drag.x > R) drag.x0 = drag.x + R;
});
const endDrag = e => { if (drag && e.pointerId === drag.id) { drag = null; pad.classList.remove('on'); } };
addEventListener('pointerup', endDrag); addEventListener('pointercancel', endDrag);
addEventListener('keydown', e => {
  if (e.key === 'ArrowLeft' || e.key === 'a') keys.l = 1;
  else if (e.key === 'ArrowRight' || e.key === 'd') keys.r = 1;
  else if (e.key === 'r') { ac(); reset(); }
  else if (e.key === 'Enter' && state === 'done') setTrack(level + 1);
  else return;
  ac();
});
addEventListener('keyup', e => { if (e.key === 'ArrowLeft' || e.key === 'a') keys.l = 0; if (e.key === 'ArrowRight' || e.key === 'd') keys.r = 0; });
let autoplay = null, debugCam = null;   // test hook: steering levels to replay instead of input
function steerLevel() {
  if (autoplay) return autoplay[inputs.length] ?? 0;
  if (drag) {
    const R = Math.min(innerWidth, 520) * .13, v = THREE.MathUtils.clamp((drag.x - drag.x0) / R, -1, 1);
    nub.style.transform = `translateX(${v * 30}px)`;
    return Math.round(v * 8);
  }
  if (keys.l || keys.r) return (keys.r - keys.l) * 8;
  if (tilt && tilt.on) return Math.round(THREE.MathUtils.clamp(tilt.v / 24, -1, 1) * 8);
  return 0;
}
// Tilt needs device orientation, which a claude.ai artifact does not get today; turn it on only if events arrive.
async function enableTilt() {
  try { if (DeviceOrientationEvent.requestPermission) await DeviceOrientationEvent.requestPermission(); } catch {}
  tilt = { on: false, v: 0 };
  const h = e => {
    if (e.gamma == null) return;
    const ang = (screen.orientation && screen.orientation.angle) || 0;
    tilt.v = ang === 90 ? e.beta : ang === 270 || ang === -90 ? -e.beta : e.gamma;
    tilt.on = true;
  };
  addEventListener('deviceorientation', h);
  setTimeout(() => { if (!tilt.on) { removeEventListener('deviceorientation', h); tilt = null; save.tilt = false; persist(); toast("Tilt isn't available here. Steer with your thumb."); menu(); } }, 1500);
}

// ---------- events from the sim ----------
function onEvents(evs, c) {
  for (const e of evs) {
    if (e.t === 'wall') {
      const m = e.m;
      play(m > 7 ? 'wallHard' : 'wallSoft', Math.min(1, .25 + m / 12), .9 + Math.random() * .2);
      if (m > 9) play('clank', .4);
      shake = Math.max(shake, Math.min(.6, m * .05));
      for (let i = 0; i < Math.min(14, m * 1.5); i++) puff(new THREE.Vector3(c.x + c.hx * 1.2, .6, c.z + c.hz * 1.2), '#ffd27a', .35, .35,
        new THREE.Vector3((Math.random() - .5) * 10, Math.random() * 5, (Math.random() - .5) * 10), true);
      if (navigator.vibrate && m > 6) navigator.vibrate(20);
    } else if (e.t === 'drift' && !save.tipDrift) {
      save.tipDrift = 1; persist();
      toast('Drifting! Hold it through the corner, then let go for a boost.', 3200);
    } else if (e.t === 'boost') {
      whoosh(e.tier === 2 ? .35 : .22, e.tier === 2 ? .7 : .45);
      shake = Math.max(shake, .15);
    } else if (e.t === 'split' && splitsRef && cpSet.has(e.prog) && splitsRef[e.prog] !== undefined) {
      const d = c.steps * DT - splitsRef[e.prog], el = $('split');
      el.textContent = fmtD(d); el.className = 'on ' + (d < 0 ? 'ahead' : 'behind');
      clearTimeout(el._t); el._t = setTimeout(() => el.classList.remove('on'), 1800);
      beep(d < 0 ? 1320 : 520, .06, .08);
    } else if (e.t === 'finish') finish(e.time);
  }
}

function finish(time) {
  state = 'done'; finishT = 0;
  const tr = TRACKS[level], prev = save.best[tr.name];
  const rle = encodeInputs(inputs);
  // keep a best only if it replays to the same time (it always should; this guards the ghost's honesty)
  const check = replay(T, decodeInputs(rle));
  const isBest = check !== null && (!prev || time < prev.time - 1e-9);
  if (isBest) { save.best[tr.name] = { time, inputs: rle }; persist(); pushBests(); }
  play('bell', .5);
  lastRun = { time, rle, isBest, prev };
  setTimeout(showCard, 900);
}
let lastRun = null;
function showCard() {
  if (state !== 'done') return;
  const { time, isBest, prev } = lastRun, tr = TRACKS[level];
  $('big').textContent = fmt(time);
  $('stamp').hidden = !(isBest && prev);
  const rows = [];
  const row = (label, color, ref) => {
    const d = time - ref;
    rows.push(`<span class="dot" style="background:${color}"></span><span>${label}</span><b class="${d <= 0 ? 'ahead' : 'behind'}">${fmtD(d)}</b>`);
  };
  if (prev) row('Your best', '#7fd1ff', prev.time);
  if (save.friend[tr.name]) row(esc(save.friend[tr.name].who || 'Friend'), '#ff8fb1', save.friend[tr.name].time);
  if (PACE[tr.name]) row('Pace car', '#ffd34d', PACE[tr.name].time);
  $('rows').innerHTML = rows.join('');
  $('sheet').hidden = false;
  renderBoard();
}

// ---------- loop ----------
const clock = new THREE.Clock();
const tmp = new THREE.Vector3(), tmp2 = new THREE.Vector3();
function tick() {
  const dt = Math.min(clock.getDelta(), 1 / 20), now = performance.now();
  if (state === 'count') {
    countT += dt;
    const lit = Math.min(3, Math.floor(countT / .75));
    const L = $('lights').querySelectorAll('i');
    L.forEach((x, i) => x.className = countT >= 3 ? 'g' : i < lit ? 'r' : '');
    if (lit > (tick.lit ?? -1) && lit > 0 && countT < 3) beep(660);
    tick.lit = countT >= 3 ? -1 : lit;
    if (countT >= 3) { state = 'race'; beep(990, .32, .2); setTimeout(() => { if (state !== 'count') $('lights').classList.add('off'); }, 500); }
    uNow = steerLevel();
  }
  if (state === 'race' || state === 'done') {
    acc += dt;
    let n = 0;
    while (acc >= DT && n++ < 12) {
      acc -= DT;
      if (state === 'race') {
        if (k % IN_EVERY === 0) { uNow = steerLevel(); inputs.push(uNow); if (uNow && !save.drove && k > 60) { save.drove = 1; persist(); $('hint').hidden = true; } }
        const ev = stepCar(T, you, uNow);
        onEvents(ev, you);
        // tire smoke, skid marks, drift sparks
        if (k % 3 === 0 && (you.drift || you.slip > 3) && you.speed > 4) {
          const rx = -you.hz, rz = you.hx, yaw = Math.atan2(you.vx, you.vz);
          for (const s of [-1, 1]) {
            const x = you.x - you.hx * .9 + rx * .55 * s, z = you.z - you.hz * .9 + rz * .55 * s;
            if (!you.offroad) skid(x, z, yaw);
            if (k % 6 === 0) puff(tmp.set(x, .4, z), you.offroad ? '#b9a27a' : '#f4f1ea', 1.1, .9, new THREE.Vector3(-you.vx * .1, 1.2, -you.vz * .1));
          }
        }
        if (you.drift && k % 4 === 0 && you.driftT > .7) {
          const col = you.driftT > 1.5 ? '#ffa13d' : '#5cc8ff';
          for (const s of [-1, 1]) puff(tmp.set(you.x - you.hx * 1 + -you.hz * .6 * s, .3, you.z - you.hz * 1 + you.hx * .6 * s), col, .5, .25,
            new THREE.Vector3((Math.random() - .5) * 4, 2 + Math.random() * 2, (Math.random() - .5) * 4), true);
        }
      } else if (finishT < 4) {
        // after the line the car rolls to a stop
        you.vx *= .992; you.vz *= .992; you.x += you.vx * DT; you.z += you.vz * DT; you.s *= .95;
        you.speed = Math.hypot(you.vx, you.vz);
      }
      for (const g of ghosts) if (!g.c.done && state === 'race') stepCar(T, g.c, g.inp[Math.floor(k / IN_EVERY)] ?? 0);
      if (state === 'race') k++;
    }
    if (state === 'race') $('time').textContent = fmt(k * DT);
    else if (state === 'done') $('time').textContent = fmt(you.time);
    if (state === 'done') finishT += dt;
    if (you.boost > 0 && Math.random() < .9) {
      const col = you.tier === 2 ? '#ff9d3a' : '#62c6ff';
      puff(tmp.set(you.x - you.hx * 1.35, .45, you.z - you.hz * 1.35), col, .7 + Math.random() * .3, .18, new THREE.Vector3(-you.hx * 8, .5, -you.hz * 8), true);
    }
  }
  poseCar(youCar, you, dt, lastSpeed); lastSpeed = you.speed;
  for (const g of ghosts) {
    poseCar(g.mesh, g.c, state === 'race' ? dt : 0);
    // ghosts fade when you are right on top of them, so they never hide the road
    const d = Math.hypot(g.c.x - you.x, g.c.z - you.z), o = THREE.MathUtils.clamp((d - 2) / 8, .12, 1) * .42;
    g.mesh.traverse(m => { if (m.isMesh) m.material.opacity = o; });
  }
  engineSound(you, state === 'race' || state === 'count' || (state === 'done' && finishT < 3));

  // chase camera: low behind the car, pulled back and widened with speed; orbits the car after the finish
  const portrait = innerHeight > innerWidth, sp = you.speed / VMAX;
  const back = (portrait ? 8.2 : 7.2) + sp * 1.5, up = (portrait ? 6.2 : 3.3) + sp * .3;
  if (state === 'done') {
    // after the line: rise and swing gently behind the car, staying over the track
    const a = Math.atan2(you.hx, you.hz) + Math.PI + Math.sin(finishT * .5) * .7;
    tmp.set(you.x + Math.sin(a) * 7.5, 4.5 + finishT * .6, you.z + Math.cos(a) * 7.5);
  } else tmp.set(you.x - you.hx * back, up, you.z - you.hz * back);
  const ease = state === 'count' ? 1 - Math.exp(-dt * 2.2) : 1 - Math.exp(-dt * (state === 'done' ? 2 : 7));
  camPos.lerp(tmp, ease);
  tmp2.set(you.x + you.hx * (portrait ? 8 : 6), portrait ? 0 : 1.2, you.z + you.hz * (portrait ? 8 : 6));
  if (state === 'done') tmp2.set(you.x, 1, you.z);
  camAt.lerp(tmp2, 1 - Math.exp(-dt * 9));
  camera.position.copy(camPos);
  if (shake > .01 && !calm) camera.position.add(tmp.set((Math.random() - .5) * shake, (Math.random() - .5) * shake, 0));
  shake *= .88;
  camera.lookAt(camAt);
  if (debugCam) { camera.position.set(...debugCam.slice(0, 3)); camera.lookAt(...debugCam.slice(3)); }
  const fov = 58 + sp * 10 + (you.boost > 0 ? 6 : 0) + (portrait ? 8 : 0);
  if (Math.abs(camera.fov - fov) > .05) { camera.fov += (fov - camera.fov) * .1; camera.updateProjectionMatrix(); }
  // the start gantry fades as the camera passes under it, so it never blocks the view
  const gd = Math.abs((camera.position.x - T.line.p[0]) * T.line.d[0] + (camera.position.z - T.line.p[1]) * T.line.d[1]);
  const go = THREE.MathUtils.clamp((gd - 2) / 7, .08, 1);
  for (const m of gantry) { m.material.opacity = go; m.material.depthWrite = go > .99; }
  sun.position.copy(camAt).addScaledVector(SUN_DIR, 70); sun.target.position.copy(camAt);
  stepParts(dt);
  renderer.render(scene, camera);
  requestAnimationFrame(tick);
}

// ---------- menus, sharing ----------
function toast(html, ms = 2600) {
  const t = $('toast'); t.innerHTML = html; t.hidden = false;
  clearTimeout(t._t); t._t = setTimeout(() => t.hidden = true, ms);
  return t;
}
function copyText(text, ok, fail) {
  let done = false; const fin = f => { if (!done) { done = true; f(); } };
  try { navigator.clipboard.writeText(text).then(() => fin(ok), () => fin(fail)); } catch { fin(fail); }
  setTimeout(() => fin(fail), 1500);
}
function menu() {
  $('list').innerHTML = TRACKS.map((t, i) => {
    const b = save.best[t.name];
    return `<button class="trk ${i === level ? 'cur' : ''}" data-i="${i}"><span>${t.name}</span><small>Pace car ${fmt(PACE[t.name].time)}${save.friend[t.name] ? ' · friend ' + fmt(save.friend[t.name].time) : ''}</small><b>${b ? fmt(b.time) : '-'}</b></button>`;
  }).join('');
  const opts = [['sound', 'Sound', save.sound]];
  if (typeof DeviceOrientationEvent !== 'undefined') opts.push(['tilt', 'Tilt to steer', !!(tilt && tilt.on)]);
  $('opts').innerHTML = opts.map(([k, l, on]) => `<button class="opt" data-k="${k}" aria-pressed="${on}">${l}</button>`).join('');
  $('menu').hidden = false;
}
$('list').addEventListener('click', e => { const b = e.target.closest('.trk'); if (!b) return; play('tap', .4); $('menu').hidden = true; setTrack(+b.dataset.i); });
$('opts').addEventListener('click', e => {
  const b = e.target.closest('.opt'); if (!b) return;
  if (b.dataset.k === 'sound') { save.sound = !save.sound; persist(); if (master) master.gain.value = save.sound ? 1 : 0; }
  if (b.dataset.k === 'tilt') { if (tilt && tilt.on) { tilt = null; } else enableTilt(); }
  menu();
});
$('menu').addEventListener('pointerdown', e => { if (e.target === $('menu')) $('menu').hidden = true; });
$('name').onclick = () => { ac(); play('tap', .4); menu(); };
$('redo').onclick = () => { ac(); play('tap', .4); reset(); };
$('again').onclick = () => { play('tap', .4); reset(); };
$('next').onclick = () => { play('tap', .4); setTrack(level + 1); };
$('dare').onclick = () => {
  const tr = TRACKS[level], best = save.best[tr.name];
  if (!best) return;
  const url = `${RACER_URL}#g.${tr.id}.${best.inputs}`;
  const text = `Ghost Lap, ${tr.name}: ${fmt(best.time)}. Race my ghost:`;
  copyText(`${text} ${url}`, () => toast('Challenge link copied.'), () => { toast('Copy this link: <span class="l"></span>', 9000).querySelector('.l').textContent = url; });
};
addEventListener('resize', () => { renderer.setSize(innerWidth, innerHeight, false); camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); });

// A challenge link carries a friend's lap as steering inputs; it replays exactly, so the time can't be faked.
function readLink() {
  const m = /^#g\.([a-z]+)\.([A-Q0-9a-z]+)$/.exec(location.hash);
  const i = m ? TRACKS.findIndex(t => t.id === m[1]) : -1;
  if (i < 0) return null;
  const Tt = buildTrack(TRACKS[i].str), time = replay(Tt, decodeInputs(m[2]));
  if (time === null) return null;
  save.friend[TRACKS[i].name] = { time, inputs: m[2] }; persist();
  return { i, time };
}

// ---------- friends leaderboard (artifact db): laps/<user id> = { t: { <track id>: { time, inputs } } } ----------
// Everyone reads every row; each person writes only their own. Rows are untrusted, so each lap is replayed and
// kept only if it finishes; the replayed time is the one shown. Without db (signed out, no grant) none of this shows.
let db = null, users = null, me = null, board = {}, canPost = true, names = {};
const esc = s => String(s).replace(/[&<>"']/g, c => '&#' + c.charCodeAt(0) + ';');
const checked = new Map();
function verify(tr, inputs) {
  const key = tr.id + inputs;
  if (!checked.has(key)) checked.set(key, replay(buildTrack(tr.str), decodeInputs(inputs)));
  return checked.get(key);
}
async function online() {
  try {
    if (!window.claude || !window.claude.use) return;
    const [d, u] = await Promise.all([window.claude.use('db'), window.claude.use('user')]);
    if (!d || !u) return;
    me = await u.id();
    if (!me) return;
    db = d; users = u;
    db.collection('laps').onSnapshot(snap => readBoard(snap.docs), () => {});
  } catch {}
}
let pushedOnce = false;
function readBoard(docs) {
  board = {};
  let mine = null;
  for (const doc of docs) {
    const t = doc.data() && doc.data().t;
    if (!t || typeof t !== 'object') continue;
    if (doc.id === me) mine = t;
    for (const tr of TRACKS) {
      const e = t[tr.id];
      if (!e || typeof e.inputs !== 'string' || e.inputs.length > 6000 || !/^[A-Q0-9a-z]+$/.test(e.inputs)) continue;
      const time = verify(tr, e.inputs);
      if (time !== null) (board[tr.id] ||= []).push({ id: doc.id, time, inputs: e.inputs });
    }
  }
  for (const k in board) board[k].sort((a, b) => a.time - b.time);
  // a faster lap of yours from another device becomes your local best too
  let changed = false;
  for (const tr of TRACKS) {
    const e = (board[tr.id] || []).find(r => r.id === me), b = save.best[tr.name];
    if (e && (!b || e.time < b.time - 1e-9)) { save.best[tr.name] = { time: e.time, inputs: e.inputs }; changed = true; }
    if (!e && b) changed = true;
    if (e && b && b.time < e.time - 1e-9) changed = true;
  }
  if (changed) persist();
  if (!pushedOnce && changed) { pushedOnce = true; pushBests(); }
  void mine;
  const ids = [...new Set(Object.values(board).flat().map(r => r.id))].filter(id => !names[id]);
  if (ids.length && users) users.profiles(ids).then(ps => { for (const id of ids) names[id] = (ps[id] && ps[id].name) || 'Someone'; renderBoard(); }, () => {});
  renderBoard();
}
function pushBests() {
  if (!db || !me || !canPost) return;
  const t = {};
  for (const tr of TRACKS) if (save.best[tr.name]) t[tr.id] = { time: save.best[tr.name].time, inputs: save.best[tr.name].inputs };
  db.doc('laps/' + me).set({ t }).catch(e => { if (e && (e.code === 'invalid_argument' || e.code === 'not_granted')) canPost = false; });
}
function renderBoard() {
  const el = $('board'), tr = TRACKS[level], rows = board[tr.id] || [];
  if (!db || !rows.length || $('sheet').hidden) { el.hidden = true; return; }
  el.hidden = false;
  el.innerHTML = '<h3>Friends on ' + esc(tr.name) + '</h3>' + rows.slice(0, 5).map((r, i) =>
    `<button class="fr ${r.id === me ? 'me' : ''}" data-id="${esc(r.id)}" ${r.id === me ? 'disabled' : ''}><i>${['1st', '2nd', '3rd', '4th', '5th'][i]}</i><span>${r.id === me ? 'You' : esc(names[r.id] || '...')}</span><b>${fmt(r.time)}</b></button>`).join('');
}
$('board').addEventListener('click', e => {
  const b = e.target.closest('.fr'); if (!b || b.disabled) return;
  const tr = TRACKS[level], r = (board[tr.id] || []).find(x => x.id === b.dataset.id);
  if (!r) return;
  save.friend[tr.name] = { time: r.time, inputs: r.inputs, who: names[r.id] || 'Friend' }; persist();
  play('tap', .4); reset();
  toast(`Racing ${esc(names[r.id] || 'a friend')}'s ghost: the pink car.`);
});

// ---------- start ----------
await Promise.all(Object.keys(MODELS).map(key => new Promise((res, rej) => loader.parse(bytes(MODELS[key]), '', g => { proto[key] = g.scene; res(); }, rej))));
renderer.setSize(innerWidth, innerHeight, false);
camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
const link = readLink();
setTrack(link ? link.i : save.level || 0);
if (link) toast(`A friend's ghost: ${fmt(link.time)} on ${TRACKS[link.i].name}. Catch the pink car.`, 5000);
$('load').classList.add('gone');
online();
requestAnimationFrame(tick);
window.__race = { get you() { return you; }, get state() { return state; }, setTrack, reset, get T() { return T; }, set cam(v) { debugCam = v; }, paceOf(i) { return PACE[TRACKS[i].name].inputs; }, set auto(rle) { autoplay = rle ? decodeInputs(rle) : null; } };
