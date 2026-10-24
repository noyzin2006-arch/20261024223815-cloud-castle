kind: plan
task: CLOUDCASTLE-02
round: 1
nonce: b6bf06def0523402
brief_sha: e9ac3ed5c4abf98cbf6c2aa9a363fd1f4df819c9

# CLOUDCASTLE-02｜AETHERKEEP 云际圣堡——首席设计与执行规划案

**规划日期：2026-10-24。执行对象：唯一的执行 Agent。结论：按本文件一次性从零构建、实测、发布，不返问。**

**证据边界：**本仓库仅阅读 `handoff/briefs/CLOUDCASTLE-02.md`（内容 SHA `e9ac3ed5c4abf98cbf6c2aa9a363fd1f4df819c9`）、`handoff/spec/plan-spec.md`、`handoff/spec/design-quality-bar.md`，未查阅仓库其他内容。下面所有 `src/`、`tests/` 等路径都是**要求执行方新建的目标路径**，绝非声称它们当前存在。本规划是设计目标，不是执行结果；任何性能与视觉 PASS 都必须由真实本机报告产生。

## 1. 需求、范围与非目标

### 1.1 用户需求和固定艺术方向
原话：“做一个完整的实时 Three.js 场景，城堡漂浮在云层之上……咱们这次的目标就是做个世界最精致的、最好的、效果最炫的云上城堡。”

交付一个真正可交互、连续渲染、质量达到作品集封面级的 **WebGL2 Three.js 空中城堡**。不是教学 demo，也不是靠单张 AI 概念图遮住 3D 模型。作品名 **AETHERKEEP / 云际圣堡**。叙事主题 **“风暴退去的第七分钟，第一束晨光穿过古堡钟楼”**。默认时刻 06:17；暖杏金受光、冷蓝青背光、浅灰石墙、深蓝板岩屋顶、暗绿植被，禁止平均米黄、灰白云毯和无纹理低多边形。

主体一座非对称、可走近端详的混合哥特式山巅城堡：高低塔楼群、两级台地、拱廊、外城墙、深凹窗洞、扶壁、屋檐、风中旗、岩基飞瀑与水镜。浮岛地貌有沉积岩层、侵蚀裂隙、崖面悬根、曲折坡地，底部消隐入厚重、有日照形体与空间视差的体积云海。天气/时刻变化与微弱程序声音承担故事推进。

### 1.2 范围
本轮**必须做**：静态 Web 站、实时城堡/浮岛/水/植被/天空/云/灯光/阴影/AO/后期、材质贴图本地化、完整 UI、加载/无内容/错误/成功四态、键鼠触屏控制、镜头导览、时刻/天气/画质切换、摄影 PNG、声音开关、reduced motion、画质自调、真实生产浏览器端测量与截图、可公开访问的静态站网址、原始测试报告与可复核证据。

**不做**：后端、用户系统、支付、多人、原生 App、VR/WebXR、真实天气 API、媒体转码服务、任何线上运行时第三方资产/API/CDN、把以前同题仓库克隆过来；不做自由行走 RPG，也不做无限拓展地图。

### 1.3 具体可测验收（全为硬门槛）
| 编号 | 合格要求 | 唯一证据 |
|---|---|---|
| AC01 | `npm ci && npm run build` 和 `npm test` exit code 均为 0 | 执行脚本原样 stdout/stderr/exit_code；通过测试条数**从真实 npm test stdout 解析**，不得预填数字 |
| AC02 | 真实 Chromium 对 `vite preview` 生产构建：console error 0、pageerror 0、**外部请求 0**；保存 1920×1080 英雄图、1920×1080 侧景、375×812 手机截图 | Playwright 网络拦截日志+截图+JSON |
| AC03 | 1920×1080 暖机后采集连续 **60 个不同 requestAnimationFrame**；中位 FPS≥55；整帧 draw calls≤120；三角形≤1,500,000 | 每帧 frameId/time delta/render.info，原始 JSON；说明 GPU/软件渲染器与最终画质档 |
| AC04 | 主图 256 桶灰度直方图有值桶≥200；P99−P1 视觉亮度≥0.55；HSV 饱和度中位≥0.12；**同一图像**两块 64×64 云区域亮度差≥0.12 | 实际 PNG 像素脚本、明确量纲与 ROI 叠框 PNG、数值 JSON |
| AC05 | orbit/pan/dolly、R复位、时刻/天气/画质/拍照 UI、隐藏 UI、缩屏、reduced-motion 可用，交互<100ms可见反馈 | Playwright 操作断言和人工键盘/触屏走查 |
| AC06 | design-quality-bar A–E 逐项通过，G 条禁项为0，加载/空/错/成功四态、375px/1440px/200%文字都可访问 | `reports/quality-matrix.md` 每项证据/结论 |
| AC07 | 10项上一轮画面短板全部有可复核修复证据；公网 URL 未登录可访问 | 新旧问题映射表、局部近景截图、匿名 HTTP/浏览器检查 |

**优先规则：**AC01–AC06 任一失败不准说“已交付”。若硬件本身 SwiftShader 性能极慢，不得删性能测试、降低阈值或以其他机器冒充本机；如实记录 FAILURE 并按第10节最小损失方案继续优化。截图指标不能靠往截图事后修色/改数据作弊。

### 1.4 假设/依赖/浏览器
简报确认：macOS 26.4.1 arm64、Node v26、Python 3.9.6、Three **0.186.1**、Vite **8.3.5**、Playwright **1.64.1**、Playwright Chromium、AI 图像工具。主渲染采用 WebGL2，Chrome 桌面为性能验收基线；Safari/iPhone 作为兼容检查，但不能以模拟手机等价于实机 iPhone。WebGPU 只可作额外实验且必须保持 WebGL2 全功能路径。字体、图片、shader、模型全在仓库 `public/assets/` 或运行时本地程序生成。依赖版本从锁文件固定。

## 2. 在线调研结论与最高水准参照

**确已在线查阅，日期 2026-10-24。** 包括下列标杆的公开 README/作者说明和官方文档；不能由其宣传“60fps”推论本项目设备实测必然 60fps。以下每项明确“学什么”和“不抄什么”。若实时站因网络环境不可打开，则以作者的源代码/说明为证而非声称亲测 live FPS。

| 作品/类型；检索入口 | 证实的优势与学习结论 | 本项目对应落实；不照搬之处 |
|---|---|---|
| **Halcyon**，WebGL2 实时环礁；https://github.com/billpwchan/halcyon ， https://halcyon.billpwchan.art | README 直接披露顺序：**sky+半分辨率重投影积云→太阳阴影→HDR opaque→半分辨率 GTAO→水→FX→bloom/shaft/ACES**；LOD、动态渲染比例、实时声音和固定相机深链。 | 参考“多 pass 输入输出顺序”“半分辨率体云+历史失效检查”“帧时调速器”“可回放画面”；不复制其约 560MB 资产及海岛玩法，本项目要实现轻量离线独立部署。 |
| **Above the Clouds / Adrian Red**，建筑视觉专题；https://www.adrianred.com/portfolio/abovetheclouds 、 https://www.webgpu.com/showcase/burj-khalifa-gaussian-splatting/ | 作者说明建筑是优化 GLB、周围城市是 Gaussian Splats、云是 ray-marched 体积云；稀有迪拜雾季建立明确情绪钩子；滚动场景与真实建筑在一帧里合成。 | 用“风暴后第七分钟”的时刻叙事、把建筑和云在正确深度合成、镜头路径由进度驱动；不移植城市点云及高包体，不把 Gaussian splatting 误写成其云的唯一算法（作者也明确说 ray marching）。 |
| **Kage / Meng To**，五章节 Three.js 夜游；https://github.com/MengTo/kage 、 https://github.com/MengTo/kage/blob/main/PROMPT.md | 3D 实时寺庙+分层 AI 画面、alpha WebP 前景、章节镜头、轻 bloom/颗粒/暗角、reduced-motion、完整公开设计提示词；无依赖的静态分发。 | 学“镜头叙事和精简 UI”“分层动效有节制”“发布可执行设计规范”；不将 AI 场景 plate 当本项目 3D 主体；**Kage 明确不许可其原创代码/美术的重新分发**，绝不可搬用。 |
| **Sakura Fantasy / billpwchan**，实时河谷与四季；https://github.com/billpwchan/sakura-fantasy 、 https://sakura.billpwchan.art | README 披露 quick tier 先首帧、完整版异步载入，worker 生成内容、动态渲染比例、摄影模式、深链和音画演奏。 | 使用渐进加载/近远 LOD、时刻天气状态机、按设备质量调速、摄影；不照搬四季完整场景/大量录音和季节资源。 |
| **TIDEWATER / Dan Greenheck**，WebGPU 海岛游戏；https://github.com/dgreenheck/tidewater 、 https://dgreenheck.github.io/tidewater/ | 官方 README 描述 WGSL 自研引擎、动态分辨率，在 Apple M5 Pro 上目标 2560×1267/60fps；玩家可进入具有活力的环境。 | 借“动态品质保流畅”“可停留观察的微细节”；**WebGPU-only 不满足本项目 WebGL2**，不复制引擎/重海洋仿真。 |

**另一个参考——WebGPU.com Showcase**：https://www.webgpu.com/showcase/ 。从策展学习：可展示作品必须说明技术栈、交互、构建过程和截图，而不是只贴生成图。相关展品之宣传不可代替本项目测量。

