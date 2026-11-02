// Sunday Drive world: an island built from Kenney kits, generated the same way on every device.
// Only + - * / sqrt floor and integer hashes, so terrain heights and colliders are bit-identical everywhere, which keeps
// ghost replays exact. Units are metres. Tile grid: N x N road tiles of T metres; tile (i, j) spans x i*T..(i+1)*T,
// z j*T..(j+1)*T; north is -z.

export const T = 12, N = 240, SIZE = T * N, CO = 16, WATER = -1;
export const HG = 2;                       // heightfield samples per tile (6 m apart)
const HN = N * HG + 1;

// Districts, one letter per 16 x 16 tiles (192 m): ~ sea, m mountains, F forest, f farms, b beach, s suburbs,
// d downtown, i industrial docks, p park, r race circuit. Drawn by hand.
const MAP = [
  '~~~~~~~~~~~~~~~',
  '~~mmmmFFFrrr~~~',
  '~mmmmFFFFrrrr~~',
  '~mmmFFFffFFrr~~',
  '~mmFFFsssfFFii~',
  '~FFFssddssfiii~',
  '~FFsspdddsfiii~',
  '~bFsssdddssiii~',
  '~bFFsssddssfii~',
  '~bbFFsssssfff~~',
  '~~bFFFFsffffb~~',
  '~~bbFfffffffb~~',
  '~~~bbfffffffb~~',
  '~~~~bbbbbbbbb~~',
  '~~~~~~~~~~~~~~~',
];
const AMP = { '~': 0, m: 70, F: 18, f: 2.5, b: .6, s: 0, d: 0, i: 0, r: 0, p: 3 };
// district borders wander by up to 6 tiles so they never read as straight lines
export const district = (i, j) => {
  const a = Math.floor(i + (vnoise(i / 11, j / 11, 91) - .5) * 12), b = Math.floor(j + (vnoise(i / 11, j / 11, 92) - .5) * 12);
  return (MAP[Math.min(14, Math.max(0, Math.floor(b / CO)))] || '~')[Math.min(14, Math.max(0, Math.floor(a / CO)))];
};

