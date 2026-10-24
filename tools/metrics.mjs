/**
 * 画面指标内核 —— 纯函数，无副作用，无依赖。
 *
 * 存在的唯一理由：让「画面够不够精致」变成**可被工具量出来的数字**，
 * 而不是报告里的一句「看起来对比度够了」。
 *
 * 指标契约来自已提交的简报 CLOUDCASTLE-02「验收」第 4 条：
 *   - 灰度直方图分桶 ≥ 200
 *   - 99 分位与 1 分位亮度差 ≥ 0.55（不许整体压平成灰白）
 *   - HSV 饱和度中位数 ≥ 0.12（不许整体去色）
 *   - 云层受光面与背光面归一化亮度差 ≥ 0.12
 */

/** Rec. 709 亮度权重 */
const LUMA_R = 0.2126;
const LUMA_G = 0.7152;
const LUMA_B = 0.0722;

/**
 * 把 RGBA8 图像转成亮度数组（0..1），按 Rec. 709 luma。
 * @param {{width:number,height:number,data:Buffer}} image
 * @returns {Float64Array}
 */
export function toLuma(image) {
  const { width, height, data } = image;
  const out = new Float64Array(width * height);
  for (let i = 0, p = 0; i < out.length; i += 1, p += 4) {
    out[i] = (LUMA_R * data[p] + LUMA_G * data[p + 1] + LUMA_B * data[p + 2]) / 255;
  }
  return out;
}

/**
 * 灰度直方图。
 * @param {Float64Array} luma
 * @param {number} buckets 分桶数
 * @returns {number[]} 每桶像素数
 */
export function histogram(luma, buckets = 256) {
  const counts = new Array(buckets).fill(0);
  for (let i = 0; i < luma.length; i += 1) {
    let idx = Math.floor(luma[i] * buckets);
    if (idx < 0) idx = 0;
    if (idx >= buckets) idx = buckets - 1;
    counts[idx] += 1;
  }
  return counts;
}

/**
 * 有内容的分桶数（桶内像素数 > 0）。「画面被压平成灰白」会直接反映在这里。
 * @param {number[]} counts
 * @returns {number}
 */
export function nonEmptyBuckets(counts) {
  return counts.reduce((n, c) => (c > 0 ? n + 1 : n), 0);
}

/**
 * 亮度分位数。
 * @param {Float64Array} luma
 * @param {number} p 0..1
 * @returns {number}
 */