**设计系统和技术规范：**
- **IBM Carbon 2x Grid** https://carbondesignsystem.com/elements/2x-grid/overview/ ：以8px的几何迷你单元保持排版/图标/框架一致。本项目使用更细的 **4px 基准、8px 主节拍**，控件尺寸受44px触控硬要求制约；不是随意给像素。
- **Adobe Spectrum 2 Motion** https://spectrum.adobe.com/foundations/behavior/motion ：动画必须传递方向、反馈或位置含义，大片动效应服从 reduced motion；锁定微反馈120ms、面板240ms、巡航6000ms。
- **W3C WCAG 2.2** https://www.w3.org/TR/WCAG22/ 和 **Carbon 色彩无障碍** https://www.carbondesignsystem.com/building-blocks/foundations/accessibility/color/ ：普通正文≥4.5:1、非文本互动元素≥3:1、200%文字放大不溢出。场景是高动态背景，HUD必须有**稳定的深色实底**，不能在亮云上裸放浅白文字。
- **Three.js r186 技术文档**：https://threejs.org/docs/pages/WebGLRenderer.html （WebGL2、render.info）、https://threejs.org/docs/pages/OrbitControls.html （旋转/平移/缩放与 update）、https://threejs.org/docs/pages/EffectComposer.html （pass 按插入顺序）、https://threejs.org/docs/pages/OutputPass.html （最终色调映射和颜色空间转换）、https://threejs.org/docs/pages/GTAOPass.html （AO 代价和尺寸设置）、https://threejs.org/manual/pages/how-to-use-post-processing.html 。结论：颜色在**线性 HDR 合成，最终只做一次 tone mapping→sRGB**，真实图形指标按“包含阴影和后期的整帧”采样；不能对 composer 内部的多尺寸 RT 假设自动正确缩放。
- **建筑形态**（只作原创混合形态的构图参照，不假冒实测尺寸或复用照片）：Neuschwanstein 的高低屋顶和尖塔；Mont-Saint-Michel 的层级岩基/城堡团块；Alhambra 的内院与连拱廊；姬路城的檐口/屋面叠层；爱丁堡城堡的厚重地基；霍格沃茨影视城堡的参差塔楼剪影。需要建立独立比例图，禁止“方盒+圆锥顶”冒充建筑细节。

**2026年品类判断：**高水准实时 3D 的共识不是更多 primitive，而是**可信的几何建构、近距可读 PBR、体积与深度正确、分层光照、可调节性能、克制的界面和独立证据**。正在被淘汰的是灰白平面云、抖点岩石、圆锥树、无阴影卡通城、整图泛光、静态海报假 3D。

**一句话交付标准：**一帧可当作品集主视觉，旋转近看能识别石缝/窗洞/崖层，云海有真实体密度光影，所有交互/性能/配色阈值都能用生产浏览器重复验证。

## 3. 设计语言：令牌表+所有组件规格

### 3.1 令牌（CSS唯一视觉真源 `src/ui/tokens.css`；3D色值和算法常数统一 `src/config/visual.js`，不允许组件内裸色）
主题：**“夜蓝石墨底 + 月白文字 + 香槟金主动作”**；UI浮层不使用无对比保证的纯毛玻璃。所有状态使用成对前景/实底，运行时对最终 CSS 颜色做 WCAG 对比计算。

| 分组 | token：具体值 | 适用 |
|---|---|---|
| 背景 | `--bg0:#091624; --bg1:#14283C; --bg2:#203850; --bg3:#102032; --bg-light:#F6F2E8` | 全页启动/面板/悬停浮层/模态/浅色失败备用卡 |
| 文字 | `--fg0:#FFF8EB; --fg1:#E0EAF1; --fg2:#BDD0DF; --fg-inverse:#152436` | 主/次/注释/金底文字 |
| 线与聚焦 | `--line:#9FB8C8; --line-strong:#D1DCE5; --focus:#FFE29C` | 静边1px；聚焦outline 2px+offset3px |
| 强调 | `--accent:#F8D799; --accent-hover:#FFE5B8; --accent-pressed:#E5B96A; --accent-muted:#304155` | 金底按钮/选中/hover/按下 |
| 语义 | `--ok:#A3E4BF; --warn:#FFE1A0; --error:#FFC0BC; --info:#BADCF8` | 必须加文本+同线框图标，不能光靠绿红 |
| 浅色独立色板 | `--light-fg:#1A2A39; --light-secondary:#365166; --light-line:#64798B; --light-accent:#795100` | 静态无 WebGL 备用海报文字；不可机械反转暗色 |
| 场景固定美术色 | `skyZenith:#174A71; skyHorizon:#F4B68A; cloudWarm:#F4CE9F; cloudCool:#456F91; roof:#2C495C; stone:#B8A994; forest:#40645C; shadow:#17354A` | 光照后色变化由 HDR 统一管；这些并非UI文字对比颜色 |
| 字体 | `--font-body:"Noto Sans SC","PingFang SC","Microsoft YaHei",sans-serif; --font-latin:"Inter","Helvetica Neue",Arial,sans-serif; --font-display:"Noto Serif SC","Songti SC",serif` | 字体文件全部自托管，©/OFL 存证，关键字重preload、font-display:swap |
| 固定字阶（比率1.25） | `t0=12/16/500/+0.04em; t1=15/23/400/0; t2=19/29/500/0; t3=24/30/600/-0.01em; t4=30/38/600/-0.02em; t5=38/46/600/-0.025em; t6=48/58/600/-0.03em; hero=60/70/600/-0.035em`（每组=字号px/行高px/字重/字距） | t0元信息、t1正文/按钮、t2面板、t3子标题、t4对话框、t5章节、t6桌面标题、hero 仅宽屏开场；正文≤40汉字/75英文字符 |
| 间距 | `--sp1:4px;--sp2:8px;--sp3:12px;--sp4:16px;--sp6:24px;--sp8:32px;--sp12:48px;--sp16:64px;--sp24:96px` | 按钮icon gap8、行间12、卡内16/24、块间32/48、桌面画布边32、移动16 |
| 圆角 | `--r1:4px;--r2:8px;--r3:12px;--r4:16px;--r-pill:999px` | 标签4、按钮8、toast12、dock/dialog16、胶囊999 |
| 描边阴影 | `border:1px solid var(--line); shadow0:none; shadow1:0 4px 12px #07131F55; shadow2:0 12px 28px #07131F66; shadow3:0 20px 48px #07131F88; shadow4:0 28px 72px #07131FAA` | 5级阴影只给对应层；描边/底色/重影不得三重堆叠 |
| 层级 | `--z-scene:0;--z-header:10;--z-controls:20;--z-toast:30;--z-modal:40;--z-boot:50` | 所有z index只在tokens定义 |
| 微交互 | `120ms cubic-bezier(.2,0,0,1)`；切换 `240ms cubic-bezier(.2,0,0,1)`；入场面板 `360ms cubic-bezier(.16,1,.3,1)`；电影镜头 `6000ms cubic-bezier(.22,1,.36,1)` | CSS只动画 transform/opacity；ReducedMotion 时 CSS动效0ms，云时间速率0.1、镜头自动移动关 |
| 图标 | 统一原创内联 SVG，viewBox 24×24；16/20/24px，stroke 1.75，round join/cap | camera/clock/cloud/sliders/reset/orbit/mute/help/close/check/warn/chevron，禁emoji |
| 响应栅格 | ≤480：1列/左右16；481–768：4列/20；769–1024：8列/24；1025–1440：12列/32；>1440：12列/48；内容最大宽1120 | 画布100vw×100dvh，全页无横向滚动。dock 始终靠视窗底 safe-area |
| 图形镜头安全区 | 1920主视角城堡整体包围盒投影 x=34–70%/y=12–85%，上方塔尖≥8%留白；375手机主体 x=14–86%/y=18–70% | GUI只贴左侧字标/底部控件，不压住主塔；通过截图分割mask检查 |

**对比度铁律：**正文对背景≥4.5:1，大字（≥24px常规或≥18.66px粗体）≥3:1，线框/图标与相邻背景≥3:1，禁用文字与背景≥2:1；失败即调 token 并全部重新校验。数字都设置 `font-variant-numeric:tabular-nums`。正文行高=1.53，英文混排 `font-feature-settings:"kern" 1`、中文 `line-break:strict`、不用首行缩进。所有 `h1–h6` 重置浏览器默认字号/边距。

### 3.2 共享状态协议（组件无例外）
所有可交互组件继承：**D默认** 按具体 token；**H悬停** 仅 `@media(hover:hover) and (pointer:fine)` 下背景提升至 bg2、120ms；**P按下** 缩放 .97 且色加深；**F键盘焦点** 2px focus outline offset3 不裁切；**X禁用** `aria-disabled=true` + “原因”可见文字，仍可被读屏定位但不触发；**L加载** 即刻 spinner/SVG 与 `aria-busy=true`、真实进度或步骤提示；**E错误** warn icon+说明原因/恢复动作 `role=alert`；**Ø空** 明确为什么没有场景及下一步而非“暂无数据”；**S成功** check icon+结果文本 `role=status`。无交互的纯展示组件 H/P/F/X 标为“不适用（非交互）”，四态由全局状态组件投影。可点击区≥44×44，键盘 Enter/Space 激活，Esc 关最高层，焦点回触发者。

