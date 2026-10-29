# claude-s-space

> **Every Claude session: this file is the shared memory for this repository.** It loads automatically at the start
> of every session. Read it fully before working. Whenever you learn something lasting (a preference, a decision, a
> rejected idea, a gotcha, a new feature), update this file in the same session and commit it, so the next session
> starts where you stopped. Keep it accurate: delete what stops being true instead of piling on.

Home of **areabake** (`areabake.html`, `site/`), **Slingshot for phones** (`slingshot-phone.html`), its light sibling
**Bonk** (`bonk.html`) and the **Epicycle Machine** (`epicycles.html`). Both games build from `slingshot-src/`.

## Working with the owner
- Concise answers. Don't repeat a point. No em dashes anywhere, ever (use commas, colons, parentheses).
- Fact-check. Don't just agree; push back when something is wrong. A thinking partner, not a cheerleader.
- Before complex work, ask 3 or 4 clarifying questions if needed, always with the clickable question tool
  (AskUserQuestion), never typed out in prose. Skip questions when nothing is unclear.
- "Make no edits, we're ideating" means lists only. "Save to list" means record it here, don't build it.
- Visual work: real math and real art, never generic or "AI looking". Minimal text, no fast flashing words.
- Be usage-conscious with tests: one targeted run, not repeated full suites.
- Keep this file updated whenever something new is learned.
- End every message with links to the artifacts:
  - areabake: https://claude.ai/artifact/QyKjViaYyb2G7wT2udgsAK
  - Slingshot for phones: https://claude.ai/artifact/K2qhs1tpJsR69gPuAXwpze
  - Bonk: https://claude.ai/artifact/9d6V9nGLmcLCuzgeHDEhSf
  - (optional) Target Studies demo, the target-design comparison: https://claude.ai/artifact/5ipNRWvbJN68hraRoE2xKr
- Edit and republish the artifacts only. Never push to Base44 (areabake.com) unless the owner explicitly asks.
  `.claude/settings.json` allows the Base44 MCP tools for when they do.

## Third game (decided Oct 29, not started)
- Owner's verdict: Slingshot and Bonk look AI (art, motion and feel, menus and UI), and adding features didn't fix it.
  The owner wants a human-made feel.
- A brand new third game. Slingshot and Bonk stay as they are.
- Copy what made Angry Birds viral (instant readable goal, satisfying physical destruction, short levels, one more
  try), but not its plot or general idea. It can be 3D.
- Art: Kenney CC0 packs, uploaded by the owner as 21 zips (about 85 MB) at the repo root of branch
  `claude/serene-rubin-bnqy4l` (commits "Add files via upload"). Always `git fetch` that branch before saying
  assets are missing (a session once wrongly reported them absent).
  - 3D (GLB): building, car, coaster, factory 3.0, food, hexagon, mini-arena, mini-characters, mini-forest,
    mini-market, mini-skate, modular-space, racing, space-station, train, watercraft (about 1,250 models).
  - 2D: physics-assets (wood, stone, glass, metal blocks), tiny-city, tiny-factory, skyboxes, input-prompts.
  - Missing: no audio packs, no UI pack. Ask the owner before relying on anything not listed here.
  - The owner confirmed 21 is the full set; sounds get made in code.
  - mini-characters GLBs are rigged (6 bones: legs, torso, arms, head) with 32 hand-made animations (idle, walk,
    jump, fall, sit, die, emote-yes, emote-no, pick-up, kicks...). Other kits are static meshes.
- Concepts pitched Oct 29: Dinner Rush (food fight), Bail (skate ragdoll), Wreck Day (tiny demolition), Island
  Bowling (hex). The owner liked all four and asked which Claude can execute best; Claude recommended Dinner Rush.
- Old Slingshot and Bonk rules (no rubble, no moving bodies, no Y slingshot) don't automatically apply here.

## The two games (direction as of Oct 28)
- **Slingshot** (night): Morphogen's Specimen palette, a still, real night sky (jittered stars, Milky Way band).
- **Bonk** (light, playful, 3D-ish, inspired by Totally Accurate Battle Simulator): free to experiment, but only in Bonk.
  Bonk is meant to go viral as a phone game.
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

### Owner likes / dislikes (don't re-propose the dislikes)
- Liked: Chladni plates and Morphogen cells most (cells were later removed from the game); the sense of wonder when
  a ball loops round and comes back for a double; the speed toggle; hand-made levels; cinematic reels.
