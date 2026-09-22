# 132: ⌘J 终端聚焦回归定位——新会话入口 + 全入口 smoke 防线

**What to build:** ⌘J 打开终端焦点不进的**回归定位票**（票 105 已修问题的复发——操作者明示「这些已经修复问题的工单完成了，能不能不要再出现相同的问题？请自检一下」）：dev app 复现（**新开会话 + ⌘J** 场景——操作者实测路径）→ 定位 → 修复 → **全 ⌘J 入口 electron smoke 参数化**（会话内 / 新会话 / boot 空态 / 桥接切回——回归防线 = 本票第一验收项）。自检结论前置：票 105 的 focusSeq 双 rAF 机制在位（`TerminalDock.tsx:36-76`），修复覆盖了会话内路径；**新会话/空态入口无回归测试**——票 105 smoke 的覆盖缺口即本次复发通道；候选干扰源 = create 后视图重挂载/composer 自动聚焦与终端聚焦的时序竞争（票 106 乐观卡重挂载、票 98 焦点纪律 rAF 归还为嫌疑，插桩实证为准）。

**背景（取证）：** 操作者图8：新开会话 ⌘J 打开终端，光标不在终端。`TerminalDock.tsx` focusSeq 机制（dock 动作 bump → 双 rAF → focusTerminalRef）在位；「新开会话」路径的 focus 争抢静态未定位（与 131 同类：运行时态缺陷，插桩定位是票内义务）。

**Blocked by:** 无（独立）.

**Status:** ready-for-human

## Acceptance

- [x] **复现 = 第一验收项**：dev app 稳定复现「新会话 + ⌘J 焦点不在终端」留档；触发时序证据链入 Comments
- [x] 修复后 electron smoke：**四入口参数化**——会话内 ⌘J / 新会话 ⌘J / boot 空态 ⌘J / 桥接切回，四腿全断言焦点进终端
- [x] 自检报告入 Comments：票 105 修复为何未拦住（smoke 覆盖缺口复盘——防复发机制补齐说明）
- [x] 桥接可见时终端不抢焦点（票 105 语义）不回归
- [x] vitest / typecheck 全绿；跑 dev app / smoke 前 `ps` 自查（dev-app serialization）

## Comments

- 2026-09-22 (requirements intake)：P7 定稿为 R6。操作者原话含问责（「请自检一下」）——票内 Comments 必须含诚实复盘（覆盖缺口与防复发机制），不重开票 105。

- 2026-09-22 (implement session，分支 t132-terminal-focus，基于 main 93a1646)。**复现（第一验收项）**：dev app 插桩 harness（visual-harness 同型驱动：隔离 userData+store、真实 create 流、合成 ⌘J——票 105 smoke 先例）两条失败形状均稳定复现：
  - **S1（boot 空态 + 新会话 create 在途 ⌘J，操作者图8 路径）**：`seq-diff 0->1 cwd=null refNull=true` → 双 rAF 打进 **null ref，请求被静默消费** → session_created 后 shell 才挂载、无新 bump → verdict `inShell=false, activeElement=BODY, dock=terminal`（dock 开着终端、光标不在终端）。
  - **S2b（聚焦会话 + 异 cwd create 在途 ⌘J）**：bump 打进旧 shell（serve 成功、焦点落旧 shell）→ session_created 重挂载 workspace（旧 shell 持焦卸载、焦点落 BODY）→ 新 shell 挂载无 bump → verdict `inShell=false, BODY`。同 cwd（无重挂载）现状不翻车。
  - **根因定论**：票 105 的 focusSeq 双 rAF 把焦点请求绑定在「双 rAF 时刻恰好挂载的 workspace 实例」上——(a) 请求早于 shell 挂载时被消费成 no-op；(b) 请求的接收者被 create 公告的重挂载换掉时焦点死亡。票 106 乐观卡与票 98 rAF 归还均非干扰源（插桩时间线排除：全程序零 composer 焦点争抢，焦点全程停在 BODY）。
