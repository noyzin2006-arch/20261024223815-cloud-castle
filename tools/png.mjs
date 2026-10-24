/**
 * 零依赖 PNG 解码器 —— 只为「用脚本量画面指标」这一件事服务。
 *
 * 范围（够用即止，不做通用图像库）：
 *   - 8 bit、非隔行（interlace = 0）
 *   - 色彩类型 0（灰度）/ 2（RGB）/ 4（灰度+Alpha）/ 6（RGBA）
 *   - 解析 IHDR / PLTE / tRNS / IDAT / IEND，其余 chunk 忽略
 *
 * 输出一律转成 RGBA8，方便上层指标函数统一处理。
 */

import { inflateSync } from 'node:zlib';

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/** 每像素字节数（仅支持 8 bit） */
function bytesPerPixel(colorType) {
  switch (colorType) {
    case 0: return 1; // 灰度
    case 2: return 3; // RGB
    case 4: return 2; // 灰度 + Alpha
    case 6: return 4; // RGBA
    default: throw new Error(`不支持的 PNG 色彩类型: ${colorType}`);
  }
}

/** Paeth 预测器（PNG filter type 4） */
function paeth(a, b, c) {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  if (pb <= pc) return b;
  return c;
}

/**
 * 反过滤一行 scanline。
 * @param {Buffer} raw 过滤后的字节
 * @param {Buffer} out 整帧缓冲，当前行写在 out 的 rowOffset 处
 * @param {number} rowOffset 当前行在 out 中的起始偏移
 * @param {number} rowBytes 当前行字节数
 * @param {number} bpp 每像素字节数
 * @param {number} filterType 过滤类型 0-4
 */
function unfilterRow(raw, out, rowOffset, rowBytes, bpp, filterType) {
  const prevOffset = rowOffset - rowBytes;
  for (let i = 0; i < rowBytes; i += 1) {
    const x = raw[i];
    const a = i >= bpp ? out[rowOffset + i - bpp] : 0; // 左侧
    const b = rowOffset >= rowBytes ? out[prevOffset + i] : 0; // 上方
    const c = rowOffset >= rowBytes && i >= bpp ? out[prevOffset + i - bpp] : 0; // 左上
    let value;
    switch (filterType) {
      case 0: value = x; break;
      case 1: value = x + a; break;
      case 2: value = x + b; break;
      case 3: value = x + ((a + b) >> 1); break;
      case 4: value = x + paeth(a, b, c); break;
      default: throw new Error(`未知的 PNG 过滤类型: ${filterType}`);
    }
    out[rowOffset + i] = value & 0xff;
  }
}

/**
 * 解码 PNG。
 * @param {Buffer} buffer PNG 文件字节
 * @returns {{width:number,height:number,data:Buffer}} data 为 RGBA8
 */
export function decodePng(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 8) {
    throw new Error('不是合法的 PNG：长度不足');
  }
  if (!buffer.subarray(0, 8).equals(PNG_SIGNATURE)) {
    throw new Error('不是合法的 PNG：签名不匹配');
  }

  let offset = 8;
  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = 0;
  let interlace = 0;
  let palette = null;
  let transparency = null;
  const idatChunks = [];

  while (offset + 8 <= buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString('ascii', offset + 4, offset + 8);
    const dataStart = offset + 8;
    const dataEnd = dataStart + length;
    if (dataEnd > buffer.length) {
      throw new Error(`PNG chunk ${type} 越界`);
    }
    const data = buffer.subarray(dataStart, dataEnd);

    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data.readUInt8(8);
      colorType = data.readUInt8(9);
      interlace = data.readUInt8(12);
    } else if (type === 'PLTE') {
      palette = Buffer.from(data);
    } else if (type === 'tRNS') {
      transparency = Buffer.from(data);
    } else if (type === 'IDAT') {
      idatChunks.push(Buffer.from(data));
    } else if (type === 'IEND') {
      break;
    }

    offset = dataEnd + 4; // 跳过 CRC
  }

  if (!width || !height) throw new Error('PNG 缺少 IHDR');
  if (bitDepth !== 8) throw new Error(`只支持 8 bit 位深，收到 ${bitDepth}`);
  if (interlace !== 0) throw new Error('不支持隔行 PNG');
  if (!idatChunks.length) throw new Error('PNG 缺少 IDAT');

  const bpp = bytesPerPixel(colorType);
  const rowBytes = width * bpp;
  const inflated = inflateSync(Buffer.concat(idatChunks));
  if (inflated.length < height * (rowBytes + 1)) {
    throw new Error('PNG 解压后数据不足');
  }

  // 先反过滤成「每像素 bpp 字节」的原始缓冲
  const raw = Buffer.alloc(height * rowBytes);
  for (let y = 0; y < height; y += 1) {
    const filterType = inflated[y * (rowBytes + 1)];
    const rowData = inflated.subarray(y * (rowBytes + 1) + 1, y * (rowBytes + 1) + 1 + rowBytes);
    unfilterRow(rowData, raw, y * rowBytes, rowBytes, bpp, filterType);
  }

  // 再统一转 RGBA8
  const data = Buffer.alloc(width * height * 4);
  const paletteAlpha = transparency && transparency.length ? transparency : null;

  for (let i = 0, p = 0; i < width * height; i += 1, p += 4) {
    const s = i * bpp;
    let r;
    let g;
    let b;
    let a = 255;

    if (colorType === 0) {
      r = g = b = raw[s];
    } else if (colorType === 2) {
      r = raw[s]; g = raw[s + 1]; b = raw[s + 2];
    } else if (colorType === 4) {
      r = g = b = raw[s]; a = raw[s + 1];
    } else if (colorType === 6) {
      r = raw[s]; g = raw[s + 1]; b = raw[s + 2]; a = raw[s + 3];
    } else if (colorType === 3) {
      if (!palette) throw new Error('索引色 PNG 缺少 PLTE');
      const idx = raw[s];
      r = palette[idx * 3];
      g = palette[idx * 3 + 1];
      b = palette[idx * 3 + 2];
      a = paletteAlpha && idx < paletteAlpha.length ? paletteAlpha[idx] : 255;
    } else {
      throw new Error(`不支持的 PNG 色彩类型: ${colorType}`);
    }

    data[p] = r; data[p + 1] = g; data[p + 2] = b; data[p + 3] = a;
  }

  return { width, height, data };
}

/** 从文件字节解码，失败时返回 null（不抛，便于批处理里统计失败数） */
export function decodePngSafe(buffer) {
  try {
    return decodePng(buffer);
  } catch {
    return null;
  }
}
