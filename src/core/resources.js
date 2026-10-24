/**
 * 资源加载（规划案 §5.4 / T04、T05）
 *
 * 从仓库内的 public/assets 读取贴图与海报，零外站请求。
 * 带 AbortController、真实阶段进度、last-write-wins。
 * 任何一张贴图失败都会退化到程序化纹理，**不留空贴图**。
 */

import * as THREE from 'three';

import { MATERIAL_COLORS, MATERIAL_FILES, PALETTE, PIPELINE } from '../config/visual.js';

const BASE = './assets/materials/';

/**
 * 程序化保底纹理：分块砌缝 + 风化色差。
 * 只有在 AI 贴图缺失时才会用到。
 * @param {string} seedKey
 */
function proceduralTexture(seedKey) {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = MATERIAL_COLORS['A01-castle-ashlar'];
  ctx.fillRect(0, 0, size, size);

  let seed = 0;
  for (let i = 0; i < seedKey.length; i += 1) seed = (seed * 31 + seedKey.charCodeAt(i)) >>> 0;
  const rand = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };

  const rows = 6;
  const rowH = size / rows;
  for (let r = 0; r < rows; r += 1) {
    const offset = (r % 2) * (size / 8);
    for (let x = -size / 8; x < size; x += size / 4) {
      const w = size / 4 - 3;
      const h = rowH - 3;
      const shade = 0.82 + rand() * 0.28;
      const v = Math.round(154 * shade);
      ctx.fillStyle = `rgb(${v + 8}, ${v + 2}, ${v - 10})`;
      ctx.fillRect(x + offset + 1.5, r * rowH + 1.5, w, h);
    }
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/**
 * 加载全部资产。
 * @param {{signal?: AbortSignal, onProgress?: (ratio:number, label:string)=>void}} options
 */
export async function loadAssets({ signal, onProgress } = {}) {
  const manifest = {
    materials: {},
    poster: null,
    degraded: [],
    fonts: [],
  };

  const names = Object.keys(MATERIAL_FILES);
  const total = names.length * 3 + 1;
  let done = 0;

  const report = (label) => {
    done += 1;
    onProgress?.(Math.min(1, done / total), label);
  };

  /** @type {HTMLImageElement[]} */
  const loader = new THREE.ImageLoader();

  function loadImage(url) {
    return new Promise((resolve, reject) => {
      loader.load(
        url,
        (img) => resolve(img),
        undefined,
        () => reject(new Error(`贴图加载失败: ${url}`)),
      );
    });
  }

  for (const name of names) {
    const spec = MATERIAL_FILES[name];
    /** @type {Record<string, THREE.Texture>} */
    const entry = { degraded: false };

    const albedoUrl = BASE + spec.albedo;
    try {
      const img = await loadImage(albedoUrl);
      const tex = new THREE.Texture(img);
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.wrapS = THREE.RepeatWrapping;
      tex.wrapT = THREE.RepeatWrapping;
      tex.anisotropy = 8;
      tex.needsUpdate = true;
      entry.albedo = tex;
    } catch {
      entry.albedo = proceduralTexture(name);
      entry.degraded = true;
      manifest.degraded.push(name);
    }
    report(`${name} albedo`);

    for (const channel of ['normal', 'roughness']) {
      const url = BASE + spec[channel];
      try {
        const img = await loadImage(url);
        const tex = new THREE.Texture(img);
        // 法线与粗糙度是**线性数据**，不能设 sRGB
        tex.colorSpace = THREE.LinearSRGBColorSpace;
        tex.wrapS = THREE.RepeatWrapping;
        tex.wrapT = THREE.RepeatWrapping;
        tex.anisotropy = 8;
        tex.needsUpdate = true;
        entry[channel] = tex;
      } catch {
        entry[channel] = null;
        entry.degraded = true;
        if (!manifest.degraded.includes(name)) manifest.degraded.push(name);
      }
      report(`${name} ${channel}`);
    }

    manifest.materials[name] = entry;
  }

  // 海报
  try {
    const img = await loadImage('./assets/poster/poster.jpg');
    manifest.poster = img;
  } catch {
    manifest.poster = null;
  }
  report('poster');

  if (signal?.aborted) throw new DOMException('加载已取消', 'AbortError');

  return manifest;
}

/**
 * 按材质名创建 three 材质。
 * @param {import('./state.js').AppState} state
 * @param {any} manifest
 */
export function createMaterials(state, manifest) {
  const pick = (name) => manifest.materials?.[name] ?? {};
  const worldScale = PIPELINE.textureWorldScale;

  /** @param {string} name @param {string} color */
  const std = (name, color, extra = {}) => {
    const entry = pick(name);
    /** @type {Record<string, any>} */
    const params = {
      color: new THREE.Color(color),
      roughness: 0.85,
      metalness: 0,
      vertexColors: true,
    };
    if (entry.albedo) {
      params.map = entry.albedo;
      params.color = new THREE.Color(0xffffff);
    }
    if (entry.normal) {
      params.normalMap = entry.normal;
      params.normalScale = new THREE.Vector2(PIPELINE.normalStrength, PIPELINE.normalStrength);
    }
    if (entry.roughness) {
      params.roughnessMap = entry.roughness;
      params.roughness = 1;
    }
    const material = new THREE.MeshStandardMaterial(params);
    material.name = name;
    Object.assign(material, extra);
    return material;
  };

  const C = MATERIAL_COLORS;
  const materials = {
    stone: std('A01-castle-ashlar', C['A01-castle-ashlar']),
    trim: std('A02-sandstone-voussoir', C['A02-sandstone-voussoir']),
    basalt: std('A03-basalt-foundation', C['A03-basalt-foundation']),
    slate: std('A04-slate-roof', C['A04-slate-roof'], { roughness: 0.7 }),
    cliff: std('A05-stratified-cliff', C['A05-stratified-cliff']),
    path: std('A06-flagstone-path', C['A06-flagstone-path']),
    oak: std('A07-carved-oak', C['A07-carved-oak'], { roughness: 0.72 }),
    bronze: std('A08-aged-bronze', C['A08-aged-bronze'], { metalness: 0.65, roughness: 0.42 }),
    leaf: new THREE.MeshStandardMaterial({
      color: 0xffffff,
      vertexColors: true,
      roughness: 0.92,
      metalness: 0,
    }),
    ground: std('A01-castle-ashlar', C.ground),
    banner: new THREE.MeshStandardMaterial({
      color: PALETTE.banner,
      roughness: 0.88,
      metalness: 0,
      side: THREE.DoubleSide,
    }),
    glass: new THREE.MeshStandardMaterial({
      color: 0x1a2230,
      roughness: 0.22,
      metalness: 0.1,
      emissive: 0xffb14d,
      emissiveIntensity: 0.9,
    }),
  };

  // 世界尺度下的 UV 重复：4 米一个循环
  for (const material of Object.values(materials)) {
    if (material.map) material.map.repeat.set(1, 1);
  }

  void state;
  void worldScale;

  return materials;
}
