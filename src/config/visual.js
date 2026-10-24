/**
 * AETHERKEEP —— 3D 数值与美术常数的唯一真源（规划案 §3.1 / §5.3 / §5.5 / §5.6）
 *
 * 规则：场景里不允许出现裸数字与裸颜色。改这里就等于改设计。
 * UI 的令牌在 src/ui/tokens.css，两者分工明确、互不越界。
 */

/** 全局确定性种子 —— 禁止 Math.random() */
export const SEED = 42017;

/** 世界尺度（米，Y 向上） */
export const WORLD = Object.freeze({
  islandRadiusMin: 72,
  islandRadiusMax: 96,
  islandTopY: 0,
  islandTopRelief: 9,
  islandTipY: -85,
  islandGridSegments: 128,
  cloudBandBottom: -76,
  cloudBandTop: -6,
  courtyardY: 12,
  /** 浮岛碰撞球半径：镜头不得穿进岛体 */
  islandCollisionRadius: 65,
  /** 摄像机 target 钳制范围 */
  targetClampX: 65,
  targetClampYMin: -45,
  targetClampYMax: 75,
});

/** 城堡建筑群比例（§5.3 短板 1/2） */
export const ARCHITECTURE = Object.freeze({
  mainTowerHeight: 108,
  bellTowerHeight: 78,
  sideTowerHeights: Object.freeze([40, 48, 56]),
  /** 角塔与附塔的高度序列，保证剪影参差 */
  towerHeights: Object.freeze([40, 48, 56, 62, 70]),
  recessedWindowCount: 24,
  recessedWindowDepthMin: 0.5,
  recessedWindowDepthMax: 1.2,
  buttressCount: 12,
  /** 墙材标准厚度 */
  wallThicknessMin: 0.25,
  wallThicknessMax: 0.4,
  /** 水平线脚间隔 */
  corniceSpacingMin: 4,
  corniceSpacingMax: 8,
  /** 建筑群模块数（主塔/主殿/钟塔/2 侧翼/4 附塔/连接廊/2 道城垣） */
  moduleCount: 12,
  /** 墙洞之间允许的「中间空隙」比例 */
  gapRatioMin: 0.2,
  gapRatioMax: 0.25,
});

/** 浮岛地貌 */
export const ISLAND = Object.freeze({
  erosionRidgeCountMin: 10,
  erosionRidgeCountMax: 18,
  cliffShoulderCount: 4,
  terraceCount: 3,
  poolWidth: 18,
  poolLength: 11,
  poolWaveAmplitude: 0.03,
});

/** 植被 */
export const VEGETATION = Object.freeze({
  coniferCount: 48,
  broadleafCount: 62,
  gnarledCount: 8,
  lodDistances: Object.freeze([70, 170, 420]),
  /** LOD 切换滞回，避免频繁闪变 */
  lodHysteresis: 10,
  leafColors: Object.freeze(['#33584e', '#567c66', '#9a9a65']),
});

/** 场景固定美术色（规划案 §3.1） */
export const PALETTE = Object.freeze({
  skyZenith: '#174a71',
  skyHorizon: '#f4b68a',
  cloudWarm: '#ffd9a2',
  cloudCool: '#37526d',
  roof: '#2c495c',
  stone: '#b8a994',
  forest: '#40645c',
  shadow: '#17354a',
  gold: '#f8d799',
  banner: '#a3202a',
  water: '#16323c',
});

