// Runs each race with the player's car driven by an AI (skill 1) against the AI field, then replays the recorded
// player inputs and checks the result is identical. Usage: node tools/racetest.mjs [event id] [car]
import { makeWorld } from '../world.mjs';
import { makeEvents } from '../events.mjs';
import { CARS, IN_EVERY } from '../car.mjs';
import { makeDriver, planRoute, drive } from '../ai.mjs';
import { makeRace, stepRace, standings, replayRace } from '../race.mjs';
const W = makeWorld(), EV = makeEvents(W), only = process.argv[2], model = process.argv[3] || 'sedan-sports';
for (const e of EV.list) {
  if (e.type !== 'sprint' || (only && only !== '-' && e.id !== only)) continue;
  const R = makeRace(W, e, model, {}), me = makeDriver(planRoute(e.path), 1), codes = [];
  let hits = 0;
  for (let k = 0; k < 120 * 500 && !R.st[R.n].done; k++) {
    if (k % IN_EVERY === 0) codes.push(drive(me, R.player));
    for (const ev of stepRace(W, R, codes[codes.length - 1])) if (ev.t === 'hit') hits++;
  }
  const s = R.st[R.n], again = replayRace(W, e, model, {}, codes);
  const field = R.cars.slice(0, R.n).map((c, k) => `${R.names[k]}:${CARS[c.model].name}${R.st[k].done ? '' : '(dnf g' + R.st[k].gi + ')'}`).join(' ');
  console.log(`${e.name.padEnd(14)} ${s.done ? `P${R.order.indexOf(R.n) + 1}/${R.n + 1} ${s.time.toFixed(1)}s` : 'DNF ' + s.gi + '/' + e.gates.length}  hits ${hits}  replay ${again && again.time === s.time ? 'identical' : 'DIFFERENT'}\n    ${field}`);
}
