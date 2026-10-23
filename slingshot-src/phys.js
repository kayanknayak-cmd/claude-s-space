/* ======================= physics ======================= */
// Shared by the game and the level checker, so a level proven solvable offline is solvable in play.
// Newtonian gravity with a little softening, integrated by leapfrog (kick,
// drift, kick) so orbits keep their energy. Black holes pull with the
// Paczynski-Wiita force m / (r - rs)^2, a one-line stand-in for general
// relativity that reproduces its precessing, zoom-whirl orbits. Every level runs in fixed steps
// from its start, and moons advance by an exact rotation each step, so a
// throw replays bit for bit on any device. Only + - * / and sqrt appear in a step:
// those are the operations every device rounds the same way.
const EPS2 = 0.0004, DT = 1 / 600, TR = 0.09, STALE = 4.5;
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
  for (let k = 0; k < B.length; k++) { const dx = P[k][0] - x, dy = P[k][1] - y, r = Math.sqrt(dx * dx + dy * dy); pot -= B[k].m / (B[k].rs ? Math.max(r - B[k].rs, 1e-3) : r); }
  return 0.5 * (vx * vx + vy * vy) + pot;
}

/* ---- rubble: piles of rock held together by their own gravity ---- */
// Each rock is a small sphere. Rocks pull on one another, and touching spheres push apart with a stiff
// spring that loses a little energy each bounce (the spring-dashpot contact used to model sand and
// rubble piles). Rocks are far too light to bend a comet's path by gravity, but a comet that strikes
// them trades momentum through the same contact, so m1 v1 + m2 v2 is kept in every collision: a heavy
// comet ploughs through, a light one glances off.
const RR = 0.03, RG = 0.0015, KC = 20000, CC = 30, CR = 0.025, BOOST = 0.32;
const KINDS = { n: 4, s: 4, b: 4, h: 16 };
const S3 = Math.sqrt(3);
function makeRocks(L) {
  const out = [];
  (L.piles || []).forEach((p, pi) => {
    // hexagonal packing: one rock and six touching it
    const off = [[0, 0], [2 * RR, 0], [-2 * RR, 0], [RR, S3 * RR], [-RR, S3 * RR], [RR, -S3 * RR], [-RR, -S3 * RR]];
    off.forEach(([ox, oy], k) => out.push({ x: p.x + ox, y: p.y + oy, vx: p.vx, vy: p.vy, fx: 0, fy: 0, m: 1, r: RR, rock: true,
      alive: true, fate: null, by: null, pile: pi, id: pi * 7 + k, a: [0, 0, -1], k: 0, age: 0 }));
  });
  return out;
}
function makeWorld(L) { return { L, P: startPos(L), Q: startPos(L), tick: 0, comets: [], rocks: makeRocks(L), got: L.targets.map(() => false), won: false }; }
function newComet(W, vx, vy, kind) {
  const [x, y] = W.L.launch;
  kind = KINDS[kind] ? kind : 'n';
  return { x, y, vx, vy, kind, m: KINDS[kind], r: CR, power: kind === 's' || kind === 'b', age: 0, alive: true, fate: null, a: [0, 0, -1], fx: 0, fy: 0, k: 0,
    cells: new Set(), fresh: 0, novel: 0, ffBase: 0, ff: false, bumped: false };
}
// a tap in flight: a split conserves momentum (the halves fly apart, their center of mass keeps going);
// a burn adds speed along the path, and is worth most where the comet is already fastest (the Oberth effect,
// since the energy gained is v dv + dv^2 / 2)
function activate(W, c) {
  if (!c || !c.alive || !c.power) return null;
  c.power = false;
  const v = Math.sqrt(c.vx * c.vx + c.vy * c.vy); if (v < 1e-6) return null;
  const ux = c.vx / v, uy = c.vy / v;
  if (c.kind === 'b') { c.vx += ux * BOOST; c.vy += uy * BOOST; c.burnV = v; return null; }
  const d = Math.min(0.32, Math.max(0.12, 0.22 * v)), nx = -uy * d, ny = ux * d;
  const twin = { ...c, vx: c.vx - nx, vy: c.vy - ny, m: c.m / 2, a: [0, 0, -1], cells: new Set(c.cells), twin: true };
  c.vx += nx; c.vy += ny; c.m /= 2;
  W.comets.push(twin);
  return twin;
}
function contacts(C, R) {
  for (const o of C) { o.fx = 0; o.fy = 0; }
  for (const o of R) { o.fx = 0; o.fy = 0; }
  if (!R.length) return;
  const push = (p, q, rad) => {
    const dx = q.x - p.x, dy = q.y - p.y, r2 = dx * dx + dy * dy;
    if (r2 >= rad * rad || r2 < 1e-12) return false;
    const d = Math.sqrt(r2), nx = dx / d, ny = dy / d, vn = (q.vx - p.vx) * nx + (q.vy - p.vy) * ny, F = KC * (rad - d) - CC * vn;
    if (F > 0) { p.fx -= F * nx; p.fy -= F * ny; q.fx += F * nx; q.fy += F * ny; }
    return true;
  };
  for (let i = 0; i < R.length; i++) {
    const p = R[i];
    for (let j = i + 1; j < R.length; j++) {
      const q = R[j], dx = q.x - p.x, dy = q.y - p.y, e = dx * dx + dy * dy + 0.0004, g = RG / (e * Math.sqrt(e));
      p.fx += dx * g; p.fy += dy * g; q.fx -= dx * g; q.fy -= dy * g;
      // a rock set moving by a comet passes the credit on to any rock it strikes
      if (push(p, q, 2 * RR)) { if (p.by && !q.by) q.by = p.by; else if (q.by && !p.by) p.by = q.by; }
    }
  }
  for (const c of C) for (const r of R) if (push(c, r, CR + RR)) { r.by = c; c.bumped = true; }
}
// one fixed step of everything. H receives events: hit(source, i), track(comet) every 6 steps, dead(mover)
function step(W, H) {
  const L = W.L, B = L.bodies, T = L.targets, P = W.P, Q = W.Q;
  advance(L, P, Q);
  const C = W.comets.filter(c => c.alive), R = W.rocks.filter(r => r.alive), M = C.concat(R);
  for (const o of M) {
    accel(B, P, o.x, o.y, o.a);
    o.vx += (o.a[0] + o.fx / o.m) * DT * 0.5; o.vy += (o.a[1] + o.fy / o.m) * DT * 0.5;
    o.x += o.vx * DT; o.y += o.vy * DT; o.age += DT;
  }
  for (const o of M) accel(B, Q, o.x, o.y, o.a);
  contacts(C, R);
  for (const o of M) {
    o.vx += (o.a[0] + o.fx / o.m) * DT * 0.5; o.vy += (o.a[1] + o.fy / o.m) * DT * 0.5;
    if (o.a[2] >= 0) { o.alive = false; o.fate = 'crash'; }
  }
  for (const o of M) {
    // targets are tested every third step; rocks only count once a comet has set them moving, and while it flies
    if (++o.k % 3 === 0 && !W.won && (!o.rock || (o.by && o.by.alive))) for (let i = 0; i < T.length; i++) if (!W.got[i]) {
      const dx = T[i][0] - o.x, dy = T[i][1] - o.y;
      if (dx * dx + dy * dy < TR * TR) {
        W.got[i] = true;
        const c = o.rock ? o.by : o; c.fresh = c.age;
        if (W.got.every(Boolean)) W.won = true;
        if (H.hit) H.hit(o, i);
      }
    }
    if (o.k % 6 === 0) {
      if (o.rock) { if (Math.abs(o.x) > 1.6 || Math.abs(o.y) > 2.3) { o.alive = false; o.fate = 'lost'; } }
      else { track(W, o); if (H.track) H.track(o); }
    }
    if (!o.alive && H.dead) H.dead(o);
  }
  W.P = Q; W.Q = P; W.tick++;
}
function track(W, c) {
  const B = W.L.bodies;
  // anywhere new lately? A visit also marks neighbors so a slowly drifting orbit counts as old ground
  if (Math.abs(c.x) < 1.1 && Math.abs(c.y) < 1.8) {
    const i = Math.floor(c.x / 0.07), j = Math.floor(c.y / 0.07), key = i * 4096 + j;
    if (!c.cells.has(key)) {
      for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) c.cells.add((i + a) * 4096 + j + b);
      c.novel++; if (!c.ff || c.novel - c.ffBase >= 4) c.fresh = c.age;
    }
  }
  // stale for a while: time speeds up (decided here, per step, so it is the same on every device)
  const ff = c.age - c.fresh > STALE; if (ff && !c.ff) c.ffBase = c.novel; c.ff = ff;
  // leaving with enough energy to never come back
  if ((Math.abs(c.x) > 1.35 || Math.abs(c.y) > 2.0) && energy(B, W.P, c.x, c.y, c.vx, c.vy) > 0 && c.x * c.vx + c.y * c.vy > 0) { c.alive = false; c.fate = 'lost'; }
  if (c.age - c.fresh > STALE + 26 || c.age > 240) { c.alive = false; c.fate = 'loop'; }
}
if (typeof module === 'object' && module.exports) module.exports = { EPS2, DT, TR, STALE, RR, CR, KINDS, startPos, advance, accel, energy, isMoon, makeWorld, newComet, activate, step };
