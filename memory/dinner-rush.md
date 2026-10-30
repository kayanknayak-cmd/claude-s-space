# Dinner Rush

A phone physics game in a cut-away diner, built Oct 29 from Kenney packs. Status: paused by the owner on Oct 30
(no play feedback given). Keep it as is until asked.

## Why it exists
- Owner's verdict on Oct 29: Slingshot and Bonk look AI (art, motion and feel, menus and UI), and adding features
  didn't fix it. The owner wants a human-made feel, so new games use Kenney's hand-made CC0 art.
- Brief: copy what made Angry Birds viral (instant readable goal, satisfying physical destruction, short levels, one
  more try), but not its plot or general idea. It can be 3D. Old Slingshot/Bonk rules don't apply.
- Concepts pitched Oct 29: Dinner Rush (food fight), Bail (skate ragdoll), Wreck Day (tiny demolition), Island
  Bowling (hex). The owner liked all four; Claude recommended Dinner Rush. Bail is the natural later mode (same
  rigged characters), but ragdoll feel can't be tuned without a phone.

## Design
- A cut-away diner several storeys tall (portrait first), chef bottom left. Drag back and release to throw the next
  food from a fixed queue. Each customer's hand-drawn bubble shows the food they want; it counts when that food comes
  within reach (CATCH 0.44 of their chest), including food knocked off a balcony. Wrong food gets a head shake.
  Plates smash on hard hits. Everyone's head follows the flying food.
- Feel: hit-stop on catch and smash, camera shake, squash pulse, puffs, slow motion on the winning catch,
  synthesized sounds, the last throw's dashed path stays, a win card (retry, replay, next) and a half-speed replay.
- Levels (3): Table for one, Top shelf (knock the watermelon off a balcony onto him), Rush hour (about 1% of throws
  reach the middle customer; may be too hard).
- Open issues: bottom ~40% of a portrait screen is empty floor; all sound synthesized (Impact Sounds now available);
  tables come from the skate pack (Furniture Kit would be better); about 7 MB first load.

## Code
- `dinner-rush/src/` is the source; `dinner-rush/rush.html` is build output, never edit it.
  - `catalog.mjs` (model key, file, scale, role, collider), `sim.mjs` (Rapier world and rules, shared with Node),
    `levels.mjs`, `game.js` (three.js renderer, input, sound, feel), `head.html` (shell, CSS, import map).
  - `assets/` holds only the Kenney GLBs and colormaps the catalog uses, plus the CC0 license.
  - `node build.mjs` embeds models and textures (GLB image URIs are rewritten to `tex-<kit>.png`) and writes
    `../rush.html` and `hulls.json` (model bounds; gitignored).
  - Libraries load from jsdelivr: three@0.169.0, @dimforge/rapier3d-compat@0.14.0.
- Tools (Rapier for Node: `cd dinner-rush/src/tools && npm i`):
  - `node tools/solve.mjs [i]` searches throws and prints a winning hint. Slow on multi-customer levels.
  - `node tools/reach.mjs i` gives each customer's share of throws that feed them.
  - `node tools/shot.mjs i [w h]` screenshots the real page (HINT='[[vx,vy]]' plays throws). Playwright needs the
    proxy (`https_proxy`) to reach the CDN.
- Physics facts:
  - Throws are rounded to 0.01 so hints replay exactly. Node and the browser agree (a Node hint wins in Chromium).
  - Rapier convex hulls let thin plates sink into each other; colliders are fitted boxes, cylinders and balls.
  - G = -13, VMAX = 10, DT = 1/120, and 240 settle steps before play.
- Artifact: https://claude.ai/artifact/XzoTPw9deyYhUnD5horq9m (no capabilities). Publish `dinner-rush/rush.html` to that url.
