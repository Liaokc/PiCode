# pi-subagents 0.70.1 → 0.71.0 升级差异与 PiCode 适配面调研

调研日期：2026-09-24（工作目录 /Users/liaokechen/PiCode；下载/解包/diff 全部在 /tmp/sub071，仓库与 ~/.pi 只读，未做任何修改、未在任何既有位置跑 npm install）。

对照物：
- 既有安装：`~/.pi/agent/npm/node_modules/pi-subagents` = **0.70.1**（经 `~/.pi/agent/settings.json` packages: `npm:pi-subagents` 由 PiCode host 的 extension pipeline 加载）
- 新版：npm registry `pi-subagents@0.71.0`（`npm pack` 到 /tmp/sub071/package，shasum 140f8fe5ddd82d7dacf8d239559a93381644d652，1207 文件）
- PiCode 适配面：`src/host/subagent-bridge.ts`、`src/host/subagent-runner-root.ts`、`src/shared/subagents/`（directory/types/chat-model/artifact/format）、`src/shared/subagent-sdk-alignment.ts`、`src/main/subagent-sdk-check.ts`、`src/main/smoke.ts` t134、`scripts/smoke/subagents-070-probe.ts`、`src/main/index.ts` ~813 行启动告警。

---

## 1. 版本事实与依赖地板

| 事实 | 0.70.1 | 0.71.0 | 证据 |
|---|---|---|---|
| pi-ai peer | `>=0.80.0` | **`>=0.86.1`** | package.json diff（唯一 peer 变化） |
| pi-coding-agent peer | `*` | `*`（不变） | 同上 |
| pi-agent-core / pi-tui peer | `*`（optional） | `*`（不变） | 同上 |
| 运行依赖 | acorn/jiti/typebox/undici/yaml | 完全相同 | 同上 |
| 硬性要求 SDK 0.87.x？ | 否 | **否** | 源码 grep `0\.87` 无硬编码版本门；仅 changelog 提及"保留 Pi 0.87 context edits"（存在则保留的兼容分支，`src/shared/pruned-fork.js`） |

**关键反转（利好）**：0.70.1 里导致票 134 根因的模块级硬导入——`import { createInitialSystemMessage, toToolDeclaration } from "@earendil-works/pi-ai"`（0.70.1 `src/watchdog/review.js:4`、`src/watchdog/permission-arbiter.js:4`）——在 **0.71.0 中被整体删除**。watchdog Agent 改为 `initialState: { systemPrompt, model, thinkingLevel, tools }`（0.71.0 review.js:286 附近、permission-arbiter.js 同构），该形态由 pi-agent-core 0.86.1 原生支持（PiCode 内嵌 SDK 树 `pi-agent-core/dist/agent.d.ts:4`："systemPrompt and tools become the leading system message unless messages already starts with one"）。即 0.71.0 的实际模块加载地板反而**更宽松**，声明地板抬到 0.86.1 与 PiCode 内嵌 SDK 0.86.1 精确对齐（changelog #2377："Watchdog reviews and permission checks work again on the Pi 0.86.1 package layout"）。

加载期 0.71.0 实际触碰的 host API 在 SDK 0.86.1 中全部存在（逐项验证，解析走 host jiti 别名 `dist/core/extensions/loader.js:61-77` + `virtual-modules.js`，`@earendil-works/*` 全部指向内嵌副本）：
- `piAi.getCurrentTools`：pi-ai 0.86.1 `dist/utils/transcript.js:41`（经 index → compat 再导出）
- `pi.getAllTools/getActiveTools/setActiveTools`：SDK 0.86.1 `dist/core/extensions/types.d.ts:1001-1005`
- `ctx.sessionManager.buildSessionContext`：SDK 0.86.1 `dist/core/session-manager.d.ts:276`
- `Agent`（pi-agent-core）、`streamSimple`（pi-ai/compat:186）、`createReadOnlyTools/convertToLlm`（pi-coding-agent）：0.70.1 已用，0.86.1 均在。

