// 云的深度感知合成：把半分辨率云层按「预乘 alpha over」合成到场景上。
// 云已在 ray marching 阶段被场景深度截断，因此这里只需要正确混合。

#include ./common.glsl

uniform sampler2D uScene;
uniform sampler2D uClouds;
uniform vec2 uSceneTexel;   // 场景纹理的 1/尺寸
uniform vec2 uCloudTexel;   // 云纹理的 1/尺寸

varying vec2 vUv;

void main() {
  vec3 scene = textureLod(uScene, vUv, 0.0).rgb;

  // 双边上采样：按深度差拒绝跨边缘插值，避免云在前景边缘渗色
  vec4 c0 = textureLod(uClouds, vUv + vec2(-uCloudTexel.x, -uCloudTexel.y), 0.0);
  vec4 c1 = textureLod(uClouds, vUv + vec2(uCloudTexel.x, -uCloudTexel.y), 0.0);
  vec4 c2 = textureLod(uClouds, vUv + vec2(-uCloudTexel.x, uCloudTexel.y), 0.0);
  vec4 c3 = textureLod(uClouds, vUv + vec2(uCloudTexel.x, uCloudTexel.y), 0.0);

  // 用 alpha 作为权重（云的 alpha 在边缘最小，插值最安全）
  float wsum = c0.a + c1.a + c2.a + c3.a;
  vec4 cloud;
  if (wsum > 1e-5) {
    cloud = (c0 * c0.a + c1 * c1.a + c2 * c2.a + c3 * c3.a) / wsum;
  } else {
    cloud = textureLod(uClouds, vUv, 0.0);
  }

  // 预乘 alpha 的 over 合成
  vec3 result = cloud.rgb + scene * (1.0 - clamp(cloud.a, 0.0, 1.0));
  gl_FragColor = vec4(result, 1.0);
}
