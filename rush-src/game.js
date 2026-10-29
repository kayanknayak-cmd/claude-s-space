// Dinner Rush: renderer, input, characters, sound and feel. catalog, sim and levels are inlined above this file.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import RAPIER from 'rapier';

const $ = id => document.getElementById(id);
const STORE = 'dinnerrush.v1';
const calm = matchMedia('(prefers-reduced-motion: reduce)').matches;
const save = (() => { try { return JSON.parse(localStorage.getItem(STORE)) || {}; } catch { return {}; } })();
save.done ||= {};
const persist = () => { try { localStorage.setItem(STORE, JSON.stringify(save)); } catch {} };

// ---------- renderer ----------
const renderer = new THREE.WebGLRenderer({ canvas: $('c'), antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
const scene = new THREE.Scene();
scene.background = new THREE.Color('#f1d7b3');
const camera = new THREE.PerspectiveCamera(30, 1, .1, 200);
scene.add(new THREE.HemisphereLight('#fff3e0', '#9c7b62', 1.5));
const sun = new THREE.DirectionalLight('#fff1dc', 2.4);
sun.position.set(-2.5, 7, 6);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.bias = -.0006;
sun.shadow.normalBias = .02;
Object.assign(sun.shadow.camera, { left: -4, right: 4, top: 4, bottom: -4, near: .5, far: 30 });
scene.add(sun, sun.target);

// ---------- models ----------
const texURL = {};
for (const k in TEX) texURL['tex-' + k + '.png'] = 'data:image/png;base64,' + TEX[k];
const manager = new THREE.LoadingManager();
manager.setURLModifier(u => texURL[u.split('/').pop()] || u);
const loader = new GLTFLoader(manager);
const proto = {};
const bytes = s => { const b = atob(s), a = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) a[i] = b.charCodeAt(i); return a.buffer; };

function mk(key) {
  const [, sc, role] = CAT[key], g = proto[key];
  const o = role === 'char' ? SkeletonUtils.clone(g.scene) : g.scene.clone(true);
  o.scale.setScalar(sc);
  o.traverse(m => { if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; } });
  const w = new THREE.Group();
  w.add(o);
  w.userData.inner = o;
  return w;
}

