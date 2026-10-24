// Bloom 升采样：帐篷滤波 + 与上一级相加。
uniform sampler2D uSource;
uniform sampler2D uPrevious;
uniform vec2 uTexel;
uniform float uRadius;

varying vec2 vUv;

void main() {
  vec2 t = uTexel * uRadius;
  vec3 sum = textureLod(uSource, vUv + vec2(-t.x, t.y), 0.0).rgb;
  sum += textureLod(uSource, vUv + vec2(0.0, t.y), 0.0).rgb * 2.0;
  sum += textureLod(uSource, vUv + vec2(t.x, t.y), 0.0).rgb;
  sum += textureLod(uSource, vUv + vec2(-t.x, 0.0), 0.0).rgb * 2.0;
  sum += textureLod(uSource, vUv, 0.0).rgb * 4.0;
  sum += textureLod(uSource, vUv + vec2(t.x, 0.0), 0.0).rgb * 2.0;
  sum += textureLod(uSource, vUv + vec2(-t.x, -t.y), 0.0).rgb;
  sum += textureLod(uSource, vUv + vec2(0.0, -t.y), 0.0).rgb * 2.0;
  sum += textureLod(uSource, vUv + vec2(t.x, -t.y), 0.0).rgb;
  sum /= 16.0;

  vec3 previous = textureLod(uPrevious, vUv, 0.0).rgb;
  gl_FragColor = vec4(sum + previous, 1.0);
}
