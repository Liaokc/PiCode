# 131: History 0 rows 复现定位——fork 会话为第一复现场景

**What to build:** Branch History「0 rows」缺陷的**复现定位票**：第一复现场景 = **fork 会话**（操作者实报「fork 的会话history中没信息」——可稳定复现）；第二症状 = 长会话发送→终止后 History 恒 0 rows、后续发送不恢复。dev app 插桩链路 → 定位 → 修复 → electron smoke 固化（fork 会话 History 行数断言）。插桩点清单：①host `request_tree` 是否到达（`host/index.ts:999` `if (runtime) sendTree()`——注意无 try/catch，`treePayload()` 抛异常即静默无响应）；②`session_tree` 是否发出且载荷节点数（对长会话应 ≈841）；③supervisor 打标（`host-supervisor.ts:183-188` `emitScoped(binding.sessionId, …)`——转发时刻的绑定 id）；④renderer registry 落账（`session-registry.ts:355` 按 scope 写入）与 `focusedId` 一致性。修复后「0 rows / This session has no entries yet」空态文案不动（诚实原则）。

**背景（取证 = 排除清单，全部实证）：** 数据层全链路**实跑通过**——对 wrap-up 会话文件副本用仓库 node_modules SDK（0.85.1）`SessionManager.open().getEntries()` = 840 条、`buildSessionTree` = 841 节点无抛错、`sessionTreeDisplayRows` = 835 行；路由层静态全通——`sendFocused` 带 sessionId（`App.tsx:773`）、supervisor `session_command` 按 id 定向、boot 序列 session_created 先于 sendTree（announce 先行打标无竞态）、fork 走 `announceCurrentSession(true)` 理应 sendTree + sendHistory。**缺陷在运行时管道（renderer/main/host 三者之一的状态态），静态穷尽未现——插桩定位是本票义务**。

**Blocked by:** 无（独立；与 130 同 fork 入口——若复现涉 fork 流程改动需协调 rebase）.

**Status:** ready-for-human

## Acceptance

- [x] **复现 = 第一验收项**：dev app 稳定复现（fork 会话 History 0 rows）留档；长会话症状若同根一并修，不同根则 Comments 分票报备
- [x] 定位记录入 Comments（哪个环节断/为何断）；修复落点最小化
- [x] electron smoke：fork 会话 History 行数 = 源树行数断言；普通会话 History 不回归
- [x] vitest / typecheck 全绿；跑 dev app / smoke 前 `ps` 自查（dev-app serialization）

## Comments

