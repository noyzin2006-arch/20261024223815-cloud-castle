/**
 * 诊断与取证接口（规划案 §5.2 / §5.7 / T13 / T15）
 *
 * - 每帧记录 frameId / 时间 / 耗时 / draw calls / 三角形
 * - ?debug=1 时挂 window.__CASTLE_DEBUG__，供 E2E 冻结画面取稳定截图
 * - 绝不在生产构建里暴露任意执行能力
 */

export function createDiagnostics() {
  /** @type {Array<Record<string, any>>} */
  const frames = [];
  let frameId = 0;
  let lastTime = 0;
  let frozen = false;
  let maxFrames = 4000;

  /**
   * 记录一帧。
   * @param {Record<string, any>} metrics
   */
  function record(metrics) {
    frameId += 1;
    const now = metrics.nowMs ?? performance.now();
    const delta = lastTime ? now - lastTime : 0;
    lastTime = now;
    const entry = {
      frameId,
      nowMs: now,
      frameMs: delta,
      fps: delta > 0 ? 1000 / delta : 0,
      ...metrics,
    };
    frames.push(entry);
    if (frames.length > maxFrames) frames.shift();
    return entry;
  }

  /**
   * 取最近 n 个**互不相同**的帧。
   * @param {number} count
   */
  function sampleDistinct(count) {
    const out = [];
    const seen = new Set();
    for (let i = frames.length - 1; i >= 0 && out.length < count; i -= 1) {
      const frame = frames[i];
      if (seen.has(frame.frameId)) continue;
      seen.add(frame.frameId);
      out.push(frame);
    }
    return out.reverse();
  }

  function median(values) {
    if (!values.length) return 0;
    const sorted = [...values].sort((a, b) => a - b);
    const mid = sorted.length >> 1;
    return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
  }

  function reset() {
    frames.length = 0;
    frameId = 0;
    lastTime = 0;
  }

  return {
    record,
    sampleDistinct,
    median,
    reset,
    setFrozen(value) { frozen = Boolean(value); },
    get frozen() { return frozen; },
    get frameCount() { return frameId; },
    get frames() { return frames; },
  };
}

/**
 * 挂载调试接口。只在 ?debug=1 时调用。
 * @param {Object} deps
 */
export function mountDebugApi({ store, diagnostics, pipeline, rig, scene, renderer, freeze }) {
  const api = {
    /**
     * 场景与性能快照（只读）
     */
    snapshot() {
      const info = renderer.info;
      return {
        state: store.getState(),
        frames: diagnostics.frameCount,
        render: {
          calls: info.render.calls,
          triangles: info.render.triangles,
          geometries: info.memory.geometries,
          textures: info.memory.textures,
          programs: info.programs?.length ?? 0,
        },
        camera: {
          position: rig.camera.position.toArray(),
          target: rig.controls.target.toArray(),
          fov: rig.camera.fov,
          aspect: rig.camera.aspect,
        },
        pipeline: {
          tier: pipeline.tier,
          size: pipeline.size,
          cloudSteps: pipeline.uniforms.cloud.uSteps.value,
        },
        scene: {
          children: scene.children.length,
        },
        fit: rig.fitInfo,
      };
    },
    /** 冻结风、云时间与粒子随机 —— 不停止 rAF */
    freezeForEvidence: freeze,
    setViewForEvidence(view) {
      rig.goTo(view, 0);
      rig.controls.update();
      return true;
    },
    sampleDistinctFrames(count) {
      return diagnostics.sampleDistinct(count);
    },
  };
  globalThis.__CASTLE_DEBUG__ = api;
  // 只读场景句柄，供 E2E 核对材质与几何（仅 debug 模式挂载）
  globalThis.__CASTLE_SCENE__ = scene;
  return api;
}
