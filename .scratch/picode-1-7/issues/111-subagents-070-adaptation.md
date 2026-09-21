# 111: pi-subagents 0.70.1 适配——集成面重验

**What to build:** pi-subagents 已更新 **0.68.0 → 0.70.1**（本机 09-21 `pi install npm:pi-subagents` 就位；0.69.0 09-18 / 0.70.0 09-19 / 0.70.1 09-20 发布）。在 0.70.1 上**重验 90/99/101 的全部集成面**：①RPC 回复形状（`subagents:rpc:v1:*` status/steer/stop 回复、fleetStatus DTO v1、asyncSnapshot）；②async 工件字段消费（status.json：runId/sessionFile/state/tokens/workflowGraph）；③事件（async-started/complete、child-status）；④七态投影实测对照真实运行（起一个真实子代理跑全程）。**漂移即修、不漂移留档确认**；不新增功能面（0.70 新能力 allowedAgents/defaultSubagentOnlyExtensions/typed gates 的呈现 = 观察项不立项）。

**背景（取证）：** 核心集成面文档核对**无 breaking**——RPC 通道/方法面、fleetStatus DTO、工件路径与字段、事件族在 0.70.x docs 全部在位（0.70.1 复核：RPC v1 通道/fleetStatus/async 工件零变化）。0.70.x 变更 = 新能力 + 修复（0.70.0：detached 子代理可见性、tool_budget_exhausted 报告、usage 对账、FleetView 分组/着色；0.70.1：委派任务完成判定改进、runtime agent 模型偏好、**Pi 0.86.1 支持**、前台子代理跨 npm 布局启动修复；唯一 Removed = completionGuard 设置/PI_SUBAGENTS_LLM_INTENT_ARBITER 开关——PiCode 未消费）。但 90/99/101 的实现以 0.68.0 文档为基准且**尚未在 0.70.x 上跑过**——适配验证在合入前完成。0.70.1 的 Pi 0.86.1 支持与本批票 112（SDK 0.86.1 升级）正相衔接。

**Blocked by:** 101（子代理停止+徽标——重验对象是其交付面）+ 112（SDK 0.86.1——0.70.1 明确支持 Pi 0.86.1，重验必须跑在新 SDK 上，旧 SDK 上重验无意义）.

**Status:** ready-for-human

## Acceptance

- [x] 集成面重验清单留档：RPC 回复形状 / status.json 字段 / 事件 / 七态投影 × 0.70.1 实测（真实子代理运行）——逐项「确认无漂移」或「漂移 + 修复 sha」（见 Comments 2026-09-21 实施记录）
- [x] electron smoke：90/99/101 的既有 stage 在 0.70.1 上全绿（exit 0 零 FAIL，subagent_dir/chat/stop 全阶段证据行存 /tmp/electron-smoke-111-r3.log 与 commit message）
- [x] 若有漂移：修复 + 注明 0.70.x 的对应 CHANGELOG 条目；无漂移：票内明确记录「无漂移」结论（漂移 ×2：steer 回执形状 + async runner host 解析缺口；逐项见 Comments）
- [x] vitest / typecheck 全绿；跑 dev app / smoke 前 `ps` 自查（dev-app serialization；含 wt-115 占窗期间的两次 ticket-91 无关失败与窗口清后重跑收口记录）

- 2026-09-21 (intake 同步)：pi-subagents 重装 **0.70.0 → 0.70.1**（0.70.1 = 委派任务完成判定改进 + Pi 0.86.1 支持 + 前台启动修复；集成面零变化、唯一 Removed 的 completionGuard/INTENT_ARBITER PiCode 未消费）——票基准 0.70.0 → **0.70.1**，重验范围不变。与票 112（SDK 0.86.1）正相衔接：111 的重验应跑在 112 升级后的 SDK 上。

## Comments

- 2026-09-21 (implement session)：在 **0.70.1 + SDK 0.86.1 基座**（rebase main 0453db3，112 已合入）上完成 90/99/101 全部集成面重验。三层证据：静态（0.70.1 docs + 源码逐点核对）→ **真实子代理探针**（新增 `npm run smoke:subagents070` = scripts/smoke/subagents-070-probe.ts，真实 async run 三腿全程）→ 全量回归。

