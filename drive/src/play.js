// ---------- play: car, camera, input, physics loop, events, ghosts, props, effects, sound ----------
const STORE = 'sundaydrive.v1';
const save = (() => { try { return JSON.parse(localStorage.getItem(STORE)) || {}; } catch { return {}; } })();
save.heads ||= {}; save.best ||= {}; save.seen ||= ''; save.friend ||= {};
if (save.sound === undefined) save.sound = true;
if (!save.car) save.car = 'sedan-sports';
const persist = () => { try { localStorage.setItem(STORE, JSON.stringify(save)); } catch {} };
const fmt = t => `${Math.floor(t / 60)}:${(t % 60).toFixed(2).padStart(5, '0')}`;
const fmtD = d => (d < 0 ? '-' : '+') + Math.abs(d).toFixed(2);
const calm = matchMedia('(prefers-reduced-motion: reduce)').matches;
const CAR_SCALE = 1.76;
const UNLOCK = ['sedan-sports', 'hatchback-sports', 'sedan', 'taxi', 'kart-oobi', 'suv', 'van', 'truck', 'police', 'suv-luxury', 'delivery',
  'ambulance', 'firetruck', 'garbage-truck', 'tractor', 'race', 'race-future'];
const unlocked = key => UNLOCK.indexOf(key) < 5 + Math.floor(Object.keys(save.heads).length / 2);

let W, EV, car, carMesh, ghost = null;

// ---------- car model: wheels steer on a pivot and spin on their own axle (no wobble) ----------
function carModel(key, ghostTint) {
  const o = mk('car:' + key);
  const g = new THREE.Group(), body = new THREE.Group();
  g.add(body); body.add(o); o.scale.setScalar(CAR_SCALE);
  // each wheel: a steering pivot at the wheel's measured centre, a spinner inside it, the wheel inside that, so it
  // spins about its own hub whatever offsets the model's nodes carry
  const wheels = [], front = [];
  o.updateMatrixWorld(true);
  for (const n of ['wheel-front-left', 'wheel-front-right', 'wheel-back-left', 'wheel-back-right']) {
    const w = o.getObjectByName(n);
    if (!w) continue;
    const parent = w.parent, c = new THREE.Box3().setFromObject(w).getCenter(new THREE.Vector3());
    parent.worldToLocal(c);
    const pivot = new THREE.Group(), spin = new THREE.Group();
    pivot.position.copy(c); parent.add(pivot); pivot.add(spin); spin.add(w); w.position.sub(c);
    wheels.push(spin); if (n.includes('front')) front.push(pivot);
  }
  o.traverse(m => {
    if (!m.isMesh) return;
    if (ghostTint) { m.material = m.material.clone(); m.material.transparent = true; m.material.opacity = .4; m.material.depthWrite = false; m.material.emissive = new THREE.Color(ghostTint); m.castShadow = false; }
  });
  g.userData = { body, wheels, front, bob: 0, bobV: 0, pitch: 0, roll: 0 };
  scene.add(g);
  return g;
}
function poseCar(g, c, dt) {
  const u = g.userData, P = CARS[c.model];
  g.position.set(c.x, c.y, c.z);
  g.rotation.set(0, Math.atan2(c.hx, c.hz), 0);
  for (const w of u.wheels) w.rotation.x += c.f * dt / .55;
  for (const p of u.front) p.rotation.y = c.s * .5;
  // body: pitch and roll from the ground under the wheels, plus a little suspension spring
  let pitch, roll;
  if (!c.air) {
    const f = groundAt(W, c.x + c.hx * 1.6, c.z + c.hz * 1.6), b = groundAt(W, c.x - c.hx * 1.6, c.z - c.hz * 1.6);
    const l = groundAt(W, c.x + c.hz * 1, c.z - c.hx * 1), r = groundAt(W, c.x - c.hz * 1, c.z + c.hx * 1);
    pitch = -Math.atan2(f - b, 3.2); roll = Math.atan2(l - r, 2);
  } else { pitch = THREE.MathUtils.clamp(-c.vy / Math.max(8, c.speed) * .6, -.4, .4); roll = u.roll; }
  const lat = c.vx * -c.hz + c.vz * c.hx;
  roll += THREE.MathUtils.clamp(-lat * .012 - c.s * c.f * .002, -.12, .12) * P.bounce;
  u.pitch += (pitch - u.pitch) * Math.min(1, dt * 10); u.roll += (roll - u.roll) * Math.min(1, dt * 8);
  u.bobV += (-u.bob * 140 - u.bobV * 9) * dt; u.bob += u.bobV * dt;
  u.body.rotation.set(u.pitch, 0, u.roll); u.body.position.y = u.bob * .15 * P.bounce;
}

