// Bloom 亮部提取：阈值 + 软膝盖，避免硬边。
uniform sampler2D uScene;
uniform float uThreshold;
uniform float uKnee;

varying vec2 vUv;

void main() {
  vec3 color = textureLod(uScene, vUv, 0.0).rgb;
  float brightness = max(max(color.r, color.g), color.b);
  float soft = brightness - uThreshold + uKnee;
  soft = clamp(soft, 0.0, 2.0 * uKnee);
  soft = soft * soft / (4.0 * uKnee + 1e-5);
  float contribution = max(soft, brightness - uThreshold) / max(brightness, 1e-5);
  gl_FragColor = vec4(color * contribution, 1.0);
}
