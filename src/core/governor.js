/**
 * 连续帧调速器（规划案 §5.6 / T13）
 *
 * 目标：在任何设备上都不掉帧，用「渲染倍率 + 效果降级顺序」换帧率，
 * 但**绝不偷偷换档**、绝不删体积云 / 石砌材质 / 真实投影。
 *
 * 本模块不碰 DOM 与 three.js，纯逻辑，可单测。
 */

import { GOVERNOR, TIERS } from '../config/visual.js';

/**
 * @typedef {'none'|'scale-down'|'scale-up'|'degrade'|'restore'|'notice'} GovernorActionType
 * @typedef {Object} GovernorAction
 * @property {GovernorActionType} type
 * @property {number} [scale] 新的渲染倍率
 * @property {string} [degrade] 被降级的能力名
 * @property {string} [restore] 被恢复的能力名
 * @property {string} [notice] 给用户看的提示
 */

/** 降级顺序：先削云的采样，再削 AO，最后才动阴影与植被 */
export const DEGRADE_ORDER = Object.freeze(['cloud', 'ao', 'dof', 'shafts', 'shadow', 'vegetation']);

export const DEGRADE_LABELS = Object.freeze({
  cloud: '云的采样步数',
  ao: '环境光遮蔽采样',
  dof: '景深',
  shafts: '太阳光束',
  shadow: '阴影贴图分辨率',
  vegetation: '植被细节层级',
});

/**
 * @typedef {Object} GovernorConfig
 * @property {number} windowFrames
 * @property {number} warmupFrames
 * @property {number} p90OverBudgetMs
 * @property {number} p90UnderBudgetMs
 * @property {number} overBudgetWindows
 * @property {number} underBudgetWindows
 * @property {number} scaleStepDown
 * @property {number} scaleStepUp
 * @property {number} cooldownDownMs
 * @property {number} cooldownUpMs
 * @property {number} overloadNoticeMs
 */

/**
 * @param {Partial<GovernorConfig>} [overrides]
 */
export function createGovernor(overrides = {}) {
  /** @type {GovernorConfig} */
  const cfg = { ...GOVERNOR, ...overrides };

  /** @type {number[]} */
  let samples = [];
  let warmupLeft = cfg.warmupFrames;
  let overCount = 0;
  let underCount = 0;
  let cooldownUntil = 0;
  let lastNoticeAt = -Infinity;
  let scale = 0;
  let scaleMin = 0;
  let scaleMax = 1;
  let tier = 'balanced';
  let manualLocked = false;
  /** 已降级的能力集合（按 DEGRADE_ORDER 记录等级） */
  /** @type {Map<string, number>} */
  let degraded = new Map();
  let paused = false;
  let frameCounter = 0;
  let sinceEvaluation = 0;
  let lastP50 = 0;
  let lastP90 = 0;

  /**
   * 切换档位时重置窗口与降级状态。
   * @param {string} nextTier
   * @param {boolean} manual
   */
  function setTier(nextTier, manual) {
    const spec = TIERS[nextTier];
    if (!spec) return;
    tier = nextTier;
    manualLocked = manual;
    scale = spec.scale;
    scaleMin = spec.scaleMin;
    scaleMax = spec.scale;
    degraded = new Map();
    reset();
  }

  /** 重置采样窗口（切天气 / 切镜头 / resize / 进摄影模式时调用） */
  function reset() {
    samples = [];
    overCount = 0;
    underCount = 0;
    cooldownUntil = 0;
    sinceEvaluation = 0;
    warmupLeft = cfg.warmupFrames;
  }

  /** 页面不可见时暂停观测 */
  function setPaused(value) {
    paused = Boolean(value);
    if (paused) reset();
  }

  function percentile(list, p) {
    if (!list.length) return 0;
    const sorted = [...list].sort((a, b) => a - b);
    const pos = (sorted.length - 1) * p;
    const lo = Math.floor(pos);
    const hi = Math.ceil(pos);
    return lo === hi ? sorted[lo] : sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
  }

  /**
   * 观测一帧。
   * @param {number} frameMs 该帧耗时（毫秒）
   * @param {number} frameId 全局递增帧号
   * @param {number} now 当前时间（毫秒）
   * @returns {GovernorAction}
   */
  function observe(frameMs, frameId, now) {
    frameCounter += 1;
    if (paused) return { type: 'none' };

    if (warmupLeft > 0) {
      warmupLeft -= 1;
      return { type: 'none' };
    }

    samples.push(frameMs);
    if (samples.length > cfg.windowFrames) samples.shift();
    if (samples.length < cfg.windowFrames) return { type: 'none' };

    // 滑窗每帧都在变，但「连续 N 个窗口」必须按**窗口**计数：
    // 每收满一个窗口的样本才评估一次，否则同一窗口会被重复计入 N 次。
    sinceEvaluation += 1;
    if (sinceEvaluation < cfg.windowFrames) return { type: 'none' };
    sinceEvaluation = 0;

    const p90 = percentile(samples, 0.9);
    const p50 = percentile(samples, 0.5);
    lastP50 = p50;
    lastP90 = p90;

    if (p90 > cfg.p90OverBudgetMs) {
      overCount += 1;
      underCount = 0;
    } else if (p90 < cfg.p90UnderBudgetMs) {
      underCount += 1;
      overCount = 0;
    } else {
      overCount = 0;
      underCount = 0;
    }

    if (now < cooldownUntil) return { type: 'none' };

    // —— 过载：先缩渲染倍率，再按顺序降级能力 ——
    if (overCount >= cfg.overBudgetWindows) {
      overCount = 0;
      cooldownUntil = now + cfg.cooldownDownMs;

      if (scale > scaleMin + 1e-6) {
        scale = Math.max(scaleMin, scale - cfg.scaleStepDown);
        return { type: 'scale-down', scale };
      }

      // 倍率已到下限：按 DEGRADE_ORDER 逐级削
      for (const key of DEGRADE_ORDER) {
        const level = degraded.get(key) ?? 0;
        if (level >= 2) continue;
        degraded.set(key, level + 1);
        return { type: 'degrade', degrade: key };
      }

      if (now - lastNoticeAt > cfg.overloadNoticeMs) {
        lastNoticeAt = now;
        return { type: 'notice', notice: '设备负载较高，切换均衡画质可更顺畅' };
      }
      return { type: 'none' };
    }

    // —— 余量充足：缓慢升回 ——
    if (underCount >= cfg.underBudgetWindows) {
      underCount = 0;
      cooldownUntil = now + cfg.cooldownUpMs;

      if (!manualLocked && scale < scaleMax - 1e-6) {
        scale = Math.min(scaleMax, scale + cfg.scaleStepUp);
        return { type: 'scale-up', scale };
      }

      // 手动锁档时只恢复能力，不动倍率
      for (let i = DEGRADE_ORDER.length - 1; i >= 0; i -= 1) {
        const key = DEGRADE_ORDER[i];
        const level = degraded.get(key) ?? 0;
        if (level > 0) {
          degraded.set(key, level - 1);
          return { type: 'restore', restore: key };
        }
      }
      return { type: 'none' };
    }

    return { type: 'none' };
  }

  function snapshot() {
    return {
      tier,
      scale,
      scaleMin,
      scaleMax,
      manualLocked,
      warmupLeft,
      sampleCount: samples.length,
      p50: lastP50,
      p90: lastP90,
      degraded: Object.fromEntries(degraded),
      frameCounter,
      paused,
    };
  }

  return {
    observe,
    reset,
    setTier,
    setPaused,
    snapshot,
    get scale() {
      return scale;
    },
    get degraded() {
      return degraded;
    },
  };
}