// ---------- deterministic randomness ----------
export function hash(a, b, c = 0) {
  let h = Math.imul(a | 0, 374761393) ^ Math.imul(b | 0, 668265263) ^ Math.imul(c | 0, 1274126177);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
function vnoise(x, z, seed) {
  const ix = Math.floor(x), iz = Math.floor(z), fx = x - ix, fz = z - iz;
  const u = fx * fx * fx * (fx * (fx * 6 - 15) + 10), v = fz * fz * fz * (fz * (fz * 6 - 15) + 10);
  const a = hash(ix, iz, seed), b = hash(ix + 1, iz, seed), c = hash(ix, iz + 1, seed), d = hash(ix + 1, iz + 1, seed);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
const fbm = (x, z, s) => (vnoise(x, z, s) * .55 + vnoise(x * 2.03, z * 2.03, s + 1) * .3 + vnoise(x * 4.1, z * 4.1, s + 2) * .15);
const smooth = t => t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t);

// coarse fields sampled bilinearly between district centres
function coarse(x, z, f) {
  const gx = x / (CO * T) - .5, gz = z / (CO * T) - .5, i0 = Math.floor(gx), j0 = Math.floor(gz), u = gx - i0, v = gz - j0;
  const g = (i, j) => f((MAP[Math.min(14, Math.max(0, j))] || '~')[Math.min(14, Math.max(0, i))]);
  return g(i0, j0) * (1 - u) * (1 - v) + g(i0 + 1, j0) * u * (1 - v) + g(i0, j0 + 1) * (1 - u) * v + g(i0 + 1, j0 + 1) * u * v;
}

// ---------- the world ----------
export function makeWorld() {
  const W = { road: new Uint8Array(N * N), kind: new Uint8Array(N * N), rot: new Uint8Array(N * N), items: [], props: [], cols: [], grid: [] };
  const at = (i, j) => j * N + i, inside = (i, j) => i >= 0 && j >= 0 && i < N && j < N;
  W.landv = (x, z) => coarse(x, z, c => c === '~' ? 0 : 1) + (fbm(x / T / 9, z / T / 9, 7) - .5) * .5;
  const isLand = (i, j) => W.landv((i + .5) * T, (j + .5) * T) > .5;
  W.land = (i, j) => inside(i, j) && isLand(i, j);

  // roads: the town street grid every 6 tiles, a ring around the town, and country roads drawn as waypoints
  // town streets stop at the shore; country roads (force) carry on over water as causeways on pillars
  const setRoad = (i, j, force) => { if (inside(i, j) && (force || W.land(i, j))) W.road[at(i, j)] = 1; };
  const line = (i0, j0, i1, j1, force) => {
    const di = Math.sign(i1 - i0), dj = Math.sign(j1 - j0);
    for (let i = i0, j = j0; ; i += di, j += dj) { setRoad(i, j, force); if (i === i1 && j === j1) break; }
  };
  const path = pts => { for (let k = 1; k < pts.length; k++) line(...pts[k - 1], ...pts[k], true); };   // legs are axis-aligned
  // main roads every 12 tiles through the whole town; downtown adds streets between them; suburbs get a
  // cul-de-sac into each block (its side and depth vary per block); industry keeps big blocks
  const town = c => c === 's' || c === 'd' || c === 'i' || c === 'p';
  let X0 = N, X1 = 0, Z0 = N, Z1 = 0;
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const c = district(i, j);
    if (!town(c)) continue;
    if (i % 12 === 2 || j % 12 === 2) setRoad(i, j);
    if (c === 'd' && (i % 6 === 2 || j % 6 === 2)) setRoad(i, j);
    if (i % 12 === 2) { X0 = Math.min(X0, i); X1 = Math.max(X1, i); }
    if (j % 12 === 2) { Z0 = Math.min(Z0, j); Z1 = Math.max(Z1, j); }
  }
  for (let bj = 0; bj < N / 12; bj++) for (let bi = 0; bi < N / 12; bi++) {
    const i0 = bi * 12 + 2, j0 = bj * 12 + 2;
    if (district(i0 + 6, j0 + 6) !== 's' || hash(bi, bj, 3) < .15) continue;
    const r = hash(bi, bj, 4), depth = 4 + Math.floor(hash(bi, bj, 5) * 3), m = 6 + (r < .5 ? 0 : 1) * (hash(bi, bj, 6) < .5 ? -1 : 1);
    const side = Math.floor(r * 4);
    if (side === 0) line(i0 + m, j0, i0 + m, j0 + depth);
    else if (side === 1) line(i0 + m, j0 + 12, i0 + m, j0 + 12 - depth);
    else if (side === 2) line(i0, j0 + m, i0 + depth, j0 + m);
    else line(i0 + 12, j0 + m, i0 + 12 - depth, j0 + m);
  }
  W.town = { X0, X1, Z0, Z1 };
  line(X0, Z0, X1, Z0, true); line(X1, Z0, X1, Z1, true); line(X1, Z1, X0, Z1, true); line(X0, Z1, X0, Z0, true);
  // country roads (tile waypoints, axis-aligned legs)
  W.country = [
    [[110, Z0], [110, 40], [150, 40]],                          // north to the race circuit
    [[X0, 92], [40, 92], [40, 60], [26, 60], [26, 30], [60, 30], [60, 18], [90, 18], [90, 40], [110, 40]], // mountain pass
    [[X0, 152], [30, 152], [30, 196]],                          // west to the beach
    [[30, 196], [70, 196], [70, 214], [150, 214], [150, 200], [196, 200]],   // southern coast road
    [[146, Z1], [146, 200]], [[182, Z1], [182, 200]], [[110, Z1], [110, 214]], // farm lanes
    [[146, 176], [196, 176]], [[X1, 140], [222, 140]],          // farms and the east cape
  ];
  for (const p of W.country) path(p);

  // tile pieces from connectivity. Base openings: straight E W, bend W S, T W E S, cross all, end E.
  const open = (i, j) => (inside(i, j) && W.road[at(i, j)]) ? 1 : 0;
  // rotation r turns the tile by r * 90 degrees counterclockwise seen from above (E -> N -> W -> S)
  const rotDir = (d, r) => (d + r) % 4;           // directions: 0 E, 1 N, 2 W, 3 S
  const BASE = { 1: [0, 2], 2: [2, 3], 3: [2, 0, 3], 4: [0, 1, 2, 3], 5: [0] };
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    if (!W.road[at(i, j)]) continue;
    const o = [open(i + 1, j), open(i, j - 1), open(i - 1, j), open(i, j + 1)];
    const n = o[0] + o[1] + o[2] + o[3];
    const kind = n === 4 ? 4 : n === 3 ? 3 : n === 1 ? 5 : n === 0 ? 6 : (o[0] && o[2]) || (o[1] && o[3]) ? 1 : 2;
    W.kind[at(i, j)] = kind;
    if (kind === 6 || kind === 4) continue;
    for (let r = 0; r < 4; r++) if (BASE[kind].every(d => o[rotDir(d, r)]) && BASE[kind].length === n) { W.rot[at(i, j)] = r; break; }
  }

  // the river: from the mountains to the west coast, crossed by the roads (they stay level, as bridges)
  W.river = [[52, 0], [56, 40], [44, 70], [50, 110], [36, 140], [20, 170], [4, 186]].map(([i, j]) => [i * T, j * T]);

  // ---------- lots: buildings, gardens, docks, farms ----------
  const used = new Uint8Array(N * N);
  for (let k = 0; k < N * N; k++) if (W.road[k]) used[k] = 1;
  // the railway: a straight line across the southern farms, kept clear and level (it crosses farm lanes at grade)
  W.rail = { j: 192, i0: 58, i1: 204 };
  for (let i = W.rail.i0; i <= W.rail.i1; i++) for (let b = -1; b <= 1; b++) if (!W.road[at(i, W.rail.j + b)]) used[at(i, W.rail.j + b)] = 3;
  const facing = (i, j) => { // direction (dx, dz) toward an adjacent road, or null
    for (const [dx, dz] of [[0, 1], [1, 0], [-1, 0], [0, -1]]) if (open(i + dx, j + dz)) return [dx, dz];
    return null;
  };
  const add = (key, x, z, rot, scale, col) => {
    W.items.push([key, x, z, rot, scale]);
    if (col) W.cols.push({ ...col, key });
  };
  const box = (x, z, hx, hz) => ({ t: 'b', x, z, hx, hz });
  const circ = (x, z, r) => ({ t: 'c', x, z, r });
  const SKY = ['skyA', 'skyB', 'skyC', 'skyD', 'skyE'], COM = ['comA', 'comB', 'comC', 'comD', 'comE', 'comF', 'comG', 'comH', 'comI', 'comJ', 'comK', 'comL', 'comM', 'comN'];
  const HOUSE = 'abcdefghijklmnopqrstu'.split('').map(c => 'house' + c.toUpperCase()), IND = ['indA', 'indB', 'indC', 'indD', 'indE', 'indF', 'indG', 'indH', 'indI', 'indJ', 'indK', 'indL', 'indM', 'indN', 'indO', 'indP', 'indQ', 'indR', 'indS', 'indT'];
  const pick = (arr, r) => arr[Math.floor(r * arr.length) % arr.length];
  const yawTo = (dx, dz) => dx === 1 ? 1 : dx === -1 ? 3 : dz === -1 ? 2 : 0;   // quarter turns so +z faces (dx, dz)

  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    if (used[at(i, j)] || !W.land(i, j)) continue;
    const c = district(i, j), r = hash(i, j, 11), r2 = hash(i, j, 12), cx = (i + .5) * T, cz = (j + .5) * T;
    const f = facing(i, j);
    if (c === 'd') {
      // downtown: 2 x 2 towers where a free square fits inside a block, shops along the streets
      if (!f && i + 1 < N && j + 1 < N && !used[at(i + 1, j)] && !used[at(i, j + 1)] && !used[at(i + 1, j + 1)] && !facing(i + 1, j + 1) && r < .8) {
        used[at(i + 1, j)] = used[at(i, j + 1)] = used[at(i + 1, j + 1)] = 1;
        add(pick(SKY, r2), cx + T / 2, cz + T / 2, Math.floor(r * 4), T * 1.3, box(cx + T / 2, cz + T / 2, T * .9, T * .9));
      } else if (f) add(pick(COM, r2), cx, cz, yawTo(f[0], f[1]), T * 1.02, box(cx, cz, T * .47, T * .47));
      else if (r < .5) add('treeS', cx, cz, 0, T * 1.4, circ(cx, cz, .9));
    } else if (c === 's') {
      if (f && r < .85) {
        add(pick(HOUSE, r2), cx - f[0] * T * .05, cz - f[1] * T * .05, yawTo(f[0], f[1]), T * .72, box(cx, cz, T * .45, T * .45));
        if (r2 < .4) W.props.push(['fence', cx + f[0] * T * .42 + (f[1] ? -T * .3 : 0), cz + f[1] * T * .42 + (f[0] ? -T * .3 : 0), yawTo(f[0], f[1]), 6]);
      } else if (!f && r < .6) add(r2 < .5 ? 'treeS' : 'treeL', cx + (r2 - .5) * 6, cz + (r - .3) * 6, 0, T * (1.2 + r * .6), circ(cx + (r2 - .5) * 6, cz + (r - .3) * 6, .8));
    } else if (c === 'i') {
      const sea = !W.land(i + 1, j) || !W.land(i + 2, j);
      if (sea) { // docks: stacks of shipping containers along the water
        if (r < .7) add(pick(['contA', 'contB', 'contC'], r2), cx, cz, r2 < .5 ? 0 : 1, T * .9, box(cx, cz, T * .45, T * .45));
      } else if (f && r < .7) add(pick(IND, r2), cx, cz, yawTo(f[0], f[1]), T * .55, box(cx, cz, T * .48, T * .48));
      else if (!f && r < .35) add(pick(['tank', 'tankL', 'chimney', 'water'], r2), cx, cz, 0, T * .8, circ(cx, cz, T * .38));
    }
  }
  // farms: a farmhouse, a silo or windmill and fences along the lanes, crops between
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    if (used[at(i, j)] || district(i, j) !== 'f' || !W.land(i, j)) continue;
    const f = facing(i, j), r = hash(i, j, 81), cx = (i + .5) * T, cz = (j + .5) * T;
    if (!f) continue;
    used[at(i, j)] = 1;
    if (r < .06) add(pick(['houseB', 'houseE', 'houseK', 'houseP'], hash(i, j, 82)), cx, cz, yawTo(f[0], f[1]), T * .72, box(cx, cz, T * .45, T * .45));
    else if (r < .09) add(hash(i, j, 83) < .5 ? 'windmill' : 'water', cx, cz, yawTo(f[0], f[1]), T * .8, circ(cx, cz, T * .3));
    else if (r < .5) for (const o of [-.25, .25]) W.props.push(['fence', cx + f[0] * T * .45 + (f[0] ? 0 : o * T), cz + f[1] * T * .45 + (f[1] ? 0 : o * T), f[0] ? 1 : 0, 6]);
  }
  // ships moored off the docks
  for (let j = 70; j < 190; j += 26) for (let i = 200; i < N; i++) if (!W.land(i, j) && !W.land(i + 3, j)) { add(hash(i, j, 5) < .5 ? 'shipCargo' : 'shipLarge', (i + 3.5) * T, (j + .5) * T, 0, T * .6, null); break; }

  // ---------- the race circuit (racing-kit tiles, 18 m each) ----------
  W.circuit = { str: 'G R3 S S S S S S L1 R1 S S S S S S R3 S S S S S S R2 S S S S S S R2 L2 S S S S S S R2', S: 18, ox: 154 * T, oz: 56 * T };
  W.circuit.pieces = circuitPieces(W.circuit);
  for (const pc of W.circuit.pieces) for (let k = 0; k <= 8; k++) {
    // mark the circuit's cells as paved so nothing grows on it and the ground is flat
    const t = k / 8, x = pc.A[0] + (pc.B[0] - pc.A[0]) * t, z = pc.A[1] + (pc.B[1] - pc.A[1]) * t;
    for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) { const ii = Math.floor(x / T) + a, jj = Math.floor(z / T) + b; if (inside(ii, jj)) used[at(ii, jj)] = 2; }
  }
  // grandstands along the circuit's start straight
  { const st = W.circuit.pieces[0], rx = -st.D[1], rz = st.D[0];
    for (let k = 0; k < 4; k++) { const x = st.A[0] + st.D[0] * (k * 18 + 4) + rx * -26, z = st.A[1] + st.D[1] * (k * 18 + 4) + rz * -26; add('stand', x, z, 1, 18, box(x, z, 9, 9)); } }

  // ---------- nature: forests, mountain pines and rocks, farm crops, beach palms ----------
  W.flat = new Uint8Array(N * N);       // 1 where terrain stays level (roads, lots), so buildings never sit on slopes
  for (let k = 0; k < N * N; k++) if (used[k] || W.road[k]) W.flat[k] = 1;
  for (const it of W.items) { const i = Math.floor(it[1] / T), j = Math.floor(it[2] / T); if (inside(i, j)) W.flat[at(i, j)] = 1; }
  W.dist = chamfer(W.flat);
  const TREES = { r: ['treeA', 'treeC', 'pineA'], p: ['treeA', 'treeB', 'treeE', 'treeS'], F: ['treeA', 'treeB', 'treeC', 'treeD', 'treeE', 'pineA', 'pineB'], m: ['pineA', 'pineB', 'pineC', 'pineA', 'rockT', 'rockL'], b: ['palm', 'palmB'], f: ['crop'] };
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const c = district(i, j), list = TREES[c];
    if (used[at(i, j)] || W.road[at(i, j)] || !W.land(i, j) || W.dist[at(i, j)] < (c === 'p' ? 1 : 2)) continue;
    if (!list) continue;
    const dens = c === 'F' ? .85 : c === 'm' ? .35 : c === 'b' ? .08 : c === 'p' ? .45 : c === 'r' ? .12 : c === 'f' ? 1 : .3, n = c === 'F' ? 3 : 1;
    for (let k = 0; k < n; k++) {
      if (hash(i, j, 20 + k) > dens) continue;
      const x = (i + .15 + .7 * hash(i, j, 30 + k)) * T, z = (j + .15 + .7 * hash(i, j, 40 + k)) * T, key = pick(list, hash(i, j, 50 + k));
      if (c === 'f') {   // corn in rows of four per tile on alternate fields
        if (Math.floor(i / 7) % 2 === Math.floor(j / 5) % 2) for (let a = 0; a < 2; a++) for (let b = 0; b < 2; b++) W.items.push(['crop', (i + .25 + a * .5) * T, (j + .25 + b * .5) * T, 0, 2.1]);
        continue;
      }
      const big = key.startsWith('rock') ? 7 : 5.5 + 3 * hash(i, j, 60 + k);
      add(key, x, z, Math.floor(hash(i, j, 70 + k) * 4), big, circ(x, z, key.startsWith('rock') ? 3 : .7));
    }
  }

  // ---------- terrain heightfield ----------
  W.H = new Float32Array(HN * HN);
  const D = T / HG;
  for (let b = 0; b < HN; b++) for (let a = 0; a < HN; a++) {
    const x = a * D, z = b * D;
    const land = W.landv(x, z);
    const amp = coarse(x, z, c => AMP[c]);
    let n = fbm(x / 260, z / 260, 3);
    n = n * n * 1.6;
    const i = Math.min(N - 1, Math.floor(x / T)), j = Math.min(N - 1, Math.floor(z / T));
    const flat = smooth((W.dist[at(i, j)] - 1.2) / 4);
    let h = amp * n * flat;
    const shore = (land - .5) * 10;
    h = shore < 0 ? Math.max(-9, shore * 6) - 1.6 : h + (shore < 1 ? shore - 1 : 0) * 1.6;
    // river bed
    let rd = 1e9;
    for (let k = 1; k < W.river.length; k++) rd = Math.min(rd, segDist(x, z, W.river[k - 1], W.river[k]));
    if (rd < 26) { const t = rd / 26; h = Math.min(h, -3.5 + t * t * (h + 3.5)); }
    W.H[b * HN + a] = h;
  }

  // ---------- jumps: ramps (x, z, direction, length, height) ----------
  W.ramps = [
    [62 * T, 31 * T, [1, 0], 14, 3.2], [146.5 * T, 170 * T, [0, 1], 14, 2.6], [190 * T, 214.5 * T, [-1, 0], 16, 3.6],
    [26.5 * T, 120 * T, [0, -1], 14, 3], [110.5 * T, 30 * T, [0, -1], 12, 2.8],
  ].map(([x, z, d, len, h]) => ({ x, z, d, len, h, w: 6 }));

  // ---------- guard rails on causeways: a solid rail on each side that faces open water ----------
  W.rails = [];
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    if (!W.road[at(i, j)]) continue;
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      // a rail wherever the ground beside the road (just past its edge) is under water
      const ni = i + dx, nj = j + dz, ha = Math.min(HN - 1, Math.max(0, Math.round((i + .5 + dx * .75) * HG))), hb = Math.min(HN - 1, Math.max(0, Math.round((j + .5 + dz * .75) * HG)));
      if (open(ni, nj) || W.H[hb * HN + ha] > WATER - .2) continue;
      const x = (i + .5 + dx * .47) * T, z = (j + .5 + dz * .47) * T;
      W.cols.push({ t: 'b', x, z, hx: dx ? .35 : T / 2, hz: dz ? .35 : T / 2, key: 'rail' });
      W.rails.push([x, z, dx ? 1 : 0]);
    }
  }

  // ---------- collider grid ----------
  W.grid = Array.from({ length: (N / 2) * (N / 2) }, () => []);
  W.cols.forEach((c, k) => {
    const r = c.t === 'c' ? c.r : Math.max(c.hx, c.hz);
    for (let b = Math.floor((c.z - r) / (2 * T)); b <= Math.floor((c.z + r) / (2 * T)); b++)
      for (let a = Math.floor((c.x - r) / (2 * T)); a <= Math.floor((c.x + r) / (2 * T)); a++)
        if (a >= 0 && b >= 0 && a < N / 2 && b < N / 2) W.grid[b * (N / 2) + a].push(k);
  });
  // spawn on the north-south main road nearest the town centre, heading north
  { const ci = (X0 + X1) / 2, cj = (Z0 + Z1) / 2;
    let best = 1e9;
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      if (!W.road[at(i, j)] || W.kind[at(i, j)] !== 1 || !open(i, j - 1) || !open(i, j + 1) || i % 12 !== 2) continue;
      const d = (i - ci) * (i - ci) + (j - cj) * (j - cj);
      if (d < best) { best = d; W.spawn = { x: (i + .5) * T, z: (j + .5) * T, hx: 0, hz: -1 }; }
    } }
  return W;
}

