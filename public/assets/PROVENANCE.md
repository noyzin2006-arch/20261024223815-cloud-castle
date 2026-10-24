# 资产出处与处理记录（PROVENANCE）

- 生成日期：2026-10-24
- 生成工具：`scripts/build-assets.mjs`（sharp 0.35.5 / libvips 8.18.7 / Node v26.0.0）
- 用途：AETHERKEEP 云际圣堡 —— 漂浮于云海之上的实时 Three.js 场景
- 原始图生成方式：AI 图像生成（2K，正方形材质 1:1、海报 16:9），逐条 prompt 与 node_id 见下表。
- **所有运行期资产均随仓库本地托管，运行时不发起任何外部字体/贴图/图片请求。**

## 1. AI 原始图清单

| 资产 | node_id | 生成日期 | 原始文件 | 原始格式/尺寸 | 原始 sha256 | 用途 |
| --- | --- | --- | --- | --- | --- | --- |
| A01-castle-ashlar | 455893884334435 | 2026-10-24 | A01-castle-ashlar.jpg | jpeg 2048x2048 4550132 B | `0eb30ee3831c845d0633b35009409ef0a77b379fd2ddeb1236f6c14e67965cc8` | 城堡外墙石灰岩砌块 (cool pale limestone ashlar) |
| A02-sandstone-voussoir | 455894147842514 | 2026-10-24 | A02-sandstone-voussoir.jpg | jpeg 2048x2048 5164448 B | `d005fdf1a939154c0ffbb3c4eecfb5941b5c050e8fce4375ff227b3a8f9d31f0` | 拱券砂岩楔石 (warm taupe weathered sandstone voussoir) |
| A03-basalt-foundation | 455893800169708 | 2026-10-24 | A03-basalt-foundation.jpg | jpeg 2048x2048 4306342 B | `5f55a1878a70de316c4d0a0e6d92d0c3b0db44a5483c55a9b361ee3b32fd19bf` | 基座玄武岩砌体 (dark blue basalt foundation masonry) |
| A04-slate-roof | 455893800169704 | 2026-10-24 | A04-slate-roof.jpg | jpeg 2048x2048 4093163 B | `96e9d1f7922d41abd6d92688becd62e4dc771caa6edf48921b3795bc9c34ecbd` | 屋顶蓝灰板岩瓦 (overlapping blue charcoal slate roof tiles) |
| A05-stratified-cliff | 455902498427008 | 2026-10-24 | A05-stratified-cliff.jpg | jpeg 2048x2048 4434877 B | `5977b7acfa42b08d78292a9c337200a9dcdf228e1c2fe9738568c4f464a2fa60` | 浮岛崖壁层状沉积岩 · 冷灰 (wind eroded stratified sedimentary cliff, pale cool grey-beige) |
| A06-flagstone-path | 455894214062552 | 2026-10-24 | A06-flagstone-path.jpg | jpeg 2048x2048 5476072 B | `bac3fc47e28d9c09724e2232a74bfb83e39524fe8ed33d54bae48b2a746ff670` | 石板路 (old flagstone pathway with moss) |
| A07-carved-oak | 455893682532658 | 2026-10-24 | A07-carved-oak.jpg | jpeg 2048x2048 4319730 B | `76c983e9dbcf147d7117db731eb857f2e7908951b5ffcce27615ddcab1b76cb7` | 雕刻橡木板材 (dark carved oak planks) |
| A08-aged-bronze | 455894182822073 | 2026-10-24 | A08-aged-bronze.jpg | png 2048x2048 7381824 B | `d462b9d97d14817c0636597d2554bbb969a0597169cd4ecd3a31a3286dec8152` | 陈旧青铜板 (aged bronze sheet metal with green patina) |
| poster | 455894147842552 | 2026-10-24 | poster.jpg | jpeg 2752x1536 2518711 B | `f3391ca5fdaaf558e173815cba2b37166085dd54a637fabbe9f0b52061b5a70c` | 16:9 概念海报 / 无 WebGL2 时的静态备用图 |

