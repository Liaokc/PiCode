# 112: pi agent 0.86.1 升级适配——SDK 对齐检查点

**What to build:** 内嵌 SDK 从 **0.85.1 升级到 0.86.1**（ADR-0005 对齐检查点——TUI 全局 pi 已实测 0.86.1，首次漂移；0.86.1 = Meta Muse provider + 启动提速 + /bug·剪贴板修复，零新增 breaking，0.86.0 的 breaking 分析原样适用）：①升级依赖并修复 typecheck 实证的一切签名/类型断点；②**会话格式兼容冒烟**——TUI 0.86 写的会话（含新 entry 类型：`before_agent_start` 持久化、`pi.bug-report` 等）在 PiCode 能打开、转录投影对未知/新 entry 类型**优雅降级**（不崩、不丢既有条目）；③changelog 影响面适配（0.86.0 三条 breaking 交叉核对均不命中 + 0.86.1 零 breaking，以 typecheck/回归实证收口）；④全量回归绿（vitest / host-contract smoke / electron smoke）。

**背景（取证，intake 交叉核对 0.86.0/0.86.1 changelog × PiCode 集成面）：** 0.86.0 三条 breaking **均不命中**（0.86.1 无新增 breaking——仅 provider 增补/启动提速/修复）——①pi-ai `Context`→`TranscriptContext` 是自定义 provider 流 API（PiCode 零自定义 provider，直通 SDK 内建流）；②`ToolCall.arguments`/`ToolResultMessage.details` 收紧为 JSON 兼容值（PiCode 消费的 details.diff/images/async 信息本就是 JSON 值——收紧不破坏读取）；③`user_bash` fail-closed（PiCode/gate-extension 不用 user_bash）。用面签名全在位（createAgentSessionServices/FromServices/Runtime、SessionManager.open/create、steer/followUp/clearQueue/setSessionName、queue_update 事件形态不变）。可选项：`pi.on()` 现返回退订函数（gate-extension 可选采纳，不强制）。相关新行为：strict-prefer JSON sampling 默认化、per-model compaction overrides——投影/门行为无依赖，回归验证收口。

**Blocked by:** None (can start immediately——合入后 111 的 0.70.1 重验随即开工).

**Status:** ready-for-human

## Acceptance

- [x] package.json 内嵌 SDK 升 0.86.1；typecheck 双 tsconfig 实证三条 breaking 不命中（或命中即修）
- [x] **会话格式兼容冒烟**：TUI 0.86 写的会话（含新 entry 类型）在 PiCode 打开——既有条目完整、新类型优雅降级（parse 不抛、不丢条目）；用 TUI 真建一个含 /bug 或 before_agent_start 持久化的会话做种子
- [x] ADR-0005 例行：TUI↔内嵌 SDK 版本对齐记录入票（0.86.1 = 0.86.1，无漂移收口）
- [x] 全量回归：vitest / host-contract smoke（4 个 additive 增量仍在）/ electron smoke 全绿
- [x] 跑 dev app / smoke 前 `ps` 自查（dev-app serialization）

