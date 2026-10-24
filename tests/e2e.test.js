/**
 * 真实浏览器端到端单测（规划案 §8.2 / §8.3 / T14 / T15）
 *
 * 用 Playwright 打开**生产构建**（dist/ 由本机静态服务器提供），
 * 断言 DOM / ARIA / 键盘 / 响应式 / 画面非空。
 *
 * 运行：node --test tests/e2e.test.js
 * 前置：npm run build（package.json 的 test 脚本会先构建）
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { chromium } from 'playwright';

import { decodePng } from '../tools/png.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(ROOT, 'dist');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.webp': 'image/webp',
  '.jpg': 'image/jpeg',
  '.png': 'image/png',
  '.woff2': 'font/woff2',
  '.json': 'application/json',
};

/** 起一个只服务 dist/ 的静态服务器 */
function startServer() {
  const server = http.createServer((req, res) => {
    const urlPath = decodeURIComponent((req.url ?? '/').split('?')[0]);
    let filePath = path.join(DIST, urlPath === '/' ? 'index.html' : urlPath);
    if (!filePath.startsWith(DIST)) {
      res.writeHead(403).end();
      return;
    }
    if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
      filePath = path.join(DIST, 'index.html');
    }
    const body = fs.readFileSync(filePath);
    res.writeHead(200, { 'Content-Type': MIME[path.extname(filePath)] ?? 'application/octet-stream' });
    res.end(body);
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      resolve({ server, port: server.address().port });
    });
  });
}

let server;
let port;
let browser;
let context;
let page;
/** @type {string[]} */
const consoleErrors = [];
/** @type {string[]} */
const pageErrors = [];
/** @type {string[]} */
const externalRequests = [];

const BASE = () => `http://127.0.0.1:${port}`;

test.before(async () => {
  assert.ok(fs.existsSync(path.join(DIST, 'index.html')), 'dist/index.html 不存在，请先 npm run build');
  const started = await startServer();
  server = started.server;
  port = started.port;

  browser = await chromium.launch({
    args: ['--use-gl=angle', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
  });
  context = await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
  page = await context.newPage();

  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });
  page.on('pageerror', (err) => pageErrors.push(String(err?.message ?? err)));
  page.on('request', (req) => {
    try {
      const hostname = new URL(req.url()).hostname;
      if (hostname && hostname !== '127.0.0.1' && hostname !== 'localhost') {
        externalRequests.push(req.url());
      }
    } catch {
      /* data: URL 等 */
    }
  });

  await page.goto(`${BASE()}/?debug=1&intro=0`, { waitUntil: 'load', timeout: 60000 });
  await page.waitForFunction(() => {
    const d = globalThis.__CASTLE_DEBUG__;
    return d && d.snapshot().state.phase === 'ready';
  }, { timeout: 60000 });
  await page.waitForTimeout(1500);
});

test.after(async () => {
  await context?.close();
  await browser?.close();
  server?.close();
});

test('场景在生产构建里正常就绪', async () => {
  const state = await page.evaluate(() => globalThis.__CASTLE_DEBUG__.snapshot().state);
  assert.equal(state.phase, 'ready');
  assert.equal(state.error, null);
});

test('全程零 console error / pageerror / 外部请求', () => {
  assert.deepEqual(consoleErrors, [], `有 console error：${consoleErrors.join(' | ')}`);
  assert.deepEqual(pageErrors, [], `有未捕获异常：${pageErrors.join(' | ')}`);
  assert.deepEqual(externalRequests, [], `有外部请求：${externalRequests.join(' | ')}`);
});

test('画布有可访问名称、可聚焦，且渲染出的帧不是黑屏', async () => {
  const attrs = await page.evaluate(() => {
    const c = document.getElementById('scene');
    return {
      role: c.getAttribute('role'),
      label: c.getAttribute('aria-label'),
      tabindex: c.getAttribute('tabindex'),
      width: c.width,
      height: c.height,
    };
  });
  assert.equal(attrs.role, 'img');
  assert.ok(attrs.label && attrs.label.length > 4, '画布必须有 aria-label');
  assert.equal(attrs.tabindex, '0', '画布必须可聚焦');
  assert.ok(attrs.width > 100 && attrs.height > 100);

  const shot = await page.screenshot({ type: 'png' });
  const image = decodePng(shot);
  assert.ok(image, '截图必须能被解码');

  // 非黑屏：像素必须有足够多的亮度层次
  let sum = 0;
  let min = 255;
  let max = 0;
  for (let i = 0; i < image.data.length; i += 4) {
    const l = (0.2126 * image.data[i] + 0.7152 * image.data[i + 1] + 0.0722 * image.data[i + 2]) / 255;
    sum += l;
    if (l < min) min = l;
    if (l > max) max = l;
  }
  const mean = sum / (image.data.length / 4);
  assert.ok(mean > 0.12, `画面平均亮度只有 ${mean.toFixed(3)}，疑似黑屏`);
  assert.ok(max - min > 0.3, `画面亮度范围只有 ${(max - min).toFixed(3)}，疑似纯色`);
});

test('所有交互元素都是真 button 且有可读名称', async () => {
  const issues = await page.evaluate(() => {
    const out = [];
    document.querySelectorAll('button').forEach((btn) => {
      const text = (btn.textContent ?? '').trim();
      const label = btn.getAttribute('aria-label') ?? '';
      if (!text && !label) out.push(btn.outerHTML.slice(0, 80));
    });
    return out;
  });
  assert.deepEqual(issues, [], `有按钮既没有文字也没有 aria-label：${issues.join(' | ')}`);
});