/** 四种时刻的光照预设（曝光取自 §5.5） */
export const TIME_PRESETS = Object.freeze({
  dawn: Object.freeze({
    label: '晨曦',
    exposure: 0.92,
    sunAzimuth: 1.92,
    sunElevation: 0.20,
    sunColor: '#ffd6a3',
    sunIntensity: 1.95,
    skyFill: '#5d86a8',
    skyFillIntensity: 0.95,
    horizon: '#f4b68a',
    zenith: '#174a71',
    cloudLit: '#f4ce9f',
    cloudShade: '#456f91',
    windowEmissive: 0.9,
    windowColor: '#ffca7a',
    fogDensity: 0.0016,
    fogColor: '#9fb6c6',
    starIntensity: 0.0,
    shaftIntensity: 0.13,
  }),
  noon: Object.freeze({
    label: '正午',
    exposure: 0.78,
    sunAzimuth: 0.85,
    sunElevation: 1.02,
    sunColor: '#fff5e2',
    sunIntensity: 2.25,
    skyFill: '#8fb4d6',
    skyFillIntensity: 1.05,
    horizon: '#cfe0ea',
    zenith: '#2f6ea8',
    cloudLit: '#fbf3e6',
    cloudShade: '#7d9cb6',
    windowEmissive: 0.12,
    windowColor: '#ffe2b0',
    fogDensity: 0.001,
    fogColor: '#c6d8e4',
    starIntensity: 0.0,
    shaftIntensity: 0.07,
  }),
  sunset: Object.freeze({
    label: '日落',
    exposure: 1.0,
    sunAzimuth: 3.52,
    sunElevation: 0.16,
    sunColor: '#ff9d5c',
    sunIntensity: 1.95,
    skyFill: '#7a6f92',
    skyFillIntensity: 0.92,
    horizon: '#ff9a63',
    zenith: '#243a63',
    cloudLit: '#ffbf86',
    cloudShade: '#4a5b84',
    windowEmissive: 1.15,
    windowColor: '#ffb867',
    fogDensity: 0.0019,
    fogColor: '#b08a86',
    starIntensity: 0.08,
    shaftIntensity: 0.16,
  }),
  night: Object.freeze({
    label: '星夜',
    exposure: 1.5,
    sunAzimuth: 4.9,
    sunElevation: -0.10,
    sunColor: '#8ea9d8',
    sunIntensity: 0.55,
    skyFill: '#2a3f63',
    skyFillIntensity: 0.5,
    horizon: '#2b3a5c',
    zenith: '#080f1e',
    cloudLit: '#9fb0d4',
    cloudShade: '#1b2740',
    windowEmissive: 1.6,
    windowColor: '#ffb14d',
    fogDensity: 0.0022,
    fogColor: '#2b3a55',
    starIntensity: 1.0,
    shaftIntensity: 0.0,
  }),
});

/** 天气预设 */
export const WEATHER_PRESETS = Object.freeze({
  clear: Object.freeze({ label: '晴朗', coverage: 0.62, rain: 0, mist: 0, windSpeed: 0.35 }),
  mist: Object.freeze({ label: '薄雾', coverage: 0.78, rain: 0, mist: 1, windSpeed: 0.2 }),
  storm: Object.freeze({ label: '风雨', coverage: 0.95, rain: 1, mist: 0.35, windSpeed: 1.5 }),
});

/** 相机与镜头预设（§4.4） */
export const CAMERA = Object.freeze({
  fov: 36,
  near: 0.5,
  far: 1600,
  controls: Object.freeze({
    minDistance: 68,
    maxDistance: 620,
    minPolarAngle: 0.18,
    maxPolarAngle: 2.35,
    dampingFactor: 0.055,
  }),
  views: Object.freeze({
    hero: Object.freeze({
      position: Object.freeze([192, 102, 258]),
      target: Object.freeze([0, 24, 0]),
      transitionMs: 900,
    }),
    side: Object.freeze({
      position: Object.freeze([-258, 128, 152]),
      target: Object.freeze([0, 20, 0]),
      transitionMs: 900,
    }),
    detail: Object.freeze({
      position: Object.freeze([68, 48, 86]),
      target: Object.freeze([2, 31, -8]),
      transitionMs: 900,
    }),
    rock: Object.freeze({
      position: Object.freeze([126, -34, 145]),
      target: Object.freeze([0, -36, 0]),
      transitionMs: 900,
    }),
  }),
  /** 窄屏（长宽比 < 0.7）时的距离补偿 */
  narrowAspectThreshold: 0.7,
  narrowAspectDistanceFactor: 1.6,
  narrowAspectTargetY: 27,
  maxFitCorrection: 1.35,
  minFitCorrection: 0.45,
  /** 主体在画面中的目标高度（NDC 跨度）：1.30 ≈ 画面高度的 65% */
  subjectSpanTarget: 1.3,
  /** 主体投影边界到画面中心的最大允许距离（NDC 半跨度），超过就会被裁切 */
  subjectSafeHalfY: 0.86,
  subjectSafeHalfX: 0.88,
});

