# 36: 调用轨迹 tab 骨架——契约 + 载荷构建 + 默认全展开列表

**What to build:** 右键菜单 **View call trace** → 右侧面板打开 **Trace tab**（tab 身份 = 会话文件，复用票 31 框架）。host 从会话 jsonl 条目流**纯函数**构建 per-call 载荷：**entry = 一次模型调用**——输入节（自上一 assistant 消息以来的 user / 工具结果块）+ 输出节（思考 / 助手文本 / 工具调用块，带工具名 chip 与调用 id），块类型六种；usage 列（IN/OUT tokens、时长、时间戳）按 ADR-0002 从每条 assistant 消息 usage 推导——**契约纯增量**（trace 请求 / 数据消息；usage 缺席优雅降级为只显时间戳）。列表**默认全展开**、长块就地截断 + 展开钮；头部 = 标题 + 统计行（调用数 · 总 token · 模型可推导时）+ 刷新 / 关闭 / 打开所在目录（会话 jsonl）。数据源如实原则：轨迹显什么 = Pi 会话文件实际记录了什么（无 ZCode 式标题生成调用；SDK 内部 system prompt 不落盘，「系统提示词」块通常缺席）。

**背景（取证）：** ZCode 轨迹实拍五帧（`z-trace-{header,search,block-toggles,expanded,collapsed}.png`：entry 头 `[序号][类型 chip][状态] IN·OUT·时长·时间戳`、输入/输出两节、工具结果入下一 entry 输入节）。TranscriptItem 有 timestamp 与完整工具输出，缺 usage 列（契约补）。grilling Q10 定稿（①入口 ②活跟随随票 37 ③内容形态 ④契约增量）。

**Blocked by:** 30（性能 memo 基建）、31（tab 身份框架）、35（菜单入口槽位）。

**Status:** ready-for-human

- [x] 右键 View call trace 打开 Trace tab（任何会话，含 TUI 会话——只读读文件）
- [x] host 纯函数载荷构建（六类块、usage 列、缺席降级）+ 契约纯增量往返
- [x] 列表默认全展开 + 长块截断/展开钮；头部统计行 + 刷新/关闭/打开所在目录
- [x] 载荷构建器表驱动（fixture jsonl：usage 齐全 / 缺席 / 非常规条目）；host-contract smoke 往返；electron smoke 打开→条目断言
- [x] 性能预算：大文件实测数字记录在票内；超预算时块内容窗口化/懒展开（预算内，未启用）
- [x] typecheck / lint / test 全绿

## Comments

- 2026-09-02 (requirements intake): 建票。原判「调用轨迹无语义」已被操作者实拍纠正（Q7），全票为全新需求。36/37 拆分 = 单上下文窗口体量限制（骨架 / 工具面）。波次：W4。
- 2026-09-02 (implementation, t36-call-trace-tab): 全部交付。架构：`shared/sessions/trace.ts` 纯函数构建器（复用 parseSessionLines 容错；entry=一条 assistant 消息；输入节累积自上一 assistant 的 user/bashExecution(按 SDK convertToLlm 投影为 user 块)/toolResult 块，输出节 thinking/assistant/toolCall；duration=entry.timestamp−message.timestamp（Pi 自己落盘的请求起止）；usage 按 ADR-0002 自 assistant 消息 usage 推导、缺席→null 只显时间戳；compaction/branch_summary 视为上下文边界清空累积输入；system-prompt 块型在契约中但 Pi 不落盘故从不发射）。契约纯增量：新 `sessions:trace` invoke（同 sessions:follow 文件级家族，任何会话含 TUI 只读；chat contract 零改动）+ `modelId` 加进 RawSessionEntry（可选字段）。UI：TraceTab 默认全展开 + 长块 400 字截断/Show more（memo 行，块内局部 state）；头部=标题+统计行（调用数·总 tok·模型，缺席段隐藏）+ 打开所在目录（复用 reveal context-action）/刷新/关闭；entry 头=序号+模型 chip+stopReason 状态 chip（Completed/Tool use/Length limit/Aborted/Error）+IN·OUT·时长·时间。37 范围未越界（无搜索/块开关/展开收起切换/活跟随）。
- 2026-09-02 (performance budget, ticket gate): `scripts/perf/trace-budget.mjs`（可复现驱动，CDP 驱真实 UI）实测：75 calls/0.19MB → 构建+IPC 2–4ms、开到首染 60ms、零 long task、DOM 3.7k 元素；250 calls/1.45MB → 8–15ms / 110ms / 1×68ms / 12.7k；500 calls/2.8MB → 15–26ms / 80ms / 1×54ms / 25.5k；1000 calls/5.6MB → 26–54ms / 385ms / 1×81ms / 51k。真实最大会话（253 calls/5.6MB）构建 10.3ms。结论：预算内，**未启用窗口化/懒展开**（ZCode 常规 75-call 规模 60ms 全展开直渲染；1000 calls 仍 <0.4s、单 long task <100ms；行 memo 化后 Show more 只重渲染单块）。实现中发现并修复：滚动 flex 容器内条目默认 flex-shrink 压扁（flex-shrink:0 修复）。
- 2026-09-02 (verification): typecheck/lint/test 全绿（855 tests，含 `tests/shared/sessions-trace.test.ts` 15 例表驱动：usage 齐全/缺席/非常规条目/compaction 边界/bashExecution 投影/半写尾容错）。host-contract smoke 新增 verifySessionTraceContract（真实 SDK 文件 → 10 calls/36,925 tok/标题断言）。electron smoke 新增 ticket-36 阶段：右键 View call trace → 8 entries 全展开 + usage 列 + tool-call 块 → 刷新 → 关闭。`npm run smoke` 六阶段 ALL GREEN。实拍 `.scratch/compare/t36-trace-open.png` 对照 z-trace-expanded.png。操作者可 `bash scripts/merge-ticket.sh 36` 合入。
- 2026-09-02 (code-review): 两轴自审后一轮修正（d523682）：Standards 轴去重 —— trace.ts 改用 parse.ts 导出的 messageText/toolCalls 与 usage/parse.ts 导出的 normalizeTokens（ADR-0002 单一口径），firstUserText 移出 PendingInput（文件级变量，免受累积器重置语义误导），TraceTab 改用共享 TraceStats 类型；Spec 轴逐条对票勾验，唯一裁量点：usage 缺席降级为「只显时间戳」实现为 usage 数字退场、文件自记的时长仍可显则显（如实推导读法，测试已固化该行为）。
