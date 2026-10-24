// 屏幕空间环境光遮蔽（SSAO）：半分辨率，12 采样半球核。
// 输入：半分辨率视空间法线 + 半分辨率深度（法线预通道同时产出）。
// 输出：单通道 AO 强度（0 = 全遮蔽，1 = 无遮蔽）。

#include ./common.glsl

uniform sampler2D uNormalTexture;
uniform sampler2D uDepthTexture;
uniform mat4 uProjectionInverse;
uniform mat4 uProjection;
uniform vec3 uKernel[12];
uniform float uRadius;
uniform float uBias;
uniform float uIntensity;
uniform float uNear;
uniform float uFar;
uniform vec2 uResolution;

varying vec2 vUv;

float akRandom(vec2 co) {
  return fract(sin(dot(co, vec2(12.9898, 78.233))) * 43758.5453);
}

void main() {
  float depth = textureLod(uDepthTexture, vUv, 0.0).r;
  if (depth >= 0.999999) {
    gl_FragColor = vec4(1.0);
    return;
  }

  // 重建视空间位置
  vec4 clip = vec4(vUv * 2.0 - 1.0, depth * 2.0 - 1.0, 1.0);
  vec4 viewPos = uProjectionInverse * clip;
  viewPos /= viewPos.w;

  vec3 normal = normalize(textureLod(uNormalTexture, vUv, 0.0).xyz * 2.0 - 1.0);

  // 随机旋转，避免 banding
  float angle = akRandom(vUv * uResolution) * 6.2831853;
  vec3 randomVec = vec3(cos(angle), sin(angle), 0.0);
  vec3 tangent = normalize(randomVec - normal * dot(randomVec, normal));
  vec3 bitangent = cross(normal, tangent);
  mat3 tbn = mat3(tangent, bitangent, normal);

  float occlusion = 0.0;
  int sampleCount = 12;

  for (int i = 0; i < 12; i++) {
    if (i >= sampleCount) break;
    vec3 samplePos = viewPos.xyz + tbn * uKernel[i] * uRadius;

    vec4 offset = uProjection * vec4(samplePos, 1.0);
    offset.xyz /= offset.w;
    vec2 sampleUv = offset.xy * 0.5 + 0.5;

    if (sampleUv.x < 0.0 || sampleUv.x > 1.0 || sampleUv.y < 0.0 || sampleUv.y > 1.0) continue;

    float sampleDepth = textureLod(uDepthTexture, sampleUv, 0.0).r;
    if (sampleDepth >= 0.999999) continue;

    vec4 sampleClip = vec4(sampleUv * 2.0 - 1.0, sampleDepth * 2.0 - 1.0, 1.0);
    vec4 sampleView = uProjectionInverse * sampleClip;
    sampleView /= sampleView.w;

    float sampleZ = sampleView.z;
    float rangeCheck = smoothstep(0.0, 1.0, uRadius / max(abs(viewPos.z - sampleZ), 1e-4));

    if (sampleZ >= samplePos.z + uBias) {
      occlusion += rangeCheck;
    }
  }

  float ao = 1.0 - (occlusion / float(sampleCount)) * uIntensity;
  gl_FragColor = vec4(clamp(ao, 0.0, 1.0), 0.0, 0.0, 1.0);
}
