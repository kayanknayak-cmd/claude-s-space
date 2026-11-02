// Builds ../drive.html: head.html + the world, car and event modules + scene, play, ui and main, with every Kenney
// model, texture, sound and icon read straight from the zips in assets/kenney (needs `unzip`). Usage: node build.mjs
import fs from 'fs';
import path from 'path';
import { execFileSync } from 'child_process';
import { fileURLToPath } from 'url';
import { CATALOG } from './catalog.mjs';
import { NodeIO } from '@gltf-transform/core';
import { EXTMeshoptCompression, KHRMeshQuantization, ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, weld, quantize, prune } from '@gltf-transform/functions';
import { MeshoptEncoder } from 'meshoptimizer';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const ZIPS = path.join(DIR, '..', '..', 'assets', 'kenney'), OUT = path.join(DIR, '..', 'drive.html');
const unzip = (zip, file) => execFileSync('unzip', ['-p', path.join(ZIPS, zip), file], { maxBuffer: 1 << 27 });
const SOUNDS = { crash: 'impactPlate_heavy_000', bump: 'impactPlate_medium_001', metal: 'impactMetal_heavy_002', land: 'impactSoft_heavy_001',
  soft: 'impactSoft_medium_000', wood: 'impactPlank_medium_000', bell: 'impactBell_heavy_000' };
const ICONS = { pad: 'Style C/joystick_circle_pad_a', nub: 'Style C/joystick_circle_nub_a', button: 'Style C/button_circle',
  brake: 'Icons/icon_pedal_brake', drift: 'Icons/icon_arrow_curved', boost: 'Icons/icon_fire', reset: 'Icons/icon_arrow_rotate' };

// textures: each kit's colormap, referenced from its models as tex-<n>.png
const texIds = new Map(), TEX = {};
function texFor(zip, file) {
  const dir = path.dirname(file) + '/Textures/colormap.png';
  const key = zip + dir;
  if (!texIds.has(key)) {
    let buf = null; try { buf = unzip(zip, dir); } catch {}
    texIds.set(key, buf && buf.length ? 'tex-' + texIds.size + '.png' : null);
    if (buf && buf.length) TEX[texIds.get(key)] = buf.toString('base64');
  }
  return texIds.get(key);
}
function glb(buf, tex) {
  const jlen = buf.readUInt32LE(12), json = JSON.parse(buf.subarray(20, 20 + jlen).toString('utf8'));
  if (!json.images) return buf;
  for (const im of json.images) im.uri = tex || 'missing.png';
  let js = Buffer.from(JSON.stringify(json)); js = Buffer.concat([js, Buffer.alloc((4 - js.length % 4) % 4, 0x20)]);
  const rest = buf.subarray(20 + jlen), h = Buffer.alloc(20);
  h.write('glTF', 0); h.writeUInt32LE(2, 4); h.writeUInt32LE(20 + js.length + rest.length, 8); h.writeUInt32LE(js.length, 12); h.writeUInt32LE(0x4E4F534A, 16);
  return Buffer.concat([h, js, rest]);
}
// shrink each model: merge duplicate vertices, quantize attributes, then meshopt-compress the buffers
await MeshoptEncoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder });
async function squeeze(buf) {
  const doc = await io.readBinary(new Uint8Array(buf));
  // the 1x1 stand-in texture stays, so prune keeps the UVs; the real colormap is attached at load
  await doc.transform(dedup(), weld(), prune({ keepSolidTextures: true }), quantize({ quantizePosition: 14, quantizeNormal: 8, quantizeTexcoord: 12 }));
  doc.createExtension(EXTMeshoptCompression).setRequired(true).setEncoderOptions({ method: EXTMeshoptCompression.EncoderMethod.QUANTIZE });
  return Buffer.from(await io.writeBinary(doc));
}
// a 1x1 stand-in for the external colormap so the compressor can read the file
const DOT = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
const models = {};
let raw = 0, small = 0;
for (const [k, [zip, file]] of Object.entries(CATALOG)) {
  const src = unzip(zip, file), tex = texFor(zip, file), out = await squeeze(glb(src, DOT));
  raw += src.length; small += out.length;
  models[k] = { b: out.toString('base64'), tex };
}
console.log('models', (raw / 1e6).toFixed(2), 'MB ->', (small / 1e6).toFixed(2), 'MB');
const sounds = {};
for (const [k, f] of Object.entries(SOUNDS)) sounds[k] = unzip('kenney_impact-sounds.zip', 'Audio/' + f + '.ogg').toString('base64');
const icons = {};
for (const [k, f] of Object.entries(ICONS)) icons[k] = 'data:image/svg+xml;base64,' + unzip('mobile-controls-1.zip', 'Vector/' + f + '.svg').toString('base64');

const strip = s => s.replace(/^import .*$/mg, '').replace(/^export /mg, '');
const read = f => fs.readFileSync(path.join(DIR, f), 'utf8');
const code = [
  "import * as THREE from 'three';\nimport { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';\nimport { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';",
  ...['world.mjs', 'car.mjs', 'events.mjs', 'ai.mjs', 'race.mjs'].map(f => strip(read(f))),
  'const MODELS = ' + JSON.stringify(models) + ';',
  'const TEX = ' + JSON.stringify(TEX) + ';',
  'const SOUNDS = ' + JSON.stringify(sounds) + ';',
  ...['scene.js', 'play.js', 'ui.js', 'main.js'].map(read),
].join('\n');
const html = read('head.html').replace('/*GAME*/', () => code).replace(/ICON_(\w+)/g, (m, k) => icons[k] || m);
fs.writeFileSync(OUT, html);
console.log('wrote', OUT, (fs.statSync(OUT).size / 1e6).toFixed(2), 'MB;', Object.keys(models).length, 'models,', Object.keys(TEX).length, 'textures');