function segDist(x, z, p, q) {
  const dx = q[0] - p[0], dz = q[1] - p[1], L = dx * dx + dz * dz;
  let t = ((x - p[0]) * dx + (z - p[1]) * dz) / L; t = t < 0 ? 0 : t > 1 ? 1 : t;
  const ex = p[0] + dx * t - x, ez = p[1] + dz * t - z;
  return Math.sqrt(ex * ex + ez * ez);
}
// distance in tiles to the nearest flagged cell (3-4 chamfer, /3)
function chamfer(flag) {
  const d = new Float32Array(N * N);
  for (let k = 0; k < N * N; k++) d[k] = flag[k] ? 0 : 1e6;
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    let v = d[j * N + i];
    if (i > 0) v = Math.min(v, d[j * N + i - 1] + 3);
    if (j > 0) v = Math.min(v, d[(j - 1) * N + i] + 3, i > 0 ? d[(j - 1) * N + i - 1] + 4 : 1e6, i < N - 1 ? d[(j - 1) * N + i + 1] + 4 : 1e6);
    d[j * N + i] = v;
  }
  for (let j = N - 1; j >= 0; j--) for (let i = N - 1; i >= 0; i--) {
    let v = d[j * N + i];
    if (i < N - 1) v = Math.min(v, d[j * N + i + 1] + 3);
    if (j < N - 1) v = Math.min(v, d[(j + 1) * N + i] + 3, i < N - 1 ? d[(j + 1) * N + i + 1] + 4 : 1e6, i > 0 ? d[(j + 1) * N + i - 1] + 4 : 1e6);
    d[j * N + i] = v;
  }
  for (let k = 0; k < N * N; k++) d[k] /= 3;
  return d;
}