### 3.3 完整组件规格（C01–C10）
| ID | 结构、尺寸/颜色/字体、默认态 | 特定交互、完整空/载/错/成功 |
|---|---|---|
| **C01 启动屏** | full viewport bg0/z50；居中 320×240 区域，logo t5，进度条高4 r1，实际本地16:9 WebP海报有固有宽高；进度文字t1 | Ø“场景资源尚未准备，重新载入”；L“正在汇聚云海 · 42%”（百分数必须真实阶段累计）；E“图形初始化未完成，请开启图形加速后重试”；S“云际圣堡已就绪”；超过10秒出“取消加载”按钮；`role=progressbar aria-valuenow` |
| **C02 品牌** | 桌面左上 x32 y28 max300，英文 t0 字距.18em、中文t3，深底透明但文字背有实色条 bg0；移动 x16 y12 | 无点击；L仍显示原文字低透明；Ø显示“云际圣堡”；E/S不改变品牌，以C09传达；`header/h1` |
| **C03 叙事标题** | 桌面左侧 x48、y≈34vh，max-width320；hero字、t1说明；移动16px/上90px/title30px | 开场按幕淡入；接管操作即淡出说明；Ø“拖动镜头，寻找第一束光”；L“正在拨开薄云”；E“视角暂不可用，请点复位”；S“自由探索已开启”；非交互文字不得截去 |
| **C04 底部操作台** | 桌面底24 中置宽≤880 高72 padding12 r4 bg1 shadow2，包含C05–C08；手机左右16底safe-area+12，高112双排 | Tab次序：镜头→时间→天气→画质→摄影→声音→帮助；Ø“操作暂不可用，先重新加载”；L按钮就地旋转小图标；E就地带“恢复”；S恢复可操作；`nav aria-label="场景控制"` |
| **C05 时间分段** | 4按钮“晨曦/正午/日落/星夜”，44px高、至少52px宽，间隔4，默认晨曦gold底dark字，其他bg2/fg1 | 每项 `button aria-pressed`，点击100ms内改变选中；Ø“使用默认晨曦”；L“正在改变日照”；E“时刻切换未完成，已恢复晨曦”；S“当前时刻：星夜”；Esc关展开容器 |
| **C06 天气** | 3按钮“晴朗/薄雾/风雨”，≥64×44，展开宽240，r2，选中金底 | Ø“天气资源尚未加载，继续使用晴朗”；L“正在聚拢云层”；E“天气切换未完成，已恢复晴朗”；S“天气：薄雾”；storm近景雨粒真实显示 |
| **C07 画质选择** | 控件44px，浮层宽204行48，高≤192；选项“低/均衡/极致”，默认均衡，radio圆标+大字t1、小字t0 | menu按钮/每项button aria-pressed；X能力不足的极致项写“当前显卡不支持”；Ø“已使用低画质，仍可观景”；L“正在调整画面”；E“调画质失败，已恢复低画质”；S“当前画质：均衡”；Esc关焦点返回 |
| **C08 镜头/摄影/复位/音量按钮组** | 原创统一SVG20、按钮≥44×44、r2 bg1，按钮标签视觉隐藏但ARIA可读；镜头弹层含远景/拱廊/岩基3项 | R复位、H/ESC拍照模式退出、S拍PNG、M静音；Ø“无法生成照片，退出摄影模式重试”；L“正在保存PNG”；E“照片无法保存，请检查下载权限”；S“照片已保存”；摄影态UI全隐藏，键盘仍有效 |
| **C09 Toast** | 右下 max320，min-height48、内边距12/16、r3/bg3/shadow4/z30；小图标16+15px字 | `aria-live=polite role=status`；错误role alert，持续到用户关闭；Ø无消息时不渲染；L“仍在载入高精度材质”；E“部分纹理未能载入，已使用安全材质”；S“视角已复位”；防同文案重复刷屏 |
| **C10 帮助Dialog** | 真 `<dialog>`/`aria-modal=true`，桌面宽480，手机宽calc(100%-32px)，padding32/手机24 r4 bg3/shadow3；标题t4正文t1 | 焦点陷阱、Esc关、关闭后返焦、背景inert；Ø“用鼠标拖动查看城堡”；L静态帮助直接加载完成；E“帮助面板未能显示：按R复位、H切换拍照”；S快捷键表格清晰可读 |

**统一反馈**：点击轻操作＜100ms 立刻改变按钮或 toast，300ms 内完成轻 UI 操作；场景天空600ms渐变。动态加载＞1s显示阶段、＞10s可取消；禁止 toast 拦截拖拽或覆盖塔楼。组件 shadow/z-index/焦点不能用局部自定数值。ICON按钮始终有 `aria-label`，装饰图片 `alt=""`、海报 `alt="云海中的城堡概念预览"`。

## 4. 完整体验设计

### 4.1 信息架构
单页 `/` → 主舞台(WebGL canvas) → 1级底部dock(镜头/时刻/天气/画质/摄影/声音) → 2级 popover 或帮助 dialog（不超过3级）。初始主视角可操作，不强迫看完片头。URL深链固定：
`?view=hero|side|detail|rock&time=dawn|noon|sunset|night&weather=clear|mist|storm&tier=low|balanced|ultra&intro=0|1`。
未知参数回默认并记录调试 warning，不白屏。交互改变状态以 `history.replaceState` 更新URL，不用 pushState 污染浏览器返回；浏览器后退正常离站。localStorage只保存上一次声音关闭状态和手动画质（schema v1），显式URL优先；JSON损坏/禁用存储自动无声回默认。

### 4.2 开场三幕与可控自由相机
**0–1.4s** loader，关键 mesh 与低阶 shader 优先出来；**1.4–3.1s** 云隙打开/远处塔楼显露；**3.1–4.8s** 镜头轻推主塔/钟楼之间，风中旗面摆动，空中金粒穿过光束；**4.8–6s** 回英雄机位与浮现标题；**6s后** 默认自由探索。该时长以 scene ready 后为起点，不强行锁用户6s。任意canvas拖动/滚轮/触摸/键盘方向或复位在100ms内终止 intro 并释放 OrbitControls。`prefers-reduced-motion:reduce` / URL intro=0 跳过镜头运动，云动画速度降到0.1，闪光禁用，音效默认关闭。

### 4.3 核心用户旅程（屏幕/操作/反馈）
1. **初访**：看海报+实时进度→第一帧可互动→选择观看短镜头或立即拖动→云和城堡都在同一透视深度变化。无静态远景海报充当主体。
2. **近看**：桌面左键 orbit、右键/Shift+左键 pan、滚轮 dolly；一指触摸 orbit、两指 pan/pinch→拖动手感始终有 damping，无穿墙/越过上下极点→弹状态“自由观察已开启”。R复位。
3. **切时间**：点“星夜”→100ms选中星夜→0.6s太阳角与天光/夜窗/云色变化→Toast“已切换到星夜”。连续点只保留最新意图，取消旧 Tween 不跳帧。
4. **换天气**：晴朗→薄雾→风雨；云覆盖率/层次和雨粒应相对变化，风雨不允许整屏变成无辨识度的灰蒙蒙板；恢复晴朗雨粒池立刻停、600ms云密度恢复。
5. **转镜头**：远景/拱廊/岩基，镜头插值900ms；拱廊看得到窗深和墙纹；岩基看得到侵蚀/层理与云交界；点击复位恢复 hero/朝向。
6. **摄影**：点相机图标→100ms隐藏所有HUD，S保存当前canvas为透明关闭的PNG（含真实颜色而无UI），命名 `aetherkeep-dawn-clear-YYYYMMDD-HHMMSS.png`；Esc/H恢复UI+原触发按钮焦点。浏览器拒绝下载则 C09 error 明示。
7. **环境声**：必须先点击“开启环境声”（WebAudio user gesture），用带通粉噪风/钟的谐波/雨噪在本机合成；默认静音，失焦自动 suspend，M切换；不请求音频网络文件。

### 4.4 镜头与几何空间（世界单位 m，Y向上）
非圆形浮岛水平半径约 72–96m，岛顶 y=0±9，尖端到y=-85；云层主要 band y=-76到-6，山崖下端被云遮，中庭 y=12。主塔城堡高度108m，钟塔78m，侧塔40/48/56m，最大塔明显更高；城堡朝 -Z 迎来访者。相机 PerspectiveCamera `fov=36°, near=.5, far=1600`；英雄 camera `(192,102,258)` target `(0,24,0)`；侧景 `(-258,128,152)`→`(0,20,0)`；拱廊 detail `(68,48,86)`→`(2,31,-8)`；岩基 `(126,-34,145)`→`(0,-36,0)`。缩屏长宽比<.7时相机距离乘1.6、target.y=27，确保整个高塔与云岛在上下限安全区内；用包围盒投影自动检测，若超出就继续最多乘1.35修正，直到不裁切。OrbitControls `minDistance=68 maxDistance=620 minPolarAngle=.18 maxPolarAngle=2.35 enableDamping=true dampingFactor=.055`；target钳制中心 X/Z±65、Y -45至75，orbit/camera保持可见与不穿过城堡：若摄像机从外侧进入围绕城堡的半径65碰撞球，沿射线向外推到65，镜头平滑而不突跳。重设 hero 后才调用 `saveState()`，禁止存侧景为默认视角。RAF 每帧 `controls.update()`。

### 4.5 响应布局与四态
**>1440**：logo左x48/top32，主标题左 x48/y35vh max320，中央x34–70%为城堡，右顶帮助按钮，dock底xcenter宽880，toast右下；**1025–1440**边32且同序；**769–1024**左侧标题38px max240，dock分两组；**481–768**上部品牌+短叙事、dock双行；**≤480**边16标题30/38、隐藏长叙事正文（帮助中仍可读）、dock两行高度112/每个tap≥44，始终不产生水平溢出；375×812画面主体x14–86%/y18–70%。任何浏览器视窗高<570时 dock缩成单行图标按钮+一个“更多”可展开第二行，不能挤占主塔轮廓。文字放大200%时面板高可增长、长标签可换行、按钮仍44px、画布不参与HTML流布局。

**全局 Ø**：“城堡资源尚未准备好。请重新加载完整的离线资源包。”按钮“重新加载”；**L**：“正在编织云海 · 63%”并显示“基础模型 / 高精材质 / 光影整合 / 交互就绪”的真实阶段；**E**：WebGL2缺失“当前设备无法显示实时云海。请启用浏览器图形加速或改用最新版Chrome/Safari”，按钮“查看静态介绍/重新加载”；context lost“图形设备暂时断开，正在重建”，最多一次重试；**S**：“云际圣堡已就绪。拖动可探索。”所有错误需说**原因类别+下一步**，不许“操作失败”。

### 4.6 无障碍精确动作
Tab先左顶“帮助”，再dock镜头/时刻4项/天气3项/画质3项/摄影/声音/复位，Esc关闭浮层或退出摄影；焦点清晰≥2px且不得裁边；可用Enter/Space和方向键改变全部主要状态（方向键默认pan仅在canvas具有焦点时生效，防劫持控件焦点）。Canvas有 `aria-label="云际圣堡实时三维观景场景" role="img" tabindex="0"`，提供旁边屏幕阅读器专用状态文案（当前时间/天气/镜头）；HTML按钮用真button和aria-pressed；dialog打开后focus trap，关闭返焦；异步状态 `aria-live=polite`，错误role=alert；reduced-motion实时监听系统变化；非鼠标用户同样可通过“镜头选点”而非拖拽到达全部关键视点。

## 5. 关键技术、模块、渲染和资产

