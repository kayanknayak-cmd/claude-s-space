// Car physics for Sunday Drive: a two-axle tyre model with weight transfer, a torque curve and an automatic gearbox,
// upgrades and tuning, and damage that hurts the car mechanically. Deterministic: only + - * / sqrt floor and no
// trig, so the same inputs from the same start replay identically on every device (ghosts, links, leaderboard).
import { groundAt, roadAt, T, N, WATER } from './world.mjs';

export const DT = 1 / 120, IN_EVERY = 4, G = 13;   // G: ballistic gravity in the air (a little heavy, for fun)
const GN = 9.81, PI = 3.141592653589793, RPM = 60 / (2 * PI), RW = .34;

// Specs per Car Kit model. mass kg, tq peak torque N m, red redline rpm, gears + final drive, drive R/F/A,
// mu tyre grip, cd air drag (N per (m/s)^2), cl downforce, steer max lock (rad), a/b CG to axles (m), h CG height,
// price credits (0 = starter), bounce visual suspension.
export const CARS = {
  'sedan-sports': { name: 'Coupe', mass: 1350, tq: 330, red: 7200, gears: [3.2, 2.1, 1.55, 1.2, .98, .82], final: 3.7, drive: 'R', mu: 1.05, cd: .38, cl: .05, steer: .58, a: 1.25, b: 1.4, h: .5, price: 0, bounce: .8 },
  'hatchback-sports': { name: 'Hot hatch', mass: 1200, tq: 290, red: 7000, gears: [3.3, 2.1, 1.5, 1.15, .95, .8], final: 3.9, drive: 'F', mu: 1.05, cd: .36, cl: .04, steer: .6, a: 1.1, b: 1.45, h: .52, price: 0, bounce: .9 },
  'sedan': { name: 'Sedan', mass: 1450, tq: 260, red: 6400, gears: [3.1, 1.9, 1.35, 1.0, .8], final: 3.5, drive: 'R', mu: .95, cd: .36, cl: 0, steer: .56, a: 1.3, b: 1.4, h: .55, price: 0, bounce: 1 },
  'taxi': { name: 'Taxi', mass: 1500, tq: 270, red: 6200, gears: [3.1, 1.9, 1.35, 1.0, .8], final: 3.5, drive: 'R', mu: .95, cd: .38, cl: 0, steer: .56, a: 1.3, b: 1.45, h: .58, price: 0, bounce: 1 },
  'kart-oobi': { name: 'Kart', mass: 320, tq: 48, red: 9000, gears: [2.4, 1.7, 1.3, 1.05], final: 4.4, drive: 'R', mu: 1.15, cd: .3, cl: .02, steer: .62, a: .55, b: .6, h: .3, price: 0, bounce: .4 },
  'suv': { name: 'SUV', mass: 2000, tq: 380, red: 6000, gears: [3.4, 2.1, 1.45, 1.1, .88, .72], final: 3.4, drive: 'A', mu: .92, cd: .5, cl: 0, steer: .55, a: 1.35, b: 1.5, h: .75, price: 8000, bounce: 1.4 },
  'van': { name: 'Van', mass: 2100, tq: 300, red: 5600, gears: [3.6, 2.2, 1.45, 1.0, .78], final: 3.6, drive: 'R', mu: .88, cd: .55, cl: 0, steer: .55, a: 1.5, b: 1.6, h: .8, price: 6000, bounce: 1.3 },
  'truck': { name: 'Pickup', mass: 1900, tq: 440, red: 5800, gears: [3.5, 2.2, 1.5, 1.1, .85, .7], final: 3.5, drive: 'A', mu: .95, cd: .5, cl: 0, steer: .55, a: 1.45, b: 1.65, h: .72, price: 12000, bounce: 1.5 },
  'police': { name: 'Interceptor', mass: 1700, tq: 520, red: 6800, gears: [3.0, 2.0, 1.5, 1.18, .96, .8], final: 3.5, drive: 'R', mu: 1.05, cd: .38, cl: .08, steer: .57, a: 1.35, b: 1.45, h: .55, price: 22000, bounce: .9 },
  'suv-luxury': { name: 'Luxury SUV', mass: 2200, tq: 520, red: 6500, gears: [3.4, 2.2, 1.6, 1.22, 1.0, .82, .68], final: 3.3, drive: 'A', mu: .98, cd: .48, cl: .02, steer: .55, a: 1.4, b: 1.55, h: .72, price: 30000, bounce: 1.2 },
  'delivery': { name: 'Delivery truck', mass: 3000, tq: 420, red: 5000, gears: [4.0, 2.4, 1.6, 1.15, .85], final: 3.8, drive: 'R', mu: .85, cd: .7, cl: 0, steer: .5, a: 1.8, b: 1.9, h: 1.0, price: 9000, bounce: 1.4 },
  'ambulance': { name: 'Ambulance', mass: 2800, tq: 400, red: 5200, gears: [4.0, 2.4, 1.6, 1.15, .85], final: 3.6, drive: 'R', mu: .86, cd: .68, cl: 0, steer: .52, a: 1.7, b: 1.9, h: .95, price: 15000, bounce: 1.3 },
  'firetruck': { name: 'Fire engine', mass: 4500, tq: 640, red: 4600, gears: [4.2, 2.6, 1.7, 1.2, .9], final: 3.9, drive: 'R', mu: .82, cd: .85, cl: 0, steer: .5, a: 2.0, b: 2.3, h: 1.1, price: 18000, bounce: 1.3 },
  'garbage-truck': { name: 'Bin lorry', mass: 5500, tq: 700, red: 4300, gears: [4.4, 2.7, 1.75, 1.2, .9], final: 4.0, drive: 'R', mu: .8, cd: .9, cl: 0, steer: .48, a: 2.0, b: 2.4, h: 1.15, price: 14000, bounce: 1.3 },
  'tractor': { name: 'Tractor', mass: 2500, tq: 520, red: 3000, gears: [6.0, 3.8, 2.6], final: 4.6, drive: 'R', mu: .95, cd: .6, cl: 0, steer: .62, a: 1.1, b: 1.2, h: .9, price: 4000, bounce: 1.6 },
  'race': { name: 'Formula', mass: 650, tq: 380, red: 12000, gears: [2.9, 2.1, 1.65, 1.35, 1.14, 1.0], final: 3.9, drive: 'R', mu: 1.55, cd: .55, cl: 1.6, steer: .5, a: 1.3, b: 1.5, h: .3, price: 65000, bounce: .5 },
  'race-future': { name: 'Prototype', mass: 950, tq: 640, red: 9500, gears: [3.0, 2.2, 1.7, 1.38, 1.15, .98, .85], final: 3.8, drive: 'A', mu: 1.45, cd: .5, cl: 1.2, steer: .5, a: 1.35, b: 1.5, h: .32, price: 90000, bounce: .5 },
};

