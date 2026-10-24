/**
 * AETHERKEEP 渲染管线（规划案 §5.5 的 P0–P10）
 *
 * 顺序：
 *   P0 太阳阴影（three 的 shadowMap 在场景渲染内完成）
 *   P1 天空（场景内的天空球，线性 HDR）
 *   P2 不透明 + 深度 → sceneRT（带 DepthTexture）
 *   P3 SSAO（半分辨率法线预通道 + 12 采样）→ aoRT
 *   P4 体积云 ray marching（半分辨率，读 sceneRT 深度做遮挡）→ cloudRT
 *   P5 深度感知云合成
 *   P6 云隙光
 *   P7 水与粒子（在 P2 的场景渲染内，透明绘制）
 *   P8 Bloom（阈值 + 3 级降采样 + 帐篷升采样）
 *   P9 景深
 *   P10 调色 + 颗粒 + 暗角 + **唯一一次** ACES → sRGB → 屏幕
 *
 * 色彩纪律：所有中间缓冲都是线性 HDR；整条链只做一次色调映射与一次 sRGB 转换。
 */

import * as THREE from 'three';
import { FullScreenQuad } from 'three/examples/jsm/postprocessing/Pass.js';

import { SHADERS } from '../shaders/index.js';
import { CAMERA, PIPELINE, TIERS, WORLD } from '../config/visual.js';

/** 层 0 = 进法线预通道的不透明物体；层 2 = 天空 / 透明物体 */
export const LAYER_OPAQUE = 0;
export const LAYER_SKY = 2;

const BLOOM_LEVELS = 3;

/** 全屏 pass 材质。three 会把 GLSL1 源码自动转成 GLSL ES 3.00。 */
function makeShader(fragment, uniforms) {
  return new THREE.ShaderMaterial({
    uniforms,
    vertexShader: SHADERS.quadVert,
    fragmentShader: fragment,
    depthTest: false,
    depthWrite: false,
    blending: THREE.NoBlending,
    toneMapped: false,
  });
}

function makeTarget(width, height, { float = true, depth = false } = {}) {
  const rt = new THREE.WebGLRenderTarget(Math.max(1, width), Math.max(1, height), {
    type: float ? THREE.HalfFloatType : THREE.UnsignedByteType,
    format: THREE.RGBAFormat,
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
    depthBuffer: depth,
    stencilBuffer: false,
    generateMipmaps: false,
  });
  rt.texture.colorSpace = THREE.LinearSRGBColorSpace;
  if (depth) {
    rt.depthTexture = new THREE.DepthTexture(
      Math.max(1, width),
      Math.max(1, height),
      THREE.UnsignedIntType,
    );
    rt.depthTexture.minFilter = THREE.NearestFilter;
    rt.depthTexture.magFilter = THREE.NearestFilter;
  }
  return rt;
}

