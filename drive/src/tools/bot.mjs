// Drives every timed event with a simple bot (pure pursuit along the route, brakes for corners) to prove each is
// drivable, and prints times, wall hits and replay checks. Usage: node tools/bot.mjs [event id] [car]
import { makeWorld } from '../world.mjs';
import { makeEvents, runGates } from '../events.mjs';
import { makeCar, stepCar, packInput, unpackInput, encodeInputs, decodeInputs, IN_EVERY } from '../car.mjs';
const W = makeWorld(), EV = makeEvents(W), only = process.argv[2], model = process.argv[3] || 'sedan-sports';
for (const e of EV.list) {
  if (e.type !== 'sprint' || (only && e.id !== only)) continue;
  const c = makeCar(W, e.start, model), st = { gi: 0, done: false }, codes = [];
  let near = 0, hits = 0, code = 0;
  for (let k = 0; k < 120 * 400 && !st.done; k++) {
    if (k % IN_EVERY === 0) {
      let bd = 1e9;
      // follow the route in order: never jump past the next gate (gates sit every 7 route tiles)
      const cap = e.id === 'gp' ? e.path.length : Math.min(e.path.length, 7 * (st.gi + 1) + 2);
      for (let j = near; j < Math.min(cap, near + 4); j++) { const d = (e.path[j][0] - c.x) ** 2 + (e.path[j][1] - c.z) ** 2; if (d < bd) { bd = d; near = j; } }
      const look = Math.min(e.path.length - 1, near + 1 + Math.floor(c.speed / 12)), tg = e.path[look];
      const tx = tg[0] - c.x, tz = tg[1] - c.z, tl = Math.hypot(tx, tz) || 1, side = (-c.hz * tx + c.hx * tz) / tl, fwd = (c.hx * tx + c.hz * tz) / tl;
      // corner ahead: how much the route turns over the next few tiles
      const a = e.path[Math.min(e.path.length - 1, near + 2)], b = e.path[Math.min(e.path.length - 1, near + 4)];
      const turn = Math.abs((a[0] - e.path[near][0]) * (b[1] - a[1]) - (a[1] - e.path[near][1]) * (b[0] - a[0])) > 1;
      const th = turn && c.speed > 17 ? -1 : 1;
      const st8 = Math.max(-8, Math.min(8, Math.round((fwd < 0 ? Math.sign(side) || 1 : side * 2.2) * 8)));
      code = packInput(st8, th, 0, 0, 0);
      codes.push(code);
    }
    for (const ev of stepCar(W, c, unpackInput(code))) if (ev.t === 'hit') hits++;
    runGates(e, c, st);
  }
  // replay check through the same gates
  const r = makeCar(W, e.start, model), rs = { gi: 0, done: false }, dec = decodeInputs(encodeInputs(codes));
  for (let k = 0; k < 120 * 400 && !rs.done; k++) { stepCar(W, r, unpackInput(dec[Math.floor(k / IN_EVERY)] ?? 0)); runGates(e, r, rs); }
  console.log(`${e.name.padEnd(14)} ${st.done ? st.time.toFixed(2) + ' s' : 'DNF at gate ' + st.gi + '/' + e.gates.length}  ${hits} hits  ${(e.len || 0) | 0} m  replay ${rs.done && rs.time === st.time ? 'identical' : 'DIFFERENT'}`);
}