// ---------- sound: engine and tyres made here, impacts from Kenney's Impact Sounds ----------
let AC = null, master, noise, eng = null;
const buffers = {};
function ac() {
  if (AC) { if (AC.state === 'suspended') AC.resume(); return AC; }
  try { AC = new (window.AudioContext || window.webkitAudioContext)(); } catch { return null; }
  master = AC.createGain(); master.gain.value = save.sound ? .9 : 0; master.connect(AC.destination);
  noise = AC.createBuffer(1, AC.sampleRate * 2, AC.sampleRate);
  const d = noise.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  for (const [k, b64] of Object.entries(SOUNDS)) AC.decodeAudioData(bytes(b64)).then(b => { buffers[k] = b; }, () => {});
  // engine: a sawtooth and a sub square through a resonant lowpass; tyres and wind: filtered noise
  const out = AC.createGain(); out.gain.value = 0; out.connect(master);
  const lp = AC.createBiquadFilter(); lp.type = 'lowpass'; lp.Q.value = 5; lp.connect(out);
  const o1 = AC.createOscillator(), o2 = AC.createOscillator(); o1.type = 'sawtooth'; o2.type = 'square';
  const g2 = AC.createGain(); g2.gain.value = .45; o1.connect(lp); o2.connect(g2); g2.connect(lp); o1.start(); o2.start();
  const mk = (type, f, q) => { const s = AC.createBufferSource(); s.buffer = noise; s.loop = true; const fl = AC.createBiquadFilter(); fl.type = type; fl.frequency.value = f; fl.Q.value = q; const g = AC.createGain(); g.gain.value = 0; s.connect(fl); fl.connect(g); g.connect(master); s.start(); return { g, fl }; };
  eng = { out, lp, o1, o2, tyre: mk('bandpass', 1500, 7), wind: mk('lowpass', 700, .5) };
  return AC;
}
function play(name, vol = 1, rate = 1) {
  const a = ac(); if (!a || !buffers[name]) return;
  const s = a.createBufferSource(), g = a.createGain(); s.buffer = buffers[name]; s.playbackRate.value = rate * (.92 + Math.random() * .16);
  g.gain.value = vol; s.connect(g); g.connect(master); s.start();
}
function tone(f, len = .12, vol = .15, type = 'sine', delay = 0) {
  const a = ac(); if (!a) return;
  const t = a.currentTime + delay, o = a.createOscillator(), g = a.createGain();
  o.type = type; o.frequency.value = f; g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + .01); g.gain.exponentialRampToValueAtTime(.001, t + len);
  o.connect(g); g.connect(master); o.start(t); o.stop(t + len + .05);
}
function whoosh(vol = .3, dur = .6) {
  const a = ac(); if (!a) return;
  const t = a.currentTime, s = a.createBufferSource(), f = a.createBiquadFilter(), g = a.createGain();
  s.buffer = noise; f.type = 'bandpass'; f.Q.value = 1.2; f.frequency.setValueAtTime(300, t); f.frequency.exponentialRampToValueAtTime(2600, t + dur);
  g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + .05); g.gain.exponentialRampToValueAtTime(.001, t + dur);
  s.connect(f); f.connect(g); g.connect(master); s.start(t); s.stop(t + dur + .05);
}
function engineSound(c, throttle) {
  if (!eng) return;
  const t = AC.currentTime, P = CARS[c.model], v = Math.abs(c.f), top = P.vmax + 12;
  // five gears spread over the car's speed range
  const g = Math.min(4, Math.floor(v / top * 5.2)), lo = g * top / 5.2, frac = Math.min(1, (v - lo) / (top / 5.2));
  const f = 38 + g * 5 + frac * 70 + (c.boosting ? 14 : 0) + (c.air ? 25 : 0);
  eng.o1.frequency.setTargetAtTime(f, t, .04); eng.o2.frequency.setTargetAtTime(f / 2, t, .04);
  eng.lp.frequency.setTargetAtTime(380 + frac * 700 + throttle * 500, t, .06);
  eng.out.gain.setTargetAtTime(.05 + throttle * .05, t, .1);
  const sk = c.air || !c.onRoad ? 0 : Math.min(1, (c.drift ? .55 : 0) + Math.max(0, c.slip - 2) / 6);
  eng.tyre.g.gain.setTargetAtTime(sk * .09, t, .05);
  eng.wind.g.gain.setTargetAtTime(Math.min(.12, c.speed * c.speed * .00005), t, .2);
}

