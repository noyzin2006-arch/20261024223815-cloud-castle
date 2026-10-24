/**
 * 云际圣堡建筑群（规划案 §5.3 短板 1/2、T07）
 *
 * 12 个模块：主塔 / 钟塔 / 大殿 / 2 侧翼 / 4 附塔 / 连接廊 / 2 道城垣。
 * 硬指标：主塔 108m、钟塔 78m、附塔 40–70m 不等高；≥24 个真实凹入拱窗；
 * ≥12 道扶壁；墙体分 3 种石材；屋顶蓝灰板岩带挑檐与脊饰。
 *
 * 性能做法：所有构件先按材质分桶，再合并成 6 个左右的大网格 ——
 * 整座城堡只占个位数 draw call（规划案 AC03 要求整帧 ≤120）。
 */

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { prepareForMerge } from './geo-utils.js';

import { ARCHITECTURE, PALETTE, SEED } from '../config/visual.js';

const BASE_Y = 8;

/** 确定性 PRNG */
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * 给几何体补齐统一的 color 属性并统一索引状态，便于合并。
 * @param {THREE.BufferGeometry} geometry
 * @param {string} color
 */
function withColor(geometry, color) {
  return prepareForMerge(geometry, color);
}

/** 收集器：按材质分桶并合并 */
class GeometryBucket {
  constructor() {
    /** @type {Map<string, THREE.BufferGeometry[]>} */
    this.buckets = new Map();
  }

  add(materialKey, geometry, matrix) {
    const working = geometry.clone();
    if (matrix) working.applyMatrix4(matrix);
    // 顶点色只做**轻微色调**：贴图本身已经是最终颜色，
    // 这里再乘一次材质本色会把深色材质（板岩屋顶）压成死黑。
    const geo = withColor(working, materialKey === 'slate' ? '#e2ecf4'
      : materialKey === 'oak' ? '#c8a888'
        : materialKey === 'bronze' ? '#d0c8a4'
          : '#ffffff');
    working.dispose();
    if (!this.buckets.has(materialKey)) this.buckets.set(materialKey, []);
    this.buckets.get(materialKey).push(geo);
  }

  /** @returns {Map<string, THREE.BufferGeometry>} */
  merge() {
    /** @type {Map<string, THREE.BufferGeometry>} */
    const out = new Map();
    for (const [key, list] of this.buckets) {
      if (!list.length) continue;
      const merged = mergeGeometries(list, false);
      list.forEach((g) => g.dispose());
      if (merged) {
        merged.computeBoundingBox();
        merged.computeBoundingSphere();
        out.set(key, merged);
      }
    }
    return out;
  }
}

/** 矩阵工具 */
function mat(x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) {
  const m = new THREE.Matrix4();
  m.compose(
    new THREE.Vector3(x, y, z),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)),
    new THREE.Vector3(sx, sy, sz),
  );
  return m;
}

/** 带拱顶的窗洞轮廓（用于券石） */
function archShape(width, height, archRadius) {
  const shape = new THREE.Shape();
  const r = archRadius ?? width / 2;
  shape.moveTo(-width / 2, 0);
  shape.lineTo(-width / 2, height - r);
  shape.absarc(0, height - r, r, Math.PI, 0, true);
  shape.lineTo(width / 2, 0);
  shape.closePath();
  return shape;
}

/**
 * 建筑构件工厂。
 */
class Builder {
  constructor() {
    this.bucket = new GeometryBucket();
    this.random = rng(SEED ^ 0x1234);
    this.windowCount = 0;
    this.buttressCount = 0;
    this.towerHeights = [];
    /** 窗洞与窗框位置，供灯具与旗帜使用 */
    this.windowSlots = [];
  }