- Disliked and removed: rubble and rock chunks, comet types, three-comet mode, the hard-mode eye,
  the Y-shaped slingshot, the bottom button bar, the star rating and total score, triangles between targets,
  trick text, the striped or pulsing background, any moving stars.

### Accepted Slingshot ideas, not built in Slingshot yet
Whenever the owner asks for improvements, put these first on the list. Bonk already has all three; Slingshot doesn't:
1. The last throw's full path stays faintly visible until the next throw, so you can see why you missed.
2. Star-map menu: worlds and levels shown as constellations instead of numbered tiles.
3. Ambient hum: each level hums a quiet chord tuned to its orbits.

### What Bonk has (built Oct 28 to 29)
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
- `slingshot-src/` is the only source of truth. (Older sessions worked in a scratchpad that is gone. Never edit
  `bonk.html` or `slingshot-phone.html` directly; they are build output.)
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
    - `bonkfeat.js`: name skies, links, editor, duel, photo, challenge ghost. Screenshots go to the OS temp dir.
    - `bkreel.js`: renders both reels at 270x480. Full size is far too slow on the container's software GL.
- Rebuild: copy `slingshot-src/*.js *.html *.css levels/*.json` into a temp dir, run `node build2.js` there. It
  writes `/home/user/claude-s-space/{slingshot-phone,bonk}.html`, `worlds.json`, `worlds-toy.json`. Verified Oct 29:
  a rebuild from the repo reproduces the committed HTML byte for byte.
- Then: `node check.js` on both world files, `node tools/smoke.js bonk`, and a screenshot or two if visuals changed.
- Publish:
  - Bonk: Artifact tool, `file_path` `bonk.html`, `url` the Bonk link, capabilities
    `{"downloads":true,"db":{"rules":[{"path":"runs","read":"view","write":"owner"},{"path":"runs/{self}","read":"view","write":"interact"}]},"user":{"scopes":["profile"]}}`
    (omit `capabilities` on a redeploy to keep them).
  - Slingshot: its own link, with `{"downloads":true}`.
- Git: each session gets its own `claude/...` branch. There is no main branch (as of Oct 29), so a
  pull request can't be opened until the owner creates a base branch.

## Technical facts worth knowing
- Determinism:
  - Leapfrog at DT=1/600, using only + - * / and sqrt in physics.
  - Grains use an integer hash and the rational circle `((1-t^2), 2t)/(1+t^2)`.
  - Fans of test throws use the same rational form, so every device agrees.
  - Made-sky coordinates are integers over a grid (positions /250, velocities /10000), so a decoded sky is bit-identical.
- Constants: TR=0.09 (target radius), EPS2=0.0004, STALE=4.5.
  - Black holes use the Paczynski-Wiita force. Clusters are Plummer spheres (`b.soft = a^2`).
  - Max throw speed is PULL*SPEED = 0.975.
- Artifact sandbox limits:
  - Only `[A-Za-z0-9._~-]` survives in `location.hash`, so links are `#c.` `#r.` `#s.` (never `#r=`).
  - Web Share is refused, so files save through the `downloads` capability.
  - Clipboard writes can hang, so `copyText()` never awaits and falls back to showing the link.
- Bonk link codes: `#s.` is `l` (ball), `s`/`b` (small/big star, m 0.16/0.30, r 0.06/0.08), `t` (drum), each with
  four base-36 digits; then `v` and six digits for the winning throw; then `~name`.
- Season logic: Oct 15 to Nov 5 is Halloween. Its dark sky sets `--paper` to cream, so anything drawn on white paper
  (sheet, bars, toasts) must reset `--paper` to dark ink (done in `toy.css`).

## Gotchas (cost time before)
- `pkill -f <pattern>` matches its own shell and kills it (exit 144). Kill by pid via `ps -eo pid,args | awk`.
- Foreground `sleep` is blocked; use an `until ...; do sleep 5; done` loop or `run_in_background`.
- Some source strings contain a hair space (U+200A), for example in `.split('').join(' ')`. Exact-match edits
  that type a normal space will fail; match around it.
- `buildMenu()` once returned early for Bonk and left Hints and Sound empty. Keep the Bonk branch from returning.
- AskUserQuestion rejects duplicate question texts.
- Full-size reels (1080x1920) take minutes per second of video in headless swiftshader; test reels small.