// racing-kit circuit pieces in metres (same turtle grammar as Ghost Lap)
function circuitPieces({ str, S, ox, oz }) {
  let p = [0, 0], d = [0, -1];
  const out = [];
  for (const t of str.trim().split(/\s+/)) {
    const k = t[0], n = +t.slice(1) || 1;
    if (k === 'G' || k === 'S') {
      const len = k === 'G' ? 2 : 1, q = [p[0] + d[0] * len, p[1] + d[1] * len];
      out.push({ type: k === 'G' ? 'start' : 'straight', a: p, b: q, d, out: d, len });
      p = q;
    } else {
      const r = n - .5, side = k === 'R' ? [-d[1], d[0]] : [d[1], -d[0]];
      const c = [p[0] + side[0] * r, p[1] + side[1] * r], q = [p[0] + (d[0] + side[0]) * r, p[1] + (d[1] + side[1]) * r];
      out.push({ type: 'corner', size: n, turn: k === 'R' ? 1 : -1, r, c, a: p, b: q, d, out: side });
      p = q; d = side;
    }
  }
  return out.map(pc => ({ ...pc, A: [ox + pc.a[0] * S, oz + pc.a[1] * S], B: [ox + pc.b[0] * S, oz + pc.b[1] * S], C: pc.c && [ox + pc.c[0] * S, oz + pc.c[1] * S], R: pc.r && pc.r * S, D: pc.d }));
}

