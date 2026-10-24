// 共享 GLSL 片段：噪声、色彩空间、深度重建。
// 所有自定义 pass 都 include 本文件，保证噪声与色彩空间口径完全一致。

#ifndef AK_COMMON
#define AK_COMMON

// ---------------------------------------------------------------- 哈希与噪声
float akHash11(float p) {
  p = fract(p * 0.1031);
  p *= p + 33.33;
  p *= p + p;
  return fract(p);
}

vec3 akHash33(vec3 p) {
  p = fract(p * vec3(0.1031, 0.1030, 0.0973));
  p += dot(p, p.yxz + 33.33);
  return fract((p.xxy + p.yxx) * p.zyx);
}

float akHash13(vec3 p) {
  p = fract(p * 0.1031);
  p += dot(p, p.zyx + 31.32);
  return fract((p.x + p.y) * p.z);
}

// 3D value noise
float akNoise3(vec3 p) {
  vec3 i = floor(p);
  vec3 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float n000 = akHash13(i + vec3(0.0, 0.0, 0.0));
  float n100 = akHash13(i + vec3(1.0, 0.0, 0.0));
  float n010 = akHash13(i + vec3(0.0, 1.0, 0.0));
  float n110 = akHash13(i + vec3(1.0, 1.0, 0.0));
  float n001 = akHash13(i + vec3(0.0, 0.0, 1.0));
  float n101 = akHash13(i + vec3(1.0, 0.0, 1.0));
  float n011 = akHash13(i + vec3(0.0, 1.0, 1.0));
  float n111 = akHash13(i + vec3(1.0, 1.0, 1.0));
  float nx00 = mix(n000, n100, f.x);
  float nx10 = mix(n010, n110, f.x);
  float nx01 = mix(n001, n101, f.x);
  float nx11 = mix(n011, n111, f.x);
  return mix(mix(nx00, nx10, f.y), mix(nx01, nx11, f.y), f.z);
}

float akFbm3(vec3 p, int octaves) {
  float sum = 0.0;
  float amp = 0.5;
  float norm = 0.0;
  for (int i = 0; i < 8; i++) {
    if (i >= octaves) break;
    sum += amp * akNoise3(p);
    norm += amp;
    amp *= 0.5;
    p *= 2.02;
    p.xy = mat2(0.8, 0.6, -0.6, 0.8) * p.xy;
  }
  return sum / max(norm, 1e-4);
}

// Worley-ish：返回到最近特征点的距离，用于侵蚀云边缘
float akWorley(vec3 p) {
  vec3 i = floor(p);
  vec3 f = fract(p);
  float minDist = 1.0;
  for (int z = -1; z <= 1; z++) {
    for (int y = -1; y <= 1; y++) {
      for (int x = -1; x <= 1; x++) {
        vec3 g = vec3(float(x), float(y), float(z));
        vec3 o = akHash33(i + g);
        vec3 r = g + o - f;
        minDist = min(minDist, dot(r, r));
      }
    }
  }
  return sqrt(minDist);
}

// ---------------------------------------------------------------- 深度重建
// 透视相机的视空间深度（线性米）→ 世界空间位置
vec3 akViewToWorld(vec3 viewPos, mat4 inverseViewMatrix) {
  return (inverseViewMatrix * vec4(viewPos, 1.0)).xyz;
}

float akPerspectiveDepthToViewZ(float invClipZ, float near, float far) {
  // invClipZ = 1.0 / clipZ（已除以 w）
  return (near * far) / ((far - near) * invClipZ - far);
}

float akLinearizeDepth(float fragCoordZ, float near, float far) {
  float ndc = fragCoordZ * 2.0 - 1.0;
  return (2.0 * near * far) / (far + near - ndc * (far - near));
}

// ---------------------------------------------------------------- 色彩
float akLuma(vec3 c) {
  return dot(c, vec3(0.2126, 0.7152, 0.0722));
}

vec3 akSrgbToLinear(vec3 c) {
  return mix(c / 12.92, pow((c + 0.055) / 1.055, vec3(2.4)), step(0.04045, c));
}

vec3 akLinearToSrgb(vec3 c) {
  c = max(c, vec3(0.0));
  return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c));
}

// ACES filmic（Narkowicz 拟合），与 three 的 ACESFilmicToneMapping 同族
vec3 akAcesFilmic(vec3 x) {
  const float a = 2.51;
  const float b = 0.03;
  const float c = 2.43;
  const float d = 0.59;
  const float e = 0.14;
  return clamp((x * (a * x + b)) / (x * (c * x + d) + e), 0.0, 1.0);
}

// Henyey-Greenstein 相位函数
float akHenyeyGreenstein(float cosTheta, float g) {
  float g2 = g * g;
  float denom = 1.0 + g2 - 2.0 * g * cosTheta;
  return (1.0 - g2) / (4.0 * 3.14159265 * pow(max(denom, 1e-4), 1.5));
}

// 光线与 AABB 求交，返回近/远距离（无交返回 -1）
vec2 akRayBox(vec3 ro, vec3 rd, vec3 boxMin, vec3 boxMax) {
  vec3 invDir = 1.0 / rd;
  vec3 t0 = (boxMin - ro) * invDir;
  vec3 t1 = (boxMax - ro) * invDir;
  vec3 tsmaller = min(t0, t1);
  vec3 tbigger = max(t0, t1);
  float tmin = max(max(tsmaller.x, tsmaller.y), tsmaller.z);
  float tmax = min(min(tbigger.x, tbigger.y), tbigger.z);
  if (tmax < max(tmin, 0.0)) return vec2(-1.0);
  return vec2(tmin, tmax);
}

#endif
