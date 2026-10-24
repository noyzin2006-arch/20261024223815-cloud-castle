/**
 * 渲染配置与管线不变量单测（规划案 T05 / T09 / T11）
 * 运行：node --test tests/render-config.test.js
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  CAMERA, PIPELINE, TIME_PRESETS, TIERS, WEATHER_PRESETS, WORLD, ARCHITECTURE, VEGETATION,
} from '../src/config/visual.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const readShader = (name) => fs.readFileSync(path.join(ROOT, 'src', 'shaders', name), 'utf8');
const readSource = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

test('四种时刻预设齐全且数值有效', () => {
  assert.deepEqual(Object.keys(TIME_PRESETS).sort(), ['dawn', 'night', 'noon', 'sunset']);
  for (const [key, preset] of Object.entries(TIME_PRESETS)) {
    assert.ok(Number.isFinite(preset.sunAzimuth), `${key} 太阳方位角无效`);
    assert.ok(Number.isFinite(preset.sunElevation), `${key} 太阳高度角无效`);
    assert.ok(preset.sunIntensity > 0, `${key} 太阳强度必须为正`);
    assert.ok(preset.exposure > 0 && preset.exposure < 3, `${key} 曝光 ${preset.exposure} 不合理`);
    assert.ok(preset.skyFillIntensity >= 0);
    for (const colorKey of ['sunColor', 'skyFill', 'horizon', 'zenith', 'cloudLit', 'cloudShade', 'fogColor', 'windowColor']) {
      assert.match(String(preset[colorKey]), /^#[0-9a-f]{6}$/i, `${key}.${colorKey} 不是合法 hex`);
    }
  }
});

test('星夜时刻必须真的暗，晨曦必须真的亮', () => {
  assert.ok(TIME_PRESETS.night.exposure > TIME_PRESETS.noon.exposure);
  assert.ok(TIME_PRESETS.night.sunIntensity < TIME_PRESETS.dawn.sunIntensity);
  assert.ok(TIME_PRESETS.night.starIntensity > 0);
  assert.equal(TIME_PRESETS.dawn.starIntensity, 0);
});

test('三种天气预设齐全', () => {
  assert.deepEqual(Object.keys(WEATHER_PRESETS).sort(), ['clear', 'mist', 'storm']);
  assert.ok(WEATHER_PRESETS.storm.coverage > WEATHER_PRESETS.clear.coverage);
  assert.ok(WEATHER_PRESETS.storm.rain > 0);
  assert.equal(WEATHER_PRESETS.clear.rain, 0);
});

test('四个相机机位有效且都在合理距离上', () => {
  assert.deepEqual(Object.keys(CAMERA.views).sort(), ['detail', 'hero', 'rock', 'side']);
  for (const [key, view] of Object.entries(CAMERA.views)) {
    assert.ok(view.position.length === 3 && view.target.length === 3, `${key} 坐标不完整`);
    for (const v of [...view.position, ...view.target]) {
      assert.ok(Number.isFinite(v), `${key} 坐标含非有限值`);
    }
    const dist = Math.hypot(
      view.position[0] - view.target[0],
      view.position[1] - view.target[1],
      view.position[2] - view.target[2],
    );
    assert.ok(dist > CAMERA.controls.minDistance && dist < CAMERA.controls.maxDistance,
      `${key} 距离 ${dist.toFixed(1)} 超出 OrbitControls 允许范围`);
  }
});

test('机位朝向主体（目标点都在城堡附近）', () => {
  for (const [key, view] of Object.entries(CAMERA.views)) {
    const [tx, ty, tz] = view.target;
    assert.ok(Math.hypot(tx, tz) < 40, `${key} 目标点离城堡太远`);
    assert.ok(ty > WORLD.islandTipY && ty < 80, `${key} 目标点高度 ${ty} 不合理`);
  }
});

test('三档画质参数合法且单调', () => {
  assert.deepEqual(Object.keys(TIERS).sort(), ['balanced', 'low', 'ultra']);
  assert.ok(TIERS.low.scale < TIERS.balanced.scale);
  assert.ok(TIERS.balanced.scale < TIERS.ultra.scale);
  for (const [key, spec] of Object.entries(TIERS)) {
    assert.ok(spec.scale > 0 && spec.scale <= 1, `${key} 渲染倍率非法`);
    assert.ok(spec.scaleMin > 0 && spec.scaleMin <= spec.scale, `${key} 倍率下限非法`);
    assert.ok(spec.cloudSteps >= 8, `${key} 云步数太少`);
    assert.ok(spec.shadowMapSize >= 512, `${key} 阴影贴图太小`);
    assert.ok(spec.dprCap >= 1 && spec.dprCap <= 2);
  }
});

test('世界尺度与建筑比例满足规划案硬指标', () => {
  assert.ok(WORLD.cloudBandBottom < WORLD.cloudBandTop);
  assert.ok(WORLD.islandTipY < -50, '岛尖必须够深');
  assert.ok(ARCHITECTURE.mainTowerHeight >= 100);
  assert.ok(ARCHITECTURE.bellTowerHeight < ARCHITECTURE.mainTowerHeight);
  assert.ok(ARCHITECTURE.mainTowerHeight / Math.max(...ARCHITECTURE.sideTowerHeights) >= 1.85);
  assert.ok(ARCHITECTURE.recessedWindowCount >= 24);
  assert.ok(ARCHITECTURE.buttressCount >= 12);
  assert.ok(VEGETATION.coniferCount + VEGETATION.broadleafCount + VEGETATION.gnarledCount >= 100);
});

test('色彩纪律：整条管线只做一次色调映射与一次 sRGB 转换', () => {
  const grade = readShader('grade.frag.glsl');
  const aces = grade.match(/akAcesFilmic\(/g) ?? [];
  const srgb = grade.match(/akLinearToSrgb\(/g) ?? [];
  assert.equal(aces.length, 1, `grade 着色器里 ACES 调用了 ${aces.length} 次，必须恰好 1 次`);
  assert.equal(srgb.length, 1, `grade 着色器里 sRGB 转换了 ${srgb.length} 次，必须恰好 1 次`);

  // 其他着色器不得自己做色调映射
  for (const file of ['sky.frag.glsl', 'clouds.frag.glsl', 'cloud-composite.frag.glsl', 'ao.frag.glsl', 'water.frag.glsl']) {
    const src = readShader(file);
    assert.ok(!src.includes('akAcesFilmic('), `${file} 不应做色调映射`);
    assert.ok(!src.includes('akLinearToSrgb('), `${file} 不应做 sRGB 转换`);
  }
});

test('云着色器按场景深度截断射线（体积云的前后遮挡靠深度，不是 billboard）', () => {
  const src = readShader('clouds.frag.glsl');
  assert.ok(src.includes('uSceneDepth'), '云着色器必须采样场景深度');
  assert.ok(src.includes('sceneDistance'), '云着色器必须用场景深度截断射线');
  assert.ok(src.includes('akCloudDensity'), '云必须有三维密度场');
  assert.ok(src.includes('akHenyeyGreenstein'), '云必须有相位函数');
  assert.ok(!src.includes('Sprite'), '云不能用 sprite/billboard 冒充');
});

test('管线里没有把同一张纹理同时读写（反馈回路）', () => {
  const src = readSource('src/core/pipeline.js');
  // 升采样链必须写独立的 up 目标
  assert.ok(src.includes('bloomUpRT'), 'bloom 升采样必须有独立目标，避免帧缓冲反馈回路');
  assert.ok(src.indexOf('bloomUpUniforms.uSource.value = source;') > 0);
  assert.ok(src.includes('uPrevious.value = bloomRT[i].texture'));
});

test('渲染器使用 three r186 仍支持的阴影类型', () => {
  const src = readSource('src/core/renderer.js');
  assert.match(src, /renderer\.shadowMap\.type\s*=\s*THREE\.PCFShadowMap;/,
    'r186 已移除 PCFSoftShadowMap，必须实际赋值为 PCFShadowMap');
  assert.ok(!src.includes('THREE.PCFSoftShadowMap'), '不能再实际引用已移除的 PCFSoftShadowMap');
  assert.ok(src.includes('SRGBColorSpace'));
  assert.ok(src.includes('ACESFilmicToneMapping'));
  assert.ok(src.includes('renderer.info.autoReset = false'), '必须关闭 info 自动重置以统计整帧');
});

test('调速器阈值与规划案一致', () => {
  assert.equal(PIPELINE.bloom.threshold, 1.05);
  assert.ok(PIPELINE.bloom.strength <= 0.3, 'bloom 强度过高会全屏泛白');
  assert.ok(PIPELINE.reprojectionDepthTolerance <= 0.05);
  assert.ok(PIPELINE.normalStrength >= 0.45 && PIPELINE.normalStrength <= 0.65);
  assert.ok(PIPELINE.dofMaxCocPx <= 4, 'CoC 过大主体会糊');
});

test('默认画质与 URL 默认一致，且云步数满足均衡档', () => {
  assert.equal(TIERS.balanced.cloudSteps, 24);
  assert.equal(TIERS.balanced.cloudLightSteps, 4);
  assert.equal(TIERS.balanced.cloudScale, 0.5);
});