// ---------- sound (synthesized; no audio files in the packs) ----------
let AC = null, noiseBuf = null;
function ac() {
  if (!AC) {
    try { AC = new (window.AudioContext || window.webkitAudioContext)(); } catch { return null; }
    noiseBuf = AC.createBuffer(1, AC.sampleRate, AC.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  if (AC.state === 'suspended') AC.resume();
  return AC;
}
function env(a, t, vol, attack, decay) {
  const g = a.createGain();
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(vol, t + attack);
  g.gain.exponentialRampToValueAtTime(.0001, t + attack + decay);
  g.connect(a.destination);
  return g;
}
function tone(f0, f1, type, vol, decay, delay = 0) {
  const a = ac(); if (!a) return;
  const t = a.currentTime + delay, o = a.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(f0, t);
  o.frequency.exponentialRampToValueAtTime(f1, t + decay);
  o.connect(env(a, t, vol, .004, decay));
  o.start(t); o.stop(t + decay + .05);
}
function hiss(f0, f1, q, vol, decay, type = 'bandpass') {
  const a = ac(); if (!a) return;
  const t = a.currentTime, s = a.createBufferSource(), f = a.createBiquadFilter();
  s.buffer = noiseBuf; s.playbackRate.value = .7 + Math.random() * .6;
  f.type = type; f.Q.value = q;
  f.frequency.setValueAtTime(f0, t);
  f.frequency.exponentialRampToValueAtTime(f1, t + decay);
  s.connect(f); f.connect(env(a, t, vol, .01, decay));
  s.start(t, Math.random() * .5); s.stop(t + decay + .05);
}
const sfx = {
  whoosh: p => hiss(500, 2200, 1.2, .18 + .2 * p, .22),
  thud: m => { const v = Math.min(.5, m / 12); tone(150 + Math.random() * 40, 60, 'sine', v, .14); hiss(900, 200, .7, v * .6, .08, 'lowpass'); },
  clink: m => { const v = Math.min(.25, m / 18), r = .95 + Math.random() * .1; for (const [f, k] of [[2350, 1], [3720, .6], [5480, .35]]) tone(f * r, f * r * .99, 'sine', v * k, .35); },
  knock: m => { const v = Math.min(.4, m / 12), r = .9 + Math.random() * .2; tone(330 * r, 280 * r, 'triangle', v, .09); tone(720 * r, 650 * r, 'sine', v * .3, .05); },
  smash: () => { hiss(4000, 1500, .8, .35, .3, 'highpass'); for (let i = 0; i < 4; i++) tone(2400 + Math.random() * 3000, 2000, 'sine', .08, .2, i * .03); },
  nom: () => { tone(520, 400, 'sine', .3, .1); tone(780, 620, 'sine', .25, .12, .11); },
  huh: () => { tone(330, 230, 'triangle', .18, .18); tone(250, 190, 'triangle', .14, .2, .14); },
  win: () => [523, 659, 784, 1047].forEach((f, i) => { tone(f, f, 'sine', .22, .5, i * .11); tone(f * 4, f * 4, 'sine', .03, .15, i * .11); }),
  tap: () => tone(900, 700, 'sine', .08, .05),
};

// ---------- scene state ----------
let level = 0, L, S, world3, view = {}, actors = [], chef, foodVis = new Map(), dots = [], ghost = null, puffs = [];
let state = 'load', aim = null, hitStop = 0, timeScale = 1, slowUntil = 0, shake = 0, acc = 0, flying = null, lastTap = 0;
let rec = null, replay = null;
const clock = new THREE.Clock();
const ray = new THREE.Raycaster(), plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
const tmp = new THREE.Vector3();

function clipsOf(key) { const m = {}; for (const c of proto[key].animations) m[c.name] = c; return m; }

// A person: chef or customer, with animation and a head that follows flying food.
function person(key, x, y, turn) {
  const g = mk(key);
  g.position.set(x, y, 0);
  g.rotation.y = turn;
  const mixer = new THREE.AnimationMixer(g.userData.inner), clips = clipsOf(key);
  const a = { g, mixer, clips, head: g.userData.inner.getObjectByName('head'), cur: null, look: new THREE.Quaternion(), x, y, turn };
  a.play = (name, once, speed = 1) => {
    const act = mixer.clipAction(clips[name]);
    act.reset(); act.setEffectiveTimeScale(speed);
    act.setLoop(once ? THREE.LoopOnce : THREE.LoopRepeat); act.clampWhenFinished = !!once;
    if (a.cur && a.cur !== act) act.crossFadeFrom(a.cur, .15, false);
    act.play(); a.cur = act;
    if (once) a.back = performance.now() + (clips[name].duration / speed) * 1000 - 120;
  };
  a.play('idle');
  mixer.setTime(Math.random() * 2);
  world3.add(g);
  actors.push(a);
  return a;
}

// Hand-drawn speech bubble: a wobbly ring drawn once to a canvas.
function bubbleTexture(seed) {
  const c = document.createElement('canvas'); c.width = c.height = 160;
  const x = c.getContext('2d'), r = 54, cx = 80, cy = 72;
  x.beginPath();
  for (let i = 0; i <= 64; i++) {
    const a = i / 64 * Math.PI * 2, k = r * (1 + .035 * Math.sin(3 * a + seed) + .02 * Math.sin(7 * a + seed * 2));
    i ? x.lineTo(cx + Math.cos(a) * k, cy + Math.sin(a) * k) : x.moveTo(cx + Math.cos(a) * k, cy + Math.sin(a) * k);
  }
  x.closePath();
  x.moveTo(cx - 22, cy + 46); x.lineTo(cx - 34, cy + 78); x.lineTo(cx - 4, cy + 52);
  x.fillStyle = '#fff4e2'; x.fill();
  x.lineWidth = 6; x.lineJoin = 'round'; x.strokeStyle = '#3a2a22'; x.stroke();
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

const dotTex = (() => {
  const c = document.createElement('canvas'); c.width = c.height = 32;
  const x = c.getContext('2d');
  x.beginPath(); x.arc(16, 16, 11, 0, Math.PI * 2); x.fillStyle = '#fff4e2'; x.fill();
  x.lineWidth = 4; x.strokeStyle = '#3a2a22'; x.stroke();
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
})();

function customer(c, i) {
  const a = person(c.who, c.x, c.y, -.55);
  a.c = c;
  const b = new THREE.Group();
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: bubbleTexture(i * 1.7 + 1), depthWrite: false }));
  sp.scale.setScalar(.5);
  const f = mk(c.want), h = HULLS[c.want], size = Math.max(h.max[0] - h.min[0], h.max[1] - h.min[1], h.max[2] - h.min[2]);
  f.scale.setScalar(.2 / size);
  f.position.set(0, .02 - (h.max[1] + h.min[1]) / 2 * .2 / size, .08);
  f.rotation.x = .35;
  b.add(sp, f);
  b.position.set(c.x + .12, c.y + 1.02, 0);
  b.userData.food = f;
  world3.add(b);
  a.bubble = b;
  return a;
}

