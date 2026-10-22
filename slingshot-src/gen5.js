// Slingshot level generator, v5: the exact physics the game runs (same stepping, same rotation
// constants, same black-hole force), a cheap pre-screen before the full solver, and two new worlds.
// usage: node gen5.js <world> <want> <seed> <minutes>
const fs = require('fs');
const [world, want = 8, seed0 = 1, minutes = 30] = [process.argv[2], +process.argv[3], +process.argv[4], +process.argv[5]];
const EPS2 = 0.0004, DT = 1 / 600, LIFE = 40, PULL = 0.75, SPEED = 1.3, TR = 0.075;
let s = seed0 >>> 0;
const rnd = () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const R = (a, b) => a + (b - a) * rnd();
const f3 = v => +v.toFixed(3);

/* ---- physics, identical to the game ---- */
const exact = L => ({ ...L, bodies: L.bodies.map(b => b.orbit ? { ...b, orbit: { ...b.orbit,
  ox: b.orbit.R * Math.cos(b.orbit.phase), oy: b.orbit.R * Math.sin(b.orbit.phase),
  c: Math.cos(2 * Math.PI * DT / b.orbit.period), s: Math.sin(2 * Math.PI * DT / b.orbit.period) } } : b) });
function startPos(L) { return L.bodies.map(b => b.orbit ? [b.orbit.cx + b.orbit.ox, b.orbit.cy + b.orbit.oy] : [b.x, b.y]); }
function posAt(L, t) { return L.bodies.map(b => { if (!b.orbit) return [b.x, b.y]; const o = b.orbit, a = o.phase + t / o.period * Math.PI * 2; return [o.cx + o.R * Math.cos(a), o.cy + o.R * Math.sin(a)]; }); }
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
function energy(B, P, x, y, vx, vy) {
  let pot = 0;
  for (let k = 0; k < B.length; k++) { const dx = P[k][0] - x, dy = P[k][1] - y, r = Math.sqrt(dx * dx + dy * dy); pot -= B[k].m / (B[k].rs ? Math.max(r - B[k].rs, 1e-3) : r); }
  return 0.5 * (vx * vx + vy * vy) + pot;
}
// one throw; t0 > 0 starts the bodies later in their orbits (only used for judging fairness)
function sim(L, vx, vy, life, got, turns, t0) {
  const B = L.bodies, h0 = Math.atan2(vy, vx);
  const P = t0 ? posAt(L, t0) : startPos(L), Q = P.map(p => [p[0], p[1]]);
  let x = L.launch[0], y = L.launch[1], Pp = P, Qq = Q; const a = [0, 0, -1];
  const steps = Math.round(life / DT);
  for (let n = 1; n <= steps; n++) {
    advance(L, Pp, Qq);
    accel(B, Pp, x, y, a); vx += a[0] * DT * 0.5; vy += a[1] * DT * 0.5;
    x += vx * DT; y += vy * DT;
    accel(B, Qq, x, y, a); vx += a[0] * DT * 0.5; vy += a[1] * DT * 0.5;
    const crash = a[2] >= 0;
    if (n % 3 === 0) {
      let all = true;
      for (let i = 0; i < L.targets.length; i++) if (!got[i]) {
        const dx = L.targets[i][0] - x, dy = L.targets[i][1] - y;
        if (dx * dx + dy * dy < TR * TR) {
          got[i] = true;
          if (turns) { let d = Math.abs(Math.atan2(vy, vx) - h0) % (2 * Math.PI); if (d > Math.PI) d = 2 * Math.PI - d; turns[i] = Math.min(turns[i], d); }
        } else all = false;
      }
      if (all) return n * DT;
    }
    if (crash) return -n * DT;
    if (n % 6 === 0 && (Math.abs(x) > 1.35 || Math.abs(y) > 2.0) && energy(B, Pp, x, y, vx, vy) > 0 && x * vx + y * vy > 0) return -n * DT;
    const T = Pp; Pp = Qq; Qq = T;
  }
  return -life;
}

