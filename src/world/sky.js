/**
 * 大气天空（规划案 §5.3 短板 8、T09）
 *
 * 一颗包围相机的大球，BackSide 绘制，不写深度，永远在所有几何体之后。
 * 片元里做 Rayleigh / Mie 近似、太阳盘、星场与地平线层次。
 * 输出线性 HDR，不做 tone mapping。
 */

import * as THREE from 'three';

import { SHADERS } from '../shaders/index.js';
import { PALETTE, TIME_PRESETS } from '../config/visual.js';
import { LAYER_SKY } from '../core/pipeline.js';

/**
 * @param {{radius?: number}} [options]
 */
export function createSky({ radius = 900 } = {}) {
  const geometry = new THREE.SphereGeometry(radius, 48, 32);

  const uniforms = {
    uSunDirection: { value: new THREE.Vector3(0.3, 0.2, -0.9).normalize() },
    uSunColor: { value: new THREE.Color(1, 0.85, 0.68) },
    uZenith: { value: new THREE.Color(PALETTE.skyZenith) },
    uHorizon: { value: new THREE.Color(PALETTE.skyHorizon) },
    uSunIntensity: { value: 3.0 },
    uStarIntensity: { value: 0.0 },
    uTime: { value: 0 },
    uCloudCoverage: { value: 0.62 },
  };

  const material = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: SHADERS.skyVert,
    fragmentShader: SHADERS.skyFrag,
    side: THREE.BackSide,
    depthWrite: false,
    depthTest: false,
    fog: false,
    toneMapped: false,
  });

  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = 'sky';
  mesh.renderOrder = -1000;
  mesh.frustumCulled = false;
  mesh.layers.set(LAYER_SKY);

  return {
    mesh,
    uniforms,
    /**
     * 按时刻预设更新天空参数。
     * @param {keyof typeof TIME_PRESETS} timeKey
     * @param {number} elapsed 累计时间
     */
    applyTime(timeKey, elapsed) {
      const preset = TIME_PRESETS[timeKey] ?? TIME_PRESETS.dawn;
      const az = preset.sunAzimuth;
      const el = preset.sunElevation;
      uniforms.uSunDirection.value.set(
        Math.cos(az) * Math.cos(el),
        Math.sin(el),
        Math.sin(az) * Math.cos(el),
      ).normalize();
      uniforms.uSunColor.value.set(preset.sunColor);
      uniforms.uZenith.value.set(preset.zenith);
      uniforms.uHorizon.value.set(preset.horizon);
      uniforms.uSunIntensity.value = preset.sunIntensity;
      uniforms.uStarIntensity.value = preset.starIntensity;
      uniforms.uTime.value = elapsed;
    },
    setCoverage(value) {
      uniforms.uCloudCoverage.value = value;
    },
    dispose() {
      geometry.dispose();
      material.dispose();
    },
  };
}
