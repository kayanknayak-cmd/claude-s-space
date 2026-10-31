// Things to do on the island: sprints along real roads, the circuit race, speed traps, drift zones, jumps and 30
// hidden stone heads. Built from the world so they always sit on roads and stay in sync with the map.
import { T, N, hash, groundAt } from './world.mjs';

// shortest road route between road tiles (breadth-first over road cells), through each waypoint in turn
function route(W, pts) {
  // snap each waypoint to the nearest road tile
  pts = pts.map(([i, j]) => {
    let best = null, bd = 1e9;
    for (let b = -14; b <= 14; b++) for (let a = -14; a <= 14; a++) { const ii = i + a, jj = j + b; if (ii >= 0 && jj >= 0 && ii < N && jj < N && W.road[jj * N + ii] && a * a + b * b < bd) { bd = a * a + b * b; best = [ii, jj]; } }
    if (!best) throw new Error('no road near ' + i + ',' + j);
    return best;
  });
  const out = [];
  for (let k = 1; k < pts.length; k++) {
    const [si, sj] = pts[k - 1], [ti, tj] = pts[k], prev = new Int32Array(N * N).fill(-1), q = [sj * N + si];
    prev[sj * N + si] = sj * N + si;
    for (let h = 0; h < q.length; h++) {
      const c = q[h], i = c % N, j = (c - i) / N;
      if (i === ti && j === tj) break;
      for (const [a, b] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const ni = i + a, nj = j + b, n = nj * N + ni;
        if (ni < 0 || nj < 0 || ni >= N || nj >= N || !W.road[n] || prev[n] >= 0) continue;
        prev[n] = c; q.push(n);
      }
    }
    const seg = [];
    for (let c = tj * N + ti; ; c = prev[c]) { if (c < 0) throw new Error('no route to ' + pts[k]); seg.push(c); if (c === prev[c]) break; }
    seg.reverse();
    out.push(...(k > 1 ? seg.slice(1) : seg));
  }
  return out.map(c => [c % N, (c - c % N) / N]);
}

const center = ([i, j]) => [(i + .5) * T, (j + .5) * T];
// a point along a circuit corner (for the test bot's path only; uses trig, never physics)
function arcPt(pc, t) {
  const a0 = Math.atan2(pc.A[1] - pc.C[1], pc.A[0] - pc.C[0]), a1 = Math.atan2(pc.B[1] - pc.C[1], pc.B[0] - pc.C[0]);
  let da = a1 - a0; while (da > Math.PI) da -= 2 * Math.PI; while (da < -Math.PI) da += 2 * Math.PI;
  return [pc.C[0] + Math.cos(a0 + da * t) * pc.R, pc.C[1] + Math.sin(a0 + da * t) * pc.R];
}

