# Slingshot and Bonk

Two orbit games built from one source, `slingshot/src/`. Slingshot (night) and Bonk (light, playful).
Status: finished for now. The owner judged both "AI looking" on Oct 29 and moved on to new games; keep them as they are
unless asked.

## Direction (as of Oct 28)
- **Slingshot** (night): Morphogen's Specimen palette, a still, real night sky (jittered stars, Milky Way band).
- **Bonk** (light, playful, 3D-ish, inspired by Totally Accurate Battle Simulator): free to experiment, but only in Bonk.
  Bonk was meant to go viral as a phone game.
- Shared rules for both:
  - Targets are Chladni plates only (Bessel J_n modes); Bonk draws them as drums.
  - The launcher is a spacetime dent, not a slingshot. Gestures stay clear of phone OS edge swipes.
  - No star rating, total score, win lines (lines joining targets), trick labels or par text on screen.
  - Never any moving stars or bodies. Every level is static.
- Controls (both): drag back and release to throw. While a ball flies, hold still (or Space) for 6x speed.
  Double tap rewinds or restarts. Tap the level name for the menu. After 5 misses a faded hint path appears
  (on by default, can be turned off in the menu). The camera zooms out on long flights and leans in on near misses.
- After a win: Retry, Share, Clip (highlight reel), Next. Reels are cinematic, rendered locally (WebCodecs +
  mp4-muxer), not screen recordings.

## Owner likes / dislikes (don't re-propose the dislikes)
- Liked: Chladni plates and Morphogen cells most (cells were later removed from the game); the sense of wonder when
  a ball loops round and comes back for a double; the speed toggle; hand-made levels; cinematic reels.
- Disliked and removed: rubble and rock chunks, comet types, three-comet mode, the hard-mode eye,
  the Y-shaped slingshot, the bottom button bar, the star rating and total score, triangles between targets,
  trick text, the striped or pulsing background, any moving stars.

## Accepted Slingshot ideas, not built in Slingshot yet
Whenever the owner asks for Slingshot improvements, put these first. Bonk already has all three; Slingshot doesn't:
1. The last throw's full path stays faintly visible until the next throw, so you can see why you missed.
2. Star-map menu: worlds and levels shown as constellations instead of numbered tiles.
3. Ambient hum: each level hums a quiet chord tuned to its orbits.

## What Bonk has (built Oct 28 to 29)
- Ball and art:
  - Faceted ball with a face (eyes blink and look at stars, squash and stretch, spin).
  - Skins unlock by levels cleared: coral, marble, jelly, planet, cat, disco, plus a seasonal pumpkin.
  - Jelly-wobble stars and drum plates that keep a dent where they were hit.
  - Splats and puffs on a crash; the last path stays as a dashed ghost.
- Sound: a signature bonk per drum, tuned to membrane Bessel ratios (wood, tom, glass, steel pan, gong), and a
  pentatonic ambient chord built from the stars' masses.
- Menu:
  - Star-map constellations, and a Today streak shown as little drums.
  - Pickers for ball, drum, sky (daylight, sunset, candy, blueprint, newsprint, seasonal Halloween and snow)
    and trail paint (ribbon, chalk, glitter, sparkler).
- Daily: UTC days, a hard sky on Sundays, an "Impossible!" sticker when under 1% of throws win, fireworks at New Year.
- Chain bonks: a hit sprays deterministic sand grains that can bonk other drums.
- Sharing:
  - Challenge links (`#c.`): the friend's winning throw flies beside yours as a ghost.
  - Copy text carries the throw count.
  - A spoiler-free share card (path shape only), and a photo mode (freeze, pan, pinch, save; P key).
- Reels:
  - The highlight reel opens on the final bump in slow motion, rewinds, and freezes for a moment before the last hit.
  - It ends on a caption: "N throws · loops · seconds".
  - The Oops reel cuts together this level's crashes.
- Modes:
  - Two players: Coral then Teal on the same sky.
  - "Make a sky" editor: "Try it" requires one throw that wins.
  - "Type a name, get a sky": deterministic, so the same name gives the same sky on any phone.
  - Made skies share as `#s.` links.
- Leaderboard: "Today's sky, among friends", on the artifact `db`.
  - Rows live at `runs/<user id>` = {day, throws, at}.
  - Rules: `runs` read view / write owner, and `runs/{self}` read view / write interact.
  - Only people inside the owner's claude.ai organization can post; outside accounts only read.

