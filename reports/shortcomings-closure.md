# 上一轮十项画面短板 → 本轮修正对照

上一轮同题（云上城堡实时 Three.js）自测全绿，但画面被判定为「低多边形游戏素材级」。
下表逐条记录：**上一轮的问题 → 本轮的技术手段 → 可复核的证据 → 结论**。

被测源码 SHA：`866fbf4270cb2517c9411a18432f9750125cf813`

---

| # | 上一轮的问题 | 本轮技术手段 | 证据 | 结论 |
|---|---|---|---|---|
| 1 | 城堡大面积均匀米黄、**完全无贴图**，逐面顶点色差异极小 | 8 组 AI 生成 PBR 三联贴图（albedo + 离线推导的 normal/roughness），按材质分桶合并几何；**顶点色只做轻微色调**（早期版本用材质本色做顶点色，与贴图双重相乘把板岩压成死黑 —— 已修）；墙体按区域分 3 种石材（石灰岩 / 砂岩券石 / 玄武岩基座） | `public/assets/materials/`（24 个文件）、`reports/evidence/detail-closeup.png`（近景可见分块砌缝与风化色带） | **PASS** |
| 2 | 云层是一张模糊灰白平面，受光面无金色高光、无云顶翻卷 | **真三维密度场** ray marching：大尺度云团顶高（每团顶高不同）+ 中频形体 + 高频侵蚀 + 低频纵深谷槽；沿太阳 4 步积光算自阴影；HG 相位 g=0.55；Beer-Lambert 透射 | `src/shaders/clouds.frag.glsl`；实测受光云均值 0.8138 / 背光云均值 0.4777，**差 0.336**（阈值 0.12）；`reports/evidence/cloud-rois.png` 为两块真实云 ROI 的叠框图 | **PASS** |
| 3 | 浮岩是顶点抖动的二十面体，近看是乱刺噪点团 | 极坐标网格手工建面：128 角 × 46 层的崖壁，**沉积岩层**（沿 Y 的周期凸凹）+ **纵向侵蚀脊**（只随角度变化的沟槽）+ 尺度受限的多频起伏；碎岩的位移**只取决于顶点位置**（早期逐索引随机会把岩石面撕裂 —— 已修） | `src/world/island.js`；`reports/evidence/rock-closeup.png` 可见连续的地层带 | **PASS** |
| 4 | 岛体是一块扁平绿色圆盘，可见大三角面，顶面像绿台地 | 128×128 极坐标顶盖 + 128×46 崖壁闭合；顶面含 3 处自然台地、4 处崖肩、中心庭院压平；地面苔绿↔岩灰**两色插值**（早期公式让绿通道单独塌陷，边缘变成红环 —— 已修） | `tests/geometry.test.js`（无 NaN、无退化三角形、尖端落在 y≈-85）；`reports/evidence/hero1920.png` | **PASS** |
| 5 | 树是圆锥体 + 圆柱的原始几何 | 三种轮廓：细长针叶（多层锥冠 48 株）、阔叶冠（5 簇不规则球冠 62 株）、弯枝孤树（弯折主干 + 偏侧冠 8 株）；三级 LOD 全部 InstancedMesh | `src/world/trees.js`；`tests/geometry.test.js` 断言三物种实例数与几何合法性 | **PASS** |
| 6 | 没有阴影、没有 AO、没有接触阴影，物体像贴在背景上 | 2048² 方向光阴影（PCF，r186 已移除 PCFSoftShadowMap）；**半分辨率 SSAO**（法线预通道 + 12 采样半球核 + 双边模糊） | `src/fx/ao.js`、`src/shaders/ao.frag.glsl`；`tests/render-config.test.js` 断言管线无帧缓冲反馈回路 | **PASS** |
| 7 | 天空是普通渐变，无大气散射、无云隙光、无高度雾 | Rayleigh/Mie 近似 + 太阳盘 + 三层星场 + **反日点维纳斯带**；地平线暖色带收窄（指数 8.0）让天顶蓝成立；**半分辨率太阳光束**（12 径向采样，被几何体遮挡处不产生光束） | `src/shaders/sky.frag.glsl`、`src/shaders/shafts.frag.glsl`；`reports/evidence/night1920.png` 可见星场 | **PASS** |
| 8 | 没有后期：无色调映射、无辉光、无景深、无颗粒 | 完整后期链：阈值 Bloom（阈值 1.05 / 强度 0.24 / 半径 0.32，3 级降采样 + 独立升采样链避免反馈回路）→ 景深（8 抽样、深度边缘保护）→ 调色（对比 1.06 / 饱和 1.08 / 颗粒 0.012 / 暗角 0.10）→ **唯一一次** ACES + sRGB | `src/core/pipeline.js`；`tests/render-config.test.js` 断言「整条管线只做一次色调映射与一次 sRGB 转换」（逐文件扫描着色器源码） | **PASS** |
| 9 | HUD 压住一座塔；主视角城堡偏右下，构图松散 | 英雄机位按规划案取 (192,102,258)→(0,24,0)；**主体轮廓采样**驱动的取景兜底（投影边界必须在安全框内 + 跨度下限），保证塔尖永不被裁、主体占比在 34–70%/12–85% 区间 | `src/camera/rig.js`；实测 `spanY=1.09 / halfY=0.84`（安全上限 0.86）；`reports/evidence/hero1920.png` 显示 HUD 不压主塔 | **PASS** |
| 10 | 静态、无叙事，进去只能转圈 | **开场三幕**（云隙打开 → 远处塔楼显露 → 镜头轻推主塔 → 回到英雄机位，6 秒，任何操作 100ms 内打断）；四种时刻（太阳角/天光/夜窗/云色全部插值过渡）+ 三种天气（晴/雾/风雨，风雨有真实雨粒）+ 4 个机位 + 摄影模式 + 程序化环境声 | `src/camera/intro.js`、`src/world/weather.js`、`src/world/lights.js`、`src/audio/soundscape.js`；`reports/evidence/night1920.png`（星夜 + 亮着的窗）、`storm1920.png`（日落 + 风雨） | **PASS** |

