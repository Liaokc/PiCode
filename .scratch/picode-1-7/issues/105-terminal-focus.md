# 105: 终端开启即聚焦——⌘J/终端钮直达可输入

**What to build:** ⌘J 或标题栏终端钮打开终端停靠后，**输入焦点立即进入 userTerm**（xterm）——不再需要额外点击。桥接面板与终端同框时切回终端（⌘J 语义）同样聚焦；桥接面板可见时不抢焦点。挂载时序（xterm 需可见后聚焦）由票内裁量（rAF/effect）。

**背景（取证）：** `TerminalDock.tsx` 仅面板点击路径有 `kit.userTerm.focus()`（focusUser/restart）；dock 开合路径（keymap `toggle-terminal-panel` → dockDispatch）无任何聚焦调用。操作者原话：「希望输入焦点立马到终端中，而不是还要我点击一下」。

**Blocked by:** None (can start immediately).

**Status:** ready-for-agent

## Acceptance

- [ ] electron smoke：⌘J 打开终端 → 焦点在 userTerm（键入直达 shell）；标题栏钮同；⌘J 再开合循环不失效
- [ ] 桥接同框时切回终端聚焦；桥接面板显示时终端不抢焦点
- [ ] 终端既有交互（restart/桥接跳转/滚动）零回归
- [ ] vitest / typecheck 全绿；跑 dev app / smoke 前 `ps` 自查（dev-app serialization）
