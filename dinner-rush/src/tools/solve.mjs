// Proves each level can be won: searches a grid of throws, best first, and prints a winning sequence.
// Usage: node tools/solve.mjs [level index]   (run `node build.mjs` first for hulls.json)
import fs from 'fs';
import { createRequire } from 'module';
import { makeSim, DT } from '../sim.mjs';
import { LEVELS } from '../levels.mjs';
const R = createRequire(import.meta.url)('@dimforge/rapier3d-compat');
await R.init();
const H = JSON.parse(fs.readFileSync(new URL('../hulls.json', import.meta.url)));

function play(L, seq) {
  const S = makeSim(R, H, L);
  for (const [vx, vy] of seq) {
    S.throwFood(vx, vy);
    while (!S.won && !(S.steps - S.lastThrow > 30 && S.rested())) S.step();
    if (S.won) break;
  }
  const fed = S.customers.filter(c => c.fed).length;
  S.world.free();
  return { won: S.won, fed };
}
const grid = [];
for (let vx = 1; vx <= 10.001; vx += .4) for (let vy = -1; vy <= 10.001; vy += .4) if (vx * vx + vy * vy <= 100) grid.push([+vx.toFixed(2), +vy.toFixed(2)]);

function solve(L, seq, fed0, depth) {
  if (seq.length >= L.ammo.length) return null;
  const good = [];
  let wins = 0;
  for (const t of grid) {
    const r = play(L, [...seq, t]);
    if (r.won) { wins++; if (!good.length || !good[0].won) good.unshift({ t, ...r }); }
    else if (r.fed > fed0) good.push({ t, ...r });
  }
  if (!seq.length) console.log(`  first throw: ${wins} of ${grid.length} win outright (${(100 * wins / grid.length).toFixed(1)}%)`);
  if (good[0] && good[0].won) return [...seq, good[0].t];
  for (const g of good.slice(0, depth)) { const s = solve(L, [...seq, g.t], g.fed, 2); if (s) return s; }
  return null;
}
const only = process.argv[2];
for (const [i, L] of LEVELS.entries()) {
  if (only !== undefined && +only !== i) continue;
  const t0 = Date.now();
  console.log(`${i} ${L.name}`);
  const s = solve(L, [], 0, 3);
  console.log(`  ${s ? 'hint ' + JSON.stringify(s) : 'NO SOLUTION'}  (${((Date.now() - t0) / 1000).toFixed(0)} s)`);
}
