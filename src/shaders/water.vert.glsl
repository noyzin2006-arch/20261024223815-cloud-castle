// 中庭水镜：深青水面 + 两层滚动波纹 + 天空反射 + 太阳高光。
varying vec3 vWorldPosition;
varying vec2 vWaterUv;

void main() {
  vec4 worldPosition = modelMatrix * vec4(position, 1.0);
  vWorldPosition = worldPosition.xyz;
  vWaterUv = uv;
  gl_Position = projectionMatrix * viewMatrix * worldPosition;
}
