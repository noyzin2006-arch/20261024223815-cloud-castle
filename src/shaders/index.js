/**
 * 着色器装配（Vite 不处理 GLSL 的 #include，这里自己做）。
 *
 * three 对非 raw 材质（ShaderMaterial）会自动把 GLSL1 源码转成 GLSL ES 3.00：
 *   attribute→in、varying→out/in、texture2D→texture，并提供 gl_FragColor。
 * 因此下面的源码可以保持 GLSL1 写法，同时直接使用 textureLod / textureSize。
 */

import commonSrc from './common.glsl?raw';
import quadVertSrc from './quad.vert.glsl?raw';
import skyVertSrc from './sky.vert.glsl?raw';
import skyFragSrc from './sky.frag.glsl?raw';
import aoFragSrc from './ao.frag.glsl?raw';
import aoApplyFragSrc from './ao-apply.frag.glsl?raw';
import cloudsFragSrc from './clouds.frag.glsl?raw';
import cloudCompositeFragSrc from './cloud-composite.frag.glsl?raw';
import shaftsFragSrc from './shafts.frag.glsl?raw';
import dofFragSrc from './dof.frag.glsl?raw';
import gradeFragSrc from './grade.frag.glsl?raw';
import bloomThresholdFragSrc from './bloom-threshold.frag.glsl?raw';
import bloomDownFragSrc from './bloom-down.frag.glsl?raw';
import bloomUpFragSrc from './bloom-up.frag.glsl?raw';
import waterVertSrc from './water.vert.glsl?raw';
import waterFragSrc from './water.frag.glsl?raw';

/** 把 `#include ./common.glsl` 展开成真正的源码 */
function inlineCommon(source) {
  return source.replace('#include ./common.glsl', commonSrc);
}

export const SHADERS = Object.freeze({
  common: commonSrc,
  quadVert: inlineCommon(quadVertSrc),
  skyVert: inlineCommon(skyVertSrc),
  skyFrag: inlineCommon(skyFragSrc),
  aoFrag: inlineCommon(aoFragSrc),
  aoApplyFrag: inlineCommon(aoApplyFragSrc),
  cloudsFrag: inlineCommon(cloudsFragSrc),
  cloudCompositeFrag: inlineCommon(cloudCompositeFragSrc),
  shaftsFrag: inlineCommon(shaftsFragSrc),
  dofFrag: inlineCommon(dofFragSrc),
  gradeFrag: inlineCommon(gradeFragSrc),
  bloomThresholdFrag: inlineCommon(bloomThresholdFragSrc),
  bloomDownFrag: inlineCommon(bloomDownFragSrc),
  bloomUpFrag: inlineCommon(bloomUpFragSrc),
  waterVert: inlineCommon(waterVertSrc),
  waterFrag: inlineCommon(waterFragSrc),
});