> 原始图副本归档在 `assets/raw/`（已在 `.gitignore` 中，不入库）。

## 2. 完整英文 prompt（可原样复跑）

### A01-castle-ashlar · 城堡外墙石灰岩砌块 (cool pale limestone ashlar)

```text
cool pale limestone ashlar blocks, irregular 20-40 cm mortar seams, age stains and sparse lichen, seamless tileable texture, flat even lighting, no shadows, no objects, orthographic top-down, photorealistic PBR albedo map, evenly exposed, no specular reflections baked in, no perspective, no text, no watermark
```

### A02-sandstone-voussoir · 拱券砂岩楔石 (warm taupe weathered sandstone voussoir)

```text
warm taupe weathered sandstone voussoir blocks, fine iron mineral bands, seamless tileable texture, flat even lighting, no shadows, no objects, orthographic top-down, photorealistic PBR albedo map, evenly exposed, no specular reflections baked in, no perspective, no text, no watermark
```

### A03-basalt-foundation · 基座玄武岩砌体 (dark blue basalt foundation masonry)

```text
dark blue basalt foundation masonry, subtle chalk mortar, seamless tileable texture, flat even lighting, no shadows, no objects, orthographic top-down, photorealistic PBR albedo map, evenly exposed, no specular reflections baked in, no perspective, no text, no watermark
```

### A04-slate-roof · 屋顶蓝灰板岩瓦 (overlapping blue charcoal slate roof tiles)

```text
overlapping blue charcoal slate roof tiles, chipped edges and varied hue, seamless tileable texture, flat even lighting, no shadows, no objects, orthographic top-down, photorealistic PBR albedo map, evenly exposed, no specular reflections baked in, no perspective, no text, no watermark
```

### A05-stratified-cliff · 浮岛崖壁层状沉积岩 · 冷灰 (wind eroded stratified sedimentary cliff, pale cool grey-beige)

```text
wind eroded stratified sedimentary cliff face in pale cool grey-beige limestone, horizontal layers and fissures, desaturated muted tones, no orange or red rust tones, seamless tileable texture, flat even lighting, no shadows, no objects, orthographic top-down, photorealistic PBR albedo map, evenly exposed, no specular reflections baked in, no perspective, no text, no watermark
```

### A06-flagstone-path · 石板路 (old flagstone pathway with moss)

```text
old flagstone pathway with patchy moss and chipped limestone, seamless tileable texture, flat even lighting, no shadows, no objects, orthographic top-down, photorealistic PBR albedo map, evenly exposed, no specular reflections baked in, no perspective, no text, no watermark
```

### A07-carved-oak · 雕刻橡木板材 (dark carved oak planks)

```text
dark carved oak planks, continuous aged grain, narrow board seams, seamless tileable texture, flat even lighting, no shadows, no objects, orthographic top-down, photorealistic PBR albedo map, evenly exposed, no specular reflections baked in, no perspective, no text, no watermark
```

### A08-aged-bronze · 陈旧青铜板 (aged bronze sheet metal with green patina)

```text
aged bronze sheet metal, subtle hammered dents and green patina, diffuse-only albedo, seamless tileable texture, flat even lighting, no shadows, no objects, orthographic top-down, photorealistic PBR albedo map, evenly exposed, no specular reflections baked in, no perspective, no text, no watermark
```

### poster · 16:9 概念海报 / 无 WebGL2 时的静态备用图

```text
wide painterly concept art of a soaring stone gothic castle on an eroded floating island above a dramatic layered cloud sea at golden blue dawn, primary architecture center-right, deep cool cloud shadows and amber highlights, empty editorial title-safe space on left, no text, no logo
```

## 3. 处理工序（逐资产）

通用工序（`scripts/build-assets.mjs`，幂等）：

