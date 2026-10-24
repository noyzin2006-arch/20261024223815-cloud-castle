/**
 * 表面细节层 —— 消掉「贴了图的盒子」感（规划案 §5.3 的近看要求）
 *
 * 三件事：
 *   1) 几何级顶点扰动：按**世界坐标**做低频位移，保证相邻构件接缝连续；
 *      墙不再是完美平面，边缘高光会断，轮廓不再刀切。
 *   2) 片元级逐砌块色差与灰缝加深：按世界坐标的砌块网格取哈希，
 *      每个砌块有独立的亮度/色偏，灰缝真实变深 —— 比单纯叠贴图可信得多。
 *   3) 墙脚碎石：在建筑与地面交界处撒一批碎块，打断「干净盒子」的底边。
 *
 * 全部走世界坐标 → 不管构件怎么旋转摆放，砌缝都是对齐的。
 */

import * as THREE from 'three';

/* ------------------------------------------------------------------ *
 * 1) 几何级顶点扰动
 * ------------------------------------------------------------------ */

/** 确定性 3D 哈希噪声（0..1） */
function hash3(x, y, z) {
  let h = x * 374761393 + y * 668265263 + z * 2147483647;
  h = (h ^ (h >>> 13)) * 1274126177;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** 三线性插值的值噪声 */
function valueNoise(x, y, z) {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const zi = Math.floor(z);
  const xf = x - xi;
  const yf = y - yi;
  const zf = z - zi;
  const u = xf * xf * (3 - 2 * xf);
  const v = yf * yf * (3 - 2 * yf);
  const w = zf * zf * (3 - 2 * zf);
  const lerp = (a, b, t) => a + (b - a) * t;
  const c = (dx, dy, dz) => hash3(xi + dx, yi + dy, zi + dz);
  const x00 = lerp(c(0, 0, 0), c(1, 0, 0), u);
  const x10 = lerp(c(0, 1, 0), c(1, 1, 0), u);
  const x01 = lerp(c(0, 0, 1), c(1, 0, 1), u);
  const x11 = lerp(c(0, 1, 1), c(1, 1, 1), u);
  return lerp(lerp(x00, x10, v), lerp(x01, x11, v), w);
}

/**
 * 沿法线做顶点扰动。必须在**世界坐标**下计算，否则相邻构件接缝会裂开。
 * @param {THREE.BufferGeometry} geometry 已经 apply 过世界矩阵
 * @param {{amount?:number, frequency?:number, seed?:number}} [options]
 */
export function displaceVertices(geometry, options = {}) {
  const amount = options.amount ?? 0.06;
  const frequency = options.frequency ?? 0.35;
  const seed = options.seed ?? 0;

  const pos = geometry.attributes.position;
  const nor = geometry.attributes.normal;
  if (!pos || !nor) return geometry;

  for (let i = 0; i < pos.count; i += 1) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const n = valueNoise(
      x * frequency + seed,
      y * frequency + seed * 1.7,
      z * frequency + seed * 2.3,
    ) - 0.5;
    const d = n * 2 * amount;
    pos.setXYZ(
      i,
      x + nor.getX(i) * d,
      y + nor.getY(i) * d,
      z + nor.getZ(i) * d,
    );
  }
  pos.needsUpdate = true;
  geometry.computeVertexNormals();
  return geometry;
}

/* ------------------------------------------------------------------ *
 * 2) 片元级逐砌块色差
 * ------------------------------------------------------------------ */

const MASONRY_VERT_INJECT = /* glsl */`
  varying vec3 vMasonryWorld;
  varying vec3 vMasonryNormalW;
`;

const MASONRY_VERT_BODY = /* glsl */`
  vMasonryWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;
  vMasonryNormalW = normalize(mat3(modelMatrix) * objectNormal);
`;

/**
 * 片元着色器：按世界坐标的砌块网格取哈希，逐块给亮度/色偏，并把灰缝压深。
 * @param {THREE.Material} material
 * @param {{blockSize?:number, seamWidth?:number, seamDarken?:number, variation?:number, tint?:number[], cacheKey?:string}} [options]
 */
