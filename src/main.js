/**
 * AETHERKEEP 云际圣堡 —— 启动入口（规划案 §5.2 / T01 / T05）
 *
 * 流程：解析 URL → 建状态仓库 → 建渲染器 → 加载资源 → 建世界 → 建管线 → 建相机
 *      → 建 UI → 进入渲染循环。
 * 任何一步失败都落到**可读的备用页**，绝不白屏。
 */

import * as THREE from 'three';

import {
  CAMERA, DEBUG_QUERY_KEY, SEED, TIME_PRESETS, TIMING, TIERS, WEATHER_PRESETS,
} from './config/visual.js';
import { createStore, parseQuery, readPrefs, writePrefs } from './core/state.js';
import { createRenderer } from './core/renderer.js';
import { createPipeline, LAYER_OPAQUE, LAYER_SKY } from './core/pipeline.js';
import { createGovernor } from './core/governor.js';
import { createDiagnostics, mountDebugApi } from './core/diagnostics.js';
import { createMaterials, loadAssets } from './core/resources.js';
import { createSky } from './world/sky.js';
import { createLights } from './world/lights.js';
import { createIsland } from './world/island.js';
import { createCastle } from './world/castle.js';
import { createTrees } from './world/trees.js';
import { createReflectingPool } from './world/water.js';
import { createWeather } from './world/weather.js';
import { createRig } from './camera/rig.js';
import { createIntro } from './camera/intro.js';
import { createSoundscape } from './audio/soundscape.js';
import { createUI } from './ui/controller.js';

const canvas = /** @type {HTMLCanvasElement} */ (document.getElementById('scene'));

/** @type {any} */
let app = null;

function fail(message) {
  const store = app?.store;
  if (store) {
    store.dispatch({ type: 'LOAD_ERROR', error: message });
  } else {
    const fallback = document.getElementById('fallback');
    const body = document.getElementById('fallback-body');
    if (fallback) fallback.hidden = false;
    if (body) body.textContent = message;
    const boot = document.getElementById('boot');
    if (boot) boot.dataset.done = 'true';
  }
}

