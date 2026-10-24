/**
 * 中庭水镜（规划案 §5.3 / §4.4）
 *
 * 18×11 米，两层滚动法线，环境天空反射 + 太阳镜面高光 + 菲涅尔。
 * 绝不能退化成实色平面。
 */

import * as THREE from 'three';

import { SHADERS } from '../shaders/index.js';
import { ISLAND, PALETTE, TIME_PRESETS } from '../config/visual.js';
import { LAYER_SKY } from '../core/pipeline.js';

export function createReflectingPool() {
  const geometry = new THREE.PlaneGeometry(ISLAND.poolWidth, ISLAND.poolLength, 24, 16);
  geometry.rotateX(-Math.PI / 2);

  const uniforms = {
    uDeepColor: { value: new THREE.Color(PALETTE.water) },
    uSkyColor: { value: new THREE.Color(PALETTE.skyZenith) },
    uHorizonColor: { value: new THREE.Color(PALETTE.skyHorizon) },
    uSunDirection: { value: new THREE.Vector3(0.3, 0.2, -0.9).normalize() },
    uSunColor: { value: new THREE.Color(1, 0.85, 0.68) },
    uSunIntensity: { value: 3 },
    uTime: { value: 0 },
    uWaveAmplitude: { value: ISLAND.poolWaveAmplitude },
    uRoughness: { value: 0.08 },
    uMist: { value: 0 },
  };

  const material = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: SHADERS.waterVert,
    fragmentShader: SHADERS.waterFrag,
    toneMapped: false,
  });

  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = 'reflecting-pool';
  mesh.position.set(0, 9.1, 6);
  mesh.receiveShadow = false;
  mesh.layers.set(LAYER_SKY);

  return {
    mesh,
    uniforms,
    /**
     * @param {number} elapsed
     * @param {keyof typeof TIME_PRESETS} timeKey
     * @param {{sunDirection: THREE.Vector3, sunIntensity: number, sunColor: THREE.Color}} lightState
     * @param {number} mist
     */
    update(elapsed, timeKey, lightState, mist) {
      const preset = TIME_PRESETS[timeKey] ?? TIME_PRESETS.dawn;
      uniforms.uTime.value = elapsed;
      uniforms.uSunDirection.value.copy(lightState.sunDirection);
      uniforms.uSunColor.value.copy(lightState.sunColor);
      uniforms.uSunIntensity.value = lightState.sunIntensity;
      uniforms.uSkyColor.value.set(preset.zenith);
      uniforms.uHorizonColor.value.set(preset.horizon);
      uniforms.uMist.value = mist;
    },
    dispose() {
      geometry.dispose();
      material.dispose();
    },
  };
}
