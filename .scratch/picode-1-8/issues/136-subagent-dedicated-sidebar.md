# 136: Subagent 专属右侧栏——新顶栏入口 + 固定目录 tab + 与预览侧栏互斥

**What to build:** 为 subagent 建独立右侧栏（与预览文件右侧栏同级、同视觉语言），替代现状「subagent 列表作为 SidePanel（预览文件右侧栏）的条件 tab」。

**现状（取证）：** 右侧栏 SidePanel 以 `panel-tab` 承载 PreviewTab/ReviewTab/TraceTab/TurnDiffTab/SubagentsTab/SubagentChatTab（`components/SidePanel.tsx:189` 起）；SubagentsTab 条件出现——有活跃 subagent 时顶栏红点，点开再关闭后 tab 消失、无入口可回（操作者报的问题）。顶栏右上入口簇在 `App.tsx`（右上角右侧栏入口；票 127 设置入口去重后其原位空出）。

**目标：**
1. **新顶栏入口**：右上角右侧栏入口的**右边**新加 subagent 入口（位置=票 127 之前设置界面的入口位）。入口**恒在**（修复「关闭后找不到入口」）；有活跃/未读 subagent 时红点语义保留在入口上。图标用 subagent 语义 glyph、tooltip 英文。
2. **专属侧栏**：新入口打开 subagent 专属右侧栏，展示方式与预览文件右侧栏一致（同宽度体系、同视觉语言、同 tab 交互模式）。SubagentsTab（目录列表）从 SidePanel 移除，迁入新侧栏；**新侧栏有一个固定 tab 始终显示当前会话的所有 subagent 列表**（含已结束的——修复「关闭后消失」）。subagent 会话 tab（SubagentChatTab 链路，subagent-chat-store 与 onStop/onOpenChat bridge）在**新侧栏内**打开，交互照旧。
3. **互斥逻辑**：其一打开时打开另一个→前者自动折叠，**新打开者继承前者的宽度**；手动折叠其一**不**打开另一个（两条都要 electron smoke 腿）。

**注意：** 既有 smoke 的 subagent_dir/subagent_chat 段（票 101/106 链路）断言的是 SidePanel 内 tab——须重定向到新侧栏后保持全绿（断言语义不变，选择器随新结构调整）；`subagent-chat-store.ts` 与宿主桥接零改动为佳（只是宿主容器换位）；顶栏入口簇的其他入口（含设置、右侧栏入口）位置与行为零回归。

**Blocked by:** 无（基于 main 331922e）.

**Status:** ready-for-human

## Acceptance

- [ ] 新顶栏入口恒在（subagent glyph，右侧栏入口右侧=旧设置位）；活跃/未读红点语义保留
- [ ] subagent 专属侧栏：固定 tab 始终列当前会话**所有** subagent（含已结束）；会话 tab 在新侧栏内打开、stop/open bridge 行为不回归
- [ ] SidePanel 不再承载 SubagentsTab（预览/审查/trace/diff 四 tab 零回归）
- [ ] 互斥三腿 electron smoke：①A 开→开 B→A 自动折叠且 B 宽度=A 原宽 ②手动折叠 A→B 不被打开 ③B 再开宽度记忆正确
- [ ] 既有 subagent_dir/subagent_chat smoke 段重定向后全绿（语义不变）
- [ ] vitest / typecheck 全绿；跑 dev app / smoke 前 `ps` 自查（dev-app serialization）
- [ ] visual 帧：新侧栏开启态（含固定目录 tab）入 `.scratch/visual/`

## Comments

- 2026-09-22 (requirements intake)：操作者原话：「右上角右侧栏的入口右边新加一个入口，用于显示subagent(就是之前右上角设置界面的入口的位置)。然后subagent列表就不要放到预览文件的右侧栏里面展示了，就用这个新入口打开。展示方式和预览文件的右侧栏一样。subagent右侧栏和预览文件的右侧栏的逻辑是：假设其中某个是打开的状态，打开另一个，前一个自动折叠，并且新打开的展示宽度和前一个折叠的相同；手动折叠某个右侧栏，不会打开另一个。而且之前的subagent展示有一个问题：当有subagent时，右上角有红点，点开后关闭就找不到subagent的入口了。我希望新的subagent的右侧栏有一个固定tab，始终显示当前会话的所有subagent列表」。

