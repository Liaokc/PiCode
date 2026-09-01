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

**Status:** ready-for-human

- [x] ⌘J 与右上切换钮均可开/关底部终端；快捷键不与 Composer/输入框冲突
- [x] 底部面板全宽、可拖高；ResizeObserver → FitAddon 联动（Seam-3 fake-pty 测试迁移通过）
- [x] Bridge 投屏在底部终端内工作正常（真 PTY 冒烟 + agent bash 投屏实测，输入永不回注）
- [x] 右侧栏 picker 仅剩审查卡；File Preview 深链与面包屑不受影响
- [x] 启动默认收起；应用退出无孤儿 shell（disposeAll 语义不变）
- [x] visual harness 终端三连拍更新为底部形态；`npm run smoke` ALL GREEN
- [x] typecheck / lint / test 全绿

## Comments

- 2026-08-31 (requirements intake + grilling 定稿): 建票。取证：ZCode ⌘J 底部终端实拍 `/tmp/term-j.png`（两度确认：空态与任务态均底部展开）；Bridge 保留由 R3-Q1 拍板。ADR-0004 不需修订（PTY 与桥接决策不变，仅停靠位置）。
- 2026-09-01 (implement session, t18): 实现于 `ab00463`，Status → ready-for-human。要点：
  - 布局模型：新增纯 reducer `src/shared/dock-model.ts`（visible / tabOpen / height / gen 四维；隐藏面板保留 shell，关闭终端标签才 kill，15 单测）；Seam-3 fake-pty（terminal-session controller）零改动全绿。
  - 双入口：⌘J 全局键（preventDefault，不漏进 Composer）+ 标题栏 PanelBottom 切换钮（tooltip = ⌘J 键帽，票 22 组件）。CDP 实探：启动收起 / ⌘J 开 / ⌘J 藏（保持挂载）/ 再开 / 切换钮双向，全过。
  - 标签条：`Terminal | fish | <session> ×` + 右侧 +/×；shell 名取自与 pty factory 同源的 `$SHELL`（preload `versions.shell`，纯函数 shell-name）。语义裁定：+ = 新会话（gen 重挂载换新 shell）；会话标签 × = 关闭标签（杀 shell）；面板 × = 隐藏（shell 存活）——VS Code 同构，已写入 CONTEXT.md 新术语「终端停靠（Terminal Dock）」。
  - Bridge 随迁：projector/写入面零改动，投屏与输入隔离语义不变（terminal-1/2/3 取证：桥接运行/落定 + 用户键入 `echo PICODE_TYPED_OK` 回显，桥格无输入路径）。
  - picker 收缩为审查单卡（单测 + CDP 实探 `['Review']`）；File Preview 深链不动。
  - 验证：typecheck / lint / 547 unit 全绿；`npm run smoke` ALL GREEN（6 阶段，session hygiene 无增长）。视觉三连拍底部形态归档 `.scratch/compare/t18-terminal-{1,2,3}.png`（fish shell、全宽、chat 压缩在上，与 `/tmp/term-j.png` 对照一致）。
  - 合并：请操作者执行 `bash scripts/merge-ticket.sh 18`。
- 2026-09-01 (operator feedback round, t18): 三项修改实现在 `64053a4`，仍为 ready-for-human：
  - **字体适配**：starship powerline 字形原为 tofu。新探针 `probe-font.ts`：逐候选字体在 canvas 上画 U+E0B0 并数着色像素——实测 Chrome 里缺字形渲染为空白（0 像素）而非 tofu，宽度对比无效（tofu 步进宽 ≈ 等宽步进宽，差仅 0.39px）。操作员实装的 JetBrainsMono Nerd Font 命中并置顶字体栈（截图已验证字形完整）；候选表含 starship 推荐的 Meslo 及常见 Nerd Font。
  - **Bridge 重设计**：弃用第二个 xterm，改为 DOM 命令卡片流（新纯 reducer `shared/bridge/feed.ts`，16 单测；同一条 Seam-1 流折叠；会话级历史、尾部增量、中断沉降语义与旧 projector 对齐）。旧 frame projector 已无消费者，连同其测试删除；单向观察语义不变（feed 无任何写入路径）。
  - **独立下侧栏**：Bridge 迁出终端 dock，新开独立 dock + 新快捷键 ⌘B + 标题栏 pulse 切换钮；feed 状态在 App 层折叠（隐藏/设置窗口往返均不丢历史；dock 恒挂载，隐藏用 display:none）。终端 dock（⌘J）贴底，Bridge 堆叠其上。CONTEXT.md 新术语「桥接停靠（Bridge Dock）」。
  - 验证：typecheck / lint / 562 unit 全绿；`npm run smoke` ALL GREEN；⌘B CDP 实探（启动隐藏、开/关、切换钮）全过；证据刷新 `.scratch/compare/t18-terminal-{1..3}.png` + 新增 `t18-bridge-{1,2}.png`。
  - 合并：请操作者执行 `bash scripts/merge-ticket.sh 18`（包含 ab00463 / 478ed50 / 64053a4）。