1. **读取**：按文件内容嗅探魔数读取原始图（扩展名与实际编码可能不一致，以内容为准）。
2. **缩放**：`sharp(...).removeAlpha().resize(2048, 2048, { kernel: "lanczos3" })`。
3. **接缝处理（镜像填充 / mirror fill）**：
   右侧带（w−B…w−1）用左侧带（0…B−1）的**镜像**内容填充，权重沿 smoothstep 从 0 升到 1；
   下侧带同理镜像上侧带。B=96px（按输出分辨率等比缩放，最低 48px）。
   于是 `G[w-1] ≡ G[0]`、`G[h-1] ≡ G[0]`（像素级相等），平铺后接缝零跳变。
   *为何不用「循环平移 + 淡化」*：那种做法只能让接缝两侧落在原图**相邻**的两个像素上，
   边界差 ≈ 单像素梯度；本组贴图颗粒很重，单像素梯度本身就有 0.05 左右，达不到 ≤0.06 且毫无余量。
4. **albedo**：`sharp(..., { raw }).webp({ quality: 82 })`；体积超限时按 2048→1536→1280→1024（再降质量）逐级回退，且不低于 1024×1024。
5. **normal**：
   - 高度 = 多尺度亮度高通：`0.65×(L−blur₄) + 0.35×(L−blur₂₄)`；
   - 高通结果做**软阈值收缩**（65% 分位点）：压掉细颗粒与 JPEG 块噪声，保留灰缝、裂纹、板缝等真实结构；
   - 再叠加**暗缝掩码**（明显暗于局部均值的细线，深度按高度场 RMS 归一，掩码先平滑成连续沟槽）；
   - 3×3 Sobel 求 X/Y 梯度，按梯度分位数自适应定标（放大倍数上限 200，避免弱结构材质被压成平面），坡度上限 2.2；
   - `N = normalize(−gx·0.55, +gy·0.55, 1)`，**OpenGL / +Y-up 切线空间约定**（与 three.js 默认 `flipY = true` 对齐，绿色通道朝上）；
   - 64 级色阶量化后编码为**无损 WebP**（`webp({ lossless: true })`）。
6. **roughness**：`r = lerp(min, max, 0.62×亮度 + 0.38×固定 seed 高频 value noise)`，灰度写入 RGB 三通道（three.js 取 G 通道）。
7. **海报**：`resize(1024, 576)` → JPEG（4:2:0），必要时降质量至 ≤300KB；同时另存 `poster.webp`。

| 资产 | albedo | normal | roughness | 粗糙度区间 | 接缝左右 RGB 差 | 接缝上下 RGB 差 |
| --- | --- | --- | --- | --- | --- | --- |
| A01-castle-ashlar | 2048x2048 q80 | 1024x1024 无损 | 1024x1024 | 0.66–0.9 | 0.012327 | 0.012513 |
| A02-sandstone-voussoir | 1536x1536 q82 | 1024x1024 无损 | 1024x1024 | 0.66–0.9 | 0.012662 | 0.012361 |
| A03-basalt-foundation | 2048x2048 q82 | 1024x1024 无损 | 1024x1024 | 0.66–0.9 | 0.011769 | 0.014504 |
| A04-slate-roof | 2048x2048 q82 | 1024x1024 无损 | 2048x2048 | 0.56–0.75 | 0.011522 | 0.012963 |
| A05-stratified-cliff | 2048x2048 q80 | 1024x1024 无损 | 1024x1024 | 0.66–0.9 | 0.013738 | 0.012739 |
| A06-flagstone-path | 1536x1536 q82 | 1024x1024 无损 | 1024x1024 | 0.66–0.9 | 0.012731 | 0.0128 |
| A07-carved-oak | 2048x2048 q82 | 1024x1024 无损 | 1024x1024 | 0.56–0.75 | 0.010158 | 0.011851 |
| A08-aged-bronze | 2048x2048 q82 | 1024x1024 无损 | 2048x2048 | 0.32–0.55 | 0.010894 | 0.011133 |