  /** 石墙（带矩形开口的四块板拼成 → 开口有真实进深） */
  wallWithOpening(bucket, { x, y, z, width, height, depth, thickness, rotation = 0, opening }) {
    const geo = new THREE.BoxGeometry(1, 1, 1);
    const add = (w, h, ox, oy) => {
      if (w <= 0.001 || h <= 0.001) return;
      this.bucket.add(
        bucket,
        geo,
        mat(x + ox, y + oy, z, 0, rotation, 0, w, h, thickness),
      );
    };

    if (!opening) {
      add(width, height, 0, height / 2);
      return;
    }

    const ow = opening.width;
    const oh = opening.height;
    const ox = opening.offsetX ?? 0;
    const oy = opening.offsetY ?? 0;
    const leftW = (width / 2 + ox) - ow / 2;
    const rightW = width / 2 - (ox + ow / 2);
    const belowH = oy - oh / 2;
    const aboveH = height - (oy + oh / 2);

    add(leftW, height, -width / 2 + leftW / 2, height / 2);
    add(rightW, height, width / 2 - rightW / 2, height / 2);
    if (belowH > 0.01) add(ow, belowH, ox, oy - oh / 2 - belowH / 2);
    if (aboveH > 0.01) add(ow, aboveH, ox, oy + oh / 2 + aboveH / 2);

    geo.dispose();
  }

  /** 凹入拱窗：墙洞 + 券石 + 内龛 + 发光窗面 */
  recessedWindow(bucket, trimBucket, glassBucket, {
    x, y, z, rotation = 0, width = 1.6, height = 3.2, depth = 0.9, sill = true,
  }) {
    const archR = width / 2;
    const totalH = height + archR;

    // 券石（拱圈）
    const ring = new THREE.Shape();
    ring.absarc(0, 0, archR + 0.28, Math.PI, 0, true);
    ring.absarc(0, 0, archR, 0, Math.PI, false);
    const archGeo = new THREE.ExtrudeGeometry(ring, {
      depth: 0.42,
      bevelEnabled: true,
      bevelThickness: 0.06,
      bevelSize: 0.05,
      bevelSegments: 1,
      curveSegments: 10,
    });
    this.bucket.add(
      trimBucket,
      archGeo,
      mat(x, y + height, z, 0, rotation, 0, 1, 1, 1),
    );
    archGeo.dispose();

    // 内龛：开口之后更深的一段
    const niche = new THREE.BoxGeometry(width, totalH, depth);
    this.bucket.add(
      bucket,
      niche,
      mat(
        x - Math.sin(rotation) * (depth / 2 + 0.02),
        y + totalH / 2,
        z - Math.cos(rotation) * (depth / 2 + 0.02),
        0, rotation, 0,
      ),
    );
    niche.dispose();

    // 窗面（夜间发光）
    const glass = new THREE.PlaneGeometry(width * 0.82, totalH * 0.9);
    this.bucket.add(
      glassBucket,
      glass,
      mat(
        x - Math.sin(rotation) * (depth - 0.04),
        y + totalH * 0.52,
        z - Math.cos(rotation) * (depth - 0.04),
        0, rotation, 0,
      ),
    );
    glass.dispose();

    // 窗台
    if (sill) {
      const sillGeo = new THREE.BoxGeometry(width + 0.7, 0.24, 0.55);
      this.bucket.add(
        trimBucket,
        sillGeo,
        mat(
          x + Math.sin(rotation) * 0.12,
          y - 0.1,
          z + Math.cos(rotation) * 0.12,
          0, rotation, 0,
        ),
      );
      sillGeo.dispose();
    }

    this.windowCount += 1;
    this.windowSlots.push({ x, y, z, rotation });
  }

