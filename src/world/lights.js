/**
 * 光照系统（规划案 §5.3 短板 7、T09）
 *
 * 一盏带阴影的方向光（太阳）+ 半球天光 + 低强度环境光。
 * 时刻切换时对全部参数做平滑插值，避免「啪」地跳色。
 */

import * as THREE from 'three';

import { PIPELINE, TIME_PRESETS } from '../config/visual.js';

/**
 * @param {{shadowMapSize?: number}} [options]
 */
export function createLights({ shadowMapSize = PIPELINE.shadowMapSize } = {}) {
  const group = new THREE.Group();
  group.name = 'lights';

  const sun = new THREE.DirectionalLight(0xffffff, 3);
  sun.castShadow = true;
  sun.shadow.mapSize.set(shadowMapSize, shadowMapSize);
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 700;
  sun.shadow.camera.left = -180;
  sun.shadow.camera.right = 180;
  sun.shadow.camera.top = 180;
  sun.shadow.camera.bottom = -180;
  sun.shadow.bias = PIPELINE.shadowBias;
  sun.shadow.normalBias = PIPELINE.shadowNormalBias;
  sun.target.position.set(0, 20, 0);
  group.add(sun);
  group.add(sun.target);

  const hemi = new THREE.HemisphereLight(0x8fb4d6, 0x3c4d42, 0.6);
  group.add(hemi);

  const ambient = new THREE.AmbientLight(0xffffff, 0.12);
  group.add(ambient);

  // 当前插值状态
  const current = {
    sunColor: new THREE.Color(TIME_PRESETS.dawn.sunColor),
    skyColor: new THREE.Color(TIME_PRESETS.dawn.skyFill),
    sunIntensity: TIME_PRESETS.dawn.sunIntensity,
    skyIntensity: TIME_PRESETS.dawn.skyFillIntensity,
    azimuth: TIME_PRESETS.dawn.sunAzimuth,
    elevation: TIME_PRESETS.dawn.sunElevation,
    exposure: TIME_PRESETS.dawn.exposure,
    fogColor: new THREE.Color(TIME_PRESETS.dawn.fogColor),
    fogDensity: TIME_PRESETS.dawn.fogDensity,
    windowEmissive: TIME_PRESETS.dawn.windowEmissive,
    windowColor: new THREE.Color(TIME_PRESETS.dawn.windowColor),
    starIntensity: TIME_PRESETS.dawn.starIntensity,
  };

  const target = {
    sunColor: current.sunColor.clone(),
    skyColor: current.skyColor.clone(),
    sunIntensity: current.sunIntensity,
    skyIntensity: current.skyIntensity,
    azimuth: current.azimuth,
    elevation: current.elevation,
    exposure: current.exposure,
    fogColor: current.fogColor.clone(),
    fogDensity: current.fogDensity,
    windowEmissive: current.windowEmissive,
    windowColor: current.windowColor.clone(),
    starIntensity: current.starIntensity,
  };

  /** 最短角插值 */
  function lerpAngle(a, b, t) {
    let delta = ((b - a + Math.PI) % (Math.PI * 2)) - Math.PI;
    if (delta < -Math.PI) delta += Math.PI * 2;
    return a + delta * t;
  }

  /**
   * 设定目标时刻；实际变化由 update() 平滑推进。
   * @param {keyof typeof TIME_PRESETS} timeKey
   */
  function setTime(timeKey) {
    const preset = TIME_PRESETS[timeKey] ?? TIME_PRESETS.dawn;
    target.sunColor.set(preset.sunColor);
    target.skyColor.set(preset.skyFill);
    target.sunIntensity = preset.sunIntensity;
    target.skyIntensity = preset.skyFillIntensity;
    target.azimuth = preset.sunAzimuth;
    target.elevation = preset.sunElevation;
    target.exposure = preset.exposure;
    target.fogColor.set(preset.fogColor);
    target.fogDensity = preset.fogDensity;
    target.windowEmissive = preset.windowEmissive;
    target.windowColor.set(preset.windowColor);
    target.starIntensity = preset.starIntensity;
  }

  /**
   * 平滑推进到目标值。
   * @param {number} dt 秒
   * @param {number} [speed] 插值速度
   */
  function update(dt, speed = 1.6) {
    const t = Math.min(1, dt * speed);
    current.sunColor.lerp(target.sunColor, t);
    current.skyColor.lerp(target.skyColor, t);
    current.fogColor.lerp(target.fogColor, t);
    current.windowColor.lerp(target.windowColor, t);
    current.sunIntensity += (target.sunIntensity - current.sunIntensity) * t;
    current.skyIntensity += (target.skyIntensity - current.skyIntensity) * t;
    current.exposure += (target.exposure - current.exposure) * t;
    current.fogDensity += (target.fogDensity - current.fogDensity) * t;
    current.windowEmissive += (target.windowEmissive - current.windowEmissive) * t;
    current.starIntensity += (target.starIntensity - current.starIntensity) * t;
    current.azimuth = lerpAngle(current.azimuth, target.azimuth, t);
    current.elevation += (target.elevation - current.elevation) * t;

    const dir = new THREE.Vector3(
      Math.cos(current.azimuth) * Math.cos(current.elevation),
      Math.sin(current.elevation),
      Math.sin(current.azimuth) * Math.cos(current.elevation),
    ).normalize();

    sun.position.copy(dir).multiplyScalar(320).add(new THREE.Vector3(0, 20, 0));
    sun.color.copy(current.sunColor);
    sun.intensity = current.sunIntensity;

    hemi.color.copy(current.skyColor);
    hemi.intensity = current.skyIntensity;
    ambient.intensity = 0.1 + current.starIntensity * 0.06;
  }

  /** 立即跳到某个时刻（初始化用） */
  function snap(timeKey) {
    setTime(timeKey);
    for (let i = 0; i < 40; i += 1) update(1, 1);
  }

  function setShadowMapSize(size) {
    sun.shadow.mapSize.set(size, size);
    sun.shadow.map?.dispose();
    sun.shadow.map = null;
  }

  return {
    group,
    sun,
    hemi,
    ambient,
    setTime,
    update,
    snap,
    setShadowMapSize,
    get state() {
      return { ...current, sunDirection: new THREE.Vector3(
        Math.cos(current.azimuth) * Math.cos(current.elevation),
        Math.sin(current.elevation),
        Math.sin(current.azimuth) * Math.cos(current.elevation),
      ).normalize() };
    },
    dispose() {
      sun.shadow.map?.dispose();
    },
  };
}
