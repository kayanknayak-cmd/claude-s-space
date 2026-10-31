// Arcade car physics for Sunday Drive. Deterministic (only + - * / sqrt floor): the same inputs from the same start
// give the same drive on every device, which makes ghosts, challenge links and the leaderboard honest.
import { groundAt, roadAt, T, N, WATER } from './world.mjs';

export const DT = 1 / 120, IN_EVERY = 4, G = 22;

// Handling per Car Kit model: top speed and acceleration (m/s, m/s^2), grip (how fast sideways sliding dies),
// steer (front-wheel lock) and bounce (suspension wobble, visual).
export const CARS = {
  'race': { name: 'Formula', vmax: 52, acc: 17, grip: 12, steer: .62, bounce: .5 },
  'race-future': { name: 'Prototype', vmax: 55, acc: 17, grip: 11, steer: .6, bounce: .5 },
  'sedan-sports': { name: 'Coupe', vmax: 47, acc: 15, grip: 10, steer: .62, bounce: .8 },
  'hatchback-sports': { name: 'Hot hatch', vmax: 44, acc: 16, grip: 10.5, steer: .66, bounce: .9 },
  'police': { name: 'Interceptor', vmax: 48, acc: 14, grip: 10, steer: .6, bounce: .9 },
  'sedan': { name: 'Sedan', vmax: 40, acc: 11, grip: 9, steer: .6, bounce: 1 },
  'taxi': { name: 'Taxi', vmax: 41, acc: 11, grip: 9, steer: .6, bounce: 1 },
  'suv': { name: 'SUV', vmax: 40, acc: 12, grip: 8.5, steer: .58, bounce: 1.4 },
  'suv-luxury': { name: 'Luxury SUV', vmax: 43, acc: 13, grip: 9, steer: .58, bounce: 1.2 },
  'van': { name: 'Van', vmax: 36, acc: 9, grip: 8, steer: .55, bounce: 1.3 },
  'delivery': { name: 'Delivery truck', vmax: 34, acc: 9, grip: 8, steer: .52, bounce: 1.4 },
  'truck': { name: 'Pickup', vmax: 38, acc: 10, grip: 8, steer: .56, bounce: 1.5 },
  'ambulance': { name: 'Ambulance', vmax: 39, acc: 10, grip: 8, steer: .54, bounce: 1.3 },
  'firetruck': { name: 'Fire engine', vmax: 34, acc: 8, grip: 7.5, steer: .5, bounce: 1.3 },
  'garbage-truck': { name: 'Bin lorry', vmax: 30, acc: 7, grip: 7, steer: .5, bounce: 1.3 },
  'tractor': { name: 'Tractor', vmax: 22, acc: 8, grip: 9, steer: .62, bounce: 1.6 },
  'kart-oobi': { name: 'Kart', vmax: 36, acc: 20, grip: 13, steer: .7, bounce: .4 },
};

export function makeCar(W, pose, model = 'sedan-sports') {
  const y = groundAt(W, pose.x, pose.z);
  return {
    model, x: pose.x, y, z: pose.z, hx: pose.hx, hz: pose.hz, vx: 0, vy: 0, vz: 0, s: 0,
    air: 0, airT: 0, drift: 0, driftT: 0, slip: 0, meter: .3, boosting: 0, speed: 0, f: 0,
    steps: 0, onRoad: true, wet: 0, safe: { x: pose.x, z: pose.z, hx: pose.hx, hz: pose.hz },
  };
}

