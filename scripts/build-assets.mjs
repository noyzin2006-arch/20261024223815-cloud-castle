#!/usr/bin/env node
/**
 * AETHERKEEP 云际圣堡 —— 离线资产构建脚本
 *
 * 从 AI 生成的原始图出发，产出可上线的 PBR 材质三联贴图、海报、本地字体子集、
 * 资产清单与出处证据文档。
 *
 * 用法：
 *   node scripts/build-assets.mjs
 *
 * 环境变量：
 *   AK_RAW_DIR         原始 AI 图目录（默认 /tmp/cc_gen/raw）
 *   AK_FONT_CACHE_DIR  字体源文件缓存目录（默认 assets/raw/fonts，已在 .gitignore 内）
 *   AK_SKIP_FONTS=1    跳过字体子集化（仅用于字体产物已就绪的增量构建）
 *
 * 幂等：重复执行覆盖同一批产物，结果逐字节可复现（所有随机量都由固定 seed 驱动）。
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');

const RAW_DIR = path.resolve(process.env.AK_RAW_DIR || '/tmp/cc_gen/raw');
const RAW_COPY_DIR = path.join(ROOT, 'assets', 'raw');
const FONT_CACHE_DIR = path.resolve(process.env.AK_FONT_CACHE_DIR || path.join(ROOT, 'assets', 'raw', 'fonts'));
const OUT_DIR = path.join(ROOT, 'public', 'assets');
const MAT_DIR = path.join(OUT_DIR, 'materials');
const POSTER_DIR = path.join(OUT_DIR, 'poster');
const FONT_DIR = path.join(OUT_DIR, 'fonts');

const GENERATED_ON = '2026-10-24';

/* ------------------------------------------------------------------ *
 * 管线常量（规划案 §5.5 / 本任务规格）
 * ------------------------------------------------------------------ */

/** 源图分辨率（AI 出图为 2K 正方形） */
const SRC_SIZE = 2048;
/** 接缝混合带宽（源图像素）；输出分辨率变化时按比例缩放 */
const SEAM_BAND_SRC = 96;
/** 法线强度：规格要求落在 0.45–0.65，写死 0.55（与 src/config/visual.js normalStrength 一致） */
const NORMAL_STRENGTH = 0.55;
/** 法线斜率目标（乘以 NORMAL_STRENGTH 之前），约 28° 起伏 */
const NORMAL_TARGET_SLOPE = 0.95;
/** 高度场高通的两个尺度（像素半径） */
const NORMAL_BLUR_SMALL = 4;
const NORMAL_BLUR_LARGE = 24;
/** 高度场软阈值收缩的分位点：压掉颗粒与 JPEG 块噪声，保留灰缝/裂纹等结构 */
const NORMAL_SHRINK_PERCENTILE = 0.65;
/** 收缩后轻微模糊，消除折角 */
const NORMAL_POST_BLUR = 1;
/** 坡度上限（缩放后的梯度模长），避免极端法线 */
const NORMAL_SLOPE_CLAMP = 2.2;
/**
 * 高度场放大倍数上限。真实需要的倍数由梯度分位数决定：砌块类约 8–50，
 * 金属/木类（结构弱）可达 150 以上。固定上限 24 会把这类材质的法线压成近乎平面，
 * 因此这里放开到 200，由坡度上限（NORMAL_SLOPE_CLAMP）负责压制极端法线。
 */
const NORMAL_SCALE_MAX = 200;
/** 法线色阶量化（64 级 = 6bit/通道），把大片平坦区压成完全一致的像素以利无损压缩 */
const NORMAL_QUANT_LEVELS = 64;
/** 暗缝（灰缝 / 板缝 / 裂纹）额外下压的高度，单位与归一化高度同尺度 */
const SEAM_DEPTH = 1.35;
/** 粗糙度里亮度与噪声的权重 */
const ROUGH_LUMA_WEIGHT = 0.62;
/** 粗糙度噪声 seed 基值（每个材质按索引派生，保证确定性） */
const ROUGH_SEED_BASE = 0x5eed1a07;

/**
 * 法线编码回退阶梯：1024 分辨率下若仍超预算，依次提高软阈值分位点与模糊半径，
 * 换取更低的熵（结构起伏保留，平坦区更多）。
 */
const NORMAL_LADDER = [
  { shrink: NORMAL_SHRINK_PERCENTILE, postBlur: NORMAL_POST_BLUR },
  { shrink: 0.72, postBlur: 1 },
  { shrink: 0.78, postBlur: 2 },
];

/**
 * 编码阶梯的安全余量：构建时按预算的 97% 选取参数，避免产物贴着上限
 * （不同 libvips 版本或源图微调都可能让边界值翻越）。verify 脚本仍按
 * 硬预算（100%）判定。
 */
const ENCODE_SAFETY = 0.97;

/** 体积预算（字节） */
const BUDGET = {
  albedo: Math.round(1.2 * 1024 * 1024),
  normal: Math.round(0.8 * 1024 * 1024),
  roughness: Math.round(0.35 * 1024 * 1024),
  poster: Math.round(300 * 1024),
};

/** 贴图最小边长（规格硬下限） */
const MIN_TEXTURE_SIZE = 1024;
/** 海报尺寸 */
const POSTER_WIDTH = 1024;
const POSTER_HEIGHT = 576;

/* ------------------------------------------------------------------ *
 * 材质表：id / 原始文件 / node_id / 完整英文 prompt / 粗糙度区间
 * ------------------------------------------------------------------ */

const MATERIALS = [
  {
    id: 'A01-castle-ashlar',
    raw: 'A01-castle-ashlar.jpg',
    nodeId: '455893884334435',
    roughness: [0.66, 0.9],
    material: '城堡外墙石灰岩砌块 (cool pale limestone ashlar)',
    prompt:
      'cool pale limestone ashlar blocks, irregular 20-40 cm mortar seams, age stains and sparse lichen, seamless tileable texture, flat even lighting, no shadows, no objects, orthographic top-down, photorealistic PBR albedo map, evenly exposed, no specular reflections baked in, no perspective, no text, no watermark',
  },
  {
    id: 'A02-sandstone-voussoir',
    raw: 'A02-sandstone-voussoir.jpg',
    nodeId: '455894147842514',
    roughness: [0.66, 0.9],
    material: '拱券砂岩楔石 (warm taupe weathered sandstone voussoir)',
    prompt:
      'warm taupe weathered sandstone voussoir blocks, fine iron mineral bands, seamless tileable texture, flat even lighting, no shadows, no objects, orthographic top-down, photorealistic PBR albedo map, evenly exposed, no specular reflections baked in, no perspective, no text, no watermark',
  },
  {
    id: 'A03-basalt-foundation',
    raw: 'A03-basalt-foundation.jpg',
    nodeId: '455893800169708',
    roughness: [0.66, 0.9],
    material: '基座玄武岩砌体 (dark blue basalt foundation masonry)',
    prompt:
      'dark blue basalt foundation masonry, subtle chalk mortar, seamless tileable texture, flat even lighting, no shadows, no objects, orthographic top-down, photorealistic PBR albedo map, evenly exposed, no specular reflections baked in, no perspective, no text, no watermark',
  },
  {
    id: 'A04-slate-roof',
    raw: 'A04-slate-roof.jpg',
    nodeId: '455893800169704',
    roughness: [0.56, 0.75],
    material: '屋顶蓝灰板岩瓦 (overlapping blue charcoal slate roof tiles)',
    prompt:
      'overlapping blue charcoal slate roof tiles, chipped edges and varied hue, seamless tileable texture, flat even lighting, no shadows, no objects, orthographic top-down, photorealistic PBR albedo map, evenly exposed, no specular reflections baked in, no perspective, no text, no watermark',
  },
  {
    id: 'A05-stratified-cliff',
    raw: 'A05-stratified-cliff.jpg',
    // 首版出图是高饱和锈红砂岩，与「冷蓝青背光 / 浅灰石墙」的固定美术方向冲突，
    // 因此按同一提示词配方追加「冷灰、去饱和」约束重新生成，并同步更新 node id 与出处记录。
    nodeId: '455902498427008',
    roughness: [0.66, 0.9],
    material: '浮岛崖壁层状沉积岩 · 冷灰 (wind eroded stratified sedimentary cliff, pale cool grey-beige)',
    prompt:
      'wind eroded stratified sedimentary cliff face in pale cool grey-beige limestone, horizontal layers and fissures, desaturated muted tones, no orange or red rust tones, seamless tileable texture, flat even lighting, no shadows, no objects, orthographic top-down, photorealistic PBR albedo map, evenly exposed, no specular reflections baked in, no perspective, no text, no watermark',
  },
  {
    id: 'A06-flagstone-path',
    raw: 'A06-flagstone-path.jpg',
    nodeId: '455894214062552',
    roughness: [0.66, 0.9],
    material: '石板路 (old flagstone pathway with moss)',
    prompt:
      'old flagstone pathway with patchy moss and chipped limestone, seamless tileable texture, flat even lighting, no shadows, no objects, orthographic top-down, photorealistic PBR albedo map, evenly exposed, no specular reflections baked in, no perspective, no text, no watermark',
  },
  {
    id: 'A07-carved-oak',
    raw: 'A07-carved-oak.jpg',
    nodeId: '455893682532658',
    roughness: [0.56, 0.75],
    material: '雕刻橡木板材 (dark carved oak planks)',
    prompt:
      'dark carved oak planks, continuous aged grain, narrow board seams, seamless tileable texture, flat even lighting, no shadows, no objects, orthographic top-down, photorealistic PBR albedo map, evenly exposed, no specular reflections baked in, no perspective, no text, no watermark',
  },
  {
    id: 'A08-aged-bronze',
    raw: 'A08-aged-bronze.jpg',
    nodeId: '455894182822073',
    roughness: [0.32, 0.55],
    material: '陈旧青铜板 (aged bronze sheet metal with green patina)',
    prompt:
      'aged bronze sheet metal, subtle hammered dents and green patina, diffuse-only albedo, seamless tileable texture, flat even lighting, no shadows, no objects, orthographic top-down, photorealistic PBR albedo map, evenly exposed, no specular reflections baked in, no perspective, no text, no watermark',
  },
];