/* ---- proposals ---- */
const rad = m => f3(0.035 + Math.sqrt(m) * 0.08);
function propose() {
  const L = { launch: [f3(R(-0.45, 0.45)), -1.38], bodies: [], targets: [] };
  const anchors = [];
  const free = (x, y, pad) => L.bodies.every(b => b.orbit ? true : Math.hypot(b.x - x, b.y - y) > b.r + pad) && Math.hypot(x - L.launch[0], y - L.launch[1]) > 0.45;
  const addStar = (m0, m1) => { for (let k = 0; k < 40; k++) { const x = R(-0.7, 0.7), y = R(-0.75, 1.15), m = R(m0, m1); if (free(x, y, 0.32)) { L.bodies.push({ x: f3(x), y: f3(y), m: f3(m), r: rad(m) }); anchors.push([x, y]); return true; } } return false; };
  let nt = 1;
  if (world === 'first') { addStar(0.18, 0.36); nt = 1 + Math.floor(rnd() * 3); }
  if (world === 'binary') { addStar(0.12, 0.24); addStar(0.12, 0.24); nt = 2 + Math.floor(rnd() * 2); }
  if (world === 'moons') {
    addStar(0.2, 0.32); const c = L.bodies[0];
    const nm = 1 + (rnd() < 0.35 ? 1 : 0);
    for (let i = 0; i < nm; i++) { const m = R(0.05, 0.11); L.bodies.push({ m: f3(m), r: f3(0.03 + Math.sqrt(m) * 0.05), orbit: { cx: c.x, cy: c.y, R: f3(R(0.38, 0.72)), period: +(R(5, 9) * (rnd() < 0.3 ? -1 : 1)).toFixed(2), phase: +R(0, 6.28).toFixed(2) } }); }
    nt = 1 + Math.floor(rnd() * 3);
  }
  if (world === 'crowd') { const k = 3 + (rnd() < 0.4 ? 1 : 0); for (let i = 0; i < k; i++) addStar(0.07, 0.17); nt = 3 + Math.floor(rnd() * 2); }
  if (world === 'waltz') {
    // two stars on a true Kepler circle about their barycenter: omega^2 a^3 = G (m1 + m2), r1 = a m2 / M
    const m1 = R(0.12, 0.22), m2 = R(0.1, 0.2), a = R(0.42, 0.66), cx = R(-0.3, 0.3), cy = R(-0.25, 0.85), M = m1 + m2;
    const period = 2 * Math.PI / Math.sqrt(M / (a * a * a)) * (rnd() < 0.5 ? -1 : 1), ph = R(0, 6.28);
    L.bodies.push({ m: f3(m1), r: rad(m1), star: true, orbit: { cx: f3(cx), cy: f3(cy), R: f3(a * m2 / M), period: +period.toFixed(4), phase: +ph.toFixed(3) } });
    L.bodies.push({ m: f3(m2), r: rad(m2), star: true, orbit: { cx: f3(cx), cy: f3(cy), R: f3(a * m1 / M), period: +period.toFixed(4), phase: +(ph + Math.PI).toFixed(3) } });
    anchors.push([cx, cy]);
    if (rnd() < 0.3) addStar(0.06, 0.1);
    nt = 2 + Math.floor(rnd() * 2);
  }
  if (world === 'horizon') {
    // a black hole: Paczynski-Wiita force m / (r - rs)^2, which precesses orbits the way relativity does
    for (let k = 0; k < 40; k++) {
      const x = R(-0.55, 0.55), y = R(-0.5, 1.05), m = R(0.22, 0.34), rs = 0.15 * m;
      if (free(x, y, 0.32)) { L.bodies.push({ x: f3(x), y: f3(y), m: f3(m), rs: f3(rs), r: f3(2.6 * rs), bh: true }); anchors.push([x, y]); break; }
    }
    if (rnd() < 0.4) addStar(0.06, 0.12);
    nt = 1 + Math.floor(rnd() * 3);
  }
  if (!L.bodies.length) return null;
  for (let k = 0; k < 200 && L.targets.length < nt; k++) {
    let x = R(-0.82, 0.82), y = R(-0.7, 1.5);
    if (rnd() < 0.75 && anchors.length) {
      // behind a well as seen from the launcher, give or take
      const st = anchors[Math.floor(rnd() * anchors.length)], ang = Math.atan2(st[1] - L.launch[1], st[0] - L.launch[0]) + R(-1.25, 1.25), d = R(0.28, 0.8);
      x = st[0] + Math.cos(ang) * d; y = st[1] + Math.sin(ang) * d;
      if (Math.abs(x) > 0.85 || y < -0.75 || y > 1.55) continue;
    }
    if (!free(x, y, 0.13)) continue;
    if (L.bodies.some(b => b.orbit && Math.abs(Math.hypot(x - b.orbit.cx, y - b.orbit.cy) - b.orbit.R) < b.r + 0.06)) continue;
    if (L.targets.some(t => Math.hypot(t[0] - x, t[1] - y) < 0.32)) continue;
    L.targets.push([f3(x), f3(y)]);
  }
  return L.targets.length === nt ? exact(L) : null;
}

