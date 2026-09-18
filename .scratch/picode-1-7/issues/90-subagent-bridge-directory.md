# 90: 子智能体桥接 + 目录 tab——host 侧数据面与聚合视图

**What to build:** 子智能体供面第一票：①**host 桥接**——host 的 inline extension 订阅 pi-subagents 的 in-process RPC（`subagents:rpc:v1:*`：status/fleet DTO）与 async 生命周期事件（`subagent:async-started/complete`、`subagent:child-status`），转发 renderer（**additive 契约增量：实施时报备入 host-contract smoke**）；②**目录投影纯模型**——父会话文件中 subagent 工具调用记录重放为**主源**（ADR-0002 精神：会话记录唯一事实源、重开会话可重建）+ async 工件（status.json）作 live 增补（tmpdir 工件会清理、不作历史源）；状态徽标 = 运行态到七态词汇（Running/Waiting/Blocked/Completed/Failed/Cancelled/Lost）的映射表（票内定稿留档）；Show 20 more 步进；嵌套子代理只显顶层（折叠计数）；③**侧板目录 tab UI**——Running/Ended 两段 + 空态文案（"No running subagents"）+ 行（状态徽标 + 标题 + 相对时间 + 结果一行预览，ZCode subagentDirectory 构图）。

**背景（取证）：** pi-subagents 0.68.0 docs（extension-api.md:96 in-process RPC / observability.md async 工件 `<tmpdir>/pi-subagents-<scope>/async-subagent-runs/<id>/status.json`）；ZCode bundle `subagentDirectory.*` 全键表（构图与文案校准）；操作者三帧（z17-subagent-card/-dir/-chat）。PiCode host 自带 inline extension（gate-extension 同管道）可订阅 pi.events。范围外：对话 tab（票 99）、停止（票 101）、agent 定义管理、resume、嵌套展开。

**Blocked by:** None (can start immediately).

**Status:** ready-for-human

## Acceptance

- [x] Seam-1 表驱动：目录投影纯模型（会话记录重放 + 工件合并、状态映射表全行、Show 20 more、嵌套折叠计数、重开会话重建）—— `tests/shared/subagents-directory.test.ts`（23 表格用例）+ registry/parse/bridge/panel 各自增补
- [x] **additive 报备**：桥接事件/DTO 进 host-contract smoke（含旧载荷兼容）—— Round H（种子文件零模型调用：replay 投影 + `subagent_status` 回复形状 + 工件驱动 runs + bash 工具卡字段缺席回归）
- [x] electron smoke：种子会话目录渲染（Running/Ended 两段 + 徽标 + 步进）+ live 工件驱动的状态更新 + 重开重建 —— ticket-90 stage（seeded 24 fg + 1 async；Show 20 more → Lost → 工件 running → 工件 complete → 同 id 重开重建 25/25/0）
- [x] 前台子代理在父会话聊天流的既有工具卡零回归 —— tool_end 只 additive 挂 `subagent` 字段（bash 卡字段缺席断言在 Round A + Round H）；转录组件零改动
- [x] vitest / typecheck 全绿；跑 dev app / smoke 前 `ps` 自查（dev-app serialization）；全英文文案（Subagents / Running / Ended / No running subagents / Show 20 more）

## 实施报备（additive 契约增量）

新增契约成员（全部 additive，旧行为逐字节保留）：

**SessionCommand**：`subagent_status { requestId }`。
**SessionScopedEvent**：
- `subagent_status { requestId; available; runs: SubagentRunState[]; fleet: SubagentFleetDTO | null }`
- `subagent_async_started { runId; mode?; agent?; agents?; asyncDir? }`
- `subagent_async_completed { runId; state?; success?; summary?; durationMs? }`
- `subagent_foreground_completed { runId; mode?; agent?; success?; state?; summary?; taskIndex? }`
- `subagent_child_status { runId; childId; status: 'stopping'|'stopped'; ts; agent?; stepIndex?; label? }`
- `tool_end.subagent?: SubagentCallInfo`（live 路径；edit 的 `diff` 同款 additive 纪律——非 subagent 工具字段缺席）
- TranscriptItem tool item `subagent?: SubagentCallInfo`（replay 路径，从 toolResult 落盘的 details 投影）

