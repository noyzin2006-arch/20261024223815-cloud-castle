// 景深：四分之一分辨率，8 抽样散焦，深度边缘保护。
// 焦点由镜头 target 决定；主体始终保持锐利。

uniform sampler2D uScene;
uniform sampler2D uDepth;
uniform float uNear;
uniform float uFar;
uniform float uFocusDistance;
uniform float uFocusRange;
uniform float uMaxCoc;
uniform float uEnabled;

varying vec2 vUv;

float akLinearDepth(sampler2D depthTex, vec2 uv) {
  float d = textureLod(depthTex, uv, 0.0).r;
  if (d >= 0.999999) return uFar;
  float ndc = d * 2.0 - 1.0;
  return (2.0 * uNear * uFar) / (uFar + uNear - ndc * (uFar - uNear));
}

void main() {
  vec3 color = textureLod(uScene, vUv, 0.0).rgb;
  if (uEnabled < 0.5) {
    gl_FragColor = vec4(color, 1.0);
    return;
  }

  float depth = akLinearDepth(uDepth, vUv);
  float coc = clamp((depth - uFocusDistance) / max(uFocusRange, 1e-3), -1.0, 1.0);
  coc = sign(coc) * pow(abs(coc), 1.35) * uMaxCoc;

  if (abs(coc) < 0.35) {
    gl_FragColor = vec4(color, 1.0);
    return;
  }

  vec2 texel = 1.0 / vec2(textureSize(uScene, 0));
  vec3 sum = color;
  float weightSum = 1.0;

  for (int i = 0; i < 8; i++) {
    float a = float(i) * 0.7853981634; // 45°
    vec2 dir = vec2(cos(a), sin(a)) * coc * texel;
    vec2 uv = vUv + dir;

    // 边缘保护：邻域深度差太大就不采
    float d = akLinearDepth(uDepth, uv);
    if (abs(d - depth) > 18.0) continue;

    float w = 1.0;
    sum += textureLod(uScene, uv, 0.0).rgb * w;
    weightSum += w;
  }

  gl_FragColor = vec4(sum / weightSum, 1.0);
}