const POSTER = {
  id: 'poster',
  raw: 'poster.jpg',
  nodeId: '455894147842552',
  material: '16:9 概念海报 / 无 WebGL2 时的静态备用图',
  prompt:
    'wide painterly concept art of a soaring stone gothic castle on an eroded floating island above a dramatic layered cloud sea at golden blue dawn, primary architecture center-right, deep cool cloud shadows and amber highlights, empty editorial title-safe space on left, no text, no logo',
};

/* ------------------------------------------------------------------ *
 * 小工具
 * ------------------------------------------------------------------ */

const log = (...args) => console.log(...args);
const stage = (title) => log(`\n▸ ${title}`);
const step = (title) => log(`  · ${title}`);

function sha256File(file) {
  const h = crypto.createHash('sha256');
  h.update(fs.readFileSync(file));
  return h.digest('hex');
}

function sha256Buf(buf) {
  return crypto.createHash('sha256').update(buf).digest('hex');
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function writeFile(file, data) {
  ensureDir(path.dirname(file));
  fs.writeFileSync(file, data);
}

/** 平滑阶跃（Hermite），用于接缝权重 */
function smoothstep(t) {
  if (t <= 0) return 0;
  if (t >= 1) return 1;
  return t * t * (3 - 2 * t);
}

/* ------------------------------------------------------------------ *
 * 像素级运算（全部在 raw RGB / 灰度平面上做，保证可复现）
 * ------------------------------------------------------------------ */

/**
 * 可平铺边界处理（mirror fill / 镜像填充）。
 *
 * 目标：让左右边缘（上下边缘）在平铺后**逐像素连续**。
 * 做法：右侧带（w-B … w-1）用左侧带（0 … B-1）的镜像内容填充，权重沿 smoothstep
 * 从 0 升到 1；左侧带本身保持原样。于是 G[w-1] 与 G[0] 像素级相等，平铺后接缝处
 * 零跳变。下侧带同理镜像上侧带。
 *
 * 为什么不用「循环平移 + 淡化」：那种做法只能让接缝两侧落在原图**相邻**的两个像素上，
 * 边界差 ≈ 单像素梯度。本组贴图颗粒很重，单像素梯度本身就有 0.05 左右，达不到
 * ≤0.06 的门槛且毫无余量；镜像填充让边界差落到 0。
 *
 * 顺序：先垂直、后水平。这样水平方向的相等关系 G[w-1] === G[0] 对**所有行**成立；
 * 垂直方向仅在右下角 96 列因两次填充叠加而略有残差（实测 ~0.002）。
 */
function spliceWrap(buf, w, h, ch, band) {
  const at = (x, y, c) => buf[((y + h) % h) * w * ch + ((x + w) % w) * ch + c];

  // ---- 垂直方向：下侧带镜像上侧带（上侧带保持原样） ----
  for (let x = 0; x < w; x++) {
    for (let y = h - band; y < h; y++) {
      const s = smoothstep((y - (h - band)) / (band - 1));
      if (s <= 0) continue;
      const sy = h - 1 - y; // 镜像源行 ∈ [0, band)
      for (let k = 0; k < ch; k++) {
        const i = y * w * ch + x * ch + k;
        buf[i] = buf[i] + (at(x, sy, k) - buf[i]) * s;
      }
    }
  }

  // ---- 水平方向：右侧带镜像左侧带（左侧带保持原样） ----
  for (let y = 0; y < h; y++) {
    for (let x = w - band; x < w; x++) {
      const s = smoothstep((x - (w - band)) / (band - 1));
      if (s <= 0) continue;
      const sx = w - 1 - x; // 镜像源列 ∈ [0, band)
      for (let k = 0; k < ch; k++) {
        const i = y * w * ch + x * ch + k;
        buf[i] = buf[i] + (at(sx, y, k) - buf[i]) * s;
      }
    }
  }
  return buf;
}

/** 环形边界差：逐行比较最左列与最右列的 RGB 绝对差，返回 0–1 归一化均值 */
function edgeRgbDeltaLR(buf, w, h, ch) {
  let sum = 0;
  for (let y = 0; y < h; y++) {
    for (let c = 0; c < 3; c++) {
      sum += Math.abs(buf[(y * w) * ch + c] - buf[(y * w + (w - 1)) * ch + c]);
    }
  }
  return sum / (h * 3 * 255);
}

/** 环形边界差：逐列比较最上行与最下行 */
function edgeRgbDeltaTB(buf, w, h, ch) {
  let sum = 0;
  for (let x = 0; x < w; x++) {
    for (let c = 0; c < 3; c++) {
      sum += Math.abs(buf[x * ch + c] - buf[((h - 1) * w + x) * ch + c]);
    }
  }
  return sum / (w * 3 * 255);
}

/** Rec.709 亮度（0–1） */
function luminance(buf, w, h, ch) {
  const l = new Float32Array(w * h);
  for (let i = 0, p = 0; i < buf.length; i += ch, p++) {
    l[p] = (0.2126 * buf[i] + 0.7152 * buf[i + 1] + 0.0722 * buf[i + 2]) / 255;
  }
  return l;
}

/** 环形盒式模糊（两次 pass 近似高斯） */
function boxBlurWrap(src, w, h, radius, passes = 2) {
  const r = Math.max(1, Math.round(radius));
  let a = Float32Array.from(src);
  let b = new Float32Array(src.length);
  const inv = 1 / (2 * r + 1);
  for (let p = 0; p < passes; p++) {
    // 水平
    for (let y = 0; y < h; y++) {
      const row = y * w;
      let sum = 0;
      for (let i = -r; i <= r; i++) sum += a[row + ((i % w) + w) % w];
      for (let x = 0; x < w; x++) {
        b[row + x] = sum * inv;
        sum -= a[row + ((x - r) % w + w) % w];
        sum += a[row + ((x + r + 1) % w + w) % w];
      }
    }
    // 垂直
    for (let x = 0; x < w; x++) {
      let sum = 0;
      for (let i = -r; i <= r; i++) sum += b[(((i % h) + h) % h) * w + x];
      for (let y = 0; y < h; y++) {
        a[y * w + x] = sum * inv;
        sum -= b[((((y - r) % h) + h) % h) * w + x];
        sum += b[((((y + r + 1) % h) + h) % h) * w + x];
      }
    }
  }
  return a;
}

/** 百分位（对副本排序，不破坏原数组） */
function percentile(arr, p) {
  const s = Float32Array.from(arr).sort();
  return s[Math.min(s.length - 1, Math.max(0, Math.floor(s.length * p)))];
}

/** mulberry32：确定性 PRNG */
function mulberry32(seed) {  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 确定性 value noise（环形，双线性 + smoothstep 插值） */
function valueNoise(w, h, cell, seed) {
  const gw = Math.ceil(w / cell) + 1;
  const gh = Math.ceil(h / cell) + 1;
  const rnd = mulberry32(seed);
  const grid = new Float32Array(gw * gh);
  for (let i = 0; i < grid.length; i++) grid[i] = rnd();
  const out = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    const gy = y / cell;
    const y0 = Math.floor(gy);
    const sy = smoothstep(gy - y0);
    for (let x = 0; x < w; x++) {
      const gx = x / cell;
      const x0 = Math.floor(gx);
      const sx = smoothstep(gx - x0);
      const i00 = grid[y0 * gw + x0];
      const i10 = grid[y0 * gw + x0 + 1];
      const i01 = grid[(y0 + 1) * gw + x0];
      const i11 = grid[(y0 + 1) * gw + x0 + 1];
      const top = i00 + (i10 - i00) * sx;
      const bot = i01 + (i11 - i01) * sx;
      out[y * w + x] = top + (bot - top) * sy;
    }
  }
  return out;
}

/** 3×3 Sobel 梯度（环形），返回 dx / dy（dy 以图像行号向下为正） */
function sobel3x3(field, w, h) {
  const gx = new Float32Array(w * h);
  const gy = new Float32Array(w * h);
  const F = (x, y) => field[(((y % h) + h) % h) * w + (((x % w) + w) % w)];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const tl = F(x - 1, y - 1);
      const t = F(x, y - 1);
      const tr = F(x + 1, y - 1);
      const l = F(x - 1, y);
      const r = F(x + 1, y);
      const bl = F(x - 1, y + 1);
      const b = F(x, y + 1);
      const br = F(x + 1, y + 1);
      gx[y * w + x] = (tr + 2 * r + br - (tl + 2 * l + bl)) / 8;
      gy[y * w + x] = (bl + 2 * b + br - (tl + 2 * t + tr)) / 8;
    }
  }
  return { gx, gy };
}