- 2026-09-20 (intake 同步)：TUI `pi update` 后实测 **0.86.1**（0.86.1 = Meta Muse provider/启动提速/修复——零新增 breaking；0.86.0 分析原样适用）；票目标版本 0.86.0 → **0.86.1**。`pi update` 跳过扩展（--extensions 另行）——票 111 的 pi-subagents 0.70.0 基准不受影响。
- 2026-09-21 (implement session)：四件全绿，实现面零漂移修复（parse 投影的容错纪律原样承接 0.86 新形状）。
  - **① SDK 升级**：`@earendil-works/pi-coding-agent` 0.85.1 → **0.86.1**（package.json + lock 重生成，ce489c5）。
  - **② breaking×3 交叉核对——实证收口，全部不命中**：
    - `Context`→`TranscriptContext`（自定义 provider 流 API）：`rg TranscriptContext|StreamFn|streamFn src/` 零命中——PiCode 零自定义 provider，直通 SDK 内建流；用面签名（createAgentSessionServices/FromServices/Runtime、SessionManager.open、steer/followUp/clearQueue/setSessionName、queue_update）全在位——host 编译即证。
    - `ToolCall.arguments`/`ToolResultMessage.details` JSON 兼容收紧（含 `ToolResultMessage` 条件类型、`JsonValue` 数组 readonly）：`npm run typecheck` 双 tsconfig **零错误**——PiCode 的 details 消费面全部防御性 `Record<string, unknown>`（subagentInfoOfDetails/resultDetails/toolCalls），收紧不破读取；运行时面由 smoke Round L 的 subagent 身份投影再证（JSON details 上的 runId 照常投影）。
    - `user_bash` fail-closed：`rg user_bash src/ scripts/` 零命中——不消费。`pi.on()` 退订函数：gate-extension 一次性注册（进程生命周期内不摘除），退订函数**不采纳**（可选增量，无强制）。
  - **③ 会话格式兼容冒烟（核心风险面）——两层证据**：
    - **纯 parse 缝（vitest）**：新增 `tests/shared/sessions-086-compat.test.ts`（5 例）——种子复制本机 **TUI 0.86.1 真实会话**（wt-105，09-21 `pi update` 后 TUI 所写）的形状 + 0.86.1 SDK 源/文档：role:system 提示词/工具装载持久化（before_agent_start）、custom_message 扩展通知（display:false）、`custom` pi.bug-report（/bug 入账）、`usage` cache_warm、外加一个假想未来类型。断言：parse 不抛、9/9 条目全保留、既有 message 流回放完整（user/assistant/tool 顺序与形状不变）、新/未知类型降级为容忍的 other 树节点、leaf 落最后条目、system 前导永不劫持标题。
    - **端到端（host-contract smoke 新 Round L，报备）**：同形状种子经**真实 SDK 0.86.1 host** 打开——resume → history_loaded 四条既有 message 项完整（system/custom/usage/未知类型留在 LLM 回放外，零丢失；toolResult 的 JSON details 上 subagent 身份投影完好）→ session_tree 9/9 种子节点 + 1 条 bookkeeping 尾（resume 自身 thinking_level_change，F 轮已档的唯一合法尾巴）→ 磁盘无损收尾（9/9 种子 id 在盘、零追加 message、零 branch_summary）。**真文件旁证**：真实 wt-105 TUI 0.86.1 会话（267 条目，含 system 持久化 + 3× custom_message）过纯 parse 缝——267/267 保留、210 回放项、267 树节点、新类型全降级，无抛无丢。
  - **④ ADR-0005 例行对齐记录：TUI 全局 0.86.1 ↔ 内嵌 SDK 0.86.1 = 零漂移**（首次漂移 0.85.1→0.86.1 就此收口；后续升级按本票流程例行）。Interop smoke 双向（SDK 重开 PiCode 会话 + PiCode 开 TUI 会话）同为兼容面实证。
  - **⑤ 全量回归绿**：vitest **1935/1935**（含新 5 例）；typecheck 双 tsconfig 清；host-contract smoke **A–L 全 PASS**（既有 4 个 seeded additive 轮 H/I/J/K 照常 + 新 L）；pty / usage / interop / electron smoke 全绿（electron exit 0，multi_shutdown_no_orphans_ok）。dev-app serialization 遵守：跑 smoke 前 `ps` 自查，wt-108/wt-110 的 smoke 窗口期间本票只跑 vitest/typecheck/构建，窗口清后补跑 smoke 阶段。
  - **smoke harness 修缮（随票报备）**：step 超时改**活动感知**（每收到一个 host 事件重臂——90s 无事件 = 挂起才杀）。原绝对式 90s 预算在 0.86.1 时代的模型延迟下把健康的多投喂队列流（日志里 delta 还在滚）误杀——4 跑中 3 次 timeout 死于 A 轮队列步，流本身健康。不改任何契约断言；kill 语义从「一步超 90s」收紧为「90s 事件静默」。
  - **观察项（不立项，留档）**：0.86.0 起会话文件出现 `type:"usage"`（kind cache_warm 等）条目——usage 扫描器（ADR-0002）按既有容错规则 default 静默忽略，确定性无双重计；代价 = cache_warm 的 token/cost 在 PiCode usage 页不计入（TUI /session 计入）。ADR-0002 投影面（message + compaction + branch_summary）不变；是否让 cache-warm 浮现 = 未来票裁量。
- 2026-09-21 (code-review 双轴采纳)：spec 轴 1 项实质发现 + standards 轴 2 项判断性意见，全部处置：
  - **spec (a)1（实质，已修）：冒烟种子不是「TUI 真建」的会话文件**——原 Round L 与 vitest 均为手写 JSONL + 不可复核的注释声明，同源盲区（真实 shape 有出入则两套验证同错同过）。**修复 = 提交真实 TUI 会话为共享 fixture**：`tests/shared/fixtures/tui-086-session.jsonl`（271 行，239KB）——本机 TUI 0.86.1 真实所写会话（wt-105，09-21）逐行提取，唯一机械变换 = 长字符串值截断 200 字符（结构/键/类型/id 链 byte-real），尾部附 3 条留档行（t112-bug1 = SDK 源 appendCustomEntry 形状的 pi.bug-report、t112-usg1 = 文档形状 cache_warm、t112-fut1 = 假想未来类型）。**vitest 与 smoke Round L 改为加载同一 fixture**，期望值由独立 raw-JSON census 推导（不依赖被测投影）——spec 轴发现与 standards 重复代码意见一次同修。实证：vitest 5/5 绿；smoke Round L 在真实 fixture 上回放 210 项（users 3 + toolCalls 135 全中、0.86/未知类型零泄漏、真实 subagent runId 投影完好）、树 270/270 节点降级正确、**磁盘 271/271 行 byte-identical 无损**。
  - **standards (b)1（重复代码）**：同上，共享 fixture 收口——两处手写形状不再存在（顺带消除了已发生的漂移：toolResult 文本、delivery 字段两处不一致）。
  - **standards (b)2（命名，采纳）**：`hypothetical_113_entry` → `hypothetical_future_entry`（自释名；票号命名已清除）。
  - **spec (b)1（范围蔓延，保留待批）**：smoke step 超时改活动感知（每事件重臂）影响 A–K 全部轮次，spec 未授权改 harness——**字面偏离留档待操作者签核**（t107 先例）：4 跑中 3 次死于 A 轮队列步 timeout，日志里 text_delta 仍在滚动（模型健康流式超 90s 绝对预算）；kill 语义收紧为「90s 事件静默 = 挂起」，零契约断言变更。若操作者否决：还原一行（onEvent 顶部 bumpTimeout() 调用）即可，但 A 轮将回到骰子式 flake。
  - 复验：vitest 1935/1935、typecheck 双 tsconfig 清、host-contract smoke A–L 全 PASS（run7，exit 0）。electron smoke 在 fixture/脚本变更前的应用代码上已全绿（此后零 app 代码变更，不重跑）。
