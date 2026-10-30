// every level's stored hint must clear it under the shared physics, rocks included
const P = require('./phys.js'), fs = require('fs');
const WORLDS = JSON.parse(fs.readFileSync(process.argv[2] || 'worlds.json', 'utf8'));
function run(L, kind = 'n') {
  const W = P.makeWorld(L), q = v => Math.round(v * 1e5) / 1e5;
  W.comets.push(P.newComet(W, q(L.sol[0]), q(L.sol[1]), kind));
  while (!W.won && W.comets.some(c => c.alive) && W.tick < 600 * 90) P.step(W, {});
  return { won: W.won, t: W.tick / 600, got: W.got.filter(Boolean).length, rocks: W.rocks.filter(r => r.alive).length };
}
if (require.main === module) {
  let n = 0, bad = [];
  for (const w of WORLDS) w.levels.forEach((L, i) => { if (!L.sol) return; n++; const r = run(L); if (L.par === 1 && !r.won) bad.push(`${w.id}-${i} ${r.got}/${L.targets.length}`); });
  console.log('checked', n, 'par-1 failures', bad.length, bad.join(' '));
}
module.exports = { run };