/* ------------------------------------------------------------------ *
 * 材质构建
 * ------------------------------------------------------------------ */

/** 读原始图（按内容而非后缀：sharp 自行嗅探魔数） */
async function readRaw(file) {
  const buf = fs.readFileSync(file);
  const img = sharp(buf, { failOn: 'none' });
  const meta = await img.metadata();
  return { buf, meta };
}

/** 把已混合的 RGB 平面编码为 WebP */
async function encodeWebp(plane, w, h, ch, opts) {
  return sharp(plane, { raw: { width: w, height: h, channels: ch } })
    .webp(opts)
    .toBuffer();
}

/**
 * 选择既满足体积预算又尽量保留分辨率的 albedo 编码参数。
 * 阶梯：先保分辨率、微降质量（2048@82/80/78），仍超预算才降尺寸到 1536/1280/1024，
 * 最后才降质量到 76/68。任何一档都不低于 1024×1024。
 */
async function pickAlbedo(plane, w, h) {
  const ladder = [
    { size: SRC_SIZE, quality: 82 },
    { size: SRC_SIZE, quality: 80 },
    { size: SRC_SIZE, quality: 78 },
    { size: 1536, quality: 82 },
    { size: 1536, quality: 80 },
    { size: 1280, quality: 82 },
    { size: MIN_TEXTURE_SIZE, quality: 82 },
    { size: MIN_TEXTURE_SIZE, quality: 76 },
    { size: MIN_TEXTURE_SIZE, quality: 68 },
  ];

  const limit = BUDGET.albedo * ENCODE_SAFETY;
  const tried = [];
  for (const opt of ladder) {
    const resized = opt.size === w ? { buf: plane, w, h } : await resizePlane(plane, w, h, opt.size);
    const out = await encodeWebp(resized.buf, resized.w, resized.h, 3, { quality: opt.quality });
    tried.push(`${opt.size}@q${opt.quality}=${(out.length / 1024).toFixed(0)}KB`);
    if (out.length <= limit) {
      return { ...opt, buf: out, plane: resized, tried };
    }
  }
  const last = ladder[ladder.length - 1];
  const resized = await resizePlane(plane, w, h, last.size);
  const out = await encodeWebp(resized.buf, resized.w, resized.h, 3, { quality: last.quality });
  return { ...last, buf: out, plane: resized, tried, overBudget: true };
}

/** 最近邻/盒式缩放的 RGB 平面（Lanczos 由 sharp 完成，这里只做几何搬运） */
async function resizePlane(plane, w, h, size) {
  if (size === w) return { buf: plane, w, h };
  const out = await sharp(plane, { raw: { width: w, height: h, channels: 3 } })
    .resize(size, size, { kernel: 'lanczos3', fit: 'fill' })
    .raw()
    .toBuffer();
  return { buf: out, w: size, h: size };
}

/** 采集产物文件的完整描述：文件名 / 字节数 / 宽高 / sha256 / 格式 */
async function describeFile(file, rel, extra = {}) {
  const meta = await sharp(file).metadata();
  return {
    file: rel,
    bytes: fs.statSync(file).size,
    width: meta.width,
    height: meta.height,
    format: meta.format,
    sha256: sha256File(file),
    ...extra,
  };
}

/**
 * 由 albedo 平面推导高度图 → 法线贴图。
 *
 * 高度 = 多尺度亮度高通（减去两个尺度的模糊亮度）+ 暗缝掩码下压。
 * 高通结果再做**软阈值收缩**：把细颗粒与 JPEG 块噪声压平，只保留灰缝、裂纹、
 * 板缝这类真正的结构。这样大片区域变成「完全平坦」，法线图的无损 WebP 体积
 * 从 10.8MB 降到 ~0.5MB，而结构起伏完整保留。
 */
function buildNormal(albedoPlane, w, h, strength, seamDepth, shrinkP = NORMAL_SHRINK_PERCENTILE, postBlur = NORMAL_POST_BLUR) {
  const luma = luminance(albedoPlane, w, h, 3);

  // 多尺度高通：减去两个尺度的模糊亮度
  const blurSmall = boxBlurWrap(luma, w, h, NORMAL_BLUR_SMALL, 2);
  const blurLarge = boxBlurWrap(luma, w, h, NORMAL_BLUR_LARGE, 2);
  const hp = new Float32Array(w * h);
  for (let i = 0; i < hp.length; i++) {
    hp[i] = 0.65 * (luma[i] - blurSmall[i]) + 0.35 * (luma[i] - blurLarge[i]);
  }

  // 软阈值收缩（分位点自适应）
  const absHp = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) absHp[i] = Math.abs(hp[i]);
  const thr = percentile(absHp, shrinkP);
  if (thr > 1e-6) {
    for (let i = 0; i < w * h; i++) {
      const v = hp[i];
      const a = Math.abs(v) - thr;
      hp[i] = a <= 0 ? 0 : Math.sign(v) * (a * a) / (2 * thr);
    }
  }

  // 收缩后的轻微模糊：抹平折角
  const height = boxBlurWrap(hp, w, h, postBlur, 2);

  // 暗缝掩码：明显暗于局部均值的细线（灰缝 / 板缝 / 裂纹）
  // 深度按高度场的均方根归一，避免掩码压过高通结构本身；掩码本身先平滑，
  // 让灰缝变成连续沟槽而不是锯齿线（同时大幅降低法线图熵）。
  const localMean = boxBlurWrap(luma, w, h, 5, 2);
  const maskRaw = new Float32Array(w * h);
  for (let i = 0; i < maskRaw.length; i++) {
    const d = localMean[i] - luma[i] - 0.015;
    maskRaw[i] = d <= 0 ? 0 : Math.min(1, d / 0.08);
  }
  const mask = boxBlurWrap(maskRaw, w, h, 2, 2);
  let sq = 0;
  for (let i = 0; i < height.length; i++) sq += height[i] * height[i];
  const rms = Math.sqrt(sq / height.length) || 1e-6;
  const maskDepth = seamDepth * rms * 0.3;
  for (let i = 0; i < height.length; i++) {
    height[i] -= mask[i] * maskDepth;
  }

  // Sobel 梯度 → 法线；梯度分位数自适应定标 + 坡度上限
  const { gx: rawGx, gy: rawGy } = sobel3x3(height, w, h);
  const mags = new Float32Array(rawGx.length);
  for (let i = 0; i < mags.length; i++) {
    mags[i] = Math.hypot(rawGx[i], rawGy[i]);
  }
  const p95 = percentile(mags, 0.95) || 1e-6;
  const scale = Math.min(NORMAL_SCALE_MAX, Math.max(0.5, NORMAL_TARGET_SLOPE / p95));

  const out = Buffer.allocUnsafe(w * h * 3);
  const q = NORMAL_QUANT_LEVELS;
  for (let i = 0; i < w * h; i++) {
    let gx = rawGx[i] * scale;
    let gy = rawGy[i] * scale;
    const m = Math.hypot(gx, gy);
    if (m > NORMAL_SLOPE_CLAMP) {
      gx = (gx / m) * NORMAL_SLOPE_CLAMP;
      gy = (gy / m) * NORMAL_SLOPE_CLAMP;
    }
    // OpenGL / +Y-up 切线空间约定（与 three.js 默认 flipY=true 对齐）：
    // N = normalize(-dh/du, -dh/dv, 1)，而图像行号向下 ⇒ dv = -dy ⇒ N.y = +dh/dy
    const nx = -gx * strength;
    const ny = gy * strength;
    const nz = 1;
    const len = Math.hypot(nx, ny, nz) || 1;
    const quant = (v) => Math.round(v * q) / q;
    out[i * 3] = Math.round(quant((nx / len) * 0.5 + 0.5) * 255);
    out[i * 3 + 1] = Math.round(quant((ny / len) * 0.5 + 0.5) * 255);
    out[i * 3 + 2] = Math.round(quant((nz / len) * 0.5 + 0.5) * 255);
  }
  return out;
}