## 2. CHANGELOG 0.71.0 全量条目（逐字摘录，2026-09-23）

### Highlights
- Other extensions can read subagent spend and follow async workflow progress as data, without scraping terminal output.
- Workflow status can now confirm that every child process has actually exited.
- Child sessions keep readable names such as `worker: fix auth refresh` in `/resume` and Herdr.
- The full `subagent` tool loads only when a request needs it, which keeps unrelated prompts smaller.
- Background runners, reviewers, and Bun, pnpm, and symlinked installs are more reliable.

### Added
- In-process RPC `cost` method. It returns the same parent-plus-child spend that `/subagent-cost` shows, as versioned data (`{ version: 1, parent, children, childTotal, total, unresolvedAsyncChildren }`). `ping.capabilities.cost` advertises `{ version: 1 }`. `/subagent-cost` output is unchanged. (#2378)
- Async `workflowScript` runs and the children they launch now emit public lifecycle events, so companion UIs can follow them without scraping terminal output. (#2382)
- Status for an async workflow now includes `details.workflowTerminalProof`. It reports `observed`, with each child's exit evidence, only after the workflow has stopped launching children and every async child has exited or failed to start. Otherwise it reports `pending` or `unknown` with a reason, including when the saved child list is missing. A finished workflow frees its capacity slot using the same check, so the two always agree. (#2436/#2442)

### Changed
- Packaged `worker` agents now start with fresh context instead of forking the parent's conversation. You can still request fork context per call or set it globally. (#2384)
- The full `subagent` tool stays hidden until a request activates it through the small `subagents_enable` loader, which keeps unrelated prompt context smaller. Direct commands, RPC, the TUI, and nested children work as before. (#2380)
- Child sessions keep a readable name (for example `worker: fix auth refresh`) in session lists, `/resume`, and Herdr while the intercom bridge is active. Nested children now reach their supervisor through the child's intercom ID instead of its session name. This needs a pi-intercom version that supports the `intercom:session-identity` claim; with an older pi-intercom, children keep the previous naming so routing still works. (#2432)
- The optional `@earendil-works/pi-ai` peer dependency now requires 0.86.1 or later, matching the oldest supported Pi host. (#2373)
- When a child's `structured_output` call is rejected, the result now includes a short summary of the validation errors. The missing-structured-output error is used only when the child never called the tool. (#2407)

### Fixed（与 PiCode 相关者标注 ★）
- `subagent` is available again after switching from an inactive session branch to one where it was activated.
- ★ Background runners and external CLI agents no longer inherit Git's repository variables (`GIT_DIR`, `GIT_WORK_TREE`, `GIT_INDEX_FILE`, `GIT_CONFIG_*`, and the rest of `git rev-parse --local-env-vars`). (#2437/#2440)
- Retained background runs no longer time out while the packaged runner is still starting. (#2403/#2415)
- When a background runner exits without writing a result, the failure notice now includes its exit code and signal. (#2423)
- A child that produced valid structured output keeps it as evidence when a later provider error or abort fails the run. (#2411)
- Completion notifications are no longer sent twice when the extension is registered more than once for the same session. (#2389)
- The bundled reviewer works in directories without Git: `watchdog_diff` reports that no baseline is available instead of failing the review. (#2422)
- The bundled reviewer's `watchdog_diff` counts as read-only, so a reviewer given a single output path returns its full report for the runtime to save. (#2405)
- ★ Watchdog reviews and permission checks work again on the Pi 0.86.1 package layout. (#2377)
- A workflow child with no `agent` now fails with an error that names it. (#2422)
- `/prompt-workflow` finds prompt files that are symlinks and skips broken links. (#2430)
- Completed retained agents can resume even when their own list of allowed child agents excludes them. (#2379)
- Guidance now says the list of retained workflow children is not complete. (#2406)
- Skills marked `disable-model-invocation: true` are no longer shown to child agents. (#2400)
- Pi hosts compiled with Bun are found from Pi's package directory or its bundled `share/pi-coding-agent` layout. (#2417)
- pnpm installs follow npm-hosted peer aliases through their symlinks. (#2409)
- ★ npm and git installs detect dynamic tool support from the running Pi installation and keep the compact `subagents_enable` loader instead of an always-loaded `subagent` tool. (#2398)
- MCP direct tool names now match what pi-mcp-adapter registers. (#2395)
- Logs from running and failed external CLI agents can be viewed in Fleet, tool status, and the TUI. (#2375)
- Structured delegation updates report cumulative usage and no longer count missing provider cache numbers as zero. (#2374)
- ★ Forked sessions keep Pi 0.87 context edits, including replaced content and signed Anthropic thinking blocks.

## 3. 面级 diff（0.70.1 实装 vs 0.71.0 tarball）

文件清单：1179 → 1207（**+28，0 删除**）。新增模块（全部为 .js/.d.ts/.map 四件套）：
- `src/extension/tool-activation.*` — 动态工具激活（subagents_enable loader + host 版本探针）
- `src/runs/background/process-terminal-candidate.*`、`runner-startup-failure.*`、`subagent-runner-bootstrap.*`、`workflow-terminal-proof.*` — runner 启动失败持久化 / 终止证明
- `src/runs/shared/git-environment.*` — Git 仓库变量剥离
- `src/slash/subagent-cost.*` — /subagent-cost 拆出为模块并新增 RPC cost

根入口 `index.js` / `index.d.ts` **零变化**。docs/ 更新：configuration.md（Tool activation lifecycle、PI_PACKAGE_DIR）、extension-api.md（cost 方法）、observability.md（child-status "started"、workflow async-started 语义）、tool-reference.md、agents.md、workflows.md。

关键源文件细看（与 PiCode 消费面逐项对照）：

### ① RPC 形状 — 除新增 cost 外逐字节不变
- 通道名不变：`subagents:rpc:v1:request` / `:ready` / `:reply:<requestId>`（rpc.js:16-18 两版一致）。
- `SUBAGENT_RPC_METHODS` 追加 `"cost"`（rpc.d.ts:9）；`ping.capabilities.cost = { version: 1 }`（rpc.js:326）；cost handler（rpc.js:611-618）只读，返回 collectSubagentCost 报告。
- **status/spawn/steer/interrupt/stop/resume 七个 handler 的 rpc.js diff 为零**（整个 rpc.js diff 仅 cost 三处）。fleet DTO 构造器逐字节相同：`{ version: 1, entries, totalActive, topLevelAsyncCapacity, omitted }`（两版 rpc.js:78/197 vs 79/198 完全一致；PiCode 的 fleetFromRpcData 按 unknown-field 规则忽略 topLevelAsyncCapacity）。
- steer 应答仍是 `data.details.steering.deliveryStatus`（delivered/queued）；stop 应答仍保证 `state: "stopping"` —— PiCode 桥的票 99/101 解析路径原样成立。
- spawn 应答 details 仍带 runId/asyncId/asyncDir/mode（probe extractSpawnIdentity 断言面不变）。

### ② status.json 字段 — 信封不变，步骤内新增可选 externalProcess
- 写出侧 `src/runs/background/async-status.js` diff 仅一行：`...(step.externalProcess ? { externalProcess: step.externalProcess } : {})`（steps[] 内可选外部 CLI 进程状态：stdout/stderr 路径、finalOutputPath、时长）。
- 信封身份/状态字段（runId、state、startedAt、endedAt、mode、agents、currentTool、activityState、nestedChildren、steps[].sessionFile）两版一致 → PiCode `parseRunStateEnvelope` / `parseTranscriptSourceEnvelope`（artifact.ts）零改动成立。
- runner 侧（subagent-runner.js）新增步骤结果字段 `structuredOutputFailed` 与拒绝摘要（structured-output.js 新增 formatStructuredOutputRejectionError）；启动失败持久化重构进 runner-startup-failure.js（写 status.json state:failed + processTerminal not-started 的既有语义保留）。
- `workflowTerminalProof` 是 /subagent 状态**工具结果** details 的新字段（run-status.js:584-586、749），不进 status.json 信封；PiCode 不消费。

### ③ host 桥订阅的事件 — 名字/payload 键不变，两处纯增量
- 事件名全部不变：`subagent:async-started` / `subagent:async-complete` / `subagent:foreground-complete` / `subagent:child-status`（+ 既有 `subagent:process-terminal`）。
- `SubagentChildStatusEvent.status` 增加 `"started"`（types.d.ts 0.70.1:2301 → 0.71.0:2327）：async workflowScript 根在 keyed child 拿到具体启动身份后发 started（docs/observability.md:209-222 更新）。PiCode 桥 forwardChildStatus 只转发 stopping/stopped → started 被静默过滤（不破坏；可选未来面）。
- `subagent:async-started`：常规启动 payload 键不变；workflowScript 根以 `mode:"workflow"` 发出、task/goal 变为**脱敏标记**（PROMPT_REDACTED）或可省略（types.d.ts:1574-1598 注释更新；docs/observability.md:310-314）。PiCode 桥只读 id/runId/mode/agent/agents/asyncDir——不受影响。
- notify.js：完成通知去重注册表（globalThis Symbol `pi-subagents.completion-send-registry.v1`，TTL 10min、上限 4096）修双发（#2389）——对 PiCode 是净收益（PiCode 每会话注册桥+用户包，曾可能双通知）。

### ④ SDK 依赖地板 — 详见 §1：声明地板 0.86.1（与 PiCode 内嵌 0.86.1 精确相等），无 0.87 硬要求
- transcript-tools 模块级导入已删除（review.js/permission-arbiter.js）→ 0.86.1 host 加载无障碍。
- 新的 host 验证探针 `resolveRunningPiPackageRoot`（pi-spawn.js:40-118）：argv 归属 → `PI_PACKAGE_DIR`（新）→ `PI_SUBAGENTS_PI_CODING_AGENT_PACKAGE_ROOT` → Bun 镜像布局；每个 root 必须有 name 恰为 `@earendil-works/pi-coding-agent` 的 package.json，无效即 fail-closed。
- 动态工具激活门（tool-activation.js）：需要 `pi.getAllTools/getActiveTools/setActiveTools` + `piAi.getCurrentTools`（SDK 0.86.1 全有）+ host 版本探针 ≥ [0,86,1]。**对 PiCode 的两种形态**：
  - dev/unpacked：PiCode 票 111 的 `ensureSubagentRunnerPackageRoot`（host/index.ts:472）已设 `PI_SUBAGENTS_PI_CODING_AGENT_PACKAGE_ROOT` → 探针读到内嵌 SDK 0.86.1 → **动态激活开启**：父会话初始只有 `subagents_enable`（+bg_wait/subagent_supervisor），`subagent` 需模型先调 loader 激活（多一次往返）。
  - app.asar 打包：票 111 刻意不设 override（subagent-runner-root.ts:33）→ 探针 argv 失败（PiCode 包名是 `picode` 不匹配）、env 无 → 回退 eager `subagent` + 一条 console 警告（"[pi-subagents] Could not locate the running Pi installation to verify dynamic tool support; keeping subagent eagerly available."）→ **行为与 0.70.1 相同**。

### ⑤ 新能力盘点
1. RPC `cost` 方法 + `ping.capabilities.cost`（版本化花销报告，含 unresolvedAsyncChildren 下界语义）。
2. 动态工具激活：`subagents_enable` loader；已激活会话 resume/reload/tree 导航后恢复选择（toolsAdded/toolsRemoved 原生记录）；不支持的主机保持 eager。
3. `workflowTerminalProof`：workflow 全子进程退出证明（observed/pending/unknown + 各子 exit 证据）；容量槽释放同判据。
4. 子会话可读名（`worker: <task>`）via `intercom:session-identity` claim（需新版 pi-intercom，旧版回退旧命名，路由不断）。
5. worker.md `defaultContext: fork → fresh`：**打包 worker 代理默认全新上下文**（per-call/全局 fork 仍可请求）。
6. 外部 CLI 代理日志可看（externalProcess + fleet/工具状态/TUI）。
7. Git 仓库变量剥离（后台 runner 与外部 CLI 代理不再继承 GIT_DIR 等）。
8. structured_output 拒绝摘要（structuredOutputFailed + 校验错误前缀）；valid 产出在后续 provider 错误时保留为证据。
9. `PI_PACKAGE_DIR` 环境变量（host 验证次序在 runner override 之前）。
10. 安装健壮性：Bun 编译宿主定位、pnpm peer 别名符号链接、/prompt-workflow 符号链接、MCP 直连工具名对齐 pi-mcp-adapter。

## 4. 结论

### A) 用户级直接升 0.71.0（PiCode 内嵌 SDK 0.86.1）— 无死亡面，三个行为变化
**全部 PiCode 消费面成立，无需任何 PiCode 改动即可共存：**
- 扩展加载：OK（transcript-tools 硬导入已删；所有 0.71.0 触碰的 host API 在 SDK 0.86.1 齐备，§1 逐项验证）。
- 桥的 RPC（status/steer/stop/fleet DTO）、status.json 信封解析、四个生命周期事件订阅：逐字节/diff 为零或纯增量（§3①②③）。
- 启动告警：`subagentSdkAlignmentNotice`（src/shared/subagent-sdk-alignment.ts）只在 sdk<0.86.1 时触发；PiCode 捆 0.86.1 → 不触发；0.71.0 声明地板恰为 0.86.1 → 语义仍准确（src/main/index.ts:813-824 广播路径不变）。
- t134 冒烟（src/main/smoke.ts:517-556）：断言 sdk=pin、≥0.86.1、subagents 已装——0.71.0 全过；阶段③ /run 直达命令与 RPC spawn 均不受激活门影响。
- 0.70-probe（scripts/smoke/subagents-070-probe.ts）：纯形状断言（ping capabilities fleetStatus v1/nonRecoveringSteer/childStatus、spawn identity、status.json state/sessionFile、status RPC {text,details,fleet,asyncSnapshot}、steer deliveryStatus、stop state:stopping、child-targeted stop）——0.71.0 逐项成立（census 只记录键集不比对，多出的 externalProcess 不致败）。

**三个行为变化（非破坏，需知晓/可选适配）：**
1. **dev/unpacked 下动态激活开启**：父模型初始看不到完整 `subagent` 工具，需先调 `subagents_enable`（一次额外往返；PiCode UI 会把 loader 调用显示为工具调用）。asar 打包版保持 eager + 一条 console 警告（§3④）。
2. **worker 默认 fresh 上下文**：默认委派给打包 worker 的子会话不再继承父对话（agents/worker.md:11 `defaultContext: fresh`）。
3. async-started 的 task/goal 脱敏为标记（PiCode 不读这两个键，无影响）；子会话名可读化需新版 pi-intercom，否则回退（无影响）。

### B) 适配清单（改动点 / 文件 / 工作量）
| # | 事项 | 文件 | 量 |
|---|---|---|---|
| 0 | **强制改动：无** — 0.71.0 对 PiCode 每个 seam 都是增量 | — | — |
| 1 | 可选：桥接 cost RPC → `subagent_cost` 事件（turn 边界拉取，禁 timer） | src/host/subagent-bridge.ts + shared/contract + renderer | S（纯桥）~M（带 UI） |
| 2 | 可选：决定动态激活 UX——接受 loader 往返，或由桥在 session_start 时代为 setActiveTools 预激活 | src/host/subagent-bridge.ts | S~M |
| 3 | 可选：转发 child-status "started"（现被过滤器丢弃，增量面） | src/host/subagent-bridge.ts forwardChildStatus | S |
| 4 | 可选：探针升级为 0.70/0.71 双版本断言（补 ping.capabilities.cost、steps[].externalProcess census） | scripts/smoke/subagents-070-probe.ts | S |
| 5 | 文档：worker 默认 fresh、task/goal 脱敏两条用户可见变化 | docs/发布说明 | S |
| 6 | 无需改：subagent-sdk-alignment.ts 地板（0.86.1/0.70.0 两常量对 0.71.0 依然正确）、t134、runner-root override（child-session.js 零 diff，票 111 面不动） | — | — |

### C) 0.71.0 + SDK 0.87.1 组合判定与升级次序
- **兼容判定：可行**。0.71.0 package.json peer 为 pi-ai `>=0.86.1`、pi-coding-agent `*` → 0.87.1 满足；源码无 0.87 硬门，只有"存在 0.87 context edits 则保留"的前向兼容分支（pruned-fork）。反向（0.71.0 + 0.86.1）也已验证可行（§1/§3④）。
- **推荐次序**：
  1. **先用户级升 pi-subagents 0.70.1 → 0.71.0**：对现行 PiCode（SDK 0.86.1）零强制改动、零死亡面（结论 A），且拿到 0.86.1 watchdog 布局修复等净收益。唯一需产品确认的是 dev 形态的 subagents_enable 往返 UX（B-2）。
  2. **PiCode 捆绑 SDK 升 0.87.x 作为独立工单后行**：pi-subagents 0.71.0 两端兼容（地板 0.86.1、前向吃 0.87 edits），不存在次序死锁；PiCode 侧 SDK bump 牵动的是 PiCode 自己的 host seam（不在本次范围）。
  3. 若 PiCode 想一次性定稿 UX：升 pi-subagents 时同步做 B-1/B-2（cost 事件 + 激活策略），SDK bump 单独走。

---

## 附：证据文件索引（均在 /tmp/sub071 与只读实装）
- /tmp/sub071/package（0.71.0 tarball 解包）；/tmp/sub071/files-0701.txt / files-0710.txt（清单 diff：+28/0）
- /tmp/sub071/async-execution.diff（47 行：runner-startup-failure 重构 + git-env + bootstrap 更名）、/tmp/sub071/pi-spawn.diff（98 行：resolveRunningPiPackageRoot 新探针）、/tmp/sub071/runner.diff（270 行：structuredOutputFailed/启动失败/摘要）
- 逐文件 diff 已核对：rpc.js/rpc.d.ts、extension/index.js（+3 行 tool-activation 注册）、fleet-view.js（仅外部 CLI 展示）、async-status.js（+1 行 externalProcess）、async-status.d.ts、intercom-bridge.js（+2 行注释）、notify.js（去重注册表）、review.js/permission-arbiter.js（transcript-tools 导入删除）、run-status.js（workflowTerminalProof）、child-session.js（零 diff）、index.js/index.d.ts（零 diff）、agents/worker.md（defaultContext: fresh）、docs/*（configuration/extension-api/observability 等）
- PiCode 侧只读核对：src/host/subagent-bridge.ts（444 行全读）、src/shared/subagents/{artifact,directory,types,chat-model}.ts、src/shared/subagent-sdk-alignment.ts、src/main/subagent-sdk-check.ts、src/host/subagent-runner-root.ts、src/main/index.ts:813-824、src/main/smoke.ts:497-556、scripts/smoke/subagents-070-probe.ts（425 行全读）、node_modules/@earendil-works/pi-coding-agent@0.86.1（loader.js:61-77 别名、extensions/types.d.ts:1001-1005、session-manager.d.ts:276、pi-agent-core agent.d.ts:4、pi-ai utils/transcript.js:41）
