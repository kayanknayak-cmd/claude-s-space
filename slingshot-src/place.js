// Rubble placement: put rock piles on circular orbits near targets, so a well-aimed comet can knock rocks into them.
// A pile is kept only if, left alone for 40 s, it stays on screen and stays whole, does not cross a target in
// the opening seconds, and if the level's stored hint still clears the level with the rocks in place.
const P = require('./phys.js'), fs = require('fs'), { run } = require('./check.js');
const WORLDS = JSON.parse(fs.readFileSync('worlds.json', 'utf8'));
const key = L => JSON.stringify([L.launch, L.targets]);
const hash = s => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };

// whatever dominates the pull at (x, y): a lone star or black hole, or a waltzing pair taken as one mass at its center
function dominant(L, x, y) {
  let best = null, bw = 0;
  const pairs = new Map();
  for (const b of L.bodies) {
    if (b.orbit && b.star) { const k = b.orbit.cx + ',' + b.orbit.cy; const q = pairs.get(k) || { x: b.orbit.cx, y: b.orbit.cy, m: 0, a: 0, rs: 0 }; q.m += b.m; q.a += b.orbit.R; pairs.set(k, q); continue; }
    if (b.orbit) continue;
    const c = { x: b.x, y: b.y, m: b.m, a: 0, rs: b.rs || 0 }, d2 = (x - c.x) ** 2 + (y - c.y) ** 2, w = c.m / d2;
    if (w > bw) { bw = w; best = c; }
  }
  for (const q of pairs.values()) { const w = q.m / ((x - q.x) ** 2 + (y - q.y) ** 2); if (w > bw) { bw = w; best = q; } }
  return best;
}
// circular speed: v^2 = m / r, or m r / (r - rs)^2 for the black hole's force
const circV = (D, r) => D.rs ? Math.sqrt(D.m * r) / (r - D.rs) : Math.sqrt(D.m / r);
function clearOf(L, x, y, piles) {
  if (Math.abs(x) > 0.82 || y < -0.85 || y > 1.5) return false;
  if (Math.hypot(x - L.launch[0], y - L.launch[1]) < 0.4) return false;
  for (const b of L.bodies) {
    if (b.orbit) { if (Math.abs(Math.hypot(x - b.orbit.cx, y - b.orbit.cy) - b.orbit.R) < b.r + 0.14) return false; }
    else if (Math.hypot(x - b.x, y - b.y) < b.r + 0.16) return false;
  }
  if (L.targets.some(t => Math.hypot(t[0] - x, t[1] - y) < P.TR + 0.12)) return false;
  return piles.every(p => Math.hypot(p.x - x, p.y - y) > 0.3);
}
// left alone, does the pile behave?
function settles(L) {
  const W = P.makeWorld(L), T = L.targets, lim = (P.TR + P.RR + 0.02) ** 2;
  for (let n = 1; n <= 600 * 40; n++) {
    P.step(W, {});
    if (n % 12) continue;
    const alive = W.rocks.filter(r => r.alive);
    if (alive.length < W.rocks.length - 1) return 'broke';
    for (const r of alive) {
      if (Math.abs(r.x) > 1.12 || r.y < -1.7 || r.y > 1.8) return 'offscreen';
      // an untouched pile may pass behind a target later, but not in the opening seconds
      if (n < 600 * 4) for (const t of T) if ((r.x - t[0]) ** 2 + (r.y - t[1]) ** 2 < lim) return 'target';
    }
  }
  return true;
}
function place(L, want, seed) {
  let s = seed;
  const rnd = () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const base = run(L), piles = [];
  for (let tries = 0; tries < 400 && piles.length < want; tries++) {
    // an orbit just inside or outside a target's, starting beside it, so a nudge can send rocks across
    // (after 200 tries, any stable orbit on screen will do: then the rocks are there to be knocked about)
    const t = L.targets[Math.floor(rnd() * L.targets.length)], D = dominant(L, t[0], t[1]); if (!D) { WHY.noD = (WHY.noD || 0) + 1; continue; }
    const rt = Math.hypot(t[0] - D.x, t[1] - D.y), rmin = Math.max(0.24, 1.7 * D.a, D.rs * 6), rmax = Math.min(1.08 - D.x, D.x + 1.08, D.y + 1.6, 1.7 - D.y);
    const r = tries < 200 ? rt + (rnd() < 0.5 ? -1 : 1) * (0.13 + rnd() * 0.3) : rmin + rnd() * (rmax - rmin);
    if (r < Math.max(0.24, 1.7 * D.a, D.rs * 6)) { WHY.small = (WHY.small || 0) + 1; continue; }
    if (D.x - r < -1.08 || D.x + r > 1.08 || D.y - r < -1.6 || D.y + r > 1.7) { WHY.bounds = (WHY.bounds || 0) + 1; continue; }
    const a = tries < 200 ? Math.atan2(t[1] - D.y, t[0] - D.x) + (rnd() - 0.5) : rnd() * Math.PI * 2, x = +(D.x + Math.cos(a) * r).toFixed(3), y = +(D.y + Math.sin(a) * r).toFixed(3);
    if (!clearOf(L, x, y, piles)) { WHY.clear++; continue; }
    const rr = Math.hypot(x - D.x, y - D.y), v = circV(D, rr), sg = rnd() < 0.5 ? 1 : -1;
    const pile = { x, y, vx: +(-(y - D.y) / rr * v * sg).toFixed(5), vy: +((x - D.x) / rr * v * sg).toFixed(5) }, L2 = { ...L, piles: [...piles, pile] };
    const st = settles(L2); if (st !== true) { WHY[st] = (WHY[st] || 0) + 1; continue; }
    const res = run(L2);
    if (base.won ? !res.won : res.got < base.got) { WHY.hint++; continue; }
    piles.push(pile);
  }
  return piles;
}
const out = {}, WHY = { clear: 0, orbit: 0, hint: 0 };
let n = 0, withP = 0;
for (const w of WORLDS) w.levels.forEach((L, li) => {
  const k = key(L), h = hash(k);
  const want = w.daily ? (h % 2 ? 1 : 0) : li >= 7 && w.id !== 'w1' ? 2 : li >= (w.id === 'w1' ? 4 : 2) ? 1 : 0;
  n++;
  if (!want || !L.sol) return;
  const piles = place(L, want, h);
  if (piles.length) { out[k] = piles; withP++; }
  process.stderr.write(`${w.id}-${li} piles ${piles.length}/${want}\n`);
});
fs.writeFileSync('piles.json', JSON.stringify(out));
console.log('levels', n, 'with rubble', withP, JSON.stringify(WHY));