/**
 * 粗糙度贴图：albedo 亮度 + 固定 seed 的高频轻噪，线性映射到该材质的区间。
 */
function buildRoughness(albedoPlane, w, h, range, seed) {
  const luma = luminance(albedoPlane, w, h, 3);
  const n1 = valueNoise(w, h, 16, seed);
  const n2 = valueNoise(w, h, 4, seed ^ 0x9e3779b9);
  const out = Buffer.allocUnsafe(w * h * 3);
  for (let i = 0; i < w * h; i++) {
    const noise = 0.55 * n1[i] + 0.45 * n2[i];
    const t = ROUGH_LUMA_WEIGHT * luma[i] + (1 - ROUGH_LUMA_WEIGHT) * noise;
    const r = range[0] + (range[1] - range[0]) * Math.min(1, Math.max(0, t));
    const v = Math.round(r * 255);
    out[i * 3] = v;
    out[i * 3 + 1] = v;
    out[i * 3 + 2] = v;
  }
  return out;
}

/* ------------------------------------------------------------------ *
 * 字体（分支 1：pyftsubset 子集化）
 * ------------------------------------------------------------------ */

const FONT_SOURCES = [
  {
    family: 'Noto Sans SC',
    file: 'noto-sans-sc-400.woff2',
    weight: 400,
    style: 'normal',
    varFile: 'noto-sans-sc-var.ttf',
    varUrl: 'https://raw.githubusercontent.com/google/fonts/main/ofl/notosanssc/NotoSansSC%5Bwght%5D.ttf',
    licenseFile: 'noto-sans-sc-OFL.txt',
    licenseUrl: 'https://raw.githubusercontent.com/google/fonts/main/ofl/notosanssc/OFL.txt',
    instances: { wght: 400 },
    cssFamily: 'Noto Sans SC',
  },
  {
    family: 'Noto Sans SC',
    file: 'noto-sans-sc-500.woff2',
    weight: 500,
    style: 'normal',
    varFile: 'noto-sans-sc-var.ttf',
    varUrl: 'https://raw.githubusercontent.com/google/fonts/main/ofl/notosanssc/NotoSansSC%5Bwght%5D.ttf',
    licenseFile: 'noto-sans-sc-OFL.txt',
    licenseUrl: 'https://raw.githubusercontent.com/google/fonts/main/ofl/notosanssc/OFL.txt',
    instances: { wght: 500 },
    cssFamily: 'Noto Sans SC',
  },
  {
    family: 'Noto Serif SC',
    file: 'noto-serif-sc-600.woff2',
    weight: 600,
    style: 'normal',
    varFile: 'noto-serif-sc-var.ttf',
    varUrl: 'https://raw.githubusercontent.com/google/fonts/main/ofl/notoserifsc/NotoSerifSC%5Bwght%5D.ttf',
    licenseFile: 'noto-serif-sc-OFL.txt',
    licenseUrl: 'https://raw.githubusercontent.com/google/fonts/main/ofl/notoserifsc/OFL.txt',
    instances: { wght: 600 },
    cssFamily: 'Noto Serif SC',
  },
  {
    family: 'Inter',
    file: 'inter-400.woff2',
    weight: 400,
    style: 'normal',
    varFile: 'inter-var.ttf',
    varUrl: 'https://raw.githubusercontent.com/google/fonts/main/ofl/inter/Inter%5Bopsz,wght%5D.ttf',
    licenseFile: 'inter-OFL.txt',
    licenseUrl: 'https://raw.githubusercontent.com/google/fonts/main/ofl/inter/OFL.txt',
    instances: { wght: 400, opsz: 14 },
    cssFamily: 'Inter',
  },
  {
    family: 'Inter',
    file: 'inter-600.woff2',
    weight: 600,
    style: 'normal',
    varFile: 'inter-var.ttf',
    varUrl: 'https://raw.githubusercontent.com/google/fonts/main/ofl/inter/Inter%5Bopsz,wght%5D.ttf',
    licenseFile: 'inter-OFL.txt',
    licenseUrl: 'https://raw.githubusercontent.com/google/fonts/main/ofl/inter/OFL.txt',
    instances: { wght: 600, opsz: 14 },
    cssFamily: 'Inter',
  },
];

/** 从仓库里提取界面用到的字符（index.html + src/** 的标记、属性与字符串） */
function extractRepoCharset() {
  const files = [];
  const walk = (dir) => {
    if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) return;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
      const p = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(p);
      else if (/\.(html|css|js|mjs|json)$/.test(entry.name)) files.push(p);
    }
  };
  const indexHtml = path.join(ROOT, 'index.html');
  if (fs.existsSync(indexHtml)) files.push(indexHtml);
  walk(path.join(ROOT, 'src'));
  const set = new Set();
  for (const f of files) {
    const text = fs.readFileSync(f, 'utf8');
    for (const ch of text) set.add(ch);
  }
  return { set, files: files.map((f) => path.relative(ROOT, f)) };
}

const EXTRA_CHARSET = [
  // 全部 ASCII 可见字符
  ...Array.from({ length: 95 }, (_, i) => String.fromCharCode(32 + i)),
  // 常用中文标点
  ...'，。、；：？！「」『』（）《》—…·',
  ...'！？，。；：、（）［］｛｝〈〉《》「」『』【】〔〕〖〗“”‘’＂＇～￥',
  // 数字（含全角）
  ...'0123456789',
  ...'０１２３４５６７８９',
  // 常用量词
  ...'个只条张件本台部辆块片支把双对群座栋间层次遍回些位名头家场段份顶颗粒束株棵朵盏匹类项处步声点眼口心身手面尺斤元角分',
  // 中文数字与时间单位
  ...'零一二三四五六七八九十百千万亿年月日时分秒毫刻周旬季',
  // 界面常见词保险字符（超出规格最低要求，便于后续文案微调不丢字形）
  ...'加载中完成成功失败提示警告确认取消保存删除新建编辑复制粘贴撤销重做刷新重试继续暂停停止退出全屏设置帮助关于版本作者版权隐私政策同意拒绝返回主页前后左右上下开关开启关闭状态剩余进度百分秒帧率分辨率亮度对比度饱和度阴影反射折射漫高光环境日光月光云雾雨雪雷风霾画质档级别阶段第几号名称类型日期时间地点请稍候暂无空',
].join('');

function buildCharset() {
  const { set, files } = extractRepoCharset();
  const all = new Set(set);
  for (const ch of EXTRA_CHARSET) all.add(ch);
  // 只保留可打印字符
  for (const ch of Array.from(all)) {
    const code = ch.codePointAt(0);
    const printable =
      (code >= 0x20 && code <= 0x7e) ||
      (code >= 0xa0 && code <= 0x2fff) ||
      (code >= 0x3000 && code <= 0x303f) ||
      (code >= 0x4e00 && code <= 0x9fff) ||
      (code >= 0xf900 && code <= 0xfaff) ||
      (code >= 0xff00 && code <= 0xffef) ||
      (code >= 0x2000 && code <= 0x206f);
    if (!printable) all.delete(ch);
  }
  const chars = Array.from(all).sort();
  return { chars, sourceFiles: files };
}

function download(url, dest) {
  if (fs.existsSync(dest) && fs.statSync(dest).size > 1024) return false;
  ensureDir(path.dirname(dest));
  execFileSync('curl', ['-sSL', '--fail', '--max-time', '240', '-o', dest, url], { stdio: 'inherit' });
  return true;
}

