#!/usr/bin/env node
/**
 * 画面指标分析（规划案 §5.7 / AC04）
 *
 * 用法：
 *   node scripts/analyze-image.mjs <图片路径> [--out <输出目录>] [--json <结果文件>]
 *
 * 做的事：
 *   1) 256 桶灰度直方图，统计非零桶数（AC04-1）
 *   2) 全图 sRGB 视觉亮度 P1 / P99 与差值（AC04-2）
 *   3) HSV 饱和度中位数（AC04-3）
 *   4) 两块 64×64 的**真实云区** ROI 的亮度差（AC04-4）
 *      —— 云区由颜色族判定（高亮度 + 低饱和），不允许拿天空或岩层凑数
 *   5) 输出 ROI 叠框图，供人工核对
 *
 * 阈值判定直接输出 PASS / FAIL，不做人工修饰。
 */

import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

import { analyzeFrame, judgeFrame } from '../tools/metrics.mjs';

const ROI_SIZE = 64;
const ROI_MIN_COVERAGE = 0.9;

function parseArgs(argv) {
  const args = { image: null, outDir: 'reports/evidence', json: null };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--out') args.outDir = argv[++i];
    else if (argv[i] === '--json') args.json = argv[++i];
    else if (!args.image) args.image = argv[i];
  }
  return args;
}

/**
 * 云像素判定：高亮度 + 低饱和（云是去饱和的白 / 蓝灰），
 * 且不能是暖色天空带（暖色饱和度更高）。
 */
function isCloudPixel(r, g, b) {
  const max = Math.max(r, g, b) / 255;
  const min = Math.min(r, g, b) / 255;
  const sat = max > 0 ? (max - min) / max : 0;
  const luma = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  if (luma < 0.34) return false;        // 太暗：岩层 / 阴影面
  if (sat > 0.42) return false;        // 太艳：暖色天空 / 植被 / 旗帜
  if (luma > 0.93 && sat < 0.06) return true; // 高亮白顶
  return luma > 0.42 && sat < 0.34;
}

/**
 * 在云掩码里找两块 64×64 区域：一块受光、一块背光。
 * @returns {{lit: object|null, shade: object|null, delta: number, coverageNote: string}}
 */
