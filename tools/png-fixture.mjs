/**
 * 测试用 PNG 编码器 —— 只在测试里用，让单测不依赖 ffmpeg / sharp 等外部工具。
 * 输出 8 bit、非隔行的 PNG（filter 0），覆盖灰度 / RGB / RGBA 三种色彩类型。
 */

import { deflateSync } from 'node:zlib';

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) {
      c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    }
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buffer) {
  let c = 0xffffffff;
  for (let i = 0; i < buffer.length; i += 1) {
    c = CRC_TABLE[(c ^ buffer[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const typeBuffer = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])), 0);
  return Buffer.concat([length, typeBuffer, data, crc]);
}

/**
 * @param {number} width
 * @param {number} height
 * @param {Buffer} rgba RGBA8 像素，长度必须是 width*height*4
 * @param {number} [colorType] 6=RGBA / 2=RGB / 0=灰度
 * @returns {Buffer} PNG 文件字节
 */
export function encodePng(width, height, rgba, colorType = 6) {
  const bpp = colorType === 6 ? 4 : colorType === 2 ? 3 : 1;
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = colorType;
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter
  ihdr[12] = 0; // interlace

  const stride = width * bpp;
  const raw = Buffer.alloc(height * (stride + 1));
  for (let y = 0; y < height; y += 1) {
    const rowStart = y * (stride + 1);
    raw[rowStart] = 0; // filter type: none
    rgba.copy(raw, rowStart + 1, y * stride, (y + 1) * stride);
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/** 造一张纯色图 */
export function solidImage(width, height, [r, g, b, a = 255]) {
  const rgba = Buffer.alloc(width * height * 4);
  for (let i = 0; i < width * height; i += 1) {
    rgba[i * 4] = r; rgba[i * 4 + 1] = g; rgba[i * 4 + 2] = b; rgba[i * 4 + 3] = a;
  }
  return rgba;
}

/** 造一张左右两半不同色的图：左半 lit，右半 shadow */
export function splitImage(width, height, lit, shadow) {
  const rgba = Buffer.alloc(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const c = x < width / 2 ? lit : shadow;
      const p = (y * width + x) * 4;
      rgba[p] = c[0]; rgba[p + 1] = c[1]; rgba[p + 2] = c[2]; rgba[p + 3] = c[3] ?? 255;
    }
  }
  return rgba;
}

/**
 * 造一张「像真实渲染帧」的图：横向暖→冷渐变 + 纵向明暗 + 轻微抖动。
 * 抖动是必要的 —— 真实渲染帧有渐变、阴影与高光，色调数量是连续的；
 * 纯色合成图没有这个性质，不能用来检验「直方图分桶数」这类指标。
 */
export function gradientImage(width, height, from = [255, 235, 190], to = [12, 20, 45]) {
  const rgba = Buffer.alloc(width * height * 4);
  let seed = 0x2f6e2b1;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const t = x / (width - 1);
      const vertical = 1 - 0.25 * (y / (height - 1));
      // 确定性伪随机抖动（xorshift），保证夹具可复现
      seed ^= seed << 13; seed >>>= 0;
      seed ^= seed >>> 17;
      seed ^= seed << 5; seed >>>= 0;
      const dither = ((seed % 9) - 4);
      const p = (y * width + x) * 4;
      for (let c = 0; c < 3; c += 1) {
        const base = from[c] + (to[c] - from[c]) * t;
        const value = Math.round(Math.min(255, Math.max(0, base * vertical + dither)));
        rgba[p + c] = value;
      }
      rgba[p + 3] = 255;
    }
  }
  return rgba;
}
