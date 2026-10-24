# AETHERKEEP 云际圣堡

> 漂浮于云海之上的实时 Three.js 场景 —— WebGL2 / Three.js r186 / 零外部运行时依赖

一座非对称的混合哥特式山巅城堡，孤悬在有体积、有日照、有纵深的云海之上。
叙事时刻是 **「风暴退去的第七分钟，第一束晨光穿过古堡钟楼」**（默认 06:17 晨曦）。

**在线体验**：<https://noyzin2006-arch.github.io/20261024223815-cloud-castle/>

---

## 30 秒上手

```sh
npm ci
npm run dev          # http://127.0.0.1:5173
```

生产构建与预览：

```sh
npm run build
npm run preview      # http://127.0.0.1:4173
```

## 操作

| 输入 | 动作 |
|---|---|
| 左键拖动 | 环绕（orbit） |
| 右键 / Shift + 左键拖动 | 平移（pan） |
| 滚轮 / 双指捏合 | 推拉（dolly） |
| 方向键 | 平移（仅当画布获得焦点时，不劫持控件焦点） |
| `R` | 复位视角（回英雄机位） |
| `H` | 进入 / 退出摄影模式（隐藏全部界面） |
| `S` | 摄影模式下保存 PNG |
| `M` | 静音 / 开启环境声 |
| `Esc` | 关闭浮层或退出摄影模式 |

底部操作台可切换**时刻**（晨曦 / 正午 / 日落 / 星夜）、**天气**（晴朗 / 薄雾 / 风雨）、
**画质**（低 / 均衡 / 极致）与**镜头**（远景 / 拱廊 / 岩基 / 侧景）。

## 深链

```
?view=hero|side|detail|rock
&time=dawn|noon|sunset|night
&weather=clear|mist|storm
&tier=low|balanced|ultra
&intro=0|1
&debug=1
```

非法参数会被忽略并回退默认值，同时在控制台留下警告 —— **绝不白屏**。

## 技术要点

- **WebGL2 + Three.js r186**，自建渲染管线（`src/core/pipeline.js`）：
  太阳阴影 → 天空 → 不透明 + 深度 → 半分辨率 SSAO → **体积云 ray marching** → 深度感知云合成
  → 云隙光 → Bloom → 景深 → 调色 → **唯一一次 ACES + sRGB**。
- **体积云是真三维密度场**：大尺度云团顶高 + 中频形体 + 高频侵蚀 + 纵深谷槽，
  沿太阳 4 步积光算自阴影，射线用**场景深度截断**实现正确的前后遮挡 —— 不用 billboard 冒充。
- **零外部运行时依赖**：全部贴图、海报、字体都在仓库里，页面加载期间外部网络请求数为 **0**。
- **AI 生成资产**：8 组 PBR 三联贴图（albedo / normal / roughness）+ 16:9 海报，
  全部离线构建、可复现，出处记录见 `public/assets/PROVENANCE.md`。
- **连续帧调速器**：120 帧滑窗统计 p50/p90，超预算先降渲染倍率再按序降级能力，
  余量充足再缓慢升回；**手动锁档时绝不偷偷换档**。
- **确定性**：固定种子 42017，场景里没有 `Math.random()`。

## 目录

```
index.html              页面骨架与语义结构（C01–C10）
src/
  main.js               启动、渲染循环、状态编排
  config/visual.js      3D 数值与美术常数的唯一真源
  core/                 状态仓库 / 渲染器 / 管线 / 调速器 / 资源 / 诊断
  world/                天空 / 光照 / 浮岛 / 城堡 / 植被 / 水 / 天气
  camera/               相机装置与开场三幕
  fx/                   AO / 云隙光 / 景深 / 调色
  shaders/              GLSL（着色器索引在这里统一装配）
  audio/soundscape.js   Web Audio 实时合成的环境声
  ui/                   令牌 / 样式 / 图标 / 控制器
public/assets/          贴图 / 海报 / 本地字体 / PROVENANCE
scripts/                资产构建与校验、图像指标、对比度、生产 E2E
tools/                  零依赖 PNG 解码与画面指标内核（单测用）
tests/                  node:test 单测 + Playwright 端到端
reports/                执行报告、质量矩阵、原始证据
handoff/                交接指纹、简报、网页规划案
```

## 验证

```sh
npm ci
npm run build
npm test              # 72 条：状态 / 几何 / 调速器 / 渲染配置 / 资产 / 浏览器端到端
npm run test:design   # 22 组 WCAG 对比度
npm run test:e2e      # 生产构建 + 真实 Chromium：性能、截图、像素指标、交互走查
npm run verify:assets # 资产完整性、sha256、接缝边界差、体积预算
```

验收结论与全部原始证据见 [`reports/latest.md`](reports/latest.md)。

## 质感经验

本项目把"实时渲染怎么摆脱塑料感"完整沉淀在 **[`docs/RENDER-QUALITY-NOTES.md`](docs/RENDER-QUALITY-NOTES.md)**：
四层叠加模型、塑料感的 5 个可检查来源、关键手法与代价、实际踩过的 8 个坑、
可量化的画面指标，以及"先修几何与法线、再修贴图、最后才动后期"的迭代顺序。

## 资产与许可

- 贴图与海报：由 AI 图像工具生成，**仅在本轮构建期使用**，运行时零外部请求。
  完整 prompt、node id、生成时间、sha256、处理命令见 `public/assets/PROVENANCE.md`。
- 字体：Noto Sans SC / Noto Serif SC / Inter，均为 **SIL Open Font License 1.1**，
  已本地子集化（1020 码位，548 KB），许可证全文见 `public/assets/fonts/OFL*.txt`。
- 代码：MIT。

## 本轮范围外

后端 / 账号 / 支付 / 多人、VR 与 WebXR、原生 App、真实天气 API、音视频转码服务、
自由行走 RPG、无限拓展地图。