/* ---- judging ---- */
const shot = (ai, na, si, ns) => { const a = ai * 2 * Math.PI / na, len = (0.15 + 0.85 * si / ns) * PULL; return [Math.cos(a) * len * SPEED, Math.sin(a) * len * SPEED]; };
// crowds are about threading many stars in one go, so there at least two targets must need a bent path
// (a twisting flight can arrive heading the way it left, so in a crowd the turn test flags nearly everything;
// there the targets must instead be spread across the sky, so one throw can only take them all by bending)
const directRule = (direct, nT) => { const n = direct.filter(d => d < 0.436).length; return world === 'crowd' ? true : n === 0 || (n === 1 && nT >= 3); };
const spread = L => { const a = L.targets.map(t => Math.atan2(t[1] - L.launch[1], t[0] - L.launch[0])); return Math.max(...a) - Math.min(...a); };
const PHASES = L => L.bodies.some(b => b.orbit) ? [0, 2.3, 4.6] : [0];
// with moving wells you can wait for a gap, so a target only counts as straight if it is straight in most phases:
// its effective turn is the second smallest over three phases (just the one value when nothing moves)
const effective = per => per[0].map((_, i) => { const v = per.map(p => p[i]).sort((a, b) => a - b); return v[Math.min(1, v.length - 1)]; });
function prescreen(L) {
  // a coarse fan of throws: any target you can hit just by aiming at it sinks the layout early
  const per = PHASES(L).map(t0 => {
    const direct = L.targets.map(() => 9);
    for (let ai = 0; ai < 48; ai++) for (const si of [3, 6, 9, 12, 15, 18]) {
      const [vx, vy] = shot(ai, 48, si, 20);
      sim(L, vx, vy, 14, L.targets.map(() => false), direct, t0);
    }
    return direct;
  });
  return directRule(effective(per), L.targets.length);
}
function judge(L) {
  const phases = PHASES(L), directP = phases.map(() => L.targets.map(() => 9));
  let total = 0, clears = 0, long = 0; const per = L.targets.map(() => 0), sigs = new Map();
  let sol = null, solN = 0, solT = 1e9;
  phases.forEach((t0, pi) => { for (let ai = 0; ai < 120; ai++) for (let si = 1; si <= 20; si++) {
    const [vx, vy] = shot(ai, 120, si, 20), qx = Math.round(vx * 1e5) / 1e5, qy = Math.round(vy * 1e5) / 1e5;
    const got = L.targets.map(() => false), age = sim(L, qx, qy, LIFE, got, directP[pi], t0);
    total++; got.forEach((g, i) => g && per[i]++);
    const nGot = got.filter(Boolean).length, clear = age > 0;
    // the hint is the quickest clearing throw from the very first step, so it replays exactly in the game
    if (t0 === 0 && (nGot > solN || (clear && age < solT))) { solN = nGot; if (clear) solT = age; sol = [qx, qy]; }
    if (clear) { clears++; if (age > 8) long++; }
    const k = got.reduce((m, g, i) => m | (g ? 1 << i : 0), 0); if (k) sigs.set(k, (sigs.get(k) || 0) + 1);
  } });
  const direct = effective(directP);
  const keys = [...sigs.keys()], full = (1 << L.targets.length) - 1; let best = 9;
  const rec = (acc, d, st) => { if (acc === full) { best = Math.min(best, d); return; } if (d >= 3) return; for (let i = st; i < keys.length; i++) rec(acc | keys[i], d + 1, i); };
  rec(0, 0, 0);
  return { f1: clears / total, per: per.map(v => v / total), minShots: best, longShare: clears ? long / clears : 0, direct, sol, solT };
}

if (world === 'judge') {
  const Ls = JSON.parse(fs.readFileSync(process.argv[3], 'utf8'));
  const res = Ls.map(L => { L = exact(L); const j = judge(L); return { name: L.name, par: j.minShots, f1: +j.f1.toFixed(4), minPer: +Math.min(...j.per).toFixed(4), direct: j.direct.map(d => +(d * 57.3).toFixed(0)), longShare: +j.longShare.toFixed(2), sol: j.sol, solT: +j.solT.toFixed(1) }; });
  console.log(JSON.stringify(res)); process.exit(0);
}

const out = [], t0 = Date.now(), why = { prop: 0, pre: 0, shots: 0, per: 0, f1: 0, direct: 0, nosol: 0 };
const file = `levels5-${world}-${seed0}.json`;
while (out.length < want && Date.now() - t0 < minutes * 60e3) {
  if (Date.now() - (why.t || t0) > 120e3) { why.t = Date.now(); process.stderr.write(`status ${out.length} ${JSON.stringify(why)}\n`); }
  const L = propose(); if (!L) { why.prop++; continue; }
  if (world === 'crowd' && spread(L) < 0.61) { why.prop++; continue; }
  if (!prescreen(L)) { why.pre++; continue; }
  const j = judge(L), minPer = Math.min(...j.per);
  if (j.minShots > 3) { why.shots++; continue; }
  if (minPer < 0.003) { why.per++; continue; }
  if (j.minShots === 1 && (j.f1 < (world === 'crowd' ? 0.0008 : 0.0015) || j.f1 > 0.05)) { why.f1++; continue; }
  if (!directRule(j.direct, L.targets.length)) { why.direct++; continue; }
  if (!j.sol || j.solT > 25 && j.minShots === 1) { why.nosol++; continue; }
  L.par = j.minShots; L.diff = +(-Math.log10(j.minShots === 1 ? j.f1 : minPer)).toFixed(2); L.longShare = +j.longShare.toFixed(2); L.sol = j.sol;
  for (const b of L.bodies) if (b.orbit) { delete b.orbit.ox; delete b.orbit.oy; delete b.orbit.c; delete b.orbit.s; }
  out.push(L); fs.writeFileSync(file, JSON.stringify(out));
  process.stderr.write(`${world} ${out.length}/${want} par ${L.par} diff ${L.diff} long ${L.longShare} ${((Date.now() - t0) / 60e3).toFixed(1)}m ${JSON.stringify(why)}\n`);
}
fs.writeFileSync(file, JSON.stringify(out));
console.log(world, 'done', out.length, JSON.stringify(why));