> 接缝自检指标定义：对每个像素行比较最左列与最右列的 RGB 绝对差，除以行数×3×255 得到 0–1 归一化均值；上下方向同理。阈值 ≤0.06。
> 上表数值取自**编码后的 albedo 文件解码复算**的结果（不是构建时的一次性中间量）。
> 该指标由 `scripts/verify-assets.mjs` 从产物文件本身独立复算，任一项不达标即以非 0 退出码失败。

## 4. 字体

三个家族均为 SIL Open Font License 1.1，允许再分发与嵌入：

| 家族 | 字重 | 文件 | 字节 | 源码 | 许可证 |
| --- | --- | --- | --- | --- | --- |
| Noto Sans SC | 400 | `fonts/noto-sans-sc-400.woff2` | 154956 B | https://raw.githubusercontent.com/google/fonts/main/ofl/notosanssc/NotoSansSC%5Bwght%5D.ttf | `fonts/OFL.txt` |
| Noto Sans SC | 500 | `fonts/noto-sans-sc-500.woff2` | 156828 B | https://raw.githubusercontent.com/google/fonts/main/ofl/notosanssc/NotoSansSC%5Bwght%5D.ttf | `fonts/OFL.txt` |
| Noto Serif SC | 600 | `fonts/noto-serif-sc-600.woff2` | 204216 B | https://raw.githubusercontent.com/google/fonts/main/ofl/notoserifsc/NotoSerifSC%5Bwght%5D.ttf | `fonts/OFL.txt` |
| Inter | 400 | `fonts/inter-400.woff2` | 22584 B | https://raw.githubusercontent.com/google/fonts/main/ofl/inter/Inter%5Bopsz,wght%5D.ttf | `fonts/OFL.txt` |
| Inter | 600 | `fonts/inter-600.woff2` | 23340 B | https://raw.githubusercontent.com/google/fonts/main/ofl/inter/Inter%5Bopsz,wght%5D.ttf | `fonts/OFL.txt` |

本地化处理方式（分支一：`pyftsubset` 子集化）：

- 字符集来源：`index.html` 与 `src/**`（HTML/CSS/JS）全文提取 ∪ 全部 ASCII 可见字符 ∪ 常用中文标点（，。、；：？！「」『』（）《》—…· 等）
  ∪ 数字 ∪ 常用量词 ∪ 「零一二三四五六七八九十百千万亿年月日时分秒」等中文数字与时间单位；另含少量常见界面用词以留出余量。
- 变量字体先用 `python3 -m fontTools.varLib.instancer <src> wght=<N> --update-name-table -o <static.ttf>` 固化为目标字重的静态实例，
  再由 `pyftsubset`（等价入口 `python3 -m fontTools.subset`）以 `--flavor=woff2 --text-file=<charset> --desubroutinize --no-hinting` 输出 woff2 子集。
- 字体源文件缓存在 `assets/raw/fonts/`（`.gitignore` 内），构建脚本在缺失时自动从上游 OFL 仓库补齐。
- `public/assets/fonts/fonts.css` 内以相对路径声明 `@font-face`，统一 `font-display: swap`；CSS 中不含任何外部 URL。
- 三家族合计 561924 字节。
- 许可证：`public/assets/fonts/OFL.txt`（Noto 与 Inter 的完整 OFL 1.1 文本合并），另有 `OFL-Noto.txt` / `OFL-Inter.txt` 单家族副本。

## 5. 许可与声明

- AI 生成图像：由项目自有的图像生成流程产出，用于本项目的运行时材质与海报，随仓库一同分发。
- 字体：SIL Open Font License 1.1，可再分发；许可证原文随资产一并入库（见 `public/assets/fonts/`）。
- 其它第三方素材：本轮未引入；运行时不引用任何外部 CDN、字体服务或图片服务。

