// 调色 + 颗粒 + 暗角 + **唯一一次** ACES 色调映射与 sRGB 转换。
// 这一级之后画面直接进屏幕，不再有任何色彩空间转换。

#include ./common.glsl

uniform sampler2D uScene;
uniform float uContrast;
uniform float uSaturation;
uniform float uGrain;
uniform float uVignette;
uniform float uTime;
uniform float uExposure;

varying vec2 vUv;

void main() {
  vec3 color = textureLod(uScene, vUv, 0.0).rgb * uExposure;

  // 对比度（以 0.5 为轴）
  color = (color - 0.5) * uContrast + 0.5;

  // 饱和度
  float l = akLuma(color);
  color = mix(vec3(l), color, uSaturation);

  // 暗角
  vec2 centered = vUv - 0.5;
  float vig = 1.0 - dot(centered, centered) * uVignette * 2.2;
  color *= clamp(vig, 0.0, 1.0);

  // 胶片颗粒（暗部更明显，亮部更弱）
  float grain = akHash13(vec3(gl_FragCoord.xy, floor(uTime * 24.0))) - 0.5;
  float grainWeight = 1.0 - clamp(akLuma(color) * 1.4, 0.0, 1.0);
  color += grain * uGrain * grainWeight;

  color = max(color, vec3(0.0));

  // 唯一一次 ACES + sRGB
  color = akAcesFilmic(color);
  color = akLinearToSrgb(color);

  gl_FragColor = vec4(clamp(color, 0.0, 1.0), 1.0);
}