- 2026-09-22 (requirements intake)：P1 + P23 同症并票（操作者 Round 3 报 fork 症状给出可复现路径）。排除清单全录 `intake-grilling.md`（数据层三段实跑 + 路由静态四点）。操作者原话：「我输入发送之后，点击终止，然后history没东西了，就算发送后也没东西」。
- 2026-09-22 (复现定位，第一验收项)：dev app（真实 app + CDP 驱动，种子会话免模型调用）稳定复现：840 条目链式会话 History = 0 rows / "This session has no entries yet"；小会话（4 条）不现。四点插桩证据链：① host `request_tree` 到达且 `sendTree` 成功构建发送 841 节点（host→main 子进程 IPC 为 JSON，深度容忍）；② supervisor 正常转发（jsonSize=149667、嵌套深度 1690），`webContents.send` 不抛异常；③ renderer 从未收到 `session_tree`（后续 request_tree 响应同样丢失），同批 `history_loaded`（144KB、深度 5）正常到达；④ registry tree 恒 null → 空态渲染，focusedId 全程一致。对照实验（同 841 节点、同 ~145KB）：广度型（210 根、深度 12）到达并渲染 631 行；链式（深度 1690）丢弃；阈值定位：300 条目（深度 ~610）OK、400 条目（~810）丢失。**根因：session_tree 载荷 children 嵌套深度（每条目 ~2 层）超出 Electron main→renderer IPC（V8 structured clone/Mojo）序列化深度限制，消息被静默丢弃**。两症状同根：长会话（深链）History 恒 0（发送/终止只是查看时机）；深会话的 fork 文件同为深链 → fork 会话同样丢并。**修复**：wire 载荷扁平化（nodes 按文件序 + parentId 链，嵌套深度 O(1)）——host 扁平发送、session-registry fold（唯一 wire 消费点，wrapped+legacy 两路）重建嵌套 canonical 树；下游（registry 状态/TreePanel/tree-view/视觉 harness）零改动，supervisor 纯转发零改动；host-contract smoke round L 改扁平断言（children 禁现 + parentId 校验 + census 不变）。无并行在飞工单消费 session_tree（issues 目录已核实）。空态文案「0 rows / This session has no entries yet」未动（诚实原则）。
- 2026-09-22 (implement + self-review, fallback 双轴)：实现 = ①`shared/sessions/types.ts` 增 `SessionTreeWireNode`/`SessionTreeWirePayload`（parentId 链、深度 O(1)，带约束注释）＋新纯模块 `shared/sessions/tree-wire.ts`（`sessionTreeToWire` 扁平化 / `sessionTreeFromWire` 迭代重建，乱序父引用按既有规则降级为根）；②`contract.ts` session_tree 事件改 wire 载荷；③`host/index.ts` treePayload 扁平发送；④测试：新 `tests/shared/sessions-tree-wire.test.ts`（往返/深度常数（1/50/600 链）/600 深链迭代重建保序/乱序降级/wire 形状无 children）、session-registry.test 增扁平 wire fold 用例、sessions-086-compat.test 增真实 0.86 fixture 的 wire census+往返断言；⑤host-contract smoke round L 改扁平断言；⑥electron smoke 新段 history_deep（t43 段后：430 条链 resume→源 History 430 行；fork@e200→forked History 201 行（200 链 + 1 session_info 自动命名行）+唯一 current tag）。vitest 2062 全绿 + typecheck 绿 + eslint 干净。真实 app 验证（CDP 驱动）：840 链→842 行（文件含早前 driver 追加 2 条）、430 链→430 行、fork@e200→201 行、小会话（4 条）→4 行。
- 2026-09-22 (electron smoke 取证披露)：本票段落在 src/main/smoke.ts ticket-43 段后（seed 430 链 + 真实 host resume + fork，零模型调用）。取证遇 t44 已知环境焦点阻塞（macOS 拒绝 steal）——按 t129/t130 已验证手法把 history_deep 段临时前移到 t44 之前（empty_state 之后、Round 1 之前）跑绿取证，跑完复原终位逐字节一致（git diff 验证单一插入块）：前移 run `history_deep_{source_rows_ok 430, fork_announced, fork_rows_ok 201, done}` 全绿，随后死于 t44 焦点（与 diff 零交集，本环境 smoke 无法越过 t44 故终位段无法在本环境整跑取证）。注：前移位时 fork 会话会接住 empty_state 段的 pending prompt（App 既有 session_created 投递语义，非本票行为）；终位（t43 后）无 pending prompt，段逻辑自包含两位置等价。普通会话 History 不回归：vitest 全量 + 真实 app 小会话（4 行）/430 链非 fork（430 行）+ smoke 段源断言，均绿。
- 2026-09-22 (smoke:host 留档)：①Round A 'A agent_end 1' abort 与模型收尾相撞（agent_end 早于 waiter 装载；机制：count-to-twenty 轮在 rename+abort 前已收尾）——本分支 2/4 趟死于该步，基线（stash 对照）同批通过该步，与 diff 零交集的时序 flake；②Round K（ticket-101 live stop）pi-subagents stop RPC 超时——stash 对照实验：基线同样死在同一断言（且票 130 Comments 已留档同现象为先例）；跑至 K 的趟次 Round B（含 fork 链路）全过，本票相关段（B/L）零回归。
- 2026-09-22 (self-review 双轴声明)：本工具集无 subagent 派发，按票内 fallback 自行双轴评审。Standards 轴：扁平/重建收敛为纯函数对（迭代、无深递归）、wire 约束在类型与模块注释中明文、契约变更最小且无并行消费者、无 TODO/死代码、插桩全部移除。Spec 轴：票面四条验收逐条对照（复现留档/定位 Comments/修复最小化/smoke 段+vitest+typecheck）全过。主 Agent 另派独立双轴评审。
- 2026-09-22 (branch)：分支 t131-history-zero，实现提交 tip = c57e878（含本翻票提交之前全部变更；随后由主 Agent 跑 scripts/merge-ticket.sh 131）。