// ---------- ground height (physics and rendering agree) ----------
export function groundAt(W, x, z) {
  const i = Math.floor(x / T), j = Math.floor(z / T);
  let h;
  if (i >= 0 && j >= 0 && i < N && j < N && W.road[j * N + i]) h = 0;     // roads stay level, so they bridge the river
  else {
    const D = T / HG, gx = x / D, gz = z / D;
    const a = Math.max(0, Math.min(HN - 2, Math.floor(gx))), b = Math.max(0, Math.min(HN - 2, Math.floor(gz)));
    const u = Math.max(0, Math.min(1, gx - a)), v = Math.max(0, Math.min(1, gz - b));
    const H = W.H, k = b * HN + a;
    h = H[k] * (1 - u) * (1 - v) + H[k + 1] * u * (1 - v) + H[k + HN] * (1 - u) * v + H[k + HN + 1] * u * v;
  }
  for (const r of W.ramps) {
    const lx = x - r.x, lz = z - r.z, along = lx * r.d[0] + lz * r.d[1], side = -lx * r.d[1] + lz * r.d[0];
    if (along > 0 && along < r.len && side > -r.w && side < r.w) h = Math.max(h, r.h * along / r.len);
  }
  return h;
}
export const roadAt = (W, x, z) => { const i = Math.floor(x / T), j = Math.floor(z / T); return i >= 0 && j >= 0 && i < N && j < N && W.road[j * N + i] === 1; };
export { HN };
