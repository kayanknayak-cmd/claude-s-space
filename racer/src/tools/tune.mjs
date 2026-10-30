// Handling sweep: for each setting, the best lap of a smooth bot (rarely drifts) and of a drifty bot (high gain).
// Good handling makes the drifty line the faster one, by a few percent, on every track.
// Usage: node tools/tune.mjs '{"DRIFT_GRIP":[2.2,3.5],"BOOST":[8,10]}'
import { buildTrack } from '../track.mjs';
import { K } from '../sim.mjs';
import { TRACKS } from '../tracks.mjs';
import { drive } from './bot.mjs';
const grid = JSON.parse(process.argv[2] || '{}'), keys = Object.keys(grid);
const Ts = TRACKS.map(t => buildTrack(t.str));
const smooth = [[1.6, 12], [2.4, 12], [1.6, 10]], drifty = [[4.5, 8], [6, 6], [6, 9], [8, 7]];
const best = (T, set) => Math.min(...set.map(([k, l]) => drive(T, k, l).time ?? 99));
const combos = keys.reduce((a, k) => a.flatMap(c => grid[k].map(v => ({ ...c, [k]: v }))), [{}]);
for (const c of combos) {
  Object.assign(K, c);
  const r = Ts.map(T => [best(T, smooth), best(T, drifty)]);
  const gain = r.map(([s, d]) => ((s - d) / s * 100).toFixed(1) + '%');
  console.log(JSON.stringify(c), r.map(([s, d]) => `${s.toFixed(2)}/${d.toFixed(2)}`).join('  '), ' drift gain', gain.join(' '));
}