**① RPC 回复形状**（桥接消费路径 + 原始回复双验）：
- 通道/方法面：`subagents:rpc:v1:request` / `reply:<id>`、ping/status/steer/stop——docs extension-api.md 与 0.70.1 源码逐字在位，**无漂移**。
- ping capabilities：`fleetStatus {version:1}`、`nonRecoveringSteer`、`events.childStatus = subagent:child-status` 全在位（留档：`events` 是 ping data **顶层**字段而非 capabilities 子字段——探针首版读错位后按源码校正；PiCode 桥接不读 ping，非消费面问题）。
- status 回复 `{text, details, fleet, asyncSnapshot}`：fleet DTO v1（entries[key/agent/role?/model?/effort?/goal?/startedAt/tokens{input,output,total}]/totalActive/omitted）与 `fleetFromRpcData` 投影一致，**无漂移**；`asyncSnapshot.runs[].id` 在位（PiCode 按设计不消费——工件是 live 源）。
- steer 回复：acknowledged-delivery `deliveryStatus ∈ delivered|queued`——**漂移 #1（实质，已修）**：真实回复中字段在 `data.details.steering.deliveryStatus`（management-action result 形状），票 99 实现读的 `data.deliveryStatus` 顶层**从未存在于真实回复**；既有验证（Round J / electron ticket-99）只命中 unknown-run 错误路径，happy path 首次实测即现形。修复：桥接读 `details.steering.deliveryStatus` + 顶层容错回退；vitest fixture 更新为 0.70.1 真实形状 + 1 个 fallback 用例。
- stop 回复：`{runId, asyncDir, previousState, state:"stopping", message}` 顶层——桥接 `state==='stopping'` 读取正确，**无漂移**（Round K + 探针 stop 腿真实回执 ok:true state:stopping）。

**② async 工件字段**（status.json，真实 run 全程 census）：
- 0.70.1 实写 census：`artifactsDir,chainStepCount,completionOwnerId,currentStep,cwd,deadlineAt,endedAt,error,lastActivityAt,lastUpdate,launchContractDigest,launchResolvedExtensions,lifecycleArtifactVersion,mode,outputFile,outputs,parallelGroups,pid,processTerminal,runFanoutBudget,runId,sessionDir,sessionFile,sessionId,startedAt,state,steering,steps,stopped,timeoutMs,toolCount,totalCost,totalTokens,turnCount`——票 90/99 消费面（runId/id、state、startedAt、endedAt、mode、sessionFile、steps）全在位，`parseRunStateEnvelope`/`parseTranscriptSourceEnvelope` 对真实工件解析通过，**无漂移**。
- 源码核对：`agents`（runner:1374）、`currentTool`（:1075/:1126）、`activityState`、`nestedChildren`（async-status.js:301）写点全在——单 run 快速探针未观察到（并行/嵌套/工具活动态专属），vitest 表格 fixture 与 0.70.1 写点逐一对照一致。
- tokens/workflowGraph 观察：`totalTokens`/`totalCost` 真实落盘（async-complete 载荷亦含）；`workflowGraph` 单 run 不写（workflow 专属）——PiCode 均按设计不从 status.json 消费（fleet DTO 供 tokens），观察项不立项。

**③ 事件**：
- `subagent:async-started`（id/mode/agent/agents/asyncDir/task/goal/...）raw + 桥接 twin 到达，**无漂移**；`subagent:async-complete`（runId/state/success/summary/durationMs/totalTokens/...）raw + twin，**无漂移**；`subagent:foreground-complete` 源码 emit 形状（runId/mode/agent/success/state/summary）与桥接消费一致（探针不跑前台 run——该面由 electron ticket-101 foreground_abort 腿覆盖）。
- `subagent:child-status`——**行为澄清（留档，非漂移）**：顶层 stop 走 `stopRunner()` 只记 run 级 lifecycle（`subagent.run.stopped`），child-status 不发；childId 定向 stop 才发（RPC 即时 `stopping` + runner 写 `stopped`）。与 docs「observer hints only；status snapshots authoritative」一致——PiCode 投影序（回执 → 工件状态）本就不依赖该事件。childId 定向腿实测：stopping/stopped raw + twin 到达、run 终态 `failed`（child exit 1）→ failed 徽标如实。

**④ 七态投影实测**（真实子代理跑全程，共享 parser 逐态）：
- running（真实 status.json state=running → running 徽标）；complete → **completed**（自然完成腿，含 steer 后续回合）；stopped → **cancelled**（顶层 RPC stop 腿 = 票 101 真实路径）；failed → **failed**（child 定向 stop 的 run 终态）。
- queued→waiting、paused→blocked、detached→running：非本环境可稳定实测的瞬态——vitest 表格（23 用例）+ 源码写点核对收口；**lost** 由 electron ticket-90 阶段（工件缺席投影 Lost）覆盖。

