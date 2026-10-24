// 水镜着色器：两层滚动法线 + 菲涅尔 + 天空反射 + 太阳镜面高光。
#include ./common.glsl

uniform vec3 uDeepColor;
uniform vec3 uSkyColor;
uniform vec3 uHorizonColor;
uniform vec3 uSunDirection;
uniform vec3 uSunColor;
uniform float uSunIntensity;
uniform float uTime;
uniform float uWaveAmplitude;
uniform float uRoughness;
uniform float uMist;

varying vec3 vWorldPosition;
varying vec2 vWaterUv;

// 两层正弦波叠加出的法线扰动
vec3 akWaterNormal(vec2 p, float t) {
  vec2 d = vec2(0.0);

  // 第一层：细密微波
  float a1 = sin(p.x * 2.1 + t * 0.9) * cos(p.y * 1.7 - t * 0.7);
  d += vec2(cos(p.x * 2.1 + t * 0.9), -sin(p.y * 1.7 - t * 0.7)) * a1;

  // 第二层：较慢的起伏
  float a2 = sin(p.x * 0.62 - t * 0.42 + 1.7) * cos(p.y * 0.51 + t * 0.33);
  d += vec2(cos(p.x * 0.62 - t * 0.42 + 1.7), -sin(p.y * 0.51 + t * 0.33)) * a2 * 1.6;

  return normalize(vec3(d.x * uWaveAmplitude, 1.0, d.y * uWaveAmplitude));
}

void main() {
  vec3 viewDir = normalize(cameraPosition - vWorldPosition);
  vec3 normal = akWaterNormal(vWorldPosition.xz * 0.35, uTime);

  // 反射方向
  vec3 reflectDir = reflect(-viewDir, normal);
  reflectDir.y = abs(reflectDir.y);

  // 天空的简化梯度（与主天空同一口径）
  float t = clamp(reflectDir.y, 0.0, 1.0);
  vec3 sky = mix(uHorizonColor, uSkyColor, pow(t, 0.55));

  // 太阳镜面高光
  float spec = pow(max(dot(reflectDir, uSunDirection), 0.0), 220.0);
  vec3 specular = uSunColor * spec * uSunIntensity * 1.6;

  // 菲涅尔：正视偏深色，掠射偏天空
  float fresnel = pow(1.0 - max(dot(viewDir, normal), 0.0), 4.0);
  fresnel = mix(0.06, 1.0, fresnel);

  vec3 color = mix(uDeepColor, sky, fresnel) + specular;

  // 薄雾时水面发灰
  color = mix(color, vec3(0.62, 0.66, 0.7), uMist * 0.35);

  // 轻微的水下暗角
  float edge = smoothstep(0.0, 0.12, min(min(vWaterUv.x, 1.0 - vWaterUv.x), min(vWaterUv.y, 1.0 - vWaterUv.y)));
  color *= mix(0.55, 1.0, edge);

  gl_FragColor = vec4(color, 1.0);
}
