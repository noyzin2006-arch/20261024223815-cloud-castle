// 体积云 ray marching：真实三维密度场 + 太阳积光 + 深度遮挡。
// 输出：rgb = 预乘 alpha 的散射光，a = 云的不透明度（1 - 透射率）。
//
// 关键做法：把射线终点用**场景深度**截断 —— 不透明几何体在前的像素，
// 射线走不到云层，天然得到正确的前后遮挡，不需要额外的深度比较 pass。
//
// 密度场分三层：大尺度云团（决定顶高与团块轮廓）、中频形体、高频侵蚀，
// 再用一条低频谷槽把云海切开，制造纵深与「看得见更深的层」。

#include ./common.glsl

uniform vec3 uCameraPosition;
uniform mat4 uInverseProjectionMatrix;
uniform mat4 uCameraWorldMatrix;
uniform vec3 uSunDirection;
uniform vec3 uSunColor;
uniform vec3 uCloudLit;
uniform vec3 uCloudShade;
uniform float uSunIntensity;
uniform float uCoverage;
uniform float uTime;
uniform vec2 uWind;
uniform float uSteps;
uniform float uLightSteps;
uniform vec3 uBoxMin;
uniform vec3 uBoxMax;
uniform sampler2D uSceneDepth;
uniform float uNear;
uniform float uFar;
uniform float uScatter;
uniform float uExtinction;
uniform float uAmbient;

varying vec2 vUv;

// 从屏幕坐标重建世界空间视线方向
vec3 akRayDirection(vec2 uv) {
  vec4 clip = vec4(uv * 2.0 - 1.0, -1.0, 1.0);
  vec4 viewPos = uInverseProjectionMatrix * clip;
  viewPos /= viewPos.w;
  return normalize((uCameraWorldMatrix * vec4(viewPos.xyz, 0.0)).xyz);
}

// 4×4 Bayer 抖动：比白噪声平滑得多，不会产生椒盐噪点
float akBayer(vec2 p) {
  vec2 c = floor(mod(p, 4.0));
  int i = int(c.x) + int(c.y) * 4;
  float table[16] = float[16](
     0.0,  8.0,  2.0, 10.0,
    12.0,  4.0, 14.0,  6.0,
     3.0, 11.0,  1.0,  9.0,
    15.0,  7.0, 13.0,  5.0
  );
  return table[i] / 16.0;
}

// 云的密度场
float akCloudDensity(vec3 p) {
  float bandHeight = max(uBoxMax.y - uBoxMin.y, 1e-3);
  float hNorm = clamp((p.y - uBoxMin.y) / bandHeight, 0.0, 1.0);

  // 1) 大尺度云团：每团有自己的顶高（规划案要求 ≥6 团有高度变化的大云体）
  float massTop = akFbm3(p * 0.0032 + vec3(7.3, 0.0, 2.1), 4);
  float topEdge = 0.34 + massTop * 0.64;

  // 高度剖面：底部厚实，顶部按各自顶高渐出 → 云顶有真正的起伏
  float heightProfile = smoothstep(0.0, 0.06, hNorm) * (1.0 - smoothstep(topEdge - 0.26, topEdge, hNorm));
  if (heightProfile <= 0.001) return 0.0;

  // 2) 中频形体：团块的凹凸
  vec3 sp = p * 0.0092 + vec3(uWind.x, uWind.y * 0.15, uWind.y);
  float shape = akFbm3(sp, 4);

  // 3) 高频侵蚀：边缘的絮状细节
  float erosion = akFbm3(p * 0.085 + vec3(0.0, uTime * 0.012, uTime * 0.006), 3);

  // 4) 纵深谷槽：低频把云海切开，露出更深的一层
  float trough = akFbm3(p * 0.0031 + vec3(19.7, 0.0, 44.3), 2);

  float d = uCoverage * heightProfile * smoothstep(0.26, 0.72, shape);
  d -= erosion * 0.14 * heightProfile;
  d -= smoothstep(0.56, 0.9, trough) * 0.30;

  // 更深的一层云：谷槽里露出的不是空，而是更暗更低的一层海 —— 这是纵深的来源
  float deepLayer = (1.0 - smoothstep(0.0, 0.34, hNorm)) * smoothstep(0.18, 0.55, shape);
  d = max(d, deepLayer * uCoverage * 0.85);

  // 密度上限：保证光学厚度不会爆掉
  return clamp(d, 0.0, 1.0) * 0.26;
}