**漂移 #2（环境缺口，阻塞真实运行，随票修复）**：pi-subagents 0.68.0 起（#2254）async runner 需要 `PI_SUBAGENTS_PI_CODING_AGENT_PACKAGE_ROOT` 或 argv 入口可识别 host 包；PiCode 打包布局（入口 `out/main/host.js`、SDK 在 app node_modules）必 miss → **PiCode 内真实 async run 此前从未可能启动**（90/99/101 全部以种子工件 + 真实 RPC 验证，launch 路径零覆盖）。修复：host 在扩展管道装载 pi-subagents 前 `ensureSubagentRunnerPackageRoot(sdk.getPackageDir())`（新模块 `src/host/subagent-runner-root.ts` + 7 用例单测）——override 指向本 app 运行的 SDK 树（runner peer-alias 校验经嵌套 node_modules 全过）；操作者显式 override 优先；app.asar 内布局不设（plain-node runner 读不了 asar，维持 fail-closed 语义）。探针实证：修复前 spawn 即失败（"neither is available"），修复后真实 run 全程跑通。
- CHANGELOG 对照：#2254 = **0.68.0**「Honor PI_SUBAGENTS_PI_CODING_AGENT_PACKAGE_ROOT for background children」——非 0.70.x 新破坏，而是 0.70.1「前台子代理跨 npm 布局启动修复」（#2348）的同族背景面；111 的真实运行要求首次暴露该缺口。steer 形状：0.70.1 docs「receipts include deliveryStatus」不指明位置——票 99 以 0.68.0 docs 为基准假设顶层；0.70.0/0.70.1 CHANGELOG 无此形状变更记录（诚实结论：**漂移在消费侧的形状假设，而非 0.70.x 变更**）。

**全量回归**：vitest **1943/1943**（bridge steer 形状 fixture 更新 + runner-root 新 7 例）；typecheck 双 tsconfig 清；host-contract smoke **A–L 全 PASS**（真实 stop 收据 ok:true state:stopping）；electron smoke **exit 0 零 FAIL**——ticket-90（seeded 24+1 / Show 20 more / 工件 running→complete 翻转 / 重开重建 25/25/0）、ticket-99（chat 打开 / live 更新 / 回执 / ×关不杀 / 只读 / 错误路径）、ticket-101（徽标 0→2→0 / cancel / Esc / stopping / stopped / 前台 abort）全绿。
- dev-app serialization：跑 smoke 前 `ps` 自查；期间两次 electron smoke 失败于 ticket-91（与本票无关的 composer/overlay 阶段、两次断言各不同）——`ps` 复查发现 **wt-115 的 smoke 窗口进行中**（负载 7），窗口清后重跑全绿（exit 0）收口；无本票改动引起的失败。

**观察项（不立项）**：0.70 新能力（allowedAgents / defaultSubagentOnlyExtensions / typed gates、detached 可见性、tool_budget_exhausted 报告、FleetView 分组着色）零 PiCode 消费面；ping capabilities 新成员（resume / processTerminalProof / launchResolvedExtensions / runtimeAcknowledgedExtensions）不读取；桥接未知字段容错纪律保持。
- 2026-09-21 (code-review 双轴采纳)：standards 轴 0 硬违反 + 4 判断性意见；spec 轴 0 缺失 / 0 实现错误（七态中 3 瞬态未实测的字面偏离已在实施记录留档；探针脚本与漂移 #2 判为合理附带/必要修复；`ensureSubagentRunnerPackageRoot` 挂载点核实无漏挂——host 内 SDK 会话创建唯一路径）。处置：
  - **standards ①②③（采纳，一次同修）**：新增共享 `digRecord(value, ...keys)`（src/shared/subagents/artifact.ts——桥接 RPC 回复读取与探针回复深挖共用同一守卫级联，永不漂移）；探针抽 `extractSpawnIdentity(reply)`（spawn 回执解包三腿 ×3 抄写 → 一处；顺带返回 `{runId, asyncDir, details}` 小类型 = Data Clumps 收口）；探针删除本地 `isRecord` 副本（复用 artifact.ts 导出）、ping/status/stop 回复深挖全部改走 `digRecord`。bridge 顶层 `data['deliveryStatus']` 回退 = 仓库容错纪律，repo overrides 不单列（评审者同判）；Message Chains 一条评审者自判不改动。
  - 复验（app 代码变更 = 桥接 steer 读取改走 digRecord，按 t112 先例全量重跑）：vitest **1967/1967**、typecheck 双 tsconfig 清、host-contract smoke PASS、electron smoke **exit 0 零 FAIL**（subagent_dir/chat/stop 全 done）、探针复跑 **PASS**（本轮 census 额外捕获 `currentTool`/`currentToolStartedAt`/`currentPath` 活动态字段——②表证据再增）。
- 2026-09-21 (merge session，per 操作者验收指令「111 工单已验收」)：Status 翻转 ready-for-human（验收框既有勾选在案；证据链 = 三层取证 + 两漂移修复 + 评审双轴采纳 + 全量回归 1967）。合并会话仅簿记未重跑——合并后 main 上 typecheck + vitest 复验闭环。
