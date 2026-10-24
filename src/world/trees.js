/**
 * 植被（规划案 §5.3 短板 6、T08）
 *
 * 三种轮廓明显不同的树：细长针叶、阔叶冠、弯枝孤树。
 * 每种三级 LOD（近 / 中 / 远），全部用 InstancedMesh 合批。
 * 禁止「圆锥 + 圆柱」充数：针叶有多层锥冠，阔叶是多簇球冠，孤树有弯折主干。
 */

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { prepareForMerge } from './geo-utils.js';

import { PALETTE, SEED, VEGETATION } from '../config/visual.js';
import { mulberry32, outlineRadius, topHeight } from './island.js';

function rng(seed) {
  return mulberry32(seed);
}

/**
 * 给几何体补 color 属性并统一索引状态，便于合并。
 * @param {THREE.BufferGeometry} geometry
 * @param {string|number} color
 */
function tint(geometry, color) {
  return prepareForMerge(geometry, color);
}

/** 针叶树：主干 + 4–5 层递减锥冠 */
function buildConifer(detail) {
  const parts = [];
  const trunkH = detail === 'far' ? 6 : 9;
  const trunk = new THREE.CylinderGeometry(0.22, 0.42, trunkH, detail === 'far' ? 4 : 7);
  parts.push(tint(trunk.clone().translate(0, trunkH / 2, 0), '#4a3a2c'));

  const tiers = detail === 'far' ? 3 : 5;
  const totalH = detail === 'far' ? 13 : 19;
  for (let i = 0; i < tiers; i += 1) {
    const t = i / tiers;
    const y = trunkH * 0.7 + t * (totalH - trunkH * 0.7);
    const r = (3.4 - t * 2.3) * (detail === 'far' ? 0.8 : 1);
    const h = (totalH - trunkH) / tiers + 1.6;
    const cone = new THREE.ConeGeometry(r, h, detail === 'far' ? 5 : 8);
    const shade = 0.82 + t * 0.28;
    const c = new THREE.Color(PALETTE.forest).multiplyScalar(shade);
    parts.push(tint(cone.clone().translate(0, y + h / 2, 0), c.getHex()));
  }
  const merged = mergeGeometries(parts, false);
  parts.forEach((p) => p.dispose());
  return merged;
}

/** 阔叶树：分叉主干 + 5 簇不规则树冠 */
function buildBroadleaf(detail) {
  const parts = [];
  const trunkH = detail === 'far' ? 4.5 : 6.5;
  const trunk = new THREE.CylinderGeometry(0.34, 0.62, trunkH, detail === 'far' ? 4 : 7);
  parts.push(tint(trunk.clone().translate(0, trunkH / 2, 0), '#4a3a2c'));

  const clusters = detail === 'far' ? 2 : 5;
  const rand = rng(SEED ^ 0x77);
  for (let i = 0; i < clusters; i += 1) {
    const r = detail === 'far' ? 2.6 : 1.5 + rand() * 1.3;
    const a = (i / clusters) * Math.PI * 2 + rand() * 0.6;
    const dist = detail === 'far' ? 0.8 : 1.4 + rand() * 1.5;
    const y = trunkH + (detail === 'far' ? 2.6 : 1.6 + rand() * 2.4);
    const blob = new THREE.IcosahedronGeometry(r, detail === 'far' ? 0 : 1);
    // 让树冠不再是完美球体
    const pos = blob.attributes.position;
    for (let v = 0; v < pos.count; v += 1) {
      const s = 0.82 + rand() * 0.36;
      pos.setXYZ(v, pos.getX(v) * s, pos.getY(v) * s * 0.82, pos.getZ(v) * s);
    }
    blob.computeVertexNormals();
    const leaf = new THREE.Color(PALETTE.forest).lerp(new THREE.Color('#9a9a65'), rand() * 0.55);
    parts.push(tint(blob.clone().translate(Math.cos(a) * dist, y, Math.sin(a) * dist), leaf.getHex()));
  }
  const merged = mergeGeometries(parts, false);
  parts.forEach((p) => p.dispose());
  return merged;
}

/** 弯枝孤树：倾斜主干 + 分叉枝 + 单侧偏冠 */
function buildGnarled(detail) {
  const parts = [];
  const rand = rng(SEED ^ 0x1a3);
  const segs = detail === 'far' ? 2 : 4;
  let x = 0;
  let z = 0;
  let y = 0;
  let r = 0.55;
  for (let i = 0; i < segs; i += 1) {
    const h = detail === 'far' ? 3.4 : 2.6 + rand() * 1.2;
    const lean = 0.16 + rand() * 0.26;
    const dir = rand() * Math.PI * 2;
    const nx = x + Math.cos(dir) * lean * h;
    const nz = z + Math.sin(dir) * lean * h;
    const seg = new THREE.CylinderGeometry(r * 0.78, r, h, detail === 'far' ? 4 : 6);
    const midX = (x + nx) / 2;
    const midZ = (z + nz) / 2;
    const angle = Math.atan2(nx - x, nz - z);
    const tilt = Math.atan2(Math.hypot(nx - x, nz - z), h);
    const m = new THREE.Matrix4().compose(
      new THREE.Vector3(midX, y + h / 2, midZ),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(tilt, angle, 0, 'YXZ')),
      new THREE.Vector3(1, 1, 1),
    );
    seg.applyMatrix4(m);
    parts.push(tint(seg, '#463726'));
    x = nx;
    z = nz;
    y += h * 0.92;
    r *= 0.72;
  }

  const clusters = detail === 'far' ? 2 : 4;
  for (let i = 0; i < clusters; i += 1) {
    const r2 = detail === 'far' ? 3.0 : 1.8 + rand() * 1.4;
    const a = rand() * Math.PI * 2;
    const dist = detail === 'far' ? 1.0 : 1.0 + rand() * 2.2;
    const blob = new THREE.IcosahedronGeometry(r2, detail === 'far' ? 0 : 1);
    const pos = blob.attributes.position;
    for (let v = 0; v < pos.count; v += 1) {
      const s = 0.78 + rand() * 0.44;
      pos.setXYZ(v, pos.getX(v) * s, pos.getY(v) * s * 0.7, pos.getZ(v) * s);
    }
    blob.computeVertexNormals();
    parts.push(tint(blob.clone().translate(x + Math.cos(a) * dist, y + 1.2 + rand() * 1.6, z + Math.sin(a) * dist), '#4a6b58'));
  }

  const merged = mergeGeometries(parts, false);
  parts.forEach((p) => p.dispose());
  return merged;
}

