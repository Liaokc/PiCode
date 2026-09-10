# 51: fork live 路径修复——真实 entry id 回填 + toast ack 制

**What to build:** 新会话（live 流式、未 resume）里点回复的 Fork 能正常分叉。双修：① **真实 entry id 回填**——host 事件（user_message / message_end）携带真实会话条目 id（additive 契约增量，实施时报备），渲染层采纳真实 id，缺席回退合成 id（健壮性：被中止回合等场景）；② **toast ack 制**——废除无条件乐观成功 toast，成功 toast 只在 fork 确认（fork 后会话公告到达）时弹，失败弹既有 session_command_error 错误 toast（ZCode 有 fork.failed 专门文案先例）。**运行中点 Fork 维持静默无提示**（requireSettledSession 现状，Q5 拍板不动）。

**背景（取证）：** 现状 live 条目 id 为合成 `m{index}` 且 message_end 不回填；forkAnchor = 最后文本 part 的 entryId = 合成 id → SDK `getEntry` 落空抛 "Invalid entry ID for forking"；handleFork 无条件先弹成功 toast → 双 toast 并存。会话库时序实证：20:48:16 fork 失败无新文件、20:49:02 子会话 parentSession 全量克隆至真实 entry（截图 pi14-fork-double-toast）。1.1 票 16 验收走 resume 路径（真实 id）故从未暴露——**live 路径 fork 从未工作过**。

**Blocked by:** 48（host 事件面以 0.85.1 为基准）。

**Status:** resolved

- [x] 契约增量（事件 id 字段）additive 报备；旧载荷校验不破
- [x] 新会话两条回合后点 Fork → 分叉成功（子会话 parentSession 正确、转录到 fork 点）、视图切到分叉会话
- [x] 恰好一条成功 toast（确认后弹）；失败路径只弹错误 toast——无双 toast（electron smoke 观察者断言）
- [x] resume 会话与树面板 fork 零回归；运行中点 Fork 静默维持
- [x] reducer 真实 id 采纳/回退表驱动（Seam-1）
- [x] electron smoke 全链；typecheck / lint / test 全绿

## Comments