export function makeEvents(W) {
  const E = [];
  // sprints: gates every 7 tiles along the route, the start pose faces the route
  const sprint = (id, name, way) => {
    const tiles = route(W, way), gates = [];
    // a gate is a line across the road: its centre and the route direction through it
    const gateAt = k => { const [x, z] = center(tiles[k]), [px, pz] = center(tiles[Math.max(0, k - 1)]), d = Math.hypot(x - px, z - pz) || 1; return [x, z, (x - px) / d, (z - pz) / d]; };
    for (let k = 7; k < tiles.length - 1; k += 7) gates.push(gateAt(k));
    gates.push(gateAt(tiles.length - 1));
    const [x, z] = center(tiles[0]), [x1, z1] = center(tiles[1]), d = Math.hypot(x1 - x, z1 - z);
    E.push({ id, name, type: 'sprint', x, z, start: { x, z, hx: (x1 - x) / d, hz: (z1 - z) / d }, gates, r: 10, laps: 1, len: tiles.length * T, path: tiles.map(center) });
  };
  const { X0, X1, Z0, Z1 } = W.town;
  sprint('downtown', 'Downtown Dash', [[134, 98], [110, 98], [110, 134], [146, 134], [146, 110], [98, 110]]);
  sprint('pass', 'Mountain Pass', [[X0, 92], [40, 92], [26, 60], [60, 30], [90, 18], [110, 40]]);
  sprint('coast', 'Coast Road', [[30, 152], [30, 196], [70, 214], [150, 214], [196, 200]]);
  sprint('ring', 'Ring Road', [[X0, 120], [X0, Z0], [X1, Z0], [X1, Z1], [X0, Z1], [X0, 132]]);
  sprint('farms', 'Farm Lanes', [[110, Z1], [110, 214], [150, 214], [150, 200], [146, 176], [182, 176], [182, Z1]]);
  sprint('docks', 'Dockside', [[X1, 74], [X1, 158], [194, 158], [194, 86], [170, 86]]);

  // the circuit race: two laps through gates at the end of every circuit piece
  { const P = W.circuit.pieces, S = W.circuit.S, st = P[0];
    const gates = [];
    for (let lap = 0; lap < 2; lap++) for (const pc of P.slice(1)) gates.push([pc.B[0], pc.B[1], pc.out[0], pc.out[1]]);
    gates.push([st.A[0] + st.D[0] * S, st.A[1] + st.D[1] * S, st.D[0], st.D[1]]);
    const path = []; for (let lap = 0; lap < 2; lap++) for (const pc of P) { for (let k = 0; k < 6; k++) { const t = k / 6; path.push(pc.type === 'corner' ? arcPt(pc, t) : [pc.A[0] + (pc.B[0] - pc.A[0]) * t, pc.A[1] + (pc.B[1] - pc.A[1]) * t]); } }
    E.push({ path, id: 'gp', name: 'Grand Prix', type: 'sprint', x: st.A[0], z: st.A[1], start: { x: st.A[0] + st.D[0] * 4, z: st.A[1] + st.D[1] * 4, hx: st.D[0], hz: st.D[1] }, gates, r: 14, laps: 2 }); }

  // speed traps on the longest straights: passive, triggered by driving past
  const traps = [['Ring north', 166, 62, 'x'], ['Ring west', X0, 100, 'z'], ['Coast flats', 92, 214, 'x'], ['Farm lane', 110, 186, 'z'], ['Circuit road', 128, 40, 'x']];
  for (const [name, i, j] of traps) { const [x, z] = center([i, j]); E.push({ id: 'trap-' + name.toLowerCase().replace(/ /g, '-'), name, type: 'trap', x, z, r: 8 }); }

  // drift zones: rectangles in tiles; score builds while you drift inside
  const zones = [['Dock yard', 182, 98, 206, 122], ['Old town', 98, 86, 122, 110], ['Switchbacks', 24, 28, 62, 62]];
  for (const [name, i0, j0, i1, j1] of zones) E.push({ id: 'drift-' + name.toLowerCase().replace(/ /g, '-'), name, type: 'drift', x: (i0 + i1) / 2 * T, z: (j0 + j1) / 2 * T, box: [i0 * T, j0 * T, i1 * T, j1 * T] });

  // jumps: each ramp measures how far you fly
  W.ramps.forEach((r, k) => E.push({ id: 'jump-' + k, name: ['Quarry Leap', 'Barn Hop', 'Sea Wall', 'River Gap', 'Paddock Kicker'][k] || 'Jump ' + (k + 1), type: 'jump', x: r.x, z: r.z, ramp: r }));

  // 30 stone heads hidden off the beaten track: one per district patch, on dry land away from colliders
  const heads = [];
  for (let k = 0; heads.length < 30 && k < 4000; k++) {
    const i = 8 + Math.floor(hash(k, 1, 99) * (N - 16)), j = 8 + Math.floor(hash(k, 2, 99) * (N - 16));
    if (!W.land(i, j) || W.road[j * N + i]) continue;
    const x = (i + .5) * T, z = (j + .5) * T;
    if (groundAt(W, x, z) < .5) continue;
    if (heads.some(h => Math.hypot(h.x - x, h.z - z) < 240)) continue;
    if (W.cols.some(c => Math.hypot(c.x - x, c.z - z) < (c.t === 'c' ? c.r : Math.max(c.hx, c.hz)) + 4)) continue;
    heads.push({ id: 'head-' + heads.length, x, z });
  }
  return { list: E, heads };
}

// Gate progress for a timed event; shared by live play and by replay checks, so a ghost or a leaderboard row is
// verified with exactly the rules it was driven under. Passing a gate also moves the respawn point there.
export function runGates(ev, c, st) {
  if (st.done) return;
  // crossed the gate's line (front to back along the route), within 18 m of its centre
  const g = ev.gates[st.gi], dx = c.x - g[0], dz = c.z - g[1], along = dx * g[2] + dz * g[3], side = -dx * g[3] + dz * g[2];
  const prev = st.prev === undefined ? -1 : st.prev;
  st.prev = along;
  if (prev < 0 && along >= 0 && side > -18 && side < 18) {
    c.safe = { x: g[0], z: g[1], hx: g[2], hz: g[3] };
    st.gi++; st.split = c.steps; st.prev = undefined;
    if (st.gi >= ev.gates.length) { st.done = true; st.time = c.steps / 120; }
  }
}
