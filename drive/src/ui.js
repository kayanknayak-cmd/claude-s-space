// ---------- ui: HUD, minimap, map and fast travel, garage, results, help, touch controls, leaderboard ----------
const DRIVE_URL = 'https://claude.ai/artifact/23nQtNRt6EDqaG6QzQrbsP';
function toast(text, ms = 2600) {
  const t = $('toast'); t.textContent = text; t.hidden = false;
  clearTimeout(t._t); t._t = setTimeout(() => t.hidden = true, ms);
}
function uiHeads() { $('heads').textContent = `◉ ${Object.keys(save.heads).length}/30`; }
let uiDriftEl = null;
function uiDrift(d) {
  if (mode !== 'free') return;
  if (!d) { $('event').hidden = true; return; }
  $('event').hidden = false; $('ename').textContent = d.e.name + ' drift zone';
  $('etime').textContent = Math.round(d.score); $('esub').textContent = save.best[d.e.id] ? 'best ' + save.best[d.e.id].score : 'drift to score';
}
function uiEvent(e) {
  $('event').hidden = !e; $('count').hidden = true;
  if (e) { $('ename').textContent = e.name; $('etime').textContent = fmt(0); $('esub').textContent = `gate 0 of ${e.gates.length}`; $('esub').className = ''; }
}
function uiCount(t) {
  const n = 3 - Math.floor(t);
  const el = $('count'); el.hidden = t >= 3; el.textContent = n > 0 ? n : '';
  if (n !== uiCount.last && n > 0) tone(n === 1 ? 660 : 660, .12, .14, 'square');
  uiCount.last = n;
}
let splitT = 0;
function uiSplit(d) { const el = $('esub'); el.textContent = fmtD(d); el.className = d < 0 ? 'ahead' : 'behind'; splitT = performance.now() + 1800; }
function uiTick() {
  $('kmh').firstChild.nodeValue = Math.round(car.speed * 3.6);
  const m = $('meter'); m.firstChild.style.width = (car.meter * 100).toFixed(0) + '%'; m.classList.toggle('full', car.meter > .98);
  if (mode === 'event' && active) {
    $('etime').textContent = fmt(car.steps / 120);
    if (performance.now() > splitT) { $('esub').textContent = `gate ${gate.gi} of ${active.gates.length}`; $('esub').className = ''; }
  }
  // the prompt for a nearby race start
  const near = mode === 'free' ? nearestStart() : null, p = $('prompt');
  if (near) { p.hidden = false; p.innerHTML = `<kbd>E</kbd> ${near.name}${save.best[near.id] ? ' · best ' + fmt(save.best[near.id].time) : ''}`; }
  else if (mode === 'event' || mode === 'count') { p.hidden = false; p.innerHTML = '<kbd>R</kbd> back to the last gate · <kbd>Esc</kbd> leave'; }
  else p.hidden = true;
}

