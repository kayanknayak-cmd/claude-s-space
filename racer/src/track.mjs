// Track geometry from racing-kit tiles. A track is a turtle string of pieces on a 1-unit tile grid:
//   G  start (2 long, finish gantry in its middle), must come first
//   S  straight, 1 long
//   R1 R2 R3 / L1 L2 L3  right / left corner: small (r .5), large (r 1.5), larger (r 2.5)
// Coordinates: x right, z toward the camera, heading N = (0, -1). Tile units; the game scales by SCALE.
// Physics only uses + - * / and sqrt here, so the result is identical on every device.

export const SCALE = 8;
export const WALL = .56;          // tile units from the centerline to the barrier
export const ASPHALT = .345;      // half width of the asphalt
export const CURB = .418;         // half width including curbs

const right = ([x, z]) => [-z, x];
const left = ([x, z]) => [z, -x];

export function parseTrack(str) {
  const toks = str.trim().split(/\s+/);
  let p = [0, 0], d = [0, -1];
  const pieces = [];
  for (const t of toks) {
    const k = t[0], n = +t.slice(1) || 1;
    if (k === 'G' || k === 'S') {
      const len = k === 'G' ? 2 : n;
      const q = [p[0] + d[0] * len, p[1] + d[1] * len];
      pieces.push({ type: k === 'G' ? 'start' : 'straight', len, a: p, b: q, d, out: d });
      p = q;
    } else {
      const r = n - .5, side = k === 'R' ? right(d) : left(d);
      const c = [p[0] + side[0] * r, p[1] + side[1] * r];
      const q = [p[0] + (d[0] + side[0]) * r, p[1] + (d[1] + side[1]) * r];
      pieces.push({ type: 'corner', size: n, turn: k === 'R' ? 1 : -1, r, c, a: p, b: q, d, out: side, len: r * Math.PI / 2 });
      p = q; d = side;
    }
  }
  const err = Math.hypot(p[0], p[1]) + Math.hypot(d[0], d[1] + 1);
  return { pieces, closed: err < 1e-9, end: p };
}

// Scale to world units and precompute what the car needs each step.
export function buildTrack(str) {
  const { pieces, closed } = parseTrack(str);
  const S = SCALE;
  const P = pieces.map(pc => ({
    ...pc,
    A: [pc.a[0] * S, pc.a[1] * S], B: [pc.b[0] * S, pc.b[1] * S],
    C: pc.c && [pc.c[0] * S, pc.c[1] * S], R: pc.r && pc.r * S,
    D: pc.d, O: pc.out,
  }));
  const start = P[0];
  return {
    str, pieces: P, closed,
    line: { p: [start.A[0] + start.D[0] * S, start.A[1] + start.D[1] * S], d: start.D },
    spawn: { p: [start.A[0] + start.D[0] * .35 * S, start.A[1] + start.D[1] * .35 * S], h: start.D },
    length: P.reduce((s, p) => s + p.len * S, 0),
  };
}

// Where a point sits on piece i: lateral offset (positive = right of travel, world units) and the track's forward
// direction there. Also whether it is past the exit line or before the entry line.
export function locate(T, i, x, z) {
  const pc = T.pieces[i];
  let lat, fx, fz;
  if (pc.type !== 'corner') {
    const rx = -pc.D[1], rz = pc.D[0];
    lat = (x - pc.A[0]) * rx + (z - pc.A[1]) * rz;
    fx = pc.D[0]; fz = pc.D[1];
  } else {
    const ux = x - pc.C[0], uz = z - pc.C[1], rho = Math.sqrt(ux * ux + uz * uz) || 1e-9;
    lat = pc.turn > 0 ? pc.R - rho : rho - pc.R;
    // forward = radial turned toward travel: right of radial for right turns, left for left turns
    fx = pc.turn > 0 ? -uz / rho : uz / rho; fz = pc.turn > 0 ? ux / rho : -ux / rho;
  }
  const past = (x - pc.B[0]) * pc.O[0] + (z - pc.B[1]) * pc.O[1] > 0;
  const before = (x - pc.A[0]) * pc.D[0] + (z - pc.A[1]) * pc.D[1] < 0;
  return { lat, fx, fz, past, before };
}

// Centerline points every `step` world units (rendering, bot and decor only; uses trig).
export function centerline(T, step = 2) {
  const out = [];
  for (const [i, pc] of T.pieces.entries()) {
    const L = pc.len * SCALE, n = Math.max(1, Math.round(L / step));
    for (let k = 0; k < n; k++) {
      const t = k / n;
      if (pc.type !== 'corner') out.push({ x: pc.A[0] + (pc.B[0] - pc.A[0]) * t, z: pc.A[1] + (pc.B[1] - pc.A[1]) * t, i });
      else {
        const a0 = Math.atan2(pc.A[1] - pc.C[1], pc.A[0] - pc.C[0]);
        const a1 = Math.atan2(pc.B[1] - pc.C[1], pc.B[0] - pc.C[0]);
        let da = a1 - a0; while (da > Math.PI) da -= 2 * Math.PI; while (da < -Math.PI) da += 2 * Math.PI;
        const a = a0 + da * t;
        out.push({ x: pc.C[0] + Math.cos(a) * pc.R, z: pc.C[1] + Math.sin(a) * pc.R, i });
      }
    }
  }
  return out;
}

// Grid cells each piece's tile covers (overlap checks, decor placement). Cell "i,j" spans x i..i+1, z j..j+1.
export function cells(T) {
  const map = new Map();
  for (const [n, pc] of T.pieces.entries()) {
    const xs = [], zs = [];
    for (const [p, d] of [[pc.a, pc.d], [pc.b, pc.out]]) for (const s of [-.5, .5]) { xs.push(p[0] - d[1] * s); zs.push(p[1] + d[0] * s); }
    const x0 = Math.round(Math.min(...xs)), x1 = Math.round(Math.max(...xs)), z0 = Math.round(Math.min(...zs)), z1 = Math.round(Math.max(...zs));
    for (let i = x0; i < x1; i++) for (let j = z0; j < z1; j++) {
      const k = i + ',' + j;
      if (!map.has(k)) map.set(k, []);
      map.get(k).push(n);
    }
  }
  return map;
}
