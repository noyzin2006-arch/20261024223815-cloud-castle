#!/usr/bin/env node
/**
 * AETHERKEEP 云际圣堡 —— 资产校验脚本
 *
 * 用法：node scripts/verify-assets.mjs
 *
 * 本脚本**不信任** manifest 里的任何数字：所有宽高、字节数、sha256、接缝边界差
 * 都从磁盘上的产物文件重新计算，再与 manifest 比对。任何一项不达标即打印原因
 * 并以非 0 退出码结束。
 *
 * 校验项：
 *   1. manifest.json 存在且可解析
 *   2. 每个材质的三联贴图：存在 / 宽高 / 字节数 / sha256 / 格式 / 最小边长 / 体积预算
 *   3. 接缝可平铺性：从**编码后的 albedo 文件**重新计算左右、上下边界 RGB 差
 *   4. 粗糙度：实际像素值落在声明区间内，且确有起伏（不是纯色块）
 *   5. 法线：不是退化贴图，Z 通道朝向正确
 *   6. 海报：存在 / 尺寸 / 体积 / JPEG 魔数 / sha256
 *   7. 字体：五个 woff2 齐备、WOFF2 魔数正确、总体积、fonts.css、OFL 许可证
 *   8. 集成：index.html 引用的资产路径确实存在
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ASSETS = path.join(ROOT, 'public', 'assets');
const MANIFEST_PATH = path.join(ASSETS, 'manifest.json');

/** 体积预算（字节）—— 与规划案一致 */
const BUDGET = {
  albedo: Math.round(1.2 * 1024 * 1024),
  normal: Math.round(0.8 * 1024 * 1024),
  roughness: Math.round(0.35 * 1024 * 1024),
  poster: Math.round(300 * 1024),
  fonts: 6 * 1024 * 1024,
};
/** 贴图最小边长 */
const MIN_TEXTURE_SIZE = 1024;
/** 接缝边界 RGB 差上限 */
const SEAM_MAX = 0.06;
/** 海报尺寸 */
const POSTER_WIDTH = 1024;
const POSTER_HEIGHT = 576;

/** 期望的字体产物 */
const EXPECTED_FONTS = [
  { file: 'fonts/noto-sans-sc-400.woff2', family: 'Noto Sans SC', weight: 400 },
  { file: 'fonts/noto-sans-sc-500.woff2', family: 'Noto Sans SC', weight: 500 },
  { file: 'fonts/noto-serif-sc-600.woff2', family: 'Noto Serif SC', weight: 600 },
  { file: 'fonts/inter-400.woff2', family: 'Inter', weight: 400 },
  { file: 'fonts/inter-600.woff2', family: 'Inter', weight: 600 },
];

const failures = [];
const warnings = [];
const fail = (msg) => failures.push(msg);
const warn = (msg) => warnings.push(msg);

const fmtBytes = (n) => `${n} B（${(n / 1024).toFixed(1)} KB）`;
const pct = (n, d = 3) => `${(n * 100).toFixed(d)}%`;

