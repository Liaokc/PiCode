# 51: fork live 路径修复——真实 entry id 回填 + toast ack 制

**What to build:** 新会话（live 流式、未 resume）里点回复的 Fork 能正常分叉。双修：① **真实 entry id 回填**——host 事件（user_message / message_end）携带真实会话条目 id（additive 契约增量，实施时报备），渲染层采纳真实 id，缺席回退合成 id（健壮性：被中止回合等场景）；② **toast ack 制**——废除无条件乐观成功 toast，成功 toast 只在 fork 确认（fork 后会话公告到达）时弹，失败弹既有 session_command_error 错误 toast（ZCode 有 fork.failed 专门文案先例）。**运行中点 Fork 维持静默无提示**（requireSettledSession 现状，Q5 拍板不动）。

**背景（取证）：** 现状 live 条目 id 为合成 `m{index}` 且 message_end 不回填；forkAnchor = 最后文本 part 的 entryId = 合成 id → SDK `getEntry` 落空抛 "Invalid entry ID for forking"；handleFork 无条件先弹成功 toast → 双 toast 并存。会话库时序实证：20:48:16 fork 失败无新文件、20:49:02 子会话 parentSession 全量克隆至真实 entry（截图 pi14-fork-double-toast）。1.1 票 16 验收走 resume 路径（真实 id）故从未暴露——**live 路径 fork 从未工作过**。

**Blocked by:** 48（host 事件面以 0.85.1 为基准）。

**Status:** ready-for-agent

- [ ] 契约增量（事件 id 字段）additive 报备；旧载荷校验不破
- [ ] 新会话两条回合后点 Fork → 分叉成功（子会话 parentSession 正确、转录到 fork 点）、视图切到分叉会话
- [ ] 恰好一条成功 toast（确认后弹）；失败路径只弹错误 toast——无双 toast（electron smoke 观察者断言）
- [ ] resume 会话与树面板 fork 零回归；运行中点 Fork 静默维持
- [ ] reducer 真实 id 采纳/回退表驱动（Seam-1）
- [ ] electron smoke 全链；typecheck / lint / test 全绿

## Comments

- 2026-09-09 (requirements intake): 建票（spec R3，Q5 按推荐双修）。触 contract/host/chat-reducer/App——与 52 的 contract/host 邻接区**人为串行边**（Q-B 确认），本票先行。波次：W2（48 合入后开）。
- 2026-09-09 (baseline from 48 recon, 0.84.3→0.85.1)：本票实施所踩 SDK 面在 0.85.1 下零漂移——① message_end 事件仍只带 message（无 entry id）；entry_appended 仍携带完整 SessionEntry（含真实 id）→ **host 落盘回读真实 id 路线仍是唯一可行做法，SDK 未新增替代设施**；② runtime.fork(entryId,{position:'at'})→{cancelled} 签名不变（agent-session-runtime.d.ts 逐字节相同）；③ 0.85.0 fork 行为修复：fork 保留 compaction boundary——子会话转写保真度正向；④ SessionEntryBase {type,id,parentId,timestamp} 与 jsonl 格式双向兼容（TUI 0.85.1 实写文件取证）。