// ---------- particles and skid marks ----------
const softTex = (() => {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const x = c.getContext('2d'), g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(.5, 'rgba(255,255,255,.5)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g; x.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
})();
const fx = [];
function puff(p, color, size, life, v, add = false, grow = 2.2) {
  if (fx.length > 260) return;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: softTex, color, transparent: true, depthWrite: false, blending: add ? THREE.AdditiveBlending : THREE.NormalBlending }));
  s.position.copy(p); s.scale.setScalar(size); s.userData = { v, life, max: life, size, grow };
  scene.add(s); fx.push(s);
}
function stepParts(dt) {
  for (let i = fx.length - 1; i >= 0; i--) {
    const s = fx[i], u = s.userData;
    u.life -= dt; s.position.addScaledVector(u.v, dt); u.v.multiplyScalar(1 - 1.5 * dt);
    const k = Math.max(0, u.life / u.max);
    s.scale.setScalar(u.size * (1 + (1 - k) * u.grow)); s.material.opacity = k * .75;
    if (u.life <= 0) { scene.remove(s); s.material.dispose(); fx.splice(i, 1); }
  }
}
const SKIDS = 3000;
const skidMesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(.38, 1).rotateX(-Math.PI / 2),
  new THREE.MeshBasicMaterial({ color: '#25262b', transparent: true, opacity: .42, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4 }), SKIDS);
skidMesh.count = 0; skidMesh.frustumCulled = false;
let skidN = 0;
function skid(x, y, z, yaw) {
  skidMesh.setMatrixAt(skidN % SKIDS, M4.compose(V3.set(x, y + .06, z), Q4.setFromAxisAngle(UPV, yaw), S3.set(1, 1, 1)));
  skidN++; skidMesh.count = Math.min(SKIDS, skidN); skidMesh.instanceMatrix.needsUpdate = true;
}

// ---------- knockable props: fences, street lights, cones and barriers ----------
const props = { list: [], meshes: {}, grid: new Map() };
function buildProps() {
  // a few roadworks: cones in a line and a barrier on straight town streets
  for (let k = 0; k < 40; k++) {
    const i = Math.floor(hash(k, 3, 55) * N), j = Math.floor(hash(k, 4, 55) * N), c = j * N + i;
    if (!W.road[c] || W.kind[c] !== 1 || !W.land(i, j)) continue;
    const horiz = W.road[c + 1] && W.road[c - 1];
    for (let n = 0; n < 4; n++) {
      const a = (n - 1.5) * 2.4, x = (i + .5) * T + (horiz ? a : 2.4), z = (j + .5) * T + (horiz ? 2.4 : a);
      W.props.push(['cone', x, z, 0, T]);
    }
    W.props.push(['barrier', (i + .5) * T + (horiz ? 5 : 2.4), (j + .5) * T + (horiz ? 2.4 : 5), horiz ? 0 : 1, T]);
  }
  const by = {};
  for (const [key, x, z, rot, s] of W.props) {
    const p = { key, x, y: groundAt(W, x, z), z, yaw: rot * Math.PI / 2, s, ox: x, oz: z, oy: 0, oyaw: rot * Math.PI / 2, q: new THREE.Quaternion(), v: null, idx: 0 };
    p.oy = p.y; p.q.setFromAxisAngle(UPV, p.yaw);
    (by[key] ||= []).push(p); props.list.push(p);
    const gk = Math.floor(x / T) + ',' + Math.floor(z / T);
    if (!props.grid.has(gk)) props.grid.set(gk, []); props.grid.get(gk).push(p);
  }
  for (const [key, list] of Object.entries(by)) {
    props.meshes[key] = parts(key).map(pt => {
      const im = new THREE.InstancedMesh(pt.geo, pt.mat, list.length);
      im.castShadow = true; im.receiveShadow = true; im.frustumCulled = false;
      scene.add(im); return im;
    });
    list.forEach((p, i) => { p.idx = i; propMatrix(p); });
  }
}
function propMatrix(p) {
  M4.compose(V3.set(p.x, p.y, p.z), p.q, S3.set(p.s, p.s, p.s));
  for (const im of props.meshes[p.key]) { im.setMatrixAt(p.idx, M4); im.instanceMatrix.needsUpdate = true; }
}
const flying = new Set();
function knockProps(c, dt) {
  if (c.speed > 2.5) {
    const i0 = Math.floor(c.x / T), j0 = Math.floor(c.z / T);
    for (let b = -1; b <= 1; b++) for (let a = -1; a <= 1; a++) for (const p of props.grid.get((i0 + a) + ',' + (j0 + b)) || []) {
      if (p.v) continue;
      const dx = p.x - c.x, dz = p.z - c.z;
      if (dx * dx + dz * dz > 7 || Math.abs(p.y - c.y) > 3) continue;
      const k = .8 + Math.random() * .5;
      p.v = new THREE.Vector3(c.vx * k + dx * 2, 3 + c.speed * .18 + Math.random() * 3, c.vz * k + dz * 2);
      p.w = new THREE.Vector3(Math.random() - .5, Math.random() - .5, Math.random() - .5).normalize().multiplyScalar(4 + c.speed * .3);
      p.t = 0; flying.add(p);
      play(p.key === 'cone' ? 'soft' : p.key === 'fence' ? 'wood' : 'metal', Math.min(.8, .25 + c.speed * .02));
      shake = Math.max(shake, .08);
    }
  }
  for (const p of flying) {
    p.t += dt; p.v.y -= G * dt;
    p.x += p.v.x * dt; p.y += p.v.y * dt; p.z += p.v.z * dt;
    p.q.premultiply(Q4.setFromAxisAngle(V3.copy(p.w).normalize(), p.w.length() * dt));
    const g = groundAt(W, p.x, p.z);
    if (p.y < g) { p.y = g; p.v.y *= -.3; p.v.x *= .6; p.v.z *= .6; p.w.multiplyScalar(.6); }
    propMatrix(p);
    if (p.t > 4) flying.delete(p);
  }
}
// knocked props quietly stand back up once you're far away
function tidyProps(c) {
  for (const p of props.list) if (p.v && !flying.has(p) && Math.hypot(p.ox - c.x, p.oz - c.z) > 260) {
    p.x = p.ox; p.z = p.oz; p.y = p.oy; p.q.setFromAxisAngle(UPV, p.oyaw); p.v = null; propMatrix(p);
  }
}

