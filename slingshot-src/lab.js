// Level lab: hand-designed layouts, tuned and measured with the game's own physics.
// Each level is written by hand: its bodies and an idea of where the targets go along a looping flight
// ("half a turn round the star", "on the second lap", "four seconds in"). The lab tries many reference
// throws, places the targets on that flight, and measures every layout over a fan of throws:
//   win   the share of throws that clear the level,
//   loop  the share of those wins that went at least once around before the last target,
// keeping the placement whose win share is nearest the level's intended generosity, with the most loops.
// usage: node lab.js <world> [quick]
const P = require('./phys.js'), fs = require('fs');
const DT = P.DT, PULL = 0.75, SPEED = 1.3, TAU = Math.PI * 2;
const exact = L => ({ ...L, bodies: L.bodies.map(b => b.orbit ? { ...b, orbit: { ...b.orbit,
  ox: b.orbit.R * Math.cos(b.orbit.phase), oy: b.orbit.R * Math.sin(b.orbit.phase),
  c: Math.cos(2 * Math.PI * DT / b.orbit.period), s: Math.sin(2 * Math.PI * DT / b.orbit.period) } } : b) });
const f3 = v => +v.toFixed(3), rad = m => f3(0.035 + Math.sqrt(m) * 0.08);
const star = (x, y, m) => ({ x, y, m, r: rad(m) });
const bh = (x, y, m) => ({ x, y, m, rs: f3(0.15 * m), r: f3(0.39 * m), bh: true });
const moon = (cx, cy, R, period, phase, m = 0.08) => ({ m, r: f3(0.03 + Math.sqrt(m) * 0.05), orbit: { cx, cy, R, period, phase } });
// two stars on a true Kepler circle about their barycenter: omega^2 a^3 = m1 + m2
const pair = (cx, cy, a, m1, m2, phase, sign) => {
  const M = m1 + m2, period = +(sign * 2 * Math.PI / Math.sqrt(M / (a * a * a))).toFixed(4);
  return [{ m: m1, r: rad(m1), star: true, orbit: { cx, cy, R: f3(a * m2 / M), period, phase } },
          { m: m2, r: rad(m2), star: true, orbit: { cx, cy, R: f3(a * m1 / M), period, phase: +(phase + Math.PI).toFixed(3) } }];
};
const PI = Math.PI;
// w: winding (radians) about the center; t: seconds into the flight. T: intended share of winning throws.
const SPECS = {
  first: [
    { name: 'First orbit', bodies: [star(0, 0.15, 0.26)], launch: [0, -1.38], w: [1.0 * PI], T: 0.16 },
    { name: 'Comeback', bodies: [star(0.05, 0.1, 0.28)], launch: [-0.25, -1.38], w: [0.5 * PI, 2.3 * PI], T: 0.11 },
    { name: 'Around the back', bodies: [star(0.1, 0.35, 0.3)], launch: [0.2, -1.38], w: [1.1 * PI], T: 0.11 },
    { name: 'Lap', bodies: [star(-0.1, 0.2, 0.25)], launch: [0.1, -1.38], w: [0.7 * PI, 1.8 * PI], T: 0.09 },
    { name: 'Ellipse', bodies: [star(0, -0.15, 0.3)], launch: [0.3, -1.38], w: [0.4 * PI, 1.0 * PI, 1.6 * PI], T: 0.07 },
    { name: 'Slow lap', bodies: [star(0.15, 0.55, 0.34)], launch: [-0.3, -1.38], w: [0.9 * PI, 2.6 * PI], T: 0.06 },
    { name: 'Halo', bodies: [star(0, 0.2, 0.22)], launch: [-0.1, -1.38], w: [0.5 * PI, 1.25 * PI, 2.1 * PI], T: 0.05 },
    { name: 'Long way round', bodies: [star(-0.35, 0.5, 0.3)], launch: [0.35, -1.38], w: [1.3 * PI, 2.9 * PI], T: 0.05 },
  ],
  binary: [
    { name: 'Duet', bodies: [star(-0.32, 0.2, 0.17), star(0.32, 0.2, 0.17)], launch: [0, -1.38], t: [1.6, 4.5], T: 0.08 },
    { name: 'Figure eight', bodies: [star(-0.38, 0.25, 0.2), star(0.38, 0.25, 0.2)], launch: [0.1, -1.38], t: [2.0, 5.0, 8.0], T: 0.05 },
    { name: 'Seesaw', bodies: [star(-0.3, -0.1, 0.24), star(0.35, 0.7, 0.14)], launch: [0.3, -1.38], t: [2.5, 6.5], T: 0.06 },
    { name: 'Saddle', bodies: [star(-0.45, 0.35, 0.16), star(0.45, 0.35, 0.16)], launch: [-0.1, -1.38], t: [1.5, 7], T: 0.05 },
    { name: 'Tidal', bodies: [star(0, 0.0, 0.26), star(0, 0.95, 0.12)], launch: [0.25, -1.38], t: [3, 7], T: 0.05 },
    { name: 'Gemini', bodies: [star(-0.3, 0.45, 0.2), star(0.3, -0.05, 0.2)], launch: [0, -1.38], t: [2, 5, 9], T: 0.04 },
  ],
  waltz: [
    { name: 'Barycenter', bodies: pair(0, 0.3, 0.5, 0.16, 0.16, 0, 1), launch: [0, -1.38], t: [2, 5], T: 0.06 },
    { name: 'Minuet', bodies: pair(0, 0.4, 0.42, 0.2, 0.12, 1, -1), launch: [0.2, -1.38], t: [2.5, 6], T: 0.05 },
    { name: 'Do-si-do', bodies: pair(-0.1, 0.2, 0.55, 0.15, 0.15, 2, 1), launch: [0.2, -1.38], t: [1.5, 4, 7], T: 0.04 },
    { name: 'Pas de deux', bodies: pair(0.1, 0.5, 0.48, 0.18, 0.14, 0.5, -1), launch: [-0.2, -1.38], t: [3, 8], T: 0.04 },
    { name: 'Promenade', bodies: pair(0, 0.1, 0.6, 0.14, 0.14, 0, 1), launch: [0.1, -1.38], t: [2, 6, 10], T: 0.03 },
    { name: 'Last dance', bodies: pair(0, 0.45, 0.5, 0.2, 0.2, 1, 1), launch: [-0.1, -1.38], t: [3, 7, 11], T: 0.03 },
  ],
  moons: [
    { name: 'Moonrise', bodies: [star(0, 0.2, 0.28), moon(0, 0.2, 0.55, 7, 0)], launch: [0, -1.38], t: [2, 5], T: 0.07 },
    { name: 'Tug', bodies: [star(0, 0.25, 0.26), moon(0, 0.25, 0.45, -6, 2)], launch: [0.2, -1.38], t: [2.5, 6], T: 0.06 },
    { name: 'Swing-by', bodies: [star(0.1, 0.3, 0.3), moon(0.1, 0.3, 0.62, 8, 4)], launch: [-0.2, -1.38], t: [3, 7], T: 0.05 },
    { name: 'Capture', bodies: [star(0, 0.1, 0.24), moon(0, 0.1, 0.4, 5, 0), moon(0, 0.1, 0.72, -9, 3)], launch: [0.15, -1.38], t: [2, 5, 8], T: 0.04 },
    { name: 'Shepherd', bodies: [star(-0.1, 0.4, 0.3), moon(-0.1, 0.4, 0.5, 6.5, 1, 0.1)], launch: [0.2, -1.38], t: [2, 6, 9], T: 0.04 },
    { name: 'Syzygy', bodies: [star(0, 0.3, 0.28), moon(0, 0.3, 0.45, 6, 0), moon(0, 0.3, 0.75, 9, 0)], launch: [-0.15, -1.38], t: [3, 7], T: 0.035 },
  ],
  horizon: [
    { name: 'Shadow', bodies: [bh(0, 0.25, 0.26)], launch: [0, -1.38], w: [1.0 * PI, 2.0 * PI], T: 0.07 },
    { name: 'Photon ring', bodies: [bh(0.1, 0.35, 0.3)], launch: [-0.15, -1.38], w: [0.8 * PI, 2.6 * PI], T: 0.06 },
    { name: 'Precession', bodies: [bh(0, 0.2, 0.24)], launch: [0.15, -1.38], w: [1.2 * PI, 3.2 * PI, 5.0 * PI], T: 0.05 },
    { name: 'Zoom-whirl', bodies: [bh(-0.15, 0.45, 0.3)], launch: [0.2, -1.38], w: [3.0 * PI, 5.5 * PI], T: 0.04 },
    { name: 'Einstein ring', bodies: [bh(0, 0.3, 0.28), star(0.55, -0.35, 0.08)], launch: [-0.1, -1.38], w: [1.5 * PI, 3.5 * PI], T: 0.04 },
    { name: 'Last stable orbit', bodies: [bh(0, 0.35, 0.32)], launch: [0.1, -1.38], w: [1.0 * PI, 3.0 * PI, 5.0 * PI], T: 0.03 },
  ],
};

