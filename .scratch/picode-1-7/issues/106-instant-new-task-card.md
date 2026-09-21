# 106: 新会话卡片秒出——乐观占位 + 对账

**What to build:** New Task 在新文件夹创建会话时，侧栏**分组与会话卡片立即出现**（ZCode 秒出 parity）：create 派发时 renderer 以已知 cwd **乐观注入占位会话**（registry 合并——现有分组/排序语义生效），`session_created` 到达后用真实 summary 对账替换；boot 失败 = 移除占位 + toast 如实（不留幽灵条目）。占位卡不显未知量（token/时间等不伪装），不冒充已确认会话。索引轮询机制不动。

**背景（取证）：** 现链 = host 冷启动（spawn + SDK + pi-subagents/pi-mcp-adapter 扩展加载）→ `session_created` → 文件落盘 → 索引 2 秒轮询（`index-service.ts:194` setInterval tick，cacheSignature 变化才广播）→ onIndexChanged → 刷新——层层叠加导致卡片迟现。ZCode 秒出 = 自有存储即时写。乐观卡是 renderer 侧的即时路径，与索引 eventual 一致（announce 后对账）。

**Blocked by:** 95（一键折叠分组——同 Sidebar/分组渲染区段串行）.

**Status:** ready-for-human

## Acceptance

- [x] electron smoke：新文件夹 New Task → 分组与卡片**立即**出现（占位态）→ session_created 后对账为真实卡片（id/名称就位）
- [x] boot 失败路径：占位移除 + 错误 toast（无幽灵条目）
- [x] 既有文件夹建会话同样秒出；排序/分组/拖拽（票 84）与占位卡共存不冲突
- [x] 占位卡不显示未知量（无假 token/时间）；真实卡片替换后数据完整
- [x] vitest / typecheck 全绿；跑 dev app / smoke 前 `ps` 自查（dev-app serialization）

## Comments

