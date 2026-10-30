# Ghost Lap (the racer), the fourth game

Started and first published Oct 30: https://claude.ai/artifact/UTCuSjqjdAevcyj4EPAz9T
Status: playable, 7 tracks, friends leaderboard. No owner play feedback yet.

## Decisions
- Owner asked for a racing game (Oct 30). Chosen: ghost time trial, cars only, race circuit setting, low chase
  camera, thumb drag plus tilt steering. Packs: racing-kit, car-kit, nature-kit, impact-sounds, mobile-controls-1.
- Tilt: the artifact sandbox refuses device motion and the account has no motion capability (checked Oct 30). The
  menu shows "Tilt to steer" only where DeviceOrientationEvent exists; it turns on only if events arrive within
  1.5 s, else a toast says it isn't available. In the published artifact it will not work; the owner was told.
- Name "Ghost Lap" chosen by Claude (owner hasn't commented).

## How it plays
- Auto throttle. Thumb drag anywhere: horizontal offset from the touch point steers (Kenney Mobile Controls Style C
  pad and nub appear under the thumb; past full lock the pad follows the thumb). Arrows / A D on desktop, R restarts.
- Steering hard (level 7 or 8 of 8) above speed 11 starts a drift; holding it 0.35 s charges a blue boost, 0.9 s an
  orange one; releasing fires it. One-time toast explains it on the first drift.
- Countdown lights (3 red, then green), lap timer, split deltas (green ahead / red behind) at 1/4, 1/2, 3/4 of the
  lap against your best (or the newest ghost).
- Ghosts: pace car (yellow taxi, a bot lap), your best (blue race car), a friend (pink police car, from a challenge
  link or a leaderboard row). Ghosts fade when close so they never hide the road.
- Finish: the car coasts, camera swings behind and rises, card with time, deltas vs best / friend / pace, a
  "New best" stamp, friends board (top 5; tap a row to race that ghost), Retry, Challenge a friend, Next.
- Challenge link: `RACER_URL#g.<track id>.<steering RLE>`; the receiver replays it to get the time (can't be faked).

## Code (`racer/src/`, built `racer/racer.html`)
- `track.mjs`: turtle strings of racing-kit tiles -> pieces (G start, S straight, R1-3/L1-3 corners), SCALE 8,
  WALL .56, `locate()` gives lateral offset and track direction, `cells()` grid footprint, `centerline()` (trig,
  only for bot and decor).
- `sim.mjs`: deterministic car (only + - * / sqrt; rational rotation). DT 1/120, steering sampled every 4 steps.
  Constants in `K` (TURN 2.5, BOOST 9, DRIFT_GRIP 4, DRIFT_TURN 1.45, SCRUB .03, B1 .8, B2 1.4, T1 .35, T2 .9),
  VMAX 22. Walls bounce, cost speed, and turn the nose 12% toward the track direction (so you never stay pinned).
  `encodeInputs`/`decodeInputs` (A..Q for -8..8, base-36 run lengths), `replay()`.
- `tracks.mjs`: 7 tracks with stable ids (warmup, sweepers, esses, kink, paperclip, longway, hairpins).
- `pace.json`: pace-car laps, written by `tools/pace.mjs 2.4 8` (rerun after any physics or track change).
- `game.js`: three.js scene, tiles (racing-kit tile anchor (-.35, -.65); left corners use the right-corner tile
  entered from its exit), instanced red/white barriers (skipped where another piece's tile is), paddock
  (grandstands one side of the start, garages/tents the other), nature-kit trees on free cells (deterministic hash),
  gantry fades as the camera passes under it, skid marks (instanced ring), smoke/boost/sparks sprites, engine and tire
  squeal synthesized, Impact Sounds samples for walls/finish/UI, localStorage `ghostlap.v1`, leaderboard.
- `build.mjs`: reads models, sounds and SVG icons straight from the zips in `assets/kenney/` (needs `unzip`).
- Tools: `tools/fit.mjs "G {a} R2 {b} ..." min max` fills straight counts so a template closes without overlaps
  (net turning must be four more rights than lefts); `tools/map.mjs "<track>"` prints the grid; `tools/bot.mjs`
  pure-pursuit driver; `tools/pace.mjs`; `tools/tune.mjs '{"K":[...]}'` compares smooth vs drifty bots;
  `tools/shot.mjs track w h times...` plays the pace lap in headless Chromium and screenshots (MANUAL=1 no input,
  HASH=#g... to test links). The page exposes `window.__race` (setTrack, reset, auto, paceOf, cam) for tests.
- Leaderboard: db `laps/<user id>` = { t: { <track id>: { time, inputs } } }; rules `laps` read view / write owner,
  `laps/{self}` read view / write interact; user capability with profile scope for names.
- Publish: `racer/racer.html` to the url above with capabilities
  `{"db":{"rules":[{"path":"laps","read":"view","write":"owner"},{"path":"laps/{self}","read":"view","write":"interact"}]},"user":{"scopes":["profile"]}}`
  (omit capabilities on later redeploys to keep them).

## Tuning findings
- First handling made smooth driving 2% faster than drifting; boosts never charged. Fix: lower drift scrub, more
  drift grip, short charge (0.35 s) and longer boosts. Now drifty bots beat smooth bots by 2.5 to 7%.
- Snaking (zig-zag drifting on straights) doesn't pay: full-lock wiggles hit the barriers.
- A head-on crash once pinned the car for 2+ s; fixed with minimum steering at low speed and wall nose alignment.
- Pace laps 15.3 to 19.8 s; skilled drifting beats them by about 0.6 to 0.8 s.
- Headless Chromium and Node give identical lap times for the same inputs.

## Ideas not built
- Ramps/bridges (racing-kit roadRamp, bridges) would need height in the physics.
- City Kit Roads track set (a second world), car picker (sedan-sports, kart), daily track, replay camera.
- Real engine sound would need an audio pack with engines (Impact Sounds has none).
