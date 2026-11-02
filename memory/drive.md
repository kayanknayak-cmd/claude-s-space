# Sunday Drive, the open-world driving game (replaces Ghost Lap)

Built Oct 31 from the owner's answers: "mini Forza Horizon, but you can always just chill", "huuuge map, use
everything", computer first (keyboard, gamepad), arcade drift handling. Published:
https://claude.ai/artifact/23nQtNRt6EDqaG6QzQrbsP (db + user capabilities, see Publish). No owner feedback yet.

## Owner feedback and next direction (Nov 2)
- Owner: "it's looking freaking awesome". Next: make it more like War Thunder / Forza. Answers: from War Thunder,
  better graphics and sound effects plus a damage model (no tanks, no planes, no research tree); from Forza,
  weightier handling, upgrades and tuning, credits and progression; opponents are AI bots; visuals more realistic.
- Build order: tire/weight physics, damage, AI racers, credits/upgrades/tuning, graphics pass, sound pass.

## What it is
- A 2.9 km island (240 x 240 road tiles of 12 m): downtown towers, suburbs with cul-de-sacs, a park, industrial docks
  with ships, farms with corn rows, windmills and a railway, forests, mountains with a pass road, beaches, a river
  the roads bridge, and the race circuit (racing-kit tiles, 18 m each). Districts are drawn by hand in `MAP` in
  world.mjs (15 x 15 letters, 192 m each); borders wander with noise.
- Controls: W/S gas, brake, reverse; A/D steer (eases in over ~0.3 s, less lock at speed); Space handbrake drift;
  Shift boost (meter fills by drifting and airtime); R back to the road (or the last gate); E start a race in its
  ring; C camera distance; M map (click a found event to drive there); G garage; H help; Esc leave. Gamepad: stick,
  triggers, A handbrake, B boost, Y reset. Phones: left-thumb steer pad, Mobile Controls buttons, auto gas.
- Activities: 7 races (Downtown Dash, Mountain Pass, Coast Road, Ring Road, Farm Lanes, Dockside, Grand Prix
  2 laps) with gates, splits against your best ghost, results, friends board (tap a row to race that ghost) and
  challenge links `#e.<event>.<car>.<inputs>`; 5 speed traps, 3 drift zones, 5 ramps that measure jumps; 30 gold
  stone heads (every 2 unlock a car; 5 cars at start, 17 total); discovery fog on the map; knock-over fences,
  street lights, cones and barriers; a train shuttling on the southern railway (shoves you in free roam only).
- Look: no tone mapping (ACES washed Kenney's palette out), Lambert materials, sky dome following the camera,
  sun shadows snapped to shadow texels (no shimmer), shadows only from chunks within 230 m, fog 240 to 860 m.

## Code (`drive/src/`, built `drive/drive.html`, about 3.5 MB)
- `world.mjs`: deterministic world (only + - * / sqrt floor, integer hash): MAP, roads (town grid every 12 tiles,
  downtown every 6, cul-de-sacs, ring, country roads as axis-aligned waypoint legs that may cross water as
  causeways), tile kinds/rotations, lots (buildings face their street; model fronts are +z), nature, heightfield
  (6 m grid), river, ramps, collider grid (24 m buckets), `groundAt()` (roads are always y 0), spawn.
- `car.mjs`: physics at 120 Hz, input sampled every 4 steps, packed into 408 codes (2 letters + base-36 run
  length). Per-car stats in `CARS`. Collisions: two circles vs boxes/circles, bounce and nose alignment. Water
  respawns. `replay()`.
- `events.mjs`: routes by BFS over road tiles (waypoints snap to the nearest road), gates every 7 tiles as lines
  across the road (crossing within 18 m counts), `runGates()` shared by play and verification, heads.
- `scene.js` (renderer, sky, terrain chunks with vertex colours, instanced chunks of 16 x 16 tiles),
  `play.js` (car model with wheel pivots at measured hub centres, sound, particles, skids, props, train, input,
  events, physics loop, camera), `ui.js` (HUD, minimap and map drawn from one canvas, garage, results,
  leaderboard, links, help, touch), `main.js` (frame loop, start, test hooks on `window.__drive`).
- `build.mjs`: reads models/sounds/icons from `assets/kenney/*.zip`, compresses every GLB with glTF-Transform
  (dedup, weld, prune keepSolidTextures, quantize, meshopt) 12.8 MB -> 2.2 MB; textures attached at load.
  Needs `cd drive/src && npm i` (glTF-Transform 4.1.1, meshoptimizer 0.22.0).
- Tools: `tools/mapimg.mjs out.png` (top-down island with events), `tools/bot.mjs [event] [car]` (drives races,
  checks replays), `tools/peek.mjs out.png zip dir names...` (top-down or FRONT=1 renders of models),
  `tools/shot.mjs '<plan json>'` (headless screenshots; `?lite` unless FULL=1; TOUCH=1 phone; hooks begin/go/toGate).

## Gotchas found building it
- Compressed GLBs store positions as normalized ints: convert to float before `applyMatrix4` (floatGeo) or
  geometry clips at +-1 (rails stood on end, buildings were distorted).
- glTF-Transform `prune()` bakes 1x1 textures into the colour factor unless `keepSolidTextures: true` (everything
  turned red). The 1x1 stand-in keeps the UV transform; kit colormaps copy its offset/repeat.
- Headless Chromium is software GL: ~2 fps at full settings, so physics time runs slow (dt capped at 1/20 s);
  use the `go()` and `toGate()` hooks instead of waiting.
- The test bot is crude: Farm Lanes, Dockside and the Grand Prix fail for the bot (corner clipping), while walking
  each route exactly passes every gate. Real players are the real test.

## Ideas not built
- Traffic cars; day/night; real engine audio (no pack has engines); more events; photo mode; garage paint.