// Upgrades: each level costs credits and changes the spec. Tuning: free sliders.
export const UPGRADES = {
  engine: { name: 'Engine', levels: ['Stock', 'Street', 'Sport', 'Race'], cost: [0, 3000, 8000, 18000] },
  turbo: { name: 'Turbo', levels: ['None', 'Single', 'Twin'], cost: [0, 6000, 15000] },
  tires: { name: 'Tyres', levels: ['Street', 'Sport', 'Semi-slick', 'Slick'], cost: [0, 2500, 6000, 12000] },
  susp: { name: 'Suspension', levels: ['Stock', 'Lowered', 'Coilovers'], cost: [0, 3000, 8000] },
  brakes: { name: 'Brakes', levels: ['Stock', 'Sport', 'Race'], cost: [0, 2000, 6000] },
  weight: { name: 'Weight', levels: ['Stock', 'Stripped', 'Carbon'], cost: [0, 4000, 14000] },
  armor: { name: 'Armour', levels: ['Stock', 'Bull bar', 'Roll cage'], cost: [0, 2500, 7000] },
};
export const TUNE = { final: [.85, 1.15], balance: [-1, 1], brake: [.4, .75], assist: [0, 1] };

// The effective spec of a car with its upgrades and tune: what the physics actually uses.
export function specOf(model, setup = {}) {
  const B = CARS[model] || CARS['sedan-sports'], u = setup.up || {}, t = setup.tune || {};
  const e = u.engine || 0, tb = u.turbo || 0, ti = u.tires || 0, su = u.susp || 0, br = u.brakes || 0, wt = u.weight || 0, ar = u.armor || 0;
  return {
    ...B,
    tq: B.tq * (1 + e * .12 + tb * .16),
    mass: B.mass * (1 - wt * .06) + ar * 60,
    mu: B.mu * (1 + ti * .06),
    peak: .13 - su * .012,                       // stiffer suspension: tyres bite sooner
    roll: 1 - su * .3,
    brakeG: 1.0 + br * .18,
    final: B.final * (t.final || 1),
    balance: t.balance || 0,                    // + more front grip (less understeer), - more rear (looser)
    bias: t.brake || .62,
    assist: t.assist === undefined ? .7 : t.assist,
    armor: 1 + ar * .45,
  };
}
// Performance index: a 100-999 number and a class letter, from power to weight, grip and top end.
export function perfIndex(model, setup) {
  const S = specOf(model, setup), kw = S.tq * S.red * .85 / 9549, p2w = kw / S.mass * 1000;
  const top = Math.cbrt(kw * 1000 / (S.cd + .3)) * 3.6;      // display only, so cbrt is fine here
  const pi = Math.round(100 + p2w * 1.15 + (S.mu - .8) * 900 + S.cl * 70 + (top - 150) * .9);
  const v = pi < 100 ? 100 : pi > 999 ? 999 : pi;
  return { pi: v, cls: v >= 900 ? 'X' : v >= 800 ? 'S' : v >= 700 ? 'A' : v >= 600 ? 'B' : v >= 500 ? 'C' : 'D' };
}
export function makeCar(W, pose, model = 'sedan-sports', setup = {}) {
  const y = groundAt(W, pose.x, pose.z), S = specOf(model, setup);
  return {
    model, setup, S, x: pose.x, y, z: pose.z, hx: pose.hx, hz: pose.hz, vx: 0, vy: 0, vz: 0, r: 0, s: 0,
    air: 0, airT: 0, drift: 0, driftT: 0, slip: 0, meter: .3, boosting: 0, speed: 0, f: 0, ax: 0,
    gear: 1, rpm: 900, shiftT: 0, spin: 0, throttle: 0, rev: 0,
    dmg: { front: 0, rear: 0, left: 0, right: 0, engine: 0 }, stalled: 0,
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

// Tyre force curve, as a share of the axle's grip: rises to 1 at the peak slip, then eases to 0.75 when sliding.
const tyre = x => { const a = x < 0 ? -x : x, s = x < 0 ? -1 : 1; return a <= 1 ? x * (1.5 - .5 * x * x) : s * (.75 + .25 / (a * a)); };
const torqueAt = (S, rpm) => { const p = .65 * S.red, d = (rpm - p) / p; const k = .55 + .45 * (1 - d * d); return rpm > S.red ? 0 : S.tq * (k < .45 ? .45 : k); };

// One physics step. inp: an unpacked input. Returns events (hit, land, splash, drift, boost, shift, stall).
export function stepCar(W, c, inp) {
  const ev = [], S = c.S, m = S.mass, L = S.a + S.b, D = c.dmg;
  c.steps++;
  if (inp.rs) { respawn(W, c); ev.push({ t: 'reset' }); return ev; }
  // steering eases in; full lock shrinks with speed (a driving aid that makes keys usable)
  c.s += (inp.st / 8 - c.s) * .16;
  let hx = c.hx, hz = c.hz;
  let u = c.vx * hx + c.vz * hz, v = c.vx * -hz + c.vz * hx;
  const au = u < 0 ? -u : u;

  if (!c.air) {
    // full lock shrinks with speed to just past what the tyres can hold (mu g L / u^2), like a steering assist
    const gl = S.mu * GN * L * 1.3 / (au * au + 1);
    const lock = gl < S.steer ? gl : S.steer;
    const delta = c.s * lock + (D.left - D.right) * .05 * (au > 3 ? 1 : 0);      // a bent front end pulls to one side
    // loads: static split plus weight transfer from last step's acceleration, plus downforce
    const down = S.cl * u * u, wf = m * GN * S.b / L + down * .45 - m * c.ax * S.h / L, wr = m * GN * S.a / L + down * .55 + m * c.ax * S.h / L;
    const Fzf = wf > m * GN * .15 ? wf : m * GN * .15, Fzr = wr > m * GN * .15 ? wr : m * GN * .15;
    const surf = c.onRoad ? 1 : .72, sideD = 1 - (D.left + D.right) * .08;
    const muF = S.mu * surf * sideD * (1 + S.balance * .08), muR = S.mu * surf * sideD * (1 - S.balance * .08) * (inp.hb ? .5 : 1);

    // engine and gearbox
    if (c.shiftT > 0) c.shiftT -= DT;
    const gr = S.gears[c.gear - 1], wheel = au / RW;
    // reverse engages only from (nearly) stopped and holds while the pedal stays down; otherwise it's a brake
    if (inp.th >= 0) c.rev = 0; else if (au < .8) c.rev = 1;
    const rev = c.rev === 1;
    let rpm = wheel * (rev ? 3.2 : gr) * S.final * RPM;
    if (rpm < 950) rpm = 950 + (inp.th !== 0 ? 1600 : 0) * (1 - au / 6 > 0 ? 1 - au / 6 : 0);
    c.rpm += (rpm - c.rpm) * .3;
    if (!rev && c.shiftT <= 0) {
      if (c.rpm > S.red * .94 && c.gear < S.gears.length) { c.gear++; c.shiftT = .14; ev.push({ t: 'shift', up: 1 }); }
      else if (c.gear > 1 && c.rpm < S.red * .42 && wheel * S.gears[c.gear - 2] * S.final * RPM < S.red * .88) { c.gear--; c.shiftT = .1; ev.push({ t: 'shift', up: 0 }); }
    }
    const health = 1 - D.engine;
    if (health < .04 && !c.stalled) { c.stalled = 1; ev.push({ t: 'stall' }); }
    const power = (c.stalled ? 0 : .3 + .7 * health) * (c.boosting ? 1.35 : 1);
    let drive = 0;
    if (inp.th > 0 && !rev && c.shiftT <= 0) drive = torqueAt(S, c.rpm) * gr * S.final * .9 / RW * power;
    if (rev) drive = -torqueAt(S, c.rpm) * 3.2 * S.final * .9 / RW * power * .6;
    c.throttle = inp.th > 0 || rev ? 1 : 0;
    // brakes (ABS: never more than the tyres can hold)
    let bF = 0, bR = 0;
    if (inp.th < 0 && !rev) { const B = m * GN * S.brakeG * (u > 0 ? -1 : 1); bF = B * S.bias; bR = B * (1 - S.bias); }
    if (inp.hb) bR += m * GN * .45 * (u > 0 ? -1 : 1) * (au > .3 ? 1 : 0);
    const shareF = S.drive === 'F' ? 1 : S.drive === 'A' ? .4 : 0;
    let FxF = drive * shareF + bF, FxR = drive * (1 - shareF) + bR;
    // traction control (part of the assist): trim drive to what the tyres can take
    const capF = muF * Fzf, capR = muR * Fzr;
    if (S.assist > .3 && !inp.hb) { if (FxR > capR * .9) FxR = capR * .9; if (FxF > capF * .9) FxF = capF * .9; }
    c.spin = FxR > capR * .98 || FxR < -capR * .98 ? 1 : 0;
    // ABS keeps braking at 80% of what a tyre holds, so it can still steer; drive is capped at the tyre's limit
    const kF = FxF < 0 === u > 0 ? .8 : 1, kR = (FxR < 0 === u > 0) && !inp.hb ? .8 : 1;
    const clampF = FxF > capF * kF ? capF * kF : FxF < -capF * kF ? -capF * kF : FxF, clampR = FxR > capR * kR ? capR * kR : FxR < -capR * kR ? -capR * kR : FxR;
    // lateral: slip angles (small-angle), tyre curve, and what the friction circle leaves after drive/brake
    const den = au > 4 ? au : 4;
    const af = (v + S.a * c.r) / den - delta * (u < 0 ? -1 : 1), ar = (v - S.b * c.r) / den;
    const lf = 1 - (clampF / capF) * (clampF / capF), lr = 1 - (clampR / capR) * (clampR / capR);
    let Fyf = -capF * tyre(af / S.peak) * Math.sqrt(lf > 0 ? lf : 0);
    let Fyr = -capR * tyre(ar / (S.peak * 1.15)) * Math.sqrt(lr > 0 ? lr : 0);   // rear lets go later than the front: stable, like a road car
    // body-frame accelerations (front tyre force turned by the wheel angle, small angle)
    const drag = S.cd * u * (u < 0 ? -u : u), roll = (c.onRoad ? .015 : .05) * m * GN * (u > .1 ? 1 : u < -.1 ? -1 : 0);
    const slope = (groundAt(W, c.x + hx * 1.5, c.z + hz * 1.5) - groundAt(W, c.x - hx * 1.5, c.z - hz * 1.5)) / 3;
    const Fx = clampF + clampR - Fyf * delta - drag - roll - m * GN * slope;
    const Fy = Fyf + clampF * delta + Fyr;
    let du = Fx / m + v * c.r, dv = Fy / m - u * c.r;
    const Iz = m * S.a * S.b * 1.05;
    let dr = (S.a * (Fyf + clampF * delta) - S.b * Fyr) / Iz;
    c.ax = c.ax + (du - c.ax) * .2;
    u += du * DT; v += dv * DT; c.r += dr * DT;
    // stability assist: nudges the yaw rate toward what the steering asks for (off on the handbrake)
    const want = u * delta / L;
    if (!inp.hb) c.r += (want - c.r) * S.assist * 2.2 * DT;
    // walking pace: no tyre maths, just roll where the wheels point
    if (au < 1.5) { c.r = u * delta / L; v *= .85; if (inp.th === 0 && au < .3) u *= .9; }
    // sliding: the rear's slip angle well past its peak
    const sliding = (ar < 0 ? -ar : ar) > S.peak * 2.2 && au > 8;
    if (sliding && !c.drift) { c.drift = v > 0 ? 1 : -1; c.driftT = 0; ev.push({ t: 'drift' }); }
    if (!sliding && c.drift) c.drift = 0;
    if (c.drift) c.driftT += DT;
    c.slip = v < 0 ? -v : v;

    // turn the heading by r*dt with the rational rotation ((1-t^2), 2t)/(1+t^2), t = half the angle
    const t = c.r * DT / 2, q = 1 / (1 + t * t), co = (1 - t * t) * q, si = 2 * t * q;
    const nhx = hx * co - hz * si, nhz = hz * co + hx * si, hn = 1 / Math.sqrt(nhx * nhx + nhz * nhz);
    hx = nhx * hn; hz = nhz * hn; c.hx = hx; c.hz = hz;
    // v and u stay in the car's frame, which turned with it
    c.vx = hx * u - hz * v; c.vz = hz * u + hx * v;

    // boost meter: fills while sliding and in the air; burns while boosting
    if (c.drift) c.meter += .2 * DT;
    if (inp.bo && c.meter > .02 && u > 2 && !c.stalled) { if (!c.boosting) ev.push({ t: 'boost' }); c.boosting = 1; c.meter -= .28 * DT; } else c.boosting = 0;
    if (c.meter > 1) c.meter = 1; if (c.meter < 0) c.meter = 0;
  } else {
    c.boosting = 0; c.drift = 0;
    c.vy -= G * DT; c.airT += DT; c.meter += .1 * DT; if (c.meter > 1) c.meter = 1;
    c.r *= .995;
    const t = c.r * DT / 2, q = 1 / (1 + t * t), co = (1 - t * t) * q, si = 2 * t * q;
    const nhx = hx * co - hz * si, nhz = hz * co + hx * si, hn = 1 / Math.sqrt(nhx * nhx + nhz * nhz);
    c.hx = nhx * hn; c.hz = nhz * hn;
  }

  // move, then follow or leave the ground
  c.x += c.vx * DT; c.z += c.vz * DT;
  const g = groundAt(W, c.x, c.z);
  if (c.air) {
    c.y += c.vy * DT;
    if (c.y <= g) {
      if (c.vy < -6) { ev.push({ t: 'land', m: -c.vy, air: c.airT }); if (c.vy < -16) hurt(c, 'front', (-c.vy - 16) * .01, ev); }
      c.y = g; c.vy = 0; c.air = 0; c.airT = 0;
    }
  } else {
    const vyGround = (g - c.y) / DT;
    if (vyGround < c.vy - 7 && c.speed > 8) { c.air = 1; c.airT = 0; c.y += c.vy * DT; }
    else { c.vy = c.vy * .5 + vyGround * .5; c.y = g; }
  }

  collide(W, c, ev);
  c.f = c.vx * c.hx + c.vz * c.hz;
  c.speed = Math.sqrt(c.vx * c.vx + c.vz * c.vz);
  c.onRoad = roadAt(W, c.x, c.z) || onCircuit(W, c.x, c.z);
  // the respawn point: the last road position, facing along the road's axis nearest the car's heading
  if (c.onRoad && !c.air && c.steps % 30 === 0) {
    const ax = c.hx < 0 ? -c.hx : c.hx, az = c.hz < 0 ? -c.hz : c.hz;
    // centred across the road tile, so a respawn never starts on the edge
    const alongX = ax >= az, ti = Math.floor(c.x / T), tj = Math.floor(c.z / T);
    c.safe = { x: alongX ? c.x : (ti + .5) * T, z: alongX ? (tj + .5) * T : c.z, hx: alongX ? (c.hx < 0 ? -1 : 1) : 0, hz: alongX ? 0 : (c.hz < 0 ? -1 : 1) };
  }

  if (c.y < WATER - .7) {
    c.wet += DT; c.vx *= .97; c.vz *= .97;
    if (c.wet < DT * 1.5) ev.push({ t: 'splash' });
    if (c.wet > 1.2) { respawn(W, c); ev.push({ t: 'reset' }); }
  } else c.wet = 0;
  return ev;
}

// Damage to one side of the car (0..1 each); the engine takes most of the front's share. Armour soaks some.
function hurt(c, zone, amount, ev) {
  const D = c.dmg, a = amount / c.S.armor;
  if (a <= 0) return;
  D[zone] = D[zone] + a > 1 ? 1 : D[zone] + a;
  const eng = zone === 'front' ? a * .8 : zone === 'rear' ? a * .25 : a * .2;
  D.engine = D.engine + eng > 1 ? 1 : D.engine + eng;
  ev.push({ t: 'damage', zone, a });
}
// which side of the car a push along (nx, nz) hit
function zoneOf(c, nx, nz) {
  const fwd = nx * c.hx + nz * c.hz, side = nx * -c.hz + nz * c.hx;
  const af = fwd < 0 ? -fwd : fwd, as = side < 0 ? -side : side;
  return af > as ? (fwd < 0 ? 'front' : 'rear') : (side < 0 ? 'right' : 'left');
}
const crashDamage = (vn, m) => vn < 6 ? 0 : (vn - 6) * Math.sqrt(vn - 6) * .0045 * Math.sqrt(m / 1400);

function onCircuit(W, x, z) {
  for (const pc of W.circuit.pieces) {
    if (pc.type !== 'corner') {
      const rx = -pc.D[1], rz = pc.D[0], lat = (x - pc.A[0]) * rx + (z - pc.A[1]) * rz, al = (x - pc.A[0]) * pc.D[0] + (z - pc.A[1]) * pc.D[1];
      if (lat > -6.5 && lat < 6.5 && al > 0 && al < pc.len * W.circuit.S) return true;
    } else {
      const ux = x - pc.C[0], uz = z - pc.C[1], rho = Math.sqrt(ux * ux + uz * uz);
      if (rho > pc.R - 6.5 && rho < pc.R + 6.5) {
        const ax = pc.A[0] - pc.C[0], az = pc.A[1] - pc.C[1], bx = pc.B[0] - pc.C[0], bz = pc.B[1] - pc.C[1];
        if (ux * ax + uz * az >= 0 && ux * bx + uz * bz >= 0) return true;
      }
    }
  }
  return false;
}

// Push the car (two circles along its length) out of boxes and trunks; bounce, scrub speed, damage the side that hit.
function collide(W, c, ev) {
  nearby(W, c.x, c.z, near);
  let hit = 0, hn = null;
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
        else {
          const ex = o.hx - (cx > o.x ? cx - o.x : o.x - cx), ez = o.hz - (cz > o.z ? cz - o.z : o.z - cz);
          if (ex < ez) { nx = cx > o.x ? 1 : -1; nz = 0; pen = ex + R; } else { nx = 0; nz = cz > o.z ? 1 : -1; pen = ez + R; }
        }
      }
      c.x += nx * pen; c.z += nz * pen;
      const vn = c.vx * nx + c.vz * nz;
      if (vn < 0) {
        c.vx -= nx * vn * 1.3; c.vz -= nz * vn * 1.3;
        c.vx *= .94; c.vz *= .94;
        if (-vn > hit) { hit = -vn; hn = [nx, nz]; }
        // a glancing hit turns the nose along the wall and kills most of the spin
        const tx = -nz, tz = nx, sgn = c.hx * tx + c.hz * tz < 0 ? -1 : 1;
        let hx = c.hx + (tx * sgn - c.hx) * .08, hz = c.hz + (tz * sgn - c.hz) * .08;
        const h = 1 / Math.sqrt(hx * hx + hz * hz); c.hx = hx * h; c.hz = hz * h;
        c.r *= .5;
      }
    }
  }
  if (hit > 1.5) {
    const zone = zoneOf(c, hn[0], hn[1]);
    ev.push({ t: 'hit', m: hit, zone });
    hurt(c, zone, crashDamage(hit, c.S.mass), ev);
  }
}

