# SDK 升级调研：@earendil-works/pi-coding-agent 0.86.1 → 0.87.1 与 PiCode 适配面

- 调研日期：2026-09-23（基于 npm 最新 0.87.1，`npm view` 确认 0.86.1 与 0.87.0 之间无 0.86.x 补丁：版本序列为 0.86.0 / 0.86.1 / 0.87.0 / 0.87.1）
- 方法：`npm pack` 0.87.1（及配套 pi-agent-core / pi-ai / pi-tui / chord 0.87.1）解包至 `/tmp/sdk0871` 等，与仓库 `node_modules/@earendil-works/pi-coding-agent`（0.86.1 实装）做 `diff -rq` + 逐文件 `.d.ts` diff + 针对 PiCode 实际导入面的 tsc 编译探针。**仓库全程只读**。
- 关联背景：PiCode 锁版捆绑 SDK（package.json:72 `"@earendil-works/pi-coding-agent": "0.86.1"`）；全局 TUI pi 也是 0.86.1；ADR-0005 要求 TUI 与 PiCode 会话无缝衔接。

---

## 1. Changelog 摘录（0.86.1 之后全部条目，逐字）

### [0.87.1] - 2026-09-22

> ### New Features
>
> - **Latest frontier models** — Use Claude Opus 5.5, GPT-6 Sol, and GPT-6 Luna through supported providers, including GitHub Copilot. See [Choose a Model](docs/models.md#select-a-model).
> - **Grok 4.7 by default for xAI** — New xAI sessions now default to Grok 4.7. See [Provider Authentication](docs/providers.md#use-an-api-key-from-the-environment).
>
> ### Added
>
> - Added inherited Claude Opus 5.5, GPT-6 Sol, and GPT-6 Luna support for GitHub Copilot.
> - Added inherited GPT-6 Sol and GPT-6 Luna support for OpenAI API keys and OpenAI Codex subscriptions.
> - Added inherited Claude Opus 5.5 support for Anthropic with adaptive thinking and a 1M context window.
>
> ### Changed
>
> - Changed the default xAI model to Grok 4.7.
>
> ### Fixed
>
> - Fixed split-turn compaction summaries being refused by Claude Fable 5.1 by clearly separating the conversation and using continuation-oriented instructions ([#9908](https://github.com/earendil-works/pi/pull/9908) by [@davidbrai](https://github.com/earendil-works/pi)).
> - Fixed missing or invalid `--mode` values being silently ignored instead of reporting an error and exiting with a nonzero status ([#9045](https://github.com/earendil-works/pi/issues/9045)).
> - Fixed inherited image-only user messages being rejected by some OpenAI-compatible providers because they included an empty text part ([#9797](https://github.com/earendil-works/pi/issues/9797)).
> - Fixed inherited Anthropic OAuth requests reporting an outdated Claude Code version.

### [0.87.0] - 2026-09-21

> ### New Features
>
> - **Canonical session context and extension boundaries** — Edit model context without rewriting history and add actionable lifecycle hooks. See [ContextEditEntry](docs/session-format.md#contexteditentry) and [extension events](docs/extensions.md#extension-events).
> - **Full-transcript context extensions** — Use `context_with_system` for per-request system-message transformations. See [`context_with_system`](docs/extensions.md#context_with_system).
> - **Per-model image input limits** — Configure cache-safe image resizing per model for attachments, `read`, and tool-result images. See [Image Input Limits](docs/models.md#image-input-limits).
>
> ### Breaking Changes
>
> - Removed the inherited `shouldStopAfterTurn` agent option. Use `finishTurn` and return `{ action: "end" }` instead. `finishTurn` runs before `turn_end` but applies the decision afterward, and it also receives error and aborted responses; migrate normal-response predicates by returning `undefined` for those hard exits. See the `@earendil-works/pi-agent-core` changelog for a complete before-and-after example.
> - Added `ContextEditEntry` to the exported `SessionEntry` union. TypeScript consumers with exhaustive entry switches must handle `context_edit`; use `replacement: null` for omission and a content replacement otherwise.
> - Made `SessionManager` canonical for `AgentSession` provider context. Assigning `session.agent.state.messages` no longer replaces future request history; restore with `SessionManager.inMemory(cwd, { id }, entries)`, navigate with `session.navigateTree()`, or append through `session.sessionManager` and call `session.refreshContext()`.
> - Expanded `TurnEndEvent` with required boundary fields and added `AgentBeforeSettleEvent` to the exported `ExtensionEvent` union. Consumers constructing events or exhaustively switching on `ExtensionEvent` must handle the new shapes. `ExtensionRunner.emit()` no longer accepts `turn_end`; host integrations dispatch actionable boundaries with `emitBoundary(baseEvent, buildContext)`.
> - Deferred runs requested from `agent_settled` handlers until all settled handlers finish. Handlers still observe `ctx.isIdle() === true`, but no longer see a reentrant `agent_start` during the same notification dispatch.
>
> ### Added
>
> - Added append-only model-context edits. For example, `sessionManager.appendContextEdit(entryId, null)` omits one message from future provider context without changing raw history, usage, or UI history.
> - Added actionable `turn_end` and `agent_before_settle` extension boundaries. Return `{ entries: [...event.entries, draft], continue: true }` to persist structural entries in order and ensure one next provider request without changing steering or follow-up scheduling.
> - Added retain-none compaction input: `sessionManager.appendCompaction(summary, null, tokensBefore)` stores the compaction's own ID as its kept boundary.
> - Added the `context_with_system` extension event, which runs after `context` handlers on the full transcript including system messages and sends its result verbatim. See [`context_with_system`](docs/extensions.md#context_with_system).
> - Added per-model image resize profiles through `inputLimits.images.resize` in `models.json`, applied to file attachments, image reads, and tool-result images ([#9631](https://github.com/earendil-works/pi/issues/9631)).
>
> ### Fixed
>
> - Fixed string context-edit replacements producing invalid assistant and tool-result message content instead of text blocks.
> - Fixed context-invisible boundary metadata and replacement edits causing newly appended or replaced input to be summarized before its first provider request.
> - Fixed edited-context accounting both discarding valid assistant usage captured after the latest context edit and reusing that usage after a later compaction made it stale.
> - Fixed selected error retries and final length/overflow recovery retaining abandoned model attempts in future provider context; post-run recovery omissions are now persisted without hiding raw transcript history or changing queue scheduling.
> - Fixed `context` handlers that filter or slice messages dropping the prompt and tool declarations, which after extension-driven compaction left requests without built-in tools or made Codex emit raw tool-call text. Handlers no longer see system messages; Pi restores the prompt and tool state after they run. See [`context`](docs/extensions.md#context) ([#9789](https://github.com/earendil-works/pi/issues/9789), [#9822](https://github.com/earendil-works/pi/issues/9822)).
> - Fixed `/bug` allowing uploads in offline mode while preserving local zip exports ([#9841](https://github.com/earendil-works/pi/pull/9841) by [@christianklotz](https://github.com/earendil-works/pi)).
> - Fixed idle prompt-cache warming rebuilding expired caches when its timer or an extension decision is delayed.
> - Improved crash diagnostics with hints identifying loaded extensions that appear in the stack trace.
> - Fixed text files beginning with `GIF` being misclassified as images and omitted from `read` and CLI `@file` input ([#9755](https://github.com/earendil-works/pi/issues/9755)).
> - Fixed malformed prompt template frontmatter being silently ignored instead of reported as a resource warning ([#9830](https://github.com/earendil-works/pi/pull/9830) by [@christianklotz](https://github.com/earendil-works/pi)).
> - Fixed inherited unknown OpenAI-compatible Chat Completions endpoints receiving strict tool schemas unless they explicitly advertise support ([#9816](https://github.com/earendil-works/pi/issues/9816)).

依赖全家桶同步升版（package.json dependencies + npm-shrinkwrap.json）：`@earendil-works/{chord,pi-agent-core,pi-ai,pi-tui,pi-client,pi-protocol,pi-server}` 全部 `^0.86.1 → ^0.87.1`；shrinkwrap 锁定嵌套 pi-agent-core/pi-ai/pi-tui/chord 均 0.87.1。

---

## 2. API 面 diff（.d.ts 级）

`diff -rq` 全部有差异的 `.d.ts`（其余全部一致，含 settings-manager、model-runtime、agent-session-services、agent-session-runtime、sdk.d.ts、auth-storage、trust-manager、package-manager 等）：

| 文件 | 变化 | 对 PiCode 的影响 |
|---|---|---|
| `dist/index.d.ts`、`dist/core/index.d.ts`、`dist/core/extensions/index.d.ts` | 纯新增导出类型（AgentActivityOutcome、AgentBeforeSettleEvent(-Result)、BoundaryState/Result/ContextPreview、SessionBoundaryDraft、各 EntryDraft、ContextWithSystemEvent、TurnEndEventResult、ContextEditEntry、SessionProjection、ProjectedSessionEntry、buildSessionProjection 等） | 无（纯加法） |
| `dist/core/session-manager.d.ts` | ① `SessionEntry` 联合新增 `ContextEditEntry`（type:"context_edit"）；② 新增 `SessionProjection`/`ProjectedSessionEntry`/`buildSessionProjection()`/`appendContextEdit()`；③ `appendCompaction` 的 `firstKeptEntryId: string → string \| null`（放宽，向后兼容）；④ `ReadonlySessionManager` 增加 `buildSessionProjection` | ①PiCode 无穷尽 switch（见 §4.①）；③PiCode 不调用 |
| `dist/core/extensions/types.d.ts` | ① `TurnEndEvent` 改为 `extends BoundaryState`（新增必填 entries/continue/context/outcome/messageEntryId/toolResultEntryIds，保留 turnIndex/message/toolResults）；② 新增 AgentBeforeSettleEvent、ContextWithSystemEvent、各 Draft 类型；③ `ExtensionEvent` 联合扩张；④ `ExtensionAPI.on('turn_end')` handler 现在可返回 `TurnEndEventResult`；⑤ ProviderModelConfig 新增可选 `inputLimits` | PiCode 不构造这些事件、不做穷尽 switch；pi-subagents 的 turn_end 只读 message/toolResults（保留） |
| `dist/core/extensions/runner.d.ts` | `ExtensionRunner` 新增 `emitBoundary()`；`emit()` 的 RunnerEmitEvent 排除 turn_end/agent_before_settle（宿主不可再 emit turn_end）；context 变换分两阶段（context → context_with_system） | PiCode 不调用 ExtensionRunner.emit |
| `dist/core/agent-session.d.ts` | 新增私有字段与 `refreshContext()`、`_normalizePromptImages` 等；公开方法 prompt/steer/followUp/abort/navigateTree/setSessionName/bindExtensions 签名不变 | 无 |
| `dist/core/compaction/compaction.d.ts` | 新增 `estimateProjectedContextTokens()` | 无 |
| `dist/core/model-config.d.ts` | models.json schema 新增可选 `inputLimits`（maxRequestBytes/images.resize/maxPerMessage/maxPerRequest） | 无（可选配置） |
| `dist/core/prompt-templates.d.ts` | **`loadPromptTemplates` 返回 `PromptTemplate[]` → `LoadPromptTemplatesResult { templates, diagnostics }`（破坏性）** | PiCode 不直接调用（rg 无命中；PiCode 走 `services.resourceLoader`） |
| `dist/core/provider-composer.d.ts` | 新增可选 `inputLimits` 参数 | 无 |
| `dist/core/tools/read.d.ts`、`dist/utils/tool-result-images.d.ts` | 新增可选 `resizeOptions?: ModelImageResizeOptions`；图片 resize 不再写死 2000x2000 | 无（可选参数） |
| `dist/core/cache-warmer.d.ts` | 新增私有 `refreshDeadlineMissed` | 无 |
| `dist/core/crash-log.d.ts` | 新增 `findExtensionStackMatches()`（崩溃诊断提示扩展） | 无 |
| `dist/cli/file-processor.d.ts` | 注释措辞（resize 描述） | 无 |
| `dist/modes/interactive/interactive-mode.d.ts` | 新增 `formatCrashExtensionHint()` 等私有项 | 无（PiCode 自带 renderer；全局 TUI 是另一二进制） |

pi-agent-core 0.86.1 → 0.87.1（`/tmp/agentcore0871` diff）：
- `shouldStopAfterTurn` 选项移除，替换为 `finishTurn`（新 `AgentTurnDecision`/`FinishTurn` 类型）+ 新增 `prepareRequest` 钩子（`AgentRequestUpdate`）。
- **`AgentEvent` 联合类型逐字一致**（`export type AgentEvent = {...}` 40 行窗口 diff 为空）——agent_start/agent_end/message_*/tool_execution_*/turn_*/agent_settled 事件形状未变。

pi-ai 0.86.1 → 0.87.1（`/tmp/piai0861` vs `/tmp/piai0871`）：
- `types.d.ts`：新增 `ModelImageResizeOptions`/`ModelImageInputLimits`/`ModelInputLimits`、Model 可选 `inputLimits`；tool `strict` 默认 true→false（生成的 capable 模型显式开启）；**Usage / Message 类型无变化**。
- image-models.generated：新增 `inclusionai/ming-image-0.1-design` 等模型条目。

### 编译探针（实证）

在 `/tmp/typecheck0871` 用仓库自带 tsc（skipLibCheck:true，对齐仓库 tsconfig.node.json）编译两个探针，SDK 解析到 0.87.1 全量类型图（含配套 0.87.1 依赖包）：

1. **probe.ts**：镜像 PiCode 全部 SDK 导入面 —— src/host/index.ts:18-26 的 7 个类型（AgentSession/AgentSessionEvent/AgentSessionRuntime/CreateAgentSessionFromServicesOptions/SessionEntry/SessionManager/SessionStartEvent）+ gate-extension/mcp-auth-bridge/mcp-status-bridge/subagent-bridge 的 InlineExtension/ToolCallEvent(*/Result)/ExtensionUIContext + 动态 `sdk.*` 值面（SessionManager.create/open、createAgentSessionServices/FromServices/Runtime、getAgentDir/getPackageDir、SettingsManager.create、ProjectTrustStore、DefaultPackageManager、readStoredCredential、createReadOnlyTools、convertToLlm）+ prompt/steer/followUp/abort/buildContextEntries/navigateTree/runtime.fork(position:'at') → **tsc exit 0，零错误**。
2. **probe2.ts**：wireSessionEvents 读到的全部判别联合字段（assistantMessageEvent、toolCallId/toolName/args/partialResult/result/isError、stopReason/errorMessage、willRetry、steering/followUp、thinkingLevel、entry_appended.entry.type、session_start.sessionId、appendMessage）→ **tsc exit 0，零错误**。

### PiCode 的 SDK 导入面清单（rg 归类）

- **host 桥**（src/host/index.ts，唯一加载 SDK 的地方，ADR-0003 Seam-1）：类型 AgentSession/AgentSessionEvent/AgentSessionRuntime/CreateAgentSessionFromServicesOptions/SessionEntry/SessionManager/SessionStartEvent；动态 `sdk.SessionManager.create/open`、`sdk.createAgentSessionServices`、`sdk.createAgentSessionFromServices`、`sdk.createAgentSessionRuntime`、`sdk.getAgentDir`、`sdk.SettingsManager.create`、`sdk.ProjectTrustStore`、`sdk.DefaultPackageManager`、`sdk.readStoredCredential`。
- **host 扩展**（gate-extension.ts、mcp-auth-bridge.ts、mcp-status-bridge.ts、subagent-bridge.ts）：InlineExtension、ToolCallEvent、ToolCallEventResult、ExtensionUIContext。
- **main**（subagent-sdk-check.ts）：只读 package.json 版本号，不加载 SDK。
- **auth-probe**（src/host/auth-probe.ts:495）：createAgentSessionServices + modelRuntime.getProviders/getProvider/getModels/checkAuth + readStoredCredential + resourceLoader（skills/commands catalog）+ DefaultPackageManager。
- **smoke**：interop-smoke.ts 仅 `pi.SessionManager`；subagents-070-probe.ts 用 InlineExtension/getPackageDir/SessionManager.create/createAgentSessionServices/FromServices/bindExtensions(mode:'rpc') + 扩展工厂 `pi.events` 总线。
- **tests**：bundled-sdk-versions.test.ts（版本断言 + createReadOnlyTools/convertToLlm 探测 + pi-ai transcript 工具探测）。

---

## 3. 重点风险面逐项判定

### ① 会话 jsonl 格式（ADR-0005 根基）——**兼容，纯加法扩展**

- `CURRENT_SESSION_VERSION = 3` 两版一致（两边 session-manager.js:11；docs/session-format.md:30 "Existing sessions are automatically migrated to the current version (v3)"）。
- 新增条目类型 `context_edit`（session-manager.d.ts:116-126）：`{"type":"context_edit","id":...,"parentId":...,"targetId":...,"replacement":null|{content}}`，append-only、分支相对。
- **何时写入**：无扩展的正常会话不会写。仅错误重试/溢出恢复路径自动写（0.87.1 agent-session.js:2704 auto-retry、:2102 overflow recovery → `_omitRecoveryAttempt` → `appendContextEdit(targetId, null)`——"Fixed selected error retries and final length/overflow recovery retaining abandoned model attempts"），或扩展主动调用 appendContextEdit/boundary drafts。
- PiCode 侧解析全部松类型、有安全兜底：shared/usage/parse.ts:97 switch 按 case 匹配、未知 type 落 default 忽略；shared/sessions/parse.ts nodeKind() 未知返回 'other'；trace.ts 同理；lastAssistantUsage（context-ring.ts:164）`type !== 'message'` 直接 continue。`as unknown as SessionEntry[]` 双重转换（host/index.ts:200）规避联合穷尽检查。**无破坏**。
- 树/分支语义：0.87.1 `buildContextEntries` 实现逐字节一致；`getTree()` 只按 id/parentId 建树，类型无关。

### ② agent 生命周期 API（host 桥核心面）——**签名与事件形状全部未变**

- `prompt(text, options?)`、`steer(text, images?, options?)`、`followUp(text, images?, options?)`、`abort()`、`navigateTree(targetId, options?)`、`clearQueue()`、`setSessionName()`、`bindExtensions()`：两版 d.ts 逐一比对一致。
- `AgentSessionEvent` 联合（agent_end.willRetry、queue_update.steering/followUp、message_end.message.stopReason/errorMessage、entry_appended.entry、session_start 等）25 行窗口 diff 为空；底层 pi-agent-core `AgentEvent` 联合 diff 为空。
- `runtime.fork(entryId, { position: 'at' })`：agent-session-runtime.d.ts **完全一致**（JS 内部唯一差异：fork 后 `state.messages = buildSessionContext().messages` 改为 `session.refreshContext()`——changelog "SessionManager canonical" 重构，对外行为等价）。
- 破坏项 `shouldStopAfterTurn` 移除：`rg shouldStopAfterTurn src/ scripts/ tests/` 零命中——PiCode 不用。
- `session.agent.state.messages` 赋值失效：PiCode 无此用法（rg 零命中）。

### ③ auth / models 面——**未变 + 模型目录加法**

- `getAvailableSnapshot()`（model-runtime.d.ts:68 两版同签名同位置）；SettingsManager/ProjectTrustStore/DefaultPackageManager/readStoredCredential/getAgentDir/getPackageDir 导出与签名一致（settings-manager.d.ts、trust-manager.d.ts、package-manager.d.ts 均不在差异清单）。
- model-resolver.js 唯一差异：xAI 默认模型 `grok-4.6 → grok-4.7`；新模型（Claude Opus 5.5、GPT-6 Sol/Luna）为目录数据加法。PiCode 动态枚举模型列表，无需改动。
- pi-ai `Usage` 类型无变化 → usage 派生口径（见⑤）不受影响。

### ④ extension pipeline / packages 加载（pi-subagents 经由它）——**管线加法，加载路径未变**

- discoverAndLoadExtensions/ExtensionRunner 加载流程未变；新增 emitBoundary/context_with_system 为可选能力。
- `context` 处理器行为变更（不再见到 system messages；Pi 在其后恢复 prompt 与工具声明）是**保护性修复**（#9789/#9822）。
- 本机实测 pi-subagents 0.70.1（~/.pi/agent/npm）：注册了 `context` handler（src/runs/shared/subagent-prompt-runtime.js:509，只过滤 parentOnlySubagent 自定义消息，不碰 system）与 `turn_end` handler（register-main.js:395、turn-delta.js:91 只读 event.message/event.toolResults——新 TurnEndEvent 保留这两字段）→ 兼容。
- `pi.events` 总线、`PI_SUBAGENTS_PI_CODING_AGENT_PACKAGE_ROOT` 覆盖（host/subagent-runner-root.ts 用 sdk.getPackageDir() 驱动）不变。
- `agent_settled` 延迟语义变化：pi-subagents 注册的是 agent_end 而非 agent_settled，不受影响。

### ⑤ usage 派生口径——**不受影响**

- PiCode 两条路径：live（host/index.ts:292 heldMessageEnd + assistantUsageOfMessage，读 message.usage/stopReason）；replay（lastAssistantUsage 反向扫 buildContextEntries 输出，context-ring.ts:164-176）。
- pi-ai Usage 类型两版无 diff；message 条目的 usage 字段写入口径不变。0.87.1 的"edited-context usage accounting"修复是 SDK 内部修复（修复的是 context_edit 引入后的记账 bug，对无 context_edit 的会话无行为差异）。

### ⑥ thinkingLevel / 工具面——**未变**

- ThinkingLevelChangeEntry、thinking_level_changed 事件、setThinkingLevel 均不在差异清单。
- 工具面只有可选新增：read 工具与 tool-result-images 的 `resizeOptions?`、models.json 可选 `inputLimits`、ToolCallEvent/ToolResultEvent 未变。

---

## 4. 结论

### A) 直接改 package.json 0.86.1 → 0.87.1 重装，会崩/坏的面

**只有一处硬失败，且是测试断言而非运行面：**

1. `tests/main/bundled-sdk-versions.test.ts:29-30`：`it('package.json pins the SDK exactly at 0.86.1')` 内 `expect(pinned).toBe('0.86.1')` → 升级后 `npm test` 红。（测试头部注释第 3 行同样写死 0.86.1。）

**不会崩**（实证）：
- 编译面：两探针对 0.87.1 全量类型图 tsc exit 0（§2），覆盖 PiCode 全部 SDK 导入与事件字段读取。
- 运行面：host 桥生命周期 API、AgentSessionRuntime.fork、SessionManager、settings/auth/packages 面签名全部一致；会话格式 v3 不变（§3.①）。
- 打包面：scripts/package.mjs 的 pinned 从 package.json 动态读取（:75），pi-ai 只查 `>= 0.86.1` 地板（:106），0.87.1 通过；`SUBAGENTS_SDK_FLOOR = '0.86.1'` 是地板比较（src/shared/subagent-sdk-alignment.ts:17），0.87.1 满足。
- pi-subagents 0.70.1 在 0.87.1 下的 context/turn_end 用法经源码核对兼容（§3.④）。

### B) 适配清单

| # | 改动点 | 涉及文件 | 工作量 |
|---|---|---|---|
| 1 | SDK 锁版 0.86.1 → 0.87.1 并重装（shrinkwrap 会带齐 0.87.1 全家桶） | package.json:72 | S |
| 2 | 版本断言字面量 '0.86.1' → '0.87.1'（含头部注释） | tests/main/bundled-sdk-versions.test.ts:3,29-30 | S |
| 3 | 注释中"pinned 0.86.1"措辞更新（代码动态读取，无功能影响） | scripts/package.mjs:69,91 | S |
| 4 | 全量验证：npm test → npm run smoke（dev-app 串行规则）→ npm run package:verify | — | M |
| 5 | （可选，不阻塞）跟进新能力：context_edit/boundary 事件、buildSessionProjection、context_with_system、per-model image resize、pi-subagents 对 finishTurn 的后续适配 | src/host、扩展 | M–L，建议另开票 |
| 6 | （可选）SUBAGENTS_SDK_FLOOR 是否上调由 ticket 134 语义决定——0.86.1 地板继续有效 | src/shared/subagent-sdk-alignment.ts:17 | S |

### C) 会话格式是否变化 → 全局 TUI 0.86.1 打开 0.87.1 写的会话

**结论：结构兼容、不崩；存在一处良性语义分歧。**

- 会话版本号仍是 3（两边 session-manager.js:11）；`migrateSessionEntries` 路径一致；0.87.1 读 0.86.1 会话完全无碍（buildContextEntries 实现逐字节一致）。
- 新条目 `context_edit` 仅在错误重试/溢出恢复（或扩展主动调用）时写入。0.86.1 TUI 打开含 `context_edit` 的会话：parseSessionEntries 逐行 JSON.parse 无类型校验；`sessionEntryToContextMessages` 对未知类型返回 `[]`（渲染与上下文构建双双跳过）；`getTree()` 类型无关 → **不崩、正常打开**。changelog 证据：0.87.0 Breaking Changes 仅要求"TypeScript consumers with exhaustive entry switches"处理 context_edit（0.86.1 是 JS 且非穷尽）。
- 语义分歧：0.86.1 忽略 context_edit 的省略意图 → 若用旧 TUI **续写**一个带 context_edit（被省略的失败尝试）的会话，那些被 0.87.1 判定"废弃"的模型尝试会重新进入上下文。属上下文质量分歧，非损坏；继续用写它的版本打开则无此问题。
- `appendCompaction(summary, null, …)`（retain-none）写入的 compaction：0.86.1 buildContextEntries 对 null firstKeptEntryId 的行为等价于"只保留 compaction 之后"（`entry.id === null` 永不匹配 → foundFirstKept 恒 false）→ 语义正确，不破坏。该能力默认无人调用，仅扩展可用。

---

## 5. 证据索引（关键 file:line）

- 仓库锁版：package.json:72；实装 0.86.1（node_modules/@earendil-works/pi-coding-agent/package.json）。
- 版本序列无 0.86.x 补丁：`npm view @earendil-works/pi-coding-agent versions` → 0.86.0/0.86.1/0.87.0/0.87.1。
- changelog 原文：/tmp/sdk0871/package/CHANGELOG.md:3-64（0.87.1 + 0.87.0）。
- CURRENT_SESSION_VERSION=3：两版 dist/core/session-manager.js:11。
- ContextEditEntry 定义：0.87.1 dist/core/session-manager.d.ts:116-126；文档 docs/session-format.md:137-145。
- context_edit 自动写入：0.87.1 dist/core/agent-session.js:677（_omitRecoveryAttempt → appendContextEdit）、:2102（overflow）、:2704（auto-retry）。
- 0.86.1 容错：session-manager.js `sessionEntryToContextMessages` 末尾 `return []`；interactive-mode.js:3139-3152 renderSessionEntries。
- 事件联合不变：pi-agent-core 0.87.1 dist/types.d.ts `export type AgentEvent`（40 行 diff 为空）；agent-session.d.ts AgentSessionEvent（25 行 diff 为空）。
- shouldStopAfterTurn→finishTurn：pi-agent-core dist/types.d.ts:188-228 diff。
- fork 内部等价替换：agent-session-runtime.js:169（`state.messages=…` → `session.refreshContext()`）。
- xAI 默认模型：model-resolver.js:25（grok-4.6 → grok-4.7）。
- pi-subagents 0.70.1：context handler src/runs/shared/subagent-prompt-runtime.js:509；turn_end handler src/watchdog/register-main.js:395、turn-delta.js:91（只读 message/toolResults）。
- 编译探针：/tmp/typecheck0871/probe.ts、probe2.ts（tsc exit 0；tsconfig 对齐仓库 skipLibCheck:true）。
- 唯一硬失败：tests/main/bundled-sdk-versions.test.ts:29-30。