function findCloudRois(image, mask, width, height) {
  // 每个 64×64 窗口的云覆盖率与平均亮度
  const windows = [];
  const step = 8;
  for (let y = 0; y + ROI_SIZE <= height; y += step) {
    for (let x = 0; x + ROI_SIZE <= width; x += step) {
      let cloudCount = 0;
      let lumaSum = 0;
      for (let j = y; j < y + ROI_SIZE; j += 1) {
        for (let i = x; i < x + ROI_SIZE; i += 1) {
          const idx = j * width + i;
          const p = idx * 4;
          if (mask[idx]) {
            cloudCount += 1;
            lumaSum += (0.2126 * image.data[p] + 0.7152 * image.data[p + 1] + 0.0722 * image.data[p + 2]) / 255;
          }
        }
      }
      const coverage = cloudCount / (ROI_SIZE * ROI_SIZE);
      if (coverage >= ROI_MIN_COVERAGE) {
        windows.push({ x, y, coverage, meanLuma: lumaSum / cloudCount });
      }
    }
  }

  if (windows.length < 2) {
    return { lit: null, shade: null, delta: 0, coverageNote: `合格云区不足（找到 ${windows.length} 个窗口）` };
  }

  // 受光：最亮的云区；背光：**最暗的**合格云区。
  // 取最暗而不是「刚好多 0.12 的那块」—— 后者会把指标做得比实际更容易通过。
  windows.sort((a, b) => b.meanLuma - a.meanLuma);
  const lit = windows[0];
  let shade = null;
  for (const w of windows) {
    if (w === lit) continue;
    if (lit.meanLuma - w.meanLuma < 0.12) continue;
    // 必须离受光区有一定距离，避免两块几乎重合
    const dx = Math.abs(w.x - lit.x);
    const dy = Math.abs(w.y - lit.y);
    if (dx < ROI_SIZE && dy < ROI_SIZE) continue;
    if (!shade || w.meanLuma < shade.meanLuma) shade = w;
  }

  if (!shade) {
    return { lit, shade: null, delta: 0, coverageNote: '找不到同时满足覆盖率与亮度差的背光云区' };
  }

  return {
    lit,
    shade,
    delta: Math.abs(lit.meanLuma - shade.meanLuma),
    coverageNote: '',
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.image) {
    console.error('用法：node scripts/analyze-image.mjs <图片路径> [--out <目录>] [--json <文件>]');
    process.exit(2);
  }
  const imagePath = path.resolve(args.image);
  if (!fs.existsSync(imagePath)) {
    console.error(`图片不存在：${imagePath}`);
    process.exit(2);
  }

  const { data, info } = await sharp(imagePath)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const image = { width: info.width, height: info.height, data };
  const metrics = analyzeFrame(image, { buckets: 256 });

  // 云掩码
  const mask = new Uint8Array(info.width * info.height);
  for (let i = 0; i < mask.length; i += 1) {
    const p = i * 4;
    mask[i] = isCloudPixel(image.data[p], image.data[p + 1], image.data[p + 2]) ? 1 : 0;
  }

  const rois = findCloudRois(image, mask, info.width, info.height);

  const result = {
    image: path.basename(imagePath),
    width: info.width,
    height: info.height,
    histogramBuckets: metrics.histogramBuckets,
    lumaP01: metrics.lumaP01,
    lumaP99: metrics.lumaP99,
    lumaRange: metrics.lumaRange,
    lumaMean: metrics.lumaMean,
    saturationMedian: metrics.saturationMedian,
    cloudLitRoi: rois.lit ? { x: rois.lit.x, y: rois.lit.y, coverage: rois.lit.coverage, meanLuma: rois.lit.meanLuma } : null,
    cloudShadeRoi: rois.shade ? { x: rois.shade.x, y: rois.shade.y, coverage: rois.shade.coverage, meanLuma: rois.shade.meanLuma } : null,
    cloudLumaDelta: rois.delta,
    cloudRoiNote: rois.coverageNote,
  };

  const verdict = judgeFrame(
    {
      ...metrics,
      litShadowDelta: rois.shade ? rois.delta : null,
    },
  );
  result.verdict = verdict;

  // 叠框图
  fs.mkdirSync(args.outDir, { recursive: true });
  const overlayPath = path.join(args.outDir, 'cloud-rois.png');
  const overlay = await sharp(imagePath)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const od = overlay.data;
  const drawBox = (roi, r, g, b) => {
    if (!roi) return;
    for (let t = 0; t < ROI_SIZE; t += 1) {
      for (const [x, y] of [
        [roi.x + t, roi.y], [roi.x + t, roi.y + ROI_SIZE - 1],
        [roi.x, roi.y + t], [roi.x + ROI_SIZE - 1, roi.y + t],
      ]) {
        const p = (y * info.width + x) * 4;
        od[p] = r; od[p + 1] = g; od[p + 2] = b; od[p + 3] = 255;
      }
    }
  };
  drawBox(rois.lit, 255, 210, 60);
  drawBox(rois.shade, 60, 200, 255);
  await sharp(od, { raw: { width: info.width, height: info.height, channels: 4 } })
    .png()
    .toFile(overlayPath);

  const jsonPath = args.json ?? path.join(args.outDir, 'visual-metrics.json');
  fs.writeFileSync(jsonPath, `${JSON.stringify(result, null, 2)}\n`, 'utf8');

  console.log(`图片：${result.image}（${result.width}×${result.height}）`);
  console.log(`  灰度直方图非零桶：${result.histogramBuckets}（要求 ≥200）`);
  console.log(`  亮度 P1=${result.lumaP01.toFixed(4)} P99=${result.lumaP99.toFixed(4)} 差=${result.lumaRange.toFixed(4)}（要求 ≥0.55）`);
  console.log(`  HSV 饱和度中位：${result.saturationMedian.toFixed(4)}（要求 ≥0.12）`);
  if (result.cloudLitRoi && result.cloudShadeRoi) {
    console.log(`  受光云 ROI：(${result.cloudLitRoi.x},${result.cloudLitRoi.y}) 覆盖 ${(result.cloudLitRoi.coverage * 100).toFixed(1)}% 亮度 ${result.cloudLitRoi.meanLuma.toFixed(4)}`);
    console.log(`  背光云 ROI：(${result.cloudShadeRoi.x},${result.cloudShadeRoi.y}) 覆盖 ${(result.cloudShadeRoi.coverage * 100).toFixed(1)}% 亮度 ${result.cloudShadeRoi.meanLuma.toFixed(4)}`);
    console.log(`  两块云亮度差：${result.cloudLumaDelta.toFixed(4)}（要求 ≥0.12）`);
  } else {
    console.log(`  云 ROI：${result.cloudRoiNote}`);
  }
  console.log(`  叠框图：${overlayPath}`);
  console.log(`  指标 JSON：${jsonPath}`);
  for (const check of verdict.checks) {
    console.log(`  ${check.pass ? 'PASS' : 'FAIL'} ${check.label}：实际 ${check.actual.toFixed(4)} / 阈值 ${check.min}`);
  }

  process.exit(verdict.pass ? 0 : 3);
}

main().catch((error) => {
  console.error(error);
  process.exit(2);
});
