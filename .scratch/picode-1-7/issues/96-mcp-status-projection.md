# 96: MCP 状态投影——server 行连接状态

**What to build:** MCP 节（票 89）的 server 行增**连接状态投影**：connected / failed / needs-auth / not-connected / disabled（+ toolCount）。实现 = host inline extension 订阅 adapter 的版本化状态快照事件（`MCP_STATUS_EVENT`，pi.events 进程内总线）转发 renderer；按「**聚焦会话的 adapter 快照**」投影——无活跃会话时如实显无数据；**懒启动 server 不因查看状态而连接**（查看零副作用，数据源如实）。**additive 契约增量：host→renderer MCP 状态事件（实施时报备入 host-contract smoke）**。

**背景（取证）：** adapter README「Runtime status snapshots」节——快照含每 server name/status/toolCount/directToolCount/disabled + totalTools/connectedCount，机器可读只读投影；初始快照在初始化对账后发出、更新随状态变化、会话关停时空快照。状态是**会话作用域**运行时数据，配置文件（票 89）是全局面——两者在 UI 上分层如实呈现。

**Blocked by:** 89（MCP 管理节——状态行渲染在配置节内，Q4 拍板拆两票、89 先落）.

## Acceptance

- [x] Seam-1：状态快照投影纯模型（七态映射 / 无会话降级 / 懒启动零触发断言）
- [x] **additive 报备**：状态事件进 host-contract smoke（含旧载荷兼容）
- [x] electron smoke：有会话时状态行随快照更新（含 needs-auth 徽标）；无会话时如实空态；查看不触发连接
- [x] OAuth needs-auth 与票 89 的授权流入坑衔接（Authenticate 钮可见性）
- [x] vitest / typecheck 全绿；跑 dev app / smoke 前 `ps` 自查（dev-app serialization）

## Comments

