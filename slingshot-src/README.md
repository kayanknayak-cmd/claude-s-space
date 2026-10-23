# Slingshot (phone) sources

- `phone-head.html` + `phone-script.js`: the game. `build2.js` inserts the levels and writes `../slingshot-phone.html`.
- `gen5.js`: level generator. Runs the game's exact physics, proposes layouts, and keeps only ones a solver proves fair
  (no target you can hit by aiming straight at it, par from a set cover of solver throws, a stored hint throw).
  `node gen5.js <first|binary|waltz|moons|crowd|horizon> <count> <seed> <minutes>` writes `levels5-<world>-<seed>.json`.
- `phys.js`: the shared step physics (gravity, black holes, rubble contacts, comet powers). The game inlines it; `check.js` and `place.js` require it.
- `place.js`: puts rock piles on stable orbits and keeps only those that leave every stored hint working (`piles.json`). `node check.js worlds-piles.json` re-verifies every hint.
- `daily-pool.json`: the frozen order of Today's sky. New layouts only join the end (`FREEZE=1 node build2.js`).

To rebuild, copy `levels/*.json` next to the scripts and run `node build2.js` there (both scripts read and write files in the working directory).