// Car against car (AI racers): two circles each, an impulse shared by mass, damage to both.
export function collideCars(A, B, ev) {
  if (Math.abs(A.x - B.x) > 7 || Math.abs(A.z - B.z) > 7) return;
  for (const oa of [1.2, -1.2]) for (const ob of [1.2, -1.2]) {
    const ax = A.x + A.hx * oa, az = A.z + A.hz * oa, bx = B.x + B.hx * ob, bz = B.z + B.hz * ob;
    const dx = ax - bx, dz = az - bz, d = Math.sqrt(dx * dx + dz * dz);
    if (d >= 2.3 || d < 1e-6) continue;
    const nx = dx / d, nz = dz / d, pen = 2.3 - d, ma = A.S.mass, mb = B.S.mass, wa = mb / (ma + mb), wb = ma / (ma + mb);
    A.x += nx * pen * wa; A.z += nz * pen * wa; B.x -= nx * pen * wb; B.z -= nz * pen * wb;
    const rv = (A.vx - B.vx) * nx + (A.vz - B.vz) * nz;
    if (rv >= 0) continue;
    const j = -1.4 * rv / (1 / ma + 1 / mb);
    A.vx += nx * j / ma; A.vz += nz * j / ma; B.vx -= nx * j / mb; B.vz -= nz * j / mb;
    // the push also spins each car a little, by where along its length it was hit
    A.r += oa * (nz * A.hx - nx * A.hz) * j / (ma * 2.4); B.r -= ob * (nz * B.hx - nx * B.hz) * j / (mb * 2.4);
    const m = -rv;
    if (m > 2) { ev.push({ t: 'hit', m, car: 1 }); hurt(A, zoneOf(A, nx, nz), crashDamage(m, mb) * .7, ev); hurt(B, zoneOf(B, -nx, -nz), crashDamage(m, ma) * .7, ev); }
  }
}