- 2026-09-20 (implement session，分支 t96-mcp-status @ rebase 前 fe9f1e9+未提交，进行中)：**三层落地**（Seam-1 纯模型 / host 桥+渲染层 / 两个 smoke），调试取证链在案：
  - **Seam-1（`src/shared/mcp-status.ts` + `tests/shared/mcp-status.test.ts`，TDD red→green，15/15）**：`parseMcpStatusSnapshot`（结构校验 + 深冻结——投影是只读，消费者无法写入状态）、`statusForServer`（六态一一映射；缺席 = null 绝不臆造）、`shouldShowRuntimeBadge`（disabled 行不重复出运行时徽标——配置 Disabled 徽标已说）、`mcpStatusToolCountLabel`、`mcpStatusLine`（七态第七态 = 诚实降级：无会话/未上报/空快照三条如实文案，活数据显示时隐藏）。通道名 `MCP_STATUS_EVENT_CHANNEL = 'pi-mcp-adapter/status/v1'` 本地镜像并 pin v1（v2 换通道名即静默，不会误读新载荷）；adapter 非本仓库依赖（Seam-1 红线），类型/通道全镜像 + 测试钉死。
  - **host 桥（`src/host/mcp-status-bridge.ts`，第三枚 inline extension）**：订阅 pi.events 的版本化状态通道，`parseMcpStatusSnapshot` 验证后转发 `mcp_status` 契约事件（additive，contract.ts 增量已报备）。**纯接收零命令**——桥上没有任何 renderer→host 的命令路径，查看状态在构造上就零副作用（懒启动连接/授权都不可能被触发）。chat-reducer 防御性 no-op；App.tsx 折进 `mcp-status-store.ts`（per-session last-wins，快照是全量投影）；McpSection 行内活状态徽标 + tool 计数芯片（connected/cached 才显计数——failed/not-connected 的 0 不是服务器真相）+ needs-auth 行保证 Authenticate 钮可见（`row.oauth || status === 'needs-auth'`，与票 89 授权流衔接）；节级诚实状态行（`data-mcp-status-line`）。
  - **host-contract smoke Round I（票 96 报备）**：seeded `.mcp.json`（懒启动 + disabled 两 server）→ mcp_status 快照断言：version 1、有界字段（listenState/catalogStale 不入契约）、懒 server 如实 not-connected、disabled server 如实 disabled。**关键取证：adapter 的 `deferSessionRuntime` 缓存复用快路径**——早期配置按 `process.cwd()` 解析（fork 时继承 app 启动目录），空配置 + 真实 agent dir 有 mcp-cache.json → `every` 空数组恒真 → 整个会话运行时被推迟（session_start 直接 return）→ 无快照；Round I 以 `fork(..., { cwd: mcp96Cwd })` 修（镜像 pi TUI 的「进程 cwd = 项目目录」语义），快照如期而至。**此取证直接催生 supervisor 修复（见下）**。
  - **electron smoke（`src/main/smoke.ts`）**：① empty_state 阶段前插「无会话如实空态」探针（开设置 → MCP → 断言 no-session 文案 + 零运行时徽标 → Esc）；② t89 阶段 seed 增三 server——`bearer-api`（eager+static bearer，初始快照即 Connected+2 tools）、`eager-cms`（eager+oauth，init 连接 401 → needs-auth 徽标——取证：`auth-required` 回调只清失败状态，**不开浏览器不开流程**）、`lazy-probe`（连接才写 marker 文件的零触发探针）；③ 断言 `mcp_status_projection_ok`（含 marker 不存在的零触发红线）+ ⑨b `mcp_status_live_update_ok`（OAuth 流成功 → adapter 重连 → 快照转发 → mock-oauth 徽标 Not connected→Connected+2 tools 的活更新）+ ⑪b 全程零触发复核；④ mock /mcp 改为**受保护端点**（无 Bearer 401；静态 bearer token 或已发 OAuth token 放行；tools/list 返 2 工具——计数断言的真值源）。
  - **supervisor fork-cwd 对齐（`src/main/host-supervisor.ts`）**：会话 host 现在以**会话工作区**为进程 cwd fork（TUI 同语义；cwd 已删则回退继承 cwd 保住死 cwd 的 exit(1) 语义）——否则 adapter 的 deferSessionRuntime 让所有 PiCode 会话的 MCP 运行时永远推迟（round I 取证），票 96 的活快照在真实应用里也永远不会流动。修复后 ③b/⑨b 全过。
  - **t93 阶段既有时序竞态取证（诚实记录）**：scroll93 的注入回合探针在快模型下必挂——① `WORKING_BOTTOMMOST` 只认 'Working' 标签，但 glm-5.3-flash 常在探针前就把整个小回合跑完（标签已 'Worked'）；② `agent_end`/delta waiter 在探针之后才武装，事件已流过则 90s 空等。**main 基线对照实验**：stash 全部改动后 main @ fe9f1e9 同样挂（DOM 数据逐字节相同 scrollTop=2496/scrollH=3151/clientH=655）——证明是既有竞态非本票回归。本会话的修法（标签接受 Working|Worked + waiter 前置武装）在 rebase 时发现 **t94 的 code-review 已在 main 独立修了同一竞态**（`WORKING_OR_SETTLED_BOTTOMMOST` + IDLE_COMPOSER DOM 锚定）——rebase 冲突全取 main 版，本票零残留、零重复修复。
  - **dev-app serialization 取证**：wt-94 会话当日连跑 smoke94e→n（间隔 3–10 分钟），本会话 5 次 electron smoke 中 4 次与其窗口重叠——重叠期的失败全部复现在时序敏感断言上（slash_gate/chip_toggle/ticket-52），无重叠窗口的失败才有判定力；后续验证均以 `ps` 自查 + wt-94 日志 mtime 交叉核对窗口。
  - **⑩ 手动粘贴腿修复（取证闭环）**：`mcp_auth` 自动成功无对话框 → mock 日志 `grant=refresh_token`（应走 paste 对话框）+ `keychainAfterDelete=true` → **keychain 清理失效根因**：adapter 会把 token 拆成多个 keychain 条目（chunked token storage），无账户约束的 `security delete-generic-password -s` 遇多条目报 "multiple items match" 静默失败（catch 吞掉），⑨ 的 token 残留 → ⑩ 流程走刷新路径静默成功。修法：删除带 `-a <sha256(server)>` 账户约束（⑩ 腿 + finally 清理同为账户定位、覆盖 eager-cms/bearer-api 账户），操作员 keychain 的孤儿条目已按同法清除。修后 `grant=authorization_code`（真 paste 流程）+ 全套断言过。
  - **完整套件绿色复跑**：`npm run smoke:electron` exit 0（14:47–14:52，无 wt-94 窗口重叠，ps 自查无其他 dev app/smoke 进程），七项票 96 断言全绿——no_session / projection / live_update / paste_dialog / manual_paste / credentials_zero_leak / lazy_untouched；contract smoke Round I 报备在 stage 2 全套内通过。既有取证结论：其余 stage 的偶发失败（slash_gate 菜单 0 行 / menu_surface / ticket-49 / scroll93）为模型速度与操作员目录漂移的环境竞态——stash 基线对照证明与票 96 改动无关，复跑即可过（本会话照此收口）。

