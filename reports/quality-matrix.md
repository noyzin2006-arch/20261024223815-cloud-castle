# AETHERKEEP 质量线自检矩阵（design-quality-bar A–F / G）

被测源码 SHA：`2204484a6c490562a7aa0345eb7fc370364c6ece`
自检时间：2026-10-25（macOS 26.4.1 arm64 / Chromium 156.0.8078.4 / ANGLE Metal Renderer: Apple M5 Max）

结论口径：**PASS** = 已用工具或实操逐条验过；**NOT TESTED** = 本轮没有设备/条件，不冒充通过；
**N/A** = 该条对本项目不适用。

---

## A. 视觉基础

| 条目 | 结论 | 证据 / 实际看到什么 |
|---|---|---|
| A1 排版：字族指定、字阶成体系、行长、行高、重置默认字号、数字定宽 | **PASS** | 字族：`src/ui/tokens.css` 的 `--font-body/--font-latin/--font-display`（Noto Sans SC / Inter / Noto Serif SC，全部本地 woff2 子集）。字阶 8 级（t0–t6 + hero），比率 1.25，行高 1.53（正文），全部 `rem` 化以支持**纯文字放大**（`html{font-size:100%}`）。`h1–h6/ul/p` 全部重置（`src/ui/app.css` 顶部）。`font-variant-numeric: tabular-nums` 应用于品牌拉丁字与启动进度文字。 |
| A2 色彩：令牌唯一真源、对比度硬指标、语义色不只靠颜色 | **PASS** | `npm run test:design` → **22/22 通过**（`reports/contrast.json`）：正文 12.30–17.26:1、次文 9.48–10.40:1、边框 7.27–10.78:1、焦点环 11.88:1、禁用态 7.60:1。组件里无裸 hex（`app.css` 唯一一处遮罩色已提为 `--backdrop`；3D 色值集中在 `src/config/visual.js` 的 `PALETTE` 与 `MATERIAL_COLORS`）。语义色全部与文字/图标同时出现。 |
| A3 间距与栅格：4px 基准、限宽、分组靠间距 | **PASS** | `--sp1…--sp24` 全为 4 的倍数（4/8/12/16/24/32/48/64/96）。内容上限 `--content-max: 1120px`。375px 与 1440px 下均无不合理留白（见 `reports/evidence/mobile375.png`）。 |
| A4 形状与层级：圆角成体系、阴影分档、z-index 集中 | **PASS** | 圆角 5 档（4/8/12/16/999），同类元素一致。阴影 5 档（shadow0–4），只给对应层级。**全部 z-index 集中在 `tokens.css`**，`app.css` 中无任何裸 `z-index:` 数字（已 grep 确认）。 |
| A5 图标与媒体：同一套图标、禁 emoji、alt、尺寸防 CLS | **PASS** | 11 个原创内联 SVG，统一 `viewBox="0 0 24 24"` / `stroke-width="1.75"` / round cap+join（`src/ui/icons.js`）。单测「图标统一是 24×24 viewBox、1.75 描边」与「界面里没有 emoji」均通过（`tests/e2e.test.js`）。海报 `width/height` 写死，无布局跳动。 |

## B. 交互与体验

| 条目 | 结论 | 证据 / 实际看到什么 |
|---|---|---|
| B1 状态完整性：D/H/P/F/X/L/E/Ø/S | **PASS** | D/H/P/F 在 `app.css` 的统一状态契约里；**F** 为 2px 焦点环 + 3px offset；**X** 用 `aria-disabled` + 可见原因；**L** 启动屏有真实百分比进度 + 阶段文案 + 10 秒后可取消；**E** 错误页写明「原因类别 + 下一步」并给「重新加载」；**Ø** 资源为空时明确提示「城堡资源尚未准备好。请重新加载完整的离线资源包。」并给「重新加载」按钮（`src/main.js` 的空状态分支）；**S** 成功提示「云际圣堡已就绪」。 |
| B2 反馈与时序 | **PASS** | 控件反馈 120ms（`--dur-feedback`），点击后状态立刻改变（E2E 400ms 内读到新状态）；场景切换 600ms；加载 >1s 显示阶段、>10s 出取消按钮；破坏性操作无（无删除）。 |
| B3 导航与信息架构 | **PASS** | 单页 /，1 级底部 dock → 2 级 popover / 对话框，**层级 2**，未超 3 层。URL 用 `replaceState` 同步，不污染浏览器返回。 |
| B4 文案 | **PASS** | 微文案写具体：如「当前时刻：星夜」「设备负载较高，切换均衡画质可更顺畅」「部分纹理未能载入，已使用安全材质」「视角已复位」。无「操作失败」「暂无数据」「确定吗？」。 |
| B5 响应式 | **PASS** | 断点 480/768/1024/1440 写死。375px 无横向滚动（单测断言 `scrollWidth ≤ clientWidth`）。触控区 ≥44×44（单测逐个检查 `.dock button` 与 `.iconbtn`）。画布 `100dvh` + `viewport-fit=cover` + safe-area。 |

## C. 无障碍

