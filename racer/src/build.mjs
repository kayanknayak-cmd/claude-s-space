// Builds ../racer.html: head.html + track/sim/tracks/pace + game.js, with Kenney models, sounds and icons read
// straight from the zips in assets/kenney (needs the `unzip` command). Usage: node build.mjs
import fs from 'fs';
import path from 'path';
import { execFileSync } from 'child_process';
import { fileURLToPath } from 'url';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const ZIPS = path.join(DIR, '..', '..', 'assets', 'kenney');
const OUT = path.join(DIR, '..', 'racer.html');
const unzip = (zip, file) => execFileSync('unzip', ['-p', path.join(ZIPS, zip), file], { maxBuffer: 1 << 26 });

const RK = ['kenney_racing-kit.zip', 'Models/GLTF format/'], CK = ['kenney_car-kit.zip', 'Models/GLB format/'];
const NK = ['kenney_nature-kit.zip', 'Models/GLTF format/'];
// key: [kit, file]. Racing-kit and nature-kit models are untextured; car-kit models use one colormap.
const MODELS = {
  start: [RK, 'roadStart'], straight: [RK, 'roadStraight'],
  corner1: [RK, 'roadCornerSmall'], corner2: [RK, 'roadCornerLarge'], corner3: [RK, 'roadCornerLarger'],
  barrierRed: [RK, 'barrierRed'], barrierWhite: [RK, 'barrierWhite'], pylon: [RK, 'pylon'],
  stand: [RK, 'grandStandCovered'], standOpen: [RK, 'grandStand'], tent: [RK, 'tentLong'], billboard: [RK, 'billboard'],
  bannerRed: [RK, 'bannerTowerRed'], bannerGreen: [RK, 'bannerTowerGreen'], lightPost: [RK, 'lightPostLarge'],
  garage: [RK, 'pitsGarage'], flag: [RK, 'flagCheckers'], radar: [RK, 'radarEquipment'],
  race: [CK, 'race'], taxi: [CK, 'taxi'], police: [CK, 'police'], sports: [CK, 'sedan-sports'],
  treeA: [NK, 'tree_default'], treeB: [NK, 'tree_oak'], treeC: [NK, 'tree_cone'], treeD: [NK, 'tree_fat'],
  treeE: [NK, 'tree_detailed'], bush: [NK, 'plant_bushLarge'], rock: [NK, 'rock_largeA'],
};
const SOUNDS = {
  wallHard: 'impactPlate_heavy_000', wallSoft: 'impactPlate_medium_001', clank: 'impactMetal_heavy_002',
  bell: 'impactBell_heavy_000', tap: 'impactGeneric_light_000', thump: 'impactSoft_medium_000',
};
const ICONS = {
  pad: 'Vector/Style C/joystick_circle_pad_a.svg', nub: 'Vector/Style C/joystick_circle_nub_a.svg',
  restart: 'Vector/Icons/icon_arrow_rotate.svg', menu: 'Vector/Icons/icon_menu.svg', play: 'Vector/Icons/icon_play.svg',
  wheel: 'Vector/Icons/icon_steering_wheel.svg', check: 'Vector/Icons/icon_checkmark.svg',
};

function glb(buf, texName) {
  const jlen = buf.readUInt32LE(12), json = JSON.parse(buf.subarray(20, 20 + jlen).toString('utf8'));
  if (!json.images) return buf;
  for (const im of json.images) im.uri = texName;
  let js = Buffer.from(JSON.stringify(json));
  js = Buffer.concat([js, Buffer.alloc((4 - js.length % 4) % 4, 0x20)]);
  const rest = buf.subarray(20 + jlen), h = Buffer.alloc(20);
  h.write('glTF', 0); h.writeUInt32LE(2, 4); h.writeUInt32LE(20 + js.length + rest.length, 8);
  h.writeUInt32LE(js.length, 12); h.writeUInt32LE(0x4E4F534A, 16);
  return Buffer.concat([h, js, rest]);
}

const models = {};
for (const [k, [[zip, dir], file]] of Object.entries(MODELS)) models[k] = glb(unzip(zip, dir + file + '.glb'), 'tex-car.png').toString('base64');
const tex = { 'tex-car.png': unzip(CK[0], CK[1] + 'Textures/colormap.png').toString('base64') };
const sounds = {};
for (const [k, f] of Object.entries(SOUNDS)) sounds[k] = unzip('kenney_impact-sounds.zip', 'Audio/' + f + '.ogg').toString('base64');
const icons = {};
for (const [k, f] of Object.entries(ICONS)) icons[k] = 'data:image/svg+xml;base64,' + unzip('mobile-controls-1.zip', f).toString('base64');
const pace = JSON.parse(fs.readFileSync(path.join(DIR, 'pace.json'), 'utf8'));

const strip = s => s.replace(/^import .*$/mg, '').replace(/^export /mg, '');
const code = [
  ...['track.mjs', 'sim.mjs', 'tracks.mjs'].map(f => strip(fs.readFileSync(path.join(DIR, f), 'utf8'))),
  'const PACE = ' + JSON.stringify(pace) + ';',
  'const MODELS = ' + JSON.stringify(models) + ';',
  'const TEX = ' + JSON.stringify(tex) + ';',
  'const SOUNDS = ' + JSON.stringify(sounds) + ';',
  'const ICONS = ' + JSON.stringify(icons) + ';',
  fs.readFileSync(path.join(DIR, 'game.js'), 'utf8'),
].join('\n');
const head = fs.readFileSync(path.join(DIR, 'head.html'), 'utf8');
fs.writeFileSync(OUT, head.replace('/*GAME*/', () => code).replace(/ICON_(\w+)/g, (m, k) => icons[k] || m));
console.log('wrote', OUT, (fs.statSync(OUT).size / 1e6).toFixed(2), 'MB');