function shell() {
  const W = L.w, H = L.h, x0 = -.75, span = W + .9, n = Math.max(1, Math.round(span / 1.2)), sx = span / (n * 1.2);
  for (let i = 0; i < n; i++) {
    const x = x0 + (i + .5) * 1.2 * sx;
    for (const z of [0, 1.2, 2.4]) { const t = mk('floor'); t.position.set(x, 0, z); t.scale.x = sx; world3.add(t); }
    for (let j = 0; j * 1.2 < H - .01; j++) {
      const t = mk((i + j) % 2 ? 'wallwin' : 'wall');
      t.traverse(m => { if (m.isMesh) { m.material = m.material.clone(); m.material.color.set('#ffd9b8'); } });
      t.position.set(x, j * 1.2, -.96); t.scale.x = sx; world3.add(t);
    }
  }
  const street = new THREE.Mesh(new THREE.PlaneGeometry(60, 30), new THREE.MeshStandardMaterial({ color: '#d9c3a3', roughness: 1 }));
  street.rotation.x = -Math.PI / 2; street.position.set(W / 2, -.002, 14.4); street.receiveShadow = true;
  world3.add(street);
  const wood = new THREE.MeshStandardMaterial({ color: '#c98a57', roughness: .9 }), edge = new THREE.MeshStandardMaterial({ color: '#8d5b3a', roughness: .9 });
  for (const [x0, x1, y] of L.floors || []) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0, .14, 1.3), [edge, edge, wood, edge, edge, edge]);
    m.position.set((x0 + x1) / 2, y - .07, 0); m.castShadow = m.receiveShadow = true;
    world3.add(m);
  }
}

// Fit the building to the screen: full width on phones, with the street below left free for the thumb.
function frame() {
  const aspect = innerWidth / innerHeight, portrait = aspect < .8, tanH = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
  camera.aspect = aspect; camera.updateProjectionMatrix();
  const x0 = -.75, x1 = L.w + .15, top = L.h, cx = (x0 + x1) / 2, elev = .34, yaw = .1;
  const pts = [];
  for (const x of [x0, x1]) for (const y of [0, top]) for (const z of [-.6, .6]) pts.push(new THREE.Vector3(x, y, z));
  const dir = new THREE.Vector3(Math.sin(yaw) * Math.cos(elev), Math.sin(elev), Math.cos(yaw) * Math.cos(elev));
  const place = (D, oy) => {
    view.at = new THREE.Vector3(cx, top / 2 + oy, 0);
    view.pos = view.at.clone().addScaledVector(dir, D);
    camera.position.copy(view.pos); camera.lookAt(view.at); camera.updateMatrixWorld();
    let mx = 0, lo = 1, hi = -1;
    for (const p of pts) { const q = p.clone().project(camera); mx = Math.max(mx, Math.abs(q.x)); lo = Math.min(lo, q.y); hi = Math.max(hi, q.y); }
    return { mx, lo, hi };
  };
  let a = 1, b = 80;
  for (let i = 0; i < 40; i++) { const D = (a + b) / 2, r = place(D, 0); (r.mx < .95 && r.hi - r.lo < (portrait ? 1.25 : 1.55)) ? b = D : a = D; }
  let oy = 0;
  for (let i = 0; i < 5; i++) { const r = place(b, oy); oy += (r.hi - (portrait ? .72 : .78)) * b * tanH * .5; }
  place(b, oy);
  sun.target.position.set(cx, 0, 0); sun.position.set(cx - 2.5, 7, 6);
}