function sha256File(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

/** 左右边界平均 RGB 差：逐行比较最左列与最右列，归一化到 0–1 */
function edgeRgbDeltaLR(buf, w, h, ch) {
  let sum = 0;
  for (let y = 0; y < h; y++) {
    for (let c = 0; c < 3; c++) {
      sum += Math.abs(buf[(y * w) * ch + c] - buf[(y * w + (w - 1)) * ch + c]);
    }
  }
  return sum / (h * 3 * 255);
}

/** 上下边界平均 RGB 差：逐列比较最上行与最下行 */
function edgeRgbDeltaTB(buf, w, h, ch) {
  let sum = 0;
  for (let x = 0; x < w; x++) {
    for (let c = 0; c < 3; c++) {
      sum += Math.abs(buf[x * ch + c] - buf[((h - 1) * w + x) * ch + c]);
    }
  }
  return sum / (w * 3 * 255);
}

function section(title) {
  console.log(`\n── ${title} ${'─'.repeat(Math.max(0, 62 - title.length))}`);
}

/**
 * 安全地读取图片元信息：文件损坏 / 魔数不对时记录一条失败原因并返回 null，
 * 而不是让整个脚本抛异常退出（那样就无法「逐条打印失败原因」了）。
 */
async function readMeta(file, label) {
  try {
    return await sharp(file).metadata();
  } catch (err) {
    fail(`${label}: 文件无法解码（${err.message}）`);
    console.log(`    ✗ ${label}: 文件无法解码（${err.message}）`);
    return null;
  }
}

/** 安全地解码成 raw 像素平面 */
async function readRaw(file, label) {
  try {
    return await sharp(file).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  } catch (err) {
    fail(`${label}: 文件无法解码为像素（${err.message}）`);
    console.log(`    ✗ ${label}: 文件无法解码为像素（${err.message}）`);
    return null;
  }
}

try {

/* ------------------------------------------------------------------ *
 * 1. manifest
 * ------------------------------------------------------------------ */
section('清单 manifest.json');
let manifest = null;
if (!fs.existsSync(MANIFEST_PATH)) {
  fail(`manifest.json 不存在：${MANIFEST_PATH}`);
  console.log('  ✗ manifest.json 不存在');
} else {
  try {
    manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
    console.log(`  ✓ manifest.json 可解析（${fs.statSync(MANIFEST_PATH).size} B）`);
  } catch (err) {
    fail(`manifest.json 解析失败：${err.message}`);
    console.log(`  ✗ manifest.json 解析失败：${err.message}`);
  }
}

if (!manifest) {
  console.log('\n✗ 清单不可用，无法继续校验。');
  process.exit(1);
}

/* ------------------------------------------------------------------ *
 * 2 + 3 + 4 + 5. 材质
 * ------------------------------------------------------------------ */
section('材质 PBR 三联贴图');
const materials = manifest.materials || [];
if (materials.length !== 8) fail(`manifest 里材质数量为 ${materials.length}，期望 8`);

const seamRows = [];

for (const m of materials) {
  console.log(`\n  ${m.id}（${m.material}）`);
  const maps = [
    ['albedo', m.files?.albedo, BUDGET.albedo],
    ['normal', m.files?.normal, BUDGET.normal],
    ['roughness', m.files?.roughness, BUDGET.roughness],
  ];

  for (const [kind, rel, budget] of maps) {
    if (!rel) {
      fail(`${m.id}: manifest 缺少 ${kind} 文件路径`);
      console.log(`    ✗ ${kind}: manifest 缺少文件路径`);
      continue;
    }
    const file = path.join(ASSETS, rel);
    if (!fs.existsSync(file)) {
      fail(`${m.id}/${kind}: 文件不存在 ${rel}`);
      console.log(`    ✗ ${kind}: 文件不存在 ${rel}`);
      continue;
    }
    const bytes = fs.statSync(file).size;
    const sha = sha256File(file);
    const meta = await readMeta(file, `${m.id}/${kind}`);
    if (!meta) continue;

    // 体积预算
    if (bytes > budget) {
      fail(`${m.id}/${kind}: 体积超预算 ${fmtBytes(bytes)} > ${fmtBytes(budget)}`);
    }
    // 最小边长
    if (Math.min(meta.width, meta.height) < MIN_TEXTURE_SIZE) {
      fail(`${m.id}/${kind}: 尺寸 ${meta.width}×${meta.height} 小于下限 ${MIN_TEXTURE_SIZE}×${MIN_TEXTURE_SIZE}`);
    }
    // 格式
    if (meta.format !== 'webp') {
      fail(`${m.id}/${kind}: 格式为 ${meta.format}，期望 webp`);
    }
    // 与 manifest 比对（在「manifest ↔ 磁盘 一致性」一节统一逐项核对）
    console.log(
      `    ✓ ${kind}: ${path.basename(rel)} ${meta.width}×${meta.height} ${meta.format} ${fmtBytes(bytes)}（预算 ${(budget / 1024).toFixed(0)} KB，占用 ${pct(bytes / budget, 1)}）`
    );
    console.log(`      sha256 ${sha}`);
  }

  // ---- 接缝：从编码后的 albedo 文件重新计算 ----
  const albedoFile = path.join(ASSETS, m.files.albedo);
  if (fs.existsSync(albedoFile)) {
    const dec = await readRaw(albedoFile, `${m.id}/albedo`);
    if (!dec) continue;
    const { data, info } = dec;
    const lr = edgeRgbDeltaLR(data, info.width, info.height, info.channels);
    const tb = edgeRgbDeltaTB(data, info.width, info.height, info.channels);
    console.log(`      接缝复算：左右 ${lr.toFixed(6)}　上下 ${tb.toFixed(6)}（上限 ${SEAM_MAX}）`);
    if (lr > SEAM_MAX) fail(`${m.id}: 左右边界 RGB 差 ${lr.toFixed(6)} > ${SEAM_MAX}`);
    if (tb > SEAM_MAX) fail(`${m.id}: 上下边界 RGB 差 ${tb.toFixed(6)} > ${SEAM_MAX}`);
    // 与 manifest 记录值一致性（容差 0.005，编码误差量级）
    const rec = m.seam || {};
    if (typeof rec.leftRightRgbDelta === 'number' && Math.abs(rec.leftRightRgbDelta - lr) > 0.005) {
      fail(`${m.id}: manifest 记录的左右边界差 ${rec.leftRightRgbDelta} 与实测 ${lr.toFixed(6)} 不一致`);
    }
    if (typeof rec.topBottomRgbDelta === 'number' && Math.abs(rec.topBottomRgbDelta - tb) > 0.005) {
      fail(`${m.id}: manifest 记录的上下边界差 ${rec.topBottomRgbDelta} 与实测 ${tb.toFixed(6)} 不一致`);
    }
    seamRows.push({ id: m.id, lr, tb });
  }

  // ---- 粗糙度：值域 + 起伏 ----
  const roughFile = path.join(ASSETS, m.files.roughness);
  if (fs.existsSync(roughFile)) {
    const dec = await readRaw(roughFile, `${m.id}/roughness`);
    if (!dec) continue;
    const { data, info } = dec;
    let min = 255;
    let max = 0;
    let sum = 0;
    let sum2 = 0;
    const n = info.width * info.height;
    for (let i = 0; i < n; i++) {
      const v = data[i * info.channels]; // 灰度图：R=G=B
      if (v < min) min = v;
      if (v > max) max = v;
      sum += v;
      sum2 += v * v;
    }
    const mean = sum / n;
    const std = Math.sqrt(Math.max(0, sum2 / n - mean * mean));
    const [lo, hi] = m.roughnessRange || [0, 1];
    const eps = 1 / 255 + 1e-6;
    console.log(
      `      粗糙度：实测 ${(min / 255).toFixed(4)}–${(max / 255).toFixed(4)}，均值 ${(mean / 255).toFixed(4)}，标准差 ${(std / 255).toFixed(4)}（声明区间 ${lo}–${hi}）`
    );
    if (min / 255 < lo - eps) fail(`${m.id}: 粗糙度最小值 ${(min / 255).toFixed(4)} 越出声明下界 ${lo}`);
    if (max / 255 > hi + eps) fail(`${m.id}: 粗糙度最大值 ${(max / 255).toFixed(4)} 越出声明上界 ${hi}`);
    if (std / 255 < 0.005) fail(`${m.id}: 粗糙度贴图几乎没有起伏（标准差 ${(std / 255).toFixed(4)}），疑似纯色块`);
  }

  // ---- 法线：非退化 + 朝向 ----
  const normalFile = path.join(ASSETS, m.files.normal);
  if (fs.existsSync(normalFile)) {
    const dec = await readRaw(normalFile, `${m.id}/normal`);
    if (!dec) continue;
    const { data, info } = dec;
    const n = info.width * info.height;
    let sr = 0;
    let sg = 0;
    let sb = 0;
    let tilted = 0;
    for (let i = 0; i < n; i++) {
      const r = data[i * info.channels] / 255;
      const g = data[i * info.channels + 1] / 255;
      const b = data[i * info.channels + 2] / 255;
      sr += r;
      sg += g;
      sb += b;
      const nz = b * 2 - 1;
      if (nz < 0.996) tilted++;
    }
    const meanB = sb / n;
    const tiltedPct = tilted / n;
    console.log(
      `      法线：均值 RGB(${(sr / n).toFixed(4)}, ${(sg / n).toFixed(4)}, ${(sb / n).toFixed(4)})，偏转像素占比 ${pct(tiltedPct, 1)}`
    );
    if (meanB < 0.9) fail(`${m.id}: 法线贴图 Z 通道均值 ${meanB.toFixed(4)} 过低，疑似退化/朝向错误`);
    if (tiltedPct < 0.02) fail(`${m.id}: 法线贴图几乎没有方向变化（偏转像素 ${pct(tiltedPct, 2)}），疑似纯色块`);
  }
}

/* ------------------------------------------------------------------ *
 * 2b. manifest 与磁盘的逐项一致性（sha256 / 字节数 / 宽高）
 * ------------------------------------------------------------------ */
section('manifest ↔ 磁盘 一致性');
let checked = 0;
const entries = manifest.entries || [];
if (entries.length === 0) fail('manifest 的 entries 为空，无法做逐文件核对');

// 1) 贴图：宽高 / 字节数 / sha256
for (const m of materials) {
  for (const kind of ['albedo', 'normal', 'roughness']) {
    const rel = m.files?.[kind];
    if (!rel) continue;
    const file = path.join(ASSETS, rel);
    if (!fs.existsSync(file)) continue;
    const bytes = fs.statSync(file).size;
    const sha = sha256File(file);
    const meta = await readMeta(file, rel);
    if (!meta) continue;
    checked++;
    // manifest 结构里若没有逐文件记录，则用 materials[].processing 里的分辨率做交叉校验
    const resField = { albedo: 'albedoResolution', normal: 'normalResolution', roughness: 'roughnessResolution' }[kind];
    const declared = m.processing?.[resField];
    if (declared && declared !== `${meta.width}x${meta.height}`) {
      fail(`${m.id}/${kind}: manifest 声明 ${declared}，实际 ${meta.width}×${meta.height}`);
    }
    const entry = entries.find((e) => e.file === rel);
    if (!entry) {
      fail(`${rel}: manifest 的 entries 里没有该文件的记录`);
    } else {
      if (entry.bytes !== bytes) fail(`${rel}: manifest 字节数 ${entry.bytes} ≠ 实际 ${bytes}`);
      if (entry.sha256 !== sha) fail(`${rel}: manifest sha256 与实际不一致`);
      if (entry.width !== meta.width || entry.height !== meta.height) {
        fail(`${rel}: manifest 宽高 ${entry.width}×${entry.height} ≠ 实际 ${meta.width}×${meta.height}`);
      }
      if (entry.format && entry.format !== meta.format) {
        fail(`${rel}: manifest 格式 ${entry.format} ≠ 实际 ${meta.format}`);
      }
    }
  }
}

// 2) 清单里登记的每一个文件都必须真实存在，且字节数 / sha256 一致
let entryChecked = 0;
for (const e of entries) {
  const file = path.join(ASSETS, e.file);
  if (!fs.existsSync(file)) {
    fail(`manifest.entries 登记的 ${e.file} 在磁盘上不存在`);
    continue;
  }
  entryChecked++;
  const bytes = fs.statSync(file).size;
  if (e.bytes !== bytes) fail(`${e.file}: manifest 字节数 ${e.bytes} ≠ 实际 ${bytes}`);
  if (e.sha256 && e.sha256 !== sha256File(file)) fail(`${e.file}: manifest sha256 与实际不一致`);
}
console.log(`  ✓ 已逐项比对 ${checked} 个贴图文件 + ${entryChecked} 条 manifest.entries 记录（宽高 / 字节数 / sha256）`);

/* ------------------------------------------------------------------ *
 * 6. 海报
 * ------------------------------------------------------------------ */
section('海报 poster');
const posterRel = manifest.poster?.files?.jpg || 'poster/poster.jpg';
const posterFile = path.join(ASSETS, posterRel);
if (!fs.existsSync(posterFile)) {
  fail(`海报不存在：${posterRel}`);
  console.log(`  ✗ 不存在 ${posterRel}`);
} else {
  const bytes = fs.statSync(posterFile).size;
  const meta = await readMeta(posterFile, 'poster/poster.jpg');
  if (meta) {
  const sha = sha256File(posterFile);
  const magic = fs.readFileSync(posterFile).subarray(0, 3);
  const isJpeg = magic[0] === 0xff && magic[1] === 0xd8 && magic[2] === 0xff;
  console.log(`  ✓ ${posterRel} ${meta.width}×${meta.height} ${meta.format} ${fmtBytes(bytes)}（预算 ${(BUDGET.poster / 1024).toFixed(0)} KB）`);
  console.log(`    sha256 ${sha}`);
  if (meta.width !== POSTER_WIDTH) fail(`海报宽度 ${meta.width} ≠ ${POSTER_WIDTH}`);
  if (meta.height !== POSTER_HEIGHT) fail(`海报高度 ${meta.height} ≠ ${POSTER_HEIGHT}`);
  if (bytes > BUDGET.poster) fail(`海报体积 ${fmtBytes(bytes)} 超预算 ${fmtBytes(BUDGET.poster)}`);
  if (!isJpeg) fail(`海报魔数不是 JPEG（ff d8 ff）`);
  if (meta.format !== 'jpeg') fail(`海报格式为 ${meta.format}，期望 jpeg`);
  const declared = manifest.poster?.sha256;
  if (declared && declared !== sha) fail('海报 sha256 与 manifest 不一致');
  }
}

/* ------------------------------------------------------------------ *
 * 7. 字体
 * ------------------------------------------------------------------ */
section('本地字体');
let fontTotal = 0;
for (const f of EXPECTED_FONTS) {
  const file = path.join(ASSETS, f.file);
  if (!fs.existsSync(file)) {
    fail(`字体缺失：${f.file}`);
    console.log(`  ✗ ${f.file} 不存在`);
    continue;
  }
  const bytes = fs.statSync(file).size;
  fontTotal += bytes;
  const buf = fs.readFileSync(file);
  const magic = buf.subarray(0, 4).toString('latin1');
  const isWoff2 = magic === 'wOF2';
  console.log(`  ✓ ${f.file} ${fmtBytes(bytes)} 魔数=${magic}${isWoff2 ? '' : '  ✗ 不是 WOFF2'}`);
  if (!isWoff2) fail(`${f.file}: 魔数为 ${magic}，不是 WOFF2`);
  if (bytes < 1024) fail(`${f.file}: 体积过小（${bytes} B），疑似空文件`);
  if (buf.subarray(0, 2).toString('latin1') === 'PK') fail(`${f.file}: 是 ZIP 容器，不是 woff2`);
}
console.log(`  · 三家族合计 ${fmtBytes(fontTotal)}（预算 ${(BUDGET.fonts / 1024 / 1024).toFixed(0)} MB）`);
if (fontTotal > BUDGET.fonts) fail(`字体总体积 ${fmtBytes(fontTotal)} 超预算`);

const fontsCss = path.join(ASSETS, 'fonts', 'fonts.css');
if (!fs.existsSync(fontsCss)) {
  fail('fonts.css 不存在');
  console.log('  ✗ fonts.css 不存在');
} else {
  const css = fs.readFileSync(fontsCss, 'utf8');
  const faceCount = (css.match(/@font-face/g) || []).length;
  const swapCount = (css.match(/font-display:\s*swap/g) || []).length;
  console.log(`  ✓ fonts.css：${faceCount} 条 @font-face，${swapCount} 条 font-display: swap`);
  if (faceCount < EXPECTED_FONTS.length) fail(`fonts.css 只有 ${faceCount} 条 @font-face，期望 ${EXPECTED_FONTS.length}`);
  if (swapCount < EXPECTED_FONTS.length) fail(`fonts.css 只有 ${swapCount} 处 font-display: swap`);
  for (const f of EXPECTED_FONTS) {
    if (!css.includes(path.basename(f.file))) fail(`fonts.css 未引用 ${path.basename(f.file)}`);
    if (!css.includes(f.family)) fail(`fonts.css 未声明字体家族 ${f.family}`);
  }
  if (/https?:\/\//.test(css)) fail('fonts.css 含外部 URL，会产生外部字体请求');
}

const ofl = path.join(ASSETS, 'fonts', 'OFL.txt');
if (!fs.existsSync(ofl)) {
  fail('OFL.txt 许可证缺失');
  console.log('  ✗ fonts/OFL.txt 缺失');
} else {
  const text = fs.readFileSync(ofl, 'utf8');
  const hasOfl = /SIL OPEN FONT LICENSE/i.test(text);
  const hasNoto = /Noto/i.test(text);
  const hasInter = /Inter/i.test(text);
  console.log(`  ✓ fonts/OFL.txt：${fs.statSync(ofl).size} B，OFL 条款=${hasOfl}，Noto=${hasNoto}，Inter=${hasInter}`);
  if (!hasOfl) fail('OFL.txt 未包含 SIL OPEN FONT LICENSE 条款');
  if (!hasNoto) fail('OFL.txt 未覆盖 Noto 家族');
  if (!hasInter) fail('OFL.txt 未覆盖 Inter 家族');
}
for (const extra of ['OFL-Noto.txt', 'OFL-Inter.txt']) {
  const p = path.join(ASSETS, 'fonts', extra);
  if (!fs.existsSync(p)) warn(`缺少单家族许可证副本 fonts/${extra}`);
}

/* ------------------------------------------------------------------ *
 * 8. 集成：index.html 引用
 * ------------------------------------------------------------------ */
section('与前端的引用契约');
const indexHtml = path.join(ROOT, 'index.html');
if (!fs.existsSync(indexHtml)) {
  warn('index.html 不存在，跳过引用检查');
} else {
  const html = fs.readFileSync(indexHtml, 'utf8');
  const refs = [...html.matchAll(/(?:src|href)="\.\/assets\/([^"]+)"/g)].map((m) => m[1]);
  let seen = 0;
  for (const ref of refs) {
    seen++;
    const p = path.join(ASSETS, ref);
    if (!fs.existsSync(p)) {
      fail(`index.html 引用 ./assets/${ref}，但该文件不存在`);
      console.log(`  ✗ index.html 引用 ./assets/${ref} —— 文件不存在`);
    }
  }
  console.log(`  ✓ index.html 的 ${seen} 处 ./assets/ 引用全部存在`);
}

// src/config/visual.js 的材质命名属于同事的并行改动，这里只做提示，不参与判定
const visualJs = path.join(ROOT, 'src', 'config', 'visual.js');
if (fs.existsSync(visualJs)) {
  const js = fs.readFileSync(visualJs, 'utf8');
  const names = [...js.matchAll(/'([A-Z]\d{2}-[a-z-]+)-(albedo|normal|roughness)\.webp'/g)].map((m) => m[0].slice(1, -1));
  const missing = names.filter((n) => !fs.existsSync(path.join(ASSETS, 'materials', n)));
  if (missing.length) {
    warn(`src/config/visual.js 声明但磁盘上缺失：${missing.join(', ')}（该文件由并行同事维护，不计入失败判定）`);
  } else if (names.length) {
    console.log(`  · src/config/visual.js 声明的 ${names.length} 个材质文件名均已就位`);
  }
}

// 出处交叉核对：生成侧清单（/tmp/cc_gen/manifest.json）里的 node_id 若与 manifest 记录不符，
// 说明原始图被重新生成过而生成侧清单未同步 —— 提示但不判失败（该文件不在仓库内）。
const genManifest = path.join('/tmp/cc_gen/manifest.json');
if (fs.existsSync(genManifest)) {
  try {
    const gen = JSON.parse(fs.readFileSync(genManifest, 'utf8'));
    const genIds = gen.assets || {};
    const drifted = [];
    for (const m of materials) {
      const upstream = genIds[m.id];
      if (upstream && upstream !== m.source?.nodeId) {
        drifted.push(`${m.id}: 生成侧 ${upstream} ≠ 出处记录 ${m.source.nodeId}`);
      }
    }
    if (drifted.length) {
      warn(`node_id 与生成侧清单不一致（原始图可能被重新生成）：${drifted.join('；')}`);
    } else {
      console.log(`  · ${Object.keys(genIds).length} 个材质 node_id 与生成侧清单一致`);
    }
  } catch (err) {
    warn(`生成侧清单解析失败：${err.message}`);
  }
}

/* ------------------------------------------------------------------ *
 * 汇总
 * ------------------------------------------------------------------ */
console.log('\n════════════════════════════════════════════════════════════');
if (warnings.length) {
  console.log(`⚠ 警告 ${warnings.length} 条：`);
  for (const w of warnings) console.log(`  ⚠ ${w}`);
}
if (failures.length) {
  console.log(`✗ 校验失败 ${failures.length} 项：`);
  for (const f of failures) console.log(`  ✗ ${f}`);
  console.log('════════════════════════════════════════════════════════════');
  process.exit(1);
}
console.log('✓ 全部校验通过（存在性 / 宽高 / 字节数 / sha256 / 接缝边界差 / 体积预算 / 字体 / OFL）');
console.log('════════════════════════════════════════════════════════════');
process.exit(0);
} catch (err) {
  console.log('\n════════════════════════════════════════════════════════════');
  console.log(`✗ 校验过程异常终止：${err.message}`);
  for (const f of failures) console.log(`  ✗ ${f}`);
  console.log('════════════════════════════════════════════════════════════');
  process.exit(1);
}