// Pack one input sample: steer level -8..8, throttle -1/0/1, handbrake, boost, reset. 408 codes, two letters each.
export const packInput = (st, th, hb, bo, rs) => (((st + 8) * 3 + (th + 1)) * 4 + hb * 2 + bo) * 2 + rs;
export function unpackInput(c) { const rs = c % 2; c = (c - rs) / 2; const bo = c % 2; c = (c - bo) / 2; const hb = c % 2; c = (c - hb) / 2; const th = c % 3 - 1; const st = (c - (th + 1)) / 3 - 8; return { st, th, hb, bo, rs }; }
export function encodeInputs(codes) {
  let out = '';
  for (let i = 0; i < codes.length;) {
    let j = i; while (j < codes.length && codes[j] === codes[i]) j++;
    out += String.fromCharCode(65 + Math.floor(codes[i] / 26), 65 + codes[i] % 26) + (j - i).toString(36);
    i = j;
  }
  return out;
}
export function decodeInputs(s) {
  const out = [], re = /([A-Z])([A-Z])([0-9a-z]+)/g;
  let m;
  while ((m = re.exec(s))) { const c = (m[1].charCodeAt(0) - 65) * 26 + m[2].charCodeAt(0) - 65, n = parseInt(m[3], 36); for (let k = 0; k < n && out.length < 200000; k++) out.push(c); }
  return out;
}

// colliders near (x, z): world boxes and circles, from the world's 24 m bucket grid
function nearby(W, x, z, out) {
  out.length = 0;
  const a0 = Math.floor(x / (2 * T)), b0 = Math.floor(z / (2 * T));
  for (let b = b0 - 1; b <= b0 + 1; b++) for (let a = a0 - 1; a <= a0 + 1; a++) {
    if (a < 0 || b < 0 || a >= N / 2 || b >= N / 2) continue;
    for (const k of W.grid[b * (N / 2) + a]) if (out.indexOf(k) < 0) out.push(k);
  }
  return out;
}
const near = [];