### 5.1 目标新建模块布局
`index.html`、`package.json`、`package-lock.json`、`vite.config.js`；
`src/main.js`(初始化/清理)、`src/config/visual.js`(数值/美术常数)、`src/core/{state.js,renderer.js,pipeline.js,governor.js,resources.js,diagnostics.js}`、`src/world/{castle.js,island.js,rocks.js,trees.js,water.js,sky.js,clouds.js,lights.js,weather.js}`、`src/camera/{rig.js,intro.js}`、`src/fx/{ao.js,shafts.js,dof.js,grading.js}`、`src/audio/soundscape.js`、`src/ui/{tokens.css,app.css,controller.js,icons.js}`、`src/shaders/`、`public/assets/{materials,fonts,poster}`、`scripts/{build-assets.mjs,verify-assets.mjs,analyze-image.mjs,check-contrast.mjs,run-e2e.mjs}`、`tests/{state.test.js,geometry.test.js,governor.test.js,render-config.test.js,assets.test.js,e2e.test.js}`、`reports/`、`README.md`、`.github/workflows/{ci.yml,deploy.yml}`。这些是目标路径，待执行新建。

### 5.2 准确的 JS API/状态/数据流
ESM+JSDoc，单一不可变状态仓库，单次变更可测试：

```js
/** @typedef {'dawn'|'noon'|'sunset'|'night'} Time */
/** @typedef {'clear'|'mist'|'storm'} Weather */
/** @typedef {'low'|'balanced'|'ultra'} Tier */
/** @typedef {'hero'|'side'|'detail'|'rock'} View */
/** @typedef {{time:Time,weather:Weather,tier:Tier,manualTier:boolean,
 * view:View,photoMode:boolean,mute:boolean,reducedMotion:boolean,
 * phase:'boot'|'ready'|'degraded'|'error',progress:number,
 * intro:'playing'|'skipped'|'complete',dialog:null|'help',error:null|string}} AppState */
export const INITIAL_STATE = Object.freeze({
 time:'dawn',weather:'clear',tier:'balanced',manualTier:false,view:'hero',
 photoMode:false,mute:true,reducedMotion:false,phase:'boot',progress:0,
 intro:'playing',dialog:null,error:null
});
export function reducer(state,action) { /* pure state + validated tagged action */ }
export function createStore(initial=INITIAL_STATE) { /* getState, dispatch, subscribe, destroy */ }
export function parseQuery(search) { /* exact allowlist + validation */ }
export function serializeQuery(state) { /* stable URLSearchParams */ }
```

Actions：`SET_TIME`、`SET_WEATHER`、`SET_TIER`、`AUTO_SCALE`、`SET_VIEW`、`RESET_VIEW`、`PHOTO_ENTER`、`PHOTO_EXIT`、`LOAD_PROGRESS`、`LOAD_DONE`、`LOAD_ERROR`、`INTERRUPT_INTRO`、`SET_REDUCED_MOTION`、`SET_MUTE`、`DIALOG_OPEN`、`DIALOG_CLOSE`。同一类异步环境过渡只让最新 epoch 完成，已经 dispose 后忽略结果。核心函数契约：
- `createRenderer(canvas,{tier}):{renderer,capabilities,dispose}`；
- `createWorld({assets,seed}):{scene,geometryStats,handles,dispose}`；
- `createPipeline({renderer,scene,camera,tier}):{render(dt):FrameMetrics,resize(w,h,dpr),setTier(tier),dispose}`；
- `createRig({camera,canvas,store}):{controls,goTo(view,ms),reset,update(dt),dispose}`；
- `createGovernor(config):{observe(frameMs,frameId,now):GovernorAction,reset}`；
- `loadAssets({signal,onProgress}):Promise<AssetManifest>`；
- `createUI(store,actions):{dispose}`；
- `analyzePng(path,maskPath):{histBins,lumaP01,lumaP99,hsvMedian,cloudDelta,rois}`。
FrameMetrics=`{frameId,nowMs,frameMs,renderMs,drawCalls,triangles,scale,tier,passMsApprox}`。debug接口仅 `?debug=1` 时挂 `window.__CASTLE_DEBUG__={snapshot,freezeForEvidence,setViewForEvidence,cloudMask}`；其中freeze冻结风、云时间与粒子随机，不停止rAF，不暴露任意eval。

输入URL→validated store→scene uniform/相机tween→render pipeline→diagnostics→governor→分辨率/LOD→HUD；按钮→dispatch立即改ARIA/文本→场景变化→toast。存储键 `aetherkeep:prefs:v1`，仅 {tier,mute}；不可用则走默认。随机源固定 mulberry32(42017)，无 Math.random() 非确定场景。时间步 dt clamp `0–0.05s`，标签页隐藏时停测/暂停 WebAudio，恢复时重新暖机。错误与负载信息须能区分“功能失败”和“降级运行”。

### 5.3 几何质量：10条短板逐项克服
1. **城墙**：12个建筑群模块（主塔、主殿、钟塔、2侧翼、4附塔、连接廊、2道城垣）；墙材8种贴图中的3种按区域配合，石块标准厚0.25–0.4m，主要纹理砌缝真实切分，水平线脚每4–8m；使用 MeshStandardMaterial，并有normal/roughness/AO；近距可见砂岩颗粒/苔线，不再大片平均米黄。
2. **立面剪影**：主塔高度108m、钟塔78m、附塔40/48/56m；屋顶蓝灰有坡面/脊饰/挑檐，至少24处真实凹拱窗（凹入0.5–1.2m、有门框/券石）、12道扶壁，角塔不全等高，塔顶有4种剪影物；castle要有20–25%中间空隙而非完整堵墙块。
3. **云**：独立三维密度体+光积分+深度遮挡，不用billboard、模糊灰白平面；至少6团有云顶高度变化的大云体、2处纵深谷槽，日照云面杏金、背面深青蓝、银边和后向遮挡成立。
4. **岩石**：地质层状位移沿重力分布，频率有尺度限制；不允许随机抖动的二十面体。10–18条纵向侵蚀脊与多节理、崖肩悬根、地质基底纹理，最尖端隐入云。
5. **岛顶**：半径72–96m的非圆多频轮廓，顶面最大起伏±9m、4处崖肩、3处自然台地；128×128分块网格+细分法线避免巨型三角板；地面苔/土/石材过渡，非绿平圆盘。
6. **树**：至少三类轮廓：细长针叶48株、阔叶冠62株、弯枝孤树8株；每种近/中/远三级LOD；实枝至少2级、树冠多层簇，枝叶颜色 `#33584E/#567C66/#9A9A65`；合并/实例化，禁止“圆锥+圆柱”全部充数。
7. **阴影**：太阳主投影2048² PCFSoft，bias -0.00025/normalBias .025、受光/背光、窗洞凹影、墙脚接触影和半分辨率 AO；不能用顶点色一项伪造阴影。
8. **天空**：Rayleigh/Mie近似大气、太阳盘、层次高度雾、云光束；不同海拔空气透视，夜间可见星点但绝不光污染。
9. **后期**：ACES + 单次sRGB输出、阈值bloom、温冷分离分级、DOF(窄范围)、粒状噪点/弱暗角；过曝即失败；必须满足AC04。
10. **构图与叙事**：镜头主角占据规定安全区，HUD不能压住主塔，开场三幕/镜头路径/时刻天气动态/摄影，至少3种能看到不同精细部位的机位。

**几何硬指标/建模细节：**顶面XZ闭合，崖壁岩层几何沿Y平滑而非随机噪声；每个可渲染 mesh正确 normal/tangent、无NaN、包围盒正确；前景石材启用normal和roughness，屋顶 tile UV 方向统一；小构件几何合批或实例，禁止每石块一draw。水镜18×11m，深青色、2层滚动法线/微波幅0.03m，环境sky反射/小区域反射缓存；若反射昂贵退到sky环境反射，但不得变成实色平面。城堡中景 windows随时间改变 emissive，旗帜微风变形仅作用旗布非建筑。每个LOD切换采用10m滞回降低频繁闪变。

### 5.4 AI 图片与可审计本地资产流水线
**固定资产数量：8张 2048² albedo（每材质一张）+1张 16:9 1024宽加载海报。** 墙体不只颜色：离线生成 normal/roughness，渲染叠加真实缝/雕饰几何。每张AI图都要求“没有光影烘焙、没有物体透视”，否则返工。使用简报已实测调用：

```sh
mcode-tools connector call connector__matrix__generate_image \
 --args '{"requests":[{"prompt":"<A01完整英文贴图提示词>","resolution":"2K","aspect_ratio":"1:1"}]}'
mcode-tools get_asset_url <返回的success_items[].node_id>
# 对 get_asset_url 真实返回的 download_url 用 curl -fL --retry 3 下载到本机临时目录
```

**统一英文prompt后缀（逐张重复，不能省略）**：“seamless tileable texture, flat even lighting, no shadows, no objects, orthographic top-down, photorealistic PBR albedo map, evenly exposed, no specular reflections baked in, no perspective, no text, no watermark.”
A01：“cool pale limestone ashlar blocks, irregular 20–40 cm mortar seams, age stains and sparse lichen”；A02：“warm taupe weathered sandstone voussoir blocks, fine iron mineral bands”；A03：“dark blue basalt foundation masonry, subtle chalk mortar”；A04：“overlapping blue charcoal slate roof tiles, chipped edges and varied hue”；A05：“wind eroded stratified sedimentary cliff face, horizontal layers and fissures”；A06：“old flagstone pathway with patchy moss and chipped limestone”；A07：“dark carved oak planks, continuous aged grain, narrow board seams”；A08：“aged bronze sheet metal, subtle hammered dents and green patina, diffuse-only albedo”。海报单独：“wide painterly concept art of a soaring stone gothic castle on an eroded floating island above a dramatic layered cloud sea at golden blue dawn, primary architecture center-right, deep cool cloud shadows and amber highlights, empty editorial title-safe space on left, no text, no logo”。海报**只给loader/WebGL2不支持的备用页面**，不得在3D实际帧覆盖建筑。