// ---------- the train: shuttles along the railway, a locomotive at each end; free roam only, so ghosts stay exact ----------
const train = { cars: [], speed: 16, len: 0 };
function buildTrain() {
  const keys = ['loco', 'wagonA', 'wagonB', 'wagonC', 'loco'];
  train.len = (W.rail.i1 - W.rail.i0) * T - 50;
  keys.forEach((k, n) => {
    const m = mk(k); m.scale.setScalar(3);
    const g = new THREE.Group(); g.add(m); if (n === keys.length - 1) m.rotation.y = Math.PI;
    scene.add(g); train.cars.push(g);
  });
}
function stepTrain(now) {
  const L = train.len, u = (now / 1000 * train.speed) % (2 * L), pos = u < L ? u : 2 * L - u, dir = u < L ? 1 : -1;
  const x0 = W.rail.i0 * T + 25, z = (W.rail.j + .5) * T;
  train.cars.forEach((g, n) => {
    const x = x0 + pos - n * 9 + 18;
    g.position.set(x, groundAt(W, x, z) + .3, z); g.rotation.y = -Math.PI / 2;
    g.userData.x = x; g.userData.z = z;
  });
  // in free roam the train shoves the car aside (events never meet it, so their replays stay exact)
  if (mode !== 'free' || Math.abs(car.z - z) > 6) return;
  for (const g of train.cars) {
    const dx = car.x - g.userData.x, dz = car.z - g.userData.z;
    if (Math.abs(dx) < 6.5 && Math.abs(dz) < 3.6) {
      const side = dz < 0 ? -1 : 1, push = 3.6 - Math.abs(dz);
      car.z += side * push; car.vz = side * 9; car.vx = dir * train.speed * 1.2;
      play('crash', .7); play('metal', .5); shake = Math.max(shake, .5);
      break;
    }
  }
}

// ---------- input: keyboard, gamepad, touch ----------
const keys = {};
let steerVal = 0, camMode = 0, heldR = 0;
const input = { th: 0, hb: 0, bo: 0, rs: 0, st: 0 };
const touch = { steer: null, gas: 0, brake: 0, hb: 0, bo: 0, on: false };
addEventListener('keydown', e => {
  if (e.repeat) return;
  keys[e.code] = 1; ac();
  if (e.code === 'KeyM') toggleMap();
  else if (e.code === 'KeyG') toggleGarage();
  else if (e.code === 'KeyC') { camMode = (camMode + 1) % 3; save.cam = camMode; persist(); }
  else if (e.code === 'KeyE') tryStart();
  else if (e.code === 'Escape') escape();
  else if (e.code === 'KeyH' || e.code === 'Slash') toggleHelp();
  if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
});
addEventListener('keyup', e => { keys[e.code] = 0; });
addEventListener('blur', () => { for (const k in keys) keys[k] = 0; });
function readInput(dt) {
  const k = c => keys[c] ? 1 : 0;
  let target = (k('KeyD') || k('ArrowRight')) - (k('KeyA') || k('ArrowLeft'));
  let th = (k('KeyW') || k('ArrowUp')) - (k('KeyS') || k('ArrowDown')), hb = k('Space'), bo = k('ShiftLeft') || k('ShiftRight') || k('KeyN'), rs = k('KeyR');
  let analog = null;
  const pads = navigator.getGamepads ? navigator.getGamepads() : [];
  for (const gp of pads) {
    if (!gp) continue;
    const ax = gp.axes[0] || 0;
    if (Math.abs(ax) > .12) analog = ax;
    const rt = gp.buttons[7] ? gp.buttons[7].value : 0, lt = gp.buttons[6] ? gp.buttons[6].value : 0;
    if (rt > .2) th = 1; if (lt > .2) th = -1;
    if (gp.buttons[0] && gp.buttons[0].pressed) hb = 1;
    if (gp.buttons[1] && gp.buttons[1].pressed) bo = 1;
    if (gp.buttons[3] && gp.buttons[3].pressed) rs = 1;
  }
  if (touch.on) {
    if (touch.steer !== null) analog = touch.steer;
    th = touch.brake ? -1 : touch.gas ? 1 : th; hb = hb || touch.hb; bo = bo || touch.bo;
  }
  if (analog !== null) steerVal = analog;
  else {
    // keys ease the wheel in over about a third of a second and let it come back faster
    const rate = target === 0 ? 6 : Math.sign(target) !== Math.sign(steerVal) && steerVal !== 0 ? 9 : 3.2;
    steerVal += THREE.MathUtils.clamp(target - steerVal, -rate * dt, rate * dt);
  }
  input.st = Math.round(THREE.MathUtils.clamp(steerVal, -1, 1) * 8);
  // reset fires once per press, not every step while the key is held
  input.th = th; input.hb = hb; input.bo = bo; input.rs = rs && !heldR ? 1 : 0; heldR = rs;
}

