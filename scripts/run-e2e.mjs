#!/usr/bin/env node
/**
 * 生产构建的真实浏览器验收（规划案 §8.1 / §8.2 / T15）
 *
 * 做什么：
 *   1. 内部启动 `vite preview`（生产 dist），不用开发服务器
 *   2. 新建 Chromium context，固定 viewport / DPR = 1
 *   3. 收集 console error、pageerror、**全部请求**（跨域请求即使被拦下也算「企图」）
 *   4. 等场景 ready，锁定时刻/天气/画质/机位
 *   5. 取证冻结（世界时间停住）后采 60 个**互不相同**的 rAF 帧
 *   6. 落盘三张规定尺寸截图 + 近景对照
 *   7. 调 analyze-image.mjs 做像素指标判定
 *   8. 把证据写进 reports/evidence/
 *
 * 用法：node scripts/run-e2e.mjs [--port 4173] [--keep-open]
 */

import fs from 'node:fs';
import path from 'node:path';
import { spawn, execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { chromium } from 'playwright';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const OUT_DIR = path.join(ROOT, 'reports', 'evidence');

const args = process.argv.slice(2);
const PORT = Number((args[args.indexOf('--port') + 1]) || 4173);
const BASE = `http://127.0.0.1:${PORT}`;

/** 跨域请求记录：即使被 abort，也算「外部请求企图」 */
const externalAttempts = [];

function log(msg) {
  console.log(`  ${msg}`);
}

async function waitForServer(url, timeoutMs = 30000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url, { method: 'GET' });
      if (res.ok) return true;
    } catch {
      /* 还没起来 */
    }
    await new Promise((r) => setTimeout(r, 300));
  }
  throw new Error(`预览服务器在 ${timeoutMs}ms 内没有就绪：${url}`);
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });

  console.log('▶ 启动生产预览服务器');
  const preview = spawn('npm', ['run', 'preview', '--', '--port', String(PORT)], {
    cwd: ROOT,
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: true,
  });
  let previewLog = '';
  preview.stdout.on('data', (d) => { previewLog += d.toString(); });
  preview.stderr.on('data', (d) => { previewLog += d.toString(); });

  let browser;
  try {
    await waitForServer(`${BASE}/`);

    console.log('▶ 启动 Chromium（生产构建）');
    browser = await chromium.launch({
      args: ['--use-gl=angle', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
    });
    const context = await browser.newContext({
      viewport: { width: 1920, height: 1080 },
      deviceScaleFactor: 1,
    });

    /** @type {string[]} */
    const consoleErrors = [];
    /** @type {string[]} */
    const pageErrors = [];
    /** @type {Array<{url:string, method:string, status?:number}>} */
    const allRequests = [];

    const page = await context.newPage();
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });
    page.on('pageerror', (err) => pageErrors.push(String(err?.message ?? err)));
    page.on('request', (req) => {
      const url = req.url();
      allRequests.push({ url, method: req.method() });
      let hostname = '';
      try {
        hostname = new URL(url).hostname;
      } catch {
        return;
      }
      if (hostname && hostname !== '127.0.0.1' && hostname !== 'localhost') {
        externalAttempts.push({ url, method: req.method() });
      }
    });

    const url = `${BASE}/?debug=1&intro=0&view=hero&time=dawn&weather=clear&tier=balanced`;
    console.log(`▶ 打开 ${url}`);
    await page.goto(url, { waitUntil: 'load', timeout: 60000 });

    // 等场景 ready
    await page.waitForFunction(() => {
      const d = globalThis.__CASTLE_DEBUG__;
      return d && d.snapshot().state.phase === 'ready';
    }, { timeout: 60000 });
    await page.waitForTimeout(2500);
    log('场景已就绪');

    // 取证冻结：世界时间停住，画面稳定
    await page.evaluate(() => globalThis.__CASTLE_DEBUG__.freezeForEvidence(true));
    await page.waitForTimeout(600);

    // -------- 60 个互不相同的帧 --------
    const frames = await page.evaluate(() => {
      const raw = globalThis.__CASTLE_DEBUG__.sampleDistinctFrames(120);
      const out = [];
      let lastTime = -Infinity;
      for (const f of raw) {
        if (f.nowMs <= lastTime) continue; // 时间戳必须严格递增
        lastTime = f.nowMs;
        out.push({
          frameId: f.frameId,
          nowMs: f.nowMs,
          frameMs: f.frameMs,
          fps: f.fps,
          drawCalls: f.drawCalls,
          triangles: f.triangles,
          scale: f.scale,
          tier: f.tier,
        });
        if (out.length >= 60) break;
      }
      return out;
    });

    const distinctIds = new Set(frames.map((f) => f.frameId)).size;
    const fpsValues = frames.map((f) => f.fps).filter((v) => v > 0).sort((a, b) => a - b);
    const median = (arr) => {
      if (!arr.length) return 0;
      const mid = arr.length >> 1;
      return arr.length % 2 === 0 ? (arr[mid - 1] + arr[mid]) / 2 : arr[mid];
    };
    const medianFps = median(fpsValues);
    const maxDrawCalls = Math.max(...frames.map((f) => f.drawCalls));
    const maxTriangles = Math.max(...frames.map((f) => f.triangles));

    log(`采样帧数 ${frames.length}（唯一 frameId ${distinctIds}）`);
    log(`中位 FPS ${medianFps.toFixed(2)}，最大 draw calls ${maxDrawCalls}，最大三角形 ${maxTriangles}`);
    log(`GPU: ${await page.evaluate(() => {
      const gl = document.createElement('canvas').getContext('webgl2');
      const ext = gl && gl.getExtension('WEBGL_debug_renderer_info');
      return ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : 'unknown';
    })}`);

    // -------- 截图 --------
    console.log('▶ 截图');
    const shots = [
      { name: 'hero1920.png', url: `${BASE}/?debug=1&intro=0&view=hero&time=dawn&weather=clear&tier=balanced`, viewport: { width: 1920, height: 1080 } },
      { name: 'side1920.png', url: `${BASE}/?debug=1&intro=0&view=side&time=dawn&weather=clear&tier=balanced`, viewport: { width: 1920, height: 1080 } },
      { name: 'detail-closeup.png', url: `${BASE}/?debug=1&intro=0&view=detail&time=dawn&weather=clear&tier=balanced`, viewport: { width: 1920, height: 1080 } },
      { name: 'rock-closeup.png', url: `${BASE}/?debug=1&intro=0&view=rock&time=dawn&weather=clear&tier=balanced`, viewport: { width: 1920, height: 1080 } },
      { name: 'night1920.png', url: `${BASE}/?debug=1&intro=0&view=hero&time=night&weather=clear&tier=balanced`, viewport: { width: 1920, height: 1080 } },
      { name: 'storm1920.png', url: `${BASE}/?debug=1&intro=0&view=hero&time=sunset&weather=storm&tier=balanced`, viewport: { width: 1920, height: 1080 } },
      { name: 'mobile375.png', url: `${BASE}/?debug=1&intro=0&view=hero&time=dawn&weather=clear&tier=low`, viewport: { width: 375, height: 812 } },
    ];

    for (const shot of shots) {
      await page.setViewportSize(shot.viewport);
      await page.goto(shot.url, { waitUntil: 'load', timeout: 60000 });
      await page.waitForFunction(() => {
        const d = globalThis.__CASTLE_DEBUG__;
        return d && d.snapshot().state.phase === 'ready';
      }, { timeout: 60000 });
      await page.waitForTimeout(2200);
      await page.evaluate(() => globalThis.__CASTLE_DEBUG__.freezeForEvidence(true));
      await page.waitForTimeout(400);
      await page.screenshot({ path: path.join(OUT_DIR, shot.name) });
      log(`截图 ${shot.name}（${shot.viewport.width}×${shot.viewport.height}）`);
    }

    // -------- 交互走查 --------
    console.log('▶ 交互走查');
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.goto(`${BASE}/?debug=1&intro=0`, { waitUntil: 'load', timeout: 60000 });
    await page.waitForFunction(() => {
      const d = globalThis.__CASTLE_DEBUG__;
      return d && d.snapshot().state.phase === 'ready';
    }, { timeout: 60000 });
    await page.waitForTimeout(1200);

    const actions = [];
    const record = (name, pass, detail) => {
      actions.push({ name, pass, detail });
      log(`${pass ? 'PASS' : 'FAIL'} ${name}${detail ? ` —— ${detail}` : ''}`);
    };

    // 时刻切换
    const before = await page.evaluate(() => globalThis.__CASTLE_DEBUG__.snapshot().state.time);
    await page.click('[data-action="time"][data-value="night"]');
    await page.waitForTimeout(400);
    const after = await page.evaluate(() => globalThis.__CASTLE_DEBUG__.snapshot().state.time);
    record('时刻切换', after === 'night' && after !== before, `${before} → ${after}`);

    // 天气切换
    await page.click('[data-action="weather"][data-value="storm"]');
    await page.waitForTimeout(400);
    const weather = await page.evaluate(() => globalThis.__CASTLE_DEBUG__.snapshot().state.weather);
    record('天气切换', weather === 'storm', `weather=${weather}`);

    // 画质切换
    await page.click('[data-action="tier-menu"]');
    await page.waitForTimeout(200);
    await page.click('[data-action="tier"][data-value="ultra"]');
    await page.waitForTimeout(600);
    const tier = await page.evaluate(() => globalThis.__CASTLE_DEBUG__.snapshot().state.tier);
    record('画质切换', tier === 'ultra', `tier=${tier}`);

    // 镜头预设
    await page.click('[data-action="view-menu"]');
    await page.waitForTimeout(200);
    await page.click('[data-action="view"][data-value="rock"]');
    await page.waitForTimeout(1200);
    const view = await page.evaluate(() => globalThis.__CASTLE_DEBUG__.snapshot().state.view);
    record('镜头预设', view === 'rock', `view=${view}`);

    // 复位
    await page.click('[data-action="reset"]');
    await page.waitForTimeout(1200);
    const resetView = await page.evaluate(() => globalThis.__CASTLE_DEBUG__.snapshot().state.view);
    record('复位视角', resetView === 'hero', `view=${resetView}`);

    // 相机确实动了（拖拽）
    const camBefore = await page.evaluate(() => globalThis.__CASTLE_DEBUG__.snapshot().camera.position);
    await page.mouse.move(960, 540);
    await page.mouse.down();
    await page.mouse.move(1120, 500, { steps: 12 });
    await page.mouse.up();
    await page.waitForTimeout(500);
    const camAfter = await page.evaluate(() => globalThis.__CASTLE_DEBUG__.snapshot().camera.position);
    const moved = camBefore.some((v, i) => Math.abs(v - camAfter[i]) > 0.5);
    record('拖拽改变相机', moved, `${camBefore.map((v) => v.toFixed(1))} → ${camAfter.map((v) => v.toFixed(1))}`);

    // 帮助对话框
    await page.click('[data-action="help"]');
    await page.waitForTimeout(400);
    const dialogOpen = await page.evaluate(() => document.getElementById('help-dialog').open);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
    const dialogClosed = await page.evaluate(() => !document.getElementById('help-dialog').open);
    record('帮助对话框开关', dialogOpen && dialogClosed, `open=${dialogOpen} closedAfterEsc=${dialogClosed}`);

    // 摄影模式：隐藏 UI
    await page.click('[data-action="photo"]');
    await page.waitForTimeout(500);
    const photoOn = await page.evaluate(() => document.body.dataset.photo === 'true');
    await page.keyboard.press('h');
    await page.waitForTimeout(300);
    const photoOff = await page.evaluate(() => document.body.dataset.photo !== 'true');
    record('摄影模式进出', photoOn && photoOff, `on=${photoOn} off=${photoOff}`);

    // 键盘复位
    await page.keyboard.press('r');
    await page.waitForTimeout(600);
    const afterResetKey = await page.evaluate(() => globalThis.__CASTLE_DEBUG__.snapshot().state.view);
    record('R 键复位', afterResetKey === 'hero', `view=${afterResetKey}`);

    // 摄影模式保存 PNG
    await page.click('[data-action="photo"]');
    await page.waitForTimeout(400);
    const downloadPromise = page.waitForEvent('download', { timeout: 15000 }).catch(() => null);
    await page.keyboard.press('s');
    const download = await downloadPromise;
    record('摄影保存 PNG', Boolean(download), download ? download.suggestedFilename() : '未触发下载');
    await page.keyboard.press('h');

    // 深链：无效参数不白屏
    await page.goto(`${BASE}/?debug=1&view=orbit&time=midnight&foo=1`, { waitUntil: 'load', timeout: 60000 });
    await page.waitForTimeout(2500);
    const badUrlOk = await page.evaluate(() => {
      const d = globalThis.__CASTLE_DEBUG__;
      return Boolean(d && d.snapshot().state.phase === 'ready');
    });
    record('非法深链不白屏', badUrlOk, `phase=${await page.evaluate(() => globalThis.__CASTLE_DEBUG__?.snapshot().state.phase)}`);

    // -------- 指标分析 --------
    console.log('▶ 像素指标');
    let metricsExit = 0;
    try {
      execFileSync('node', [path.join(HERE, 'analyze-image.mjs'), path.join(OUT_DIR, 'hero1920.png'), '--out', OUT_DIR], {
        cwd: ROOT,
        stdio: 'inherit',
      });
    } catch (error) {
      metricsExit = error.status ?? 1;
    }

    // -------- 落盘证据 --------
    fs.writeFileSync(path.join(OUT_DIR, 'frames-60.json'), `${JSON.stringify(frames, null, 2)}\n`, 'utf8');
    fs.writeFileSync(path.join(OUT_DIR, 'network.json'), `${JSON.stringify({
      totalRequests: allRequests.length,
      externalAttempts,
      all: allRequests,
    }, null, 2)}\n`, 'utf8');
    fs.writeFileSync(path.join(OUT_DIR, 'console.json'), `${JSON.stringify({
      consoleErrors,
      pageErrors,
    }, null, 2)}\n`, 'utf8');
    fs.writeFileSync(path.join(OUT_DIR, 'actions.json'), `${JSON.stringify(actions, null, 2)}\n`, 'utf8');

    const summary = {
      generatedAt: new Date().toISOString(),
      browser: await browser.version(),
      gpu: await page.evaluate(() => {
        const gl = document.createElement('canvas').getContext('webgl2');
        const ext = gl && gl.getExtension('WEBGL_debug_renderer_info');
        return ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : 'unknown';
      }),
      frames: {
        sampled: frames.length,
        distinctFrameIds: distinctIds,
        medianFps: Number(medianFps.toFixed(3)),
        maxDrawCalls,
        maxTriangles,
        scale: frames[0]?.scale ?? null,
        tier: frames[0]?.tier ?? null,
      },
      consoleErrors: consoleErrors.length,
      pageErrors: pageErrors.length,
      externalAttempts: externalAttempts.length,
      actionsPassed: actions.filter((a) => a.pass).length,
      actionsTotal: actions.length,
      metricsExit,
      thresholds: {
        medianFps: 55,
        maxDrawCalls: 120,
        maxTriangles: 1500000,
        consoleErrors: 0,
        pageErrors: 0,
        externalAttempts: 0,
      },
    };

    const pass =
      summary.consoleErrors === 0 &&
      summary.pageErrors === 0 &&
      summary.externalAttempts === 0 &&
      summary.frames.distinctFrameIds === summary.frames.sampled &&
      summary.frames.sampled >= 60 &&
      summary.frames.medianFps >= 55 &&
      summary.frames.maxDrawCalls <= 120 &&
      summary.frames.maxTriangles <= 1500000 &&
      summary.actionsPassed === summary.actionsTotal &&
      metricsExit === 0;

    summary.pass = pass;
    fs.writeFileSync(path.join(ROOT, 'reports', 'e2e-summary.json'), `${JSON.stringify(summary, null, 2)}\n`, 'utf8');

    console.log('');
    console.log('══════ E2E 汇总 ══════');
    console.log(`  浏览器：${summary.browser}`);
    console.log(`  GPU：${summary.gpu}`);
    console.log(`  采样帧：${summary.frames.sampled}（唯一 ${summary.frames.distinctFrameIds}）`);
    console.log(`  中位 FPS：${summary.frames.medianFps}（要求 ≥55）`);
    console.log(`  draw calls：${summary.frames.maxDrawCalls}（要求 ≤120）`);
    console.log(`  三角形：${summary.frames.maxTriangles}（要求 ≤1500000）`);
    console.log(`  console error：${summary.consoleErrors} / pageerror：${summary.pageErrors} / 外部请求：${summary.externalAttempts}`);
    console.log(`  交互走查：${summary.actionsPassed}/${summary.actionsTotal}`);
    console.log(`  像素指标脚本退出码：${metricsExit}`);
    console.log('');
    console.log(pass ? 'E2E PASS' : 'E2E FAIL');
  } finally {
    await browser?.close();
    try {
      process.kill(-preview.pid);
    } catch {
      /* 预览进程可能已退出 */
    }
  }

  process.exit(0);
}

main().catch((error) => {
  console.error(error);
  process.exit(2);
});
