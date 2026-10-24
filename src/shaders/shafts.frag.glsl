// 云隙光：半分辨率径向模糊，太阳位置为原点。
// 遮挡来自场景深度 —— 被几何体挡住的地方不产生光束。

#include ./common.glsl

uniform sampler2D uScene;
uniform sampler2D uDepth;
uniform vec2 uSunScreenPosition;
uniform float uIntensity;
uniform float uSunVisible;
uniform float uNear;
uniform float uFar;
uniform float uSamples;
uniform float uDecay;

varying vec2 vUv;

void main() {
  if (uIntensity <= 0.001 || uSunVisible <= 0.001) {
    gl_FragColor = vec4(0.0);
    return;
  }

  vec2 delta = (vUv - uSunScreenPosition) * (1.0 / max(uSamples, 1.0)) * 0.92;
  vec2 coord = vUv;
  float illuminationDecay = 1.0;
  vec3 shaft = vec3(0.0);

  for (int i = 0; i < 16; i++) {
    if (float(i) >= uSamples) break;
    coord -= delta;

    if (coord.x < 0.0 || coord.x > 1.0 || coord.y < 0.0 || coord.y > 1.0) break;

    float depth = textureLod(uDepth, coord, 0.0).r;
    if (depth >= 0.999999) {
      // 天空区域：取该点亮度做遮挡源
      vec3 sampleColor = textureLod(uScene, coord, 0.0).rgb;
      shaft += sampleColor * illuminationDecay * uDecay;
    }
    illuminationDecay *= 0.94;
  }

  float falloff = 1.0 - clamp(length(vUv - uSunScreenPosition) / 1.35, 0.0, 1.0);
  gl_FragColor = vec4(shaft * uIntensity * falloff * falloff, 1.0);
}