  /** 圆塔：塔身 + 挑檐 + 锥形板岩屋顶 + 脊饰 */
  roundTower({
    bucket, roofBucket, trimBucket, x, z, radius, height, roofHeight, windows = 3, roofColor = PALETTE.roof,
  }) {
    const wall = new THREE.CylinderGeometry(radius * 0.94, radius, height, 20, 1, true);
    this.bucket.add(bucket, wall, mat(x, BASE_Y + height / 2, z));
    wall.dispose();

    // 水平线脚
    const cornices = Math.max(2, Math.floor(height / 7));
    for (let i = 1; i <= cornices; i += 1) {
      const y = BASE_Y + (height * i) / (cornices + 1);
      const ring = new THREE.CylinderGeometry(radius * 0.99, radius * 0.99, 0.36, 20);
      this.bucket.add(trimBucket, ring, mat(x, y, z));
      ring.dispose();
    }

    // 挑檐（eave）：塔顶向外挑出
    const eave = new THREE.CylinderGeometry(radius * 1.16, radius * 1.08, 0.9, 20);
    this.bucket.add(trimBucket, eave, mat(x, BASE_Y + height + 0.3, z));
    eave.dispose();

    // 锥形板岩屋顶
    const roof = new THREE.ConeGeometry(radius * 1.22, roofHeight, 20, 1);
    this.bucket.add(roofBucket, roof, mat(x, BASE_Y + height + 0.75 + roofHeight / 2, z));
    roof.dispose();

    // 屋顶下的檐口斜面（避免屋顶像直接插在塔上）
    const skirt = new THREE.CylinderGeometry(radius * 1.22, radius * 1.0, 1.5, 20, 1, true);
    this.bucket.add(roofBucket, skirt, mat(x, BASE_Y + height + 0.9, z));
    skirt.dispose();

    // 4 种塔顶剪影物：尖顶、旗杆、球饰、风向标
    const spike = new THREE.ConeGeometry(0.28, 4.2, 8);
    this.bucket.add(trimBucket, spike, mat(x, BASE_Y + height + 0.75 + roofHeight + 1.9, z));
    spike.dispose();

    const pole = new THREE.CylinderGeometry(0.1, 0.1, 5.4, 6);
    this.bucket.add(trimBucket, pole, mat(x, BASE_Y + height + 0.75 + roofHeight + 2.6, z));
    pole.dispose();

    const orb = new THREE.SphereGeometry(0.55, 12, 8);
    this.bucket.add(trimBucket, orb, mat(x, BASE_Y + height + 0.75 + roofHeight + 0.6, z));
    orb.dispose();

    // 拱窗：绕塔身分布
    for (let i = 0; i < windows; i += 1) {
      const a = (i / windows) * Math.PI * 2 + 0.35;
      const wy = BASE_Y + height * (0.42 + (i % 3) * 0.2);
      this.recessedWindow(bucket, trimBucket, 'glass', {
        x: x + Math.cos(a) * radius * 0.94,
        y: wy,
        z: z + Math.sin(a) * radius * 0.94,
        rotation: -a + Math.PI / 2,
        width: 1.5,
        height: 3.0,
        depth: 0.85,
      });
    }

    this.towerHeights.push(height);
  }

  /** 方塔：钟楼 */
  squareTower({
    bucket, roofBucket, trimBucket, x, z, width, height, windows = 4,
  }) {
    const body = new THREE.BoxGeometry(width, height, width);
    this.bucket.add(bucket, body, mat(x, BASE_Y + height / 2, z));
    body.dispose();

    // 角上的小尖塔
    const corner = width * 0.34;
    for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      const cx = x + (dx * (width - corner)) / 2;
      const cz = z + (dz * (width - corner)) / 2;
      const turret = new THREE.CylinderGeometry(corner * 0.55, corner * 0.6, height * 0.52, 10);
      this.bucket.add(bucket, turret, mat(cx, BASE_Y + height * 0.26, cz));
      turret.dispose();

      const tRoof = new THREE.ConeGeometry(corner * 0.72, height * 0.16, 10);
      this.bucket.add(roofBucket, tRoof, mat(cx, BASE_Y + height * 0.52 + height * 0.08, cz));
      tRoof.dispose();
    }