- 2026-09-21 (implementation done): rebase main（114 icon-alpha 已并入，95 基座在位，无冲突）后全量验证，branch tip 全绿。
  - **Seam-1 纯模型**（`src/shared/sessions/pending-create.ts` 新模块 + `tests/shared/sessions-pending-create.test.ts`，22 例表驱动）：`PendingCreate`（合成 id `pending-create-N` / cwd / 首条消息投影标题 / 派发时钟 / `announcedSessionId`）× `makePendingCreate`（标题走索引扫描器同源投影 `truncateTitle`，空白输入落回 `New Task`——对账零文字跳变）× `mergePendingCreates`（索引 + 占位行并入既有分组/排序管线；已确认 id 在索引即弃，真卡替换）× `announcePending`（最旧未宣布 cwd 匹配盖真实 id；`resumed: true` 宣告永不消费占位——boot 期间同 cwd 点 resume 不吃卡；fork 同 cwd 仍可消费，罕见双启动窗口后果良性：占位早弃、真卡照常经索引到账）× `reconcilePending`（索引 = 唯一确认源）× `dropFailedPending`（失败消费：provisional id 形状 → 最旧启动中占位；真实 id → 精确匹配者；无关崩溃/无主真实 id 零动作）× `stripPendingGroups`（合成 id 永不进手动排序——票 84 共存）。纯度：无 I/O/时间/随机（时钟由 App 传入）、不变则同引用。
  - **契约上收**（`src/shared/contract.ts` 纯新增）：`PROVISIONAL_SESSION_ID_PREFIX` + `isProvisionalSessionId`——supervisor 的 spawn 期绑定 id 形状成为契约事实，`host-supervisor.ts` 同源引用消字面量双源；boot 失败（provisional 域内）与无关崩溃（真实 id）的判别依据。
  - **App 装配**（`App.tsx`）：`sendCreateSession` = 唯一 create 派发入口（票 11/41 defaults + 票 106 占位成对发出——未来派发点漏挂即卡在结构上不可能）；三处派发（startTask / handleRebuild / handlePickAnotherFolder）全覆盖；`session_created` 记账（显示零变化——卡保持已知标题 + starting… 槽直到索引到盘）；`refreshSessions` 内同列表对账（一次刷新双状态）；失败路径消费占位 + `bootFailureCopy` 逐字 toast（session_error 原文 / host_exit code+signal）。**已知边界（如实入账）**：provisional 失败按形状关联（renderer 永远不知道自己 create 的 provisional id）——同刻失败的 resume 启动可过早消费占位；toast 仍如实（确有会话启动失败）且真卡照常经索引到账，无幽灵。⌘K/Follow 不列占位（尚不可寻址）；`handleOpenSession` 对占位直接短路。
  - **Sidebar**（`Sidebar.tsx`）：`pendingIds` prop + TaskItem `pending` 行——时间槽只读 `starting…`（不伪装 recency）、状态点强制空槽（派发时钟会误读成绿「另一端写入」点——活性声明不做）、无 archive 钮、pin/双击改名/右键菜单/拖拽全惰性、`data-pending` 标记；`manualBase` 快照与 `commitDrop` rendered 列表先剥离占位（手动序永不存合成 id）。分组折叠/Show more 计数自然含占位（瞬态）。
  - **electron smoke**（`smoke.ts` 新 ticket-106 stage，退出前）：新文件夹腿 = ⌘N → chip「Open folder…」（`PICODE_SMOKE_CWD` 钉新目录）→ 发送 → **占位卡 306ms 即现**（`session_created` 1277ms 才到——秒出实证）+ data-pending 标记 + starting… 槽 + 点槽为空 + 对账后 0 占位行/真卡标题含标记/真实 recency；既有文件夹腿 = 组行 New Task 悬停动作 → 308ms 即现 → 对账 total=2；失败腿 = `PICODE_SMOKE_CWD` 指向不存在目录 → 占位先现 → host 启动失败（dead-cwd exit(1) 语义）→ 占位移除 + 「Session failed to start — …」错误 toast + 组消失（无幽灵）。索引轮询机制零改动。
  - **visual harness**（`src/main/visual-pending.ts` 新增，`npm run visual:pending`）：真实空态发送路径驱动，p1（既有组 + 占位卡在顶、starting… 槽、空点槽）与 p2（对账后真卡选中、标记标题、just now、零占位行）双帧逐项断言 + 截图；base harness 对 `PICODE_VISUAL_PENDING` 让位（跑位契约与各 harness 一致——首跑双 harness 共窗互踩已修复并恢复被重写的存档帧）。
  - **code-review 双轴**（review-standards + review-spec 并行）：Standards 零硬违反（additive-only 契约/全英文文案/glossary 词汇/Seam-1 纯度逐条核对过）；两条弱坏味道中「三派发点重复配对」已采纳收敛（sendCreateSession 单入口）；「pendingIds.has 重复判定」不采纳（与既有 `inAppIds.has` 等 prop 模式同构，一致性优先）。Spec 两条边界发现：resume 宣告误消费已修（`resumed` 守卫 + 表测试锁定）；provisional 失败关联边界如实文档化（见上，不改行为——唯一无幽灵保证的取舍）。
  - **vitest 1890/1890 + typecheck 双 tsconfig 清**；`npm run smoke:electron` 全套 **ALL GREEN（exit 0，零 FAIL）**——首跑在 wt-107 dev app 并发（load 5.98–9.20）下于 ticket-91 既有真实输入 stage flake 一次（与本票零代码交集，票 95 同款负载 flake），wt-107 退位后复跑全绿；`ps` 自查后开跑（dev-app serialization）。
  - 全英文文案（starting… / Session failed to start — …）；CONTEXT.md 新增**占位会话卡（Pending Card）**词条（诚实三律 + Avoid 三条）。
  - **操作者：`bash scripts/merge-ticket.sh 106`。**
