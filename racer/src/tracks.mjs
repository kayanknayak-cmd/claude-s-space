// The circuits, as turtle strings of racing-kit tiles (see track.mjs), roughly easiest first. Designed with
// tools/fit.mjs (fills straight counts so a template closes without overlaps) and checked with tools/map.mjs.
// id is what links and the leaderboard use, so names and order can change. The pace car's laps live in pace.json, written by tools/pace.mjs.
export const TRACKS = [
  { id: 'warmup', name: 'Warm Up', str: 'G S S S S S S S R2 S S S S S S S R3 L1 R1 S S S S R2 L2 R2 S S S S S S R2' },
  { id: 'sweepers', name: 'Sweepers', str: 'G S S S S S S R3 S S S S S S R3 R3 L2 S S S S S R2 S S S R3' },
  { id: 'esses', name: 'Esses', str: 'G L2 R2 S S S R2 R2 L2 S S S S S R2 S S S S S S R1 S S S S S S R2' },
  { id: 'kink', name: 'Kink', str: 'G S S S S S R2 L1 R1 S S S S S R3 L2 R2 S S S R1 S S S S L1 R2 S S S S S R2' },
  { id: 'paperclip', name: 'Paperclip', str: 'G S S S S S S R3 S S S S S S R1 R1 L2 S L1 R1 S S S S S S R2 S S S S S R2' },
  { id: 'longway', name: 'Long Way', str: 'G R3 S S S S S S L1 R1 S S S S S S R3 S S S S S S R2 S S S S S S R2 L2 S S S S S S R2' },
  { id: 'hairpins', name: 'Hairpins', str: 'G S S S S S R1 R1 S S S S S L2 S S S L2 S S S R1 R1 S S S S S R2 S S S S S R2' },
];
