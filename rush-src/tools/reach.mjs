// For each customer in a level: share of grid throws that feed them with their own food from a fresh start.
// Usage: node tools/reach.mjs <level index>
import fs from 'fs';
import { createRequire } from 'module';
import { makeSim } from '../sim.mjs';
import { LEVELS } from '../levels.mjs';
const R = createRequire(import.meta.url)('@dimforge/rapier3d-compat');
await R.init();
const H = JSON.parse(fs.readFileSync(new URL('../hulls.json', import.meta.url)));
const L = LEVELS[+process.argv[2]];
for (const [ci, c] of L.customers.entries()) {
  let n = 0, hits = 0, best = null;
  for (let vx = .5; vx <= 10; vx += .4) for (let vy = -1; vy <= 10; vy += .4) {
    if (vx * vx + vy * vy > 100) continue;
    n++;
    const S = makeSim(R, H, { ...L, ammo: [c.want] });
    S.throwFood(vx, vy);
    while (!S.customers[ci].fed && S.steps - S.lastThrow < 600 && !(S.steps - S.lastThrow > 30 && S.rested())) S.step();
    if (S.customers[ci].fed) { hits++; best ||= [+vx.toFixed(2), +vy.toFixed(2)]; }
    S.world.free();
  }
  console.log(`${c.who} wants ${c.want}: ${hits}/${n} (${(100 * hits / n).toFixed(1)}%) e.g. ${JSON.stringify(best)}`);
}
