# 18: 终端底部停靠——右侧栏 Terminal 迁移为 VS Code 式底栏

**What to build:** 内置终端的停靠形态从右侧 Side Panel 迁移为 **VS Code 式底部面板**（2026-08-31 操作者裁定 + ⌘J 实拍取证 `/tmp/term-j.png`）：
(a) Terminal 从右侧 Side Panel 迁出 → **底部停靠**：全宽面板，chat 区压缩在上，可拖高（拖拽手柄联动 xterm resize）。
(b) 打开/关闭双入口：**⌘J 快捷键** + **右上角切换钮**。
(c) 面板头标签条：「终端 | <shell 名> | <会话标签> ×」+ 新建/关闭，沿用现 TerminalService/node-pty 通道——**PTY 后端零改动，纯渲染层搬家**（ADR-0004 的 PTY+Bridge 决策不变）。
(d) **Bridge 随迁**：agent bash 投屏窗格保留在终端视图内，单向观察语义不变（grilling R3-Q1 确认保留）。
(e) 右侧栏 picker 从「审查/终端」两卡变**「审查」单卡**；File Preview 仍走深链。
(f) 启动时底部终端**默认收起**。

**背景（证据）：**
- 操作者原话：「ZCode 的终端在右上角有一个切换终端的按钮，也可以通过快捷键 command + J 进行打开，并且是像 VS Code 一样，是在下方展开，但是你现在是做在右侧栏。我希望做成下方展开的。」
- ZCode ⌘J 实拍：底部全宽终端面板，标签条「终端 | fish | ASK ×」，chat 压缩在上（`.scratch/compare/`，`/tmp/term-j.png`）。
- 现状：PiCode 终端是右侧栏 picker 中的 Terminal 标签（ticket 06/08 交付）。

**Blocked by:** 22（右上切换钮等新按钮的 tooltip 用统一组件）。

**Status:** ready-for-agent

- [ ] ⌘J 与右上切换钮均可开/关底部终端；快捷键不与 Composer/输入框冲突
- [ ] 底部面板全宽、可拖高；ResizeObserver → FitAddon 联动（Seam-3 fake-pty 测试迁移通过）
- [ ] Bridge 投屏在底部终端内工作正常（真 PTY 冒烟 + agent bash 投屏实测，输入永不回注）
- [ ] 右侧栏 picker 仅剩审查卡；File Preview 深链与面包屑不受影响
- [ ] 启动默认收起；应用退出无孤儿 shell（disposeAll 语义不变）
- [ ] visual harness 终端三连拍更新为底部形态；`npm run smoke` ALL GREEN
- [ ] typecheck / lint / test 全绿

## Comments

- 2026-08-31 (requirements intake + grilling 定稿): 建票。取证：ZCode ⌘J 底部终端实拍 `/tmp/term-j.png`（两度确认：空态与任务态均底部展开）；Bridge 保留由 R3-Q1 拍板。ADR-0004 不需修订（PTY 与桥接决策不变，仅停靠位置）。
