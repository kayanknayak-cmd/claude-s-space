// Builds ../rush.html from head.html + sim.mjs + game.js and the Kenney models in assets/.
// Also writes hulls.json (model bounds, used to fit colliders) for the Node tools.
// Usage: node build.mjs
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { CAT } from './catalog.mjs';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(DIR, '..', 'rush.html');

function readGlb(file) {
  const b = fs.readFileSync(file);
  const jlen = b.readUInt32LE(12);
  const json = JSON.parse(b.subarray(20, 20 + jlen).toString('utf8'));
  const boff = 20 + jlen;
  const bin = b.subarray(boff + 8, boff + 8 + b.readUInt32LE(boff));
  return { json, bin };
}
function writeGlb(json, bin) {
  let js = Buffer.from(JSON.stringify(json), 'utf8');
  js = Buffer.concat([js, Buffer.alloc((4 - js.length % 4) % 4, 0x20)]);
  const bn = Buffer.concat([bin, Buffer.alloc((4 - bin.length % 4) % 4, 0)]);
  const h = Buffer.alloc(12); h.write('glTF', 0); h.writeUInt32LE(2, 4); h.writeUInt32LE(12 + 8 + js.length + 8 + bn.length, 8);
  const jh = Buffer.alloc(8); jh.writeUInt32LE(js.length, 0); jh.writeUInt32LE(0x4E4F534A, 4);
  const bh = Buffer.alloc(8); bh.writeUInt32LE(bn.length, 0); bh.writeUInt32LE(0x004E4942, 4);
  return Buffer.concat([h, jh, js, bh, bn]);
}

// Column-major 4x4 helpers, enough for node transforms.
const mul = (a, b) => { const r = new Array(16).fill(0); for (let c = 0; c < 4; c++) for (let rr = 0; rr < 4; rr++) for (let k = 0; k < 4; k++) r[c * 4 + rr] += a[k * 4 + rr] * b[c * 4 + k]; return r; };
function local(n) {
  if (n.matrix) return n.matrix;
  const [x, y, z, w] = n.rotation || [0, 0, 0, 1], [sx, sy, sz] = n.scale || [1, 1, 1], [tx, ty, tz] = n.translation || [0, 0, 0];
  return [(1 - 2 * (y * y + z * z)) * sx, 2 * (x * y + z * w) * sx, 2 * (x * z - y * w) * sx, 0,
    2 * (x * y - z * w) * sy, (1 - 2 * (x * x + z * z)) * sy, 2 * (y * z + x * w) * sy, 0,
    2 * (x * z + y * w) * sz, 2 * (y * z - x * w) * sz, (1 - 2 * (x * x + y * y)) * sz, 0, tx, ty, tz, 1];
}
function points({ json, bin }, scale) {
  const out = new Map();
  const walk = (i, P) => {
    const n = json.nodes[i], M = mul(P, local(n));
    if (n.mesh !== undefined) for (const pr of json.meshes[n.mesh].primitives) {
      const a = json.accessors[pr.attributes.POSITION], bv = json.bufferViews[a.bufferView];
      const stride = bv.byteStride || 12, o = (bv.byteOffset || 0) + (a.byteOffset || 0);
      for (let v = 0; v < a.count; v++) {
        const x = bin.readFloatLE(o + v * stride), y = bin.readFloatLE(o + v * stride + 4), z = bin.readFloatLE(o + v * stride + 8);
        const p = [0, 1, 2].map(k => Math.round((M[k] * x + M[4 + k] * y + M[8 + k] * z + M[12 + k]) * scale * 1000) / 1000);
        out.set(p.join(','), p);
      }
    }
    for (const c of n.children || []) walk(c, M);
  };
  for (const r of json.scenes[json.scene || 0].nodes) walk(r, [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
  return [...out.values()];
}

const models = {}, hulls = {}, kits = new Set();
for (const [key, [file, scale, role]] of Object.entries(CAT)) {
  const kit = file.split('/')[0];
  const g = readGlb(path.join(DIR, 'assets', file + '.glb'));
  kits.add(kit);
  for (const im of g.json.images || []) im.uri = 'tex-' + kit + '.png';
  models[key] = writeGlb(g.json, g.bin).toString('base64');
  const pts = points(g, scale);
  const min = [0, 1, 2].map(k => Math.min(...pts.map(p => p[k])));
  const max = [0, 1, 2].map(k => Math.max(...pts.map(p => p[k])));
  hulls[key] = { min, max };
}
const tex = {};
for (const k of kits) tex[k] = fs.readFileSync(path.join(DIR, 'assets', k, 'colormap.png')).toString('base64');
fs.writeFileSync(path.join(DIR, 'hulls.json'), JSON.stringify(hulls));

const strip = s => s.replace(/^import .*$/mg, '').replace(/^export /mg, '');
const head = fs.readFileSync(path.join(DIR, 'head.html'), 'utf8');
const code = [
  strip(fs.readFileSync(path.join(DIR, 'catalog.mjs'), 'utf8')),
  strip(fs.readFileSync(path.join(DIR, 'sim.mjs'), 'utf8')),
  strip(fs.readFileSync(path.join(DIR, 'levels.mjs'), 'utf8')),
  'const HULLS = ' + JSON.stringify(hulls) + ';',
  'const MODELS = ' + JSON.stringify(models) + ';',
  'const TEX = ' + JSON.stringify(tex) + ';',
  fs.readFileSync(path.join(DIR, 'game.js'), 'utf8'),
].join('\n');
fs.writeFileSync(OUT, head.replace('/*GAME*/', () => code));
console.log('wrote', OUT, (fs.statSync(OUT).size / 1e6).toFixed(2), 'MB');
