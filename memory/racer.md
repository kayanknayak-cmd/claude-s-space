# Racer (working name), the fourth game

Started Oct 30. Status: no code yet. Assets verified Oct 30; next step is clarifying questions, then building.

## Decisions so far
- Owner asked for a racing game (Oct 30). Chosen: ghost time trial (short tracks, drift, beat your own and friends'
  ghost cars, challenge links, later a friends leaderboard), cars only.
- Packs: racing-kit (tracks, decor), car-kit (cars), plus the owner's Oct 30 uploads: impact-sounds, city-kit-roads,
  nature-kit, mobile-controls-1 (and unrequested extras: city-kit-commercial, -industrial, -suburban, survival-kit).
  See `assets/kenney/INDEX.md` for every model and sound name.

## Asset findings
- racing-kit GLBs use material colors, no textures; car-kit, city kits use a colormap texture.
- Racing tiles are 1 unit per grid cell, anchored at (-0.35, y, -0.65): subtract that so a tile covers x 0..w,
  z -d..0. Straights run along z; asphalt x 0.155..0.845 (width 0.69), curb to 0.082/0.918, grass edge to 0/1.
- Corners (right turn when entered at (0.5, 0) heading -z): Small center (1,0) r 0.5, exits (1,-0.5) heading +x;
  Large center (2,0) r 1.5 (asphalt r 1.155..1.845), exits (2,-1.5); Larger center (3,0) r 2.5, exits (3,-2.5).
  Entered from the other end, the same tile is a left turn. `roadStart` has the start gantry built in.
- Racing decor: grandStand(Covered), tent(Long), billboard, bannerTower, lightPost, overheadLights, rail,
  barrierWall, fenceCurved, pylon, tree(Large/Small), and *Wall / *Sand variants for corner outsides.
- car-kit cars (race 1.3 wide x 2.56 long, sedan-sports, taxi, hatchback-sports, police, race-future, karts) have
  separate wheel nodes named wheel-front-left etc., so wheels can spin and steer.
- impact-sounds has no engine or tire sounds (impacts and footsteps only): engine and skid stay synthesized;
  impactMetal / impactPlate / impactPunch suit wall hits.
- Measuring tools used: a GLB bounding-box script and a per-material vertex script (rewrite as needed; numpy works).

## Plan (agreed direction, not yet built)
- Source in `racer/src/`, same build pattern as Dinner Rush (embed GLBs, three.js from jsdelivr, no Rapier).
- Tracks are turtle strings of tiles (S, small/large/larger L and R), scaled about 6x, verified to close the loop.
- Car physics trig-free and deterministic: heading as a unit vector rotated with the rational form
  ((1-t^2), 2t)/(1+t^2); auto throttle; steer by horizontal thumb drag (arrows on desktop); drift when steering
  hard at speed, a boost when a long drift ends; walls just past the tile edge.
- Checkpoint lines by dot products, never atan2, so ghosts replay identically everywhere.
- Ghosts store inputs per step (17 steer levels, run-length coded) for best laps, challenge links (`#g.` hash)
  and a pace-car ghost driven by a deterministic bot. Show split deltas against the best ghost at checkpoints.
- Feel: synthesized engine and tire squeal, Impact Sounds for hits; skid marks, smoke, boost flames, chase camera.
