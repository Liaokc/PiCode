# 40: 面板开合动画

**What to build:** 三个可开合面板（左侧栏 / 右侧面板 / 底部 dock）获得开合动效：从各自停靠边（左/右/下）**200ms ease-out 拉出/收回**；尺寸（面板=宽度、dock=高度）与透明度并动；关闭终态 = 尺寸 0 + opacity 0 + pointer-events none；**双变量模式**——开合变量与内容真实宽度变量分离，动画期间内容**裁切不重排**（终端 xterm 免逐帧 reflow）；**拖拽中尺寸动画禁用**（保持票 30 的 1:1 直写手感）；`prefers-reduced-motion` 直切；应用启动首帧不播动画。

**背景（取证）：** 现状 `.sidebar{width:var(--sidebar-w)}` 等 0px↔Npx 瞬跳零过渡（app.css 实证）；ZCode 实机校准参数 = `transition-[width,opacity] duration-200 ease-out` + 拖拽时降级仅 opacity（`data-workspace-sidebar-resizing`）+ 内容双变量裁切 + 终端面板同 200ms。

**Blocked by:** None (can start immediately)。*与 38/39 并行时 app.css 改动区段不相交（本票在面板容器段），git 自动合并，无硬边。*

**Status:** ready-for-agent

- [ ] 三面板开合均从正确方向 200ms ease-out 拉出/收回；关闭为反向
- [ ] 动画期间内容裁切不重排：侧栏/面板文字不回流、终端 xterm 零逐帧 reflow
- [ ] 拖拽 resizer 期间尺寸动画禁用（1:1 跟手，票 30 手感不回归）
- [ ] prefers-reduced-motion 直切；启动首帧无动画
- [ ] 面板双变量投影纯函数表驱动（Seam-1：open/width → 开合变量 + 内容变量）
- [ ] electron smoke（四键开合后终态尺寸 + 过渡属性在位）；visual 终态帧 + 拖拽禁用断言；typecheck / lint / test 全绿

## Comments

- 2026-09-03 (requirements intake): 建票（spec R1）。参数为 ZCode bundle 只读取证校准值（200ms ease-out / 双变量 / 拖拽降级），非自创。性能红线：动画期间禁 xterm 逐帧 reflow。波次：W1（与 38/39 并行注记见上）。