- 2026-09-22 (修复)。**Seam-1**：`shared/dock-model.ts` 新增 `terminalFocusServeDecision` 纯决策表（armed×receiver → serve/hold；heldByReplaced×activeIsEditable → 恢复/收手），`dock-model.test.ts` 9 例表驱动全绿。**渲染层（TerminalDock 状态机）**：bump→**armed**，armed 直到有 receiver 才 serve（**hold 跨挂载存活**——修复 S1）；workspace 卸载时上报「持焦」→ 替换者恢复焦点（**修复 S2b**，活 caret 已接管则收手——任务切换 click 必先经票 98 归还 composer，旧 shell 不持焦，恢复不触发，票 105「任务切换重挂载不聚焦」语义保留）；**dock/panel 不可见即取消 armed**（BottomDock 透传 `visible`——票 105「桥接可见终端绝不抢焦」保留）。两个实现坑插桩实证后修正：held 检测不能读 rootRef（mutation 期已摘 ref）；不能在 passive cleanup 读 activeElement（passive cleanup 在 DOM 移除后跑，焦点已落 BODY）——落点 = useLayoutEffect cleanup（DOM 仍挂着，`kit.userTerm.textarea === activeElement` 为真值）。修复后 harness 四形状全绿（S1 hold→注册→serve ✓ / S2 同 cwd ✓ / S2b serve 旧 shell→`held=true`→恢复 serve ✓ / S3 对照 ✓）。
- 2026-09-22 (smoke 四入口参数化 = 回归防线)。**boot 空态腿**入 empty_state 阶段（⑤ send 前按 ⌘J：断言 dock 开 + 「No workspace yet」无 shell + 请求 armed；session_created 后断言首个 shell 挂载即持焦，无额外点击）；**`terminal_focus_132` 阶段**（terminal_focus_105 后）参数化 `ensureShellFocused(leg)`（dock=terminal + activeElement=xterm-helper-textarea 单一真值）跑三腿：in_session（105 leg1 形复跑）/ new_session（tag 旧 xterm → supervisor.createSession 新 tmpdir cwd → **create 在途立即 ⌘J** → 等 untagged xterm 重挂载 → 断言焦点进新 shell）/ bridge_swap_back（⌥⌘J 桥接显示时隐藏终端不持焦 + ⌘J 切回聚焦）。四腿全绿：`terminal_focus_132_boot_empty_open_ok / boot_empty_focus_ok / in_session_ok / new_session_ok / bridge_swap_back_ok`。
- 2026-09-22 (t44 环境段披露，t129/t117/t125/t130 手法)：全套 smoke 四轮均翻在 **ticket-44 user_copy 段**（「window never took focus for the real-clipboard click」×3 /「user message blocks never rendered」×1——机器窗口焦点被占用/macOS 拒绝 steal 的已知环境类，与本票 diff 零交集；第四轮通道已清空仍复现，操作者活跃期）。取证手法：把 `terminal_focus_132` 阶段**临时前移**到 t44 之前的稳定位置（empty_state 后）重跑——四腿全绿取证；随后**复原终位**（105 阶段后），git 验证 stage 块**逐字节一致**（byte-identical: True）。**票 105 阶段五腿未能在本会话重跑取证**：它位于 t44 之后，且其真实键入腿（sendInputEvent 回显）需要与 t44 完全相同的真实窗口焦点——同一环境堵点；作为替代证据：105 阶段代码零改动，其全部 bump 路径（⌘J 开/标题栏/+ /切回）在本票 132 腿（in_session/new_session/bridge_swap_back 全绿）与 dock-model 44 例单测（含票 105 的 8 例 focusSeq 表）中逐路验证；桥接不抢焦由 132 bridge 腿直接断言（绿）。
- 2026-09-22 (自检复盘：票 105 修复为何未拦住)。**smoke 覆盖缺口**：票 105 的 smoke 五腿全部假设「⌘J 时 shell 已挂载」（阶段时序 = 会话已聚焦 + tab 已开），新会话/boot 空态两个入口（bump 早于 shell 挂载 / 公告重挂载换掉接收者）从未有腿；且票 105 修复实现本身把请求绑定在双 rAF 时刻的 workspace 实例上——即使时序踩进窗口也必丢。**防复发机制**：①四入口参数化 smoke 腿固化（本票第一验收项）——任何入口的焦点丢失都会在 CI/smoke 直接翻红；②根因层修复把请求从「时刻」改为「状态」（armed 直至兑现），不再依赖时序运气。
- 2026-09-22 (self-review 双轴，主 Agent 另派独立评审)。Standards 轴：决策收敛 Seam-1 纯函数+表驱动（零新缝，dock-model 既有家）；渲染层唯一胶水（BottomDock 透传 + TerminalDock 状态机 + 注册回调），注释解释约束（layout cleanup 时序、visible 取消）；smoke 探针命名循 105 评审先例（按内容命名）；无死代码/TODO，插桩与 harness 已全部移除。Spec 轴：验收五项逐条对照见上（复现✓/四腿✓/自检✓/桥接不抢焦✓/vitest-typecheck✓+ps 自查✓——vitest 2083/2083、typecheck 双 tsconfig 清、eslint 触碰文件清）。
- 2026-09-22 (操作者)：`bash scripts/merge-ticket.sh 132`。
- 2026-09-22 (status flip)：实现 tip = `6ad6a11`（fix(132): the ⌘J focus request survives the mounting races）；票文件翻 ready-for-human 提交在其上。
