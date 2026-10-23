const fs = require('fs');
const DT = 1 / 600;
const read = f => fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : [];
// rock piles chosen by place.js, keyed by layout; none on the first build
const PILES = {}; // rubble was tried and taken out: it knocked looping comets off their orbits
const withPiles = L => { const p = PILES[JSON.stringify([L.launch, L.targets])]; return p ? { ...L, piles: p } : L; };
// moons advance by an exact rotation each step; these constants make that identical on every device
const exact = L => ({ ...L, bodies: L.bodies.map(b => b.orbit ? { ...b, orbit: { ...b.orbit,
  ox: b.orbit.R * Math.cos(b.orbit.phase), oy: b.orbit.R * Math.sin(b.orbit.phase),
  c: Math.cos(2 * Math.PI * DT / b.orbit.period), s: Math.sin(2 * Math.PI * DT / b.orbit.period) } } : b) });
const names = {
  first: ['Perihelion', 'Drift', 'Halo', 'Sunward', 'Gentle arc', 'Long fall', 'Aphelion', 'Ember', 'Slow burn', 'Undertow'],
  binary: ['Duet', 'Crossfire', 'Lagrange', 'Seesaw', 'Saddle', 'Tidal', 'Mirror', 'Pivot', 'Eclipse', 'Twin spiral', 'Figure eight', 'Gemini'],
  waltz: ['Barycenter', 'Minuet', 'Do-si-do', 'Pas de deux', 'Roche', 'Promenade', 'Tango', 'Contra', 'Allemande', 'Gavotte', 'Reel', 'Last dance'],
  moons: ['Moonrise', 'Tug', 'Tidewater', 'Perigee', 'Rendezvous', 'Swing-by', 'Capture', 'Shepherd', 'Moonlit', 'Syzygy', 'Lunation', 'Apsis'],
  crowd: ['Cluster', 'Pinball', 'Thicket', 'Constellation', 'Bramble', 'Swarm', 'Lantern', 'Archipelago', 'Maze of suns', 'Orrery', 'Starfield', 'Labyrinth'],
  horizon: ['Shadow', 'Photon ring', 'Einstein ring', 'Precession', 'Zoom-whirl', 'Lensing', 'Perihelion shift', 'Redshift', 'Last stable orbit', 'Escape velocity', 'Event horizon', 'Singularity'],
};
// levels the v5 judge proved need a bent path: no target you can hit by simply aiming at it
const directOk = (j, nT) => { const n = j.direct.filter(d => d < 25).length; return n === 0 || (n === 1 && nT >= 3); };
function sources(w) {
  const v5 = fs.readdirSync('.').filter(f => f.startsWith(`levels5-${w}-`)).flatMap(f => read(f));
  if (w === 'first') { const j = read('j-first.json'); return [...read('levels2-first.json').filter((L, i) => j[i] && directOk(j[i], L.targets.length)), ...v5]; }
  return v5;
}
const spare = [];
function pick(w, n) {
  // favor layouts where long, looping flights win, then order easiest first; the rest feed the daily sky
  const all = sources(w).sort((a, b) => b.longShare - a.longShare);
  spare.push(...all.slice(n));
  return all.slice(0, n).sort((a, b) => a.diff - b.diff)
    .map((L, i) => exact({ name: names[w][i], par: L.par, launch: L.launch, bodies: L.bodies, targets: L.targets, sol: L.sol }));
}
const orig = JSON.parse(fs.readFileSync('originals.json', 'utf8'));
// three of the original hand-made levels still play well with the larger targets
const OS = read('orig-sols.json');
const keep = [{ ...orig.find(l => l.name === 'Bend it'), par: 1, sol: [0.36592, 0.23763] }];
const keep2 = [{ ...orig.find(l => l.name === 'Two suns'), name: 'Binary', par: 1, sol: OS['Two suns'] }, { ...orig.find(l => l.name === 'Figure eight'), name: 'Infinity', par: 1, sol: OS['Figure eight'] }];
// the campaign is hand-made (lab.js): each world easiest first, by the share of throws that win
const hand = w => read(`hand-${w}.json`).sort((a, b) => b.win - a.win)
  .map(L => exact({ name: L.name, par: 1, launch: L.launch, bodies: L.bodies, targets: L.targets, sol: L.sol }));