function setLevel(i) {
  level = (i + LEVELS.length) % LEVELS.length; L = LEVELS[level];
  if (world3) scene.remove(world3);
  world3 = new THREE.Group(); scene.add(world3);
  actors = []; foodVis = new Map(); dots = []; puffs = []; ghost = null; flying = null; rec = null; replay = null;
  if (S) S.world.free();
  S = makeSim(RAPIER, HULLS, L);
  shell();
  for (const b of S.bodies) addBodyVis(b);
  chef = person('chef', L.chef[0], L.chef[1] || 0, .9);
  S.customers.forEach((c, i) => { c.actor = customer(c, i); });
  queueVis();
  for (let i = 0; i < 14; i++) {
    const d = new THREE.Sprite(new THREE.SpriteMaterial({ map: dotTex, transparent: true, depthTest: false }));
    d.visible = false; d.renderOrder = 5; world3.add(d); dots.push(d);
  }
  frame();
  state = 'play'; timeScale = 1; hitStop = 0; acc = 0; shake = 0;
  $('card').hidden = true;
  $('hint').hidden = !!save.thrown;
  $('name').innerHTML = `<b>${level + 1}</b><span>${L.name}</span>`;
  save.level = level; persist();
}

function addBodyVis(b) {
  const g = mk(b.key);
  world3.add(g);
  b.vis = g; b.squash = 0;
  sync(b);
}
function sync(b) {
  const p = b.body.translation(), q = b.body.rotation();
  b.vis.position.set(p.x, p.y, p.z); b.vis.quaternion.set(q.x, q.y, q.z, q.w);
}

// Remaining food waits in a row behind the chef; the next one sits in the chef's hand.
function queueVis() {
  if (chef.held) world3.remove(chef.held);
  for (const q of chef.row || []) world3.remove(q);
  chef.row = []; chef.held = null;
  S.queue.forEach((k, i) => {
    const m = mk(k);
    if (i === 0) { m.position.set(S.hand.x, S.hand.y - .1, 0); chef.held = m; }
    else { m.position.set(L.chef[0] - .35 - (i - 1) * .3, (L.chef[1] || 0), -.35); m.rotation.y = .4 * i; chef.row.push(m); }
    world3.add(m);
  });
}

function puff(p, n, color = '#fff4e2', size = .06) {
  for (let i = 0; i < n; i++) {
    const m = new THREE.Mesh(new THREE.IcosahedronGeometry(size * (.6 + Math.random() * .8), 0), new THREE.MeshStandardMaterial({ color, flatShading: true, transparent: true }));
    m.position.set(p.x, p.y, p.z);
    m.userData.v = new THREE.Vector3((Math.random() - .5) * 1.6, Math.random() * 1.4 + .3, (Math.random() - .5) * 1.2);
    m.userData.life = 1;
    world3.add(m); puffs.push(m);
  }
}

// ---------- input ----------
function planePoint(e) {
  ray.setFromCamera({ x: e.clientX / innerWidth * 2 - 1, y: -(e.clientY / innerHeight) * 2 + 1 }, camera);
  return ray.ray.intersectPlane(plane, new THREE.Vector3());
}
const canThrow = () => state === 'play' && S.queue.length && S.steps - S.lastThrow > .55 / DT && !S.won;
addEventListener('pointerdown', e => {
  if (e.target !== $('c')) return;
  ac();
  const now = performance.now();
  if (now - lastTap < 300 && state === 'play') { lastTap = 0; setLevel(level); return; }
  lastTap = now;
  if (state === 'replay') { endReplay(); return; }
  if (!canThrow()) return;
  const p = planePoint(e);
  if (p) { aim = { start: p, v: null }; chef.play('holding-right'); }
});
addEventListener('pointermove', e => {
  if (!aim) return;
  const p = planePoint(e); if (!p) return;
  const dx = aim.start.x - p.x, dy = aim.start.y - p.y;
  aim.v = Math.hypot(dx, dy) > .12 ? launch(dx, dy) : null;
  if (aim.v) lastTap = 0;
});
addEventListener('pointerup', () => {
  if (!aim) return;
  const v = aim.v; aim = null;
  for (const d of dots) d.visible = false;
  if (!v) { chef.play('idle'); return; }
  doThrow(v.vx, v.vy, v.power);
});