每批提交不超过4图，总9个请求；每张取 node_id→download_url→下载→验证 MIME/magic bytes/宽高→离线转换 WebP。输出 `public/assets/materials/<name>-albedo.webp`、`-normal.webp`、`-roughness.webp`。PNG或原始大文件不必入库，但最终全部可运行文件必须入库。采用 sharp 开发期生成：若砖缝边缘不连续，左右和上下各96px smoothstep blend 再重建周期贴图；检查左右/上下平均RGB边界差≤0.06（0–1），否则生成程序纹理保底。高度图=多尺度luminance高通+缝隙线掩码，3×3 Sobel算XY梯度→normal.Z正向；roughness 石0.66–0.90、屋瓦0.56–0.75、铜0.32–0.55，固定seed高频轻噪。注意 albedo的 `texture.colorSpace=THREE.SRGBColorSpace`，normal/roughness为线性数据不能设sRGB；法线强度0.45–0.65。UV世界单位尺度，石砌重复间距约4m，随机每组旋转90°防“墙纸重复”但屋瓦纹理保持朝向；压缩质量WebP82，避免法线贴图破坏（法线优先无损WebP或PNG）。

海报目标≤300KB，albedo≤1.2MB/张、法线≤0.8MB/张、roughness≤0.35MB/张，全部资源和本地字体目标≤16MB，非硬验收数字仅为性能预算。字体取官方可再分发 OFL 的 Noto Sans SC、Noto Serif SC、Inter 的**本地woff2子集**，包含全部中文状态/错误微文案，保留 OFL License；禁外站字体。`public/assets/PROVENANCE.md` 写每个AI prompt、node ID（不写一次性下载凭据）、生成时间/sha256/处理命令/版权，font来源/OFL。构建后的每个本地资源以相对路径引用，网络哨兵必须发现外部请求为零；AI connector**只构建期使用**。若图像接口失败按 §7 U01 处理，不许留空贴图；纹理故障在浏览器自动切程序砖纹并显示降级状态。

### 5.5 WebGL2 HDR 渲染管线（显式pass表与依赖）
**统一线性色彩管理**：WebGLRenderer outputColorSpace=SRGBColorSpace、toneMapping=ACESFilmicToneMapping、曝光dawn1.05/noon0.82/sunset1.00/night1.50；自定义中间pass必须在linear HDR中，不许手动先gamma再OutputPass做第二次转换。RGBA16F RT若 EXT_color_buffer_float不支持则RGBA8+pre-exposure储存并第7节记录退化。effect composer自定义pass按顺序插入，使用独立 FBO管理不同分辨率，depth和normal尺寸/编码显式匹配。调试/验收统计要包括P0阴影、云和所有后期。

| 顺序 | 输入→输出、内部尺寸、核心参数 | 预算/降级先后 |
|---|---|---|
| **P0 Sun shadow** | 建2048² directional PCFSoftShadowMap；城墙/树/地面cast+receive，太阳方向更新才重建 | 全局calls≤120；负载高降1024但保留阴影 |
| **P1 Sky** | 全分辨率天空颜色，根据日盘方向和Rayleigh/Mie近似散射、星夜常量，合空气透视，不是CSS渐变；输出HDR skyRT | 1 draw；使用shader代替上传天空大图 |
| **P2 Opaque+depth** | 城/岛/树/桥/水底对象→HDR RT +共享DepthTexture，W×H；深窗AO靠真实几何 | 合批上限本段≤60 calls，深度纹理供云和后期 |
| **P3 GTAO** | 半分辨率 W/2×H/2，GTAOPass或同等HBAO 12–16 samples +双边upscale，暗角接缝不压死 | 目标≤2ms；降为8 samples，最后改 cheap contact AO，不可干脆“无AO” |
| **P4 Clouds** | **屏幕射线投向实际体积包围盒**，半分辨率 ray marching 24主步×4日光步，输出 linear HDR 云色、透射T、第一有效深度；3D FBM形体、侵蚀与高度profile，HG相位g=.55，Beer-Lambert exp(-σ∫ρds) | 960×540@1080均衡；目标≤3.5ms；低档quarter-res/12×2，ultra32×6 |
| **P5 Depth-aware cloud composite** | 用 opaque depth、云前深度、透射率做有序alpha合成：cloudFrontColor+(opaqueBehind*transmittance)，若opaque在云前则其像素不能被云挡；双边上采样+历史reprojection深度差>2%即拒绝历史 | 全分辨率1–2draw；失焦/大镜头动作拒绝重投影避免拖影 |
| **P6 Shafts/fog** | 半分辨率太阳遮挡mask，遮挡-径向12采样，输出金色云隙光；真实距离高度雾只影响远景 | 强度0.13，夜0；负载高先禁光束但保留云自身亮暗 |
| **P7 Water/particles** | 中庭水镜与近雨、飞絮，深度正确透明绘制，不得全部把场景重画一次 | ≤5 draws，风雨粒子实例化；极低档关雨保留远处风影 |
| **P8 Bloom** | UnrealBloomPass，threshold1.05 strength0.24 radius0.32，half-res mip链，目标金窗/日轮少量高光 | 负载高降0.15强度或合并mip，禁止全屏泛白 |
| **P9 DOF** | 四分之一分辨率，按camera→target焦距CoC半径≤3px、8tap深度边沿保护；引导镜头/摄影才开，平时balanced关闭 | ultra弱DOF，low关闭，主体必须始终锐利 |
| **P10 Grade→Output** | linear contrast1.06/saturation1.08、grain0.012、vignette0.10，后接**唯一 OutputPass** 做ACES+linear→sRGB | 全分辨率；禁止第二tone map/gamma；若截屏测不达AC04先改灯光云色而非简单PS图像 |

**工程注意：**EffectComposer的pass自带读写ping-pong；自建cloudFBO的depth不能直接当GTAOPass的normals，必须按官方 r186 容许的GBuffer设置传入正确encoding/texture；若不兼容走 U04 8-tap 自写SSAOPass。每次ResizeObserver改变尺寸，重建全部RT、历史缓冲清零、更新camera aspect/projection；销毁时dispose targets/passes/materials。`renderer.info.autoReset=false`，每个rAF开头显式 `renderer.info.reset()`，整帧完后读 `renderer.info.render.calls/triangles`；保存测试说明阴影绘制口径，用必要的 instrumentation 补充shadow calls。P4云体密度坐标 y=-76..-6，ρ(p)=saturate(coverage × smoothstep(heightBand) × (fbm(p*.018+wind)-.23) − erosionFbm(p*.11)*.22)，沿太阳积分4步得到阴影，独立冷影色cloudCool和受光cloudWarm，至少6个空间云团、2个深谷。不可仅用静态噪声二维平面模拟。

### 5.6 画质和连续帧调速器
| tier | 真实像素倍率(相对 CSS像素、DPR cap) | 云/阴影/AO/DOF | 应用 |
|---|---|---|---|
| low | scale=.72, DPR cap1.0；最低.60 | 云quarter、12×2；shadow1024、cheap contact AO、DOF off、植被LOD早切 | 软件GL/手机，保留3D/主阴影和云受光面 |
| balanced（默认 AC03） | scale=.90,DPR cap1.0；最低.70 | 云half、24×4；shadow2048、GTAO half；DOF仅导览/摄影 | 对1920×1080实际设备验收FPS≥55 |
| ultra | scale=1.0,DPR cap1.5；最低.75 | 云half、32×6；shadow2048、GTAO16+、弱DOF | 画质展示；不擅自声明性能通过 |

RAF间隔滑窗120帧，初始化暖机180帧，再计算p50/p90；基准16.67ms。连续3个窗口p90>18.5ms、当前未触发冷却：renderScale -0.08、冷却3s；直到tier内下限，再按顺序云24→18→12、GTAO16→8、DOF关、Sun Shafts关、shadow2048→1024、植被LOD前移。连续6窗口p90<14ms，非手动锁档每次+0.04、冷却5s到tier上限；手动锁定只允许在同档上下限调整而不偷偷把ultra换low。任何过载超过5s出现“设备负载较高，切换均衡画质可更顺畅”，但用户可拒绝。后台不可见停RAF观测，回来重暖机；天气/镜头/resize/摄影采样重置窗口。FPS考核采样需真实60个不同帧且标注scale轨迹，不能暂停时间再伪造60fps。

### 5.7 画面色彩算法验收和图像 ROI
固定 `?view=hero&time=dawn&weather=clear&tier=balanced&intro=0&debug=1` + seed42017 + 动画冻结取证；PNG要使用实际canvas输出，不经过后期脚本补图。灰度8bit直方图256桶中非零数量≥200，按全图sRGB视觉亮度(0.2126R+0.7152G+0.0722B)/255排序求P1/P99、差≥0.55；HSV饱和S=(max-min)/max，对灰色max=0设0，取所有像素中位≥.12。为了避免“场景亮度过关但云不行”：从cloudMask筛出两处互不重叠64×64方框，每块必须≥90%真正云像素，分别位于sun-lit和shade，亮度均值差≥.12；保存ROI坐标、覆盖百分比、二框叠图，人工核对云而非天空/岩层被选中。额外记录线性sRGB亮度版本供解释，但阈值采用同一固定sRGB视觉亮度定义。若没有两块合法ROI，应判FAIL而非“自动选择背景最亮/最暗位置”作弊。

### 5.8 稳健性、首屏和禁止事项
目标：本地静态服务器首屏可交互≤2.5s、CSS布局偏移CLS≤0.1、交互反馈≤100ms、轻操作≤300ms。资产quick mesh先渲染后高精贴图异步加载，超8s/错误用程序块石材法线，不回退成均匀米黄；超过10s能取消；资源加载AbortController，多次切换last-write-wins；内存资源按引用计数释放；WebGL contextlost一次自动恢复，第二次落错误面板；下载失败/浏览器禁LocalStorage静态降级；强制禁止任何网络字体/API/CDN、无授权模型或素材、没有证据的 FPS/质量PASS、emoji图标、默认浏览器CSS、把全画面bloom成灰白、对截图事后色阶加工冒充渲染结果。

部署首选**GitHub Pages**：Vite `base:'./'`、workflow pages权限 `contents:read,pages:write,id-token:write`，官方 configure-pages→upload-pages-artifact(dist)→deploy-pages；必须用匿名真实浏览器打开最终URL确认生产包成功。如果私有仓Pages权限受阻走 U05 分支；仓库提供dist不等于公网部署。

