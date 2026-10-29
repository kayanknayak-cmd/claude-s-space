// Dinner Rush simulation: Rapier world, food, customers, rules. Shared by the game and the Node tools.
// No randomness and no trig at run time, so the same throw gives the same result on every device.
import { CAT } from './catalog.mjs';

export const DT = 1 / 120, G = -13, VMAX = 10, CATCH = .44, SETTLE = 240;

const Q90 = { x: 0, y: Math.SQRT1_2, z: 0, w: Math.SQRT1_2 };
const QI = { x: 0, y: 0, z: 0, w: 1 };

// Point at height h on the body's local up axis, in world space.
function upPoint(b, h) {
  const p = b.translation(), q = b.rotation();
  return { x: p.x + 2 * (q.x * q.y - q.w * q.z) * h, y: p.y + (1 - 2 * (q.x * q.x + q.z * q.z)) * h, z: p.z + 2 * (q.y * q.z + q.w * q.x) * h };
}

export function makeSim(R, H, L) {
  const world = new R.World({ x: 0, y: G, z: 0 });
  world.timestep = DT;
  const S = { R, H, L, world, steps: 0, bodies: [], customers: [], queue: L.ammo.slice(), won: false, lost: false, rest: 0, lastThrow: -1e9 };
  const fixed = (desc, x, y, z) => world.createCollider(desc.setTranslation(x, y, z).setFriction(.9).setRestitution(.1));

  fixed(R.ColliderDesc.cuboid(L.w / 2 + 8, .5, 4), L.w / 2, -.5, 0);
  fixed(R.ColliderDesc.cuboid(L.w / 2 + 8, 6, .2), L.w / 2, 6, -.8);
  for (const [x0, x1, y] of L.floors || []) fixed(R.ColliderDesc.cuboid((x1 - x0) / 2, .07, .65), (x0 + x1) / 2, y - .07, 0);

  S.add = (key, x, y, o = {}) => {
    const [, , role, opt = {}] = CAT[key], h = H[key];
    const dyn = role === 'food' || role === 'plate' || role === 'prop';
    const desc = (dyn ? R.RigidBodyDesc.dynamic() : R.RigidBodyDesc.fixed())
      .setTranslation(x, y, (o.z || 0) - (o.turn ? 0 : (h.min[2] + h.max[2]) / 2)).setRotation(o.turn ? Q90 : QI);
    if (dyn) desc.setLinearDamping(.05).setAngularDamping(opt.ball ? .9 : .25).setCcdEnabled(role === 'food');
    const body = world.createRigidBody(desc);
    const mid = (h.max[1] + h.min[1]) / 2, hx = (h.max[0] - h.min[0]) / 2, hy = (h.max[1] - h.min[1]) / 2, hz = (h.max[2] - h.min[2]) / 2;
    const cd = (opt.ball ? R.ColliderDesc.ball((hx + hz) / 2) : opt.shape === 'cyl' ? R.ColliderDesc.cylinder(hy, (hx + hz) / 2) : R.ColliderDesc.cuboid(hx, hy, hz))
      .setTranslation((h.max[0] + h.min[0]) / 2, mid, (h.max[2] + h.min[2]) / 2);
    cd.setDensity(opt.density || 1).setFriction(opt.ball ? .6 : .8).setRestitution(role === 'food' ? .2 : .08);
    world.createCollider(cd, body);
    const b = { id: S.bodies.length, key, role, body, dyn, mid, alive: true, prev: { x: 0, y: 0, z: 0 }, smashed: false, noted: [] };
    S.bodies.push(b);
    return b;
  };

  for (const [key, x, y, o] of L.items || []) S.add(key, x, y, o);
  for (const c of L.customers) {
    const y = c.y || 0;
    world.createCollider(R.ColliderDesc.capsule(.14, .2).setTranslation(c.x, y + .34, 0).setFriction(.5).setRestitution(.2));
    S.customers.push({ ...c, y, fed: false, at: { x: c.x, y: y + .42, z: .05 } });
  }
  const [cx, cy] = L.chef;
  S.hand = { x: cx + .32, y: (cy || 0) + .62, z: 0 };

  S.step = () => {
    world.step();
    S.steps++;
    const ev = [];
    let moving = false;
    for (const b of S.bodies) {
      if (!b.alive || !b.dyn) continue;
      const v = b.body.linvel(), p = b.body.translation();
      const dx = v.x - b.prev.x, dy = v.y - b.prev.y - G * DT, dz = v.z - b.prev.z;
      const dv = Math.sqrt(dx * dx + dy * dy + dz * dz);
      b.prev = { x: v.x, y: v.y, z: v.z };
      if (dv > 1) ev.push({ t: 'hit', b, m: dv });
      if (b.role === 'plate' && dv > 3.2 && !b.smashed) { b.smashed = true; ev.push({ t: 'smash', b }); }
      if (p.y < -3 || p.x < -6 || p.x > L.w + 6) { S.remove(b); continue; }
      if (v.x * v.x + v.y * v.y + v.z * v.z > .02 && !b.body.isSleeping()) moving = true;
    }
    for (const c of S.customers) {
      if (c.fed) continue;
      for (const b of S.bodies) {
        if (!b.alive || b.role !== 'food') continue;
        const p = upPoint(b.body, b.mid), dx = p.x - c.at.x, dy = p.y - c.at.y, dz = p.z - c.at.z;
        if (dx * dx + dy * dy + dz * dz > CATCH * CATCH) continue;
        if (b.key === c.want) {
          c.fed = true; S.remove(b);
          ev.push({ t: 'catch', c, b });
          break;
        }
        const v = b.body.linvel();
        if (!b.noted.includes(c) && v.x * v.x + v.y * v.y > .6) { b.noted.push(c); ev.push({ t: 'no', c, b }); }
      }
    }
    S.rest = moving ? 0 : S.rest + 1;
    if (!S.won && S.customers.every(c => c.fed)) { S.won = true; ev.push({ t: 'win' }); }
    if (!S.won && !S.lost && !S.queue.length && S.rested()) { S.lost = true; ev.push({ t: 'lose' }); }
    return ev;
  };
  S.remove = b => { if (b.alive) { b.alive = false; world.removeRigidBody(b.body); } };
  S.rested = () => S.rest > 40 || S.steps - S.lastThrow > 8 / DT;
  S.center = b => upPoint(b.body, b.mid);

  // Throw the next food in the queue. vx, vy are in units/s and get rounded to 0.01 so a throw can be replayed exactly.
  S.throwFood = (vx, vy) => {
    if (!S.queue.length) return null;
    vx = Math.round(vx * 100) / 100; vy = Math.round(vy * 100) / 100;
    const b = S.add(S.queue.shift(), S.hand.x, S.hand.y - .1, {});
    b.body.setLinvel({ x: vx, y: vy, z: 0 }, true);
    b.body.setAngvel({ x: 0, y: 0, z: -4 }, true);
    b.prev = { x: vx, y: vy, z: 0 };
    S.lastThrow = S.steps;
    S.rest = 0;
    return b;
  };

  for (let i = 0; i < SETTLE; i++) world.step();
  for (const b of S.bodies) if (b.dyn) b.prev = { ...b.body.linvel() };
  return S;
}

// Clamp a pull vector to the throw speed limit.
export function launch(dx, dy) {
  const k = 6.2, len = Math.sqrt(dx * dx + dy * dy) * k;
  const s = len > VMAX ? VMAX / len : 1;
  return { vx: dx * k * s, vy: dy * k * s, power: Math.min(1, len / VMAX) };
}
