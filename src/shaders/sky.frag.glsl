// 大气天空：Rayleigh / Mie 近似 + 日盘 + 星场 + 地平线层次雾。
// 输出线性 HDR（不做 tone mapping、不做 sRGB 转换）。

#include ./common.glsl

uniform vec3 uSunDirection;
uniform vec3 uSunColor;
uniform vec3 uZenith;
uniform vec3 uHorizon;
uniform float uSunIntensity;
uniform float uStarIntensity;
uniform float uTime;
uniform float uCloudCoverage;

varying vec3 vWorldDirection;

// 简化 Rayleigh 相函数
float akRayleighPhase(float cosTheta) {
  return 0.75 * (1.0 + cosTheta * cosTheta);
}

// 简化 Mie（Henyey-Greenstein）
float akMiePhase(float cosTheta, float g) {
  float g2 = g * g;
  float denom = 1.0 + g2 - 2.0 * g * cosTheta;
  return (1.0 - g2) / (4.0 * 3.14159265 * pow(max(denom, 1e-4), 1.5));
}

// 星场：三层不同尺度的点阵，带轻微闪烁
float akStars(vec3 dir) {
  if (uStarIntensity <= 0.001) return 0.0;
  float total = 0.0;
  for (int i = 0; i < 3; i++) {
    float scale = 140.0 + float(i) * 260.0;
    vec3 p = dir * scale;
    vec3 cell = floor(p);
    vec3 f = fract(p) - 0.5;
    float rnd = akHash13(cell + float(i) * 17.3);
    if (rnd > 0.9945 - float(i) * 0.0008) {
      float d = length(f);
      float twinkle = 0.72 + 0.28 * sin(uTime * 1.6 + rnd * 60.0);
      total += smoothstep(0.30, 0.0, d) * (0.55 + rnd * 0.45) * twinkle;
    }
  }
  return total * uStarIntensity;
}

void main() {
  vec3 dir = normalize(vWorldDirection);
  float cosTheta = dot(dir, uSunDirection);

  // 天顶→地平线的基础渐变。指数越大，地平线暖色带越窄，
  // 天顶蓝才有机会在画面上方成立（指数太小会让整片天空糊成暖奶油色）。
  float horizonFactor = pow(clamp(1.0 - max(dir.y, 0.0), 0.0, 1.0), 8.0);
  vec3 base = mix(uZenith, uHorizon, horizonFactor);

  // 反日点的维纳斯带：地平线上方一条粉紫色带，
  // 是「太阳刚落下、天空已经转蓝」的真实特征，也给暖色天空一个层次。
  float belt = exp(-pow((dir.y - 0.075) / 0.10, 2.0));
  float antiSolar = clamp(-dot(dir, uSunDirection) * 0.5 + 0.5, 0.0, 1.0);
  base = mix(base, base + vec3(0.18, 0.07, 0.10), belt * antiSolar * 0.75);

  // Rayleigh：太阳附近偏蓝、地平线偏暖
  float rayleigh = akRayleighPhase(cosTheta);
  vec3 rayleighTint = mix(uZenith, vec3(0.36, 0.55, 0.92), 0.55);
  vec3 color = base * (0.72 + 0.55 * rayleigh * 0.5);

  // Mie：太阳周围的光晕与前向散射
  float mie = akMiePhase(cosTheta, 0.76);
  color += uSunColor * mie * 0.55 * uSunIntensity * 0.22;

  // 太阳附近的暖色扩散（黄金时刻的关键）
  float sunGlow = pow(clamp(cosTheta, 0.0, 1.0), 9.0);
  color += uSunColor * sunGlow * 0.42 * uSunIntensity * 0.3;

  // 日盘
  float sunDisc = smoothstep(0.99955, 0.99988, cosTheta);
  color += uSunColor * sunDisc * uSunIntensity * 6.0;

  // 星（仅在太阳落到地平线以下才可见）
  float nightFactor = clamp(-uSunDirection.y * 3.0, 0.0, 1.0);
  color += vec3(0.86, 0.90, 1.0) * akStars(dir) * nightFactor * 1.6;

  // 地平线以下：压暗，避免岛底出现亮天空
  float below = smoothstep(0.02, -0.34, dir.y);
  color = mix(color, color * 0.22, below);

  // 极轻的高空薄雾层次，避免天空完全平坦
  float haze = akFbm3(dir * 3.4 + vec3(0.0, uTime * 0.006, 0.0), 4);
  color += (haze - 0.5) * 0.035 * vec3(0.8, 0.9, 1.0) * (1.0 - abs(dir.y));

  gl_FragColor = vec4(max(color, vec3(0.0)), 1.0);
}
