# t137 progress — 思考模式大脑图标对齐 ZCode（Lucide Brain 同款 glyph）

## 本票目标一句话
全量替换思考模式 brain glyph 为 ZCode 同款（细描边 outline 双半球+中央茎干；Lucide Brain 原始 path 为起点，参照帧像素对照，有可见差异以参照帧为准手调）。

## 铁律
- 事件驱动落库；遗忘时重读本文件续跑。
- 提交只进 t137-brain-icon；绝不 checkout main、不 merge、不 push。
- 票文件随分支提交；票 Status 流转 claimed → ready-for-human（Comments 记 tip sha）。
- visual harness / electron 前 `ps` 自查（dev-app serialization）；vitest 加 `env -u PI_SUBAGENTS_PI_CODING_AGENT_PACKAGE_ROOT` 前缀。
- 评审：fallback 双轴自评，票 Comments 标 self-review；主 Agent 另派独立双轴。

## 阶段 = 开工
- 2026-09-22 开工：读票面 + CONTEXT.md + 参照帧取证启动。worktree t137-brain-icon @ 331922e，node_modules 就绪（340 顶层条目，无 npm install 进程）。

## 阶段 = 参照帧取证（PIL+numpy，本会话模型不支持看图 → 全程数值取证，票 127 先例）
- 参照帧（root .scratch/picode-1-8/reference/，untracked）：
  - `z19-brain-header-zoom.png` 600×260 = 原图 (70,5) 起 150×65 native 的 **4x 平滑放大**（cv2 多尺度模板匹配 NCC 0.998 @ scale 4.0）。
  - `z19-brain-selector-zoom.png` 720×280 = 原图 (2080,545) 起 180×70 native 的 4x 放大（NCC 0.9969）。
  - `z19-zcode-queue-above-composer.png` 2422×670，DPI 144 = **2x retina**（PNG pHYs）。
- ZCode 两处 brain glyph native 裁取（+2px 边距 32×32 crop，存 /tmp/t137/ref-{header,selector}-glyph.png）：
  - 思考块头：ink bbox x 96..123, y 22..49 = **28×28 native px**（= 14 logical）。
  - composer 档位 chip：ink bbox x 2086..2113, y 562..589 = **28×28 native px**（同一 glyph 同一尺寸）。
  - 描边 ~2 native px（中缝茎干逐行实测 2px 核心 + 抗锯齿边）。
- glyph 结构（ASCII 取证）：双半球轮廓（顶部双弧峰、外缘下收）+ 中央全高垂直茎干（2px）+ ~52-55% 高度处 ∧ 形 caret 纹（茎干两侧分叉）+ 上部脑回弧线 + 下部与外缘融合的脑回弧。与 Lucide Brain（lucide.dev 当前 9-path 版，v0.344+）同族。

## 阶段 = Lucide path 对照（自建 rasterizer：SVG path 解析+arc 展平+cv2 圆帽描边渲染）
- 修复自建 rasterizer 两个 bug（arc sweep/large-arc 候选圆心法重写；parse_path 丢弃后随命令的 Z → Lucide 半球 path 的 Z-close 正是中央茎干线段）。
- 对照结果（32×32 crop，ink-bbox 对齐，NCC/IoU，扫 stroke 1.4–2.0 + ±2px 偏移）：
  - lucide 0.344（现行 lucide.dev 9-path brain）：header **NCC 0.9416 / IoU 0.7821**（stroke 1.4，残差 ref-only 仅 4px）；selector NCC 0.8328 / IoU 0.6950。
  - lucide 0.294（旧 2-path 版）：header 0.7329 / 0.5695 —— 明显差，排除。
  - lucide 1.47（v1 版 8-path）：header 0.9412 / 0.7821 —— 与 0.344 几乎同形（等价几何），取 0.344 现行版。
  - 对照组（两参照帧互比，同 glyph 不同子像素）：NCC **0.9824** —— 子像素噪声天花板。
  - 微调（stroke×0.25px 子像素偏移搜索）：header 0.9413 / selector 0.8240；残差全部为描边边缘 1px 级 fringe（外缘 C / 内缘 R 对称分布），无结构性缺失/多余元素 → cv2 光栅化器与 Chrome 抗锯齿差异，非几何差异。
- **结论：参照帧 glyph = Lucide Brain 现行几何，无需手调**（票面「若有可见差异以参照帧为准手调」条款不触发——像素对照无可见结构差异）。
- 尺寸口径：ZCode ink 28 native（14 logical）≈ 本仓 BrainIcon 默认 16px box + strokeWidth 1.7（ink = (20+1.7)·16/24 = 14.5 logical = 29 native @2x；stroke 2.27 native ≈ 参照 2-2.3 native）——现有 chip 渲染尺寸/描边已与 ZCode 对齐，无需改 size。ThinkingRow 由 Sparkles(13) 换 BrainIcon 默认 16 → ink 尺寸对齐 ZCode 头部（现 13px box ink 仅 ~11.8 logical，偏小）。

## 阶段 = 实现（完成，提交 f0defbd）
- ✅ icons.tsx `BrainIcon` = Lucide Brain 现 9-path 几何（ISC；svgProps 家族参数不变：currentColor/strokeWidth 1.7/round cap+join）；ThinkingRow SparklesIcon(13)→BrainIcon(16)；composer chip 沿用同一定义。mg4 断言前缀更新为 `M12 5a3 3 0 1 0-5.997.125`。vitest 123/2153 绿、typecheck 双清；visual:thinking（th1-3）+ visual:menu-geometry（mg1-5）exit 0。

## 阶段 = 像素双证据留档（完成，提交 f0c324c）
- 帧考古（th1 1440×900 @1x）：[票 103 头环 LoaderIcon+Working·Ns @ y219][brain+Thinking·Ns @ y260][票 103 尾环 faint Loader @ y287][composer busy 占位符 @ y769（早前误读为用户消息——词簇分割实为「Follow-up — Enter queues after the current turn」8 词）]。th1↔th2 差异仅：头环旋转、计时跳秒、展开体出现——**brain 逐帧不变**；两 app 表面（th1 思考行 vs mg4 chip，模板匹配 NCC 1.0 定位）逐像素一致 NCC 0.9999。
- 数值三角：①参照帧↔Lucide 模板@2x（stroke 扫 1.4 最优）：header NCC 0.9596 / selector 0.9792；②app↔Lucide 模板@1x 16px/1.7：th1 0.9351 / mg4 0.9365；③th1↔mg4 0.9999。三联蒙太奇 `.scratch/visual/t137-brain-triple-montage.png`（app|模板|参照）。
- 工具：work-notes/t137-app-vs-ref.py（对照脚本）；/tmp/t137/ref-*.png（参照裁取）。
- 票面已翻 ready-for-human（f0c324c）；分支 tip = f0c324c。遗留披露：th1-3 = 13:15 双实例冲突跑产物（帧本身有效）；11:58 全套 visual 帧随新码重生成、非本票范围未提交。
