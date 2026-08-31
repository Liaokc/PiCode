# 22: Tooltip 体系对齐 ZCode

**What to build:** 全 app 的悬停提示对齐 ZCode 形态（2026-08-31 操作者实测对比 + R5-Q1 三件全做）：
① **会话行移除长 tooltip**：现状 `Sidebar.tsx` TaskItem 用原生 `title="标题 — cwd"`，hover 出现一大行文字（操作者指认）；ZCode 会话行**无任何 tooltip**——删掉。
② **按钮 tooltip 重做**：替换全部原生 `title` 长文本，新统一 tooltip 组件两态——**有快捷键的只显快捷键**（⌘N/⌘K/⌘J…键帽样式）、**有短描述的只显短描述**（如表格钮「复制」「自动换行」）；样式对照 ZCode 实拍 `.scratch/compare/z-tooltip-style.png`（小型浮层、深字浅底、键位帽）。
③ **全 app 按钮走查**并归档清单（按钮 × tooltip 文案 × 快捷键）：侧栏工具行/会话行按钮/分组悬停钮（票 19）/composer 芯片/消息操作行（票 16）/右侧栏与底部终端/标题栏/设置。

**背景（证据）：**
- 操作者原话：「当光标悬停在按钮上时，PiCode 的会话入口会出现一大行文字，但是 ZCode 不会，ZCode 只有一些按钮的介绍和有快捷键的会显示。」
- ZCode 实拍：筛选钮 hover 仅显「⌘ K」键帽（`z-tooltip-style.png`）；表格钮 hover 显「复制」等短描述（操作者逐钮指认）。
- PiCode 现状：原生 `title` 属性散布各组件（如 `TaskItem`、`sb-icon-btn` aria-label/title 并存）。

**Blocked by:** None（终态走查宜在 16/18/19 的按钮定形后收尾，故实现顺序上宜靠后——但**组件本身先行**，作为 16/18/19 的前置件）。

**Status:** ready-for-agent

- [ ] 会话行无 tooltip（含 title 与 aria-label 复用清理）
- [ ] 统一 tooltip 组件落地（短描述 / 快捷键两态，样式对照 `z-tooltip-style.png`）
- [ ] 全 app 走查清单归档于本票 Comments（按钮 × 文案 × 快捷键），与 ZCode 逐一对齐
- [ ] visual harness 抽查帧更新；typecheck / lint / test 全绿

## Comments

- 2026-08-31 (requirements intake + grilling 定稿): 建票。R5-Q1 三件全做。走查范围含 16/18/19 新增的所有按钮（复制/换行/fork/悬停三钮/⌘J 切换钮等）。
- 2026-08-31 (/to-tickets): **定位为前置件**——统一组件先落地，16/18/19 的新按钮直接消费（它们均 Blocked by 本票）；后续票的按钮在其自己的票内带上 tooltip 验收项，本票走查清单随之增补。
