/**
 * 几何与场景结构单测（规划案 T06/T07/T08）
 * 运行：node --test tests/geometry.test.js
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';

import { createIsland, outlineRadius, topHeight } from '../src/world/island.js';
import { createCastle } from '../src/world/castle.js';
import { createTrees } from '../src/world/trees.js';
import { ARCHITECTURE, VEGETATION, WORLD } from '../src/config/visual.js';

const dummyMaterials = {
  stone: new THREE.MeshStandardMaterial(),
  trim: new THREE.MeshStandardMaterial(),
  basalt: new THREE.MeshStandardMaterial(),
  slate: new THREE.MeshStandardMaterial(),
  cliff: new THREE.MeshStandardMaterial(),
  path: new THREE.MeshStandardMaterial(),
  oak: new THREE.MeshStandardMaterial(),
  bronze: new THREE.MeshStandardMaterial(),
  leaf: new THREE.MeshStandardMaterial({ vertexColors: true }),
  ground: new THREE.MeshStandardMaterial({ vertexColors: true }),
  banner: new THREE.MeshStandardMaterial(),
  glass: new THREE.MeshStandardMaterial(),
};

/** 检查几何里没有 NaN，且没有零面积三角形 */
function assertGeometrySane(geometry, label) {
  const pos = geometry.attributes.position;
  assert.ok(pos, `${label} 缺少 position 属性`);
  let nan = 0;
  for (let i = 0; i < pos.count * pos.itemSize; i += 1) {
    if (!Number.isFinite(pos.array[i])) nan += 1;
  }
  assert.equal(nan, 0, `${label} 含 ${nan} 个 NaN/Inf 坐标`);

  // 合并后的几何是非索引的：三角形按每 3 个顶点切分
  const index = geometry.index;
  const triCount = index ? index.count / 3 : pos.count / 3;
  let degenerate = 0;
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  const ab = new THREE.Vector3();
  const ac = new THREE.Vector3();
  for (let i = 0; i < triCount; i += 1) {
    if (index) {
      a.fromBufferAttribute(pos, index.getX(i * 3));
      b.fromBufferAttribute(pos, index.getX(i * 3 + 1));
      c.fromBufferAttribute(pos, index.getX(i * 3 + 2));
    } else {
      a.fromBufferAttribute(pos, i * 3);
      b.fromBufferAttribute(pos, i * 3 + 1);
      c.fromBufferAttribute(pos, i * 3 + 2);
    }
    ab.subVectors(b, a);
    ac.subVectors(c, a);
    if (ab.cross(ac).length() < 1e-8) degenerate += 1;
  }
  assert.equal(degenerate, 0, `${label} 含 ${degenerate} 个退化三角形`);
}

test('岛体轮廓是非圆的，且半径落在规划案区间', () => {
  let min = Infinity;
  let max = -Infinity;
  for (let i = 0; i < 360; i += 1) {
    const r = outlineRadius((i / 360) * Math.PI * 2);
    min = Math.min(min, r);
    max = Math.max(max, r);
  }
  assert.ok(min >= WORLD.islandRadiusMin - 6, `最小半径 ${min} 太小`);
  assert.ok(max <= WORLD.islandRadiusMax + 6, `最大半径 ${max} 太大`);
  assert.ok(max - min > 8, '轮廓必须是非圆的');
});

test('岛顶高度在规划案规定的起伏范围内', () => {
  for (let i = 0; i < 200; i += 1) {
    const x = (Math.random() - 0.5) * 150;
    const z = (Math.random() - 0.5) * 150;
    const h = topHeight(x, z);
    assert.ok(Number.isFinite(h));
    assert.ok(h > -20 && h < 30, `岛顶高度 ${h} 超出合理范围`);
  }
});

test('浮岛几何没有 NaN 与退化三角形', () => {
  const island = createIsland({ materials: dummyMaterials });
  /** @type {THREE.Mesh[]} */
  const meshes = [];
  island.group.traverse((child) => {
    if (child.isMesh) meshes.push(child);
  });
  assert.ok(meshes.length >= 3, `至少要有顶面、崖壁与碎岩，实际 ${meshes.length} 个网格`);
  for (const mesh of meshes) {
    assertGeometrySane(mesh.geometry, mesh.name);
  }
  island.dispose();
});

test('岛体尖端确实落在 y = -85 附近', () => {
  const island = createIsland({ materials: dummyMaterials });
  const bounds = island.bounds();
  assert.ok(bounds.min.y < WORLD.islandTipY + 6, `岛底 ${bounds.min.y} 未接近尖端高度`);
  assert.ok(bounds.min.y > WORLD.islandTipY - 20, `岛底 ${bounds.min.y} 穿得太深`);
  island.dispose();
});

test('城堡塔楼高度层次分明（最高 / 最低 ≥ 1.85）', () => {
  const castle = createCastle({ materials: dummyMaterials });
  const ratio = castle.stats.maxTowerHeight / castle.stats.minTowerHeight;
  assert.ok(ratio >= 1.85, `塔高比只有 ${ratio.toFixed(2)}，不足 1.85`);
  assert.equal(castle.stats.maxTowerHeight, ARCHITECTURE.mainTowerHeight);
  castle.dispose();
});

test('城堡有至少 24 个真实凹入拱窗与 12 道扶壁', () => {
  const castle = createCastle({ materials: dummyMaterials });
  assert.ok(castle.stats.windowCount >= ARCHITECTURE.recessedWindowCount,
    `只有 ${castle.stats.windowCount} 个拱窗`);
  assert.ok(castle.stats.buttressCount >= ARCHITECTURE.buttressCount,
    `只有 ${castle.stats.buttressCount} 道扶壁`);
  castle.dispose();
});

test('城堡几何合法，且 draw call 保持在预算内', () => {
  const castle = createCastle({ materials: dummyMaterials });
  for (const mesh of castle.meshes) {
    assertGeometrySane(mesh.geometry, mesh.name);
  }
  assert.ok(castle.stats.drawCalls <= 12, `城堡 draw call ${castle.stats.drawCalls} 过高`);
  castle.dispose();
});

test('植被有三种轮廓差异明显的树，且实例数达标', () => {
  const trees = createTrees({ materials: dummyMaterials });
  assert.equal(trees.stats.species, 3);
  assert.ok(trees.stats.perSpecies.conifer >= VEGETATION.coniferCount * 0.8);
  assert.ok(trees.stats.perSpecies.broadleaf >= VEGETATION.broadleafCount * 0.8);
  assert.ok(trees.stats.perSpecies.gnarled >= VEGETATION.gnarledCount * 0.5);
  assert.ok(trees.stats.totalInstances >= 80, `总实例数 ${trees.stats.totalInstances} 太少`);
  assert.ok(trees.stats.drawCalls <= 12);
  trees.dispose();
});

test('植被几何合法', () => {
  const trees = createTrees({ materials: dummyMaterials });
  for (const mesh of trees.group.children) {
    if (mesh.isMesh && mesh.geometry?.attributes?.position) {
      assertGeometrySane(mesh.geometry, mesh.name);
    }
  }
  trees.dispose();
});