function run(cmd, args) {
  return execFileSync(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'], encoding: 'utf8' });
}

/**
 * 子集化：优先用 pyftsubset 命令，找不到就退回 `python3 -m fontTools.subset`
 * （两者是同一个 fontTools.subset 入口，输出等价）。
 */
function subsetFont(args) {
  try {
    run('pyftsubset', args);
    return 'pyftsubset';
  } catch (err) {
    if (err.code === 'ENOENT') {
      run('python3', ['-m', 'fontTools.subset', ...args]);
      return 'fontTools.subset';
    }
    throw err;
  }
}

/* ------------------------------------------------------------------ *
 * 主流程
 * ------------------------------------------------------------------ */

async function main() {
  const t0 = Date.now();
  log('════ AETHERKEEP 离线资产管线 ════');
  log(`原始图目录：${RAW_DIR}`);
  log(`字体缓存目录：${FONT_CACHE_DIR}`);

  if (!fs.existsSync(RAW_DIR)) {
    throw new Error(`原始图目录不存在：${RAW_DIR}（可用 AK_RAW_DIR 覆盖）`);
  }

  ensureDir(MAT_DIR);
  ensureDir(POSTER_DIR);
  ensureDir(FONT_DIR);
  ensureDir(RAW_COPY_DIR);

  // ---------- 阶段 1：复制原始图到 assets/raw（已 gitignore） ----------
  stage('阶段 1／6：归档原始图到 assets/raw/');
  const rawFiles = fs.readdirSync(RAW_DIR).filter((f) => fs.statSync(path.join(RAW_DIR, f)).isFile());
  for (const f of rawFiles) {
    const dest = path.join(RAW_COPY_DIR, f);
    fs.copyFileSync(path.join(RAW_DIR, f), dest);
    step(`归档 ${f}（${(fs.statSync(dest).size / 1024 / 1024).toFixed(2)} MB）`);
  }

  // ---------- 阶段 2：材质三联贴图 ----------
  stage('阶段 2／6：材质 PBR 三联贴图（albedo / normal / roughness）');
  const materials = [];

  for (let mi = 0; mi < MATERIALS.length; mi++) {
    const m = MATERIALS[mi];
    const rawPath = path.join(RAW_DIR, m.raw);
    if (!fs.existsSync(rawPath)) throw new Error(`缺少原始图：${rawPath}`);

    const { buf: rawBuf, meta } = await readRaw(rawPath);
    const rawSha = sha256Buf(rawBuf);
    step(`── ${m.id}（源 ${meta.format} ${meta.width}×${meta.height}，node_id=${m.nodeId}）`);

    // --- 母版平面：原始图缩放到 2048（不做接缝处理） ---
    const master = await sharp(rawBuf, { failOn: 'none' })
      .removeAlpha()
      .resize(SRC_SIZE, SRC_SIZE, { kernel: 'lanczos3', fit: 'fill' })
      .raw()
      .toBuffer({ resolveWithObject: true });
    const masterPlane = master.data;
    const masterW = master.info.width;
    const masterH = master.info.height;
    const masterCh = master.info.channels;

    /** 取指定分辨率的接缝处理平面：缩放 → 镜像填充边界带 */
    const preparePlane = async (size) => {
      const plane =
        size === masterW
          ? Buffer.from(masterPlane)
          : await sharp(masterPlane, { raw: { width: masterW, height: masterH, channels: masterCh } })
              .resize(size, size, { kernel: 'lanczos3', fit: 'fill' })
              .raw()
              .toBuffer();
      const band = Math.max(48, Math.round((SEAM_BAND_SRC * size) / SRC_SIZE));
      spliceWrap(plane, size, size, masterCh, band);
      return { plane, size, band };
    };

    // --- 接缝处理 + albedo 编码 ---
    step(`  正在处理 ${m.id} 接缝（${SEAM_BAND_SRC}px 镜像填充边界带 + smoothstep 混合）`);
    const albedoPlane = await preparePlane(SRC_SIZE);
    const lr = edgeRgbDeltaLR(albedoPlane.plane, albedoPlane.size, albedoPlane.size, masterCh);
    const tb = edgeRgbDeltaTB(albedoPlane.plane, albedoPlane.size, albedoPlane.size, masterCh);
    step(`  接缝自检：左右边界 RGB 差 ${lr.toFixed(5)}，上下边界 RGB 差 ${tb.toFixed(5)}（阈值 ≤0.06）`);
    if (lr > 0.06 || tb > 0.06) {
      throw new Error(`${m.id} 接缝自检未达标（LR=${lr.toFixed(5)} TB=${tb.toFixed(5)}）`);
    }

    const albedo = await pickAlbedo(albedoPlane.plane, albedoPlane.size, albedoPlane.size);
    step(`  albedo：${albedo.size}×${albedo.size} q${albedo.quality} → ${(albedo.buf.length / 1024).toFixed(0)} KB（预算 ${(BUDGET.albedo / 1024).toFixed(0)} KB）`);
    step(`    编码阶梯实测：${albedo.tried.join('  ')}`);
    if (albedo.overBudget) throw new Error(`${m.id} albedo 超出体积预算`);

    const albedoFile = path.join(MAT_DIR, `${m.id}-albedo.webp`);
    writeFile(albedoFile, albedo.buf);

    // 接缝指标以「实际编码后的文件」为准，而不是编码前的平面
    const albedoDecoded = await sharp(albedoFile).removeAlpha().raw().toBuffer({ resolveWithObject: true });
    const lrOut = edgeRgbDeltaLR(albedoDecoded.data, albedoDecoded.info.width, albedoDecoded.info.height, albedoDecoded.info.channels);
    const tbOut = edgeRgbDeltaTB(albedoDecoded.data, albedoDecoded.info.width, albedoDecoded.info.height, albedoDecoded.info.channels);
    step(`  成品接缝复核（解码自 ${path.basename(albedoFile)}）：左右 ${lrOut.toFixed(5)}，上下 ${tbOut.toFixed(5)}`);
    if (lrOut > 0.06 || tbOut > 0.06) {
      throw new Error(`${m.id} 成品接缝复核未达标（LR=${lrOut.toFixed(5)} TB=${tbOut.toFixed(5)}）`);
    }

    // --- 法线贴图 ---
    step(`  正在处理 ${m.id} 法线（多尺度高通高度图 → 3×3 Sobel → OpenGL 切线空间）`);
    const normalTried = [];
    let normalSize = albedo.size;
    let normalBuf = await encodeWebp(
      buildNormal(albedoPlane.plane, albedoPlane.size, albedoPlane.size, NORMAL_STRENGTH, SEAM_DEPTH),
      albedoPlane.size,
      albedoPlane.size,
      3,
      { lossless: true }
    );
    normalTried.push(`${albedo.size}px=${(normalBuf.length / 1024).toFixed(0)}KB`);
    if (normalBuf.length > BUDGET.normal) {
      // 降到 1024：重新从缩放并重新做过接缝处理的 albedo 推导，比直接缩放法线图干净
      const small = await preparePlane(MIN_TEXTURE_SIZE);
      normalSize = small.size;
      for (const opt of NORMAL_LADDER) {
        normalBuf = await encodeWebp(
          buildNormal(small.plane, small.size, small.size, NORMAL_STRENGTH, SEAM_DEPTH, opt.shrink, opt.postBlur),
          small.size,
          small.size,
          3,
          { lossless: true }
        );
        normalTried.push(`${small.size}px 收缩${opt.shrink}=${(normalBuf.length / 1024).toFixed(0)}KB`);
        if (normalBuf.length <= BUDGET.normal * ENCODE_SAFETY) break;
      }
      step(`  normal：超出预算，改用 ${normalSize}×${normalSize} 无损 WebP → ${(normalBuf.length / 1024).toFixed(0)} KB`);
    } else {
      step(`  normal：${normalSize}×${normalSize} 无损 WebP → ${(normalBuf.length / 1024).toFixed(0)} KB（预算 ${(BUDGET.normal / 1024).toFixed(0)} KB）`);
    }
    step(`    编码阶梯实测：${normalTried.join('  ')}`);
    if (normalBuf.length > BUDGET.normal) {
      throw new Error(`${m.id} normal 超出体积预算：${normalBuf.length}`);
    }
    const normalFile = path.join(MAT_DIR, `${m.id}-normal.webp`);
    writeFile(normalFile, normalBuf);

    // --- 粗糙度贴图 ---
    step(`  正在处理 ${m.id} 粗糙度（albedo 亮度 + 固定 seed 高频轻噪 → ${m.roughness[0]}–${m.roughness[1]}）`);
    const roughSeed = (ROUGH_SEED_BASE + mi * 7919) >>> 0;
    const roughTried = [];
    let roughSize = albedo.size;
    let roughBuf = await encodeWebp(
      buildRoughness(albedoPlane.plane, albedoPlane.size, albedoPlane.size, m.roughness, roughSeed),
      albedoPlane.size,
      albedoPlane.size,
      3,
      { quality: 92 }
    );
    roughTried.push(`${albedo.size}px=${(roughBuf.length / 1024).toFixed(0)}KB`);
    if (roughBuf.length > BUDGET.roughness * ENCODE_SAFETY) {
      const small = await preparePlane(MIN_TEXTURE_SIZE);
      roughSize = small.size;
      roughBuf = await encodeWebp(
        buildRoughness(small.plane, small.size, small.size, m.roughness, roughSeed),
        small.size,
        small.size,
        3,
        { quality: 92 }
      );
      roughTried.push(`${small.size}px=${(roughBuf.length / 1024).toFixed(0)}KB`);
    }
    step(`  roughness：${roughSize}×${roughSize} → ${(roughBuf.length / 1024).toFixed(0)} KB（预算 ${(BUDGET.roughness / 1024).toFixed(0)} KB）`);
    step(`    编码阶梯实测：${roughTried.join('  ')}`);
    if (roughBuf.length > BUDGET.roughness) {
      throw new Error(`${m.id} roughness 超出体积预算：${roughBuf.length}`);
    }
    const roughFile = path.join(MAT_DIR, `${m.id}-roughness.webp`);
    writeFile(roughFile, roughBuf);

    materials.push({
      id: m.id,
      material: m.material,
      roughnessRange: m.roughness,
      source: {
        rawFile: m.raw,
        rawFormat: meta.format,
        rawDimensions: `${meta.width}x${meta.height}`,
        rawBytes: rawBuf.length,
        rawSha256: rawSha,
        nodeId: m.nodeId,
        generatedOn: GENERATED_ON,
        prompt: m.prompt,
      },
      processing: {
        seamBandPx: albedoPlane.band,
        sourceResolution: `${masterW}x${masterH}`,
        albedoQuality: albedo.quality,
        albedoResolution: `${albedo.size}x${albedo.size}`,
        normalResolution: `${normalSize}x${normalSize}`,
        normalStrength: NORMAL_STRENGTH,
        normalConvention: 'OpenGL / +Y-up tangent space (three.js default flipY=true)',
        roughnessResolution: `${roughSize}x${roughSize}`,
        roughnessSeed: (ROUGH_SEED_BASE + mi * 7919) >>> 0,
      },
      seam: {
        leftRightRgbDelta: Number(lrOut.toFixed(6)),
        topBottomRgbDelta: Number(tbOut.toFixed(6)),
        measuredOn: 'encoded albedo file (decoded)',
      },
      files: {
        albedo: path.relative(OUT_DIR, albedoFile).split(path.sep).join('/'),
        normal: path.relative(OUT_DIR, normalFile).split(path.sep).join('/'),
        roughness: path.relative(OUT_DIR, roughFile).split(path.sep).join('/'),
      },
    });
  }

  // ---------- 阶段 3：海报 ----------
  stage('阶段 3／6：海报（1024×576，index.html 引用 poster.jpg）');
  const posterRaw = path.join(RAW_DIR, POSTER.raw);
  const posterRawBuf = fs.readFileSync(posterRaw);
  const posterMeta = await sharp(posterRawBuf, { failOn: 'none' }).metadata();
  step(`  源海报：${posterMeta.format} ${posterMeta.width}×${posterMeta.height}`);

  let posterJpg = await sharp(posterRawBuf, { failOn: 'none' })
    .removeAlpha()
    .resize(POSTER_WIDTH, POSTER_HEIGHT, { kernel: 'lanczos3', fit: 'fill' })
    .jpeg({ quality: 82, mozjpeg: false, chromaSubsampling: '4:2:0' })
    .toBuffer();
  let posterQuality = 82;
  while (posterJpg.length > BUDGET.poster && posterQuality > 55) {
    posterQuality -= 6;
    posterJpg = await sharp(posterRawBuf, { failOn: 'none' })
      .removeAlpha()
      .resize(POSTER_WIDTH, POSTER_HEIGHT, { kernel: 'lanczos3', fit: 'fill' })
      .jpeg({ quality: posterQuality, chromaSubsampling: '4:2:0' })
      .toBuffer();
  }
  step(`  poster.jpg：${POSTER_WIDTH}×${POSTER_HEIGHT} q${posterQuality} → ${(posterJpg.length / 1024).toFixed(0)} KB（预算 ${(BUDGET.poster / 1024).toFixed(0)} KB）`);
  if (posterJpg.length > BUDGET.poster) throw new Error('海报超出体积预算');
  writeFile(path.join(POSTER_DIR, 'poster.jpg'), posterJpg);

  const posterWebp = await sharp(posterRawBuf, { failOn: 'none' })
    .removeAlpha()
    .resize(POSTER_WIDTH, POSTER_HEIGHT, { kernel: 'lanczos3', fit: 'fill' })
    .webp({ quality: 84 })
    .toBuffer();
  writeFile(path.join(POSTER_DIR, 'poster.webp'), posterWebp);
  step(`  poster.webp：${(posterWebp.length / 1024).toFixed(0)} KB（附加产物）`);

  const poster = {
    id: POSTER.id,
    material: POSTER.material,
    source: {
      rawFile: POSTER.raw,
      rawFormat: posterMeta.format,
      rawDimensions: `${posterMeta.width}x${posterMeta.height}`,
      rawBytes: posterRawBuf.length,
      rawSha256: sha256Buf(posterRawBuf),
      nodeId: POSTER.nodeId,
      generatedOn: GENERATED_ON,
      prompt: POSTER.prompt,
    },
    processing: {
      quality: posterQuality,
      width: POSTER_WIDTH,
      height: POSTER_HEIGHT,
      note: 'index.html 与静态备用页引用 assets/poster/poster.jpg',
    },
    files: {
      jpg: 'poster/poster.jpg',
      webp: 'poster/poster.webp',
    },
  };

  // ---------- 阶段 4：字体子集化 ----------
  stage('阶段 4／6：本地字体子集化（pyftsubset，OFL 可再分发）');
  let fonts = [];
  if (process.env.AK_SKIP_FONTS === '1') {
    step('  AK_SKIP_FONTS=1 —— 跳过字体构建，沿用已有产物');
    fonts = readExistingFonts();
  } else {
    fonts = buildFonts();
  }

  // ---------- 阶段 5：清单 ----------
  stage('阶段 5／6：生成 public/assets/manifest.json');

  // 逐文件清单：文件名 / 字节数 / 宽高 / sha256 / 格式（前端一次拿到全部资产信息）
  const entries = [];
  for (const m of materials) {
    for (const kind of ['albedo', 'normal', 'roughness']) {
      const rel = m.files[kind];
      entries.push(await describeFile(path.join(OUT_DIR, rel), rel, { id: m.id, kind }));
    }
  }
  entries.push(
    await describeFile(path.join(OUT_DIR, poster.files.jpg), poster.files.jpg, {
      id: poster.id,
      kind: 'poster',
      note: 'index.html 与静态备用页引用此文件',
    })
  );
  if (fs.existsSync(path.join(OUT_DIR, poster.files.webp))) {
    entries.push(
      await describeFile(path.join(OUT_DIR, poster.files.webp), poster.files.webp, {
        id: poster.id,
        kind: 'poster-alt',
      })
    );
  }
  for (const f of fonts) {
    entries.push({
      file: f.file,
      bytes: f.bytes,
      sha256: f.sha256,
      family: f.family,
      weight: f.weight,
      style: f.style,
      license: f.license,
      kind: 'font',
    });
  }
  for (const lic of fontLicenses) {
    const p = path.join(OUT_DIR, lic.file);
    entries.push({
      file: lic.file,
      bytes: fs.statSync(p).size,
      sha256: sha256File(p),
      kind: 'license',
      covers: lic.covers,
      license: lic.license,
    });
  }

  const manifest = {
    generatedOn: GENERATED_ON,
    generator: 'scripts/build-assets.mjs',
    base: 'public/assets',
    entries,
    materials,
    poster,
    fonts: fonts.map((f) => ({
      family: f.family,
      weight: f.weight,
      style: f.style,
      file: f.file,
      bytes: f.bytes,
      sha256: f.sha256,
      license: f.license,
      glyphCount: f.glyphCount,
      source: f.source,
    })),
    licenses: fontLicenses,
    budgets: {
      albedoBytes: BUDGET.albedo,
      normalBytes: BUDGET.normal,
      roughnessBytes: BUDGET.roughness,
      posterBytes: BUDGET.poster,
      minTextureSize: MIN_TEXTURE_SIZE,
      seamRgbDeltaMax: 0.06,
    },
    tools: {
      sharp: sharp.versions.sharp,
      vips: sharp.versions.vips,
      node: process.version,
    },
  };
  writeFile(path.join(OUT_DIR, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  step(`  manifest.json：${materials.length} 组材质 + 海报 + ${fonts.length} 个字体文件`);

  // ---------- 阶段 6：出处证据 ----------
  stage('阶段 6／6：生成 public/assets/PROVENANCE.md');
  writeFile(path.join(OUT_DIR, 'PROVENANCE.md'), renderProvenance(manifest));
  step('  PROVENANCE.md 完成');

  log(`\n✓ 全部产物就绪，用时 ${((Date.now() - t0) / 1000).toFixed(1)}s`);
}

/* ------------------------------------------------------------------ *
 * 字体构建
 * ------------------------------------------------------------------ */

let fontLicenses = [];

function readExistingFonts() {
  const missing = FONT_SOURCES.filter((f) => !fs.existsSync(path.join(FONT_DIR, f.file)));
  if (missing.length) {
    throw new Error(
      `AK_SKIP_FONTS=1 但缺少字体产物：${missing.map((m) => m.file).join(', ')}。请去掉该环境变量重跑。`
    );
  }
  return FONT_SOURCES.map((f) => {
    const file = path.join(FONT_DIR, f.file);
    return {
      family: f.family,
      weight: f.weight,
      style: f.style,
      file: `fonts/${f.file}`,
      bytes: fs.statSync(file).size,
      sha256: sha256File(file),
      license: 'fonts/OFL.txt',
      glyphCount: null,
      source: f.varUrl,
    };
  });
}

function buildFonts() {
  const { chars, sourceFiles } = buildCharset();
  const charsetFile = path.join(FONT_CACHE_DIR, 'charset.txt');
  ensureDir(FONT_CACHE_DIR);
  fs.writeFileSync(charsetFile, chars.join(''), 'utf8');
  log(`  字符集：${chars.length} 个码位（来源：index.html + src/** 共 ${sourceFiles.length} 个文件 ∪ 规格要求的基础集）`);

  // 下载字体源与许可证（缓存于 assets/raw/fonts，已 gitignore）
  ensureDir(FONT_CACHE_DIR);
  for (const f of FONT_SOURCES) {
    const varPath = path.join(FONT_CACHE_DIR, f.varFile);
    const licPath = path.join(FONT_CACHE_DIR, f.licenseFile);
    const gotVar = download(f.varUrl, varPath);
    const gotLic = download(f.licenseUrl, licPath);
    if (gotVar) step(`  下载字体源 ${f.varFile}（${(fs.statSync(varPath).size / 1024 / 1024).toFixed(2)} MB）`);
    if (gotLic) step(`  下载许可证 ${f.licenseFile}`);
    if (!fs.existsSync(varPath)) throw new Error(`字体源不可用：${f.varUrl}`);
  }

  // 变量字体 → 静态实例（按字重固化）
  const instanced = new Map();
  for (const f of FONT_SOURCES) {
    const key = `${f.varFile}:${Object.entries(f.instances).map(([k, v]) => `${k}=${v}`).join(',')}`;
    if (instanced.has(key)) continue;
    const outPath = path.join(FONT_CACHE_DIR, `${f.varFile.replace(/\.ttf$/, '')}-${key.split(':')[1].replace(/[=,]/g, '_')}.ttf`);
    const srcPath = path.join(FONT_CACHE_DIR, f.varFile);
    if (!fs.existsSync(outPath)) {
      const args = [
        srcPath,
        ...Object.entries(f.instances).map(([k, v]) => `${k}=${v}`),
        '--update-name-table',
        // 固定 head.modified，否则每次构建的字节流都不同（破坏幂等）
        '--no-recalc-timestamp',
        '-o',
        outPath,
      ];
      try {
        run('python3', ['-m', 'fontTools.varLib.instancer', ...args]);
      } catch (err) {
        throw new Error(`变量字体固化失败（${f.family} ${f.weight}）：${err.stderr || err.message}`);
      }
    }
    instanced.set(key, outPath);
  }

  // 子集化
  const results = [];
  for (const f of FONT_SOURCES) {
    const key = `${f.varFile}:${Object.entries(f.instances).map(([k, v]) => `${k}=${v}`).join(',')}`;
    const srcPath = instanced.get(key);
    const outPath = path.join(FONT_DIR, f.file);
    const args = [
      srcPath,
      `--text-file=${charsetFile}`,
      '--flavor=woff2',
      '--output-file=' + outPath,
      '--layout-features=*',
      '--name-IDs=0,1,2,3,4,5,6',
      '--no-hinting',
      '--desubroutinize',
      '--notdef-outline',
      '--recommended-glyphs',
      '--drop-tables+=DSIG',
    ];
    let via = '';
    try {
      via = subsetFont(args);
    } catch (err) {
      throw new Error(`字体子集化失败（${f.family} ${f.weight}）：${err.stderr || err.message}`);
    }
    const bytes = fs.statSync(outPath).size;
    step(`  ${f.family} ${f.weight} → fonts/${f.file}（${(bytes / 1024).toFixed(1)} KB，${via}）`);
    results.push({
      family: f.family,
      weight: f.weight,
      style: f.style,
      file: `fonts/${f.file}`,
      bytes,
      sha256: sha256File(outPath),
      license: 'fonts/OFL.txt',
      glyphCount: chars.length,
      source: f.varUrl,
    });
  }

  // 许可证
  const notoLic = fs.readFileSync(path.join(FONT_CACHE_DIR, 'noto-sans-sc-OFL.txt'), 'utf8');
  const serifLic = fs.readFileSync(path.join(FONT_CACHE_DIR, 'noto-serif-sc-OFL.txt'), 'utf8');
  const interLic = fs.readFileSync(path.join(FONT_CACHE_DIR, 'inter-OFL.txt'), 'utf8');
  writeFile(path.join(FONT_DIR, 'OFL-Noto.txt'), notoLic);
  writeFile(path.join(FONT_DIR, 'OFL-Inter.txt'), interLic);
  const merged = [
    '# AETHERKEEP 本地字体许可证',
    '',
    '本目录同时包含 Noto Sans SC / Noto Serif SC 与 Inter 三个家族，均以 SIL Open Font License 1.1 授权，',
    '允许再分发与嵌入。以下为两个家族的完整 OFL 1.1 许可证文本与各自版权声明。',
    '',
    '────────────────────────────────────────────────────────────',
    '一、Noto Sans SC / Noto Serif SC（Adobe / Google）',
    '────────────────────────────────────────────────────────────',
    notoLic.trim(),
    '',
    '────────────────────────────────────────────────────────────',
    '二、Inter（Rasmus Andersson）',
    '────────────────────────────────────────────────────────────',
    interLic.trim(),
    '',
  ].join('\n');
  writeFile(path.join(FONT_DIR, 'OFL.txt'), merged);
  fontLicenses = [
    { file: 'fonts/OFL.txt', covers: ['Noto Sans SC', 'Noto Serif SC', 'Inter'], license: 'SIL Open Font License 1.1' },
    { file: 'fonts/OFL-Noto.txt', covers: ['Noto Sans SC', 'Noto Serif SC'], license: 'SIL Open Font License 1.1' },
    { file: 'fonts/OFL-Inter.txt', covers: ['Inter'], license: 'SIL Open Font License 1.1' },
  ];

  // fonts.css
  const css = [
    '/* =========================================================================',
    '   AETHERKEEP 本地字体 —— 无任何外部字体请求（离线自托管）',
    `   字符集：${chars.length} 个码位（index.html + src/** 提取 ∪ ASCII ∪ 中文标点 ∪ 量词 ∩ 中文数字/时间）`,
    '   三个家族均为 SIL Open Font License 1.1，许可证见 ./OFL.txt',
    '   ========================================================================= */',
    '',
  ];
  for (const r of results) {
    const f = FONT_SOURCES.find((x) => x.file === r.file.split('/').pop());
    css.push(
      '@font-face {',
      `  font-family: "${f.cssFamily}";`,
      `  font-style: ${f.style};`,
      `  font-weight: ${f.weight};`,
      '  font-display: swap;',
      `  src: url("./${r.file.split('/').pop()}") format("woff2");`,
      '}',
      ''
    );
  }
  writeFile(path.join(FONT_DIR, 'fonts.css'), css.join('\n'));
  step(`  fonts.css：${results.length} 条 @font-face（font-display: swap）`);

  const total = results.reduce((s, r) => s + r.bytes, 0);
  step(`  三家族合计：${(total / 1024).toFixed(1)} KB（预算 ${(6 * 1024).toFixed(0)} KB）`);
  if (total > 6 * 1024 * 1024) throw new Error('字体总体积超出 6MB 预算');

  return results;
}

/* ------------------------------------------------------------------ *
 * PROVENANCE.md
 * ------------------------------------------------------------------ */

function renderProvenance(manifest) {
  const L = [];
  L.push('# 资产出处与处理记录（PROVENANCE）');
  L.push('');
  L.push(`- 生成日期：${manifest.generatedOn}`);
  L.push(`- 生成工具：\`scripts/build-assets.mjs\`（sharp ${manifest.tools.sharp} / libvips ${manifest.tools.vips} / Node ${manifest.tools.node}）`);
  L.push('- 用途：AETHERKEEP 云际圣堡 —— 漂浮于云海之上的实时 Three.js 场景');
  L.push('- 原始图生成方式：AI 图像生成（2K，正方形材质 1:1、海报 16:9），逐条 prompt 与 node_id 见下表。');
  L.push('- **所有运行期资产均随仓库本地托管，运行时不发起任何外部字体/贴图/图片请求。**');
  L.push('');
  L.push('## 1. AI 原始图清单');
  L.push('');
  L.push('| 资产 | node_id | 生成日期 | 原始文件 | 原始格式/尺寸 | 原始 sha256 | 用途 |');
  L.push('| --- | --- | --- | --- | --- | --- | --- |');
  for (const m of manifest.materials) {
    L.push(
      `| ${m.id} | ${m.source.nodeId} | ${m.source.generatedOn} | ${m.source.rawFile} | ${m.source.rawFormat} ${m.source.rawDimensions} ${m.source.rawBytes} B | \`${m.source.rawSha256}\` | ${m.material} |`
    );
  }
  L.push(
    `| ${manifest.poster.id} | ${manifest.poster.source.nodeId} | ${manifest.poster.source.generatedOn} | ${manifest.poster.source.rawFile} | ${manifest.poster.source.rawFormat} ${manifest.poster.source.rawDimensions} ${manifest.poster.source.rawBytes} B | \`${manifest.poster.source.rawSha256}\` | ${manifest.poster.material} |`
  );
  L.push('');
  L.push('> 原始图副本归档在 `assets/raw/`（已在 `.gitignore` 中，不入库）。');
  L.push('');

  L.push('## 2. 完整英文 prompt（可原样复跑）');
  L.push('');
  for (const m of manifest.materials) {
    L.push(`### ${m.id} · ${m.material}`);
    L.push('');
    L.push('```text');
    L.push(m.source.prompt);
    L.push('```');
    L.push('');
  }
  L.push(`### ${manifest.poster.id} · ${manifest.poster.material}`);
  L.push('');
  L.push('```text');
  L.push(manifest.poster.source.prompt);
  L.push('```');
  L.push('');

  L.push('## 3. 处理工序（逐资产）');
  L.push('');
  L.push('通用工序（`scripts/build-assets.mjs`，幂等）：');
  L.push('');
  L.push('1. **读取**：按文件内容嗅探魔数读取原始图（扩展名与实际编码可能不一致，以内容为准）。');
  L.push('2. **缩放**：`sharp(...).removeAlpha().resize(2048, 2048, { kernel: "lanczos3" })`。');
  L.push('3. **接缝处理（镜像填充 / mirror fill）**：');
  L.push('   右侧带（w−B…w−1）用左侧带（0…B−1）的**镜像**内容填充，权重沿 smoothstep 从 0 升到 1；');
  L.push('   下侧带同理镜像上侧带。B=96px（按输出分辨率等比缩放，最低 48px）。');
  L.push('   于是 `G[w-1] ≡ G[0]`、`G[h-1] ≡ G[0]`（像素级相等），平铺后接缝零跳变。');
  L.push('   *为何不用「循环平移 + 淡化」*：那种做法只能让接缝两侧落在原图**相邻**的两个像素上，');
  L.push('   边界差 ≈ 单像素梯度；本组贴图颗粒很重，单像素梯度本身就有 0.05 左右，达不到 ≤0.06 且毫无余量。');
  L.push('4. **albedo**：`sharp(..., { raw }).webp({ quality: 82 })`；体积超限时按 2048→1536→1280→1024（再降质量）逐级回退，且不低于 1024×1024。');
  L.push('5. **normal**：');
  L.push('   - 高度 = 多尺度亮度高通：`0.65×(L−blur₄) + 0.35×(L−blur₂₄)`；');
  L.push('   - 高通结果做**软阈值收缩**（65% 分位点）：压掉细颗粒与 JPEG 块噪声，保留灰缝、裂纹、板缝等真实结构；');
  L.push('   - 再叠加**暗缝掩码**（明显暗于局部均值的细线，深度按高度场 RMS 归一，掩码先平滑成连续沟槽）；');
  L.push('   - 3×3 Sobel 求 X/Y 梯度，按梯度分位数自适应定标（放大倍数上限 200，避免弱结构材质被压成平面），坡度上限 2.2；');
  L.push('   - `N = normalize(−gx·0.55, +gy·0.55, 1)`，**OpenGL / +Y-up 切线空间约定**（与 three.js 默认 `flipY = true` 对齐，绿色通道朝上）；');
  L.push('   - 64 级色阶量化后编码为**无损 WebP**（`webp({ lossless: true })`）。');
  L.push('6. **roughness**：`r = lerp(min, max, 0.62×亮度 + 0.38×固定 seed 高频 value noise)`，灰度写入 RGB 三通道（three.js 取 G 通道）。');
  L.push('7. **海报**：`resize(1024, 576)` → JPEG（4:2:0），必要时降质量至 ≤300KB；同时另存 `poster.webp`。');
  L.push('');
  L.push('| 资产 | albedo | normal | roughness | 粗糙度区间 | 接缝左右 RGB 差 | 接缝上下 RGB 差 |');
  L.push('| --- | --- | --- | --- | --- | --- | --- |');
  for (const m of manifest.materials) {
    L.push(
      `| ${m.id} | ${m.processing.albedoResolution} q${m.processing.albedoQuality} | ${m.processing.normalResolution} 无损 | ${m.processing.roughnessResolution} | ${m.roughnessRange[0]}–${m.roughnessRange[1]} | ${m.seam.leftRightRgbDelta} | ${m.seam.topBottomRgbDelta} |`
    );
  }
  L.push('');
  L.push('> 接缝自检指标定义：对每个像素行比较最左列与最右列的 RGB 绝对差，除以行数×3×255 得到 0–1 归一化均值；上下方向同理。阈值 ≤0.06。');
  L.push('> 上表数值取自**编码后的 albedo 文件解码复算**的结果（不是构建时的一次性中间量）。');
  L.push('> 该指标由 `scripts/verify-assets.mjs` 从产物文件本身独立复算，任一项不达标即以非 0 退出码失败。');
  L.push('');

  L.push('## 4. 字体');
  L.push('');
  L.push('三个家族均为 SIL Open Font License 1.1，允许再分发与嵌入：');
  L.push('');
  L.push('| 家族 | 字重 | 文件 | 字节 | 源码 | 许可证 |');
  L.push('| --- | --- | --- | --- | --- | --- |');
  for (const f of manifest.fonts) {
    L.push(`| ${f.family} | ${f.weight} | \`${f.file}\` | ${f.bytes} B | ${f.source} | \`${f.license}\` |`);
  }
  L.push('');
  L.push('本地化处理方式（分支一：`pyftsubset` 子集化）：');
  L.push('');
  L.push('- 字符集来源：`index.html` 与 `src/**`（HTML/CSS/JS）全文提取 ∪ 全部 ASCII 可见字符 ∪ 常用中文标点（，。、；：？！「」『』（）《》—…· 等）');
  L.push('  ∪ 数字 ∪ 常用量词 ∪ 「零一二三四五六七八九十百千万亿年月日时分秒」等中文数字与时间单位；另含少量常见界面用词以留出余量。');
  L.push('- 变量字体先用 `python3 -m fontTools.varLib.instancer <src> wght=<N> --update-name-table -o <static.ttf>` 固化为目标字重的静态实例，');
  L.push('  再由 `pyftsubset`（等价入口 `python3 -m fontTools.subset`）以 `--flavor=woff2 --text-file=<charset> --desubroutinize --no-hinting` 输出 woff2 子集。');
  L.push('- 字体源文件缓存在 `assets/raw/fonts/`（`.gitignore` 内），构建脚本在缺失时自动从上游 OFL 仓库补齐。');
  L.push('- `public/assets/fonts/fonts.css` 内以相对路径声明 `@font-face`，统一 `font-display: swap`；CSS 中不含任何外部 URL。');
  L.push(`- 三家族合计 ${manifest.fonts.reduce((s, f) => s + f.bytes, 0)} 字节。`);
  L.push('- 许可证：`public/assets/fonts/OFL.txt`（Noto 与 Inter 的完整 OFL 1.1 文本合并），另有 `OFL-Noto.txt` / `OFL-Inter.txt` 单家族副本。');
  L.push('');

  L.push('## 5. 许可与声明');
  L.push('');
  L.push('- AI 生成图像：由项目自有的图像生成流程产出，用于本项目的运行时材质与海报，随仓库一同分发。');
  L.push('- 字体：SIL Open Font License 1.1，可再分发；许可证原文随资产一并入库（见 `public/assets/fonts/`）。');
  L.push('- 其它第三方素材：本轮未引入；运行时不引用任何外部 CDN、字体服务或图片服务。');
  L.push('');
  return `${L.join('\n')}\n`;
}

main().catch((err) => {
  console.error(`\n✗ 构建失败：${err.message}`);
  if (err.stack) console.error(err.stack);
  process.exit(1);
});
