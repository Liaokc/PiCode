# 101: 子代理停止 + 面板运行徽标——确认框停止与一眼可见

**What to build:** 子智能体供面收官票：①**停止钮** = 目录行/对话 tab 的运行行方形停止钮 → **确认框**（操作者拍板需确认——与 ZCode 卡上直终不同）→ RPC stop（顶层 async run；前台子代理 = abort/dispose 语义）；停止后状态流转如实（stopping/stopped）；②**侧板开合钮运行计数徽标**——面板收起时运行中的子代理数量以小徽标显于开合钮（待审批角标先例），点击开侧板直达目录 tab。

**背景（取证）：** pi-subagents RPC stop（顶层 async run 走 stop 控制通道、记 stopped 生命周期；前台 = abort+dispose——observability.md）；`subagent:child-status` 事件（stopping/stopped 提示）；ZCode 目录卡终止形态（操作者拍板加确认框）。徽标计数来自票 90 桥接的 running 状态。

**Blocked by:** 99（子代理对话 tab——停止钮落目录行与对话 tab 两处）.

**Status:** ready-for-human

## Acceptance

- [x] electron smoke：运行中子代理点停止 → 确认框 → 取消不停止 / 确认后真停（状态流转 stopping→stopped 上屏）；前台子代理停止 = abort 语义断言
- [x] 面板收起态：运行计数徽标正确出现/消失（零运行无徽标）；点击带徽标的开合钮 → 侧板开 + 目录 tab
- [x] 确认框 Esc/外点 = 取消；停止不可逆语义如实（不提供「撤销停止」）
- [x] vitest / typecheck 全绿；跑 dev app / smoke 前 `ps` 自查（dev-app serialization）
- 2026-09-21 (merge session，per 操作者验收指令「101 工单已验收」)：Status 翻转 ready-for-human + 四验收框按提交证据链勾选（feat `31a813b` commit message = 实现与验证记录：确认浮层 → 真 RPC stop → Stopping 诚实覆盖 → Cancelled 落地、前台子代理 = 父回合 abort、**Round K 契约报备**、smoke ×10 腿、vitest+typecheck+full smoke ALL GREEN；refactor `117f763` = 评审采纳（rpcFailureReceipt 单腿 / StopFlow 持确认态 / Stopping 词汇 glossary 注记）+ electron 复跑 exit 0 + vitest 1856）。合并会话仅簿记未重跑——合并后 main 上 typecheck + vitest 复验闭环。
