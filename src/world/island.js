/**
 * 浮岛地貌（规划案 §5.3 短板 4/5、T06）
 *
 * 结构：顶面（非圆多频轮廓 + 起伏 + 台地）+ 崖壁（沉积岩层 + 侵蚀脊 + 收尖）
 * 做法：极坐标网格手工建面，保证拓扑闭合、法线正确、无退化三角形。
 * 禁止：随机抖动的二十面体、扁平圆盘、可见巨型三角板。
 */

import * as THREE from 'three';

import { ISLAND, PALETTE, SEED, WORLD } from '../config/visual.js';

/** 确定性 PRNG */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function random() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 2D 值噪声（确定性） */
function makeNoise2D(seed) {
  const random = mulberry32(seed);
  const size = 256;
  const table = new Float32Array(size * size);
  for (let i = 0; i < table.length; i += 1) table[i] = random();
  const at = (x, y) => table[(y & (size - 1)) * size + (x & (size - 1))];

  return function noise(x, y) {
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    const xf = x - xi;
    const yf = y - yi;
    const u = xf * xf * (3 - 2 * xf);
    const v = yf * yf * (3 - 2 * yf);
    const a = at(xi, yi);
    const b = at(xi + 1, yi);
    const c = at(xi, yi + 1);
    const d = at(xi + 1, yi + 1);
    return (a * (1 - u) + b * u) * (1 - v) + (c * (1 - u) + d * u) * v;
  };
}

function fbm2D(noise, x, y, octaves = 4) {
  let sum = 0;
  let amp = 0.5;
  let norm = 0;
  let fx = x;
  let fy = y;
  for (let i = 0; i < octaves; i += 1) {
    sum += amp * noise(fx, fy);
    norm += amp;
    amp *= 0.5;
    fx *= 2.03;
    fy *= 2.01;
  }
  return sum / norm;
}

/**
 * 岛体轮廓半径：多频叠加，保证非圆、有自然的收放。
 * @param {number} theta 弧度
 */
export function outlineRadius(theta) {
  return (
    84 +
    5.0 * Math.sin(3 * theta + 0.7) +
    4.0 * Math.sin(5 * theta + 2.1) +
    2.5 * Math.sin(8 * theta + 4.3) +
    1.2 * Math.sin(13 * theta + 1.2)
  );
}

/** 模块级确定性噪声：岛面高度采样必须与建面时完全一致 */
const ISLAND_NOISE = makeNoise2D(SEED);

/**
 * 顶面高度：起伏 + 台地 + 崖肩。
 * @param {number} x
 * @param {number} z
 */
export function topHeight(x, z) {
  const noise = ISLAND_NOISE;
  const r = Math.hypot(x, z);
  const theta = Math.atan2(z, x);
  const edge = outlineRadius(theta);

  // 主起伏
  let h = (fbm2D(noise, x * 0.018 + 11.3, z * 0.018 + 4.7, 5) - 0.5) * 18;

  // 3 处自然台地（把局部高度压平）
  const terraces = [
    { x: 18, z: -12, r: 26, level: 4.5 },
    { x: -26, z: 20, r: 22, level: -3.0 },
    { x: 4, z: 30, r: 18, level: 2.0 },
  ];
  for (const t of terraces) {
    const d = Math.hypot(x - t.x, z - t.z);
    const w = 1 - Math.min(1, d / t.r);
    h = h * (1 - w * 0.85) + t.level * w * 0.85;
  }

  // 4 处崖肩：抬高的岩脊
  const shoulders = [
    { a: 0.6, r: 0.62 },
    { a: 2.1, r: 0.55 },
    { a: 3.7, r: 0.68 },
    { a: 5.4, r: 0.5 },
  ];
  for (const s of shoulders) {
    const sa = Math.atan2(Math.sin(theta - s.a), Math.cos(theta - s.a));
    const angular = 1 - Math.min(1, Math.abs(sa) / 0.42);
    const radial = 1 - Math.min(1, Math.abs(r / edge - s.r) / 0.16);
    const w = Math.max(0, angular) * Math.max(0, radial);
    h += w * 7.5;
  }

  // 边缘向下收进，让顶面与崖壁自然衔接
  const edgeFall = Math.max(0, (r / edge - 0.82) / 0.18);
  h -= edgeFall * edgeFall * 11;

  // 中心庭院压平（中庭 y=12 附近）
  const courtyard = 1 - Math.min(1, Math.hypot(x - 0, z - 6) / 26);
  h = h * (1 - courtyard * 0.5) + 9.0 * courtyard * 0.5;

  return Math.max(-6, Math.min(WORLD.islandTopRelief + 6, h));
}