// ---------- maps: one picture of the island, drawn once; the minimap and the big map crop it ----------
const mapImg = document.createElement('canvas');
function drawMapImage() {
  const P = 4, S = N * P; mapImg.width = mapImg.height = S;
  const x2 = mapImg.getContext('2d'), img = x2.createImageData(S, S), col = new THREE.Color();
  for (let pz = 0; pz < S; pz++) for (let px = 0; px < S; px++) {
    const x = (px + .5) * T / P, z = (pz + .5) * T / P, h = groundAt(W, x, z), k = (pz * S + px) * 4;
    if (h < WATER) { const d = Math.min(1, (WATER - h) / 8); img.data[k] = 70 - 40 * d; img.data[k + 1] = 160 - 60 * d; img.data[k + 2] = 215 - 40 * d; }
    else { terrainColor(x, z, h, col); img.data[k] = col.r * 255; img.data[k + 1] = col.g * 255; img.data[k + 2] = col.b * 255; }
    img.data[k + 3] = 255;
  }
  x2.putImageData(img, 0, 0);
  x2.fillStyle = '#4a4d57';
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) if (W.road[j * N + i]) x2.fillRect(i * P, j * P, P, P);
  x2.fillStyle = '#7a5a3c'; x2.fillRect(W.rail.i0 * P, (W.rail.j + .5) * P - 1, (W.rail.i1 - W.rail.i0) * P, 2);
  x2.strokeStyle = '#4a4d57'; x2.lineWidth = 5; x2.beginPath();
  for (const pc of W.circuit.pieces) { x2.moveTo(pc.A[0] / T * P, pc.A[1] / T * P); if (pc.type === 'corner') x2.quadraticCurveTo((pc.A[0] + pc.B[0] - pc.C[0]) / T * P, (pc.A[1] + pc.B[1] - pc.C[1]) / T * P, pc.B[0] / T * P, pc.B[1] / T * P); else x2.lineTo(pc.B[0] / T * P, pc.B[1] / T * P); }
  x2.stroke();
  x2.fillStyle = 'rgba(29,36,51,.35)';
  for (const [key, x, z] of W.items) if (/^(sky|com|house|ind|stand)/.test(key)) x2.fillRect(x / T * P - 1.5, z / T * P - 1.5, 3, 3);
}
const ICOL = { sprint: '#ffd23f', trap: '#ff4d5a', drift: '#a35bff', jump: '#ff8c1a' };
const isSeen = (x, z) => seen[Math.min(SEEN - 1, Math.floor(z / (SIZE / SEEN))) * SEEN + Math.min(SEEN - 1, Math.floor(x / (SIZE / SEEN)))];
function drawMini() {
  const c = $('mini'), x = c.getContext('2d'), S = c.width, R = 420, P = 4 / T;
  x.save(); x.clearRect(0, 0, S, S); x.beginPath(); x.arc(S / 2, S / 2, S / 2, 0, Math.PI * 2); x.clip();
  x.fillStyle = '#3d9bd6'; x.fillRect(0, 0, S, S);
  x.drawImage(mapImg, (car.x - R) * P, (car.z - R) * P, 2 * R * P, 2 * R * P, 0, 0, S, S);
  const to = (wx, wz) => [S / 2 + (wx - car.x) / R * S / 2, S / 2 + (wz - car.z) / R * S / 2];
  for (const e of EV.list) { const [px, pz] = to(e.type === 'sprint' ? e.start.x : e.x, e.type === 'sprint' ? e.start.z : e.z); x.fillStyle = ICOL[e.type]; x.beginPath(); x.arc(px, pz, 9, 0, 7); x.fill(); x.strokeStyle = '#1d2433'; x.lineWidth = 3; x.stroke(); }
  if (mode === 'event' && active && !gate.done) { const g = active.gates[gate.gi], [px, pz] = to(g[0], g[1]); x.strokeStyle = '#ffd23f'; x.lineWidth = 6; x.beginPath(); x.arc(px, pz, 14, 0, 7); x.stroke(); }
  x.translate(S / 2, S / 2); x.rotate(Math.atan2(car.hx, -car.hz));
  x.fillStyle = '#fffaf0'; x.strokeStyle = '#1d2433'; x.lineWidth = 4; x.beginPath(); x.moveTo(0, -18); x.lineTo(12, 14); x.lineTo(0, 7); x.lineTo(-12, 14); x.closePath(); x.fill(); x.stroke();
  x.restore();
}
function drawBigMap() {
  const c = $('mapc'), x = c.getContext('2d'), S = c.width, k = S / SIZE;
  x.drawImage(mapImg, 0, 0, S, S);
  // unexplored ground stays under cloud
  x.fillStyle = 'rgba(236,240,244,.6)';
  for (let j = 0; j < SEEN; j++) for (let i = 0; i < SEEN; i++) if (!seen[j * SEEN + i]) x.fillRect(i * S / SEEN - .5, j * S / SEEN - .5, S / SEEN + 1, S / SEEN + 1);
  for (const e of EV.list) {
    const ex = e.type === 'sprint' ? e.start.x : e.x, ez = e.type === 'sprint' ? e.start.z : e.z;
    if (!isSeen(ex, ez)) continue;
    x.fillStyle = ICOL[e.type]; x.strokeStyle = '#1d2433'; x.lineWidth = 3;
    x.beginPath(); x.arc(ex * k, ez * k, 9, 0, 7); x.fill(); x.stroke();
    x.fillStyle = '#1d2433'; x.font = '700 13px Archivo, sans-serif'; x.textAlign = 'center';
    const b = save.best[e.id], label = e.name + (b ? ' · ' + (b.time ? fmt(b.time) : b.speed ? b.speed + ' km/h' : b.score ? b.score + ' pts' : b.dist + ' m') : '');
    x.strokeStyle = 'rgba(255,250,240,.9)'; x.lineWidth = 4; x.strokeText(label, ex * k, ez * k - 15); x.fillText(label, ex * k, ez * k - 15);
  }
  for (const h of EV.heads) if (save.heads[h.id]) { x.fillStyle = '#f2c14e'; x.beginPath(); x.arc(h.x * k, h.z * k, 4, 0, 7); x.fill(); }
  x.save(); x.translate(car.x * k, car.z * k); x.rotate(Math.atan2(car.hx, -car.hz));
  x.fillStyle = '#ff7a3d'; x.strokeStyle = '#fff'; x.lineWidth = 3; x.beginPath(); x.moveTo(0, -14); x.lineTo(10, 11); x.lineTo(0, 5); x.lineTo(-10, 11); x.closePath(); x.fill(); x.stroke(); x.restore();
}
function toggleMap() {
  const m = $('mapsheet');
  if (m.hidden && (mode === 'event' || mode === 'count')) return;
  m.hidden = !m.hidden; if (!m.hidden) drawBigMap();
}
$('mapc').addEventListener('click', e => {
  const r = e.target.getBoundingClientRect(), x = (e.clientX - r.left) / r.width * SIZE, z = (e.clientY - r.top) / r.height * SIZE;
  let best = null, bd = 60;
  for (const ev of EV.list) { const ex = ev.type === 'sprint' ? ev.start.x : ev.x, ez = ev.type === 'sprint' ? ev.start.z : ev.z, d = Math.hypot(ex - x, ez - z); if (d < bd && isSeen(ex, ez)) { bd = d; best = ev; } }
  if (!best) { toast('Click a race, trap, drift zone or jump you have found.'); return; }
  const pose = best.type === 'sprint' ? best.start : nearestRoadPose(best.x, best.z);
  respawn(W, car, pose); car.safe = { ...pose }; camPos.set(car.x - car.hx * 9, car.y + 5, car.z - car.hz * 9);
  $('mapsheet').hidden = true; toast(`Drove to ${best.name}.`);
});
function nearestRoadPose(x, z) {
  let best = null, bd = 1e9;
  const i0 = Math.floor(x / T), j0 = Math.floor(z / T);
  for (let b = -20; b <= 20; b++) for (let a = -20; a <= 20; a++) {
    const i = i0 + a, j = j0 + b; if (i < 0 || j < 0 || i >= N || j >= N || !W.road[j * N + i]) continue;
    const d = a * a + b * b; if (d < bd) { bd = d; best = [i, j]; }
  }
  if (!best) return { ...W.spawn };
  const [i, j] = best, horiz = W.road[j * N + i + 1] || W.road[j * N + i - 1];
  return { x: (i + .5) * T, z: (j + .5) * T, hx: horiz ? (x > (i + .5) * T ? 1 : -1) : 0, hz: horiz ? 0 : (z > (j + .5) * T ? 1 : -1) };
}

