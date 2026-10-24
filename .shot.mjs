import { chromium } from 'playwright';

const url = process.argv[2] ?? 'http://127.0.0.1:4173/?debug=1&intro=0&view=hero&time=dawn&weather=clear&tier=balanced';
const out = process.argv[3] ?? '/tmp/shot.png';
const waitMs = Number(process.argv[4] ?? 6000);

const browser = await chromium.launch({
  args: ['--use-gl=angle', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const context = await browser.newContext({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
const page = await context.newPage();

const logs = [];
page.on('console', (m) => logs.push(`[${m.type()}] ${m.text()}`));
page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));

const external = [];
await page.route('**/*', (route) => {
  const req = route.request();
  const u = new URL(req.url());
  if (u.hostname !== '127.0.0.1' && u.hostname !== 'localhost') external.push(req.url());
  route.continue();
});

await page.goto(url, { waitUntil: 'load', timeout: 60000 });
await page.waitForTimeout(waitMs);

const debug = await page.evaluate(() => {
  const d = globalThis.__CASTLE_DEBUG__;
  if (!d) return { ready: false };
  const s = d.snapshot();
  return { ready: true, ...s };
});

await page.screenshot({ path: out });

console.log('=== console ===');
console.log(logs.slice(0, 30).join('\n') || '(无)');
console.log('=== 外部请求 ===');
console.log(external.length ? external.join('\n') : '(无)');
console.log('=== debug ===');
console.log(JSON.stringify(debug, null, 2));

await browser.close();
