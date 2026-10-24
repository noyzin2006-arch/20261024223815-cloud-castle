// Bloom 降采样：13 抽样 Call of Duty 式过滤器，抑制闪烁。
uniform sampler2D uSource;
uniform vec2 uTexel;

varying vec2 vUv;

void main() {
  vec2 t = uTexel;
  vec3 a = textureLod(uSource, vUv + vec2(-2.0, 2.0) * t, 0.0).rgb;
  vec3 b = textureLod(uSource, vUv + vec2(0.0, 2.0) * t, 0.0).rgb;
  vec3 c = textureLod(uSource, vUv + vec2(2.0, 2.0) * t, 0.0).rgb;
  vec3 d = textureLod(uSource, vUv + vec2(-2.0, 0.0) * t, 0.0).rgb;
  vec3 e = textureLod(uSource, vUv, 0.0).rgb;
  vec3 f = textureLod(uSource, vUv + vec2(2.0, 0.0) * t, 0.0).rgb;
  vec3 g = textureLod(uSource, vUv + vec2(-2.0, -2.0) * t, 0.0).rgb;
  vec3 h = textureLod(uSource, vUv + vec2(0.0, -2.0) * t, 0.0).rgb;
  vec3 i = textureLod(uSource, vUv + vec2(2.0, -2.0) * t, 0.0).rgb;
  vec3 j = textureLod(uSource, vUv + vec2(-1.0, 1.0) * t, 0.0).rgb;
  vec3 k = textureLod(uSource, vUv + vec2(1.0, 1.0) * t, 0.0).rgb;
  vec3 l = textureLod(uSource, vUv + vec2(-1.0, -1.0) * t, 0.0).rgb;
  vec3 m = textureLod(uSource, vUv + vec2(1.0, -1.0) * t, 0.0).rgb;

  vec3 result = e * 0.125;
  result += (a + c + g + i) * 0.03125;
  result += (b + d + f + h) * 0.0625;
  result += (j + k + l + m) * 0.125;

  gl_FragColor = vec4(result, 1.0);
}