## Code map, build, test
- `slingshot/src/` is the only source of truth. Never edit `slingshot/bonk.html` or `slingshot/slingshot-phone.html`
  directly; they are build output.
  - `phone-head.html` (markup, CSS), `phone-script.js` (the game), `toy.css` (Bonk-only overrides, Fredoka font).
  - `phys.js`: shared deterministic physics, inlined at `/*PHYS*/` and required by the Node tools.
  - `build2.js`: `const THEME = 'night' | 'toy'` builds both games from one script, with separate store keys
    (`areabake.slingshot.v3`, `areabake.bonk.v1`) and separate worlds.
    - Slingshot worlds: First light 9, Two suns 8, Event horizon 6, Today 96.
    - Bonk adds Star clusters 6 and Three suns 6; Bonk levels get `chain: true`.
    - Today's frozen order is `daily-v4.json`; `FREEZE=1` rewrites it, and new layouts only join the end.
  - `lab.js`: hand-made campaign. It flies a fan of throws, maps where looping flights return, and beam-searches
    target sets; each level records `win` (share of winning throws). `dailylab.js` does the same for daily skies.
  - `check.js`: verifies every par-1 hint wins (`node check.js worlds.json`, `node check.js worlds-toy.json`).
  - `levels/*.json`: lab output and the frozen daily order.
  - `tools/`: headless tests (Playwright at `/opt/node22/lib/node_modules/playwright`; output goes to `$OUT` or the OS temp dir).
    - `smoke.js [bonk]`: every level's hint wins in the real page, with no console errors.
    - `bonkfeat.js`: name skies, links, editor, duel, photo, challenge ghost.
    - `bkreel.js`: renders both reels at 270x480. Full size is far too slow on the container's software GL.
- Rebuild: copy `slingshot/src/*.js *.html *.css levels/*.json` into a temp dir, run `node build2.js` there. It
  writes `/home/user/claude-s-space/slingshot/{slingshot-phone,bonk}.html`, `worlds.json`, `worlds-toy.json`.
  Verified Oct 30 after the move to `slingshot/`: the rebuild reproduces the committed HTML byte for byte.
- Then: `node check.js` on both world files, `node tools/smoke.js bonk`, and a screenshot or two if visuals changed.
- Publish:
  - Bonk: Artifact tool, `file_path` `slingshot/bonk.html`, `url` the Bonk link, capabilities
    `{"downloads":true,"db":{"rules":[{"path":"runs","read":"view","write":"owner"},{"path":"runs/{self}","read":"view","write":"interact"}]},"user":{"scopes":["profile"]}}`
    (omit `capabilities` on a redeploy to keep them).
  - Slingshot: `slingshot/slingshot-phone.html` to its own link, with `{"downloads":true}`.

## Technical facts
- Determinism:
  - Leapfrog at DT=1/600, using only + - * / and sqrt in physics.
  - Grains use an integer hash and the rational circle `((1-t^2), 2t)/(1+t^2)`.
  - Fans of test throws use the same rational form, so every device agrees.
  - Made-sky coordinates are integers over a grid (positions /250, velocities /10000), so a decoded sky is bit-identical.
- Constants: TR=0.09 (target radius), EPS2=0.0004, STALE=4.5.
  - Black holes use the Paczynski-Wiita force. Clusters are Plummer spheres (`b.soft = a^2`).
  - Max throw speed is PULL*SPEED = 0.975.
- Bonk link codes: `#s.` is `l` (ball), `s`/`b` (small/big star, m 0.16/0.30, r 0.06/0.08), `t` (drum), each with
  four base-36 digits; then `v` and six digits for the winning throw; then `~name`.
- Season logic: Oct 15 to Nov 5 is Halloween. Its dark sky sets `--paper` to cream, so anything drawn on white paper
  (sheet, bars, toasts) must reset `--paper` to dark ink (done in `toy.css`).
- Some source strings contain a hair space (U+200A), for example in `.split('').join(' ')`. Exact-match edits
  that type a normal space will fail; match around it.
- `buildMenu()` once returned early for Bonk and left Hints and Sound empty. Keep the Bonk branch from returning.
- Full-size reels (1080x1920) take minutes per second of video in headless swiftshader; test reels small.