// ---------- garage ----------
function toggleGarage() {
  const g = $('garage');
  if (g.hidden && mode !== 'free') { toast('Finish or leave the event first.'); return; }
  g.hidden = !g.hidden;
  if (g.hidden) return;
  const maxV = 55, maxA = 20;
  $('cars').innerHTML = UNLOCK.map(k => {
    const P = CARS[k], on = unlocked(k), need = (UNLOCK.indexOf(k) - 4) * 2;
    return `<button class="car ${k === save.car ? 'on' : ''}" data-k="${k}" ${on ? '' : 'disabled'}>${P.name}<small>${on ? Math.round(P.vmax * 3.6) + ' km/h top' : need + ' heads to unlock'}</small>
      <div class="bars"><em>speed</em><span style="width:${P.vmax / maxV * 100}%"></span><em>pace</em><span style="width:${P.acc / maxA * 100}%"></span><em>grip</em><span style="width:${P.grip / 13 * 100}%"></span></div></button>`;
  }).join('');
}
$('cars').addEventListener('click', e => {
  const b = e.target.closest('.car'); if (!b || b.disabled) return;
  save.car = b.dataset.k; persist(); setCar(save.car); toggleGarage();
});
$('gclose').onclick = toggleGarage;
$('bgarage').onclick = () => { ac(); toggleGarage(); };
$('bmap').onclick = () => { ac(); toggleMap(); };
function setCar(key) {
  if (carMesh) scene.remove(carMesh);
  car.model = key; carMesh = carModel(key);
}