## 6. 按依赖顺序的任务拆解（每项八要素）

以下“相关位置”都是**拟建路径+函数/选择器**。每个任务均含：依赖/前置、步骤、位置、产物、自查、测试、完成条件、设计对应条款。任务之间默认必须通过上一任务检查才启动下一依赖节点。

### T01 工程锁定与静态入口
- **依赖/前置：**无；已有Node26和npm。
- **步骤：**创建package scripts `dev:vite`、`build:vite build`、`preview:vite preview --host 127.0.0.1`、`test:node --test tests/*.test.js`、`test:e2e:node scripts/run-e2e.mjs`、`assets:node scripts/build-assets.mjs`、`test:design:node scripts/check-contrast.mjs`；npm锁 three@0.186.1 vite@8.3.5 playwright@1.64.1，加 pngjs 和 sharp 为dev依赖；Vite base "./"，index设置中文lang、viewport。
- **位置：**`package.json#scripts`、`vite.config.js`、`index.html`、`src/main.js#bootstrap`。
- **产物：**零外站空壳、lockfile、最小测试。
- **自查：**`npm ci && npm run build`；检查dist有首页、无外CDN。
- **测试：**`npm test` 至少1个bootstrap状态测试，执行返回0。
- **完成条件：**纯静态dist可由vite preview访问。
- **设计条款：**§3 tokens、E一致性、D首屏。

### T02 令牌+语义化UI外壳
- **依赖/前置：**T01。
- **步骤：**按§3创建tokens+typography、C01–C10 DOM和SVG、重置默认样式，所有状态能用mock切换；本地字体见T04，用font fallback先工作。
- **位置：**`src/ui/tokens.css`、`app.css`、`icons.js#icon`、`controller.js#renderUI`、`index.html`。
- **产物：**完整可Tab操作的静态UI。
- **自查：**颜色无裸hex（tokens/scene config除外）、button一致、图标统一、无emoji。
- **测试：**`scripts/check-contrast.mjs` 计算前景与背景/边框/禁用对比，Playwright键盘Tab截图。
- **完成条件：**C01–C10四态mock截图和布局可用。
- **设计条款：**A1–A5、B1、C、C01–C10。

### T03 状态/URL/交互绑定
- **依赖/前置：**T01,T02。
- **步骤：**实现纯reducer、订阅与解除、深链枚举验证、错误状态、localStorage容错；控件100ms反馈与aria-pressed同步、last-write-wins。
- **位置：**`src/core/state.js#reducer/createStore/parseQuery`、`src/ui/controller.js#bind`。
- **产物：**可用状态机、URL持久化与四态文案。
- **自查：**多次点时刻后状态符合最后一次；坏URL不报错。
- **测试：**`tests/state.test.js` 覆盖所有action/未知action/无效URL/并发/损坏本地存储。
- **完成条件：**核心按钮响应和地址栏完全一致。
- **设计条款：**B1–B4、C01–C10、§4用户旅程。

### T04 AI材质与字体离线资产
- **依赖/前置：**T01,T02。
- **步骤：**按§5.4调AI生成9张图；分别下载/校验/消缝/生成normal+roughness/WebP；自托管字体和OFL许可；资源manifest sha256/PROVENANCE。
- **位置：**`scripts/build-assets.mjs#buildTextureSet`、`scripts/verify-assets.mjs`、`public/assets/`。
- **产物：**8类PBR三联贴图、海报、本地字体/出处证据。
- **自查：**每图尺寸/四边缝RGB差/大小/alpha均合理且完整。
- **测试：**`tests/assets.test.js` + `node scripts/verify-assets.mjs`。
- **完成条件：**运行所需资产全在仓内，无失效下载链接。
- **设计条款：**A5、§5.4、AC02/07。

### T05 Renderer/WebGL2安全启动/诊断
- **依赖/前置：**T01,T03。
- **步骤：**实例化WebGLRenderer、PerspectiveCamera、WebGL2检查和错误备用页；resizeObserver+contextlost一次复原、debug snapshot和释放链。
- **位置：**`src/core/renderer.js#createRenderer`、`resources.js#loadAssets`、`diagnostics.js#snapshot`。
- **产物：**真实WebGL2首帧和错误恢复 UI。
- **自查：**人工禁GPU后能见清晰错误页，不是白屏。
- **测试：**`tests/render-config.test.js` + Playwright真实生产页console收集。
- **完成条件：**可渲染或明确安全失败，无资源泄漏/无限重试。
- **设计条款：**B1、D、C01。

### T06 浮岛、崖壁、地质层、水镜
- **依赖/前置：**T04,T05。
- **步骤：**seeded非圆外轮廓/多级坡面、连续悬崖节理与侵蚀、LOD、岸边过渡、18×11m水镜和曲线小溪。
- **位置：**`src/world/island.js#createIsland`、`rocks.js#makeStrata`、`water.js#createReflectingPool`。
- **产物：**从侧视看有体积与分层的岛体。
- **自查：**线框查大三角、坑洞和自交；近看非刺球/圆盘。
- **测试：**`tests/geometry.test.js` 检查bounds/法线/退化三角、保存侧景截图。
- **完成条件：**地貌与云交界合理、无刺球。
- **设计条款：**§5.3短板3/4、AC07。

### T07 主城建筑群和近景材质
- **依赖/前置：**T04,T05,T06。
- **步骤：**主塔/钟塔/4角塔/2侧殿/双城垣/拱廊/扶壁；24真实深窗及券石；石/木/瓦/铜UV、trim石线脚、旗幡；重复小构件用InstancedMesh/BufferGeometryUtils合并。
- **位置：**`src/world/castle.js#createCastle/createArch/createButtress`、`src/config/visual.js#ARCHITECTURE`。
- **产物：**完整错落剪影与近距离细节城堡。
- **自查：**从hero/detail取图检查高差/脊饰/门洞深度/材质。
- **测试：**`tests/geometry.test.js` 检查塔高比≥1.85、拱窗≥24、每构件UV和包围盒。
- **完成条件：**不能仅由基本盒/圆锥构成，分层可辨。
- **设计条款：**§5.3短板1、§3安全区、AC07。

### T08 植被、路径、细部场景
- **依赖/前置：**T06,T07。
- **步骤：**三种轮廓差异明显的树+LOD/impostor、铺路、苔石、悬根、岩隙草、窗灯道具，seed保证复现。
- **位置：**`src/world/trees.js#createTrees/updateLOD`、`castle.js#addProps`。
- **产物：**自然高低密度植被和微景。
- **自查：**3种树分别侧面截图，确认不是“圆锥+圆柱”。
- **测试：**`tests/geometry.test.js` 物种数、实例数、LOD门槛。
- **完成条件：**主体轮廓无遮挡、LOD可测、calls未超预算。
- **设计条款：**§5.3短板5、AC03。

### T09 天空、时刻与投影光
- **依赖/前置：**T05,T07,T08。
- **步骤：**天空散射、太阳与星、方向光2048、ambient、cast/receive shadows、灯具 emissive、四预设插值和空气透视。
- **位置：**`src/world/sky.js#createSky`、`lights.js#applyTime`、`src/shaders/sky.glsl`。
- **产物：**四种不同但均能看清建筑层次的时间环境。
- **自查：**太阳位置、阴影方向和灯光一致，夜晚仍有轮廓。
- **测试：**`tests/render-config.test.js` 光照预设有效/无NaN，Playwright多时刻屏幕对比。
- **完成条件：**主角不漂浮于无阴影背景。
- **设计条款：**§5.3短板6/7、AC04。

### T10 体积云、云影与云隙光
- **依赖/前置：**T05,T06,T07,T09。
- **步骤：**raymarch真实3D密度、半分辨率云颜色/透射/深度、4步太阳积光、自阴影、深度合成、历史buffer/重投影和拒绝失效历史、12步光束。
- **位置：**`src/world/clouds.js#createClouds`、`src/shaders/clouds.glsl`、`cloud-composite.glsl`、`src/fx/shafts.js`。
- **产物：**空间翻卷、暖高光冷影、正确前后遮挡云海。
- **自查：**从侧景不同角度，云团高度视差正确；塔尖不被远处白云盖住。
- **测试：**`tests/render-config.test.js` 体积界限/参数；`scripts/analyze-image.mjs` ROI云差。
- **完成条件：**两块有效云ROI差≥.12，禁止billboard替代。
- **设计条款：**§5.5 P4–P6、AC04/07。

### T11 AO、tone mapping、后期链闭环
- **依赖/前置：**T09,T10。
- **步骤：**组装P0–P10，从正确共享HDR/depth创建AO，bloom/DOF/grain/vignette；测试单次ACES+OutputPass，无双gamma/失焦闪烁；每pass标注dimensions和启用档位。
- **位置：**`src/core/pipeline.js#createPipeline`、`src/fx/{ao.js,dof.js,grading.js}`。
- **产物：**完整电影化渲染，不会白雾过曝，测量就绪。
- **自查：**分别禁用每个pass取图观察差异，关后期时建筑/云仍成立。
- **测试：**`tests/render-config.test.js` 校验pass顺序和输出转换仅一次、真实截图初验直方图。
- **完成条件：**AC04四项可自动执行并达到，阴影AO正确。
- **设计条款：**§5.5、§5.7、A2、AC04。

### T12 镜头、引导、天气与程序声
- **依赖/前置：**T03,T09,T10,T11。
- **步骤：**实现三幕/任意操作中断、4预设相机、pan/dolly/orbit边界与复位；晴/薄雾/雨三状态；WebAudio风/钟/雨合成、用户点击才启动、摄影模式和PNG存储。
- **位置：**`src/camera/{rig.js,intro.js}`、`src/world/weather.js`、`src/audio/soundscape.js`、`src/ui/controller.js#bindControls`。
- **产物：**真正可玩、可摄、可切换的场景。
- **自查：**鼠标/触屏/键盘逐条走§4.3旅程，用户拖动立即打断片头。
- **测试：**`tests/state.test.js` + `tests/e2e.test.js` 验证相机位置改变、下载非零、时间天气画面变、reduce不报错。
- **完成条件：**AC05全部动作通过，无闪回/越界/失焦异常。
- **设计条款：**B1–B5、C、C05–C10、AC05。