export function applyMasonryDetail(material, options = {}) {
  const blockSize = options.blockSize ?? 0.46;
  const seamWidth = options.seamWidth ?? 0.055;
  const seamDarken = options.seamDarken ?? 0.38;
  const variation = options.variation ?? 0.11;
  const tint = options.tint ?? [1.0, 0.99, 0.96];
  const cacheKey = options.cacheKey ?? 'masonry-v1';

  material.onBeforeCompile = (shader) => {
    shader.uniforms.uMasonryBlock = { value: blockSize };
    shader.uniforms.uMasonrySeam = { value: seamWidth };
    shader.uniforms.uMasonrySeamDarken = { value: seamDarken };
    shader.uniforms.uMasonryVariation = { value: variation };
    shader.uniforms.uMasonryTint = { value: new THREE.Vector3(...tint) };

    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${MASONRY_VERT_INJECT}`)
      .replace('#include <worldpos_vertex>', `#include <worldpos_vertex>\n${MASONRY_VERT_BODY}`);

    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', /* glsl */`
        #include <common>
        varying vec3 vMasonryWorld;
        varying vec3 vMasonryNormalW;
        uniform float uMasonryBlock;
        uniform float uMasonrySeam;
        uniform float uMasonrySeamDarken;
        uniform float uMasonryVariation;
        uniform vec3 uMasonryTint;

        float akMasonryHash(vec3 p) {
          p = fract(p * 0.1031);
          p += dot(p, p.yzx + 33.33);
          return fract((p.x + p.y) * p.z);
        }
      `)
      .replace('#include <map_fragment>', /* glsl */`
        #include <map_fragment>

        // 按世界法线的主轴选投影平面：砌缝在任何朝向的墙上都是水平的
        vec3 an = abs(normalize(vMasonryNormalW));
        vec2 planeUV = an.y > max(an.x, an.z)
          ? vMasonryWorld.xz
          : (an.x > an.z ? vMasonryWorld.zy : vMasonryWorld.xy);

        vec2 cell = floor(planeUV / uMasonryBlock);
        vec2 inCell = fract(planeUV / uMasonryBlock);

        // 每块独立的亮度与色偏
        float bh = akMasonryHash(vec3(cell, 3.7));
        float bh2 = akMasonryHash(vec3(cell.yx, 9.1));
        float blockValue = 1.0 + (bh - 0.5) * uMasonryVariation * 2.0;
        vec3 blockTint = uMasonryTint * (1.0 + (bh2 - 0.5) * 0.06);

        // 灰缝：到格边界的距离
        vec2 edge = min(inCell, 1.0 - inCell) * uMasonryBlock;
        float seam = smoothstep(0.0, uMasonrySeam, min(edge.x, edge.y));

        // 缝里更暗更灰，块面各自偏亮偏暗
        diffuseColor.rgb *= blockTint * blockValue;
        diffuseColor.rgb *= mix(1.0 - uMasonrySeamDarken, 1.0, seam);
      `);
  };

  // 程序缓存必须区分参数，否则不同材质的着色器会互相串
  material.customProgramCacheKey = () => cacheKey;
  material.needsUpdate = true;
  return material;
}

/* ------------------------------------------------------------------ *
 * 3) 墙脚碎石
 * ------------------------------------------------------------------ */

/**
 * 在建筑与地面交界处撒一批碎块，打断底边。
 * @param {Object} options
 * @param {THREE.Material} options.material
 * @param {THREE.BufferGeometry} [options.geometry]
 * @param {number} options.count
 * @param {(x:number,z:number)=>number} options.groundAt 取该处地面高度
 * @param {Array<{x:number,z:number,r:number}>} options.zones 允许散布的区域
 * @param {number} [options.seed]
 */
export function scatterRubble({
  material,
  geometry,
  count,
  groundAt,
  zones,
  seed = 1337,
}) {
  const geo = geometry ?? new THREE.IcosahedronGeometry(1, 0);
  if (!geometry) {
    const pos = geo.attributes.position;
    const v = new THREE.Vector3();
    for (let i = 0; i < pos.count; i += 1) {
      v.fromBufferAttribute(pos, i);
      // 位移只取决于位置 → 重复顶点不会撕裂
      const s = 0.7 + 0.5 * Math.abs(Math.sin(v.x * 7.3 + v.y * 5.1 + v.z * 9.7));
      v.multiplyScalar(s);
      v.y *= 0.55;
      pos.setXYZ(i, v.x, v.y, v.z);
    }
    geo.computeVertexNormals();
  }

  const mesh = new THREE.InstancedMesh(geo, material, count);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.name = 'rubble';

  const random = (() => {
    let a = seed >>> 0;
    return () => {
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  })();

  const matrix = new THREE.Matrix4();
  const quaternion = new THREE.Quaternion();
  const euler = new THREE.Euler();
  const position = new THREE.Vector3();
  const scale = new THREE.Vector3();

  for (let i = 0; i < count; i += 1) {
    const zone = zones[i % zones.length];
    const angle = random() * Math.PI * 2;
    const radius = zone.r * (0.72 + random() * 0.34);
    const x = zone.x + Math.cos(angle) * radius;
    const z = zone.z + Math.sin(angle) * radius;
    const y = groundAt(x, z);

    position.set(x, y + 0.06, z);
    euler.set(random() * 0.8 - 0.4, random() * Math.PI * 2, random() * 0.8 - 0.4);
    quaternion.setFromEuler(euler);
    const s = 0.28 + random() * 0.85;
    scale.set(s, s * (0.5 + random() * 0.5), s * (0.7 + random() * 0.5));
    matrix.compose(position, quaternion, scale);
    mesh.setMatrixAt(i, matrix);
  }
  mesh.instanceMatrix.needsUpdate = true;
  mesh.computeBoundingSphere();
  return mesh;
}
