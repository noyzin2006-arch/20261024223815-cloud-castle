// 把半分辨率 AO 乘回场景颜色：双边模糊 + 相乘。
// 目的是让 AO 在半分辨率下也不出现块状边缘。

uniform sampler2D uScene;
uniform sampler2D uAo;
uniform sampler2D uDepth;
uniform vec2 uAoTexel;
uniform float uEnabled;
uniform float uNear;
uniform float uFar;

varying vec2 vUv;

float akLinearDepth(sampler2D depthTex, vec2 uv) {
  float d = textureLod(depthTex, uv, 0.0).r;
  if (d >= 0.999999) return 1e6;
  float ndc = d * 2.0 - 1.0;
  return (2.0 * uNear * uFar) / (uFar + uNear - ndc * (uFar - uNear));
}

void main() {
  vec3 color = textureLod(uScene, vUv, 0.0).rgb;
  if (uEnabled < 0.5) {
    gl_FragColor = vec4(color, 1.0);
    return;
  }

  float centerDepth = akLinearDepth(uDepth, vUv);
  float sum = 0.0;
  float weightSum = 0.0;

  for (int y = -1; y <= 1; y++) {
    for (int x = -1; x <= 1; x++) {
      vec2 offset = vec2(float(x), float(y)) * uAoTexel;
      vec2 uv = vUv + offset;
      float d = akLinearDepth(uDepth, uv);
      float w = exp(-abs(d - centerDepth) * 0.6) * (1.0 - 0.22 * float(abs(x) + abs(y)));
      sum += textureLod(uAo, uv, 0.0).r * w;
      weightSum += w;
    }
  }

  float ao = weightSum > 1e-5 ? sum / weightSum : 1.0;
  gl_FragColor = vec4(color * ao, 1.0);
}
