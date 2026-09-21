# 130: fork 自动命名——Fork of …（host 落地即命名）

**What to build:** `handleFork` fork 落地后即刻自动命名：**源会话有名** → `Fork of <源名>`；**源无名** → `Fork of <侧栏标题投影>`（首条用户消息——与索引扫描器同源投影，`shared/sessions/parse.ts` 既有投影复用，Q7 裁决）；实现 = fork 前 `manager.getSessionName()` 取源名 → fork 落地后 `setSessionName`（写 **fork 自己的会话文件**——session_info 既有机制，与改名同写入面）；`session_renamed` 事件 + 侧栏索引刷新照旧（链路零新增）；用户可再改名（自动名不锁定、不阻止后续 set_session_label）。

**背景（取证）：** 操作者：「我希望fork 的会话会自动命名会话名字，就是之前的会话前面增加 "Fork of"」。`handleFork`（`host/index.ts:806-820`）现状 fork 后无命名——新 fork 会话无名列于侧栏。announceCurrentSession(true) → sendTree 链路已有（fork 的 History 问题另票 131）。

**Blocked by:** 无（独立）.

**Status:** ready-for-human

## Acceptance

- [x] Seam-1：命名投影表驱动（源有名 / 源无名→标题投影 / 源名超长截断——TITLE_MAX_CHARS 口径）
- [x] electron smoke：fork 后侧栏与设置 = "Fork of …"（有名源与无名源两腿）；再改名成功（自动名可覆盖）
- [x] fork 自身会话文件命名写入（session_info）与 ADR-0002 纪律一致性——只写 fork 新文件，源文件零改动
- [x] vitest / typecheck 全绿；跑 dev app / smoke 前 `ps` 自查（dev-app serialization）

## Comments

- 2026-09-22 (requirements intake)：P24 定稿为 R19。Q7 裁决（无名源跟侧栏标题投影）。与票 131（fork History 复现定位）同 fork 入口但不同症状——两票独立，若 131 的复现涉及 fork 流程改动需与本票协调 rebase。
- 2026-09-23 (implement + self-review, fallback 双轴)：实现 = ①`shared/sessions/parse.ts` 把 summarizeSession 的 title 逻辑抽取为导出纯函数 `sidebarTitleProjection(name, entries)`（既有投影单一代码路径，索引扫描器与 fork 命名两用）；新增 `forkAutoName(sourceName, entries)` = `truncateTitle("Fork of " + sidebarTitleProjection(...))`（TITLE_MAX_CHARS=80 口径）。②`host/index.ts` handleFork：fork 前取源名 `manager.getSessionName() ?? null` + `rawEntries(manager)`；fork 落地后 `runtime.session.setSessionName(autoName)`（写 fork 自己的文件，SDK appendSessionInfo 既有写入面）；随后 announceCurrentSession(true)（携带 name+tree）+ `session_renamed`（渲染层既有索引刷新链路，零新增契约）。③Seam-1 表驱动测试 `tests/shared/sessions-fork-name.test.ts`（有名/无名→首条用户消息/skill 序言剥离/空源 New Task/超长截断 80/多行折叠 + 与索引扫描器同源断言）。
- 2026-09-23 (electron smoke 取证披露)：本票段落在 src/main/smoke.ts ticket-129 段后（seed 两份会话 + 真实 host resume + fork_session，零模型调用；两腿 + 改名覆盖 + 磁盘 session_info 断言 + 源文件字节级零改动）。取证遇 t44 已知环境焦点阻塞（macOS 拒绝 steal）——按 t129 已验证手法临时前移位到 t44 之前跑绿取证（含临时聚焦恢复胶水），跑完复原终位逐字节一致；前移取证 run 两腿全绿（fork_auto_name_{named,unnamed}_{announce,renamed_event,session_info_written,surfaces,rename_overrides,source_untouched}_ok），随后死于 t44 焦点（与 diff 零交集）。seed 含 thinking_level_change 条目（真实会话形态，否则 SDK 会在 resume 时自补一条弄脏源文件快照——Pi 自身 resume 语义非本票 fork 写入）。
- 2026-09-23 (实现中发现的既有崩溃修复，随本票窄修)：取证中发现 host 侧既有竞态——subagent-bridge 单例捕获的 `pi.events` 在 in-host fork 会话替换后波 SDK 标记 stale，渲染层 fleet RPC（如聚焦时的 subagent_status 拉取）撞上替换窗口即 uncaughtException → host 退出（smoke 偶发复现 2/4 次，栈已取证）。修复 = `requestRpc` 对 stale bus 抛错降级为 null（bridge 既有「always answers, degrades, never hangs」契约），顺带消除悬挂 timer/unsubscribe 路径；新增 vitest 用例（stale bus → status available:false / steer ok:false，不崩）。与票 90/99/101 代码相关但为 fork 路径上的崩溃修复，不改变健康路径行为。
- 2026-09-23 (其他 smoke 留档)：①host-contract smoke Round K（ticket-101 live stop）环境性失败（pi-subagents stop RPC 超时）——stash 对照实验证明与本票 diff 无关（stash 掉 subagent-bridge 改动后同样死在同一断言）；Round B（resume/rename/tree nav/**fork**/fork history）全过，fork 链路零回归。②vitest 全量首跑曾 2 例偶发失败，后续 5 连跑 2029 全绿不复现（时序 flake，与 diff 零交集）。③本次全量 electron smoke 死在 t44 焦点为已知批次环境事实②。
- 2026-09-23 (self-review 双轴声明)：本工具集无 subagent 派发，按票内 fallback 自行双轴评审。Standards 轴：投影抽取消除重复（两 caller 单一路径）、纯函数+表驱动、host 最小改动、无 TODO/死代码、契约 additive（零新增事件）、UI 文案全英文。Spec 轴：票面四条验收逐条对照如上，全过。主 Agent 另派独立双轴评审。
- 2026-09-23 (branch)：分支 t130-fork-auto-name，实现提交 tip = 76e0e3b（含本翻票提交之前全部变更；随后由主 Agent 跑 scripts/merge-ticket.sh 130）。