/**
 * 崖壁半径：随高度收尖 + 沉积岩层 + 纵向侵蚀脊。
 * @param {number} theta
 * @param {number} y
 * @param {number} edgeRadius
 */
function wallRadius(theta, y, edgeRadius, noise) {
  const depth = Math.max(0, -y);
  const t = Math.min(1, depth / Math.abs(WORLD.islandTipY));

  // 收尖剖面：上缓下尖。尖端保留极小半径，避免退化三角形。
  let r = edgeRadius * Math.max(0.0045, Math.pow(1 - t, 0.72));

  // 沉积岩层：沿 Y 的周期性凸凹
  r *= 1 + 0.072 * Math.sin(y * 0.42 + 0.6) + 0.038 * Math.sin(y * 1.05 + 1.9);

  // 纵向侵蚀脊：只随角度变化 → 垂直方向的沟槽
  const cx = Math.cos(theta);
  const cz = Math.sin(theta);
  const grooveNoise = fbm2D(noise, cx * 7.3 + 40.1, cz * 7.3 + 21.7, 3) - 0.5;
  r *= 1 - 0.085 * Math.abs(Math.sin(theta * 11 + 0.3)) * (0.45 + grooveNoise);

  // 随机岩块起伏（沿 Y 平滑，避免噪点）
  r *= 1 + 0.045 * (fbm2D(noise, theta * 6.1, y * 0.09 + 3.3, 3) - 0.5);

  return Math.max(0, r);
}

/**
 * 创建浮岛。
 * @param {{materials: {cliff: THREE.Material, ground: THREE.Material}}} deps
 */
