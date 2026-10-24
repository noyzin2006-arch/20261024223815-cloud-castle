/**
 * 天气系统（规划案 §4.3 / §5.3）
 *
 * 三档天气：晴朗 / 薄雾 / 风雨。
 * 风雨档有真实近景雨粒（实例化），云覆盖率与风速随之变化。
 * 恢复晴朗时雨粒池立刻停、云密度 600ms 恢复。
 */

import * as THREE from 'three';

import { SEED, WEATHER_PRESETS } from '../config/visual.js';
import { mulberry32 } from './island.js';
import { LAYER_SKY } from '../core/pipeline.js';

const RAIN_COUNT = 900;
const RAIN_AREA = 70;
const RAIN_TOP = 90;
const RAIN_BOTTOM = -20;

export function createWeather() {
  const group = new THREE.Group();
  group.name = 'weather';

  // ---------------------------------------------------------------- 雨粒
  const rainGeometry = new THREE.BufferGeometry();
  const positions = new Float32Array(RAIN_COUNT * 3);
  const speeds = new Float32Array(RAIN_COUNT);
  const rand = mulberry32(SEED ^ 0x7a7a);

  for (let i = 0; i < RAIN_COUNT; i += 1) {
    positions[i * 3] = (rand() - 0.5) * RAIN_AREA * 2;
    positions[i * 3 + 1] = RAIN_BOTTOM + rand() * (RAIN_TOP - RAIN_BOTTOM);
    positions[i * 3 + 2] = (rand() - 0.5) * RAIN_AREA * 2;
    speeds[i] = 34 + rand() * 26;
  }
  rainGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));

  const rainMaterial = new THREE.PointsMaterial({
    color: 0xcfe2f0,
    size: 0.42,
    sizeAttenuation: true,
    transparent: true,
    opacity: 0,
    depthWrite: false,
  });
  const rain = new THREE.Points(rainGeometry, rainMaterial);
  rain.name = 'rain';
  rain.frustumCulled = false;
  rain.layers.set(LAYER_SKY);
  group.add(rain);

  // ---------------------------------------------------------------- 飞絮（晴朗时的金色微粒）
  const moteCount = 260;
  const moteGeometry = new THREE.BufferGeometry();
  const motePositions = new Float32Array(moteCount * 3);
  const moteSeed = new Float32Array(moteCount);
  for (let i = 0; i < moteCount; i += 1) {
    motePositions[i * 3] = (rand() - 0.5) * 220;
    motePositions[i * 3 + 1] = rand() * 90 - 20;
    motePositions[i * 3 + 2] = (rand() - 0.5) * 220;
    moteSeed[i] = rand() * Math.PI * 2;
  }
  moteGeometry.setAttribute('position', new THREE.BufferAttribute(motePositions, 3));

  const moteMaterial = new THREE.PointsMaterial({
    color: 0xffe0a8,
    size: 0.55,
    sizeAttenuation: true,
    transparent: true,
    opacity: 0.5,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const motes = new THREE.Points(moteGeometry, moteMaterial);
  motes.name = 'motes';
  motes.frustumCulled = false;
  motes.layers.set(LAYER_SKY);
  group.add(motes);

  // ---------------------------------------------------------------- 状态
  let target = WEATHER_PRESETS.clear;
  let current = { ...WEATHER_PRESETS.clear };
  let rainAmount = 0;
  let mistAmount = 0;
  let windSpeed = WEATHER_PRESETS.clear.windSpeed;

  function setWeather(key) {
    target = WEATHER_PRESETS[key] ?? WEATHER_PRESETS.clear;
  }

  /**
   * @param {number} dt
   * @param {number} elapsed
   * @param {THREE.Vector3} cameraPosition
   */
  function update(dt, elapsed, cameraPosition) {
    // 600ms 左右的过渡
    const t = Math.min(1, dt / 0.6);
    current.coverage += (target.coverage - current.coverage) * t;
    current.rain += (target.rain - current.rain) * t;
    current.mist += (target.mist - current.mist) * t;
    windSpeed += (target.windSpeed - windSpeed) * t;

    rainAmount = current.rain;
    mistAmount = current.mist;

    // 雨粒下落
    if (rainAmount > 0.002) {
      const pos = rain.geometry.attributes.position;
      const arr = pos.array;
      for (let i = 0; i < RAIN_COUNT; i += 1) {
        arr[i * 3 + 1] -= speeds[i] * dt;
        arr[i * 3] += windSpeed * dt * 4.5;
        if (arr[i * 3 + 1] < RAIN_BOTTOM) {
          arr[i * 3] = cameraPosition.x + (rand() - 0.5) * RAIN_AREA * 2;
          arr[i * 3 + 1] = RAIN_TOP;
          arr[i * 3 + 2] = cameraPosition.z + (rand() - 0.5) * RAIN_AREA * 2;
        }
        if (arr[i * 3] > cameraPosition.x + RAIN_AREA) arr[i * 3] -= RAIN_AREA * 2;
        if (arr[i * 3] < cameraPosition.x - RAIN_AREA) arr[i * 3] += RAIN_AREA * 2;
      }
      pos.needsUpdate = true;
    }
    rainMaterial.opacity = rainAmount * 0.55;
    rain.visible = rainAmount > 0.01;

    // 飞絮缓慢漂浮
    const mpos = motes.geometry.attributes.position;
    const marr = mpos.array;
    for (let i = 0; i < moteCount; i += 1) {
      marr[i * 3] += Math.sin(elapsed * 0.4 + moteSeed[i]) * dt * 1.4;
      marr[i * 3 + 1] += Math.sin(elapsed * 0.25 + moteSeed[i] * 1.7) * dt * 0.9;
      marr[i * 3 + 2] += Math.cos(elapsed * 0.33 + moteSeed[i]) * dt * 1.2;
    }
    mpos.needsUpdate = true;
    moteMaterial.opacity = 0.5 * (1 - rainAmount) * (1 - mistAmount * 0.6);
    motes.visible = moteMaterial.opacity > 0.01;
  }

  return {
    group,
    setWeather,
    update,
    get coverage() { return current.coverage; },
    get rain() { return rainAmount; },
    get mist() { return mistAmount; },
    get windSpeed() { return windSpeed; },
    dispose() {
      rainGeometry.dispose();
      moteGeometry.dispose();
      rainMaterial.dispose();
      moteMaterial.dispose();
    },
  };
}
