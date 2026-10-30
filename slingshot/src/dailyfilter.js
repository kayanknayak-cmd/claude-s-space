// keep the generated daily layouts that are generous under the hand-made levels' own measure
const { measure, exact } = require('./lab.js'), fs = require('fs');
const pool = JSON.parse(fs.readFileSync('daily-pool.json', 'utf8')), keep = [];
for (const L of pool) {
  const E = exact(L), m = measure(E, 24, 6, 36, E.bodies.some(b => b.orbit) ? [0, 2.2] : [0]);
  if (m.win >= 0.025 && m.loop >= 0.25) keep.push({ ...L, win: +m.win.toFixed(3) });
}
fs.writeFileSync('daily-good.json', JSON.stringify(keep));
console.log('daily kept', keep.length, 'of', pool.length);