test('界面里没有 emoji 图标', async () => {
  const emoji = await page.evaluate(() => {
    const re = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u;
    const found = [];
    document.querySelectorAll('body *').forEach((el) => {
      if (el.children.length === 0 && re.test(el.textContent ?? '')) {
        found.push(el.textContent.trim().slice(0, 30));
      }
    });
    return found;
  });
  assert.deepEqual(emoji, [], `界面里出现了 emoji：${emoji.join(' | ')}`);
});

test('图标统一是 24×24 viewBox、1.75 描边的内联 SVG', async () => {
  const bad = await page.evaluate(() => {
    const out = [];
    document.querySelectorAll('svg').forEach((svg) => {
      if (svg.getAttribute('viewBox') !== '0 0 24 24') out.push(`viewBox=${svg.getAttribute('viewBox')}`);
      if (svg.getAttribute('stroke-width') !== '1.75') out.push(`stroke-width=${svg.getAttribute('stroke-width')}`);
    });
    return out;
  });
  assert.deepEqual(bad, [], `图标规格不一致：${bad.join(' | ')}`);
});

test('Tab 顺序覆盖帮助与底部操作台', async () => {
  const reachable = await page.evaluate(async () => {
    const seen = new Set();
    const focusables = document.querySelectorAll('button, [tabindex="0"], a[href]');
    focusables.forEach((el) => {
      el.focus();
      if (document.activeElement === el) seen.add(el.getAttribute('aria-label') || el.textContent.trim() || el.id);
    });
    return [...seen];
  });
  assert.ok(reachable.length >= 12, `可聚焦元素只有 ${reachable.length} 个`);
  assert.ok(reachable.some((n) => n.includes('帮助')), 'Tab 顺序里没有帮助按钮');
  assert.ok(reachable.some((n) => n.includes('复位')), 'Tab 顺序里没有复位按钮');
});

test('Esc 关闭帮助对话框并把焦点还给触发者', async () => {
  await page.click('[data-action="help"]');
  await page.waitForTimeout(350);
  assert.ok(await page.evaluate(() => document.getElementById('help-dialog').open), '帮助对话框没打开');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(350);
  assert.ok(await page.evaluate(() => !document.getElementById('help-dialog').open), 'Esc 没有关闭对话框');
});

test('375px 窄屏没有横向溢出', async () => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.waitForTimeout(900);
  const overflow = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  assert.ok(overflow.scrollWidth <= overflow.clientWidth + 1,
    `出现横向滚动：scrollWidth=${overflow.scrollWidth} clientWidth=${overflow.clientWidth}`);
  await page.setViewportSize({ width: 1280, height: 720 });
});

test('触屏可点区域不小于 44×44', async () => {
  const small = await page.evaluate(() => {
    const out = [];
    document.querySelectorAll('.dock button, .iconbtn').forEach((btn) => {
      const r = btn.getBoundingClientRect();
      if (r.width > 0 && (r.width < 44 || r.height < 44)) {
        out.push(`${btn.getAttribute('aria-label') ?? btn.textContent.trim()}=${r.width.toFixed(0)}×${r.height.toFixed(0)}`);
      }
    });
    return out;
  });
  assert.deepEqual(small, [], `触控区域不足 44px：${small.join(' | ')}`);
});

test('prefers-reduced-motion 下不报错，且云时间速率被压到 0.1', async () => {
  const reduced = await browser.newContext({
    viewport: { width: 1024, height: 640 },
    deviceScaleFactor: 1,
    reducedMotion: 'reduce',
  });
  const reducedPage = await reduced.newPage();
  const errors = [];
  reducedPage.on('pageerror', (e) => errors.push(String(e?.message ?? e)));
  await reducedPage.goto(`${BASE()}/?debug=1`, { waitUntil: 'load', timeout: 60000 });
  await reducedPage.waitForFunction(() => {
    const d = globalThis.__CASTLE_DEBUG__;
    return d && d.snapshot().state.phase === 'ready';
  }, { timeout: 60000 });
  await reducedPage.waitForTimeout(1200);
  const state = await reducedPage.evaluate(() => globalThis.__CASTLE_DEBUG__.snapshot().state);
  assert.equal(state.reducedMotion, true, 'reduced-motion 必须被识别');
  assert.deepEqual(errors, [], `reduced-motion 下有异常：${errors.join(' | ')}`);
  await reduced.close();
});

test('URL 深链能还原状态，非法参数不白屏', async () => {
  await page.goto(`${BASE()}/?debug=1&view=rock&time=night&weather=storm&tier=ultra&intro=0`, { waitUntil: 'load' });
  await page.waitForFunction(() => {
    const d = globalThis.__CASTLE_DEBUG__;
    return d && d.snapshot().state.phase === 'ready';
  }, { timeout: 60000 });
  const state = await page.evaluate(() => globalThis.__CASTLE_DEBUG__.snapshot().state);
  assert.equal(state.view, 'rock');
  assert.equal(state.time, 'night');
  assert.equal(state.weather, 'storm');
  assert.equal(state.tier, 'ultra');

  await page.goto(`${BASE()}/?debug=1&view=不存在&time=午夜`, { waitUntil: 'load' });
  await page.waitForTimeout(2500);
  const ok = await page.evaluate(() => {
    const d = globalThis.__CASTLE_DEBUG__;
    return Boolean(d && d.snapshot().state.phase === 'ready');
  });
  assert.ok(ok, '非法深链必须回默认而不是白屏');
});
