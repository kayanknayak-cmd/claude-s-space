// Drives each track with the bot (tools/bot.mjs) and writes pace.json: the pace car's steering and lap time.
// Usage: node tools/pace.mjs [k] [look]
import fs from 'fs';
import { buildTrack } from '../track.mjs';
import { encodeInputs, replay } from '../sim.mjs';
import { TRACKS } from '../tracks.mjs';
import { drive } from './bot.mjs';
const K = +(process.argv[2] || 2.4), LOOK = +(process.argv[3] || 8), out = {};
for (const tr of TRACKS) {
  const T = buildTrack(tr.str);
  if (!T.closed) throw new Error(tr.name + ' does not close');
  const r = drive(T, K, LOOK);
  if (r.time === null) { console.log(`${tr.name}: DID NOT FINISH`); continue; }
  const rle = encodeInputs(r.inputs), again = replay(T, r.inputs);
  console.log(`${tr.name}: ${r.time.toFixed(3)} s, ${r.walls} wall hits, ${r.drifts} drifts, ${r.boosts} boosts, replay ${again === r.time ? 'identical' : 'DIFFERENT'}, ${rle.length} chars`);
  out[tr.name] = { time: r.time, inputs: rle };
}
fs.writeFileSync(new URL('../pace.json', import.meta.url), JSON.stringify(out, null, 1));