void main() {
  vec3 rd = akRayDirection(vUv);
  vec3 ro = uCameraPosition;

  // 与云层包围盒求交
  vec2 hit = akRayBox(ro, rd, uBoxMin, uBoxMax);
  if (hit.y <= 0.0 || hit.x < 0.0) {
    gl_FragColor = vec4(0.0);
    return;
  }

  float tStart = max(hit.x, 0.0);
  float tEnd = hit.y;

  // 用场景深度截断：几何体在前时，射线走不到云层 → 天然的前后遮挡
  float sceneDepth = textureLod(uSceneDepth, vUv, 0.0).r;
  if (sceneDepth < 1.0) {
    vec4 clip = vec4(vUv * 2.0 - 1.0, sceneDepth * 2.0 - 1.0, 1.0);
    vec4 viewPos = uInverseProjectionMatrix * clip;
    viewPos /= viewPos.w;
    vec3 worldPos = (uCameraWorldMatrix * vec4(viewPos.xyz, 1.0)).xyz;
    float sceneDistance = length(worldPos - uCameraPosition);
    tEnd = min(tEnd, sceneDistance);
  }

  if (tEnd <= tStart) {
    gl_FragColor = vec4(0.0);
    return;
  }

  // 步长：夹在合理区间内，避免掠射射线产生巨步与噪点
  float stepSize = clamp((tEnd - tStart) / max(uSteps, 1.0), 2.5, 26.0);
  float jitter = akBayer(gl_FragCoord.xy);
  float t = tStart + stepSize * jitter;

  vec3 scattered = vec3(0.0);
  float transmittance = 1.0;

  float phase = akHenyeyGreenstein(dot(rd, uSunDirection), 0.55);
  // HG 相位函数在 g=0.55 时前向峰值很小，归一化到 0.35~1.0
  float phaseBlend = mix(0.35, 1.0, clamp(phase / 0.06, 0.0, 1.0));

  for (int i = 0; i < 64; i++) {
    if (float(i) >= uSteps || transmittance < 0.02 || t > tEnd) break;

    vec3 p = ro + rd * t;
    float density = akCloudDensity(p);

    if (density > 0.0005) {
      // 向太阳方向积光：4 步，步长递增
      float lightAccum = 0.0;
      float ls = 12.0;
      vec3 lp = p;
      for (int j = 0; j < 8; j++) {
        if (float(j) >= uLightSteps) break;
        lp += uSunDirection * ls;
        lightAccum += akCloudDensity(lp) * ls;
        ls *= 1.95;
      }
      float sunTransmittance = exp(-lightAccum * uExtinction);

      // 多次散射近似：让云底不至于死黑
      float multiScatter = 0.55 + 0.65 * sunTransmittance;

      // 温度：越高越接近受光色，越低越冷
      float bandHeight = max(uBoxMax.y - uBoxMin.y, 1e-3);
      float heightMix = clamp((p.y - uBoxMin.y) / bandHeight, 0.0, 1.0);
      float litMix = clamp(pow(sunTransmittance, 1.5) * 0.88 + heightMix * 0.38, 0.0, 1.0);
      vec3 tint = mix(uCloudShade, uCloudLit, litMix);

      vec3 sunContribution = uSunColor * uSunIntensity * sunTransmittance * phaseBlend * multiScatter;
      vec3 ambientContribution = uCloudShade * uAmbient * (0.55 + 0.45 * heightMix);

      vec3 S = (sunContribution * tint + ambientContribution) * uScatter;

      // 能量守恒的解析积分
      float sigmaE = density * uExtinction;
      float sampleTransmittance = exp(-sigmaE * stepSize);
      float weight = 1.0 - sampleTransmittance;

      scattered += transmittance * S * weight;
      transmittance *= sampleTransmittance;
    }

    t += stepSize;
  }

  float alpha = clamp(1.0 - transmittance, 0.0, 1.0);
  gl_FragColor = vec4(scattered, alpha);
}
