// Opens rush.html in headless Chromium, plays the hint throws, saves screenshots, reports console errors.
// Usage: node tools/shot.mjs [level] [w] [h]   Screenshots go to $OUT (default: OS temp dir).
import { createRequire } from 'module';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
const { chromium } = createRequire(import.meta.url)('/opt/node22/lib/node_modules/playwright');
const OUT = process.env.OUT || os.tmpdir();
const [lv = '0', w = '390', h = '844'] = process.argv.slice(2);
const hints = JSON.parse(process.env.HINT || '[]');
const file = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'rush.html');
const proxy = process.env.https_proxy || process.env.HTTPS_PROXY;
const browser = await chromium.launch({ proxy: proxy ? { server: proxy } : undefined, args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: +w, height: +h }, deviceScaleFactor: 1 });
const errors = [];
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', e => errors.push(String(e)));
await page.goto('file://' + file);
await page.waitForFunction(() => window.__rush && window.__rush.state === 'play', null, { timeout: 120000 });
await page.evaluate(i => window.__rush.setLevel(i), +lv);
await page.waitForTimeout(1500);
await page.screenshot({ path: path.join(OUT, `rush-${lv}-start.png`) });
for (const [i, [vx, vy]] of hints.entries()) {
  await page.evaluate(([a, b]) => window.__rush.doThrow(a, b), [vx, vy]);
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(OUT, `rush-${lv}-t${i}a.png`) });
  await page.waitForFunction(() => { const S = window.__rush.S; return S.won || S.steps - S.lastThrow > 300; }, null, { timeout: 60000 });
  await page.waitForTimeout(800);
}
await page.screenshot({ path: path.join(OUT, `rush-${lv}-end.png`) });
console.log(JSON.stringify(await page.evaluate(() => ({ state: window.__rush.state, won: window.__rush.S.won, fed: window.__rush.S.customers.map(c => c.fed) }))));
console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : 'no console errors');
await browser.close();