**七态映射表（票内定稿留档）**——`shared/subagents/directory.ts`：

| 源状态 | 徽标 | 依据 |
|---|---|---|
| 工具卡未落定（call open） | Running | 转录即证明在跑 |
| 工件 `running` / 前台 child `completed`(exit 0) 前态 | Running | status.json 工件 / fleet |
| 工件 `queued` | Waiting | 容量排队 |
| 工件 `paused` / child `paused`（interrupt） | Blocked | pi 自身 paused=needs attention |
| 工件 `complete` / child 全 `completed` | Completed | |
| 工件 `failed`·`partial`·`rejected` / child `failed` / isError 结果 | Failed | partial=部分失败；rejected=未起跑 |
| 工件 `stopped` / child `stopped` | Cancelled | |
| child `detached` | Running | **票内裁决偏离 pi 的 completed>detached 优先序**：分离的孩子仍在干活，行不得谎称 Completed |
| async 启动已记录 + 工件已清理 + 无完成事件 | **Lost** | 工件是 live-only（tmpdir 会清理、不作历史源）——结局不可知即如实 Lost，绝不臆造 |

子状态优先级（承 pi `resolveGroupedStatus`）：failed > stopped > paused > **detached > completed**（最后一对为票内诚实裁决）。
前台 SingleResult（无 status 字段）按 pi 同款推导：detached → stopped → interrupted(paused) → exitCode 0/否则。

## 数据面架构（取证记录）

- **主源**：会话文件 toolResult 的 `details`（pi-subagents 落盘结构化 identity：`{mode, runId, asyncId, asyncDir, results[]}`）——live 与 replay 同构（`subagentInfoOfDetails` 一处投影两端复用，host 桥与 renderer 零漂移）。
- **live 增补**：host 桥按会话记录自报的 asyncDir 直读 `<asyncDir>/status.json`（主机侧 `readRunStateFromArtifact`）——**不走 RPC asyncSnapshot**：pi-subagents 的内存投影完成 10s 后清理、重开只恢复 queued/running，工具结果 receipt 长期不可靠；工件直读才是持久 live 源（工件缺失 = 无 live 证据 = Lost，绝不臆造）。
- **fleet DTO**：RPC status 回复的 `data.fleet`（bounded、opaque keys）随 `subagent_status` 事件转发；`available:false` = 桥不可用（pi-subagents 缺席/host 消亡），渲染端保既有 live 态不清空（"无信息"≠"无运行"）。
- **生命周期事件**：`subagent:async-started/complete`、`subagent:foreground-complete`（分离前台子代理的唯一 live 终局证据）、`subagent:child-status`（观察提示，目录 v1 不消费、不触发拉取，票 99/101 用）全部转发；事件只作 delta，AVAILABLE 快照到达时**对账合并**——快照看见的运行整体替换（新鲜工件证据优先），快照看不见的运行保留其最后已知的**终态**（工件会清理，"无工件 + 有完成记录" 仍是 Completed；code-review P1 修复，registry 表驱动测试钉死 delta→快照次序），live 态消失则丢弃（回放投影如实回 Lost）。
- **live 刷新**：**零轮询**（伞形 spec 性能红线"R5 目录 live 刷新零轮询（事件驱动）"）——session_created 启动拉取一次 + 生命周期事件驱动拉取 + tab 打开时一次用户动作拉取；无任何 interval。

## 视觉 QA

`npm run visual:subagents`（PICODE_VISUAL_SUBAGENTS=1，独占窗口；契约注入式 fixture，零 store/侧栏污染）：s9-1-directory（Running·2 + Ended·22 全词汇徽标 + Show 20 more）、s9-3-expanded（全展开）、s9-2-settled（完成事件后 Completed 徽标 + summary 预览）、s9-4-empty（"No running subagents"）。四帧已存 `.scratch/visual/`，副本入 `.scratch/compare/s9-*.png`。
