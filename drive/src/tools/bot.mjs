// Drives every timed event with the AI driver (ai.mjs) to prove each is drivable, and checks replays.
// Usage: node tools/bot.mjs [event id] [car] [skill]
import { makeWorld } from '../world.mjs';
import { makeEvents, runGates } from '../events.mjs';
import { makeCar, stepCar, unpackInput, encodeInputs, decodeInputs, IN_EVERY } from '../car.mjs';
import { planRoute, makeDriver, drive } from '../ai.mjs';
const W = makeWorld(), EV = makeEvents(W), only = process.argv[2], model = process.argv[3] || 'sedan-sports', skill = +(process.argv[4] || 1);
for (const e of EV.list) {
  if (e.type !== 'sprint' || (only && only !== '-' && e.id !== only)) continue;
  const c = makeCar(W, e.start, model), st = { gi: 0, done: false }, codes = [], d = makeDriver(planRoute(e.path), skill);
  let hits = 0, code = 0;
  for (let k = 0; k < 120 * 400 && !st.done; k++) {
    if (k % IN_EVERY === 0) { code = drive(d, c); codes.push(code); }
    for (const ev of stepCar(W, c, unpackInput(code))) if (ev.t === 'hit') hits++;
    runGates(e, c, st);
  }
  const r = makeCar(W, e.start, model), rs = { gi: 0, done: false }, dec = decodeInputs(encodeInputs(codes));
  for (let k = 0; k < 120 * 400 && !rs.done; k++) { stepCar(W, r, unpackInput(dec[Math.floor(k / IN_EVERY)] ?? 0)); runGates(e, r, rs); }
  console.log(`${e.name.padEnd(14)} ${st.done ? st.time.toFixed(2) + ' s' : 'DNF at gate ' + st.gi + '/' + e.gates.length}  ${hits} hits  damage ${c.dmg.engine.toFixed(2)}  replay ${rs.done && rs.time === st.time ? 'identical' : 'DIFFERENT'}`);
}