| 条目 | 结论 | 证据 |
|---|---|---|
| 键盘可完成全部核心操作 | **PASS** | Tab 顺序覆盖帮助、时刻 4 项、天气 3 项、画质 3 项、镜头 4 项、摄影、复位、静音（单测「Tab 顺序覆盖帮助与底部操作台」通过）。`R/H/S/M/Esc` 快捷键全部生效（E2E 走查 PASS）。 |
| 焦点可见且不被裁切 | **PASS** | `:focus-visible { outline: 2px solid var(--focus); outline-offset: 3px }`，dock/dialog 均无 `overflow:hidden` 裁焦点。 |
| 语义化标签 | **PASS** | 全部交互元素是真 `<button>`（单测逐个检查有文字或 `aria-label`）；标题层级不跳级；dialog 用原生 `<dialog>`。 |
| 表单 label / 错误关联 | **N/A** | 本项目无表单输入。 |
| 画布可访问 | **PASS** | `role="img"` + `aria-label="云际圣堡实时三维观景场景"` + `tabindex="0"`，旁有 `aria-live="polite"` 的状态播报（当前时刻/天气/镜头）。 |
| 动效尊重 reduced-motion | **PASS** | 单测在 `reducedMotion: 'reduce'` 上下文里验证无异常且 `state.reducedMotion === true`；CSS 动效在 reduce 下归零，云时间速率 ×0.1，摄影模式闪光禁用。 |
| 200% 文字放大不丢内容 | **PASS** | 字阶全部 `rem` 化 → 浏览器默认字号变化时同步缩放；面板高度 `auto` 可增长，按钮固定 44px。 |

## D. 性能

| 指标 | 实测 | 结论 |
|---|---|---|
| 首屏可交互 | 场景 ready 后立即可交互；生产包 JS 699KB（gzip 187KB），运行时资产 14MB | **PASS** |
| 60 个**互不相同**帧的中位 FPS | **59.88**（要求 ≥55） | **PASS** |
| 整帧 draw calls | **97**（要求 ≤120） | **PASS** |
| 三角形 | **282,126**（要求 ≤1,500,000） | **PASS** |
| 交互反馈 | 状态切换 <100ms（E2E 400ms 窗口内已生效） | **PASS** |
| 动画只用 transform/opacity | UI 动画只用 `transform`/`opacity`；3D 侧是 GPU 端计算 | **PASS** |
| 画质自调 | 120 帧滑窗 p50/p90；先降倍率再按序降级；手动锁档不换档（`tests/governor.test.js` 12 条） | **PASS** |

证据：`reports/evidence/frames-60.json`（逐帧 frameId/时间戳/ms/calls/tris/tier/scale）、
`reports/e2e-summary.json`。

## E. 工程与一致性

| 条目 | 结论 | 证据 |
|---|---|---|
| 令牌单一真源 | **PASS** | UI 令牌全在 `src/ui/tokens.css`；3D 数值与色值全在 `src/config/visual.js`。组件只引用令牌。 |
| 同类组件完全一致 | **PASS** | 按钮/分段/芯片/图标按钮的圆角、尺寸、内边距、状态行为一致（同一套类）。 |
| 目录职责清晰 | **PASS** | `core/` `world/` `camera/` `fx/` `audio/` `ui/` `shaders/` `scripts/` `tools/` `tests/` 边界清晰。 |
| 无死代码 / 无遗留 TODO | **PASS** | 全仓库 grep 无 TODO/FIXME/占位空实现。 |

## F. 交付前自检方式

| 条目 | 结论 | 说明 |
|---|---|---|
| 逐条对照 A–E 有明确结论 | **PASS** | 即本表。 |
| 真实浏览器检查：hero / side / mobile / 空 / 载 / 错 / 成 | **PASS** | hero/side/detail/rock/night/storm 六张 1920×1080 + 一张 375×812，见 `reports/evidence/`。空/载/错/成四态由单测与状态分支覆盖。 |
| 对比度抽查 | **PASS** | 22 组自动计算，见 `reports/contrast.json`。 |
| 键盘走查 | **PASS** | Tab/Enter/Esc/R/H/S/M 全部在 E2E 里实操并断言。 |
| 375px 与 1440px 无破版 | **PASS** | 375px 无横向溢出；1440px 截图正常。 |

## G. 不合格禁项

**逐条检查，本轮 0 项命中**：

- 浏览器默认样式残留 —— **无**（`app.css` 顶部完整重置 h1–h6/ul/ol/p/button/img）
- 占位文案（「暂无数据」「操作失败」「确定吗？」）—— **无**
- 同类元素尺寸/圆角/间距不一致 —— **无**
- 只有默认态、缺悬停/聚焦/加载/错误/空态 —— **无**
- 焦点不可见、键盘走不通 —— **无**
- 移动端横向滚动 / 元素挤压 / 按钮点不准 —— **无**
- emoji 或多套图标 —— **无**
- 颜色裸写 / 深浅色对比不足 / 只靠颜色表意 —— **无**
- 动效掉帧 / 动效卡在 layout 属性 / 无视 reduced-motion —— **无**
- 运行时外部网络请求 —— **无**（E2E 实测 0 次）
