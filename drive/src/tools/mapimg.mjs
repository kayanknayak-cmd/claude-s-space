// Renders the island top-down to a PNG (4 px per 12 m tile): terrain, water, roads, buildings, trees, circuit,
// ramps and events. Usage: node tools/mapimg.mjs out.png
import fs from 'fs';
import { execFileSync } from 'child_process';
import { makeWorld, groundAt, district, T, N, WATER } from '../world.mjs';
import { makeEvents } from '../events.mjs';
const out = process.argv[2], P = 4, S = N * P;
const t0 = Date.now(), W = makeWorld(), EV = makeEvents(W);
const COL = { sprint: [255, 210, 0], trap: [255, 60, 60], drift: [200, 80, 255], jump: [255, 140, 0] };
W.events = [...EV.list.map(e => ({ ...e, color: COL[e.type] })), ...EV.heads.map(h => ({ ...h, color: [255, 255, 255] }))];
console.log('events', EV.list.length, 'heads', EV.heads.length);
console.log('world built in', Date.now() - t0, 'ms;', W.items.length, 'items,', W.cols.length, 'colliders,', W.props.length, 'props');
const img = Buffer.alloc(S * S * 3);
const put = (px, pz, [r, g, b]) => { if (px < 0 || pz < 0 || px >= S || pz >= S) return; const k = (pz * S + px) * 3; img[k] = r; img[k + 1] = g; img[k + 2] = b; };
const BASE = { p: [110, 170, 100], F: [70, 128, 80], m: [120, 140, 110], f: [170, 180, 110], b: [220, 205, 150], s: [130, 175, 110], d: [150, 150, 150], i: [140, 140, 130], r: [120, 170, 110], '~': [80, 140, 200] };
for (let pz = 0; pz < S; pz++) for (let px = 0; px < S; px++) {
  const x = (px + .5) * T / P, z = (pz + .5) * T / P, h = groundAt(W, x, z);
  if (h < WATER) { const d = Math.min(1, (WATER - h) / 8); put(px, pz, [60 - 30 * d, 140 - 50 * d, 210 - 40 * d]); continue; }
  let c = BASE[district(Math.floor(x / T), Math.floor(z / T))] || [128, 128, 128];
  if (W.landv(x, z) < .6 && h < 1.5) c = [222, 208, 160];
  const shade = Math.max(.6, Math.min(1.35, 1 + (groundAt(W, x - 6, z - 6) - h) * .04)), lift = Math.min(1, h / 70);
  put(px, pz, c.map(v => Math.min(255, (v * (1 - lift) + 235 * lift) * shade)));
}
for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) if (W.road[j * N + i]) for (let a = 0; a < P; a++) for (let b = 0; b < P; b++) put(i * P + a, j * P + b, [70, 70, 78]);
for (const pc of W.circuit.pieces) for (let k = 0; k <= 30; k++) {
  const t = k / 30;
  let x, z;
  if (pc.type !== 'corner') { x = pc.A[0] + (pc.B[0] - pc.A[0]) * t; z = pc.A[1] + (pc.B[1] - pc.A[1]) * t; }
  else { const a0 = Math.atan2(pc.A[1] - pc.C[1], pc.A[0] - pc.C[0]), a1 = Math.atan2(pc.B[1] - pc.C[1], pc.B[0] - pc.C[0]); let da = a1 - a0; while (da > Math.PI) da -= 2 * Math.PI; while (da < -Math.PI) da += 2 * Math.PI; x = pc.C[0] + Math.cos(a0 + da * t) * pc.R; z = pc.C[1] + Math.sin(a0 + da * t) * pc.R; }
  for (let a = -2; a <= 2; a++) for (let b = -2; b <= 2; b++) put(Math.round(x / T * P) + a, Math.round(z / T * P) + b, [50, 50, 55]);
}
for (const [key, x, z] of W.items) {
  const px = Math.round(x / T * P), pz = Math.round(z / T * P);
  const c = /^(tree|pine|palm)/.test(key) ? [40, 90, 50] : key === 'crop' ? [190, 160, 70] : key.startsWith('rock') ? [110, 110, 110] : key.startsWith('house') ? [200, 120, 90] : key.startsWith('sky') ? [90, 110, 160] : key.startsWith('com') ? [160, 170, 200] : key.startsWith('ship') ? [200, 60, 60] : [180, 180, 190];
  const r = /^(sky|ship|stand)/.test(key) ? 3 : /^(com|house|ind|cont)/.test(key) ? 1 : 0;
  for (let a = -r; a <= r; a++) for (let b = -r; b <= r; b++) put(px + a, pz + b, c);
}
for (const r of W.ramps) for (let k = 0; k < 6; k++) put(Math.round((r.x + r.d[0] * k * 3) / T * P), Math.round((r.z + r.d[1] * k * 3) / T * P), [255, 140, 0]);
for (const e of W.events || []) for (let a = -4; a <= 4; a++) for (let b = -4; b <= 4; b++) if (a * a + b * b <= 16) put(Math.round(e.x / T * P) + a, Math.round(e.z / T * P) + b, e.color || [255, 220, 0]);
{ const px = Math.round(W.spawn.x / T * P), pz = Math.round(W.spawn.z / T * P); for (let a = -5; a <= 5; a++) put(px + a, pz, [255, 0, 255]), put(px, pz + a, [255, 0, 255]); }
for (const e of EV.list) if (e.gates) for (const [gx, gz] of e.gates) for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) put(Math.round(gx / T * P) + a, Math.round(gz / T * P) + b, [255, 255, 0]);
fs.writeFileSync(out + '.rgb', img);
execFileSync('convert', ['-size', `${S}x${S}`, '-depth', '8', 'rgb:' + out + '.rgb', out]);
fs.unlinkSync(out + '.rgb');
console.log('wrote', out);