// ---------- results and the friends leaderboard ----------
let lastResult = null;
function showResults(e, r) {
  lastResult = { e, ...r };
  $('rname').textContent = e.name;
  const rows = [`<span>Time</span><b>${fmt(r.time)}</b>`];
  if (r.prev) rows.push(`<span>Your best before</span><b class="${r.time < r.prev.time ? 'ahead' : 'behind'}">${fmtD(r.time - r.prev.time)}</b>`);
  if (r.isBest) rows.push(`<span>New best</span><b>★</b>`);
  $('rrows').innerHTML = rows.join('');
  $('rdare').hidden = !save.best[e.id];
  $('results').hidden = false; renderBoard();
}
function closeResults() { $('results').hidden = true; mode = 'free'; active = null; }
$('rclose').onclick = closeResults;
$('rretry').onclick = () => { const e = lastResult.e; $('results').hidden = true; begin(e); };
$('rdare').onclick = () => {
  const e = lastResult.e, b = save.best[e.id];
  if (!b) return;
  const url = `${DRIVE_URL}#e.${e.id}.${b.car}.${b.inputs}`;
  copyText(`Sunday Drive, ${e.name}: ${fmt(b.time)}. Race my ghost: ${url}`, () => toast('Challenge link copied.'), () => toast('Copy this link: ' + url, 9000));
};
function copyText(text, ok, fail) {
  let done = false; const fin = f => { if (!done) { done = true; f(); } };
  try { navigator.clipboard.writeText(text).then(() => fin(ok), () => fin(fail)); } catch { fin(fail); }
  setTimeout(() => fin(fail), 1500);
}
// db: runs/<user id> = { e: { <event id>: { time, inputs, car } } }; each row is replayed before it is shown
let db = null, users = null, me = null, board = {}, names = {}, canPost = true;
const checked = new Map();
async function online() {
  try {
    if (!window.claude || !window.claude.use) return;
    const [d, u] = await Promise.all([window.claude.use('db'), window.claude.use('user')]);
    if (!d || !u) return;
    me = await u.id(); if (!me) return;
    db = d; users = u;
    db.collection('runs').onSnapshot(snap => readBoard(snap.docs), () => {});
  } catch {}
}
let pushedOnce = false;
function readBoard(docs) {
  board = {};
  for (const doc of docs) {
    const t = doc.data() && doc.data().e;
    if (!t || typeof t !== 'object') continue;
    for (const ev of EV.list) {
      const r = t[ev.id];
      if (ev.type !== 'sprint' || !r || typeof r.inputs !== 'string' || r.inputs.length > 40000 || !/^[A-Z0-9a-z]+$/.test(r.inputs) || !CARS[r.car]) continue;
      const key = ev.id + r.car + r.inputs;
      if (!checked.has(key)) checked.set(key, verifyRun(ev, r.car, r.inputs));
      const time = checked.get(key);
      if (time !== null) (board[ev.id] ||= []).push({ id: doc.id, time, inputs: r.inputs, car: r.car });
    }
  }
  for (const k in board) board[k].sort((a, b) => a.time - b.time);
  let changed = false;
  for (const ev of EV.list) {
    const mine = (board[ev.id] || []).find(r => r.id === me), b = save.best[ev.id];
    if (mine && (!b || mine.time < b.time - 1e-9)) { save.best[ev.id] = { time: mine.time, inputs: mine.inputs, car: mine.car }; changed = true; }
    if (b && b.inputs && (!mine || b.time < mine.time - 1e-9)) changed = true;
  }
  if (changed) persist();
  if (changed && !pushedOnce) { pushedOnce = true; pushBests(); }
  const ids = [...new Set(Object.values(board).flat().map(r => r.id))].filter(id => !names[id]);
  if (ids.length && users) users.profiles(ids).then(ps => { for (const id of ids) names[id] = (ps[id] && ps[id].name) || 'Someone'; renderBoard(); }, () => {});
  renderBoard();
}
function pushBests() {
  if (!db || !me || !canPost) return;
  const e = {};
  for (const ev of EV.list) { const b = save.best[ev.id]; if (ev.type === 'sprint' && b && b.inputs) e[ev.id] = { time: b.time, inputs: b.inputs, car: b.car }; }
  db.doc('runs/' + me).set({ e }).catch(err => { if (err && (err.code === 'invalid_argument' || err.code === 'not_granted')) canPost = false; });
}
const esc = s => String(s).replace(/[&<>"']/g, c => '&#' + c.charCodeAt(0) + ';');
function renderBoard() {
  const el = $('board'); if (!lastResult || $('results').hidden) return;
  const rows = board[lastResult.e.id] || [];
  if (!db || !rows.length) { el.hidden = true; return; }
  el.hidden = false;
  el.innerHTML = '<h4>Friends</h4>' + rows.slice(0, 5).map((r, i) => `<button class="fr ${r.id === me ? 'me' : ''}" data-id="${esc(r.id)}" ${r.id === me ? 'disabled' : ''}><i>${i + 1}.</i><span>${r.id === me ? 'You' : esc(names[r.id] || '...')} · ${esc(CARS[r.car].name)}</span><b>${fmt(r.time)}</b></button>`).join('');
}
$('board').addEventListener('click', e => {
  const b = e.target.closest('.fr'); if (!b || b.disabled) return;
  const ev = lastResult.e, r = (board[ev.id] || []).find(x => x.id === b.dataset.id); if (!r) return;
  $('results').hidden = true; begin(ev, { inputs: r.inputs, car: r.car, who: names[r.id] || 'Friend' });
  toast(`Racing ${names[r.id] || 'a friend'}'s ghost: the pink car.`);
});
// challenge links: #e.<event>.<car>.<inputs>; the lap is replayed here, so the time can't be faked
function readLink() {
  const m = /^#e\.([a-z0-9-]+)\.([a-z-]+)\.([A-Z0-9a-z]+)$/.exec(location.hash);
  if (!m) return;
  const ev = EV.list.find(e => e.id === m[1]);
  if (!ev || !CARS[m[2]]) return;
  const time = verifyRun(ev, m[2], m[3]);
  if (time === null) return;
  setTimeout(() => { begin(ev, { inputs: m[3], car: m[2], who: 'Friend' }); toast(`A friend's ghost: ${fmt(time)} on ${ev.name}. Catch the pink car.`, 5000); }, 600);
}

// ---------- help ----------
function toggleHelp() { $('help').hidden = !$('help').hidden; if ($('help').hidden) { save.helped = 1; persist(); } }
$('hclose').onclick = () => { ac(); toggleHelp(); };
$('bhelp').onclick = () => { ac(); toggleHelp(); };

// ---------- touch controls (phones): steer with the left thumb, pedals and buttons on the right ----------
function setupTouch() {
  if (!('ontouchstart' in window) && !(navigator.maxTouchPoints > 0)) return;
  touch.on = true; touch.gas = 1;
  const root = $('touch'); root.hidden = false;
  const btn = (id, icon, right, bottom, on, off) => {
    const b = document.createElement('div'); b.className = 'tb'; b.id = id;
    b.style.right = right + 'px'; b.style.bottom = `calc(${bottom}px + env(safe-area-inset-bottom, 0px))`;
    b.innerHTML = `<img class="bg" src="ICON_button" alt=""><img class="ic" src="${icon}" alt="">`;
    b.addEventListener('pointerdown', e => { e.preventDefault(); ac(); b.classList.add('on'); on(); });
    const up = () => { b.classList.remove('on'); off(); };
    b.addEventListener('pointerup', up); b.addEventListener('pointercancel', up); b.addEventListener('pointerleave', up);
    root.appendChild(b);
  };
  // right thumb: drift and boost on the bottom row, brake and reset above them
  btn('tdrift', 'ICON_drift', 22, 22, () => touch.hb = 1, () => touch.hb = 0);
  btn('tboost', 'ICON_boost', 104, 22, () => touch.bo = 1, () => touch.bo = 0);
  btn('tbrake', 'ICON_brake', 22, 104, () => touch.brake = 1, () => touch.brake = 0);
  btn('treset', 'ICON_reset', 104, 104, () => { keys.KeyR = 1; }, () => { keys.KeyR = 0; });
  const pad = $('tpad'), nub = $('tnub');
  let id = null, x0 = 0;
  $('c').addEventListener('pointerdown', e => {
    if (e.pointerType !== 'touch' || id !== null || e.clientX > innerWidth * .55) return;
    ac(); id = e.pointerId; x0 = e.clientX; pad.style.left = e.clientX + 'px'; pad.style.top = e.clientY + 'px'; pad.classList.add('on'); touch.steer = 0;
  });
  addEventListener('pointermove', e => {
    if (e.pointerId !== id) return;
    const R = Math.min(innerWidth, 600) * .14, v = THREE.MathUtils.clamp((e.clientX - x0) / R, -1, 1);
    touch.steer = v; nub.style.transform = `translateX(${v * 30}px)`;
  });
  const end = e => { if (e.pointerId === id) { id = null; touch.steer = null; steerVal = 0; pad.classList.remove('on'); } };
  addEventListener('pointerup', end); addEventListener('pointercancel', end);
  $('mini').style.bottom = 'auto'; $('mini').style.top = 'calc(64px + env(safe-area-inset-top, 0px))'; $('mini').style.width = $('mini').style.height = '110px';
  $('speed').style.left = '50%'; $('speed').style.right = 'auto'; $('speed').style.transform = 'translateX(-50%)';
}
