# 129: thinking 行展开跨重挂载记忆——per-session 视图注册表

**What to build:** thinking 行展开态提升到 **per-session 视图注册表**（`shared/session-registry.ts` 视图状态扩展——`expandedTurns` 同层新增 `expandedThinking: ReadonlySet<entryId>`）：`ThinkingRow` 受控化（open 态由注册表驱动，toggle 落账）；**跨所有重挂载记忆**——设置跳转往返、会话切换往返、折叠往返全保留（Q5=B 裁决）；会话期内存级（重启回默认——与草稿同口径，不持久化）；**Worked 容器 `expandedTurns` 语义零改动**（1.6「容器展开跨切换不记忆」旧裁决维持——本票只动 thinking 行）。

**背景（取证）：** `ThinkingRow.tsx:23` `const [open, setOpen] = useState(false)` 组件本地态——设置跳转卸载工作区 → 重挂载全折叠（操作者实测：「agent 运行时点开了 thinking 容器，点击设置跳转…重新回来之后 thinking 容器又折叠了」）。对照：容器展开集合 `expandedTurns` 活在 registry（跨跳转存活）——`chat-reducer.ts:191` 其「跨切换不记忆」注释是票 56 时代对 Worked 容器的裁决，thinking 行按新裁决走（Q5=B）。

**Blocked by:** 无（独立）.

**Status:** ready-for-human

## Acceptance

- [x] Seam-1：expandedThinking 存取表驱动（toggle/落账/会话切换隔离——A 会话的展开不串 B 会话；entry 粒度键）
- [x] electron smoke：展开 thinking 行 → 跳设置 → 返回仍展开；切会话 A→B→A 仍展开；重启回默认（新会话态验证）
- [x] Worked 容器折叠/展开跨切换的既有行为零回退（票 56/82 语义）
- [x] 性能红线：toggle 落账零额外渲染风暴（registry 派发单次）
- [x] vitest / typecheck 全绿；跑 dev app / smoke 前 `ps` 自查（dev-app serialization）

## Comments

- 2026-09-22 (requirements intake)：P16 定稿为 R13。Q5=B（所有重挂载记忆）——1.6 旧裁决边界在票内明示（仅容器维持旧律）。
- 2026-09-22 (implementer claimed)：开工；work-notes/t129-progress.md 跟踪。
- 2026-09-22 (implementer done, self-review)：分支 t129-thinking-memory，实现提交 `0cc7f5c`（本注释提交随其后）。要点：
  - **实现**：`ChatState.expandedThinking`（expandedTurns 同层）+ `toggle_thinking_expanded` 动作（registry 照 toggle_turn_expanded 路由到聚焦会话）；`history_loaded` 保留该集合（1.6 重置裁决仅容器，注记在案）；`session_created`（含 resume 重宣）经 initialChatState 重置 = 新会话态；`ThinkingRow` 受控化，ChatView 读注册表，FollowView/SubagentChatTab（票 99 第三消费者补齐）用视图本地集合。
  - **键粒度偏离声明**：集合键 = 行的 positional part key（`${turnId}-p${ordinal}`，即 React key），**非** owning entry id——ticket-51 backfill 在 message_end 重写 assistant entry id，字面 entryId 键会在操作者实测场景（agent 运行中展开）的 message_end 瞬间丢展开态；turn-collapse.ts 既有设计注记明证；树路径前缀稳定，同键恒指同 part。
  - **验证**：vitest 117 文件/2001 测试全绿（chat-reducer +4：toggle 语义/positional key 抗 backfill/replay 保留 vs 容器重置/新会话重置；session-registry +7：四行往返表（设置往返/A→B→A/折叠往返/聚焦 B 落账隔离）+ no-op + replay 保留 + 重宣重置 + 新会话默认）；typecheck 绿；electron smoke 新增 thinking_memory stage 六检查点全绿（expand → ⌘, 设置往返仍展开 → A→B→A 仍展开、B 隔离坍缩、容器态跨切换保持 → 新会话 C 默认坍缩）；visual:thinking 全绿（th2 展开帧重验受控布线）。
  - **环境留档（零交集失败，不追）**：全套 smoke 多次死于他票时段——75（run 1）/90（run 3）/93（run 6）均为任务书已知偶发段；44（run 8）为窗口焦点被多 worktree 电子窗抢占；**120（runs 5/7）经 stash A/B 实验证明为 main 既有确定性失败（基线同样 dist:222）**，建议另立修复票。因 120 段阻死套件，thinking_memory stage 曾临时前移取证（run 9 全绿后已移回终位：ticket-108 后、Quit 前）。
  - **Self-review（双轴）**：Standards 轴——纯 reducer 零 I/O；additive 字段无重命名；单一拼法 expandedThinking；定义处票号注释；无 TODO/占位；UI 文案零改动。Spec 轴——验收逐条对照如上；容器语义零回退有显式断言（expandedTurns 不动、replay 重置保持、跨切换容器态维持）。