### T13 Governor、LOD与超预算退出路线
- **依赖/前置：**T08,T10,T11,T12。
- **步骤：**120帧滑窗p50/p90、冷却和档位内缩放、GPU预算按§5.6顺序剥离；WebGL info每帧reset，记录scale/LOD/pass启用；模拟fps抖动单测。
- **位置：**`src/core/governor.js#createGovernor`、`src/core/diagnostics.js#recordFrame`、`src/core/pipeline.js#setTier`。
- **产物：**性能诊断接口和低/均衡/极致3种画质策略。
- **自查：**模拟帧超预算自动降scale、再稳后缓慢升但不振荡。
- **测试：**`tests/governor.test.js` 阈值/手动锁档/后台停测/重置；Chromium真机60帧采样。
- **完成条件：**不把60个相同帧算作通过，calls/triangles整帧按口径真实测。
- **设计条款：**D、§5.6、AC03。

### T14 四态完善、响应式与无障碍
- **依赖/前置：**T02,T03,T12,T13。
- **步骤：**C01–C10全部状态逐组件落地、焦点转移/ESC/ARIA/禁用原因、375/480/768/1024/1440布局、安全区、200%缩放、reduced motion、触屏滚动保护。
- **位置：**`src/ui/app.css`、`controller.js#renderUI`、`index.html`、`src/camera/rig.js#onViewportChange`。
- **产物：**正式首屏、可靠降级与响应设计。
- **自查：**仅键盘完成时间/天气/画质/拍照/复位，375px无横向滚动，200%无文字剪断。
- **测试：**`tests/e2e.test.js` 包括Tab/焦点/ARIA/禁用/弹层/断点/字体放大；color-contrast自动输出。
- **完成条件：**设计质量线A–C无FAIL，G禁项为零。
- **设计条款：**§3全部令牌与C01–C10、§4、A–C。

### T15 真实浏览器测量与自动截图
- **依赖/前置：**T11,T12,T13,T14。
- **步骤：**run-e2e内部启动 `npm run preview -- --port 4173`，**生产dist** 新Chromium context固定viewport/DPR=1，page.on console/pageerror；routing将跨域请求写到json并abort，注意外部网络请求“企图”也算FAIL（不能拦截后变0）；wait scene ready、seed/time锁定，截图三张；冻结governor保60个不同rAF帧，计算p50和调用数/三角；PNG解析ROI/直方图/HSV、自动写指标和叠框图；stdout test counts用真实npm test输出读取。
- **位置：**`scripts/run-e2e.mjs#runProductionE2E`、`scripts/analyze-image.mjs#analyzePng`、`tests/e2e.test.js`、`reports/evidence/`。
- **产物：**hero1920.png、side1920.png、mobile375.png、cloud-rois.png、network.json、frame-samples.json、visual-metrics.json、console.json。
- **自查：**检测网络哨兵确实会捕获人为注入的外域请求；截图足尺且非空；相机预设对得上。
- **测试：**`npm run build && npm run test:e2e`；故意将contrast/截图ROI阈值调坏应真的FAIL以验证测试不作假。
- **完成条件：**AC01–AC05所有阈值有原始实测值而不是手写PASS。
- **设计条款：**F核验、AC01–AC05、§5.7。

### T16 美术完成度逐项整改与手动体验
- **依赖/前置：**T15。
- **步骤：**先解析失败项而不是随机加滤镜。若bins<200→扩大有形体天空/岩石亮暗层；若S<.12→增强有局部色分离的云阴/屋顶/植被；若P差<.55→重新定日照方向/曝光/暗影，并避免压爆亮部；若云差<.12→调整体密度与日照积分。每次都重跑生产截图与脚本。截图实地比照十项弱点表、塔楼被遮压UI就改镜头/锚点。
- **位置：**`src/config/visual.js`、`src/world/*`、`src/core/pipeline.js`、`reports/quality-matrix.md`。
- **产物：**最终镜头与材质、视觉检查勾选及每项“截图局部/指标”证据。
- **自查：**英雄/侧视/拱廊/岩基按100%、200%局部放大检查，帧推不闪、云不拖影、树不扎堆。
- **测试：**完整 `npm test && npm run test:e2e && npm run test:design`，AC03不得因美术修订下降。
- **完成条件：**上一轮十项短板逐项PASS或确实标FAIL，不接受“看起来差不多”。
- **设计条款：**A–G、AC03/04/07。

### T17 CI/部署/交付闭环
- **依赖/前置：**T16。
- **步骤：**CI执行npm ci/build/test/test:design及可运行的浏览器E2E；配置Pages部署dist；打开匿名URL验证资源来自部署域、页面显示3D/控制与截图；写README架构、运行方式、资产许可、控制表/报告；提交所有PNG/JSON/命令原始输出/版本/sha。
- **位置：**`.github/workflows/{ci.yml,deploy.yml}`、`README.md`、`reports/latest.md`、`reports/quality-matrix.md`、`reports/evidence/*`。
- **产物：**可公共访问静态站URL，完整可复核交付证据。
- **自查：**远端main SHA与报告被测SHA相同，CI head SHA相同，外部请求0。
- **测试：**本机命令全重跑，GitHub Actions看同源码的成功日志，匿名浏览器URL 200与实际渲染。
- **完成条件：**AC01–AC07全PASS、报告记录原始值且发布可用；否则报告写“NOT DELIVERABLE”与阻塞项，绝不虚称成功。
- **设计条款：**E/F/G、§8–9。

## 7. 未知信息：调查入口、判据、确定分支、上限

| ID /问题 | 真实调查入口与判定 | A/B执行分支（无需询问） | 时间上限 |
|---|---|---|---|
| U01 AI图片是否都可生成、可下载 | 执行简报的 `mcode-tools connector call connector__matrix__generate_image` → `mcode-tools get_asset_url`；检查success_items/download_url/实文件magic bytes和尺寸 | 2次重试成功→用AI图；仍失败→`scripts/build-assets.mjs` 生成seed固定的多尺度块砌色差/裂缝/苔线合成纹理，仍提供albedo/normal/roughness，报告明确AI失败张数，**不能用纯均匀墙** | 单素材4分钟，合计20分钟 |
| U02 WebGL2/Float RT是否具备 | Chromium `gl.getParameter(gl.VERSION)`；`gl.getExtension('EXT_color_buffer_float')`；浏览器debug snapshot | WebGL2+float有→RGBA16F HDR；仅WebGL2但无float→RGBA8+预曝光/缩减光强防溢色；无WebGL2→备用静态说明/明确AC02 3D失败，不伪装成功 | 15分钟 |
| U03 sharp/pngjs精确版本是否可装 | `npm view sharp version` / `npm view pngjs version`、`npm install`，再 `node -e "import('sharp').then(()=>console.log('OK'))"` | 版本可用→锁定；不可用→安装当前npm可获得、兼容Node26的最近稳定版，更新lockfile与报告偏差；仍不可用→Node Canvas自实现轻量PNG分析用pngjs，WebP用系统已有图像工具（只有通过真实输出校验才可用） | 15分钟 |
| U04 GTAO和外部depth/normal能否稳定接 | 官方 https://threejs.org/docs/pages/GTAOPass.html 与安装后 `node_modules/three/examples/jsm/postprocessing/GTAOPass.js`；构建/Playwright画黑白对比 | 可以→half-res GTAO；不可→在 `src/fx/ao.js` 独立8tap SSAO/HBAO+双边blur+geometry contact shadow，必须保AO与测量 | 45分钟 |
| U05 Pages是否有权限部署私有仓 | `gh api repos/noyzin2006-arch/20261024223815-cloud-castle/pages`、`gh run list` 与deploy run logs；确认匿名访问最终网址 | 可启用Pages→Pages部署/验收；403/政策阻挡→使用**已由本机验证可登陆的**其它静态托管服务（不得引入付费API或在计划中声称已有凭据）；都无法部署→如实AC07 FAIL，交付完整dist与本地preview运行命令，不冒充公网交付 | 30分钟 |
| U06 无头Chromium软件渲染导致性能与真实GPU不同 | `chrome://gpu`（可视模式）与 `gl.getParameter(UNMASKED_RENDERER_WEBGL)`、Playwright headful/headless分别跑相同120帧 | GPU硬件可用→以简报本机真实1920×1080评测；只能SwiftShader→保存软件测值并另跑本机headful hardware，不能偷偷舍弃失败组；硬门槛没有通过仍判FAIL | 40分钟 |
| U07 手机支持与 WebP解码差异 | Playwright mobile context截图375×812，手机Safari实机如可用打开匿名部署URL，观测texture render/触屏 | 成功→手机正式支持；某浏览器不支持WebP或纹理格式→fallback PNG/JPEG材质及low tier，记录设备并以基线Chromium AC02为最终判据 | 20分钟 |
| U08 资产许可证/字体子集准确性 | 对上游字体正规OFL发行记录、`public/assets/PROVENANCE.md`和hash执行 `node scripts/verify-assets.mjs` | 来源授权明确→提交二进制+许可证；不明确→不能使用，换OFL家族同级字体并更新令牌及截屏证据，不采用版权不明资产 | 20分钟 |
| U09 真实ROI无法找到≥90%纯云区 | `node scripts/analyze-image.mjs reports/evidence/hero1920.png` 查看cloud mask和ROI overlay | 存在合法ROI→计算同一sRGB亮度差；不存在→调整相机/云团布局或出具FAIL，**不可选墙体天空凑值** | 30分钟 |
| U10 几何draw calls超120 | `window.__CASTLE_DEBUG__.snapshot()`、renderer.info逐帧数据、wireframe重叠调试 | 高于阈值→先合并砖纹/窗楣/植被instancing，再减透明pass，最后降低超远景LOD；不得删主体建筑完整性 | 60分钟 |

未知信息处理原则：到时限仍不确定，选**可解释保守分支**并在报告标记未证实，任何硬验收不达标仍判失败；不向规划者返问。

## 8. 本机验收、启动、回归、视觉自检

