// Opens racer.html in headless Chromium, drives a lap with the pace car's steering, saves screenshots and reports
// console errors. Usage: node tools/shot.mjs [track] [w] [h] [times...]   Screenshots go to $OUT (default OS temp).
import { createRequire } from 'module';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
const { chromium } = createRequire(import.meta.url)('/opt/node22/lib/node_modules/playwright');
const OUT = process.env.OUT || os.tmpdir();
const [tr = '0', w = '390', h = '844', ...times] = process.argv.slice(2);
const file = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'racer.html');
const proxy = process.env.https_proxy || process.env.HTTPS_PROXY;
const browser = await chromium.launch({ proxy: proxy ? { server: proxy } : undefined, args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: +w, height: +h }, deviceScaleFactor: 1 });
const errors = [];
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', e => errors.push(String(e)));
await page.goto('file://' + file + (process.env.HASH || ''));
await page.waitForFunction(() => window.__race && window.__race.state === 'count', null, { timeout: 120000 });
await page.evaluate(([i, manual]) => { const r = window.__race; r.setTrack(i); if (!manual) r.auto = r.paceOf(i); }, [+tr, !!process.env.MANUAL]);
await page.waitForTimeout(1200);
await page.screenshot({ path: path.join(OUT, `racer-${tr}-count.png`) });
const t0 = Date.now();
for (const t of (times.length ? times : ['4', '8', '12'])) {
  await page.waitForFunction(s => window.__race.state === 'race' && window.__race.you.steps / 120 >= s || window.__race.state === 'done', +t, { timeout: 300000 });
  await page.screenshot({ path: path.join(OUT, `racer-${tr}-t${t}.png`) });
}
await page.waitForFunction(() => window.__race.state === 'done', null, { timeout: 600000 }).catch(() => {});
await page.waitForTimeout(1500);
await page.screenshot({ path: path.join(OUT, `racer-${tr}-end.png`) });
console.log(JSON.stringify(await page.evaluate(() => ({ state: window.__race.state, time: window.__race.you.time, piece: window.__race.you.piece, prog: window.__race.you.prog }))), ((Date.now() - t0) / 1000).toFixed(0) + 's');
console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : 'no console errors');
await browser.close();
