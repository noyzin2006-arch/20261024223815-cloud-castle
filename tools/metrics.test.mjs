/**
 * 画面指标内核的单测 —— 纯函数，零外部依赖。
 * 运行：node --test tools/metrics.test.mjs
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { decodePng, decodePngSafe } from './png.mjs';
import {
  analyzeFrame,
  histogram,
  judgeFrame,
  lumaPercentile,
  nonEmptyBuckets,
  regionLumaDelta,
  regionMeanLuma,
  saturationMedian,
  toLuma,
} from './metrics.mjs';
import { encodePng, gradientImage, solidImage, splitImage } from './png-fixture.mjs';

test('PNG 解码：RGBA 往返一致', () => {
  const width = 8;
  const height = 4;
  const rgba = Buffer.alloc(width * height * 4);
  for (let i = 0; i < width * height; i += 1) {
    rgba[i * 4] = i * 3;
    rgba[i * 4 + 1] = 255 - i * 2;
    rgba[i * 4 + 2] = 128;
    rgba[i * 4 + 3] = 255;
  }
  const png = encodePng(width, height, rgba, 6);
  const decoded = decodePng(png);
  assert.equal(decoded.width, width);
  assert.equal(decoded.height, height);
  assert.deepEqual([...decoded.data], [...rgba]);
});

test('PNG 解码：RGB 与灰度色彩类型都归一到 RGBA', () => {
  const width = 4;
  const height = 4;
  const rgb = Buffer.alloc(width * height * 3);
  for (let i = 0; i < width * height; i += 1) {
    rgb[i * 3] = 200; rgb[i * 3 + 1] = 100; rgb[i * 3 + 2] = 50;
  }
  const decodedRgb = decodePng(encodePng(width, height, rgb, 2));
  assert.equal(decodedRgb.data[0], 200);
  assert.equal(decodedRgb.data[1], 100);
  assert.equal(decodedRgb.data[2], 50);
  assert.equal(decodedRgb.data[3], 255, '不透明像素的 alpha 应为 255');

  const gray = Buffer.alloc(width * height).fill(77);
  const decodedGray = decodePng(encodePng(width, height, gray, 0));
  assert.equal(decodedGray.data[0], 77);
  assert.equal(decodedGray.data[1], 77);
  assert.equal(decodedGray.data[2], 77);
  assert.equal(decodedGray.data[3], 255);
});

test('PNG 解码：非法输入被安全捕获', () => {
  assert.equal(decodePngSafe(Buffer.from('not a png')), null);
  assert.equal(decodePngSafe(Buffer.alloc(0)), null);
  assert.throws(() => decodePng(Buffer.alloc(4)), /长度不足|签名/);
});

test('亮度换算用 Rec.709 权重', () => {
  const image = { width: 1, height: 1, data: Buffer.from([255, 255, 255, 255]) };
  const luma = toLuma(image);
  assert.ok(Math.abs(luma[0] - 1) < 1e-9);

  const red = { width: 1, height: 1, data: Buffer.from([255, 0, 0, 255]) };
  assert.ok(Math.abs(toLuma(red)[0] - 0.2126) < 1e-9);
});

test('直方图分桶与有效分桶数', () => {
  const luma = new Float64Array([0, 0.5, 0.5, 1]);
  const counts = histogram(luma, 2);
  // 0.0 → 桶 0；0.5 与 1.0 → 桶 1（1.0 越界被夹到最后一个桶）
  assert.deepEqual(counts, [1, 3]);
  assert.equal(nonEmptyBuckets(counts), 2);

  // 整张图压平成一个亮度 → 只有一个有效分桶
  const flat = new Float64Array(10).fill(0.5);
  assert.equal(nonEmptyBuckets(histogram(flat, 256)), 1);
});

test('亮度分位数', () => {
  const luma = Float64Array.from([0, 0.25, 0.5, 0.75, 1]);
  assert.equal(lumaPercentile(luma, 0), 0);
  assert.equal(lumaPercentile(luma, 1), 1);
  assert.equal(lumaPercentile(luma, 0.5), 0.5);
  assert.ok(Math.abs(lumaPercentile(luma, 0.25) - 0.25) < 1e-9);
});

test('饱和度中位数：灰色为 0，彩色大于 0', () => {
  const gray = { width: 1, height: 1, data: Buffer.from([128, 128, 128, 255]) };
  assert.equal(saturationMedian(gray), 0);

  const red = { width: 1, height: 1, data: Buffer.from([255, 0, 0, 255]) };
  assert.equal(saturationMedian(red), 1);

  const mixed = {
    width: 2,
    height: 1,
    data: Buffer.from([255, 0, 0, 255, 128, 128, 128, 255]),
  };
  assert.equal(saturationMedian(mixed), 0.5);
});

test('区域平均亮度与两区域亮度差', () => {
  // 左半列全白、右半列全黑：按「列」切分
  const width = 10;
  const height = 10;
  const data = Buffer.alloc(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const v = x < width / 2 ? 255 : 0;
      const p = (y * width + x) * 4;
      data[p] = v; data[p + 1] = v; data[p + 2] = v; data[p + 3] = 255;
    }
  }
  const image = { width, height, data };
  const lit = regionMeanLuma(image, { x: 0, y: 0, w: 5, h: 10 });
  const shadow = regionMeanLuma(image, { x: 5, y: 0, w: 5, h: 10 });
  assert.ok(Math.abs(lit - 1) < 1e-9, `受光区亮度应为 1，实际 ${lit}`);
  assert.ok(Math.abs(shadow - 0) < 1e-9, `背光区亮度应为 0，实际 ${shadow}`);
  assert.ok(Math.abs(regionLumaDelta(image, { x: 0, y: 0, w: 5, h: 10 }, { x: 5, y: 0, w: 5, h: 10 }) - 1) < 1e-9);
});

test('区域坐标越界自动裁剪而不是抛错', () => {
  const image = { width: 4, height: 4, data: solidImage(4, 4, [10, 20, 30, 255]) };
  const v = regionMeanLuma(image, { x: -5, y: -5, w: 100, h: 100 });
  assert.ok(v >= 0 && v <= 1);
  assert.equal(regionMeanLuma(image, { x: 100, y: 100, w: 10, h: 10 }), 0);
});

test('analyzeFrame + judgeFrame：灰白压平图必须判不通过', () => {
  // 一整张中灰 → 动态范围 0、饱和度 0、分桶 1 → 三条全挂
  const flatImage = decodePng(encodePng(64, 64, solidImage(64, 64, [128, 128, 128, 255]), 6));
  const m = analyzeFrame(flatImage, { buckets: 256 });
  assert.equal(m.histogramBuckets, 1);
  assert.equal(m.lumaRange, 0);
  assert.equal(m.saturationMedian, 0);

  const verdict = judgeFrame(m);
  assert.equal(verdict.pass, false);
  const byId = Object.fromEntries(verdict.checks.map((c) => [c.id, c.pass]));
  assert.equal(byId.histogramBuckets, false);
  assert.equal(byId.lumaRange, false);
  assert.equal(byId.saturationMedian, false);
});

test('analyzeFrame + judgeFrame：高动态范围彩色画面应当通过', () => {
  const rgba = gradientImage(160, 120);
  const image = decodePng(encodePng(160, 120, rgba, 6));
  const m = analyzeFrame(image, {
    buckets: 256,
    litRect: { x: 8, y: 8, w: 56, h: 56 },
    shadowRect: { x: 96, y: 56, w: 56, h: 56 },
  });
  assert.ok(m.histogramBuckets >= 200, `期望 >=200 个有效分桶，实际 ${m.histogramBuckets}`);
  assert.ok(m.lumaRange >= 0.55, `期望亮度范围 >=0.55，实际 ${m.lumaRange}`);
  assert.ok(m.saturationMedian >= 0.12, `期望饱和度 >=0.12，实际 ${m.saturationMedian}`);
  assert.ok(m.litShadowDelta >= 0.12, `期望受光/背光差 >=0.12，实际 ${m.litShadowDelta}`);

  const verdict = judgeFrame(m);
  assert.equal(verdict.pass, true, JSON.stringify(verdict.checks));
});