const center = L => { const b = L.bodies[0]; return b.orbit ? [b.orbit.cx, b.orbit.cy] : [b.x, b.y]; };
const shot = (ai, na, si, ns) => { const a = ai * TAU / na, len = (0.15 + 0.85 * si / ns) * PULL; return [Math.round(Math.cos(a) * len * SPEED * 1e5) / 1e5, Math.round(Math.sin(a) * len * SPEED * 1e5) / 1e5]; };
// one throw, after t0 seconds of the level running; returns the samples and/or the outcome
function fly(L, vx, vy, t0, life, sample) {
  const W = P.makeWorld(L), [cx, cy] = center(L), out = { won: false, hits: 0, wind: 0, windAtWin: 0, t: 0, path: [] };
  for (let n = 0; n < Math.round(t0 / DT); n++) P.step(W, {});
  const c = P.newComet(W, vx, vy, 'n'); W.comets.push(c);
  let last = null, wind = 0;
  const H = {
    hit: () => { out.hits++; if (W.won) { out.won = true; out.windAtWin = Math.abs(wind); out.t = c.age; } },
    track: q => {
      const a = Math.atan2(q.y - cy, q.x - cx);
      if (last != null) { let d = a - last; if (d > PI) d -= TAU; if (d < -PI) d += TAU; wind += d; }
      last = a; if (sample) out.path.push([q.x, q.y, q.age, Math.abs(wind)]);
    },
  };
  const steps = Math.round(life / DT);
  for (let n = 0; n < steps && c.alive && !W.won; n++) P.step(W, H);
  out.wind = Math.abs(wind); out.alive = c.alive; out.fate = c.fate;
  return out;
}
function okSpot(L, x, y, placed) {
  if (Math.abs(x) > 0.88 || y < -0.95 || y > 1.52) return false;
  if (Math.hypot(x - L.launch[0], y - L.launch[1]) < 0.45) return false;
  for (const b of L.bodies) {
    if (b.orbit) { if (Math.abs(Math.hypot(x - b.orbit.cx, y - b.orbit.cy) - b.orbit.R) < b.r + 0.08) return false; }
    else if (Math.hypot(x - b.x, y - b.y) < b.r + (b.bh ? 0.16 : 0.11)) return false;
  }
  return placed.every(p => Math.hypot(p[0] - x, p[1] - y) > 0.3);
}
// put the targets on the reference flight where the spec says, nudging along the path to a legal spot
function place(spec, L, path) {
  const out = [];
  const keys = spec.w ? spec.w : spec.t, col = spec.w ? 3 : 2;
  for (const k of keys) {
    let best = -1;
    for (let d = 0; d < 60 && best < 0; d++) for (const sgn of [1, -1]) {
      const want = k * (1 + sgn * d * 0.006), i = path.findIndex(p => p[col] >= want);
      if (i < 0) continue;
      if (okSpot(L, path[i][0], path[i][1], out)) { best = i; break; }
    }
    if (best < 0) return null;
    out.push([f3(path[best][0]), f3(path[best][1])]);
  }
  return out;
}
function measure(L, na, ns, life, phases) {
  let n = 0, win = 0, loop = 0, any = 0;
  for (const t0 of phases) for (let ai = 0; ai < na; ai++) for (let si = 1; si <= ns; si++) {
    const [vx, vy] = shot(ai, na, si, ns), r = fly(L, vx, vy, t0, life, false);
    n++; if (r.hits) any++;
    if (r.won) { win++; if (r.windAtWin >= TAU * 0.9) loop++; }
  }
  return { win: win / n, loop: win ? loop / win : 0, any: any / n };
}
const score = (m, T) => m.win <= 0 ? -99 : -Math.abs(Math.log(m.win / T)) + 1.2 * m.loop + 0.3 * Math.min(1, m.any * 2);
// Where do looping flights come back to? Fly a fan of throws, note every cell each flight crosses and how far
// round it had gone when it first got there, then choose target spots that many of the same throws reach,
// at least one of them only after a full turn. Those are places a throw that misses can still come good.
const CELL = 0.05;
function visits(L, na, ns, life, phases) {
  const all = [];
  for (const t0 of phases) for (let ai = 0; ai < na; ai++) for (let si = 1; si <= ns; si++) {
    const [vx, vy] = shot(ai, na, si, ns), r = fly(L, vx, vy, t0, life, true), seen = new Map();
    for (const [x, y, , w] of r.path) {
      const i = Math.round(x / CELL), j = Math.round(y / CELL);
      for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) {
        if (Math.hypot(x - (i + a) * CELL, y - (j + b) * CELL) > 0.07) continue;
        const k = (i + a) * 1000 + (j + b); if (!seen.has(k)) seen.set(k, w);
      }
    }
    all.push({ vx, vy, t0, seen });
  }
  return all;
}
function design(spec, quick) {
  const L0 = exact({ launch: spec.launch, bodies: spec.bodies, targets: [] }), moving = spec.bodies.some(b => b.orbit);
  const phases = moving ? [0, 2.2] : [0], nT = (spec.w || spec.t).length;
  const V = visits(L0, 48, 10, 40, phases);
  // candidate spots: cells where the target would be legal, ranked by how many flights reach them
  const count = new Map();
  for (const f of V) for (const k of f.seen.keys()) count.set(k, (count.get(k) || 0) + 1);
  const spot = k => [Math.round(k / 1000) * CELL, (k - Math.round(k / 1000) * 1000) * CELL];
  let cells = [...count.entries()].filter(([k]) => { const [x, y] = spot(k); return okSpot(L0, x, y, []); }).sort((a, b) => b[1] - a[1]).slice(0, 160).map(e => e[0]);
  const TURN = TAU * 0.9;
  // greedy with a small beam: sets of nT spots, scored by the flights that reach all of them with a turn before the last
  let beam = [[]];
  for (let d = 0; d < nT; d++) {
    const next = [];
    for (const set of beam) for (const k of cells) {
      if (set.includes(k)) continue;
      const pts = set.map(spot), [x, y] = spot(k);
      if (!okSpot(L0, x, y, pts)) continue;
      const S2 = [...set, k];
      let joint = 0, loops = 0;
      for (const f of V) {
        let ok = true, last = 0;
        for (const q of S2) { const w = f.seen.get(q); if (w === undefined) { ok = false; break; } last = Math.max(last, w); }
        if (ok) { joint++; if (last >= TURN) loops++; }
      }
      next.push({ set: S2, joint, loops, sc: (d === nT - 1 ? loops * 1.0 + joint * 0.25 : joint + loops) });
    }
    next.sort((a, b) => b.sc - a.sc); beam = next.slice(0, quick ? 3 : 8).map(n => n.set);
    if (!beam.length) return null;
  }
  // measure the best few exactly, with real target radii, and keep the most generous that still loops
  const tried = beam.slice(0, quick ? 1 : 4).map(set => {
    const targets = set.map(k => spot(k).map(f3)), L = { ...L0, targets }, m = measure(L, 60, 12, 40, phases);
    return { targets, m };
  }).sort((a, b) => (b.m.win * (0.4 + b.m.loop)) - (a.m.win * (0.4 + a.m.loop)));
  const b = tried[0]; if (!b || b.m.win <= 0) return null;
  // the hint: the quickest throw from the first step that clears it
  const L = { ...L0, targets: b.targets }; let sol = null, solT = 1e9;
  for (let ai = 0; ai < 72; ai++) for (let si = 1; si <= 14; si++) { const [vx, vy] = shot(ai, 72, si, 14), r = fly(L, vx, vy, 0, 40, false); if (r.won && r.t < solT) { solT = r.t; sol = [vx, vy]; } }
  if (!sol) return null;
  const bodies = spec.bodies.map(q => q.orbit ? { ...q, orbit: { cx: q.orbit.cx, cy: q.orbit.cy, R: q.orbit.R, period: q.orbit.period, phase: q.orbit.phase } } : q);
  return { name: spec.name, launch: spec.launch, bodies, targets: b.targets, sol, par: 1, win: +b.m.win.toFixed(4), loop: +b.m.loop.toFixed(2), cands: cells.length };
}
if (require.main === module) {
  const w = process.argv[2], quick = process.argv[3] === 'quick', out = [];
  for (const spec of SPECS[w]) {
    const t0 = Date.now(), L = design(spec, quick);
    process.stderr.write(`${w} ${spec.name}: ${L ? `win ${(L.win * 100).toFixed(1)}% (want ${(spec.T * 100).toFixed(1)}) loops ${(L.loop * 100) | 0}% from ${L.cands} candidates` : 'NO LAYOUT'} ${((Date.now() - t0) / 1000).toFixed(0)}s\n`);
    if (L) out.push(L);
    fs.writeFileSync(`hand-${w}.json`, JSON.stringify(out));
  }
}
module.exports = { SPECS, fly, measure, exact, design, star, bh, moon, pair };