// ---------- events ----------
let mode = 'free', active = null, countT = 0, gate = null, rec = [], lastTrap = {}, drift = null, takeoff = null, recStep = 0;
const beams = [];
function beam(x, z, color, h = 70, r = 2.6) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, 16, 1, true),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: .32, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false }));
  m.position.set(x, groundAt(W, x, z) + h / 2, z); scene.add(m); beams.push(m); return m;
}
function ring(x, z, color, r = 9) {
  const m = new THREE.Mesh(new THREE.RingGeometry(r - 1.2, r, 48).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: .85, depthWrite: false }));
  m.position.set(x, groundAt(W, x, z) + .15, z); scene.add(m); return m;
}
const ECOL = { sprint: '#ffd23f', trap: '#ff4d5a', drift: '#a35bff', jump: '#ff8c1a' };
function buildEvents() {
  for (const e of EV.list) {
    if (e.type === 'sprint') { e.beam = beam(e.start.x, e.start.z, ECOL.sprint); e.ringM = ring(e.start.x, e.start.z, ECOL.sprint); }
    else if (e.type === 'trap') { e.beam = beam(e.x, e.z, ECOL.trap, 40, 1.6); const s = mk('signal'); s.position.set(e.x + 6, groundAt(W, e.x, e.z), e.z + 6); s.scale.setScalar(T); scene.add(s); }
    else if (e.type === 'drift') {
      const [x0, z0, x1, z1] = e.box, pts = [[x0, z0], [x1, z0], [x1, z1], [x0, z1], [x0, z0]].map(([x, z]) => new THREE.Vector3(x, groundAt(W, x, z) + 1.2, z));
      scene.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: ECOL.drift })));
      for (const p of pts.slice(0, 4)) beam(p.x, p.z, ECOL.drift, 30, 1.2);
    } else if (e.type === 'jump') e.beam = beam(e.x, e.z, ECOL.jump, 45, 1.8);
  }
  // the stone heads, painted gold
  const gold = new THREE.MeshStandardMaterial({ color: '#f2c14e', metalness: .7, roughness: .3, emissive: '#5a3a00', emissiveIntensity: .3 });
  for (const h of EV.heads) {
    const m = mk('head'); m.traverse(o => { if (o.isMesh) o.material = gold; }); m.scale.setScalar(5);
    m.position.set(h.x, groundAt(W, h.x, h.z) - .1, h.z); m.rotation.y = hash(h.x | 0, h.z | 0, 1) * 6.28;
    m.visible = !save.heads[h.id]; h.mesh = m; scene.add(m);
  }
}
let archA = null, archB = null;
function showGates() {
  for (const a of [archA, archB]) if (a) scene.remove(a);
  archA = archB = null;
  if (!active || !gate || gate.done) return;
  const put = (g, next) => {
    const a = mk('arch'), dx = next[0] - g[0], dz = next[1] - g[1];   // faces along the route
    a.scale.set(active.id === 'gp' ? 22 : 15, 15, 15); a.position.set(g[0], groundAt(W, g[0], g[1]), g[1]);
    a.rotation.y = Math.atan2(dx, dz) + Math.PI / 2;
    const b = new THREE.Mesh(new THREE.CylinderGeometry(3, 3, 60, 16, 1, true), new THREE.MeshBasicMaterial({ color: '#ffd23f', transparent: true, opacity: .3, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
    b.position.set(g[0], groundAt(W, g[0], g[1]) + 30, g[1]); a.add(b); b.scale.setScalar(1 / 15);
    b.position.set(0, 2, 0); scene.add(a); return a;
  };
  const g = active.gates[gate.gi];
  archA = put(g, [g[0] + g[2], g[1] + g[3]]);
}
function nearestStart() {
  let best = null, bd = 1e9;
  for (const e of EV.list) if (e.type === 'sprint') { const d = Math.hypot(e.start.x - car.x, e.start.z - car.z); if (d < bd) { bd = d; best = e; } }
  return bd < 13 ? best : null;
}
function tryStart() { if (mode === 'free') { const e = nearestStart(); if (e) begin(e); } }
function begin(e, ghostRow) {
  active = e; mode = 'count'; countT = 0; rec = []; recStep = 0;
  respawn(W, car, e.start); car.steps = 0; car.meter = .3;
  camPos.set(car.x - car.hx * 10, car.y + 4.5, car.z - car.hz * 10); camAt.set(car.x + car.hx * 5, car.y + 1.3, car.z + car.hz * 5);
  gate = { gi: 0, done: false, time: 0, split: 0 };
  if (ghost) { scene.remove(ghost.mesh); ghost = null; }
  const row = ghostRow || save.best[e.id] || null;
  if (row && row.inputs) {
    const gc = makeCar(W, e.start, row.car || save.car);
    ghost = { c: gc, inputs: decodeInputs(row.inputs), mesh: carModel(row.car || save.car, ghostRow ? '#ff7ab8' : '#6fd0ff'), st: { gi: 0, done: false }, splits: [], who: ghostRow ? ghostRow.who : 'Your best' };
    // the reference splits: when the ghost reached each gate
    const sc = makeCar(W, e.start, row.car || save.car), sst = { gi: 0, done: false };
    for (let k = 0; k < 120 * 600 && !sst.done; k++) { stepCar(W, sc, unpackInput(ghost.inputs[Math.floor(k / IN_EVERY)] ?? 0)); const before = sst.gi; runGates(e, sc, sst); if (sst.gi > before) ghost.splits[sst.gi] = sc.steps; }
  }
  uiEvent(e);
  showGates();
}
function escape() {
  if ($('mapsheet').hidden === false) return toggleMap();
  if ($('garage').hidden === false) return toggleGarage();
  if ($('help').hidden === false) return toggleHelp();
  if ($('results').hidden === false) return closeResults();
  if (mode === 'count' || mode === 'event') endEvent(false);
}
function endEvent(finished) {
  mode = finished ? 'results' : 'free';
  if (ghost) { scene.remove(ghost.mesh); ghost = null; }
  showGates(); uiEvent(null);
  if (!finished) active = null;
}
function finishEvent() {
  const e = active, time = gate.time, prev = save.best[e.id];
  const rle = encodeInputs(rec);
  // keep it only if the recording replays to the same finish (it always should; this keeps ghosts honest)
  const check = verifyRun(e, save.car, rle);
  const isBest = check !== null && Math.abs(check - time) < 1e-9 && (!prev || time < prev.time);
  if (isBest) { save.best[e.id] = { time, inputs: rle, car: save.car }; persist(); pushBests(); }
  play('bell', .6); tone(1046, .5, .12, 'triangle', .1);
  endEvent(true);
  showResults(e, { time, prev, isBest });
}
function verifyRun(e, model, rle, limit = 120 * 600) {
  const codes = decodeInputs(rle), c = makeCar(W, e.start, model), st = { gi: 0, done: false };
  for (let k = 0; k < limit && !st.done; k++) { stepCar(W, c, unpackInput(codes[Math.floor(k / IN_EVERY)] ?? 0)); runGates(e, c, st); }
  return st.done ? st.time : null;
}

// passive events: speed traps, drift zones, jumps, heads, discovery
const SEEN = 30, seen = new Uint8Array(SEEN * SEEN);
for (let k = 0; k < Math.min(save.seen.length, SEEN * SEEN); k++) seen[k] = save.seen[k] === '1' ? 1 : 0;
let seenDirty = 0;
function passive(dt, evs) {
  // discovery: the 96 m cells around you
  const ci = Math.floor(car.x / (SIZE / SEEN)), cj = Math.floor(car.z / (SIZE / SEEN));
  for (let b = -1; b <= 1; b++) for (let a = -1; a <= 1; a++) { const i = ci + a, j = cj + b; if (i >= 0 && j >= 0 && i < SEEN && j < SEEN && !seen[j * SEEN + i]) { seen[j * SEEN + i] = 1; seenDirty = 1; } }
  if (seenDirty && Math.random() < .02) { save.seen = Array.from(seen).join(''); persist(); seenDirty = 0; }
  // heads
  for (const h of EV.heads) if (!save.heads[h.id] && Math.hypot(h.x - car.x, h.z - car.z) < 7) {
    save.heads[h.id] = 1; persist(); h.mesh.visible = false;
    const n = Object.keys(save.heads).length;
    play('bell', .7); tone(784, .3, .1, 'triangle'); tone(1175, .5, .1, 'triangle', .12);
    for (let i = 0; i < 24; i++) puff(new THREE.Vector3(h.x, car.y + 2, h.z), '#ffd96a', .8, 1, new THREE.Vector3((Math.random() - .5) * 10, Math.random() * 9, (Math.random() - .5) * 10), true, .5);
    const un = n % 2 === 0 && UNLOCK[4 + n / 2] ? ` New car in the garage: ${CARS[UNLOCK[4 + n / 2]].name}.` : '';
    toast(`Stone head ${n} of 30.${un}`, 3500); uiHeads();
  }
  if (mode !== 'free') return;
  // speed traps
  for (const e of EV.list) if (e.type === 'trap' && car.speed > 5 && Math.hypot(e.x - car.x, e.z - car.z) < 12 && (lastTrap[e.id] || 0) < performance.now() - 4000) {
    lastTrap[e.id] = performance.now();
    const kmh = Math.round(car.speed * 3.6), b = save.best[e.id];
    if (!b || kmh > b.speed) { save.best[e.id] = { speed: kmh }; persist(); }
    tone(1320, .08, .12, 'square'); tone(1320, .08, .12, 'square', .12);
    toast(`${e.name} speed trap: ${kmh} km/h${b ? (kmh > b.speed ? '. New best!' : ` (best ${b.speed})`) : ''}`, 3000);
  }
  // drift zones: score grows with slide angle and speed while drifting inside the box
  const inZone = EV.list.find(e => e.type === 'drift' && car.x > e.box[0] && car.x < e.box[2] && car.z > e.box[1] && car.z < e.box[3]);
  if (inZone) {
    if (!drift || drift.e !== inZone) drift = { e: inZone, score: 0, idle: 0 };
    if (car.drift && car.speed > 8) { drift.score += Math.min(1, car.slip / car.speed * 1.6) * car.speed * dt * 6; drift.idle = 0; } else drift.idle += dt;
    uiDrift(drift);
  }
  if (drift && (!inZone || drift.idle > 2.5)) {
    const s = Math.round(drift.score), b = save.best[drift.e.id];
    if (s > 20) {
      if (!b || s > b.score) { save.best[drift.e.id] = { score: s }; persist(); }
      toast(`${drift.e.name}: ${s} drift points${b ? (s > b.score ? '. New best!' : ` (best ${b.score})`) : ''}`, 3200);
    }
    drift = null; uiDrift(null);
  }
  // jumps: take off from a ramp, measure to where you land
  for (const e of evs) {
    if (e.t === 'land' && takeoff) {
      const d = Math.round(Math.hypot(car.x - takeoff.x, car.z - takeoff.z)), b = save.best[takeoff.e.id];
      if (d > 8) {
        if (!b || d > b.dist) { save.best[takeoff.e.id] = { dist: d }; persist(); }
        toast(`${takeoff.e.name}: ${d} m${b ? (d > b.dist ? '. New best!' : ` (best ${b.dist} m)`) : ''}`, 3000);
      }
      takeoff = null;
    }
  }
  if (car.air && !takeoff) {
    const e = EV.list.find(e => e.type === 'jump' && Math.hypot(car.x - (e.ramp.x + e.ramp.d[0] * e.ramp.len), car.z - (e.ramp.z + e.ramp.d[1] * e.ramp.len)) < 9);
    if (e) takeoff = { e, x: car.x, z: car.z };
  }
}

// ---------- physics loop ----------
let acc = 0, shake = 0, lastY = 0;
const camPos = new THREE.Vector3(), camAt = new THREE.Vector3(), tmp = new THREE.Vector3();
function stepWorld(dt) {
  readInput(dt);
  if (mode === 'count') {
    countT += dt; uiCount(countT);
    if (countT >= 3) { mode = 'event'; tone(988, .35, .16, 'square'); }
    car.vx = car.vz = 0;
    return [];
  }
  const evs = [];
  acc += dt;
  let n = 0;
  while (acc >= DT && n++ < 8) {
    acc -= DT;
    if (mode === 'event') {
      if (recStep % IN_EVERY === 0) { rec.push(packInput(input.st, input.th, input.hb, input.bo, input.rs)); input.rs = 0; }
      const code = rec[rec.length - 1];
      recStep++;
      const ev = stepCar(W, car, unpackInput(code));
      const before = gate.gi;
      runGates(active, car, gate);
      if (gate.gi > before) onGate();
      evs.push(...ev);
      if (ghost && !ghost.st.done) { stepCar(W, ghost.c, unpackInput(ghost.inputs[Math.floor((recStep - 1) / IN_EVERY)] ?? 0)); runGates(active, ghost.c, ghost.st); }
      if (gate.done) { finishEvent(); break; }
    } else {
      evs.push(...stepCar(W, car, unpackInput(packInput(input.st, input.th, input.hb, input.bo, input.rs))));
      input.rs = 0;
    }
  }
  return evs;
}
function onGate() {
  tone(1568, .12, .1, 'triangle'); tone(2093, .2, .08, 'triangle', .06);
  if (ghost && ghost.splits[gate.gi]) uiSplit((car.steps - ghost.splits[gate.gi]) / 120);
  showGates();
}
function effects(evs, dt) {
  for (const e of evs) {
    if (e.t === 'hit') {
      play(e.m > 9 ? 'crash' : 'bump', Math.min(1, .2 + e.m / 14)); if (e.m > 12) play('metal', .4);
      shake = Math.max(shake, Math.min(.7, e.m * .045));
      for (let i = 0; i < Math.min(16, e.m); i++) puff(new THREE.Vector3(car.x + car.hx * 2, car.y + .8, car.z + car.hz * 2), '#ffd27a', .35, .3, new THREE.Vector3((Math.random() - .5) * 9, Math.random() * 5, (Math.random() - .5) * 9), true, .2);
    } else if (e.t === 'land') {
      play('land', Math.min(1, e.m / 14)); shake = Math.max(shake, Math.min(.5, e.m * .03));
      carMesh.userData.bobV -= e.m * .9;
      for (let i = 0; i < 10; i++) puff(new THREE.Vector3(car.x + (Math.random() - .5) * 3, car.y + .3, car.z + (Math.random() - .5) * 3), '#e9dcc0', 1.4, 1, new THREE.Vector3((Math.random() - .5) * 4, 1, (Math.random() - .5) * 4));
    } else if (e.t === 'splash') {
      whoosh(.4, .8);
      for (let i = 0; i < 26; i++) puff(new THREE.Vector3(car.x, WATER + .3, car.z), '#e8f6ff', 1, 1.1, new THREE.Vector3((Math.random() - .5) * 8, 4 + Math.random() * 8, (Math.random() - .5) * 8));
    } else if (e.t === 'boost') { whoosh(.25, .5); }
    else if (e.t === 'reset') { camPos.set(car.x - car.hx * 9, car.y + 4, car.z - car.hz * 9); }
  }
  // tyre smoke, skid marks, off-road dust, boost flames
  if (!car.air && car.speed > 3) {
    const slide = car.drift || car.slip > 3.5, rx = -car.hz, rz = car.hx;
    if (slide || !car.onRoad) for (const s of [-1, 1]) {
      const x = car.x - car.hx * 1.5 + rx * .95 * s, z = car.z - car.hz * 1.5 + rz * .95 * s;
      if (slide && car.onRoad) skid(x, car.y, z, Math.atan2(car.vx, car.vz));
      if (Math.random() < (slide ? .5 : .25)) puff(new THREE.Vector3(x, car.y + .3, z), car.onRoad ? '#f2efe8' : '#c9b48a', car.onRoad ? 1.2 : 1, car.onRoad ? .9 : .7, new THREE.Vector3(-car.vx * .08, 1, -car.vz * .08));
    }
  }
  if (car.boosting) for (let i = 0; i < 2; i++) puff(new THREE.Vector3(car.x - car.hx * 2.4, car.y + .55, car.z - car.hz * 2.4), Math.random() < .5 ? '#ff9d3a' : '#ffd23f', .6, .15, new THREE.Vector3(-car.hx * 12, .5, -car.hz * 12), true, .1);
}
function camera3(dt) {
  const D = [8.4, 12, 5.6][camMode], H = [3.1, 4.6, 2.2][camMode];
  // look partly along the direction of travel, so a drift shows where you're sliding
  const vd = car.speed > 3 ? tmp.set(car.vx, 0, car.vz).normalize() : tmp.set(car.hx, 0, car.hz);
  const dx = car.hx * .55 + vd.x * .45, dz = car.hz * .55 + vd.z * .45, dl = Math.hypot(dx, dz) || 1;
  const want = new THREE.Vector3(car.x - dx / dl * (D + car.speed * .04), car.y + H + car.speed * .012, car.z - dz / dl * (D + car.speed * .04));
  want.y = Math.max(want.y, groundAt(W, want.x, want.z) + 1.4);
  camPos.lerp(want, 1 - Math.exp(-dt * (mode === 'count' ? 3 : 7)));
  camAt.lerp(tmp.set(car.x + car.hx * 5, car.y + 1.3, car.z + car.hz * 5), 1 - Math.exp(-dt * 10));
  camera.position.copy(camPos);
  if (shake > .01 && !calm) camera.position.add(tmp.set((Math.random() - .5) * shake, (Math.random() - .5) * shake, (Math.random() - .5) * shake));
  shake *= .87;
  camera.lookAt(camAt);
  const fov = 60 + Math.min(14, car.speed * .22) + (car.boosting ? 6 : 0);
  if (Math.abs(camera.fov - fov) > .05) { camera.fov += (fov - camera.fov) * Math.min(1, dt * 5); camera.updateProjectionMatrix(); }
}