const WORLDS = [
  { id: 'w1', name: 'First light', theme: { acc: '#9ad7ff', neb: '#d65fae' }, levels: [...keep.map(exact), ...hand('first')] },
  { id: 'w2', name: 'Two suns', theme: { acc: '#ffb48a', neb: '#ff5f9a' }, levels: [...keep2.map(exact), ...hand('binary')] },
  { id: 'w5', name: 'Waltz', theme: { acc: '#ffc4dc', neb: '#7a8cff' }, levels: hand('waltz') },
  { id: 'w3', name: 'Moons', theme: { acc: '#b6a8ff', neb: '#5df2ff' }, levels: hand('moons') },
  { id: 'w6', name: 'Event horizon', theme: { acc: '#ffcf9a', neb: '#8a5cff' }, levels: hand('horizon') },
];
// the daily sky: every spare layout, shuffled by a fixed seed and named for real stars
const STARS = ['Vega', 'Deneb', 'Altair', 'Rigel', 'Sirius', 'Arcturus', 'Capella', 'Procyon', 'Aldebaran', 'Antares', 'Spica', 'Pollux', 'Castor', 'Regulus',
  'Fomalhaut', 'Achernar', 'Canopus', 'Mira', 'Polaris', 'Alnitak', 'Alnilam', 'Mintaka', 'Bellatrix', 'Saiph', 'Algol', 'Mizar', 'Alcor', 'Dubhe', 'Merak',
  'Alioth', 'Thuban', 'Sadr', 'Albireo', 'Hadar', 'Mimosa', 'Acrux', 'Shaula', 'Nunki', 'Alphard', 'Hamal', 'Mirfak', 'Elnath', 'Alhena', 'Wezen', 'Adhara',
  'Naos', 'Avior', 'Atria', 'Enif', 'Scheat', 'Markab', 'Alpheratz', 'Mirach', 'Almach', 'Ankaa', 'Diphda', 'Kochab', 'Pherkad', 'Denebola', 'Algieba',
  'Alkaid', 'Izar', 'Alphecca', 'Sabik', 'Eltanin', 'Errai', 'Schedar', 'Caph', 'Ruchbah', 'Sheratan', 'Alcyone', 'Electra', 'Maia', 'Merope', 'Taygeta',
  'Atlas', 'Pleione', 'Menkalinan', 'Mebsuta', 'Wasat', 'Gomeisa', 'Aludra', 'Furud', 'Betelgeuse', 'Zaurak', 'Rasalgethi', 'Unukalhai', 'Vindemiatrix'];
let seed = 20261022;
const rnd = () => { seed = (seed + 0x6D2B79F5) >>> 0; let t = seed; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
for (let k = spare.length - 1; k > 0; k--) { const j = Math.floor(rnd() * (k + 1)); [spare[k], spare[j]] = [spare[j], spare[k]]; }
// once a day has a level it keeps it: the frozen order lives in daily-pool.json and new layouts only join the end
const key = L => JSON.stringify([L.launch, L.targets]);
// only generated layouts that proved generous (daily-good.json, from dailyfilter.js) make the daily sky
// plus layouts the lab designed from random skies (dailylab.js), interleaved so the kinds of sky alternate
const labbed = [11, 22, 33, 44].map(s => read(`daily-lab-${s}.json`)), mixed = [];
for (let i = 0; labbed.some(a => i < a.length); i++) for (const a of labbed) if (a[i]) mixed.push(a[i]);
const frozen = read('daily-v3.json'), seen = new Set(frozen.map(key));
const daily = [...frozen, ...[...read('daily-good.json'), ...mixed].filter(L => !seen.has(key(L)))];
if (process.env.FREEZE) fs.writeFileSync('daily-v3.json', JSON.stringify(daily));
spare.length = 0; spare.push(...daily);
WORLDS.push({ id: 'd', name: 'Today', daily: true, theme: { acc: '#ffe3a3', neb: '#5d7bff' },
  levels: spare.map((L, i) => exact({ name: STARS[i % STARS.length] + (i >= STARS.length ? ' ' + (1 + Math.floor(i / STARS.length)) : ''), par: L.par, launch: L.launch, bodies: L.bodies, targets: L.targets, sol: L.sol })) });
for (let i = WORLDS.length - 1; i >= 0; i--) if (!WORLDS[i].levels.length) WORLDS.splice(i, 1);
fs.writeFileSync('worlds.json', JSON.stringify(WORLDS));
for (const w of WORLDS) w.levels = w.levels.map(withPiles);
fs.writeFileSync('worlds-piles.json', JSON.stringify(WORLDS));
const head = fs.readFileSync('phone-head.html', 'utf8'), script = fs.readFileSync('phone-script.js', 'utf8');
const phys = fs.readFileSync('phys.js', 'utf8').replace(/\nif \(typeof module[^\n]*\n?$/, '\n');
fs.writeFileSync('/home/user/claude-s-space/slingshot-phone.html', head + script.replace('/*PHYS*/', () => phys).replace('const WORLDS = /*LEVELS*/[];', () => 'const WORLDS = /*LEVELS*/' + JSON.stringify(WORLDS) + ';'));
console.log(WORLDS.map(w => `${w.name}: ${w.levels.length}`).join(', '));