export function respawn(W, c, pose = c.safe) {
  c.x = pose.x; c.z = pose.z; c.hx = pose.hx; c.hz = pose.hz;
  c.vx = c.vz = c.vy = 0; c.r = 0; c.air = 0; c.drift = 0; c.boosting = 0; c.wet = 0; c.s = 0; c.gear = 1; c.ax = 0; c.rev = 0;
  c.y = groundAt(W, c.x, c.z);
  // a tow: a dead engine comes back limping (half power) so a wreck costs time, not the race
  if (c.stalled) { c.stalled = 0; if (c.dmg.engine > .5) c.dmg.engine = .5; }
}
export function repair(c) { c.dmg = { front: 0, rear: 0, left: 0, right: 0, engine: 0 }; c.stalled = 0; }

// Replay an input list from a start pose for at most maxSteps; calls onStep(c, events) each step.
export function replay(W, pose, model, codes, maxSteps, onStep, setup) {
  const c = makeCar(W, pose, model, setup);
  for (let k = 0; k < maxSteps; k++) {
    const ev = stepCar(W, c, unpackInput(codes[Math.floor(k / IN_EVERY)] ?? packInput(0, 0, 0, 0, 0)));
    if (onStep && onStep(c, ev) === false) break;
  }
  return c;
}
