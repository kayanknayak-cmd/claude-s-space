// Opens drive.html in headless Chromium, drives with scripted keys and saves screenshots; reports console errors.
// Usage: node tools/shot.mjs '<json plan>'   plan: [{"keys":["KeyW"],"for":2,"shot":"name"}, {"eval":"js"}, ...]
// Env: OUT (screenshot dir), W/H (viewport, default 1280x720).
import { createRequire } from 'module';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
const { chromium } = createRequire(import.meta.url)('/opt/node22/lib/node_modules/playwright');
const OUT = process.env.OUT || os.tmpdir(), plan = JSON.parse(process.argv[2] || '[]');
const file = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'drive.html');
const b = await chromium.launch({ proxy: { server: process.env.https_proxy }, args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const p = await b.newPage({ viewport: { width: +(process.env.W || 800), height: +(process.env.H || 450) }, hasTouch: !!process.env.TOUCH, isMobile: !!process.env.TOUCH });
const errs = [];
p.on('pageerror', e => { errs.push(String(e)); console.log('PAGE ERROR', String(e)); }); p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); else if (m.text().startsWith('[drive]')) console.log(m.text()); });
const t0 = Date.now();
await p.goto('file://' + file + (process.env.FULL ? '' : '?lite') + (process.env.HASH || ''));
await p.waitForFunction(() => window.__drive && window.__drive.car, null, { timeout: 180000 });
console.log('loaded in', ((Date.now() - t0) / 1000).toFixed(1), 's');
await p.evaluate(() => { document.getElementById('help').hidden = true; });
for (const st of plan) {
  if (st.eval) console.log('eval:', JSON.stringify(await p.evaluate(st.eval)));
  if (st.keys) await p.evaluate(ks => { const k = window.__drive.keys; for (const c in k) k[c] = 0; for (const c of ks) k[c] = 1; }, st.keys);
  if (st.for) await p.waitForTimeout(st.for * 1000);
  if (st.shot) await p.screenshot({ path: path.join(OUT, st.shot + '.png'), timeout: 120000 });
}
const fps = await p.evaluate(() => new Promise(r => { let n = 0; const t = performance.now(); const f = () => { n++; if (performance.now() - t < 2000) requestAnimationFrame(f); else r(n / 2); }; requestAnimationFrame(f); }));
console.log('headless fps (software GL):', fps.toFixed(1));
console.log(errs.length ? 'ERRORS:\n' + errs.slice(0, 10).join('\n') : 'no console errors');
await b.close();