/** 渲染管线参数（§5.5） */
export const PIPELINE = Object.freeze({
  shadowMapSize: 2048,
  shadowBias: -0.00025,
  shadowNormalBias: 0.025,
  aoScale: 0.5,
  aoSamples: 14,
  aoSamplesLow: 8,
  aoTargetMs: 2,
  cloudScale: 0.5,
  cloudSteps: 24,
  cloudLightSteps: 4,
  cloudStepsLow: 12,
  cloudLightStepsLow: 2,
  cloudStepsUltra: 32,
  cloudLightStepsUltra: 6,
  cloudTargetMs: 3.5,
  /** HG 相位函数不对称因子 */
  henyeyGreenstein: 0.55,
  /** 云的密度剖面参数 */
  cloudDensity: Object.freeze({
    frequency: 0.018,
    erosionFrequency: 0.11,
    erosionStrength: 0.22,
    densityThreshold: 0.23,
    shapeScale: 0.02,
  }),
  /** 云团布局：至少 6 团大云 + 2 条纵深谷槽 */
  cloudPuffCount: 7,
  cloudTroughCount: 2,
  bloom: Object.freeze({ threshold: 1.05, strength: 0.24, radius: 0.32 }),
  bloomDegradedStrength: 0.15,
  grade: Object.freeze({
    contrast: 1.06,
    saturation: 1.08,
    grain: 0.012,
    vignette: 0.1,
  }),
  dofScale: 0.25,
  dofMaxCocPx: 3,
  dofTaps: 8,
  shaftSamples: 12,
  shaftIntensity: 0.13,
  /** 历史重投影失效阈值：深度差超过 2% 即拒绝历史 */
  reprojectionDepthTolerance: 0.02,
  /** 法线强度 */
  normalStrength: 0.55,
  /** 世界单位下的纹理重复间距 */
  textureWorldScale: 4,
  /** 地形与建筑的纹理随机旋转 90° 的组数 */
  textureRotationGroups: 4,
});

/** 画质档位（§5.6） */
export const TIERS = Object.freeze({
  low: Object.freeze({
    label: '低',
    scale: 0.72,
    scaleMin: 0.6,
    dprCap: 1.0,
    cloudSteps: 12,
    cloudLightSteps: 2,
    cloudScale: 0.25,
    shadowMapSize: 1024,
    aoSamples: 8,
    aoCheap: true,
    dof: false,
    vegetationLodBias: 1.4,
  }),
  balanced: Object.freeze({
    label: '均衡',
    scale: 0.9,
    scaleMin: 0.7,
    dprCap: 1.0,
    cloudSteps: 24,
    cloudLightSteps: 4,
    cloudScale: 0.5,
    shadowMapSize: 2048,
    aoSamples: 14,
    aoCheap: false,
    dof: 'auto',
    vegetationLodBias: 1.0,
  }),
  ultra: Object.freeze({
    label: '极致',
    scale: 1.0,
    scaleMin: 0.75,
    dprCap: 1.5,
    cloudSteps: 32,
    cloudLightSteps: 6,
    cloudScale: 0.5,
    shadowMapSize: 2048,
    aoSamples: 16,
    aoCheap: false,
    dof: 'weak',
    vegetationLodBias: 0.8,
  }),
});

/** 连续帧调速器（§5.6） */
export const GOVERNOR = Object.freeze({
  windowFrames: 120,
  warmupFrames: 180,
  baseFrameMs: 16.67,
  p90OverBudgetMs: 18.5,
  p90UnderBudgetMs: 14,
  overBudgetWindows: 3,
  underBudgetWindows: 6,
  scaleStepDown: 0.08,
  scaleStepUp: 0.04,
  cooldownDownMs: 3000,
  cooldownUpMs: 5000,
  overloadNoticeMs: 5000,
});