async function bootstrap() {
  // ---------------------------------------------------------------- 状态
  const urlState = parseQuery(globalThis.location?.search ?? '');
  const prefs = readPrefs();
  const initial = {
    ...urlState.state,
    ...(urlState.state.tier ? {} : prefs.tier ? { tier: prefs.tier } : {}),
    ...(urlState.state.tier ? {} : prefs.mute !== undefined ? { mute: prefs.mute } : {}),
  };
  const store = createStore(initial);
  app = { store };

  const debugMode = new URLSearchParams(globalThis.location?.search ?? '').get(DEBUG_QUERY_KEY) === '1';

  // reduced motion
  const motionQuery = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)');
  const applyMotion = () => store.dispatch({ type: 'SET_REDUCED_MOTION', value: Boolean(motionQuery?.matches) });
  applyMotion();
  motionQuery?.addEventListener?.('change', applyMotion);

  // ---------------------------------------------------------------- 渲染器
  const rendererBundle = createRenderer(canvas, { tier: store.getState().tier });
  const { renderer, capabilities } = rendererBundle;

  if (!capabilities.floatRenderTarget) {
    // 没有浮点 RT 时降级为 RGBA8 + 预曝光（规划案 U02 分支）
    console.warn('[aetherkeep] 未检测到 EXT_color_buffer_float，HDR 中间缓冲降级为 RGBA8');
  }

  // ---------------------------------------------------------------- 场景
  const scene = new THREE.Scene();
  scene.background = null;

  const camera = new THREE.PerspectiveCamera(CAMERA.fov, 1, CAMERA.near, CAMERA.far);

  // ---------------------------------------------------------------- 资源
  const abortController = new AbortController();
  let manifest;
  try {
    manifest = await loadAssets({
      signal: abortController.signal,
      onProgress: (ratio, label) => {
        store.dispatch({ type: 'LOAD_PROGRESS', value: ratio });
        void label;
      },
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      fail('场景资源尚未准备好。请重新加载完整的离线资源包。');
      return;
    }
    fail(`资源加载失败：${error instanceof Error ? error.message : String(error)}`);
    return;
  }

  // 全局 Ø（空状态）：资源包里一张可用材质都没有 → 明确告诉用户缺什么、怎么办
  const materialCount = Object.keys(manifest.materials ?? {}).length;
  if (materialCount === 0) {
    fail('城堡资源尚未准备好。请重新加载完整的离线资源包。');
    return;
  }

  const materials = createMaterials(store.getState(), manifest);

  // ---------------------------------------------------------------- 世界
  const sky = createSky();
  sky.applyTime(store.getState().time, 0);
  scene.add(sky.mesh);

  const lights = createLights();
  lights.snap(store.getState().time);
  scene.add(lights.group);

  const island = createIsland({ materials });
  scene.add(island.group);

  const castle = createCastle({ materials });
  scene.add(castle.group);

  const trees = createTrees({ materials });
  scene.add(trees.group);

  const pool = createReflectingPool();
  scene.add(pool.mesh);

  const weather = createWeather();
  scene.add(weather.group);

  // 天空与透明物体不进入法线预通道
  sky.mesh.layers.set(LAYER_SKY);
  pool.mesh.layers.set(LAYER_SKY);
  weather.group.traverse((obj) => obj.layers.set(LAYER_SKY));

  // ---------------------------------------------------------------- 管线
  const pipeline = createPipeline({
    renderer,
    scene,
    camera,
    tier: store.getState().tier,
  });

  // ---------------------------------------------------------------- 相机
  const rig = createRig({
    camera,
    canvas,
    onInteract: () => {
      if (intro.state === 'playing') {
        store.dispatch({ type: 'INTERRUPT_INTRO' });
        intro.skip();
      }
    },
  });

  const intro = createIntro({
    camera,
    rig,
    onAct: (label) => {
      const hint = document.getElementById('narrative-hint');
      if (hint) hint.textContent = label;
    },
  });

  if (store.getState().intro !== 'playing' || store.getState().reducedMotion) {
    intro.skip();
  }

  // 深链给出的初始机位必须立刻生效：
  // 订阅只在状态**变化**时触发，而初始 view 是从 URL 直接读进来的。
  const initialView = store.getState().view;
  if (initialView !== 'hero') {
    rig.goTo(initialView, 0);
  }

  // ---------------------------------------------------------------- 音频
  const soundscape = createSoundscape();

  // ---------------------------------------------------------------- 诊断
  const diagnostics = createDiagnostics();
  const governor = createGovernor();
  governor.setTier(store.getState().tier, store.getState().manualTier);

  // ---------------------------------------------------------------- UI
  const ui = createUI({
    store,
    dispatch: (action) => store.dispatch(action),
    actions: {
      toggleMute: () => {
        const next = !store.getState().mute;
        store.dispatch({ type: 'SET_MUTE', value: next });
        if (!next) {
          soundscape.start();
          soundscape.setMuted(false);
        } else {
          soundscape.setMuted(true);
        }
        writePrefs({ tier: store.getState().tier, mute: next });
      },
      savePhoto: () => ui.savePhoto(canvas),
      cancelLoad: () => abortController.abort(),
    },
  });

  store.subscribe((state, prev) => {
    ui.render(state);
    if (state.time !== prev.time) {
      sky.applyTime(state.time, elapsed);
      lights.setTime(state.time);
    }
    if (state.weather !== prev.weather) {
      weather.setWeather(state.weather);
    }
    if (state.tier !== prev.tier) {
      pipeline.setTier(state.tier);
      governor.setTier(state.tier, state.manualTier);
    }
    if (state.view !== prev.view && state.phase === 'ready') {
      rig.goTo(state.view);
    }
    if (state.mute !== prev.mute) {
      writePrefs({ tier: state.tier, mute: state.mute });
    }
    // URL 同步（replaceState，不污染返回）
    try {
      const query = serializeQuery(state);
      if (globalThis.history?.replaceState) {
        globalThis.history.replaceState(null, '', `${globalThis.location.pathname}${query}`);
      }
    } catch {
      /* 某些环境禁止改 URL：静默忽略 */
    }
  });

  ui.render(store.getState());

  // ---------------------------------------------------------------- 尺寸
  function resize() {
    const width = canvas.clientWidth || globalThis.innerWidth;
    const height = canvas.clientHeight || globalThis.innerHeight;
    const dpr = globalThis.devicePixelRatio || 1;
    const spec = TIERS[store.getState().tier];
    const effectiveScale = governor.scale;
    const effectiveDpr = Math.min(dpr, spec.dprCap);

    renderer.setPixelRatio(1);
    renderer.setSize(width, height, false);
    const bufferWidth = Math.max(2, Math.round(width * effectiveDpr * effectiveScale));
    const bufferHeight = Math.max(2, Math.round(height * effectiveDpr * effectiveScale));
    pipeline.resize(bufferWidth, bufferHeight);
    rig.resize(width, height);
    // 视窗比例变化时才做一次取景兜底（英雄机位本身是设计过的构图）
    rig.fitCamera(castleBounds());
  }

  const resizeObserver = new ResizeObserver(() => resize());
  resizeObserver.observe(canvas);
  resize();

  // ---------------------------------------------------------------- 渲染循环
  let elapsed = 0;
  let last = performance.now();
  let rafId = 0;
  let running = true;
  /** 取证冻结：停住世界时间（风/云/粒子），但渲染循环继续，方便采稳定帧 */
  let frozen = false;

  function frame(now) {
    rafId = requestAnimationFrame(frame);
    if (!running) return;

    const rawDt = (now - last) / 1000;
    last = now;
    const dt = Math.min(TIMING.dtMax, Math.max(TIMING.dtMin, rawDt));
    // 取证冻结时世界时间不前进，但画面照常渲染 —— 采到的帧稳定且互不相同
    const sceneDt = frozen ? 0 : dt;
    const timeScale = store.getState().reducedMotion ? TIMING.reducedMotionCloudRate : 1;
    elapsed += sceneDt * timeScale;

    // 页面不可见：暂停观测
    if (document.hidden) {
      governor.setPaused(true);
      soundscape.suspend();
      return;
    }
    governor.setPaused(false);
    soundscape.resume();

    // intro 优先驱动相机
    if (intro.state === 'playing') {
      intro.update(sceneDt);
      if (intro.state !== 'playing') store.dispatch({ type: 'INTERRUPT_INTRO' });
    } else {
      rig.update(sceneDt);
    }

    // 场景更新
    lights.update(sceneDt);
    const lightState = lights.state;
    sky.applyTime(store.getState().time, elapsed);
    pool.update(elapsed, store.getState().time, lightState, weather.mist);
    weather.update(sceneDt, elapsed, camera.position);
    castle.updateBanners(elapsed, weather.windSpeed);
    soundscape.update(weather);

    // 管线 uniform 同步
    const u = pipeline.uniforms;
    u.cloud.uSunDirection.value.copy(lightState.sunDirection);
    u.cloud.uSunColor.value.copy(lightState.sunColor);
    u.cloud.uSunIntensity.value = lightState.sunIntensity;
    u.cloud.uCoverage.value = weather.coverage;
    u.cloud.uTime.value = elapsed;
    u.cloud.uWind.value.set(elapsed * 0.02 * weather.windSpeed, elapsed * 0.6 * weather.windSpeed);
    u.grade.uTime.value = elapsed;
    u.grade.uExposure.value = lightState.exposure;
    u.shaft.uIntensity.value = TIME_PRESETS[store.getState().time].shaftIntensity * (weather.rain > 0.3 ? 0.2 : 1);
    u.shaft.uSunVisible.value = lightState.sunDirection.y > -0.05 ? 1 : 0;

    // 太阳在屏幕上的位置（云隙光用）
    const sunWorld = camera.position.clone().add(lightState.sunDirection.clone().multiplyScalar(900));
    const sunNdc = sunWorld.project(camera);
    u.shaft.uSunScreenPosition.value.set(sunNdc.x * 0.5 + 0.5, sunNdc.y * 0.5 + 0.5);

    // 景深焦点
    u.dof.uFocusDistance.value = camera.position.distanceTo(rig.controls.target);
    u.dof.uEnabled.value = store.getState().photoMode
      ? 1
      : TIERS[store.getState().tier].dof === 'weak'
        ? 1
        : 0;

    // 渲染
    const metrics = pipeline.render();
    metrics.frameId = diagnostics.frameCount + 1;
    metrics.scale = governor.scale;
    metrics.tier = store.getState().tier;
    const record = diagnostics.record(metrics);

    // 调速器
    const action = governor.observe(record.frameMs, record.frameId, now);
    if (action.type === 'scale-down' || action.type === 'scale-up') {
      resize();
    } else if (action.type === 'degrade') {
      const level = governor.degraded.get(action.degrade) ?? 1;
      pipeline.setDegraded(action.degrade, level);
    } else if (action.type === 'restore') {
      const level = governor.degraded.get(action.restore) ?? 0;
      pipeline.setDegraded(action.restore, level);
    } else if (action.type === 'notice') {
      ui.toast(action.notice ?? '设备负载较高', 'warning');
    }
  }

  /**
   * 采集城堡的真实轮廓采样点（世界空间）。
   * 每个 mesh 均匀抽点，总量封顶 600，避免每帧遍历几十万个顶点。
   */
  function castleBounds() {
    const points = [];
    castle.group.updateMatrixWorld(true);
    const meshes = [];
    castle.group.traverse((child) => {
      if (child.isMesh && child.geometry?.attributes?.position) meshes.push(child);
    });
    const total = meshes.reduce((sum, m) => sum + m.geometry.attributes.position.count, 0) || 1;
    const stride = Math.max(1, Math.ceil(total / 600));
    const v = new THREE.Vector3();
    for (const mesh of meshes) {
      const pos = mesh.geometry.attributes.position;
      for (let i = 0; i < pos.count; i += stride) {
        v.fromBufferAttribute(pos, i).applyMatrix4(mesh.matrixWorld);
        points.push(v.clone());
      }
      // 每个 mesh 的包围盒角点必须补上：
      // 抽样会漏掉锥顶这类极端顶点，塔尖就会被裁掉。
      mesh.geometry.computeBoundingBox();
      const bb = mesh.geometry.boundingBox;
      if (bb) {
        for (const cx of [bb.min.x, bb.max.x]) {
          for (const cy of [bb.min.y, bb.max.y]) {
            for (const cz of [bb.min.z, bb.max.z]) {
              points.push(new THREE.Vector3(cx, cy, cz).applyMatrix4(mesh.matrixWorld));
            }
          }
        }
      }
    }
    return points;
  }

  // ---------------------------------------------------------------- 调试接口
  if (debugMode) {
    mountDebugApi({
      store,
      diagnostics,
      pipeline,
      rig,
      scene,
      renderer,
      freeze: (value) => {
        frozen = value !== false;
        return frozen;
      },
    });
  }

  // ---------------------------------------------------------------- 启动
  store.dispatch({ type: 'LOAD_DONE', degraded: manifest.degraded.length > 0 });
  ui.hideBoot();
  if (manifest.degraded.length) {
    ui.toast('部分纹理未能载入，已使用安全材质', 'error');
  }

  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) last = performance.now();
  });

  rafId = requestAnimationFrame(frame);

  // 清理
  const dispose = () => {
    cancelAnimationFrame(rafId);
    resizeObserver.disconnect();
    motionQuery?.removeEventListener?.('change', applyMotion);
    pipeline.dispose();
    rig.dispose();
    island.dispose();
    castle.dispose();
    trees.dispose();
    pool.dispose();
    weather.dispose();
    sky.dispose();
    lights.dispose();
    soundscape.dispose();
    ui.dispose();
    rendererBundle.dispose();
  };
  globalThis.addEventListener('pagehide', dispose, { once: true });

  void SEED;
  void WEATHER_PRESETS;
  void LAYER_OPAQUE;
}

bootstrap().catch((error) => {
  console.error('[aetherkeep] 启动失败', error);
  fail(`图形初始化未完成，请开启图形加速后重试（${error instanceof Error ? error.message : String(error)}）`);
});