function doThrow(vx, vy, power = 1) {
  if (!canThrow()) return;
  const b = S.throwFood(vx, vy);
  addBodyVis(b);
  flying = b;
  if (ghost) { world3.remove(ghost); ghost = null; }
  b.path = [];
  rec = { from: S.steps, frames: [], events: [] };
  chef.play('attack-melee-right', true, 2.2);
  if (!save.thrown) { save.thrown = 1; persist(); $('hint').hidden = true; }
  sfx.whoosh(power);
  queueVis();
}

// ---------- events ----------
const lastSound = new Map();
function onEvent(ev) {
  if (rec && ev.t !== 'hit') rec.events.push({ f: rec.frames.length, ev });
  if (ev.t === 'hit') {
    const now = performance.now(), b = ev.b;
    if (now - (lastSound.get(b) || 0) > 70) {
      lastSound.set(b, now);
      (b.role === 'plate' ? sfx.clink : b.role === 'food' ? sfx.thud : sfx.knock)(ev.m);
    }
    b.squash = Math.min(1, ev.m / 6);
    if (ev.m > 3.5) { puff(b.body.translation(), 3, '#fff4e2', .04); shake = Math.max(shake, Math.min(.05, ev.m * .006)); }
  } else if (ev.t === 'smash') {
    const b = ev.b, p = b.body.translation();
    world3.remove(b.vis); const inner = mk('plateBroke'); b.vis = inner; world3.add(inner); sync(b);
    sfx.smash(); puff(p, 7, '#ffffff', .05); hitStop = .05; shake = Math.max(shake, .05);
  } else if (ev.t === 'catch') {
    const a = ev.c.actor, f = ev.b.vis;
    a.play('emote-yes', true, 1.1);
    a.eating = { m: f, t: 0 };
    f.position.set(0, .3, .2); f.quaternion.identity(); f.scale.setScalar(.85);
    a.g.add(f);
    a.bubble.userData.pop = 1;
    sfx.nom(); hitStop = .085; shake = Math.max(shake, .03);
    puff(ev.c.at, 6, '#f2b134', .035);
    if (flying === ev.b) flying = null;
  } else if (ev.t === 'no') {
    ev.c.actor.play('emote-no', true, 1.2); sfx.huh();
  } else if (ev.t === 'win') {
    save.done[level] = 1; persist();
    slowUntil = performance.now() + 1100; timeScale = .3;
    setTimeout(sfx.win, 350);
    setTimeout(() => { state = 'won'; $('card').hidden = false; $('next').hidden = false; $('replay').hidden = !rec; }, 1500);
  } else if (ev.t === 'lose') {
    setTimeout(() => { if (S.lost && state === 'play') { state = 'lost'; $('card').hidden = false; $('next').hidden = true; $('replay').hidden = true; } }, 500);
  }
}

function record() {
  if (!rec || rec.frames.length > 1800) return;
  const f = [];
  for (const b of S.bodies) if (b.alive && b.dyn) { const p = b.body.translation(), q = b.body.rotation(); f.push(b.id, p.x, p.y, p.z, q.x, q.y, q.z, q.w); }
  rec.frames.push(f);
}