/** 确定性 PRNG：AO 采样核必须可复现，禁止 Math.random() */
function mulberry32(seed) {
  let a = seed >>> 0;
  return function random() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 半球采样核：越靠后的样本权重越小 */
function makeAoKernel(count) {
  const random = mulberry32(0x5f3a71);
  const kernel = [];
  for (let i = 0; i < count; i += 1) {
    const v = new THREE.Vector3(random() * 2 - 1, random() * 2 - 1, random());
    if (v.lengthSq() < 1e-6) v.set(0, 0, 1);
    v.normalize();
    let scale = i / count;
    scale = 0.1 + 0.9 * scale * scale;
    v.multiplyScalar(scale);
    kernel.push(v);
  }
  return kernel;
}

/**
 * @param {Object} options
 * @param {THREE.WebGLRenderer} options.renderer
 * @param {THREE.Scene} options.scene
 * @param {THREE.PerspectiveCamera} options.camera
 * @param {keyof typeof TIERS} [options.tier]
 */
export function createPipeline({ renderer, scene, camera, tier = 'balanced' }) {
  let tierKey = tier;
  let spec = TIERS[tierKey];

  const bufferSize = new THREE.Vector2();
  renderer.getDrawingBufferSize(bufferSize);
  let width = Math.max(2, bufferSize.x);
  let height = Math.max(2, bufferSize.y);

  // ---------------------------------------------------------------- 渲染目标
  let sceneRT = makeTarget(width, height, { float: true, depth: true });
  let normalRT = makeTarget(Math.ceil(width / 2), Math.ceil(height / 2), { float: false, depth: true });
  let aoRT = makeTarget(Math.ceil(width / 2), Math.ceil(height / 2), { float: false });
  let cloudRT = makeTarget(
    Math.ceil(width * spec.cloudScale),
    Math.ceil(height * spec.cloudScale),
    { float: true },
  );
  let shaftRT = makeTarget(Math.ceil(width / 2), Math.ceil(height / 2), { float: true });
  let workRT = makeTarget(width, height, { float: true });
  let workRT2 = makeTarget(width, height, { float: true });
  /** @type {THREE.WebGLRenderTarget[]} */
  let bloomRT = [];
  /** 升采样链的独立目标：升采样时必须读上一级、写入另一处，否则形成帧缓冲反馈回路 */
  /** @type {THREE.WebGLRenderTarget[]} */
  let bloomUpRT = [];

  // ---------------------------------------------------------------- 材质
  const normalMaterial = new THREE.MeshNormalMaterial();

  const aoUniforms = {
    uNormalTexture: { value: normalRT.texture },
    uDepthTexture: { value: normalRT.depthTexture },
    uProjectionInverse: { value: new THREE.Matrix4() },
    uProjection: { value: new THREE.Matrix4() },
    uKernel: { value: makeAoKernel(12) },
    uRadius: { value: 2.6 },
    uBias: { value: 0.035 },
    uIntensity: { value: 1.0 },
    uNear: { value: CAMERA.near },
    uFar: { value: CAMERA.far },
    uResolution: { value: new THREE.Vector2() },
  };
  const aoMaterial = makeShader(SHADERS.aoFrag, aoUniforms);

  const aoApplyUniforms = {
    uScene: { value: null },
    uAo: { value: aoRT.texture },
    uDepth: { value: sceneRT.depthTexture },
    uAoTexel: { value: new THREE.Vector2() },
    uEnabled: { value: 1 },
    uNear: { value: CAMERA.near },
    uFar: { value: CAMERA.far },
  };
  const aoApplyMaterial = makeShader(SHADERS.aoApplyFrag, aoApplyUniforms);

  const cloudUniforms = {
    uCameraPosition: { value: new THREE.Vector3() },
    uInverseProjectionMatrix: { value: new THREE.Matrix4() },
    uCameraWorldMatrix: { value: new THREE.Matrix4() },
    uSunDirection: { value: new THREE.Vector3(0, 1, 0) },
    uSunColor: { value: new THREE.Color(1, 0.85, 0.7) },
    uCloudLit: { value: new THREE.Color(1, 0.85, 0.65) },
    uCloudShade: { value: new THREE.Color(0.25, 0.4, 0.55) },
    uSunIntensity: { value: 3 },
    uCoverage: { value: 0.62 },
    uTime: { value: 0 },
    uWind: { value: new THREE.Vector2() },
    uSteps: { value: spec.cloudSteps },
    uLightSteps: { value: spec.cloudLightSteps },
    uBoxMin: { value: new THREE.Vector3(-600, WORLD.cloudBandBottom, -600) },
    uBoxMax: { value: new THREE.Vector3(600, WORLD.cloudBandTop, 600) },
    uSceneDepth: { value: sceneRT.depthTexture },
    uNear: { value: CAMERA.near },
    uFar: { value: CAMERA.far },
    uScatter: { value: 0.80 },
    uExtinction: { value: 1.62 },
    uAmbient: { value: 0.40 },
  };
  const cloudMaterial = makeShader(SHADERS.cloudsFrag, cloudUniforms);

  const compositeUniforms = {
    uScene: { value: null },
    uClouds: { value: cloudRT.texture },
    uSceneTexel: { value: new THREE.Vector2() },
    uCloudTexel: { value: new THREE.Vector2() },
  };
  const compositeMaterial = makeShader(SHADERS.cloudCompositeFrag, compositeUniforms);

  const shaftUniforms = {
    uScene: { value: null },
    uDepth: { value: sceneRT.depthTexture },
    uSunScreenPosition: { value: new THREE.Vector2(0.5, 0.5) },
    uIntensity: { value: PIPELINE.shaftIntensity },
    uSunVisible: { value: 0 },
    uNear: { value: CAMERA.near },
    uFar: { value: CAMERA.far },
    uSamples: { value: PIPELINE.shaftSamples },
    uDecay: { value: 0.955 },
  };
  const shaftMaterial = makeShader(SHADERS.shaftsFrag, shaftUniforms);

  const dofUniforms = {
    uScene: { value: null },
    uDepth: { value: sceneRT.depthTexture },
    uNear: { value: CAMERA.near },
    uFar: { value: CAMERA.far },
    uFocusDistance: { value: 300 },
    uFocusRange: { value: 220 },
    uMaxCoc: { value: PIPELINE.dofMaxCocPx },
    uEnabled: { value: 0 },
  };
  const dofMaterial = makeShader(SHADERS.dofFrag, dofUniforms);

  const gradeUniforms = {
    uScene: { value: null },
    uContrast: { value: PIPELINE.grade.contrast },
    uSaturation: { value: PIPELINE.grade.saturation },
    uGrain: { value: PIPELINE.grade.grain },
    uVignette: { value: PIPELINE.grade.vignette },
    uTime: { value: 0 },
    uExposure: { value: 1 },
  };
  const gradeMaterial = makeShader(SHADERS.gradeFrag, gradeUniforms);

  const bloomThresholdUniforms = {
    uScene: { value: null },
    uThreshold: { value: PIPELINE.bloom.threshold },
    uKnee: { value: 0.55 },
  };
  const bloomThresholdMaterial = makeShader(SHADERS.bloomThresholdFrag, bloomThresholdUniforms);

  const bloomDownUniforms = {
    uSource: { value: null },
    uTexel: { value: new THREE.Vector2() },
  };
  const bloomDownMaterial = makeShader(SHADERS.bloomDownFrag, bloomDownUniforms);

  const bloomUpUniforms = {
    uSource: { value: null },
    uPrevious: { value: null },
    uTexel: { value: new THREE.Vector2() },
    uRadius: { value: PIPELINE.bloom.radius * 4 },
  };
  const bloomUpMaterial = makeShader(SHADERS.bloomUpFrag, bloomUpUniforms);

  const addUniforms = {
    uScene: { value: null },
    uAdd: { value: null },
  };
  const addMaterial = makeShader(
    `uniform sampler2D uScene;
     uniform sampler2D uAdd;
     varying vec2 vUv;
     void main() {
       gl_FragColor = vec4(texture2D(uScene, vUv).rgb + texture2D(uAdd, vUv).rgb, 1.0);
     }`,
    addUniforms,
  );

  const bloomAddUniforms = {
    uScene: { value: null },
    uBloom: { value: null },
    uStrength: { value: PIPELINE.bloom.strength },
  };
  const bloomAddMaterial = makeShader(
    `uniform sampler2D uScene;
     uniform sampler2D uBloom;
     uniform float uStrength;
     varying vec2 vUv;
     void main() {
       gl_FragColor = vec4(texture2D(uScene, vUv).rgb + texture2D(uBloom, vUv).rgb * uStrength, 1.0);
     }`,
    bloomAddUniforms,
  );

  /** @type {FullScreenQuad[]} */
  const quads = [];
  /** @param {THREE.ShaderMaterial} m */
  function quadFor(m) {
    const q = new FullScreenQuad(m);
    quads.push(q);
    return q;
  }

  const aoQuad = quadFor(aoMaterial);
  const aoApplyQuad = quadFor(aoApplyMaterial);
  const cloudQuad = quadFor(cloudMaterial);
  const compositeQuad = quadFor(compositeMaterial);
  const shaftQuad = quadFor(shaftMaterial);
  const addQuad = quadFor(addMaterial);
  const dofQuad = quadFor(dofMaterial);
  const gradeQuad = quadFor(gradeMaterial);
  const bloomThresholdQuad = quadFor(bloomThresholdMaterial);
  const bloomDownQuad = quadFor(bloomDownMaterial);
  const bloomUpQuad = quadFor(bloomUpMaterial);
  const bloomAddQuad = quadFor(bloomAddMaterial);

  // ---------------------------------------------------------------- 尺寸管理
  function disposeTargets() {
    sceneRT.dispose();
    normalRT.dispose();
    aoRT.dispose();
    cloudRT.dispose();
    shaftRT.dispose();
    workRT.dispose();
    workRT2.dispose();
    for (const rt of bloomRT) rt.dispose();
    for (const rt of bloomUpRT) rt.dispose();
    bloomRT = [];
    bloomUpRT = [];
  }

  function resize(w, h) {
    width = Math.max(2, Math.round(w));
    height = Math.max(2, Math.round(h));
    disposeTargets();

    sceneRT = makeTarget(width, height, { float: true, depth: true });
    normalRT = makeTarget(Math.ceil(width / 2), Math.ceil(height / 2), { float: false, depth: true });
    aoRT = makeTarget(Math.ceil(width / 2), Math.ceil(height / 2), { float: false });
    cloudRT = makeTarget(
      Math.ceil(width * spec.cloudScale),
      Math.ceil(height * spec.cloudScale),
      { float: true },
    );
    shaftRT = makeTarget(Math.ceil(width / 2), Math.ceil(height / 2), { float: true });
    workRT = makeTarget(width, height, { float: true });
    workRT2 = makeTarget(width, height, { float: true });

    bloomRT = [];
    bloomUpRT = [];
    let bw = Math.ceil(width / 2);
    let bh = Math.ceil(height / 2);
    const sizes = [];
    for (let i = 0; i < BLOOM_LEVELS; i += 1) {
      sizes.push([bw, bh]);
      bloomRT.push(makeTarget(bw, bh, { float: true }));
      bw = Math.ceil(bw / 2);
      bh = Math.ceil(bh / 2);
    }
    // 升采样链：第 i 级输出到 upRT[i]，读 upRT[i+1] 与 bloomRT[i]
    for (let i = BLOOM_LEVELS - 2; i >= 0; i -= 1) {
      bloomUpRT[i] = makeTarget(sizes[i][0], sizes[i][1], { float: true });
    }

    aoUniforms.uNormalTexture.value = normalRT.texture;
    aoUniforms.uDepthTexture.value = normalRT.depthTexture;
    aoUniforms.uResolution.value.set(normalRT.width, normalRT.height);
    aoApplyUniforms.uAo.value = aoRT.texture;
    aoApplyUniforms.uDepth.value = sceneRT.depthTexture;
    aoApplyUniforms.uAoTexel.value.set(1 / aoRT.width, 1 / aoRT.height);
    cloudUniforms.uSceneDepth.value = sceneRT.depthTexture;
    compositeUniforms.uClouds.value = cloudRT.texture;
    compositeUniforms.uSceneTexel.value.set(1 / width, 1 / height);
    compositeUniforms.uCloudTexel.value.set(1 / cloudRT.width, 1 / cloudRT.height);
    shaftUniforms.uDepth.value = sceneRT.depthTexture;
    dofUniforms.uDepth.value = sceneRT.depthTexture;
  }

  /** 切换画质档位 */
  function setTier(nextTier) {
    if (!TIERS[nextTier]) return;
    tierKey = nextTier;
    spec = TIERS[nextTier];
    cloudUniforms.uSteps.value = spec.cloudSteps;
    cloudUniforms.uLightSteps.value = spec.cloudLightSteps;
    resize(width, height);
  }

  /** 调速器要求降级 / 恢复某个能力 */
  function setDegraded(capability, level) {
    switch (capability) {
      case 'cloud':
        cloudUniforms.uSteps.value =
          level <= 0 ? spec.cloudSteps : level === 1 ? Math.max(12, spec.cloudSteps - 6) : 12;
        cloudUniforms.uLightSteps.value = level <= 0 ? spec.cloudLightSteps : 2;
        break;
      case 'ao':
        aoUniforms.uIntensity.value = level > 0 ? 0.55 : 1.0;
        aoApplyUniforms.uEnabled.value = level > 1 ? 0 : 1;
        break;
      case 'dof':
        if (level > 0) dofUniforms.uEnabled.value = 0;
        break;
      case 'shafts':
        shaftUniforms.uIntensity.value = level > 0 ? 0 : PIPELINE.shaftIntensity;
        break;
      default:
        break;
    }
  }

  /** 渲染一帧，返回帧统计。 */
  function render() {
    renderer.info.reset();

    /** @type {Record<string, number>} */
    const passMsApprox = {};
    const mark = (name, fn) => {
      const t0 = performance.now();
      fn();
      passMsApprox[name] = performance.now() - t0;
    };

    // —— P1 + P2：天空 + 不透明 + 透明（水 / 粒子） ——
    mark('scene', () => {
      camera.layers.enableAll();
      renderer.setRenderTarget(sceneRT);
      renderer.clear();
      renderer.render(scene, camera);
    });

    // —— P3：法线预通道 + SSAO ——
    mark('ao', () => {
      const prevOverride = scene.overrideMaterial;
      scene.overrideMaterial = normalMaterial;
      camera.layers.set(LAYER_OPAQUE);
      renderer.setRenderTarget(normalRT);
      renderer.clear();
      renderer.render(scene, camera);
      scene.overrideMaterial = prevOverride;
      camera.layers.enableAll();

      aoUniforms.uProjection.value.copy(camera.projectionMatrix);
      aoUniforms.uProjectionInverse.value.copy(camera.projectionMatrixInverse);
      renderer.setRenderTarget(aoRT);
      aoQuad.render(renderer);
    });

    // AO 乘回场景颜色
    mark('aoApply', () => {
      aoApplyUniforms.uScene.value = sceneRT.texture;
      renderer.setRenderTarget(workRT);
      renderer.clear();
      aoApplyQuad.render(renderer);
    });

    // —— P4：体积云 ——
    mark('clouds', () => {
      camera.updateMatrixWorld();
      cloudUniforms.uCameraPosition.value.setFromMatrixPosition(camera.matrixWorld);
      cloudUniforms.uCameraWorldMatrix.value.copy(camera.matrixWorld);
      cloudUniforms.uInverseProjectionMatrix.value.copy(camera.projectionMatrixInverse);
      renderer.setRenderTarget(cloudRT);
      renderer.clear();
      cloudQuad.render(renderer);
    });

    // —— P5：深度感知云合成 ——
    mark('composite', () => {
      compositeUniforms.uScene.value = workRT.texture;
      renderer.setRenderTarget(workRT2);
      renderer.clear();
      compositeQuad.render(renderer);
    });

    // —— P6：云隙光 ——
    mark('shafts', () => {
      shaftUniforms.uScene.value = workRT2.texture;
      renderer.setRenderTarget(shaftRT);
      renderer.clear();
      shaftQuad.render(renderer);

      addUniforms.uScene.value = workRT2.texture;
      addUniforms.uAdd.value = shaftRT.texture;
      renderer.setRenderTarget(workRT);
      renderer.clear();
      addQuad.render(renderer);
    });

    // —— P8：Bloom ——
    mark('bloom', () => {
      bloomThresholdUniforms.uScene.value = workRT.texture;
      renderer.setRenderTarget(bloomRT[0]);
      renderer.clear();
      bloomThresholdQuad.render(renderer);

      for (let i = 1; i < bloomRT.length; i += 1) {
        bloomDownUniforms.uSource.value = bloomRT[i - 1].texture;
        bloomDownUniforms.uTexel.value.set(1 / bloomRT[i - 1].width, 1 / bloomRT[i - 1].height);
        renderer.setRenderTarget(bloomRT[i]);
        renderer.clear();
        bloomDownQuad.render(renderer);
      }

      // 升采样：从最细一级往上，逐级与降采样链相加。
      // 写入 bloomUpRT[i]、读取 bloomUpRT[i+1] 与 bloomRT[i] —— 目标与来源永远不同。
      let source = bloomRT[bloomRT.length - 1].texture;
      for (let i = bloomRT.length - 2; i >= 0; i -= 1) {
        bloomUpUniforms.uSource.value = source;
        bloomUpUniforms.uPrevious.value = bloomRT[i].texture;
        bloomUpUniforms.uTexel.value.set(1 / bloomRT[i + 1].width, 1 / bloomRT[i + 1].height);
        renderer.setRenderTarget(bloomUpRT[i]);
        renderer.clear();
        bloomUpQuad.render(renderer);
        source = bloomUpRT[i].texture;
      }

      bloomAddUniforms.uScene.value = workRT.texture;
      bloomAddUniforms.uBloom.value = source;
      renderer.setRenderTarget(workRT2);
      renderer.clear();
      bloomAddQuad.render(renderer);
    });

    // —— P9：景深 ——
    mark('dof', () => {
      dofUniforms.uScene.value = workRT2.texture;
      renderer.setRenderTarget(workRT);
      renderer.clear();
      dofQuad.render(renderer);
    });

    // —— P10：调色 + 唯一一次 ACES / sRGB → 屏幕 ——
    mark('grade', () => {
      gradeUniforms.uScene.value = workRT.texture;
      renderer.setRenderTarget(null);
      gradeQuad.render(renderer);
    });

    return {
      nowMs: performance.now(),
      renderMs: passMsApprox.scene,
      drawCalls: renderer.info.render.calls,
      triangles: renderer.info.render.triangles,
      scale: 1,
      tier: tierKey,
      passMsApprox,
    };
  }

  function dispose() {
    disposeTargets();
    for (const q of quads) q.dispose();
    for (const m of [
      aoMaterial, aoApplyMaterial, cloudMaterial, compositeMaterial, shaftMaterial,
      dofMaterial, gradeMaterial, bloomThresholdMaterial, bloomDownMaterial,
      bloomUpMaterial, addMaterial, bloomAddMaterial, normalMaterial,
    ]) {
      m.dispose();
    }
  }

  resize(width, height);

  return {
    render,
    resize,
    setTier,
    setDegraded,
    dispose,
    uniforms: {
      cloud: cloudUniforms,
      ao: aoUniforms,
      aoApply: aoApplyUniforms,
      composite: compositeUniforms,
      shaft: shaftUniforms,
      dof: dofUniforms,
      grade: gradeUniforms,
      bloom: bloomAddUniforms,
    },
    targets: {
      get scene() { return sceneRT; },
      get cloud() { return cloudRT; },
      get ao() { return aoRT; },
      get work() { return workRT; },
    },
    get size() {
      return { width, height };
    },
    get tier() {
      return tierKey;
    },
  };
}
