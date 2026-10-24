/**
 * 几何合并工具。
 *
 * three 的 mergeGeometries 要求所有输入**索引状态一致**：
 * ExtrudeGeometry / PolyhedronGeometry 是非索引的，BoxGeometry / CylinderGeometry 是索引的，
 * 混在一起合并会静默返回 null（几何直接丢失）。
 * 所以合并前一律转成非索引。
 */

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/**
 * 把几何体整理成可合并状态：统一为非索引 + 统一的 color 属性。
 * @param {THREE.BufferGeometry} geometry
 * @param {string|number} color
 * @returns {THREE.BufferGeometry} 新几何体（调用方负责 dispose 原件）
 */
export function prepareForMerge(geometry, color) {
  const geo = geometry.index ? geometry.toNonIndexed() : geometry.clone();

  const count = geo.attributes.position.count;
  const colors = new Float32Array(count * 3);
  const c = new THREE.Color(color);
  for (let i = 0; i < count; i += 1) {
    colors[i * 3] = c.r;
    colors[i * 3 + 1] = c.g;
    colors[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));

  // 合并要求属性集合一致：只保留 position / normal / uv / color
  for (const name of Object.keys(geo.attributes)) {
    if (!['position', 'normal', 'uv', 'color'].includes(name)) {
      geo.deleteAttribute(name);
    }
  }
  if (!geo.attributes.uv) {
    const uv = new Float32Array(count * 2);
    geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  }
  if (!geo.attributes.normal) geo.computeVertexNormals();

  geo.clearGroups();
  return geo;
}

/**
 * 合并一组几何体；输入不一致时抛出明确错误，而不是静默返回 null。
 * @param {THREE.BufferGeometry[]} list
 * @returns {THREE.BufferGeometry}
 */
export function mergeSafe(list) {
  if (!list.length) throw new Error('合并失败：几何体列表为空');
  const merged = mergeGeometries(list, false);
  if (!merged) {
    throw new Error('合并失败：属性集合不一致');
  }
  return merged;
}