export function createIsland({ materials }) {
  const group = new THREE.Group();
  group.name = 'island';

  const noise = ISLAND_NOISE;
  const random = mulberry32(SEED ^ 0x9e37);

  const ANGULAR = 128;
  const TOP_RADIAL = 26;
  const WALL_ROWS = 46;

  // ---------------------------------------------------------------- 顶面
  {
    const positions = [];
    const uvs = [];
    const colors = [];
    const indices = [];

    const rimPoints = [];
    for (let a = 0; a < ANGULAR; a += 1) {
      const theta = (a / ANGULAR) * Math.PI * 2;
      const edge = outlineRadius(theta);
      rimPoints.push({ theta, edge });
    }

    // 中心 + 各环
    const ringCount = TOP_RADIAL;
    const ringRadius = [];
    for (let r = 0; r <= ringCount; r += 1) {
      const t = r / ringCount;
      ringRadius.push(t);
    }

    // 顶点 0 = 中心
    const centerY = topHeight(0, 0);
    positions.push(0, centerY, 0);
    uvs.push(0, 0);
    colors.push(0.60, 0.70, 0.46);

    for (let r = 1; r <= ringCount; r += 1) {
      const t = ringRadius[r];
      for (let a = 0; a < ANGULAR; a += 1) {
        const { theta, edge } = rimPoints[a];
        const radius = edge * t;
        const x = Math.cos(theta) * radius;
        const z = Math.sin(theta) * radius;
        const y = topHeight(x, z);
        positions.push(x, y, z);
        uvs.push(x / 12, z / 12);

        // 顶面颜色：中心苔绿 → 外缘岩灰。
        // 必须用**两色插值**，不能让某个通道单独塌陷：
        // 之前绿通道随边缘衰减、红通道保留，边缘就变成了红环。
        const edgeT = Math.min(1, t);
        const soil = fbm2D(noise, x * 0.05, z * 0.05, 3) - 0.5;
        const moss = [0.60, 0.70, 0.46];
        const rock = [0.60, 0.57, 0.50];
        colors.push(
          (moss[0] * (1 - edgeT) + rock[0] * edgeT) + soil * 0.07,
          (moss[1] * (1 - edgeT) + rock[1] * edgeT) + soil * 0.06,
          (moss[2] * (1 - edgeT) + rock[2] * edgeT) + soil * 0.05,
        );
      }
    }

    // 索引：中心扇面 + 环间四边形。
    // 绕序必须是**逆时针（从上方看）**，否则法线朝下，地面会整片发黑。
    for (let a = 0; a < ANGULAR; a += 1) {
      const next = (a + 1) % ANGULAR;
      indices.push(0, 1 + next, 1 + a);
    }
    for (let r = 1; r < ringCount; r += 1) {
      const base = 1 + (r - 1) * ANGULAR;
      const nextBase = 1 + r * ANGULAR;
      for (let a = 0; a < ANGULAR; a += 1) {
        const next = (a + 1) % ANGULAR;
        indices.push(base + a, base + next, nextBase + next);
        indices.push(base + a, nextBase + next, nextBase + a);
      }
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();

    const mesh = new THREE.Mesh(geometry, materials.ground);
    mesh.name = 'island-ground';
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
  }

  // ---------------------------------------------------------------- 崖壁
  {
    const positions = [];
    const uvs = [];
    const colors = [];
    const indices = [];

    for (let row = 0; row <= WALL_ROWS; row += 1) {
      const t = row / WALL_ROWS;
      const y = -t * Math.abs(WORLD.islandTipY);
      for (let a = 0; a < ANGULAR; a += 1) {
        const theta = (a / ANGULAR) * Math.PI * 2;
        const edge = outlineRadius(theta);
        const r = wallRadius(theta, y, edge, noise);
        const x = Math.cos(theta) * r;
        const z = Math.sin(theta) * r;
        positions.push(x, y, z);
        // 崖面 UV：40 米一个循环。
        // 4 米一次在远景会触发高频 minification，整面崖壁会糊成一块平色。
        uvs.push((theta * edge) / 40, y / 40);

        // 越往下越冷、越暗（空气透视 + 阴影）
        const depth = Math.min(1, t * 1.15);
        const base = 0.62 - depth * 0.34;
        const warm = 1 - depth * 0.34;
        colors.push(base * 0.96 * warm + 0.05, base * 0.95, base * 0.90 + depth * 0.04);
      }
    }

    // 崖壁绕序：法线必须**朝外**，否则整面崖壁会被从内部照亮。
    for (let row = 0; row < WALL_ROWS; row += 1) {
      const base = row * ANGULAR;
      const nextBase = (row + 1) * ANGULAR;
      for (let a = 0; a < ANGULAR; a += 1) {
        const next = (a + 1) % ANGULAR;
        indices.push(base + a, nextBase + next, nextBase + a);
        indices.push(base + a, base + next, nextBase + next);
      }
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();

    const mesh = new THREE.Mesh(geometry, materials.cliff);
    mesh.name = 'island-cliff';
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
  }

  // ---------------------------------------------------------------- 卫星碎岩
  const rocks = new THREE.Group();
  rocks.name = 'island-rocks';
  {
    const rockGeometry = new THREE.IcosahedronGeometry(1, 1);
    const pos = rockGeometry.attributes.position;
    const v = new THREE.Vector3();
    for (let i = 0; i < pos.count; i += 1) {
      v.fromBufferAttribute(pos, i);
      // 位移必须只取决于顶点**位置**，不能逐索引随机：
      // PolyhedronGeometry 的顶点按面重复，逐索引随机会把岩石面撕裂。
      const dir = v.clone().normalize();
      const s = 0.78 + 0.34 * (0.5 + 0.5 * Math.sin(dir.x * 7.3 + dir.y * 5.1 + dir.z * 9.7));
      v.multiplyScalar(s);
      v.x *= 1.35;
      v.y *= 0.72;
      v.z *= 1.1;
      pos.setXYZ(i, v.x, v.y, v.z);
    }
    rockGeometry.computeVertexNormals();

    const count = 22;
    const mesh = new THREE.InstancedMesh(rockGeometry, materials.cliff, count);
    const matrix = new THREE.Matrix4();
    const quaternion = new THREE.Quaternion();
    const euler = new THREE.Euler();
    const position = new THREE.Vector3();
    const scale = new THREE.Vector3();

    for (let i = 0; i < count; i += 1) {
      const a = random() * Math.PI * 2;
      const edge = outlineRadius(a);
      const t = 0.25 + random() * 0.68;
      const y = -t * Math.abs(WORLD.islandTipY) * 0.75;
      const r = wallRadius(a, y, edge, noise) * (0.72 + random() * 0.22);
      position.set(Math.cos(a) * r, y, Math.sin(a) * r);
      euler.set(random() * 0.6 - 0.3, random() * Math.PI * 2, random() * 0.6 - 0.3);
      quaternion.setFromEuler(euler);
      const s = 2.2 + random() * 6.5;
      scale.set(s, s * (0.6 + random() * 0.5), s * (0.7 + random() * 0.4));
      matrix.compose(position, quaternion, scale);
      mesh.setMatrixAt(i, matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    rocks.add(mesh);
  }
  group.add(rocks);

  return {
    group,
    /** @returns {{min: THREE.Vector3, max: THREE.Vector3}} 岛体包围盒 */
    bounds() {
      const box = new THREE.Box3();
      group.children.forEach((child) => {
        if (child.isMesh) box.expandByObject(child);
      });
      return { min: box.min, max: box.max };
    },
    dispose() {
      group.traverse((obj) => {
        if (obj.isMesh) obj.geometry.dispose();
      });
    },
  };
}

export { ISLAND, PALETTE };
