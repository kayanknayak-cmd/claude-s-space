// Car physics for the racer. Deterministic: only + - * / and sqrt, fixed step, integer inputs. The same input
// list replays the same lap on every device, which is what makes ghosts and challenge links work.
import { SCALE, WALL, CURB, locate } from './track.mjs';

export const DT = 1 / 120;
export const IN_EVERY = 4;        // steering is sampled every 4 steps (30 per second)
export const VMAX = 22, ACC = 20;
// handling; tools/tune.mjs sweeps these
export const K = { TURN: 2.5, BOOST: 9, DRIFT_GRIP: 4, DRIFT_TURN: 1.45, SCRUB: .03, B1: .8, B2: 1.4, T1: .35, T2: .9 };
const HALF_W = .7;                // car half width, world units

export function makeCar(T) {
  return {
    x: T.spawn.p[0], z: T.spawn.p[1], hx: T.spawn.h[0], hz: T.spawn.h[1], vx: 0, vz: 0,
    s: 0, drift: 0, driftT: 0, boost: 0, tier: 0, piece: 0, prog: 0, steps: 0, done: false, time: 0,
    lat: 0, offroad: false, slip: 0, speed: 0,
  };
}

// One physics step. u: steering level -8..8 (negative = left). Returns events for sound and effects.
export function stepCar(T, c, u, go = true) {
  const ev = [];
  if (c.done) return ev;
  const n = T.pieces.length;
  c.s += (u / 8 - c.s) * .14;

  // speed in the car's frame before turning
  let f = c.vx * c.hx + c.vz * c.hz;

  // drift: steer hard at speed; ends when the stick comes back, flips side, or the car slows
  const au = u < 0 ? -u : u, su = u < 0 ? -1 : 1;
  if (!c.drift && au >= 7 && f > 11 && go) { c.drift = su; c.driftT = 0; ev.push({ t: 'drift' }); }
  else if (c.drift && (au <= 2 || su !== c.drift || f < 7)) {
    if (c.driftT > K.T1) { c.tier = c.driftT > K.T2 ? 2 : 1; c.boost = c.tier === 2 ? K.B2 : K.B1; ev.push({ t: 'boost', tier: c.tier }); }
    c.drift = 0; c.driftT = 0;
  }
  if (c.drift) c.driftT += DT;

  // turn the heading with the rational rotation ((1-t^2), 2t)/(1+t^2), t = half the angle
  const fs = f < 0 ? 0 : f;
  let w = c.s * K.TURN * (fs < 6 ? .45 + .55 * fs / 6 : 1) * (1 - .3 * (fs < VMAX ? fs / VMAX : 1));
  if (c.drift) w *= K.DRIFT_TURN;
  const t = w * DT / 2, q = 1 / (1 + t * t), co = (1 - t * t) * q, si = 2 * t * q;
  const rx0 = -c.hz, rz0 = c.hx;
  let hx = c.hx * co + rx0 * si, hz = c.hz * co + rz0 * si;
  const hn = 1 / Math.sqrt(hx * hx + hz * hz); hx *= hn; hz *= hn;
  c.hx = hx; c.hz = hz;
  const rx = -hz, rz = hx;

  // velocity in the new frame: forward f, sideways l
  f = c.vx * hx + c.vz * hz;
  let l = c.vx * rx + c.vz * rz;
  const grip = c.drift ? K.DRIFT_GRIP : c.offroad ? 6 : 16;
  const keep = 1 - grip * DT > 0 ? 1 - grip * DT : 0, lost = l * (1 - keep);
  l *= keep;
  f -= (lost < 0 ? -lost : lost) * K.SCRUB;
  c.slip = l < 0 ? -l : l;

  // engine
  if (go) {
    const target = (c.offroad ? 12 : VMAX) + (c.boost > 0 ? K.BOOST : 0);
    if (f < target) f += (c.boost > 0 ? 2 : 1) * ACC * (1 - f / target) * DT;
    else f -= (f - target) * 1.5 * DT;
  }
  if (c.boost > 0) c.boost -= DT;
  c.vx = hx * f + rx * l; c.vz = hz * f + rz * l;
  const px = c.x, pz = c.z;
  c.x += c.vx * DT; c.z += c.vz * DT;

  // which piece we are on
  let loc = locate(T, c.piece, c.x, c.z);
  for (let k = 0; k < 3 && (loc.past || loc.before); k++) {
    if (loc.past) { c.piece = (c.piece + 1) % n; c.prog++; ev.push({ t: 'split', piece: c.piece, prog: c.prog }); }
    else { c.piece = (c.piece + n - 1) % n; c.prog--; }
    loc = locate(T, c.piece, c.x, c.z);
  }
  c.lat = loc.lat;
  const alat = loc.lat < 0 ? -loc.lat : loc.lat, sl = loc.lat < 0 ? -1 : 1;
  c.offroad = alat > CURB * SCALE;

  // barrier: push back inside and bounce off it
  const lim = WALL * SCALE - HALF_W;
  if (alat > lim) {
    const tx = -loc.fz, tz = loc.fx, dpush = (alat - lim) * sl;
    c.x -= tx * dpush; c.z -= tz * dpush;
    const vn = c.vx * tx + c.vz * tz;
    if (vn * sl > 0) {
      c.vx -= tx * vn * 1.35; c.vz -= tz * vn * 1.35;
      c.vx *= .94; c.vz *= .94;
      ev.push({ t: 'wall', m: vn < 0 ? -vn : vn });
      // the barrier steers the nose along the track, so a car never stays pinned head-on
      const fw = c.hx * loc.fx + c.hz * loc.fz < 0 ? -1 : 1;
      let nx = c.hx + (loc.fx * fw - c.hx) * .12, nz = c.hz + (loc.fz * fw - c.hz) * .12;
      const nn = 1 / Math.sqrt(nx * nx + nz * nz); c.hx = nx * nn; c.hz = nz * nn;
      if (c.drift) { c.drift = 0; c.driftT = 0; }
    }
  }
  c.speed = Math.sqrt(c.vx * c.vx + c.vz * c.vz);
  if (go) c.steps++;

  // finish: crossed the gantry line on the start piece after a full lap
  if (c.prog >= n && c.piece === 0) {
    const L = T.line, a = (px - L.p[0]) * L.d[0] + (pz - L.p[1]) * L.d[1], b = (c.x - L.p[0]) * L.d[0] + (c.z - L.p[1]) * L.d[1];
    if (b >= 0) {
      const frac = b - a > 0 ? b / (b - a) : 0;
      c.done = true; c.time = (c.steps - frac) * DT;
      ev.push({ t: 'finish', time: c.time });
    }
  }
  return ev;
}

// Run-length code for steering samples: a letter A..Q for -8..8, then the run length in base 36.
export function encodeInputs(arr) {
  let out = '';
  for (let i = 0; i < arr.length;) {
    let j = i; while (j < arr.length && arr[j] === arr[i]) j++;
    out += String.fromCharCode(73 + arr[i]) + (j - i).toString(36);
    i = j;
  }
  return out;
}
export function decodeInputs(s) {
  const out = [], re = /([A-Q])([0-9a-z]+)/g;
  let m;
  while ((m = re.exec(s))) { const v = m[1].charCodeAt(0) - 73, n = parseInt(m[2], 36); for (let k = 0; k < n; k++) out.push(v); }
  return out;
}

// Replay a full input list; returns the finish time or null.
export function replay(T, inputs, maxSteps = 120 * 120) {
  const c = makeCar(T);
  for (let k = 0; k < maxSteps && !c.done; k++) stepCar(T, c, inputs[Math.floor(k / IN_EVERY)] ?? 0);
  return c.done ? c.time : null;
}