/**
 * 创建植被。
 * @param {{materials: {leaf: THREE.Material, trunk: THREE.Material}}} deps
 */
export function createTrees({ materials }) {
  const group = new THREE.Group();
  group.name = 'vegetation';

  const species = [
    { key: 'conifer', count: VEGETATION.coniferCount, build: buildConifer, scale: [0.85, 1.25] },
    { key: 'broadleaf', count: VEGETATION.broadleafCount, build: buildBroadleaf, scale: [0.8, 1.15] },
    { key: 'gnarled', count: VEGETATION.gnarledCount, build: buildGnarled, scale: [0.95, 1.4] },
  ];

  const rand = rng(SEED ^ 0x5a5a);
  const lodNames = ['near', 'mid', 'far'];

  /** @type {Map<string, {meshes: THREE.InstancedMesh[], counts: number[]}>} */
  const built = new Map();

  for (const sp of species) {
    /** @type {THREE.InstancedMesh[]} */
    const meshes = [];
    /** @type {number[]} */
    const counts = [];

    for (const lod of lodNames) {
      const geometry = sp.build(lod);
      const mesh = new THREE.InstancedMesh(geometry, materials.leaf, sp.count);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.name = `trees-${sp.key}-${lod}`;
      mesh.count = 0;
      mesh.instanceMatrix.setUsage(THREE.StaticDrawUsage);
      meshes.push(mesh);
      counts.push(0);
      group.add(mesh);
    }

    built.set(sp.key, { meshes, counts });
  }

  // ---------------------------------------------------------------- 布点
  const matrix = new THREE.Matrix4();
  const quaternion = new THREE.Quaternion();
  const euler = new THREE.Euler();
  const position = new THREE.Vector3();
  const scale = new THREE.Vector3();

  /** 城堡占地范围，树不能长在建筑里 */
  const inCastle = (x, z) => {
    const dx = x;
    const dz = z + 4;
    if (dx * dx + dz * dz < 46 * 46) return true;
    if (Math.abs(x - 27) < 14 && Math.abs(z - 10) < 14) return true;
    if (Math.abs(x + 24) < 26 && Math.abs(z - 4) < 17) return true;
    if (Math.abs(x - 31) < 15 && Math.abs(z + 26) < 13) return true;
    if (Math.abs(x + 36) < 14 && Math.abs(z + 22) < 12) return true;
    return false;
  };

  for (const sp of species) {
    const entry = built.get(sp.key);
    let placed = 0;
    let guard = 0;

    while (placed < sp.count && guard < sp.count * 60) {
      guard += 1;
      const theta = rand() * Math.PI * 2;
      const edge = outlineRadius(theta);
      // 大部分树在岛的外围带，内圈留给建筑与庭院
      const t = 0.42 + rand() * 0.55;
      const radius = edge * t;
      const x = Math.cos(theta) * radius;
      const z = Math.sin(theta) * radius;

      if (inCastle(x, z)) continue;
      // 水镜周围留空
      if (Math.hypot(x - 0, z - 8) < 16) continue;

      const y = topHeight(x, z);
      if (y < 1.2) continue; // 太低的地方不长树

      const s = sp.scale[0] + rand() * (sp.scale[1] - sp.scale[0]);
      position.set(x, y - 0.4, z);
      euler.set(0, rand() * Math.PI * 2, 0);
      quaternion.setFromEuler(euler);
      scale.set(s, s * (0.9 + rand() * 0.25), s);
      matrix.compose(position, quaternion, scale);

      // 按到相机的距离预分配到 LOD 桶（近 / 中 / 远各一份实例）
      const lodIndex = t > 0.82 ? 2 : t > 0.62 ? 1 : 0;
      const mesh = entry.meshes[lodIndex];
      const idx = entry.counts[lodIndex];
      if (idx >= sp.count) continue;
      mesh.setMatrixAt(idx, matrix);
      entry.counts[lodIndex] = idx + 1;
      placed += 1;
    }

    for (const mesh of entry.meshes) {
      mesh.count = entry.counts[entry.meshes.indexOf(mesh)];
      mesh.instanceMatrix.needsUpdate = true;
      mesh.computeBoundingSphere();
    }
  }

  const totalInstances = [...built.values()].reduce(
    (sum, entry) => sum + entry.counts.reduce((a, b) => a + b, 0),
    0,
  );

  return {
    group,
    stats: {
      species: species.length,
      totalInstances,
      perSpecies: Object.fromEntries(
        [...built.entries()].map(([key, entry]) => [key, entry.counts.reduce((a, b) => a + b, 0)]),
      ),
      drawCalls: built.size * lodNames.length,
    },
    dispose() {
      group.traverse((obj) => {
        if (obj.isMesh) obj.geometry.dispose();
      });
    },
  };
}