/** 开场三幕时间轴（§4.2） */
export const INTRO = Object.freeze({
  totalMs: 6000,
  acts: Object.freeze([
    Object.freeze({ at: 0, label: '云隙打开' }),
    Object.freeze({ at: 1400, label: '远处塔楼显露' }),
    Object.freeze({ at: 3100, label: '镜头轻推主塔' }),
    Object.freeze({ at: 4800, label: '回到英雄机位' }),
    Object.freeze({ at: 6000, label: '自由探索' }),
  ]),
  /** 用户操作打断 intro 的延迟上限 */
  interruptDelayMs: 100,
});

/** 动画与时间步 */
export const TIMING = Object.freeze({
  dtMin: 0,
  dtMax: 0.05,
  sceneTransitionMs: 600,
  uiFeedbackMs: 100,
  uiLightActionMs: 300,
  dynamicLoadNoticeMs: 1000,
  dynamicLoadCancelMs: 10000,
  /** Reduced motion 下的云时间速率 */
  reducedMotionCloudRate: 0.1,
});

/** 调试接口只在 ?debug=1 时挂载 */
export const DEBUG_QUERY_KEY = 'debug';

/** 存储键与 schema */
export const STORAGE_KEY = 'aetherkeep:prefs:v1';
export const STORAGE_SCHEMA_VERSION = 1;

/** 摄影模式文件名格式 */
export const PHOTO_FILENAME = 'aetherkeep-{time}-{weather}-{timestamp}.png';

/** 场景材质的基色（贴图缺失时的回退色）—— 3D 色值统一在这里，不散落在组件里 */
export const MATERIAL_COLORS = Object.freeze({
  'A01-castle-ashlar': '#b8a994',
  'A02-sandstone-voussoir': '#c2b39c',
  'A03-basalt-foundation': '#33414c',
  'A04-slate-roof': '#2c495c',
  'A05-stratified-cliff': '#9d8c72',
  'A06-flagstone-path': '#8e8a7c',
  'A07-carved-oak': '#4a3524',
  'A08-aged-bronze': '#7a7358',
  ground: '#7f8a63',
});

/** 纹理资产清单（8 类 PBR 三联 + 海报），由 scripts/build-assets.mjs 产出 */
export const MATERIAL_FILES = Object.freeze({
  'A01-castle-ashlar': { albedo: 'A01-castle-ashlar-albedo.webp', normal: 'A01-castle-ashlar-normal.webp', roughness: 'A01-castle-ashlar-roughness.webp', roughnessRange: [0.66, 0.9] },
  'A02-sandstone-voussoir': { albedo: 'A02-sandstone-voussoir-albedo.webp', normal: 'A02-sandstone-voussoir-normal.webp', roughness: 'A02-sandstone-voussoir-roughness.webp', roughnessRange: [0.66, 0.9] },
  'A03-basalt-foundation': { albedo: 'A03-basalt-foundation-albedo.webp', normal: 'A03-basalt-foundation-normal.webp', roughness: 'A03-basalt-foundation-roughness.webp', roughnessRange: [0.66, 0.9] },
  'A04-slate-roof': { albedo: 'A04-slate-roof-albedo.webp', normal: 'A04-slate-roof-normal.webp', roughness: 'A04-slate-roof-roughness.webp', roughnessRange: [0.56, 0.75] },
  'A05-stratified-cliff': { albedo: 'A05-stratified-cliff-albedo.webp', normal: 'A05-stratified-cliff-normal.webp', roughness: 'A05-stratified-cliff-roughness.webp', roughnessRange: [0.66, 0.9] },
  'A06-flagstone-path': { albedo: 'A06-flagstone-path-albedo.webp', normal: 'A06-flagstone-path-normal.webp', roughness: 'A06-flagstone-path-roughness.webp', roughnessRange: [0.66, 0.9] },
  'A07-carved-oak': { albedo: 'A07-carved-oak-albedo.webp', normal: 'A07-carved-oak-normal.webp', roughness: 'A07-carved-oak-roughness.webp', roughnessRange: [0.56, 0.75] },
  'A08-aged-bronze': { albedo: 'A08-aged-bronze-albedo.webp', normal: 'A08-aged-bronze-normal.webp', roughness: 'A08-aged-bronze-roughness.webp', roughnessRange: [0.32, 0.55] },
});