// One physics step. inp: an unpacked input. Returns events (hit, land, splash, drift, boost) for sound and effects.
export function stepCar(W, c, inp) {
  const ev = [], P = CARS[c.model] || CARS['sedan-sports'];
  c.steps++;
  if (inp.rs) { respawn(W, c); ev.push({ t: 'reset' }); return ev; }
  // steering eases toward the target so a key never snaps the wheels to full lock
  c.s += (inp.st / 8 - c.s) * .2;
  let hx = c.hx, hz = c.hz;
  const rx = -hz, rz = hx;
  let f = c.vx * hx + c.vz * hz, l = c.vx * rx + c.vz * rz;
  const af = f < 0 ? -f : f;

  if (!c.air) {
    // yaw: bicycle model with steering that fades with speed (calm at 150 km/h, sharp in town)
    const lock = P.steer / (1 + (af / 15) * (af / 15));
    let w = f * c.s * lock / 2.6;
    // handbrake: the rear lets go, so the car rotates more and slides; drifting holds until you straighten up
    if (inp.hb && af > 9 && !c.drift && (c.s > .25 || c.s < -.25)) { c.drift = c.s > 0 ? 1 : -1; c.driftT = 0; ev.push({ t: 'drift' }); }
    const slideAng = af > 1 ? (l < 0 ? -l : l) / af : 0;
    if (c.drift) {
      c.driftT += DT;
      w = w * 1.7 + c.drift * .35 * (af > 20 ? 1 : af / 20);
      if ((!inp.hb && slideAng < .12) || af < 6) { c.drift = 0; }
    }
    // rotate the heading with the rational rotation ((1-t^2), 2t)/(1+t^2), t = half the angle
    const t = w * DT / 2, q = 1 / (1 + t * t), co = (1 - t * t) * q, si = 2 * t * q;
    hx = c.hx * co + rx * si; hz = c.hz * co + rz * si;
    const hn = 1 / Math.sqrt(hx * hx + hz * hz); hx *= hn; hz *= hn; c.hx = hx; c.hz = hz;
    const nrx = -hz, nrz = hx;
    f = c.vx * hx + c.vz * hz; l = c.vx * nrx + c.vz * nrz;

    // sideways grip: low while drifting or on the handbrake, a little lower off the road
    const grip = c.drift ? (inp.hb ? 1.4 : 2.6) : inp.hb ? 2 : c.onRoad ? P.grip : P.grip * .75;
    const keep = 1 - grip * DT > 0 ? 1 - grip * DT : 0, lost = l * (1 - keep);
    l *= keep;
    f -= (f > 0 ? 1 : -1) * (lost < 0 ? -lost : lost) * .05;
    c.slip = l < 0 ? -l : l;

    // engine, brakes, boost
    const vmax = (c.onRoad ? P.vmax : P.vmax * .78) + (c.boosting ? 12 : 0);
    if (inp.th > 0) {
      if (f < -.5) f += 26 * DT;
      else if (f < vmax) f += (P.acc + (c.boosting ? 16 : 0)) * (1 - f / vmax * .85) * DT;
    } else if (inp.th < 0) {
      if (f > .5) f -= 28 * DT;
      else if (f > -10) f -= 7 * DT;
    } else f -= (f > 0 ? 1 : -1) * (1.2 + .012 * f * f) * DT * (af > .2 ? 1 : 0);
    if (inp.hb) f -= (f > 0 ? 1 : -1) * 5 * DT * (af > .5 ? 1 : 0);
    if (f > vmax) f -= (f - vmax) * 1.5 * DT;
    if (!c.onRoad) f -= f * .25 * DT;
    // hills: gravity along the slope under the car
    const ga = groundAt(W, c.x + hx * 1.5, c.z + hz * 1.5), gb = groundAt(W, c.x - hx * 1.5, c.z - hz * 1.5);
    f -= G * (ga - gb) / 3 * DT;
    c.vx = hx * f + nrx * l; c.vz = hz * f + nrz * l;

    // boost meter: fills while drifting and in the air, burns while boosting
    if (c.drift) c.meter += .22 * DT * (slideAng > .6 ? 1 : slideAng / .6 + .3);
    if (inp.bo && c.meter > .02 && f > 2) { if (!c.boosting) ev.push({ t: 'boost' }); c.boosting = 1; c.meter -= .3 * DT; } else c.boosting = 0;
    if (c.meter > 1) c.meter = 1; if (c.meter < 0) c.meter = 0;
  } else {
    c.boosting = 0;
    c.vy -= G * DT;
    c.airT += DT; c.meter += .1 * DT; if (c.meter > 1) c.meter = 1;
  }

  // move, then follow or leave the ground
  const px = c.x, pz = c.z;
  c.x += c.vx * DT; c.z += c.vz * DT;
  const g = groundAt(W, c.x, c.z);
  if (c.air) {
    c.y += c.vy * DT;
    if (c.y <= g) {
      if (c.vy < -6) ev.push({ t: 'land', m: -c.vy, air: c.airT });
      c.y = g; c.vy = 0; c.air = 0; c.airT = 0;
    }
  } else {
    const vyGround = (g - c.y) / DT;
    // the ground fell away faster than the car can follow: take off with the vertical speed it had
    if (vyGround < c.vy - 7 && c.speed > 8) { c.air = 1; c.airT = 0; c.y += c.vy * DT; }
    else { c.vy = c.vy * .5 + vyGround * .5; c.y = g; }
  }

  collide(W, c, ev);
  c.f = c.vx * c.hx + c.vz * c.hz;
  c.speed = Math.sqrt(c.vx * c.vx + c.vz * c.vz);
  c.onRoad = roadAt(W, c.x, c.z) || onCircuit(W, c.x, c.z);
  if (c.onRoad && !c.air && c.steps % 30 === 0) c.safe = { x: c.x, z: c.z, hx: c.hx, hz: c.hz };

  // water
  if (c.y < WATER - .7) {
    c.wet += DT; c.vx *= .97; c.vz *= .97;
    if (c.wet < DT * 1.5) ev.push({ t: 'splash' });
    if (c.wet > 1.2) { respawn(W, c); ev.push({ t: 'reset' }); }
  } else c.wet = 0;
  void px; void pz;
  return ev;
}

