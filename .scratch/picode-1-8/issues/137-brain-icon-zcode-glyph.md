# 137: 思考模式大脑图标对齐 ZCode——双半球+中茎细线 glyph（参照帧已裁取）

**What to build:** 替换思考模式的大脑图标为 ZCode 同款 glyph（操作者：「思考模式的大脑图标太丑了，希望跟ZCode一模一样」）。

**现状（取证）：** 当前 brain glyph 用于：转录思考块头（ThinkingRow「思考 · 持续了 X 秒」）、composer 页脚思考档位选择器（「最高」下拉）——`components/icons.tsx` 内定义；实现时 grep 全量（含侧栏/菜单如有）逐一替换，禁止只换一处。

**ZCode 目标 glyph（操作者截图裁取，已入仓）：**
- `.scratch/picode-1-8/reference/z19-brain-header-zoom.png`（思考块头「🧠 思考 · 持续了 4 秒」放大）
- `.scratch/picode-1-8/reference/z19-brain-selector-zoom.png`（composer「🧠 最高」放大）
- 原图 `.scratch/picode-1-8/reference/z19-zcode-queue-above-composer.png`

**形态描述（供比对）：** 细描边 outline 风格（stroke 非 fill），左右对称双半球轮廓 + 中央垂直茎干（茎向上分叉进两半球，如倒 Y），整体圆润；与 Lucide `Brain`（lucide.dev/icons/brain，24×24 / stroke-width 2 / round cap+join）同族。实现时以 Lucide Brain 原始 SVG path 为起点，与参照帧 zoom 图做像素对照（PIL+numpy 双证据，沿票 127 手法：渲染帧裁取 vs 参照帧裁取结构相似度留档）；若 Lucide path 与参照帧有可见差异（脑回纹路数/茎形态），以参照帧为准手调 path。

**Blocked by:** 无（独立小票；与 135 同触 Composer.tsx 但不同区域——页脚选择器 vs 容器，additive rebase）.

**Status:** ready-for-human

## Acceptance

- [x] 思考块头 + composer 档位选择器（及 grep 出的其余 brain glyph 出现点）全部换新 glyph；单一 SVG 定义（icons.tsx）被两处复用，无重复内联
- [x] 像素对照：新 glyph 渲染帧 vs ZCode 参照帧 zoom 双证据留档（同尺寸/描边粗细/形态一致；视觉判定 + 数值留档）
- [x] 其余图标零回归；图标颜色继承 currentColor（头/选择器两处现有配色不变）
- [x] vitest / typecheck 全绿；如触 smoke 断言（glyph 类名/结构）语义不变
- [x] visual 帧：思考块头新 glyph 帧入 `.scratch/visual/`

## Comments

- 2026-09-22 (requirements intake)：操作者原话：「思考模式的大脑图标太丑了，希望跟ZCode一模一样」。参照帧已裁取入仓（见 What to build）。
- 2026-09-22 (implementer claimed)：认领提交 `7049641`（票面+参照帧入分支）；work-notes/t137-progress.md 跟踪。
- 2026-09-22 (implementer done, self-review)：分支 t137-brain-icon，实现提交 `f0defbd`（本注释提交随其后）。要点：
  - **实现**：`BrainIcon` = Lucide Brain 现 9-path 几何（ISC；首条 `M12 5a3 3 0 1 0-5.997.125 4 4 0 0 0-2.526 5.77 4 4 0 0 0 .556 6.588A4 4 0 1 0 12 18Z`——Z 闭合自绘中央全高裂缝+底部折痕尖角+六条小脑回弧）；ThinkingRow 由 Sparkles(13) 换 `BrainIcon` 默认 16；composer 思考 chip 沿用同一定义默认尺寸。grep 全量：brain 字形仅 ThinkingRow 与 chip 两处消费，无内联副本。
  - **像素双证据（票 127 手法）**：①参照帧 ↔ Lucide 模板（2x 同尺度，描边扫描 1.4-1.5 最优）：header NCC **0.9596** / selector NCC **0.9792**（残差纯子像素 AA；控制对上限 0.98）→ ZCode 字形 = Lucide 几何，**回退条款（手调 path）未触发**；②app 渲染 ↔ Lucide 模板（1x 16px/1.7 描边，与 app 实际渲染同尺度）：th1 思考行 NCC **0.9351**、mg4 chip NCC **0.9365**；③两 app 表面互证 NCC **0.9999**（逐像素一致）。三联蒙太奇（app | 模板 | 参照）入 `.scratch/visual/t137-brain-triple-montage.png` 与 work-notes。
  - **DOM 地面真值**（CDP 探针）：两表面 svg 均 9 path、d1 = 新 Lucide 首路径；chip svg 16×16 @ (1034.78,840)，思考行 svg 16×16 @ (450,256.5)，色 rgb(179,179,173) 继承不变。
  - **th1↔th2 diff 归因**：唯三分差异 = 转头 LoaderIcon 旋转（票 103 头环）、思考行计时跳秒、展开体出现（x450 左缘竖条 + 正文）——**brain 字形逐帧不变**；早前误读更正：th1 帧 y769-779 宽文本行非用户消息，乃 composer busy 占位符「Follow-up — Enter queues after the current turn」（词簇分割 8 词逐字核实）。
  - **门禁**：vitest 123 文件/2153 全绿；typecheck 双 tsconfig 清；visual:thinking（th1-3）与 visual:menu-geometry（mg1-5，含 mg4 新首路径断言 `M12 5a3 3 0 1 0-5.997.125`）exit 0。
  - **Self-review（双轴）**：Standards 轴——单一 icons.tsx 定义两处复用、定义注释标 ISC 出处与几何构成、沿用既有 icon 组件形（size/描边/currentColor）、mg4 断言原位更新、无 TODO/无范围外改动。Spec 轴——验收 5 项逐条如上留证；grep 审计两消费点零遗漏；回退条款触发条件（可见差异）经数值证据排除并留档。
  - **过程披露**：th1-3 现存帧来自 13:15 双实例冲突跑（探针轮询错实例；帧本身 = harness 自窗 capturePage，内容经核与干净布局一致）；11:58 全套 visual 帧随新码重生成，非本票范围未提交。
- 2026-09-22 (fix round 处置)：spec pass（3 非阻塞备注）/ standards pass-notes 两项已改：①icons.tsx 注释 NCC 0.94/0.83 → 终版实测（参照↔模板 0.9596/0.9792；app↔模板 0.9351/0.9365），证据链数字统一；②visual 帧刷新 chore 入分支（34 帧含新 glyph；其中 33 个 brain 帧逐一模板匹配 0.9365-0.9367 核验与 tip 代码一致后直接提交，免重跑；th/mg 已在 flip 提交）。spec 评审复核（th1 用户泡）——主 Agent 裁定更正：**用户泡确认已渲染**（主 Agent PIL 实测 + spec 评审双确认；泡底色 (239,239,236) 与背景 (249,249,247) 仅差 10 灰阶，阈值扫描易漏检）——实测定位 y110-156 / x~955-1309 完整圆角泡，泡内全文 “Refactor the session module, think it through first.”（y127-137），下方 Copy 行即该泡动作行（会话标题不会带 Copy 行）；实现者初判『未渲染』系扫描阈值误读（把泡内文本误读为顶栏会话标题、把泡底圆角误读为背景渐变），**无 pre-existing 缺陷，无需取证票**；另 y769 行早前误读（composer busy 占位符）已在 flip 留档更正，维持不变。