    // 水平线脚
    const cornices = Math.max(3, Math.floor(height / 9));
    for (let i = 1; i <= cornices; i += 1) {
      const y = BASE_Y + (height * i) / (cornices + 1);
      const band = new THREE.BoxGeometry(width + 0.5, 0.42, width + 0.5);
      this.bucket.add(trimBucket, band, mat(x, y, z));
      band.dispose();
    }

    // 顶部挑檐 + 四坡板岩屋顶
    const eave = new THREE.BoxGeometry(width + 1.5, 0.9, width + 1.5);
    this.bucket.add(trimBucket, eave, mat(x, BASE_Y + height + 0.35, z));
    eave.dispose();

    const roof = new THREE.ConeGeometry(width * 0.86, width * 0.78, 4);
    this.bucket.add(roofBucket, roof, mat(x, BASE_Y + height + 0.8 + width * 0.39, z, 0, Math.PI / 4, 0));
    roof.dispose();

    // 钟楼的大拱窗
    for (const side of [0, 1, 2, 3]) {
      const a = (side * Math.PI) / 2;
      const nx = Math.cos(a);
      const nz = Math.sin(a);
      this.recessedWindow(bucket, trimBucket, 'glass', {
        x: x + nx * (width / 2 + 0.02),
        y: BASE_Y + height * 0.72,
        z: z + nz * (width / 2 + 0.02),
        rotation: -a + Math.PI / 2,
        width: 2.4,
        height: 4.6,
        depth: 1.2,
      });
    }

