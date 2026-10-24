/**
 * WebGL2 渲染器与能力探测（规划案 §5.5 / T05）
 *
 * 职责：建立 renderer、判定 WebGL2 与浮点 RT 能力、提供错误备用页所需的信息、
 * 暴露一次性的 contextlost 恢复入口，并保证 dispose 链完整。
 */

import * as THREE from 'three';
import { TIERS } from '../config/visual.js';

/**
 * @typedef {Object} Capabilities
 * @property {boolean} webgl2
 * @property {boolean} floatRenderTarget
 * @property {string} rendererName UNMASKED_RENDERER_WEBGL 或 fallback
 * @property {string} vendorName
 * @property {boolean} maxTextureSize
 * @property {number} maxTextureSizeValue
 */

/**
 * 探测 WebGL2 与浮点渲染目标支持。
 * @param {WebGLRenderingContext|WebGL2RenderingContext} gl
 * @returns {Capabilities}
 */
export function probeCapabilities(gl) {
  const webgl2 = typeof WebGL2RenderingContext !== 'undefined' && gl instanceof WebGL2RenderingContext;
  /** @type {Capabilities} */
  const caps = {
    webgl2,
    floatRenderTarget: false,
    rendererName: 'unknown',
    vendorName: 'unknown',
    maxTextureSize: false,
    maxTextureSizeValue: 0,
  };

  const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
  if (debugInfo) {
    caps.rendererName = String(gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) ?? 'unknown');
    caps.vendorName = String(gl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL) ?? 'unknown');
  } else {
    caps.rendererName = String(gl.getParameter(gl.RENDERER) ?? 'unknown');
    caps.vendorName = String(gl.getParameter(gl.VENDOR) ?? 'unknown');
  }

  caps.maxTextureSizeValue = Number(gl.getParameter(gl.MAX_TEXTURE_SIZE) ?? 0);
  caps.maxTextureSize = caps.maxTextureSizeValue >= 4096;

  // 浮点 RT：WebGL2 下靠 EXT_color_buffer_float
  caps.floatRenderTarget = Boolean(gl.getExtension('EXT_color_buffer_float'));

  return caps;
}

/**
 * 创建 renderer。
 * @param {HTMLCanvasElement} canvas
 * @param {{tier?: keyof typeof TIERS}} [options]
 */
export function createRenderer(canvas, options = {}) {
  const tier = options.tier ?? 'balanced';
  const tierSpec = TIERS[tier];

  /** @type {THREE.WebGLRenderer} */
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: false,
      powerPreference: 'high-performance',
      stencil: false,
      preserveDrawingBuffer: false,
    });
  } catch (error) {
    throw new Error(`渲染器创建失败：${error instanceof Error ? error.message : String(error)}`);
  }

  const gl = renderer.getContext();
  const capabilities = probeCapabilities(gl);

  if (!capabilities.webgl2) {
    renderer.dispose();
    throw new Error('当前设备或浏览器不提供 WebGL2');
  }

  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = true;
  // three r186 已移除 PCFSoftShadowMap（会退回 PCFShadowMap 并告警），直接用 PCF
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.info.autoReset = false;
  renderer.setPixelRatio(Math.min(globalThis.devicePixelRatio || 1, tierSpec.dprCap));

  /** @type {((event: WebGLContextEvent) => void) | null} */
  let onContextLost = null;
  /** @type {((event: WebGLContextEvent) => void) | null} */
  let onContextRestored = null;

  function handleContextLost(event) {
    // 阻止默认行为，浏览器才会在恢复后触发 contextrestored
    event.preventDefault();
    onContextLost?.(event);
  }

  function handleContextRestored(event) {
    renderer.resetState();
    onContextRestored?.(event);
  }

  canvas.addEventListener('webglcontextlost', handleContextLost, false);
  canvas.addEventListener('webglcontextrestored', handleContextRestored, false);

  function dispose() {
    canvas.removeEventListener('webglcontextlost', handleContextLost);
    canvas.removeEventListener('webglcontextrestored', handleContextRestored);
    renderer.dispose();
    renderer.forceContextLoss?.();
  }

  return {
    renderer,
    capabilities,
    /** @param {(e: WebGLContextEvent) => void} fn */
    onContextLost(fn) {
      onContextLost = fn;
    },
    /** @param {(e: WebGLContextEvent) => void} fn */
    onContextRestored(fn) {
      onContextRestored = fn;
    },
    dispose,
  };
}

/**
 * 计算最终绘制缓冲尺寸：CSS 尺寸 × DPR cap × 画质倍率，并落在档位下限之上。
 * @param {number} cssWidth
 * @param {number} cssHeight
 * @param {number} dpr
 * @param {number} scale
 * @param {number} scaleMin
 * @param {number} dprCap
 */
export function computeRenderSize(cssWidth, cssHeight, dpr, scale, scaleMin, dprCap) {
  const effectiveDpr = Math.min(Math.max(dpr, 0.5), dprCap);
  const effectiveScale = Math.min(Math.max(scale, scaleMin), 1);
  const width = Math.max(2, Math.round(cssWidth * effectiveDpr * effectiveScale));
  const height = Math.max(2, Math.round(cssHeight * effectiveDpr * effectiveScale));
  return { width, height, effectiveDpr, effectiveScale };
}
