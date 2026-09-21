# 104: 运行中重命名会话——移除 settled 守卫（TUI parity）

**What to build:** agent 运行中重命名会话**直接成功**（TUI `/name` 运行中可用的 parity）——不再报 `session_command_error` toast；改名成功后 `session_renamed` + 侧栏索引刷新照旧。

**背景（取证）：** `host/index.ts` handleRename 开头 `requireSettledSession()` 守卫——运行中被拒发错误 toast（操作者截图 pi17 图1 = 右下角 toast 现场）；TUI 的 `/name` 在 agent 运行时可用 = SDK `setSessionName` 支持运行中改名。移除守卫即修复；改名其余链路（session_renamed 事件/索引刷新/⌘R 语义）零改动。

**Blocked by:** 100（queue 修缮——同 host/index.ts 文件，弱邻接转显式串行）.

**Status:** ready-for-human

## Acceptance

- [x] electron smoke：agentRunning 中重命名 → 成功（无错误 toast），侧栏标题即时更新；落定态重命名不回归
- [x] host-contract smoke：set_session_label 运行中路径通过
- [x] vitest / typecheck 全绿；跑 dev app / smoke 前 `ps` 自查（dev-app serialization）

## Comments

- 2026-09-21 (implement session，分支 t104-rename-midrun @ main 996df45 rebase 后含 100 基座，working tree)：一行为主 + 两处 smoke 取证，验收链全绿。
  - **Host 修复（`src/host/index.ts` handleRename）**：`requireSettledSession()` 守卫移除——运行中 `set_session_label` 不再被拒（不再发 `session_command_error` toast）。只保留 no-session 错误路径（`No session is open.`）；成功链路零改动：`setSessionName` → `session_renamed`（回带最终名）→ `sendTree()`（索引刷新）。TUI `/name` parity 达成。
  - **host-contract smoke（Round A streaming 轮，ticket 104报备）**：第 3 个 text_delta 时运行中发 `set_session_label`（SMOKE_RUN_LABEL_104）→ 新 step 'A rename midrun' 断言回包必须是 `session_renamed` 且携带该名（`session_command_error` 直接 fail）→ 然后 abort 照旧；Round B 落定态改名到 SMOKE_LABEL 不变（最终文件 summary 断言不受影响）。
  - **electron smoke（rename_midrun 段，紧随 queue_repair）**：warm 短轮（文件落盘）→ 侧栏行 reveal → 长计数轮运行中经 chat topbar Rename 钮（`.chat-title-input` + Enter）改名 → 四路断言：①host ack `session_renamed` 且名正确（`rename104_midrun_ack_ok`）；②topbar 标题 + 侧栏行标题即时更新且零 `.toast-error`（`rename104_midrun_ui_ok`）；③改名后运行继续出 text_delta（`rename104_midrun_run_alive_ok`）；④Stop 落定后同路径再改名不回归（`rename104_settled_ok`）。**smoke:electron exit 0 全绿（34 hosts 零孤儿）**。
  - **调试取证（两处环境事实留档）**：①**SDK 会话文件创建时机**——`SessionManager._persist` 只在**第一条 assistant 消息**落盘时才创建文件（session 头 + user 消息先内存缓冲，流式 delta 不写盘）：从未落定的全新会话对索引不可见、侧栏无行——row 探针必须放在 warm 轮之后（ticket-20 段的 ms1 有 warm turn 同理）；②本段是 quit 前最后一段，早段会把侧栏留在关闭态/分组折叠/sort=manual 分页截断——行 reveal 用既有先例：⌘B 按到出现 + `data-cwd` 定位组 + 组头展开/Show more 循环；失败路径留了 `sessions.list()` + 磁盘 readdir 对账诊断（`mine/byId/disk` 三层），本轮定位 SDK 落盘时机全靠它。
  - **验证闭环**：vitest 1836/1836 全绿；typecheck 双 tsconfig 清；**host-contract smoke**：ticket-104 运行中改名腿 5/5 次通过（含与基座对照），但当日 suite 级被 provider（bella/GLM-5.3-flash）流中断卡顿阻断——90s 事件窗超时散布在不同步骤（A queue settle ×3 / A tools 2 / A queue d delivered），**基座 885ab83 对照跑同型失败**（'A queue d delivered'）证实与改动无关；provider 恢复后补跑 smoke:host 全绿（见下条）。electron 全套跑前 `ps` 自查无其他 PiCode dev-app/smoke 进程（与 wt-101 的通道交接前后错开）。
- 2026-09-21 (code-review + review 采纳，rebase main 41836f9 后)：双轴审查（review-standards / review-spec 子代理）通过——**零硬违反**（IPC 契约 additive-only ✓、词汇表 ✓、无 ZCode 资产 ✓、`requireSettledSession` 其余两调用点无误伤 ✓）。采纳三处：①**Spec 轴实质缺口**——electron 腿“无错误 toast”断言原来只认 'Cannot restructure' 文案，若 setSessionName 抛异常走 catch 的其他错误消息会漏放；改**相对计数**（相对段首基线，任意新增 `.toast-error` 即 fail，消息无关），基线空转检查随之撤销。②Standards 轴 Duplicated Code——host 内联 no-session 守卫与 `requireSettledSession` 前半同形，抽 `requireOpenSession()`（发错返 null，requireSettled/handleRename 复用；类型谓词对模块级变量不可用，改返 `AgentSession | null`）。③命名修正 `noErrorToast104` → `noNewErrorToast104`/`errorToastCount104`。未采纳（有据）：smoke 段 settled/midrun 两腿不参数化——线性叙事可读性优先（smoke 全文件线性结构的仓库先例，reviewer 自注部分豁免）；取证基建超出 spec 文字范围——issue Comments 已报备，三 seam 取证是仓库强制标准。**采纳后全量重验**：typecheck 双清；vitest 1836/1836；smoke:host exit 0（SMOKE PASS，ticket-104 腿在完整绿套件内）；smoke:electron exit 0（四路断言 + 34 hosts 零孤儿）。dev-app serialization：electron 前后 `ps` 自查，等 wt-101 通道释放后才跑。