### 8.1 必须实际执行的命令
```sh
node --version
npm ci
npm run build
npm test
npm run test:design
npm run test:e2e
npm run preview -- --port 4173
# 另开终端真正启动Playwright/浏览器验证 http://127.0.0.1:4173/
# 构建后按需：node scripts/verify-assets.mjs
# 构建后按需：node scripts/analyze-image.mjs reports/evidence/hero1920.png
```
`npm ci`/build/test都应exit0；e2e需生成3张准确尺寸PNG和原始JSON。**统计测试条数唯一真源：npm test的完整stdout，程序从实际测试运行结果抓取pass/fail/skip，而不是报告作者手填或从测试文件数估计。** 内含60帧采样必须 frameId逐个不同、timestamp严格递增；每帧输出drawCalls/triangles/scale，报告包含fps计算公式：按连续rAF帧间隔 `fps_i=1000/(t_i-t_{i-1})`，取60个真实间隔中位；首次边界上一帧也需记录供差分。不要用 requestAnimationFrame 回调时间模拟实际GPU完成时间的说法：同时记录CPU renderMs及GPU信息，明确RAF FPS ≠ 独立GPU耗时。

### 8.2 网络/异常/路径测试
Playwright先 `page.on('request')` 和 `context.route('**/*')` 记录所有实际请求；以页面origin比较跨域 **attemptedRequests**，即使route阻断也算外部网络企图>0→FAIL。collect console.error/pageerror；故意在单测中发一个跨域请求，确保监测非空（不把故意故障纳入正式验收结果）。开生产页面、等待 `window.__CASTLE_DEBUG__` ready/debug信息，访问 `?view=side&tier=low`、无效URL、重新加载以及深链；核查资源hash/404、context lost、下载Blob>0。

### 8.3 交互手动+脚本回归
必须逐条操作：鼠标左拖旋转、右拖平移、滚轮缩放、Touch一指旋转、双指pinch/pan、键盘Tab+Enter操作四时刻/三天气/三档画质、R复位、3个导览点、H进出摄影、S保存图像、Esc退出Dialog、M静音、操作中打断intro、失焦/返回、画质低档保留云体亮暗、切换风雨后晴朗的雨粒复位、prefers-reduced-motion动态切换。旧行为回归：hero复位不变、夜间仍能看清、URL参数刷新恢复、低性能不会UI冻结、截图不被HUD污染、摄影不破坏键盘返回、相机不会落入岛内。每项记录输入动作→预期/实际→PASS/FAIL→截图或日志路径。

### 8.4 逐条视觉自检映射 A–G
- **A1**：字体真实加载+fallback、6级字阶/行高、≤40汉字、数字定宽、段距；截图CSS computed style证据。
- **A2**：自动记录4组对比比值（正文、次文、控件边框、禁用），≥4.5/3/2阈；检查不是只凭色彩表义。
- **A3**：4px节拍/限宽/分组间距、375/1440无不合理留白，截图。
- **A4**：阴影层级、z index集中、相同按钮相同圆角和边界；dialog不遮焦点。
- **A5**：统一icon viewBox/stroke，所有img有alt/装饰空alt，媒体有尺寸且CLS≤0.1。
- **B1–B5**：C01–C10每一项D/H/P/F/X/L/E/Ø/S有证据或明确不适用理由；响应100ms/300ms/1s/10s、导航与返回、文案、375px触控至少44px。
- **C**：拔鼠标仅键盘走完所有主动作、200%文字不重叠、ARIA和reduced motion均用浏览器实测。
- **D**：首屏交互≤2.5s，性能 60不同帧 p50FPS≥55、calls≤120、tris≤1.5M；CSS动画只动transform/opacity，不在JS每帧修改DOM布局属性。
- **E**：tokens唯一真源、同组件状态完全一致、目录职责清晰，无dead TODO。
- **F**：真实浏览器检查hero + side + mobile + 空/载/错/成功、对比度与键盘走查，逐项写做了什么/看到什么。
- **G**：任一默认浏览器样式、占位文案、emoji、键盘焦点不可见、移动溢出、外部运行请求、无视reduced-motion即直接FAIL。

**艺术检查表**：100%+200%局部放大看砖缝/檐口/窗洞/屋面/悬崖侵蚀/树干分枝；英雄照片对照画面安全区，右下HUD不压城；云亮暗mask ROI不能是天空；主视角直方图必须脚本通过；旋转近看墙面纹理不发生“大规模拉伸”；太阳束遮挡与太阳位一致；动作中镜头/云无闪烁、时间变更不“啪”跳色。每一个问题在 `reports/quality-matrix.md` 写证据图与处理，不写“已看，无问题”空话。

### 8.5 判决机制
**READY_FOR_DELIVERY** = AC01–AC07全部PASS+远端公开URL实际验证+报告的被测源码SHA与GitHub最新主分支完全一致；否则**NOT_READY**并列 blockers、实测数值和最短修复序。局部缺少手机实机（若没有）必须标 NOT TESTED，不借模拟器宣称实机；不得把未验证项默认PASS。视觉线即便功能全绿也不可免除。

## 9. 首次交付必须提交的清单与证据格式

**源文件必须具备：** §5.1列出的全部应用代码、shader、UI、assets与 O​FL 许可证、package-lock、Vite配置、离线生成与校验工具、node:test+Playwright、CI与部署workflow、README（运行/设备/控制/架构/资产授权/发布URL）。即使某可选效果因明示分支被替代，也保留工作实现与明确说明，不得留下假空文件/TODO。

**报告位置与章节**：`reports/latest.md` 须包含 ① 被测源码全SHA/报告SHA与构建时间/本机环境；② 需求AC01–AC07逐项硬判决；③ npm ci/build/test 原样stdout/stderr/退出码以及**从实际日志提取**的测试条数；④ 浏览器Chromium版本、真实GPU renderer/SwiftShader与viewport/DPR/画质档；⑤ 60帧frameId/time/fps/calls/tris采样文件路径、中位数、Governor调整轨迹；⑥ P1/P99直方图bins/HSV/双云ROI坐标/覆盖率/亮差；⑦ 3张截图与额外近景对照，C01–C10四态证据；⑧ A–G逐条质量线自检；⑨ 所有手测/未测（含iOS实机）清单；⑩ 部署URL/Actions URL/匿名测试时间；⑪ 偏离本方案条目、原因、实现替代、余下缺陷、完成结论。

**证据硬路径（至少）：**
- `reports/evidence/hero1920.png`：1920×1080英雄；`side1920.png`：1920×1080侧景；`mobile375.png`：375×812窄屏；`detail-closeup.png` 和 `rock-closeup.png`：材质/岩壁近景。
- `reports/evidence/cloud-rois.png`：两块64×64真实云ROI框标；`visual-metrics.json`：bins、百分位、HSV、亮差、坐标及算法版本。
- `reports/evidence/frames-60.json`：至少60个**不重复**frameId、时间戳、ms间隔、calls、triangles、tier、scale；`network.json`：全部请求来源与跨域企图0；`console.json`：console/pageerror；`actions.json`：操作测试结果；`npm-test.log` 与 `build.log`：真实完整输出。
- `reports/quality-matrix.md`：A1–E/F/G逐项“PASS/FAIL/NOT_TESTED/N/A+解释+证据路径”；`reports/shortcomings-closure.md`：上一轮10缺陷→本轮修正技术→截图/指标→结论。
- `public/assets/PROVENANCE.md`：贴图/字体sha256+来源+处理工序/许可证；`README.md`：可复现命令、静态部署、交互说明与本轮范围外。

**质量证据不造假**：任何测试日志丢失→重新在被测精确 commit 同一工作树中执行，不能复制旧项目的“62/62”或手写“pass 27”；不得以其他尺寸截图缩放到1920×1080冒充原生capture；截图生成脚本必须将 viewport、DPR、相机姿态写JSON供第三方复查；任何本机未做的工作要明确“未验证”。

## 10. 执行 Agent 遇困处置与最终行动准则

1. **零返问原则：**本轮规划即全部授权。新问题先按本规划 §3令牌 / §5渲染逻辑 / §8证据线` 做相容且可运行的确定选择；在 `reports/latest.md` 写“偏离§X，原因Y、替代Z、验证证据W”。不能以等待网页版规划Agent回复为阻塞条件。
2. **API与真实环境冲突：**优先遵守已安装的Three 0.186.1/Vite 8.3.5/Playwright 1.64.1实际可用 API，用第7节的确定分支替代；保留艺术目标与验收门槛。严禁为了凑通过在数据采样、视觉PNG后处理、断言和配色脚本中人为造假。
3. **失败的最短路径**：优先“正确渲染主角→正确深度体云→云光/阴影→满足截图阈值→性能自调→体验/无障碍→发布”。若材质下载失败，以程序纹理保底；若某post与当前composer冲突，改成轻量等价pass；若帧率不足，先减半分辨率云步数/降低后期采样和远景LOD，但**绝不删体积云、石砌材质、真实投影和关键交互**。图形错误需保留可读备用页。
4. **范围锁定：**不能擅加后端/多人/付费模型/VR，也不可把精力消耗在外部仓库或上一轮代码。仅新建本轮所需资产，禁止复用无许可作品。执行过程中不再调用规划方进行审批。
5. **阶段门槛：**T01–T05失败不得进入大规模美术制作；T06–T11若无可信体积云/构图不得先装饰 UI；T12–T14未达不可称“交互完成”；T15、T16没给原始数据不得宣传“世界级”；T17公开URL未经匿名验证不得称“已上线”。
6. **发布与真实结论：**提交源码/全部运行时资产/原始测试证据/报告到仓库，推送指定 main；记录最终 commit SHA。所有AC硬过才在报告最后写独立行 `READY_FOR_DELIVERY`；否则写 `NOT_READY` 及阻塞项与处理结果。GitHub写入失败，则把完整规划文本交付给用户，不假称提交成功。

**规划终点：**执行方拥有完整架构、设计系统、渲染依赖关系、资产产生方式、调速算法、可运行的测试命令、失败分支和交付格式。下一步是按T01→T17在本机真正做完并以证据判定，而不是再开一轮规划。

