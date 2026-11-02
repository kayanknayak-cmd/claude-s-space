# Sunday Drive, the open-world driving game (replaces Ghost Lap)

Built Oct 31 from the owner's answers: "mini Forza Horizon, but you can always just chill", "huuuge map, use
everything", computer first (keyboard, gamepad), arcade drift handling. Published:
https://claude.ai/artifact/23nQtNRt6EDqaG6QzQrbsP (db + user capabilities; omit `capabilities` on republish).

## Owner feedback and direction
- Nov 2: "it's looking freaking awesome". Then: make it more like War Thunder / Forza. From War Thunder: better
  graphics and sound, a damage model (no tanks, planes or research tree). From Forza: weightier handling, upgrades
  and tuning, credits and progression. Opponents: AI bots. Visuals: more realistic.
- Nov 2 build (all done, awaiting feedback): tyre/weight physics, damage, AI races, credits/garage/upgrades/tuning,
  visible damage, graphics pass. Sound got a new engine graph and crash samples but no dedicated sound pass yet.

## What it is
- A 2.9 km island (240 x 240 road tiles of 12 m): downtown, suburbs, park, industrial docks with ships, farms,
  windmills, a railway, forests, a mountain pass, beaches, a river, the race circuit. Districts are drawn by hand in
  `MAP` in world.mjs (15 x 15 letters, 192 m each). Guard rails line roads that run beside deep water.
- Controls: W/S gas, brake, reverse (only from near stop); A/D steer; Space handbrake; Shift boost; R back to the
  road or last gate (a stalled engine gets towed: revived, engine damage capped at 50%); E start an event; C camera;
  M map; G garage; H help (also holds the Graphics setting); Esc leave. Gamepad and phone controls exist.
- Events: 7 races vs 5 AI bots picked by performance index (Downtown, Mountain Pass, Coast, Ring, Farms, Docks,
  Grand Prix 3 passes); player starts at the back of a forward grid. Speed traps, drift zones, jumps and 30 stone
  heads pay credits (trap (kmh-80)*15, drift score*1.5, jump m*15, head 3000).
- Progression: start 5,000 CR, 5 free cars (sedan-sports, hatchback-sports, sedan, taxi, kart). Race prize =
  length/1000*3000*place factor, +500 for a personal best. XP gives driver level. Garage: buy cars, 7 upgrade
  lines (`UPGRADES` in car.mjs), tuning sliders (final drive, balance, brake bias, assists), repair.
- Leaderboard rows v:2 {time, place, inputs, car, setup, splits}, verified by replaying the whole race;
  challenge links `#e.<event>.<car>.<setup11>.<inputs>`.

## Physics and AI (`car.mjs`, `ai.mjs`, `race.mjs`)
- 120 Hz deterministic (only + - * / sqrt floor; rational rotation), inputs every 4 steps, 408 codes, RLE.
- Tyres: peak-then-slide curve, load transfer, friction circle; ABS caps braking at 80% of grip, TC at 90% (without
  them the rear had no lateral grip under braking and AI spun). Steering lock limited by grip
  (mu*g*L*1.3/(u^2+1)). Torque curve, auto gearbox, stall. Classes D/C/B/A/S/X from `perfIndex` (cbrt top speed).
- Damage zones front/rear/left/right/engine: crash damage = (vn-6)^1.5 * .0045 * sqrt(m/1400) above 6 m/s;
  engine damage cuts power, side damage pulls steering. Visible dents, car-kit debris, smoke and fire, glass sounds.
- AI: route smoothed with 6 m arcs, curvature speed limits, 300 m braking plan with hysteresis, pure pursuit,
  traffic avoidance (lane offset + speed cap), stuck reset by input so replays stay valid.
- `tools/racetest.mjs` runs full races and replay checks; the player bot (no avoidance) still DNFs some routes.

## Look (graphics pass, Nov 2)
- ACES tone mapping at exposure .7 plus a grade pass (sat 1.15, contrast 1.06, warm, vignette). The Oct 31 note
  "ACES washed out Kenney's palette" was true without IBL and the grade; with them it works.
- Preetham sky + PMREM environment (intensity .5; at .9 with a blue hemisphere light the town went navy),
  warm hemisphere light, sun 3.4, FogExp2 .0008, sprite clouds, MeshStandard world, clearcoat MeshPhysical cars,
  normal-mapped water (#175a80, rough .16, envMapIntensity .55; rougher/darker stops the milky white look).
- Quality: auto (high) steps down to medium (no GTAO) then low (no post, Lambert, pixel ratio 1) after 4 slow
  seconds; Low sets exposure 1 because Lambert gets no environment light. Stored in localStorage `sundaydrive.gfx`.

## Code (`drive/src/`, built `drive/drive.html`, about 3.6 MB)
- `world.mjs` (deterministic island, colliders, `groundAt`), `car.mjs`, `events.mjs` (BFS routes, gates on
  straight tiles, crossing within 18 m or 9 m radius), `ai.mjs`, `race.mjs`, `scene.js` (renderer, sky, post,
  terrain, water, instanced chunks), `play.js` (car model, sound, particles, props, train, races, credits, damage
  visuals), `ui.js` (HUD, map, garage, results, leaderboard, links, help, touch), `main.js` (loop, test hooks
  `window.__drive`: begin, go, toGate, crash, cam).
- `build.mjs`: GLBs compressed with glTF-Transform (needs `cd drive/src && npm i`).
- Tools: `tools/shot.mjs '<plan>'` (screenshots, `?lite` unless FULL=1; `{"eval":"__drive.begin(\"coast\")"}` gives
  a race grid shot), `tools/bot.mjs`, `tools/racetest.mjs`, `tools/mapimg.mjs`, `tools/peek.mjs`.

## Gotchas
- Compressed GLBs store positions as normalized ints: `floatGeo` before `applyMatrix4`.
- `prune()` needs `keepSolidTextures: true` or 1x1 textures bake into colour.
- Headless Chromium is software GL (~1.5 fps full): use hooks instead of waiting. Setting car x/z without y in a
  shot puts the camera under the terrain.
- Engine sound must not read removed fields: a NaN in the audio graph broke the frame loop once.

## Ideas not built
- Free-roam traffic cars; day/night; dedicated sound pass (no pack has engine recordings); photo mode; paint.
