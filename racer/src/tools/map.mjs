// Prints a track as a grid of piece numbers and checks it closes without overlaps. Usage: node tools/map.mjs "G S R2 ..."
import { parseTrack, buildTrack, cells } from '../track.mjs';
const str = process.argv[2];
const { closed, end, pieces } = parseTrack(str);
const T = buildTrack(str), C = cells(T);
const ks = [...C.keys()].map(k => k.split(',').map(Number));
const xs = ks.map(k => k[0]), zs = ks.map(k => k[1]);
let over = 0, rows = [];
for (let j = Math.min(...zs); j <= Math.max(...zs); j++) {
  let r = '';
  for (let i = Math.min(...xs); i <= Math.max(...xs); i++) { const v = C.get(i + ',' + j); if (v && v.length > 1) over++; r += !v ? ' .' : v.length > 1 ? ' X' : (v[0] % 36).toString(36).padStart(2); }
  rows.push(r);
}
console.log(rows.join('\n'));
console.log(`closed ${closed} end ${end} pieces ${pieces.length} overlaps ${over} length ${(T.length).toFixed(0)}u (${(T.length / 8).toFixed(1)} tiles) size ${Math.max(...xs) - Math.min(...xs) + 1}x${Math.max(...zs) - Math.min(...zs) + 1}`);