// Replay: the last throw again at half speed, with the camera close behind the food.
function startReplay() {
  if (!rec || !rec.frames.length) return;
  $('card').hidden = true;
  state = 'replay';
  replay = { i: 0, t: 0, cam: camera.position.clone(), at: view.at.clone(), seen: new Set() };
  for (const a of actors) if (a.c) { a.play('idle'); a.bubble.visible = true; a.bubble.scale.setScalar(1); a.bubble.userData.pop = 0; if (a.eating) { a.g.remove(a.eating.m); a.eating = null; } }
}
function endReplay() {
  if (!replay) return;
  replay = null; state = 'won';
  for (const b of S.bodies) if (b.vis) { b.vis.visible = b.alive; if (b.alive && b.dyn) sync(b); }
  for (const a of actors) if (a.c) a.bubble.visible = false;
  $('card').hidden = false;
}
function stepReplay(dt) {
  replay.t += dt * .5 / DT;
  while (replay.i < replay.t && replay.i < rec.frames.length) {
    const f = rec.frames[replay.i];
    for (const b of S.bodies) if (b.vis) b.vis.visible = false;
    for (let k = 0; k < f.length; k += 8) {
      const b = S.bodies[f[k]];
      if (!b.vis.parent || b.vis.parent !== world3) { b.vis = mk(b.key); world3.add(b.vis); }
      b.vis.visible = true; b.vis.position.set(f[k + 1], f[k + 2], f[k + 3]); b.vis.quaternion.set(f[k + 4], f[k + 5], f[k + 6], f[k + 7]);
    }
    for (const e of rec.events) if (e.f === replay.i && !replay.seen.has(e)) {
      replay.seen.add(e);
      if (e.ev.t === 'catch') { e.ev.c.actor.play('emote-yes', true, .6); e.ev.c.actor.bubble.userData.pop = 1; sfx.nom(); }
      if (e.ev.t === 'no') { e.ev.c.actor.play('emote-no', true, .6); sfx.huh(); }
      if (e.ev.t === 'smash') sfx.smash();
    }
    replay.i++;
  }
  const f = rec.frames[Math.min(replay.i, rec.frames.length - 1)] || [];
  let fx = null;
  for (let k = 0; k < f.length; k += 8) if (S.bodies[f[k]].role === 'food' && f[k] === rec.focus) fx = new THREE.Vector3(f[k + 1], f[k + 2], f[k + 3]);
  if (fx) {
    replay.at.lerp(fx, .1);
    replay.cam.lerp(tmp.copy(view.pos).sub(view.at).multiplyScalar(.5).add(replay.at), .08);
  }
  camera.position.copy(replay.cam); camera.lookAt(replay.at);
  if (replay.i >= rec.frames.length) endReplay();
}

// ---------- loop ----------
function tick() {
  const dt = Math.min(clock.getDelta(), 1 / 20), now = performance.now();
  if (state === 'replay') stepReplay(dt);
  else if (state !== 'load') {
    if (slowUntil && now > slowUntil) { slowUntil = 0; timeScale = 1; }
    if (hitStop > 0) hitStop -= dt;
    else {
      acc += dt * timeScale;
      let n = 0;
      while (acc >= DT && n++ < 10) {
        acc -= DT;
        for (const ev of S.step()) onEvent(ev);
        if (rec) record();
        if (flying && flying.alive && S.steps % 3 === 0) flying.path.push(flying.body.translation());
      }
    }
    for (const b of S.bodies) if (b.alive && b.dyn) {
      sync(b);
      b.squash *= .82;
      const s = 1 + b.squash * .25 * Math.sin(now * .05);
      b.vis.userData.inner && b.vis.userData.inner.scale.setScalar(CAT[b.key][1] * s);
    }
    if (flying && (!flying.alive || S.steps - S.lastThrow > 4 / DT)) flying = null;
    if (!flying && rec && rec.from !== undefined && !rec.closed && S.steps - S.lastThrow > 30) closeThrow();
    camera.position.copy(view.pos).add(tmp.set((Math.random() - .5) * shake, (Math.random() - .5) * shake, 0));
    camera.lookAt(view.at);
    shake = calm ? 0 : shake * .86;
  }
  // aim dots: the first stretch of the arc only, so the player still has to judge the rest
  if (aim && aim.v) {
    dots.forEach((d, i) => {
      const t = (i + 1) * .035;
      d.visible = true;
      d.position.set(S.hand.x + aim.v.vx * t, S.hand.y - .02 + aim.v.vy * t + .5 * G * t * t, 0);
      d.scale.setScalar(.17 * (1 - i / 22));
      d.material.opacity = 1 - i / 15;
    });
  }
  for (const a of actors) {
    // undo last frame's head turn first: clips without a head track would otherwise keep adding to it
    if (a.head && a.applied) a.head.quaternion.multiply(a.applied.invert());
    a.mixer.update(dt * (state === 'replay' ? .5 : 1) * (timeScale < 1 ? .5 : 1));
    if (a.back && now > a.back && a.cur) { a.back = 0; a.play(a === chef && aim ? 'holding-right' : 'idle'); }
    const target = flying && flying.alive ? flying.vis.position : null;
    if (a.head) {
      let yaw = 0, pitch = 0;
      if (target) {
        const dx = target.x - a.x, dz = target.z - .2, dy = target.y - (a.y + .55);
        yaw = THREE.MathUtils.clamp(Math.atan2(dx, Math.max(.3, dz + .8)) - a.turn, -.9, .9);
        pitch = THREE.MathUtils.clamp(Math.atan2(dy, Math.abs(dx) + .3), -.5, .6);
      }
      a.look.slerp(new THREE.Quaternion().setFromEuler(new THREE.Euler(-pitch, yaw, 0)), .15);
      a.head.quaternion.multiply(a.look);
      a.applied = a.look.clone();
    }
    if (a.eating) {
      a.eating.t += dt;
      const k = Math.max(0, 1 - a.eating.t / 1.6);
      a.eating.m.scale.setScalar(.85 * k * (1 + .12 * Math.sin(a.eating.t * 22)));
      if (Math.random() < dt * 8 && k > .1) puff(tmp.set(a.x + .05, a.y + .4, .2), 1, '#e9b872', .02);
      if (k === 0) { a.g.remove(a.eating.m); a.eating = null; }
    }
    if (a.bubble) {
      const b = a.bubble;
      b.userData.food.rotation.y += dt * .9;
      b.position.y = a.y + 1.02 + Math.sin(now * .002 + a.x) * .015;
      if (b.userData.pop) {
        b.userData.pop += dt * 6;
        const s = Math.max(0, 1.15 - b.userData.pop * .5 + (b.userData.pop < 1.4 ? .2 : 0));
        b.scale.setScalar(s); if (s <= 0) b.visible = false;
      }
    }
  }
  if (chef && chef.held && !aim) chef.held.rotation.y += dt;
  for (let i = puffs.length - 1; i >= 0; i--) {
    const p = puffs[i], u = p.userData;
    u.life -= dt * 1.6; u.v.y -= dt * 3;
    p.position.addScaledVector(u.v, dt); p.scale.setScalar(Math.max(.01, .4 + u.life));
    p.material.opacity = Math.max(0, u.life);
    if (u.life <= 0) { world3.remove(p); puffs.splice(i, 1); }
  }
  renderer.render(scene, camera);
  requestAnimationFrame(tick);
}

