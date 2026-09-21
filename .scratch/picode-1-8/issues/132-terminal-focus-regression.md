# 132: ⌘J 终端聚焦回归定位——新会话入口 + 全入口 smoke 防线

**What to build:** ⌘J 打开终端焦点不进的**回归定位票**（票 105 已修问题的复发——操作者明示「这些已经修复问题的工单完成了，能不能不要再出现相同的问题？请自检一下」）：dev app 复现（**新开会话 + ⌘J** 场景——操作者实测路径）→ 定位 → 修复 → **全 ⌘J 入口 electron smoke 参数化**（会话内 / 新会话 / boot 空态 / 桥接切回——回归防线 = 本票第一验收项）。自检结论前置：票 105 的 focusSeq 双 rAF 机制在位（`TerminalDock.tsx:36-76`），修复覆盖了会话内路径；**新会话/空态入口无回归测试**——票 105 smoke 的覆盖缺口即本次复发通道；候选干扰源 = create 后视图重挂载/composer 自动聚焦与终端聚焦的时序竞争（票 106 乐观卡重挂载、票 98 焦点纪律 rAF 归还为嫌疑，插桩实证为准）。

**背景（取证）：** 操作者图8：新开会话 ⌘J 打开终端，光标不在终端。`TerminalDock.tsx` focusSeq 机制（dock 动作 bump → 双 rAF → focusTerminalRef）在位；「新开会话」路径的 focus 争抢静态未定位（与 131 同类：运行时态缺陷，插桩定位是票内义务）。

**Blocked by:** 无（独立）.

**Status:** ready-for-agent

## Acceptance

- [ ] **复现 = 第一验收项**：dev app 稳定复现「新会话 + ⌘J 焦点不在终端」留档；触发时序证据链入 Comments
- [ ] 修复后 electron smoke：**四入口参数化**——会话内 ⌘J / 新会话 ⌘J / boot 空态 ⌘J / 桥接切回，四腿全断言焦点进终端
- [ ] 自检报告入 Comments：票 105 修复为何未拦住（smoke 覆盖缺口复盘——防复发机制补齐说明）
- [ ] 桥接可见时终端不抢焦点（票 105 语义）不回归
- [ ] vitest / typecheck 全绿；跑 dev app / smoke 前 `ps` 自查（dev-app serialization）

## Comments

- 2026-09-22 (requirements intake)：P7 定稿为 R6。操作者原话含问责（「请自检一下」）——票内 Comments 必须含诚实复盘（覆盖缺口与防复发机制），不重开票 105。
