// A race: the player at the back of a grid of AI cars, everyone running the same gates. Shared by live play and by
// verification (leaderboard rows, challenge links), so a recorded race replays exactly, AI cars and bumps included.
import { hash } from './world.mjs';
import { makeCar, stepCar, collideCars, unpackInput, perfIndex, IN_EVERY } from './car.mjs';
import { runGates } from './events.mjs';
import { planRoute, makeDriver, drive } from './ai.mjs';

const AI_POOL = ['sedan-sports', 'hatchback-sports', 'sedan', 'taxi', 'police', 'suv', 'truck', 'suv-luxury', 'van', 'race', 'race-future', 'kart-oobi'];
export const AI_NAMES = ['Rosa', 'Teo', 'Mika', 'Jun', 'Ines', 'Bram', 'Noor', 'Kofi', 'Lena', 'Omar', 'Aiko', 'Sven'];
const routes = new Map();

// The AI field: cars close to the player's class, chosen from the event and the player's car, so it's repeatable.
export function makeRace(W, e, model, setup) {
  if (!routes.has(e.id)) routes.set(e.id, planRoute(e.path));
  const route = routes.get(e.id), n = e.id === 'gp' ? 7 : 5;
  const me = perfIndex(model, setup).pi;
  const pool = AI_POOL.map(k => [k, Math.abs(perfIndex(k, {}).pi - me)]).sort((a, b) => a[1] - b[1]).slice(0, 6).map(p => p[0]);
  const seed = [...e.id].reduce((a, ch) => a * 31 + ch.charCodeAt(0), 7) | 0;
  // grid: two abreast, 9 m between rows, laid out forward along the route from the start; the player at the back
  const rows = Math.ceil((n + 1) / 2), P = route.path, C = route.cum;
  const slot = k => {
    const row = rows - 1 - Math.floor(k / 2), want = row * 9;
    let i = 0; while (i < P.length - 2 && C[i + 1] < want) i++;
    const a = P[i], b = P[i + 1], dx = b[0] - a[0], dz = b[1] - a[1], l = Math.sqrt(dx * dx + dz * dz) || 1, t = (want - C[i]) / l;
    const hx = dx / l, hz = dz / l, side = k % 2 ? 2.4 : -2.4;
    return { x: a[0] + dx * t - hz * side, z: a[1] + dz * t + hx * side, hx, hz };
  };
  const cars = [], drivers = [], st = [], names = [];
  for (let k = 0; k < n; k++) {
    const m = pool[Math.floor(hash(seed, k, 3) * pool.length)];
    const skill = .88 + .1 * hash(seed, k, 4);
    cars.push(makeCar(W, slot(k), m, { up: { engine: Math.floor(hash(seed, k, 5) * 2), tires: Math.floor(hash(seed, k, 6) * 2) } }));
    drivers.push(makeDriver(route, skill, (k % 2 ? 1 : -1) * (.6 + hash(seed, k, 7))));
    names.push(AI_NAMES[(Math.floor(hash(seed, k, 8) * AI_NAMES.length) + k) % AI_NAMES.length]);
  }
  const player = makeCar(W, slot(n), model, setup);
  cars.push(player);
  for (let k = 0; k <= n; k++) st.push({ gi: 0, done: false, time: 0 });
  return { e, cars, drivers, st, names, player, n, steps: 0, codes: new Array(n).fill(0), order: [] };
}

// One physics step for everyone. pcode: the player's packed input. Returns the player's events.
export function stepRace(W, R, pcode) {
  if (R.steps % IN_EVERY === 0) for (let k = 0; k < R.n; k++) {
    if (R.st[k].done) { R.codes[k] = 0; continue; }
    // traffic: a car close ahead in my lane -> move to the other side of the road, and don't drive into it
    const c = R.cars[k], d = R.drivers[k];
    d.cap = 1e9;
    for (let j = 0; j <= R.n; j++) {
      if (j === k) continue;
      const o = R.cars[j], dx = o.x - c.x, dz = o.z - c.z, ahead = dx * c.hx + dz * c.hz, side = -dx * c.hz + dz * c.hx;
      if (ahead > 0 && ahead < 16 && side > -2.6 && side < 2.6) {
        d.offset = side > 0 ? -2.2 : 2.2;
        if (ahead < 9) d.cap = o.speed + (ahead - 4) * .8;
      }
    }
    R.codes[k] = drive(d, c);
  }
  R.steps++;
  let pev = null;
  for (let k = 0; k <= R.n; k++) {
    const ev = stepCar(W, R.cars[k], unpackInput(k === R.n ? pcode : R.codes[k]));
    if (k === R.n) pev = ev;
  }
  const bump = [];
  for (let a = 0; a <= R.n; a++) for (let b = a + 1; b <= R.n; b++) collideCars(R.cars[a], R.cars[b], bump);
  for (let k = 0; k <= R.n; k++) {
    if (R.st[k].done) continue;
    runGates(R.e, R.cars[k], R.st[k]);
    if (R.st[k].done) { R.st[k].time = R.steps / 120; R.order.push(k); }
  }
  // bumps involving the player are the player's events too
  for (const b of bump) pev.push(b);
  return pev;
}

// Running order: finished cars by finish, then by gates passed and distance to the next gate.
export function standings(R) {
  const prog = k => { const s = R.st[k], c = R.cars[k]; if (s.done) return 1e9 - R.order.indexOf(k); const g = R.e.gates[s.gi]; return s.gi * 1e5 - Math.hypot(g[0] - c.x, g[1] - c.z); };
  return [...Array(R.n + 1).keys()].sort((a, b) => prog(b) - prog(a));
}

// Replay a recorded race; returns { time, place, splits } or null if the player never finished.
export function replayRace(W, e, model, setup, codes, limit = 120 * 600) {
  const R = makeRace(W, e, model, setup), splits = [];
  for (let k = 0; k < limit && !R.st[R.n].done; k++) {
    const before = R.st[R.n].gi;
    stepRace(W, R, codes[Math.floor(k / IN_EVERY)] ?? 0);
    if (R.st[R.n].gi > before) splits[R.st[R.n].gi] = R.steps;
  }
  const s = R.st[R.n];
  return s.done ? { time: s.time, place: R.order.indexOf(R.n) + 1, splits } : null;
}
