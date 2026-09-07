# 40: 面板开合动画

**What to build:** 三个可开合面板（左侧栏 / 右侧面板 / 底部 dock）获得开合动效：从各自停靠边（左/右/下）**200ms ease-out 拉出/收回**；尺寸（面板=宽度、dock=高度）与透明度并动；关闭终态 = 尺寸 0 + opacity 0 + pointer-events none；**双变量模式**——开合变量与内容真实宽度变量分离，动画期间内容**裁切不重排**（终端 xterm 免逐帧 reflow）；**拖拽中尺寸动画禁用**（保持票 30 的 1:1 直写手感）；`prefers-reduced-motion` 直切；应用启动首帧不播动画。

**背景（取证）：** 现状 `.sidebar{width:var(--sidebar-w)}` 等 0px↔Npx 瞬跳零过渡（app.css 实证）；ZCode 实机校准参数 = `transition-[width,opacity] duration-200 ease-out` + 拖拽时降级仅 opacity（`data-workspace-sidebar-resizing`）+ 内容双变量裁切 + 终端面板同 200ms。

**Blocked by:** None (can start immediately)。*与 38/39 并行时 app.css 改动区段不相交（本票在面板容器段），git 自动合并，无硬边。*

**Status:** resolved

- [ ] 三面板开合均从正确方向 200ms ease-out 拉出/收回；关闭为反向
- [ ] 动画期间内容裁切不重排：侧栏/面板文字不回流、终端 xterm 零逐帧 reflow
- [ ] 拖拽 resizer 期间尺寸动画禁用（1:1 跟手，票 30 手感不回归）
- [ ] prefers-reduced-motion 直切；启动首帧无动画
- [ ] 面板双变量投影纯函数表驱动（Seam-1：open/width → 开合变量 + 内容变量）
- [ ] electron smoke（四键开合后终态尺寸 + 过渡属性在位）；visual 终态帧 + 拖拽禁用断言；typecheck / lint / test 全绿

## Comments

- 2026-09-03 (requirements intake): 建票（spec R1）。参数为 ZCode bundle 只读取证校准值（200ms ease-out / 双变量 / 拖拽降级），非自创。性能红线：动画期间禁 xterm 逐帧 reflow。波次：W1（与 38/39 并行注记见上）。
- 2026-09-03 (t40-pane-animations): **implemented** @ 288a3e7（六提交：62a9992 Seam-1 投影纯函数 + 表驱动测试 / f76e51b app.css 动画段 + App.tsx 变量投影与启动门 / ff6ced8 三容器常驻挂载 + clip/pin 包装 + 拖拽双写 / 2b97e04 smoke 探针改开合态 + keymap_pane_motion_ok / 288a3e7 visual:pane-motion 新 harness）。**验收全绿**：vitest 894/894（新增 8 条表驱动）、typecheck、lint、electron smoke（四键开合终态尺寸 + 过渡属性在位）、smoke:layout（拖拽 1:1 + 持久化 + 重启恢复不播动画）、visual:pane-motion 9 帧（双变量动画中 pin 恒定 = 裁切不重排、拖拽禁动画 1:1、reduced-motion 直切、终态尺寸 0+opacity 0+pointer-events none）。**实现注记**：①「SidePanel/BottomDock/TerminalDock 内容组件零改动」按括号列举读作各容器**内部**内容组件（ReviewTab/PreviewTab/TraceTab/TerminalDock/BridgeDock/FileBrowser 零 diff）；容器本身属「面板容器层」许可范围——动画要求关闭态常驻挂载（display:none/unmount 无法过渡），不改容器无法实现。②关闭态加 visibility:hidden（随 transition 在动画结束时才翻转）——ZCode 校准的 opacity-0+pointer-events-none 之外补键盘 tab 序不泄漏。③微行为变化：关闭再打开保留面板内部状态（如归档视图/右键菜单），与 dock 常驻保 shell 同哲学。④双变量以 CSS 自定义属性实现（--sidebar-w/--panel-w/--dock-h 开合 + --*-content-w/--dock-content-h 内容），App.tsx 经 projectPaneMotion 投影设于 .app-shell；拖拽 rAF 直写 pane+pin 双 inline、pointerup 清除交还变量。⑤启动门：settings 快照落盘宽度先绘制、双 rAF 后才武装过渡（data-pane-motion-armed），加载失败路径同样武装。**操作者合并**：`bash scripts/merge-ticket.sh 40`。
- 2026-09-04 (merge): merged as **42358c6**（--no-ff，21 文件 +1164/−44，实现链 5 提交重放：ff6ced8→f84c386 等）。验收口径：操作者目检后明说「已验收」（与 39 同批）。冲突处置：① tracker 状态对撞 ×2（分支 claimed / ready-for-human 提交 vs main 侧簿记 sync）——例行，取 main 侧，两提交分别被丢弃/判重；② **唯一代码冲突 Sidebar.tsx 1 处**：main 侧（39 落地后）的 `if (!open) return null` 早退守卫 vs 40 侧的 stay-mounted 注释 + 旧 toggleExpanded——整合裁定：删早退（40 的核心意图，data-closed 已接管闭态）、丢 toggleExpanded（39 重写已退役该机制，main 侧 JSX 改用新 handler，保它必成死代码）、留 40 注释。属两票对同区域的功能性交叠但双方意图正交（39 换折叠机制、40 删闭态卸载），非语义级对撞，合并会话按双方意图直接整合。main 终态审计：typecheck + vitest **945/945**（71 文件，+8）；三套纯函数（slash-gate/fold-model/pane-motion）共存；app.css 三段（38 菜单/39 组头/40 动画）互不侵蚀；Sidebar 终态无 toggleExpanded/无早退/data-closed 在位；gateSlashCommand 守门幸存；无冲突标记。解锁：无直接后续（43 仍阻于 42）；W1 仅剩 42 未开工。
