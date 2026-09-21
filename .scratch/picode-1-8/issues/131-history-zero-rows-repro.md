# 131: History 0 rows 复现定位——fork 会话为第一复现场景

**What to build:** Branch History「0 rows」缺陷的**复现定位票**：第一复现场景 = **fork 会话**（操作者实报「fork 的会话history中没信息」——可稳定复现）；第二症状 = 长会话发送→终止后 History 恒 0 rows、后续发送不恢复。dev app 插桩链路 → 定位 → 修复 → electron smoke 固化（fork 会话 History 行数断言）。插桩点清单：①host `request_tree` 是否到达（`host/index.ts:999` `if (runtime) sendTree()`——注意无 try/catch，`treePayload()` 抛异常即静默无响应）；②`session_tree` 是否发出且载荷节点数（对长会话应 ≈841）；③supervisor 打标（`host-supervisor.ts:183-188` `emitScoped(binding.sessionId, …)`——转发时刻的绑定 id）；④renderer registry 落账（`session-registry.ts:355` 按 scope 写入）与 `focusedId` 一致性。修复后「0 rows / This session has no entries yet」空态文案不动（诚实原则）。

**背景（取证 = 排除清单，全部实证）：** 数据层全链路**实跑通过**——对 wrap-up 会话文件副本用仓库 node_modules SDK（0.85.1）`SessionManager.open().getEntries()` = 840 条、`buildSessionTree` = 841 节点无抛错、`sessionTreeDisplayRows` = 835 行；路由层静态全通——`sendFocused` 带 sessionId（`App.tsx:773`）、supervisor `session_command` 按 id 定向、boot 序列 session_created 先于 sendTree（announce 先行打标无竞态）、fork 走 `announceCurrentSession(true)` 理应 sendTree + sendHistory。**缺陷在运行时管道（renderer/main/host 三者之一的状态态），静态穷尽未现——插桩定位是本票义务**。

**Blocked by:** 无（独立；与 130 同 fork 入口——若复现涉 fork 流程改动需协调 rebase）.

**Status:** ready-for-agent

## Acceptance

- [ ] **复现 = 第一验收项**：dev app 稳定复现（fork 会话 History 0 rows）留档；长会话症状若同根一并修，不同根则 Comments 分票报备
- [ ] 定位记录入 Comments（哪个环节断/为何断）；修复落点最小化
- [ ] electron smoke：fork 会话 History 行数 = 源树行数断言；普通会话 History 不回归
- [ ] vitest / typecheck 全绿；跑 dev app / smoke 前 `ps` 自查（dev-app serialization）

## Comments

- 2026-09-22 (requirements intake)：P1 + P23 同症并票（操作者 Round 3 报 fork 症状给出可复现路径）。排除清单全录 `intake-grilling.md`（数据层三段实跑 + 路由静态四点）。操作者原话：「我输入发送之后，点击终止，然后history没东西了，就算发送后也没东西」。