- 2026-09-22 (delivery)：实现与验证纪要。
  - **实现**：① TitleBar 新增 subagent 入口（side-panel toggle 右侧＝旧设置位，BotIcon glyph，tooltip "Subagents"，恒在；ticket-101 计数徽章迁到该入口，仅折叠时显示，`data-testid="subagent-panel-toggle"/"subagent-badge"`）。② 新 `SubagentPanel.tsx`：与 SidePanel 同几何/同宽度体系/同 tab 交互（共享 panelReducer 语义 + `clampPanelWidth`），固定 `{kind:'subagents'}` tab 永不关闭（无 ×，keyed by sessionId 列出当前会话全部 runs 含已结束）；SubagentChatTab/subagent-chat-store/onStop/onOpenChat bridge 原样迁入（仅宿主容器换位）；SidePanel 移除 subagent 分支，picker 仅剩 Review 卡。③ 互斥：`layout-model.ts` `subagentPanelOpen` flag + 开启腿在 reducer 折叠对方 + 纯 `planRightPaneWidthSwap` + App 单一 useLayoutEffect 继承宽度（覆盖 ⌥⌘B/深链/入口/徽章全部触发点）；手动折叠不联动。`subagentPanelWidth` 持久化（同 panelWidth 通道）。
  - **smoke 重定向**：票 90/99/101 段改为入口点击开启（断言语义不变，选择器按新结构适配：两栏共享 `.panel-tab*` 类，计数/查找选择器已 scope 到各自栏，含 86/88 段的 TAB_COUNT/ACTIVE/close 探针；票 99 ×-close 与 visual harness 的 close 修复为「按 tab 自身 × 解析」——固定 tab 无 × 后索引错位）；新增 `subagent_mutex_136` 段（纯 DOM，9 腿：入口→固定 tab、双向 swap 宽度继承 560/640、手动折叠不联动、重开宽度记忆）。
  - **验证**：vitest 2175/2175 绿、typecheck 0 错、build 绿；定向 smoke：subagent_dir/chat/stop 非环境腿全绿（resume、目录 25 行分页 Show 20 more、×-close/reopen、readonly、lost 错误路径、徽章零位、injected-foreground stop→abort）、**subagent_mutex_136 九腿全绿**；panel_tabs/panel_collapse_86/preview_dual_88 全绿（SidePanel 四 tab 零回归）；smoke:layout 绿；visual 帧 s9-1/s99-*/s101-* 已更新入 `.scratch/visual/`（新侧栏开启态含固定目录 tab）。
  - **环境阻断（留档）**：本机 pi-subagents 0.70.1 的 RPC 在 SDK 0.86.1 会话内不应答（`npm run smoke:subagents070`——未改动的 ticket-111 probe——同样死于 `rpc ping`；裸 SDK 会话 observer 亦无回复，而包已作为 extension 加载）→ subagent_status 事件 `available:false`，渲染端按设计拒绝 fold，subagent_dir/chat/stop 的 fleet 腿（live 徽章翻转/steer/stop RPC 回执）在本环境无法通过，与 diff 零交集（ticket-90 属批次留档 flaky 族）。同链路 UI 语义已由 visual harness（renderer 侧注入 available:true 契约事件）全绿验证。全量 electron smoke 死于 ticket-28（模型速度：count-to-150 轮在 refocus 探测前完成，会话文件含完整 1..150 输出；留档 flaky 族）与 ticket-105（t44 焦点类），均零交集留档。
  - **流程披露**：13:27 前后两次 electron 运行（visual:subagent-chat 复跑、smoke:layout）与 wt-135 的 smoke 并发——违反 dev-app 串行规则（两次均绿、隔离 userData，无状态污染）；此后每次运行前 ps 自查，未再复发。

- 2026-09-22 (delivery)：分支 `t136-subagent-sidebar` 实现提交 **543b57d**（本文件状态/纪要更新为其后的 docs 提交）。验收清单勾选：入口恒在+徽章 ✓；固定目录 tab 全量列表+会话 tab 迁移 ✓；SidePanel 四 tab 零回归（panel_tabs/86/88 段绿）✓；互斥 smoke `subagent_mutex_136` 九腿 ✓；vitest/typecheck ✓；visual 帧 ✓（fleet 腿受环境阻断已留档，见上条）。