- 2026-09-09 (requirements intake): 建票（spec R3，Q5 按推荐双修）。触 contract/host/chat-reducer/App——与 52 的 contract/host 邻接区**人为串行边**（Q-B 确认），本票先行。波次：W2（48 合入后开）。
- 2026-09-09 (baseline from 48 recon, 0.84.3→0.85.1)：本票实施所踩 SDK 面在 0.85.1 下零漂移——① message_end 事件仍只带 message（无 entry id）；entry_appended 仍携带完整 SessionEntry（含真实 id）→ **host 落盘回读真实 id 路线仍是唯一可行做法，SDK 未新增替代设施**；② runtime.fork(entryId,{position:'at'})→{cancelled} 签名不变（agent-session-runtime.d.ts 逐字节相同）；③ 0.85.0 fork 行为修复：fork 保留 compaction boundary——子会话转写保真度正向；④ SessionEntryBase {type,id,parentId,timestamp} 与 jsonl 格式双向兼容（TUI 0.85.1 实写文件取证）。
- 2026-09-10 (implementation, t51-fork-live-entryids @ `4323526`, rebase 于 main 0f52be6 后零冲突)：完成。**additive 契约增量报备**：`user_message` / `message_end` 各增可选 `entryId?: string`（真实会话条目 id，host 在条目落盘时刻回读填入；缺席 → 渲染层回退合成 id）——旧载荷（无该字段）校验不破，visual harness 注入形状零改动。
  - **host（src/host/index.ts + 新 src/host/live-entry-ids.ts）**：factory 内（初始 create 与 in-host fork 共用同一 factory）对 `sessionManager.appendMessage` 做透明监控——SDK 事件先发、落盘后行的时序（agent-session.js `_handleAgentEvent` 实证：listener 先于 `appendMessage`）由此转化为「落盘时刻回读真实 id」：① assistant `message_end` 契约事件从 SDK 时刻 **hold**，在 appendMessage 落盘时刻以真实 id 释放（`HeldMessageEnd` 状态机，tests/main/live-entry-ids.test.ts 表驱动）；若条目永远未落盘（被中止回合等形态），下一个 SDK 事件先 flush 无 id 版本（渲染层合成 id 兑底，事件顺序不变）；② `user_message` echo 从 prompt 时刻 **延后到落盘时刻**发送（带真实 id）；落盘前失败的 prompt 从 catch 补发无 id echo（消息仍随错误可见）；steer/follow-up 送达改为同一点中继（带真实 id）——原 message_end(user) 中继与 entry_appended 双路径去重机构（recentRelays）随之退役（0.85.1 下 entry_appended 只为 extension custom 条目发，单一中继点无重复）。
  - **chat-reducer（Seam-1 表驱动，tests/shared/chat-reducer.test.ts 新 describe 7 例）**：user_message 有真实 id 则采纳、缺席回退合成 `m{index}`（多回合不碰撞）；message_end 把真实 id 回填到流式 assistant 条目；agent_end settle 不发明 id（被中止回合形态）。fork anchor（groupTurns answer.entryId）随之携带真实 id（turn-collapse.test 断言）。
  - **App（toast ack 制）**：废除无条件乐观成功 toast——`forkAckRef` 记在飞的 fork 目标会话，成功 toast 只在分叉会话公告（session_created，新 id ≠ 目标）到达时弹；`session_command_error`/`session_error`/`host_exit` 清除在飞标记（失败只弹既有错误 toast，无幽灵成功）；运行中点 Fork 渲染层静默返回（Q5「不给提示」——原路径 host 会回 session_command_error 弹错误 toast，与拍板矛盾；requireSettledSession 未动，留作 host 侧兜底）。
  - **turn-collapse 附带修正（范围外发现，按票 30/46 精确）**：part 渲染 key 从「entry id 派生」改为「turn id + 全 turn 序号」（`TurnDraft.nextPartIndex`）——真实 id 回填改写 entry.id 的瞬间，id 派生 key 会强使流式子树 remount（smoke 中实测一次 scroll 锚定偏移 8px）；序号 key 跨回填/answer↔narration 切换恒稳，零行为变化。
  - **electron smoke（fork_live 阶段，real model）**：新会话两回合（composer 驱动）→ 第三回合运行中点 Fork 断言零命令/零 toast/零公告（静默）→ 结算后点 Fork → 恰好一条 'Forked to a new session.' 成功 toast + 零错误 toast；parent 会话 user_message 观察者证零垃圾回合；子文件首行 `parentSession` 指向父文件且尾部 entry id === 父文件锚点 entry id（真实 id 分叉的磁盘实证）；侧栏子行 `sb-task-active` 证视图切换。waiter 先于发送布防（快模型可在后续 sleep 内跑完短回合——首跑在此超时过，已修）。
  - **门禁**：typecheck 全绿；lint 0 error（1 条 EmptyState 既有 warning）；vitest **1082/1082**（79 文件，+13）；`npm run smoke` **六阶段 ALL GREEN（167s）**，rebase（吃入 53 的 answer_split 阶段）后 electron smoke 复跑 2/2 通过（48+49 共存先例的 51+53 共存验证）。对照实验：pure main 上 scroll_stay 2/2 通过、本分支修复后 2/2 通过——yank 与 bg_approval 各出现过一次不可复现失败，判为模型时序 flake（两分支均见，非本票回归）。
  - **code-review（两轴）**：Standards 0 硬违规（5 条 judgement-call 均判可接受：三处 user_message 构造形状相近不抽、泛型监控缝服务测试缝、heldMessageEnd 模块级与既有 host 惯例一致、ack 过度清除取安全向、smoke waiter 先行有留痕）；Spec 6/6 验收达成，2 条范围外添加均已留痕（turn-collapse key 修正 + echo 延后时点——后者是 user_message 带真实 id 的必要条件）。未自行 merge——操作者执行 `bash scripts/merge-ticket.sh 51`。
- 2026-09-09 (merge, T00): 合入 main —— merge sha `5f496f3`（分支重写 `5cf808b`）。验收口径：操作者明示「51 工单已验收」（实施会话门禁：vitest 1082 + smoke 六阶段 ALL GREEN 167s + rebase 后 electron smoke 复跑 2/2 + code-review Standards 0 硬违规 / Spec 6/6）。簿记 sync `b6dcda6`：分支自带 tracker 终态提交（53 同款），checkout 分支版本后 rebase 自动去重（"skipped previously applied commit e738f91"）。冲突处置：rebase/合并零冲突；**turn-collapse.ts 为 51/53 共同热点但非语义对撞**——51 基于含 53 的 main 开发（基点 0f52be6），53 的分割模型原样幸存、51 叠加 anchor/key 增量，无三方对撞。终态审计：新模块 live-entry-ids.ts + tests/main/live-entry-ids.test.ts 入库；contract.ts 增量纯 additive（user_message / message 终结事件可选 entryId，absent 回退合成 id 语义保留）；smoke.ts 四票区段共存（48 焦点重试 8 处 / 49 expand 56 处 / 53 answer_split 4 处 / 51 fork 57 处）；CONTEXT.md 无 rider（本票无词条）；无冲突标记残留；**typecheck 绿 + 1082/1082 tests 绿**（79 文件，净增 13 例）。worktree 已清理。