export function lumaPercentile(luma, p) {
  if (!luma.length) return 0;
  const sorted = Float64Array.from(luma).sort();
  const pos = (sorted.length - 1) * Math.min(Math.max(p, 0), 1);
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

/**
 * HSV 饱和度中位数（S = (max - min) / max，max = 0 时取 0）。
 * @param {{width:number,height:number,data:Buffer}} image
 * @returns {number} 0..1
 */
export function saturationMedian(image) {
  const { width, height, data } = image;
  const sats = new Float64Array(width * height);
  for (let i = 0, p = 0; i < sats.length; i += 1, p += 4) {
    const r = data[p] / 255;
    const g = data[p + 1] / 255;
    const b = data[p + 2] / 255;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    sats[i] = max > 0 ? (max - min) / max : 0;
  }
  const sorted = Float64Array.from(sats).sort();
  const mid = sorted.length >> 1;
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

/**
 * 矩形区域平均亮度。rect 为像素坐标 {x, y, w, h}，越界自动裁剪。
 * @param {{width:number,height:number,data:Buffer}} image
 * @param {{x:number,y:number,w:number,h:number}} rect
 * @returns {number} 0..1
 */
export function regionMeanLuma(image, rect) {
  const { width, height, data } = image;
  const x0 = Math.max(0, Math.min(width, Math.round(rect.x)));
  const y0 = Math.max(0, Math.min(height, Math.round(rect.y)));
  const x1 = Math.max(x0, Math.min(width, Math.round(rect.x + rect.w)));
  const y1 = Math.max(y0, Math.min(height, Math.round(rect.y + rect.h)));
  if (x1 <= x0 || y1 <= y0) return 0;

  let sum = 0;
  let n = 0;
  for (let y = y0; y < y1; y += 1) {
    for (let x = x0; x < x1; x += 1) {
      const p = (y * width + x) * 4;
      sum += (LUMA_R * data[p] + LUMA_G * data[p + 1] + LUMA_B * data[p + 2]) / 255;
      n += 1;
    }
  }
  return n ? sum / n : 0;
}

/**
 * 两块区域的归一化亮度差（取绝对值）。
 * @param {{width:number,height:number,data:Buffer}} image
 * @param {{x:number,y:number,w:number,h:number}} a
 * @param {{x:number,y:number,w:number,h:number}} b
 * @returns {number} 0..1
 */
export function regionLumaDelta(image, a, b) {
  return Math.abs(regionMeanLuma(image, a) - regionMeanLuma(image, b));
}

/**
 * 一次性算出全部画面指标。
 * @param {{width:number,height:number,data:Buffer}} image
 * @param {{buckets?:number, litRect?:object, shadowRect?:object}} [opts]
 */
export function analyzeFrame(image, opts = {}) {
  const buckets = opts.buckets ?? 256;
  const luma = toLuma(image);
  const counts = histogram(luma, buckets);
  const p01 = lumaPercentile(luma, 0.01);
  const p99 = lumaPercentile(luma, 0.99);

  const result = {
    width: image.width,
    height: image.height,
    pixels: luma.length,
    histogramBuckets: nonEmptyBuckets(counts),
    histogram: counts,
    lumaP01: p01,
    lumaP99: p99,
    lumaRange: p99 - p01,
    lumaMean: luma.reduce((a, b) => a + b, 0) / (luma.length || 1),
    saturationMedian: saturationMedian(image),
    litLuma: null,
    shadowLuma: null,
    litShadowDelta: null,
  };

  if (opts.litRect && opts.shadowRect) {
    result.litLuma = regionMeanLuma(image, opts.litRect);
    result.shadowLuma = regionMeanLuma(image, opts.shadowRect);
    result.litShadowDelta = Math.abs(result.litLuma - result.shadowLuma);
  }

  return result;
}

/**
 * 按简报第 4 条的阈值逐条判定。
 * @param {ReturnType<typeof analyzeFrame>} m
 * @param {{minBuckets?:number,minRange?:number,minSaturation?:number,minLitShadowDelta?:number}} [thresholds]
 */
export function judgeFrame(m, thresholds = {}) {
  const t = {
    minBuckets: thresholds.minBuckets ?? 200,
    minRange: thresholds.minRange ?? 0.55,
    minSaturation: thresholds.minSaturation ?? 0.12,
    minLitShadowDelta: thresholds.minLitShadowDelta ?? 0.12,
  };
  const checks = [
    { id: 'histogramBuckets', label: '灰度直方图分桶', actual: m.histogramBuckets, min: t.minBuckets, pass: m.histogramBuckets >= t.minBuckets },
    { id: 'lumaRange', label: '亮度 1%~99% 动态范围', actual: m.lumaRange, min: t.minRange, pass: m.lumaRange >= t.minRange },
    { id: 'saturationMedian', label: 'HSV 饱和度中位数', actual: m.saturationMedian, min: t.minSaturation, pass: m.saturationMedian >= t.minSaturation },
  ];
  if (m.litShadowDelta !== null) {
    checks.push({
      id: 'litShadowDelta',
      label: '云层受光/背光亮度差',
      actual: m.litShadowDelta,
      min: t.minLitShadowDelta,
      pass: m.litShadowDelta >= t.minLitShadowDelta,
    });
  }
  return { pass: checks.every((c) => c.pass), checks };
}