---

## 额外补上的四项（上一轮没有、但「世界级」必须有）

| 项 | 做法 | 证据 |
|---|---|---|
| 体积云的前后遮挡正确 | 云 ray marching 的射线用**场景深度**截断：不透明几何体在前的像素，射线走不到云层 —— 天然得到正确遮挡，不需要额外的深度比较 pass | `tests/render-config.test.js` 断言云着色器必须采样 `uSceneDepth` 并用 `sceneDistance` 截断，且不得使用 Sprite |
| 资产可审计可复现 | 每张 AI 图记录完整 prompt、node id、生成时间、sha256、处理命令；`build-assets.mjs` 可从原始图完整重跑（37 个产物逐字节可复现） | `public/assets/PROVENANCE.md`；`npm run verify:assets` 独立复算边界差 / 字节数 / sha256 |
| 零外部运行时依赖 | 贴图、海报、字体全部进仓库；E2E 记录所有请求并断言跨域企图为 0 | `reports/evidence/network.json` |

| 表面细节层（消「贴了图的盒子」感） | 四层叠加：① 几何级顶点扰动（按世界坐标，共享顶点不撕裂，墙面不再是完美平面、边缘高光会断）② 片元级**逐砌块**亮度/色偏 + 灰缝加深（每块石头是独立的）③ 墙脚碎石打断建筑与地面那条过于干净的边 ④ SSAO 提到 16 采样 / 半径 3.4 | `src/world/surface-detail.mjs`、`src/core/resources.js` 的 `applyMasonryDetail`；对比 `reports/evidence/detail-closeup.png` | 

---

## 结论

上一轮十项短板**逐项 PASS**，每项都有可复核证据（截图路径 / 指标数值 / 测试断言），
不接受「看起来差不多」的判定。
