# PiCode — 执行 Prompt 汇总 + 工单状态快照

> 给"新鲜会话"用的自包含参考:写本文档时(2026-08-25)本仓库已推进到 MVP 收尾。
> 本文档让新会话不依赖任何旧会话历史即可精确续跑。

## 工单状态快照(已核对仓库代码)

`.scratch/picode-mvp/issues/NN-slug.md` 与实现:

| 工单 | 状态 | 实现 |
|---|---|---|
| 01 host 可行性 | `resolved` | `phase0/` |
| 02 Electron 壳 + 流式 | `resolved` | `src/`(main/preload/renderer/child、shared/contract/ipc/api/chatReduce) |
| 03 审批闸门 | `resolved` | `src/shared/approvalGate.ts`、ChatPanel ApprovalDialog |
| 04 工具卡片 | `resolved` | chatReduce `tool_execution_*` → `tools[]`(args+partialResult+status) |
| 05 会话侧边栏/树 | `resolved` | `src/shared/sessionIndex.ts`、Sidebar.tsx、session lifecycle |
| 06 文件改动 diff 视图 | `resolved` | chatReduce `fileChanges[]`(edit/write → path/kind/diffText)、ChatPanel 文件改动列表、`e2e:file-diffs` |
| 07 设置/信任/状态/错误/退出 | `resolved` | `src/shared/trustInfo.ts`、settings UI |

见 `PROJECT-PLAN.md` Phase 2 进度与 spec.md。**工单 06(MVP 唯一缺口)已实现并标 `resolved`,剩余下一步是 spec↔实现逐条核对收尾(见 PROJECT-PLAN.md 下一步)。**

## 硬约束(所有工单遵守)

**不允许修改/patch 安装的 Pi Agent**——只读消费 `@earendil-works/pi-coding-agent`(全局 `~/.nvm/.../lib/node_modules/@earendil-works/pi-coding-agent/`,v0.84.2)及其 `~/.pi/agent` 配置;只用其**导出公共 API**。会话数据(JSONL)只读。领域词见 `CONTEXT.md`。

词汇(非协商):会话(session,JSONL 树 id/parentId)/ 工具执行(tool execution)/ 信任(trust,加载项目资源口径,≠审批)/ 审批闸门(approval gate,per-execution)/ 单活跃会话。**"tool call card" 是被禁的同义词,用 "tool execution"。**

---

# 06 工单执行 Prompt(可复制进新会话)

```
你正在实现 PiCode 的工单 06(本地 tracker:.scratch/picode-mvp/issues/06-file-change-diff-view.md)。
这是 MVP 唯一剩余工单:让用户能审阅 Pi 改了什么——从一个 agentic 回合里 Pi 改动的文件,渲染成"修改文件列表 + 轻量 diff"。
工作目录:/Users/liaokechen/PiCode。硬约束(重大):**不允许修改/patch 安装的 Pi Agent**(只读消费包与 ~/.pi/agent),
只用导出公共 API;会话文件只读。violation = 返工。领域词见 CONTEXT.md(尤其:"tool execution",别用 "tool call card")。

═══ 现状接缝(先读,别重造) ═══
- src/shared/contract.ts:host 已把原始 AgentSessionEvent 全部转发(内含 tool_execution_start/update/end,args 在 start 事件里)。
- src/shared/chatReduce.ts:已把 tool_execution_* 折叠进 state.tools: ToolExecution[]{toolCallId, toolName, status, args, partialResult}。
  toolName 含 edit/write/grep 等;edit/write 的 args 通常带目标路径与内容——这是 diff 的数据源。最高测试接缝就是 chatReduce。
- src/renderer/ChatPanel.tsx(04):工具卡片已能展开显示 args/partialResult。diff 视图是这个卡片故事的延伸(review what the agent did)。
- 无第三方 diff 库依赖;引入与否由你定,但消费必须只读、不改 Pi 文件。
═══ 设计方向(给结论,留实现空间) ═══
对每回合 Pi 的 edit/write 类工具执行,聚合出"改动文件列表";对每个文件渲染轻量 diff(新增/修改),供用户审阅。
"改动前"侧如何得到需你选：合法做法是——用工具 args 里的新内容 + 若可只读读取该文件在磁盘的改动前快照来算 unified diff；
若只读路径拿不到前快照(例如文件本就不存在=新增),就展示全量新增。不要为了拿"前快照"去写/改任何文件。
scope 限制在"当前回合"(diff 视图不跨回合/不混入其它会话的改动,见验收)。
═══ 验收标准(来自工单) ═══
- [ ] 回合结束后,Pi 改动的文件以可见列表浮现在 UI。
- [ ] 每个改动文件可展开为轻量 diff 视图。
- [ ] diff 视图与当前回合/会话一致,不误标非本会话改动。
- [ ] 全程只读消费 Pi 与其会话;未修改安装的 Pi。
- [ ] 退出无孤儿、不破坏既有 01~05、07 行为(跑 typecheck + 既有 vitest + smoke)。
═══ 测试 ═══
最高接缝(chatReduce / agent-host 契约):fake host fixture 断言"edit/write 工具执行序列 → 改动文件列表 + diff 数据"折叠正确且 scope 正确。
真实 SDK 端到端:让 Pi 在临时(可丢弃)工作目录里改一个文件,核对 diff 与真实改动一致;未改 Pi、无孤儿。
═══ 完成判据 ═══
5 条验收全绿 + typecheck/vitest/smoke 全过 + 未修改安装的 Pi + 改动文件/diff 与真实一致 + 退出无孤儿。按真实结果报告。
```
