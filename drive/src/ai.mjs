// AI driver: follows a route, plans its speed from the corners ahead and its braking distance, steers with
// pure pursuit. Used by the AI racers and by tools/bot.mjs. Deterministic (no trig), so a race with AI cars
// replays exactly from the player's inputs alone.
import { packInput } from './car.mjs';

// Prepare a route (list of [x, z] points) once: a smooth line and the cornering speed limit along it.
export function planRoute(raw, grip = 8.5) {
  // a smooth driving line: square tile bends become 6 m arcs (the road tiles' own curve), points every ~4 m
  const path = [];
  const push = (x, z) => { const l = path[path.length - 1]; if (!l || Math.abs(l[0] - x) + Math.abs(l[1] - z) > .5) path.push([x, z]); };
  for (let i = 0; i < raw.length; i++) {
    const q = raw[i], p = raw[i - 1], r = raw[i + 1];
    if (p && r) {
      const d1x = q[0] - p[0], d1z = q[1] - p[1], d2x = r[0] - q[0], d2z = r[1] - q[1];
      const l1 = Math.sqrt(d1x * d1x + d1z * d1z) || 1, l2 = Math.sqrt(d2x * d2x + d2z * d2z) || 1;
      const ax = d1x / l1, az = d1z / l1, bx = d2x / l2, bz = d2z / l2, cross = ax * bz - az * bx;
      if ((cross < 0 ? -cross : cross) > .7 && l1 > 8 && l2 > 8) {
        // quarter circle from 6 m before the corner to 6 m after it, centred on the inside
        const R = 6, sx = q[0] - ax * R, sz = q[1] - az * R, cx = sx + bx * R, cz = sz + bz * R;
        for (let k = 0; k <= 6; k++) {
          const t = k / 6, w = t * t * (3 - 2 * t);
          // blend the radius vectors and renormalise (a rational stand-in for sin/cos)
          const ux = (sx - cx) * (1 - w) + (q[0] + bx * R - cx) * w, uz = (sz - cz) * (1 - w) + (q[1] + bz * R - cz) * w, ul = Math.sqrt(ux * ux + uz * uz) || 1;
          push(cx + ux / ul * R, cz + uz / ul * R);
        }
        continue;
      }
    }
    if (p) { const dx = q[0] - p[0], dz = q[1] - p[1], L = Math.sqrt(dx * dx + dz * dz), n = Math.floor(L / 4); for (let k = 1; k < n; k++) push(p[0] + dx * k / n, p[1] + dz * k / n); }
    push(q[0], q[1]);
  }
  const n = path.length, lim = new Float32Array(n), cum = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    if (i > 0) { const dx = path[i][0] - path[i - 1][0], dz = path[i][1] - path[i - 1][1]; cum[i] = cum[i - 1] + Math.sqrt(dx * dx + dz * dz); }
    // the corner radius from points about 4 m either side (R = abc / 4K)
    const p = path[i > 0 ? i - 1 : 0], q = path[i], r = path[i < n - 1 ? i + 1 : n - 1];
    const a = Math.hypot(q[0] - p[0], q[1] - p[1]), b = Math.hypot(r[0] - q[0], r[1] - q[1]), c = Math.hypot(r[0] - p[0], r[1] - p[1]);
    const area2 = Math.abs((q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]));
    const R = area2 < 1e-6 ? 1e9 : a * b * c / (2 * area2);
    lim[i] = Math.min(70, Math.sqrt(grip * R));
  }
  return { path, lim, cum, n };
}

export function makeDriver(route, skill = 1, offset = 0) { return { route, i: 0, skill, offset, stuck: 0 }; }

// One decision (every IN_EVERY physics steps): returns a packed input for car c.
export function drive(d, c) {
  const { path, lim, cum, n } = d.route;
  // progress: nearest point, searching forward only
  let best = 1e18;
  for (let j = d.i; j < n && j < d.i + 14; j++) { const dx = path[j][0] - c.x, dz = path[j][1] - c.z, q = dx * dx + dz * dz; if (q < best) { best = q; d.i = j; } }
  // lost (after a reset or a spin): look back and forth along the route to find our place again
  if (best > 150) { const i0 = d.i; for (let j = i0 - 60 > 0 ? i0 - 60 : 0; j < n && j < i0 + 60; j++) { const dx = path[j][0] - c.x, dz = path[j][1] - c.z, q = dx * dx + dz * dz; if (q < best) { best = q; d.i = j; } } }
  const i = d.i, v = c.speed;
  // stuck or lost: ask for a reset (it goes through the input, so replays stay exact)
  d.stuck = v < 1.5 || best > 400 ? d.stuck + 1 : 0;
  if (d.stuck > 75) { d.stuck = 0; return packInput(0, 0, 0, 0, 1); }
  // speed: the slowest of (corner limit + braking room) over the next 300 m
  const brake = 5.5 * d.skill;
  let target = 70 * d.skill;
  for (let j = i; j < n && cum[j] - cum[i] < 300; j++) {
    const room = cum[j] - cum[i], allowed = Math.sqrt(lim[j] * d.skill * lim[j] * d.skill + 2 * brake * room);
    if (allowed < target) target = allowed;
  }
  // stay under the braking curve: brake as soon as we're over it, accelerate when comfortably under
  // (never brake at a crawl: the brake pedal turns into reverse below walking pace)
  if (d.cap !== undefined && d.cap < target) target = d.cap > 0 ? d.cap : 0;
  const th = v > target ? (v > 3 ? -1 : 0) : v < target - 1.5 ? 1 : 0;
  // steering: aim at a point ahead, shifted sideways by this driver's preferred line
  const look = 5 + v * .4;
  let j = i; while (j < n - 1 && cum[j] - cum[i] < look) j++;
  const p = path[j], pp = path[j > 0 ? j - 1 : 0], sx = p[0] - pp[0], sz = p[1] - pp[1], sl = Math.sqrt(sx * sx + sz * sz) || 1;
  const tx = p[0] - sz / sl * d.offset - c.x, tz = p[1] + sx / sl * d.offset - c.z;
  const fwd = tx * c.hx + tz * c.hz, side = -tx * c.hz + tz * c.hx, L2 = tx * tx + tz * tz || 1;
  let delta = 2 * 2.65 * side / L2;                    // pure pursuit: wheel angle for the arc through the target
  if (fwd < 0) delta = side < 0 ? -1 : 1;              // target behind: full lock toward it
  const gl = c.S.mu * 9.81 * (c.S.a + c.S.b) * 1.3 / (v * v + 1), lock = gl < c.S.steer ? gl : c.S.steer;
  const st = Math.max(-8, Math.min(8, Math.round(delta / lock * 8)));
  return packInput(st, th, 0, 0, 0);
}