- 2026-09-20 (code-review 双轴，/code-review skill，base main…HEAD @ 4c5e5a4 固定点 b2c3c09，reviewer 子代理双轴顺序执行)：两轴均 **OK with notes（零硬违规、零 P0/P1）**。
  - **Standards 轴**：契约增量纯 additive（contract.ts 仅新增 `mcp_status` 成员，supervisor 泛化转发）；桥纯接收零命令与 CONTEXT.md MCP 节「纯接收零命令」词条逐句对应；disabled 行不重复运行时徽标、诚实空态、深冻结 parse 均确认。**P2×6**：① host 死亡/分离后快照不失效（stale 徽标违数据源如实）——**已采纳修复**：store 增 `dropSession`，App 对 host_exit/session_detached 落账（+3 测试，1744 全绿）；② `statusForServer` 与 `serverStatusEntry` 重复查找——**已采纳**：前者改由后者表达；③ tool-chip 可见性规则硬编码在 McpRow 而 `shouldShowRuntimeBadge` 在纯模型——**已采纳**：增 `shouldShowToolCount` 归位（+1 测试）；④ Round I 捕获/删除 try-catch 形状重复——豁免（跨事件类型分支与单账户/多账户清理形状不同，提取反而费解）；⑤ ⑩ 中段 keychain 删除缺 `!keychainBefore` 守卫——豁免并留档：`mock-oauth` 为 smoke 专名，⑨ 流程本就覆写同账户条目，加守卫反而使腿失效；⑥ 快照 totals 字段暂无 UI 消费——保留（additive-only 禁删），无消费者不扩展。
  - **Spec 轴**：五验收项逐一过源码验证零缺失零走样；(b) 三处疑似 scope creep 均判合理——supervisor fork-cwd（快照得以流动的根因修复，取证在案）、mock 受保护端点（needs-auth/计数断言的真值源）、visual-settings 帧（截图报告规则）；App.tsx skip-fold 相对 mcp_auth 的差异判定合理（registry fold 每快照分配全量状态，mcp_auth 稀有）。**P2×1**：Round I 对二次快照 fail 过严——静态 seed 下不会复现，不修。reviewer 无 shell，测试/typecheck 由本会话补跑闭环（vitest 1741→修复后 1744 全绿、typecheck 清、完整 smoke exit 0 见上条）。
  - **基础设施取证**：code-review 的 async 子代理两次拉起失败——pi-subagents 已升级 0.70.0（main 票 111），后台 runner 经 jiti 解析 `src/runs/background/subagent-runner.ts` 不再存在（.ts 源已被 .js 编译产物取代）→ 改用阻塞式前台子代理（同一受治理通道，async:false）完成两轴。

**Status:** ready-for-human
