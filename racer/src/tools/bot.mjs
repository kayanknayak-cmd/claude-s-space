// Pure-pursuit bot: aims at a point `look + speed * .35` metres down the centerline, steering gain k.
import { centerline } from '../track.mjs';
import { makeCar, stepCar, IN_EVERY } from '../sim.mjs';
export function drive(T, k, look) {
  const pts = centerline(T, 1), c = makeCar(T), inputs = [];
  let near = 0, u = 0, walls = 0, drifts = 0, boosts = 0;
  for (let s = 0; s < 120 * 120 && !c.done; s++) {
    if (s % IN_EVERY === 0) {
      let best = 1e9;
      for (let j = near; j < near + 40; j++) { const p = pts[j % pts.length], d = (p.x - c.x) ** 2 + (p.z - c.z) ** 2; if (d < best) { best = d; near = j % pts.length; } }
      const tgt = pts[(near + Math.round(look + c.speed * .35)) % pts.length];
      const tx = tgt.x - c.x, tz = tgt.z - c.z, tl = Math.hypot(tx, tz);
      u = Math.max(-8, Math.min(8, Math.round((-c.hz * tx + c.hx * tz) / tl * k * 8)));
      inputs.push(u);
    }
    for (const e of stepCar(T, c, u)) { if (e.t === 'wall') walls++; if (e.t === 'drift') drifts++; if (e.t === 'boost') boosts++; }
  }
  return { time: c.done ? c.time : null, inputs, walls, drifts, boosts };
}