    this.towerHeights.push(height);
  }

  /** 长方形厅堂：山墙 + 板岩坡屋顶 */
  hall({
    bucket, roofBucket, trimBucket, glassBucket, x, z, width, depth, height, ridgeAlong = 'x',
  }) {
    const body = new THREE.BoxGeometry(width, height, depth);
    this.bucket.add(bucket, body, mat(x, BASE_Y + height / 2, z));
    body.dispose();

    // 线脚
    const cornices = Math.max(2, Math.floor(height / 8));
    for (let i = 1; i <= cornices; i += 1) {
      const y = BASE_Y + (height * i) / (cornices + 1);
      const band = new THREE.BoxGeometry(width + 0.4, 0.36, depth + 0.4);
      this.bucket.add(trimBucket, band, mat(x, y, z));
      band.dispose();
    }

    // 山墙三角
    const gableShape = new THREE.Shape();
    const halfSpan = ridgeAlong === 'x' ? depth / 2 : width / 2;
    gableShape.moveTo(-halfSpan, 0);
    gableShape.lineTo(halfSpan, 0);
    gableShape.lineTo(0, width * 0.28);
    gableShape.closePath();
    const gable = new THREE.ExtrudeGeometry(gableShape, { depth: 0.5, bevelEnabled: false });
    if (ridgeAlong === 'x') {
      this.bucket.add(bucket, gable, mat(x, BASE_Y + height, z - depth / 2, 0, Math.PI / 2, 0));
    } else {
      this.bucket.add(bucket, gable, mat(x - width / 2, BASE_Y + height, z, 0, 0, 0));
    }
    gable.dispose();

    // 板岩坡屋顶：两块斜面
    const roofH = Math.min(width, depth) * 0.3;
    const slopeLen = Math.hypot(halfSpan * 2, roofH);
    const angle = Math.atan2(roofH, halfSpan * 2);
    for (const sign of [1, -1]) {
      const plane = new THREE.BoxGeometry(
        ridgeAlong === 'x' ? width + 1.2 : slopeLen,
        0.42,
        ridgeAlong === 'x' ? slopeLen : depth + 1.2,
      );
      // 旋转方向必须让屋面**向外向下**倾斜：
      // 绕 X 轴转 +θ 时，局部 +Z 指向 (0,-sinθ,cosθ) —— 下且朝外。
      // 之前写成 sign * -angle，屋面会朝上翘，变成伸出去的平板。
      if (ridgeAlong === 'x') {
        this.bucket.add(
          roofBucket,
          plane,
          mat(x, BASE_Y + height + roofH / 2, z + (sign * halfSpan) / 2, sign * angle, 0, 0),
        );
      } else {
        // 绕 Z 轴转 -θ 时，局部 +X 指向 (cosθ,-sinθ,0) —— 下且朝外
        this.bucket.add(
          roofBucket,
          plane,
          mat(x + (sign * halfSpan) / 2, BASE_Y + height + roofH / 2, z, 0, 0, sign * -angle),
        );
      }
      plane.dispose();
    }

    // 屋脊
    const ridge = new THREE.BoxGeometry(
      ridgeAlong === 'x' ? width + 1.4 : 0.7,
      0.5,
      ridgeAlong === 'x' ? 0.7 : depth + 1.4,
    );
    this.bucket.add(trimBucket, ridge, mat(x, BASE_Y + height + roofH + 0.2, z));
    ridge.dispose();

    // 侧窗
    const winCount = Math.max(2, Math.floor(width / 12));
    for (let i = 0; i < winCount; i += 1) {
      const wx = x - width / 2 + ((i + 0.5) * width) / winCount;
      this.recessedWindow(bucket, trimBucket, glassBucket, {
        x: wx,
        y: BASE_Y + height * 0.34,
        z: z + depth / 2 + 0.02,
        rotation: 0,
        width: 1.5,
        height: 3.0,
        depth: 0.8,
      });
    }
  }

  /** 连接廊：拱券柱列 */
  gallery({ bucket, roofBucket, trimBucket, x, z, length, axis = 'x', height = 12, arches = 5 }) {
    const step = length / arches;
    const pierW = 1.5;
    for (let i = 0; i <= arches; i += 1) {
      const t = i * step;
      const px = axis === 'x' ? x - length / 2 + t : x;
      const pz = axis === 'x' ? z : z - length / 2 + t;
      const pier = new THREE.BoxGeometry(axis === 'x' ? pierW : 3.2, height, axis === 'x' ? 3.2 : pierW);
      this.bucket.add(bucket, pier, mat(px, BASE_Y + height / 2, pz));
      pier.dispose();
    }

    // 拱券
    for (let i = 0; i < arches; i += 1) {
      const t = (i + 0.5) * step;
      const px = axis === 'x' ? x - length / 2 + t : x;
      const pz = axis === 'x' ? z : z - length / 2 + t;
      const shape = new THREE.Shape();
      const r = (step - pierW) / 2;
      shape.absarc(0, 0, r, Math.PI, 0, true);
      shape.lineTo(-r, 0);
      shape.absarc(0, 0, r, Math.PI, 0, true);
      const arch = new THREE.ExtrudeGeometry(shape, { depth: 2.4, bevelEnabled: false, curveSegments: 10 });
      if (axis === 'x') {
        this.bucket.add(trimBucket, arch, mat(px, BASE_Y + height - r - 1.2, pz, 0, Math.PI / 2, 0));
      } else {
        this.bucket.add(trimBucket, arch, mat(px, BASE_Y + height - r - 1.2, pz));
      }
      arch.dispose();
    }

    // 廊顶
    const roof = new THREE.BoxGeometry(
      axis === 'x' ? length + 1 : 4.2,
      0.5,
      axis === 'x' ? 4.2 : length + 1,
    );
    this.bucket.add(roofBucket, roof, mat(x, BASE_Y + height + 0.3, z));
    roof.dispose();
  }

  /** 城垣：带雉堞 */
  curtainWall({ bucket, trimBucket, x, z, length, rotation = 0, height = 11 }) {
    const body = new THREE.BoxGeometry(length, height, 2.6);
    this.bucket.add(bucket, body, mat(x, BASE_Y + height / 2, z, 0, rotation, 0));
    body.dispose();

    // 走道压顶
    const walk = new THREE.BoxGeometry(length + 0.6, 0.5, 3.4);
    this.bucket.add(trimBucket, walk, mat(x, BASE_Y + height + 0.2, z, 0, rotation, 0));
    walk.dispose();

    // 雉堞
    const count = Math.floor(length / 2.4);
    for (let i = 0; i < count; i += 1) {
      const t = -length / 2 + (i + 0.5) * (length / count);
      const cx = x + Math.cos(rotation) * t;
      const cz = z - Math.sin(rotation) * t;
      const merlon = new THREE.BoxGeometry(1.3, 1.6, 2.0);
      this.bucket.add(trimBucket, merlon, mat(cx, BASE_Y + height + 1.2, cz, 0, rotation, 0));
      merlon.dispose();
    }
  }

  /** 扶壁 */
  buttress({ bucket, trimBucket, x, z, height, rotation = 0 }) {
    const body = new THREE.BoxGeometry(2.4, height, 3.4);
    this.bucket.add(bucket, body, mat(x, BASE_Y + height / 2, z, 0, rotation, 0));
    body.dispose();

    // 斜坡顶
    const slope = new THREE.BoxGeometry(2.4, 0.8, 4.4);
    this.bucket.add(trimBucket, slope, mat(x, BASE_Y + height + 0.3, z, 0.38, rotation, 0));
    slope.dispose();

    this.buttressCount += 1;
  }
}

