# Slingshot (phone) sources

- `phone-head.html` + `phone-script.js` (+ `toy.css` for Bonk): both games. `build2.js` inlines `phys.js` and the levels and writes
  `../slingshot-phone.html` (night) and `../bonk.html` (toy).
- `phys.js`: the shared step physics (gravity, black holes, moving bodies). The game inlines it; the Node tools require it.
- `lab.js`: the hand-made campaign. Each level's bodies and idea are written by hand in `SPECS`; the lab flies a fan of throws,
  maps where looping flights come back to, and places the targets there, measuring the share of winning throws and how many of
  those wins went round at least once. `node lab.js <first|binary|waltz|moons|horizon>` writes `hand-<world>.json`.
- `dailylab.js`: the same lab on random skies, for Today's sky (`daily-lab-<seed>.json`); `dailyfilter.js` keeps the generous older ones.
- `daily-v4.json`: the frozen order of Today's sky. New layouts only join the end (`FREEZE=1 node build2.js`).
- `check.js`: re-verifies that every level's stored hint clears it (`node check.js worlds.json`).
- `gen5.js`: the older random generator, kept for reference.

- `tools/`: headless tests (`smoke.js [bonk]`, `bonkfeat.js`, `bkreel.js`).

To rebuild, copy the scripts, `phone-head.html`, `toy.css` and `levels/*.json` into one folder and run `node build2.js` there.
See `../CLAUDE.md` for the full workflow and project memory.
