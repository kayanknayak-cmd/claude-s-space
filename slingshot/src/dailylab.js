// Daily layouts: random stars, black holes, moons and pairs, with targets put where looping flights return
// (the same lab as the hand-made levels); kept only if generous and loop-heavy.
const { design, star, bh, moon, pair, cluster } = require('./lab.js'), fs = require('fs');
const [seed0, want] = [+process.argv[2], +process.argv[3]];
let s = seed0 >>> 0;
const rnd = () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const R = (a, b) => +(a + (b - a) * rnd()).toFixed(3), PI = Math.PI;
function propose() {
  // nothing in a daily sky moves: single stars, fixed pairs, black holes and clusters
  const kind = [0, 1, 4, 5][Math.floor(rnd() * 4)], launch = [R(-0.35, 0.35), -1.38], n = 1 + Math.floor(rnd() * 3), w = Array.from({ length: n }, () => 1);
  let bodies;
  if (kind === 0) bodies = [star(R(-0.3, 0.3), R(-0.1, 0.6), R(0.2, 0.34))];
  if (kind === 1) { const y = R(0, 0.6), d = R(0.28, 0.45); bodies = [star(-d, y + R(-0.2, 0.2), R(0.14, 0.22)), star(d, y + R(-0.2, 0.2), R(0.14, 0.22))]; }
  if (kind === 2) bodies = pair(R(-0.15, 0.15), R(0.1, 0.5), R(0.42, 0.6), R(0.13, 0.2), R(0.12, 0.2), R(0, 6.28), rnd() < 0.5 ? 1 : -1);
  if (kind === 3) { const c = [R(-0.2, 0.2), R(0.05, 0.5)]; bodies = [star(c[0], c[1], R(0.24, 0.32)), moon(c[0], c[1], R(0.42, 0.68), +(R(5, 9) * (rnd() < 0.3 ? -1 : 1)).toFixed(2), R(0, 6.28))]; }
  if (kind === 4) bodies = [bh(R(-0.25, 0.25), R(0.05, 0.55), R(0.22, 0.32))];
  if (kind === 5) bodies = [cluster(R(-0.2, 0.2), R(0.05, 0.5), R(0.3, 0.44), R(0.17, 0.26))];
  return { name: 'daily', bodies, launch, w, T: 0.05 };
}
const out = [];
for (let k = 0; k < want * 4 && out.length < want; k++) {
  const L = design(propose(), true);
  if (L && L.win >= 0.03 && L.loop >= 0.4) { out.push(L); fs.writeFileSync(`daily-static-${seed0}.json`, JSON.stringify(out)); process.stderr.write(`${out.length}/${want} win ${(L.win * 100).toFixed(1)}% loops ${(L.loop * 100) | 0}%\n`); }
}
console.log('done', out.length);
