// Fill {a} {b} ... with straight counts 0..7 so the track closes without overlaps; prefer short longest straights.
import { parseTrack, buildTrack, cells } from '../track.mjs';
const tpl = process.argv[2], lo = +(process.argv[3] || 40), hi = +(process.argv[4] || 70), names = [...new Set(tpl.match(/\{\w\}/g))];
const found = [];
const rec = (k, vals) => {
  if (k === names.length) {
    let s = tpl; names.forEach((n, i) => s = s.split(n).join(' S'.repeat(vals[i])));
    s = s.replace(/\s+/g, ' ').trim();
    if (!parseTrack(s).closed) return;
    const T = buildTrack(s), L = T.length / 8;
    if (L < lo || L > hi || [...cells(T).values()].some(v => v.length > 1)) return;
    found.push({ s, L, run: Math.max(...vals) });
    return;
  }
  for (let v = 0; v <= 7; v++) rec(k + 1, [...vals, v]);
};
rec(0, []);
found.sort((a, b) => a.run - b.run || b.L - a.L);
console.log(found.slice(0, 4).map(f => `${f.s}   [${f.L.toFixed(0)} tiles, longest ${f.run}]`).join('\n') || 'none');