// After each throw, its path stays as a faint dashed line until the next throw.
function closeThrow() {
  rec.closed = true;
  const b = S.bodies[S.bodies.length - 1];
  rec.focus = b.id;
  if (!b.path || b.path.length < 2) return;
  const geo = new THREE.BufferGeometry().setFromPoints(b.path.map(p => new THREE.Vector3(p.x, p.y + .08, p.z)));
  ghost = new THREE.Line(geo, new THREE.LineDashedMaterial({ color: '#3a2a22', dashSize: .06, gapSize: .06, transparent: true, opacity: .35 }));
  ghost.computeLineDistances();
  world3.add(ghost);
}

// ---------- menus ----------
function menu() {
  $('levels').innerHTML = LEVELS.map((l, i) => `<button class="lv ${save.done[i] ? 'done' : ''}" data-i="${i}"><i>${save.done[i] ? '&#10003;' : i + 1}</i>${l.name}</button>`).join('');
  $('menu').hidden = false;
}
$('levels').addEventListener('click', e => { const b = e.target.closest('.lv'); if (b) { sfx.tap(); $('menu').hidden = true; setLevel(+b.dataset.i); } });
$('menu').addEventListener('pointerdown', e => { if (e.target === $('menu')) $('menu').hidden = true; });
$('name').onclick = () => { ac(); sfx.tap(); menu(); };
$('redo').onclick = () => { ac(); sfx.tap(); setLevel(level); };
$('again').onclick = () => { sfx.tap(); setLevel(level); };
$('next').onclick = () => { sfx.tap(); setLevel(level + 1); };
$('replay').onclick = () => { sfx.tap(); if (rec && !rec.focus) closeThrow(); startReplay(); };
addEventListener('resize', () => { renderer.setSize(innerWidth, innerHeight, false); if (L) frame(); });
addEventListener('keydown', e => { if (e.key === 'r') setLevel(level); if (e.key === 'n') setLevel(level + 1); });

// ---------- start ----------
await RAPIER.init();
await Promise.all(Object.keys(MODELS).map(k => new Promise((res, rej) => loader.parse(bytes(MODELS[k]), '', g => { proto[k] = g; res(); }, rej))));
renderer.setSize(innerWidth, innerHeight, false);
setLevel(save.level || 0);
$('load').classList.add('gone');
requestAnimationFrame(tick);
window.__rush = { get S() { return S; }, get state() { return state; }, setLevel, doThrow, get level() { return level; } };
