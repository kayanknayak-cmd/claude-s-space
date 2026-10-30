# claude-s-space

> **Every Claude session: this repository is your memory and your workshop.** The owner said so on Oct 30: the files
> here are for Claude, not a showcase of finished products. Store anything you need to remember. This file loads
> automatically every session and is the index; the details live in `memory/`. Before working on a project, read its
> memory file. Whenever you learn something lasting (a preference, a decision, a rejected idea, a gotcha, a new
> feature), update the right file in the same session, commit and push it, so the next session starts where you
> stopped. Keep it accurate: delete what stops being true instead of piling on. Add a line to `memory/log.md` for
> each notable decision or request.

## Working with the owner
- Concise answers. Don't repeat a point. No em dashes anywhere, ever (use commas, colons, parentheses).
- Fact-check. Don't just agree; push back when something is wrong. A thinking partner, not a cheerleader.
- Before complex work, ask 3 or 4 clarifying questions if needed, always with the clickable question tool
  (AskUserQuestion), never typed out in prose. Skip questions when nothing is unclear.
- "Make no edits, we're ideating" means lists only. "Save to list" means record it in memory, don't build it.
  "Stop" or "pause" means stop at the next clean point and save state to memory.
- Visual work: real math and real art, never generic or "AI looking". The owner wants a human-made feel (art,
  motion, menus); new games use Kenney's hand-made CC0 packs. Minimal text, no fast flashing words.
- Be usage-conscious with tests: one targeted run, not repeated full suites.
- End every message with links to the artifacts:
  - Dinner Rush: https://claude.ai/artifact/XzoTPw9deyYhUnD5horq9m
  - areabake: https://claude.ai/artifact/QyKjViaYyb2G7wT2udgsAK
  - Slingshot for phones: https://claude.ai/artifact/K2qhs1tpJsR69gPuAXwpze
  - Bonk: https://claude.ai/artifact/9d6V9nGLmcLCuzgeHDEhSf
  - (optional) Target Studies demo, the target-design comparison: https://claude.ai/artifact/5ipNRWvbJN68hraRoE2xKr
- Edit and republish the artifacts only. Never push to Base44 (areabake.com) unless the owner explicitly asks.
  `.claude/settings.json` allows the Base44 MCP tools for when they do.

## Map
| Path | What | Status |
| --- | --- | --- |
| `memory/` | Claude's notes: `log.md` (dated decisions), one file per project | always current |
| `racer/` | Ghost time-trial racer, the fourth game (`memory/racer.md`) | planned, no code yet |
| `dinner-rush/` | Food-throwing physics game (`src/`, built `rush.html`; `memory/dinner-rush.md`) | paused Oct 30 |
| `slingshot/` | Slingshot and Bonk orbit games (`src/`, built HTML; `memory/slingshot-bonk.md`) | done for now |
| `areabake/` | areabake (WebGL math exhibits, one HTML file) and `site/`, an older deploy copy with a Slingshot PWA | done |
| `epicycles/` | Epicycle Machine (draw a loop, Fourier circles redraw it) | done |
| `assets/kenney/` | 29 Kenney CC0 zips; `INDEX.md` lists every model and sound; `make-index.py` regenerates it | |

`racer/` doesn't exist until the racer is started. Built HTML files are build output: edit `src/` and rebuild.

## Assets and uploads
- The owner downloads Kenney packs on request (they have the whole library) and uploads them through GitHub's web
  page, which lands on whatever branch they pick (so far `claude/serene-rubin-bnqy4l`). `git fetch` every branch and
  check before saying a pack is missing; move new zips into `assets/kenney/` and rerun `make-index.py`.
- kenney.nl is blocked (403) from the container, so Claude can't download packs itself.
- mini-characters GLBs are rigged (6 bones) with 32 hand-made animations; most other kits are static meshes.
- Still worth asking for if needed: Furniture Kit, Interface Sounds, UI Pack.

## Git
- Each session gets its own `claude/...` branch. Work branch as of Oct 30: `claude/eloquent-mccarthy-wyfmou`, which
  includes everything (the upload branch was merged in). There is no main branch, so a pull request can't be opened
  until the owner creates one.

## Shared tooling facts
- Playwright: `/opt/node22/lib/node_modules/playwright`, Chromium preinstalled; pass the proxy (`https_proxy`) to
  reach CDNs. Headless WebGL is software (swiftshader): fine for screenshots, slow for video.
- Artifact sandbox: only `[A-Za-z0-9._~-]` survives in `location.hash` (links like `#c.`, never `#r=`); Web Share is
  refused (use the `downloads` capability); clipboard writes can hang, so never await them.
- Determinism trick used across games: only + - * / and sqrt in physics, and the rational circle
  `((1-t^2), 2t)/(1+t^2)` instead of sin/cos, so every device replays the same result.

## Gotchas (cost time before)
- `pkill -f <pattern>` matches its own shell and kills it (exit 144). Kill by pid via `ps -eo pid,args | awk`.
- Foreground `sleep` is blocked; use an `until ...; do sleep 5; done` loop or `run_in_background`.
- AskUserQuestion rejects duplicate question texts.