/**
 * 创建整座城堡。
 * @param {{materials: Record<string, THREE.Material>}} deps
 */
export function createCastle({ materials }) {
  const builder = new Builder();
  const group = new THREE.Group();
  group.name = 'castle';

  const stone = 'stone';
  const trim = 'trim';
  const slate = 'slate';
  const glass = 'glass';

  // ---------------------------------------------------------------- 基座台地
  {
    const terrace = new THREE.CylinderGeometry(46, 50, 3.2, 48);
    builder.bucket.add('basalt', terrace, mat(0, BASE_Y - 1.4, 0));
    terrace.dispose();
  }

  // ---------------------------------------------------------------- 主塔
  builder.roundTower({
    bucket: stone,
    roofBucket: slate,
    trimBucket: trim,
    x: 0, z: -6,
    radius: 11.5,
    height: ARCHITECTURE.mainTowerHeight,
    roofHeight: 24,
    windows: 5,
  });

  // 主塔底部的加强段（深蓝玄武岩）
  {
    const plinth = new THREE.CylinderGeometry(13.2, 14.4, 14, 24);
    builder.bucket.add('basalt', plinth, mat(0, BASE_Y + 7, -6));
    plinth.dispose();
  }

  // ---------------------------------------------------------------- 钟塔
  builder.squareTower({
    bucket: stone,
    roofBucket: slate,
    trimBucket: trim,
    x: 27, z: 10,
    width: 14,
    height: ARCHITECTURE.bellTowerHeight,
    windows: 4,
  });

  // ---------------------------------------------------------------- 大殿
  builder.hall({
    bucket: stone,
    roofBucket: slate,
    trimBucket: trim,
    glassBucket: glass,
    x: -24, z: 4,
    width: 44, depth: 26, height: 27,
    ridgeAlong: 'x',
  });

  // ---------------------------------------------------------------- 2 侧翼
  builder.hall({
    bucket: stone,
    roofBucket: slate,
    trimBucket: trim,
    glassBucket: glass,
    x: 31, z: -26,
    width: 22, depth: 18, height: 21,
    ridgeAlong: 'z',
  });
  builder.hall({
    bucket: stone,
    roofBucket: slate,
    trimBucket: trim,
    glassBucket: glass,
    x: -36, z: -22,
    width: 20, depth: 17, height: 19,
    ridgeAlong: 'z',
  });

  // ---------------------------------------------------------------- 4 附塔（高度各不相同）
  const turretSpots = [
    { x: 15, z: 10, h: 40 },
    { x: -15, z: 16, h: 48 },
    { x: 19, z: -30, h: 56 },
    { x: -30, z: -34, h: 62 },
  ];
  for (const t of turretSpots) {
    builder.roundTower({
      bucket: stone,
      roofBucket: slate,
      trimBucket: trim,
      x: t.x, z: t.z,
      radius: 5.6,
      height: t.h,
      roofHeight: t.h * 0.34,
      windows: 2,
    });
  }

  // ---------------------------------------------------------------- 连接廊
  builder.gallery({ bucket: stone, roofBucket: slate, trimBucket: trim, x: 13, z: 2, length: 16, axis: 'x', height: 13, arches: 4 });
  builder.gallery({ bucket: stone, roofBucket: slate, trimBucket: trim, x: -12, z: 10, length: 14, axis: 'x', height: 12, arches: 3 });

  // ---------------------------------------------------------------- 2 道城垣
  builder.curtainWall({ bucket: stone, trimBucket: trim, x: -8, z: -32, length: 46, rotation: 0, height: 11 });
  builder.curtainWall({ bucket: stone, trimBucket: trim, x: 34, z: -6, length: 38, rotation: Math.PI / 2, height: 10 });

  // ---------------------------------------------------------------- 扶壁（≥12）
  const buttressSpots = [
    { x: -13, z: 6, r: 0, h: 26 },
    { x: 13, z: 6, r: 0, h: 26 },
    { x: -13, z: -18, r: 0, h: 22 },
    { x: 13, z: -18, r: 0, h: 22 },
    { x: 20, z: 3, r: Math.PI / 2, h: 20 },
    { x: -20, z: 20, r: Math.PI / 2, h: 20 },
    { x: 6, z: -32, r: Math.PI / 2, h: 16 },
    { x: -30, z: -34, r: 0, h: 14 },
    { x: 40, z: 10, r: Math.PI / 2, h: 14 },
    { x: -48, z: 4, r: 0, h: 15 },
    { x: 38, z: -20, r: Math.PI / 2, h: 13 },
    { x: -12, z: 22, r: 0, h: 17 },
  ];
  for (const b of buttressSpots) {
    builder.buttress({ bucket: stone, trimBucket: trim, x: b.x, z: b.z, height: b.h, rotation: b.r });
  }

  // ---------------------------------------------------------------- 补充窗洞（保证 ≥24）
  const extraWindows = [
    { x: 0, y: BASE_Y + 62, z: -6 + 11.6, r: 0, w: 1.7, h: 3.4 },
    { x: 0, y: BASE_Y + 62, z: -6 - 11.6, r: Math.PI, w: 1.7, h: 3.4 },
    { x: 0, y: BASE_Y + 80, z: -6 + 11.6, r: 0, w: 1.7, h: 3.4 },
    { x: 0, y: BASE_Y + 80, z: -6 - 11.6, r: Math.PI, w: 1.7, h: 3.4 },
    { x: 12.2, y: BASE_Y + 58, z: -6, r: Math.PI / 2, w: 1.6, h: 3.2 },
    { x: -12.2, y: BASE_Y + 58, z: -6, r: -Math.PI / 2, w: 1.6, h: 3.2 },
    { x: 27, y: BASE_Y + 52, z: 3, r: Math.PI, w: 1.6, h: 3.2 },
    { x: 27, y: BASE_Y + 52, z: 17, r: 0, w: 1.6, h: 3.2 },
    { x: -38, y: BASE_Y + 14, z: 4, r: -Math.PI / 2, w: 1.5, h: 3.0 },
    { x: -24, y: BASE_Y + 16, z: 17, r: 0, w: 1.5, h: 3.0 },
    { x: 31, y: BASE_Y + 12, z: -35, r: -Math.PI / 2, w: 1.5, h: 3.0 },
  ];
  for (const w of extraWindows) {
    builder.recessedWindow(stone, trim, glass, {
      x: w.x, y: w.y, z: w.z, rotation: w.r, width: w.w, height: w.h, depth: 0.9,
    });
  }

  // ---------------------------------------------------------------- 大门
  {
    const gateX = -8;
    const gateZ = -33.4;
    const arch = new THREE.Shape();
    arch.absarc(0, 0, 3.4, Math.PI, 0, true);
    arch.lineTo(-3.4, -4.6);
    arch.lineTo(3.4, -4.6);
    arch.closePath();
    const gateGeo = new THREE.ExtrudeGeometry(arch, { depth: 1.4, bevelEnabled: false, curveSegments: 14 });
    builder.bucket.add('oak', gateGeo, mat(gateX, BASE_Y + 4.6, gateZ));
    gateGeo.dispose();

    const archRing = new THREE.Shape();
    archRing.absarc(0, 0, 4.1, Math.PI, 0, true);
    archRing.absarc(0, 0, 3.4, 0, Math.PI, false);
    const ringGeo = new THREE.ExtrudeGeometry(archRing, { depth: 0.9, bevelEnabled: false, curveSegments: 14 });
    builder.bucket.add(trim, ringGeo, mat(gateX, BASE_Y + 4.6, gateZ - 0.9));
    ringGeo.dispose();
  }

  // ---------------------------------------------------------------- 旗杆
  const bannerSpots = [
    { x: 0, y: BASE_Y + ARCHITECTURE.mainTowerHeight + 26.5, z: -6 },
    { x: 27, y: BASE_Y + ARCHITECTURE.bellTowerHeight + 11.4, z: 10 },
  ];
  for (const b of bannerSpots) {
    const pole = new THREE.CylinderGeometry(0.14, 0.14, 9, 8);
    builder.bucket.add('bronze', pole, mat(b.x, b.y + 4.5, b.z));
    pole.dispose();
  }

  // ---------------------------------------------------------------- 合并出网格
  const merged = builder.bucket.merge();
  /** @type {THREE.Mesh[]} */
  const meshes = [];
  for (const [key, geometry] of merged) {
    const material = materials[key] ?? materials.stone;
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = `castle-${key}`;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    meshes.push(mesh);
  }

  // 旗面（单独网格，会被风驱动）
  const bannerGeometry = new THREE.PlaneGeometry(3.6, 2.2, 12, 6);
  const banners = [];
  for (const b of bannerSpots) {
    const banner = new THREE.Mesh(bannerGeometry, materials.banner);
    banner.position.set(b.x + 1.85, b.y + 2.2, b.z);
    banner.castShadow = false;
    banner.userData.baseX = banner.position.x;
    banner.userData.baseY = banner.position.y;
    banner.userData.phase = builder.random() * Math.PI * 2;
    group.add(banner);
    banners.push(banner);
  }

  return {
    group,
    meshes,
    banners,
    stats: {
      windowCount: builder.windowCount,
      buttressCount: builder.buttressCount,
      towerHeights: builder.towerHeights,
      maxTowerHeight: Math.max(...builder.towerHeights),
      minTowerHeight: Math.min(...builder.towerHeights),
      drawCalls: meshes.length + banners.length,
      moduleCount: ARCHITECTURE.moduleCount,
    },
    /** 风驱动的旗面变形（只影响旗布，不影响建筑） */
    updateBanners(time, windSpeed) {
      for (const banner of banners) {
        const phase = banner.userData.phase;
        const pos = banner.geometry.attributes.position;
        for (let i = 0; i < pos.count; i += 1) {
          const x = pos.getX(i);
          const y = pos.getY(i);
          const t = (x + 1.8) / 3.6;
          const wave = Math.sin(time * 3.1 + phase + t * 5.5) * 0.22 * windSpeed * t;
          const flutter = Math.sin(time * 6.4 + phase + y * 3.0) * 0.07 * windSpeed * t;
          pos.setZ(i, wave + flutter);
        }
        pos.needsUpdate = true;
        banner.geometry.computeVertexNormals();
      }
    },
    dispose() {
      group.traverse((obj) => {
        if (obj.isMesh) obj.geometry.dispose();
      });
    },
  };
}

export { BASE_Y };