function onCircuit(W, x, z) {
  for (const pc of W.circuit.pieces) {
    if (pc.type !== 'corner') {
      const rx = -pc.D[1], rz = pc.D[0], lat = (x - pc.A[0]) * rx + (z - pc.A[1]) * rz, al = (x - pc.A[0]) * pc.D[0] + (z - pc.A[1]) * pc.D[1];
      if (lat > -6.5 && lat < 6.5 && al > 0 && al < pc.len * W.circuit.S) return true;
    } else {
      const ux = x - pc.C[0], uz = z - pc.C[1], rho = Math.sqrt(ux * ux + uz * uz);
      if (rho > pc.R - 6.5 && rho < pc.R + 6.5) {
        // inside the quarter between the entry and exit radii
        const ax = pc.A[0] - pc.C[0], az = pc.A[1] - pc.C[1], bx = pc.B[0] - pc.C[0], bz = pc.B[1] - pc.C[1];
        if (ux * ax + uz * az >= 0 && ux * bx + uz * bz >= 0) return true;
      }
    }
  }
  return false;
}

// Push the car (two circles along its length) out of boxes and trunks; bounce, scrub speed, and turn the nose a
// little along the obstacle so a glancing hit becomes a slide instead of a dead stop.
function collide(W, c, ev) {
  nearby(W, c.x, c.z, near);
  let hit = 0;
  for (const off of [1.2, -1.2]) {
    const cx = c.x + c.hx * off, cz = c.z + c.hz * off, R = 1.15;
    for (const k of near) {
      const o = W.cols[k];
      let nx, nz, pen;
      if (o.t === 'c') {
        const dx = cx - o.x, dz = cz - o.z, d = Math.sqrt(dx * dx + dz * dz);
        if (d >= R + o.r || d < 1e-6) continue;
        nx = dx / d; nz = dz / d; pen = R + o.r - d;
      } else {
        const qx = cx < o.x - o.hx ? o.x - o.hx : cx > o.x + o.hx ? o.x + o.hx : cx;
        const qz = cz < o.z - o.hz ? o.z - o.hz : cz > o.z + o.hz ? o.z + o.hz : cz;
        const dx = cx - qx, dz = cz - qz, d = Math.sqrt(dx * dx + dz * dz);
        if (d >= R) continue;
        if (d > 1e-6) { nx = dx / d; nz = dz / d; pen = R - d; }
        else { // centre inside the box: leave by the nearest face
          const ex = o.hx - (cx > o.x ? cx - o.x : o.x - cx), ez = o.hz - (cz > o.z ? cz - o.z : o.z - cz);
          if (ex < ez) { nx = cx > o.x ? 1 : -1; nz = 0; pen = ex + R; } else { nx = 0; nz = cz > o.z ? 1 : -1; pen = ez + R; }
        }
      }
      c.x += nx * pen; c.z += nz * pen;
      const vn = c.vx * nx + c.vz * nz;
      if (vn < 0) {
        c.vx -= nx * vn * 1.25; c.vz -= nz * vn * 1.25;
        c.vx *= .96; c.vz *= .96;
        if (-vn > hit) hit = -vn;
        // nose follows the surface: blend heading toward the tangent that matches the current direction
        const tx = -nz, tz = nx, sgn = c.hx * tx + c.hz * tz < 0 ? -1 : 1;
        let hx = c.hx + (tx * sgn - c.hx) * .1, hz = c.hz + (tz * sgn - c.hz) * .1;
        const hn = 1 / Math.sqrt(hx * hx + hz * hz); c.hx = hx * hn; c.hz = hz * hn;
        c.drift = 0;
      }
    }
  }
  if (hit > 1.5) ev.push({ t: 'hit', m: hit });
}

export function respawn(W, c, pose = c.safe) {
  c.x = pose.x; c.z = pose.z; c.hx = pose.hx; c.hz = pose.hz;
  c.vx = c.vz = c.vy = 0; c.air = 0; c.drift = 0; c.boosting = 0; c.wet = 0; c.s = 0;
  c.y = groundAt(W, c.x, c.z);
}

// Replay an input list from a start pose for at most maxSteps; calls onStep(c, events) each step.
export function replay(W, pose, model, codes, maxSteps, onStep) {
  const c = makeCar(W, pose, model);
  for (let k = 0; k < maxSteps; k++) {
    const ev = stepCar(W, c, unpackInput(codes[Math.floor(k / IN_EVERY)] ?? packInput(0, 0, 0, 0, 0)));
    if (onStep && onStep(c, ev) === false) break;
  }
  return c;
}
